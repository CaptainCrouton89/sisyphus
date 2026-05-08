terraform {
  required_version = ">= 1.5"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.48"
    }
  }
}

provider "hcloud" {
  # HCLOUD_TOKEN env var is loaded by sis deploy runner from
  # ~/.sisyphus/deploy/hetzner.env before invoking terraform.
}
