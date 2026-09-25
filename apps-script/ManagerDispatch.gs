/* BUS70 TEST - manager day dispatch editor.
 * Manager access is granted by 계정DB 권한(소장/관리자) or the
 * BUS70_MANAGER_DRIVER_IDS script property (comma-separated driver IDs). */

function bus70ManagerAction_(body, driverId) {
  // 기존 Code.js 최상위 허용 action을 유지하면서 새 관리 작업을 operation으로 전달한다.
  const action = String(body.operation || body.action || '').trim();
  if (action === 'operationBootstrap') return bus70OperationBootstrap_(driverId);
  if (action === 'vehicleIncidentSave') return bus70VehicleIncidentSave_(body, driverId);
  if (action === 'maintenanceUpdate') return bus70MaintenanceUpdate_(body, driverId);
  if (action === 'reserveVehicleUpsert') return bus70ReserveVehicleUpsert_(body, driverId);
  if (!bus70IsManager_(driverId)) {
    return {ok:false, error:'MANAGER_REQUIRED', message:'소장 권한이 필요합니다.'};
  }
  if (action === 'managerDispatchBootstrap') return bus70ManagerBootstrap_(body.date);
  if (action === 'saveManagerDispatchDay') return bus70SaveManagerDispatchDay_(body, driverId);
  if (action === 'managerAccountList') return bus70ManagerAccountList_(driverId);
  if (action === 'managerAccountUpsert') return bus70ManagerAccountUpsert_(body, driverId);
  if (action === 'masterAdminBootstrap') return bus70MasterAdminBootstrap_(driverId);
  if (action === 'masterStaffUpsert') return bus70MasterStaffUpsert_(body, driverId);
  if (action === 'masterDriverUpsert') return bus70MasterDriverUpsert_(body, driverId);
  if (action === 'workChangeSave') return bus70WorkChangeSave_(body, driverId);
  return {ok:false, error:'UNKNOWN_ACTION', message:'지원하지 않는 소장 요청입니다.'};
}

function bus70CanOperate_(driverId) {
  const role=bus70RoleFor_(driverId);
  return role==='MASTER'||role==='MANAGER'||role==='CENTER';
}

function bus70OperationBootstrap_(requesterId) {
  if(!bus70CanOperate_(requesterId)) return {ok:false,error:'STAFF_REQUIRED',message:'운영계정 권한이 필요합니다.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), vs=ss.getSheetByName('차량DB'), is=ss.getSheetByName('사건DB'), ms=ss.getSheetByName('정비DB'), ds=ss.getSheetByName('기사DB'), ps=ss.getSheetByName('배차DB');
  if(!vs||!is||!ms||!ds) return {ok:false,error:'DB_MISSING',message:'현장 대응 DB를 찾을 수 없습니다.'};
  const vr=vs.getDataRange().getDisplayValues(), vc=makeHeaderMap_(vr[0]);
  const vehicles=vr.slice(1).map(function(r){const no=String(r[vc['차량번호']]||'').replace(/\D/g,'');return {id:String(r[vc['vehicleId']]||''),no:no,displayNo:no.length===4?'경기71아'+no:no,type:String(r[vc['차량구분']]||''),status:String(r[vc['상태']]||''),route:String(r[vc['현재노선']]||''),note:String(r[vc['비고']]||''),order:Number(r[vc['표시순서']]||999),assignment:null,lastChangeReason:String(r[vc['비고']]||''),lastChangedAt:''};}).filter(function(v){return v.id;});
  const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]), names={};
  dr.slice(1).forEach(function(r){names[String(r[dc['driverId']]||'')]=String(r[dc['성명']]||'');});
  const mr=ms.getDataRange().getDisplayValues(), mc=makeHeaderMap_(mr[0]), maintByIncident={};
  mr.slice(1).forEach(function(r){const incidentId=String(r[mc['incidentId']]||'');if(incidentId)maintByIncident[incidentId]={maintId:String(r[mc['maintId']]||''),status:String(r[mc['현재상태']]||''),reserveVehicleId:String(r[mc['예비차량ID']]||''),result:String(r[mc['정비결과']]||''),note:String(r[mc['비고']]||'')};});
  const ir=is.getDataRange().getDisplayValues(), ic=makeHeaderMap_(ir[0]);
  const incidents=ir.slice(1).map(function(r){const id=String(r[ic['incidentId']]||''), m=maintByIncident[id]||{};return {incidentId:id,receivedAt:String(r[ic['접수시간']]||''),date:normalizeDate_(r[ic['날짜']]),driverId:String(r[ic['기사ID']]||''),driverName:names[String(r[ic['기사ID']]||'')]||'',vehicleId:String(r[ic['차량ID']]||''),sequence:Number(r[ic['순차']]||0),type:String(r[ic['유형']]||''),content:String(r[ic['내용']]||''),status:String(r[ic['상태']]||''),handler:String(r[ic['처리자']]||''),closedAt:String(r[ic['종결시간']]||''),maintId:m.maintId||'',maintenanceStatus:m.status||'',reserveVehicleId:m.reserveVehicleId||'',result:m.result||'',maintenanceNote:m.note||''};}).filter(function(v){return v.incidentId;}).slice(-30).reverse();
  const vehicleMap={};vehicles.forEach(function(v){vehicleMap[v.id]=v;});
  incidents.slice().reverse().forEach(function(v){
    const original=vehicleMap[v.vehicleId], reserve=vehicleMap[v.reserveVehicleId];
    if(original){original.lastChangeReason=v.status==='종결'?'정비 완료'+(v.result?' · '+v.result:''):v.type+' · '+v.content;original.lastChangedAt=v.closedAt||v.receivedAt;}
    if(reserve){reserve.lastChangeReason='예비차 투입 · '+v.content;reserve.lastChangedAt=v.receivedAt;}
  });
  if(ps&&ps.getLastRow()>1){
    const pr=ps.getDataRange().getDisplayValues(), pc=makeHeaderMap_(pr[0]);
    pr.slice(1).filter(function(r){return String(r[pc['상태']]||'')==='확정';}).sort(function(a,b){return normalizeDate_(a[pc['날짜']]).localeCompare(normalizeDate_(b[pc['날짜']]))||Number(a[pc['순차']]||0)-Number(b[pc['순차']]||0);}).forEach(function(r){const vehicle=vehicleMap[String(r[pc['차량ID']]||'')];if(vehicle)vehicle.assignment={date:normalizeDate_(r[pc['날짜']]),shift:String(r[pc['근무조']]||''),sequence:Number(r[pc['순차']]||0)};});
  }
  vehicles.sort(function(a,b){return a.order-b.order||a.no.localeCompare(b.no);});
  return {ok:true,role:bus70RoleFor_(requesterId),vehicles:vehicles,incidents:incidents};
}

