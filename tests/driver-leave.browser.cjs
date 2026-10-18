const fs=require('fs'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const html=fs.readFileSync('index.html','utf8'),css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
const functions=html.slice(html.indexOf('  function driverLeaveLabel('),html.indexOf('  async function confirmMySchedule('));
const output=process.env.CONTACT_LAYOUT_OUTPUT||'/tmp/bus70-leave-preview';fs.mkdirSync(output,{recursive:true});
function fixture(kind='DESIGNATED') {return `<!doctype html><meta charset="utf-8"><base href="https://bus70.test/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body class="driver-mode"><div class="app"><header><h1>BUS 5</h1></header><main class="content"><div class="row"><strong>테스트 기사님</strong></div><section id="scheduleResult"></section></main></div><input id="workDate" type="hidden" value="2099-01-10"><script>
let lastSchedule={ok:true,type:'REST',date:'2099-01-10',leaveContext:{available:true,date:'2099-01-10',shift:'B',groupStatus:'WORK',personalLeave:{kind:'${kind}',type:'휴무',startDate:'2099-01-10',endDate:'2099-01-${kind==='DESIGNATED'?'10':'12'}'},month:{key:'2099-01',groupRestDates:['2099-01-01','2099-01-03','2099-01-05','2099-01-07','2099-01-09','2099-01-11','2099-01-13','2099-01-15','2099-01-17','2099-01-19','2099-01-21','2099-01-23','2099-01-25','2099-01-27','2099-01-29','2099-01-31'],leaves:[]}}};
lastSchedule.leaveContext.month.leaves=[lastSchedule.leaveContext.personalLeave];
const scheduleForRequestedDate=x=>x,resetConfirmation=()=>{},stopDriverFleetTimer=()=>{},clearDriverAlarms=()=>{},calendarDateInSeoul=()=> '2099-01-10';
function el(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;}
${functions}
renderSchedule();</script>`;}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
  try {
    for(const width of [320,360,412]){
      const page=await browser.newPage({viewport:{width,height:740}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('https://bus70.test/icons/*',route=>route.fulfill({path:require('path').join(process.cwd(),'icons',new URL(route.request().url()).pathname.split('/').pop()),contentType:'image/png'}));
      await page.setContent(fixture());
      await page.locator('.mascot-stage img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode())));
      assert.deepEqual(errors,[]);
      assert.match(await page.locator('#scheduleResult').innerText(),/개인 지정휴무/);
      assert.equal(await page.locator('#scheduleResult button').count(),0);
      const metrics=await page.locator('.schedule-rest').evaluate(el=>({bottom:el.getBoundingClientRect().bottom,width:document.documentElement.scrollWidth,viewport:innerWidth,breaks:getComputedStyle(el).wordBreak}));
      assert.ok(metrics.bottom<740,'day reason and period fit on one screen');
      assert.ok(metrics.width<=metrics.viewport,'no horizontal scroll');
      assert.equal(metrics.breaks,'keep-all');
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await page.locator('.mascot-sprite').evaluate(el=>getComputedStyle(el).animationName),'none');
      await page.screenshot({path:`${output}/leave-${width}.png`});
      await page.locator('summary').click();
      assert.match(await page.locator('details').innerText(),/31일/);
      assert.match(await page.locator('details').innerText(),/2099-01-10 \(1일\)/);
      await page.goto('about:blank');await page.setContent(fixture('APPROVED_REQUEST'));
      assert.deepEqual(errors,[]);
      assert.match((await page.locator('#scheduleResult').innerText()).replace(/\s+/g,' '),/2099-01-10 ~ 2099-01-12/);
      await page.locator('.schedule-rest').evaluate(root=>{
        const elements=[root,...root.querySelectorAll('*')];
        const sizes=elements.map(el=>parseFloat(getComputedStyle(el).fontSize));
        elements.forEach((el,i)=>el.style.fontSize=sizes[i]*1.5+'px');
      });
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'150% text has no horizontal overflow');
      const dates=await page.locator('.period-date').evaluateAll(nodes=>nodes.map(el=>({h:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight),whiteSpace:getComputedStyle(el).whiteSpace})));
      dates.forEach(x=>{assert.equal(x.whiteSpace,'nowrap');assert.ok(x.h<=x.line+1,'date stays on one line');});
      await page.screenshot({path:`${output}/leave-${width}-large-text.png`,fullPage:true});
      await page.close();
    }
    console.log('Driver leave: compact 320/360/412px layout, Korean word wrapping, full dates at 150% text, transparent mascot and reduced motion passed');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
