# BUS70 v42 role-sharing safe patch and deployment
[CmdletBinding()]
param(
  [string]$Description = "Role maintenance sharing v42",
  [string]$DeploymentId = "AKfycbyFE-F4JEI8ITYO6RouVJh6KS5kvCFfs8y1u3_VO541SCpaSviwexPAOV6zPNculXfP"
)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Step([string]$Text) {
  Write-Host ""
  Write-Host "==> $Text" -ForegroundColor Cyan
}

function Apply-UnifiedPatch {
  param([string]$Path, [string]$Patch)

  $text = [IO.File]::ReadAllText((Resolve-Path $Path)) -replace "\r\n", "\n"
  $lines = ($Patch -replace "\r\n", "\n") -split "\n"
  $index = 0
  $applied = 0
  $already = 0

  while ($index -lt $lines.Count) {
    if ($lines[$index] -notmatch '^@@') {
      $index++
      continue
    }

    $index++
    $old = New-Object System.Collections.Generic.List[string]
    $new = New-Object System.Collections.Generic.List[string]

    while ($index -lt $lines.Count -and $lines[$index] -notmatch '^@@') {
      $line = $lines[$index]
      if ($line.StartsWith(" ")) {
        $old.Add($line.Substring(1))
        $new.Add($line.Substring(1))
      }
      elseif ($line.StartsWith("-") -and -not $line.StartsWith("---")) {
        $old.Add($line.Substring(1))
      }
      elseif ($line.StartsWith("+") -and -not $line.StartsWith("+++")) {
        $new.Add($line.Substring(1))
      }
      $index++
    }

    $oldBlock = [string]::Join("\n", $old)
    $newBlock = [string]::Join("\n", $new)
    $position = $text.IndexOf($oldBlock, [StringComparison]::Ordinal)

    if ($position -ge 0) {
      $text = $text.Substring(0, $position) + $newBlock + $text.Substring($position + $oldBlock.Length)
      $applied++
    }
    elseif ($text.IndexOf($newBlock, [StringComparison]::Ordinal) -ge 0) {
      $already++
    }
    else {
      throw "현재 ManagerDispatch.js와 안전 패치 기준 버전이 다릅니다. 배포를 중단합니다."
    }
  }

  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText((Resolve-Path $Path), ($text -replace "\n", [Environment]::NewLine), $utf8)
  return [PSCustomObject]@{ Applied = $applied; Already = $already }
}

$patch = @'
--- ManagerDispatch.js
+++ ManagerDispatch.js
@@ -30,18 +30,19 @@
 }
 
 function bus70OperationBootstrap_(requesterId) {
-  if(!bus70CanOperate_(requesterId)) return {ok:false,error:'STAFF_REQUIRED',message:'운영계정 권한이 필요합니다.'};
+  if(!bus70CanOperate_(requesterId)&&!bus70IsKnownDriver_(requesterId)) return {ok:false,error:'LOGIN_REQUIRED',message:'로그인이 필요합니다.'};
   const ss=SpreadsheetApp.getActiveSpreadsheet(), vs=ss.getSheetByName('차량DB'), is=ss.getSheetByName('사건DB'), ms=ss.getSheetByName('정비DB'), ds=ss.getSheetByName('기사DB'), ps=ss.getSheetByName('배차DB'), gs=ss.getSheetByName('배차간격조정DB');
   if(!vs||!is||!ms||!ds) return {ok:false,error:'DB_MISSING',message:'현장 대응 DB를 찾을 수 없습니다.'};
   bus70EnsureSheetColumns_(ms,['정비완료일','운행가능일']);
+  bus70EnsureSheetColumns_(is,['요청자']);
   const vr=vs.getDataRange().getDisplayValues(), vc=makeHeaderMap_(vr[0]);
-  const vehicles=vr.slice(1).map(function(r){const no=String(r[vc['차량번호']]||'').replace(/\D/g,'');return {id:String(r[vc['vehicleId']]||''),no:no,displayNo:no.length===4?'경기71아'+no:no,type:String(r[vc['차량구분']]||''),status:String(r[vc['상태']]||''),route:String(r[vc['현재노선']]||''),note:String(r[vc['비고']]||''),order:Number(r[vc['표시순서']]||999),assignment:null,lastChangeReason:String(r[vc['비고']]||''),lastChangedAt:''};}).filter(function(v){return v.id;});
+  let vehicles=vr.slice(1).map(function(r){const no=String(r[vc['차량번호']]||'').replace(/\D/g,'');return {id:String(r[vc['vehicleId']]||''),no:no,displayNo:no.length===4?'경기71아'+no:no,type:String(r[vc['차량구분']]||''),status:String(r[vc['상태']]||''),route:String(r[vc['현재노선']]||''),note:String(r[vc['비고']]||''),order:Number(r[vc['표시순서']]||999),assignment:null,lastChangeReason:String(r[vc['비고']]||''),lastChangedAt:''};}).filter(function(v){return v.id;});
   const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]), names={};
   dr.slice(1).forEach(function(r){names[String(r[dc['driverId']]||'')]=String(r[dc['성명']]||'');});
   const mr=ms.getDataRange().getDisplayValues(), mc=makeHeaderMap_(mr[0]), maintByIncident={};
   mr.slice(1).forEach(function(r){const incidentId=String(r[mc['incidentId']]||'');if(incidentId)maintByIncident[incidentId]={maintId:String(r[mc['maintId']]||''),status:String(r[mc['현재상태']]||''),reserveVehicleId:String(r[mc['예비차량ID']]||''),result:String(r[mc['정비결과']]||''),note:String(r[mc['비고']]||''),completedDate:bus70ManagerDateKey_(r[mc['정비완료일']]),availableDate:bus70ManagerDateKey_(r[mc['운행가능일']])};});
   const ir=is.getDataRange().getDisplayValues(), ic=makeHeaderMap_(ir[0]);
