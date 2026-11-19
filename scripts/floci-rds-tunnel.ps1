<#
.SYNOPSIS
  Make the Floci RDS database reachable from this machine (local development only).

.DESCRIPTION
  Floci runs RDS behind a proxy that listens INSIDE the floci container (port 7001+),
  and only port 4566 is published. This starts a tiny TCP forwarder container next to
  Floci (official node:24-alpine image, no extra software) that publishes the proxy
  port on 127.0.0.1 only. Floci itself and its data are not touched.

.EXAMPLE
  ./scripts/floci-rds-tunnel.ps1 start        # localhost:7001 -> Floci RDS proxy
  ./scripts/floci-rds-tunnel.ps1 status
  ./scripts/floci-rds-tunnel.ps1 stop         # removes the forwarder container
#>
param(
    [ValidateSet('start', 'stop', 'status')]
    [string]$Action = 'start',
    [int]$Port = 7001
)

$ErrorActionPreference = 'Stop'
$name = "floci-rds-forward-$Port"

function Test-Running { (docker ps --filter "name=^$name$" --format '{{.Names}}') -eq $name }
function Remove-Forwarder {
    # Check first: Windows PowerShell turns docker's "No such container" stderr into an error
    if (docker ps -a --filter "name=^$name$" --format '{{.Names}}') { docker rm -f $name | Out-Null }
}

switch ($Action) {
    'stop' {
        Remove-Forwarder
        Write-Host "Stopped $name"
    }
    'status' {
        if (Test-Running) { Write-Host "$name is running: 127.0.0.1:$Port -> floci:$Port" }
        else { Write-Host "$name is not running" }
    }
    'start' {
        if (-not ((docker ps --filter 'name=^floci$' --format '{{.Names}}') -eq 'floci')) {
            throw 'The floci container is not running. Start Floci first.'
        }
        if (Test-Running) { Write-Host "$name already running"; return }
        Remove-Forwarder

        # Minimal TCP forwarder: every client connection is piped to floci:<port>
        $forwarder = "const net=require('net');net.createServer(c=>{const u=net.connect($Port,'floci');c.pipe(u).pipe(c);const end=()=>{c.destroy();u.destroy()};c.on('error',end);u.on('error',end)}).listen($Port,'0.0.0.0',()=>console.log('forwarding :$Port -> floci:$Port'))"

        docker run -d --name $name --restart unless-stopped --link floci:floci `
            -p "127.0.0.1:${Port}:${Port}" node:24-alpine node -e $forwarder | Out-Null
        Start-Sleep -Seconds 1
        if (-not (Test-Running)) { docker logs $name; throw "Forwarder failed to start" }
        Write-Host "Floci RDS reachable at localhost:$Port (container $name)"
    }
}
