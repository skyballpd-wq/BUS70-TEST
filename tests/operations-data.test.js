const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
function harness(tables,authorized=true){
  const reads={},writes=[];
  const context={console,normalizeDate_:v=>String(v||'').match(/^\d{4}-\d{2}-\d{2}$/)?.[0]||'',bus70IsManager_:()=>authorized,SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>tables[name]?{getName:()=>name,getDataRange:()=>({getDisplayValues(){reads[name]=(reads[name]||0)+1;return tables[name].map(r=>r.slice());}}),getLastRow:()=>tables[name].length}:null})}};
  vm.createContext(context);for(const file of ['PrivateRouteStore','OperationsData'])vm.runInContext(fs.readFileSync('apps-script/'+file+'.gs','utf8'),context);
  context.BUS70_PARTITION_READS_={};return {context,reads,writes,run:(route='ALL',date='2099-01-08')=>JSON.parse(JSON.stringify(context.bus70DbOverview_({route,date},'SYN-MANAGER')))};
}
function fixture(){
  const tables={
    '노선마스터DB':[['routeId','노선명','사용여부','전착경고기준정류장ID','전착경고분'],['5','합성5','Y','G5',10],['70','합성70','Y','G70',10]],
    '기사DB':[['driverId','성명'],['D5','가상기사5'],['D70','가상기사70']],
    '차량DB':[['vehicleId','차량번호'],['V5','합성0005'],['V70','합성0070'],['REPLACE','합성대차']],
    '시간표버전DB':[['versionId','노선'],['P5','5'],['P70','70']],
    '운행일DB':[['serviceDayId','운행일','노선','근무조','시간표버전'],['DAY5','2099-01-08','5','B','P5'],['DAY70','2099-01-08','70','B','P70']],
    '배차DB':[['dispatchId','날짜','노선','근무조','순차','기사ID','차량ID','시간표버전','상태','운행일ID'],['A5','2099-01-08','5','B',1,'D5','REPLACE','P5','확정','DAY5'],['A70','2099-01-08','70','B',1,'D70','V70','P70','확정','DAY70']],
    '고정차량배정DB':[['assignmentId','노선','근무조','기사ID','차량ID','적용시작일','적용종료일','상태'],['F5','5','B','D5','V5','2099-01-01','2099-01-31','확정']]
  };
  for(const route of ['5','70']){
    const stops=[['stopId','노선','정류장순서','정류장명','위도','경도','방향','자료세트ID','외부정류장ID','적용시작','상태']];
    for(let i=1;i<=3;i++)stops.push(['S'+route+'-'+i,route,i,'합성정류장'+i,37+i/100,127,'회차→기점','SET'+route,i===2?'G'+route:'S'+i,'2099-01-01','사용']);
    tables['노선_'+route+'_정류장DB']=stops;
    tables['노선_'+route+'_배차스케줄DB_2099_01']=[['노선','운행일','시간표버전','근무조','순차','탕','개정번호','상태'],[route,'2099-01-08','P'+route,'B',1,2,0,'사용'],[route,'2099-01-08','P'+route,'B',1,2,1,'사용'],[route,'2099-01-08','P'+route,'B',1,7,0,'사용']];
  }
  return tables;
}
if(require.main===module){
  let h=harness(fixture()),r=h.run();assert.equal(r.issues.length,0);assert.equal(r.rows.length,2);assert.deepEqual(r.rows[0].tripNumbers,[2,7]);assert.deepEqual(r.rows[0].fixedVehicles,['합성0005']);assert.equal(r.rows[0].vehicleNo,'합성대차');assert.deepEqual(r.rows[1].fixedVehicles,[]);
  assert.equal(r.routes[0].planCount,2,'revisions do not add trips');assert.ok(Object.values(h.reads).every(n=>n===1),'one physical read per table');assert.equal(h.reads['스케줄'],undefined);
  h=harness(fixture());r=h.run('5');assert.equal(r.rows.length,1);assert.equal(h.reads['노선_70_정류장DB'],undefined);assert.equal(h.reads['노선_70_배차스케줄DB_2099_01'],undefined);
  h=harness(fixture());r=h.run('5','2099-01-09');assert.equal(r.rows.length,0);assert.equal(r.routes[0].planCount,0,'no previous-day fallback');
  h=harness(fixture(),false);assert.equal(h.run().error,'MANAGER_REQUIRED');assert.equal(Object.keys(h.reads).length,0,'permission checked before reading private data');
  const sparse=harness(fixture()).context.bus70DbObjects_([['id'],[],['A'],[''],['B']]);assert.equal(sparse[0]._row,3);assert.equal(sparse[1]._row,5,'blank rows must not shift physical write targets');
  for(const field of [5,6,7,9]){const t=fixture();t['배차DB'][1][field]='MISSING';r=harness(t).run('5');assert.ok(r.issues.some(i=>i.code==='DISPATCH_RELATION'));}
  const t=fixture();t['운행일DB'][1][2]='70';r=harness(t).run('5');assert.equal(r.rows[0].state,'확인 필요');
  const duplicate=fixture();duplicate['노선_5_배차스케줄DB_2099_01'].push(duplicate['노선_5_배차스케줄DB_2099_01'][2].slice());r=harness(duplicate).run('5');assert.ok(r.issues.some(i=>i.code==='DUPLICATE_REVISION'));assert.deepEqual(r.rows[0].tripNumbers,[7]);
  const large=fixture();for(let i=0;i<700;i++)large['기사DB'].push(['SYN-'+i,'합성기사'+i]);h=harness(large);h.run();assert.ok(Object.values(h.reads).every(n=>n===1));
  console.log('Normalized joins, route/day/version isolation, permissions, fixed vs replacement, missing links, revision conflicts and bounded per-request reads passed.');
}
module.exports={harness,fixture};
