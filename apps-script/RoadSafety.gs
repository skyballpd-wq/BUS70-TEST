// Approved route-specific safety observations are private operational configuration.
// Blank, expired, directionless or unreviewed rows never become audible warnings.
function bus70RoadSafetyData_(route) {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName('안전운전구역DB');
  if(!sheet||sheet.getLastRow()<2)return {available:false,zones:[],message:'안전경고 자료 미등록'};
  const rows=sheet.getDataRange().getDisplayValues(),c=makeHeaderMap_(rows[0]),zones=[];
  const val=function(r,k){return c[k]===undefined?'':String(r[c[k]]||'').trim();};
  const num=function(r,k){const v=val(r,k);return v!==''&&Number.isFinite(Number(v))?Number(v):null;};
  const minute=function(v){const m=String(v).match(/^(\d\d):(\d\d)$/);return m&&Number(m[1])<24&&Number(m[2])<60?Number(m[1])*60+Number(m[2]):null;};
  rows.slice(1).forEach(function(r){
    if(val(r,'상태')!=='확정'||val(r,'노선')!==String(route))return;
    const from=normalizeDate_(val(r,'적용시작')),through=normalizeDate_(val(r,'적용종료')),start=minute(val(r,'시작시각')),end=minute(val(r,'종료시각'));
    if(!from||!through||!val(r,'출처')||!val(r,'확인일')||(Boolean(val(r,'시작시각'))!==Boolean(val(r,'종료시각')))||((val(r,'시작시각')||val(r,'종료시각'))&&(start===null||end===null)))return;
    const z={id:val(r,'zoneId'),route:String(route),type:val(r,'구분'),name:val(r,'명칭'),lat:num(r,'위도'),lng:num(r,'경도'),bearing:num(r,'진행방위각'),speedLimit:num(r,'제한속도'),stopOrder:num(r,'정류장순번'),validFrom:from,validThrough:through,startMinute:start,endMinute:end,source:val(r,'출처'),verifiedAt:val(r,'확인일'),verified:true};
    if(z.id&&['CAMERA','SCHOOL'].indexOf(z.type)!==-1&&z.lat!==null&&z.lng!==null&&z.bearing!==null&&z.speedLimit!==null&&z.stopOrder!==null)zones.push(z);
  });
  return {available:Boolean(zones.length),zones:zones,message:zones.length?'확인된 구간 안내':'안전경고 자료 미등록'};
}
