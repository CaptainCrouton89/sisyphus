# `sis deploy` — Spec

A CLI-wrapped Terraform deployment flow that provisions a Linux box pre-configured to run sisyphus, reachable only via the user's Tailscale tailnet. Two providers ship day one: Hetzner Cloud (cost-leader) and AWS EC2 (familiar / fleet-friendly). Users SSH in (or `mosh`) and attach to tmux for the same workflow they have locally.

## Goals

- One verb (`sis deploy`) provisions a sisyphus-ready box from a clean cloud account, no Terraform knowledge required.
- Linux deployment is supported via the path `client.ts:39–67` already documents — cloud-init writes the systemd unit; we don't need to land Linux support inside `install.ts` first.
- Box is reachable only over Tailscale; no public SSH port.
- The user's tmux keybinds (`M-s`, `M-S`, `C-s` which-key, `prefix-x`) work on the remote box. Clipboard popups (`pbcopy`/`pbpaste`) round-trip to the user's local machine via OSC 52.
- Provider abstraction is real: shared cloud-init, per-provider Terraform; adding GCP/DO later is just another module.

## Non-goals

- Multi-tenant SaaS. Each user runs `sis deploy` against their own cloud account (BYO-cloud, option 2 from architecture discussion).
- Fleet management. One box per provider per user. Multi-box / capability-tagged dispatch is out of scope.
- Backwards compat with non-darwin auto-install in `install.ts`. That's a separate refactor; if/when it lands, cloud-init can collapse to a single `sis admin setup` call.
- Native macOS notification parity. Linux loses `SisyphusNotify.app`; tmux activity flags are the substitute.
- Persistent backups of `~/.sisyphus`. Sessions are ephemeral on the box; user rsyncs out if they care.

## CLI Surface

### `sis deploy <provider> <action>`

Providers: `hetzner`, `aws`. Actions:

| Action | Behavior |
|---|---|
| `up` | Provision box. Runs `terraform init` (idempotent) → `plan` → `apply`. Prints SSH command + Tailscale hostname on success. |
| `down` | `terraform destroy`. Confirms before tearing down. |
| `status` | Prints current outputs (IP, Tailscale hostname, instance type, est. monthly cost). No-op if not provisioned. |
| `ssh` | Resolves Tailscale hostname from state, execs `mosh` (falls back to `ssh`) into the box. |
| `update` | SSHes via Tailscale, runs `npm i -g sisyphi@latest && systemctl --user restart sisyphusd`. |
| `logs` | Tails `/var/log/cloud-init-output.log` and `~/.sisyphus/daemon.log` over SSH. |

### `sis deploy --providers`

Lists available providers + status (provisioned/not).

### Flags (all `up` actions)

| Flag | Default | Description |
|---|---|---|
| `--region` | `nbg1` (Hetzner) / `us-east-1` (AWS) | Provider-specific region/zone. |
| `--arch` | `arm` | `arm` or `x86`. Picks the default `--size` family and the matching Ubuntu 24.04 image. Ignored if `--size` is set explicitly. |
| `--size` | `cax11` (Hetzner) / `t4g.medium` (AWS) | Instance type. Defaults shown are for `--arch arm`; `--arch x86` switches the defaults to `cx22` / `t3.medium`. |
| `--ssh-key` | `~/.ssh/id_ed25519.pub` | Pubkey to authorize. |
| `--no-chromium` | (off) | Skip headless Chromium install. Default is to install it (~150MB) so `capture` / Playwright agents work without surprise. |
| `--no-auto-update` | (off) | Skip the daily systemd timer that runs `npm i -g sisyphi@latest && systemctl --user restart sisyphusd`. Default is on; pass to pin the box to whatever shipped at provision time. |
| `--name` | `sisyphus` | Box hostname; also Tailscale node name. |

## Architecture

### Repo layout

```
deploy/
  shared/
    cloud-init.yaml.tpl         # provider-agnostic user-data
    sisyphusd.service.tpl       # systemd unit (lifted from client.ts:46–62)
    tmux-osc52.conf             # OSC 52 + clipboard shim sourced by user's tmux.conf
    bin/
      pbcopy-shim               # exec tmux load-buffer -w -
      pbpaste-shim              # exec tmux save-buffer -
  hetzner/
    main.tf
    variables.tf
    outputs.tf
    versions.tf
  aws/
    main.tf
    variables.tf
    outputs.tf
    versions.tf
src/cli/commands/
  deploy.ts                     # CLI surface; delegates to deploy/runner.ts
src/cli/deploy/
  runner.ts                     # terraform invocation, state mgmt, output parsing
  tailscale.ts                  # mint ephemeral auth keys via Tailscale OAuth client
  creds.ts                      # load/save provider creds in ~/.sisyphus/deploy/
```

