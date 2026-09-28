param([Parameter(Mandatory=$true)][string]$ApiUrl)
$ErrorActionPreference = 'Stop'
if (!$ApiUrl.StartsWith('https://')) { throw 'Android requires a reachable HTTPS API URL (not localhost).' }
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  docker run --rm -v "${PWD}:/workspace" -w /workspace -e "VITE_API_URL=$ApiUrl" node:22-bookworm-slim sh -c 'npm ci && npm run build -w web && npm run android:sync'
  if ($LASTEXITCODE -ne 0) { throw 'Android preparation failed.' }
  Write-Host 'Open web/android in Android Studio, then Build > Build APK(s). Use JDK 21 and SDK 35.'
} finally { Pop-Location }
