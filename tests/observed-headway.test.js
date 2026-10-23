const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),cache=new Map();
const c=vm.createContext({console,Date,JSON,CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})}});
vm.runInContext(fs.readFileSync('apps-script/PublicTransitApi.gs','utf8'),c);
const t=2000000000000,stops=Array.from({length:20},(_,i)=>({order:i+1,direction:i<10?'OUTBOUND':'RETURN'}));
function sample(at,a,b,query=''){return c.bus70GyeonggiObserveHeadways_('SYN',{fetchedAt:at,queryTime:query,items:[{plateNo:'SYN-A',vehicleId:'A',stationSeq:a},{plateNo:'SYN-B',vehicleId:'B',stationSeq:b}]});}
let r=sample(t,2,1);assert.equal(r.items[0].passages.length,0);
r=sample(t+45000,3,1);assert.equal(r.items[0].passages.length,1);
sample(t+90000,3,1);sample(t+135000,4,2);r=sample(t+180000,4,3);
let gaps=c.bus70GyeonggiHeadways_(r.items,r.items[1],stops,t+180000);assert.equal(gaps.front.estimatedGapMinutes,2.25.toFixed(1)*1);assert.equal(gaps.front.gapEstimateBasis,'OBSERVED_STOP_INTERVAL');
assert.equal(c.bus70GyeonggiHeadways_(r.items,r.items[0],stops,t+180000).rear.estimatedGapMinutes,gaps.front.estimatedGapMinutes);
assert.equal(c.bus70GyeonggiHeadways_(r.items,r.items[1],stops,t+300000).front,null,'old provider positions not live');
r=sample(t+225000,12,3);assert.equal(r.items[0].passages.length,2,'skipped stops do not create passage times');assert(!c.bus70GyeonggiHeadways_(r.items,r.items[1],stops,t+225000).front,'opposite direction excluded');
r=sample(t+400000,13,4);assert.equal(r.items[0].passages.length,0,'gap drops continuity');
sample(t+445000,13,4,'same');r=sample(t+490000,13,4,'same');assert.equal(r.items[0].observedAt,t+445000,'unchanged upstream query cannot refresh the observation');
cache.clear();r=sample(t,1,1);assert.equal(Object.keys(c.bus70GyeonggiHeadways_(r.items,r.items[0],stops,t)).length,0,'same-stop ordering is unknown');
console.log('Shared-feed interval headways, front/rear, freshness, gaps, opposite direction, repeated upstream query and ambiguous ordering passed');
