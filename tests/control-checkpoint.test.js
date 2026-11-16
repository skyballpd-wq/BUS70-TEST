const assert=require('node:assert/strict'),gps=require('../driver-automation');
const date='2099-01-08',base=gps.moment(date,'22:00');
const point={lat:37,lng:127,radiusM:80,approachBearing:0,departureBearing:0};
const common={date,startTime:'22:00',hasTurn:true,hasControl:true,controlPurpose:'전철 막차 연계',points:{control:point},course:{controlIndex:8,turnIndex:5},log:{actualStart:'recorded',actualTurn:'recorded'}};
function run(options={}){
 let state={},time=base,events=[];
 return (meters,speed=0,heading=0,extra={})=>{time+=4000;const input={...common,...options,now:time,position:{timestamp:time,coords:{latitude:37+meters/111195,longitude:127,accuracy:5,speed,heading}},navigation:{configured:true,fraction:8+meters/1000},...extra};const r=gps.step(state,input);state=r.state;if(r.event)events.push(r);return {r,events,time};};
}
for(const options of [{log:{actualStart:'recorded'}},{course:{controlIndex:-1,turnIndex:5}},{navigation:{configured:false}}]){
 const sample=run(options);for(const m of [0,0,20,120,160]){const x=sample(m,4,0,options.navigation?{navigation:options.navigation}:{});assert.notEqual(x.r.event,'CONTROL','outward/unknown occurrence cannot record a departure');}
}
let sample=run();assert.equal(sample(0).r.event,null);assert.equal(sample(0).r.event,null,'station dwell is not departure');
const moving=sample(20,4);assert.equal(moving.r.event,null);assert.equal(sample(120,4).r.event,null);
let result=sample(160,4);assert.equal(result.r.event,'CONTROL');assert.equal(result.r.position.timestamp,moving.time,'retain measured movement, not scheduled time or delayed confirmation');
sample=run();sample(0);sample(0);sample(-20,4,180);sample(-120,4,180);assert.notEqual(sample(-160,4,180).r.event,'CONTROL','reverse movement rejected');
sample=run();sample(0);sample(0);assert.notEqual(sample(120,4,0,{now:base+120000,position:{timestamp:base+120000,coords:{latitude:37.002,longitude:127,accuracy:5,speed:4,heading:0}}}).r.event,'CONTROL','GPS gap clears visit');
sample=run({controlPurpose:'중간 도착',hasTurn:false,course:null});sample(0);assert.equal(sample(0).r.event,'CONTROL','ordinary arrival checkpoint remains available');
sample=run({log:{actualStart:'recorded',actualTurn:'recorded',actualEnd:'recorded'}});sample(0);assert.equal(sample(0).r.event,null,'completed trip stays complete');
const stops=[{id:'S0',name:'origin',lat:36.9,lng:127,order:1,origin:true},{id:'S1',name:'station',lat:37,lng:127,order:2},{id:'S2',name:'turn',lat:37.1,lng:127,order:3,turnaround:true},{id:'S3',name:'station',lat:37,lng:127,order:4},{id:'S4',name:'origin',lat:36.9,lng:127,order:5}];
assert.equal(gps.course({startPlace:'origin',turnPlace:'turn',endPlace:'origin',controlPoint:'station'},stops).controlIndex,3,'same coordinates retain the ordered return occurrence');
console.log('Ordered control visits, departure movement, reverse leg, stale fixes, ordinary arrival and repeated stop coordinates passed');
