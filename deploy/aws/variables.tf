variable "name" {
  type        = string
  default     = "sisyphus"
  description = "Hostname / Tailscale node name. Also used for tagging."
}

variable "region" {
  type        = string
  default     = "us-east-1"
  description = "AWS region (e.g. us-east-1, eu-west-1)."
}

variable "arch" {
  type        = string
  default     = "arm"
  description = "CPU arch family: 'arm' (default t4g.medium) or 'x86' (default t3.medium). Drives AMI selection."

  validation {
    condition     = contains(["arm", "x86"], var.arch)
    error_message = "arch must be 'arm' or 'x86'."
  }
}

variable "size" {
  type        = string
  default     = ""
  description = "EC2 instance type. If empty, picks t4g.medium for arm / t3.medium for x86."
}

variable "ssh_pubkey" {
  type        = string
  description = "SSH public key to authorize."
}

variable "ts_authkey" {
  type        = string
  sensitive   = true
  description = "Tailscale auth key (ephemeral, single-use, tagged) — minted by sis deploy runner."
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
  description = "Enable daily auto-update systemd timer."
}

variable "vpc_id" {
  type        = string
  default     = ""
  description = "VPC ID. Empty → use the account's default VPC."
}

variable "subnet_id" {
  type        = string
  default     = ""
  description = "Subnet ID. Empty → pick the first default subnet in the VPC."
}