-  const incidents=ir.slice(1).map(function(r){const id=String(r[ic['incidentId']]||''), m=maintByIncident[id]||{};return {incidentId:id,receivedAt:String(r[ic['접수시간']]||''),date:normalizeDate_(r[ic['날짜']]),driverId:String(r[ic['기사ID']]||''),driverName:names[String(r[ic['기사ID']]||'')]||'',vehicleId:String(r[ic['차량ID']]||''),sequence:Number(r[ic['순차']]||0),type:String(r[ic['유형']]||''),content:String(r[ic['내용']]||''),status:String(r[ic['상태']]||''),handler:String(r[ic['처리자']]||''),closedAt:String(r[ic['종결시간']]||''),maintId:m.maintId||'',maintenanceStatus:m.status||'',reserveVehicleId:m.reserveVehicleId||'',result:m.result||'',maintenanceNote:m.note||'',completedDate:m.completedDate||'',availableDate:m.availableDate||''};}).filter(function(v){return v.incidentId;}).slice(-30).reverse();
+  let incidents=ir.slice(1).map(function(r){const id=String(r[ic['incidentId']]||''), m=maintByIncident[id]||{}, requester=String(r[ic['요청자']]||r[ic['처리자']]||''), handler=String(r[ic['처리자']]||'');return {incidentId:id,receivedAt:String(r[ic['접수시간']]||''),date:normalizeDate_(r[ic['날짜']]),driverId:String(r[ic['기사ID']]||''),driverName:names[String(r[ic['기사ID']]||'')]||'',requesterId:requester,requesterName:names[requester]||requester,requesterRole:bus70RoleFor_(requester)||'DRIVER',vehicleId:String(r[ic['차량ID']]||''),sequence:Number(r[ic['순차']]||0),type:String(r[ic['유형']]||''),content:String(r[ic['내용']]||''),status:String(r[ic['상태']]||''),handler:handler,handlerName:names[handler]||handler,handlerRole:bus70RoleFor_(handler)||'DRIVER',closedAt:String(r[ic['종결시간']]||''),maintId:m.maintId||'',maintenanceStatus:m.status||'',reserveVehicleId:m.reserveVehicleId||'',result:m.result||'',maintenanceNote:m.note||'',completedDate:m.completedDate||'',availableDate:m.availableDate||''};}).filter(function(v){return v.incidentId;}).slice(-30).reverse();
   const vehicleMap={};vehicles.forEach(function(v){vehicleMap[v.id]=v;});
   incidents.slice().reverse().forEach(function(v){
     const original=vehicleMap[v.vehicleId], reserve=vehicleMap[v.reserveVehicleId];
@@ -52,6 +53,14 @@
     const pr=ps.getDataRange().getDisplayValues(), pc=makeHeaderMap_(pr[0]);
     pr.slice(1).filter(function(r){return String(r[pc['상태']]||'')==='확정';}).sort(function(a,b){return normalizeDate_(a[pc['날짜']]).localeCompare(normalizeDate_(b[pc['날짜']]))||Number(a[pc['순차']]||0)-Number(b[pc['순차']]||0);}).forEach(function(r){const vehicle=vehicleMap[String(r[pc['차량ID']]||'')];if(vehicle)vehicle.assignment={date:normalizeDate_(r[pc['날짜']]),shift:String(r[pc['근무조']]||''),sequence:Number(r[pc['순차']]||0)};});
   }
+  const viewerRole=bus70RoleFor_(requesterId);
+  if(!viewerRole){
+    const related={};
+    if(ps&&ps.getLastRow()>1){const pr=ps.getDataRange().getDisplayValues(),pc=makeHeaderMap_(pr[0]);pr.slice(1).forEach(function(r){if(String(r[pc['기사ID']]||'')===requesterId&&String(r[pc['상태']]||'')==='확정')related[String(r[pc['차량ID']]||'')]=true;});}
+    incidents=incidents.filter(function(v){return v.driverId===requesterId||related[v.vehicleId]||related[v.reserveVehicleId];});
+    incidents.forEach(function(v){related[v.vehicleId]=true;if(v.reserveVehicleId)related[v.reserveVehicleId]=true;});
+    vehicles=vehicles.filter(function(v){return related[v.id];});
+  }
   vehicles.sort(function(a,b){return a.order-b.order||a.no.localeCompare(b.no);});
   let adjustments=[];
   if(gs&&gs.getLastRow()>1){const gr=gs.getDataRange().getDisplayValues(),gc=makeHeaderMap_(gr[0]);adjustments=gr.slice(1).map(function(r){return {gapId:String(r[gc['gapId']]||''),date:normalizeDate_(r[gc['날짜']]),sequence:Number(r[gc['순차']]||0),trip:Number(r[gc['탕']]||0),before:String(r[gc['기존시간']]||''),after:String(r[gc['조정시간']]||''),reason:String(r[gc['사유']]||'')};}).filter(function(v){return v.gapId;}).slice(-30).reverse();}
@@ -91,9 +100,10 @@
 }
 
 function bus70VehicleIncidentSave_(body, requesterId) {
-  if(!bus70IsManager_(requesterId)) return {ok:false,error:'MANAGER_REQUIRED',message:'돌발상황 접수는 소장 이상만 가능합니다.'};
+  const requesterRole=bus70RoleFor_(requesterId), driverRequest=!requesterRole&&bus70IsKnownDriver_(requesterId);
+  if(!bus70IsManager_(requesterId)&&requesterRole!=='CENTER'&&!driverRequest) return {ok:false,error:'REQUESTER_REQUIRED',message:'정비 요청은 기사·소장·정비소·마스터만 가능합니다.'};
   const date=normalizeDate_(body.date), vehicleId=String(body.vehicleId||'').trim(), reserveId=String(body.reserveVehicleId||'').trim(), type=String(body.type||'').trim(), content=String(body.content||'').trim(), sequence=Number(body.sequence||0);
-  if(!date||!vehicleId||['고장','사고','점검','운행불가','기타'].indexOf(type)===-1||!content) return {ok:false,error:'PARAM_REQUIRED',message:'날짜·차량·유형·상황 내용을 확인하세요.'};
+  if(!date||!vehicleId||['정기점검','이상 증상','고장','사고','점검','운행불가','기타'].indexOf(type)===-1||!content) return {ok:false,error:'PARAM_REQUIRED',message:'날짜·차량·유형·상황 내용을 확인하세요.'};
   if(reserveId===vehicleId)return {ok:false,error:'SAME_VEHICLE',message:'예비차는 발생 차량과 달라야 합니다.'};
   const ss=SpreadsheetApp.getActiveSpreadsheet(), vs=ss.getSheetByName('차량DB'), is=ss.getSheetByName('사건DB'), ms=ss.getSheetByName('정비DB'), ps=ss.getSheetByName('배차DB'), cs=ss.getSheetByName('배차확인DB');
   if(!vs||!is||!ms||!ps)return {ok:false,error:'DB_MISSING',message:'돌발상황 처리 DB를 찾을 수 없습니다.'};
@@ -102,17 +112,20 @@
   if(!vehicleRow||(reserveId&&!reserveRow))return {ok:false,error:'VEHICLE_NOT_FOUND',message:'발생 차량 또는 예비차를 확인하세요.'};
   if(reserveId&&['운행가능','운행'].indexOf(String(vr[reserveRow-1][vc['상태']]||''))===-1)return {ok:false,error:'RESERVE_UNAVAILABLE',message:'운행 가능한 예비차만 투입할 수 있습니다.'};
   let dispatchId='',driverId='';
-  if(sequence){const pr=ps.getDataRange().getDisplayValues(),pc=makeHeaderMap_(pr[0]);let target=0,alreadyReplaced=false;for(let j=1;j<pr.length;j++){const assignedId=String(pr[j][pc['차량ID']]||'');if(normalizeDate_(pr[j][pc['날짜']])===date&&Number(pr[j][pc['순차']])===sequence&&(assignedId===vehicleId||(reserveId&&assignedId===reserveId))&&String(pr[j][pc['상태']]||'')==='확정'){target=j+1;alreadyReplaced=assignedId===reserveId;dispatchId=String(pr[j][pc['dispatchId']]||'');driverId=String(pr[j][pc['기사ID']]||'');break;}}if(!target)return {ok:false,error:'DISPATCH_NOT_FOUND',message:'선택 날짜·순차에서 발생 차량 또는 대체 차량의 확정 배차를 찾을 수 없습니다.'};if(reserveId&&!alreadyReplaced){ps.getRange(target,pc['차량ID']+1).setValue(reserveId);ps.getRange(target,pc['확정시간']+1).setValue(new Date());ps.getRange(target,pc['비고']+1).setValue(type+' 대체차 투입');}if(reserveId&&cs&&cs.getLastRow()>1){const cr=cs.getDataRange().getDisplayValues(),cc=makeHeaderMap_(cr[0]);for(let k=1;k<cr.length;k++)if(String(cr[k][cc['dispatchId']]||'')===dispatchId)cs.getRange(k+1,cc['재확인필요']+1).setValue('Y');}}
-  vs.getRange(vehicleRow,vc['상태']+1).setValue('정비중');
+  if(sequence){const pr=ps.getDataRange().getDisplayValues(),pc=makeHeaderMap_(pr[0]);let target=0,alreadyReplaced=false;for(let j=1;j<pr.length;j++){const assignedId=String(pr[j][pc['차량ID']]||'');if(normalizeDate_(pr[j][pc['날짜']])===date&&Number(pr[j][pc['순차']])===sequence&&(assignedId===vehicleId||(reserveId&&assignedId===reserveId))&&String(pr[j][pc['상태']]||'')==='확정'){target=j+1;alreadyReplaced=assignedId===reserveId;dispatchId=String(pr[j][pc['dispatchId']]||'');driverId=String(pr[j][pc['기사ID']]||'');break;}}if(!target)return {ok:false,error:'DISPATCH_NOT_FOUND',message:'선택 날짜·순차에서 발생 차량 또는 대체 차량의 확정 배차를 찾을 수 없습니다.'};if(driverRequest&&driverId!==requesterId)return {ok:false,error:'DRIVER_VEHICLE_MISMATCH',message:'본인에게 배차된 차량만 정비 요청할 수 있습니다.'};if(reserveId&&!alreadyReplaced){ps.getRange(target,pc['차량ID']+1).setValue(reserveId);ps.getRange(target,pc['확정시간']+1).setValue(new Date());ps.getRange(target,pc['비고']+1).setValue(type+' 대체차 투입');}if(reserveId&&cs&&cs.getLastRow()>1){const cr=cs.getDataRange().getDisplayValues(),cc=makeHeaderMap_(cr[0]);for(let k=1;k<cr.length;k++)if(String(cr[k][cc['dispatchId']]||'')===dispatchId)cs.getRange(k+1,cc['재확인필요']+1).setValue('Y');}}
+  if(driverRequest&&!sequence){const pr=ps.getDataRange().getDisplayValues(),pc=makeHeaderMap_(pr[0]);for(let j=1;j<pr.length;j++)if(normalizeDate_(pr[j][pc['날짜']])===date&&String(pr[j][pc['기사ID']]||'')===requesterId&&String(pr[j][pc['차량ID']]||'')===vehicleId&&String(pr[j][pc['상태']]||'')==='확정'){driverId=requesterId;dispatchId=String(pr[j][pc['dispatchId']]||'');break;}if(!driverId)return {ok:false,error:'DRIVER_VEHICLE_MISMATCH',message:'선택 날짜에 본인에게 배차된 차량만 정비 요청할 수 있습니다.'};}
+  if(['고장','사고','운행불가'].indexOf(type)!==-1)vs.getRange(vehicleRow,vc['상태']+1).setValue('정비중');
+  bus70EnsureSheetColumns_(is,['요청자']);
   const incidentId=newId_('INC'), ir=is.getDataRange().getDisplayValues(),ic=makeHeaderMap_(ir[0]),irow=new Array(ir[0].length).fill('');
-  irow[ic['incidentId']]=incidentId;irow[ic['접수시간']]=new Date();irow[ic['날짜']]=date;irow[ic['기사ID']]=driverId;irow[ic['차량ID']]=vehicleId;irow[ic['순차']]=sequence||'';irow[ic['유형']]=type;irow[ic['내용']]=content;irow[ic['상태']]='접수';irow[ic['처리자']]=requesterId;irow[ic['비고']]=reserveId?'예비차 대체':'대체차 미정';is.appendRow(irow);
+  irow[ic['incidentId']]=incidentId;irow[ic['접수시간']]=new Date();irow[ic['날짜']]=date;irow[ic['기사ID']]=driverId;irow[ic['차량ID']]=vehicleId;irow[ic['순차']]=sequence||'';irow[ic['유형']]=type;irow[ic['내용']]=content;irow[ic['상태']]='접수';irow[ic['요청자']]=requesterId;irow[ic['처리자']]=requesterId;irow[ic['비고']]=reserveId?'예비차 대체':'대체차 미정';is.appendRow(irow);
   const mr=ms.getDataRange().getDisplayValues(),mc=makeHeaderMap_(mr[0]),mrow=new Array(mr[0].length).fill('');mrow[mc['maintId']]=newId_('MNT');mrow[mc['incidentId']]=incidentId;mrow[mc['요청시간']]=new Date();mrow[mc['차량ID']]=vehicleId;mrow[mc['기사ID']]=driverId;mrow[mc['요청내용']]=content;mrow[mc['현재상태']]='접수';mrow[mc['예비차량ID']]=reserveId;ms.appendRow(mrow);
-  writeAudit_(requesterId,bus70IsMaster_(requesterId)?'마스터':'소장','사건DB',incidentId,'추가',{},irow,type+' 현장대응');
+  writeAudit_(requesterId,requesterRole==='MASTER'?'마스터':requesterRole==='MANAGER'?'소장':requesterRole==='CENTER'?'정비소':'기사','사건DB',incidentId,'추가',{},irow,type+' 현장대응');
   return {ok:true,message:type+' 상황을 접수했습니다.'+(reserveId&&sequence?' '+sequence+'순차를 예비차로 변경했습니다.':'')};
 }
 
 function bus70MaintenanceUpdate_(body, requesterId) {
-  if(!bus70CanOperate_(requesterId))return {ok:false,error:'STAFF_REQUIRED',message:'운영계정 권한이 필요합니다.'};
+  const role=bus70RoleFor_(requesterId);
+  if(role!=='CENTER'&&role!=='MASTER')return {ok:false,error:'CENTER_REQUIRED',message:'정비 과정과 결과는 정비소 Center에서 처리합니다.'};
   const maintId=String(body.maintId||'').trim(), status=String(body.status||'').trim(), result=String(body.result||'').trim(), note=String(body.note||'').trim(), completedDate=bus70ManagerDateKey_(body.completedDate), availableDate=bus70ManagerDateKey_(body.availableDate);
   if(!maintId||['접수','정비중','완료','운행불가'].indexOf(status)===-1)return {ok:false,error:'PARAM_REQUIRED',message:'정비 건과 처리 상태를 확인하세요.'};
   if(status==='완료'&&(!completedDate||!availableDate||availableDate<completedDate))return {ok:false,error:'MAINTENANCE_DATES_REQUIRED',message:'정비 완료일과 운행 가능일을 확인하세요. 운행 가능일은 완료일보다 빠를 수 없습니다.'};
@@ -126,6 +139,13 @@
   return {ok:true,message:'정비 상태를 '+status+'로 저장했습니다.'+(status==='완료'?' '+availableDate+'부터 운행 가능합니다.':'')};
 }
 
