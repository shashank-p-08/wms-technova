# TechNova Cloud WMS - environment foundation (Terraform equivalent of
# infrastructure/cloudformation/starter.yaml). Use ONE of the two tools per
# environment, not both, or they will fight over the same resource names.

terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

locals {
  name_prefix     = "${var.project}-${var.environment}"
  is_prod         = var.environment == "prod"
  is_local        = var.local_endpoint != ""
  primary_region  = "us-east-1"
  is_primary      = var.region == local.primary_region
  monthly_budget  = { dev = 50, staging = 100, prod = 500 }
  noncurrent_days = { dev = 7, staging = 30, prod = 90 }

  network = {
    dev     = { vpc = "10.20.0.0/16", a = "10.20.1.0/24", b = "10.20.2.0/24" }
    staging = { vpc = "10.30.0.0/16", a = "10.30.1.0/24", b = "10.30.2.0/24" }
    prod    = { vpc = "10.40.0.0/16", a = "10.40.1.0/24", b = "10.40.2.0/24" }
  }
  db = {
    dev     = { storage = 20, backup_days = 1, multi_az = false }
    staging = { storage = 20, backup_days = 7, multi_az = false }
    prod    = { storage = 50, backup_days = 14, multi_az = true }
  }

  # Mandatory tagging standard - applied to every taggable resource via default_tags
  tags = {
    Project     = var.project
    Environment = var.environment
    Owner       = var.owner
    CostCenter  = var.cost_center
    ManagedBy   = "terraform"
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.tags
  }

  # Floci / local emulator support
  access_key                  = local.is_local ? "test" : null
  secret_key                  = local.is_local ? "test" : null
  skip_credentials_validation = local.is_local
  skip_requesting_account_id  = local.is_local
  skip_metadata_api_check     = local.is_local
  s3_use_path_style           = local.is_local

  dynamic "endpoints" {
    for_each = local.is_local ? [1] : []
    content {
      s3             = var.local_endpoint
      iam            = var.local_endpoint
      sts            = var.local_endpoint
      budgets        = var.local_endpoint
      resourcegroups = var.local_endpoint
      ec2            = var.local_endpoint
      rds            = var.local_endpoint
      secretsmanager = var.local_endpoint
    }
  }
}

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "assets" {
  bucket = "${local.name_prefix}-assets-${data.aws_caller_identity.current.account_id}-${var.region}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    id     = "ExpireOldVersions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = local.noncurrent_days[var.environment]
    }
  }
  depends_on = [aws_s3_bucket_versioning.assets]
}

data "aws_iam_policy_document" "assets_tls_only" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.assets.arn, "${aws_s3_bucket.assets.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "assets" {
  bucket     = aws_s3_bucket.assets.id
  policy     = data.aws_iam_policy_document.assets_tls_only.json
  depends_on = [aws_s3_bucket_public_access_block.assets]
}

# ---------------------------------------------------------------------------
# Network - private VPC across two AZs, no internet gateway
# ---------------------------------------------------------------------------
data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = local.network[var.environment].vpc
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = "${local.name_prefix}-vpc" }
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.network[var.environment].a
  availability_zone = data.aws_availability_zones.available.names[0]
  tags              = { Name = "${local.name_prefix}-private-a" }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = local.network[var.environment].b
  availability_zone = data.aws_availability_zones.available.names[1]
  tags              = { Name = "${local.name_prefix}-private-b" }
}

resource "aws_security_group" "app" {
  name        = "${local.name_prefix}-app-sg"
  description = "CloudWMS API compute - attach to the ECS service or EC2 instance"
  vpc_id      = aws_vpc.main.id
}

resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db-sg"
  description = "CloudWMS PostgreSQL - accepts connections only from the API security group"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL from CloudWMS API"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}

