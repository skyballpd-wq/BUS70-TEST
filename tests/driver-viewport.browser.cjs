const fs=require('fs'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));
 try{for(const [width,height] of [[320,568],[360,640],[390,664],[412,780],[844,390]]){
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
   const stops=Array.from({length:61},(_,i)=>({id:'S'+i,order:i+1,name:i===0||i===60?'고강공영차고지':i===30?'삼정종합사회복지회관':'시험정류장'+i,lat:37+i*.001,lng:127,origin:i===0,turnaround:i===30,direction:i<30?'OUTBOUND':'RETURN'}));
   const trip={trip:1,startTime:'10:00',turnTime:'11:00',endTime:'12:00',startPlace:'고강공영차고지',turnPlace:'삼정종합사회복지회관',endPlace:'고강공영차고지',plannedFrontGapMinutes:7,plannedRearGapMinutes:9};
   lastSchedule={ok:true,type:'WORK',temporalState:'CURRENT',date:'2099-01-08',route:'5',trips:[trip,{...trip,trip:2,startTime:'13:00',turnTime:'14:00',endTime:'15:00'}],dispatch:{dispatchId:'TEST-D',seq:1,vehicleId:'TEST-V',scheduleVersion:'TEST-VERSION'},vehicle:{vehicleId:'TEST-V',displayNo:'시험00가0001'},routeProfile:{stops},runLogs:[{date:'2099-01-08',sequence:1,trip:1,actualStart:'10:00:00'}]};
   followCurrentTrip=true;activeTripIndex=0;locationTrackingActive=true;locationPermissionState='granted';nativeLocationEnabled=true;operationDataLoaded=true;
   lastDriverPosition={timestamp:Date.now(),coords:{latitude:37.010,longitude:127,accuracy:2,speed:7}};
   cockpitWeather={available:true,temperature:12.3,condition:'맑음',windMps:2.1,observedAt:new Date(Date.now()).toISOString()};
   liveFleet={route:'5',date:'2099-01-08',positions:[7,9,12,15].map((i,n)=>({route:'5',date:'2099-01-08',vehicleId:'TEST-PEER-'+n,running:true,matchedStopOrder:i+1,recordedAt:new Date(Date.now()).toISOString(),accuracyM:3})),crossCheck:{available:true}};
   routeNavigationState=()=>({configured:true,matchedIndex:10,tripPassedStops:11,tripStopCount:61,tripProgressPercent:18,previousStop:'성곡중학교.장애인종합복지관',nextStop:'수주도서관.고강선사유적공원',direction:'회차 방면',path:Bus70Automation.course(trip,stops)});
   renderSchedule(false);window.scrollTo(0,0);
  });
  const check=async(label)=>{
   const rects=await page.evaluate(()=>{
    const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};};
    const primary=document.querySelector('.driver-live-primary');
    return {viewport:{width:innerWidth,height:innerHeight},ring:rect(document.getElementById('driverTripProgressRing')),primary:rect(primary),essential:[...primary.children].filter(n=>!n.hidden).map(n=>({id:n.id||n.className,...rect(n)})),secondary:rect(document.querySelector('.driver-live-secondary')),scrollWidth:document.documentElement.scrollWidth};
   });
   if(process.env.CONTACT_LAYOUT_OUTPUT){fs.mkdirSync(process.env.CONTACT_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/first-screen-'+label.replace(/[^a-z0-9-]/gi,'-')+'.png'});}
   assert(rects.primary.top>=0&&rects.primary.top<=1,label+' starts at the visible top: '+JSON.stringify(rects));
   assert(rects.primary.bottom<=height+1,label+' fits the actual viewport: '+JSON.stringify(rects));
   assert(rects.ring.width>=165&&rects.ring.height>=165&&rects.ring.bottom<=height+1,label+' ring remains visible: '+JSON.stringify(rects.ring));
   for(const r of rects.essential){assert(r.bottom<=height+1&&r.top>=-1,label+' essential stays visible: '+JSON.stringify(r));assert(r.left>=-1&&r.right<=width+1,label+' no horizontal overflow: '+JSON.stringify(r));}
   assert(rects.secondary.top>=height-1,label+' secondary work starts below the first screen');
   assert(rects.scrollWidth<=width+1,label+' no page horizontal scroll');
  };
  await check('running '+width+'x'+height);
  assert.equal(await page.locator('.route-peer').count(),4);
  assert.equal(await page.locator('.driver-live-primary #driverRingPoints .orbit-point').count(),2);
  assert.equal(await page.locator('.driver-live-primary .quick-run-actions').count(),0);
  assert.equal(await page.locator('.driver-live-primary #roadSafetyEnable').count(),0);
  assert.equal(await page.locator('.driver-live-primary #driverLiveSafety').isVisible(),true);
  if(process.env.CONTACT_LAYOUT_OUTPUT){fs.mkdirSync(process.env.CONTACT_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/first-screen-'+width+'x'+height+'.png'});}
  // A feed outage must stay visible and must not turn old values into live data.
  await page.evaluate(()=>{liveFleet={route:'5',date:'2099-01-08',positions:[],error:'합성 수신 중단'};lastDriverPosition.timestamp=Date.now()-120000;routeNavigationState=()=>({configured:false,reason:'위치·방향 확인 중'});updateDriverLiveDashboard();});
  await check('outage '+width+'x'+height);
  assert.equal(await page.locator('.route-peer').count(),0);
  assert.match(await page.locator('#driverPeerBasis').innerText(),/연결 실패/);
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
  await page.evaluate(()=>showLoginScreen());assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('live-first-screen')),false);
  assert(await page.locator('.app>.header').isVisible());assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Actual first viewport, portrait/landscape, data outage, reachable lower work controls, refresh and trip/logout transitions passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
