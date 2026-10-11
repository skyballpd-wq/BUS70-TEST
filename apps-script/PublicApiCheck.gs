/* Run BUS70_checkPublicApi in the existing BUS70_TEST_DB Apps Script editor.
 * Read-only: checks the stored key against the official Gyeonggi route API.
 * It does not change properties, sheets, route configuration, or deployments.
 * Never log the request URL, authentication key, or raw response/error.
 */
function BUS70_checkPublicApi() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    'https://www.googleapis.com/auth/script.external_request'
  ]);
  const rawKey=String(PropertiesService.getScriptProperties()
    .getProperty('BUS70_DATA_GO_KR_SERVICE_KEY')||'').trim();
  if(!rawKey){console.log('인증키 미등록');return;}
  const key=/%[0-9a-f]{2}/i.test(rawKey)?rawKey:encodeURIComponent(rawKey);
  const list=value=>Array.isArray(value)?value:value?[value]:[];
  const clean=value=>String(value==null?'':value).split(rawKey).join('[비공개]')
    .split(key).join('[비공개]').replace(/[\r\n]/g,' ').slice(0,120);
  function request(operation,parameter) {
    const url='https://apis.data.go.kr/6410000/busrouteservice/v2/'+operation+
      '?format=json&serviceKey='+key+'&'+parameter;
    let response;
    try{response=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:false});}
    catch(error){
      let reason=String(error&&error.message||error);
      if(/script\.external_request|permission|권한/i.test(reason)) {
        throw new Error('외부요청 권한 부족: script.external_request 설정과 Google 권한 승인을 확인하세요.');
      }
      const secrets=[rawKey,key];
      try{secrets.push(decodeURIComponent(rawKey));}catch(ignored){}
      secrets.filter(Boolean).sort((a,b)=>b.length-a.length).forEach(function(secret){
        reason=reason.split(secret).join('[인증키 숨김]');
      });
      reason=reason.replace(/https?:\/\/[^\s"'<>]+/gi,'[요청주소 숨김]');
      throw new Error('외부 요청 오류: '+reason.replace(/[\r\n]/g,' ').slice(0,200));
    }
    const http=response.getResponseCode(),text=response.getContentText('UTF-8');
    let envelope;
    try{const json=JSON.parse(text);envelope=json.response||json;}
    catch(error){
      const code=text.match(/<(?:returnReasonCode|resultCode)>\s*(\d+)\s*</i);
      const known=text.match(/\b(?:SERVICE_ACCESS_DENIED_ERROR|PERMISSION_DENIED|SERVICE_KEY_IS_NOT_REGISTERED_ERROR|DEADLINE_HAS_EXPIRED_ERROR|LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR)\b/);
      throw new Error('HTTP '+http+' / '+(known?known[0]:code?'응답코드 '+code[1]:'JSON 응답 아님'));
    }
    const header=envelope.msgHeader||envelope.header||{};
    const code=String(header.resultCode==null?'':header.resultCode).trim();
    if(http!==200||!/^0+$/.test(code)){
      throw new Error('HTTP '+http+' / 응답코드 '+(/^\d{1,4}$/.test(code)?code:'확인불가'));
    }
    return envelope.msgBody||envelope.body||{};
  }
  console.log('BUS70 API 점검 시작 — 인증키 값은 출력하지 않습니다.');
  const report=[];
  ['5','70'].forEach(function(route){
    try{
      const found=request('getBusRouteListv2','keyword='+route);
      const candidates=list(found.busRouteList).filter(item=>String(item.routeName).trim()===route &&
        /부천/.test(String(item.adminName||'')+' '+String(item.regionName||'')));
      const ids=Array.from(new Set(candidates.map(item=>String(item.routeId||''))));
      if(!ids.length)throw new Error('부천 '+route+'번 노선 후보 없음');
      if(ids.length>10)throw new Error('후보가 여러 개여서 검토 필요');
      const verified=[];
      ids.forEach(function(id){
        const details=request('getBusRouteInfoItemv2','routeId='+encodeURIComponent(id));
        list(details.busRouteInfoItem).forEach(function(info){
          if(String(info.routeId)===id&&String(info.routeName).trim()===route&&
            /소신여객/.test(String(info.companyName||'').replace(/\s/g,'')))verified.push(info);
        });
      });
      if(verified.length!==1)throw new Error('소신여객 일치 후보 '+verified.length+'개: 자동 확정 보류');
      const info=verified[0],data=request('getBusRouteStationListv2','routeId='+encodeURIComponent(info.routeId));
      const stops=list(data.busRouteStationList);
      if(!stops.length)throw new Error('노선 확인됨 / 경유정류장 응답 없음');
      const coordinates=stops.filter(stop=>Number(stop.x)>=124&&Number(stop.x)<=132&&Number(stop.y)>=32&&Number(stop.y)<=40).length;
      const result={노선:route,노선ID:clean(info.routeId),운수사:clean(info.companyName),
        기점:clean(info.startStationName),종점:clean(info.endStationName),
        정류장수:stops.length,좌표보유수:coordinates,
        회차점:stops.filter(stop=>String(stop.turnYn).toUpperCase()==='Y').map(stop=>({순서:clean(stop.stationSeq),이름:clean(stop.stationName)}))};
      console.log(JSON.stringify(result));report.push(result);
    }catch(error){
      const result={노선:route,상태:'점검 필요',안내:clean(error.message)};
      console.log(JSON.stringify(result));report.push(result);
    }
  });
  console.log('점검 종료 — 노선 설정과 정류장DB는 변경하지 않았습니다.');
  return report;
}
