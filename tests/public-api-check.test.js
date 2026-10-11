const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const source=fs.readFileSync('apps-script/PublicApiCheck.gs','utf8');

function run(options={}){
  const logs=[],requests=[];
  const properties=new Map([['BUS70_DATA_GO_KR_SERVICE_KEY',options.key===undefined?'fake%2Bsecret%3D':options.key],['BUS70_AUTH_test','keep']]);
  const before=JSON.stringify([...properties]);
  const context={ScriptApp:{AuthMode:{FULL:'FULL'},requireScopes:(mode,scopes)=>{
    assert.equal(mode,'FULL');
    assert.deepEqual(Array.from(scopes),['https://www.googleapis.com/auth/script.external_request']);
    if(options.consentMissing)throw new Error('Authorization required');
  }},PropertiesService:{getScriptProperties:()=>({getProperty:name=>properties.get(name)})},console:{log:text=>logs.push(String(text))},UrlFetchApp:{fetch:(url)=>{
    requests.push(url);
    if(options.fetchError)throw new Error(options.fetchError);
    if(options.network)throw new Error('private URL '+url);
    if(options.xml)return {getResponseCode:()=>403,getContentText:()=>'<returnReasonCode>20</returnReasonCode><returnAuthMsg>SERVICE_ACCESS_DENIED_ERROR</returnAuthMsg>'};
    const parsed=new URL(url),route=parsed.searchParams.get('keyword')||parsed.searchParams.get('routeId').replace('TEST-','');
    let body;
    if(url.includes('getBusRouteListv2'))body={busRouteList:[{routeId:'TEST-'+route,routeName:route,adminName:'부천시'},{routeId:'OTHER',routeName:route,adminName:'수원시'},{routeId:'SUFFIX',routeName:route+'-1',adminName:'부천시'}]};
    else if(url.includes('getBusRouteInfoItemv2'))body={busRouteInfoItem:{routeId:options.wrongId?'WRONG':'TEST-'+route,routeName:route,companyName:options.wrongCompany?'다른회사':'소신여객',startStationName:'가상기점',endStationName:'가상종점'}};
    else body={busRouteStationList:[{stationId:'UP',stationName:'같은이름',stationSeq:1,x:126.7,y:37.5},{stationId:'DOWN',stationName:'같은이름',stationSeq:2,x:126.8,y:37.6,turnYn:'Y'}]};
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({response:{msgHeader:options.noHeader?{}:{resultCode:0},msgBody:body}})};
  }}};
  vm.createContext(context);vm.runInContext(source,context);
  if(options.consentMissing){
    assert.throws(()=>context.BUS70_checkPublicApi(),/Authorization required/);
    assert.equal(requests.length,0);
    assert.equal(logs.length,0);
    assert.equal(JSON.stringify([...properties]),before);
    return;
  }
  const report=context.BUS70_checkPublicApi();
  assert.equal(JSON.stringify([...properties]),before);
  assert.doesNotMatch(logs.join('\n'),/fake|secret|serviceKey=|https:\/\/apis/);
  return {logs,requests,report};
}

run({consentMissing:true});
const normal=run();assert.equal(normal.requests.length,6);assert.equal(normal.report.length,2);
assert.equal(normal.report[0]['정류장수'],2);assert.equal(normal.report[0]['좌표보유수'],2);
assert.equal(normal.report[0]['회차점'][0]['순서'],'2');
assert(normal.requests.every(url=>url.includes('serviceKey=fake%2Bsecret%3D')));
assert(run({key:'fake+secret='}).requests.every(url=>url.includes('serviceKey=fake%2Bsecret%3D')));
assert.equal(run({key:''}).requests.length,0);
for(const options of [{wrongCompany:true},{wrongId:true},{noHeader:true},{network:true},{xml:true}]){
  const checked=run(options);assert(checked.report.every(item=>item['상태']==='점검 필요'));
  assert(!checked.requests.some(url=>url.includes('getBusRouteStationListv2')));
}
assert.match(run({xml:true}).logs.join('\n'),/SERVICE_ACCESS_DENIED_ERROR/);
const noPermission=run({fetchError:'Specified permissions are not sufficient to call UrlFetchApp.fetch. Required permissions: https://www.googleapis.com/auth/script.external_request'});
assert.match(noPermission.logs.join('\n'),/외부요청 권한 부족/);
assert.match(noPermission.logs.join('\n'),/script.external_request/);
const invalidUrl=run({fetchError:'Invalid argument: https://apis.data.go.kr/?serviceKey=fake%2Bsecret%3D decoded fake+secret= raw fake%2Bsecret%3D'});
assert.match(invalidUrl.logs.join('\n'),/Invalid argument/);
assert.match(run({fetchError:'DNS error: https://apis.data.go.kr/?serviceKey=fake%2Bsecret%3D'}).logs.join('\n'),/DNS error/);
console.log('Read-only API checks: provider identity, encoding, error privacy, duplicate-name stops passed');
