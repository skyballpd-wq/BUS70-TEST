const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const html=fs.readFileSync('index.html','utf8');
function extract(name){const start=html.indexOf('function '+name+'('),brace=html.indexOf('{',start);assert(start>=0);let depth=0;for(let i=brace;i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}'&&!--depth)return html.slice(start,i+1);}throw Error(name);}
const date='2099-01-08',trips=[{trip:1,startPlace:'합성기점',startTime:'05:00',turnPlace:'합성회차',turnTime:'06:00',endPlace:'합성종점',endTime:'07:00'},{trip:2,startPlace:'합성기점',startTime:'08:00',turnPlace:'합성회차',turnTime:'09:00',endPlace:'합성종점',endTime:'10:00'},{trip:3,startPlace:'합성기점',startTime:'11:00'}];
const data={temporalState:'CURRENT',dispatch:{sequence:1},trips,runLogs:[{date,sequence:1,trip:1,actualStart:'05:00',actualEnd:'07:01'},{date,sequence:1,trip:2,actualStart:'08:00'}]};
const c=vm.createContext({Date,console,activeTripIndex:0,document:{getElementById:()=>({value:date})},todayLocal:()=>date});
['scheduleSequence','runLogForTrip','tripCompleted','firstActiveTripIndex','driverLiveContext','driverDisplayedContext','isDisplayedTripLive','tripProgressValue','driverTripProgress'].forEach(n=>vm.runInContext(extract(n),c));
assert.equal(c.driverLiveContext(data).trip.trip,2,'automatic recording continues to follow operating trip');assert.equal(c.driverDisplayedContext(data).trip.trip,1);assert.equal(c.driverDisplayedContext(data).state,'운행 완료');assert.equal(c.isDisplayedTripLive(data),false);
c.activeTripIndex=1;assert.equal(c.driverDisplayedContext(data).trip.trip,2);assert.equal(c.isDisplayedTripLive(data),true);
c.activeTripIndex=2;assert.equal(c.driverDisplayedContext(data).trip.trip,3);assert.equal(c.isDisplayedTripLive(data),false);assert.equal(c.driverLiveContext(data).trip.trip,2,'view selection cannot redirect GPS recording');
c.activeTripIndex=1;assert.equal(c.isDisplayedTripLive({...data,temporalState:'PAST'}),false);assert.equal(c.isDisplayedTripLive({...data,temporalState:'FUTURE'}),false);
const nav={configured:true,trip:2,tripProgressPercent:42};assert.equal(c.tripProgressValue(data,trips[2],2,nav),0);assert.equal(c.tripProgressValue(data,trips[0],0,nav),100);
// Single selected card and independent return navigation remain wired.
assert(html.includes('visibleTrips=[[data.trips[activeTripIndex],activeTripIndex]]'));
assert(html.includes('back.addEventListener("click",resetDriverWorkMenu)'));
for(const code of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]))new vm.Script(code);
console.log('Selected trip, completed/future/history views, GPS independence and inline syntax passed');
