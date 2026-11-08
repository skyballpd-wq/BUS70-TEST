/* Driver self-enrolment. Public requests never write 기사DB or grant a role.
 * Receipt secrets stay on the requesting device; only hashes reach the sheet.
 * Master approval links the existing driverId, preserving historical dispatch.
 */
const BUS70_SIGNUP_HEADERS_=['requestId','신청시각','성명','사원번호','신청노선','상태','연결기사ID','처리자','처리시각','처리사유','확인토큰해시','확인만료','로그인전환시각'];
const BUS70_SIGNUP_TTL_=7*24*60*60*1000;

function bus70SignupSheet_(create) {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sheet=ss.getSheetByName('가입신청DB');
  if(!sheet&&create){sheet=ss.insertSheet('가입신청DB');sheet.appendRow(BUS70_SIGNUP_HEADERS_);sheet.setFrozenRows(1);}
  return sheet;
}
function bus70SignupData_(sheet) {
  const rows=sheet?sheet.getDataRange().getDisplayValues():[BUS70_SIGNUP_HEADERS_];
  const c=makeHeaderMap_(rows[0]);
  if(BUS70_SIGNUP_HEADERS_.some(h=>c[h]===undefined))throw new Error('가입신청DB 열을 확인하세요.');
  return {rows:rows,c:c};
}
function bus70SignupError_(error,message){return {ok:false,error:error,message:message};}
function bus70SignupName_(value){return String(value||'').trim().normalize('NFC').replace(/\s+/g,' ');}
function bus70SignupSecret_(body){return /^[a-f0-9]{64}$/.test(String(body.receipt||''))?String(body.receipt):'';}
function bus70SignupLocked_(work) {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))return bus70SignupError_('BUSY','다른 요청을 처리 중입니다. 잠시 후 다시 확인하세요.');
  try{return work();}finally{lock.releaseLock();}
}
function bus70SignupReceiptRow_(data,body) {
  const secret=bus70SignupSecret_(body);if(!secret)return -1;
  const hash=bus70TokenHash_(secret),id=String(body.requestId||'');
  return data.rows.findIndex((r,i)=>i>0&&(!id||r[data.c.requestId]===id)&&r[data.c['확인토큰해시']]===hash);
}
function bus70SignupPublicStatus_(row,c) {
  const state=String(row[c['상태']]||'');
  if(Number(row[c['확인만료']])<=Date.now())return {ok:true,status:'EXPIRED',message:'자동 확인 기간이 끝났습니다. 승인 후 성명·사원번호로 로그인하세요.'};
  return {ok:true,requestId:row[c.requestId],status:state,expiresAt:Number(row[c['확인만료']]),
    message:state==='승인'?'승인되었습니다. 로그인할 수 있습니다.':state==='반려'?'신청이 반려되었습니다. 입력정보를 확인하거나 마스터에게 문의하세요.':'마스터 승인 대기 중입니다. 승인되면 이 화면에서 자동으로 로그인합니다.',
    reason:state==='반려'?String(row[c['처리사유']]||''):''};
}

