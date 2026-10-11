const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function makeSpreadsheet() {
  const sheets = {};
  function makeSheet(name) {
    return sheets[name] = {
      name, rows: [],
      getName(){ return this.name; },
      getLastRow(){ return this.rows.length; },
      getDataRange(){ return {getDisplayValues:() => this.rows.map(row => row.slice())}; },
      getRange(row, col){
        const target = this;
        return {
          setValues(values){
            values.forEach((source, rowOffset) => {
              const rowIndex = row - 1 + rowOffset;
              while (target.rows.length <= rowIndex) target.rows.push([]);
              source.forEach((value, colOffset) => { target.rows[rowIndex][col - 1 + colOffset] = value; });
            });
          },
          setValue(value){
            while (target.rows.length < row) target.rows.push([]);
            target.rows[row - 1][col - 1] = value;
          }
        };
      },
      appendRow(row){ this.rows.push(row.slice()); },
      setFrozenRows(){}
    };
  }
  return {sheets,getSheetByName:name => sheets[name] || null,insertSheet:name => makeSheet(name)};
}

const spreadsheet = makeSpreadsheet();
const requests = [];
const routeRequests = [];
const coordinateRequests = [];
const properties = {
  BUS70_DATA_GO_KR_SERVICE_KEY:'TEST%2BKEY%3D%3D',
  BUS70_PUBLIC_ROUTE_API_CONFIG_JSON:JSON.stringify({routes:{
    '5':{routeId:'SYNTHETIC-R5',routeNo:'5',ctpvCode:'41',sggCode:'41190'}
  }})
};
const responseItems = [
  {OPR_YMD:'20990302',RTE_ID:'SYNTHETIC-R5',RTE_NO:'5',STTN_SEQ:1,STTN_ID:'SYN-STOP-1',STTN_NM:'가상기점',CTPV_CD:'41',SGG_CD:'41190',GPSLATI:'37.1001',GPSLONG:'126.8001'},
  {OPR_YMD:'20990302',RTE_ID:'SYNTHETIC-R5',RTE_NO:'5',STTN_SEQ:2,STTN_ID:'SYN-STOP-2',STTN_NM:'가상중간',CTPV_CD:'41',SGG_CD:'41190'},
  {OPR_YMD:'20990302',RTE_ID:'SYNTHETIC-R5',RTE_NO:'5',STTN_SEQ:3,STTN_ID:'SYN-STOP-3',STTN_NM:'가상종점',CTPV_CD:'41',SGG_CD:'41190'}
];
const context = {
  console, JSON, Date, Number, String, Object, Array, Math,
  normalizeDate_:value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : '',
  PropertiesService:{getScriptProperties:() => ({getProperty:key => properties[key] || ''})},
  SpreadsheetApp:{getActiveSpreadsheet:() => spreadsheet},
  LockService:{getScriptLock:() => ({waitLock(){},releaseLock(){}})},
  UrlFetchApp:{fetch:(url) => {
    requests.push(url);
    if (url.includes('/busstationservice/v2/getBusStationListv2')) {
      coordinateRequests.push(url);
      const decoded=decodeURIComponent(url);
      const stations=decoded.includes('keyword=가상중간')?[{stationId:'SYN-STOP-2',stationName:'가상중간',mobileNo:'22002',regionName:'가상시',x:'126.9222',y:'37.2222',centerYn:'N'}]:[];
      return {getResponseCode:() => 200,getContentText:() => JSON.stringify({response:{msgHeader:{resultCode:0,resultMessage:'정상적으로 처리되었습니다.'},msgBody:{busStationList:stations}}})};
    }
    routeRequests.push(url);
    return {getResponseCode:() => 200,getContentText:() => JSON.stringify({response:{header:{resultCode:'00',resultMsg:'NORMAL SERVICE'},body:{totalCount:responseItems.length,items:{item:responseItems}}}})};
  }}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('apps-script/PrivateRouteStore.gs','utf8'),context);
vm.runInContext(fs.readFileSync('apps-script/PublicTransitApi.gs','utf8'),context);

const status=context.bus70PublicTransitStatus_('5');
assert.equal(status.ready,true);
assert.equal(status.keyConfigured,true);
assert.equal(status.coordinateFeedConfigured,true);
assert.doesNotMatch(JSON.stringify(status),/TEST%2BKEY/);