function bus70ReserveVehicleUpsert_(body, requesterId) {
  if(!bus70IsManager_(requesterId)) return {ok:false,error:'MANAGER_REQUIRED',message:'차량 등록·수정은 소장 이상만 가능합니다.'};
  const vehicleId=String(body.vehicleId||'').trim(), no=String(body.vehicleNo||'').replace(/\D/g,''), type=String(body.vehicleType||body.type||'예비').trim(), route=String(body.route||'70').trim(), status=String(body.status||'운행가능').trim(), note=String(body.note||'').trim();
  if(!/^\d{4}$/.test(no)||!route||!['일반','예비'].includes(type)||['운행가능','운행','정비중','운행불가'].indexOf(status)===-1) return {ok:false,error:'PARAM_REQUIRED',message:'차량번호 4자리·구분·노선·상태를 확인하세요.'};
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('차량DB'); if(!sheet)return {ok:false,error:'DB_MISSING',message:'차량DB를 찾을 수 없습니다.'};
  const rows=sheet.getDataRange().getDisplayValues(), c=makeHeaderMap_(rows[0]); let rowNo=0, duplicateNo=0;
  for(let i=1;i<rows.length;i++){if(String(rows[i][c['vehicleId']]||'')===vehicleId)rowNo=i+1;if(String(rows[i][c['차량번호']]||'').replace(/\D/g,'')===no)duplicateNo=i+1;}
  if(vehicleId&&!rowNo)return {ok:false,error:'VEHICLE_NOT_FOUND',message:'수정할 차량을 찾을 수 없습니다.'};
  if(duplicateNo&&duplicateNo!==rowNo)return {ok:false,error:'VEHICLE_NO_DUPLICATE',message:'이미 등록된 차량번호입니다.'};
  const before=rowNo?rows[rowNo-1].slice():[], row=rowNo?before.slice():new Array(rows[0].length).fill('');
  row[c['vehicleId']]=rowNo?String(row[c['vehicleId']]||''):newId_('VEH'); row[c['차량번호']]=no; row[c['차량구분']]=type; row[c['상태']]=status; row[c['현재노선']]=route; row[c['표시순서']]=row[c['표시순서']]||999; row[c['비고']]=note||(type==='예비'?'예비차 등록':'일반차 등록');
  if(rowNo)sheet.getRange(rowNo,1,1,row.length).setValues([row]);else sheet.appendRow(row);
  writeAudit_(requesterId,bus70IsMaster_(requesterId)?'마스터':'소장','차량DB',row[c['vehicleId']],rowNo?'수정':'추가',before,row,'차량 등록·수정');
  return {ok:true,vehicleId:row[c['vehicleId']],message:(rowNo?'차량 정보를 수정했습니다. ':type+' 차량을 등록했습니다. ')+no};
}

