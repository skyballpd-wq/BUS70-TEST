/* Authenticated in-app notices. No Kakao/SMS/push delivery and no driver credentials.
 * Recipients are resolved from the service day's confirmed dispatch, then frozen.
 * Receiving, audio completion and explicit acknowledgement are separate events. */
const BUS70_NOTICE_HEADERS_=['noticeId','requestHash','createdAt','createdBy','serviceDate','audience','route','recipientsJSON','title','message','priority','expiresAt','status'];
const BUS70_RECEIPT_HEADERS_=['receiptId','noticeId','driverId','receivedAt','playedAt','acknowledgedAt'];
function bus70NoticeError_(code,message){return {ok:false,error:code,message:message};}
function bus70NoticeText_(s){s=String(s||'');return /^[=+@-]/.test(s)?"'"+s:s;}
function bus70NoticeHash_(v){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(v)).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function bus70NoticeTable_(name,headers,create){
  const ss=SpreadsheetApp.getActiveSpreadsheet();let sheet=ss.getSheetByName(name);
  if(!sheet&&create){sheet=ss.insertSheet(name);sheet.appendRow(headers);sheet.setFrozenRows(1);}
  if(!sheet)return {sheet:null,rows:[],c:{}};
  const range=sheet.getDataRange(),rows=range.getDisplayValues();
  if(range.getValues){const raw=range.getValues();raw.forEach((r,i)=>r.forEach((v,j)=>{if(v instanceof Date&&!isNaN(v.getTime()))rows[i][j]=rows[0][j]==='날짜'?Utilities.formatDate(v,'Asia/Seoul','yyyy-MM-dd'):v.toISOString();}));}
  const c=makeHeaderMap_(rows[0]||[]);
  if((headers||[]).some(h=>c[h]===undefined))throw new Error(name+' 열 구성을 확인하세요.');
  return {sheet:sheet,rows:rows,c:c};
}
function bus70NoticeObjects_(table){return table.rows.slice(1).map((r,i)=>{const o={_row:i+2};Object.keys(table.c).forEach(k=>o[k]=r[table.c[k]]||'');return o;});}
function bus70NoticeLocked_(fn){const lock=LockService.getScriptLock();if(!lock.tryLock(10000))return bus70NoticeError_('BUSY','다른 저장을 처리 중입니다. 다시 시도하세요.');try{return fn();}finally{lock.releaseLock();}}
function bus70NoticeRecipientIds_(n){try{const a=JSON.parse(n.recipientsJSON);return Array.isArray(a)?a:[];}catch(e){return [];}}
function bus70NoticeDirectory_(){
  const drivers=bus70NoticeObjects_(bus70NoticeTable_('기사DB',['driverId','성명','상태'],false)).filter(d=>d.driverId&&d['상태']!=='퇴직'&&!bus70RoleFor_(d.driverId));
  const vehicles=bus70NoticeObjects_(bus70NoticeTable_('차량DB',['vehicleId','차량번호'],false)),numbers={};vehicles.forEach(v=>numbers[v.vehicleId]=v['차량번호']);
  const date=bus70ServiceDateKey_(new Date()),dispatch=bus70NoticeObjects_(bus70NoticeTable_('배차DB',['dispatchId','날짜','기사ID','차량ID','노선','상태'],false)).filter(d=>normalizeDate_(d['날짜'])===date&&d['상태']==='확정');
  return {date:date,drivers:drivers.map(d=>({id:d.driverId,name:d['성명'],assignments:dispatch.filter(p=>p['기사ID']===d.driverId).map(p=>({id:p.dispatchId,route:String(p['노선']),shift:p['근무조']||'',sequence:Number(p['순차']||0),vehicleId:p['차량ID'],vehicleNo:numbers[p['차량ID']]||''}))}))};
}
function bus70NoticeAudience_(body){
  const directory=bus70NoticeDirectory_(),kind=String(body.audience||''),route=String(body.route||''),driverId=String(body.driverId||'');
  if(String(body.date||'')!==directory.date||!['ALL','WORKING','ROUTE','DRIVER'].includes(kind)||kind==='ROUTE'&&!['5','23','70'].includes(route))return bus70NoticeError_('INPUT','현재 운행일과 공지 대상을 확인하세요.');
  const targets=directory.drivers.filter(d=>kind==='ALL'||kind==='WORKING'&&d.assignments.length||kind==='ROUTE'&&d.assignments.some(a=>a.route===route)||kind==='DRIVER'&&d.id===driverId);
  if(!targets.length)return bus70NoticeError_('NO_RECIPIENTS','대상 기사가 없습니다. 배차를 확인하세요.');
  const ids=targets.map(d=>d.id).sort();
  return {ok:true,date:directory.date,targets:targets,ids:ids,revision:bus70NoticeHash_([directory.date,kind,route,driverId,targets])};
}
function bus70NoticePreview_(body,requester){if(!bus70IsManager_(requester))return bus70NoticeError_('MANAGER_REQUIRED','소장 또는 마스터만 공지를 보낼 수 있습니다.');return bus70NoticeAudience_(body);}
function bus70NoticeReceipts_(){return bus70NoticeObjects_(bus70NoticeTable_('공지수신DB',BUS70_RECEIPT_HEADERS_,false));}
function bus70NoticeManagerLoad_(requester){
  if(!bus70IsManager_(requester))return bus70NoticeError_('MANAGER_REQUIRED','소장 또는 마스터 권한이 필요합니다.');
  const directory=bus70NoticeDirectory_(),names={};directory.drivers.forEach(d=>names[d.id]=d.name);
  const receipts=bus70NoticeReceipts_(),notices=bus70NoticeObjects_(bus70NoticeTable_('운영공지DB',BUS70_NOTICE_HEADERS_,false)).filter(n=>n.status==='ACTIVE'||n.status==='CANCELLED').slice(-40).reverse().map(n=>{
    const recipients=bus70NoticeRecipientIds_(n).map(id=>{const r=receipts.find(x=>x.noticeId===n.noticeId&&x.driverId===id)||{};return {driverId:id,name:names[id]||'등록 기사',receivedAt:r.receivedAt||'',playedAt:r.playedAt||'',acknowledgedAt:r.acknowledgedAt||''};});
    return {id:n.noticeId,title:n.title,message:n.message,priority:n.priority,createdAt:n.createdAt,expiresAt:n.expiresAt,status:n.status==='ACTIVE'&&Date.parse(n.expiresAt)<=Date.now()?'EXPIRED':n.status,audience:n.audience,route:n.route,recipients:recipients};
  });
  return {ok:true,date:directory.date,drivers:directory.drivers,notices:notices};
}
function bus70NoticePublish_(body,requester){
  if(!bus70IsManager_(requester))return bus70NoticeError_('MANAGER_REQUIRED','소장 또는 마스터만 공지를 보낼 수 있습니다.');
  const id=String(body.requestId||''),title=String(body.title||'').trim(),message=String(body.message||'').trim(),priority=String(body.priority||''),minutes=Number(body.minutes);
  if(!/^NOTICE-[a-zA-Z0-9-]{16,80}$/.test(id)||!title||title.length>60||!message||message.length>(priority==='URGENT'?140:500)||!['NORMAL','URGENT'].includes(priority)||![60,180,720,1440].includes(minutes)||body.confirmed!==true)return bus70NoticeError_('INPUT','제목·내용·유효시간과 발송 확인을 점검하세요. 긴급 공지는 140자 이내입니다.');
  const fingerprint=bus70NoticeHash_([requester,body.date,body.audience,body.route||'',body.driverId||'',body.revision,title,message,priority,minutes]);
  return bus70NoticeLocked_(function(){
    let table=bus70NoticeTable_('운영공지DB',BUS70_NOTICE_HEADERS_,false),old=bus70NoticeObjects_(table).find(n=>n.noticeId===id);
    if(old)return old.requestHash!==fingerprint?bus70NoticeError_('REQUEST_CHANGED','요청 내용이 달라졌습니다. 미리보기를 다시 확인하세요.'):old.status==='ACTIVE'||old.status==='CANCELLED'?{ok:true,id:id,replayed:true,message:'이미 저장된 공지입니다.'}:bus70NoticeError_('REVIEW_REQUIRED','이 공지의 저장 상태를 확인해야 합니다.');
    const audience=bus70NoticeAudience_(body);if(!audience.ok)return audience;
    if(audience.revision!==body.revision)return bus70NoticeError_('AUDIENCE_CHANGED','배차 또는 기사 정보가 바뀌었습니다. 대상 미리보기를 다시 확인하세요.');
    const now=new Date(),cutoff=Date.parse(audience.date+'T03:30:00+09:00')+86400000,expires=new Date(Math.min(now.getTime()+minutes*60000,cutoff)),row=[id,fingerprint,now.toISOString(),requester,audience.date,body.audience,body.audience==='ROUTE'?body.route:'',JSON.stringify(audience.ids),bus70NoticeText_(title),bus70NoticeText_(message),priority,expires.toISOString(),'PREPARING'];
    table=bus70NoticeTable_('운영공지DB',BUS70_NOTICE_HEADERS_,true);const rowNo=table.sheet.getLastRow()+1;
    table.sheet.getRange(rowNo,1,1,row.length).setValues([row]);
    try{writeAudit_(requester,bus70IsMaster_(requester)?'마스터':'소장','운영공지DB',id,'발송',{}, {audience:body.audience,recipients:audience.ids.length,title:title,priority:priority,expiresAt:expires.toISOString()},'앱 내부 공지');table.sheet.getRange(rowNo,table.c.status+1).setValue('ACTIVE');}
    catch(e){table.sheet.getRange(rowNo,table.c.status+1).setValue('FAILED');return bus70NoticeError_('SAVE_FAILED','공지를 전달하지 못했습니다. 저장 상태를 확인하세요.');}
    return {ok:true,id:id,count:audience.ids.length,message:audience.ids.length+'명 대상 공지를 저장했습니다. 앱 접속 후 수신합니다.'};
  });
}
function bus70NoticeCancel_(body,requester){
  if(!bus70IsManager_(requester))return bus70NoticeError_('MANAGER_REQUIRED','소장 또는 마스터 권한이 필요합니다.');
  return bus70NoticeLocked_(function(){const t=bus70NoticeTable_('운영공지DB',BUS70_NOTICE_HEADERS_,false),n=bus70NoticeObjects_(t).find(x=>x.noticeId===String(body.noticeId||''));
    if(!n||!['ACTIVE','CANCELLED'].includes(n.status))return bus70NoticeError_('NOT_FOUND','공지를 찾을 수 없습니다.');
    if(n.status==='CANCELLED')return {ok:true,message:'이미 취소된 공지입니다.'};
    writeAudit_(requester,bus70IsMaster_(requester)?'마스터':'소장','운영공지DB',n.noticeId,'취소',{status:n.status},{status:'CANCELLED'},'미수신·미재생 공지 취소');
    t.sheet.getRange(n._row,t.c.status+1).setValue('CANCELLED');return {ok:true,message:'공지 전달을 취소했습니다. 이미 수신한 기기는 다음 동기화 때 갱신됩니다.'};});
}
function bus70MaintenanceMessages_(requester){
  const ms=bus70NoticeObjects_(bus70NoticeTable_('정비DB',[],false)),incidents=bus70NoticeObjects_(bus70NoticeTable_('사건DB',[],false)),history=bus70NoticeObjects_(bus70NoticeTable_('정비이력DB',[],false));
  const vehicles=bus70NoticeObjects_(bus70NoticeTable_('차량DB',[],false)),date=bus70ServiceDateKey_(new Date()),dispatch=bus70NoticeObjects_(bus70NoticeTable_('배차DB',[],false));
  const related=ms.filter(m=>{const incident=incidents.find(x=>x.incidentId===m.incidentId)||{};return m['기사ID']===requester||incident['요청자']===requester||dispatch.some(p=>p['기사ID']===requester&&p['차량ID']===m['차량ID']&&p['상태']==='확정'&&normalizeDate_(p['날짜'])===date);});
  return history.filter(h=>h.historyId&&related.some(m=>m.maintId===h.maintId)).map(h=>{
    const m=related.find(x=>x.maintId===h.maintId),vehicle=vehicles.find(v=>v.vehicleId===m['차량ID']),raw=String(h['처리시간']||''),created=Date.parse(/(?:Z|[+]\d\d:\d\d)$/.test(raw)?raw:raw.replace(' ','T')+'+09:00');
    if(!Number.isFinite(created)||created>Date.now()+60000||Date.now()-created>7*86400000)return null;
    const number=vehicle?vehicle['차량번호']+'호':'차량',status=String(h['상태']||'접수');
    return {id:'MAINT-'+h.historyId,kind:'MAINTENANCE',title:number+' 정비 '+status,message:[h['내용'],h['비고']].filter(Boolean).join(' · ').slice(0,600)||'정비 처리 상태가 변경되었습니다.',priority:'NORMAL',createdAt:new Date(created).toISOString(),expiresAt:new Date(created+7*86400000).toISOString(),maintId:m.maintId};
  }).filter(Boolean);
}
function bus70NoticeAllowed_(requester){return !bus70RoleFor_(requester)&&bus70IsKnownDriver_(requester);}
function bus70NoticeItems_(requester){
  const date=bus70ServiceDateKey_(new Date());
  const notices=bus70NoticeObjects_(bus70NoticeTable_('운영공지DB',BUS70_NOTICE_HEADERS_,false)).filter(n=>n.status==='ACTIVE'&&n.serviceDate===date&&Date.parse(n.expiresAt)>Date.now()&&bus70NoticeRecipientIds_(n).includes(requester)).map(n=>({id:n.noticeId,kind:'NOTICE',title:n.title,message:n.message,priority:n.priority,createdAt:n.createdAt,expiresAt:n.expiresAt}));
  return notices.concat(bus70MaintenanceMessages_(requester),typeof bus70MaintCallMessages_==='function'?bus70MaintCallMessages_(requester):[]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50);
}
function bus70NoticeFeed_(requester){
  if(!bus70NoticeAllowed_(requester))return bus70NoticeError_('DRIVER_REQUIRED','기사 로그인이 필요합니다.');
  const receipts=bus70NoticeReceipts_().filter(r=>r.driverId===requester);
  return {ok:true,serverTime:new Date().toISOString(),items:bus70NoticeItems_(requester).map(n=>{const r=receipts.find(x=>x.noticeId===n.id)||{};return Object.assign(n,{receivedAt:r.receivedAt||'',playedAt:r.playedAt||'',acknowledgedAt:r.acknowledgedAt||''});})};
}
function bus70NoticeReceipt_(body,requester){
  if(!bus70NoticeAllowed_(requester))return bus70NoticeError_('DRIVER_REQUIRED','기사 로그인이 필요합니다.');
  const ids=body.ids,event=String(body.event||'');if(!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(id=>typeof id!=='string')||!['RECEIVED','PLAYED','ACKNOWLEDGED'].includes(event))return bus70NoticeError_('INPUT','수신 확인 항목을 확인하세요.');
  return bus70NoticeLocked_(function(){const eligible=bus70NoticeItems_(requester);if(ids.some(id=>!eligible.some(n=>n.id===id)))return bus70NoticeError_('NOT_AVAILABLE','취소·만료되었거나 본인 대상이 아닌 공지입니다.');
    const t=bus70NoticeTable_('공지수신DB',BUS70_RECEIPT_HEADERS_,true),records=bus70NoticeObjects_(t),now=new Date().toISOString();
    [...new Set(ids)].forEach(id=>{const old=records.find(r=>r.noticeId===id&&r.driverId===requester)||{},row=[old.receiptId||'RCP-'+bus70NoticeHash_([id,requester]).slice(0,32),id,requester,old.receivedAt||now,old.playedAt||'',old.acknowledgedAt||''];
      if(event==='PLAYED'&&!row[4])row[4]=now;if(event==='ACKNOWLEDGED'&&!row[5])row[5]=now;
      t.sheet.getRange(old._row||t.sheet.getLastRow()+1,1,1,row.length).setValues([row]);
    });return {ok:true,message:event==='ACKNOWLEDGED'?'확인했습니다.':'수신 상태를 저장했습니다.'};});
}
function bus70MaintenanceAcknowledge_(body,requester){
  const role=bus70RoleFor_(requester);if(!['CENTER','MASTER'].includes(role))return bus70NoticeError_('CENTER_REQUIRED','정비소 또는 마스터만 접수를 확인할 수 있습니다.');
  return bus70NoticeLocked_(function(){
    let t=bus70NoticeTable_('정비DB',['maintId','현재상태','incidentId'],false),m=bus70NoticeObjects_(t).find(x=>x.maintId===String(body.maintId||''));
    if(!m||m['현재상태']==='완료')return bus70NoticeError_('NOT_AVAILABLE','접수 확인할 미완료 정비 건이 없습니다.');
    const h=bus70NoticeTable_('정비이력DB',['historyId','maintId','처리시간','상태','처리자','내용','예비차량ID','비고'],false);if(!h.sheet)return bus70NoticeError_('DB_MISSING','정비 이력 DB를 확인하세요.');
    bus70EnsureSheetColumns_(t.sheet,['접수확인자','접수확인시각']);t=bus70NoticeTable_('정비DB',[],false);m=bus70NoticeObjects_(t).find(x=>x.maintId===String(body.maintId));
    if(m['접수확인시각'])return {ok:true,replayed:true,message:'이미 접수 확인된 요청입니다.'};
    const id='MNH-ACK-'+m.maintId,old=bus70NoticeObjects_(h).find(x=>x.historyId===id),now=old?old['처리시간']:new Date().toISOString(),who=old?old['처리자']:requester;
    if(!old){writeAudit_(requester,role==='MASTER'?'마스터':'정비소','정비DB',m.maintId,'접수 확인',{}, {receivedBy:who,receivedAt:now},'증상 확인; 운행 가능 판정·입출고 기록과 구분');const row=new Array(h.rows[0].length).fill('');const values={historyId:id,maintId:m.maintId,'처리시간':now,'상태':m['현재상태'],'처리자':who,'내용':'정비소에서 요청을 확인했습니다. 점검 결과와 운행 가능 여부는 별도로 안내합니다.','예비차량ID':m['예비차량ID']||'','비고':'접수 확인이며 실제 입고·수리 완료 또는 운행 가능 판정이 아님'};Object.keys(values).forEach(k=>row[h.c[k]]=values[k]);h.sheet.appendRow(row);}
    t.sheet.getRange(m._row,t.c['접수확인자']+1).setValue(who);t.sheet.getRange(m._row,t.c['접수확인시각']+1).setValue(now);
    return {ok:true,message:'정비 접수를 확인했습니다. 기사 공지함에 회신됩니다.'};
  });
}
