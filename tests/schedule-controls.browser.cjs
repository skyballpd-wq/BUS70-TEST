const fs=require('fs');
const assert=require('assert');
const {chromium}=require('playwright');
const html=fs.readFileSync('index.html','utf8');
const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
const start=html.indexOf('<details id="scheduleQueryOptions"');
const controls=html.slice(start,html.indexOf('</details>',start)+10);
const handlers=html.slice(html.indexOf('  document.getElementById("timeMode").addEventListener'),html.indexOf('  function resetBoardReview('));
const output=process.env.CONTACT_LAYOUT_OUTPUT||require('os').tmpdir()+'/bus70-schedule-controls';
fs.mkdirSync(output,{recursive:true});
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body class="driver-mode"><div class="app"><main class="content"><section id="schedulePanel" class="schedule-panel">${controls}</section></main></div><script>
let scheduleFollowToday=true,requests=[],renders=0,resets=0;
const calendarDateInSeoul=()=> '2099-01-10';
function resetScheduleView(){resets++}
function loadMySchedule(){requests.push(document.getElementById('workDate').value)}
function renderSchedule(){renders++}
document.getElementById('workDate').value=calendarDateInSeoul();
${handlers}
loadMySchedule();
</script>`;
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});
  const results=[];
  try{
    for(const [width,height] of [[320,568],[360,640],[412,824]]){
      const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
      await page.setContent(fixture);
      await page.getByText('날짜·시간 표시 변경',{exact:true}).click();
      const metrics=await page.evaluate(()=>{
        const date=document.getElementById('workDate').getBoundingClientRect();
        const mode=document.getElementById('timeMode').getBoundingClientRect();
        const root=document.getElementById('scheduleQueryOptions');
        return {width:innerWidth,topDifference:Math.abs(date.top-mode.top),dateWidth:date.width,modeWidth:mode.width,minTargetHeight:Math.min(date.height,mode.height),fits:date.left>=0&&mode.right<=innerWidth&&date.right<=mode.left,buttons:root.querySelectorAll('button').length,requests:[...requests]};
      });
      assert.ok(metrics.topDifference<=1,'date and time format must share one row');
      assert.ok(metrics.fits,'controls must not overflow or overlap on a narrow phone');
      assert.ok(metrics.modeWidth<metrics.dateWidth,'time format uses the smaller column');
      assert.ok(metrics.minTargetHeight>=44,'date and format remain easy to tap');
      assert.equal(metrics.buttons,0,'normal date controls have no redundant query buttons');
      assert.deepEqual(metrics.requests,['2099-01-10']);
      await page.locator('#workDate').fill('2099-01-09');
      let state=await page.evaluate(()=>({requests:[...requests],scheduleFollowToday,resets,renders}));
      assert.deepEqual(state.requests,['2099-01-10','2099-01-09'],'date selection loads the selected date once');
      assert.equal(state.scheduleFollowToday,false);
      assert.equal(state.resets,1);
      await page.locator('#timeMode').selectOption('12H');
      state=await page.evaluate(()=>({requests:[...requests],renders}));
      assert.equal(state.requests.length,2,'changing format must not fetch data');
      assert.equal(state.renders,1);
      await page.locator('#workDate').fill('2099-01-10');
      state=await page.evaluate(()=>({requests:[...requests],scheduleFollowToday}));
      assert.equal(state.requests.at(-1),'2099-01-10');
      assert.equal(state.requests.length,3);
      assert.equal(state.scheduleFollowToday,true,'selecting today restores automatic rollover');
      await page.screenshot({path:`${output}/schedule-controls-${width}x${height}.png`});
      results.push(metrics);await page.close();
    }
  }finally{await browser.close();}
  fs.writeFileSync(`${output}/schedule-controls-metrics.json`,JSON.stringify(results,null,2));
  console.log('Compact schedule controls, automatic date loading, local-only time format and today follow mode passed: '+JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1;});
