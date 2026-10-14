const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const gps=require('../driver-automation'),cockpit=require('../driver-cockpit'),stops=require('./route5-public-stops');
const trip={startPlace:stops[0].name,endPlace:stops.at(-1).name,turnPlace:'삼정동복지회관',turnLocation:{...stops[55],referenceId:'OPS-SAMJEONG'}};
const path=gps.course(trip,stops);assert.equal(path.stops.length,114);assert.equal(path.turnIndex,55);assert.equal(path.pivotIndex,57);assert.equal(path.stops[57].name,'부천테크노파크3단지300동앞');
let time=Date.now(),prev=null,percent=0,observations=0;
for(let i=0;i<stops.length-1;i++){
 const a=stops[i],b=stops[i+1],length=gps.distance(a,b),n=Math.ceil(length/25);
 for(let j=0;j<n;j++){
  time+=3000;const f=j/n,pos={timestamp:time,coords:{latitude:a.lat+(b.lat-a.lat)*f,longitude:a.lng+(b.lng-a.lng)*f,accuracy:5,speed:length/n/3,heading:gps.bearing(a,b)}};
  const nav=gps.navigate(path,pos,{actualStart:'observed'},prev,time);
  assert.equal(nav.configured,true,`continuous matching failed at ${i+1}/${j}`);assert(nav.tripProgressPercent>=percent,'progress must not run backward');assert(Math.abs(nav.fraction-(i+f))<.3,`wrong stop occurrence ${i} -> ${nav.fraction}`);
  if(i===58)assert(nav.returnConfirmed,'API pivot must separate the two driving directions');
  if(i===56)assert(nav.turnPassed&&!nav.returnConfirmed,'timekeeping turnaround and road pivot must remain distinct');
  percent=nav.tripProgressPercent;prev=nav;observations++;
  if(i===79&&j===0){const held=gps.navigate(path,{...pos,timestamp:time-25000},{actualStart:'observed'},prev,time);assert(!held.configured&&held.retained);assert.equal(held.tripProgressPercent,percent);assert(cockpit.telemetry(pos,time+8000).speed.startsWith('—'));}
 }
}
assert(prev.returnEvidence.length===2);assert(prev.returnEvidence[0].order<prev.returnEvidence[1].order);
const finalStop=stops.at(-1),beforeArrival=prev.returnEvidence;
time+=3000;prev=gps.navigate(path,{timestamp:time,coords:{latitude:finalStop.lat,longitude:finalStop.lng,accuracy:5,speed:3,heading:gps.bearing(stops.at(-2),finalStop)}},{actualStart:'observed'},prev,time);
assert.deepEqual(prev.returnEvidence,beforeArrival,'arrival samples must not replace the preceding return evidence');
// Reopen mid-return with a missed TURN log: bearing chooses the correct occurrence.
const a=stops[82],b=stops[83],p={timestamp:time,coords:{latitude:(a.lat+b.lat)/2,longitude:(a.lng+b.lng)/2,accuracy:5,speed:9,heading:gps.bearing(a,b)}};
const recovered=gps.navigate(path,p,{actualStart:'yes'},null,time);assert(recovered.configured&&recovered.returnConfirmed);assert(recovered.matchedIndex>=82);
// Duplicate native callbacks must preserve bearing, time and speed quality.
const native={timestamp:time,latitude:a.lat,longitude:a.lng,accuracy:4,speed:8,heading:91,speedAccuracy:1,provider:'gps'},first=cockpit.nativePosition(native);
assert.equal(cockpit.nativePosition({...native,heading:null},first),first);
assert.equal(cockpit.telemetry(first,time).speed,'29 km/h');assert.equal(cockpit.telemetry(first,time+7000).speed,'— km/h');assert.equal(cockpit.telemetry({...first,coords:{...first.coords,speedAccuracy:5}},time).speed,'— km/h');
const context=vm.createContext({Date,console});vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs','utf8'),context);
const end={lat:stops.at(-1).lat,lng:stops.at(-1).lng,radiusM:80};const evidence=[111,112].map((index,k)=>({stopId:stops[index].id,observedAt:time-60000+k*30000,latitude:stops[index].lat,longitude:stops[index].lng,accuracy:5}));
const body={latitude:end.lat,longitude:end.lng,returnEvidence:evidence};
assert(context.bus70ObservedArrivalEvidence_(body,stops,end,new Date(time-7200000),new Date(time)));
assert(!context.bus70ObservedArrivalEvidence_({...body,returnEvidence:[]},stops,end,new Date(time-7200000),new Date(time)));
assert(!context.bus70ObservedArrivalEvidence_({...body,returnEvidence:evidence.slice().reverse()},stops,end,new Date(time-7200000),new Date(time)));
assert(!context.bus70ObservedArrivalEvidence_({...body,latitude:37},stops,end,new Date(time-7200000),new Date(time)));
assert(!context.bus70ObservedArrivalEvidence_({...body,returnEvidence:evidence.map(e=>({...e,observedAt:time+1000}))},stops,end,new Date(time-7200000),new Date(time)));
console.log(`${observations} route-coordinate replay samples passed; missing TURN, distinct pivots, return reacquisition, stale marker/speed and evidence validation passed`);

// A missed departure must not suppress a newly observed arrival after two verified return stops.
let recoveryState={};const recoveryLog={},endPoint={lat:finalStop.lat,lng:finalStop.lng,radiusM:80};
for(let k=0;k<2;k++){
 const at=time+4000*(k+1),out=gps.step(recoveryState,{now:at,date:'2099-01-01',startTime:'05:00',log:recoveryLog,hasTurn:true,points:{end:endPoint},navigation:{configured:true,returnConfirmed:true,returnEvidence:evidence},position:{timestamp:at,coords:{latitude:endPoint.lat,longitude:endPoint.lng,accuracy:5}}});
 recoveryState=out.state;assert.equal(out.event,k===1?'ARRIVE':null);
}
assert.deepEqual(recoveryLog,{},'recovery cannot fill an unobserved departure');