+function bus70IsKnownDriver_(driverId) {
+  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기사DB');if(!sheet||sheet.getLastRow()<2)return false;
+  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]);
+  for(let i=1;i<rows.length;i++)if(String(rows[i][c['driverId']]||'')===String(driverId||'')&&String(rows[i][c['상태']]||'')!=='퇴직')return true;
+  return false;
+}
+
 function bus70EnsureSheetColumns_(sheet, required) {
   const rows=sheet.getDataRange().getDisplayValues(), headers=(rows[0]||[]).slice(), existing={};
   headers.forEach(function(v){if(v)existing[String(v)]=true;});
@@ -647,4 +667,3 @@
     return {ok:true, message:expectedSequences.length + '개 순차 배차를 저장했습니다.', data:bus70ManagerBootstrap_(date)};
   } finally { lock.releaseLock(); }
 }
-
'@

Step "환경 및 원본 확인"
$required = @(".clasp.json","appsscript.json","Code.js","AuthStep9.js","BoardEntry.js","ManagerDispatch.js")
foreach ($file in $required) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "필수 파일이 없습니다: $file" }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "node 명령을 찾을 수 없습니다." }
if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) { throw "npx.cmd 명령을 찾을 수 없습니다." }
$codeHash = (Get-FileHash ".\Code.js" -Algorithm SHA256).Hash
if ((Get-Item ".\Code.js").Length -lt 70000) { throw "Code.js 크기가 비정상적이므로 중단합니다." }

