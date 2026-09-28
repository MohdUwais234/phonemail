$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  if (!(Test-Path '.env')) { Copy-Item '.env.example' '.env'; Write-Host 'Created .env. Set OTP_PROVIDER=dev for local testing, or configure Twilio.' }
  docker compose up --build -d
  if ($LASTEXITCODE -ne 0) { throw 'Docker startup failed.' }
  Write-Host 'PhoneMail: http://localhost:5173 | API: http://localhost:3000 | MailHog: http://localhost:8025'
} finally { Pop-Location }
