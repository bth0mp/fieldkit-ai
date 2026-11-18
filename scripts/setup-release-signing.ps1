# One-time setup: creates the Fieldkit AI release signing key and stores it as GitHub Actions secrets,
# so every release APK is signed with the same private key and installs over the previous one.
#
# Run it yourself, in PowerShell, from the repo folder:
#   powershell -ExecutionPolicy Bypass -File scripts\setup-release-signing.ps1
#
# The password is generated here and never printed. It is saved next to the key, in a folder outside
# the repo. Back up BOTH files (for example in your password manager): without them no future release
# can update the app on your friends' phones, and they would have to uninstall it and lose their chats.
$ErrorActionPreference = 'Stop'
$repo = 'bth0mp/fieldkit-ai'
$alias = 'fieldkit'
$dir = Join-Path $env:USERPROFILE 'fieldkit-release-key'
$jks = Join-Path $dir 'fieldkit-release.jks'
$passFile = Join-Path $dir 'keystore-password.txt'

if (Test-Path $jks) { throw "$jks already exists. Keep it: releases are signed with it." }
$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if (-not (Test-Path $keytool)) { throw "keytool not found. Set JAVA_HOME to a JDK 17." }
gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Sign in to GitHub first: gh auth login" }

New-Item -ItemType Directory -Force $dir | Out-Null
$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$pass = [Convert]::ToBase64String($bytes) -replace '[+/=]', ''

# PKCS12 keystores use one password for the store and the key.
& $keytool -genkeypair -keystore $jks -storetype PKCS12 -alias $alias -keyalg RSA -keysize 4096 `
  -validity 10000 -storepass $pass -keypass $pass -dname 'CN=Fieldkit AI' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "keytool failed" }
Set-Content -Path $passFile -Value $pass -NoNewline -Encoding ascii

$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($jks))
$secrets = [ordered]@{
  ANDROID_KEYSTORE_BASE64   = $b64
  ANDROID_KEYSTORE_PASSWORD = $pass
  ANDROID_KEY_ALIAS         = $alias
  ANDROID_KEY_PASSWORD      = $pass
}
foreach ($name in $secrets.Keys) {
  gh secret set $name --repo $repo --body $secrets[$name]
  if ($LASTEXITCODE -ne 0) { throw "Setting $name failed" }
}

Write-Host ""
Write-Host "Done. Release key: $jks"
Write-Host "Password file:     $passFile"
Write-Host "Back up both files now, then you can delete the password file from this PC."
