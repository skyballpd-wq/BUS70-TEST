const fs = require('fs');
const cp = require('child_process');
const assert = require('assert');
const { chromium } = require('playwright');
const repo = process.cwd();
const output = process.env.CONTACT_LAYOUT_OUTPUT || require('os').tmpdir() + '/bus70-contact-layout';
fs.mkdirSync(output, {recursive:true});
const before = process.argv.includes('--before');
const html = before ? cp.execFileSync('git', ['show', (process.env.CONTACT_LAYOUT_BASE || 'origin/main') + ':index.html'], { cwd: repo, encoding: 'utf8' }) : fs.readFileSync(repo + '/index.html', 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const panel = html.slice(html.indexOf('      <div id="driverEmergencyPanel"'), html.indexOf('      <div id="alertSettings"'));
const render = html.slice(html.indexOf('  function depotContactPhones('), html.indexOf('  function depotContactStatus('));
const menu = html.slice(html.indexOf('  const DRIVER_MENU_TARGETS ='), html.indexOf('  function resetConfirmation('));
const element = html.slice(html.indexOf('  function el('), html.indexOf('  function actualTimeLabel('));
const contacts = [
  {role:'주간소장',name:'시험원',phones:['010-0000-0001']},
  {role:'A조야간소장',name:'시험원',phones:['010-0000-0002'],note:'B조 아침 배차'},
  {role:'B조야간소장',name:'시험원',phones:['010-0000-0003'],note:'A조 아침 배차'},
  {role:'사고처리담당',name:'시험원',phones:['010-0000-0004']},
  {role:'고강동영업소',phones:['070-0000-0005','070-0000-0006']},
  {role:'고강동정비소',phones:['070-0000-0007'],note:'17시까지 근무'},
  {role:'춘의동정비소',phones:['032-000-0008','070-0000-0009'],note:'24시간 근무'}
];
const fixture = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body class="driver-mode"><main><button data-driver-menu="EMERGENCY">긴급 연락 열기</button>${panel}<div id="managerContactFields" hidden></div></main><script>let currentRole='',depotContacts=[];const fixtureContacts=${JSON.stringify(contacts)};${element}${render}${menu}function loadDepotContacts(){renderDepotContacts(fixtureContacts)}document.querySelector('[data-driver-menu]').addEventListener('click',()=>toggleDriverWorkMenu('EMERGENCY'));</script>`;
if(process.argv.includes('--fixture-only')){fs.writeFileSync(`${output}/${before?'before':'after'}-fixture.html`,fixture);process.exit(0);}
(async () => {
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || undefined,args:['--no-sandbox']});
  const results=[];
  try {
  for (const [width,height] of [[320,568],[360,640],[390,700],[412,824],[1280,800]]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.setContent(fixture);
    await page.getByRole('button',{name:'긴급 연락 열기',exact:true}).click();
    const data=await page.evaluate(()=>{
      const panel=document.getElementById('driverEmergencyPanel');
      const links=[...panel.querySelectorAll('a')];
      return {width:innerWidth,height:innerHeight,scrollHeight:panel.scrollHeight,clientHeight:panel.clientHeight,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,linkCount:links.length,minTargetHeight:Math.min(...links.map(x=>x.getBoundingClientRect().height)),allVisible:links.every(x=>{const r=x.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth}),lastBottom:links.at(-1).getBoundingClientRect().bottom,phoneHrefs:links.map(x=>x.getAttribute('href'))};
    });
    await page.screenshot({path:`${output}/${before?'before':'after'}-${width}x${height}.png`});
    results.push(data);
    fs.writeFileSync(`${output}/${before?'before':'after'}-metrics.json`,JSON.stringify(results,null,2));
    if(!before){
      assert.equal(data.linkCount,11,'all 9 office phones plus 112 and 119 remain visible');
      assert.ok(data.scrollHeight<=data.clientHeight,`${width}x${height} requires vertical scroll: ${JSON.stringify(data)}`);
      assert.ok(data.scrollWidth<=data.clientWidth,`${width}x${height} requires horizontal scroll`);
      assert.ok(data.allVisible,`${width}x${height} has a phone below the screen`);
      assert.ok(data.minTargetHeight>=44,'telephone targets must stay at least 44px high');
      assert.ok(data.phoneHrefs.includes('tel:07000000006'),'second office telephone is retained');
      await page.getByRole('button',{name:'← 운행 화면',exact:true}).click();
      assert.ok(await page.locator('#driverEmergencyPanel').isHidden(),'return to driving screen still closes contacts');
    }
    await page.close();
  }
  } finally { await browser.close(); }
  fs.writeFileSync(`${output}/${before?'before':'after'}-metrics.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
