const assert=require('node:assert/strict');
const engine=require('../ios/Resources/native-engine'),gps=require('../driver-automation'),stops=require('./route5-public-stops');
const date='2099-01-08',startTime='14:41',base=gps.moment(date,startTime);
const trip={trip:4,startTime,turnTime:'15:50',endTime:'17:00',startPlace:stops[0].name,turnPlace:'삼정동복지회관',endPlace:stops.at(-1).name,turnLocation:{...stops[55],referenceId:'OPS-SAMJEONG'}};
trip.course=gps.course(trip,stops);for(const [k,v] of Object.entries(gps.resolvePoints(trip,stops)))trip[k+'Location']=v;
const schedule={driverId:'SYN',date,dispatchId:'SYN-D',vehicleId:'SYN-V',sequence:1,route:'5',voice:true,enabled:true,trips:[trip],token:'MUST-NOT-PERSIST'};
const position=(i,t,speed=6)=>({timestamp:t,coords:{latitude:stops[i].lat,longitude:stops[i].lng,accuracy:5,speed,heading:gps.bearing(stops[i],stops[i+1])}});
const ref=(i,t)=>({crossCheck:{date,dispatchId:'SYN-D',vehicleId:'SYN-V',available:true,source:'GYEONGGI_BUS_LOCATION_V2',stationSeq:stops[i].order,stationId:stops[i].id,fetchedAt:t}});
const step=(state,i,t,speed=6)=>engine.tick(state,position(i,t,speed),t).state;
function armed(){let s=engine.sync({},schedule,base-10000);s=step(s,0,base-10000,0);return step(s,0,base-6000,0);}
let s=armed();assert(!JSON.stringify(s).includes('MUST-NOT-PERSIST'));
for(const speed of [0,1.2,6]){let state=armed();for(let k=0;k<4;k++){const time=base-4000+k*1000;state=step(state,1,time,speed);state=engine.reference(state,ref(1,time),time);}assert.equal(state.outbox.length,0,'never depart early');}
s=armed();for(let k=0;k<4;k++){const t=base+4000+k*4000;s=step(s,1,t,1.2);s=engine.reference(s,ref(1,t),t);}assert.equal(s.outbox.length,0,'walking phone is not a bus');
s=armed();for(let k=0;k<4;k++)s=step(s,1,base+4000+k*4000);assert.equal(s.outbox.length,0,'unmatched handset cannot depart');
s=armed();s=step(s,1,base+4000);s=engine.reference(s,ref(1,base+4000),base+4000);s=step(s,1,base+8000);s=step(s,1,base+12000);
assert.equal(s.outbox.length,1);assert.equal(s.outbox[0].body.event,'DEPART');assert.equal(s.outbox[0].body.observedAt,base+8000,'first qualifying observation retained');
const persisted=JSON.parse(JSON.stringify(s)),key=s.outbox[0].key;
let failed=engine.response(persisted,key,{ok:false},base+16000);assert.equal(engine.next(failed,'OTHER',base+40000),null);assert.equal(engine.next(failed,'SYN',base+20000),null);assert(engine.next(failed,'SYN',base+40000));
let done=engine.response(failed,key,{ok:true},base+40000);assert.equal(engine.next(done,'SYN',base+50000),null);assert(done.schedule.trips[0].actualStart);
let other=engine.sync(done,{...schedule,vehicleId:'SYN-V2'},base+50000);assert.equal(other.identityAt,0);assert.equal(other.reference,null);assert.equal(other.schedule.trips[0].actualStart,undefined);assert.equal(other.outbox.length,1,'old record retained but not applied to replacement vehicle');
const wrong=engine.reference(other,ref(1,base+50000),base+50000);assert.equal(wrong.identityAt,0,'late response does not cross assignment');
const finished={...schedule,trips:[{...trip,actualStart:'observed',actualTurn:'observed',actualEnd:'observed'}]};s=engine.sync({},finished,base);assert(engine.tick(s,position(0,base),base).stop,'private commute cannot reopen completed trip');
assert.throws(()=>engine.sync({},schedule,gps.moment(date,'27:30')),'expired service day');
assert.equal(engine.tick(persisted,position(1,base-60000),base+16000).state.lastFix,persisted.lastFix,'stale fixes ignored');
const f=engine.status(persisted);assert(!('latitude' in f.events[0].body));assert.equal(f.pendingCount,1);
console.log('iOS native engine: departure evidence, no early/walking departure, durable replay, owner/vehicle isolation, shift end and stale sample safeguards passed');
