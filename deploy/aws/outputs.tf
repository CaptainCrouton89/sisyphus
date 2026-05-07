output "ipv4" {
  value       = aws_instance.this.public_ip
  description = "Public IPv4 (firewalled — only Tailscale UDP + ICMP reach the box)."
}

output "tailscale_hostname" {
  value       = var.name
  description = "Tailscale node name. The full MagicDNS hostname is <name>.<your-tailnet>.ts.net once the node joins."
}

output "ssh_command" {
  value       = "ssh sisyphus@${var.name}"
  description = "SSH command via Tailscale MagicDNS (works once the node has joined the tailnet)."
}

output "instance_type" {
  value = aws_instance.this.instance_type
}
