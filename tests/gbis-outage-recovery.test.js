const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const gps=require('../driver-automation');
const date='2099-02-03',startTime='12:00',planned=gps.moment(date,startTime);
const stops=Array.from({length:11},(_,i)=>({id:'SYN-'+i,name:'Synthetic '+i,order:i+1,lat:37+i*.0045,lng:127}));
const path={stops,turnIndex:8,pivotIndex:8},points={start:{...stops[0],radiusM:80},turn:stops[8],end:stops[10]};
function run({identity=planned-60000,speed=10,returning=false,completed=false,shift=0,lateFeed=false,gap=false}={}){
 let state={},result,first;
 const feed=(fraction,time,hint)=>{const position={timestamp:time,coords:{latitude:37+fraction*.0045,longitude:127,accuracy:5,speed,heading:0}};const navigation={configured:true,timestamp:time,fraction,returnConfirmed:returning};return gps.step(state,{position,now:time,date,startTime,points,course:path,navigation,vehicleIdentityAt:identity,vehicleReference:hint,log:completed?{actualEnd:'observed'}:{},hasTurn:true});};
 state=feed(0,planned-10000+shift).state;state=feed(0,planned-5000+shift).state;
 for(let i=0;i<21;i++){
   const fraction=.3+i*.1,time=planned+5000+i*5000+shift+(gap&&i>=5?50000:0);
   const hint=lateFeed&&i>=16?{available:true,source:'GYEONGGI_BUS_LOCATION_V2',fetchedAt:time,stationSeq:3,stationId:'SYN-2'}:null;
   result=feed(fraction,time,hint);state=result.state;if(i===0)first=time;if(result.event)return {result,first};
 }
 return {result,first};
}
let r=run();assert.equal(r.result.event,'DEPART');assert.equal(r.result.position.timestamp,r.first,'save first measured outbound position, not delayed confirmation');
for(const options of [{identity:0},{identity:planned-21*3600000},{speed:1.2},{returning:true},{completed:true},{shift:-600000}])assert.equal(run(options).result.event,null,JSON.stringify(options));
r=run({identity:0,lateFeed:true});assert.equal(r.result.event,'DEPART');assert.equal(r.result.position.timestamp,r.first,'late API corroboration keeps continuous GPS observation time');
r=run({gap:true});assert.equal(r.result.event,null,'a long GPS gap requires new depot evidence');
let previous=Infinity;for(let fraction=8.1;fraction<=10;fraction+=.1){const nav={configured:true,turnPassed:true,matchedMeters:gps.distance(stops[0],{lat:37+fraction*.0045,lng:127}),fraction};const remaining=gps.remainingRoute(path,nav,{});assert.equal(remaining.phase,'도착지');assert(remaining.meters<=previous);previous=remaining.meters;}
assert.equal(gps.remainingRoute(path,{configured:false},{}),null);
// Shared cache, single-flight lease, durable 429 cooldown and Retry-After.
let now=planned,calls=0,http=200,headers={},locked=false,reenter=false,nested;
const cache=new Map(),props=new Map();class Clock extends Date{static now(){return now;}}
const c=vm.createContext({Date:Clock,Math,Number,JSON,console,Utilities:{formatDate:()=>date},CacheService:{getScriptCache:()=>({get:k=>{const x=cache.get(k);return x&&x.until>now?x.value:null;},put:(k,v,ttl)=>cache.set(k,{value:v,until:now+ttl*1000})})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)})},LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>{locked=false;}})},UrlFetchApp:{fetch:()=>{assert.equal(locked,false,'network request must not hold location-upload lock');calls++;if(reenter){reenter=false;nested=c.bus70GyeonggiLiveFetch_('5');}return {getResponseCode:()=>http,getAllHeaders:()=>headers,getContentText:()=>JSON.stringify({response:{msgHeader:{resultCode:0},msgBody:{busLocationList:[]}}})};}}});
vm.runInContext(fs.readFileSync('apps-script/PublicTransitApi.gs','utf8'),c);c.bus70PublicTransitRouteConfig_=r=>({provider:vm.runInContext('BUS70_GYEONGGI_ROUTE_PROVIDER_',c),routeId:r});c.bus70PublicTransitProperty_=()=> 'synthetic-key';c.bus70PublicTransitQueryUrl_=()=> 'https://invalid.test/synthetic';
reenter=true;assert(c.bus70GyeonggiLiveFetch_('5').available);assert.equal(nested.error,'GBIS_REFRESH_PENDING');for(let i=0;i<20;i++)c.bus70GyeonggiLiveFetch_('5');assert.equal(calls,1);
now+=46000;http=429;headers={'Retry-After':'600'};const limited=c.bus70GyeonggiLiveFetch_('5');assert.equal(limited.retryAt,now+600000);assert.equal(calls,2);
cache.clear();assert.equal(c.bus70GyeonggiLiveFetch_('70').error,'GBIS_HTTP_429');assert.equal(calls,2,'cooldown spans routes and survives cache eviction');
now=limited.retryAt;headers={};let again=c.bus70GyeonggiLiveFetch_('5');assert(again.retryAt>=now+600000);assert.equal(calls,3);
now=again.retryAt;http=200;cache.clear();assert(c.bus70GyeonggiLiveFetch_('5').available);assert(!props.has('BUS70_GBIS_COOLDOWN'));assert.equal(calls,4);
assert.equal(JSON.parse(props.get('BUS70_GBIS_REQUEST_5')).requests,4);
assert.equal(c.bus70GyeonggiRetryAfter_({'retry-after':new Date(now+120000).toUTCString()},now),now+120000);
console.log('Outage departure timing, walking/early/completed/identity/gap guards, remaining route distance, shared fetch and durable rate-limit recovery passed');

const page=fs.readFileSync('index.html','utf8'),worker=fs.readFileSync('sw.js','utf8');
for(const [name,version] of [['driver-automation',86],['driver-recording',82],['driver-cockpit',86]]){assert(page.includes(name+'.js?v='+version));assert(worker.includes(name+'.js?v='+version));}
assert(worker.includes('soshin-ops-static-v86-trip-results'));
