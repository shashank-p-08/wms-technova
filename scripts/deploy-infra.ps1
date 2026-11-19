<#
.SYNOPSIS
  Deploy the TechNova WMS foundation stack for one environment and region.

.EXAMPLE
  ./scripts/deploy-infra.ps1 -Environment dev -Local          # Floci emulator
  ./scripts/deploy-infra.ps1 -Environment prod                # real AWS, us-east-1
  ./scripts/deploy-infra.ps1 -Environment prod -Region us-west-2   # DR region
#>
param(
    [ValidateSet('dev', 'staging', 'prod')]
    [string]$Environment = 'dev',

    [ValidateSet('us-east-1', 'us-west-2')]
    [string]$Region = 'us-east-1',

    [string]$Owner = 'platform-team',
    [string]$CostCenter = 'CC-1001',
    [string]$BudgetAlertEmail = '',

    # Target the local Floci emulator instead of real AWS
    [switch]$Local
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$template = Join-Path $root 'infrastructure/cloudformation/starter.yaml'
$stack = "technova-wms-$Environment"

if ($Local) {
    $env:AWS_ENDPOINT_URL = 'http://localhost:4566'
    if (-not $env:AWS_ACCESS_KEY_ID) { $env:AWS_ACCESS_KEY_ID = 'test' }
    if (-not $env:AWS_SECRET_ACCESS_KEY) { $env:AWS_SECRET_ACCESS_KEY = 'test' }
    Write-Host "Target: Floci (local) $Region" -ForegroundColor Cyan
} else {
    Remove-Item Env:AWS_ENDPOINT_URL -ErrorAction SilentlyContinue
    $who = aws sts get-caller-identity --query Arn --output text
    if ($LASTEXITCODE -ne 0) { throw 'Not authenticated to AWS. Run "aws sso login" or configure a profile.' }
    Write-Host "Target: AWS $Region as $who" -ForegroundColor Yellow
    if ($Environment -eq 'prod') {
        $answer = Read-Host "Deploy to PRODUCTION ($Region)? Type 'prod' to continue"
        if ($answer -ne 'prod') { throw 'Aborted.' }
    }
}

$overrides = @(
    "Environment=$Environment",
    "Owner=$Owner",
    "CostCenter=$CostCenter"
)
if ($BudgetAlertEmail) { $overrides += "BudgetAlertEmail=$BudgetAlertEmail" }

aws cloudformation deploy `
    --region $Region `
    --template-file $template `
    --stack-name $stack `
    --capabilities CAPABILITY_NAMED_IAM `
    --no-fail-on-empty-changeset `
    --tags Project=technova-wms Environment=$Environment Owner=$Owner CostCenter=$CostCenter ManagedBy=cloudformation `
    --parameter-overrides $overrides
if ($LASTEXITCODE -ne 0) { throw "Stack deployment failed. Inspect: aws cloudformation describe-stack-events --stack-name $stack --region $Region" }

aws cloudformation describe-stacks --region $Region --stack-name $stack `
    --query 'Stacks[0].Outputs[].[OutputKey,OutputValue]' --output table
