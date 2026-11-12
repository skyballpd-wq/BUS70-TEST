/* Separate the live first screen from records/settings without locking page scrolling. */
(function(root){
  let observer;
  function element(doc,tag,cls,text){const node=doc.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;}
  function refresh(doc,live){
    doc.body.classList.toggle('live-first-screen',Boolean(live&&doc.body.classList.contains('driver-mode')));
    doc.querySelector('.driver-live-primary')?.classList.toggle('inactive',!live);
    const status=doc.getElementById('driverLiveSafety'),source=doc.querySelector('#driverRoadSafety .road-safety-status');
    if(status&&source){
      const arrival=doc.getElementById('driverArrivalEstimate');
      const conflict=doc.querySelector('.driver-live-secondary>.notice.warning');
      const text=conflict?'배차·휴무 확인 필요 · 아래 상세 확인':arrival?.classList.contains('early-warning')?'10분 이상 조기 도착 예상 · 운행시각 확인':source.textContent;
      if(status.textContent!==text)status.textContent=text;
      status.classList.toggle('warning',Boolean(conflict||arrival?.classList.contains('early-warning')||doc.getElementById('driverRoadSafety')?.classList.contains('warning')));
    }
  }
  function mount(container,live){
    const doc=container.ownerDocument,box=container.querySelector('#driverLiveDashboard');
    refresh(doc,live);
    if(!live||!doc.body.classList.contains('driver-mode')||!box||box.querySelector('.driver-live-primary'))return;
    observer?.disconnect();
    const primary=element(doc,'section','driver-live-primary');primary.setAttribute('aria-label','실시간 운행');
    const ring=doc.getElementById('driverTripProgressRing'),stage=element(doc,'div','driver-live-orbit');
    const legend=doc.getElementById('driverRingPeers')||element(doc,'div','ring-peer-label');legend.id='driverRingPeers';
    const basis=doc.getElementById('driverPeerBasis')||element(doc,'small','peer-basis');basis.id='driverPeerBasis';
    const signals=element(doc,'div','driver-live-signals'),safety=element(doc,'span','driver-live-safety');safety.id='driverLiveSafety';
    for(const selector of ['.cockpit-now','.cockpit-head','#driverPlannedGaps']){const node=box.querySelector(selector);if(node)primary.append(node);}
    if(ring)stage.append(ring);primary.append(stage,legend,basis);
    for(const selector of ['.orbit-stops','.cockpit-target']){const node=box.querySelector(selector);if(node)primary.append(node);}
    const recording=doc.getElementById('driverRecordingSummary');if(recording)signals.append(recording);signals.append(safety);primary.append(signals);
    primary.append(element(doc,'small','driver-scroll-hint','아래로 스크롤 · 운행기록·관리'));
    box.prepend(primary);
    const details=element(doc,'div','driver-live-secondary');
    details.append(element(doc,'h2','','운행기록·관리'));
    for(const node of Array.from(container.children))if(node.matches('.notice,.leave-month'))details.append(node);
    const picker=container.querySelector('.trip-chip-list');if(picker)details.append(picker);
    for(const node of Array.from(box.children))if(node!==primary)details.append(node);
    box.append(details);
    const fit=()=>{
      if(!ring||!stage.isConnected)return;
      const style=root.getComputedStyle(primary);
      if(style.display==='flex'){
        const visible=Array.from(primary.children).filter(n=>!n.hidden),fixed=visible.filter(n=>n!==stage).reduce((sum,n)=>sum+n.getBoundingClientRect().height,0);
        const minimum=Math.ceil(fixed+170+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+Math.max(0,visible.length-1)*parseFloat(style.rowGap));
        const value=Math.max(500,minimum)+'px';if(primary.style.minHeight!==value)primary.style.minHeight=value;
      }else if(primary.style.minHeight)primary.style.removeProperty('min-height');
      const size=Math.max(0,Math.min(stage.clientWidth,stage.clientHeight,380));if(size&&ring.style.width!==size+'px')ring.style.width=size+'px';
    };
    fit();
    if(typeof root.ResizeObserver==='function'){observer=new root.ResizeObserver(fit);observer.observe(stage);for(const node of primary.children)observer.observe(node);}
    refresh(doc,live);
  }
  root.Bus70Viewport={mount,refresh};
})(typeof window==='object'?window:globalThis);
