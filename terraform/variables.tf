variable "aws_region" {
  description = "AWS region for everything."
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Prefix for resource names and tags."
  type        = string
  default     = "stocksense"
}

variable "environment" {
  description = "Environment name (dev / prod)."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "az_count" {
  description = "How many availability zones to spread subnets over (EKS needs at least 2)."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2 && var.az_count <= 3
    error_message = "az_count must be 2 or 3."
  }
}

variable "kubernetes_version" {
  description = "EKS control plane version."
  type        = string
  default     = "1.33"
}

variable "node_instance_types" {
  description = "Instance types for the managed node group."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_min_size" {
  type    = number
  default = 1
}

variable "node_desired_size" {
  type    = number
  default = 2
}

variable "node_max_size" {
  type    = number
  default = 3
}

variable "single_nat_gateway" {
  description = "One shared NAT gateway instead of one per AZ (much cheaper, less HA)."
  type        = bool
  default     = true
}

variable "cluster_admin_cidrs" {
  description = "CIDRs allowed to reach the public EKS API endpoint, e.g. [\"YOUR_IP/32\"]. No default on purpose."
  type        = list(string)

  validation {
    condition     = length(var.cluster_admin_cidrs) > 0 && !contains(var.cluster_admin_cidrs, "0.0.0.0/0")
    error_message = "Give your own IP range(s); 0.0.0.0/0 would expose the Kubernetes API to the whole internet."
  }
}
