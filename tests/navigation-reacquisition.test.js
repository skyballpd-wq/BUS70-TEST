const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const gps=require('../driver-automation'),stops=require('./route5-public-stops');
const trip={trip:3,startTime:'11:33',startPlace:stops[0].name,endPlace:stops.at(-1).name,turnPlace:'삼정동복지회관',turnLocation:{...stops[55],referenceId:'OPS-SAMJEONG'}};
const path=gps.course(trip,stops),now=Date.parse('2099-01-08T11:48:10+09:00'),log={actualStart:'2099-01-08 11:33:59'};
const fix=(index,time=now)=>({timestamp:time,coords:{latitude:stops[index].lat,longitude:stops[index].lng,accuracy:8,speed:0,heading:null}});
const hint=index=>({available:true,source:'GYEONGGI_BUS_LOCATION_V2',fetchedAt:now-17000,stationSeq:stops[index].order,stationId:stops[index].id.split('-').at(-1)});
// Same-name stops in both directions, including those visible in the field screenshots.
for(const index of [13,15,98,100]){
 const unknown=gps.navigate(path,fix(index),log,null,now);assert(!unknown.configured);
 const found=gps.navigate(path,fix(index),log,unknown,now,hint(index));assert(found.configured);assert.equal(found.fraction,index);assert.equal(found.returnConfirmed,index>57);assert.equal(found.matchSource,'GPS_GBIS');
 assert.equal(found.timestamp,now,'provider query time must not become a GPS observation');
 for(const changed of [{fetchedAt:now-61000},{fetchedAt:now+6000},{stationId:'wrong-stop'},{source:'OTHER'}])assert(!gps.navigate(path,fix(index),log,null,now,{...hint(index),...changed}).configured);
 const stale=gps.navigate(path,{...fix(index),timestamp:now-20000},log,found,now,hint(index));assert(!stale.configured&&stale.retained);assert.equal(stale.tripProgressPercent,found.tripProgressPercent);
}
assert(!gps.navigate(path,fix(15),log,null,now,hint(55)).configured,'distant provider information cannot relocate the phone');
// Reacquire beyond the stale 1.3% marker without using timetable elapsed percent.
const early=gps.navigate(path,fix(1,now-300000),log,null,now-300000,{...hint(1),fetchedAt:now-300000});
const recovered=gps.navigate(path,fix(15),log,early,now,hint(15));assert.equal(recovered.fraction,15);assert.equal(recovered.tripProgressPercent,13.3);
// Accumulated low-speed displacement resolves direction even without GBIS or a speed bearing.
let memory=null;
for(let i=0;i<=3;i++){const a=stops[13],b=stops[14],f=i*.1,time=now+i*15000,p={timestamp:time,coords:{latitude:a.lat+(b.lat-a.lat)*f,longitude:a.lng+(b.lng-a.lng)*f,accuracy:8,speed:.5,heading:null}};memory=gps.navigate(path,p,log,memory,time);}
assert(memory.configured);assert(Math.abs(memory.fraction-13.3)<.01);assert(!memory.returnConfirmed);
const html=fs.readFileSync('index.html','utf8');function extract(name){const start=html.indexOf('function '+name+'('),brace=html.indexOf('{',start);let depth=0;for(let i=brace;i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}'&&!--depth)return html.slice(start,i+1);}throw Error(name);}
const binding={dispatchId:'SYN-DISPATCH',vehicleId:'SYN-VEHICLE'},data={trips:[trip],routeProfile:{stops}},map=new Map();
const c=vm.createContext({lastSchedule:data,navigationMemory:map,Bus70Automation:gps,runLogForTrip:()=>log,driverAssignmentBinding:()=>binding,document:{getElementById:()=>({value:'2099-01-08'})}});vm.runInContext(extract('restoreNativeNavigation'),c);
const snapshot={...recovered,trip:3,date:'2099-01-08',...binding};
c.restoreNativeNavigation({versionCode:71,navigation:snapshot});assert.equal(map.size,1);assert.equal([...map.values()][0].fraction,15);
for(const changed of [{vehicleId:'OTHER'},{dispatchId:'OTHER'},{date:'2099-01-09'},{trip:2}]){map.clear();c.restoreNativeNavigation({versionCode:71,navigation:{...snapshot,...changed}});assert.equal(map.size,0);}
// Payload must retain the road pivot separately from the operating turnaround.
c.authToken='SYNTHETIC';c.currentDriverId='SYN';c.driverAlertSettings={};c.normalizeScheduleTrips=t=>t;c.endOfShiftMeta=()=>null;c.isElectricSchedule=()=>false;c.hasNumericValue=v=>Number.isFinite(Number(v));c.runLogForTrip=()=>log;c.tripLocationPoint=()=>null;c.API_URL='synthetic';vm.runInContext(extract('nativeSchedulePayload'),c);
const payload=c.nativeSchedulePayload(data);assert.equal(payload.trips[0].course.pivotIndex,57);assert.equal(payload.trips[0].course.turnIndex,55);
console.log('Field stop reacquisition, stale/foreign hints, slow movement, background continuity and distinct native pivots passed');
