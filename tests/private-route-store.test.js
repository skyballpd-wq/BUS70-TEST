const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const fixture = require('./private-route-fixture');

function makeSpreadsheet() {
  const sheets = {};
  function makeSheet(name) {
    return sheets[name] = {
      name,
      rows: [],
      frozenRows: 0,
      getName(){ return this.name; },
      getLastRow(){ return this.rows.length; },
      getDataRange(){ return {getDisplayValues:() => this.rows.map(row => row.slice())}; },
      getRange(row, col){
        const target = this;
        return {
          setValues(values){
            values.forEach((valuesRow, rowOffset) => {
              const rowIndex = row - 1 + rowOffset;
              while (target.rows.length <= rowIndex) target.rows.push([]);
              valuesRow.forEach((value, colOffset) => { target.rows[rowIndex][col - 1 + colOffset] = value; });
            });
          },
          setValue(value){
            while (target.rows.length < row) target.rows.push([]);
            target.rows[row - 1][col - 1] = value;
          }
        };
      },
      appendRow(row){ this.rows.push(row.slice()); },
      setFrozenRows(count){ this.frozenRows = count; }
    };
  }
  return {
    sheets,
    getSheetByName:name => sheets[name] || null,
    insertSheet:name => makeSheet(name)
  };
}

function loadContext({moduleData, propertyData, propertyOverrides = {}, spreadsheet} = {}) {
  const properties = Object.assign({}, propertyOverrides);
  if (propertyData) properties.BUS70_PRIVATE_ROUTE_DATA_JSON = JSON.stringify(propertyData);
  const context = {
    console, JSON, Object, Array, String,
    normalizeDate_: value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : '',
    PropertiesService:{getScriptProperties:() => ({getProperty:key => properties[key] || ''})}
  };
  if (spreadsheet) context.SpreadsheetApp = {getActiveSpreadsheet:() => spreadsheet};
  if (moduleData) context.BUS70_PRIVATE_ROUTE_DATA_ = moduleData;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('apps-script/PrivateRouteStore.gs','utf8'), context);
  return context;
}

const local = loadContext({moduleData:fixture});
const route = local.bus70PrivateRouteSource_('5','2099-01-08');
assert.equal(route.scheduleVersion,'SYN-R5-V1');
route.assignments[0][1] = '변경시도';
assert.notEqual(local.bus70PrivateRouteSource_('5','2099-01-08').assignments[0][1],'변경시도');
assert.deepEqual(JSON.parse(JSON.stringify(local.bus70PrivateConfig_())),{shiftAnchorDate:'2099-01-08',shiftAnchor:'B'});
assert.deepEqual(Array.from(local.bus70PrivateDriverOnlyIds_()),['DRV-B-TEST-002']);
const profile = local.bus70PrivateRouteProfile_('5', route);
assert.equal(profile.route,'5');
assert.equal(profile.stopCount,3);
assert.equal(profile.stops[0].id,'5-STOP-001');
assert.equal(profile.stops[1].name,'가상중간정류장');
assert.equal(profile.boardAvailable,true);
assert.equal(profile.timetableAvailable,true);
assert.equal(local.bus70PrivateRouteStatus_().source,'LOCAL_PRIVATE_MODULE');
assert.deepEqual(Array.from(local.bus70PrivateRouteStatus_().routes['5']),['2099-01-08','2099-01-10']);
assert.deepEqual(Array.from(local.bus70PrivateRouteStatus_().routes['70']),['2099-01-08','2099-01-10']);
const normalized=local.bus70PrivateNormalizeTrips_([{sequence:2,trip:7,startTime:'10:00'},{sequence:2,trip:2,startTime:'05:00'},{sequence:2,trip:2,startTime:'중복'},{sequence:2,trip:0,startTime:'04:00'}]);
assert.deepEqual(JSON.parse(JSON.stringify(normalized.map(v=>v.trip))),[2,7]);
assert.deepEqual(JSON.parse(JSON.stringify(local.bus70PrivateTripNumbersBySequence_(normalized))),{'2':[2,7]});
assert.equal(local.bus70ServiceClassForDate_('2026-10-08'),'WEEKDAY');
assert.equal(local.bus70ServiceClassForDate_('2026-10-10'),'SATURDAY');
assert.equal(local.bus70ServiceClassForDate_('2026-10-11'),'SUNDAY_HOLIDAY');
assert.equal(local.bus70ServiceClassForDate_('2026-10-10','합성 토요일'),'SATURDAY');
assert.equal(local.bus70ServiceClassForDate_('2026-10-10','토·휴일'),'SATURDAY');
assert.equal(local.bus70ServiceClassForDate_('2026-10-08','휴일·공휴일'),'SUNDAY_HOLIDAY');

