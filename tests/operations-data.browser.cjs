const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const {harness,fixture}=require('./operations-data.test');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});try{
 for(const width of [320,412,1280]){
  const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='https://synthetic.test')return r.abort();const file=decodeURIComponent(u.pathname).replace(/^\//,'')||'index.html';if(file.includes('..')||!fs.existsSync(file))return r.fulfill({status:404,body:''});return r.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(file)});});
  await page.goto('https://synthetic.test/');const data=harness(fixture()).run();
  await page.evaluate(data=>{
   document.querySelectorAll('body > main > section, main > section').forEach(x=>x.hidden=true);
   const panel=document.getElementById('operationsDataPanel');panel.closest('section').hidden=false;
   authToken='SYNTHETIC-A';currentRole='MANAGER';document.getElementById('managerDate').value=data.date;document.getElementById('managerRoute').value=data.route;
   window.testOverview=data;window.overviewCalls=0;apiPost=async()=>{window.overviewCalls++;return window.testOverview;};
  },data);
  assert.equal(await page.evaluate(()=>window.overviewCalls),0,'closed menu adds no request');
  await page.locator('#operationsDataPanel summary').first().click();await page.waitForSelector('.operations-data-row');
  assert.equal(await page.locator('.operations-data-row').count(),2);assert.match(await page.locator('#operationsDataView').innerText(),/미등록/);assert.match(await page.locator('#operationsDataView').innerText(),/합성대차/);
  assert.equal(await page.evaluate(()=>document.getElementById('operationsDataView').scrollWidth<=document.getElementById('operationsDataView').clientWidth+1),true,'no panel horizontal overflow');
  const out=process.env.CONTACT_LAYOUT_OUTPUT;if(out){fs.mkdirSync(out,{recursive:true});await page.locator('#operationsDataPanel').screenshot({path:path.join(out,`operations-data-${width}.png`)});}
  await page.evaluate(async()=>{apiPost=async()=>({ok:false,error:'UNKNOWN_ACTION'});await loadOperationsData();});assert.match(await page.locator('#operationsDataView').innerText(),/서버 적용이 필요/);
  await page.evaluate(async()=>{apiPost=async()=>({...window.testOverview,route:'70'});await loadOperationsData();});assert.match(await page.locator('#operationsDataView').innerText(),/다른 응답/);
  await page.evaluate(()=>{apiPost=()=>new Promise(resolve=>window.resolveOverview=resolve);loadOperationsData();authToken='SYNTHETIC-B';window.resolveOverview(window.testOverview);});
  assert.equal(await page.locator('.operations-data-row').count(),0,'previous account response blocked');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('320/412/1280: lazy overview, fixed/replacement separation, layout containment, old server notice, wrong scope and previous-account response rejection passed.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
