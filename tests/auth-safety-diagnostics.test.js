const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
function sheet(rows){return {rows,getLastRow(){return rows.length;},getDataRange(){return {getDisplayValues:()=>rows.map(r=>r.map(v=>String(v??''))) };},getRange(r,c){return {getValue:()=>rows[r-1][c-1],setValue:v=>{rows[r-1][c-1]=v;}};}};}
const headers=['accountId','권한','driverId','로그인이름','로그인사번','사용여부','마지막로그인','비고','비밀번호해시','비밀번호변경시간'];
const salt='synthetic-private-salt',password='Synthetic-Only-Password',hash=crypto.createHash('sha256').update(salt+'|'+password).digest('hex');
const accounts=sheet([headers,['SYN-ACCOUNT','마스터','SYN-PRINCIPAL','SyntheticMaster','LegacySecret','Y','','',hash,'']]);
const cache=new Map(),props=new Map([['BUS70_PASSWORD_SALT',salt]]),audits=[],tables={'계정DB':accounts};
let failAudit=false;
const context={console,Date,JSON,Math,Number,String,Object,Array,Set,
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>tables[n]||null})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),formatDate:()=> '2099-01-10'},
  makeHeaderMap_:h=>Object.fromEntries(h.map((v,i)=>[v,i])),normalizeDate_:s=>/^\d{4}-\d{2}-\d{2}$/.test(s)?s:'',
  apiGetDriver_:id=>({ok:true,driver:{driverId:id}}),
  writeAudit_:(...args)=>{if(failAudit)throw Error('synthetic sink unavailable');audits.push(args);}
};vm.createContext(context);
for(const file of ['ManagerDispatch.gs','RoadSafety.gs'])vm.runInContext(fs.readFileSync('apps-script/'+file,'utf8'),context);
assert.equal(context.bus70StaffLogin_('SyntheticMaster',password).ok,true);
assert.equal(context.bus70StaffLogin_('SyntheticMaster','LegacySecret').error,'LOGIN_FAILED','plaintext legacy field cannot bypass password hash');
props.delete('BUS70_PASSWORD_SALT');assert.equal(context.bus70StaffLogin_('SyntheticMaster',password).error,'AUTH_CONFIG_REQUIRED');assert.equal(props.size,0,'login never regenerates a missing salt');props.set('BUS70_PASSWORD_SALT',salt);
accounts.rows[1][5]='';assert.equal(context.bus70StaffLogin_('SyntheticMaster',password).error,'ACCOUNT_DISABLED');accounts.rows[1][5]='Y';
accounts.rows.push(accounts.rows[1].slice());assert.equal(context.bus70StaffLogin_('SyntheticMaster',password).error,'ACCOUNT_DUPLICATE');accounts.rows.pop();
const success={ok:true,driver:{driverId:'SYN-PRINCIPAL'}};
assert(context.bus70RecordLoginAudit_('SyntheticMaster',success));assert(accounts.rows[1][6] instanceof Date);
context.bus70RecordLoginAudit_('SyntheticMaster',{ok:false,error:'LOGIN_FAILED'});context.bus70RecordLoginAudit_('SyntheticMaster',{ok:false,error:'LOGIN_FAILED'});
assert.equal(audits.length,2,'repeated failed attempts are coalesced');
context.bus70RecordLoginAudit_('=malicious submitted name',{ok:false,error:'LOGIN_FAILED'});assert(!JSON.stringify(audits).includes('malicious'));
failAudit=true;assert.equal(context.bus70RecordLoginAudit_('SyntheticMaster',success),false);failAudit=false;
const snapshot=context.bus70AccountAuditSnapshot_(accounts.rows[1],context.makeHeaderMap_(headers));
assert.deepEqual(Object.keys(snapshot),['accountId','권한','driverId','로그인이름','사용여부']);
for(const secret of [password,hash,salt,'LegacySecret']){assert(!JSON.stringify(audits).includes(secret));assert(!JSON.stringify(snapshot).includes(secret));}
context.bus70IsMaster_=()=>true;assert.equal(context.bus70ManagerAccountList_('SYN-REQUESTER').accounts[0].empId,'');
tables['보호시설후보DB']=sheet([['노선','상태','시설명'],['5','후보','합성학교'],['23','후보','다른노선']]);
let data=context.bus70RoadSafetyData_('5');assert.equal(data.available,false);assert.equal(data.diagnostics.reason,'DATASET_MISSING');assert.equal(data.diagnostics.candidateCount,1);assert.equal(data.zones.length,0);
const zh=['zoneId','노선','상태','구분','명칭','위도','경도','진행방위각','제한속도','정류장순번','적용시작','적용종료','시작시각','종료시각','출처','확인일'];
const zr=['SYN-ZONE','5','확정','SCHOOL','합성학교',37,127,0,30,3,'2099-01-01','2099-01-31','','','synthetic fixture','2099-01-01'];
tables['안전운전구역DB']=sheet([zh,zr]);data=context.bus70RoadSafetyData_('5');assert(data.available);assert.equal(data.diagnostics.reason,'READY');
for(const [column,value,reason] of [[2,'후보','NO_VERIFIED_ZONES'],[8,'','NO_VERIFIED_ZONES'],[7,360,'NO_VERIFIED_ZONES'],[5,999,'NO_VERIFIED_ZONES'],[11,'2099-01-09','OUTSIDE_VALIDITY'],[12,'08:00','NO_VERIFIED_ZONES']]){const old=zr[column];zr[column]=value;data=context.bus70RoadSafetyData_('5');assert.equal(data.available,false);assert.equal(data.diagnostics.reason,reason);zr[column]=old;}
data=context.bus70RoadSafetyData_('5');const count=audits.length;context.bus70RoadSafetyAudit_('SYN-PRINCIPAL','5',data);context.bus70RoadSafetyAudit_('SYN-PRINCIPAL','5',data);assert.equal(audits.length,count+1);
assert(!JSON.stringify(audits.at(-1)).includes('합성학교'),'readiness logs contain counts rather than location records');
const safety=require('../road-safety');assert.match(safety.readiness({zones:[],diagnostics:{candidateCount:7}}).message,/실제 경고 중지.*후보 7건/);assert(safety.readiness({zones:[{}]}).ready);assert.match(safety.readiness({zones:[],diagnostics:{reason:'LOAD_ERROR'}}).message,/연결 오류/);
// Exercise the real login entrypoint, including durable-audit failure before session issuance.
vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs','utf8'),context);
context.bus70EnsureInitialAccounts_=()=>{};context.bus70ApplyDueDriverTransitions_=()=>{};context.bus70RoleFor_=()=> 'MASTER';context.apiLogin_=()=>({ok:false,error:'LOGIN_FAILED'});
let issued=0;context.bus70IssueSession_=()=>{issued++;return {token:'synthetic-token',expiresAt:'2099-01-31'};};
assert(context.bus70AuthAction_({action:'loginSecure',name:'SyntheticMaster',empId:password}).ok);assert.equal(issued,1);
assert.equal(context.bus70AuthAction_({action:'loginSecure',name:'SyntheticMaster',empId:'LegacySecret'}).error,'LOGIN_FAILED');assert.equal(issued,1);
failAudit=true;assert.equal(context.bus70AuthAction_({action:'loginSecure',name:'SyntheticMaster',empId:password}).error,'AUTH_AUDIT_UNAVAILABLE');assert.equal(issued,1);
const oldDate=accounts.rows[1][9];assert.equal(context.bus70ChangeStaffPassword_({currentPassword:password,newPassword:'Synthetic-Next'},'SYN-PRINCIPAL').error,'AUTH_AUDIT_UNAVAILABLE');assert.equal(accounts.rows[1][8],hash);assert.equal(accounts.rows[1][9],oldDate);failAudit=false;
console.log('Account hash-only auth, missing-salt and duplicate-account rejection, secret-free login/audit output, last-login timestamp, candidate exclusion, validity filtering and readiness logging passed.');
