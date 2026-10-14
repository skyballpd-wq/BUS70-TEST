/*
 * Public-data route stop importer.
 *
 * The data.go.kr service key is read only from Script Properties. It is never
 * returned to the browser, written to a sheet, logged, or stored in Git.
 * Route-specific IDs and region codes are non-secret configuration kept in
 * BUS70_PUBLIC_ROUTE_API_CONFIG_JSON.
 */

const BUS70_PUBLIC_ROUTE_STOPS_ENDPOINT_='https://apis.data.go.kr/1613000/BusRoutespecificStopInformation/getBusRoutespecificStopInformation';
const BUS70_PUBLIC_ROUTE_PROVIDER_='MOLIT_ROUTE_SPECIFIC_STOP';
const BUS70_PUBLIC_STOP_COORDINATE_ENDPOINT_='https://apis.data.go.kr/6410000/busstationservice/v2/getBusStationListv2';
const BUS70_PUBLIC_STOP_COORDINATE_PROVIDER_='GYEONGGI_BUS_STATION_V2';
const BUS70_GYEONGGI_ROUTE_PROVIDER_='GYEONGGI_BUS_ROUTE_V2';
const BUS70_GYEONGGI_ROUTE_BASE_='https://apis.data.go.kr/6410000/busrouteservice/v2/';

// Run once from the bound spreadsheet's Apps Script editor. The prompt appears
// in the spreadsheet tab, even when project settings are read-only (>50 keys).
function BUS70_setupPublicDataKey() {
  const ui=SpreadsheetApp.getUi();
  const answer=ui.prompt('BUS70 공공데이터 인증키 등록',
    '공공데이터포털의 일반 인증키를 붙여넣으세요. 기존 키가 있으면 교체합니다.',ui.ButtonSet.OK_CANCEL);
  if(answer.getSelectedButton()!==ui.Button.OK)return;
  const key=String(answer.getResponseText()||'').trim();
  if(!key||/\s/.test(key)||/^https?:/i.test(key)) {
    ui.alert('저장하지 않았습니다. 주소가 아닌 인증키 한 개만 입력하세요.');
    return;
  }
  try {
    const props=PropertiesService.getScriptProperties();
    props.setProperty('BUS70_DATA_GO_KR_SERVICE_KEY',key);
    if(props.getProperty('BUS70_DATA_GO_KR_SERVICE_KEY')!==key)throw new Error('VERIFY_FAILED');
  } catch(error) {
    ui.alert('인증키 저장을 확인하지 못했습니다. 프로젝트 권한과 속성 저장 용량을 확인하세요.');
    return;
  }
  ui.alert('인증키 저장 완료. 다음은 노선별 연결 설정 확인입니다.');
}

function bus70PublicTransitProperty_(name) {
  try{return String(PropertiesService.getScriptProperties().getProperty(name)||'').trim();}catch(error){return '';}
}

function bus70PublicTransitRouteKey_(value) {
  return String(value||'').replace(/\D/g,'');
}

function bus70PublicTransitDate_(value) {
  const text=String(value||'').trim();
  if(/^\d{8}$/.test(text))return text.slice(0,4)+'-'+text.slice(4,6)+'-'+text.slice(6,8);
  try{return normalizeDate_(text);}catch(error){return /^\d{4}-\d{2}-\d{2}$/.test(text)?text:'';}
}

function bus70PublicTransitConfigObject_() {
  const text=bus70PublicTransitProperty_('BUS70_PUBLIC_ROUTE_API_CONFIG_JSON');if(!text)return {};
  try{const parsed=JSON.parse(text);return parsed&&typeof parsed==='object'?parsed:{};}catch(error){return {};}
}