The `deploy/` subtree is added to `package.json` `files` so it ships in the npm package.

### Terraform invocation

The CLI shells out to `terraform`. If not installed, error with platform install hint (`brew install terraform`, `apt install terraform`, etc.). No vendoring.

State files live at `~/.sisyphus/deploy/<provider>/terraform.tfstate` with `0600` perms. Backup to `.tfstate.bak` before any non-readonly action. Local backend only — single user, single machine; remote state is overkill.

### Provider modules — shape

Both modules expose identical inputs (provider-specific names) and identical outputs:

```hcl
# outputs.tf (both providers)
output "ipv4"               { value = ... }
output "tailscale_hostname" { value = "${var.name}.${data.tailscale_tailnet.this.name}.ts.net" }
output "ssh_command"        { value = "ssh sisyphus@${output.tailscale_hostname}" }
output "instance_type"      { value = ... }      # raw type, runner.ts looks up cost
```

`runner.ts` parses `terraform output -json` and presents the outputs uniformly regardless of provider. Estimated monthly cost is computed CLI-side, not in Terraform: `src/cli/deploy/pricing.ts` exports a hardcoded JSON table keyed by `<provider>:<instance_type>` with a `LAST_VERIFIED` constant at the top of the file (e.g. `2026-05-06`). `status` prints the cost plus "(pricing last verified <date>; verify against your bill for current rates)" so users know the figure is informational, not authoritative.

### Cloud-init contract (shared)

The `cloud-init.yaml.tpl` is templated by Terraform with: SSH pubkey, Tailscale auth key, hostname, sisyphus version (`latest` by default), `with_chromium` bool. Steps in order:

