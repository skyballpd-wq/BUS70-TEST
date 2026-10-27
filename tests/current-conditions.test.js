const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),cockpit=require('../driver-cockpit');
const now=Date.parse('2099-01-08T10:10:00+09:00');
assert.equal(cockpit.weatherObservation({available:true,temperature:0,observedAt:'2099-01-08T10:00:00+09:00',provider:'기상청'},now),'기상청 · 10:00 관측');
for(const observedAt of ['2099-01-07T10:00:00+09:00','2099-01-08T11:00:00+09:00','invalid'])assert.match(cockpit.weatherObservation({available:true,temperature:12,observedAt},now),/수신 대기/);
assert.equal(cockpit.phaseDifference({deltaSeconds:-625,label:'−10분 25초 빠름',state:'early'},'GPS 자동',true).label,'−10:25');
assert.equal(cockpit.phaseDifference({deltaSeconds:4,label:'+4초 지연',state:'late'},'GPS 자동',true).suffix,'늦음');
assert.equal(cockpit.phaseDifference({deltaSeconds:240,label:'+4분 지연',state:'late'},'수동',true).label,'—');
const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('async function refreshCockpitWeather('),end=html.indexOf('\n  function cockpitPhaseTable(',start),calls=[];
class Clock extends Date{static now(){return now;}}
const context=vm.createContext({Date:Clock,Bus70Cockpit:cockpit,currentDriverId:'SYN',currentRoute:'5',cockpitWeatherBusy:false,authToken:'SYNTHETIC',currentRole:'',cockpitWeatherKey:'',cockpitWeatherAt:0,cockpitWeather:{},lastDriverPosition:{timestamp:now-3600000,coords:{latitude:37,longitude:127,accuracy:5}},isDisplayedTripLive:data=>data.live===true,document:{getElementById:()=>({value:'2099-01-08'})},apiPost:async body=>{calls.push(body);return {ok:true,weather:{available:true,temperature:0,observedAt:'2099-01-08T10:00:00+09:00'}};}});
vm.runInContext(html.slice(start,end),context);
(async()=>{
 for(const state of ['PAST','FUTURE','COMPLETED','OTHER_TRIP'])await context.refreshCockpitWeather({temporalState:state,route:'5',live:false});
 assert.equal(calls.length,0,'non-live trip views do not fetch current weather');
 await context.refreshCockpitWeather({temporalState:'CURRENT',route:'5',live:true});
 assert.equal(calls.length,1,'current operating trip requests current conditions');
 assert.equal(calls[0].date,'2099-01-08');
 assert.equal(calls[0].latitude,undefined,'old GPS is not reused as the current weather location');
 assert.equal(context.cockpitWeather.temperature,0);
 await context.refreshCockpitWeather({temporalState:'CURRENT',route:'5',live:true});
 assert.equal(calls.length,1,'timer refresh reuses the existing ten-minute request budget');
 console.log('Current weather limited to live trip, observation age, zero temperature, request budget and compact differences passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