Step "프로젝트 외부 백업"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path (Split-Path (Get-Location) -Parent) "BUS70_BACKUP_$stamp"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -LiteralPath $required -Destination $backup -Force
Write-Host "백업 완료: $backup" -ForegroundColor Green

Step "권한별 정비 공유 패치 적용"
$result = Apply-UnifiedPatch -Path ".\ManagerDispatch.js" -Patch $patch
Write-Host "신규 적용: $($result.Applied)개 / 이미 적용: $($result.Already)개" -ForegroundColor Green

if ((Get-FileHash ".\Code.js" -Algorithm SHA256).Hash -ne $codeHash) {
  throw "Code.js 변경이 감지되어 중단합니다."
}

Step "문법 검사"
foreach ($file in @("Code.js","AuthStep9.js","ManagerDispatch.js")) {
  & node --check $file
  if ($LASTEXITCODE -ne 0) { throw "$file 문법 검사 실패" }
}
Write-Host "문법 검사 통과" -ForegroundColor Green

$answer = Read-Host "운영 배포를 계속하려면 DEPLOY를 입력하세요"
if ($answer -cne "DEPLOY") {
  Write-Host "배포를 취소했습니다." -ForegroundColor Yellow
  exit 0
}

Step "Apps Script 업로드"
& npx.cmd "@google/clasp" push --force
if ($LASTEXITCODE -ne 0) { throw "clasp push 실패" }

Step "새 버전 생성"
$versionOutput = (& npx.cmd "@google/clasp" version $Description 2>&1 | Out-String)
Write-Host $versionOutput
if ($LASTEXITCODE -ne 0) { throw "버전 생성 실패" }
$match = [regex]::Match($versionOutput, "(?i)created\s+version\s+(\d+)")
if (-not $match.Success) { throw "생성 버전 번호를 확인하지 못했습니다." }
$version = [int]$match.Groups[1].Value

Step "기존 운영 배포 갱신"
& npx.cmd "@google/clasp" deploy --deploymentId $DeploymentId --versionNumber $version --description $Description
if ($LASTEXITCODE -ne 0) { throw "운영 배포 갱신 실패" }

& npx.cmd "@google/clasp" deployments
Write-Host ""
Write-Host "BUS70 운영 배포 완료: 버전 $version" -ForegroundColor Green
Write-Host "백업 위치: $backup"