const legacyReference={ok:true,date:'2099-03-01',route:'5',routeProfile:{stops:[
  {id:'LEGACY-1',name:'가상기점',order:1,direction:'전체',lat:37.1,lng:126.8},
  {id:'LEGACY-2',name:'가상중간',order:2,direction:'전체',lat:37.2,lng:126.9},
  {id:'LEGACY-3',name:'가상종점',order:3,direction:'전체',lat:37.3,lng:127.0}
]},trips:[]};
assert.equal(context.bus70SyncRouteReferenceToDb_(spreadsheet,'5',legacyReference).stopAdded,3);

const preview=context.bus70PublicTransitImportPreview_({route:'5',date:'2099-03-02'});
assert.equal(preview.ok,true);
assert.equal(preview.changed,true);
assert.equal(preview.stopCount,3);
assert.equal(preview.coordinateCount,3);
assert.equal(preview.unresolvedCoordinateCount,0);
assert.equal(preview.nameReviewCount,1);
assert.equal(preview.coordinateApiMatchedCount,1);
assert.equal(preview.coordinateApiQueryCount,2);
assert.equal(preview.coordinateApiWarning,'');
assert.equal(preview.firstStop,'가상기점');
assert.equal(preview.lastStop,'가상종점');
assert.ok(preview.previewToken);
assert.ok(requests.every(url => url.includes('serviceKey=TEST%2BKEY%3D%3D')));
assert.ok(requests.every(url => !url.includes('%252B')));
assert.ok(routeRequests.every(url => url.includes('OPR_YMD=20990302')));
assert.ok(routeRequests.every(url => url.includes('RTE_ID=SYNTHETIC-R5')));
assert.ok(routeRequests.every(url => url.includes('CTPV_CD=41')));
assert.ok(routeRequests.every(url => url.includes('SGG_CD=41190')));
assert.ok(coordinateRequests.every(url => url.includes('format=json')));
assert.ok(coordinateRequests.some(url => url.includes('keyword=%EA%B0%80%EC%83%81%EC%A4%91%EA%B0%84')));

const ambiguous=context.bus70PublicTransitEnrichCoordinates_([{id:'AMB-1',name:'중복정류장',number:'',externalStopId:'NO-MATCH',lat:null,lng:null,provider:'MOLIT_ROUTE_SPECIFIC_STOP'}],[],[
  {externalStopId:'A',name:'중복정류장',number:'1',lat:37.1,lng:126.8,coordinateProvider:'GYEONGGI_BUS_STATION_V2'},
  {externalStopId:'B',name:'중복정류장',number:'2',lat:37.2,lng:126.9,coordinateProvider:'GYEONGGI_BUS_STATION_V2'}
]);
assert.equal(ambiguous[0].coordinateStatus,'UNRESOLVED');
assert.equal(ambiguous[0].reviewStatus,'좌표보완필요');
const directionalPair=context.bus70PublicTransitEnrichCoordinates_([
  {id:'R5-UP-10',name:'동일정류장',number:'',externalStopId:'UP-STOP-ID',order:10,direction:'상행',lat:null,lng:null,provider:'MOLIT_ROUTE_SPECIFIC_STOP'},
  {id:'R5-DOWN-42',name:'동일정류장',number:'',externalStopId:'DOWN-STOP-ID',order:42,direction:'하행',lat:null,lng:null,provider:'MOLIT_ROUTE_SPECIFIC_STOP'}
],[],[
  {externalStopId:'UP-STOP-ID',name:'동일정류장',number:'31001',lat:37.501,lng:126.801,coordinateProvider:'GYEONGGI_BUS_STATION_V2'},
  {externalStopId:'DOWN-STOP-ID',name:'동일정류장',number:'31002',lat:37.502,lng:126.802,coordinateProvider:'GYEONGGI_BUS_STATION_V2'}
]);
assert.equal(directionalPair[0].coordinateStatus,'PUBLIC_STOP_ID');
assert.equal(directionalPair[1].coordinateStatus,'PUBLIC_STOP_ID');
assert.notEqual(directionalPair[0].lat,directionalPair[1].lat);
assert.equal(directionalPair[0].direction,'상행');
assert.equal(directionalPair[1].direction,'하행');
assert.deepEqual(context.bus70PublicTransitCoordinateItems_({response:{msgHeader:{resultCode:4},msgBody:{}}}).items,[]);

const stopSheet=spreadsheet.getSheetByName('노선_5_정류장DB'),beforeInvalid=stopSheet.rows.length;
const stale=context.bus70PublicTransitImportApply_({route:'5',date:'2099-03-02',previewToken:'wrong-token'},'D1');
assert.equal(stale.error,'PUBLIC_IMPORT_STALE');
assert.equal(stopSheet.rows.length,beforeInvalid);

