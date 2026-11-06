/* Foreground assistance for verified, dated route hazards. No invented speed limits. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70RoadSafety=api;})(typeof window==='object'?window:this,function(){
  'use strict';
  const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const rad=v=>v*Math.PI/180;
  function distance(a,b){const v=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;return 6371000*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));}
  const angle=(a,b)=>Math.abs(((a-b+540)%360)-180);
  function evaluate(input,state={}){
    const p=input.position,c=p?.coords||{},now=input.now,nav=input.navigation,zones=input.data?.zones||[],scope=input.scope;
    const out={status:'대기',warning:null,notify:false,state};
    if(!input.active||!scope){out.status='운행 중에 안내';return out;}
    if(!zones.length){out.status='안전경고 자료 미등록';return out;}
    if(!p||!number(p.timestamp)||now-p.timestamp>6000||p.timestamp>now||!number(c.accuracy)||c.accuracy<0||c.accuracy>30||!number(c.speed)||c.speed<0||c.speed>55||(number(c.speedAccuracy)&&c.speedAccuracy>2.5)||!number(c.latitude)||Math.abs(c.latitude)>90||!number(c.longitude)||Math.abs(c.longitude)>180||!number(c.heading)||c.heading<0||c.heading>=360||!nav?.configured||nav.retained){out.status='안전경고 GPS 확인 중';return out;}
    const scopeKey=[scope.route,scope.date,scope.dispatchId,scope.trip].join('|');
    if(state.scopeKey!==scopeKey)state={scopeKey,notices:{}};
    out.state=state;out.status='안전구간 감시 중';
    const here={lat:Number(c.latitude),lng:Number(c.longitude)},speed=Number(c.speed)*3.6;
    const at=new Date(now+9*3600000),minute=at.getUTCHours()*60+at.getUTCMinutes(),today=at.toISOString().slice(0,10);
    const candidates=[];
    for(const z of zones){
      if(!z.verified||String(z.route)!==String(scope.route)||!z.source||!z.validFrom||!z.validThrough||today<z.validFrom||today>z.validThrough||!number(z.lat)||!number(z.lng)||Math.abs(z.lat)>90||Math.abs(z.lng)>180||!number(z.bearing)||z.bearing<0||z.bearing>=360||!number(z.speedLimit)||z.speedLimit<10||z.speedLimit>120||!number(z.stopOrder)||!number(input.stopOrder))continue;
      if(angle(c.heading,z.bearing)>40||Math.abs(Number(input.stopOrder)-Number(z.stopOrder))>1)continue;
      if(z.startMinute!=null&&z.endMinute!=null){const inside=z.startMinute<=z.endMinute?minute>=z.startMinute&&minute<z.endMinute:minute>=z.startMinute||minute<z.endMinute;if(!inside)continue;}
      const d=distance(here,z),lat=rad(z.lat-here.lat)*6371000,lng=rad(z.lng-here.lng)*6371000*Math.cos(rad(here.lat)),forward=lat*Math.cos(rad(c.heading))+lng*Math.sin(rad(c.heading)),lateral=Math.abs(-lat*Math.sin(rad(c.heading))+lng*Math.cos(rad(c.heading)));
      if(forward< -15||lateral>35||d>Math.max(180,Math.min(400,speed/3.6*15)))continue;
      candidates.push({...z,distanceM:Math.round(d),speedKmh:Math.round(speed),overspeed:speed>z.speedLimit});
    }
    candidates.sort((a,b)=>Number(b.overspeed)-Number(a.overspeed)||a.distanceM-b.distanceM);
    const z=candidates[0];if(!z)return out;
    out.warning=z;out.status=(z.type==='SCHOOL'?'어린이보호구역':'속도제한 구간')+' '+z.speedLimit+'km/h · '+z.distanceM+'m 전방';
    const key=z.id+'|'+(z.overspeed?'over':'approach'),last=state.notices[key];
    out.notify=!number(last)||now-last> (z.overspeed?20000:180000);
    out.key=key;out.message=z.overspeed?'제한속도 '+z.speedLimit+'킬로미터입니다. 속도를 줄여 주세요.':(z.type==='SCHOOL'?'전방 어린이보호구역입니다. ':'전방 속도제한 구간입니다. ')+'제한속도 '+z.speedLimit+'킬로미터입니다.';
    return out;
  }
  function notified(result,now){if(result.notify&&result.key)result.state.notices[result.key]=now;}
  return {evaluate,notified};
});
