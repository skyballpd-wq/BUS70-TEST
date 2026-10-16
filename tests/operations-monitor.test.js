const fs=require('fs'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
let now=Date.parse('2099-01-10T12:00:00+09:00'),locked=false,propertyReads=0,cacheBroken=false;
const props={},cache=new Map();
const drivers=[['driverId','성명','현재노선','근무조','상태'],['D1','가상기사 하나','5','B','재직'],['D2','가상기사 둘','70','A','재직'],['OLD','가상퇴직','5','B','퇴직'],['M','가상소장','','','재직'],['C','가상정비','','','재직']];
const accounts=[['driverId','권한','사용여부'],['M','소장','Y'],['C','정비소','Y']];
const sheet=rows=>({getLastRow:()=>rows.length,getDataRange:()=>({getDisplayValues:()=>rows})});
const cacheApi={get:key=>{if(cacheBroken)throw Error('cache unavailable');const x=cache.get(key);return x&&x.until>now?x.value:null;},put:(key,value,ttl)=>cache.set(key,{value,until:now+ttl*1000}),getAll:keys=>Object.fromEntries(keys.map(key=>[key,cacheApi.get(key)]).filter(([,value])=>value!==null))};
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const ctx={console,Date:Clock,JSON,Math,Number,String,Object,Array,
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],getUuid:()=>crypto.randomUUID()},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty:(k,v)=>props[k]=v,deleteProperty:k=>delete props[k],getProperties:()=>{propertyReads++;return {...props};}})},
  CacheService:{getScriptCache:()=>cacheApi},LockService:{getScriptLock:()=>({tryLock:()=>!locked,releaseLock:()=>{}})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>name==='기사DB'?sheet(drivers):name==='계정DB'?sheet(accounts):null})},
  makeHeaderMap_:headers=>Object.fromEntries(headers.map((v,i)=>[v,i])),
  bus70IsManager_:id=>['M','MASTER'].includes(id),bus70RoleFor_:id=>id==='M'?'MANAGER':id==='C'?'CENTER':'',
  apiLogin_:()=>({ok:true,driver:{driverId:'D1',name:'가상기사 하나',status:'재직'}}),
  apiGetDriver_:id=>({ok:true,driver:{driverId:id,status:'재직'}}),bus70DriverAlertSettingsGet_:()=>({settings:{}})
};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs','utf8'),ctx);
// Keep the real compatibility route; unrelated dispatch functions stay untouched.
const manager=fs.readFileSync('apps-script/ManagerDispatch.gs','utf8');
vm.runInContext(manager.slice(manager.indexOf('function bus70ManagerAction_'),manager.indexOf('function bus70CanOperate_')),ctx);
ctx.bus70DriverAlertSettingsGet_=()=>({settings:{}});
for(const id of ['D1','C','',null]){assert.equal(ctx.bus70OperationsMonitor_(id).error,'MANAGER_REQUIRED');}
assert.equal(propertyReads,0,'forbidden callers cannot enumerate sessions');
assert.equal(ctx.bus70AuthAction_({action:'managerAccountList',operation:'operationsMonitor',token:'bad'}).error,'AUTH_REQUIRED');
const d1=ctx.bus70IssueSession_('D1'),d1b=ctx.bus70IssueSession_('D1'),d2=ctx.bus70IssueSession_('D2'),m=ctx.bus70IssueSession_('M'),c=ctx.bus70IssueSession_('C');
ctx.bus70IssueSession_('OLD');
const expired=ctx.bus70IssueSession_('D2'),expKey='BUS70_AUTH_'+ctx.bus70TokenHash_(expired.token);
props[expKey]=JSON.stringify({driverId:'D2',expiresAt:now-1});
const legacy=ctx.bus70IssueSession_('D2'),legacyKey='BUS70_AUTH_'+ctx.bus70TokenHash_(legacy.token);
props[legacyKey]=JSON.stringify({driverId:'D2',expiresAt:now+999999});
props.BUS70_PRIVATE_SECRET='DO NOT RETURN';
ctx.bus70AuthAction_({action:'managerAccountUpsert',operation:'presenceHeartbeat',token:d1.token,driverId:'D2'});
let data=ctx.bus70AuthAction_({action:'managerAccountList',operation:'operationsMonitor',token:m.token});
assert.equal(data.ok,true);assert.equal(data.loggedInDrivers,2);assert.equal(data.recentDrivers,1);assert.equal(data.sessions,4);
assert.equal(data.drivers.find(d=>d.driverId==='D1').sessions,2);
assert.equal(data.drivers.find(d=>d.driverId==='D1').state,'RECENT');
assert.equal(data.drivers.find(d=>d.driverId==='D2').state,'UNKNOWN','body driverId cannot spoof another person');
for(const forbidden of ['token','expiresAt','BUS70_AUTH_','DO NOT RETURN',d1.token,ctx.bus70TokenHash_(d1.token)])assert.ok(!JSON.stringify(data).includes(forbidden));
for(const token of [d1.token,c.token])assert.equal(ctx.bus70AuthAction_({action:'managerAccountList',operation:'operationsMonitor',token}).error,'MANAGER_REQUIRED');
now+=181000;assert.equal(ctx.bus70OperationsMonitor_('MASTER').drivers.find(d=>d.driverId==='D1').state,'IDLE');
ctx.bus70AuthAction_({action:'logout',token:d1.token});
data=ctx.bus70OperationsMonitor_('M');assert.equal(data.drivers.find(d=>d.driverId==='D1').sessions,1);assert.equal(data.recentDrivers,0);
ctx.bus70AuthAction_({action:'logout',token:d1b.token});assert.equal(ctx.bus70OperationsMonitor_('M').loggedInDrivers,1);
cache.clear();let traffic=ctx.bus70MonitorTraffic_(cacheApi,now);assert.equal(traffic.fiveMinutes.available,false,'cache absence is unknown, not zero activity');
ctx.bus70ObserveRequest_({action:'loginSecure'},{},{ok:false,error:'PASSWORD SECRET'},false,now-200);
ctx.bus70ObserveRequest_({operation:'driverLiveLocationSave'},{},{ok:true},false,now-400);
ctx.bus70ObserveRequest_({operation:'arbitrary-private-value'},{},null,true,now-600);
traffic=ctx.bus70MonitorTraffic_(cacheApi,now);assert.equal(traffic.fiveMinutes.requests,3);assert.equal(traffic.fiveMinutes.errors,2);assert.equal(traffic.fiveMinutes.exceptions,1);assert.equal(traffic.fiveMinutes.averageMs,400);assert.equal(traffic.fiveMinutes.maxMs,600);
assert.equal(traffic.fiveMinutes.categories.GPS,1);assert.equal(traffic.fiveMinutes.categories.OTHER,1);
assert.ok(!JSON.stringify([...cache.values()]).includes('SECRET'));
locked=true;ctx.bus70ObserveRequest_({},{},{ok:true},false,now);locked=false;
assert.equal(ctx.bus70MonitorTraffic_(cacheApi,now).fiveMinutes.requests,3);assert.equal(ctx.bus70MonitorTraffic_(cacheApi,now).lastContentionAt,now);
cacheBroken=true;assert.equal(ctx.bus70AuthAction_({action:'managerAccountUpsert',operation:'presenceHeartbeat',token:d2.token}).ok,true,'monitor failure must not fail normal API');cacheBroken=false;
now+=3600001;assert.equal(ctx.bus70MonitorTraffic_(cacheApi,now).hour.available,false);
const issued=ctx.bus70AuthAction_({action:'loginSecure',name:'SYNTHETIC',empId:'SYNTHETIC'});assert.equal(issued.ok,true);
assert.equal(ctx.bus70OperationsMonitor_('M').drivers.find(d=>d.driverId==='D1').state,'RECENT','login itself establishes presence');
console.log('Operations monitor: role isolation, session deduplication, logout/expiry, forged identity, legacy/evicted presence, bounded traffic, errors, lock contention and fail-open instrumentation passed');
