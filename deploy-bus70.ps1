# BUS70 latest safe one-command deployment
# Run inside BUS70_DEPLOY: .\deploy-bus70.ps1

[CmdletBinding()]
param(
  [string]$Description = "Private route data boundary v56",
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

function Test-SourceMarker([string]$Path, [string]$Marker) {
  if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
  try {
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8).Contains($Marker)
  }
  catch {
    return $false
  }
}

function Find-RecoverySource([string[]]$Roots, [string[]]$Names, [string]$Marker) {
  foreach ($root in $Roots) {
    if (-not $root -or -not (Test-Path -LiteralPath $root -PathType Container)) { continue }
    foreach ($name in $Names) {
      $direct = Join-Path $root $name
      if (Test-SourceMarker $direct $Marker) { return $direct }
    }
    $nested = Get-ChildItem -LiteralPath $root -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $Names -contains $_.Name }
    foreach ($candidate in $nested) {
      if (Test-SourceMarker $candidate.FullName $Marker) { return $candidate.FullName }
    }
  }
  return $null
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
    foreach ($marker in @("SkipSelfUpdate", "Route5Schedule.js", "Route70Schedule.js", "RoutePrivateData.js")) {
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
$backupFiles = @($required)
foreach ($optionalFile in @("Route5Schedule.js", "Route70Schedule.js", "PrivateRouteStore.js", "RoutePrivateData.js")) {
  if (Test-Path -LiteralPath $optionalFile -PathType Leaf) { $backupFiles += $optionalFile }
}
foreach ($file in $backupFiles) {
  Copy-Item -LiteralPath $file -Destination $backup -Force
}
Write-Host "Backup: $backup" -ForegroundColor DarkGray

Step "Preserving private route data"
$privateDataFile = Join-Path (Get-Location) "RoutePrivateData.js"
$recoveryRoots = @((Get-Location).Path)
$previousBackups = Get-ChildItem -LiteralPath $parent -Directory -Filter "BUS70_DEPLOY_backup-*" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending
$recoveryRoots += @($previousBackups | ForEach-Object { $_.FullName })

if (-not (Test-Path -LiteralPath $privateDataFile -PathType Leaf)) {
  $savedPrivateData = Find-RecoverySource $recoveryRoots @("RoutePrivateData.js", "RoutePrivateData.gs") "BUS70_PRIVATE_ROUTE_DATA_"
  if ($savedPrivateData) {
    Copy-Item -LiteralPath $savedPrivateData -Destination $privateDataFile -Force
    Write-Host "Local-only route data was restored from the newest external backup." -ForegroundColor Green
  }
}

$legacyRoute5 = $null
$legacyRoute70 = $null
$legacyManager = $null
if (-not (Test-Path -LiteralPath $privateDataFile -PathType Leaf)) {
  $legacyRoute5 = Find-RecoverySource $recoveryRoots @("Route5Schedule.js", "Route5Schedule.gs") "BUS70_ROUTE5_REFERENCE_"
  $legacyRoute70 = Find-RecoverySource $recoveryRoots @("Route70Schedule.js", "Route70Schedule.gs") "BUS70_ROUTE70_REFERENCE_"
  $legacyManager = Find-RecoverySource $recoveryRoots @("ManagerDispatch.js", "ManagerDispatch.gs") "upsertAccount('"
}

if (-not (Test-Path -LiteralPath $privateDataFile -PathType Leaf) -and (-not $legacyRoute5 -or -not $legacyRoute70 -or -not $legacyManager)) {
  Step "Recovering private route data from the current Apps Script project"
  $serverRecovery = Join-Path $backup "apps-script-current"
  New-Item -ItemType Directory -Path $serverRecovery -Force | Out-Null
  Copy-Item -LiteralPath ".clasp.json" -Destination (Join-Path $serverRecovery ".clasp.json") -Force
  $pullExitCode = 1
  Push-Location $serverRecovery
  try {
    & npx.cmd @google/clasp pull
    $pullExitCode = $LASTEXITCODE
  }
  finally {
    Pop-Location
  }
  if ($pullExitCode -eq 0) {
    $serverRoots = @($serverRecovery)
    $serverPrivateData = Find-RecoverySource $serverRoots @("RoutePrivateData.js", "RoutePrivateData.gs") "BUS70_PRIVATE_ROUTE_DATA_"
    if ($serverPrivateData) {
      Copy-Item -LiteralPath $serverPrivateData -Destination $privateDataFile -Force
      Write-Host "Local-only route data was restored from the current Apps Script project." -ForegroundColor Green
    }
    else {
      if (-not $legacyRoute5) { $legacyRoute5 = Find-RecoverySource $serverRoots @("Route5Schedule.js", "Route5Schedule.gs") "BUS70_ROUTE5_REFERENCE_" }
      if (-not $legacyRoute70) { $legacyRoute70 = Find-RecoverySource $serverRoots @("Route70Schedule.js", "Route70Schedule.gs") "BUS70_ROUTE70_REFERENCE_" }
      if (-not $legacyManager) { $legacyManager = Find-RecoverySource $serverRoots @("ManagerDispatch.js", "ManagerDispatch.gs") "upsertAccount('" }
    }
  }
  else {
    Write-Warning "The current Apps Script project could not be downloaded for private-data recovery."
  }
}

if (-not (Test-Path -LiteralPath $privateDataFile -PathType Leaf)) {
  $missingRecoverySources = @()
  if (-not $legacyRoute5) { $missingRecoverySources += "Route5Schedule" }
  if (-not $legacyRoute70) { $missingRecoverySources += "Route70Schedule" }
  if (-not $legacyManager) { $missingRecoverySources += "legacy ManagerDispatch" }
  if ($missingRecoverySources.Count -gt 0) {
    throw "Private route data could not be recovered from the deployment folder, external backups, or the current Apps Script project. Missing: $($missingRecoverySources -join ', '). The backup was retained at $backup."
  }
  $migrationScript = Join-Path (Get-Location) "extract-private-route-data.download.tmp.js"
  try {
    Invoke-WebRequest `
      -Uri "https://raw.githubusercontent.com/skyballpd-wq/BUS70-TEST/main/scripts/extract-private-route-data.js" `
      -OutFile $migrationScript `
      -UseBasicParsing
    $migrationSource = Get-Content -LiteralPath $migrationScript -Raw -Encoding UTF8
    if (-not $migrationSource.Contains("Private route migration failed")) {
      throw "The private-data migration helper failed its integrity check."
    }
    & node $migrationScript --route5 $legacyRoute5 --route70 $legacyRoute70 --manager $legacyManager --output "RoutePrivateData.js"
    if ($LASTEXITCODE -ne 0) { throw "Private route data migration failed." }
    Copy-Item -LiteralPath $privateDataFile -Destination $backup -Force
    Write-Host "Existing route data was moved into local-only RoutePrivateData.js." -ForegroundColor Green
  }
  finally {
    if (Test-Path -LiteralPath $migrationScript) { Remove-Item -LiteralPath $migrationScript -Force }
  }
}
else {
  Write-Host "Local-only RoutePrivateData.js is already configured." -ForegroundColor Green
}

$privateDataSource = Get-Content -LiteralPath $privateDataFile -Raw -Encoding UTF8
foreach ($privateMarker in @("BUS70_PRIVATE_ROUTE_DATA_", '"config"', '"shiftAnchorDate"', '"shiftAnchor"', '"bootstrapAccounts"', '"driverOnlyIds"', '"5"', '"70"')) {
  if (-not $privateDataSource.Contains($privateMarker)) {
    throw "Local-only RoutePrivateData.js is missing required data marker: $privateMarker"
  }
}
Write-Host "Private route data markers were verified." -ForegroundColor Green

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
    Markers = @("driverAlertSettingsGet", "bus70DriverRunLogSave_", "bus70DriverAlertSettingsSave_", "bus70AttachLocationReferences_", "TURN")
  },
  @{
    Source = "https://raw.githubusercontent.com/skyballpd-wq/BUS70-TEST/main/apps-script/Route5Schedule.gs"
    Destination = "Route5Schedule.js"
    Markers = @("bus70Route5ReferenceData_", "bus70Route5ScheduleForDriver_", "PRIVATE_REFERENCE_NOT_CONFIGURED")
  },
  @{
    Source = "https://raw.githubusercontent.com/skyballpd-wq/BUS70-TEST/main/apps-script/Route70Schedule.gs"
    Destination = "Route70Schedule.js"
    Markers = @("bus70Route70ReferenceData_", "bus70Route70ScheduleForDriver_", "PRIVATE_REFERENCE_NOT_CONFIGURED")
  },
  @{
    Source = "https://raw.githubusercontent.com/skyballpd-wq/BUS70-TEST/main/apps-script/PrivateRouteStore.gs"
    Destination = "PrivateRouteStore.js"
    Markers = @("bus70PrivateRouteSource_", "BUS70_PRIVATE_ROUTE_DATA_JSON", "bus70PrivateRouteStatus_")
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
foreach ($file in @("Code.js", "AuthStep9.js", "BoardEntry.js", "ManagerDispatch.js", "PrivateRouteStore.js", "RoutePrivateData.js", "Route5Schedule.js", "Route70Schedule.js")) {
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
