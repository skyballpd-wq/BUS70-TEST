/* Foreground assistance for verified, dated route hazards. No invented speed limits. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70RoadSafety=api;})(typeof window==='object'?window:this,function(){
  'use strict';
  const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const rad=v=>v*Math.PI/180;
  function distance(a,b){const v=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;return 6371000*2*Math.atan2(Math.sqrt(v),Math.sqrt(Math.max(0,1-v)));}
  const angle=(a,b)=>Math.abs(((a-b+540)%360)-180);
  function readiness(data){
    if(Array.isArray(data?.zones)&&data.zones.length)return {ready:true,message:'안전구간 자료 준비됨'};
    if(data?.advisories?.length)return {ready:true,message:'보호시설 인근 안내 · 제한속도 미확인'};
    const count=Math.max(0,Number(data?.diagnostics?.candidateCount)||0);
    return {ready:false,message:data?.diagnostics?.reason==='LOAD_ERROR'?'실제 경고 중지 · 안전구간 연결 오류':'실제 경고 중지 · 검증 구간 0건'+(count?' / 후보 '+count+'건':'')};
  }
  function evaluate(input,state={}){
    const p=input.position,c=p?.coords||{},now=input.now,nav=input.navigation,zones=input.data?.zones||[],advisories=input.data?.advisories||[],scope=input.scope;
    const heading=number(c.heading)&&c.heading>=0&&c.heading<360?Number(c.heading):nav?.timestamp===p?.timestamp&&number(nav.heading)&&nav.heading>=0&&nav.heading<360&&number(nav.nearestDistanceM)&&nav.nearestDistanceM<=50?Number(nav.heading):null;
    const out={status:'대기',warning:null,notify:false,state};
    if(!input.active||!scope){out.status='운행 중에 안내';return out;}
    if(!zones.length&&!advisories.length){out.status=readiness(input.data).message;return out;}
    if(!p||!number(p.timestamp)||now-p.timestamp>6000||p.timestamp>now||!number(c.accuracy)||c.accuracy<0||c.accuracy>30||!number(c.speed)||c.speed<0||c.speed>55||(number(c.speedAccuracy)&&c.speedAccuracy>2.5)||!number(c.latitude)||Math.abs(c.latitude)>90||!number(c.longitude)||Math.abs(c.longitude)>180||heading===null||!nav?.configured||nav.retained){out.status='안전경고 GPS 확인 중';return out;}
    const scopeKey=[scope.route,scope.date,scope.dispatchId,scope.trip].join('|');
    if(state.scopeKey!==scopeKey)state={scopeKey,notices:{}};
    out.state=state;out.status=zones.length?'안전구간 감시 중':'보호시설 인근 안내 · 제한속도 미확인';
    const here={lat:Number(c.latitude),lng:Number(c.longitude)},speed=Number(c.speed)*3.6;
    const at=new Date(now+9*3600000),minute=at.getUTCHours()*60+at.getUTCMinutes(),today=at.toISOString().slice(0,10);
    const candidates=[];
    for(const z of zones){
      if(!z.verified||String(z.route)!==String(scope.route)||!z.source||!z.validFrom||!z.validThrough||today<z.validFrom||today>z.validThrough||!number(z.lat)||!number(z.lng)||Math.abs(z.lat)>90||Math.abs(z.lng)>180||!number(z.bearing)||z.bearing<0||z.bearing>=360||!number(z.speedLimit)||z.speedLimit<10||z.speedLimit>120||!number(z.stopOrder)||!number(input.stopOrder))continue;
      if(angle(heading,z.bearing)>40||Math.abs(Number(input.stopOrder)-Number(z.stopOrder))>1)continue;
      if(z.startMinute!=null&&z.endMinute!=null){const inside=z.startMinute<=z.endMinute?minute>=z.startMinute&&minute<z.endMinute:minute>=z.startMinute||minute<z.endMinute;if(!inside)continue;}
      const d=distance(here,z),lat=rad(z.lat-here.lat)*6371000,lng=rad(z.lng-here.lng)*6371000*Math.cos(rad(here.lat)),forward=lat*Math.cos(rad(heading))+lng*Math.sin(rad(heading)),lateral=Math.abs(-lat*Math.sin(rad(heading))+lng*Math.cos(rad(heading)));
      if(forward< -15||lateral>35||d>Math.max(180,Math.min(400,speed/3.6*15)))continue;
      candidates.push({...z,distanceM:Math.round(d),speedKmh:Math.round(speed),overspeed:speed>z.speedLimit});
    }
    candidates.sort((a,b)=>Number(b.overspeed)-Number(a.overspeed)||a.distanceM-b.distanceM);
    const z=candidates[0];if(!z)return facilityNotice(input,state,out,heading,here,advisories);
    out.warning=z;out.status=(z.type==='SCHOOL'?'어린이보호구역':'속도제한 구간')+' '+z.speedLimit+'km/h · '+z.distanceM+'m 전방';
    const key=z.id+'|'+(z.overspeed?'over':'approach'),last=state.notices[key];
    out.notify=!number(last)||now-last> (z.overspeed?20000:180000);
    out.key=key;out.message=z.overspeed?'제한속도 '+z.speedLimit+'킬로미터입니다. 속도를 줄여 주세요.':(z.type==='SCHOOL'?'전방 어린이보호구역입니다. ':'전방 속도제한 구간입니다. ')+'제한속도 '+z.speedLimit+'킬로미터입니다.';
    return out;
  }
  function facilityNotice(input,state,out,heading,here,advisories){
    // Facility points support a proximity caution, never a legal speed limit,
    // camera type, fine or claim that the bus is inside a school-zone boundary.
    const nav=input.navigation,stops=nav.path?.stops||[],index=nav.matchedIndex;
    if(input.position.coords.speed<1.5||!Number.isInteger(index)||!stops[index+1])return out;
    const today=new Date(input.now+9*3600000).toISOString().slice(0,10);
    const eligible=[];
    for(const a of advisories){
      const age=Date.parse(today)-Date.parse(a.dataDate);
      if(a.type!=='SCHOOL_FACILITY'||a.positionBasis!=='FACILITY_POINT'||String(a.route)!==String(input.scope.route)||a.source!=='https://www.data.go.kr/data/15012891/standard.do'||!number(a.lat)||!number(a.lng)||Math.abs(a.lat)>90||Math.abs(a.lng)>180||!Number.isFinite(age)||age<0||age>730*86400000)continue;
      const d=distance(here,a),north=rad(a.lat-here.lat)*6371000,east=rad(a.lng-here.lng)*6371000*Math.cos(rad(here.lat));
      const forward=north*Math.cos(rad(heading))+east*Math.sin(rad(heading));
      if(d>180||forward<0)continue;
      // Restrict to the current route occurrence and its next segment; repeated
      // stop names, the opposite leg and a nearby parallel road do not match.
      let corridor=false;
      for(let i=index;i<=Math.min(index+1,stops.length-2);i++){
        const p=stops[i],q=stops[i+1];if(![p.lat,p.lng,q.lat,q.lng].every(number))continue;
        const x=(q.lng-p.lng)*111320*Math.cos(rad(p.lat)),y=(q.lat-p.lat)*110540,ax=(a.lng-p.lng)*111320*Math.cos(rad(p.lat)),ay=(a.lat-p.lat)*110540,den=x*x+y*y;
        if(!den)continue;const t=(ax*x+ay*y)/den;
        if(t>=0&&t<=1&&Math.hypot(ax-t*x,ay-t*y)<=120)corridor=true;
      }
      if(corridor)eligible.push({...a,distanceM:Math.round(d),advisory:true});
    }
    eligible.sort((a,b)=>a.distanceM-b.distanceM);const a=eligible[0];if(!a)return out;
    out.warning=a;out.status='보호시설 인근 · 속도표지 확인';out.key='facility|'+a.id;out.message='어린이보호시설 인근입니다. 속도표지와 보행자를 확인해 주세요.';
    out.notify=!number(state.notices[out.key])||input.now-state.notices[out.key]>600000;return out;
  }
  function notified(result,now){if(result.notify&&result.key)result.state.notices[result.key]=now;}
  return {evaluate,notified,readiness};
});
