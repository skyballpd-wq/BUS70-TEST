const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('  async function flushGpsOutbox()');
const end = html.indexOf('  async function automaticRunEvent', start);
let now = 100000;
let rejectRequest;
let renders = 0;
let queue = [{key:'SYNTHETIC', driverId:'D1', binding:'D1|A', body:{observedAt:100}, delivered:false}];
const context = vm.createContext({
  Date:{now:()=>now}, Bus70Outbox:require('../driver-outbox'),
  gpsOutboxSending:false, gpsOutboxAttemptAt:0, authToken:'SESSION1', currentDriverId:'D1', currentRole:'',
  hasNativeLocationBridge:()=>false,
  readGpsOutbox:()=>structuredClone(queue), writeGpsOutbox:items=>{queue=items;},
  apiPost:()=>new Promise((resolve,reject)=>{rejectRequest=reject;}),
  locationStatusText:'new session', locationStatusType:'', updateLocationPanel:()=>renders++,
});
vm.runInContext(html.slice(start,end),context);
(async()=>{
  const sending=context.flushGpsOutbox();
  context.authToken='SESSION2';context.currentDriverId='D2';
  rejectRequest(Error('synthetic disconnect'));await sending;
  assert.equal(context.locationStatusText,'new session','old request cannot replace a new session status');
  assert.equal(renders,0);
  assert.equal(queue[0].retryAt,now+15000,'network failure persists the dispatch retry delay');
  assert.equal(queue[0].body.observedAt,100,'original observed time survives');
  context.authToken='SESSION1';context.currentDriverId='D1';now+=6000;
  await context.flushGpsOutbox();assert.equal(context.gpsOutboxSending,false,'no repeated retry after only six seconds');
  now+=10000;const retry=context.flushGpsOutbox();rejectRequest(Error('synthetic disconnect'));await retry;
  assert.equal(renders,1,'current session sees its own connection failure');
  console.log('Outbox persisted network retry and stale-session error isolation passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
