param([string]$ApiUrl = "http://127.0.0.1:3000")
$ErrorActionPreference = 'Stop'
$LocalDebug = $ApiUrl -in @('http://127.0.0.1:3000', 'http://10.0.2.2:3000')
if (!$ApiUrl.StartsWith('https://') -and !$LocalDebug) { throw 'Use HTTPS or a documented local-debug address.' }
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  docker run --rm -v "${PWD}:/workspace" -w /workspace -e "VITE_API_URL=$ApiUrl" -e "PHONEMAIL_ANDROID_LOCAL=$($LocalDebug.ToString().ToLower())" node:22-bookworm-slim sh -c 'npm ci && npm run build -w web && npm run android:sync'
  if ($LASTEXITCODE -ne 0) { throw 'Android preparation failed.' }
  if ($LocalDebug) { Write-Host 'Local debug mode: after installing, run adb reverse tcp:3000 tcp:3000 while Docker backend is running.' }
  Write-Host 'Open web/android in Android Studio, then Build > Build APK(s). Use JDK 21 and SDK 35.'
} finally { Pop-Location }
