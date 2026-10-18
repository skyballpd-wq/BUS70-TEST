const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let reads=0,properties=0,privateReads=0;let enabled='Y';
const context={console,PropertiesService:{getScriptProperties:()=>({getProperty(){properties++;return '';}})},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:()=>({getLastRow:()=>2,getDataRange:()=>({getDisplayValues(){reads++;return [['driverId','권한','사용여부'],['TEST-STAFF','소장',enabled]];}})})})},bus70PrivateDriverOnlyIds_(){privateReads++;return [];},makeHeaderMap_:h=>Object.fromEntries(h.map((v,i)=>[v,i]))};
vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/ManagerDispatch.gs','utf8'),context);
for(let i=0;i<100;i++)assert.equal(context.bus70RoleFor_('TEST-STAFF'),'MANAGER');
assert.deepEqual([reads,properties,privateReads],[1,1,1]);
vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs','utf8'),context);context.bus70AuthDriver_=()=>null;
context.bus70AuthAction_({action:'session',token:'invalid'});enabled='N';assert.equal(context.bus70RoleFor_('TEST-STAFF'),'');assert.equal(reads,2,'next request must see revoked permissions');
const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('  const apiReadFlights='),end=html.indexOf('  function clearLocalAuth',start);
let calls=0,resolve,reject;const client={API_TIMEOUT_MS:45000,API_URL:'https://synthetic.invalid',performance:{now:()=>100},apiFetch(){calls++;return new Promise((a,b)=>{resolve=a;reject=b;});}};vm.createContext(client);vm.runInContext(html.slice(start,end),client);
(async()=>{
 const body={action:'session',token:'SYNTHETIC',date:'2026-01-01'};
 const pending=Array.from({length:10},()=>client.apiPost(body));assert.equal(calls,1);resolve({ok:true});await Promise.all(pending);
 const again=client.apiPost(body);assert.equal(calls,2,'not a response cache');reject(Error('offline'));await assert.rejects(again,/offline/);
 const after=client.apiPost(body);assert.equal(calls,3,'failed request can retry');resolve({ok:true});await after;
 const other=client.apiPost({...body,token:'OTHER'});assert.equal(calls,4);resolve({ok:true});await other;
 const diagnostics=vm.runInContext('JSON.stringify(apiTimings)',client);assert.ok(!diagnostics.includes('SYNTHETIC')&&!diagnostics.includes('OTHER')&&!diagnostics.includes('2026-01-01'));
 console.log('100 role lookups: one sheet read per request; permission revocation visible next request. Ten concurrent identical reads: one fetch; fresh retry and identity isolation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
