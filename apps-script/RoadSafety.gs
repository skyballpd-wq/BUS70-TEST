// Approved route-specific safety observations are private operational configuration.
// Blank, expired, directionless or unreviewed rows never become audible warnings.
function bus70RoadSafetyData_(route) {
  const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=ss.getSheetByName('안전운전구역DB');
  const diagnostics={reason:'DATASET_MISSING',candidateCount:0,registeredCount:0,rejectedCount:0,expiredCount:0,usableCount:0};
  const candidates=ss.getSheetByName('보호시설후보DB');
  if(candidates&&candidates.getLastRow()>1){const cr=candidates.getDataRange().getDisplayValues(),cc=makeHeaderMap_(cr[0]);diagnostics.candidateCount=cr.slice(1).filter(function(r){return String(r[cc['노선']]||'').trim()===String(route)&&String(r[cc['상태']]||'').trim()==='후보';}).length;}
  const advisories=bus70SchoolFacilityAdvisories_(candidates,route);
  const finish=function(zones){diagnostics.usableCount=zones.length;diagnostics.advisoryCount=advisories.length;return {available:Boolean(zones.length||advisories.length),zones:zones,advisories:advisories,diagnostics:diagnostics,message:zones.length?'확인된 구간 안내':advisories.length?'보호시설 인근 안내 · 제한속도 미확인':'실제 경고 중지 · 검증 구간 0건'+(diagnostics.candidateCount?' / 후보 '+diagnostics.candidateCount+'건':'')};};
  if(!sheet||sheet.getLastRow()<2)return finish([]);
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]),zones=[];
  diagnostics.reason='NO_VERIFIED_ZONES';
  const today=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
  const val=function(r,k){return c[k]===undefined?'':String(r[c[k]]||'').trim();};
  const num=function(r,k){const v=val(r,k);return v!==''&&Number.isFinite(Number(v))?Number(v):null;};
  const minute=function(v){const m=String(v).match(/^(\d\d):(\d\d)$/);return m&&Number(m[1])<24&&Number(m[2])<60?Number(m[1])*60+Number(m[2]):null;};
  rows.slice(1).forEach(function(r){
    if(val(r,'노선')!==String(route))return;
    diagnostics.registeredCount++;
    if(val(r,'상태')!=='확정'){diagnostics.rejectedCount++;return;}
    const from=normalizeDate_(val(r,'적용시작')),through=normalizeDate_(val(r,'적용종료')),start=minute(val(r,'시작시각')),end=minute(val(r,'종료시각'));
    if(!from||!through||from>through||!val(r,'출처')||!val(r,'확인일')||(Boolean(val(r,'시작시각'))!==Boolean(val(r,'종료시각')))||((val(r,'시작시각')||val(r,'종료시각'))&&(start===null||end===null))){diagnostics.rejectedCount++;return;}
    if(today<from||today>through){diagnostics.expiredCount++;return;}
    const z={id:val(r,'zoneId'),route:String(route),type:val(r,'구분'),name:val(r,'명칭'),lat:num(r,'위도'),lng:num(r,'경도'),bearing:num(r,'진행방위각'),speedLimit:num(r,'제한속도'),stopOrder:num(r,'정류장순번'),validFrom:from,validThrough:through,startMinute:start,endMinute:end,source:val(r,'출처'),verifiedAt:val(r,'확인일'),verified:true};
    if(z.id&&['CAMERA','SCHOOL'].indexOf(z.type)!==-1&&z.lat!==null&&Math.abs(z.lat)<=90&&z.lng!==null&&Math.abs(z.lng)<=180&&z.bearing!==null&&z.bearing>=0&&z.bearing<360&&z.speedLimit!==null&&z.speedLimit>=10&&z.speedLimit<=120&&z.stopOrder!==null&&z.stopOrder>=1)zones.push(z);
    else diagnostics.rejectedCount++;
  });
  diagnostics.reason=zones.length?'READY':diagnostics.expiredCount&&!diagnostics.rejectedCount?'OUTSIDE_VALIDITY':'NO_VERIFIED_ZONES';
  return finish(zones);
}

// The public school dataset identifies facilities, not road boundaries or
// enforcement cameras. Keep these advisories separate from verified zones.
function bus70SchoolFacilityAdvisories_(sheet,route) {
  if(!sheet||sheet.getLastRow()<2)return [];
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]),today=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd');
  const required=['facilityId','노선','시설명','위도','경도','데이터기준일','출처','상태'];
  if(required.some(function(k){return c[k]===undefined;}))return [];
  const out=[],seen={};
  rows.slice(1).forEach(function(r){
    const v=function(k){return c[k]===undefined?'':String(r[c[k]]||'').trim();};
    const date=normalizeDate_(v('데이터기준일')),age=Date.parse(today)-Date.parse(date),lat=v('위도'),lng=v('경도'),id=v('facilityId');
    if(v('노선')!==String(route)||!['후보','확정'].includes(v('상태'))||v('어린이보호구역지정여부')==='N'||v('출처')!=='https://www.data.go.kr/data/15012891/standard.do'||!id||seen[id]||!date||!Number.isFinite(age)||age<0||age>730*86400000||!lat||!lng||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lng))||Math.abs(Number(lat))>90||Math.abs(Number(lng))>180)return;
    seen[id]=true;out.push({id:id,route:String(route),type:'SCHOOL_FACILITY',name:v('시설명'),lat:Number(lat),lng:Number(lng),source:v('출처'),dataDate:date,positionBasis:'FACILITY_POINT',verified:false});
  });
  return out;
}

