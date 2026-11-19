<#
.SYNOPSIS
  Download the Amazon RDS CA bundle so the API can verify the database's TLS
  certificate (DB_SSL=true, DB_SSL_CA_PATH=certs/rds-global-bundle.pem).
#>
$ErrorActionPreference = 'Stop'
$dest = Join-Path (Split-Path -Parent $PSScriptRoot) 'CloudWMS/server/certs/rds-global-bundle.pem'
New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri 'https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem' -OutFile $dest
$count = (Select-String -Path $dest -Pattern 'BEGIN CERTIFICATE').Count
if ($count -lt 1) { throw "Downloaded file contains no certificates: $dest" }
Write-Host "Saved $count RDS CA certificates to $dest"