function bus70VehicleIncidentSave_(body, requesterId) {
  if(!bus70IsManager_(requesterId)) return {ok:false,error:'MANAGER_REQUIRED',message:'돌발상황 접수는 소장 이상만 가능합니다.'};
  const date=normalizeDate_(body.date), vehicleId=String(body.vehicleId||'').trim(), reserveId=String(body.reserveVehicleId||'').trim(), type=String(body.type||'').trim(), content=String(body.content||'').trim(), sequence=Number(body.sequence||0);
  if(!date||!vehicleId||['고장','사고','점검','운행불가','기타'].indexOf(type)===-1||!content) return {ok:false,error:'PARAM_REQUIRED',message:'날짜·차량·유형·상황 내용을 확인하세요.'};
  if(reserveId===vehicleId)return {ok:false,error:'SAME_VEHICLE',message:'예비차는 발생 차량과 달라야 합니다.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), vs=ss.getSheetByName('차량DB'), is=ss.getSheetByName('사건DB'), ms=ss.getSheetByName('정비DB'), ps=ss.getSheetByName('배차DB'), cs=ss.getSheetByName('배차확인DB');
  if(!vs||!is||!ms||!ps)return {ok:false,error:'DB_MISSING',message:'돌발상황 처리 DB를 찾을 수 없습니다.'};
  const vr=vs.getDataRange().getDisplayValues(), vc=makeHeaderMap_(vr[0]); let vehicleRow=0,reserveRow=0;
  for(let i=1;i<vr.length;i++){const id=String(vr[i][vc['vehicleId']]||'');if(id===vehicleId)vehicleRow=i+1;if(id===reserveId)reserveRow=i+1;}
  if(!vehicleRow||(reserveId&&!reserveRow))return {ok:false,error:'VEHICLE_NOT_FOUND',message:'발생 차량 또는 예비차를 확인하세요.'};
  if(reserveId&&['운행가능','운행'].indexOf(String(vr[reserveRow-1][vc['상태']]||''))===-1)return {ok:false,error:'RESERVE_UNAVAILABLE',message:'운행 가능한 예비차만 투입할 수 있습니다.'};
  let dispatchId='',driverId='';
  if(sequence){const pr=ps.getDataRange().getDisplayValues(),pc=makeHeaderMap_(pr[0]);let target=0;for(let j=1;j<pr.length;j++){if(normalizeDate_(pr[j][pc['날짜']])===date&&Number(pr[j][pc['순차']])===sequence&&String(pr[j][pc['차량ID']]||'')===vehicleId&&String(pr[j][pc['상태']]||'')==='확정'){target=j+1;dispatchId=String(pr[j][pc['dispatchId']]||'');driverId=String(pr[j][pc['기사ID']]||'');break;}}if(!target)return {ok:false,error:'DISPATCH_NOT_FOUND',message:'선택 날짜·순차에서 해당 차량의 확정 배차를 찾을 수 없습니다.'};if(reserveId){ps.getRange(target,pc['차량ID']+1).setValue(reserveId);ps.getRange(target,pc['확정시간']+1).setValue(new Date());ps.getRange(target,pc['비고']+1).setValue(type+' 예비차 대체');if(cs&&cs.getLastRow()>1){const cr=cs.getDataRange().getDisplayValues(),cc=makeHeaderMap_(cr[0]);for(let k=1;k<cr.length;k++)if(String(cr[k][cc['dispatchId']]||'')===dispatchId)cs.getRange(k+1,cc['재확인필요']+1).setValue('Y');}}}
  vs.getRange(vehicleRow,vc['상태']+1).setValue('정비중');
  const incidentId=newId_('INC'), ir=is.getDataRange().getDisplayValues(),ic=makeHeaderMap_(ir[0]),irow=new Array(ir[0].length).fill('');
  irow[ic['incidentId']]=incidentId;irow[ic['접수시간']]=new Date();irow[ic['날짜']]=date;irow[ic['기사ID']]=driverId;irow[ic['차량ID']]=vehicleId;irow[ic['순차']]=sequence||'';irow[ic['유형']]=type;irow[ic['내용']]=content;irow[ic['상태']]='접수';irow[ic['처리자']]=requesterId;irow[ic['비고']]=reserveId?'예비차 대체':'대체차 미정';is.appendRow(irow);
  const mr=ms.getDataRange().getDisplayValues(),mc=makeHeaderMap_(mr[0]),mrow=new Array(mr[0].length).fill('');mrow[mc['maintId']]=newId_('MNT');mrow[mc['incidentId']]=incidentId;mrow[mc['요청시간']]=new Date();mrow[mc['차량ID']]=vehicleId;mrow[mc['기사ID']]=driverId;mrow[mc['요청내용']]=content;mrow[mc['현재상태']]='접수';mrow[mc['예비차량ID']]=reserveId;ms.appendRow(mrow);
  writeAudit_(requesterId,bus70IsMaster_(requesterId)?'마스터':'소장','사건DB',incidentId,'추가',{},irow,type+' 현장대응');
  return {ok:true,message:type+' 상황을 접수했습니다.'+(reserveId&&sequence?' '+sequence+'순차를 예비차로 변경했습니다.':'')};
}

function bus70MaintenanceUpdate_(body, requesterId) {
  if(!bus70CanOperate_(requesterId))return {ok:false,error:'STAFF_REQUIRED',message:'운영계정 권한이 필요합니다.'};
  const maintId=String(body.maintId||'').trim(), status=String(body.status||'').trim(), result=String(body.result||'').trim(), note=String(body.note||'').trim();
  if(!maintId||['접수','정비중','완료','운행불가'].indexOf(status)===-1)return {ok:false,error:'PARAM_REQUIRED',message:'정비 건과 처리 상태를 확인하세요.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(),ms=ss.getSheetByName('정비DB'),hs=ss.getSheetByName('정비이력DB'),is=ss.getSheetByName('사건DB'),vs=ss.getSheetByName('차량DB');if(!ms||!hs||!is||!vs)return {ok:false,error:'DB_MISSING',message:'정비 처리 DB를 찾을 수 없습니다.'};
  const mr=ms.getDataRange().getDisplayValues(),mc=makeHeaderMap_(mr[0]);let rowNo=0;for(let i=1;i<mr.length;i++)if(String(mr[i][mc['maintId']]||'')===maintId){rowNo=i+1;break;}if(!rowNo)return {ok:false,error:'MAINT_NOT_FOUND',message:'정비 요청을 찾을 수 없습니다.'};
  const incidentId=String(mr[rowNo-1][mc['incidentId']]||''),vehicleId=String(mr[rowNo-1][mc['차량ID']]||'');ms.getRange(rowNo,mc['현재상태']+1).setValue(status);ms.getRange(rowNo,mc['정비결과']+1).setValue(result);ms.getRange(rowNo,mc['비고']+1).setValue(note);if(status==='정비중'&&!mr[rowNo-1][mc['입고시간']])ms.getRange(rowNo,mc['입고시간']+1).setValue(new Date());if(status==='완료')ms.getRange(rowNo,mc['출고시간']+1).setValue(new Date());
  const ir=is.getDataRange().getDisplayValues(),ic=makeHeaderMap_(ir[0]);for(let j=1;j<ir.length;j++)if(String(ir[j][ic['incidentId']]||'')===incidentId){is.getRange(j+1,ic['상태']+1).setValue(status==='완료'?'종결':status);is.getRange(j+1,ic['처리자']+1).setValue(requesterId);if(status==='완료')is.getRange(j+1,ic['종결시간']+1).setValue(new Date());break;}
  const vr=vs.getDataRange().getDisplayValues(),vc=makeHeaderMap_(vr[0]);for(let k=1;k<vr.length;k++)if(String(vr[k][vc['vehicleId']]||'')===vehicleId){vs.getRange(k+1,vc['상태']+1).setValue(status==='완료'?'운행가능':status==='운행불가'?'운행불가':'정비중');break;}
  const hr=hs.getDataRange().getDisplayValues(),hc=makeHeaderMap_(hr[0]),hrow=new Array(hr[0].length).fill('');hrow[hc['historyId']]=newId_('MNH');hrow[hc['maintId']]=maintId;hrow[hc['처리시간']]=new Date();hrow[hc['상태']]=status;hrow[hc['처리자']]=requesterId;hrow[hc['내용']]=result;hrow[hc['예비차량ID']]=String(mr[rowNo-1][mc['예비차량ID']]||'');hrow[hc['비고']]=note;hs.appendRow(hrow);
  return {ok:true,message:'정비 상태를 '+status+'로 저장했습니다.'};
}

function bus70MasterAdminBootstrap_(requesterId) {
  if (!bus70IsManager_(requesterId)) return {ok:false,error:'MANAGER_REQUIRED',message:'소장 이상 권한이 필요합니다.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), ds=ss.getSheetByName('기사DB'), as=ss.getSheetByName('계정DB');
  if(!ds||!as) return {ok:false,error:'DB_MISSING',message:'기사DB 또는 계정DB를 찾을 수 없습니다.'};
  const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]);
  const drivers=dr.slice(1).map(function(r){return {driverId:String(r[dc['driverId']]||''),empId:String(r[dc['사원번호']]||''),name:String(r[dc['성명']]||''),shift:String(r[dc['근무조']]||''),driverType:String(r[dc['기사구분']]||''),route:String(r[dc['현재노선']]||''),status:String(r[dc['상태']]||''),test:String(r[dc['TEST']]||'')};})
    .filter(function(v){return v.driverId && ['ADM-MASTER-001','MGR-MAJOR-001','CTR-CENTER-001'].indexOf(v.driverId)===-1;});
  let accounts=[];
  if(bus70IsMaster_(requesterId)) {
    const ar=as.getDataRange().getDisplayValues(), ac=makeHeaderMap_(ar[0]);
    accounts=ar.slice(1).map(function(r){return {accountId:String(r[ac['accountId']]||''),role:String(r[ac['권한']]||''),driverId:String(r[ac['driverId']]||''),loginName:String(r[ac['로그인이름']]||''),enabled:String(r[ac['사용여부']]||'Y')};})
      .filter(function(v){return v.role==='소장'||v.role==='관리자'||v.role==='정비소';});
  }
  const ws=ss.getSheetByName('근무변경DB'), names={}; drivers.forEach(function(v){names[v.driverId]=v.name;});
  let workChanges=[];
  if(ws&&ws.getLastRow()>1){const wr=ws.getDataRange().getDisplayValues(), wc=makeHeaderMap_(wr[0]); workChanges=wr.slice(1).map(function(r){return {changeId:String(r[wc['changeId']]||''),date:normalizeDate_(r[wc['날짜']]),driverId:String(r[wc['기사ID']]||''),driverName:names[String(r[wc['기사ID']]||'')]||'',type:String(r[wc['유형']]||''),sequence:Number(r[wc['적용순차']]||0),replacementId:String(r[wc['대체기사ID']]||''),replacementName:names[String(r[wc['대체기사ID']]||'')]||'',reason:String(r[wc['사유']]||'')};}).filter(function(v){return v.changeId;}).slice(-20).reverse();}
  return {ok:true,drivers:drivers,accounts:accounts,workChanges:workChanges,canManageAccounts:bus70IsMaster_(requesterId)};
}

function bus70WorkChangeSave_(body, requesterId) {
  if(!bus70IsManager_(requesterId)) return {ok:false,error:'MANAGER_REQUIRED',message:'소장 이상 권한이 필요합니다.'};
  const date=normalizeDate_(body.date), driverId=String(body.driverId||'').trim(), type=String(body.type||'').trim();
  const sequence=Number(body.sequence||0), replacementId=String(body.replacementId||'').trim(), reason=String(body.reason||'').trim();
  if(!date||!driverId||['휴무','병가','지각','조퇴','결근','퇴직','복귀','기타'].indexOf(type)===-1) return {ok:false,error:'PARAM_REQUIRED',message:'날짜·기사·발생유형을 확인하세요.'};
  if(replacementId===driverId) return {ok:false,error:'SAME_DRIVER',message:'대체기사는 기존 기사와 달라야 합니다.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), ds=ss.getSheetByName('기사DB'), ws=ss.getSheetByName('근무변경DB'), ps=ss.getSheetByName('배차DB'), cs=ss.getSheetByName('배차확인DB');
  if(!ds||!ws||!ps) return {ok:false,error:'DB_MISSING',message:'근무변경 처리 DB를 찾을 수 없습니다.'};
  const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]); let driverRow=0, replacementRow=0;
  for(let i=1;i<dr.length;i++){const id=String(dr[i][dc['driverId']]||''); if(id===driverId)driverRow=i+1; if(id===replacementId)replacementRow=i+1;}
  if(!driverRow||(replacementId&&!replacementRow)) return {ok:false,error:'DRIVER_NOT_FOUND',message:'기사 정보를 확인하세요.'};
  if(replacementId&&String(dr[replacementRow-1][dc['상태']]||'')!=='재직') return {ok:false,error:'REPLACEMENT_UNAVAILABLE',message:'재직 중인 기사만 대체 투입할 수 있습니다.'};
  const driverShift=String(dr[driverRow-1][dc['근무조']]||'').trim(), driverRoute=String(dr[driverRow-1][dc['현재노선']]||'').trim();
  const replacementShift=replacementId?String(dr[replacementRow-1][dc['근무조']]||'').trim():'', replacementRoute=replacementId?String(dr[replacementRow-1][dc['현재노선']]||'').trim():'';
  if(replacementId&&(replacementShift!==driverShift||replacementRoute!==driverRoute)&&!reason) return {ok:false,error:'REPLACEMENT_OVERRIDE_REASON_REQUIRED',message:'다른 조 또는 다른 노선 기사를 투입할 때는 사유·현장 메모를 입력하세요.'};
  let dispatchChanged=false, dispatchId='';
  if(sequence||replacementId){
    if(!sequence||!replacementId) return {ok:false,error:'REPLACEMENT_INCOMPLETE',message:'대체 투입 시 순차와 대체기사를 모두 선택하세요.'};
    const pr=ps.getDataRange().getDisplayValues(), pc=makeHeaderMap_(pr[0]); let target=0;
    for(let j=1;j<pr.length;j++){
      if(normalizeDate_(pr[j][pc['날짜']])!==date||Number(pr[j][pc['순차']])!==sequence||String(pr[j][pc['상태']]||'')!=='확정') continue;
      if(String(pr[j][pc['기사ID']]||'')!==driverId) return {ok:false,error:'DISPATCH_DRIVER_MISMATCH',message:'선택 순차의 현재 기사가 다릅니다.'};
      target=j+1; dispatchId=String(pr[j][pc['dispatchId']]||''); break;
    }
    if(!target) return {ok:false,error:'DISPATCH_NOT_FOUND',message:'선택 날짜·순차의 확정 배차를 찾을 수 없습니다.'};
    for(let j=1;j<pr.length;j++) if(normalizeDate_(pr[j][pc['날짜']])===date&&String(pr[j][pc['기사ID']]||'')===replacementId&&Number(pr[j][pc['순차']])!==sequence&&String(pr[j][pc['상태']]||'')==='확정') return {ok:false,error:'REPLACEMENT_DUPLICATE',message:'대체기사가 같은 날짜 다른 순차에 이미 배정되었습니다.'};
    ps.getRange(target,pc['기사ID']+1).setValue(replacementId); ps.getRange(target,pc['확정시간']+1).setValue(new Date()); ps.getRange(target,pc['비고']+1).setValue(type+' 대체투입'); dispatchChanged=true;
    if(cs&&cs.getLastRow()>1){const cr=cs.getDataRange().getDisplayValues(), cc=makeHeaderMap_(cr[0]); for(let k=1;k<cr.length;k++) if(String(cr[k][cc['dispatchId']]||'')===dispatchId) cs.getRange(k+1,cc['재확인필요']+1).setValue('Y');}
  }
  if(type==='퇴직'||type==='복귀'){const row=dr[driverRow-1].slice(); row[dc['상태']]=type==='퇴직'?'퇴직':'재직'; if(type==='퇴직')row[dc['종료일']]=date; ds.getRange(driverRow,1,1,row.length).setValues([row]);}
  const wr=ws.getDataRange().getDisplayValues(), wc=makeHeaderMap_(wr[0]), row=new Array(wr[0].length).fill('');
  row[wc['changeId']]=newId_('WORK'); row[wc['날짜']]=date; row[wc['기사ID']]=driverId; row[wc['유형']]=type; row[wc['적용순차']]=sequence||''; row[wc['대체기사ID']]=replacementId; row[wc['시작시간']]=String(body.startTime||''); row[wc['종료시간']]=String(body.endTime||''); row[wc['사유']]=reason; row[wc['처리자']]=requesterId; row[wc['처리시간']]=new Date(); ws.appendRow(row);
  writeAudit_(requesterId,bus70IsMaster_(requesterId)?'마스터':'소장','근무변경DB',row[wc['changeId']],'추가',{},row,type+' 현장대응');
  return {ok:true,message:type+' 처리를 저장했습니다.'+(dispatchChanged?' '+sequence+'순차 대체기사 배차도 변경했습니다.':'')};
}