# ---------------------------------------------------------------------------
# Database - RDS PostgreSQL (primary region only), credentials in Secrets Manager
# ---------------------------------------------------------------------------
resource "aws_db_subnet_group" "main" {
  count      = local.is_primary ? 1 : 0
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

resource "random_password" "db" {
  count            = local.is_primary ? 1 : 0
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_db_instance" "main" {
  count                      = local.is_primary ? 1 : 0
  identifier                 = "${local.name_prefix}-db"
  engine                     = "postgres"
  engine_version             = var.db_engine_version
  instance_class             = var.db_instance_class
  db_name                    = "technova_wms"
  username                   = "wmsadmin"
  password                   = random_password.db[0].result
  allocated_storage          = local.db[var.environment].storage
  storage_type               = "gp3"
  storage_encrypted          = true
  multi_az                   = local.db[var.environment].multi_az
  publicly_accessible        = false
  db_subnet_group_name       = aws_db_subnet_group.main[0].name
  vpc_security_group_ids     = [aws_security_group.db.id]
  backup_retention_period    = local.db[var.environment].backup_days
  deletion_protection        = local.is_prod
  copy_tags_to_snapshot      = true
  auto_minor_version_upgrade = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.name_prefix}-db-final"
}

resource "aws_secretsmanager_secret" "db" {
  count       = local.is_primary ? 1 : 0
  name        = "${var.project}/${var.environment}/db-master"
  description = "CloudWMS PostgreSQL credentials (username, password, host, port, dbname)."
}

resource "aws_secretsmanager_secret_version" "db" {
  count     = local.is_primary ? 1 : 0
  secret_id = aws_secretsmanager_secret.db[0].id
  secret_string = jsonencode({
    username             = aws_db_instance.main[0].username
    password             = random_password.db[0].result
    engine               = "postgres"
    host                 = aws_db_instance.main[0].address
    port                 = aws_db_instance.main[0].port
    dbname               = aws_db_instance.main[0].db_name
    dbInstanceIdentifier = aws_db_instance.main[0].identifier
  })
}

# ---------------------------------------------------------------------------
# IAM - application runtime identity. IAM is GLOBAL, so names carry the region
# to let the primary and DR stacks coexist in one account.
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "app_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com", "ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "app" {
  name               = "${local.name_prefix}-app-role-${var.region}"
  description        = "Runtime identity for the CloudWMS NestJS API (ECS task or EC2 instance)."
  assume_role_policy = data.aws_iam_policy_document.app_trust.json
}

data "aws_iam_policy_document" "app" {
  statement {
    sid       = "ListAssetsBucket"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.assets.arn]
  }
  statement {
    sid       = "ReadWriteAssetObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]
  }
  dynamic "statement" {
    for_each = local.is_primary ? [1] : []
    content {
      sid       = "ReadDatabaseCredentials"
      actions   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      resources = [aws_secretsmanager_secret.db[0].arn]
    }
  }
}

resource "aws_iam_policy" "app" {
  name        = "${local.name_prefix}-app-policy-${var.region}"
  description = "Object read/write on this environment's assets bucket only."
  policy      = data.aws_iam_policy_document.app.json
}

resource "aws_iam_role_policy_attachment" "app" {
  role       = aws_iam_role.app.name
  policy_arn = aws_iam_policy.app.arn
}

resource "aws_iam_instance_profile" "app" {
  name = "${local.name_prefix}-app-profile-${var.region}"
  role = aws_iam_role.app.name
}

