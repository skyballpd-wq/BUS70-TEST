const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const now=Date.parse('2099-01-08T17:01:00+09:00');
// SKY forecasting has an independent failure path and cannot fabricate a sky state.
let weatherPayload={response:{header:{resultCode:'00'},body:{items:{item:[{category:'SKY',fcstDate:'20990108',fcstTime:'1700',fcstValue:'3'}]}}}};
const c=vm.createContext({Date,JSON,Math,Number,String,Array,Object,Utilities:{formatDate:(d,tz,fmt)=>fmt==='yyyyMMdd'?'20990108':'16'},bus70PublicTransitQueryUrl_:(url,key,p)=>{assert.equal(p.base_time,'1630');assert(!('latitude' in p));return url;},UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify(weatherPayload)})}});
vm.runInContext(fs.readFileSync('apps-script/AuthStep9.gs','utf8'),c);
assert.equal(c.bus70WeatherSky_({nx:1,ny:1},'SYN',now).condition,'구름많음');assert.equal(c.bus70WeatherSky_({nx:1,ny:1},'SYN',now+7200000),null);
weatherPayload={response:{header:{resultCode:'30'}}};assert.equal(c.bus70WeatherSky_({nx:1,ny:1},'SYN',now),null);
console.log('Nearest-hour SKY, stale forecast and provider failure tests passed');
