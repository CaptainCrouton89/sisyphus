locals {
  default_sizes = {
    arm = "t4g.medium"
    x86 = "t3.medium"
  }
  resolved_size = var.size != "" ? var.size : local.default_sizes[var.arch]

  ami_arch = var.arch == "arm" ? "arm64" : "amd64"

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

# Canonical Ubuntu 24.04 LTS AMI matching the requested arch.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-${local.ami_arch}-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Default VPC + subnet when not overridden.
data "aws_vpc" "selected" {
  count   = var.vpc_id == "" ? 1 : 0
  default = true
}

data "aws_subnets" "selected" {
  count = var.vpc_id == "" && var.subnet_id == "" ? 1 : 0
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.selected[0].id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

locals {
  effective_vpc_id    = var.vpc_id == "" ? data.aws_vpc.selected[0].id : var.vpc_id
  effective_subnet_id = var.subnet_id != "" ? var.subnet_id : data.aws_subnets.selected[0].ids[0]
}

resource "aws_key_pair" "this" {
  key_name   = "${var.name}-deploy"
  public_key = var.ssh_pubkey
}

resource "aws_security_group" "this" {
  name        = "${var.name}-sisyphus"
  description = "sisyphus deploy: deny public 22, allow Tailscale UDP 41641 + ICMP"
  vpc_id      = local.effective_vpc_id

  # Tailscale WireGuard endpoint discovery. SG only sees public traffic
  # on eth0; tailscale0 traffic is userspace and bypasses the SG.
  ingress {
    from_port   = 41641
    to_port     = 41641
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Tailscale WireGuard"
  }

  ingress {
    from_port   = -1
    to_port     = -1
    protocol    = "icmp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "ICMP for ping debugging"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    "managed-by" = "sisyphus-deploy"
  }
}

resource "aws_instance" "this" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = local.resolved_size
  subnet_id                   = local.effective_subnet_id
  vpc_security_group_ids      = [aws_security_group.this.id]
  key_name                    = aws_key_pair.this.key_name
  associate_public_ip_address = true
  user_data                   = local.user_data

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  tags = {
    Name         = var.name
    "managed-by" = "sisyphus-deploy"
  }
}
