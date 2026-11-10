// Approved route-specific safety observations are private operational configuration.
// Blank, expired, directionless or unreviewed rows never become audible warnings.
function bus70RoadSafetyData_(route) {
  const ss=SpreadsheetApp.getActiveSpreadsheet(),sheet=ss.getSheetByName('안전운전구역DB');
  const diagnostics={reason:'DATASET_MISSING',candidateCount:0,registeredCount:0,rejectedCount:0,expiredCount:0,usableCount:0};
  const candidates=ss.getSheetByName('보호시설후보DB');
  if(candidates&&candidates.getLastRow()>1){const cr=candidates.getDataRange().getDisplayValues(),cc=makeHeaderMap_(cr[0]);diagnostics.candidateCount=cr.slice(1).filter(function(r){return String(r[cc['노선']]||'').trim()===String(route)&&String(r[cc['상태']]||'').trim()==='후보';}).length;}
  const finish=function(zones){diagnostics.usableCount=zones.length;return {available:Boolean(zones.length),zones:zones,diagnostics:diagnostics,message:zones.length?'확인된 구간 안내':'실제 경고 중지 · 검증 구간 0건'+(diagnostics.candidateCount?' / 후보 '+diagnostics.candidateCount+'건':'')};};
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

function bus70RoadSafetyAudit_(driverId,route,data) {
  const d=data.diagnostics||{},reason=String(d.reason||'UNKNOWN');
  const cache=CacheService.getScriptCache(),key=['BUS70_SAFETY_DATA',driverId,route,reason,Number(d.candidateCount)||0,Number(d.usableCount)||0].join('_');
  if(cache.get(key))return;
  try{writeAudit_(driverId,'기사','안전운전구역DB',String(route),'안전운전 자료 점검',{}, {reason:reason,candidateCount:Number(d.candidateCount)||0,usableCount:Number(d.usableCount)||0,rejectedCount:Number(d.rejectedCount)||0,expiredCount:Number(d.expiredCount)||0},'자료 수신 상태; 실제 음성 재생·도로 통과를 의미하지 않음');cache.put(key,'Y',21600);}
  catch(ignore){data.diagnostics.logUnavailable=true;}
}
