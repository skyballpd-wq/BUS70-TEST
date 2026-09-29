# BUS70 latest safe one-command deployment
# Run inside BUS70_DEPLOY: .\deploy-bus70.ps1

[CmdletBinding()]
param(
  [string]$Description = "Maintenance workflow and dispatch prediction v47",
  [string]$DeploymentId = "AKfycbyFE-F4JEI8ITYO6RouVJh6KS5kvCFfs8y1u3_VO541SCpaSviwexPAOV6zPNculXfP"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

$required = @(
  ".clasp.json",
  "appsscript.json",
  "Code.js",
  "AuthStep9.js",
  "BoardEntry.js",
  "ManagerDispatch.js"
)

Step "배포 폴더와 실행 도구 확인"
foreach ($file in $required) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "필수 파일이 없습니다: $file"
  }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js를 찾을 수 없습니다." }
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { throw "npx를 찾을 수 없습니다." }

Step "현재 파일 외부 백업"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$parent = Split-Path -Parent (Get-Location)
$backup = Join-Path $parent "BUS70_DEPLOY_backup-$stamp"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach ($file in $required) {
  Copy-Item -LiteralPath $file -Destination $backup -Force
}
Write-Host "백업: $backup" -ForegroundColor DarkGray

Step "GitHub 최신 서버 코드 동기화"
$source = "https://raw.githubusercontent.com/skyballpd-wq/BUS70-TEST/main/apps-script/ManagerDispatch.gs"
$temporary = Join-Path (Get-Location) "ManagerDispatch.download.tmp"
try {
  Invoke-WebRequest -Uri $source -OutFile $temporary -UseBasicParsing
  $downloaded = Get-Content -LiteralPath $temporary -Raw -Encoding UTF8
  foreach ($marker in @("bus70PredictManagerAssignments_", "OPEN_MAINTENANCE_EXISTS")) {
    if (-not $downloaded.Contains($marker)) {
      throw "다운로드 코드에서 필수 기능을 찾지 못했습니다: $marker"
    }
  }
  [System.IO.File]::WriteAllText(
    (Join-Path (Get-Location) "ManagerDispatch.js"),
    $downloaded,
    [System.Text.UTF8Encoding]::new($false)
  )
}
finally {
  if (Test-Path -LiteralPath $temporary) {
    Remove-Item -LiteralPath $temporary -Force
  }
}

Step "JavaScript 문법 검사"
foreach ($file in @("Code.js", "AuthStep9.js", "BoardEntry.js", "ManagerDispatch.js")) {
  & node --check $file
  if ($LASTEXITCODE -ne 0) { throw "문법 검사 실패: $file" }
}
Write-Host "문법 검사 통과" -ForegroundColor Green

Write-Host "`n배포 대상: $DeploymentId" -ForegroundColor Yellow
$confirmation = Read-Host "계속하려면 DEPLOY 입력"
if ($confirmation -cne "DEPLOY") {
  Write-Host "사용자가 배포를 취소했습니다. 백업은 유지됩니다." -ForegroundColor Yellow
  exit 0
}

Step "Apps Script 파일 업로드"
& npx.cmd @google/clasp push --force
if ($LASTEXITCODE -ne 0) { throw "clasp push 실패" }

Step "새 버전 생성"
$versionOutput = & npx.cmd @google/clasp version $Description 2>&1
$versionOutput | ForEach-Object { Write-Host $_ }
if ($LASTEXITCODE -ne 0) { throw "clasp version 실패" }
$versionText = $versionOutput -join "`n"
$versionMatch = [regex]::Match($versionText, "Created version\s+(\d+)")
if (-not $versionMatch.Success) { throw "생성된 버전 번호를 확인하지 못했습니다." }
$versionNumber = $versionMatch.Groups[1].Value

Step "기존 웹앱 배포 갱신"
& npx.cmd @google/clasp deploy `
  --deploymentId $DeploymentId `
  --versionNumber $versionNumber `
  --description $Description
if ($LASTEXITCODE -ne 0) { throw "clasp deploy 실패" }

Step "배포 결과 확인"
& npx.cmd @google/clasp deployments
if ($LASTEXITCODE -ne 0) { throw "배포 목록 확인 실패" }

Write-Host "`n완료: Apps Script 버전 $versionNumber" -ForegroundColor Green
Write-Host "백업 위치: $backup" -ForegroundColor Green