# ---------------------------------------------------------------------------
# IAM - human access through groups (account-wide: primary region only)
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "developers" {
  statement {
    sid = "DiscoverProjectResources"
    actions = [
      "s3:ListAllMyBuckets",
      "resource-groups:Get*",
      "resource-groups:List*",
      "resource-groups:SearchResources",
      "tag:GetResources",
      "cloudformation:Describe*",
      "cloudformation:List*",
      "budgets:ViewBudget",
    ]
    resources = ["*"]
  }
  statement {
    sid       = "ListAssetsBucket"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.assets.arn]
  }
  statement {
    sid       = "ReadAssetObjects"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/*"]
  }
  # Developers may write data in dev/staging; prod is read-only for humans.
  dynamic "statement" {
    for_each = local.is_prod ? [] : [1]
    content {
      sid       = "WriteAssetObjectsNonProd"
      actions   = ["s3:PutObject", "s3:DeleteObject"]
      resources = ["${aws_s3_bucket.assets.arn}/*"]
    }
  }
  statement {
    sid       = "NeverDeleteBucket"
    effect    = "Deny"
    actions   = ["s3:DeleteBucket", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy"]
    resources = [aws_s3_bucket.assets.arn]
  }
  statement {
    sid    = "DenyEverythingWithoutMFA"
    effect = "Deny"
    not_actions = [
      "iam:ChangePassword",
      "iam:GetUser",
      "iam:ListMFADevices",
      "iam:ListVirtualMFADevices",
      "iam:CreateVirtualMFADevice",
      "iam:EnableMFADevice",
      "iam:ResyncMFADevice",
      "sts:GetSessionToken",
    ]
    resources = ["*"]
    condition {
      test     = "BoolIfExists"
      variable = "aws:MultiFactorAuthPresent"
      values   = ["false"]
    }
  }
}

resource "aws_iam_group" "developers" {
  count = local.is_primary ? 1 : 0
  name  = "${local.name_prefix}-developers"
}

resource "aws_iam_group_policy" "developers" {
  count  = local.is_primary ? 1 : 0
  name   = "developer-access"
  group  = aws_iam_group.developers[0].name
  policy = data.aws_iam_policy_document.developers.json
}

data "aws_iam_policy_document" "auditors" {
  statement {
    sid = "ReadOnlyGovernanceView"
    actions = [
      "iam:Get*",
      "iam:List*",
      "iam:GenerateCredentialReport",
      "s3:GetBucket*",
      "s3:GetEncryptionConfiguration",
      "s3:GetLifecycleConfiguration",
      "s3:ListAllMyBuckets",
      "resource-groups:Get*",
      "resource-groups:List*",
      "resource-groups:SearchResources",
      "tag:GetResources",
      "cloudformation:Describe*",
      "cloudformation:List*",
      "budgets:ViewBudget",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_group" "auditors" {
  count = local.is_primary ? 1 : 0
  name  = "${local.name_prefix}-auditors"
}

resource "aws_iam_group_policy" "auditors" {
  count  = local.is_primary ? 1 : 0
  name   = "auditor-read-only"
  group  = aws_iam_group.auditors[0].name
  policy = data.aws_iam_policy_document.auditors.json
}

# ---------------------------------------------------------------------------
# Resource Group - every resource tagged Project + Environment in this region
# ---------------------------------------------------------------------------
resource "aws_resourcegroups_group" "environment" {
  name        = local.name_prefix
  description = "All ${var.project} resources in the ${var.environment} environment - tag based"

  resource_query {
    query = jsonencode({
      ResourceTypeFilters = ["AWS::AllSupported"]
      TagFilters = [
        { Key = "Project", Values = [var.project] },
        { Key = "Environment", Values = [var.environment] },
      ]
    })
  }
}

# ---------------------------------------------------------------------------
# Cost guard-rail - monthly budget (account-wide: primary region only)
# ---------------------------------------------------------------------------
resource "aws_budgets_budget" "monthly" {
  count        = local.is_primary ? 1 : 0
  name         = "${local.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(local.monthly_budget[var.environment])
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = var.budget_alert_email == "" ? [] : [
      { type = "ACTUAL", threshold = 80 },
      { type = "FORECASTED", threshold = 100 },
    ]
    content {
      notification_type          = notification.value.type
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value.threshold
      threshold_type             = "PERCENTAGE"
      subscriber_email_addresses = [var.budget_alert_email]
    }
  }
}
