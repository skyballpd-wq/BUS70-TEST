const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function extract(name){const a=html.indexOf('function '+name+'(');assert(a>=0);const b=html.indexOf('{',a);let d=0;for(let i=b;i<html.length;i++){if(html[i]==='{')d++;if(html[i]==='}'&&!--d)return html.slice(a,i+1);}throw Error(name);}
const fmt=(date,tz,pattern)=>{const s=new Date(date.getTime()+9*3600000).toISOString();return pattern==='HH:mm'?s.slice(11,16):pattern==='HH:mm:ss'?s.slice(11,19):pattern==='yyyy-MM-dd'?s.slice(0,10):s.slice(0,19).replace('T',' ');};
const server=vm.createContext({Date,console,Utilities:{formatDate:fmt},makeHeaderMap_:a=>Object.fromEntries(a.map((v,i)=>[v,i]))});
vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs','utf8'),server);
const headers=['발차실제','回차실제','도착실제','발차예정'].map(x=>x.replace('回','회'));
const raw=[headers,[new Date('2099-01-08T21:31:52+09:00'),new Date('2099-01-08T00:00:00+09:00'),new Date('2099-01-08T23:56:39+09:00'),new Date('1899-12-30T21:30:00+09:00')]];
const displayed=[headers,['2099. 1. 8 오후 9:31:52','2099. 1. 8','2099. 1. 8','21:30']];
const normalized=server.bus70RunLogReadRows_({getDataRange:()=>({getValues:()=>raw,getDisplayValues:()=>displayed.map(r=>r.slice())})});
assert.equal(normalized[1][0],'2099-01-08 21:31:52');assert.equal(normalized[1][1],'2099-01-08');assert.equal(normalized[1][2],'2099-01-08 23:56:39');assert.equal(normalized[1][3],'21:30');
assert.equal(raw[1][2].toISOString(),'2099-01-08T14:56:39.000Z','read never changes source instants');
assert.equal(server.bus70RunLogDeviationMinutes_('2099-01-08',raw[1][3],raw[1][0]),2);
const front=vm.createContext({Date,Intl,document:{getElementById:()=>({value:'24H'})}});
['canonicalTime','actualClock','actualMoment','scheduleMoment','scheduleComparison','hasNumericValue','displayTime'].forEach(n=>vm.runInContext(extract(n),front));
assert.equal(front.actualClock('2099. 1. 8 오후 9:31:52'),'21:31');
assert.equal(front.actualClock('2099. 1. 9 오전 12:05:00'),'00:05');
assert.equal(front.actualClock('12:05 PM'),'12:05');assert.equal(front.actualClock('25:77'),'');
assert.equal(front.scheduleComparison('2099-01-08','21:30','2099. 1. 8 오후 9:31:52').deltaMinutes,2);
assert.equal(front.scheduleComparison('2099-01-08','23:55','2099. 1. 9 오전 12:05:00').deltaMinutes,10);
assert.equal(front.scheduleComparison('2099-01-08','22:30','2099-01-08').state,'pending');
// A saved deviation must never turn a date-only actual into an on-time result.
function node(tag,text){return {tag,text:text||'',children:[],append(...a){this.children.push(...a);}};}
front.el=node;vm.runInContext(extract('runLogPhaseRow'),front);
const missing=front.runLogPhaseRow({date:'2099-01-08',turnDeviationMinutes:0},'회차','','합성회차지','22:30','2099-01-08','GPS 자동');
assert(!JSON.stringify(missing).includes('정시'));assert(JSON.stringify(missing).includes('시각 확인 필요'));
// Poll the local Android bridge without multiplying network fetches.
let calls=0,now=5000;const doc={hidden:false,getElementById:()=>({value:'2099-01-08'})};
const poll=vm.createContext({document:doc,authToken:'synthetic',currentRole:'',lastSchedule:{},todayLocal:()=> '2099-01-08',hasNativeLocationBridge:()=>true,nativeLocationPolledAt:0,Date:{now:()=>now},window:{Bus70Android:{locationStatus:()=>calls++}}});
vm.runInContext(extract('pollNativeLocation'),poll);poll.pollNativeLocation();poll.pollNativeLocation();assert.equal(calls,1);now+=2000;poll.pollNativeLocation();assert.equal(calls,2);doc.hidden=true;now+=2000;poll.pollNativeLocation();assert.equal(calls,2);
const cockpit=require('../driver-cockpit');
const one=cockpit.nativePosition({latitude:37,longitude:127,accuracy:4,speed:0,timestamp:10000});assert.equal(one.coords.speed,0);
const two=cockpit.nativePosition({latitude:37.0001,longitude:127,accuracy:4,speed:null,timestamp:12000},one);assert.equal(two.coords.heading,0);assert.equal(two.coords.speed,null,'missing speed is not fabricated');
assert.equal(cockpit.nativePosition({latitude:37.0001,longitude:127,accuracy:100,speed:-1,timestamp:12000},one).coords.heading,null);
console.log('Typed timestamps, Korean AM/PM, date-only uncertainty, midnight, native refresh and course tests passed');
assert.equal(front.scheduleComparison('2099-01-08','11:33','2099-01-08 11:33:59').label,'+59초 지연');
assert.equal(front.scheduleComparison('2099-01-08','11:33','2099-01-08 11:34:00').label,'+1분 지연');
assert.equal(front.scheduleComparison('2099-01-08','11:33','2099-01-08 11:32:59').label,'−1초 빠름');
assert.equal(front.scheduleComparison('2099-01-08','21:30','2099. 1. 8 오후 9:31:52').label,'+1분 52초 지연');
