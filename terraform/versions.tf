terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Remote state (recommended once the bucket exists). Kept commented so
  # `terraform init` works on a fresh clone without AWS access.
  # backend "s3" {
  #   bucket       = "ridaa-tfstate-bucket"
  #   key          = "final-project/stocksense/terraform.tfstate"
  #   region       = "ap-south-1"
  #   use_lockfile = true
  #   encrypt      = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      Owner       = "Ridaa Mirza (24BCS10394)"
      ManagedBy   = "terraform"
    }
  }
}