function bus70MasterStaffUpsert_(body, requesterId) {
  if (!bus70IsMaster_(requesterId)) return {ok:false,error:'MASTER_REQUIRED',message:'마스터 권한이 필요합니다.'};
  const role=String(body.role||''), loginName=String(body.loginName||'').trim(), password=String(body.password||''), enabled=body.enabled===false?'N':'Y';
  if(['소장','정비소'].indexOf(role)===-1||!loginName) return {ok:false,error:'PARAM_REQUIRED',message:'권한과 계정명을 확인하세요.'};
  const ss=SpreadsheetApp.getActiveSpreadsheet(), ds=ss.getSheetByName('기사DB'), as=ss.getSheetByName('계정DB');
  if(!ds||!as) return {ok:false,error:'DB_MISSING',message:'기사DB 또는 계정DB를 찾을 수 없습니다.'};
  const driverId=String(body.driverId||((role==='정비소'?'CTR-':'MGR-')+Utilities.getUuid().slice(0,8))).trim();
  const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]); let driverRow=0;
  for(let i=1;i<dr.length;i++) if(String(dr[i][dc['driverId']]||'')===driverId){driverRow=i+1;break;}
  const drow=driverRow?dr[driverRow-1].slice():new Array(dr[0].length).fill('');
  drow[dc['driverId']]=driverId; drow[dc['사원번호']]=role==='정비소'?'800000':'700000'; drow[dc['성명']]=loginName; drow[dc['기사구분']]=role==='정비소'?'정비':'관리'; drow[dc['현재노선']]='70'; drow[dc['표시순서']]=999; drow[dc['상태']]=enabled==='Y'?'재직':'종료'; drow[dc['TEST']]='Y'; drow[dc['비고']]='마스터 운영계정 관리';
  if(driverRow) ds.getRange(driverRow,1,1,drow.length).setValues([drow]); else ds.appendRow(drow);
  const ar=as.getDataRange().getDisplayValues(), ac=makeHeaderMap_(ar[0]); let accountRow=0;
  for(let j=1;j<ar.length;j++) if(String(ar[j][ac['driverId']]||'')===driverId){accountRow=j+1;break;}
  if(!accountRow && password.length<5) return {ok:false,error:'PASSWORD_REQUIRED',message:'새 계정 비밀번호를 5자 이상 입력하세요.'};
  const arow=accountRow?ar[accountRow-1].slice():new Array(ar[0].length).fill('');
  arow[ac['accountId']]=accountRow?String(ar[accountRow-1][ac['accountId']]||''):newId_('ACC'); arow[ac['권한']]=role; arow[ac['driverId']]=driverId; arow[ac['로그인이름']]=loginName; arow[ac['로그인사번']]=''; arow[ac['사용여부']]=enabled; arow[ac['비고']]='마스터 계정관리';
  if(password){ if(password.length<5||password.length>20) return {ok:false,error:'PASSWORD_FORMAT',message:'비밀번호는 5~20자로 입력하세요.'}; arow[ac['비밀번호해시']]=bus70PasswordHash_(password); arow[ac['비밀번호변경시간']]=new Date(); }
  if(accountRow) as.getRange(accountRow,1,1,arow.length).setValues([arow]); else as.appendRow(arow);
  writeAudit_(requesterId,'마스터','계정DB',arow[ac['accountId']],accountRow?'수정':'추가',{},arow,'운영계정 관리');
  return {ok:true,message:role+' 계정을 저장했습니다.'};
}

