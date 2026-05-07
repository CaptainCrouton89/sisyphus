locals {
  default_sizes = {
    arm = "cax11"
    x86 = "cx22"
  }
  resolved_size = var.size != "" ? var.size : local.default_sizes[var.arch]

  # Hetzner image names: ubuntu-24.04 covers both arch families; the API
  # picks the matching arch based on the server type.
  image = "ubuntu-24.04"

  user_data = templatefile("${path.module}/../shared/cloud-init.yaml.tpl", {
    ssh_pubkey         = var.ssh_pubkey
    ts_authkey         = var.ts_authkey
    hostname           = var.name
    sisyphus_version   = var.sisyphus_version
    with_chromium      = var.with_chromium
    enable_auto_update = var.enable_auto_update
    sisyphusd_unit     = file("${path.module}/../shared/sisyphusd.service.tpl")
    tmux_osc52_conf    = file("${path.module}/../shared/tmux-osc52.conf")
    pbcopy_shim        = file("${path.module}/../shared/bin/pbcopy-shim")
    pbpaste_shim       = file("${path.module}/../shared/bin/pbpaste-shim")
  })
}

resource "hcloud_ssh_key" "this" {
  name       = var.name
  public_key = var.ssh_pubkey
}

resource "hcloud_firewall" "this" {
  name = "${var.name}-public"

  # Tailscale runs over WireGuard (UDP 41641) — must reach the public
  # internet to hand off to peers. Once tailnet is up, all sisyphus
  # traffic flows over tailscale0; the box is otherwise unreachable.
  rule {
    direction  = "in"
    protocol   = "udp"
    port       = "41641"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # ICMP for ping debugging (optional; keep it open).
  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "this" {
  name         = var.name
  server_type  = local.resolved_size
  image        = local.image
  location     = var.region
  ssh_keys     = [hcloud_ssh_key.this.id]
  firewall_ids = [hcloud_firewall.this.id]
  user_data    = local.user_data

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  labels = {
    managed-by = "sisyphus-deploy"
  }
}
