const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
let clock=Date.parse('2099-01-08T10:00:00+09:00'),auditFails=false;
class Clock extends Date{constructor(v){super(arguments.length?v:clock);}static now(){return clock;}}
function sheet(rows){return {rows,getLastRow(){return this.rows.length;},getDataRange(){return {getDisplayValues:()=>this.rows.map(r=>r.map(v=>v instanceof Date?v.toISOString():String(v??''))),getValues:()=>this.rows.map(r=>r.slice())};},appendRow(r){this.rows.push(r.slice());},setFrozenRows(){},getRange(row,col){return {setValues:values=>values.forEach((r,i)=>{while(this.rows.length<row+i)this.rows.push([]);r.forEach((v,j)=>this.rows[row+i-1][col+j-1]=v);}),setValue:v=>{this.rows[row-1][col-1]=v;}};}};}
const tables={
 '기사DB':sheet([['driverId','성명','상태','현재노선'],['D1','시험기사1','재직','70'],['D2','시험기사2','재직','5'],['D3','시험기사3','재직','23'],['OLD','시험퇴직','퇴직','5'],['MANAGER','시험소장','재직','5']]),
 '차량DB':sheet([['vehicleId','차량번호','상태'],['V1','시험0001','운행가능'],['V2','시험0002','정비중']]),
 '배차DB':sheet([['dispatchId','날짜','기사ID','차량ID','노선','상태','근무조','순차'],['P1',new Clock('2099-01-08T00:00:00+09:00'),'D1','V1','5','확정','B',1],['P2','2099-01-08','D2','V2','23','확정','B',2],['P3','2099-01-08','D3','V1','5','작성중','B',3]]),
 '사건DB':sheet([['incidentId','요청자'],['I1','D3']]),
 '정비DB':sheet([['maintId','incidentId','현재상태','차량ID','기사ID','입고시간','출고시간'],['M1','I1','접수','V2','D1','','']]),
 '정비이력DB':sheet([['historyId','maintId','처리시간','상태','처리자','내용','예비차량ID','비고']])
};
const audits=[],ctx={Date:Clock,JSON,Number,String,Object,Array,Set,Map,console,
 SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>tables[n]||null,insertSheet:n=>tables[n]=sheet([])})},
 Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],formatDate:d=>new Date(+d+9*3600000).toISOString().slice(0,10)},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 makeHeaderMap_:r=>Object.fromEntries(r.map((v,i)=>[v,i])),normalizeDate_:v=>String(v).slice(0,10),
 bus70ServiceDateKey_:d=>new Date(+d+5.5*3600000).toISOString().slice(0,10),
 bus70RoleFor_:id=>({MANAGER:'MANAGER',MASTER:'MASTER',CENTER:'CENTER'}[id]||''),bus70IsManager_:id=>['MANAGER','MASTER'].includes(id),bus70IsMaster_:id=>id==='MASTER',bus70IsKnownDriver_:id=>['D1','D2','D3'].includes(id),
 bus70EnsureSheetColumns_:(s,cols)=>cols.forEach(h=>{if(!s.rows[0].includes(h)){s.rows[0].push(h);s.rows.slice(1).forEach(r=>r.push(''));}}),
 writeAudit_:(...args)=>{if(auditFails)throw Error('synthetic failure');audits.push(args);}
};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/OperationsNotice.gs','utf8'),ctx);
const plain=x=>JSON.parse(JSON.stringify(x));
let seq=0;const body=(audience='ROUTE',extra={})=>({date:'2099-01-08',audience,route:'5',title:'시험 공지',message:'시험 안내',priority:'URGENT',minutes:60,confirmed:true,requestId:'NOTICE-SYNTHETIC-'+String(++seq).padStart(16,'0'),...extra});
function publish(b){const p=ctx.bus70NoticePreview_(b,'MANAGER');assert.equal(p.ok,true);b.revision=p.revision;return ctx.bus70NoticePublish_(b,'MANAGER');}
assert.equal(ctx.bus70NoticeFeed_('MANAGER').error,'DRIVER_REQUIRED');assert.equal(ctx.bus70NoticePreview_(body(),'D1').error,'MANAGER_REQUIRED');assert.equal(ctx.bus70NoticeFeed_('unknown').error,'DRIVER_REQUIRED');
const p=ctx.bus70NoticePreview_(body(),'MANAGER');assert.deepEqual(plain(p.ids),['D1'],'actual daily route wins over home route');assert.equal(p.targets[0].assignments[0].vehicleNo,'시험0001');assert.equal(tables['운영공지DB'],undefined,'read-only preview does not create DB');
const b=body();assert.equal(publish(b).ok,true);assert.equal(ctx.bus70NoticeFeed_('D1').items.length,1);assert.equal(ctx.bus70NoticeFeed_('D2').items.length,0);assert.equal(ctx.bus70NoticePublish_(b,'MANAGER').replayed,true);assert.equal(tables['운영공지DB'].rows.length,2);assert.equal(ctx.bus70NoticePublish_({...b,message:'다른 내용'},'MANAGER').error,'REQUEST_CHANGED');
const stale=body();stale.revision=ctx.bus70NoticePreview_(stale,'MANAGER').revision;tables['배차DB'].rows[1][3]='V2';assert.equal(ctx.bus70NoticePublish_(stale,'MANAGER').error,'AUDIENCE_CHANGED');tables['배차DB'].rows[1][3]='V1';
assert.equal(ctx.bus70NoticeReceipt_({ids:[b.requestId],event:'RECEIVED'},'D2').error,'NOT_AVAILABLE');
assert.equal(ctx.bus70NoticeReceipt_({ids:[b.requestId,b.requestId],event:'RECEIVED'},'D1').ok,true);let r=ctx.bus70NoticeFeed_('D1').items[0];const received=r.receivedAt;assert(received);assert.equal(r.playedAt,'');assert.equal(r.acknowledgedAt,'');
clock+=1000;ctx.bus70NoticeReceipt_({ids:[b.requestId],event:'PLAYED'},'D1');r=ctx.bus70NoticeFeed_('D1').items[0];assert(r.playedAt);assert.equal(r.acknowledgedAt,'');assert.equal(r.receivedAt,received);
clock+=1000;ctx.bus70NoticeReceipt_({ids:[b.requestId],event:'ACKNOWLEDGED'},'D1');r=ctx.bus70NoticeFeed_('D1').items[0];assert(r.acknowledgedAt);assert.equal(tables['공지수신DB'].rows.length,2);
const direct=body('DRIVER',{driverId:'D2',priority:'NORMAL'});assert.equal(publish(direct).ok,true);ctx.bus70NoticeReceipt_({ids:[direct.requestId],event:'ACKNOWLEDGED'},'D2');assert.equal(ctx.bus70NoticeFeed_('D2').items[0].playedAt,'','explicit acknowledgement is not playback');
ctx.bus70NoticeCancel_({noticeId:b.requestId},'MANAGER');assert.equal(ctx.bus70NoticeFeed_('D1').items.length,0);assert.equal(ctx.bus70NoticeReceipt_({ids:[b.requestId],event:'PLAYED'},'D1').error,'NOT_AVAILABLE');assert.equal(ctx.bus70NoticeCancel_({noticeId:b.requestId},'D1').error,'MANAGER_REQUIRED');
const expiry=body('ALL',{minutes:1440});assert.equal(publish(expiry).ok,true);assert.equal(ctx.bus70NoticeFeed_('D1').items[0].expiresAt,'2099-01-08T18:30:00.000Z','expires at next service boundary');
auditFails=true;const failed=body();assert.equal(publish(failed).error,'SAVE_FAILED');assert(!ctx.bus70NoticeFeed_('D1').items.some(n=>n.id===failed.requestId));assert.equal(ctx.bus70NoticePublish_(failed,'MANAGER').error,'REVIEW_REQUIRED');auditFails=false;
const before=JSON.stringify(tables['정비DB'].rows[1]);assert.equal(ctx.bus70MaintenanceAcknowledge_({maintId:'M1'},'MANAGER').error,'CENTER_REQUIRED');assert.equal(JSON.stringify(tables['정비DB'].rows[1]),before);
assert.equal(ctx.bus70MaintenanceAcknowledge_({maintId:'M1'},'CENTER').ok,true);assert.equal(ctx.bus70MaintenanceAcknowledge_({maintId:'M1'},'CENTER').replayed,true);assert.equal(tables['정비이력DB'].rows.length,2);assert.equal(tables['정비DB'].rows[1][2],'접수');assert.equal(tables['정비DB'].rows[1][5],'');assert.equal(tables['정비DB'].rows[1][6],'');assert.equal(tables['차량DB'].rows[2][2],'정비중');
for(const id of ['D1','D2','D3'])assert(ctx.bus70NoticeFeed_(id).items.some(n=>n.kind==='MAINTENANCE'),'original driver, current assigned driver and reporter receive maintenance response');
const rawHistory=tables['정비이력DB'].rows[1];rawHistory[2]=new Clock(clock);assert(ctx.bus70NoticeFeed_('D1').items.some(n=>n.kind==='MAINTENANCE'),'native sheet Date timestamps survive');
const load=ctx.bus70NoticeManagerLoad_('MANAGER');assert(load.notices.find(n=>n.id===b.requestId).recipients[0].acknowledgedAt);assert(!JSON.stringify(load).includes('비밀번호'));
clock+=8*86400000;assert.equal(ctx.bus70NoticeFeed_('D1').items.length,0);assert.equal(ctx.bus70NoticeReceipt_({ids:[direct.requestId],event:'ACKNOWLEDGED'},'D2').error,'NOT_AVAILABLE');
console.log('Notice audience, authorization, preview revision, idempotency, expiry/cancel, separate receipts, failure journal and maintenance acknowledgement passed.');