function bus70SignupSubmit_(body) {
  const name=bus70SignupName_(body.name),empId=String(body.empId||'').trim(),route=String(body.route||'70'),secret=bus70SignupSecret_(body);
  if(!/^[가-힣A-Za-z][가-힣A-Za-z .'·-]{1,19}$/.test(name)||!/^\d{6}$/.test(empId)||!['5','23','70'].includes(route)||!secret)
    return bus70SignupError_('SIGNUP_INPUT','실제 성명과 6자리 사원번호를 확인하세요.');
  return bus70SignupLocked_(function(){
    const sheet=bus70SignupSheet_(true),data=bus70SignupData_(sheet),c=data.c,hash=bus70TokenHash_(secret);
    // A lost submit response can be retried with the same device receipt.
    const same=data.rows.find((r,i)=>i>0&&r[c['확인토큰해시']]===hash);
    if(same){
      if(same[c['성명']]!==name||same[c['사원번호']]!==empId||same[c['신청노선']]!==route)return bus70SignupError_('RECEIPT_USED','입력정보가 바뀌었습니다. 새 신청을 시작하세요.');
      return bus70SignupPublicStatus_(same,c);
    }
    const existing=apiLogin_(name,empId);
    if(existing.ok)return {ok:true,status:'REGISTERED',message:'등록된 기사입니다. 성명·사원번호로 로그인하세요.'};
    const active=data.rows.slice(1).filter(r=>r[c['상태']]==='대기');
    if(active.some(r=>r[c['성명']]===name&&r[c['사원번호']]===empId))return {ok:true,status:'ALREADY_PENDING',message:'이미 승인 대기 중입니다. 신청한 휴대폰에서 확인하거나 승인 후 로그인하세요.'};
    const now=Date.now();
    if(active.length>=100||data.rows.slice(1).filter(r=>now-Date.parse(r[c['신청시각']])<3600000).length>=100)
      return bus70SignupError_('SIGNUP_LIMIT','신청이 많아 잠시 후 다시 시도해야 합니다. 마스터에게 문의하세요.');
    const row=new Array(data.rows[0].length).fill('');
    const values={requestId:'JOIN-'+Utilities.getUuid(),'신청시각':new Date(now).toISOString(),'성명':name,'사원번호':empId,'신청노선':route,'상태':'대기','확인토큰해시':hash,'확인만료':String(now+BUS70_SIGNUP_TTL_)};
    Object.keys(values).forEach(k=>row[c[k]]=values[k]);
    const range=sheet.getRange(sheet.getLastRow()+1,1,1,row.length);range.setNumberFormat('@');range.setValues([row]);
    return bus70SignupPublicStatus_(row,c);
  });
}

function bus70SignupStatus_(body) {
  const data=bus70SignupData_(bus70SignupSheet_(false)),i=bus70SignupReceiptRow_(data,body);
  if(i<1)return bus70SignupError_('RECEIPT_INVALID','신청 확인정보를 찾을 수 없습니다. 성명·사원번호로 로그인하거나 마스터에게 문의하세요.');
  return bus70SignupPublicStatus_(data.rows[i],data.c);
}

function bus70SignupComplete_(body) {
  return bus70SignupLocked_(function(){
    const sheet=bus70SignupSheet_(false),data=bus70SignupData_(sheet),i=bus70SignupReceiptRow_(data,body),c=data.c;
    if(i<1)return bus70SignupError_('RECEIPT_INVALID','신청 확인정보를 찾을 수 없습니다.');
    const row=data.rows[i],state=bus70SignupPublicStatus_(row,c);
    if(state.status!=='승인')return bus70SignupError_('APPROVAL_REQUIRED',state.message);
    if(row[c['로그인전환시각']])return bus70SignupError_('RECEIPT_USED','자동 로그인 처리가 끝났습니다. 성명·사원번호로 로그인하세요.');
    const result=apiGetDriver_(row[c['연결기사ID']]),driver=result&&result.driver;
    if(!result.ok||!driver||bus70SignupName_(driver.name)!==row[c['성명']]||String(driver.empId||'')!==row[c['사원번호']]||!bus70DriverLoginActive_(driver)||bus70RoleFor_(driver.driverId))
      return bus70SignupError_('DRIVER_CHANGED','기사정보가 변경되었습니다. 마스터에게 확인하세요.');
    const login=bus70AuthAction_({action:'loginSecure',name:row[c['성명']],empId:row[c['사원번호']],date:body.date});
    if(login.ok&&login.driver.driverId===driver.driverId&&!login.role){sheet.getRange(i+1,c['로그인전환시각']+1).setValue(new Date().toISOString());return login;}
    return bus70SignupError_('LOGIN_UNAVAILABLE','자동 로그인을 확인하지 못했습니다. 성명·사원번호로 로그인하세요.');
  });
}

function bus70SignupDriverData_() {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기사DB');
  if(!sheet)throw new Error('기사DB를 찾을 수 없습니다.');
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]);
  if(['driverId','사원번호','성명','근무조','기사구분','현재노선','상태'].some(k=>c[k]===undefined))throw new Error('기사DB 열을 확인하세요.');
  return {sheet:sheet,rows:rows,c:c};
}
function bus70SignupDriverCandidate_(row,c) {
  return {driverId:row[c.driverId],name:row[c['성명']],empId:row[c['사원번호']],route:row[c['현재노선']],shift:row[c['근무조']],driverType:row[c['기사구분']],status:row[c['상태']],revision:bus70TokenHash_(JSON.stringify(row))};
}
function bus70SignupList_(requesterId) {
  if(!bus70IsMaster_(requesterId))return bus70SignupError_('MASTER_REQUIRED','가입 승인은 마스터만 할 수 있습니다.');
  const data=bus70SignupData_(bus70SignupSheet_(false)),c=data.c,drivers=bus70SignupDriverData_();
  const requests=data.rows.slice(1).filter(r=>r[c.requestId]).map(r=>({requestId:r[c.requestId],name:r[c['성명']],empId:r[c['사원번호']],route:r[c['신청노선']],status:r[c['상태']],requestedAt:r[c['신청시각']],reviewedAt:r[c['처리시각']],reason:r[c['처리사유']],driverId:r[c['연결기사ID']],revision:bus70TokenHash_(JSON.stringify(r)),
    candidates:drivers.rows.slice(1).filter(d=>bus70SignupName_(d[drivers.c['성명']])===r[c['성명']]).map(d=>bus70SignupDriverCandidate_(d,drivers.c))}));
  return {ok:true,requests:requests.filter(r=>r.status==='대기').concat(requests.filter(r=>r.status!=='대기').slice(-30).reverse())};
}

