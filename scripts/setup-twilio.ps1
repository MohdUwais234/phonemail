# Credentials are prompted without echo and written only to the ignored .env.
param([switch]$RotateAppSecrets)
$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$EnvPath = Join-Path $Root '.env'
if (!(Test-Path $EnvPath)) { Copy-Item (Join-Path $Root '.env.example') $EnvPath }
$script:Lines = [System.IO.File]::ReadAllLines($EnvPath)

function Read-PrivateValue([string]$Prompt) {
  $Secure = Read-Host $Prompt -AsSecureString
  $Ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr); $Secure.Dispose() }
}
function Set-EnvValue([string]$Name, [string]$Value) {
  if ($Value -match '[\r\n]') { throw 'Environment values must be one line.' }
  $Pattern = '^' + [regex]::Escape($Name) + '='
  $script:Lines = @($script:Lines | Where-Object { $_ -notmatch $Pattern }) + "$Name=$Value"
}
function New-AppSecret {
  $Bytes = New-Object byte[] 48
  $Generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $Generator.GetBytes($Bytes); return [Convert]::ToBase64String($Bytes) }
  finally { $Generator.Dispose() }
}

Write-Host 'Set up Twilio Verify (SMS OTP). This script never sends an SMS.'
$Account = Read-PrivateValue 'Account SID (AC...)'
$Service = Read-PrivateValue 'Verify Service SID (VA...)'
if ($Account -notmatch '^AC[0-9a-fA-F]{32}$' -or $Service -notmatch '^VA[0-9a-fA-F]{32}$') { throw 'Use an AC Account SID and a VA Verify Service SID, each followed by 32 hex characters.' }
$Mode = Read-Host 'Authentication: enter 1 for Account Auth Token, or 2 for API Key'
switch ($Mode) {
  '1' {
    $Token = Read-PrivateValue 'Live account Auth Token (not a test credential or API key secret)'
    if ($Token -notmatch '^[0-9a-fA-F]{32}$') { throw 'An account Auth Token must contain 32 hex characters.' }
    Set-EnvValue 'TWILIO_AUTH_TOKEN' $Token
    Set-EnvValue 'TWILIO_API_KEY_SID' ''
    Set-EnvValue 'TWILIO_API_KEY_SECRET' ''
  }
  '2' {
    $Key = Read-PrivateValue 'API Key SID (SK...)'
    $Secret = Read-PrivateValue 'API Key Secret (shown only once by Twilio)'
    if ($Key -notmatch '^SK[0-9a-fA-F]{32}$' -or $Secret -notmatch '^[a-zA-Z0-9_-]{16,}$') { throw 'Check the SK API Key SID and API Key Secret.' }
    Set-EnvValue 'TWILIO_AUTH_TOKEN' ''
    Set-EnvValue 'TWILIO_API_KEY_SID' $Key
    Set-EnvValue 'TWILIO_API_KEY_SECRET' $Secret
  }
  default { throw 'Choose 1 or 2; existing credentials have not been overwritten.' }
}
Set-EnvValue 'TWILIO_ACCOUNT_SID' $Account
Set-EnvValue 'TWILIO_VERIFY_SERVICE_SID' $Service
Set-EnvValue 'OTP_PROVIDER' 'twilio'
Set-EnvValue 'DEV_OTP_LOG' 'false'
foreach ($Name in @('JWT_SECRET','INBOUND_WEBHOOK_SECRET')) {
  $Current = @($script:Lines | Where-Object { $_ -match ('^' + $Name + '=') }) | Select-Object -Last 1
  if ($RotateAppSecrets -or !$Current -or $Current -match '=\s*$|=replace-') { Set-EnvValue $Name (New-AppSecret) }
}
[System.IO.File]::WriteAllLines($EnvPath, $script:Lines, (New-Object System.Text.UTF8Encoding($false)))
Remove-Variable Token,Secret,Account,Service,Key -ErrorAction SilentlyContinue
$script:Lines = @()
Write-Host 'Saved to .env. Do not share this file or commit it. App-secret rotation invalidates existing sessions and requires updating inbound senders.'
Write-Host 'Next: .\scripts\npm.ps1 ci'
Write-Host 'Then: .\scripts\npm.ps1 run twilio:check (read-only; no SMS)'
Write-Host 'After a successful check: docker compose up -d --build --force-recreate backend'
