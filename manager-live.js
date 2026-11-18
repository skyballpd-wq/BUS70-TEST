/* Private route-wide view. No customer records enter persistent browser storage. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.Bus70ManagerLive=api;})(typeof window==='object'?window:this,function(root){
  'use strict';
  let cfg,epoch=0,timer,paintTimer,opened=false,busy=false,data=new Map(),errors=new Map(),retry=new Map(),alerts=new Map(),preferences={},voice=false,speaking=null;
  const policy=typeof module==='object'&&module.exports?require('./manager-gap-alerts'):root.Bus70GapAlerts;
  function model(value,now){
    const age=(now-Number(value.fetchedAt))/1000,fresh=value.available&&!value.error&&age>=0&&age<=60;
    const stops=value.stops||[],vehicles=age>=0&&age<=180?(value.vehicles||[]):[],legs=[];
    for(const direction of [...new Set(stops.map(s=>s.direction).filter(Boolean))]){
      const routeStops=stops.filter(s=>s.direction===direction).sort((a,b)=>a.order-b.order),groups=[];
      for(const stop of routeStops){const buses=vehicles.filter(v=>v.direction===direction&&Number(v.matchedStopOrder)===Number(stop.order));if(buses.length)groups.push({stop,buses,index:routeStops.indexOf(stop)});}
      groups.forEach((g,i)=>{
        const front=groups[i+1];g.fresh=fresh;g.sameStop=g.buses.length>1;
        g.gap=fresh&&front&&g.buses.length===1&&front.buses.length===1?front.index-g.index:null;
        const observed=g.buses[0]?.front;g.minutes=g.gap!==null&&observed?.gapEstimateBasis==='OBSERVED_STOP_INTERVAL'&&Number.isFinite(observed.estimatedGapMinutes)?observed.estimatedGapMinutes:null;
      });
      legs.push({direction,start:routeStops[0]?.name,end:routeStops.at(-1)?.name,groups:groups.reverse()});
    }
    const missing=(value.roster||[]).filter(r=>!fresh||!vehicles.some(v=>v.vehicleId===r.vehicleId));
    return {fresh,age:Number.isFinite(age)?Math.max(0,Math.floor(age)):null,legs,missing,count:vehicles.length,unmapped:Number(value.unmappedCount)||0};
  }
  const node=(tag,text,cls)=>{const n=root.document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const session=()=>cfg?.session()||{},allowed=()=>opened&&session().token&&['MASTER','MANAGER'].includes(session().role);
  const routes=()=>{const c=cfg.context();return c.route==='ALL'?c.routes:[c.route];};
  function preference(route){try{return policy.settings(preferences[route]);}catch(ignore){return policy.settings();}}
  function preferenceKey(){return 'bus70-manager-gap-settings-'+session().driverId;}
  function controls(host){
    if(host.querySelector('.manager-live-data'))return;
    host.replaceChildren(node('h2','노선별 전체 차량 간격'));
    host.append(node('p','화면을 열어 둔 동안 감시 · 상단 노선에서 전체를 선택하면 동시에 표시합니다.','manager-live-meta'));
    host.append(node('p','경기버스 조회 위치 기준 · 정류장 간격과 통과 관측 시간을 구분합니다. 미수신은 간격 이상으로 판단하지 않습니다.','manager-live-meta'));
    const tools=node('div',undefined,'inline-actions'),refresh=node('button','새로고침'),audio=node('button','경고 음성 켜기');refresh.type=audio.type='button';refresh.onclick=()=>poll();
    audio.onclick=()=>{voice=!voice;audio.textContent=voice?'경고 음성 끄기':'경고 음성 켜기';if(!voice&&speaking){root.speechSynthesis?.cancel();speaking=null;}if(voice)announce();};tools.append(refresh,audio);host.append(tools);
    const details=node('details'),summary=node('summary','노선별 경고 기준'),form=node('form',undefined,'manager-gap-settings');details.append(summary,form);
    const select=node('select');select.setAttribute('aria-label','경고 기준 노선');cfg.context().routes.forEach(route=>{const o=node('option',route+'번');o.value=route;select.append(o);});form.append(select);
    const inputs={};for(const [key,label,min,max] of [['holdSeconds','지속 시간(초)',60,1800],['closeStops','가까움 정류장 수',0,10],['minMinutes','좁음 시간(분)',0,60],['maxMinutes','벌어짐 시간(분)',0,120]]){const wrap=node('label',label),input=node('input');input.type='number';input.min=min;input.max=max;input.step=key.includes('Minutes')?'0.5':'1';input.required=true;wrap.append(input);form.append(wrap);inputs[key]=input;}
    const fill=()=>{const p=preference(select.value);Object.keys(inputs).forEach(k=>inputs[k].value=p[k]);};select.onchange=fill;fill();
    form.append(node('p','초기값: 2정류장 이하가 180초 지속. 시간 간격 기준은 노선에 맞춰 설정하세요. 0은 해당 조건을 끕니다.'));
    const save=node('button','기준 적용'),message=node('p');save.type='submit';form.append(save,message);form.onsubmit=e=>{e.preventDefault();try{const p=policy.settings(Object.fromEntries(Object.entries(inputs).map(([k,n])=>[k,Number(n.value)])));preferences[select.value]=p;alerts.delete(select.value);try{root.localStorage.setItem(preferenceKey(),JSON.stringify(preferences));}catch(ignore){}message.textContent='이 기기에 적용했습니다. 새 관측부터 지속 시간을 계산합니다.';render();}catch(error){message.textContent=error.message;}};host.append(details);
    const body=node('div',undefined,'manager-live-data');host.append(body);
  }
  function compose(alert,audience,driver){
    const value=data.get(alert.route),current=alerts.get(alert.route)?.[alert.key];
    if(!allowed()||!current?.active||!current.acknowledged||!value||!model(value,Date.now()).fresh)return;
    if(audience==='DRIVER'&&!driver?.driverId)return;
    cfg.compose?.(policy.draft(current,audience,driver));
  }
  function announce(){
    if(!voice||!allowed()||root.document.hidden||speaking||!root.speechSynthesis||root.speechSynthesis.speaking||root.speechSynthesis.pending)return;
    const now=Date.now(),candidate=[...alerts.values()].flatMap(a=>Object.values(a)).find(a=>a.active&&!a.acknowledged&&now-a.lastAt<=60000&&(!a.spokenAt||now-a.spokenAt>=600000));
    if(!candidate)return;const e=epoch,speech=new root.SpeechSynthesisUtterance(candidate.route+'번 차량 간격 '+(candidate.kind==='CLOSE'?'좁음':'벌어짐')+' 상태가 지속됩니다. 운행 상황을 확인해 주세요.');speech.lang='ko-KR';
    speaking=speech;speech.onstart=()=>{if(e!==epoch||!allowed()||!voice||root.document.hidden){root.speechSynthesis.cancel();return;}candidate.spokenAt=Date.now();};speech.onend=speech.onerror=()=>{if(speaking===speech)speaking=null;};root.speechSynthesis.speak(speech);
  }
  function renderAlerts(box,route,fresh){
    for(const alert of Object.values(alerts.get(route)||{}).filter(a=>a.active)){
      const card=node('article',undefined,'manager-gap-warning');card.setAttribute('role','status');
      const number=v=>String(v.vehicleNo||'').match(/\d{4}$/)?.[0]||'번호 미확인';
      card.append(node('strong',(alert.kind==='CLOSE'?'간격 좁음':'간격 벌어짐')+' 주의 · '+Math.floor((alert.lastAt-alert.since)/1000)+'초 지속'),node('p',number(alert.bus)+'호 ↔ '+number(alert.peer)+'호 · '+alert.stop+' · '+alert.gap+'정류장'+(alert.minutes===null?'':' · 관측 약 '+alert.minutes+'분')));
      const actions=node('div',undefined,'inline-actions'),ack=node('button',alert.acknowledged?'확인함':'소장 확인');ack.type='button';ack.disabled=!fresh||alert.acknowledged;ack.onclick=()=>{alert.acknowledged=true;render();};actions.append(ack);
      for(const bus of [alert.bus,alert.peer]){const b=node('button',number(bus)+'호 기사 공지');b.type='button';b.disabled=!fresh||!alert.acknowledged||!bus.driverId;b.title=bus.driverId?'현재 배차 대상을 다시 확인한 뒤 공지 작성':'현재 기사 배차 확인 필요';b.onclick=()=>compose(alert,'DRIVER',bus);actions.append(b);}
      for(const [audience,label] of [['ROUTE','이 노선 공지'],['WORKING','전체 노선 공지']]){const b=node('button',label);b.type='button';b.disabled=!fresh||!alert.acknowledged;b.onclick=()=>compose(alert,audience);actions.append(b);}card.append(actions);box.append(card);
    }
  }
  function render(){
    const host=root.document.getElementById('managerLivePanel');if(!host||!allowed())return;
    controls(host);const c=cfg.context(),body=host.querySelector('.manager-live-data');body.replaceChildren();
    if(c.date!==c.today){body.append(node('p','오늘 날짜를 선택하면 전체 운행 차량 위치를 확인할 수 있습니다.'));return;}
    for(const route of routes()){
      const value=data.get(route),box=node('section',undefined,'manager-live-route');box.append(node('h3',route+'번'));
      if(!value){box.append(node('p',errors.get(route)||'차량 위치 조회 중'));body.append(box);continue;}
      const m=model(value,Date.now());box.classList.toggle('stale',!m.fresh);
      box.append(node('p',(m.fresh?'조회 차량 '+m.count+'대':'이전 위치 · 현재 간격 미확인')+' · '+(m.age===null?'조회 시각 없음':m.age+'초 전 조회')+(errors.get(route)?' · '+errors.get(route):''),'manager-live-meta'));
      renderAlerts(box,route,m.fresh);const legs=node('div',undefined,'manager-live-legs');
      for(const leg of m.legs){const area=node('div');area.append(node('h4',leg.start+' → '+leg.end));const list=node('ol',undefined,'manager-live-track');
        for(const g of leg.groups){const row=node('li');row.append(node('strong',g.stop.name));
          for(const v of g.buses){row.append(node('span',(String(v.vehicleNo||'').match(/\d{4}$/)?.[0]||'번호 미확인')+'호 · '+(v.sequence?v.sequence+'순차 · ':'')+(v.driverName||'기사 확인 중')));}
          let gap=!m.fresh?'이전 위치 · 간격 표시 중지':g.sameStop?'같은 정류장 · 앞뒤 순서 확인 중':g.gap===null?'앞쪽 간격 확인 대기':'앞쪽 '+g.gap+'정류장 · '+(g.minutes===null?'통과시각 관측 중':'관측 약 '+g.minutes+'분');
          row.append(node('small',gap,'manager-live-gap'+(g.gap!==null&&g.gap<=2?' close':'')));list.append(row);
        }
        if(!leg.groups.length)area.append(node('p','현재 표시할 위치 없음'));area.append(list);legs.append(area);
      }box.append(legs);
      if(m.missing.length)box.append(node('p','배차 차량 중 위치 미확인: '+m.missing.map(r=>(String(r.vehicleNo).match(/\d{4}$/)?.[0]||'번호 미확인')+'호').join(', ')+' · 미수신만으로 고장·운행 종료를 판단하지 않습니다.','manager-live-missing'));
      if(m.unmapped)box.append(node('p','정류장·운행상태 확인 필요 '+m.unmapped+'대','manager-live-missing'));
      body.append(box);
    }
    announce();
  }
  async function poll(){
    if(!allowed()||root.document.hidden||busy)return;const context=cfg.context();if(context.date!==context.today){render();return;}
    const e=epoch,owner=JSON.stringify(session()),selected=routes();busy=true;
    try{for(const route of selected){
      if(e!==epoch||!allowed()||root.document.hidden||JSON.stringify(session())!==owner)return;
      if((retry.get(route)||0)>Date.now())continue;
      try{const r=await cfg.api({action:'managerAccountUpsert',operation:'managerRouteLive',token:session().token,route,date:context.date});
        if(e!==epoch||!allowed()||JSON.stringify(session())!==owner||cfg.context().date!==context.date)return;
        if(!r.ok||r.route!==route||r.date!==context.date){errors.set(route,r.message||'서버 연결 확인 필요');const old=data.get(route);if(old)data.set(route,{...old,error:'UNAVAILABLE'});}
        else {if(r.available&&!r.error)data.set(route,r);else {const old=data.get(route);data.set(route,old?{...old,error:r.error||'UNAVAILABLE'}:r);}errors.set(route,r.error||!r.available?r.message||'위치 미수신':'');}
        const value=data.get(route);alerts.set(route,value?policy.update(alerts.get(route)||{},route,model(value,Date.now()),Number(value.fetchedAt),Date.now(),preference(route)):{});
        retry.set(route,Math.max(Date.now()+45000,Number(r.retryAt)||0));
      }catch(error){if(e===epoch){alerts.delete(route);errors.set(route,'연결 지연 · 다시 확인 중');const old=data.get(route);if(old)data.set(route,{...old,error:'NETWORK'});retry.set(route,Date.now()+45000);}}
    }}finally{if(e===epoch){busy=false;render();}}
  }
  function close(clear=false){epoch++;opened=false;busy=false;clearInterval(timer);clearInterval(paintTimer);alerts.clear();voice=false;if(speaking){root.speechSynthesis?.cancel();speaking=null;}if(clear){data.clear();errors.clear();retry.clear();root.document.getElementById('managerLivePanel')?.replaceChildren();}}
  function open(){close(true);preferences={};try{preferences=JSON.parse(root.localStorage.getItem(preferenceKey())||'{}');}catch(ignore){}opened=true;render();poll();timer=setInterval(poll,45000);paintTimer=setInterval(render,5000);}
  function init(config){cfg=config;root.document.addEventListener('visibilitychange',()=>{if(root.document.hidden){alerts.clear();if(speaking){root.speechSynthesis?.cancel();speaking=null;}}else{render();poll();}});}
  return {model,init,open,close,poll};
});
