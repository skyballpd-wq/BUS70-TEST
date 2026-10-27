const assert=require('node:assert/strict'),gps=require('../driver-automation');
const date='2099-02-03',stops=Array.from({length:12},(_,i)=>({id:'SYN-'+i,order:i+1,lat:37+i*.0045,lng:127}));
const path={stops,turnIndex:9},points={start:{...stops[0],radiusM:80,departureBearing:0}};
function drive(startTime,{walking=false,noIdentity=false,returning=false,completed=false,gap=false}={}){
 const planned=gps.moment(date,startTime);let state={},r,seconds=-15;
 function feed(meters,speed){seconds+=5;const time=planned+seconds*1000,p={timestamp:time,coords:{latitude:37+meters/111195,longitude:127,accuracy:5,speed,heading:0}};
  r=gps.step(state,{position:p,now:time,date,startTime,points,course:path,navigation:{configured:true,timestamp:time,fraction:meters/500,returnConfirmed:returning},vehicleIdentityAt:noIdentity?0:planned-60000,log:completed?{actualEnd:'observed'}:{}});state=r.state;return r;
 }
 feed(0,0);feed(0,0);feed(0,0);feed(20,walking?1.2:4);const first=planned+5000;
 feed(70,walking?1.2:8);feed(140,walking?1.2:10);
 for(let i=0;i<11;i++){
  const meters=140+i*50;
  for(let wait=0;wait<9;wait++)feed(meters,0);
  if(gap&&i===2)seconds+=50;
  r=feed(meters+50,walking?1.2:10);if(r.event)break;
 }
 return {r,first};
}
for(const start of ['06:00','10:00','14:00','18:00']){const {r,first}=drive(start);assert.equal(r.event,'DEPART','stop-and-go trip '+start+' still confirms departure');assert.equal(r.position.timestamp,first,'retain measured origin motion despite multiple stops');}
for(const options of [{walking:true},{noIdentity:true},{returning:true},{completed:true},{gap:true}])assert.equal(drive('12:00',options).r.event,null,JSON.stringify(options));
console.log('Repeated trips with stop-and-go traffic record measured departure; walking, missing identity, return, completed and GPS-gap guards passed');
