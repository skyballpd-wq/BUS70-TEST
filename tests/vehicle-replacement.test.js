const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('crypto');
let failSheet='',failed=false;
function sheet(name,rows){return {name,rows,getName(){return name;},getLastRow(){let n=this.rows.length;while(n&&!this.rows[n-1].some(x=>x!==''&&x!==undefined))n--;return n;},getDataRange(){return {getDisplayValues:()=>this.rows.map(r=>Array.from({length:this.rows[0].length},(_,i)=>String(r[i]??'')))};},getRange(row,col){const self=this;return {getValue(){return self.rows[row-1]?.[col-1]??'';},setNumberFormat(){return this;},setValue(v){if(name===failSheet&&!failed){failed=true;throw Error('synthetic write failure');}while(self.rows.length<row)self.rows.push([]);self.rows[row-1][col-1]=v;return this;},setValues(v){v.forEach((r,ri)=>r.forEach((x,ci)=>{while(self.rows.length<row+ri)self.rows.push([]);self.rows[row-1+ri][col-1+ci]=x;}));return this;}};},appendRow(r){this.rows.push(r);},setFrozenRows(){}};}
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}),future=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'}),notice=new Date(Date.now()-3600000+9*3600000).toISOString().slice(0,16);
function setup(){
 failSheet='';failed=false;
 const raw={
 '배차DB':[['dispatchId','날짜','노선','근무조','순차','기사ID','차량ID','상태','확정시간','비고','시간표버전'],['P1',future,'5','B','1','D1','V1','확정','OLD','preserved','schedule-A'],['P2',future,'70','B','2','D2','V3','확정','OLD','other route','schedule-B']],
 '차량DB':[['vehicleId','차량번호','차량구분','상태','현재노선','표시순서','비고'],['V1','9001','일반','운행가능','5'],['V2','9002','일반','운행가능','70'],['V3','9003','예비','운행가능','70'],['V4','9004','예비','운행불가','23']],
 '기사DB':[['driverId','성명'],['D1','합성기사']],
 '정비DB':[['maintId','incidentId','요청시간','차량ID','기사ID','요청내용','현재상태','예비차량ID','운행가능일']],
 '사건DB':[['incidentId','접수시간','날짜','기사ID','차량ID','순차','유형','내용','상태','요청자','처리자','비고']],
 '배차확인DB':[['dispatchId','재확인필요'],['P1','N'],['P2','N']],
 '스케줄':[['version','start'],['schedule-A','05:00']], '운행기록DB':[['actual'],['06:05:31']]};
 const sheets=Object.fromEntries(Object.entries(raw).map(([n,r])=>[n,sheet(n,r)]));let locked=false;
 const c={console,Date,SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n]||null,insertSheet:n=>(sheets[n]=sheet(n,[]))}),flush(){}},Utilities:{formatDate:()=>today,DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]},LockService:{getScriptLock:()=>({tryLock(){if(locked)return false;locked=true;return true;},releaseLock(){locked=false;}})},makeHeaderMap_:r=>Object.fromEntries(r.map((x,i)=>[x,i])),normalizeDate_:s=>String(s||'').slice(0,10),newId_:p=>p+'-'+crypto.randomUUID(),bus70IsManager_:id=>['MANAGER','MASTER'].includes(id),bus70IsMaster_:id=>id==='MASTER',writeAudit_(){}};
 vm.createContext(c);vm.runInContext(fs.readFileSync('apps-script/ManagerDispatch.gs','utf8'),c);vm.runInContext(fs.readFileSync('apps-script/VehicleReplacement.gs','utf8'),c);
 // ManagerDispatch declares its own auth helper; exercise explicit requester roles.
 c.bus70IsManager_=id=>['MANAGER','MASTER'].includes(id);c.bus70IsMaster_=id=>id==='MASTER';
 const load=()=>c.bus70ReplacementLoad_({date:future,route:'5'},'MANAGER');
 const body=()=>({requestId:'REPL-'+crypto.randomUUID(),date:future,route:'5',dispatchId:'P1',revision:load().assignments[0].revision,originalVehicleId:'V1',replacementVehicleId:'V2',reportedAt:notice,reportedKind:'통보',type:'고장',reason:'synthetic pump fault',confirmed:true});
 return {c,sheets,load,body,save:b=>c.bus70ReplacementSave_(b,'MANAGER'),locked:()=>locked};
}
assert.match(fs.readFileSync('index.html','utf8'), /<script src="\.\/manager-replacement\.js\?v=882"><\/script>/);
let t=setup(),b=t.body();assert.equal(t.load().vehicles.length,4,'all-route fleet');
assert.equal(t.c.bus70ReplacementLoad_({date:future,route:'5'},'DRIVER').error,'MANAGER_REQUIRED');
assert.equal(t.c.bus70ReplacementSave_(b,'CENTER').error,'MANAGER_REQUIRED');
assert.equal(t.save({...b,revision:'stale'}).error,'DISPATCH_CHANGED');assert.equal(t.save({...b,route:'23'}).error,'DISPATCH_CHANGED');
assert.equal(t.save({...b,replacementVehicleId:'V1'}).error,'SAME_VEHICLE');assert.equal(t.save({...b,replacementVehicleId:'V3'}).error,'VEHICLE_UNAVAILABLE');assert.equal(t.save({...b,replacementVehicleId:'V4'}).error,'VEHICLE_UNAVAILABLE');assert.equal(t.save({...b,replacementVehicleId:'UNKNOWN'}).error,'VEHICLE_NOT_FOUND');
assert.equal(t.save({...b,date:'2020-01-01'}).error,'PAST_DISPATCH');assert.equal(t.save({...b,reportedAt:'2026-02-30T12:00'}).error,'INPUT');assert.equal(t.save({...b,reportedAt:'2099-01-01T12:00'}).error,'FUTURE_NOTICE');assert.equal(t.save({...b,confirmed:false}).error,'INPUT');
assert.equal(t.sheets['차량대차DB'],undefined,'validation never creates operational records');
const before=JSON.stringify(t.sheets['배차DB'].rows),schedule=JSON.stringify(t.sheets['스케줄'].rows),actual=JSON.stringify(t.sheets['운행기록DB'].rows);
assert.equal(t.save(b).ok,true);let p=t.sheets['배차DB'].rows[1];assert.equal(p[6],'V2');assert.equal(p[5],'D1');assert.equal(p[10],'schedule-A');assert.ok(p[9].startsWith('preserved'));assert.deepEqual(t.sheets['배차DB'].rows[2],JSON.parse(before)[2]);
assert.equal(t.sheets['차량DB'].rows[1][3],'정비중');assert.equal(t.sheets['차량DB'].rows[2][4],'70','borrowing never moves home route');assert.equal(t.sheets['정비DB'].rows[1][6],'접수');assert.equal(t.sheets['사건DB'].rows[1][2],notice.slice(0,10));assert.equal(t.sheets['배차확인DB'].rows[1][1],'Y');assert.equal(t.sheets['배차확인DB'].rows[2][1],'N');assert.equal(JSON.stringify(t.sheets['스케줄'].rows),schedule);assert.equal(JSON.stringify(t.sheets['운행기록DB'].rows),actual);
let j=t.sheets['차량대차DB'].rows[1];assert.equal(j[6],future);assert.equal(j[5],notice+'+09:00');assert.equal(j[17],'완료');assert.equal(t.save(b).replayed,true);assert.equal(t.sheets['정비DB'].rows.length,2);assert.equal(t.save({...b,reason:'changed'}).error,'REQUEST_CHANGED');assert.equal(t.locked(),false);
t=setup();t.sheets['정비DB'].rows.push(['M1','I1','','V2','','','접수']);assert.equal(t.save(t.body()).error,'VEHICLE_UNAVAILABLE');
t.sheets['정비DB'].rows[1][6]='완료';t.sheets['정비DB'].rows[1][8]='2099-01-01';assert.equal(t.save(t.body()).error,'VEHICLE_UNAVAILABLE');
t=setup();t.sheets['정비DB'].rows.push(['M1','I1','existing','V1','D1','existing reason','정비중','V4']);const existing=JSON.stringify(t.sheets['정비DB'].rows[1]);assert.equal(t.save(t.body()).ok,true);assert.equal(t.sheets['정비DB'].rows.length,2);assert.equal(JSON.stringify(t.sheets['정비DB'].rows[1]),existing,'open maintenance linked and preserved');assert.equal(t.sheets['차량대차DB'].rows[1][16],'M1');
t=setup();b=t.body();b.type='기타';assert.equal(t.save(b).ok,true);assert.equal(t.sheets['정비DB'].rows.length,1);assert.equal(t.sheets['차량DB'].rows[1][3],'운행가능');
t=setup();b=t.body();failSheet='배차DB';assert.equal(t.save(b).error,'SAVE_FAILED');assert.equal(t.sheets['배차DB'].rows[1][6],'V1');assert.equal(t.sheets['차량DB'].rows[1][3],'운행가능');assert.equal(t.sheets['정비DB'].getLastRow(),1);assert.equal(t.sheets['사건DB'].getLastRow(),1);assert.equal(t.sheets['배차확인DB'].rows[1][1],'N');assert.equal(t.sheets['차량대차DB'].rows[1][17],'실패·원복');assert.equal(t.save(b).error,'REVIEW_REQUIRED');assert.equal(t.locked(),false);
t=setup();let register={vehicleNo:'9010',vehicleRoute:'23',vehicleType:'예비',vehicleStatus:'운행가능',confirmed:true};assert.equal(t.c.bus70ReplacementRegister_(register,'DRIVER').error,'MANAGER_REQUIRED');assert.equal(t.c.bus70ReplacementRegister_({...register,confirmed:false},'MANAGER').error,'INPUT');assert.equal(t.c.bus70ReplacementRegister_(register,'MANAGER').ok,true);let count=t.sheets['차량DB'].rows.length;assert.equal(t.c.bus70ReplacementRegister_({...register,vehicleRoute:'5'},'MASTER').existing,true);assert.equal(t.sheets['차량DB'].rows.length,count);assert.equal(t.sheets['차량DB'].rows.at(-1)[4],'23');
console.log('Vehicle replacement: permissions, date separation, cross-route availability, stale revision, idempotency, rollback, registration, preserved timetable/actuals/maintenance passed');