const applied=context.bus70PublicTransitImportApply_({route:'5',date:'2099-03-02',previewToken:preview.previewToken},'D1');
assert.equal(applied.ok,true);
assert.equal(applied.rowsWritten,3);
assert.match(applied.dataSetId,/^R5-20990302-/);
const stored=context.bus70RouteStopsFromDb_('5','2099-03-02');
assert.equal(stored.dataSetId,applied.dataSetId);
assert.equal(stored.stops.length,3);
assert.equal(stored.stops[0].externalStopId,'SYN-STOP-1');
assert.equal(stored.stops[1].lat,37.2222);
assert.equal(stored.stops[1].number,'22002');
assert.equal(stored.stops[1].coordinateProvider,'GYEONGGI_BUS_STATION_V2');
assert.equal(stored.stops[1].coordinateStatus,'PUBLIC_STOP_ID');
assert.equal(stored.stops[2].provider,'MOLIT_ROUTE_SPECIFIC_STOP');
assert.equal(stored.stops[2].reviewStatus,'이름일치검토');

const repeatPreview=context.bus70PublicTransitImportPreview_({route:'5',date:'2099-03-02'});
assert.equal(repeatPreview.changed,false);
assert.equal(repeatPreview.nameReviewCount,1);
const repeatApply=context.bus70PublicTransitImportApply_({route:'5',date:'2099-03-02',previewToken:repeatPreview.previewToken},'D1');
assert.equal(repeatApply.rowsWritten,0);

const missing=context.bus70PublicTransitImportPreview_({route:'70',date:'2099-03-02'});
assert.equal(missing.error,'PUBLIC_ROUTE_CONFIG_REQUIRED');

const originalConfig=properties.BUS70_PUBLIC_ROUTE_API_CONFIG_JSON;
properties.BUS70_PUBLIC_ROUTE_API_CONFIG_JSON=JSON.stringify({routes:{'5':{routeId:'SYNTHETIC-R5',routeNo:'5',ctpvCode:'41',sggCode:'41190',coordinateEndpoint:'https://example.com/unsafe'}}});
const invalidCoordinateEndpoint=context.bus70PublicTransitStatus_('5');
assert.equal(invalidCoordinateEndpoint.ready,false);
assert.match(invalidCoordinateEndpoint.message,/공공데이터포털 HTTPS/);
properties.BUS70_PUBLIC_ROUTE_API_CONFIG_JSON=originalConfig;

const source=fs.readFileSync('apps-script/PublicTransitApi.gs','utf8');
assert.doesNotMatch(source,/TEST%2BKEY/);
assert.match(source,/BUS70_DATA_GO_KR_SERVICE_KEY/);
assert.match(source,/PUBLIC_IMPORT_STALE/);

console.log('Public transit API tests passed');

