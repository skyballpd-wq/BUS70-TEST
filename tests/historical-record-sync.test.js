const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const outbox=require('../driver-outbox'),automation=require('../driver-automation');
const date='2099-01-08',today='2099-01-09',owner='SYN-D1',base={date,sequence:10,trip:6,dispatchId:'SYN-A',vehicleId:'SYN-V',event:'ARRIVE',observedAt:Date.parse(date+'T23:18:07+09:00')};
let items=[];outbox.add(items,owner,base);
const server=[{...base,actualStart:date+' 21:11:44',status:'운행중'}];
let logs=outbox.history(server,JSON.parse(JSON.stringify(items)),owner,date,date);
assert.equal(logs[0].actualEnd,new Date(base.observedAt).toISOString());
assert.equal(outbox.status(logs[0],true),'서버 저장 대기');
assert.equal(server[0].actualEnd,undefined,'query results remain immutable');
assert.equal(outbox.status(server[0],true),'기록 미완료');
assert.equal(outbox.status(server[0],false),'운행중');
assert.equal(outbox.history(server,items,'OTHER',date,date)[0].actualEnd,undefined);
assert.equal(outbox.history([],items,owner,today,today).length,0,'pending yesterday must not enter today');
assert.equal(outbox.history([{...server[0],vehicleId:'OTHER'}],items,owner,date,date).find(l=>l.vehicleId==='OTHER').actualEnd,undefined);
items[0].blocked=true;items[0].error='배차 확인 필요';
logs=outbox.history(server,items,owner,date,date);assert.equal(outbox.status(logs[0],true),'저장 확인 필요');assert.equal(logs[0].pendingEvents[0].error,'배차 확인 필요');
items[0].delivered=true;items[0].recordedAt=date+' 23:18:07';
logs=outbox.history(server,items,owner,date,date);assert.equal(outbox.status(logs[0],true),'완료');assert.equal(logs[0].actualEnd,items[0].recordedAt);
logs=outbox.history([{...server[0],actualEnd:date+' 23:19:08',endRecordMode:'수동'}],items,owner,date,date);assert.equal(logs[0].actualEnd,date+' 23:19:08','server correction wins');

const html=fs.readFileSync('index.html','utf8');
function extract(name){const a=html.indexOf('function '+name+'('),b=html.indexOf('{',a);assert(a>=0);let d=0;for(let i=b;i<html.length;i++){if(html[i]==='{')d++;if(html[i]==='}'&&!--d)return html.slice(a,i+1);}throw Error(name);}
const nodes={workDate:{value:date},runLogFrom:{value:date},runLogTo:{value:date},exportRunLogs:{disabled:true},runLogResult:{replaceChildren(){},prepend(){}}};
const trip={trip:6,startPlace:'합성기점',endPlace:'합성기점',turnPlace:'합성회차',startTime:'21:10',turnTime:'22:16',endTime:'23:22'};
const data={date,temporalState:'PAST',dispatch:{sequence:10,dispatchId:'SYN-A'},vehicle:{vehicleId:'SYN-V'},trips:[trip],runLogs:server};
const c=vm.createContext({Date,console,document:{getElementById:id=>nodes[id]},todayLocal:()=>today,Bus70Automation:automation,activeTripIndex:0});
['scheduleSequence','runLogForTrip','tripCompleted','firstActiveTripIndex','tripOperationalState','driverLiveContext'].forEach(n=>vm.runInContext(extract(n),c));
assert.equal(c.driverLiveContext(data,0).state,'기록 미완료');assert.equal(c.tripOperationalState(data,trip,0).label,'기록 미완료');
const queued={...data,runLogs:[{...server[0],actualEnd:date+' 23:18:07',endRecordMode:'기기 저장·전송 대기'}]};
assert.equal(c.driverLiveContext(queued,0).state,'도착 저장 대기');assert.equal(c.tripOperationalState(queued,trip,0).label,'도착 저장 대기');
const completed={...data,temporalState:'CURRENT',runLogs:[{...server[0],actualEnd:date+' 23:18:07',endRecordMode:'GPS 자동'}]};
// Private travel past the shared depot must not reactivate the completed last trip.
for(let i=0;i<20;i++){assert.equal(c.driverLiveContext(completed,0).state,'운행 완료');assert.equal(c.tripOperationalState(completed,trip,0).label,'완료');}

(async()=>{
  let rendered=[],pending=[];Object.assign(c,{authToken:'session-one',currentRole:'',currentDriverId:owner,runLogRequestId:0,runLogView:null,lastSchedule:data,el:()=>({}),flushGpsOutbox:()=>{},pollNativeLocation:()=>{},renderRunLogRows:logs=>{rendered=logs;},renderSchedule:()=>{},overlayGpsEvents:s=>outbox.overlay(items,owner,s),apiPost:()=>new Promise(resolve=>pending.push(resolve))});
  vm.runInContext(extract('refreshRunLogView'),c);vm.runInContext('async '+extract('loadRunLogs'),c);
  const first=c.loadRunLogs();nodes.runLogFrom.value=today;nodes.runLogTo.value=today;const second=c.loadRunLogs();
  pending[1]({ok:true,logs:[{date:today,trip:1}]});await second;pending[0]({ok:true,logs:server});await first;
  assert.equal(rendered[0].date,today,'late history response cannot replace a newer date');
  const old=c.loadRunLogs();c.authToken='session-two';pending[2]({ok:true,logs:server});await old;assert.equal(rendered[0].date,today,'late old login cannot replace current records');
  nodes.runLogFrom.value=date;nodes.runLogTo.value=date;items[0].delivered=false;const refresh=c.loadRunLogs();pending[3]({ok:true,logs:server});await refresh;
  assert(c.lastSchedule.runLogs[0].actualEnd,'raw history refresh must preserve device arrival overlay');
  console.log('History: yesterday, pending/delivered/blocked, owner/date/vehicle isolation, restart, confirmed completion and stale query races passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
