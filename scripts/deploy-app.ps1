<#
.SYNOPSIS
  Build, push and deploy the CloudWMS API + web app to ECS Fargate.

.DESCRIPTION
  1. Creates the hosting stack (registries, load balancer, cluster) on first run
  2. Builds both images, tagged with the git commit (immutable tags)
  3. Pushes them to ECR
  4. Deploys the hosting stack with that tag; ECS rolls out with health checks
     and rolls back automatically if the new version never becomes healthy
  Requires the foundation stack (scripts/deploy-infra.ps1) in the same environment.

.EXAMPLE
  ./scripts/deploy-app.ps1 -Environment dev -Local      # Floci emulator
  ./scripts/deploy-app.ps1 -Environment prod -CertificateArn arn:aws:acm:...
#>
param(
    [ValidateSet('dev', 'staging', 'prod')]
    [string]$Environment = 'dev',
    [string]$Region = 'us-east-1',
    [int]$DesiredCount = 1,
    [string]$CertificateArn = '',
    [string]$AdminEmail = 'admin@technova.local',
    [switch]$Local
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$template = Join-Path $root 'infrastructure/cloudformation/app-hosting.yaml'
$stack = "technova-wms-$Environment-app"

function Invoke-Native {
    # Windows PowerShell turns any stderr output of a native tool (docker build progress,
    # aws CLI waits) into an error under 'Stop'; judge success by the exit code instead.
    param([scriptblock]$Command, [string]$What)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Command 2>&1 | ForEach-Object { "$_" } }
    finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)" }
}

if ($Local) {
    $env:AWS_ENDPOINT_URL = 'http://localhost:4566'
    if (-not $env:AWS_ACCESS_KEY_ID) { $env:AWS_ACCESS_KEY_ID = 'test' }
    if (-not $env:AWS_SECRET_ACCESS_KEY) { $env:AWS_SECRET_ACCESS_KEY = 'test' }
    Write-Host "Target: Floci (local) $Region" -ForegroundColor Cyan
} else {
    Remove-Item Env:AWS_ENDPOINT_URL -ErrorAction SilentlyContinue
    $who = aws sts get-caller-identity --query Arn --output text
    if ($LASTEXITCODE -ne 0) { throw 'Not authenticated to AWS. Run "aws sso login" first.' }
    Write-Host "Target: AWS $Region as $who" -ForegroundColor Yellow
    if ($Environment -eq 'prod') {
        if ((Read-Host "Deploy the application to PRODUCTION? Type 'prod'") -ne 'prod') { throw 'Aborted.' }
    }
}

# ---- image tag: the commit; uncommitted changes get a unique suffix (tags are immutable) ----
$tag = (git -C $root rev-parse --short=12 HEAD).Trim()
if (git -C $root status --porcelain) {
    $tag = "$tag-dirty-$(Get-Date -Format 'yyyyMMddHHmmss')"
    Write-Host "Working tree has uncommitted changes - tagging as $tag" -ForegroundColor Yellow
}

$params = @(
    "Environment=$Environment",
    "ApiDesiredCount=$DesiredCount",
    "AdminEmail=$AdminEmail"
)
if ($CertificateArn) { $params += "CertificateArn=$CertificateArn" }
# Emulator only: endpoint the tasks use instead of task-role credentials (see the template)
if ($Local) { $params += 'EmulatorEndpoint=http://host.docker.internal:4566' }

# ---- 1. first run: create registries + load balancer without services ----
$ErrorActionPreference = 'Continue'
$null = aws cloudformation describe-stacks --region $Region --stack-name $stack --query 'Stacks[0].StackStatus' --output text 2>$null
$stackMissing = $LASTEXITCODE -ne 0
$ErrorActionPreference = 'Stop'
if ($stackMissing) {
    Write-Host "Creating $stack (registries, load balancer, cluster)..."
    Invoke-Native { aws cloudformation deploy --region $Region --template-file $template --stack-name $stack `
        --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset --parameter-overrides $params } 'Initial stack creation'
}

$outputs = aws cloudformation describe-stacks --region $Region --stack-name $stack --query 'Stacks[0].Outputs' --output json | ConvertFrom-Json
function Get-Output($key) { ($outputs | Where-Object OutputKey -eq $key).OutputValue }
$apiRepo = Get-Output 'ApiRepositoryUri'
$webRepo = Get-Output 'WebRepositoryUri'
$registry = $apiRepo.Split('/')[0]

if ($Local) {
    # Floci's ECR hostname (*.ecr.<region>.localhost) is not resolvable by Docker Desktop;
    # push straight to Floci's registry container instead (same repositories).
    $mapped = docker port floci-aws-ecr-registry 5000 2>$null | Select-Object -First 1
    if (-not $mapped) { throw 'Floci ECR registry container not found (create a repository first)' }
    $pushRegistry = $mapped.Trim() -replace '^0\.0\.0\.0', '127.0.0.1'
    $ecrApiRepo = $apiRepo
    $ecrWebRepo = $webRepo
    $apiRepo = "$pushRegistry/" + ($apiRepo -replace '^[^/]+/', '')
    $webRepo = "$pushRegistry/" + ($webRepo -replace '^[^/]+/', '')
    $registry = $pushRegistry
}

# ---- 2+3. build and push ----
Write-Host "Signing in to $registry"
$password = aws ecr get-login-password --region $Region
if ($LASTEXITCODE -ne 0) { throw 'Could not get an ECR login token' }
$password | docker login --username AWS --password-stdin $registry 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw "docker login to $registry failed" }

Write-Host "Building images $tag"
Invoke-Native { docker build -t "${apiRepo}:$tag" (Join-Path $root 'CloudWMS/server') } 'API image build'
Invoke-Native { docker build -t "${webRepo}:$tag" --build-arg VITE_API_URL=/api (Join-Path $root 'CloudWMS/client') } 'Web image build'

Write-Host "Pushing images"
Invoke-Native { docker push "${apiRepo}:$tag" } 'API image push'
Invoke-Native { docker push "${webRepo}:$tag" } 'Web image push'

if ($Local) {
    # Floci starts tasks on this Docker engine using the ECR hostname, which Docker Desktop
    # cannot resolve; giving the local images that name means no pull is needed.
    Invoke-Native { docker tag "${apiRepo}:$tag" "${ecrApiRepo}:$tag" } 'Local ECR tag (api)'
    Invoke-Native { docker tag "${webRepo}:$tag" "${ecrWebRepo}:$tag" } 'Local ECR tag (web)'
}

# ---- 4. deploy the services with the new tag ----
Write-Host "Deploying $tag to ECS (waits for healthy tasks; rolls back on failure)..."
Invoke-Native { aws cloudformation deploy --region $Region --template-file $template --stack-name $stack `
    --capabilities CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset `
    --parameter-overrides ($params + "ImageTag=$tag") } 'Service deployment'

$outputs = aws cloudformation describe-stacks --region $Region --stack-name $stack --query 'Stacks[0].Outputs' --output json | ConvertFrom-Json
Write-Host ""
Write-Host "Deployed $tag" -ForegroundColor Green
Write-Host "  App:            $(Get-Output 'AppUrl')"
Write-Host "  First admin:    $AdminEmail"
Write-Host "  Admin password: aws secretsmanager get-secret-value --secret-id $(Get-Output 'AdminPasswordSecretArn') --query SecretString --output text"
