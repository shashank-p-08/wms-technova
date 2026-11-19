output "assets_bucket_name" {
  description = "Set as S3_BUCKET_NAME in CloudWMS/server/.env"
  value       = aws_s3_bucket.assets.bucket
}

output "app_runtime_role_arn" {
  value = aws_iam_role.app.arn
}

output "app_instance_profile_name" {
  value = aws_iam_instance_profile.app.name
}

output "developers_group_name" {
  value = one(aws_iam_group.developers[*].name)
}

output "auditors_group_name" {
  value = one(aws_iam_group.auditors[*].name)
}

output "resource_group_name" {
  value = aws_resourcegroups_group.environment.name
}

output "deployed_region" {
  value = var.region
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "private_subnet_ids" {
  value = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

output "app_security_group_id" {
  description = "Attach to the compute that runs the API so it can reach the database"
  value       = aws_security_group.app.id
}

output "db_endpoint_address" {
  value = one(aws_db_instance.main[*].address)
}

output "db_secret_arn" {
  description = "Set as DB_SECRET_ARN in CloudWMS/server/.env"
  value       = one(aws_secretsmanager_secret.db[*].arn)
}