function bus70SignupReview_(body,requesterId) {
  if(!bus70IsMaster_(requesterId))return bus70SignupError_('MASTER_REQUIRED','가입 승인은 마스터만 할 수 있습니다.');
  const decision=String(body.decision||''),reason=String(body.reason||'').trim();
  if(!['승인','반려'].includes(decision)||body.confirmed!==true||reason.length>200||/^[=+@-]/.test(reason))return bus70SignupError_('REVIEW_INPUT','신청 내용을 확인한 뒤 처리하세요.');
  if(decision==='반려'&&!reason)return bus70SignupError_('REASON_REQUIRED','반려 사유를 입력하세요.');
  return bus70SignupLocked_(function(){
    const sheet=bus70SignupSheet_(false),data=bus70SignupData_(sheet),c=data.c,i=data.rows.findIndex((r,j)=>j>0&&r[c.requestId]===String(body.requestId||''));
    if(i<1)return bus70SignupError_('REQUEST_NOT_FOUND','가입 신청을 찾을 수 없습니다.');
    const row=data.rows[i],before=row.slice();
    if(row[c['상태']]!=='대기')return bus70SignupError_('ALREADY_REVIEWED','이미 처리된 신청입니다. 목록을 새로 확인하세요.');
    if(bus70TokenHash_(JSON.stringify(row))!==body.revision)return bus70SignupError_('REQUEST_CHANGED','신청 내용이 바뀌었습니다. 목록을 새로 확인하세요.');
    let driverId='';
    if(decision==='승인'){
      const dd=bus70SignupDriverData_(),dc=dd.c,requestedName=row[c['성명']],empId=row[c['사원번호']];
      driverId=String(body.driverId||'');
      const matches=dd.rows.slice(1).filter(r=>bus70SignupName_(r[dc['성명']])===requestedName);
      let di=dd.rows.findIndex((r,j)=>j>0&&r[dc.driverId]===driverId),target;
      if(driverId==='NEW'){
        if(matches.length)return bus70SignupError_('EXISTING_DRIVER','동일 성명의 기사정보가 있습니다. 기존 기사를 확인하여 연결하세요.');
        const shift=String(body.shift||''),route=String(body.route||row[c['신청노선']]);
        if(!['A','B','예비'].includes(shift)||!['5','23','70'].includes(route))return bus70SignupError_('DRIVER_INPUT','새 기사의 근무조와 노선을 선택하세요.');
        driverId='DRV-'+row[c.requestId];target=new Array(dd.rows[0].length).fill('');di=-1;
        const fields={driverId:driverId,'성명':requestedName,'근무조':shift,'현재노선':route,'기사구분':route==='70'?'양성':'노선','사번구분':'미확인','상태':'재직','TEST':'N','비고':'마스터 가입 승인 · '+row[c.requestId]};
        Object.keys(fields).forEach(k=>{if(dc[k]!==undefined)target[dc[k]]=fields[k];});
      }else{
        if(di<1)return bus70SignupError_('DRIVER_REQUIRED','연결할 기존 기사 또는 신규 등록을 선택하세요.');
        target=dd.rows[di].slice();
        if(bus70TokenHash_(JSON.stringify(target))!==body.driverRevision)return bus70SignupError_('DRIVER_CHANGED','기사정보가 바뀌었습니다. 목록을 새로 확인하세요.');
        if(bus70SignupName_(target[dc['성명']])!==requestedName||target[dc['상태']]!=='재직'||!['양성','예비','노선'].includes(target[dc['기사구분']])||bus70RoleFor_(driverId))return bus70SignupError_('DRIVER_MISMATCH','성명·재직 상태·기사구분을 확인하세요. 퇴직·운영계정은 가입 승인으로 변경할 수 없습니다.');
        if(target[dc['사원번호']]&&target[dc['사원번호']]!==empId)return bus70SignupError_('EMP_CHANGED','등록 사원번호가 다릅니다. 기존 기사정보를 별도로 확인하세요.');
      }
      if(dd.rows.some((r,j)=>j>0&&j!==di&&r[dc['사원번호']]===empId))return bus70SignupError_('EMP_ID_DUPLICATE','다른 기사에게 등록된 사원번호입니다. 중복을 확인하세요.');
      target[dc['사원번호']]=empId;
      if(di>0){
        dd.sheet.getRange(di+1,dc['사원번호']+1).setNumberFormat('@');dd.sheet.getRange(di+1,dc['사원번호']+1).setValue(empId);
        if(dc['비고']!==undefined)dd.sheet.getRange(di+1,dc['비고']+1).setValue(String(target[dc['비고']]||'')+' / 마스터 가입 승인으로 사번 확인·로그인 활성 · '+row[c.requestId]);
      }else{const range=dd.sheet.getRange(dd.sheet.getLastRow()+1,1,1,target.length);range.setNumberFormat('@');range.setValues([target]);}
      // Never assign an operating role, overwrite a driverId, shift or dispatch.
    }
    const edits={'상태':decision,'연결기사ID':driverId,'처리자':requesterId,'처리시각':new Date().toISOString(),'처리사유':reason};
    Object.keys(edits).forEach(k=>{row[c[k]]=edits[k];sheet.getRange(i+1,c[k]+1).setValue(edits[k]);});
    writeAudit_(requesterId,'마스터','가입신청DB',row[c.requestId],decision,{status:before[c['상태']]},{status:decision,driverId:driverId},reason||'기사 본인 신청 확인');
    return {ok:true,status:decision,driverId:driverId,message:decision==='승인'?'승인했습니다. 신청한 휴대폰에서 자동 확인 후 로그인됩니다.':'반려했습니다.'};
  });
}
