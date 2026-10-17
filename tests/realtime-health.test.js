const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const recording=require('../driver-recording');
const input={live:true,now:200000,plannedAt:190000,active:true,gpsFresh:true,actualStart:'',reference:{available:false,error:'GBIS_HTTP_503'}};
let h=recording.health(input);assert(h.blocked);assert.match(h.label,/GPS 수신 중/);assert.match(h.label,/자동 출발 기록 대기/);assert(!h.label.includes('자동 운행기록 중'));
assert(!recording.health({...input,plannedAt:210000}).blocked,'not yet due remains waiting');
assert(!recording.health({...input,actualStart:'observed'}).blocked,'an existing departure is never reset');
assert(!recording.health({...input,live:false}).blocked,'history/completed view remains independent');
assert(recording.health({...input,reference:{available:true,fetchedAt:1}}).blocked,'old provider evidence expires');
assert(!recording.health({...input,reference:{available:true,fetchedAt:199000}}).blocked);
assert(recording.health({...input,reference:{available:true,fetchedAt:201000}}).blocked,'future clock is not fresh proof');
h=recording.health({...input,pending:3,syncError:'offline'});assert.match(h.label,/기기 보관 3건/);assert.match(h.label,/기록 전송 오류/);
assert.match(recording.crossCheckLabel(input.reference,200000),/HTTP 503/);
assert(!recording.crossCheckLabel({available:false,error:'secret-token'},0).includes('secret-token'));
const html=fs.readFileSync('index.html','utf8');
const functions=html.slice(html.indexOf('  function driverLiveRequestScope('),html.indexOf('  function stopDriverFleetTimer('));
let resolve,reject,applied=0,updates=0;
const c=vm.createContext({JSON,authToken:'session-A',currentDriverId:'SYN-A',currentRole:'',lastSchedule:{vehicle:'SYN-V1'},liveFleet:{front:{sequence:1},positions:[{}],crossCheck:{available:true}},liveFleetRequestInFlight:false,
 document:{getElementById:()=>({value:'2099-01-01'})},todayLocal:()=> '2099-01-01',driverAssignmentBinding:data=>({dispatchId:'SYN-D1',vehicleId:data.vehicle}),
 apiPost:()=>new Promise((res,rej)=>{resolve=res;reject=rej;}),applyDriverLiveFleet:()=>applied++,updateDriverLiveDashboard:()=>updates++});
vm.runInContext(functions,c);
(async()=>{
 let p=c.loadDriverLiveLocations(true);reject(Error('offline'));await p;
 assert.match(c.liveFleet.error,/연결 실패/);assert.equal(c.liveFleet.front,null);assert.equal(c.liveFleet.crossCheck,null);assert.equal(c.liveFleet.positions.length,0);assert.equal(updates,1,'silent background failures must reach UI');
 p=c.loadDriverLiveLocations(true);resolve({ok:false,message:'denied'});await p;assert.equal(c.liveFleet.error,'denied');
 p=c.loadDriverLiveLocations(true);c.authToken='session-B';resolve({ok:true});await p;assert.equal(applied,0,'old session response ignored');
 p=c.loadDriverLiveLocations(true);c.lastSchedule.vehicle='SYN-V2';reject(Error('offline'));await p;assert.equal(updates,2,'old vehicle error ignored');
 p=c.loadDriverLiveLocations(true);resolve({ok:true});await p;assert.equal(applied,1);
 for(const code of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]))new vm.Script(code);
 console.log('Fresh GPS/API outage distinction, scheduled waiting, stale evidence, outbox and scoped background errors passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