function bus70PublicTransitRouteConfig_(rawRoute) {
  const route=bus70PublicTransitRouteKey_(rawRoute),root=bus70PublicTransitConfigObject_(),routes=root.routes&&typeof root.routes==='object'?root.routes:root,source=routes&&routes[route];
  if(!route||!source||typeof source!=='object')return null;
  if(source.provider===BUS70_GYEONGGI_ROUTE_PROVIDER_)return {route:route,provider:BUS70_GYEONGGI_ROUTE_PROVIDER_,routeId:String(source.routeId||'').trim(),routeNo:String(source.routeNo||route).trim(),companyName:String(source.companyName||'소신여객').trim(),direction:'',coordinateEnabled:false};
  if(source.provider&&source.provider!==BUS70_PUBLIC_ROUTE_PROVIDER_)return {route:route,invalidEndpoint:true};
  const endpoint=String(source.endpoint||BUS70_PUBLIC_ROUTE_STOPS_ENDPOINT_).trim(),coordinateEnabled=!(/^(0|N|NO|FALSE|OFF)$/i.test(String(source.coordinateEnabled===undefined?'true':source.coordinateEnabled).trim())),coordinateEndpoint=String(source.coordinateEndpoint||BUS70_PUBLIC_STOP_COORDINATE_ENDPOINT_).trim();
  if(endpoint.indexOf('https://apis.data.go.kr/')!==0||/[?#]/.test(endpoint))return {route:route,invalidEndpoint:true};
  if(coordinateEnabled&&(coordinateEndpoint.indexOf('https://apis.data.go.kr/')!==0||/[?#]/.test(coordinateEndpoint)))return {route:route,invalidCoordinateEndpoint:true};
  return {route:route,routeId:String(source.routeId||source.rteId||source.RTE_ID||'').trim(),routeNo:String(source.routeNo||source.rteNo||route).trim(),ctpvCode:String(source.ctpvCode||source.ctpvCd||source.CTPV_CD||'').trim(),sggCode:String(source.sggCode||source.sggCd||source.SGG_CD||'').trim(),direction:String(source.direction||'전체').trim()||'전체',endpoint:endpoint,numOfRows:Math.max(1,Math.min(1000,Number(source.numOfRows||1000)||1000)),coordinateEnabled:coordinateEnabled,coordinateEndpoint:coordinateEndpoint,coordinateProvider:BUS70_PUBLIC_STOP_COORDINATE_PROVIDER_};
}

function bus70PublicTransitStatus_(rawRoute) {
  const route=bus70PublicTransitRouteKey_(rawRoute),config=bus70PublicTransitRouteConfig_(route),keyConfigured=Boolean(bus70PublicTransitProperty_('BUS70_DATA_GO_KR_SERVICE_KEY'));
  if(config&&config.provider===BUS70_GYEONGGI_ROUTE_PROVIDER_){
    const ready=keyConfigured&&Boolean(config.routeId);
    return {ok:true,route:route,keyConfigured:keyConfigured,routeConfigured:Boolean(config.routeId),ready:ready,provider:config.provider,coordinateFeedConfigured:true,coordinateProvider:config.provider,coordinateFeedStatus:'경기도 노선 API에서 정류장 순서·좌표·회차점을 함께 가져옵니다.',requiredProperties:['BUS70_DATA_GO_KR_SERVICE_KEY','BUS70_PUBLIC_ROUTE_API_CONFIG_JSON'],message:ready?'경기도 버스노선 정류장 동기화를 준비했습니다.':'공공데이터 인증키와 경기도 노선ID 설정을 확인하세요.'};
  }
  const routeConfigured=Boolean(config&&!config.invalidEndpoint&&config.routeId&&config.ctpvCode&&config.sggCode),coordinateFeedConfigured=Boolean(config&&config.coordinateEnabled&&!config.invalidCoordinateEndpoint),ready=keyConfigured&&routeConfigured&&!Boolean(config&&config.invalidCoordinateEndpoint);
  return {ok:true,route:route,keyConfigured:keyConfigured,routeConfigured:routeConfigured,ready:ready,provider:BUS70_PUBLIC_ROUTE_PROVIDER_,coordinateFeedConfigured:coordinateFeedConfigured,coordinateProvider:coordinateFeedConfigured?BUS70_PUBLIC_STOP_COORDINATE_PROVIDER_:'',coordinateFeedStatus:coordinateFeedConfigured?'경기도 정류소 조회 API로 외부 정류장ID를 우선 대조하고, ID가 없을 때만 정류장번호·고유 이름을 보조 대조합니다.':'좌표 자동 보완을 끈 노선입니다. 기존 검증 좌표는 그대로 보존합니다.',requiredProperties:['BUS70_DATA_GO_KR_SERVICE_KEY','BUS70_PUBLIC_ROUTE_API_CONFIG_JSON'],message:!keyConfigured?'공공데이터 인증키가 서버 비밀설정에 등록되지 않았습니다.':config&&config.invalidCoordinateEndpoint?'좌표 API 주소는 쿼리 없는 공공데이터포털 HTTPS 주소만 허용합니다.':!routeConfigured?'선택 노선의 외부 노선ID·시도코드·시군구코드 설정이 필요합니다.':'노선 정류장 순서와 좌표 보완 동기화를 준비했습니다.'};
}

function bus70PublicTransitEncodedKey_(key) {
  return /%[0-9A-F]{2}/i.test(key)?key:encodeURIComponent(key);
}

function bus70PublicTransitQueryUrl_(endpoint, key, params) {
  const pairs=['serviceKey='+bus70PublicTransitEncodedKey_(key)];
  Object.keys(params||{}).forEach(function(name){const value=params[name];if(value!==''&&value!==null&&value!==undefined)pairs.push(encodeURIComponent(name)+'='+encodeURIComponent(String(value)));});
  return endpoint+(endpoint.indexOf('?')===-1?'?':'&')+pairs.join('&');
}

function bus70PublicTransitField_(item, aliases) {
  if(!item||typeof item!=='object')return '';
  const lookup={};Object.keys(item).forEach(function(key){lookup[String(key).toUpperCase()]=item[key];});
  for(let i=0;i<aliases.length;i++){const value=lookup[String(aliases[i]).toUpperCase()];if(value!==undefined&&value!==null&&String(value).trim()!=='')return value;}
  return '';
}

function bus70PublicTransitNumber_(value, min, max) {
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const number=Number(value);return Number.isFinite(number)&&number>=min&&number<=max?number:null;
}

function bus70PublicTransitItems_(json) {
  const response=json&&json.response||json||{},header=response.header||json&&json.header||{},body=response.body||json&&json.body||response;
  const resultCode=String(header.resultCode||header.RESULT_CODE||body.resultCode||'').trim();
  if(resultCode&&['0','00','0000','NORMAL_SERVICE'].indexOf(resultCode.toUpperCase())===-1)return {ok:false,error:'PUBLIC_API_ERROR',message:'공공데이터 API가 요청을 거절했습니다. 응답코드 '+resultCode};
  let items=body.items&&body.items.item!==undefined?body.items.item:body.items!==undefined?body.items:response.items&&response.items.item!==undefined?response.items.item:response.item;
  if(items===undefined||items===null)items=[];if(!Array.isArray(items))items=[items];
  return {ok:true,items:items,totalCount:Number(body.totalCount||body.totalcount||items.length)||items.length};
}

function bus70PublicTransitFetchPage_(config, date, pageNo, serviceKey) {
  const url=bus70PublicTransitQueryUrl_(config.endpoint,serviceKey,{pageNo:pageNo,numOfRows:config.numOfRows,OPR_YMD:date.replace(/-/g,''),RTE_ID:config.routeId,CTPV_CD:config.ctpvCode,SGG_CD:config.sggCode,dataType:'JSON'});
  let response;try{response=UrlFetchApp.fetch(url,{method:'get',muteHttpExceptions:true,followRedirects:true,headers:{Accept:'application/json'}});}catch(error){return {ok:false,error:'PUBLIC_API_UNREACHABLE',message:'공공데이터 API 연결에 실패했습니다.'};}
  const status=Number(response.getResponseCode&&response.getResponseCode()||200);if(status<200||status>=300)return {ok:false,error:'PUBLIC_API_HTTP_ERROR',message:'공공데이터 API 연결이 정상적이지 않습니다. HTTP '+status};
  let text='';try{text=response.getContentText('UTF-8');}catch(error){try{text=response.getContentText();}catch(inner){text='';}}
  let json;try{json=JSON.parse(text);}catch(error){return {ok:false,error:'PUBLIC_API_RESPONSE_INVALID',message:'공공데이터 응답을 JSON으로 해석하지 못했습니다.'};}
  return bus70PublicTransitItems_(json);
}

function bus70PublicTransitSafeId_(value) {
  return String(value||'').replace(/[^0-9A-Za-z가-힣_-]/g,'').slice(0,80);
}

function bus70PublicTransitRouteNo_(value) {
  return String(value||'').trim().replace(/\s+/g,'').replace(/번$/,'').toUpperCase();
}

function bus70PublicTransitNormalizeStop_(item, index, config, requestedDate) {
  const sequence=Number(bus70PublicTransitField_(item,['STTN_SEQ','sttnSeq','stationSeq','nodeord'])||index+1),externalStopId=String(bus70PublicTransitField_(item,['STTN_ID','sttnId','stationId','nodeid'])||'').trim(),name=String(bus70PublicTransitField_(item,['STTN_NM','sttnNm','stationName','nodenm'])||'').trim(),externalRouteId=String(bus70PublicTransitField_(item,['RTE_ID','rteId','routeId'])||config.routeId).trim();
  if(!Number.isInteger(sequence)||sequence<1||!externalStopId||!name)return null;
  const lat=bus70PublicTransitNumber_(bus70PublicTransitField_(item,['GPS_LATI','GPSLATI','LATITUDE','LAT','Y','GPS_Y']),-90,90),lng=bus70PublicTransitNumber_(bus70PublicTransitField_(item,['GPS_LONG','GPSLONG','LONGITUDE','LNG','LON','X','GPS_X']),-180,180),sourceDate=bus70PublicTransitDate_(bus70PublicTransitField_(item,['OPR_YMD','oprYmd']))||requestedDate;
  const occurrenceId='R'+config.route+'-PUB-'+bus70PublicTransitSafeId_(externalRouteId)+'-'+('0000'+sequence).slice(-4)+'-'+bus70PublicTransitSafeId_(externalStopId);
  return {id:occurrenceId,route:config.route,externalRouteId:externalRouteId,externalStopId:externalStopId,routeNo:String(bus70PublicTransitField_(item,['RTE_NO','rteNo','routeNo'])||config.routeNo).trim(),name:name,number:String(bus70PublicTransitField_(item,['STTN_NO','ARS_ID','arsId','stationNo'])||'').trim(),order:sequence,direction:config.direction,lat:lat,lng:lng,ctpvCode:String(bus70PublicTransitField_(item,['CTPV_CD','ctpvCd'])||config.ctpvCode),sggCode:String(bus70PublicTransitField_(item,['SGG_CD','sggCd'])||config.sggCode),emdCode:String(bus70PublicTransitField_(item,['EMD_CD','emdCd'])||''),sourceDate:sourceDate,provider:BUS70_PUBLIC_ROUTE_PROVIDER_};
}

function bus70PublicTransitFetchRouteStops_(rawRoute, rawDate) {
  const route=bus70PublicTransitRouteKey_(rawRoute),date=bus70PublicTransitDate_(rawDate),config=bus70PublicTransitRouteConfig_(route),serviceKey=bus70PublicTransitProperty_('BUS70_DATA_GO_KR_SERVICE_KEY');
  if(!route||!date)return {ok:false,error:'PARAM_REQUIRED',message:'노선과 운행일을 확인하세요.'};
  if(!serviceKey)return {ok:false,error:'PUBLIC_API_KEY_REQUIRED',message:'공공데이터 인증키가 서버 비밀설정에 없습니다.'};
  if(config&&config.provider===BUS70_GYEONGGI_ROUTE_PROVIDER_)return bus70GyeonggiFetchRouteStops_(config,date,serviceKey);
  if(!config||config.invalidEndpoint||!config.routeId||!config.ctpvCode||!config.sggCode)return {ok:false,error:'PUBLIC_ROUTE_CONFIG_REQUIRED',message:route+'번 외부 노선ID·시도코드·시군구코드 설정이 필요합니다.'};
  let page=1,total=0,items=[];while(page<=20){const result=bus70PublicTransitFetchPage_(config,date,page,serviceKey);if(!result.ok)return result;items=items.concat(result.items||[]);total=result.totalCount||items.length;if(items.length>=total||(result.items||[]).length<config.numOfRows)break;page++;}
  if(total>items.length)return {ok:false,error:'PUBLIC_API_PAGE_LIMIT',message:'정류장 응답이 안전 조회 한도를 초과했습니다.'};
  const stops=[],seen={};items.forEach(function(item,index){const stop=bus70PublicTransitNormalizeStop_(item,index,config,date);if(!stop||seen[stop.id])return;seen[stop.id]=true;stops.push(stop);});stops.sort(function(a,b){return a.order-b.order;});
  if(!stops.length)return {ok:false,error:'PUBLIC_ROUTE_STOPS_EMPTY',message:route+'번 노선의 정류장 응답이 비어 있습니다.'};
  const expected=bus70PublicTransitRouteNo_(config.routeNo),mismatches=stops.filter(function(stop){return stop.routeNo&&bus70PublicTransitRouteNo_(stop.routeNo)!==expected;});
  if(mismatches.length)return {ok:false,error:'PUBLIC_ROUTE_NUMBER_MISMATCH',message:'요청한 '+route+'번과 API 응답 노선번호가 달라 저장을 중단했습니다.'};
  stops.forEach(function(stop,index){stop.origin=index===0;stop.terminal=index===stops.length-1;});
  return {ok:true,route:route,date:date,provider:BUS70_PUBLIC_ROUTE_PROVIDER_,externalRouteId:stops[0].externalRouteId,routeNo:stops[0].routeNo,sourceDate:stops.map(function(stop){return stop.sourceDate;}).sort().reverse()[0]||date,stops:stops};
}

function bus70GyeonggiToday_() {
  return Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
}

function bus70GyeonggiRequest_(operation, params, key) {
  if(['getBusRouteListv2','getBusRouteInfoItemv2','getBusRouteStationListv2'].indexOf(operation)===-1)return {ok:false,error:'PUBLIC_API_OPERATION_INVALID',message:'지원하지 않는 경기도 API입니다.'};
  const url=bus70PublicTransitQueryUrl_(BUS70_GYEONGGI_ROUTE_BASE_+operation,key,Object.assign({format:'json'},params));
  let response;
  try{response=UrlFetchApp.fetch(url,{method:'get',muteHttpExceptions:true,followRedirects:false,headers:{Accept:'application/json'}});}catch(error){return {ok:false,error:'PUBLIC_API_UNREACHABLE',message:'경기도 API 외부 요청 권한과 연결을 확인하세요.'};}
  const http=response.getResponseCode();
  if(http!==200)return {ok:false,error:'PUBLIC_API_HTTP_ERROR',message:'경기도 API HTTP '+http+' — 경기도_버스노선 조회 활용신청과 인증키를 확인하세요.'};
  let json;try{json=JSON.parse(response.getContentText('UTF-8'));}catch(error){return {ok:false,error:'PUBLIC_API_RESPONSE_INVALID',message:'경기도 API 응답 형식을 확인하지 못했습니다.'};}
  const envelope=json&&json.response||json||{},header=envelope.msgHeader||{},code=String(header.resultCode==null?'':header.resultCode).trim();
  if(!/^0+$/.test(code))return {ok:false,error:'PUBLIC_API_ERROR',message:'경기도 API 응답코드 '+(/^\d{1,4}$/.test(code)?code:'확인불가')};
  return {ok:true,body:envelope.msgBody||{}};
}

function bus70GyeonggiList_(value) { return Array.isArray(value)?value:value?[value]:[]; }

function bus70GyeonggiFetchRouteStops_(config, date, key) {
  const today=bus70GyeonggiToday_();
  if(date<today)return {ok:false,error:'PUBLIC_CURRENT_DATA_ONLY',message:'경기도 API는 현재 노선 정보를 제공합니다. 과거 운행일에 소급 적용할 수 없습니다.'};
  if(!config.routeId)return {ok:false,error:'PUBLIC_ROUTE_CONFIG_REQUIRED',message:'경기도 노선ID 설정이 필요합니다.'};
  const detail=bus70GyeonggiRequest_('getBusRouteInfoItemv2',{routeId:config.routeId},key);if(!detail.ok)return detail;
  const infos=bus70GyeonggiList_(detail.body.busRouteInfoItem),info=infos[0];
  if(infos.length!==1||String(info.routeId)!==config.routeId||String(info.routeName).trim()!==config.route||String(info.companyName||'').replace(/\s/g,'')!==config.companyName.replace(/\s/g,''))return {ok:false,error:'PUBLIC_ROUTE_IDENTITY_MISMATCH',message:config.route+'번 노선ID·노선번호·운수사가 설정과 달라 적용을 중단했습니다.'};
  const fetched=bus70GyeonggiRequest_('getBusRouteStationListv2',{routeId:config.routeId},key);if(!fetched.ok)return fetched;
  const items=bus70GyeonggiList_(fetched.body.busRouteStationList).slice().sort(function(a,b){return Number(a.stationSeq)-Number(b.stationSeq);});
  if(items.length<3||items.length>1000)return {ok:false,error:'PUBLIC_ROUTE_STOPS_EMPTY',message:'경유정류장 목록이 비어 있거나 안전 조회 범위를 벗어났습니다.'};
  const seen={},stops=[];let invalid=false;
  items.forEach(function(item,index){
    const order=Number(item.stationSeq),id=String(item.stationId||'').trim(),name=String(item.stationName||'').trim(),lat=bus70PublicTransitNumber_(item.y,32,40),lng=bus70PublicTransitNumber_(item.x,124,132);
    if(order!==index+1||seen[order]||!id||!name||lat===null||lng===null){invalid=true;return;}seen[order]=true;
    stops.push({id:'R'+config.route+'-GBIS-'+config.routeId+'-'+('0000'+order).slice(-4)+'-'+bus70PublicTransitSafeId_(id),route:config.route,externalRouteId:config.routeId,externalStopId:id,routeNo:config.route,name:name,number:String(item.mobileNo||''),order:order,lat:lat,lng:lng,turnaround:String(item.turnYn||'').toUpperCase()==='Y',origin:index===0,terminal:false,ctpvCode:'41',sggCode:'',emdCode:'',sourceDate:today,provider:BUS70_GYEONGGI_ROUTE_PROVIDER_});
  });
  if(invalid)return {ok:false,error:'PUBLIC_ROUTE_STOPS_INVALID',message:'정류장 순서·ID·이름·좌표가 불완전하여 적용을 중단했습니다.'};
  const turns=stops.filter(function(stop){return stop.turnaround;}),declared=Array.from(new Set(items.map(function(item){return Number(item.turnSeq||0);}).filter(function(value){return value>0;})));
  if(turns.length!==1||turns[0].order<=1||turns[0].order>=stops.length||declared.some(function(seq){return seq!==turns[0].order;})||(info.turnStID&&String(info.turnStID)!==turns[0].externalStopId))return {ok:false,error:'PUBLIC_ROUTE_TURN_INVALID',message:'회차점 정보가 없거나 서로 달라 적용을 중단했습니다.'};
  if(info.startStationId&&String(info.startStationId)!==stops[0].externalStopId)return {ok:false,error:'PUBLIC_ROUTE_START_INVALID',message:'노선 기점과 첫 정류장ID가 달라 적용을 중단했습니다.'};
  const turn=turns[0];stops.forEach(function(stop){stop.direction=stop.order<=turn.order?'기점→회차':'회차→기점';stop.terminal=stop.turnaround;});
  return {ok:true,route:config.route,date:date,provider:BUS70_GYEONGGI_ROUTE_PROVIDER_,externalRouteId:config.routeId,routeNo:config.route,sourceDate:today,stops:stops};
}

// Editor-only initial import: discover both routes, validate both before any
// sheet writes, then use the same append-only importer as the manager UI.
function BUS70_importGyeonggiRouteStops() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL,['https://www.googleapis.com/auth/script.external_request','https://www.googleapis.com/auth/spreadsheets']);
  if(typeof bus70RouteStorePublicSchemaVersion_!=='function'||bus70RouteStorePublicSchemaVersion_()<2){console.log('저장 중단: 최신 PrivateRouteStore.gs를 먼저 적용하세요.');return;}
  const key=bus70PublicTransitProperty_('BUS70_DATA_GO_KR_SERVICE_KEY'),date=bus70GyeonggiToday_();
  if(!key){console.log('저장 중단: 등록된 인증키가 없습니다.');return;}
  const props=PropertiesService.getScriptProperties(),raw=props.getProperty('BUS70_PUBLIC_ROUTE_API_CONFIG_JSON');let root={};
  try{if(raw)root=JSON.parse(raw);if(!root||typeof root!=='object'||Array.isArray(root)||root.routes&&(typeof root.routes!=='object'||Array.isArray(root.routes)))throw new Error('INVALID');}catch(error){console.log('저장 중단: 기존 노선 연결 설정 형식을 확인하세요.');return;}
  const configs={},routes=['5','70'];
  for(let r=0;r<routes.length;r++){
    const route=routes[r],listed=bus70GyeonggiRequest_('getBusRouteListv2',{keyword:route},key);
    if(!listed.ok){console.log(listed.message);return;}
    const ids=Array.from(new Set(bus70GyeonggiList_(listed.body.busRouteList).filter(function(item){return String(item.routeName).trim()===route&&/부천/.test(String(item.adminName||'')+' '+String(item.regionName||''));}).map(function(item){return String(item.routeId||'');}))).filter(Boolean);
    if(!ids.length||ids.length>10){console.log(route+'번 노선 후보를 확정하지 못했습니다. 저장하지 않았습니다.');return;}
    const matches=[];
    for(let i=0;i<ids.length;i++){
      const config={route:route,routeId:ids[i],routeNo:route,provider:BUS70_GYEONGGI_ROUTE_PROVIDER_,companyName:'소신여객',coordinateEnabled:false},result=bus70GyeonggiFetchRouteStops_(config,date,key);
      if(result.ok)matches.push(config);else if(result.error!=='PUBLIC_ROUTE_IDENTITY_MISMATCH'){console.log(route+'번: '+result.message);return;}
    }
    if(matches.length!==1){console.log(route+'번 소신여객 노선을 하나로 확정하지 못했습니다. 저장하지 않았습니다.');return;}
    configs[route]=matches[0];
  }
  const target=root.routes||root;routes.forEach(function(route){target[route]=configs[route];});
  props.setProperty('BUS70_PUBLIC_ROUTE_API_CONFIG_JSON',JSON.stringify(root));
  const previews=routes.map(function(route){return bus70PublicTransitImportPreview_({route:route,date:date});});
  if(previews.some(function(result){return !result.ok;})){previews.filter(function(result){return !result.ok;}).forEach(function(result){console.log(result.message);});return;}
  for(let i=0;i<previews.length;i++){
    const preview=previews[i],result=bus70PublicTransitImportApply_({route:preview.route,date:date,previewToken:preview.previewToken},'APPS_SCRIPT_EDITOR');
    console.log(JSON.stringify({노선:preview.route,성공:result.ok,저장행수:result.rowsWritten||0,정류장수:result.stopCount||0,좌표보유수:result.coordinateCount||0,안내:result.message}));
    if(!result.ok)return;
    const stored=bus70RouteStopsFromDb_(preview.route,date).stops||[];
    if(stored.length!==result.stopCount||stored.filter(function(stop){return stop.lat!==null&&stop.lng!==null;}).length!==result.coordinateCount||stored.filter(function(stop){return stop.turnaround;}).length!==1){console.log(preview.route+'번 저장 후 읽기 결과가 달라 확인이 필요합니다.');return;}
  }
  console.log('5번·70번 정류장DB 저장 확인 완료. 다음은 앱 화면 반영 확인입니다.');
}

function bus70PublicTransitCoordinateItems_(json) {
  const response=json&&json.response||json||{},header=response.msgHeader||response.header||json&&json.msgHeader||json&&json.header||{},body=response.msgBody||response.body||json&&json.msgBody||json&&json.body||response;
  const resultCode=String(bus70PublicTransitField_(header,['resultCode','RESULT_CODE'])||bus70PublicTransitField_(body,['resultCode','RESULT_CODE'])||'').trim();
  if(resultCode==='4'||resultCode==='04')return {ok:true,items:[]};
  if(resultCode&&['0','00','0000','NORMAL_SERVICE'].indexOf(resultCode.toUpperCase())===-1)return {ok:false,error:'PUBLIC_COORDINATE_API_ERROR',message:'정류장 좌표 API가 요청을 거절했습니다. 응답코드 '+resultCode};
  let items=body.busStationList!==undefined?body.busStationList:body.items&&body.items.item!==undefined?body.items.item:body.items!==undefined?body.items:response.busStationList!==undefined?response.busStationList:json&&json.busStationList;
  if(items&&items.item!==undefined)items=items.item;
  if(items===undefined||items===null)items=[];if(!Array.isArray(items))items=[items];
  return {ok:true,items:items};
}

function bus70PublicTransitNormalizeCoordinate_(item) {
  const lat=bus70PublicTransitNumber_(bus70PublicTransitField_(item,['y','gpslati','GPS_LATI','latitude','lat']),-90,90),lng=bus70PublicTransitNumber_(bus70PublicTransitField_(item,['x','gpslong','GPS_LONG','longitude','lng','lon']),-180,180);
  if(lat===null||lng===null)return null;
  return {externalStopId:String(bus70PublicTransitField_(item,['stationId','nodeid','STTN_ID'])||'').trim(),name:String(bus70PublicTransitField_(item,['stationName','nodenm','STTN_NM'])||'').trim(),number:String(bus70PublicTransitField_(item,['mobileNo','nodeno','stationNo','STTN_NO'])||'').trim(),lat:lat,lng:lng,regionName:String(bus70PublicTransitField_(item,['regionName'])||'').trim(),centerYn:String(bus70PublicTransitField_(item,['centerYn'])||'').trim(),coordinateProvider:BUS70_PUBLIC_STOP_COORDINATE_PROVIDER_};
}

function bus70PublicTransitCoordinateCache_() {
  try{return typeof CacheService!=='undefined'&&CacheService.getScriptCache?CacheService.getScriptCache():null;}catch(error){return null;}
}

function bus70PublicTransitFetchCoordinateKeyword_(config, keyword, serviceKey) {
  const cache=bus70PublicTransitCoordinateCache_(),cacheKey='BUS70_STOP_COORD_'+bus70PublicTransitToken_(config.coordinateEndpoint+'|'+keyword),cached=cache&&cache.get(cacheKey);
  if(cached){try{return {ok:true,items:JSON.parse(cached),cached:true};}catch(error){}}
  const url=bus70PublicTransitQueryUrl_(config.coordinateEndpoint,serviceKey,{format:'json',keyword:keyword});let response;
  try{response=UrlFetchApp.fetch(url,{method:'get',muteHttpExceptions:true,followRedirects:true,headers:{Accept:'application/json'}});}catch(error){return {ok:false,error:'PUBLIC_COORDINATE_UNREACHABLE',message:'정류장 좌표 API 연결에 실패했습니다.'};}
  const status=Number(response.getResponseCode&&response.getResponseCode()||200);if(status<200||status>=300)return {ok:false,error:'PUBLIC_COORDINATE_HTTP_ERROR',message:'정류장 좌표 API 연결이 정상적이지 않습니다. HTTP '+status};
  let text='';try{text=response.getContentText('UTF-8');}catch(error){try{text=response.getContentText();}catch(inner){text='';}}
  let json;try{json=JSON.parse(text);}catch(error){return {ok:false,error:'PUBLIC_COORDINATE_RESPONSE_INVALID',message:'정류장 좌표 응답을 JSON으로 해석하지 못했습니다.'};}
  const parsed=bus70PublicTransitCoordinateItems_(json);if(!parsed.ok)return parsed;
  const seen={},items=(parsed.items||[]).map(bus70PublicTransitNormalizeCoordinate_).filter(function(item){if(!item||!item.name)return false;const key=[item.externalStopId,item.number,item.lat.toFixed(7),item.lng.toFixed(7)].join('|');if(seen[key])return false;seen[key]=true;return true;});
  try{if(cache)cache.put(cacheKey,JSON.stringify(items),21600);}catch(error){}
  return {ok:true,items:items,cached:false};
}

function bus70PublicTransitFetchCoordinateCandidates_(stops, config, serviceKey) {
  if(!config||!config.coordinateEnabled)return {ok:true,enabled:false,items:[],queryCount:0,networkRequestCount:0,warning:''};
  const keywords=[],seen={};(stops||[]).forEach(function(stop){if(stop.lat!==null&&stop.lng!==null)return;const key=bus70PublicTransitNameKey_(stop.name);if(!key||seen[key])return;seen[key]=true;keywords.push(stop.name);});
  const limit=120,items=[];let warning=keywords.length>limit?'좌표 검색 대상이 안전 조회 한도를 넘어 앞의 '+limit+'개 이름만 확인했습니다.':'',networkRequestCount=0,queryCount=0;
  for(let i=0;i<Math.min(limit,keywords.length);i++){const result=bus70PublicTransitFetchCoordinateKeyword_(config,keywords[i],serviceKey);queryCount++;if(!result.ok){warning=result.message||'정류장 좌표 API를 확인하지 못했습니다.';break;}if(!result.cached)networkRequestCount++;Array.prototype.push.apply(items,result.items||[]);}
  const unique={},deduplicated=items.filter(function(item){const key=[item.externalStopId,item.number,item.lat.toFixed(7),item.lng.toFixed(7)].join('|');if(unique[key])return false;unique[key]=true;return true;});
  return {ok:true,enabled:true,items:deduplicated,queryCount:queryCount,networkRequestCount:networkRequestCount,warning:warning};
}

function bus70PublicTransitNameKey_(value) {
  return String(value||'').toLowerCase().replace(/[\s·.()\-]/g,'');
}

function bus70PublicTransitStopIdKey_(value) {
  return String(value||'').trim().toUpperCase().replace(/\s/g,'');
}

function bus70PublicTransitCoordinateMatchResult_(items, status, reviewStatus, rank) {
  const coordinate=bus70PublicTransitUniqueCoordinate_(items);if(!coordinate)return null;
  const numbers={},providers={};(items||[]).forEach(function(item){if(item.number)numbers[item.number]=true;if(item.coordinateProvider)providers[item.coordinateProvider]=true;});
  const numberKeys=Object.keys(numbers),providerKeys=Object.keys(providers);
  return {lat:coordinate.lat,lng:coordinate.lng,number:numberKeys.length===1?numberKeys[0]:'',coordinateProvider:providerKeys[0]||BUS70_PUBLIC_STOP_COORDINATE_PROVIDER_,coordinateStatus:status,reviewStatus:reviewStatus,rank:rank};
}

function bus70PublicTransitCoordinateMatch_(stop, candidates) {
  const externalId=bus70PublicTransitStopIdKey_(stop.externalStopId),number=String(stop.number||'').trim(),nameKey=bus70PublicTransitNameKey_(stop.name);let matched=null;
  if(externalId){matched=bus70PublicTransitCoordinateMatchResult_((candidates||[]).filter(function(item){return bus70PublicTransitStopIdKey_(item.externalStopId)===externalId;}),'PUBLIC_STOP_ID','확인완료',3);if(matched)return matched;}
  if(number){matched=bus70PublicTransitCoordinateMatchResult_((candidates||[]).filter(function(item){return String(item.number||'').trim()===number;}),'PUBLIC_STOP_NUMBER','정류장번호확인',2);if(matched)return matched;}
  if(nameKey){matched=bus70PublicTransitCoordinateMatchResult_((candidates||[]).filter(function(item){return bus70PublicTransitNameKey_(item.name)===nameKey;}),'PUBLIC_STOP_NAME_UNIQUE','이름일치검토',1);if(matched)return matched;}
  return null;
}

function bus70PublicTransitExistingCandidates_(rawRoute, rawDate) {
  const route=bus70PublicTransitRouteKey_(rawRoute),date=bus70PublicTransitDate_(rawDate);let sheet=null;
  try{sheet=bus70RoutePartitionSheet_(SpreadsheetApp.getActiveSpreadsheet(),route,'stops',false);}catch(error){sheet=null;}
  if(!sheet||sheet.getLastRow()<2)return [];
  const rows=sheet.getDataRange().getDisplayValues(),c=bus70RoutePartitionHeaderMap_(rows[0]);return rows.slice(1).map(function(row,index){return {id:String(row[c['stopId']]||''),route:String(row[c['노선']]||route).replace(/\D/g,''),name:String(row[c['정류장명']]||'').trim(),number:String(row[c['정류장번호']]||'').trim(),externalStopId:c['외부정류장ID']===undefined?'':String(row[c['외부정류장ID']]||'').trim(),lat:bus70PublicTransitNumber_(row[c['위도']],-90,90),lng:bus70PublicTransitNumber_(row[c['경도']],-180,180),coordinateProvider:c['좌표제공처']===undefined?(c['자료제공처']===undefined?'':String(row[c['자료제공처']]||'')):String(row[c['좌표제공처']]||''),coordinateStatus:c['좌표상태']===undefined?'':String(row[c['좌표상태']]||''),reviewStatus:c['검토상태']===undefined?'':String(row[c['검토상태']]||''),effectiveStart:bus70PublicTransitDate_(row[c['적용시작']]),effectiveEnd:bus70PublicTransitDate_(row[c['적용종료']]),status:String(row[c['상태']]||'사용').toUpperCase(),index:index};}).filter(function(row){return row.route===route&&row.name&&row.lat!==null&&row.lng!==null&&['N','중지','폐지','삭제'].indexOf(row.status)===-1&&(!date||bus70RoutePartitionDateActive_(date,row.effectiveStart,row.effectiveEnd));});
}

function bus70PublicTransitUniqueCoordinate_(items) {
  const coordinates={};(items||[]).forEach(function(item){if(item.lat===null||item.lng===null)return;coordinates[item.lat.toFixed(7)+'|'+item.lng.toFixed(7)]={lat:item.lat,lng:item.lng};});
  const keys=Object.keys(coordinates);return keys.length===1?coordinates[keys[0]]:null;
}

function bus70PublicTransitEnrichCoordinates_(stops, candidates, publicCandidates) {
  return (stops||[]).map(function(source){const stop=Object.assign({},source);if(stop.lat!==null&&stop.lng!==null){stop.coordinateStatus='ROUTE_API_RESPONSE';stop.coordinateProvider=stop.provider;stop.reviewStatus='확인완료';return stop;}
    const publicMatch=bus70PublicTransitCoordinateMatch_(stop,publicCandidates),strongPublicMatch=publicMatch&&publicMatch.rank===3?publicMatch:null;let coordinate=strongPublicMatch,status=strongPublicMatch&&strongPublicMatch.coordinateStatus,review=strongPublicMatch&&strongPublicMatch.reviewStatus,coordinateProvider=strongPublicMatch&&strongPublicMatch.coordinateProvider;
    if(!coordinate){const preserved=candidates.filter(function(item){return item.id===stop.id;}),preservedCoordinate=bus70PublicTransitUniqueCoordinate_(preserved);if(preservedCoordinate){coordinate=preservedCoordinate;status=preserved[0].coordinateStatus||'PRESERVED_OCCURRENCE';review=preserved[0].reviewStatus||'확인완료';coordinateProvider=preserved[0]&&preserved[0].coordinateProvider;}}
    if(!coordinate&&stop.externalStopId){const preserved=candidates.filter(function(item){return item.externalStopId===stop.externalStopId;}),preservedCoordinate=bus70PublicTransitUniqueCoordinate_(preserved);if(preservedCoordinate){coordinate=preservedCoordinate;status=preserved[0].coordinateStatus||'PRESERVED_STOP_ID';review=preserved[0].reviewStatus||'확인완료';coordinateProvider=preserved[0]&&preserved[0].coordinateProvider;}}
    if(!coordinate&&publicMatch){coordinate=publicMatch;status=publicMatch.coordinateStatus;review=publicMatch.reviewStatus;coordinateProvider=publicMatch.coordinateProvider;}
    if(!coordinate){const key=bus70PublicTransitNameKey_(stop.name),preserved=candidates.filter(function(item){return bus70PublicTransitNameKey_(item.name)===key&&(!stop.number||!item.number||item.number===stop.number);}),preservedCoordinate=bus70PublicTransitUniqueCoordinate_(preserved);if(preservedCoordinate){coordinate=preservedCoordinate;status=preserved[0].coordinateStatus||'PRESERVED_NAME_MATCH';review=preserved[0].reviewStatus||'이름일치검토';coordinateProvider=preserved[0]&&preserved[0].coordinateProvider;}}
    if(coordinate){stop.lat=coordinate.lat;stop.lng=coordinate.lng;if(!stop.number&&coordinate.number)stop.number=coordinate.number;stop.coordinateStatus=status;stop.coordinateProvider=coordinateProvider||'';stop.reviewStatus=review;}else{stop.coordinateStatus='UNRESOLVED';stop.coordinateProvider='';stop.reviewStatus='좌표보완필요';}
    return stop;
  });
}

function bus70PublicTransitCanonicalStops_(stops) {
  return (stops||[]).slice().sort(function(a,b){return Number(a.order)-Number(b.order)||String(a.id).localeCompare(String(b.id));}).map(function(stop){return [String(stop.id||''),String(stop.externalRouteId||''),String(stop.externalStopId||''),Number(stop.order||0),String(stop.name||''),String(stop.number||''),String(stop.direction||''),stop.lat===null||stop.lat===undefined?'':Number(stop.lat).toFixed(7),stop.lng===null||stop.lng===undefined?'':Number(stop.lng).toFixed(7),stop.origin?'Y':'',stop.terminal?'Y':'',stop.turnaround?'Y':'',String(stop.coordinateProvider||''),String(stop.coordinateStatus||''),String(stop.reviewStatus||'')].join('~');}).join('|');
}

function bus70PublicTransitToken_(text) {
  let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}return ('00000000'+(hash>>>0).toString(16)).slice(-8);
}

function bus70PublicTransitBuildPreview_(rawRoute, rawDate) {
  const fetched=bus70PublicTransitFetchRouteStops_(rawRoute,rawDate);if(!fetched.ok)return fetched;
  const config=bus70PublicTransitRouteConfig_(fetched.route),serviceKey=bus70PublicTransitProperty_('BUS70_DATA_GO_KR_SERVICE_KEY'),coordinateFetch=bus70PublicTransitFetchCoordinateCandidates_(fetched.stops,config,serviceKey),candidates=bus70PublicTransitExistingCandidates_(fetched.route,fetched.date),stops=bus70PublicTransitEnrichCoordinates_(fetched.stops,candidates,coordinateFetch.items||[]),current=bus70RouteStopsFromDb_(fetched.route,fetched.date),canonical=bus70PublicTransitCanonicalStops_(stops),currentCanonical=bus70PublicTransitCanonicalStops_(current.stops||[]),token=bus70PublicTransitToken_(fetched.route+'|'+fetched.date+'|'+canonical),coordinateCount=stops.filter(function(stop){return stop.lat!==null&&stop.lng!==null;}).length,nameReviewCount=stops.filter(function(stop){return stop.reviewStatus==='이름일치검토';}).length,coordinateApiMatchedCount=stops.filter(function(stop){return String(stop.coordinateStatus||'').indexOf('PUBLIC_STOP_')===0;}).length;
  return {ok:true,route:fetched.route,date:fetched.date,provider:fetched.provider,externalRouteId:fetched.externalRouteId,routeNo:fetched.routeNo,sourceDate:fetched.sourceDate,stops:stops,previewToken:token,changed:canonical!==currentCanonical,currentStopCount:(current.stops||[]).length,stopCount:stops.length,coordinateCount:coordinateCount,unresolvedCoordinateCount:stops.length-coordinateCount,nameReviewCount:nameReviewCount,coordinateFeedConfigured:fetched.provider===BUS70_GYEONGGI_ROUTE_PROVIDER_||Boolean(coordinateFetch.enabled),coordinateProvider:fetched.provider===BUS70_GYEONGGI_ROUTE_PROVIDER_?fetched.provider:coordinateFetch.enabled?BUS70_PUBLIC_STOP_COORDINATE_PROVIDER_:'',coordinateApiMatchedCount:fetched.provider===BUS70_GYEONGGI_ROUTE_PROVIDER_?coordinateCount:coordinateApiMatchedCount,coordinateApiQueryCount:coordinateFetch.queryCount||0,coordinateApiNetworkRequestCount:coordinateFetch.networkRequestCount||0,coordinateApiWarning:String(coordinateFetch.warning||''),firstStop:stops[0].name,lastStop:stops[stops.length-1].name,turnStops:stops.filter(function(stop){return stop.turnaround;}).map(function(stop){return {order:stop.order,name:stop.name};}),liveNavigationReady:coordinateCount===stops.length&&coordinateCount>=2};
}

function bus70PublicTransitPublicPreview_(preview) {
  if(!preview||!preview.ok)return preview;
  return {ok:true,route:preview.route,date:preview.date,provider:preview.provider,routeNo:preview.routeNo,sourceDate:preview.sourceDate,previewToken:preview.previewToken,changed:preview.changed,currentStopCount:preview.currentStopCount,stopCount:preview.stopCount,coordinateCount:preview.coordinateCount,unresolvedCoordinateCount:preview.unresolvedCoordinateCount,nameReviewCount:preview.nameReviewCount,coordinateFeedConfigured:preview.coordinateFeedConfigured,coordinateProvider:preview.coordinateProvider,coordinateApiMatchedCount:preview.coordinateApiMatchedCount,coordinateApiQueryCount:preview.coordinateApiQueryCount,coordinateApiNetworkRequestCount:preview.coordinateApiNetworkRequestCount,coordinateApiWarning:preview.coordinateApiWarning,firstStop:preview.firstStop,lastStop:preview.lastStop,turnStops:preview.turnStops,liveNavigationReady:preview.liveNavigationReady,message:preview.changed?'공공데이터 정류장 '+preview.stopCount+'개를 확인했습니다. 적용 전 좌표 상태를 검토하세요.':'현재 노선별 정류장DB와 같은 자료입니다.'};
}

function bus70PublicTransitImportPreview_(body) {
  return bus70PublicTransitPublicPreview_(bus70PublicTransitBuildPreview_(body&&body.route,body&&body.date));
}

function bus70PublicTransitImportApply_(body, requesterId) {
  const requestedToken=String(body&&body.previewToken||'').trim();if(!requestedToken)return {ok:false,error:'PUBLIC_IMPORT_PREVIEW_REQUIRED',message:'먼저 미리보기를 실행한 뒤 같은 결과를 적용하세요.'};
  let lock=null;try{if(typeof LockService!=='undefined'){lock=LockService.getScriptLock();lock.waitLock(30000);}const refreshed=bus70PublicTransitBuildPreview_(body&&body.route,body&&body.date);if(!refreshed.ok)return refreshed;if(refreshed.previewToken!==requestedToken)return {ok:false,error:'PUBLIC_IMPORT_STALE',message:'공공데이터 또는 기존 좌표가 바뀌었습니다. 다시 미리보기 하세요.'};if(!refreshed.changed){const unchanged=bus70PublicTransitPublicPreview_(refreshed);unchanged.rowsWritten=0;unchanged.message='이미 같은 정류장 원장이 적용되어 있습니다.';return unchanged;}
    const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=bus70RoutePartitionSheet_(ss,refreshed.route,'stops',true),headers=sheet.getDataRange().getDisplayValues()[0],c=bus70RoutePartitionHeaderMap_(headers),dataSetId='R'+refreshed.route+'-'+refreshed.sourceDate.replace(/-/g,'')+'-'+refreshed.previewToken,now=new Date(),values=refreshed.stops.map(function(stop){const row=new Array(headers.length).fill('');row[c['stopId']]=stop.id;row[c['노선']]=refreshed.route;row[c['방향']]=stop.direction;row[c['정류장순서']]=stop.order;row[c['정류장명']]=stop.name;row[c['정류장번호']]=stop.number;row[c['위도']]=stop.lat===null?'':stop.lat;row[c['경도']]=stop.lng===null?'':stop.lng;row[c['기점']]=stop.origin?'Y':'';row[c['종점']]=stop.terminal?'Y':'';row[c['회차점']]=stop.turnaround?'Y':'';row[c['적용시작']]=refreshed.date;row[c['상태']]='사용';row[c['원본근거']]=refreshed.provider===BUS70_GYEONGGI_ROUTE_PROVIDER_?'공공데이터포털·경기도 버스노선 조회 v2':'공공데이터포털·국토교통부 노선별 경유정류장 API'+(stop.coordinateProvider?' + 정류장 좌표 API':'');row[c['수정시간']]=now;row[c['자료세트ID']]=dataSetId;row[c['외부노선ID']]=stop.externalRouteId;row[c['외부정류장ID']]=stop.externalStopId;row[c['시도코드']]=stop.ctpvCode;row[c['시군구코드']]=stop.sggCode;row[c['읍면동코드']]=stop.emdCode;row[c['자료기준일']]=refreshed.sourceDate;row[c['자료제공처']]=refreshed.provider;row[c['좌표제공처']]=stop.coordinateProvider||'';row[c['좌표상태']]=stop.coordinateStatus;row[c['검토상태']]=stop.reviewStatus;row[c['처리자']]=String(requesterId||'');return row;});
    sheet.getRange(sheet.getLastRow()+1,1,values.length,headers.length).setValues(values);if(typeof writeAudit_==='function')writeAudit_(requesterId,'소장','노선정류장DB',dataSetId,'공공데이터 동기화',{}, {route:refreshed.route,stopCount:values.length,sourceDate:refreshed.sourceDate},'정류장 원장 비파괴 추가');
    const result=bus70PublicTransitPublicPreview_(refreshed);result.dataSetId=dataSetId;result.rowsWritten=values.length;result.message=refreshed.route+'번 정류장 원장 '+values.length+'개를 새 자료세트로 저장했습니다.';return result;
  }finally{if(lock)lock.releaseLock();}
}

function bus70PublicTransitManagerAction_(action, body, requesterId) {
  if(typeof bus70IsManager_==='function'&&!bus70IsManager_(requesterId))return {ok:false,error:'MANAGER_REQUIRED',message:'소장 또는 마스터 권한이 필요합니다.'};
  if(action==='routeStopImportStatus')return bus70PublicTransitStatus_(body&&body.route);
  if(action==='routeStopImportPreview')return bus70PublicTransitImportPreview_(body||{});
  if(action==='routeStopImportApply')return bus70PublicTransitImportApply_(body||{},requesterId);
  return {ok:false,error:'UNKNOWN_ACTION',message:'지원하지 않는 공공데이터 요청입니다.'};
}

// GBIS reports a queried stop/status snapshot, not a vehicle GPS fix or its
// observation timestamp. Never substitute its query time for an event time.
function bus70GyeonggiLiveParse_(json,routeId,fetchedAt){
  const envelope=json&&json.response||json||{},header=envelope.msgHeader||{},code=String(header.resultCode==null?'':header.resultCode);
  if(code!=='0')return {ok:false,available:false,error:'GBIS_RESPONSE',message:code==='4'?'경기도 운행 차량정보 없음':'경기도 차량위치 API 응답 확인 필요',fetchedAt:fetchedAt};
  let items=envelope.msgBody&&envelope.msgBody.busLocationList||[];if(!Array.isArray(items))items=[items];
  items=items.filter(function(v){return String(v.routeId)===String(routeId)&&v.plateNo&&Number.isInteger(Number(v.stationSeq))&&Number(v.stationSeq)>0;}).map(function(v){return {plateNo:String(v.plateNo),vehicleId:String(v.vehId||''),stationId:String(v.stationId||''),stationSeq:Number(v.stationSeq),stateCd:Number(v.stateCd)};});
  return {ok:true,available:true,items:items,fetchedAt:fetchedAt,queryTime:String(header.queryTime||''),source:'GYEONGGI_BUS_LOCATION_V2'};
}
function bus70GyeonggiLiveFetch_(route){
  const config=bus70PublicTransitRouteConfig_(route),key=bus70PublicTransitProperty_('BUS70_DATA_GO_KR_SERVICE_KEY');
  if(!config||config.provider!==BUS70_GYEONGGI_ROUTE_PROVIDER_||!config.routeId)return {available:false,message:'경기도 차량위치 노선 연결 필요'};
  if(!key)return {available:false,message:'경기도 차량위치 인증 설정 필요'};
  const cache=CacheService.getScriptCache(),cacheKey='BUS70_GBIS_LIVE_V1_'+config.routeId,raw=cache.get(cacheKey);
  if(raw){try{return JSON.parse(raw);}catch(ignore){}}
  let result;
  try{
    const url=bus70PublicTransitQueryUrl_('https://apis.data.go.kr/6410000/buslocationservice/v2/getBusLocationListv2',key,{format:'json',routeId:config.routeId});
    const response=UrlFetchApp.fetch(url,{method:'get',muteHttpExceptions:true,followRedirects:false,headers:{Accept:'application/json'}});
    result=response.getResponseCode()===200?bus70GyeonggiLiveParse_(JSON.parse(response.getContentText('UTF-8')),config.routeId,Date.now()):{available:false,message:'경기도 차량위치 API 이용 권한·연결 확인 필요',error:'GBIS_HTTP_'+response.getResponseCode()};
  }catch(ignore){result={available:false,message:'경기도 차량위치 응답 대기',error:'GBIS_UNAVAILABLE'};}
  cache.put(cacheKey,JSON.stringify(result),result.available?30:120);return result;
}
function bus70GyeonggiSelectVehicle_(items,plate){
  const normalize=function(value){return String(value||'').replace(/[\s.-]/g,'');},wanted=normalize(plate);
  if(!wanted)return null;
  let matches=items.filter(function(v){return normalize(v.plateNo)===wanted;});
  if(matches.length===1)return matches[0];
  // Four-digit registry numbers are accepted only when unique on this route.
  if(/^\d{4}$/.test(wanted))matches=items.filter(function(v){return normalize(v.plateNo).endsWith(wanted);});
  return matches.length===1?matches[0]:null;
}
function bus70GyeonggiCompare_(vehicle,stops,own,now){
  const stop=stops.find(function(s){return Number(s.order)===vehicle.stationSeq;}),result={available:true,status:'REFERENCE',stationSeq:vehicle.stationSeq,stationId:vehicle.stationId,stateCd:vehicle.stateCd,stopName:stop?stop.name:'정류장 순번 '+vehicle.stationSeq};
  if(!own||now-Number(own.recordedAtMs)>20000||Number(own.accuracyM)>60)return result;
  const nearby=stops.map(function(s){return {order:Number(s.order),distance:bus70LiveLocationDistance_(own,{latitude:s.lat,longitude:s.lng})};}).filter(function(s){return s.distance!==null&&s.distance<=400;});
  // Repeated roadside names are never a matching key. A nearby sequence is a
  // corroborating signal only; the provider does not publish observation time.
  const phoneOrder=Number(own.matchedStopOrder);
  if(nearby.length&&Number.isInteger(phoneOrder)&&phoneOrder>0)result.status=Math.abs(phoneOrder-vehicle.stationSeq)<=2&&nearby.some(function(s){return Math.abs(s.order-phoneOrder)<=2;})?'AGREE':'DIFFERENT';
  return result;
}
function bus70GyeonggiCrossCheck_(assignment,own){
  if(assignment.date!==bus70GyeonggiToday_())return {available:false,message:'현재 운행일에만 차량정보 대조'};
  const fetched=bus70GyeonggiLiveFetch_(assignment.route);if(!fetched.available)return fetched;
  let plate='',sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('차량DB');
  if(sheet&&sheet.getLastRow()>1){const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]);const row=rows.slice(1).find(function(v){return String(v[c['vehicleId']])===String(assignment.vehicleId);});if(row)plate=String(row[c['차량번호']]||'');}
  if(!plate&&/^VEH-\d{4}$/.test(assignment.vehicleId))plate=assignment.vehicleId.slice(-4);
  const vehicle=bus70GyeonggiSelectVehicle_(fetched.items,plate);
  if(!vehicle)return {available:false,message:'경기도 배정 차량정보 수신 대기',fetchedAt:fetched.fetchedAt};
  const result=bus70GyeonggiCompare_(vehicle,bus70RouteStopsFromDb_(assignment.route,assignment.date).stops||[],own,Date.now());
  result.fetchedAt=fetched.fetchedAt;result.source=fetched.source;return result;
}
function BUS70_checkGyeonggiLiveConnection(){
  const result=bus70GyeonggiLiveFetch_('5');
  console.log(JSON.stringify({available:result.available,error:result.error||'',message:result.message||'',vehicleCount:(result.items||[]).length,fetchedAt:result.fetchedAt||null}));
}
