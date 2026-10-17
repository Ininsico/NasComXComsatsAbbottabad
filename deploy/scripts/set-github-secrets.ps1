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

.EXAMPLE
  pwsh deploy/scripts/set-github-secrets.ps1
  pwsh deploy/scripts/set-github-secrets.ps1 -GhcrToken ghp_xxxxxxxxxxxx
#>
[CmdletBinding()]
param(
    [string]$Repo = 'Ininsico/NasComXComsatsAbbottabad',
    [string]$VmHostAddress = '169.58.119.44',
    [string]$VmUser = 'root',
    [string]$KeyPath = (Join-Path $env:USERPROFILE '.ssh\nascon_deploy'),
    [string]$GhcrToken = ''
)

$ErrorActionPreference = 'Stop'

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
    throw "no private key at $KeyPath — generate one with: ssh-keygen -t ed25519 -f `"$KeyPath`" -N `"`""
}

Write-Host ''
Write-Host '== setting secrets ==' -ForegroundColor Cyan

gh secret set VM_HOST --repo $Repo --body $VmHostAddress
Write-Host "  VM_HOST    = $VmHostAddress"

gh secret set VM_USER --repo $Repo --body $VmUser
Write-Host "  VM_USER    = $VmUser"

Get-Content -LiteralPath $KeyPath -Raw | gh secret set VM_SSH_KEY --repo $Repo
Write-Host "  VM_SSH_KEY = <contents of $KeyPath>"

if ($GhcrToken) {
    gh secret set GHCR_TOKEN --repo $Repo --body $GhcrToken
    Write-Host '  GHCR_TOKEN = <provided>'
}
else {
    Write-Host '  GHCR_TOKEN = not set (fine if the nascon-* packages are public)' -ForegroundColor Yellow
}

Write-Host ''
Write-Host '== result ==' -ForegroundColor Cyan
gh secret list --repo $Repo

Write-Host ''
Write-Host 'Now push to main and the Deploy workflow will run:' -ForegroundColor Green
Write-Host '  git push origin main'
Write-Host '  gh run watch --repo ' $Repo
