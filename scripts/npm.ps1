# All arguments are forwarded to npm in a Node 22 container. No host Node required.
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  if (!(Test-Path '.env')) { throw 'Copy .env.example to .env first.' }
  docker compose run --rm --no-deps node @args
  if ($LASTEXITCODE -ne 0) { throw "Container npm failed: $LASTEXITCODE" }
} finally { Pop-Location }
