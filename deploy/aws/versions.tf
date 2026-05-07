terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }
}

provider "aws" {
  region = var.region
  # AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars are loaded by the
  # sisyphus deploy runner from ~/.sisyphus/deploy/aws.env.
}
