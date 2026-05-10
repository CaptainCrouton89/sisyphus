#cloud-config
# Provisioned by `sis deploy` — turns a clean Ubuntu 24.04 box into
# a Tailscale-only sisyphus host. See specs/deploy.md.

hostname: ${hostname}
fqdn: ${hostname}
preserve_hostname: false

users:
  - name: sisyphus
    groups: [sudo]
    shell: /bin/bash
    sudo: 'ALL=(ALL) NOPASSWD:ALL'
    ssh_authorized_keys:
      - ${ssh_pubkey}
  - name: root
    ssh_authorized_keys:
      - ${ssh_pubkey}

write_files:
  - path: /etc/systemd/user/sisyphusd.service
    permissions: '0644'
    content: |
      ${indent(6, sisyphusd_unit)}

  - path: /etc/sisyphus/tmux-osc52.conf
    permissions: '0644'
    content: |
      ${indent(6, tmux_osc52_conf)}

  - path: /usr/local/bin/pbcopy
    permissions: '0755'
    content: |
      ${indent(6, pbcopy_shim)}

  - path: /usr/local/bin/pbpaste
    permissions: '0755'
    content: |
      ${indent(6, pbpaste_shim)}

  - path: /etc/systemd/system/sisyphusd-update.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Sisyphus auto-update
      After=network-online.target
      Wants=network-online.target

      [Service]
      Type=oneshot
      ExecStart=/bin/sh -c 'npm i -g sisyphi@latest && sudo -u sisyphus XDG_RUNTIME_DIR=/run/user/$(id -u sisyphus) systemctl --user restart sisyphusd'

  - path: /etc/systemd/system/sisyphusd-update.timer
    permissions: '0644'
    content: |
      [Unit]
      Description=Sisyphus auto-update daily

      [Timer]
      OnCalendar=daily
      Persistent=true
      RandomizedDelaySec=30min

      [Install]
      WantedBy=timers.target

runcmd:
  # 1. Base packages.
  - apt-get update
  - DEBIAN_FRONTEND=noninteractive apt-get install -y curl git tmux fzf neovim build-essential ufw mosh ca-certificates gnupg

  # 2. Node 22 via NodeSource. /usr/bin/node, /usr/bin/npm.
  - curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  - DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs

  # 3. Tailscale. We deliberately do NOT pass --ssh: Tailscale SSH would
  # intercept port 22 on the tailscale0 interface and require a browser-
  # based check (per the user's tailnet ACL), blocking key-based access.
  # System OpenSSH on tailscale0 with the user's pubkey is simpler.
  - curl -fsSL https://tailscale.com/install.sh | sh
  - tailscale up --authkey='${ts_authkey}' --hostname='${hostname}'

  # 4. Firewall. Public 22 stays denied; tailscale0 fully open.
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow in on tailscale0
  - ufw --force enable

  # 5. Sisyphus user — linger so user systemd survives logout.
  - loginctl enable-linger sisyphus
  - install -d -o sisyphus -g sisyphus -m 0755 /home/sisyphus/.config/systemd/user
  - install -d -o sisyphus -g sisyphus -m 0755 /home/sisyphus/.sisyphus
  - cp /etc/systemd/user/sisyphusd.service /home/sisyphus/.config/systemd/user/sisyphusd.service
  - chown -R sisyphus:sisyphus /home/sisyphus/.config

  # 6. Sisyphus install (root → /usr/bin/sisyphusd symlink).
  - npm i -g sisyphi@${sisyphus_version}

  # 6b. Claude Code CLI (sisyphus drives it for agent sessions).
  - npm i -g @anthropic-ai/claude-code

  # 7. Daemon as systemd user service.
  - sudo -u sisyphus XDG_RUNTIME_DIR=/run/user/$(id -u sisyphus) systemctl --user daemon-reload
  - sudo -u sisyphus XDG_RUNTIME_DIR=/run/user/$(id -u sisyphus) systemctl --user enable --now sisyphusd

  # 8. Auto-update timer (system-level so npm i -g has root; restarts user daemon).
%{ if enable_auto_update ~}
  - systemctl daemon-reload
  - systemctl enable --now sisyphusd-update.timer
%{ endif ~}

  # 9. Tmux config (OSC 52 + pbcopy/pbpaste shims already written above).
  - sudo -u sisyphus bash -c 'printf "source-file /etc/sisyphus/tmux-osc52.conf\n" > /home/sisyphus/.tmux.conf'
  - chown sisyphus:sisyphus /home/sisyphus/.tmux.conf

  # 10. Keybinds. Runs after pbcopy/pbpaste are on PATH so popup scripts resolve them.
  - sudo -u sisyphus -i sisyphus admin setup-keybind || true

  # 11. Chromium for Playwright/capture (gated).
%{ if with_chromium ~}
  - DEBIAN_FRONTEND=noninteractive apt-get install -y chromium-browser libxss1 libnss3 libgbm1 libxkbcommon0 libasound2t64 || DEBIAN_FRONTEND=noninteractive apt-get install -y chromium libxss1 libnss3 libgbm1 libxkbcommon0 libasound2
%{ endif ~}

  # Done — marker for `sisyphus deploy <provider> up` polling loop.
  - echo "sisyphus cloud-init done" >> /var/log/cloud-init-output.log
