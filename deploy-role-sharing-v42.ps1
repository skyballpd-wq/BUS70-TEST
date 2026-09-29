param([string]$Description="Role maintenance sharing v42",[string]$DeploymentId="AKfycbyFE-F4JEI8ITYO6RouVJh6KS5kvCFfs8y1u3_VO541SCpaSviwexPAOV6zPNculXfP")
$ErrorActionPreference="Stop"
function EndOfFunction([string]$t,[int]$s){$o=$t.IndexOf("{",$s);$d=0;for($i=$o;$i-lt$t.Length;$i++){if($t[$i]-eq"{"){$d++}elseif($t[$i]-eq"}"){$d--;if($d-eq 0){return $i+1}}}throw "함수 끝을 찾지 못했습니다."}
function PutFunction([string]$t,[string]$n,[string]$r){$s=$t.IndexOf("function $n(",[StringComparison]::Ordinal);if($s-lt 0){throw "함수를 찾지 못했습니다: $n"};$e=EndOfFunction $t $s;return $t.Substring(0,$s)+$r+$t.Substring($e)}
$op=@'
function bus70OperationBootstrap_(requesterId) {
  if(!bus70CanOperate_(requesterId)&&!bus70IsKnownDriver_(requesterId)) return {ok:false,error:'LOGIN_REQUIRED',message:'로그인이 필요합니다.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), vs=ss.getSheetByName('차량DB'), is=ss.getSheetByName('사건DB'), ms=ss.getSheetByName('정비DB'), ds=ss.getSheetByName('기사DB'), ps=ss.getSheetByName('배차DB'), gs=ss.getSheetByName('배차간격조정DB');
  if(!vs||!is||!ms||!ds) return {ok:false,error:'DB_MISSING',message:'현장 대응 DB를 찾을 수 없습니다.'};
  bus70EnsureSheetColumns_(ms,['정비완료일','운행가능일']);
  bus70EnsureSheetColumns_(is,['요청자']);
  const vr=vs.getDataRange().getDisplayValues(), vc=makeHeaderMap_(vr[0]);
  let vehicles=vr.slice(1).map(function(r){const no=String(r[vc['차량번호']]||'').replace(/\D/g,'');return {id:String(r[vc['vehicleId']]||''),no:no,displayNo:no.length===4?'경기71아'+no:no,type:String(r[vc['차량구분']]||''),status:String(r[vc['상태']]||''),route:String(r[vc['현재노선']]||''),note:String(r[vc['비고']]||''),order:Number(r[vc['표시순서']]||999),assignment:null,lastChangeReason:String(r[vc['비고']]||''),lastChangedAt:''};}).filter(function(v){return v.id;});
  const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]), names={};
  dr.slice(1).forEach(function(r){names[String(r[dc['driverId']]||'')]=String(r[dc['성명']]||'');});
  const mr=ms.getDataRange().getDisplayValues(), mc=makeHeaderMap_(mr[0]), maintByIncident={};
  mr.slice(1).forEach(function(r){const incidentId=String(r[mc['incidentId']]||'');if(incidentId)maintByIncident[incidentId]={maintId:String(r[mc['maintId']]||''),status:String(r[mc['현재상태']]||''),reserveVehicleId:String(r[mc['예비차량ID']]||''),result:String(r[mc['정비결과']]||''),note:String(r[mc['비고']]||''),completedDate:bus70ManagerDateKey_(r[mc['정비완료일']]),availableDate:bus70ManagerDateKey_(r[mc['운행가능일']])};});
  const ir=is.getDataRange().getDisplayValues(), ic=makeHeaderMap_(ir[0]);
  let incidents=ir.slice(1).map(function(r){const id=String(r[ic['incidentId']]||''), m=maintByIncident[id]||{}, requester=String(r[ic['요청자']]||r[ic['처리자']]||''), handler=String(r[ic['처리자']]||'');return {incidentId:id,receivedAt:String(r[ic['접수시간']]||''),date:normalizeDate_(r[ic['날짜']]),driverId:String(r[ic['기사ID']]||''),driverName:names[String(r[ic['기사ID']]||'')]||'',requesterId:requester,requesterName:names[requester]||requester,requesterRole:bus70RoleFor_(requester)||'DRIVER',vehicleId:String(r[ic['차량ID']]||''),sequence:Number(r[ic['순차']]||0),type:String(r[ic['유형']]||''),content:String(r[ic['내용']]||''),status:String(r[ic['상태']]||''),handler:handler,handlerName:names[handler]||handler,handlerRole:bus70RoleFor_(handler)||'DRIVER',closedAt:String(r[ic['종결시간']]||''),maintId:m.maintId||'',maintenanceStatus:m.status||'',reserveVehicleId:m.reserveVehicleId||'',result:m.result||'',maintenanceNote:m.note||'',completedDate:m.completedDate||'',availableDate:m.availableDate||''};}).filter(function(v){return v.incidentId;}).slice(-30).reverse();
  const vehicleMap={};vehicles.forEach(function(v){vehicleMap[v.id]=v;});
  incidents.slice().reverse().forEach(function(v){
    const original=vehicleMap[v.vehicleId], reserve=vehicleMap[v.reserveVehicleId];
    if(original){original.lastChangeReason=v.status==='종결'?'정비 완료'+(v.result?' · '+v.result:'')+(v.availableDate?' · '+v.availableDate+'부터 운행 가능':''):v.type+' · '+v.content;original.lastChangedAt=v.completedDate||v.closedAt||v.receivedAt;original.completedDate=v.completedDate||'';original.availableDate=v.availableDate||'';}
    if(reserve){reserve.lastChangeReason='예비차 투입 · '+v.content;reserve.lastChangedAt=v.receivedAt;}
  });
  if(ps&&ps.getLastRow()>1){
    const pr=ps.getDataRange().getDisplayValues(), pc=makeHeaderMap_(pr[0]);
    pr.slice(1).filter(function(r){return String(r[pc['상태']]||'')==='확정';}).sort(function(a,b){return normalizeDate_(a[pc['날짜']]).localeCompare(normalizeDate_(b[pc['날짜']]))||Number(a[pc['순차']]||0)-Number(b[pc['순차']]||0);}).forEach(function(r){const vehicle=vehicleMap[String(r[pc['차량ID']]||'')];if(vehicle)vehicle.assignment={date:normalizeDate_(r[pc['날짜']]),shift:String(r[pc['근무조']]||''),sequence:Number(r[pc['순차']]||0)};});
  }
  const viewerRole=bus70RoleFor_(requesterId);
  if(!viewerRole){
    const related={};
    if(ps&&ps.getLastRow()>1){const pr=ps.getDataRange().getDisplayValues(),pc=makeHeaderMap_(pr[0]);pr.slice(1).forEach(function(r){if(String(r[pc['기사ID']]||'')===requesterId&&String(r[pc['상태']]||'')==='확정')related[String(r[pc['차량ID']]||'')]=true;});}
    incidents=incidents.filter(function(v){return v.driverId===requesterId||related[v.vehicleId]||related[v.reserveVehicleId];});
    incidents.forEach(function(v){related[v.vehicleId]=true;if(v.reserveVehicleId)related[v.reserveVehicleId]=true;});
    vehicles=vehicles.filter(function(v){return related[v.id];});
  }
  vehicles.sort(function(a,b){return a.order-b.order||a.no.localeCompare(b.no);});
  let adjustments=[];
  if(gs&&gs.getLastRow()>1){const gr=gs.getDataRange().getDisplayValues(),gc=makeHeaderMap_(gr[0]);adjustments=gr.slice(1).map(function(r){return {gapId:String(r[gc['gapId']]||''),date:normalizeDate_(r[gc['날짜']]),sequence:Number(r[gc['순차']]||0),trip:Number(r[gc['탕']]||0),before:String(r[gc['기존시간']]||''),after:String(r[gc['조정시간']]||''),reason:String(r[gc['사유']]||'')};}).filter(function(v){return v.gapId;}).slice(-30).reverse();}
  return {ok:true,role:bus70RoleFor_(requesterId),vehicles:vehicles,incidents:incidents,adjustments:adjustments};
}
'@
$inc=@'
function bus70VehicleIncidentSave_(body, requesterId) {
  const requesterRole=bus70RoleFor_(requesterId), driverRequest=!requesterRole&&bus70IsKnownDriver_(requesterId);
  if(!bus70IsManager_(requesterId)&&requesterRole!=='CENTER'&&!driverRequest) return {ok:false,error:'REQUESTER_REQUIRED',message:'정비 요청은 기사·소장·정비소·마스터만 가능합니다.'};
  const date=normalizeDate_(body.date), vehicleId=String(body.vehicleId||'').trim(), reserveId=String(body.reserveVehicleId||'').trim(), type=String(body.type||'').trim(), content=String(body.content||'').trim(), sequence=Number(body.sequence||0);
  if(!date||!vehicleId||['정기점검','이상 증상','고장','사고','점검','운행불가','기타'].indexOf(type)===-1||!content) return {ok:false,error:'PARAM_REQUIRED',message:'날짜·차량·유형·상황 내용을 확인하세요.'};
  if(reserveId===vehicleId)return {ok:false,error:'SAME_VEHICLE',message:'예비차는 발생 차량과 달라야 합니다.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), vs=ss.getSheetByName('차량DB'), is=ss.getSheetByName('사건DB'), ms=ss.getSheetByName('정비DB'), ps=ss.getSheetByName('배차DB'), cs=ss.getSheetByName('배차확인DB');
  if(!vs||!is||!ms||!ps)return {ok:false,error:'DB_MISSING',message:'돌발상황 처리 DB를 찾을 수 없습니다.'};
  const vr=vs.getDataRange().getDisplayValues(), vc=makeHeaderMap_(vr[0]); let vehicleRow=0,reserveRow=0;
  for(let i=1;i<vr.length;i++){const id=String(vr[i][vc['vehicleId']]||'');if(id===vehicleId)vehicleRow=i+1;if(id===reserveId)reserveRow=i+1;}
  if(!vehicleRow||(reserveId&&!reserveRow))return {ok:false,error:'VEHICLE_NOT_FOUND',message:'발생 차량 또는 예비차를 확인하세요.'};
  if(reserveId&&['운행가능','운행'].indexOf(String(vr[reserveRow-1][vc['상태']]||''))===-1)return {ok:false,error:'RESERVE_UNAVAILABLE',message:'운행 가능한 예비차만 투입할 수 있습니다.'};
  let dispatchId='',driverId='';
  if(sequence){const pr=ps.getDataRange().getDisplayValues(),pc=makeHeaderMap_(pr[0]);let target=0,alreadyReplaced=false;for(let j=1;j<pr.length;j++){const assignedId=String(pr[j][pc['차량ID']]||'');if(normalizeDate_(pr[j][pc['날짜']])===date&&Number(pr[j][pc['순차']])===sequence&&(assignedId===vehicleId||(reserveId&&assignedId===reserveId))&&String(pr[j][pc['상태']]||'')==='확정'){target=j+1;alreadyReplaced=assignedId===reserveId;dispatchId=String(pr[j][pc['dispatchId']]||'');driverId=String(pr[j][pc['기사ID']]||'');break;}}if(!target)return {ok:false,error:'DISPATCH_NOT_FOUND',message:'선택 날짜·순차에서 발생 차량 또는 대체 차량의 확정 배차를 찾을 수 없습니다.'};if(driverRequest&&driverId!==requesterId)return {ok:false,error:'DRIVER_VEHICLE_MISMATCH',message:'본인에게 배차된 차량만 정비 요청할 수 있습니다.'};if(reserveId&&!alreadyReplaced){ps.getRange(target,pc['차량ID']+1).setValue(reserveId);ps.getRange(target,pc['확정시간']+1).setValue(new Date());ps.getRange(target,pc['비고']+1).setValue(type+' 대체차 투입');}if(reserveId&&cs&&cs.getLastRow()>1){const cr=cs.getDataRange().getDisplayValues(),cc=makeHeaderMap_(cr[0]);for(let k=1;k<cr.length;k++)if(String(cr[k][cc['dispatchId']]||'')===dispatchId)cs.getRange(k+1,cc['재확인필요']+1).setValue('Y');}}
  if(driverRequest&&!sequence){const pr=ps.getDataRange().getDisplayValues(),pc=makeHeaderMap_(pr[0]);for(let j=1;j<pr.length;j++)if(normalizeDate_(pr[j][pc['날짜']])===date&&String(pr[j][pc['기사ID']]||'')===requesterId&&String(pr[j][pc['차량ID']]||'')===vehicleId&&String(pr[j][pc['상태']]||'')==='확정'){driverId=requesterId;dispatchId=String(pr[j][pc['dispatchId']]||'');break;}if(!driverId)return {ok:false,error:'DRIVER_VEHICLE_MISMATCH',message:'선택 날짜에 본인에게 배차된 차량만 정비 요청할 수 있습니다.'};}
  if(['고장','사고','운행불가'].indexOf(type)!==-1)vs.getRange(vehicleRow,vc['상태']+1).setValue('정비중');
  bus70EnsureSheetColumns_(is,['요청자']);
  const incidentId=newId_('INC'), ir=is.getDataRange().getDisplayValues(),ic=makeHeaderMap_(ir[0]),irow=new Array(ir[0].length).fill('');
  irow[ic['incidentId']]=incidentId;irow[ic['접수시간']]=new Date();irow[ic['날짜']]=date;irow[ic['기사ID']]=driverId;irow[ic['차량ID']]=vehicleId;irow[ic['순차']]=sequence||'';irow[ic['유형']]=type;irow[ic['내용']]=content;irow[ic['상태']]='접수';irow[ic['요청자']]=requesterId;irow[ic['처리자']]=requesterId;irow[ic['비고']]=reserveId?'예비차 대체':'대체차 미정';is.appendRow(irow);
  const mr=ms.getDataRange().getDisplayValues(),mc=makeHeaderMap_(mr[0]),mrow=new Array(mr[0].length).fill('');mrow[mc['maintId']]=newId_('MNT');mrow[mc['incidentId']]=incidentId;mrow[mc['요청시간']]=new Date();mrow[mc['차량ID']]=vehicleId;mrow[mc['기사ID']]=driverId;mrow[mc['요청내용']]=content;mrow[mc['현재상태']]='접수';mrow[mc['예비차량ID']]=reserveId;ms.appendRow(mrow);
  writeAudit_(requesterId,requesterRole==='MASTER'?'마스터':requesterRole==='MANAGER'?'소장':requesterRole==='CENTER'?'정비소':'기사','사건DB',incidentId,'추가',{},irow,type+' 현장대응');
  return {ok:true,message:type+' 상황을 접수했습니다.'+(reserveId&&sequence?' '+sequence+'순차를 예비차로 변경했습니다.':'')};
}
'@
$mnt=@'
function bus70MaintenanceUpdate_(body, requesterId) {
  const role=bus70RoleFor_(requesterId);
  if(role!=='CENTER'&&role!=='MASTER')return {ok:false,error:'CENTER_REQUIRED',message:'정비 과정과 결과는 정비소 Center에서 처리합니다.'};
  const maintId=String(body.maintId||'').trim(), status=String(body.status||'').trim(), result=String(body.result||'').trim(), note=String(body.note||'').trim(), completedDate=bus70ManagerDateKey_(body.completedDate), availableDate=bus70ManagerDateKey_(body.availableDate);
  if(!maintId||['접수','정비중','완료','운행불가'].indexOf(status)===-1)return {ok:false,error:'PARAM_REQUIRED',message:'정비 건과 처리 상태를 확인하세요.'};
  if(status==='완료'&&(!completedDate||!availableDate||availableDate<completedDate))return {ok:false,error:'MAINTENANCE_DATES_REQUIRED',message:'정비 완료일과 운행 가능일을 확인하세요. 운행 가능일은 완료일보다 빠를 수 없습니다.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(),ms=ss.getSheetByName('정비DB'),hs=ss.getSheetByName('정비이력DB'),is=ss.getSheetByName('사건DB'),vs=ss.getSheetByName('차량DB');if(!ms||!hs||!is||!vs)return {ok:false,error:'DB_MISSING',message:'정비 처리 DB를 찾을 수 없습니다.'};
  bus70EnsureSheetColumns_(ms,['정비완료일','운행가능일']);
  const mr=ms.getDataRange().getDisplayValues(),mc=makeHeaderMap_(mr[0]);let rowNo=0;for(let i=1;i<mr.length;i++)if(String(mr[i][mc['maintId']]||'')===maintId){rowNo=i+1;break;}if(!rowNo)return {ok:false,error:'MAINT_NOT_FOUND',message:'정비 요청을 찾을 수 없습니다.'};
  const incidentId=String(mr[rowNo-1][mc['incidentId']]||''),vehicleId=String(mr[rowNo-1][mc['차량ID']]||'');ms.getRange(rowNo,mc['현재상태']+1).setValue(status);ms.getRange(rowNo,mc['정비결과']+1).setValue(result);ms.getRange(rowNo,mc['비고']+1).setValue(note);if(status==='정비중'&&!mr[rowNo-1][mc['입고시간']])ms.getRange(rowNo,mc['입고시간']+1).setValue(new Date());if(status==='완료'){ms.getRange(rowNo,mc['출고시간']+1).setValue(new Date());ms.getRange(rowNo,mc['정비완료일']+1).setValue(completedDate);ms.getRange(rowNo,mc['운행가능일']+1).setValue(availableDate);}
  const ir=is.getDataRange().getDisplayValues(),ic=makeHeaderMap_(ir[0]);for(let j=1;j<ir.length;j++)if(String(ir[j][ic['incidentId']]||'')===incidentId){is.getRange(j+1,ic['상태']+1).setValue(status==='완료'?'종결':status);is.getRange(j+1,ic['처리자']+1).setValue(requesterId);if(status==='완료')is.getRange(j+1,ic['종결시간']+1).setValue(new Date());break;}
  const vr=vs.getDataRange().getDisplayValues(),vc=makeHeaderMap_(vr[0]);for(let k=1;k<vr.length;k++)if(String(vr[k][vc['vehicleId']]||'')===vehicleId){vs.getRange(k+1,vc['상태']+1).setValue(status==='완료'?'운행가능':status==='운행불가'?'운행불가':'정비중');break;}
  const hr=hs.getDataRange().getDisplayValues(),hc=makeHeaderMap_(hr[0]),hrow=new Array(hr[0].length).fill('');hrow[hc['historyId']]=newId_('MNH');hrow[hc['maintId']]=maintId;hrow[hc['처리시간']]=new Date();hrow[hc['상태']]=status;hrow[hc['처리자']]=requesterId;hrow[hc['내용']]=result;hrow[hc['예비차량ID']]=String(mr[rowNo-1][mc['예비차량ID']]||'');hrow[hc['비고']]=note;hs.appendRow(hrow);
  return {ok:true,message:'정비 상태를 '+status+'로 저장했습니다.'+(status==='완료'?' '+availableDate+'부터 운행 가능합니다.':'')};
}
'@
$known=@'
function bus70IsKnownDriver_(driverId) {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기사DB');if(!sheet||sheet.getLastRow()<2)return false;
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]);
  for(let i=1;i<rows.length;i++)if(String(rows[i][c['driverId']]||'')===String(driverId||'')&&String(rows[i][c['상태']]||'')!=='퇴직')return true;
  return false;
}
'@
$required=@(".clasp.json","appsscript.json","Code.js","AuthStep9.js","BoardEntry.js","ManagerDispatch.js")
foreach($f0 in $required){if(-not(Test-Path $f0)){throw "필수 파일 없음: $f0"}}
$codeHash=(Get-FileHash ".\Code.js" -Algorithm SHA256).Hash
if((Get-Item ".\Code.js").Length-lt 70000){throw "Code.js 보호 검사 실패"}
$backup=Join-Path (Split-Path (Get-Location) -Parent) ("BUS70_BACKUP_"+(Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $backup -Force|Out-Null
Copy-Item -LiteralPath $required -Destination $backup -Force
Write-Host "백업 완료: $backup" -ForegroundColor Green
$p=(Resolve-Path ".\ManagerDispatch.js");$t=[IO.File]::ReadAllText($p)-replace"\r\n","\n"
$t=PutFunction $t "bus70OperationBootstrap_" $op
$t=PutFunction $t "bus70VehicleIncidentSave_" $inc
$t=PutFunction $t "bus70MaintenanceUpdate_" $mnt
if($t.Contains("function bus70IsKnownDriver_(")){$t=PutFunction $t "bus70IsKnownDriver_" $known}else{$a="function bus70EnsureSheetColumns_(";$q=$t.IndexOf($a);if($q-lt 0){throw "삽입 위치 없음"};$t=$t.Substring(0,$q)+$known+[Environment]::NewLine+[Environment]::NewLine+$t.Substring($q)}
$u=New-Object System.Text.UTF8Encoding($false);[IO.File]::WriteAllText($p,($t-replace"\n",[Environment]::NewLine),$u)
if((Get-FileHash ".\Code.js" -Algorithm SHA256).Hash-ne$codeHash){throw "Code.js 변경 감지"}
foreach($f0 in @("Code.js","AuthStep9.js","ManagerDispatch.js")){& node --check $f0;if($LASTEXITCODE-ne 0){throw "$f0 문법 오류"}}
Write-Host "함수 반영 및 문법 검사 통과" -ForegroundColor Green
if((Read-Host "운영 배포를 계속하려면 DEPLOY 입력")-cne"DEPLOY"){Write-Host "취소됨";exit}
& npx.cmd "@google/clasp" push --force;if($LASTEXITCODE-ne 0){throw "push 실패"}
$vout=(& npx.cmd "@google/clasp" version $Description 2>&1|Out-String);Write-Host $vout
$m=[regex]::Match($vout,"(?i)created\s+version\s+(\d+)");if(-not$m.Success){throw "버전 번호 확인 실패"};$v=[int]$m.Groups[1].Value
& npx.cmd "@google/clasp" deploy --deploymentId $DeploymentId --versionNumber $v --description $Description;if($LASTEXITCODE-ne 0){throw "deploy 실패"}
& npx.cmd "@google/clasp" deployments
Write-Host "BUS70 배포 완료: 버전 $v" -ForegroundColor Green