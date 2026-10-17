<#
.SYNOPSIS
  Set the repository secrets the Deploy workflow needs.

.DESCRIPTION
  Writes VM_HOST, VM_USER and VM_SSH_KEY (from the deploy key file) as repository
  secrets. GHCR_TOKEN is optional: add a personal access token with read:packages to
  let the server pull private images, or leave it out and make the four nascon-*
  packages public instead.

  You must be authenticated with an account that can administer the repository:
      gh auth login
      gh auth status

  Kept deliberately ASCII-only: Windows PowerShell 5.1 reads a BOM-less UTF-8 file as
  ANSI, and non-ASCII characters inside strings break parsing.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File deploy/scripts/set-github-secrets.ps1
  powershell -ExecutionPolicy Bypass -File deploy/scripts/set-github-secrets.ps1 -GhcrToken ghp_xxxxxxxxxxxx
#>
[CmdletBinding()]
param(
    [string]$Repo = 'Ininsico/NasComXComsatsAbbottabad',
    [string]$VmAddress = '169.58.119.44',
    [string]$VmUser = 'root',
    [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\nascon_deploy'),
    [string]$GhcrToken = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'the GitHub CLI (gh) is not installed'
}

Write-Host '== who am I ==' -ForegroundColor Cyan
gh auth status

Write-Host ''
Write-Host '== repository ==' -ForegroundColor Cyan
$repoJson = gh api "repos/$Repo" | ConvertFrom-Json
Write-Host "  $($repoJson.full_name)  default branch: $($repoJson.default_branch)"

if (-not $repoJson.permissions.admin) {
    Write-Warning "the current account is not an admin of $Repo, so setting secrets will fail."
    Write-Warning 'Run: gh auth login   (as an account that can administer the repository)'
}

if (-not (Test-Path -LiteralPath $KeyPath)) {
    throw "no private key at $KeyPath. Generate one with: ssh-keygen -t ed25519 -f $KeyPath -N ''"
}

Write-Host ''
Write-Host '== setting secrets ==' -ForegroundColor Cyan

gh secret set VM_HOST --repo $Repo --body $VmAddress
Write-Host "  VM_HOST    = $VmAddress"

gh secret set VM_USER --repo $Repo --body $VmUser
Write-Host "  VM_USER    = $VmUser"

# OpenSSH rejects a private key containing carriage returns, so normalise to LF and
# hand the file to gh through cmd, which never re-encodes the bytes.
$keyText = (Get-Content -Raw -LiteralPath $KeyPath) -replace "`r`n", "`n"
$lfPath = Join-Path $env:TEMP 'nascon_deploy_lf'
[System.IO.File]::WriteAllText($lfPath, $keyText)

& cmd /c "gh secret set VM_SSH_KEY --repo $Repo < `"$lfPath`""
Write-Host "  VM_SSH_KEY = contents of $KeyPath"

Remove-Item -LiteralPath $lfPath -ErrorAction SilentlyContinue

if ($GhcrToken) {
    gh secret set GHCR_TOKEN --repo $Repo --body $GhcrToken
    Write-Host '  GHCR_TOKEN = provided'
}
else {
    Write-Host '  GHCR_TOKEN = not set (fine if the nascon-* packages are public)' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '== result ==' -ForegroundColor Cyan
gh secret list --repo $Repo

Write-Host ''
Write-Host 'Now push to main and the Deploy workflow runs:' -ForegroundColor Green
Write-Host '  git push origin main'
Write-Host "  gh run watch --repo $Repo"