function bus70MasterDriverUpsert_(body, requesterId) {
  if (!bus70IsManager_(requesterId)) return {ok:false,error:'MANAGER_REQUIRED',message:'소장 이상 권한이 필요합니다.'};
  let driverId=String(body.driverId||'').trim(); const empId=String(body.empId||'').replace(/\D/g,''), name=String(body.name||'').trim(), shift=String(body.shift||'').toUpperCase(), route=String(body.route||'70').trim(), driverType=String(body.driverType||'').trim(), status=String(body.status||'').trim();
  if(!/^\d{6}$/.test(empId)||!name||!route||route.length>10||['A','B'].indexOf(shift)===-1||['양성','예비','노선'].indexOf(driverType)===-1||['재직','휴무','병가','퇴직'].indexOf(status)===-1) return {ok:false,error:'PARAM_REQUIRED',message:'기사 정보를 모두 확인하세요.'};
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기사DB');
  if(!sheet) return {ok:false,error:'DB_MISSING',message:'기사DB를 찾을 수 없습니다.'};
  const rows=sheet.getDataRange().getDisplayValues(), c=makeHeaderMap_(rows[0]); let rowNo=0;
  for(let i=1;i<rows.length;i++) if(String(rows[i][c['driverId']]||'')===driverId){rowNo=i+1;break;}
  if(driverId&&!rowNo) return {ok:false,error:'DRIVER_NOT_FOUND',message:'수정할 기사를 찾을 수 없습니다.'};
  for(let j=1;j<rows.length;j++) if(j+1!==rowNo&&String(rows[j][c['사원번호']]||'')===empId) return {ok:false,error:'EMP_ID_DUPLICATE',message:'이미 사용 중인 사원번호입니다.'};
  const before=rowNo?rows[rowNo-1].slice():[], row=rowNo?before.slice():new Array(rows[0].length).fill('');
  if(!driverId)driverId=newId_('DRV');
  row[c['driverId']]=driverId; row[c['사원번호']]=empId; row[c['성명']]=name; row[c['근무조']]=shift; row[c['기사구분']]=driverType; row[c['사번구분']]='정규'; row[c['현재노선']]=route; row[c['표시순서']]=row[c['표시순서']]||999; row[c['상태']]=status; row[c['TEST']]='N'; row[c['비고']]=rowNo?'기사정보 수정':'신규 기사 등록';
  if(rowNo)sheet.getRange(rowNo,1,1,row.length).setValues([row]);else sheet.appendRow(row);
  writeAudit_(requesterId,bus70IsMaster_(requesterId)?'마스터':'소장','기사DB',driverId,rowNo?'수정':'추가',before,row,'기사 등록·수정');
  return {ok:true,driverId:driverId,message:name+' 기사 정보를 '+(rowNo?'수정':'등록')+'했습니다.'};
}

function bus70IsManager_(driverId) {
  const role = bus70RoleFor_(driverId);
  return role === 'MASTER' || role === 'MANAGER';
}

function bus70IsMaster_(driverId) {
  return bus70RoleFor_(driverId) === 'MASTER';
}

