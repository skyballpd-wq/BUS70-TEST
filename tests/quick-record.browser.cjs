const fs=require('fs'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));
 try{for(const width of [320,360,412]){
  const page=await browser.newPage({viewport:{width,height:800},serviceWorkers:'block'}),errors=[];
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
   window.recordRequests=[];apiPost=async body=>{if(body.operation==='driverRunLogSave'){recordRequests.push(JSON.parse(JSON.stringify(body)));return new Promise(resolve=>window.resolveRecord=resolve);}return {ok:false,message:'합성 응답'};};
   loadOperationData=async()=>{};resumeDriverLocationIfAllowed=()=>{};refreshCockpitWeather=()=>{};startDriverFleetTimer=()=>{};armDriverAlarms=()=>{};
   openDriverScreen({driverId:'TEST',name:'시험 기사',route:'5',status:'재직'},false,false,'',false);stopDriverLiveTimer();stopDriverFleetTimer();
   document.getElementById('workDate').value='2099-01-08';
   const trips=Array.from({length:7},(_,i)=>({trip:i+1,startTime:i<4?'04:00':i===4?'10:00':'18:00',turnTime:'11:00',endTime:'12:00',startPlace:'합성차고지',turnPlace:'합성회차지',endPlace:'합성차고지',plannedFrontGapMinutes:14}));
   lastSchedule={ok:true,type:'WORK',temporalState:'CURRENT',date:'2099-01-08',route:'5',trips,dispatch:{dispatchId:'TEST-D',seq:1,vehicleId:'TEST-V',scheduleVersion:'TEST-VERSION'},vehicle:{vehicleId:'TEST-V',displayNo:'시험00가0001'},driverContext:{assignmentRouteOverride:true,homeRoute:'70'},routeProfile:{stops:[]},runLogs:trips.slice(0,4).map(t=>({date:'2099-01-08',sequence:1,trip:t.trip,actualStart:'04:00',actualEnd:'06:00'}))};
   followCurrentTrip=true;activeTripIndex=4;locationTrackingActive=true;locationPermissionState='granted';nativeLocationEnabled=true;operationDataLoaded=true;
   lastDriverPosition={timestamp:Date.now(),coords:{latitude:37,longitude:127,accuracy:2,speed:0}};
   liveFleet={route:'5',date:'2099-01-08',positions:[],crossCheck:{available:false,error:'GBIS_HTTP_429'}};
   routeNavigationState=()=>({waiting:true,configured:false});renderSchedule(false);
  });
  assert.deepEqual(errors,[]);
  assert.equal(await page.locator('.quick-run-actions button').count(),3);
  assert.equal(await page.locator('.manual-run-tools').count(),0);
  assert.equal(await page.locator('#driverLiveClock').count(),0);
  assert.equal(await page.locator('#driverLiveDashboard .cockpit-phases').count(),1);
  assert.equal(await page.locator('.schedule-options').evaluate(n=>n.open),false);
  assert.equal(await page.locator('#driverCrossCheckStatus').isVisible(),false);
  assert.equal(await page.locator('#driverWeather').isVisible(),false);
  assert(await page.locator('[data-run-event="DEPART"]').isVisible());
  assert(await page.locator('[data-run-event="DEPART"]').isEnabled());
  assert(await page.locator('[data-run-event="TURN"]').isDisabled());
  assert(await page.locator('.quick-run-actions').evaluate(n=>!n.closest('details')),'direct buttons require no disclosure');
  assert(await page.locator('.quick-run-actions button').first().evaluate(n=>n.getBoundingClientRect().height>=44));
  // Two taps before the response still send exactly one manual event.
  await page.locator('[data-run-event="DEPART"]').evaluate(n=>{n.click();n.click();});
  assert.equal(await page.evaluate(()=>recordRequests.length),1);
  assert.equal(await page.evaluate(()=>recordRequests[0].source),'MANUAL');
  assert.equal(await page.locator('.quick-run-actions button:enabled').count(),0);
  await page.evaluate(()=>resolveRecord({ok:true,recordedAt:'2099-01-08T10:10:00+09:00',recordMode:'수동',status:'운행중',message:'출발 저장 완료'}));
  await page.waitForFunction(()=>!quickRunPending);
  assert(await page.locator('[data-run-event="DEPART"]').isDisabled());
  assert(await page.locator('[data-run-event="TURN"]').isEnabled());
  assert.match(await page.locator('#driverRecordFeedback').innerText(),/출발 저장 완료/);
  assert.match(await page.locator('#driverLiveDashboard .cockpit-phases').innerText(),/수동/);
  assert.match(await page.locator('#driverLiveDashboard .cockpit-phases').innerText(),/기록 기준/);
  assert(!/10분 지연/.test(await page.locator('#driverLiveDashboard').innerText()));
  assert.equal(await page.locator('.phase-actual').first().evaluate(n=>getComputedStyle(n).whiteSpace),'nowrap');
  assert(await page.locator('#driverLiveDashboard').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'card remains within narrow viewport');
  // Failed saves show feedback beside the buttons, without inventing an event.
  await page.locator('[data-run-event="TURN"]').click();
  await page.evaluate(()=>resolveRecord({ok:false,message:'합성 저장 실패'}));await page.waitForFunction(()=>!quickRunPending);
  assert.match(await page.locator('#driverRecordFeedback').innerText(),/합성 저장 실패/);
  assert.equal(await page.evaluate(()=>Boolean(runLogForTrip(lastSchedule,lastSchedule.trips[4]).actualTurn)),false);
  // Details retain diagnostics and secondary phases, not a second start/turn/end table.
  await page.locator('#driverRecordingSummary').click();
  assert(await page.locator('#driverCrossCheckStatus').isVisible());
  assert.match(await page.locator('#driverCrossCheckStatus').innerText(),/429/);
  assert(!/출발\s+10:00/.test(await page.locator('.selected-trip-tools').innerText()));
  await page.locator('.schedule-options>summary').click();
  if(process.env.CONTACT_LAYOUT_OUTPUT){fs.mkdirSync(process.env.CONTACT_LAYOUT_OUTPUT,{recursive:true});await page.locator('#scheduleResult').screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/quick-record-'+width+'.png'});}
  await page.evaluate(()=>selectDriverTrip(5));
  assert.equal(await page.locator('.quick-run-actions').count(),0,'future selection has no record buttons');
  await page.evaluate(()=>selectDriverTrip(0));
  assert.equal(await page.locator('.quick-run-actions').count(),0,'completed selection has no record buttons');
  assert.deepEqual(errors,[]);await page.close();
 }console.log('Full app 320/360/412px: direct recording, duplicate tap, provenance, save failure, details and selected-trip isolation passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
