variable "name" {
  type        = string
  default     = "sisyphus"
  description = "Hostname / Tailscale node name."
}

variable "region" {
  type        = string
  default     = "nbg1"
  description = "Hetzner location (nbg1, fsn1, hel1, ash, hil)."
}

variable "arch" {
  type        = string
  default     = "arm"
  description = "CPU arch family: 'arm' (default cax11) or 'x86' (default cx22). Ignored if size is set explicitly."

  validation {
    condition     = contains(["arm", "x86"], var.arch)
    error_message = "arch must be 'arm' or 'x86'."
  }
}

variable "size" {
  type        = string
  default     = ""
  description = "Hetzner server type. If empty, picks cax11 for arm / cx22 for x86."
}

variable "ssh_pubkey" {
  type        = string
  description = "SSH public key to authorize for root and sisyphus users."
}

variable "ts_authkey" {
  type        = string
  sensitive   = true
  description = "Tailscale auth key (ephemeral, single-use, tagged) — minted by sisyphus deploy runner."
}

variable "sisyphus_version" {
  type        = string
  default     = "latest"
  description = "npm dist-tag or version of sisyphi to install."
}

variable "with_chromium" {
  type        = bool
  default     = true
  description = "Install headless Chromium + Playwright deps."
}

variable "enable_auto_update" {
  type        = bool
  default     = true
  description = "Enable daily systemd timer that runs `npm i -g sisyphi@latest` and restarts the daemon."
}