function bus70RoadSafetyAudit_(driverId,route,data) {
  const d=data.diagnostics||{},reason=String(d.reason||'UNKNOWN');
  const cache=CacheService.getScriptCache(),key=['BUS70_SAFETY_DATA',driverId,route,reason,Number(d.candidateCount)||0,Number(d.usableCount)||0,Number(d.advisoryCount)||0].join('_');
  if(cache.get(key))return;
  try{writeAudit_(driverId,'기사','안전운전구역DB',String(route),'안전운전 자료 점검',{}, {reason:reason,candidateCount:Number(d.candidateCount)||0,usableCount:Number(d.usableCount)||0,advisoryCount:Number(d.advisoryCount)||0,rejectedCount:Number(d.rejectedCount)||0,expiredCount:Number(d.expiredCount)||0},'자료 수신 상태; 실제 음성 재생·도로 통과를 의미하지 않음');cache.put(key,'Y',21600);}
  catch(ignore){data.diagnostics.logUnavailable=true;}
}

// Editor-only, bounded connection/schema inspection. This does not register
// cameras, alter verified zones, or expose an endpoint through doPost.
// Official spec: https://www.data.go.kr/data/15155042/openapi.do
function BUS70_inspectCctvApi() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))return {ok:false,status:'BUSY'};
  try {
    const cache=CacheService.getScriptCache(),cacheKey='BUS70_CCTV_API_INSPECTION';
    const saved=cache.get(cacheKey);if(saved)return JSON.parse(saved);
    let key=String(PropertiesService.getScriptProperties().getProperty('BUS70_DATA_GO_KR_SERVICE_KEY')||'').trim();
    if(!key)return {ok:false,status:'KEY_NOT_CONFIGURED'};
    try{if(key.includes('%'))key=decodeURIComponent(key);}catch(ignore){return {ok:false,status:'KEY_FORMAT_INVALID'};}
    let result;
    try {
      const query={serviceKey:key,pageNo:1,numOfRows:1,returnType:'json','cond[LCTN_ROAD_NM_ADDR::LIKE]':'부천시'};
      const url='https://apis.data.go.kr/1741000/cctv_info/info?'+Object.keys(query).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(query[k]);}).join('&');
      const response=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:false});
      result=bus70CctvInspectionResponse_(response.getResponseCode(),response.getContentText());
    }catch(ignore){result={ok:false,status:'CONNECTION_FAILED'};}
    result.checkedAt=Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd HH:mm:ss');
    result.source='https://www.data.go.kr/data/15155042/openapi.do';
    result.enforcementEnabled=false;
    try{writeAudit_('SYSTEM-SAFETY-SOURCE-CHECK','시스템','안전운전구역DB','MOIS-CCTV','공공 안전자료 연결 점검',{},result,'응답 구조만 확인; 카메라·제한속도·단속구간 등록 없음');result.auditRecorded=true;}
    catch(ignore){result.auditRecorded=false;}
    // Cache only this sanitized summary, never the URL, key or raw response.
    cache.put(cacheKey,JSON.stringify(result),900);
    console.log(JSON.stringify(result));return result;
  }finally{lock.releaseLock();}
}
function bus70CctvInspectionResponse_(http,text) {
  if(http!==200)return {ok:false,status:http===429?'RATE_LIMITED':'HTTP_ERROR',httpStatus:Number(http)};
  let data;try{data=JSON.parse(text);}catch(ignore){
    const match=String(text).match(/<(?:returnReasonCode|resultCode)>\s*(\d{1,3})\s*<\//);
    return {ok:false,status:match?'PROVIDER_ERROR':'FORMAT_UNCONFIRMED',providerCode:match?match[1]:''};
  }
  const gateway=data&&data.OpenAPI_ServiceResponse&&data.OpenAPI_ServiceResponse.cmmMsgHeader;
  if(gateway&&typeof gateway==='object'){
    const code=String(gateway.returnReasonCode===undefined?'':gateway.returnReasonCode);
    return {ok:false,status:'PROVIDER_ERROR',providerCode:/^\d{1,3}$/.test(code)?code:'UNKNOWN'};
  }
  const response=data&&data.response,header=response&&response.header;
  if(!response||!header||typeof header!=='object')return {ok:false,status:'SCHEMA_UNCONFIRMED'};
  const code=String(header.resultCode===undefined?'':header.resultCode);
  if(!['00','0'].includes(code))return {ok:false,status:'PROVIDER_ERROR',providerCode:/^\d{1,3}$/.test(code)?code:'UNKNOWN'};
  const body=response.body||{},raw=body.items,items=Array.isArray(raw)?raw:Array.isArray(raw&&raw.item)?raw.item:raw&&raw.item?[raw.item]:null;
  if(!items)return {ok:false,status:'SCHEMA_UNCONFIRMED'};
  const fields=items[0]&&typeof items[0]==='object'?Object.keys(items[0]).filter(function(k){return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k);}).sort():[];
  return {ok:true,status:items.length?'CONNECTED_SCHEMA_REVIEW_REQUIRED':'CONNECTED_EMPTY',sampleCount:items.length,fields:fields};
}
