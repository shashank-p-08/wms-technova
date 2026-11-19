variable "project" {
  description = "Lower-case project slug used in names and the Project tag."
  type        = string
  default     = "technova-wms"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.project))
    error_message = "project must be 3-21 lower-case letters, digits or hyphens."
  }
}

variable "environment" {
  description = "Deployment environment. In production each lives in its own AWS account."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging or prod."
  }
}

variable "region" {
  description = "AWS region. Only the primary (us-east-1) and DR (us-west-2) regions are approved."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = contains(["us-east-1", "us-west-2"], var.region)
    error_message = "TechNova WMS may only be deployed to us-east-1 (primary) or us-west-2 (DR)."
  }
}

variable "owner" {
  description = "Team accountable for these resources (Owner tag)."
  type        = string
  default     = "platform-team"
}

variable "cost_center" {
  description = "Finance cost centre for chargeback (CostCenter tag)."
  type        = string
  default     = "CC-1001"
}

variable "budget_alert_email" {
  description = "Optional email that receives budget alerts. Empty = no notifications."
  type        = string
  default     = ""
}

variable "db_instance_class" {
  description = "RDS instance size. db.t4g.micro is Free-Tier eligible."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_engine_version" {
  description = "PostgreSQL major version (RDS picks the latest minor)."
  type        = string
  default     = "17"
}

variable "local_endpoint" {
  description = "Set to http://localhost:4566 to target the Floci emulator. Empty = real AWS."
  type        = string
  default     = ""
}
