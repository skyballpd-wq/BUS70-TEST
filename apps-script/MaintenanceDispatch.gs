/* Staff-only fleet/maintenance coordination. Positions are references, never
 * actual workshop intake, repair completion, or permission to continue driving.
 * Calls are bound to today's vehicle, maintenance case and confirmed dispatch. */
const BUS70_MAINT_CALL_HEADERS_=['callId','requestHash','serviceDate','vehicleId','maintId','dispatchId','driverId','createdAt','createdBy','mode','message','expiresAt','status'];
function bus70MaintRead_(name,headers){return bus70NoticeObjects_(bus70NoticeTable_(name,headers||[],false));}
function bus70MaintCanCall_(id){return ['CENTER','MASTER'].includes(bus70RoleFor_(id));}
function bus70MaintContext_(){
  const date=bus70ServiceDateKey_(new Date());
  return {date:date,vehicles:bus70MaintRead_('차량DB',['vehicleId','차량번호']),maintenance:bus70MaintRead_('정비DB',['maintId','차량ID','현재상태']),
    dispatch:bus70MaintRead_('배차DB',['dispatchId','날짜','기사ID','차량ID','노선','상태']).filter(p=>normalizeDate_(p['날짜'])===date&&p['상태']==='확정'),
    drivers:bus70MaintRead_('기사DB',['driverId','성명','상태']).filter(d=>d['상태']!=='퇴직'&&!bus70RoleFor_(d.driverId))};
}
function bus70MaintBinding_(call,ctx){
  const m=ctx.maintenance.find(m=>m.maintId===call.maintId&&m['차량ID']===call.vehicleId);
  const p=ctx.dispatch.find(p=>p.dispatchId===call.dispatchId&&p['기사ID']===call.driverId&&p['차량ID']===call.vehicleId);
  if(!m)return 'CASE_MISSING';
  if(m['현재상태']==='완료'||m['입고시간'])return 'RESOLVED';
  if(call.serviceDate!==ctx.date||!Number.isFinite(Date.parse(call.expiresAt))||Date.parse(call.expiresAt)<=Date.now())return 'EXPIRED';
  if(!p||!ctx.drivers.some(d=>d.driverId===call.driverId))return 'ASSIGNMENT_CHANGED';
  return call.status;
}
function bus70MaintCallState_(call,ctx){return call.status==='ACTIVE'?bus70MaintBinding_(call,ctx):call.status;}
function bus70MaintCallTarget_(body,ctx){
  if(body.date!==ctx.date)return bus70NoticeError_('DATE_CHANGED','현재 운행일로 다시 조회하세요.');
  const v=ctx.vehicles.find(v=>v.vehicleId===String(body.vehicleId||''));
  const m=ctx.maintenance.find(m=>m.maintId===String(body.maintId||'')&&m['차량ID']===(v&&v.vehicleId)&&m['현재상태']!=='완료'&&!m['입고시간']);
  const p=ctx.dispatch.find(p=>p.dispatchId===String(body.dispatchId||'')&&p['차량ID']===(v&&v.vehicleId));
  const d=p&&ctx.drivers.find(d=>d.driverId===p['기사ID']);
  if(!v||!m)return bus70NoticeError_('CASE_CHANGED','실제 입고 전의 미완료 점검 요청을 먼저 확인하세요.');
  if(!p||!d)return bus70NoticeError_('NO_ASSIGNMENT','이 차량의 오늘 확정 배차 기사를 선택하세요. 미배차 차량에는 발송하지 않습니다.');
  return {ok:true,vehicleId:v.vehicleId,vehicleNo:v['차량번호'],maintId:m.maintId,dispatchId:p.dispatchId,driverId:d.driverId,driverName:d['성명'],route:String(p['노선']),shift:p['근무조']||'',sequence:Number(p['순차']||0),request:m['요청내용']||'',revision:bus70NoticeHash_([ctx.date,v.vehicleId,v['차량번호'],m.maintId,m['현재상태'],m['입고시간']||'',m['요청내용']||'',p.dispatchId,p['기사ID'],p['차량ID'],p['노선'],p['순차'],p['근무조'],d['성명']])};
}
function bus70MaintCallPreview_(body,requester){
  if(!bus70MaintCanCall_(requester))return bus70NoticeError_('CENTER_REQUIRED','점검 안내는 정비소 또는 마스터가 보낼 수 있습니다.');
  return bus70MaintCallTarget_(body,bus70MaintContext_());
}
function bus70MaintCallPublish_(body,requester){
  if(!bus70MaintCanCall_(requester))return bus70NoticeError_('CENTER_REQUIRED','점검 안내는 정비소 또는 마스터가 보낼 수 있습니다.');
  const id=String(body.requestId||''),message=String(body.message||'').trim(),mode=String(body.mode||'');
  if(!/^MCALL-[a-zA-Z0-9-]{16,80}$/.test(id)||!['RETURN','CONTACT'].includes(mode)||!message||message.length>140||body.confirmed!==true)return bus70NoticeError_('INPUT','점검 내용 140자 이내와 대상 확인을 점검하세요.');
  const hash=bus70NoticeHash_([requester,body.date,body.vehicleId,body.maintId,body.dispatchId,body.revision,mode,message]);
  return bus70NoticeLocked_(function(){
    let t=bus70NoticeTable_('정비호출DB',BUS70_MAINT_CALL_HEADERS_,false),calls=bus70NoticeObjects_(t),old=calls.find(c=>c.callId===id);
    if(old)return old.requestHash!==hash?bus70NoticeError_('REQUEST_CHANGED','내용이 달라졌습니다. 미리보기를 다시 확인하세요.'):['ACTIVE','CANCELLED'].includes(old.status)?{ok:true,replayed:true,message:'이미 저장된 안내입니다. 현재 수신 상태를 확인하세요.'}:bus70NoticeError_('REVIEW_REQUIRED','저장 상태를 확인해야 합니다.');
    const ctx=bus70MaintContext_(),target=bus70MaintCallTarget_(body,ctx);if(!target.ok)return target;
    if(target.revision!==body.revision)return bus70NoticeError_('ASSIGNMENT_CHANGED','배차 또는 정비 요청이 바뀌었습니다. 대상을 다시 확인하세요.');
    if(calls.some(c=>c.maintId===target.maintId&&c.dispatchId===target.dispatchId&&bus70MaintCallState_(c,ctx)==='ACTIVE'))return bus70NoticeError_('ACTIVE_CALL_EXISTS','이 기사에게 전달 중인 점검 안내가 있습니다. 기존 안내를 먼저 확인하거나 취소하세요.');
    const now=new Date(),expires=new Date(Math.min(+now+12*3600000,Date.parse(ctx.date+'T03:30:00+09:00')+86400000));
    const row=[id,hash,ctx.date,target.vehicleId,target.maintId,target.dispatchId,target.driverId,now.toISOString(),requester,mode,bus70NoticeText_(message),expires.toISOString(),'PREPARING'];
    t=bus70NoticeTable_('정비호출DB',BUS70_MAINT_CALL_HEADERS_,true);const rowNo=t.sheet.getLastRow()+1;t.sheet.getRange(rowNo,1,1,row.length).setValues([row]);
    try{writeAudit_(requester,bus70RoleFor_(requester)==='MASTER'?'마스터':'정비소','정비호출DB',id,'점검 안내',{}, {vehicleId:target.vehicleId,maintId:target.maintId,dispatchId:target.dispatchId,driverId:target.driverId,mode:mode,message:message,expiresAt:expires.toISOString()},'실제 입고·운행 가능 판정과 별개');t.sheet.getRange(rowNo,t.c.status+1).setValue('ACTIVE');}
    catch(e){t.sheet.getRange(rowNo,t.c.status+1).setValue('FAILED');return bus70NoticeError_('SAVE_FAILED','안내를 전달하지 못했습니다. 저장 상태를 확인하세요.');}
    return {ok:true,id:id,message:'점검 안내를 저장했습니다. 기사 수신·확인 여부는 별도로 확인하세요.'};
  });
}
function bus70MaintCallCancel_(body,requester){
  if(!bus70MaintCanCall_(requester))return bus70NoticeError_('CENTER_REQUIRED','정비소 또는 마스터 권한이 필요합니다.');
  return bus70NoticeLocked_(function(){const t=bus70NoticeTable_('정비호출DB',BUS70_MAINT_CALL_HEADERS_,false),call=bus70NoticeObjects_(t).find(c=>c.callId===String(body.callId||''));
    if(!call||!['ACTIVE','CANCELLED'].includes(call.status))return bus70NoticeError_('NOT_FOUND','안내를 찾을 수 없습니다.');
    if(call.status==='CANCELLED')return {ok:true,message:'이미 취소했습니다.'};
    writeAudit_(requester,bus70RoleFor_(requester)==='MASTER'?'마스터':'정비소','정비호출DB',call.callId,'안내 취소',{status:call.status},{status:'CANCELLED'},'기사 화면은 다음 동기화 때 반영');
    t.sheet.getRange(call._row,t.c.status+1).setValue('CANCELLED');return {ok:true,message:'점검 안내를 취소했습니다. 기사 화면은 다음 동기화 때 갱신됩니다.'};});
}
function bus70MaintCallMessages_(requester){
  const ctx=bus70MaintContext_();return bus70MaintRead_('정비호출DB',BUS70_MAINT_CALL_HEADERS_).filter(c=>c.driverId===requester&&bus70MaintCallState_(c,ctx)==='ACTIVE').map(c=>{
    const v=ctx.vehicles.find(v=>v.vehicleId===c.vehicleId),urgent=c.mode==='CONTACT';
    return {id:c.callId,kind:'MAINTENANCE_CALL',title:(v?v['차량번호']+'호 ':'')+(urgent?'정비소 긴급 연락 요청':'복귀 후 점검 요청'),message:(urgent?'안전하게 정차한 뒤 정비소에 연락해 주세요. ':'고강공영차고지 복귀 후 정비소에 입고 위치를 확인해 주세요. ')+c.message,priority:urgent?'URGENT':'NORMAL',createdAt:c.createdAt,expiresAt:c.expiresAt,maintId:c.maintId};
  });
}
// Require a unique route occurrence and an explicitly marked depot endpoint.
// Provider fetch time is not its measurement time. Arrival is always unconfirmed.
function bus70MaintPosition_(point,stops,now){
  if(!point)return {state:'UNKNOWN',label:'위치 확인 중',progress:null,remainingStops:null};
  const age=now-Number(point.at),fresh=Number.isFinite(age)&&age>=0&&age<=(point.source==='APP_GPS'?45000:60000);
  if(!fresh)return {state:'STALE',label:'이전 위치 · 갱신 대기',progress:null,remainingStops:null,at:point.at,source:point.source};
  const ordered=stops.slice().sort((a,b)=>Number(a.order)-Number(b.order)),matches=ordered.filter(s=>Number(s.order)===Number(point.order));
  if(matches.length!==1)return {state:'UNKNOWN',label:'노선 위치 확인 중',progress:null,remainingStops:null,at:point.at,source:point.source};
  const stop=matches[0],index=ordered.indexOf(stop),last=ordered[ordered.length-1],turns=ordered.filter(s=>s.turnaround),pivot=turns.length===1?ordered.indexOf(turns[0]):-1;
  const depot=Boolean(last&&last.terminal&&/고강.*차고지/.test(last.name)),returning=depot&&pivot>0&&index>pivot;
  let state=returning?'RETURNING':'ON_ROUTE',label=returning?'차고지 방면':'노선 운행 위치';
  if(depot&&index===ordered.length-1){state='DEPOT_REFERENCE';label='차고지 정류장 위치 · 도착 확인 필요';}
  return {state:state,label:label,stop:stop.name,direction:stop.direction||'',remainingStops:returning?ordered.length-1-index:null,progress:ordered.length>1?Math.round(index/(ordered.length-1)*100):null,at:point.at,source:point.source};
}
function bus70MaintRun_(logs,dispatch){
  const matches=logs.filter(l=>l['배차ID']===dispatch.dispatchId&&l['차량ID']===dispatch['차량ID']&&l['기사ID']===dispatch['기사ID']&&String(l['노선'])===String(dispatch['노선'])&&Number(l['순차'])===Number(dispatch['순차']));
  if(!matches.length)return null;
  const trip=Math.max.apply(null,matches.map(l=>Number(l['탕'])||0)),latest=matches.filter(l=>Number(l['탕'])===trip),ended=latest.find(l=>l['도착실제']);
  if(ended)return {trip:trip,running:false,arrival:ended['도착실제'],arrivalPlace:ended['도착지']||'',plannedEnd:''};
  const running=latest.filter(l=>/\d{1,2}:\d{2}/.test(l['발차실제']));if(running.length!==1)return null;
  const l=running[0];return {trip:trip,running:true,arrival:'',arrivalPlace:'',plannedEnd:/고강.*차고지/.test(l['도착지']||'')?l['도착예정']||'':''};
}
function bus70MaintLogs_(){
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('운행일지');if(!sheet)return [];
  const rows=bus70RunLogReadRows_(sheet);return bus70NoticeObjects_({rows:rows,c:makeHeaderMap_(rows[0]||[])});
}
function bus70MaintenanceBoard_(requester){
  if(!bus70CanOperate_(requester))return bus70NoticeError_('STAFF_REQUIRED','정비소·소장·마스터만 차량 현황을 볼 수 있습니다.');
  const ctx=bus70MaintContext_(),now=Date.now(),calls=bus70MaintRead_('정비호출DB',BUS70_MAINT_CALL_HEADERS_),receipts=bus70NoticeReceipts_();
  const logs=bus70MaintLogs_().filter(l=>normalizeDate_(l['날짜'])===ctx.date),runs={};ctx.dispatch.forEach(p=>runs[p.dispatchId]=bus70MaintRun_(logs,p));
  const routes=['5','23','70'].map(route=>{
    let fetched={available:false,message:'차량위치 연결 대기'},stops=[],snapshots={};
    try{stops=bus70RouteStopsFromDb_(route,ctx.date).stops||[];snapshots=bus70LiveLocationSnapshotMap_(route,ctx.date);fetched=bus70GyeonggiLiveFetch_(route);}catch(ignore){}
    return {route:route,fetched:fetched,stops:stops,snapshots:snapshots};
  });
  const vehicles=ctx.vehicles.filter(v=>v.vehicleId&&!['폐차','매각','삭제'].includes(v['상태'])).map(v=>{
    const assignments=ctx.dispatch.filter(p=>p['차량ID']===v.vehicleId).map(p=>{const d=ctx.drivers.find(d=>d.driverId===p['기사ID']);return {id:p.dispatchId,driverId:d?d.driverId:'',driverName:d?d['성명']:'기사 확인 필요',route:String(p['노선']),shift:p['근무조']||'',sequence:Number(p['순차']||0),run:runs[p.dispatchId]||null};});
    const routeIds=[...new Set(assignments.map(p=>p.route))],route=routeIds.length===1?routeIds[0]:!routeIds.length?String(v['현재노선']||''):'';
    const r=routes.find(r=>r.route===route);let point=null;
    if(r){
      // Only an actual active trip with its exact current vehicle binding can use phone GPS.
      const phones=Object.keys(r.snapshots).map(k=>r.snapshots[k]).filter(s=>assignments.some(a=>a.id===s.dispatchId&&a.driverId===s.driverId&&a.sequence===Number(s.sequence)&&a.run&&a.run.running&&a.run.trip===Number(s.trip))&&s.vehicleId===v.vehicleId&&String(s.route)===route&&s.date===ctx.date&&s.accuracyM!==null&&s.accuracyM!==''&&Number.isFinite(Number(s.accuracyM))&&Number(s.accuracyM)>=0&&Number(s.accuracyM)<=60&&now-Number(s.recordedAtMs)>=0&&now-Number(s.recordedAtMs)<=45000);
      if(phones.length===1)point={order:phones[0].matchedStopOrder,at:Number(phones[0].recordedAtMs),source:'APP_GPS'};
      if(!point&&r.fetched.available){const match=bus70GyeonggiSelectVehicle_(r.fetched.items||[],v['차량번호']);if(match){const stop=r.stops.find(s=>Number(s.order)===Number(match.stationSeq));if(ctx.vehicles.filter(other=>bus70GyeonggiSelectVehicle_(r.fetched.items||[],other['차량번호'])===match).length===1&&stop&&String(stop.externalStopId||'')===String(match.stationId||'')&&match.stationId)point={order:match.stationSeq,at:r.fetched.fetchedAt,source:'GBIS_REFERENCE'};}}
    }
    const maintenance=ctx.maintenance.filter(m=>m['차량ID']===v.vehicleId).map(m=>({id:m.maintId,status:m['현재상태'],request:m['요청내용']||'',receivedAt:m['요청시간']||'',intakeAt:m['입고시간']||'',releasedAt:m['출고시간']||'',completedDate:m['정비완료일']||'',availableDate:m['운행가능일']||''}));
    const open=maintenance.filter(m=>m.status!=='완료'),recent=maintenance.filter(m=>m.status==='완료').slice(-1);
    const delivery=calls.filter(c=>c.vehicleId===v.vehicleId&&c.serviceDate===ctx.date).slice(-10).reverse().map(c=>{const d=ctx.drivers.find(d=>d.driverId===c.driverId),receipt=receipts.find(x=>x.noticeId===c.callId&&x.driverId===c.driverId)||{};return {id:c.callId,maintId:c.maintId,driverName:d?d['성명']:'등록 기사',message:c.message,mode:c.mode,status:bus70MaintCallState_(c,ctx),receivedAt:receipt.receivedAt||'',playedAt:receipt.playedAt||'',acknowledgedAt:receipt.acknowledgedAt||'',expiresAt:c.expiresAt};});
    return {id:v.vehicleId,number:v['차량번호'],route:route,routeBasis:assignments.length?'CURRENT_DISPATCH':'REGISTERED_ROUTE',status:v['상태']||'',assignments:assignments,position:bus70MaintPosition_(point,r?r.stops:[],now),maintenance:open.concat(recent),pendingCount:open.length,calls:delivery};
  });
  return {ok:true,date:ctx.date,serverTime:new Date(now).toISOString(),canCall:bus70MaintCanCall_(requester),routes:routes.map(r=>({route:r.route,available:r.fetched.available===true,fetchedAt:r.fetched.fetchedAt||null,retryAt:r.fetched.retryAt||null,message:r.fetched.message||'차량위치 조회'})),vehicles:vehicles};
}
