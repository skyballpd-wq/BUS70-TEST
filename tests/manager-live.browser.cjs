const assert=require('node:assert/strict'),fs=require('fs'),{chromium,webkit}=require('playwright');
(async()=>{const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']}));try{
 for(const width of [360,1008]){const page=await browser.newPage({viewport:{width,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2099-01-08T11:00:00+09:00')});
 await page.setContent('<style>'+fs.readFileSync('driver-viewport.css','utf8')+'</style><section id="managerLivePanel"></section>');await page.addScriptTag({content:fs.readFileSync('manager-gap-alerts.js','utf8')});await page.addScriptTag({content:fs.readFileSync('manager-live.js','utf8')});
 await page.evaluate(()=>{
  window.calls=[];window.activeRoute='5';window.liveRole='MANAGER';window.deferred=null;
  window.makeData=route=>({ok:true,available:true,route,date:'2099-01-08',fetchedAt:Date.now(),stops:Array.from({length:12},(_,i)=>({order:i+1,name:'합성 정류장 '+i,direction:i<6?'OUT':'BACK'})),vehicles:[1,3,6,8,9].map((order,i)=>({vehicleId:'SYN-'+i,vehicleNo:'시험00가900'+i,driverName:'합성기사'+i,sequence:i+1,matchedStopOrder:order,direction:order<=6?'OUT':'BACK'})),roster:[{vehicleId:'MISSING',vehicleNo:'시험00가9099'}]});
  Bus70ManagerLive.init({compose:draft=>window.lastDraft=draft,session:()=>({token:'SYN',driverId:'SYN',role:liveRole}),context:()=>({route:activeRoute,date:'2099-01-08',today:'2099-01-08',routes:['5','23','70']}),api:async body=>{calls.push(body);if(deferred)return new Promise(resolve=>window.release=()=>resolve(makeData(body.route)));return makeData(body.route);}});Bus70ManagerLive.open();
 });
 await page.waitForFunction(()=>document.querySelectorAll('.manager-live-track li').length===5);assert.equal(await page.locator('.manager-live-legs>div').count(),2);assert.match(await page.locator('#managerLivePanel').innerText(),/앞쪽 2정류장/);assert.match(await page.locator('#managerLivePanel').innerText(),/9099호/);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 if(process.env.CONTACT_LAYOUT_OUTPUT){fs.mkdirSync(process.env.CONTACT_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:process.env.CONTACT_LAYOUT_OUTPUT+'/manager-live-'+width+'.png',fullPage:true});}
 await page.clock.runFor(190000);await page.waitForFunction(()=>document.querySelectorAll('.manager-gap-warning').length>0);
 const warning=page.locator('.manager-gap-warning').first();await warning.getByRole('button',{name:'소장 확인',exact:true}).click();assert(await warning.getByRole('button',{name:'이 노선 공지',exact:true}).isEnabled());
 await page.evaluate(()=>window.noticeDrafts=[]);await page.evaluate(()=>{Bus70ManagerLive.close(true);});
 await page.evaluate(()=>{activeRoute='ALL';Bus70ManagerLive.open();});await page.waitForFunction(()=>document.querySelectorAll('.manager-live-route').length===3&&document.querySelectorAll('.manager-live-track li').length===15);
 await page.evaluate(()=>{deferred=true;activeRoute='5';Bus70ManagerLive.open();});await page.waitForFunction(()=>!!window.release);
 await page.evaluate(()=>{Bus70ManagerLive.close(true);liveRole='';release();});await page.waitForTimeout(50);assert.equal(await page.locator('#managerLivePanel').innerText(),'','late manager response after logout stays discarded');assert.deepEqual(errors,[]);
 await page.close();
 }console.log('Route-wide manager board, all routes, narrow viewport and logout response race passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