// Round-trip feed: data identity, separate same-name stops, non-destructive
// persistence, repeat runs, historical dates and owner-editor setup.
const gbisSheet=makeSpreadsheet(),gbisLogs=[],gbisRequests=[];
const gbisProps={BUS70_DATA_GO_KR_SERVICE_KEY:'TEST%2BKEY%3D%3D',BUS70_AUTH_keep:'session',BUS70_PUBLIC_ROUTE_API_CONFIG_JSON:JSON.stringify({routes:{'99':{routeId:'KEEP'}}})};
let gbisFault='';
const gbisContext={console:{log:v=>gbisLogs.push(String(v))},JSON,Date,Number,String,Object,Array,Math,
  normalizeDate_:context.normalizeDate_,
  ScriptApp:{AuthMode:{FULL:'FULL'},requireScopes(){}},
  Utilities:{formatDate:()=> '2099-03-02'},
  PropertiesService:{getScriptProperties:()=>({getProperty:n=>gbisProps[n]||'',setProperty:(n,v)=>{gbisProps[n]=v;}})},
  SpreadsheetApp:{getActiveSpreadsheet:()=>gbisSheet},
  LockService:context.LockService,
  UrlFetchApp:{fetch:(url,options)=>{
    gbisRequests.push(url);assert.equal(options.followRedirects,false);
    assert(url.startsWith('https://apis.data.go.kr/6410000/busrouteservice/v2/'));
    const parsed=new URL(url),route=parsed.searchParams.get('keyword')||parsed.searchParams.get('routeId').replace('SYN-','');
    let body;
    if(url.includes('getBusRouteListv2'))body={busRouteList:[{routeId:'SYN-'+route,routeName:route,adminName:'부천시'},{routeId:'WRONG',routeName:route+'-1',adminName:'부천시'}]};
    else if(url.includes('getBusRouteInfoItemv2'))body={busRouteInfoItem:{routeId:'SYN-'+route,routeName:route,companyName:gbisFault==='company'?'다른회사':'소신여객',startStationId:'START',turnStID:'TURN'}};
    else body={busRouteStationList:[
      {stationSeq:1,stationId:'START',stationName:'가상기점',x:126.8,y:37.1,turnSeq:3},
      {stationSeq:2,stationId:'UP',stationName:'같은이름',x:126.9,y:37.2,turnSeq:3},
      {stationSeq:3,stationId:'TURN',stationName:'가상회차지',x:127,y:37.3,turnYn:gbisFault==='turn'?'N':'Y',turnSeq:3},
      {stationSeq:gbisFault==='sequence'?2:4,stationId:'DOWN',stationName:'같은이름',x:126.91,y:gbisFault==='coordinate'?null:37.21,turnSeq:3},
      {stationSeq:5,stationId:'START',stationName:'가상기점',x:126.8,y:37.1,turnSeq:3}
    ]};
    return {getResponseCode:()=>gbisFault==='http'?403:200,getContentText:()=>JSON.stringify({response:{msgHeader:gbisFault==='header'?{}:{resultCode:0},msgBody:body}})};
  }}
};
vm.createContext(gbisContext);
for(const file of ['PrivateRouteStore','PublicTransitApi'])vm.runInContext(fs.readFileSync('apps-script/'+file+'.gs','utf8'),gbisContext);
// A failed initial import must not write either route or replace configuration.
for(const fault of ['company','turn','sequence','coordinate','header','http']){
  gbisFault=fault;const before=JSON.stringify(gbisProps);
  gbisContext.BUS70_importGyeonggiRouteStops();
  assert.equal(JSON.stringify(gbisProps),before);assert.equal(Object.keys(gbisSheet.sheets).length,0);
}
gbisFault='';
gbisContext.BUS70_importGyeonggiRouteStops();
assert.equal(gbisProps.BUS70_AUTH_keep,'session');
assert.equal(JSON.parse(gbisProps.BUS70_PUBLIC_ROUTE_API_CONFIG_JSON).routes['99'].routeId,'KEEP');
assert.equal(gbisContext.bus70PublicTransitStatus_('5').ready,true);
for(const route of ['5','70']){
  const saved=gbisContext.bus70RouteStopsFromDb_(route,'2099-03-02').stops;
  assert.equal(saved.length,5);assert.equal(new Set(saved.map(s=>s.id)).size,5);
  assert.equal(saved[1].name,saved[3].name);assert.notEqual(saved[1].lat,saved[3].lat);
  assert.equal(saved[2].turnaround,true);assert.equal(saved[2].terminal,true);
  assert.equal(saved[4].terminal,false);assert.equal(saved[3].direction,'회차→기점');
  assert.equal(saved[4].externalStopId,saved[0].externalStopId);
  const profile=gbisContext.bus70PrivateRouteProfile_(route,{},'2099-03-02',{});
  assert.equal(profile.stops[2].turnaround,true);assert.equal(profile.stops[2].provider,'GYEONGGI_BUS_ROUTE_V2');
  assert.equal(gbisContext.bus70RouteStopsFromDb_(route,'2099-03-01').stops.length,0);
}
const sizes=Object.values(gbisSheet.sheets).map(s=>s.rows.length);
gbisContext.BUS70_importGyeonggiRouteStops();
assert.deepEqual(Object.values(gbisSheet.sheets).map(s=>s.rows.length),sizes);
assert.equal(gbisContext.bus70PublicTransitImportPreview_({route:'5',date:'2099-03-01'}).error,'PUBLIC_CURRENT_DATA_ONLY');
const p=gbisContext.bus70PublicTransitImportPreview_({route:'5',date:'2099-03-02'});
assert.equal(p.coordinateCount,5);assert.equal(p.turnStops[0].order,3);
assert.equal(p.coordinateApiNetworkRequestCount,0);assert.equal(p.liveNavigationReady,true);
assert.doesNotMatch(gbisLogs.join('\n'),/TEST%2BKEY|TEST\+KEY|serviceKey=|https:\/\/apis/);
console.log('Gyeonggi integration: identity, turnaround, duplicate occurrences, permissions, history and idempotence passed');
