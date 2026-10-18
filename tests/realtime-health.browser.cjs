const fs=require('fs'),assert=require('assert'),{chromium}=require('playwright');
const html=fs.readFileSync('index.html','utf8'),css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
function section(name,next){return html.slice(html.indexOf('  function '+name+'('),html.indexOf('  function '+next+'('));}
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body class="driver-mode"><div class="app"><main class="content" id="test-root"></main></div><input id="workDate" type="hidden" value="2099-01-10">
<script>${fs.readFileSync('driver-recording.js','utf8')}</script><script>${fs.readFileSync('driver-cockpit.js','utf8')}</script><script>${fs.readFileSync('driver-automation.js','utf8')}</script><script>
const localStorage={getItem:()=>null};
const trip={trip:5,startTime:'10:00',startPlace:'합성기점',endPlace:'합성종점'},log={};
let lastSchedule={ok:true,temporalState:'CURRENT',route:'5',trips:[trip],dispatch:{seq:2},vehicle:{displayNo:'가상1234'},routeProfile:{stops:[]}},activeTripIndex=0,followCurrentTrip=true,currentRoute='5';
let nativeArrivalEstimate=null;
const driverAssignmentBinding=()=>({});
let context={trip,index:0,log,state:'출발 확인 중',action:'5탕 도착'};
let liveFleet={positions:[],crossCheck:{available:false,message:'차량정보 연결 확인 필요',error:'GBIS_HTTP_503'}},currentNavigation={waiting:true,configured:false,reason:'차량 출발 확인 중'};
let lastDriverPosition={coords:{latitude:37,longitude:127,accuracy:6,speed:6},timestamp:Date.now()};
let locationTrackingActive=true,locationPermissionState='granted',nativeLocationEnabled=true,locationStatusType='',locationStatusText='',nativeSyncError='',operationDataLoaded=false,scheduleRefreshedAt=0,scheduleRefreshError='',cockpitWeather={};
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const driverDisplayedContext=()=>context,isDisplayedTripLive=()=>lastSchedule.temporalState==='CURRENT',firstActiveTripIndex=()=>0,runLogForTrip=()=>log;
const driverLocationPreference=()=>'',gpsPendingCount=()=>0,refreshCockpitWeather=()=>{},routeNavigationState=()=>currentNavigation,matchingOpenIncidents=()=>[],hasNumericValue=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
const displayTime=v=>v,driverCountdownLabel=()=>'',actualMoment=()=>null,liveHeadwayLabel=()=>'',scheduleSequence=()=>2,hasNativeLocationBridge=()=>false,cockpitPhaseTable=()=>document.createElement('table');
${section('tripProgressValue','driverTripProgress')}
${section('liveDistanceLabel','liveHeadwayLabel')}
${section('updateDriverLiveDashboard','liveMetric')}
${section('renderDriverLiveDashboard','locationCoverage')}
// The fixture date is deliberately in the past relative to the test clock.
Bus70Automation.moment=()=>Date.now()-10000;
renderDriverLiveDashboard(document.getElementById('test-root'),lastSchedule);updateDriverLiveDashboard();
</script>`;
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined,args:['--no-sandbox']});try{
 for(const width of [320,360,412]){const page=await browser.newPage({viewport:{width,height:900}});let errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent(fixture);assert.deepEqual(errors,[]);
 assert.match(await page.locator('#driverLiveState').textContent(),/차량 확인 불가/);
 assert.match(await page.locator('#driverLiveSpeed').textContent(),/km\/h/,'fresh GPS speed stays visible during API outage');
 assert.match(await page.locator('#locationStatus').textContent(),/GPS 수신 중/);
 assert(!((await page.locator('#locationStatus').textContent()).includes('자동 운행기록 중')));
 assert.match(await page.locator('#driverTripProgressValue').textContent(),/진행률 미확인/);
 assert.equal(await page.locator('#driverTripProgressRing').getAttribute('aria-valuenow'),null);
 assert.match(await page.locator('#driverCrossCheckStatus').textContent(),/HTTP 503/);
 await page.evaluate(()=>{Bus70Automation.moment=()=>Date.now()+600000;updateDriverLiveDashboard();});
 assert.equal(await page.locator('#driverLiveSpeed').textContent(),'출발 대기','a future scheduled trip stays waiting');
 await page.evaluate(()=>{Bus70Automation.moment=()=>Date.now()-10000;liveFleet.crossCheck={available:true,fetchedAt:Date.now(),status:'AGREE'};updateDriverLiveDashboard();});
 assert(!((await page.locator('#driverLiveState').textContent()).includes('불가')),'recovered provider clears warning');
 await page.close();
 }
 console.log('320/360/412px actual dashboard renderer: API outage, GPS speed, unknown progress, future waiting and recovery passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