1. **Base packages.** `apt update && apt install -y curl git tmux fzf neovim build-essential ufw mosh`. (`mosh` is the default the `ssh` action prefers; Tailscale's default ACL allows UDP 60000–61000 between own-tailnet nodes, so no extra firewall config is needed.)
2. **Node 22.** NodeSource setup script, install `nodejs`. Verify `node --version` ≥ 22.
3. **Tailscale.** Install via `curl -fsSL https://tailscale.com/install.sh | sh`. Join with provided auth key: `tailscale up --authkey=$TS_AUTHKEY --hostname=$NAME`. (We deliberately omit `--ssh`: Tailscale SSH would intercept port 22 on the tailscale0 interface and force a browser-based check per the user's tailnet ACL, blocking key-based access. System OpenSSH on tailscale0 with the user's pubkey via cloud-init `users:` is the canonical path.)
4. **Firewall.** `ufw default deny incoming; ufw allow in on tailscale0; ufw enable`. Public 22 stays closed.
5. **User.** Create `sisyphus` user, add SSH pubkey to `~sisyphus/.ssh/authorized_keys` (also keyed for the Tailscale interface), enable `loginctl enable-linger sisyphus` so user systemd services survive logout.
6. **Sisyphus install.** `sudo -u sisyphus npm i -g sisyphi@$VERSION`. Postinstall `build-notify.sh` no-ops gracefully on Linux.
7. **Daemon as systemd user service.** Write `~sisyphus/.config/systemd/user/sisyphusd.service` from the template (lifted verbatim from `client.ts:46–62`). `systemctl --user enable --now sisyphusd`.
8. **Auto-update timer.** Daily `sisyphusd-update.service` + `.timer`: `npm i -g sisyphi@latest && systemctl --user restart sisyphusd`. Skipped if `--no-auto-update` was passed at provision time.
9. **Tmux config.** Source `tmux-osc52.conf` from `~sisyphus/.tmux.conf`. Install `pbcopy-shim` / `pbpaste-shim` (which `exec tmux load-buffer -w -` and `tmux save-buffer -` respectively) to `/usr/local/bin/{pbcopy,pbpaste}`. Order matters — this runs before step 10 so the keybind popup scripts can resolve `pbcopy`/`pbpaste` from PATH at install time.
10. **Keybinds.** Run `sudo -u sisyphus sis admin setup-keybind`. Verified portable: `setup-keybind.ts` has no platform branches, and the popup scripts that `tmux-setup.ts` writes resolve `pbcopy`/`pbpaste` at runtime via the shims installed in step 9.
11. **Chromium.** Default on. Install via apt with the Playwright dep stack (`chromium`, `libxss1`, `libnss3`, `libgbm1`, `libxkbcommon0`, `libasound2`). Skipped if `--no-chromium` was passed.

Cloud-init logs land at `/var/log/cloud-init-output.log`. `sis deploy <provider> logs` tails this for debugging first-boot failures.

### Tailscale auth flow

Two paths:

**Recommended: OAuth client.** User runs `sis deploy auth tailscale` once; CLI walks them through creating an OAuth client at https://login.tailscale.com/admin/settings/oauth with `auth_keys:write` scope. Client ID + secret stored in `~/.sisyphus/deploy/tailscale.env` (0600). Each `up` mints an ephemeral, single-use, tagged auth key via the API — no human-readable key ever touches Terraform state plaintext. Keys expire after 90 days; tagged for sisyphus boxes so users can revoke fleet-wide if needed.

**Fallback: manual auth key.** User pastes a reusable auth key from the admin UI. Stored same place. Less secure (key sits in env), but zero-config.

### Provider creds

`~/.sisyphus/deploy/<provider>.env` (0600), loaded into Terraform invocation as env vars. First-run flow prompts for missing creds; CLI never prints them back.

| Provider | Required env |
|---|---|
| Hetzner | `HCLOUD_TOKEN` |
| AWS | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` |

### Per-provider specifics

**Hetzner.** Uses `hcloud_server`, `hcloud_ssh_key`, `hcloud_firewall` (deny 22 from 0.0.0.0; the `ufw` inside the box is belt + suspenders). No load balancer, no volume, no floating IP. Default `cax11` (ARM, ~$4/mo); `--arch x86` switches to `cx22` (~$5/mo). Image selection follows `--arch` (Ubuntu 24.04 ARM vs x86).

**AWS.** Uses `aws_instance`, `aws_security_group`, `aws_key_pair`. Security group denies 22 from anywhere (Tailscale traffic flows over the box's tailscale0 interface, not eth0; SG only sees public traffic). Default `t4g.medium` (Graviton, ARM, ~$25/mo); `--arch x86` switches to `t3.medium`. AMI selection is a `data "aws_ami"` lookup for the latest Ubuntu 24.04 LTS image matching the chosen architecture, so the `--arch` flag picks the right AMI without a separate var. All sisyphus runtime deps (Node 22, Claude Code CLI, Playwright, Chromium) have ARM Linux builds; `native/build-notify.sh` is wrapped in `|| true` in `package.json` postinstall so its mac-only path is a no-op on either arch. VPC: default VPC + default subnet to avoid networking ceremony; users with strict accounts override via `--vpc-id`.

## State / file layout (user's machine)

```
~/.sisyphus/deploy/
  hetzner.env                   # provider creds (0600)
  aws.env
  tailscale.env                 # OAuth client or auth key (0600)
  hetzner/
    terraform.tfstate
    terraform.tfstate.bak
    .terraform/                 # init artifacts, providers
  aws/
    terraform.tfstate
    ...
```

## Failure modes / observability

| Failure | Detection | Recovery |
|---|---|---|
| Terraform binary missing | `runner.ts` startup check | Error with install hint |
| Provider creds missing | Pre-apply check | Prompt to set, save to env file |
| Cloud-init failure (e.g., npm install fails mid-boot) | `up` polls `/var/log/cloud-init-output.log` for `cloud-init: done` or error | `sis deploy <provider> logs` shows tail; user can SSH and `cloud-init status --long` |
| Tailscale not connecting | Post-apply health check pings tailnet hostname | Fall back to SSH on public IP only if firewall didn't yet apply (race window) |
| Daemon fails to start under systemd | `up` runs `sis deploy <provider> ssh -- sis admin doctor` after provisioning | Surface doctor output; common cause is Node path / version |

## Implementation phasing

Suggested order, each shippable independently:

1. Cloud-init template + Hetzner module wired manually (no CLI) — prove the box boots sisyphus-ready end to end.
2. `runner.ts` + `sis deploy hetzner up/down/status` — wrap the manual flow.
3. Tailscale OAuth client integration + ephemeral auth keys.
4. AWS module (mostly mechanical once Hetzner is solid; same cloud-init).
5. `update`, `ssh`, `logs` actions.
6. Auto-update timer + cost output.

Phases 1–2 are the MVP; everything after is polish.