const leaveFixture=JSON.parse(JSON.stringify(fixture));leaveFixture.config.plannedLeaves=[
  {route:'5',shift:'B',driverName:'가상휴무기사',aliases:['가상별칭기사'],type:'휴무',dates:['2099-01-08','2099-01-10'],source:'SYNTHETIC LEAVE PLAN'},
  {route:'5',shift:'B',driverName:'가상휴직기사',type:'휴직',startDate:'2099-01-07',endDate:'2099-01-09',source:'SYNTHETIC LEAVE RANGE'}
];
const leaveSpreadsheet=makeSpreadsheet(),leaveContext=loadContext({moduleData:leaveFixture,spreadsheet:leaveSpreadsheet}),leaveSync=leaveContext.bus70SyncPrivatePlannedLeaves_(leaveSpreadsheet);
assert.equal(leaveSync.ok,true);assert.equal(leaveSync.added,5);assert.equal(leaveContext.bus70SyncPrivatePlannedLeaves_(leaveSpreadsheet).added,0);assert.equal(leaveSpreadsheet.getSheetByName('기사휴무계획DB').rows.length,6);
const leaveOn8=leaveContext.bus70PlannedLeavesForDate_(leaveSpreadsheet,'5','2099-01-08');assert.equal(leaveOn8.length,2);assert.equal(leaveOn8.find(v=>v.driverName==='가상휴무기사').aliases[0],'가상별칭기사');assert.equal(leaveOn8.find(v=>v.driverName==='가상휴직기사').type,'휴직');assert.equal(leaveContext.bus70PlannedLeavesForDate_(leaveSpreadsheet,'70','2099-01-08').length,0);

const spreadsheet = makeSpreadsheet();
const partitioned = loadContext({moduleData:fixture, spreadsheet});
assert.deepEqual(JSON.parse(JSON.stringify(partitioned.bus70RoutePartitionNames_('5번'))),{
  route:'5',stops:'노선_5_정류장DB',schedule:'노선_5_배차스케줄DB'
});
assert.equal(partitioned.bus70EnsureRoutePartitions_(spreadsheet,'5').ok,true);
assert.ok(spreadsheet.getSheetByName('노선_5_정류장DB'));
assert.ok(spreadsheet.getSheetByName('노선_5_배차스케줄DB'));
assert.equal(spreadsheet.getSheetByName('노선_70_정류장DB'),null);

