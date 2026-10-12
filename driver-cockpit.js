/* Display helpers: missing telemetry stays missing. No live data is fabricated. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70Cockpit=api;})(typeof window==='object'?window:this,function(){
  'use strict';
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
  function drawRing(host,total,passed){
    const signature=total+'|'+passed;if(host.dataset.ringSignature===signature)return;host.dataset.ringSignature=signature;
    const doc=host.ownerDocument,svg=svgNode(doc,'svg',{viewBox:'0 0 120 120','aria-hidden':'true',class:'stop-segment-ring'});
    const point=angle=>[60+49*Math.cos(angle*Math.PI/180),60+49*Math.sin(angle*Math.PI/180)];
    const segments=ringSegments(total,passed);
    if(!segments.length)svg.append(svgNode(doc,'circle',{cx:60,cy:60,r:49,fill:'none',stroke:'#dce4ed','stroke-width':7}));
    segments.forEach(s=>{const a=point(s.start),b=point(s.end);svg.append(svgNode(doc,'path',{d:`M ${a[0]} ${a[1]} A 49 49 0 ${s.end-s.start>180?1:0} 1 ${b[0]} ${b[1]}`,fill:'none',stroke:s.done?'#0d9488':'#dce4ed','stroke-width':7}));});
    if(segments.length&&passed>0){const angle=-90+Math.min(passed,total)*360/total,at=point(angle);svg.append(svgNode(doc,'path',{d:'M -5 -6 L 6 0 L -5 6 Z',fill:'#075e56',transform:`translate(${at[0]} ${at[1]}) rotate(${angle+90})`}));}
    const old=host.querySelector('svg');if(old)old.remove();host.prepend(svg);
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
  return {phases,ringSegments,drawRing,drawRoute,weatherLabel};
});
