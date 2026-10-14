const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const gps=require('../driver-automation'),cases=require('./active-trip-cases.json');
for(const sample of cases){
 const before=JSON.stringify(sample);
 assert.equal(gps.activeIndex(sample.trips,sample.logs,sample.date,gps.moment(sample.date,sample.now)),sample.expected,sample.name);
 assert.equal(JSON.stringify(sample),before,'tracking selection must not write actual event times');
}
const html=fs.readFileSync('index.html','utf8');
function extract(name){const start=html.indexOf('function '+name+'('),brace=html.indexOf('{',start);assert(start>=0);let depth=0;for(let i=brace;i<html.length;i++){if(html[i]==='{')depth++;if(html[i]==='}'&&!--depth)return html.slice(start,i+1);}throw Error(name);}
const sample=cases[0],now=gps.moment(sample.date,sample.now),date=sample.date;
class FixedDate extends Date { static now(){return now;} }
const data={temporalState:'CURRENT',dispatch:{sequence:1},trips:sample.trips.map(t=>({...t,startPlace:'synthetic garage',turnPlace:'synthetic turn',endPlace:'synthetic garage'})),runLogs:[{date,sequence:1,trip:1,...sample.logs[0]}]};
const c=vm.createContext({Date:FixedDate,console,Bus70Automation:gps,activeTripIndex:1,lastSchedule:data,followCurrentTrip:true,document:{getElementById:()=>({value:date})},todayLocal:()=>date});
['scheduleSequence','runLogForTrip','tripCompleted','firstActiveTripIndex','tripOperationalState','driverLiveContext','driverDisplayedContext','isDisplayedTripLive','tripProgressValue','updateDriverLiveDashboard'].forEach(n=>vm.runInContext(extract(n),c));
assert.equal(c.firstActiveTripIndex(data),1,'HTML must not bypass the shared recovery selector');
assert.equal(c.driverDisplayedContext(data).trip.trip,2);
assert.equal(c.driverDisplayedContext(data).state,'출발시각 미기록');
assert.equal(c.isDisplayedTripLive(data),true);
assert.equal(c.tripOperationalState(data,data.trips[0],0).label,'기록 미완료');
assert.equal(c.driverLiveContext(data,0).state,'기록 미완료');
c.activeTripIndex=0;let renders=0;c.renderSchedule=()=>renders++;c.updateDriverLiveDashboard();
assert.equal(c.activeTripIndex,1);assert.equal(renders,1,'live tick immediately moves the visible card with automatic tracking');
const stops=require('./route5-public-stops'),trip={startPlace:stops[0].name,endPlace:stops.at(-1).name,turnPlace:'삼정동복지회관',turnLocation:{...stops[55],referenceId:'OPS-SAMJEONG'}},path=gps.course(trip,stops),a=stops[82],b=stops[83];
const position={timestamp:now,coords:{latitude:(a.lat+b.lat)/2,longitude:(a.lng+b.lng)/2,accuracy:5,speed:9,heading:gps.bearing(a,b)}};
['driverAssignmentBinding','serviceOperationalMinutes','routeNavigationState'].forEach(n=>vm.runInContext(extract(n),c));
data.routeProfile={stops};Object.assign(data.trips[1],trip);
const nav=c.routeNavigationState(data,position);
assert.equal(nav.trip,2,'dashboard navigation uses the recovered current trip');
assert(nav.configured&&nav.tripProgressPercent>70&&nav.tripProgressPercent<80,'current trip GPS progress works without a recorded departure');
assert.equal(gps.navigate(path,position,{},null,now).tripProgressPercent,0,'an upcoming trip is not running just because the position matches');
assert.equal(c.tripProgressValue(data,data.trips[1],1,{...nav,trip:2}),nav.tripProgressPercent);
assert.equal(c.tripProgressValue(data,data.trips[0],0,{...nav,trip:2}),0,'new trip progress must never be applied to stale first-trip history');
console.log(`${cases.length} shared active-trip recovery cases and dashboard/GPS regression passed`);
