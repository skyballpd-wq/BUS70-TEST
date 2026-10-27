const assert=require('node:assert/strict'),gps=require('../driver-automation');
const date='2099-02-03',startTime='12:00',planned=gps.moment(date,startTime);
const stops=Array.from({length:11},(_,i)=>({id:'SYN-'+i,name:'Synthetic '+i,order:i+1,lat:37+i*.0045,lng:127}));
const path={stops,turnIndex:8,pivotIndex:8},points={start:{...stops[0],radiusM:80,departureBearing:0},turn:stops[8],end:stops[10]};
function run({walking=false,early=false,gap=false,wrong=false,queueUntil=32,identity=true,completed=false,parked=false}={}){
 let state={},r,onset;
 function feed(meters,seconds,speed,heading=0){const t=planned+seconds*1000,position={timestamp:t,coords:{latitude:37+meters/111195,longitude:127,accuracy:5,speed,heading}};const navigation={configured:true,timestamp:t,fraction:meters/500,returnConfirmed:false};r=gps.step(state,{position,now:t,date,startTime,points,course:path,navigation,vehicleIdentityAt:identity?planned-60000:0,log:completed?{actualEnd:'observed'}:{},hasTurn:true});state=r.state;return r;}
 feed(0,-15,0);feed(0,-10,0);
 feed(10,early?-5:2,walking?1.2:4,wrong?180:0);onset=planned+2000;
 feed(30,7,walking?1.2:4,wrong?180:0);
 // A brief signal stop does not lose earlier observed vehicle movement.
 for(let t=12;t<=queueUntil;t+=5)feed(parked?70:140,t,0);
 for(let i=0;i<21;i++){r=feed(200+i*45,queueUntil+5+i*5+(gap?20:0),9);if(r.event)break;}
 return {r,onset};
}
let a=run();assert.equal(a.r.event,'DEPART');assert.equal(a.r.position.timestamp,a.onset,'depot motion time, not delayed outside-geofence confirmation');
for(const options of [{walking:true},{early:true},{gap:true},{wrong:true}]){a=run(options);assert.equal(a.r.event,'DEPART');assert(a.r.position.timestamp>a.onset,'discard invalid onset '+JSON.stringify(options));}
for(const queueUntil of [242,482]){a=run({queueUntil});assert.equal(a.r.event,'DEPART');assert.equal(a.r.position.timestamp,a.onset,'a continuously observed long queue retains measured onset');}
a=run({queueUntil:622});assert(a.r.position.timestamp>a.onset,'ten-minute retention is bounded');
for(const options of [{walking:true},{early:true},{gap:true},{wrong:true}]){a=run({...options,queueUntil:242});assert(a.r.position.timestamp>a.onset,'long queues do not weaken onset guards');}
assert.equal(run({queueUntil:242,identity:false}).r.event,null,'onset alone never authorizes departure');
assert.equal(run({queueUntil:242,completed:true}).r.event,null,'completed trip never reopens');
a=run({queueUntil:242,parked:true});assert(a.r.position.timestamp>a.onset,'repositioning followed by a long depot stop is not departure');
console.log('Origin movement retained through stop-and-go confirmation; walking, early, wrong heading and GPS-gap onset rejected');
