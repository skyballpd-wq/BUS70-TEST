/* Date-scoped vehicle replacement. Never edits driver, timetable or actual run logs.
 * A private journal distinguishes reported time, service date and server save time.
 * Script lock + row revision + request ID protect stale forms and lost responses.
 */
const BUS70_REPLACEMENT_HEADERS_=['requestId','요청해시','기록시각','처리자','발생통보구분','발생통보일시','배차적용일','노선','dispatchId','순차','기사ID','원차량ID','대체차량ID','유형','사유','incidentId','maintId','상태','복구정보'];
function bus70ReplacementError_(error,message){return {ok:false,error:error,message:message};}
function bus70ReplacementDate_(s){s=String(s||'');return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s?s:'';}
function bus70ReplacementHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value)).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function bus70ReplacementText_(s){s=String(s||'');return /^[=+@-]/.test(s)?"'"+s:s;}
function bus70ReplacementTable_(name,required){
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if(!sheet)throw new Error(name+'를 찾을 수 없습니다.');
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]||[]);
  if((required||[]).some(function(k){return c[k]===undefined;}))throw new Error(name+'의 필수 열을 확인하세요.');
  return {sheet:sheet,rows:rows,c:c};
}
function bus70ReplacementJournal_(create){
  const ss=SpreadsheetApp.getActiveSpreadsheet();let sheet=ss.getSheetByName('차량대차DB');
  if(!sheet&&create){sheet=ss.insertSheet('차량대차DB');sheet.appendRow(BUS70_REPLACEMENT_HEADERS_);sheet.setFrozenRows(1);}
  return sheet?bus70ReplacementTable_('차량대차DB',BUS70_REPLACEMENT_HEADERS_):null;
}
function bus70ReplacementRoute_(r,c){return String(r[c['노선']]||'').replace(/번$/,'')||(/^R(5|23|70)-/.exec(String(r[c['시간표버전']]||''))||[])[1]||'';}
function bus70ReplacementData_(date,route){
  const p=bus70ReplacementTable_('배차DB',['dispatchId','날짜','노선','근무조','순차','기사ID','차량ID','상태','확정시간','비고']);
  const v=bus70ReplacementTable_('차량DB',['vehicleId','차량번호','차량구분','상태','현재노선']);
  const m=bus70ReplacementTable_('정비DB',['maintId','incidentId','차량ID','현재상태']);
  const d=bus70ReplacementTable_('기사DB',['driverId','성명']),names={};d.rows.slice(1).forEach(r=>names[r[d.c.driverId]]=r[d.c['성명']]);
  const vehicles=v.rows.slice(1).filter(r=>r[v.c.vehicleId]).map(function(r){
    const id=r[v.c.vehicleId],status=r[v.c['상태']],reasons=[];
    if(!['운행가능','운행'].includes(status))reasons.push(status||'차량 상태 확인 필요');
    m.rows.slice(1).filter(x=>x[m.c['차량ID']]===id&&x[m.c.maintId]).forEach(function(x){
      if(x[m.c['현재상태']]!=='완료')reasons.push('미결 정비');
      else if(m.c['운행가능일']!==undefined&&normalizeDate_(x[m.c['운행가능일']])>date)reasons.push(normalizeDate_(x[m.c['운행가능일']])+'부터 운행 가능');
    });
    const assignments=p.rows.slice(1).filter(x=>normalizeDate_(x[p.c['날짜']])===date&&x[p.c['차량ID']]===id&&x[p.c['상태']]==='확정').map(x=>({id:x[p.c.dispatchId],route:bus70ReplacementRoute_(x,p.c),sequence:Number(x[p.c['순차']]),shift:x[p.c['근무조']]}));
    return {id:id,no:r[v.c['차량번호']],route:r[v.c['현재노선']],type:r[v.c['차량구분']],status:status,unavailable:[...new Set(reasons)],assignments:assignments};
  });
  const assignments=p.rows.slice(1).filter(r=>normalizeDate_(r[p.c['날짜']])===date&&bus70ReplacementRoute_(r,p.c)===route&&r[p.c['상태']]==='확정').map(r=>({id:r[p.c.dispatchId],sequence:Number(r[p.c['순차']]),shift:r[p.c['근무조']],driverId:r[p.c['기사ID']],driverName:names[r[p.c['기사ID']]]||'',vehicleId:r[p.c['차량ID']],revision:bus70ReplacementHash_(r)})).sort((a,b)=>a.sequence-b.sequence);
  const journal=bus70ReplacementJournal_(false),history=journal?journal.rows.slice(1).filter(r=>r[journal.c['배차적용일']]===date&&r[journal.c['노선']]===route).slice(-30).reverse().map(r=>({requestId:r[journal.c.requestId],sequence:r[journal.c['순차']],from:r[journal.c['원차량ID']],to:r[journal.c['대체차량ID']],reportedAt:r[journal.c['발생통보일시']],reportedKind:r[journal.c['발생통보구분']],reason:r[journal.c['사유']],state:r[journal.c['상태']]})):[];
  return {ok:true,date:date,route:route,vehicles:vehicles,assignments:assignments,history:history};
}
function bus70ReplacementLoad_(body,requesterId){
  if(!bus70IsManager_(requesterId))return bus70ReplacementError_('MANAGER_REQUIRED','소장 또는 마스터만 사용할 수 있습니다.');
  const date=bus70ReplacementDate_(body.date),route=String(body.route||'');
  if(!date||!['5','23','70'].includes(route))return bus70ReplacementError_('INPUT','배차 적용일과 노선을 선택하세요.');
  return bus70ReplacementData_(date,route);
}
function bus70ReplacementLocked_(work){const lock=LockService.getScriptLock();if(!lock.tryLock(10000))return bus70ReplacementError_('BUSY','다른 저장을 처리 중입니다. 잠시 후 다시 시도하세요.');try{return work();}finally{lock.releaseLock();}}
function bus70ReplacementRegister_(body,requesterId){
  if(!bus70IsManager_(requesterId))return bus70ReplacementError_('MANAGER_REQUIRED','소장 또는 마스터만 등록할 수 있습니다.');
  const no=String(body.vehicleNo||'').trim(),route=String(body.vehicleRoute||''),type=String(body.vehicleType||''),status=String(body.vehicleStatus||'');
  if(!/^\d{4}$/.test(no)||!['5','23','70'].includes(route)||!['일반','예비'].includes(type)||!['운행가능','정비중','운행불가'].includes(status)||body.confirmed!==true)return bus70ReplacementError_('INPUT','차량번호 4자리·소속 노선·구분·운행 상태를 확인하세요.');
  return bus70ReplacementLocked_(function(){
    const v=bus70ReplacementTable_('차량DB',['vehicleId','차량번호']);
    const existing=v.rows.slice(1).find(r=>String(r[v.c['차량번호']]).replace(/\D/g,'')===no);
    if(existing)return {ok:true,vehicleId:existing[v.c.vehicleId],existing:true,message:'이미 등록된 차량을 찾았습니다. 기존 정보를 유지합니다.'};
    return bus70ReserveVehicleUpsert_({vehicleNo:no,vehicleType:type,route:route,status:status,note:'소장 차량 대차 화면에서 신규 등록'},requesterId);
  });
}
function bus70ReplacementSave_(body,requesterId){
  if(!bus70IsManager_(requesterId))return bus70ReplacementError_('MANAGER_REQUIRED','소장 또는 마스터만 저장할 수 있습니다.');
  const date=bus70ReplacementDate_(body.date),route=String(body.route||''),reportedAt=String(body.reportedAt||''),kind=String(body.reportedKind||''),reason=String(body.reason||'').trim(),type=String(body.type||''),requestId=String(body.requestId||'');
  if(!date||!['5','23','70'].includes(route)||!['발생','통보'].includes(kind)||!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(reportedAt)||!bus70ReplacementDate_(reportedAt.slice(0,10))||!['고장','점검','기타'].includes(type)||!reason||reason.length>500||!/^REPL-[a-zA-Z0-9-]{16,80}$/.test(requestId)||body.confirmed!==true)return bus70ReplacementError_('INPUT','발생·통보일시, 배차 적용일, 대차 사유와 확인 항목을 입력하세요.');
  if(Date.parse(reportedAt+'+09:00')>Date.now()+60000)return bus70ReplacementError_('FUTURE_NOTICE','발생·통보일시는 미래 시각으로 입력할 수 없습니다.');
  if(date<Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd'))return bus70ReplacementError_('PAST_DISPATCH','지난 배차는 대차 화면에서 변경할 수 없습니다.');
  const fingerprint=bus70ReplacementHash_([requesterId,date,route,body.dispatchId,body.revision,body.originalVehicleId,body.replacementVehicleId,reportedAt,kind,type,reason]);
  return bus70ReplacementLocked_(function(){
    let journal=bus70ReplacementJournal_(false);
    if(journal){const previous=journal.rows.slice(1).find(r=>r[journal.c.requestId]===requestId);
      if(previous){if(previous[journal.c['요청해시']]!==fingerprint)return bus70ReplacementError_('REQUEST_CHANGED','재시도 요청 내용이 달라졌습니다. 배차를 새로 불러오세요.');
        if(previous[journal.c['상태']]==='완료')return {ok:true,requestId:requestId,replayed:true,message:'이미 저장된 대차입니다. 배차 반영을 확인했습니다.'};
        return bus70ReplacementError_('REVIEW_REQUIRED','대차 이력 상태: '+previous[journal.c['상태']]+'. 새로 불러온 뒤 확인하세요. 처리중·복구필요인 경우 마스터 확인이 필요합니다.');
      }
      if(journal.rows.slice(1).some(r=>['처리중','복구필요'].includes(r[journal.c['상태']])))return bus70ReplacementError_('REVIEW_REQUIRED','확인이 필요한 대차 처리 건이 있습니다. 마스터에게 대차 이력 확인을 요청하세요.');
    }
    const data=bus70ReplacementData_(date,route),assignment=data.assignments.find(a=>a.id===body.dispatchId),vehicle=data.vehicles.find(v=>v.id===body.replacementVehicleId);
    if(!assignment||assignment.revision!==body.revision||assignment.vehicleId!==body.originalVehicleId)return bus70ReplacementError_('DISPATCH_CHANGED','배차가 변경되었습니다. 새로 불러온 뒤 확인하세요.');
    if(!vehicle||!data.vehicles.some(v=>v.id===assignment.vehicleId))return bus70ReplacementError_('VEHICLE_NOT_FOUND','원차와 대체 차량 등록정보를 확인하세요.');
    if(vehicle.id===assignment.vehicleId)return bus70ReplacementError_('SAME_VEHICLE','원차와 다른 대체 차량을 선택하세요.');
    if(vehicle.unavailable.length||vehicle.assignments.length)return bus70ReplacementError_('VEHICLE_UNAVAILABLE','대체 차량이 정비 중이거나 적용일에 이미 배차되어 있습니다. 다른 차량을 선택하세요.');
    // Validate every table before the first operational write.
    const p=bus70ReplacementTable_('배차DB',['dispatchId','차량ID','확정시간','비고']),v=bus70ReplacementTable_('차량DB',['vehicleId','상태']);
    const m=bus70ReplacementTable_('정비DB',['maintId','incidentId','요청시간','차량ID','기사ID','요청내용','현재상태','예비차량ID']);
    const incidents=bus70ReplacementTable_('사건DB',['incidentId','접수시간','날짜','기사ID','차량ID','순차','유형','내용','상태','요청자','처리자','비고']);
    const confirmations=bus70ReplacementTable_('배차확인DB',['dispatchId','재확인필요']);
    const now=new Date(),changes=[];
    function cell(table,row,key,value){const col=table.c[key]+1;changes.push({sheet:table.sheet.getName(),row:row,col:col,before:table.sheet.getRange(row,col).getValue(),after:value});}
    function append(table,values){const row=table.sheet.getLastRow()+1;Object.keys(values).filter(key=>table.c[key]!==undefined).forEach(key=>cell(table,row,key,bus70ReplacementText_(values[key])));}
    const pi=p.rows.findIndex(r=>r[p.c.dispatchId]===assignment.id)+1,vi=v.rows.findIndex(r=>r[v.c.vehicleId]===assignment.vehicleId)+1;
    const existing=m.rows.slice(1).find(r=>r[m.c['차량ID']]===assignment.vehicleId&&r[m.c.maintId]&&r[m.c['현재상태']]!=='완료');
    let incidentId=existing?existing[m.c.incidentId]:'',maintId=existing?existing[m.c.maintId]:'';
    if(type!=='기타'&&!existing){
      incidentId=newId_('INC');maintId=newId_('MNT');
      append(incidents,{incidentId:incidentId,'접수시간':now.toISOString(),'날짜':reportedAt.slice(0,10),'기사ID':assignment.driverId,'차량ID':assignment.vehicleId,'순차':assignment.sequence,'유형':type,'내용':reason,'상태':'접수','요청자':requesterId,'처리자':requesterId,'비고':kind+' '+reportedAt+' KST · 배차 적용 '+date+' · '+requestId,'노선':route,'배차ID':assignment.id,'운행일ID':p.rows[pi-1][p.c['운행일ID']]||''});
      append(m,{maintId:maintId,incidentId:incidentId,'요청시간':now.toISOString(),'차량ID':assignment.vehicleId,'기사ID':assignment.driverId,'요청내용':reason,'현재상태':'접수','예비차량ID':vehicle.id,'요청노선':route,'배차ID':assignment.id,'운행일ID':p.rows[pi-1][p.c['운행일ID']]||'','비고':kind+' '+reportedAt+' KST · 배차 적용 '+date+' · '+requestId});
    }
    // Existing maintenance is linked, never closed or overwritten by a replacement.
    if(type==='고장')cell(v,vi,'상태','정비중');
    confirmations.rows.forEach(function(r,i){if(i&&r[confirmations.c.dispatchId]===assignment.id)cell(confirmations,i+1,'재확인필요','Y');});
    cell(p,pi,'차량ID',vehicle.id);cell(p,pi,'확정시간',now);
    cell(p,pi,'비고',String(p.rows[pi-1][p.c['비고']]||'')+'\n대차 '+requestId+' · '+type+' · '+reason);
    journal=journal||bus70ReplacementJournal_(true);
    const jc=journal.c,jrow=new Array(journal.rows[0].length).fill(''),jr=journal.sheet.getLastRow()+1;
    const values={requestId:requestId,'요청해시':fingerprint,'기록시각':now.toISOString(),'처리자':requesterId,'발생통보구분':kind,'발생통보일시':reportedAt+'+09:00','배차적용일':date,'노선':route,dispatchId:assignment.id,'순차':assignment.sequence,'기사ID':assignment.driverId,'원차량ID':assignment.vehicleId,'대체차량ID':vehicle.id,'유형':type,'사유':reason,incidentId:incidentId,maintId:maintId,'상태':'처리중','복구정보':JSON.stringify(changes)};
    Object.keys(values).forEach(k=>jrow[jc[k]]=bus70ReplacementText_(values[k]));journal.sheet.getRange(jr,1,1,jrow.length).setValues([jrow]);SpreadsheetApp.flush();
    const attempted=[];
    try{
      changes.forEach(function(change){attempted.push(change);SpreadsheetApp.getActiveSpreadsheet().getSheetByName(change.sheet).getRange(change.row,change.col).setValue(change.after);});
      SpreadsheetApp.flush();journal.sheet.getRange(jr,jc['상태']+1).setValue('완료');SpreadsheetApp.flush();
    }catch(error){
      let restored=true;attempted.reverse().forEach(function(change){try{SpreadsheetApp.getActiveSpreadsheet().getSheetByName(change.sheet).getRange(change.row,change.col).setValue(change.before);}catch(e){restored=false;}});
      try{SpreadsheetApp.flush();journal.sheet.getRange(jr,jc['상태']+1).setValue(restored?'실패·원복':'복구필요');SpreadsheetApp.flush();}catch(e){restored=false;}
      return bus70ReplacementError_('SAVE_FAILED',restored?'저장에 실패하여 변경을 원복했습니다. 새로 불러온 뒤 다시 시도하세요.':'일부 저장 상태를 확인해야 합니다. 추가 변경을 멈추고 마스터에게 대차 이력 확인을 요청하세요.');
    }
    [p,v,m,incidents,confirmations].forEach(t=>{if(typeof bus70InvalidatePartition_==='function')bus70InvalidatePartition_(t.sheet);});
    return {ok:true,requestId:requestId,message:date+' '+route+'번 '+assignment.sequence+'순차를 '+vehicle.no+'호로 대차했습니다. 기사 화면에서 배차를 다시 확인해 주세요.'};
  });
}