const route5Reference={
  ok:true,date:'2099-02-01',route:'5',shift:'B',serviceType:'합성 평일',scheduleVersion:'SYN-R5-DB-V1',sourceNote:'합성 노선자료',
  routeProfile:{stops:[
    {id:'5-SYN-001',name:'가상5기점',order:1,direction:'상행',lat:37.1,lng:126.8,origin:true},
    {id:'5-SYN-002',name:'가상5종점',order:2,direction:'상행',lat:37.2,lng:126.9,terminal:true}
  ]},
  trips:[
    {sequence:1,trip:1,startPlace:'가상5기점',startTime:'05:00',turnPlace:'가상5종점',turnTime:'05:30',endPlace:'가상5기점',endTime:'06:00'},
    {sequence:2,trip:2,startPlace:'가상5기점',startTime:'05:10',turnPlace:'가상5종점',turnTime:'05:40',endPlace:'가상5기점',endTime:'06:10'}
  ]
};
const firstSync=partitioned.bus70SyncRouteReferenceToDb_(spreadsheet,'5',route5Reference);
assert.equal(firstSync.ok,true);assert.equal(firstSync.stopAdded,2);assert.equal(firstSync.scheduleAdded,2);
const secondSync=partitioned.bus70SyncRouteReferenceToDb_(spreadsheet,'5',route5Reference);
assert.equal(secondSync.stopAdded,0);assert.equal(secondSync.scheduleAdded,0);
const storedStops5=partitioned.bus70RouteStopsFromDb_('5','2099-02-01');
assert.equal(storedStops5.sheetName,'노선_5_정류장DB');assert.equal(storedStops5.stops.length,2);assert.equal(storedStops5.stops[0].name,'가상5기점');
const stopSheet5=spreadsheet.getSheetByName('노선_5_정류장DB'),stopHeaders5=stopSheet5.rows[0],stopColumns5=Object.fromEntries(stopHeaders5.map((header,index)=>[header,index]));
const changedStop=new Array(stopHeaders5.length).fill('');
changedStop[stopColumns5.stopId]='5-SYN-001';changedStop[stopColumns5['노선']]='5';changedStop[stopColumns5['방향']]='상행';changedStop[stopColumns5['정류장순서']]=1;changedStop[stopColumns5['정류장명']]='가상5변경기점';changedStop[stopColumns5['위도']]=0;changedStop[stopColumns5['경도']]=0;changedStop[stopColumns5['적용시작']]='2099-03-01';changedStop[stopColumns5['상태']]='사용';stopSheet5.appendRow(changedStop);
assert.equal(partitioned.bus70RouteStopsFromDb_('5','2099-02-28').stops.find(stop=>stop.id==='5-SYN-001').name,'가상5기점');
const changedStops5=partitioned.bus70RouteStopsFromDb_('5','2099-03-01');
assert.equal(changedStops5.stops.length,2);assert.equal(changedStops5.stops.find(stop=>stop.id==='5-SYN-001').name,'가상5변경기점');assert.equal(changedStops5.stops.find(stop=>stop.id==='5-SYN-001').lat,0);
const storedSchedule5=partitioned.bus70RouteScheduleFromDb_('5','2099-02-01','SYN-R5-DB-V1');
assert.equal(storedSchedule5.available,true);assert.equal(storedSchedule5.trips.length,2);assert.deepEqual(JSON.parse(JSON.stringify(storedSchedule5.trips.map(item=>item.trip))),[1,2]);
assert.equal(storedSchedule5.serviceClass,'WEEKDAY');
const weekdayPattern=partitioned.bus70RouteSchedulePatternFromDb_('5','2099-02-02');
assert.equal(weekdayPattern.available,true);assert.equal(weekdayPattern.predicted,true);assert.equal(weekdayPattern.sourceDate,'2099-02-01');assert.equal(weekdayPattern.serviceClass,'WEEKDAY');assert.equal(weekdayPattern.trips.length,2);
const saturdayPattern=partitioned.bus70RouteSchedulePatternFromDb_('5','2099-02-07');
assert.equal(saturdayPattern.available,false);assert.equal(saturdayPattern.serviceClass,'SATURDAY');
const scheduleSheet5=spreadsheet.getSheetByName('노선_5_배차스케줄DB'),scheduleHeaders5=scheduleSheet5.rows[0],scheduleColumns5=Object.fromEntries(scheduleHeaders5.map((header,index)=>[header,index])),revisedTrip=scheduleSheet5.rows[1].slice();
revisedTrip[scheduleColumns5['발차시간']]='05:07';revisedTrip[scheduleColumns5['원본근거']]='합성 수기 확정';scheduleSheet5.appendRow(revisedTrip);
const revisedSchedule5=partitioned.bus70RouteScheduleFromDb_('5','2099-02-01','SYN-R5-DB-V1');
assert.equal(revisedSchedule5.trips.length,2);assert.equal(revisedSchedule5.trips.find(item=>item.sequence===1&&item.trip===1).startTime,'05:07');

const emptyStopSheet=spreadsheet.insertSheet('노선_88_정류장DB');
assert.equal(emptyStopSheet.rows.length,0);assert.equal(partitioned.bus70EnsureRoutePartitions_(spreadsheet,'88').ok,true);assert.equal(emptyStopSheet.rows[0][0],'stopId');assert.equal(emptyStopSheet.rows[0][1],'노선');

