/* Separate the live first screen from records/settings without locking page scrolling. */
(function(root){
  let observer,fitPanel;
  function element(doc,tag,cls,text){const node=doc.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;}
  function safetySummary(text){
    // Keep actionable status on the live panel; installation diagnostics remain
    // in the safety controls immediately below it, without hiding the warning.
    return String(text||'').replace(/ · 안내 음성은 설치본 업데이트 필요/g,' · 음성 업데이트 필요').replace(/ · 설치형 음성| · 화면 켜짐 중 음성/g,'').replace(/보호시설 인근 안내/g,'보호시설 주의');
  }
  function refresh(doc,live){
    doc.body.classList.toggle('live-first-screen',Boolean(live&&doc.body.classList.contains('driver-mode')));
    doc.querySelector('.driver-live-primary')?.classList.toggle('inactive',!live);
    const status=doc.getElementById('driverLiveSafety'),source=doc.querySelector('#driverRoadSafety .road-safety-status');
    if(status&&source){
      const arrival=doc.getElementById('driverArrivalEstimate');
      const conflict=doc.querySelector('.driver-live-secondary>.notice.warning');
      const text=conflict?'배차·휴무 확인 필요 · 아래 상세 확인':arrival?.classList.contains('early-warning')?'10분 이상 조기 도착 예상 · 운행시각 확인':safetySummary(source.textContent);
      if(status.textContent!==text)status.textContent=text;
      status.classList.toggle('warning',Boolean(conflict||arrival?.classList.contains('early-warning')||doc.getElementById('driverRoadSafety')?.classList.contains('warning')));
    }
    fitPanel?.();
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
    if(ring)stage.append(ring.closest('.orbit-route')||ring);primary.append(stage,legend,basis);
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
    let minimumRing=170,ringContent='';
    const fit=()=>{
      if(!ring||!stage.isConnected)return;
      const style=root.getComputedStyle(primary);
      const center=ring.querySelector('.orbit-center'),bounds=ring.getBoundingClientRect();
      const key=center?.textContent+'|'+stage.clientWidth;
      if(key!==ringContent){minimumRing=170;ringContent=key;}
      // Respect enlarged text by growing its circle and panel. Measure glyph
      // boxes, not just line-height: Korean fonts can paint above the line box.
      if(center&&bounds.width){
        let radius=0;const walker=doc.createTreeWalker(center,4);
        while(walker.nextNode()){
          if(!walker.currentNode.textContent.trim())continue;
          const range=doc.createRange();range.selectNodeContents(walker.currentNode);
          for(const r of range.getClientRects())for(const [x,y] of [[r.left,r.top],[r.right,r.top],[r.left,r.bottom],[r.right,r.bottom]])radius=Math.max(radius,Math.hypot(x-bounds.left-bounds.width/2,y-bounds.top-bounds.height/2));
        }
        if(radius>bounds.width*.37)minimumRing=Math.min(stage.clientWidth,Math.max(minimumRing,Math.ceil(radius/.36)));
      }
      const pointHeight=Array.from(stage.querySelectorAll('.orbit-point')).reduce((sum,n)=>sum+n.getBoundingClientRect().height,0);
      const visible=Array.from(primary.children).filter(n=>!n.hidden&&root.getComputedStyle(n).display!=='none'&&root.getComputedStyle(n).visibility!=='hidden');
      const height=n=>n.getBoundingClientRect().height,padding=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom),gap=parseFloat(style.rowGap)||0;
      if(style.display==='flex'){
        const fixed=visible.filter(n=>n!==stage).reduce((sum,n)=>sum+height(n),0);
        const minimum=Math.ceil(fixed+minimumRing+pointHeight+4+padding+Math.max(0,visible.length-1)*gap);
        const value=Math.max(500,minimum)+'px';if(primary.style.minHeight!==value)primary.style.minHeight=value;
      }else if(style.display==='grid'){
        const right=visible.filter(n=>root.getComputedStyle(n).gridColumnStart==='2');
        const rightHeight=right.reduce((sum,n)=>sum+height(n),0)+Math.max(0,right.length-1)*gap;
        const leftHeight=minimumRing+pointHeight+4+height(legend)+height(basis)+2*gap;
        // Fixed viewport height is only a target. Enlarged text/long station
        // names must grow the panel, never paint over the records below it.
        const value=Math.max(340,Math.ceil(Math.max(leftHeight,rightHeight)+padding))+'px';if(primary.style.minHeight!==value)primary.style.minHeight=value;
      }
      const stageMinimum=minimumRing+pointHeight+4+'px';if(stage.style.minHeight!==stageMinimum)stage.style.minHeight=stageMinimum;
      const size=Math.max(0,Math.min(stage.clientWidth,Math.max(minimumRing,stage.clientHeight-pointHeight-4),380));if(size&&ring.style.width!==size+'px')ring.style.width=size+'px';
      const actual=ring.getBoundingClientRect().width+'px';if(ring.style.getPropertyValue('--ring-size')!==actual)ring.style.setProperty('--ring-size',actual);
    };
    fitPanel=fit;fit();
    if(typeof root.ResizeObserver==='function'){let queued=false;observer=new root.ResizeObserver(()=>{if(!queued){queued=true;root.requestAnimationFrame(()=>{queued=false;fit();});}});observer.observe(stage);for(const node of [...primary.children,...stage.querySelectorAll('.orbit-point,.orbit-track,.orbit-center')])observer.observe(node);}
    refresh(doc,live);
    root.Bus70Notices?.refreshStrip();
  }
  root.Bus70Viewport={mount,refresh};
})(typeof window==='object'?window:globalThis);
