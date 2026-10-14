const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const gps=require('../driver-automation'),outbox=require('../driver-outbox'),stops=require('./route5-public-stops');
const date='2099-01-08',startTime='14:41',planned=gps.moment(date,startTime),trip={trip:4,startTime,startPlace:stops[0].name,endPlace:stops.at(-1).name,turnPlace:'삼정동복지회관',turnLocation:{...stops[55],referenceId:'OPS-SAMJEONG'}},path=gps.course(trip,stops),points=gps.resolvePoints(trip,stops);
const position=(index,time,speed)=>({timestamp:time,coords:{latitude:stops[index].lat,longitude:stops[index].lng,accuracy:5,speed,heading:gps.bearing(stops[index],stops[index+1])}});
const reference=(index,time)=>({available:true,source:'GYEONGGI_BUS_LOCATION_V2',stationSeq:stops[index].order,stationId:stops[index].id,fetchedAt:time});
function sample(state,index,time,speed,hint,effective=startTime){const p=position(index,time,speed),nav=gps.navigate(path,p,{actualStart:'matching-only'},null,time,hint);return gps.step(state,{position:p,now:time,date,startTime:effective,points,course:path,navigation:nav,vehicleReference:hint,log:{},hasTurn:true});}
function armed(){let s=sample({},0,planned-10000,0).state;return sample(s,0,planned-6000,0).state;}
// Vehicle-like speed and matching feed still cannot authorize early departure.
let s=armed();for(let k=0;k<2;k++){const t=planned-4000+k*2000,r=sample(s,1,t,6,reference(1,t));s=r.state;assert.equal(r.event,null);}
// A phone carried at walking speed cannot depart against a stationary vehicle reference.
s=armed();for(let k=0;k<4;k++){const t=planned+4000*(k+1),r=sample(s,1,t,1.2,reference(1,t));s=r.state;assert.equal(r.event,null);}
// Fast phone motion without a matched, fresh vehicle reference is insufficient.
for(const hint of [null,reference(113,planned),{...reference(1,planned),source:'OTHER'},reference(1,planned-65000)]){s=armed();for(let k=0;k<2;k++){const r=sample(s,1,planned+4000*(k+1),6,hint);s=r.state;assert.equal(r.event,null);}}
s=armed();let r=sample(s,1,planned+4000,6,reference(1,planned+4000));assert.equal(r.event,null);const first=r.state.departureFix.timestamp;r=sample(r.state,1,planned+8000,6,reference(1,planned+8000));assert.equal(r.event,'DEPART');assert.equal(r.position.timestamp,first);
// Slow bus departure is corroborated by two advancing vehicle stop occurrences.
s=armed();r=sample(s,1,planned+4000,1,reference(1,planned+4000));assert.equal(r.event,null);r=sample(r.state,2,planned+12000,1,reference(2,planned+12000));assert.equal(r.event,null);r=sample(r.state,2,planned+16000,0,reference(2,planned+16000));assert.equal(r.event,'DEPART');
// Confirmed manager timetable changes define the boundary, never handset time.
const adjusted='14:35',early=gps.moment(date,adjusted);s=sample({},0,early-8000,0,null,adjusted).state;s=sample(s,0,early-4000,0,null,adjusted).state;r=sample(s,1,early+4000,6,reference(1,early+4000),adjusted);r=sample(r.state,1,early+8000,6,reference(1,early+8000),adjusted);assert.equal(r.event,'DEPART');
// Delivered legacy events cannot resurrect a corrected departure or block a new one.
const driver='SYN',base={date,dispatchId:'SYN-D',vehicleId:'SYN-V',sequence:1,trip:4,source:'GPS_AUTO',event:'DEPART'},items=[];
outbox.add(items,driver,{...base,observedAt:planned-20*60000});items[0].delivered=true;
let data={date,dispatch:{dispatchId:'SYN-D',vehicleId:'SYN-V'},trips:[trip],runLogs:[{date,sequence:1,trip:4,actualStart:new Date(planned-20*60000).toISOString(),startRecordMode:'GPS 자동'}]};
outbox.overlay(items,driver,data);assert.equal(data.runLogs[0].actualStart,'');assert(items[0].voided);assert.equal(outbox.next(items,driver,planned),null);
outbox.add(items,driver,{...base,observedAt:planned+4000});assert.equal(items.length,2);assert.notEqual(items[0].key,items[1].key);outbox.overlay(items,driver,data);assert.equal(data.runLogs[0].actualStart,new Date(planned+4000).toISOString());
const ctx=vm.createContext({Date,Number,console});vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs','utf8'),ctx);
assert(!ctx.bus70RunLogDepartureAllowed_(date,trip,planned-1));assert(ctx.bus70RunLogDepartureAllowed_(date,trip,planned));assert(ctx.bus70RunLogDepartureAllowed_(date,{...trip,startTime:adjusted},early));assert(!ctx.bus70RunLogDepartureAllowed_(date,{...trip,startTime:''},planned));
assert.equal(ctx.bus70RunLogPlannedAt_(date,'00:30'),gps.moment(date,'00:30'));assert.equal(ctx.bus70RunLogPlannedAt_(date,'25:00'),gps.moment(date,'25:00'));
console.log('No early departure, walking phone, stale/wrong/missing vehicle evidence, slow vehicle progress, manager schedule boundary and legacy event invalidation passed');
