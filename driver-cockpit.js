/* Display helpers: missing telemetry stays missing. No live data is fabricated. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70Cockpit=api;})(typeof window==='object'?window:this,function(){
  'use strict';
  function nativePosition(result,previous){
    if(previous&&Number(result.timestamp)<=Number(previous.timestamp))return previous;
    const has=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
    const position={timestamp:Number(result.timestamp||0),coords:{latitude:Number(result.latitude),longitude:Number(result.longitude),accuracy:has(result.accuracy)?Number(result.accuracy):null,speed:has(result.speed)&&Number(result.speed)>=0?Number(result.speed):null,heading:has(result.heading)?Number(result.heading):null,speedAccuracy:has(result.speedAccuracy)?Number(result.speedAccuracy):null,provider:result.provider||""}};
    if(previous&&position.coords.heading===null){
      const a=previous.coords,b=position.coords,dt=(position.timestamp-previous.timestamp)/1000,r=Math.PI/180,lat1=a.latitude*r,lat2=b.latitude*r,dl=(b.longitude-a.longitude)*r;
      const h=Math.sin((lat2-lat1)/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dl/2)**2,distance=6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
      if(dt>=1&&dt<=15&&has(a.accuracy)&&has(b.accuracy)&&a.accuracy<=30&&b.accuracy<=30&&distance>Math.max(8,a.accuracy,b.accuracy)&&distance/dt<45)position.coords.heading=(Math.atan2(Math.sin(dl)*Math.cos(lat2),Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dl))*180/Math.PI+360)%360;
    }
    return position;
  }
  function telemetry(position,now){
    const c=position?.coords||{},age=position?Math.max(0,Math.floor((now-position.timestamp)/1000)):null;
    const fresh=age!==null&&age<=6&&Number(c.accuracy)<=60;
    const reliableSpeed=fresh&&c.speed!==null&&c.speed!==undefined&&Number.isFinite(Number(c.speed))&&c.speed>=0&&c.speed<=55&&(c.speedAccuracy==null||c.speedAccuracy<=2.5);
    return {age,fresh,speed:reliableSpeed?Math.round(Number(c.speed)*3.6)+" km/h":"— km/h",label:age===null?"GPS 수신 대기":age<=6?"GPS "+age+"초 전 · ±"+Math.round(c.accuracy)+"m":"GPS "+age+"초 미수신"};
  }
  function phases(trip,log,options={}){
    const rows=[{label:options.midStart?'중간 시작':'출발',place:trip.startPlace,planned:trip.startTime,actual:log.actualStart,mode:log.startRecordMode}];
    if(trip.turnPlace||trip.turnTime){
      rows.push({label:'회차 도착',place:trip.turnPlace,planned:trip.turnTime,actual:log.actualTurn,mode:log.turnRecordMode});
      rows.push({label:'회차 출발',place:trip.turnPlace,planned:trip.turnDepartureTime||'',actual:log.turnDepartedAt,mode:log.turnDepartureMode});
    }
    if(trip.controlPoint)rows.push({label:/출발/.test(trip.controlPurpose||'')?'중간 출발':/종료/.test(trip.controlPurpose||'')?'중간 종료':'중간 기준',place:trip.controlPoint,planned:trip.controlTime,actual:log.actualControl,mode:log.controlRecordMode});
    const returning=trip.deadheadDestination&&trip.deadheadDestination!==trip.endPlace;
    rows.push({label:returning?'영업 종료':'도착',place:trip.serviceEndPlace||trip.endPlace,planned:trip.endTime,actual:log.actualEnd,mode:log.endRecordMode});
    if(returning)rows.push({label:'차고지 복귀',place:trip.deadheadDestination,planned:trip.returnTime||'',actual:log.deadheadReturnedAt,mode:log.returnRecordMode});
    return rows;
  }
  function ringSegments(total,passed){
    const n=Math.max(0,Math.min(600,Math.floor(Number(total)||0))),p=Math.max(0,Math.min(n,Math.floor(Number(passed)||0)));
    return Array.from({length:n},(_,i)=>({start:-90+i*360/n,end:-90+(i+1)*360/n-Math.min(1.5,90/n),done:i<p}));
  }
  function svgNode(doc,name,attrs={}){const node=doc.createElementNS('http://www.w3.org/2000/svg',name);Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,String(value)));return node;}
  function movement(position,now,held){
    const t=telemetry(position,now),speed=Number(position?.coords?.speed)*3.6;
    if(held||!t.fresh||t.speed==='— km/h')return {key:'unknown',color:'#7b8b9e',label:'위치·속도 확인 중'};
    return speed>=10?{key:'moving',color:'#078564',label:'주행'}:speed>=1?{key:'slow',color:'#d28a00',label:'서행'}:{key:'stopped',color:'#b64239',label:'정차'};
  }
  function bindSwipe(host,change){
    let start=null;
    host.addEventListener('pointerdown',e=>{if(e.isPrimary!==false&&e.pointerType==='touch'&&!e.target.closest('button,input,select,textarea,a,summary'))start={x:e.clientX,y:e.clientY,at:e.timeStamp,id:e.pointerId};});
    host.addEventListener('pointercancel',()=>{start=null;});
    host.addEventListener('pointerup',e=>{const a=start;start=null;if(!a||a.id!==e.pointerId)return;const dx=e.clientX-a.x,dy=e.clientY-a.y;if(Math.abs(dx)>=48&&Math.abs(dx)>Math.abs(dy)*1.5&&e.timeStamp-a.at<1500)change(dx<0?1:-1);});
  }
  function drawRing(host,total,passed,progress,held=false,motion){
    const fraction=Number.isFinite(progress)?Math.max(0,Math.min(100,progress))/100:(total?passed/total:0),doc=host.ownerDocument;
    let svg=host.querySelector('svg');
    if(!svg||host.dataset.ringTotal!==String(total)){
      if(svg)svg.remove();host.dataset.ringTotal=String(total);
      svg=svgNode(doc,'svg',{viewBox:'0 0 120 120','aria-hidden':'true',class:'stop-segment-ring'});
      const point=angle=>[60+49*Math.cos(angle*Math.PI/180),60+49*Math.sin(angle*Math.PI/180)],segments=ringSegments(total,0);
      if(!segments.length)svg.append(svgNode(doc,'circle',{cx:60,cy:60,r:49,fill:'none',stroke:'#dce4ed','stroke-width':7}));
      segments.forEach(s=>{const a=point(s.start),b=point(s.end);const arc=svgNode(doc,'path',{class:'route-tick',d:`M ${a[0]} ${a[1]} A 49 49 0 ${s.end-s.start>180?1:0} 1 ${b[0]} ${b[1]}`,fill:'none',stroke:'#dce4ed','stroke-width':7});svg.append(arc);const fill=arc.cloneNode();fill.setAttribute('class','route-fill');fill.setAttribute('pathLength','1');fill.style.transition='stroke-dasharray 1s linear';svg.append(fill);});
      const arrow=svgNode(doc,'g',{class:'route-arrow'});arrow.append(svgNode(doc,'path',{d:'M 104 55 L 114 55 L 109 66 Z'}));arrow.style.transformOrigin='60px 60px';arrow.style.transition='transform 1s linear';svg.append(arrow);host.prepend(svg);
    }
    svg.querySelectorAll('.route-fill').forEach((node,i)=>{node.setAttribute('stroke',held?'#7b8b9e':'#0d9488');node.setAttribute('stroke-dasharray',Math.max(0,Math.min(1,fraction*total-i))+' 1');});
    const arrow=svg.querySelector('.route-arrow');arrow.style.transform=`rotate(${-90+fraction*360}deg)`;arrow.style.display=total&&(passed>0||fraction>0)?'':'none';arrow.setAttribute('fill',motion?.color||(held?'#7b8b9e':'#075e56'));host.dataset.movement=motion?.key||'unknown';
  }
  function drawRoute(host,path,position,navigation){
    if(!path?.stops?.length){host.replaceChildren();return;}
    const signature=path.stops.map(s=>s.id||s.name).join('|')+'|'+navigation?.matchedIndex+'|'+position?.timestamp+'|'+navigation?.configured;
    if(host.dataset.routeSignature===signature)return;host.dataset.routeSignature=signature;
    const doc=host.ownerDocument,svg=svgNode(doc,'svg',{viewBox:'0 0 340 108',role:'img','aria-label':'정류장 좌표 기준 운행 경로'}),stops=path.stops;
    const xs=stops.map(s=>Number(s.lng)),ys=stops.map(s=>Number(s.lat)),xmin=Math.min(...xs),ymin=Math.min(...ys),dx=Math.max(.001,Math.max(...xs)-xmin),dy=Math.max(.001,Math.max(...ys)-ymin),scale=Math.min(310/dx,82/dy),ox=(340-dx*scale)/2,oy=(108-dy*scale)/2;
    const project=p=>[ox+(p.lng-xmin)*scale,108-oy-(p.lat-ymin)*scale];
    const points=stops.map(project),poly=points.map(p=>p.join(',')).join(' ');
    svg.append(svgNode(doc,'polyline',{points:poly,fill:'none',stroke:'#c7d4e3','stroke-width':3,'stroke-linejoin':'round'}));
    if(navigation?.configured){const until=Math.max(0,navigation.tripPassedStops||0);if(until>1)svg.append(svgNode(doc,'polyline',{points:points.slice(0,until).map(p=>p.join(',')).join(' '),fill:'none',stroke:'#0d9488','stroke-width':4}));}
    points.forEach((p,i)=>svg.append(svgNode(doc,'circle',{cx:p[0],cy:p[1],r:i===0||i===points.length-1?3:1.2,fill:'#61748e'})));
    if(navigation?.configured&&position?.coords){const p=project({lat:position.coords.latitude,lng:position.coords.longitude});if(p[0]>=0&&p[0]<=340&&p[1]>=0&&p[1]<=108){svg.append(svgNode(doc,'circle',{cx:p[0],cy:p[1],r:7,fill:'#163d6a',stroke:'white','stroke-width':2}));svg.append(svgNode(doc,'path',{d:'M 0 -6 L 4 4 L 0 2 L -4 4 Z',fill:'white',transform:`translate(${p[0]} ${p[1]}) rotate(${Number(navigation.heading)||0})`}));}}
    host.replaceChildren(svg);
  }
  function weatherLabel(weather,now){
    if(!weather?.available)return weather?.message||'날씨 연결 대기';
    if(weather.temperature===null||weather.temperature===undefined||weather.temperature===""||!Number.isFinite(Number(weather.temperature))||!Number.isFinite(Date.parse(weather.observedAt))||now-Date.parse(weather.observedAt)>7200000||Date.parse(weather.observedAt)>now+30000)return '날씨 갱신 대기';
    return Number(weather.temperature).toFixed(1)+'° · '+(weather.condition||'관측정보');
  }
  function manualActions(input){
    const t=input.trip||{},log=input.log||{},active=input.live&&input.date===input.today&&!log.actualEnd;
    const pending=Boolean(input.pending),early=!Number.isFinite(input.plannedAt)||input.now<input.plannedAt;
    const rows=[{event:'DEPART',label:'출발',actual:log.actualStart,allowed:active&&!early},
      ...((t.turnPlace||t.turnTime)?[{event:'TURN',label:'회차',actual:log.actualTurn,allowed:active&&Boolean(log.actualStart)}]:[]),
      {event:'ARRIVE',label:'도착',actual:log.actualEnd,allowed:active&&Boolean(log.actualStart)}];
    return rows.map(r=>({...r,disabled:pending||Boolean(r.actual)||!r.allowed,text:r.label+(r.actual?' 완료':input.pending===r.event?' 저장 중…':' 기록')}));
  }
  // A manual receipt time is a record, not evidence of when the vehicle moved.
  function phaseDifference(comparison,mode){
    if(mode==='수동')return {label:'기록 기준',state:'manual',title:'수동 입력 시각과 계획의 차이: '+comparison.label.replace(/ 지연$| 빠름$/,'')};
    return {label:comparison.label.replace(/ 지연$/, ' 늦음'),state:comparison.state,title:comparison.label};
  }
  return {nativePosition,telemetry,phases,ringSegments,movement,bindSwipe,drawRing,drawRoute,weatherLabel,manualActions,phaseDifference};
});