function bus70RoleFor_(driverId) {
  const id = String(driverId || '').trim();
  if (!id) return '';
  // 박철완 기사는 현장 기사 계정이며 운영계정 권한을 겸하지 않는다.
  // 이전 시험 데이터에 남은 마스터 행이 있어도 기사 권한으로 고정한다.
  if (id === 'DRV-B-TEST-002') return '';
  const configured = String(PropertiesService.getScriptProperties().getProperty('BUS70_MANAGER_DRIVER_IDS') || '')
    .split(',').map(function (v) { return v.trim(); }).filter(Boolean);
  if (configured.indexOf(id) !== -1) return 'MANAGER';
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('계정DB');
  if (!sheet || sheet.getLastRow() < 2) return '';
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][c['driverId']] || '').trim() !== id) continue;
    const role = String(rows[i][c['권한']] || '').trim();
    const enabled = String(rows[i][c['사용여부']] || '').trim();
    if (enabled === 'N') return '';
    if (role === '마스터') return 'MASTER';
    if (role === '소장' || role === '관리자') return 'MANAGER';
    if (role === '정비소') return 'CENTER';
    return '';
  }
  return '';
}

function bus70EnsureInitialAccounts_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('BUS70_ROLE_ACCOUNTS_V3') === 'Y') return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const driverSheet = ss.getSheetByName('기사DB');
  const accountSheet = ss.getSheetByName('계정DB');
  if (!driverSheet || !accountSheet) return;
  const driverRows = driverSheet.getDataRange().getDisplayValues();
  const dc = makeHeaderMap_(driverRows[0]);
  function addPrincipal(driverId, loginName, loginCode, driverType, note) {
    if (driverRows.slice(1).some(function (r) { return String(r[dc['driverId']] || '').trim() === driverId; })) return;
    driverSheet.appendRow([driverId,loginCode,loginName,'',driverType,'계정','','70',999,'재직','','','Y',note]);
  }
  addPrincipal('ADM-MASTER-001','Master','90000','마스터','마스터 전용 계정');
  addPrincipal('MGR-MAJOR-001','Major','700000','관리','소장 전용 계정');
  addPrincipal('CTR-CENTER-001','Center','800000','정비','정비소 전용 계정');
  let accountRows = accountSheet.getDataRange().getDisplayValues();
  const headers = accountRows[0], required = ['비밀번호해시','비밀번호변경시간'];
  required.forEach(function (header) { if (headers.indexOf(header) === -1) { headers.push(header); accountSheet.getRange(1,headers.length).setValue(header); } });
  accountRows = accountSheet.getDataRange().getDisplayValues();
  const ac = makeHeaderMap_(accountRows[0]);
  // STEP 9 시험 때 박철완 기사에 임시 부여했던 마스터 권한을 제거한다.
  for (let i=1;i<accountRows.length;i++) {
    if (String(accountRows[i][ac['driverId']]||'').trim() !== 'DRV-B-TEST-002') continue;
    if (String(accountRows[i][ac['권한']]||'').trim() !== '마스터') continue;
    accountSheet.getRange(i+1,ac['권한']+1).setValue('기사');
  }
  function upsertAccount(accountId, role, targetDriverId, loginName, initialPassword, note) {
    let rowNo = 0;
    for (let i=1;i<accountRows.length;i++) if (String(accountRows[i][ac['driverId']]||'').trim()===targetDriverId) { rowNo=i+1; break; }
    const hash = bus70PasswordHash_(initialPassword);
    if (rowNo) {
      const row = accountRows[rowNo-1].slice();
      row[ac['권한']]=role; row[ac['로그인이름']]=loginName; row[ac['로그인사번']]=''; row[ac['사용여부']]='Y';
      if (!String(row[ac['비밀번호해시']]||'')) { row[ac['비밀번호해시']]=hash; row[ac['비밀번호변경시간']]=new Date(); }
      accountSheet.getRange(rowNo,1,1,accountRows[0].length).setValues([row]);
    } else {
      const row = new Array(accountRows[0].length).fill('');
      row[ac['accountId']]=accountId; row[ac['권한']]=role; row[ac['driverId']]=targetDriverId; row[ac['로그인이름']]=loginName;
      row[ac['사용여부']]='Y'; row[ac['비밀번호해시']]=hash; row[ac['비밀번호변경시간']]=new Date(); row[ac['비고']]=note;
      accountSheet.appendRow(row);
    }
  }
  upsertAccount('ACC-MASTER-001','마스터','ADM-MASTER-001','Master','90000','마스터 전용 계정');
  upsertAccount('ACC-MANAGER-001','소장','MGR-MAJOR-001','Major','700000','소장 전용 계정');
  upsertAccount('ACC-CENTER-001','정비소','CTR-CENTER-001','Center','800000','정비소 전용 계정');
  props.setProperty('BUS70_ROLE_ACCOUNTS_V3','Y');
}

function bus70PasswordHash_(password) {
  const props = PropertiesService.getScriptProperties();
  let salt = props.getProperty('BUS70_PASSWORD_SALT');
  if (!salt) { salt = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('BUS70_PASSWORD_SALT',salt); }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,salt+'|'+String(password||''))
    .map(function (b) { return ('0'+(b&255).toString(16)).slice(-2); }).join('');
}

function bus70StaffLogin_(name, password) {
  name=String(name||'').trim(); password=String(password||'');
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('계정DB');
  if(!sheet||sheet.getLastRow()<2) return {ok:false,error:'STAFF_NOT_FOUND'};
  const rows=sheet.getDataRange().getDisplayValues(), c=makeHeaderMap_(rows[0]);
  for(let i=1;i<rows.length;i++) {
    if(String(rows[i][c['로그인이름']]||'').trim()!==name) continue;
    const role=String(rows[i][c['권한']]||'').trim();
    if(['마스터','소장','관리자','정비소'].indexOf(role)===-1) return {ok:false,error:'STAFF_NOT_FOUND'};
    if(String(rows[i][c['사용여부']]||'').trim()==='N') return {ok:false,error:'ACCOUNT_DISABLED',message:'사용 중지된 계정입니다.'};
    if(String(rows[i][c['비밀번호해시']]||'')!==bus70PasswordHash_(password)) return {ok:false,error:'LOGIN_FAILED',message:'계정명 또는 비밀번호가 일치하지 않습니다.'};
    const result=apiGetDriver_(String(rows[i][c['driverId']]||'').trim());
    if(!result.ok) return {ok:false,error:'ACCOUNT_PRINCIPAL_MISSING',message:'계정 정보를 확인할 수 없습니다.'};
    return {ok:true,message:'로그인 성공',driver:result.driver};
  }
  return {ok:false,error:'STAFF_NOT_FOUND'};
}

