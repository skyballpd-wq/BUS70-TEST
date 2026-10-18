/* Private accident evidence. No public Drive links or sharing changes. */
function bus70AccidentText_(value,max){return String(value||'').trim().slice(0,max);}
function bus70AccidentFail_(error,message){return {ok:false,error:error,message:message};}
function bus70AccidentDigest_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');}
function bus70AccidentValidate_(body){
  const a=body.accident||{},required=['OWN_PLATE','OTHER_PLATE','SCENE','OWN_DAMAGE','OTHER_DAMAGE'];
  const data={evidenceMode:a.evidenceMode==='BULK'?'BULK':'CATEGORIZED',evidenceConfirmed:a.evidenceConfirmed===true,requestId:bus70AccidentText_(a.requestId,80),ownPlate:bus70AccidentText_(a.ownPlate,30),otherPlate:bus70AccidentText_(a.otherPlate,30),ownRole:bus70AccidentText_(a.ownRole,10),occurredAt:bus70AccidentText_(a.occurredAt,25),location:bus70AccidentText_(a.location,200),contactArea:bus70AccidentText_(a.contactArea,200)};
  if(!/^[a-f0-9-]{36}$/.test(data.requestId)||!data.ownPlate||!data.otherPlate||data.ownPlate.replace(/\s/g,'')===data.otherPlate.replace(/\s/g,'')||!data.location||!data.contactArea||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.occurredAt)||['미확정','가해','피해','쌍방'].indexOf(data.ownRole)<0)return bus70AccidentFail_('ACCIDENT_FIELDS_REQUIRED','양쪽 차량번호·사고 시각·현장·접촉 부위·가해/피해 구분을 확인하세요.');
  const instant=new Date(data.occurredAt+':00+09:00');
  if(!isFinite(instant.getTime())||new Date(instant.getTime()+9*3600000).toISOString().slice(0,16)!==data.occurredAt||instant.getTime()>Date.now()+300000)return bus70AccidentFail_('ACCIDENT_TIME_INVALID','사고 발생 시각을 확인하세요.');
  data.otherRole={미확정:'미확정',가해:'피해',피해:'가해',쌍방:'쌍방'}[data.ownRole];
  if(!Array.isArray(a.photos)||a.photos.length<5||a.photos.length>10)return bus70AccidentFail_('ACCIDENT_PHOTOS_REQUIRED','사고 보고에는 서로 다른 사진이 최소 5장 필요합니다.');
  const photos=[],seen={},categories={};
  for(let i=0;i<a.photos.length;i++){
    const p=a.photos[i],category=String(p.category||''),raw=String(p.data||'');
    if(required.concat(['EXTRA','EVIDENCE']).indexOf(category)<0||p.mimeType!=='image/jpeg'||raw.length>682668||!/^\/[A-Za-z0-9+/]*={0,2}$/.test(raw))return bus70AccidentFail_('ACCIDENT_PHOTO_INVALID','첨부 사진 형식 또는 용량을 확인하세요.');
    let bytes;try{bytes=Utilities.base64Decode(raw);}catch(e){return bus70AccidentFail_('ACCIDENT_PHOTO_INVALID','사진을 읽지 못했습니다. 다시 첨부하세요.');}
    if(bytes.length<100||bytes.length>512000||(bytes[0]&255)!==255||(bytes[1]&255)!==216||(bytes[2]&255)!==255||(bytes[bytes.length-2]&255)!==255||(bytes[bytes.length-1]&255)!==217)return bus70AccidentFail_('ACCIDENT_PHOTO_INVALID','올바른 JPEG 사진을 첨부하세요.');
    const hash=bus70AccidentDigest_(bytes);if(seen[hash])return bus70AccidentFail_('ACCIDENT_PHOTO_DUPLICATE','같은 사진으로 여러 촬영 항목을 채울 수 없습니다.');
    seen[hash]=true;categories[category]=true;photos.push({category:category,hash:hash,bytes:bytes});
  }
  if(data.evidenceMode==='BULK'? !data.evidenceConfirmed : required.some(function(k){return !categories[k];}))return bus70AccidentFail_('ACCIDENT_PHOTOS_REQUIRED','양쪽 번호판·현장 전경·양쪽 접촉 부위 사진을 모두 첨부하세요.');
  data.photoCount=photos.length;return {ok:true,data:data,photos:photos};
}
function bus70AccidentCanReport_(body,requesterId){
  if(bus70CanOperate_(requesterId))return true;
  if(!bus70IsKnownDriver_(requesterId))return false;
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('배차DB');if(!sheet)return false;
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]);
  return rows.slice(1).some(function(r){return normalizeDate_(r[c['날짜']])===body.date&&String(r[c['기사ID']])===requesterId&&String(r[c['차량ID']])===body.vehicleId&&String(r[c['상태']])==='확정';});
}
function bus70AccidentParse_(raw){try{return JSON.parse(String(raw||''));}catch(e){return null;}}
function bus70AccidentSummary_(raw,requesterId,owner){
  if(requesterId!==owner&&!bus70CanOperate_(requesterId))return null;
  const a=bus70AccidentParse_(raw);if(!a)return null;
  return {ownPlate:a.ownPlate,otherPlate:a.otherPlate,ownRole:a.ownRole,otherRole:a.otherRole,occurredAt:a.occurredAt,location:a.location,contactArea:a.contactArea,photoCount:(a.photos||[]).length};
}
function bus70AccidentSave_(body,requesterId){
  const date=normalizeDate_(body.date),vehicleId=bus70AccidentText_(body.vehicleId,80),content=bus70AccidentText_(body.content,1000);
  if(!date||!vehicleId||!content)return bus70AccidentFail_('PARAM_REQUIRED','발생 차량·날짜·사고 내용을 입력하세요.');
  if(!bus70AccidentCanReport_({date:date,vehicleId:vehicleId},requesterId))return bus70AccidentFail_('DRIVER_VEHICLE_MISMATCH','본인에게 확정 배차된 차량만 사고 보고할 수 있습니다.');
  const checked=bus70AccidentValidate_(body);if(!checked.ok)return checked;
  const ss=SpreadsheetApp.getActiveSpreadsheet(),is=ss.getSheetByName('사건DB'),vs=ss.getSheetByName('차량DB');if(!is||!vs)return bus70AccidentFail_('DB_MISSING','사건·차량 DB를 확인하세요.');
  const vr=vs.getDataRange().getDisplayValues(),vc=makeHeaderMap_(vr[0]);if(!vr.slice(1).some(function(r){return String(r[vc['vehicleId']])===vehicleId;}))return bus70AccidentFail_('VEHICLE_NOT_FOUND','보고 차량을 찾을 수 없습니다.');
  const lock=LockService.getScriptLock();if(!lock.tryLock(10000))return bus70AccidentFail_('ACCIDENT_BUSY','다른 보고를 저장 중입니다. 잠시 후 같은 내용으로 다시 보내세요.');
  let folder=null,committed=false;
  try{
    bus70EnsureSheetColumns_(is,['요청자','사고보고JSON','보고요청ID','보고지문']);
    const rows=is.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]),key=requesterId+':'+checked.data.requestId;
    const fingerprint=bus70AccidentDigest_(JSON.stringify({date:date,vehicleId:vehicleId,content:content,data:checked.data,photos:checked.photos.map(function(p){return [p.category,p.hash];})}));
    for(let i=1;i<rows.length;i++)if(String(rows[i][c['보고요청ID']])===key){
      if(String(rows[i][c['보고지문']])!==fingerprint)return bus70AccidentFail_('ACCIDENT_RETRY_CHANGED','앞서 보낸 내용과 다릅니다. 기존 접수 내역을 확인하세요.');
      return {ok:true,incidentId:String(rows[i][c['incidentId']]),photoCount:checked.photos.length,duplicate:true,message:'이미 접수된 사고 보고와 사진을 확인했습니다.'};
    }
    const incidentId=newId_('INC');folder=DriveApp.createFolder('BUS70_사고_'+incidentId);
    if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE||folder.getEditors().length||folder.getViewers().length)throw Error('PRIVATE_STORAGE_REQUIRED');
    const stored=checked.photos.map(function(p,i){const file=folder.createFile(Utilities.newBlob(p.bytes,'image/jpeg',String(i+1).padStart(2,'0')+'_'+p.category+'.jpg'));if(file.getSharingAccess()!==DriveApp.Access.PRIVATE)throw Error('PRIVATE_STORAGE_REQUIRED');return {category:p.category,fileId:file.getId(),hash:p.hash,bytes:p.bytes.length};});
    const record=Object.assign({},checked.data,{photos:stored,folderId:folder.getId()}),row=new Array(rows[0].length).fill('');
    row[c['incidentId']]=incidentId;row[c['접수시간']]=new Date();row[c['날짜']]=date;row[c['기사ID']]=bus70CanOperate_(requesterId)?'':requesterId;row[c['차량ID']]=vehicleId;row[c['유형']]='사고';row[c['내용']]=/^[=+@-]/.test(content)?"'"+content:content;row[c['상태']]='접수';row[c['요청자']]=requesterId;row[c['처리자']]=requesterId;row[c['사고보고JSON']]=JSON.stringify(record);row[c['보고요청ID']]=key;row[c['보고지문']]=fingerprint;
    is.appendRow(row);committed=true;
    try{writeAudit_(requesterId,bus70RoleFor_(requesterId)||'기사','사건DB',incidentId,'추가',{}, {photoCount:stored.length},'사고 사진 보고');}catch(auditError){/* Receipt remains durable if an audit sink is temporarily unavailable. */}
    return {ok:true,incidentId:incidentId,photoCount:stored.length,message:'사고 보고와 사진 '+stored.length+'장을 접수했습니다.'};
  }catch(e){
    // If append succeeded but its acknowledgement was lost, do not remove evidence.
    const check=is.getDataRange().getDisplayValues(),cc=makeHeaderMap_(check[0]);committed=committed||check.slice(1).some(function(r){return r[cc['보고요청ID']]===requesterId+':'+checked.data.requestId;});
    if(folder&&!committed)try{folder.setTrashed(true);}catch(cleanupError){}
    return bus70AccidentFail_('ACCIDENT_SAVE_UNCONFIRMED','접수 완료를 확인하지 못했습니다. 사진을 유지한 채 같은 내용으로 다시 보내세요.');
  }finally{lock.releaseLock();}
}
function bus70AccidentPhotoGet_(body,requesterId){
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('사건DB');if(!sheet)return bus70AccidentFail_('NOT_FOUND','보고를 찾을 수 없습니다.');
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]),row=rows.slice(1).find(function(r){return String(r[c['incidentId']])===String(body.incidentId||'');});
  if(!row||(!bus70CanOperate_(requesterId)&&String(row[c['요청자']])!==requesterId))return bus70AccidentFail_('NOT_FOUND','사진을 조회할 권한이 없거나 보고가 없습니다.');
  const record=bus70AccidentParse_(row[c['사고보고JSON']]),index=Number(body.index);if(!Number.isInteger(index)||index<0||!record||!record.photos||!record.photos[index])return bus70AccidentFail_('NOT_FOUND','사진을 찾을 수 없습니다.');
  try{const p=record.photos[index],blob=DriveApp.getFileById(p.fileId).getBlob();return {ok:true,mimeType:'image/jpeg',category:p.category,data:Utilities.base64Encode(blob.getBytes())};}catch(e){return bus70AccidentFail_('PHOTO_UNAVAILABLE','저장된 사진을 불러오지 못했습니다. 다시 시도하세요.');}
}
