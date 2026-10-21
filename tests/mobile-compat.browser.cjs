const fs=require('fs'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));
 try{
  for(const native of [false,true]){
   const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',userAgent:native?'Android':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 Version/18.4 Mobile Safari/604.1'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(native=>{
    window.watches=[];window.cleared=[];window.spoken=[];
    Object.defineProperty(navigator,'geolocation',{value:{watchPosition(ok){watches.push(ok);return watches.length;},clearWatch(id){cleared.push(id);}}});
    Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},speak(value){spoken.push(value.text);}}});
    if(native)window.Bus70Android={syncSchedule(){},startLocationTracking(){},stopLocationTracking(){},requestSetup(){}};
   },native);
   await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://synthetic.test')return r.abort();const file=decodeURIComponent(u.pathname).slice(1)||'index.html';if(file.includes('..')||!fs.existsSync(file))return r.fulfill({status:404,body:''});return r.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(file)});});
   await page.goto('https://synthetic.test/');
   await page.evaluate(()=>{
    window.loginRequests=[];
    apiPost=async body=>{loginRequests.push(body);return body.action==='loginSecure'?{ok:true,token:'SYNTHETIC',driver:{driverId:'TEST',name:'시험 기사',route:'5'},schedule:{ok:true,type:'OFF',date:body.date,message:'합성 휴무'},alertSettings:driverAlertSettings}:{ok:false,message:'합성 미제공'};};
   });
   await page.locator('#driverName').fill('시험 기사');await page.locator('#empId').fill('000000');await page.locator('#rememberDevice').uncheck();await page.locator('#loginButton').click();
   await page.locator('#sessionBar').waitFor({state:'visible'});
   assert.match(await page.locator('#sessionGreeting').innerText(),/시험 기사/);
   assert.equal(await page.evaluate(()=>loginRequests.filter(x=>x.action==='loginSecure').length),1);
   await page.evaluate(()=>{stopDriverLiveTimer();toggleDriverWorkMenu('ALERT');});
   assert.equal(await page.locator('#nativeAlarmControls').isVisible(),native);
   assert.equal(await page.locator('#alarmSoundMode').isVisible(),native);
   assert.equal(await page.locator('#testBrowserVoice').isVisible(),!native);
   if(!native){
    await page.locator('#testBrowserVoice').click();assert.equal(await page.evaluate(()=>spoken.length),1,'voice starts without awaiting service worker readiness');
    assert.match(await page.locator('#platformAlertHint').innerText(),/화면 잠금 중.*지원하지 않습니다/);
    await page.evaluate(()=>{
     // Exercise the actual lifecycle handlers with isolated, synthetic movement.
     lastSchedule={trips:[{trip:1}],dispatch:{id:'TEST-D'},vehicle:{id:'TEST-V'}};
     document.getElementById('workDate').value=todayLocal();
     trackingCoverage=()=>({ready:true,assignmentReady:true,locationReady:true,dispatchId:'TEST-D',vehicleId:'TEST-V'});
     tripCompleted=()=>false;loadOperationData=async()=>{};refreshScheduleOnResume=()=>{};loadDriverLiveLocations=async()=>{};updateDriverLiveDashboard=()=>{};
     locationResumeAttemptAt=0;locationPermissionState='granted';toggleDriverLocationTracking();
    });
    assert.equal(await page.evaluate(()=>watches.length),1);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.evaluate(()=>locationTrackingActive),false);assert.deepEqual(await page.evaluate(()=>cleared),[1]);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.evaluate(()=>watches.length),2,'reopen starts a fresh geolocation watch');
    await page.evaluate(()=>{localStorage.setItem(driverLocationPreference(),'N');suspendBrowserLocation();window.dispatchEvent(new Event('pageshow'));});
    assert.equal(await page.evaluate(()=>watches.length),2,'manual pause survives reopen');
    await page.evaluate(()=>{localStorage.setItem(driverLocationPreference(),'Y');tripCompleted=()=>true;window.dispatchEvent(new Event('pageshow'));});
    assert.equal(await page.evaluate(()=>watches.length),2,'finished shift does not restart');
   }
   assert.deepEqual(errors,[]);
   if(process.env.CONTACT_LAYOUT_OUTPUT){fs.mkdirSync(process.env.CONTACT_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/mobile-compat-'+(native?'android':'iphone')+'.png',fullPage:true});}
   await page.close();
  }
  console.log('Real page synthetic login, platform controls, direct voice, suspend/reopen, paused and completed guards passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
