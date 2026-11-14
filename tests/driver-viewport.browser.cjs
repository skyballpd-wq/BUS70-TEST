const fs=require('fs'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));
 try{for(const [width,height] of [[320,568],[360,640],[390,664],[412,780],[432,900],[844,390],[1008,392]]){
  const page=await browser.newPage({viewport:{width,height},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2099-01-08T10:10:00+09:00')});
  await page.route('**/*',r=>{
   const u=new URL(r.request().url());if(u.origin!=='https://synthetic.test')return r.abort();
   const file=decodeURIComponent(u.pathname).slice(1)||'index.html';if(file.includes('..')||!fs.existsSync(file))return r.fulfill({status:404,body:''});
   return r.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(file)});
  });
  await page.goto('https://synthetic.test/');
  await page.evaluate(()=>{
   authToken='SYNTHETIC';currentDriverId='TEST';currentRole='';
   apiPost=async()=>({ok:false,message:'합성 응답'});loadOperationData=async()=>{};resumeDriverLocationIfAllowed=()=>{};refreshCockpitWeather=()=>{};startDriverFleetTimer=()=>{};armDriverAlarms=()=>{};
   openDriverScreen({driverId:'TEST',name:'시험 기사',route:'5',status:'재직'},false,false,'',false);stopDriverLiveTimer();stopDriverFleetTimer();
   document.getElementById('workDate').value='2099-01-08';
   const stops=Array.from({length:61},(_,i)=>({id:'S'+i,order:i+1,name:i===0||i===60?'고강공영차고지':i===30?'삼정종합사회복지회관':i===32?'부천테크노파크3단지300동앞':'시험정류장'+i,lat:37+i*.001,lng:127,origin:i===0,turnaround:i===32,direction:i<=32?'OUTBOUND':'RETURN'}));
   const trip={frontSequence:2,rearSequence:3,trip:1,startTime:'10:00',turnTime:'11:00',endTime:'12:00',startPlace:'고강공영차고지',turnPlace:'삼정종합사회복지회관',endPlace:'고강공영차고지',plannedFrontGapMinutes:7,plannedRearGapMinutes:9};
   lastSchedule={ok:true,type:'WORK',temporalState:'CURRENT',date:'2099-01-08',route:'5',trips:[trip,{...trip,trip:2,startTime:'13:00',turnTime:'14:00',endTime:'15:00'}],dispatch:{dispatchId:'TEST-D',seq:1,vehicleId:'TEST-V',scheduleVersion:'TEST-VERSION'},vehicle:{vehicleId:'TEST-V',displayNo:'시험00가0001'},routeProfile:{stops},runLogs:[{date:'2099-01-08',sequence:1,trip:1,actualStart:'10:00:00'}]};
   followCurrentTrip=true;activeTripIndex=0;locationTrackingActive=true;locationPermissionState='granted';nativeLocationEnabled=true;operationDataLoaded=true;
   lastDriverPosition={timestamp:Date.now(),coords:{latitude:37.010,longitude:127,accuracy:2,speed:7}};
   cockpitWeather={available:true,temperature:12.3,condition:'맑음',windMps:2.1,observedAt:new Date(Date.now()).toISOString()};
   liveFleet={route:'5',date:'2099-01-08',roster:[{sequence:2,vehicleId:'TEST-PEER-2',vehicleNo:'시험00가9002',driverName:'시험앞기사'},{sequence:3,vehicleId:'TEST-PEER-1',vehicleNo:'시험00가9003',driverName:'시험뒷기사'}],positions:[7,9,12,15].map((i,n)=>({route:'5',date:'2099-01-08',vehicleId:'TEST-PEER-'+n,running:true,matchedStopOrder:i+1,recordedAt:new Date(Date.now()).toISOString(),accuracyM:3})),crossCheck:{available:true,fleet:[7,9,12,15].map((i,n)=>({source:'GYEONGGI_BUS_LOCATION_V2',positionBasis:'PROVIDER_STOP_REFERENCE',vehicleId:'TEST-PEER-'+n,route:'5',date:'2099-01-08',matchedStopOrder:i+1,stateCd:1,crowded:n+1,fetchedAt:Date.now()}))}};
   routeNavigationState=()=>({configured:true,trip:1,timestamp:Date.now(),matchedIndex:10,tripPassedStops:11,tripStopCount:61,tripProgressPercent:18,previousStop:'성곡중학교.장애인종합복지관',nextStop:'수주도서관.고강선사유적공원',direction:'회차 방면',path:Bus70Automation.course(trip,stops)});
   renderSchedule(false);window.scrollTo(0,0);
  });
  const check=async(label)=>{
   // Layout is driven by ResizeObserver after a render or text-size change.
   await page.evaluate(()=>new Promise(resolve=>{let frames=8;const settle=()=>--frames?requestAnimationFrame(settle):resolve();requestAnimationFrame(settle);}));
   const rects=await page.evaluate(()=>{
    const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
    const primary=document.querySelector('.driver-live-primary');
    return {viewport:{width:innerWidth,height:innerHeight},ring:rect(document.getElementById('driverTripProgressRing')),primary:rect(primary),essential:[...primary.children].filter(n=>!n.hidden&&getComputedStyle(n).display!=='none').map(n=>({id:n.id||n.className,...rect(n)})),secondary:rect(document.querySelector('.driver-live-secondary')),scrollWidth:document.documentElement.scrollWidth};
   });
   if(process.env.CONTACT_LAYOUT_OUTPUT){fs.mkdirSync(process.env.CONTACT_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/first-screen-'+label.replace(/[^a-z0-9-]/gi,'-')+'.png'});}
   assert(rects.primary.top>=0&&rects.primary.top<=1,label+' starts at the visible top: '+JSON.stringify(rects));
   assert(rects.primary.bottom<=height+1,label+' fits the actual viewport: '+JSON.stringify(rects));
   assert(rects.ring.width>=165&&rects.ring.height>=165&&rects.ring.bottom<=height+1,label+' ring remains visible: '+JSON.stringify(rects.ring));
   for(const r of rects.essential){assert(r.bottom<=height+1&&r.top>=-1,label+' essential stays visible: '+JSON.stringify(r));assert(r.left>=-1&&r.right<=width+1,label+' no horizontal overflow: '+JSON.stringify(r));}
   assert(rects.secondary.top>=height-1,label+' secondary work starts below the first screen');
   assert(rects.scrollWidth<=width+1,label+' no page horizontal scroll');
   const points=await page.evaluate(()=>{
    const svg=document.querySelector('#driverTripProgressRing svg');
    // Check painted ticks/markers, including stroke width. The SVG canvas has
    // empty margins and WebKit's bounding box may include overflow descendants.
    const marks=[...svg.querySelectorAll('.route-tick,.route-peer,.route-own,.route-arrow path')].map(n=>{
     const r=n.getBoundingClientRect(),m=n.getScreenCTM(),style=getComputedStyle(n),pad=style.stroke==='none'?0:parseFloat(style.strokeWidth)*Math.hypot(m.c,m.d)/2;
     return {top:r.top-pad,bottom:r.bottom+pad,visible:r.width>0||r.height>0};
    }).filter(r=>r.visible);
    const paint={top:Math.min(...marks.map(r=>r.top)),bottom:Math.max(...marks.map(r=>r.bottom))};
    return [...document.querySelectorAll('#driverRingPoints>.orbit-point')].map(n=>{
     const r=n.getBoundingClientRect();let right=r.left;
     const childrenFit=[...n.children].every(c=>{const b=c.getBoundingClientRect();const fits=b.left>=right-1&&b.right<=r.right+1&&c.scrollWidth<=c.clientWidth+1;right=b.right;return fits;});
     return {outside:n.classList.contains('depot')?r.bottom<=paint.top:r.top>=paint.bottom,childrenFit,point:{top:r.top,bottom:r.bottom},paint};
    });
   });
   assert.equal(points.length,2);
   assert(points.every(p=>p.outside&&p.childrenFit),label+' endpoint names/times stay outside all ticks and do not overlap each other: '+JSON.stringify(points));
  };

  const contained=async(label)=>{
   await page.evaluate(()=>new Promise(resolve=>{let frames=8;const settle=()=>--frames?requestAnimationFrame(settle):resolve();requestAnimationFrame(settle);}));
   const result=await page.evaluate(()=>{
    const primary=document.querySelector('.driver-live-primary'),bounds=primary.getBoundingClientRect(),secondary=document.querySelector('.driver-live-secondary').getBoundingClientRect();
    const nodes=[...primary.children].filter(n=>!n.hidden&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden').map(n=>({id:n.id||n.className,r:n.getBoundingClientRect()}));
    const outside=nodes.filter(({r})=>r.top<bounds.top-1||r.bottom>bounds.bottom+1||r.left<bounds.left-1||r.right>bounds.right+1).map(n=>n.id);
    const overlaps=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j];if(Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left)>1&&Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top)>1)overlaps.push([a.id,b.id]);}
    const ring=document.getElementById('driverTripProgressRing').getBoundingClientRect(),center=document.querySelector('.orbit-center'),walker=document.createTreeWalker(center,NodeFilter.SHOW_TEXT),textOutside=[];
    while(walker.nextNode()){const node=walker.currentNode;if(!node.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(node);for(const r of range.getClientRects())if([[r.left,r.top],[r.left,r.bottom],[r.right,r.top],[r.right,r.bottom]].some(([x,y])=>Math.hypot(x-ring.left-ring.width/2,y-ring.top-ring.height/2)>ring.width*45.5/120))textOutside.push({text:node.textContent,x:r.left,y:r.top,width:r.width,height:r.height,font:getComputedStyle(node.parentElement).fontSize});}
    return {outside,overlaps,textOutside,geometry:{primary:{height:bounds.height,top:bounds.top},style:primary.style.cssText,nodes:nodes.map(({id,r})=>({id,top:r.top,height:r.height})),ring:{top:ring.top,left:ring.left,width:ring.width,height:ring.height}},secondaryClear:secondary.top>=bounds.bottom-1,horizontal:document.documentElement.scrollWidth<=innerWidth+1};
   });
   if(process.env.CONTACT_LAYOUT_OUTPUT)await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/bounds-'+label.replace(/[^a-z0-9-]/gi,'-')+'.png'});
   assert.deepEqual(result.outside,[],label+' child overflow '+JSON.stringify(result.geometry));assert.deepEqual(result.overlaps,[],label+' live elements overlap');assert.deepEqual(result.textOutside,[],label+' text touches station ticks '+JSON.stringify(result.geometry));assert(result.secondaryClear&&result.horizontal,label+' secondary/page overflow');
  };
  await check('running '+width+'x'+height);
  await contained('running '+width+'x'+height);
  assert.equal(await page.locator('.orbit-point.depot strong').innerText(),'고강차고지');
  assert.equal(await page.locator('.orbit-point.turn strong').innerText(),'테크노파크');
  assert.equal(await page.locator('.orbit-point.turn strong').getAttribute('aria-label'),'부천테크노파크3단지300동앞');
  assert.equal(await page.locator('.orbit-point.depot .before').innerText(),'출발 10:00');
  assert.equal(await page.locator('.orbit-point.depot .after').innerText(),'도착 12:00');
  assert.match(await page.locator('#driverTripProgressValue').innerText(),/18%/);
  await page.evaluate(()=>{headwayState.samples=[60,65,55].map(seconds=>({at:Date.now()-60000,seconds}));updateDriverLiveDashboard();});
  assert.match(await page.locator('#driverPlannedGaps .front').innerText(),/예정 환산 약 7정류장/);
  await check('comparison '+width+'x'+height);
  await page.evaluate(async()=>{
   apiPost=async b=>b.operation==='noticeFeed'?{ok:true,items:[{id:'SYNTHETIC-NOTICE',kind:'NOTICE',title:'시험 긴급 공지 · 긴 제목도 한 줄 표시',message:'합성 공지 내용',priority:'URGENT',expiresAt:new Date(Date.now()+3600000).toISOString()}]}:{ok:true};
   Bus70Notices.start();await Bus70Notices.poll();
  });
  await check('notice '+width+'x'+height);
  assert.equal(await page.locator('#driverNoticeStrip').isVisible(),true);

  const cardsFit=await page.locator('.headway-card').evaluateAll(cards=>cards.every(card=>{const box=card.getBoundingClientRect();let bottom=box.top;return [...card.children].every(child=>{const r=child.getBoundingClientRect();const okay=child.scrollWidth<=child.clientWidth+1&&r.left>=box.left&&r.right<=box.right+1&&r.top>=bottom-1&&r.bottom<=box.bottom+1;bottom=r.bottom;return okay;});}));
  assert(cardsFit,'headway text stays within each card without overlapping at '+width+'x'+height);
  assert.equal(await page.locator('.route-peer').count(),4);
  assert.match(await page.locator('#driverPlannedGaps .front').innerText(),/9002호 · 시험앞기사/);
  assert.match(await page.locator('#driverPlannedGaps .rear').innerText(),/9003호 · 시험뒷기사/);
  assert.match(await page.locator('#driverPlannedGaps .front').innerText(),/실제 2정류장/);
  assert.equal(await page.locator('.driver-live-primary #driverRingPoints .orbit-point').count(),2);
  assert.equal(await page.locator('.driver-live-primary .quick-run-actions').count(),0);
  assert.equal(await page.locator('.driver-live-primary #roadSafetyEnable').count(),0);
  assert.equal(await page.locator('.driver-live-primary #driverLiveSafety').isVisible(),true);
  if(process.env.CONTACT_LAYOUT_OUTPUT){fs.mkdirSync(process.env.CONTACT_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/first-screen-'+width+'x'+height+'.png'});}
  await page.evaluate(()=>{liveFleet.positions.forEach(p=>p.recordedAt=new Date(Date.now()-90000).toISOString());updateDriverLiveDashboard();});
  assert.equal(await page.locator('.route-peer.stale').count(),4);assert.match(await page.locator('#driverPlannedGaps .front').innerText(),/이전 위치/);await check('stale '+width+'x'+height);
  // A feed outage must stay visible and must not turn old values into live data.
  await page.evaluate(()=>{liveFleet={route:'5',date:'2099-01-08',roster:[{sequence:2,vehicleId:'TEST-PEER-2',vehicleNo:'시험00가9002',driverName:'시험앞기사'},{sequence:3,vehicleId:'TEST-PEER-1',vehicleNo:'시험00가9003',driverName:'시험뒷기사'}],positions:[],error:'합성 수신 중단'};lastDriverPosition.timestamp=Date.now()-120000;routeNavigationState=()=>({configured:false,reason:'위치·방향 확인 중'});updateDriverLiveDashboard();});
  await check('outage '+width+'x'+height);
  assert.equal(await page.locator('.route-peer').count(),0);
  assert.match(await page.locator('#driverPeerBasis').innerText(),/연결 실패/);
  // Field regressions: one-way final service, missing speed, a long status,
  // orientation change and enlarged text. All values are synthetic.
  await page.evaluate(()=>{
   const trip=lastSchedule.trips[0];Object.assign(trip,{turnPlace:'',turnTime:'',endPlace:'시험산업단지 정류소',serviceEndPlace:'시험산업단지 정류소',deadheadDestination:'고강공영차고지',endLocation:{lat:37.05,lng:127}});
   lastSchedule.routeProfile.stops[50].name=trip.endPlace;
   lastDriverPosition={timestamp:Date.now(),coords:{latitude:37.049,longitude:127,accuracy:3,speed:null}};
   routeNavigationState=()=>({configured:true,trip:1,timestamp:Date.now(),matchedIndex:49,tripPassedStops:50,tripStopCount:51,tripProgressPercent:97,previousStop:'시험아파트.청소년문화센터',nextStop:'시험산업단지 정류소',direction:'회차 방면'});
   renderSchedule(false);window.scrollTo(0,0);
   document.querySelector('#driverRoadSafety .road-safety-status').textContent='보호시설 인근 안내 · 제한속도 미확인 · 안내 음성은 설치본 업데이트 필요';Bus70Viewport.refresh(document,true);
  });
  assert.equal(await page.locator('.orbit-point.depot .before').innerText(),'출발 10:00');
  assert.equal(await page.locator('.orbit-point.depot .after').innerText(),'');
  assert.equal(await page.locator('.orbit-point.turn .after').innerText(),'영업종료 12:00');
  assert.match(await page.locator('#driverTripProgressValue').innerText(),/시험산업단지 방면/);
  assert.equal(await page.locator('#driverLiveSpeed .speed-unit').innerText(),'km/h');
  await contained('terminal '+width+'x'+height);
  if(process.env.CONTACT_LAYOUT_OUTPUT)await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/terminal-'+width+'x'+height+'.png',fullPage:false});
  await page.setViewportSize({width:height,height:width});await contained('rotated '+width+'x'+height);
  await page.setViewportSize({width,height});await contained('restored '+width+'x'+height);
  await page.evaluate(()=>{const sizes=[...document.querySelectorAll('.driver-live-primary *')].filter(n=>[...n.childNodes].some(c=>c.nodeType===Node.TEXT_NODE&&c.textContent.trim())).map(n=>({n,font:parseFloat(getComputedStyle(n).fontSize),line:parseFloat(getComputedStyle(n).lineHeight)}));for(const {n,font,line} of sizes){n.style.setProperty('font-size',font*1.2+'px','important');if(Number.isFinite(line))n.style.setProperty('line-height',line*1.2+'px','important');}});
  await contained('enlarged '+width+'x'+height);
  await page.evaluate(()=>{Object.assign(lastSchedule.trips[0],{turnPlace:'삼정종합사회복지회관',turnTime:'11:00',endPlace:'고강공영차고지',serviceEndPlace:'',deadheadDestination:'',endLocation:null});renderSchedule(false);window.scrollTo(0,0);});
  // Scrolling is deliberately possible; all work controls remain reachable.
  await page.locator('.quick-run-actions').scrollIntoViewIfNeeded();
  assert(await page.evaluate(()=>scrollY>0));
  assert.equal(await page.locator('.quick-run-actions button').count(),3);
  await page.locator('.cockpit-record-details>summary').click();
  assert(await page.locator('.cockpit-record-details').evaluate(n=>n.open));
  await page.locator('[data-driver-menu="LOG"]').scrollIntoViewIfNeeded();assert(await page.locator('[data-driver-menu="LOG"]').isVisible());
  await page.evaluate(()=>{renderSchedule(false);window.scrollTo(0,0);});
  assert(await page.locator('.cockpit-record-details').evaluate(n=>n.open),'record disclosure survives refresh without growing the live panel');
  await check('details-open '+width+'x'+height);
  // Historical/other trip views and logout must release the first-screen layout.
  await page.evaluate(()=>selectDriverTrip(1));assert.equal(await page.locator('.driver-live-primary').count(),0);
  assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('live-first-screen')),false);
  await page.evaluate(()=>{selectDriverTrip(0);window.scrollTo(0,0);});await check('return-current '+width+'x'+height);
  // Before departure, no live location is invented; endpoint rows still fit.
  await page.evaluate(()=>{Bus70Notices.reset();lastSchedule.runLogs=[];lastSchedule.trips[0].startTime='10:30';lastDriverPosition=null;renderSchedule(false);window.scrollTo(0,0);});
  await check('waiting '+width+'x'+height);
  assert.match(await page.locator('#driverLiveSpeed').innerText(),/출발 대기/);
  // Boundary markers at the depot and turnaround must never sit under text.
  await page.evaluate(()=>{
   const ring=document.getElementById('driverTripProgressRing'),plan=Bus70Cockpit.ringPlan(lastSchedule.trips[0],{turnIndex:30,stops:Array(61)});
   Bus70Cockpit.drawRing(ring,61,31,50,false,{color:'#078564',key:'moving'},[0,30,31,60].map((index,n)=>({side:n<2?'front':'rear',index,rank:n%2+1,stopGap:1,stopName:'시험 경계 정류장'})),plan);
  });
  await check('boundary-markers '+width+'x'+height);
  assert.equal(await page.locator('.route-peer').count(),4);
  await page.evaluate(()=>showLoginScreen());assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('live-first-screen')),false);
  assert(await page.locator('.app>.header').isVisible());assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Actual first viewport, portrait/landscape, data outage, reachable lower work controls, refresh and trip/logout transitions passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