function bus70ChangeStaffPassword_(body, driverId) {
  const role=bus70RoleFor_(driverId);
  if(!role) return {ok:false,error:'STAFF_REQUIRED',message:'운영 계정만 비밀번호를 변경할 수 있습니다.'};
  const current=String(body.currentPassword||''), next=String(body.newPassword||'');
  if(next.length<5||next.length>20) return {ok:false,error:'PASSWORD_FORMAT',message:'새 비밀번호는 5~20자로 입력하세요.'};
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('계정DB');
  const rows=sheet.getDataRange().getDisplayValues(), c=makeHeaderMap_(rows[0]);
  for(let i=1;i<rows.length;i++) if(String(rows[i][c['driverId']]||'').trim()===driverId) {
    if(String(rows[i][c['비밀번호해시']]||'')!==bus70PasswordHash_(current)) return {ok:false,error:'PASSWORD_MISMATCH',message:'현재 비밀번호가 일치하지 않습니다.'};
    sheet.getRange(i+1,c['비밀번호해시']+1).setValue(bus70PasswordHash_(next));
    sheet.getRange(i+1,c['비밀번호변경시간']+1).setValue(new Date());
    return {ok:true,message:'비밀번호를 변경했습니다. 다음 로그인부터 새 비밀번호를 사용하세요.'};
  }
  return {ok:false,error:'ACCOUNT_NOT_FOUND',message:'계정을 찾을 수 없습니다.'};
}

function bus70ManagerAccountList_(requesterId) {
  if (!bus70IsMaster_(requesterId)) return {ok:false,error:'MASTER_REQUIRED',message:'마스터 권한이 필요합니다.'};
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('계정DB');
  if (!sheet) return {ok:false,error:'DB_MISSING',message:'계정DB를 찾을 수 없습니다.'};
  const rows = sheet.getDataRange().getDisplayValues(), c = makeHeaderMap_(rows[0]);
  const accounts = rows.slice(1).map(function (r) { return {accountId:String(r[c['accountId']]||''),role:String(r[c['권한']]||''),
    driverId:String(r[c['driverId']]||''),name:String(r[c['로그인이름']]||''),empId:String(r[c['로그인사번']]||''),enabled:String(r[c['사용여부']]||'')}; });
  return {ok:true,accounts:accounts};
}

function bus70ManagerAccountUpsert_(body, requesterId) {
  if (!bus70IsMaster_(requesterId)) return {ok:false,error:'MASTER_REQUIRED',message:'마스터 권한이 필요합니다.'};
  const role = String(body.role || '').trim(), name = String(body.name || '').trim(), empId = String(body.empId || '').replace(/\D/g,'');
  const enabled = body.enabled === false ? 'N' : 'Y';
  if ((role !== '소장' && role !== '관리자') || !name || !/^\d{6}$/.test(empId)) {
    return {ok:false,error:'PARAM_REQUIRED',message:'소장 이름과 6자리 사원번호를 확인하세요.'};
  }
  const ss=SpreadsheetApp.getActiveSpreadsheet(), ds=ss.getSheetByName('기사DB'), as=ss.getSheetByName('계정DB');
  if(!ds||!as) return {ok:false,error:'DB_MISSING',message:'기사DB 또는 계정DB를 찾을 수 없습니다.'};
  const driverId=String(body.driverId||('MGR-'+empId)).trim();
  const dr=ds.getDataRange().getDisplayValues(), dc=makeHeaderMap_(dr[0]); let driverRow=0;
  for(let i=1;i<dr.length;i++) if(String(dr[i][dc['driverId']]||'').trim()===driverId){driverRow=i+1;break;}
  const driverValues=[driverId,empId,name,'','관리','계정','','70',999,enabled==='Y'?'재직':'종료','','','Y','소장 계정'];
  if(driverRow) ds.getRange(driverRow,1,1,driverValues.length).setValues([driverValues]); else ds.appendRow(driverValues);
  const ar=as.getDataRange().getDisplayValues(), ac=makeHeaderMap_(ar[0]); let accountRow=0;
  for(let j=1;j<ar.length;j++) if(String(ar[j][ac['driverId']]||'').trim()===driverId){accountRow=j+1;break;}
  const accountId=accountRow?String(ar[accountRow-1][ac['accountId']]||''):newId_('ACC');
  const accountValues=[accountId,role,driverId,name,empId,enabled,new Date(),'마스터 계정관리'];
  if(accountRow) as.getRange(accountRow,1,1,accountValues.length).setValues([accountValues]); else as.appendRow(accountValues);
  writeAudit_(requesterId,'마스터','계정DB',accountId,accountRow?'수정':'추가',{},accountValues,'소장 계정 관리');
  return {ok:true,message:'소장 계정을 저장했습니다.',account:{accountId:accountId,role:role,driverId:driverId,name:name,empId:empId,enabled:enabled}};
}

function bus70ManagerBootstrap_(rawDate) {
  const date = normalizeDate_(rawDate);
  if (!date) return {ok:false, error:'DATE_REQUIRED', message:'운행 날짜를 선택하세요.'};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const driverSheet = ss.getSheetByName('기사DB');
  const vehicleSheet = ss.getSheetByName('차량DB');
  const dispatchSheet = ss.getSheetByName('배차DB');
  const confirmSheet = ss.getSheetByName('배차확인DB');
  const scheduleSheet = ss.getSheetByName('스케줄');
  if (!driverSheet || !vehicleSheet || !dispatchSheet || !scheduleSheet) {
    return {ok:false, error:'DB_MISSING', message:'배차 편집에 필요한 DB를 찾을 수 없습니다.'};
  }
  bus70EnsureBoardTestDrivers_(driverSheet);
  const drivers = bus70ManagerMasterRows_(driverSheet, 'driver');
  const vehicles = bus70ManagerMasterRows_(vehicleSheet, 'vehicle');
  const scheduleVersion = bus70ScheduleVersionForDate_(date);
  const departures = bus70ManagerDepartures_(scheduleSheet, scheduleVersion);
  const assignments = bus70ManagerAssignments_(dispatchSheet, date);
  const confirmed = confirmSheet ? bus70ManagerConfirmations_(confirmSheet, date) : {};
  assignments.forEach(function (item) {
    item.confirmed = Boolean(confirmed[item.dispatchId]);
    item.confirmedAt = confirmed[item.dispatchId] || '';
  });
  return {ok:true, date:date, scheduleVersion:scheduleVersion, drivers:drivers,
    vehicles:vehicles, departures:departures, assignments:assignments};
}

function bus70EnsureBoardTestDrivers_(sheet) {
  const candidates = [
    ['790001','이재천'], ['790002','양인모'], ['790003','이성준'],
    ['790004','노성진'], ['790005','김호'], ['790006','권경율'],
    ['790007','강호익'], ['790008','김춘식'], ['790009','천승준'],
    ['790010','이응주']
  ];
  const rows = sheet.getDataRange().getDisplayValues();
  if (!rows.length) return;
  const c = makeHeaderMap_(rows[0]);
  const knownNames = {};
  const knownEmpIds = {};
  for (let i = 1; i < rows.length; i++) {
    knownNames[String(rows[i][c['성명']] || '').replace(/\s/g, '')] = true;
    knownEmpIds[String(rows[i][c['사원번호']] || '').trim()] = true;
  }
  candidates.forEach(function (candidate, index) {
    const empId = candidate[0], name = candidate[1];
    if (knownNames[name.replace(/\s/g, '')] || knownEmpIds[empId]) return;
    sheet.appendRow([
      'DRV-B-OCR-' + ('00' + (index + 1)).slice(-3), empId, name, 'B', '노선',
      '임시', '', '70', 900 + index, '재직', '', '', 'Y', '배차상황판 OCR 테스트용 임시기사'
    ]);
  });
}

