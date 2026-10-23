/* iOS advisory parity with Android EarlyArrivalPolicy. No writes to actual times. */
(function(root){
'use strict';
const gps=typeof module==='object'?require('../../driver-automation'):root.Bus70Automation;
const gates={'5':'212000105','70':'115000108','23':'115000051'};
const message='차고지에 예정 시각보다 10분 이상 일찍 도착할 것으로 예상됩니다. 배차 시간을 확인하고 안전하게 운행하세요.';
function update(s,t,n,binding,route,planned,p,now){
 const fix=p.timestamp,c=p.coords,station=gates[route]||'',stops=t.course?.stops;
 const key=[route,station,binding,t.trip,planned,t.actualStart].join('|');
 if(s.key!==key){for(const k of Object.keys(s))delete s[k];s.key=key;}
 const out={available:false,timestamp:fix,trip:t.trip,plannedAt:planned,warning:false,notify:false};
 const reset=()=>{delete s.samples;delete s.candidate;};
 const fail=reason=>{reset();delete s.lastEstimate;return {...out,reason};};
 const end=String(t.endPlace||'').replace(/\s/g,'');
 const depot=end.includes('고강')&&end.endsWith('차고지')&&(!t.deadheadDestination||t.deadheadDestination===t.endPlace);
 if(!station||!depot||!t.actualStart||t.actualEnd||!Number.isFinite(planned)||!n?.configured||n.waiting||!(n.returnConfirmed||t.actualTurn)||n.timestamp!==fix||now-fix < -5000||now-fix>10000||c.accuracy<0||c.accuracy>40||!stops||stops.length<3)return fail('최신 하행 위치·운행계획 확인 중');
 out.route=route;out.gateStationId=station;
 if(!gps.validPoint(t.endLocation)||!stops.every(gps.validPoint)||gps.distance(stops.at(-1),t.endLocation)>100)return fail('차고지·정류장 좌표 확인 필요');
 const positions=[0];let gate=-1;
 stops.forEach((stop,i)=>{if(i)positions[i]=positions[i-1]+gps.distance(stops[i-1],stop);if(stop.stationId===station||stop.id===station||String(stop.id).endsWith('-'+station))gate=i;});
 const meters=n.matchedMeters,fraction=n.fraction,segment=Math.floor(fraction),remaining=positions.at(-1)-meters;
 if(!Number.isFinite(fraction)||segment<0||segment>=stops.length-1)return fail('노선 위치 확인 중');
 const a=stops[segment],b=stops[segment+1],part=fraction-segment,here={lat:c.latitude,lng:c.longitude};
 if(gps.distance(here,{lat:a.lat+(b.lat-a.lat)*part,lng:a.lng+(b.lng-a.lng)*part})>Math.max(60,c.accuracy*2))return fail('노선 위치 확인 중');
 const pivot=t.course.pivotIndex>=0?t.course.pivotIndex:t.course.turnIndex;
 if(!(pivot>=0&&gate>pivot&&gate<stops.length-2))return fail('하행 경고 기준점 확인 필요');
 if(!Number.isFinite(remaining)||meters<0||remaining<=0||gps.distance(here,t.endLocation)<=80)return fail('차고지 도착 구간 · 안내 종료');
 let samples=s.samples||[],previous=samples.at(-1);
 if(previous&&(fix-previous.at>30000||fix<previous.at||meters<previous.meters-50||meters-previous.meters>Math.max(80,(fix-previous.at)*.025+c.accuracy*2))){samples=[];delete s.candidate;delete s.lastEstimate;previous=null;}
 if(!previous||fix-previous.at>=5000)samples.push({at:fix,meters});
 while(samples.length>1&&fix-samples[0].at>300000)samples.shift();s.samples=samples;out.remainingM=Math.round(remaining);
 const held=reason=>{const old=s.lastEstimate;if(old&&now>=old.estimateAt&&now-old.estimateAt<=60000&&old.latestAt>now)Object.assign(out,{available:true,retained:true,estimateAt:old.estimateAt,predictedAt:old.predictedAt,latestAt:old.latestAt});return {...out,reason};};
 const first=samples[0];let recent=first;
 if(!first||fix-first.at<120000)return held('최근 이동 자료 수집 중');
 for(const item of samples)if(fix-item.at>=60000)recent=item;
 const travel=meters-first.meters,recentTravel=meters-recent.meters,rate=Math.min(travel/((fix-first.at)/1000),recentTravel/((fix-recent.at)/1000));
 if(travel<250||recentTravel<100||!Number.isFinite(rate)||rate<2||rate>22.22)return held('정차·이동 자료 추가 확인 중');
 const duration=Math.ceil(remaining/rate*1000),predicted=now+duration,latest=predicted+Math.max(120000,Math.ceil(duration*.25)),early=(planned-latest)/60000;
 Object.assign(out,{available:true,estimateAt:now,predictedAt:predicted,latestAt:latest,earlyMinutes:early});s.lastEstimate={...out};
 if(fraction<=gate+.15||meters<=positions[gate]+40){delete s.candidate;return {...out,reason:'하행 기준점 통과 후 정류장별 판단'};}
 let checkpoint=-1,closest=Infinity;
 for(let i=gate+1;i<stops.length-1;i++){const d=gps.distance(here,stops[i]);if(d<=50&&Math.abs(fraction-i)<=.35&&d<closest){checkpoint=i;closest=d;}}
 if(checkpoint<0){delete s.candidate;return {...out,reason:'다음 정류장 도착 시 확인'};}
 out.stopIndex=checkpoint;out.stopName=stops[checkpoint].name;
 let candidate=s.candidate;
 if(!candidate||candidate.index!==checkpoint||fix-candidate.lastAt>15000||fix<candidate.lastAt)candidate={index:checkpoint,since:fix};
 candidate.lastAt=fix;s.candidate=candidate;
 if(fix-candidate.since<1500)return {...out,reason:'정류장 도착 위치 확인 중'};
 const risk=early>=10,unchecked=checkpoint>(s.checkedIndex??-1),due=risk&&unchecked&&(s.attemptIndex!==checkpoint||now-(s.lastAttemptAt||0)>=5000);
 if(!risk)s.checkedIndex=Math.max(checkpoint,s.checkedIndex??-1);
 return {...out,warning:risk,notify:due,message:risk?message:'',reason:'최근 2~5분 이동·정차 기준 추정'};
}
function attempted(s,r,now,accepted){s.lastAttemptAt=now;s.attemptIndex=r.stopIndex;if(accepted)s.checkedIndex=Math.max(r.stopIndex,s.checkedIndex??-1);}
const api={update,attempted,message};if(typeof module==='object')module.exports=api;else root.Bus70Arrival=api;
})(typeof globalThis==='object'?globalThis:this);
