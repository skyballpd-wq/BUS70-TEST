# BUS70 latest safe one-command deployment
# Run inside BUS70_DEPLOY: .\deploy-bus70.ps1

[CmdletBinding()]
param(
  [string]$Description = "Route 5 B-shift schedules v52",
  [string]$DeploymentId = "AKfycbyFE-F4JEI8ITYO6RouVJh6KS5kvCFfs8y1u3_VO541SCpaSviwexPAOV6zPNculXfP",
  [switch]$SkipSelfUpdate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Keep Korean source, JSON, Apps Script and console text in UTF-8 on both
# Windows PowerShell 5.1 and PowerShell 7+.
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$utf8Bom = [System.Text.UTF8Encoding]::new($true)
[Console]::InputEncoding = $utf8NoBom
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding = $utf8NoBom
$PSDefaultParameterValues["Out-File:Encoding"] = "utf8"
$PSDefaultParameterValues["Set-Content:Encoding"] = "utf8"
$PSDefaultParameterValues["Add-Content:Encoding"] = "utf8"

function Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

# A locally saved deployment script can become older than the application
# modules it downloads. Refresh the script first and relaunch it exactly once,
# so future deployments keep picking up newly added modules automatically.
if (-not $SkipSelfUpdate) {
  Step "Checking the deployment script version"
  $scriptSource = "https://raw.githubusercontent.com/skyballpd-wq/BUS70-TEST/main/deploy-bus70.ps1"
  $scriptTemporary = "$PSCommandPath.update.tmp"
  try {
    Invoke-WebRequest -Uri $scriptSource -OutFile $scriptTemporary -UseBasicParsing
    $latestScript = Get-Content -LiteralPath $scriptTemporary -Raw -Encoding UTF8
    foreach ($marker in @("SkipSelfUpdate", "Route5Schedule.js")) {
      if (-not $latestScript.Contains($marker)) {
        throw "The latest deployment script is missing a safety marker: $marker"
      }
    }

    $currentHash = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash
    $latestHash = (Get-FileHash -LiteralPath $scriptTemporary -Algorithm SHA256).Hash
    if ($currentHash -ne $latestHash) {
      $previousScript = "$PSCommandPath.previous"
      Copy-Item -LiteralPath $PSCommandPath -Destination $previousScript -Force
      [System.IO.File]::WriteAllText($PSCommandPath, $latestScript, $utf8Bom)
      Write-Host "Deployment script updated. Relaunching the latest version." -ForegroundColor Green
      & $PSCommandPath -Description $Description -DeploymentId $DeploymentId -SkipSelfUpdate
      if (-not $?) { throw "The updated deployment script failed." }
      exit 0
    }
    Write-Host "Deployment script is current." -ForegroundColor Green
  }
  finally {
    if (Test-Path -LiteralPath $scriptTemporary) {
      Remove-Item -LiteralPath $scriptTemporary -Force
    }
  }
}

$required = @(
  ".clasp.json",
  "appsscript.json",
  "Code.js",
  "AuthStep9.js",
  "BoardEntry.js",
  "ManagerDispatch.js"
)

Step "Checking deployment folder and tools"
foreach ($file in $required) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Required file is missing: $file"
  }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js was not found." }
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw "npx was not found." }

Step "Creating external backup"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$parent = Split-Path -Parent (Get-Location)
$backup = Join-Path $parent "BUS70_DEPLOY_backup-$stamp"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach ($file in $required) {
  Copy-Item -LiteralPath $file -Destination $backup -Force
}
Write-Host "Backup: $backup" -ForegroundColor DarkGray

Step "Downloading latest server code from GitHub"
$modules = @(
  @{
    Source = "https://raw.githubusercontent.com/skyballpd-wq/BUS70-TEST/main/apps-script/ManagerDispatch.gs"
    Destination = "ManagerDispatch.js"
    Markers = @("bus70PredictManagerAssignments_", "OPEN_MAINTENANCE_EXISTS", "bus70OperatingShiftForDate_", "driverRunLogSave")
  },
  @{
    Source = "https://raw.githubusercontent.com/skyballpd-wq/BUS70-TEST/main/apps-script/AuthStep9.gs"
    Destination = "AuthStep9.js"
    Markers = @("driverAlertSettingsGet", "bus70DriverRunLogSave_", "bus70DriverAlertSettingsSave_")
  },
  @{
    Source = "https://raw.githubusercontent.com/skyballpd-wq/BUS70-TEST/main/apps-script/Route5Schedule.gs"
    Destination = "Route5Schedule.js"
    Markers = @("bus70Route5ReferenceData_", "bus70Route5ScheduleForDriver_", "R5-HD-20251018")
  }
)
foreach ($module in $modules) {
  $temporary = Join-Path (Get-Location) ($module.Destination + ".download.tmp")
  try {
    Invoke-WebRequest -Uri $module.Source -OutFile $temporary -UseBasicParsing
    $downloaded = Get-Content -LiteralPath $temporary -Raw -Encoding UTF8
    foreach ($marker in $module.Markers) {
      if (-not $downloaded.Contains($marker)) { throw "Required feature marker was not found: $marker" }
    }
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) $module.Destination), $downloaded, $utf8NoBom)
  }
  finally {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
  }
}

Step "Checking JavaScript syntax"
foreach ($file in @("Code.js", "AuthStep9.js", "BoardEntry.js", "ManagerDispatch.js", "Route5Schedule.js")) {
  & node --check $file
  if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $file" }
}
Write-Host "Syntax checks passed." -ForegroundColor Green

Write-Host "`nDeployment: $DeploymentId" -ForegroundColor Yellow
$confirmation = Read-Host "Type DEPLOY to continue"
if ($confirmation -cne "DEPLOY") {
  Write-Host "Deployment cancelled. The backup was retained." -ForegroundColor Yellow
  exit 0
}

Step "Uploading Apps Script files"
& npx.cmd @google/clasp push --force
if ($LASTEXITCODE -ne 0) { throw "clasp push failed" }

Step "Creating a new Apps Script version"
$versionOutput = & npx.cmd @google/clasp version $Description 2>&1
$versionOutput | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { throw "clasp version failed" }
$versionText = $versionOutput -join "`n"
$versionMatch = [regex]::Match($versionText, "Created version\s+(\d+)")
if (-not $versionMatch.Success) { throw "Could not detect the new version number." }
$versionNumber = $versionMatch.Groups[1].Value

Step "Updating the existing web app deployment"
& npx.cmd @google/clasp deploy `
  --deploymentId $DeploymentId `
  --versionNumber $versionNumber `
  --description $Description
if ($LASTEXITCODE -ne 0) { throw "clasp deploy failed" }

Step "Verifying deployment"
& npx.cmd @google/clasp deployments
if ($LASTEXITCODE -ne 0) { throw "Could not verify deployments" }

Write-Host "`nCompleted: Apps Script version $versionNumber" -ForegroundColor Green
Write-Host "Backup: $backup" -ForegroundColor Green