function bus70ManagerMasterRows_(sheet, type) {
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const route = String(rows[i][c['현재노선']] || '').trim();
    const status = String(rows[i][c['상태']] || '').trim();
    if (type === 'driver') {
      if (status !== '재직' && status !== '1') continue;
      result.push({id:String(rows[i][c['driverId']] || '').trim(), name:String(rows[i][c['성명']] || '').trim(),
        shift:String(rows[i][c['근무조']] || '').trim(), route:route,
        driverType:String(rows[i][c['기사구분']] || '').trim()});
    } else {
      if (route && route !== '70') continue;
      if (status !== '운행가능' && status !== '운행') continue;
      const no = String(rows[i][c['차량번호']] || '').replace(/\D/g, '');
      result.push({id:String(rows[i][c['vehicleId']] || '').trim(), no:no, last3:no.slice(-3),
        displayNo:no.length === 4 ? '경기71아' + no : no});
    }
  }
  return result.filter(function (v) { return v.id; });
}

function bus70ManagerDepartures_(sheet, version) {
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  const result = {};
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][c['버전']] || '').trim() !== version || String(rows[i][c['상태']] || '').trim() === '중지') continue;
    const seq = Number(rows[i][c['순차']]);
    if (!Number.isInteger(seq) || result[seq]) continue;
    const startTime = String(rows[i][c['발차시간']] || '').trim();
    const turnTime = String(rows[i][c['회차시간']] || '').trim();
    result[seq] = startTime ? {time:startTime, place:String(rows[i][c['발차지']] || '').trim()} :
      {time:turnTime, place:String(rows[i][c['회차지']] || '').trim()};
  }
  return result;
}

function bus70ManagerAssignments_(sheet, date) {
  const rows = sheet.getDataRange().getDisplayValues();
  const c = makeHeaderMap_(rows[0]);
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    if (normalizeDate_(rows[i][c['날짜']]) !== date || String(rows[i][c['상태']] || '').trim() !== '확정') continue;
    result.push({dispatchId:String(rows[i][c['dispatchId']] || '').trim(), sequence:Number(rows[i][c['순차']]), driverId:String(rows[i][c['기사ID']] || '').trim(),
      vehicleId:String(rows[i][c['차량ID']] || '').trim(), shift:String(rows[i][c['근무조']] || '').trim()});
  }
  return result;
}

function bus70ManagerConfirmations_(sheet, date) {
  const rows = sheet.getDataRange().getDisplayValues();
  if (!rows.length) return {};
  const c = makeHeaderMap_(rows[0]), result = {};
  for (let i = 1; i < rows.length; i++) {
    if (normalizeDate_(rows[i][c['날짜']]) !== date) continue;
    if (String(rows[i][c['재확인필요']] || '').trim() === 'Y') continue;
    const dispatchId = String(rows[i][c['dispatchId']] || '').trim();
    if (dispatchId) result[dispatchId] = String(rows[i][c['확인시간']] || '').trim();
  }
  return result;
}

function bus70SaveManagerDispatchDay_(body, managerId) {
  const date = normalizeDate_(body.date);
  const shift = String(body.shift || '').trim().toUpperCase();
  const input = Array.isArray(body.assignments) ? body.assignments : [];
  if (!date || (shift !== 'A' && shift !== 'B')) {
    return {ok:false, error:'PARAM_REQUIRED', message:'날짜와 근무조를 확인하세요.'};
  }
  const bootstrap = bus70ManagerBootstrap_(date);
  if (!bootstrap.ok) return bootstrap;
  const expectedSequences = Object.keys(bootstrap.departures).map(Number).filter(Number.isInteger).sort(function (a,b) { return a-b; });
  if (!expectedSequences.length || input.length !== expectedSequences.length) {
    return {ok:false, error:'SEQUENCE_COUNT_MISMATCH', message:'선택한 날짜의 운행 순차 ' + expectedSequences.length + '개를 모두 확인하세요.'};
  }
  const driverMap = {}; bootstrap.drivers.forEach(function (v) { driverMap[v.id] = v; });
  const vehicleMap = {}; bootstrap.vehicles.forEach(function (v) { vehicleMap[v.id] = v; });
  const seenDrivers = {}, seenVehicles = {}, normalized = [];
  for (let i = 0; i < input.length; i++) {
    const seq = Number(input[i].sequence), driverId = String(input[i].driverId || '').trim();
    const vehicleId = String(input[i].vehicleId || '').trim();
    if (seq !== expectedSequences[i] || !driverMap[driverId] || !vehicleMap[vehicleId]) {
      return {ok:false, error:'ROW_INVALID', message:expectedSequences[i] + '순차의 기사 또는 차량을 확인하세요.'};
    }
    if (seenDrivers[driverId] || seenVehicles[vehicleId]) {
      return {ok:false, error:'DUPLICATE_ASSIGNMENT', message:'같은 기사 또는 차량을 두 순차에 배정할 수 없습니다.'};
    }
    seenDrivers[driverId] = true; seenVehicles[vehicleId] = true;
    normalized.push({sequence:seq, driverId:driverId, vehicleId:vehicleId});
  }
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배차DB');
    const rows = sheet.getDataRange().getDisplayValues();
    const c = makeHeaderMap_(rows[0]);
    const existing = {};
    for (let r = 1; r < rows.length; r++) {
      if (normalizeDate_(rows[r][c['날짜']]) === date && String(rows[r][c['근무조']] || '').trim() === shift) {
        existing[Number(rows[r][c['순차']])] = {row:r + 1, values:rows[r]};
      }
    }
    normalized.forEach(function (item) {
      const dispatchId = 'DSP-' + date.replace(/-/g, '') + '-' + shift + '-' + ('0' + item.sequence).slice(-2);
      const values = [dispatchId,date,shift,item.sequence,item.driverId,item.vehicleId,bootstrap.scheduleVersion,'확정',new Date(),'소장 일괄 배차'];
      if (existing[item.sequence]) sheet.getRange(existing[item.sequence].row, 1, 1, values.length).setValues([values]);
      else sheet.appendRow(values);
    });
    writeAudit_(managerId, '소장', '배차DB', date + '-' + shift, '일괄저장', bootstrap.assignments, normalized, '소장 배차 편집');
    return {ok:true, message:expectedSequences.length + '개 순차 배차를 저장했습니다.', data:bus70ManagerBootstrap_(date)};
  } finally { lock.releaseLock(); }
}
