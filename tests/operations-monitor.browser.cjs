const fs=require('fs'),assert=require('assert'),{chromium}=require('playwright');
const html=fs.readFileSync('index.html','utf8'),css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
const start=html.indexOf('<section id="operationsMonitorPanel"'),panel=html.slice(start,html.indexOf('</section>',start)+10).replace(' hidden>','>');
const code=html.slice(html.indexOf('  let presenceTimer='),html.indexOf('  let depotContacts ='));
const output=process.env.CONTACT_LAYOUT_OUTPUT||require('os').tmpdir()+'/bus70-monitor';fs.mkdirSync(output,{recursive:true});
const data={ok:true,serverTime:'2099-01-10T03:00:00Z',loggedInDrivers:2,recentDrivers:1,sessions:3,drivers:[{driverId:'SYN-1',name:'가상기사 하나',route:'5',shift:'B',sessions:2,lastSeenAt:Date.parse('2099-01-10T02:59:51Z'),state:'RECENT'},{driverId:'SYN-2',name:'가상기사 둘',route:'70',shift:'A',sessions:1,lastSeenAt:null,state:'UNKNOWN'}],traffic:{fiveMinutes:{available:true,requests:120,errors:3,errorPercent:2.5,averageMs:525,categories:{GPS:100,AUTH:10,HEARTBEAT:10}},hour:{available:true,requests:570}}};
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body class="manager-layout"><div class="app"><main class="content">${panel}</main></div><script>
let authToken='SYNTHETIC',currentIsManager=true,managerPage='MONITOR',calls=[],pending=[],timers=[];
const el=(tag,text='',classes='')=>{const node=document.createElement(tag);node.textContent=text;node.className=classes;return node;};
const normalizedRoute=value=>String(value||'').replace(/번$/,'');
const apiErrorMessage=(error,fallback)=>fallback;
const apiPost=body=>{calls.push(body);return new Promise((resolve,reject)=>pending.push({resolve,reject}));};
const showLoginScreen=()=>{authToken='';stopPresenceMonitor();};
window.setInterval=(fn,ms)=>{timers.push({fn,ms});return timers.length;};window.clearInterval=()=>{};
${code}
</script>`;
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
  try{
    for(const [width,height] of [[320,568],[360,640],[412,824],[1280,800]]){
      const page=await browser.newPage({viewport:{width,height}});await page.setContent(fixture);
      await page.evaluate(data=>{operationsMonitorData=data;renderOperationsMonitor(data);},data);
      let metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,rows:document.querySelectorAll('.monitor-driver').length,refresh:document.getElementById('operationsMonitorRefresh').getBoundingClientRect().height}));
      assert.equal(metrics.overflow,false,'no horizontal overflow at '+width);assert.equal(metrics.rows,2);assert.ok(metrics.refresh>=44);
      assert.match(await page.locator('#operationsMonitorSummary').innerText(),/2명/);
      await page.locator('#operationsMonitorRoute').selectOption('70');assert.equal(await page.locator('.monitor-driver').count(),1);assert.match(await page.locator('#operationsMonitorDrivers').innerText(),/미확인/);
      await page.locator('#operationsMonitorRoute').selectOption('ALL');
      await page.screenshot({path:`${output}/monitor-${width}x${height}.png`});
      await page.evaluate(()=>{loadOperationsMonitor();loadOperationsMonitor();});assert.equal(await page.evaluate(()=>calls.length),1,'overlapping polling suppressed');
      await page.evaluate(()=>pending.shift().reject(Error('SYNTHETIC connection failed')));
      assert.match(await page.locator('#operationsMonitorStatus').innerText(),/현재 접속 상태 확인 불가/);
      assert.equal(await page.locator('.monitor-driver').count(),0,'failure clears misleading stale list');
      assert.equal(await page.locator('.monitor-stat').count(),0,'failure clears stale counts');
      await page.evaluate(()=>loadOperationsMonitor());await page.evaluate(data=>pending.shift().resolve(data),data);
      assert.equal(await page.locator('.monitor-driver').count(),2,'manual retry recovers');
      await page.evaluate(()=>{loadOperationsMonitor();authToken='NEW-SYNTHETIC';stopPresenceMonitor();});await page.evaluate(data=>pending.shift().resolve(data),data);
      assert.equal(await page.locator('.monitor-driver').count(),0,'late response cannot leak previous account data');
      await page.evaluate(()=>{currentIsManager=false;managerPage='HOME';lastPresenceRequestAt=Date.now();presenceMonitorTick();});
      assert.equal(await page.evaluate(()=>calls.length),3,'ordinary API traffic avoids redundant heartbeat');
      await page.evaluate(()=>{lastPresenceRequestAt=0;presenceMonitorTick();presenceMonitorTick();});assert.equal(await page.evaluate(()=>calls.length),4,'heartbeat sent only once while pending');
      assert.equal(await page.evaluate(()=>calls.at(-1).operation),'presenceHeartbeat');
      await page.evaluate(()=>pending.shift().resolve({ok:true}));
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});presenceMonitorTick();});assert.equal(await page.evaluate(()=>calls.length),4,'hidden screen does not poll');
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});authToken='';presenceMonitorTick();loadOperationsMonitor();});assert.equal(await page.evaluate(()=>calls.length),4,'logged out screen does not poll');
      await page.evaluate(()=>{startPresenceMonitor();});assert.equal(await page.evaluate(()=>timers.at(-1).ms),60000);
      console.log('Monitor viewport and lifecycle passed: '+JSON.stringify({width,height,...metrics}));await page.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
