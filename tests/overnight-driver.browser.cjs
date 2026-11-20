const fs=require('fs'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));
 try{for(const [route,upper] of [['5',false],['5',true],['23',false],['70',false]]){
  const page=await browser.newPage({viewport:{width:432,height:900},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2099-01-10T23:59:55+09:00')});
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://synthetic.test')return r.abort();const file=decodeURIComponent(u.pathname).slice(1)||'index.html';if(file.includes('..')||!fs.existsSync(file))return r.fulfill({status:404,body:''});return r.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(file)});});
  await page.goto('https://synthetic.test/');
  await page.evaluate(({route,upper})=>{
   window.requests=[];
   loadOperationData=async()=>{};loadAlertSettings=async()=>{};resumeDriverLocationIfAllowed=()=>{};refreshCockpitWeather=()=>{};startDriverFleetTimer=()=>{};armDriverAlarms=()=>{};
   const driver={driverId:'SYNTHETIC',name:'시험 기사',route,status:'재직'};
   const stops=Array.from({length:61},(_,i)=>({id:'S'+i,order:i+1,name:i===0||i===60?'고강공영차고지':i===30?'시험회차지':'시험정류장'+i,lat:37+i*.001,lng:127,origin:i===0,turnaround:i===30,direction:i<=30?'OUTBOUND':'RETURN'}));
   const trip={trip:6,startTime:'22:50',turnTime:upper?'':'23:50',endTime:upper?'00:10':'01:15',startPlace:'고강공영차고지',turnPlace:upper?'':'시험회차지',endPlace:upper?'시험회차지':'고강공영차고지',serviceEndType:upper?'UPBOUND_LAST':'ROUND_TRIP_LAST',plannedFrontGapMinutes:13,plannedRearGapMinutes:0};
   const schedule={ok:true,type:'WORK',temporalState:'CURRENT',date:'2099-01-10',route,trips:[trip],dispatch:{dispatchId:'SYN-D-'+route,seq:8,vehicleId:'SYN-V',scheduleVersion:'SYN'},vehicle:{vehicleId:'SYN-V',displayNo:'시험00가0001'},routeProfile:{stops},runLogs:[{date:'2099-01-10',sequence:8,trip:6,actualStart:'22:50:00',actualTurn:upper?'':'23:50:00'}]};
   apiPost=async body=>{requests.push({action:body.action,date:body.date});return {ok:true,driver,role:'',token:'SYN-TOKEN',expiresAt:'2099-01-12T00:00:00+09:00',schedule:body.date==='2099-01-10'?structuredClone(schedule):{ok:true,type:'NO_DISPATCH',date:body.date}};};
   routeNavigationState=()=>({configured:true,trip:6,timestamp:Date.now(),matchedIndex:upper?25:45,fraction:upper?25:45,tripPassedStops:upper?26:46,tripStopCount:upper?31:61,tripProgressPercent:75,previousStop:'시험정류장',nextStop:'다음시험정류장',direction:upper?'영업종료지 방면':'고강차고지 방면',path:Bus70Automation.course(trip,stops)});
   lastDriverPosition={timestamp:Date.now(),coords:{latitude:37.045,longitude:127,accuracy:2,speed:7}};
   document.getElementById('driverName').value='시험 기사';document.getElementById('empId').value='SYN';document.getElementById('rememberDevice').checked=true;
  },{route,upper});
  await page.evaluate(()=>login());
  assert.equal(await page.locator('#workDate').inputValue(),'2099-01-10');
  assert(await page.locator('#driverTripProgressRing').isVisible());
  await page.clock.runFor(10000);
  assert.equal(await page.locator('#workDate').inputValue(),'2099-01-10','midnight must retain the service day');
  assert.match(await page.locator('#driverLiveDate').innerText(),/1월 11일/,'wall clock still shows the new calendar date');
  assert.match(await page.locator('#driverTripProgressValue').innerText(),/75/);
  assert.equal(await page.evaluate(()=>lastSchedule.route),route);
  await page.evaluate(()=>refreshScheduleOnResume());
  await page.waitForFunction(()=>!scheduleRefreshInFlight);
  assert.equal(await page.locator('#workDate').inputValue(),'2099-01-10');
  // Re-run the actual remembered-session path after discarding the in-memory view.
  await page.evaluate(async()=>{stopDriverLiveTimer();lastSchedule=null;currentDriverId='';await restoreRememberedDriver();});
  assert.equal(await page.locator('#workDate').inputValue(),'2099-01-10','remembered login recovers the overnight plan');
  assert(await page.locator('#driverTripProgressRing').isVisible());
  assert.equal(await page.evaluate(()=>requests.filter(r=>['loginSecure','session'].includes(r.action)).every(r=>r.date==='2099-01-10')),true);
  await page.evaluate(()=>{document.getElementById('workDate').value='2099-01-11';document.getElementById('workDate').dispatchEvent(new Event('change'));});
  await page.waitForFunction(()=>!scheduleRefreshInFlight);
  assert.equal(await page.evaluate(()=>scheduleFollowToday),false,'explicit next-day preview is not overwritten');
  assert.match(await page.locator('#scheduleResult').innerText(),/스케줄 없음/);
  await page.evaluate(()=>{document.getElementById('workDate').value='2099-01-10';document.getElementById('workDate').dispatchEvent(new Event('change'));});
  await page.waitForFunction(()=>!scheduleRefreshInFlight);
  assert(await page.locator('#driverTripProgressRing').isVisible());
  if(process.env.CONTACT_LAYOUT_OUTPUT){fs.mkdirSync(process.env.CONTACT_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/overnight-'+route+(upper?'-upper':'-return')+'.png'});}
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('All route overnight dashboards: login, midnight timer, visible progress, resume, remembered session and explicit date preview passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