const route70Reference={ok:true,date:'2099-02-01',route:'70',shift:'B',serviceType:'합성 평일',scheduleVersion:'SYN-R70-DB-V1',sourceNote:'합성 노선자료',routeProfile:{stops:[{id:'70-SYN-001',name:'가상70기점',order:1,direction:'상행'}]},trips:[{sequence:1,trip:1,startPlace:'가상70기점',startTime:'04:30',endPlace:'가상70기점',endTime:'05:30'}]};
const route70Sync=partitioned.bus70SyncRouteReferenceToDb_(spreadsheet,'70',route70Reference);
assert.equal(route70Sync.ok,true);assert.equal(route70Sync.stopAdded,1);assert.equal(route70Sync.scheduleAdded,1);
assert.equal(partitioned.bus70RouteStopsFromDb_('70','2099-02-01').stops[0].name,'가상70기점');
assert.equal(partitioned.bus70RouteStopsFromDb_('5','2099-02-01').stops.length,2);
assert.equal(partitioned.bus70RouteScheduleFromDb_('70','2099-02-01').scheduleVersion,'SYN-R70-DB-V1');
assert.equal(partitioned.bus70RouteScheduleFromDb_('5','2099-02-01').scheduleVersion,'SYN-R5-DB-V1');
vm.runInContext(fs.readFileSync('apps-script/Route5Schedule.gs','utf8'),partitioned);
vm.runInContext(fs.readFileSync('apps-script/Route70Schedule.gs','utf8'),partitioned);
const dbOnly5=partitioned.bus70Route5ReferenceData_('2099-02-01');
assert.equal(dbOnly5.ok,true);assert.equal(dbOnly5.scheduleVersion,'SYN-R5-DB-V1');assert.equal(dbOnly5.trips.length,2);assert.equal(dbOnly5.trips[0].startTime,'05:07');
assert.equal(dbOnly5.routeProfile.storage.stopSource,'ROUTE_DB');assert.equal(dbOnly5.routeProfile.storage.scheduleSource,'ROUTE_DB');
assert.equal(partitioned.bus70Route5ReferenceData_('2099-02-02').error,'ROUTE_REFERENCE_NOT_CONFIGURED');
const predicted5=partitioned.bus70Route5ReferenceData_('2099-02-02',null,{allowPrediction:true});
assert.equal(predicted5.ok,true);assert.equal(predicted5.predicted,true);assert.equal(predicted5.predictionSourceDate,'2099-02-01');assert.equal(predicted5.verificationStatus,'소장 확정 전 예측 초안');
const dbOnly70=partitioned.bus70Route70ReferenceData_('2099-02-01');
assert.equal(dbOnly70.ok,true);assert.equal(dbOnly70.scheduleVersion,'SYN-R70-DB-V1');assert.equal(dbOnly70.trips.length,1);assert.equal(dbOnly70.trips[0].startTime,'04:30');
assert.equal(dbOnly70.routeProfile.storage.stopSheet,'노선_70_정류장DB');assert.equal(dbOnly70.routeProfile.storage.scheduleSheet,'노선_70_배차스케줄DB');

const property = loadContext({propertyData:fixture,propertyOverrides:{BUS70_SHIFT_ANCHOR_DATE:'2099-01-09',BUS70_SHIFT_ANCHOR_SHIFT:'A'}});
assert.equal(property.bus70PrivateRouteSource_('70','2099-01-08').scheduleVersion,'SYN-R70-V1');
assert.deepEqual(JSON.parse(JSON.stringify(property.bus70PrivateConfig_())),{shiftAnchorDate:'2099-01-09',shiftAnchor:'A'});
assert.equal(property.bus70PrivateRouteStatus_().source,'SCRIPT_PROPERTY');

const empty = loadContext();
assert.equal(empty.bus70PrivateRouteSource_('5','2099-01-08'),null);
assert.equal(empty.bus70PrivateConfig_(),null);
assert.equal(empty.bus70PrivateRouteStatus_().configured,false);

console.log('PrivateRouteStore tests passed');
