/* Display helpers: missing telemetry stays missing. No live data is fabricated. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70Cockpit=api;})(typeof window==='object'?window:this,function(){
  'use strict';
  // Preserve the source label; breaks are only between complete phrase tokens.
  function phraseParts(value){
    return String(value||'').split(/([·.\s]+|\([^)]*\)|공영차고지|차고지|청소년|문화센터|국민은행|교차로|복사골|터널입구|신월동지점|행정복지센터|대학병원)/).filter(Boolean);
  }
  function phraseText(node,value){
    if(node.dataset.phraseText===String(value))return;
    node.dataset.phraseText=String(value);node.replaceChildren();
    phraseParts(value).forEach((part,i)=>{if(i)node.append(node.ownerDocument.createElement('wbr'));const token=node.ownerDocument.createElement('span');token.className='phrase-token';token.textContent=part;node.append(token);});
  }
  function plannedGap(trip,side){
    const v=side==='front'?trip?.plannedFrontGapMinutes:trip?.plannedRearGapMinutes;
    return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v)+'분':'확인 중';
  }
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
    if(trip.controlPoint)rows.push({label:/전철|연계/.test(trip.controlPurpose||'')?'연계 출발':/출발/.test(trip.controlPurpose||'')?'중간 출발':/종료/.test(trip.controlPurpose||'')?'중간 종료':'중간 기준',place:trip.controlPoint,planned:trip.controlTime,actual:log.actualControl,mode:log.controlRecordMode});
    const returning=trip.deadheadDestination&&trip.deadheadDestination!==trip.endPlace;
    rows.push({label:returning?'영업 종료':'도착',place:trip.serviceEndPlace||trip.endPlace,planned:trip.endTime,actual:log.actualEnd,mode:log.endRecordMode});
    if(returning)rows.push({label:'차고지 복귀',place:trip.deadheadDestination,planned:trip.returnTime||'',actual:log.deadheadReturnedAt,mode:log.returnRecordMode});
    return rows;
  }
  function ringAngle(fraction,plan={}){
    const start=Number.isFinite(plan.startAngle)?plan.startAngle:-90,span=Number.isFinite(plan.span)?plan.span:360,t=plan.turnFraction;
    return start+(t>0&&t<1?(fraction<=t?fraction/t*180:180+(fraction-t)/(1-t)*180):fraction*span);
  }
  function ringSegments(total,passed,startAngle=-90,span=360,turnFraction){
    const n=Math.max(0,Math.min(600,Math.floor(Number(total)||0))),p=Math.max(0,Math.min(n,Math.floor(Number(passed)||0)));
    return Array.from({length:n},(_,i)=>({start:ringAngle(i/n,{startAngle,span,turnFraction}),end:ringAngle((i+1)/n,{startAngle,span,turnFraction})-Math.min(1.5,span/4/n),done:i<p}));
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
  // Each marker uses an observed stop occurrence, never timetable interpolation.
  function ringPeers(path,fleet,own,scope,now){
    const stops=path?.stops||[],result=[];
    if(stops.length<2||!Number.isInteger(own?.matchedIndex)||own.matchedIndex<0||own.matchedIndex>=stops.length||(!own?.configured&&!own?.retained)||scope?.running!==true||fleet?.route!==String(scope.route)||fleet?.date!==scope.date)return result;
    const index=Math.max(0,Math.min(stops.length-1,Number(own.matchedIndex)||0));
    const candidates=(fleet.positions||[]).filter(p=>p.running===true&&!p.own&&p.vehicleId&&p.vehicleId!==scope.vehicleId&&String(p.route)===String(scope.route)&&p.date===scope.date).map(p=>{
      const i=stops.findIndex(s=>Number(s.order)===Number(p.matchedStopOrder));
      const at=Date.parse(p.recordedAt),age=(now-at)/1000;
      if(i<0||!Number.isFinite(age)||age<0||age>180||p.accuracyM==null||p.accuracyM===''||!Number.isFinite(Number(p.accuracyM))||Number(p.accuracyM)<0||Number(p.accuracyM)>60)return null;
      return {index:i,order:stops[i].order,stopName:stops[i].name,age:Math.floor(age),vehicle:p.vehicleId,sequence:p.sequence,stopGap:Math.abs(i-index),fresh:age<=45&&!own.retained&&!fleet.error};
    }).filter(Boolean);
    // A route occurrence includes the return leg. Never wrap completed trips to the start.
    // Same-stop observations cannot establish front/rear order; other neighbours remain visible.
    const reference=fleet.crossCheck?.fleet?.length?fleet.crossCheck:fleet.lastCrossCheck;
    const publicPeers=(reference?.fleet||[]).filter(p=>p.source==='GYEONGGI_BUS_LOCATION_V2'&&p.positionBasis==='PROVIDER_STOP_REFERENCE'&&!p.own&&p.vehicleId&&p.vehicleId!==scope.vehicleId&&String(p.route)===String(scope.route)&&p.date===scope.date).map(p=>{
      const i=stops.findIndex(s=>Number(s.order)===Number(p.matchedStopOrder)),age=(now-Number(p.fetchedAt))/1000;
      if(i<0||!Number.isFinite(age)||age<0||age>180||![0,1,2].includes(p.stateCd))return null;
      // Exclude layover/deadhead ambiguity at route boundaries.
      if(i===0||i===stops.length-1)return null;
      return {index:i,order:stops[i].order,stopName:stops[i].name,age:Math.floor(age),vehicle:p.vehicleId,vehicleNo:p.vehicleNo||'',stopGap:Math.abs(i-index),source:'GBIS',reference:true,crowded:[1,2,3,4].includes(p.crowded)?p.crowded:null,fresh:age<=60&&fleet.crossCheck===reference&&!reference.error&&!own.retained&&!fleet.error};
    }).filter(Boolean);
    // Fresh authenticated phone fixes take priority over the same bus's public reference.
    const unique=[...new Map([...publicPeers,...candidates].sort((a,b)=>Number(a.fresh)-Number(b.fresh)||b.age-a.age).map(p=>[p.vehicle,p])).values()];
    for(const side of ['front','rear']){
      const leg=i=>stops[i].direction||(path.pivotIndex>=0?(i<=path.pivotIndex?'out':'return'):'unknown');
      const peers=unique.filter(p=>leg(p.index)===leg(index)&&(side==='front'?p.index>index:p.index<index)).sort((a,b)=>Math.abs(a.index-index)-Math.abs(b.index-index)||a.age-b.age||String(a.vehicle).localeCompare(String(b.vehicle))).slice(0,2);
      peers.forEach((p,i)=>{const matches=(fleet.roster||[]).filter(r=>r.vehicleId===p.vehicle),identity=matches.length===1?matches[0]:{};const crowd=publicPeers.find(r=>r.vehicle===p.vehicle&&r.fresh);result.push({...p,crowded:crowd?.crowded??null,driverName:identity.driverName||'',vehicleNo:identity.vehicleNo||p.vehicleNo||'',sequence:identity.sequence||p.sequence,side,rank:i+1,fraction:(p.index+.5)/stops.length});});
    }
    return result;
  }
  function ringPeerLabel(peers){
    return peers.map(p=>(p.side==='front'?'앞':'뒤')+p.rank+' · '+p.stopGap+'정류장').join(', ');
  }
  function drawRing(host,total,passed,progress,held=false,motion,peers=[],plan={}){
    const fraction=Number.isFinite(progress)?Math.max(0,Math.min(100,progress))/100:(total?passed/total:0),doc=host.ownerDocument;
    const startAngle=Number.isFinite(plan.startAngle)?plan.startAngle:-90,span=Number.isFinite(plan.span)?plan.span:360,signature=[total,startAngle,span,plan.turnFraction].join('|');
    let svg=host.querySelector('svg');
    if(!svg||host.dataset.ringTotal!==signature){
      if(svg)svg.remove();host.dataset.ringTotal=signature;
      svg=svgNode(doc,'svg',{viewBox:'0 0 120 120','aria-hidden':'true',class:'stop-segment-ring'});
      const point=angle=>[60+49*Math.cos(angle*Math.PI/180),60+49*Math.sin(angle*Math.PI/180)],segments=ringSegments(total,0,startAngle,span,plan.turnFraction);
      if(!segments.length)svg.append(svgNode(doc,'circle',{cx:60,cy:60,r:49,fill:'none',stroke:'#dce4ed','stroke-width':7}));
      segments.forEach(s=>{const a=point(s.start),b=point(s.end);const arc=svgNode(doc,'path',{class:'route-tick',d:`M ${a[0]} ${a[1]} A 49 49 0 ${s.end-s.start>180?1:0} 1 ${b[0]} ${b[1]}`,fill:'none',stroke:'#dce4ed','stroke-width':7});svg.append(arc);const fill=arc.cloneNode();fill.setAttribute('class','route-fill');fill.setAttribute('pathLength','1');fill.style.transition='stroke-dasharray 1s linear';svg.append(fill);});
      const arrow=svgNode(doc,'g',{class:'route-arrow'}),w=Math.max(2,Math.min(6,span/360*2*Math.PI*49/Math.max(1,total)*.85));arrow.append(svgNode(doc,'path',{d:`M ${109-w/2} 58 L ${109+w/2} 58 L 109 62 Z`}));arrow.style.transformOrigin='60px 60px';arrow.style.transition='transform 1s linear';svg.append(arrow);host.prepend(svg);
    }
    svg.querySelectorAll('.route-fill').forEach((node,i)=>{node.setAttribute('stroke',held?'#7b8b9e':'#0d9488');node.setAttribute('stroke-dasharray',Math.max(0,Math.min(1,fraction*total-i))+' 1');});
    const arrow=svg.querySelector('.route-arrow');arrow.style.transform=`rotate(${ringAngle(fraction,plan)}deg)`;arrow.style.display=total&&(passed>0||fraction>0)?'':'none';arrow.setAttribute('fill',motion?.color||(held?'#7b8b9e':'#075e56'));host.dataset.movement=motion?.key||'unknown';
    svg.querySelector('.route-peers')?.remove();
    const markers=svgNode(doc,'g',{class:'route-peers'});
    const ticks=svg.querySelectorAll('.route-tick');
    peers.filter(p=>Number.isInteger(p.index)&&ticks[p.index]).forEach(p=>{
      const coincident=peers.filter(q=>q.index===p.index),slot=coincident.indexOf(p),count=coincident.length;
      const marker=ticks[p.index].cloneNode();marker.setAttribute('class','route-peer '+p.side+(p.fresh===false?' stale':''));marker.setAttribute('stroke',p.fresh===false?'#8494a6':p.side==='front'?'#2563eb':'#c25916');if(p.fresh===false)marker.setAttribute('stroke-dasharray','1 1');
      // Two vehicles at one stop occupy two radial stripes of that same tick.
      if(count>1){const scale=(49-3.5+7*(slot+.5)/count)/49;marker.setAttribute('transform',`translate(60 60) scale(${scale}) translate(-60 -60)`);marker.setAttribute('stroke-width',String(6/count/scale));}
      const title=svgNode(doc,'title');title.textContent=(p.fresh===false?'마지막 확인 '+p.age+'초 전 · ':'')+(p.vehicleNo||'')+' '+(p.driverName||'')+' · '+(p.side==='front'?'앞차':'뒷차')+' '+p.rank+' · '+p.stopGap+'정류장 · '+p.stopName+(p.reference?' · 경기버스정보 조회 기준, 관측시각 미제공':' · 앱 GPS');marker.append(title);markers.append(marker);
    });
    const ownIndex=Math.min(ticks.length-1,Math.floor(Number(passed)||0)-1);
    if(ownIndex>=0){const ownTick=ticks[ownIndex].cloneNode();ownTick.setAttribute('class','route-own');ownTick.setAttribute('stroke',held?'#7b8b9e':'#7c3aed');markers.append(ownTick);}
    svg.append(markers);svg.append(arrow);

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
    if(!weather?.available)return '🌡️ —';
    if(weather.temperature===null||weather.temperature===undefined||weather.temperature===""||!Number.isFinite(Number(weather.temperature))||!Number.isFinite(Date.parse(weather.observedAt))||now-Date.parse(weather.observedAt)>7200000||Date.parse(weather.observedAt)>now+30000)return '🌡️ —';
    const condition=String(weather.condition||''),icon=/천둥|뇌우|번개/.test(condition)?'⛈️':/눈|진눈깨비/.test(condition)?'🌨️':/비|소나기|이슬비/.test(condition)?'🌧️':/안개/.test(condition)?'🌫️':/맑/.test(condition)?'☀️':/구름|흐림/.test(condition)?'☁️':'🌡️';
    return icon+' '+Number(weather.temperature).toFixed(1)+'°C';
  }
  function weatherObservation(weather,now){
    if(!weatherLabel(weather,now).includes('°C'))return '현재 날씨 · 수신 대기';
    const time=new Date(weather.observedAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Seoul',hourCycle:'h23',hour:'2-digit',minute:'2-digit'});
    return (weather.provider||'날씨')+' · '+time+' 관측';
  }
  function shortVehicle(vehicle){
    const texts=[vehicle?.displayNo,vehicle?.vehicleNo].filter(Boolean).map(String);
    for(const text of texts){const match=text.match(/(\d{4})\s*$/);if(match)return match[1]+'호';}
    return texts[0]||'차량 미확인';
  }
  function ringPlan(trip,path){
    const samjeong=s=>/삼정.*(복지회관|복지관)/.test(String(s||''));
    const oneWay=!trip.turnTime&&!trip.turnPlace&&Boolean(trip.startPlace&&trip.endPlace&&trip.startPlace!==trip.endPlace);
    const returningOnly=oneWay&&/고강/.test(trip.endPlace)&&!/고강/.test(trip.startPlace);
    if(oneWay&&!returningOnly){
      const end=trip.serviceEndPlace||trip.endPlace,label=trip.deadheadDestination&&trip.deadheadDestination!==end?'영업종료':'도착';
      return {startAngle:-90,span:180,turnFraction:null,returningOnly:false,oneWay:true,
        depot:{name:trip.startPlace,shortName:shortPoint(trip.startPlace),before:'출발 '+(trip.startTime||'—'),after:'',time:'출발 '+(trip.startTime||'—')},
        turn:{name:end,shortName:shortPoint(end),before:'',after:label+' '+(trip.endTime||'—'),time:label+' '+(trip.endTime||'—')}};
    }
    const physical=!returningOnly&&path?.pivotIndex>=0?path.stops[path.pivotIndex]:null;
    const plan={startAngle:returningOnly?90:-90,span:returningOnly?180:360,turnFraction:!returningOnly&&path?.pivotIndex>0&&path.pivotIndex<path.stops.length-1?path.pivotIndex/(path.stops.length-1):null,
      depot:{name:/고강/.test(trip.endPlace||trip.startPlace)?'고강공영차고지':trip.endPlace||trip.startPlace||'도착지',shortName:/고강/.test(trip.endPlace||trip.startPlace)?'고강차고지':trip.endPlace||trip.startPlace||'도착지',before:returningOnly?'':'출발 '+(trip.startTime||'—'),after:'도착 '+(trip.endTime||'—'),time:returningOnly?'도착 '+(trip.endTime||'—'):'출발 '+(trip.startTime||'—')+' · 도착 '+(trip.endTime||'—')},
      turn:{name:samjeong(trip.turnPlace||trip.startPlace)?'삼정종합사회복지회관':trip.turnPlace||trip.startPlace||'출발지',shortName:samjeong(trip.turnPlace||trip.startPlace)?'삼정복지회관':trip.turnPlace||trip.startPlace||'출발지',before:'',after:(returningOnly?'출발 ':'회차 ')+(returningOnly?trip.startTime||'—':trip.turnTime||'—'),time:(returningOnly?'출발 ':'회차 ')+(returningOnly?trip.startTime||'—':trip.turnTime||'—')},returningOnly};
    if(physical){plan.turn={name:physical.name,shortName:shortPoint(physical.name),before:'방향전환',after:trip.turnTime?(samjeong(trip.turnPlace)?'삼정':shortPoint(trip.turnPlace))+' 기준 '+trip.turnTime:'',time:'실제 방향전환 · '+physical.name+(trip.turnTime?' · 시간표 기준 '+trip.turnPlace+' '+trip.turnTime:'')};}
    return plan;
  }
  function shortPoint(name){
    if(/테크노파크/.test(name||''))return '테크노파크';
    if(/고강.*차고지/.test(name||''))return '고강차고지';
    if(/삼정.*(복지회관|복지관)/.test(name||''))return '삼정복지회관';
    return String(name||'').replace(/\s*정류소$/,'');
  }
  // A planned one-way service has no turnaround, including on older native apps.
  // This changes display text only; navigation evidence and recording stay intact.
  function travelDirection(trip,navigation){
    if(!trip.turnTime&&!trip.turnPlace&&trip.startPlace&&trip.endPlace&&trip.startPlace!==trip.endPlace)return shortPoint(trip.serviceEndPlace||trip.endPlace)+' 방면';
    return String(navigation.direction||'방향 확인 중').replace(/고강공영차고지/g,'고강차고지');
  }
  function weatherView(weather,now){
    const valid=weatherLabel(weather,now).includes('°C'),condition=valid?String(weather.condition||''):'';
    let kind=!valid?'unknown':/눈/.test(condition)?'snow':/비|빗방울/.test(condition)?'rain':/구름|흐림/.test(condition)?'cloud':/맑/.test(condition)?'sun':'unknown';
    if(kind==='sun'){const hour=new Date(now+9*3600000).getUTCHours();if(hour<6||hour>=18)kind='moon';}
    const wind=valid&&Number.isFinite(Number(weather.windMps))&&weather.windMps!==null&&String(weather.windMps).trim()!==''?Number(weather.windMps):null;
    return {kind,temperature:valid?Number(weather.temperature).toFixed(1)+'°C':'—°C',condition:(condition||'날씨 수신 대기')+(valid&&weather.stale?' · 갱신 중':''),wind};
  }
  function renderWeather(node,weather,now){
    const v=weatherView(weather,now),key=JSON.stringify(v);
    if(node.dataset.weather===key)return;node.dataset.weather=key;node.replaceChildren();
    const doc=node.ownerDocument,icon=svgNode(doc,'svg',{viewBox:'0 0 48 40',class:'weather-icon weather-'+v.kind,'aria-hidden':'true'});
    if(v.kind==='sun'){const sun=svgNode(doc,'g',{class:'weather-sun'});for(let i=0;i<8;i++)sun.append(svgNode(doc,'path',{d:'M24 3v4',transform:'rotate('+(45*i)+' 24 20)',stroke:'#cf8900','stroke-width':2,'stroke-linecap':'round'}));sun.append(svgNode(doc,'circle',{cx:24,cy:20,r:9,fill:'#f5bc36'}));icon.append(sun);}
    else if(v.kind==='moon')icon.append(svgNode(doc,'path',{d:'M30 5a15 15 0 1 0 8 26A15 15 0 0 1 30 5',fill:'#8ca9d5'}));
    else if(v.kind!=='unknown'){icon.append(svgNode(doc,'path',{class:'weather-cloud',d:'M10 26a7 7 0 0 1 0-14 10 10 0 0 1 19-3 8 8 0 1 1 7 17Z',fill:'#99b6cb'}));if(v.kind==='rain'||v.kind==='snow')for(let i=0;i<3;i++)icon.append(svgNode(doc,v.kind==='rain'?'path':'circle',v.kind==='rain'?{class:'weather-drop',d:'M'+(15+i*10)+' 30l-3 6',stroke:'#2378ba','stroke-width':2,style:'animation-delay:'+i*.25+'s'}:{class:'weather-drop',cx:14+i*10,cy:32,r:2,fill:'#4c88ad',style:'animation-delay:'+i*.25+'s'}));}
    else icon.append(svgNode(doc,'path',{d:'M20 9a4 4 0 0 1 8 0v15a7 7 0 1 1-8 0Z M24 13v17',fill:'none',stroke:'#73879a','stroke-width':2}));
    const temp=doc.createElement('strong');temp.textContent=v.temperature;const label=doc.createElement('span');label.textContent=v.condition;node.append(icon,temp,label);
    if(v.wind!==null){const wind=svgNode(doc,'svg',{viewBox:'0 0 32 24',class:'weather-wind','aria-hidden':'true'});wind.append(svgNode(doc,'path',{d:'M2 7h19q8 0 5-5 M2 12h25 M7 17h13q7 0 4 5',fill:'none',stroke:'#638d9a','stroke-width':2}));const text=doc.createElement('small');text.textContent=v.wind.toFixed(1)+'m/s';node.append(wind,text);}
  }
  function peerStatus(fleet,own,scope,peers,now){
    if(fleet?.error)return '차량정보 연결 실패 · 재시도 중';
    const ref=fleet?.crossCheck;
    if(peers.some(p=>p.fresh&&!p.reference)&&ref?.error)return '앱 GPS 간격 표시 · 경기버스정보 수신 대기';
    if(['GBIS_HTTP_429','GBIS_DAILY_LIMIT','GBIS_RATE_LIMIT'].includes(ref?.error))return (ref.error==='GBIS_DAILY_LIMIT'?'경기버스정보 일일 호출한도':'경기버스정보 요청 제한')+(ref.retryAt>now?' · '+Math.ceil((ref.retryAt-now)/60000)+'분 후 재시도':' · 재시도 대기');
    if(ref?.error==='GBIS_REFRESH_PENDING')return '경기버스정보 갱신 중';
    if(peers.length)return peers.some(p=>p.reference)?'경기버스정보 · 정류장 위치 기준':'앱 GPS · 정류장 위치 기준';
    if(!own?.configured||own.retained)return '내 위치·방향 확인 중';
    if(!scope.running)return '출발 기록 확인 후 앞뒤차 표시';
    if(ref?.fetchedAt&&now-Number(ref.fetchedAt)>60000)return '경기버스정보 갱신 지연';
    if(ref&&!ref.available)return ref.message||'경기버스정보 수신 대기';
    return '같은 방향 앞뒤차 확인 중';
  }
  function retainedReference(fleet,scope,now){
    const ref=fleet?.crossCheck,age=now-Number(ref?.fetchedAt);
    return fleet?.requestScope===scope&&ref?.available&&age>=0&&age<=60000?ref:null;
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
  function phaseDifference(comparison,mode,compact=false){
    if(mode==='수동')return {label:compact?'—':'기록 기준',state:'manual',title:'수동 입력 시각이며 실제 출발 지연으로 판단하지 않음. 계획과 기록 차이: '+comparison.label.replace(/ 지연$| 빠름$/,'')};
    if(compact&&Number.isFinite(comparison.deltaSeconds)&&comparison.deltaSeconds!==0){
      const seconds=Math.abs(comparison.deltaSeconds),minutes=Math.floor(seconds/60);
      return {label:(comparison.deltaSeconds>0?'+':'−')+minutes+':'+String(seconds%60).padStart(2,'0'),suffix:comparison.deltaSeconds>0?'늦음':'빠름',state:comparison.state,title:comparison.label};
    }
    return {label:comparison.label.replace(/ 지연$/, ' 늦음'),state:comparison.state,title:comparison.label};
  }
  return {shortVehicle,ringPlan,ringAngle,travelDirection,weatherView,renderWeather,peerStatus,retainedReference,phraseParts,phraseText,plannedGap,nativePosition,telemetry,phases,ringSegments,movement,bindSwipe,ringPeers,ringPeerLabel,drawRing,drawRoute,weatherLabel,weatherObservation,manualActions,phaseDifference};
});
