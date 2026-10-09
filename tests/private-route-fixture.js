'use strict';

// Entirely synthetic data. Names, vehicle identifiers, dates, and times below
// are generated test fixtures and do not represent any person or operation.
function clock(minutes) {
  const value=((minutes%1440)+1440)%1440;
  return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
}

function route5Fixture() {
  const timings=Array.from({length:27},(_,index)=>{
    const sequence=index+1,tripCount=sequence===2||sequence===4?7:6;
    return Array.from({length:tripCount},(_,tripIndex)=>{
      if((sequence===2||sequence===4)&&tripIndex===0)return null;
      const start=240+sequence*4+tripIndex*180;
      if([1,3,5].includes(sequence)&&tripIndex===0)return ['',clock(start+60),clock(start+120)];
      return [clock(start),clock(start+60),clock(start+120)];
    });
  });
  return {
    serviceType:'합성 평일',shift:'B',scheduleVersion:'SYN-R5-V1',timetableSequences:27,
    sourceNote:'SYNTHETIC TEST FIXTURE',verificationStatus:'합성 테스트 자료',
    defaultOrigin:'가상차고지',turnPlace:'가상회차지',defaultEndPlace:'가상차고지',
    stops:['가상차고지','가상중간정류장','가상회차지'],
    assignments:Array.from({length:27},(_,index)=>index+1).filter(v=>v!==9).map(sequence=>[sequence,`가상5번기사${String(sequence).padStart(2,'0')}`,String(9000+sequence)]),
    tripTimings:timings,unassignedSequences:[9],
    operatingRules:{
      firstTripOrigins:{'1':'가상회차지','3':'가상회차지','5':'가상회차지'},
      firstScheduledTrips:{'1':1,'2':2,'3':1,'4':2,'5':1},
      finalServices:[{sequence:4,trip:7,type:'UPBOUND_LAST'},{sequence:23,trip:6,type:'ROUND_TRIP_LAST'}],
      handwrittenAdjustmentPolicy:{publishedTimeImmutable:true,applyOnlyWhenConfirmed:true}
    },
    serviceExceptions:{
      2:{7:{serviceEndType:'UPBOUND_ONLY',serviceRole:'SHORT_TURN_END',serviceEndPlace:'가상종점',deadheadDestination:'가상차고지',plannedEndTime:'00:00'}},
      4:{7:{serviceEndType:'UPBOUND_LAST',serviceRole:'FINAL_UPBOUND_LAST',finalService:true,serviceEndPlace:'가상종점',deadheadDestination:'가상차고지',plannedEndTime:'00:10'}},
      23:{6:{serviceEndType:'ROUND_TRIP_LAST',serviceRole:'FINAL_ROUND_TRIP_LAST',finalService:true,serviceEndPlace:'가상차고지'}},
      26:{6:{serviceEndType:'UPBOUND_ONLY',serviceRole:'SHORT_TURN_END',serviceEndPlace:'가상종점',deadheadDestination:'가상차고지',plannedEndTime:'23:42'}},
      27:{6:{serviceEndType:'UPBOUND_ONLY',serviceRole:'SHORT_TURN_END',serviceEndPlace:'가상종점',deadheadDestination:'가상차고지',plannedEndTime:'23:50'}}
    }
  };
}

function route5SaturdayFixture() {
  const timings=Array.from({length:19},(_,index)=>{
    const sequence=index+1,tripCount=sequence<=5?7:6;
    return Array.from({length:tripCount},(_,tripIndex)=>{
      if((sequence===2||sequence===4)&&tripIndex===0)return null;
      const start=247+sequence*7+tripIndex*190;
      if([1,3,5].includes(sequence)&&tripIndex===0)return ['',clock(start+61),clock(start+121)];
      return [clock(start),clock(start+61),clock(start+122)];
    });
  });
  return {
    serviceType:'합성 토요일',shift:'B',scheduleVersion:'SYN-R5-SAT-V1',timetableSequences:19,
    sourceNote:'SYNTHETIC TEST FIXTURE',verificationStatus:'합성 테스트 자료',
    defaultOrigin:'가상차고지',turnPlace:'가상회차지',defaultEndPlace:'가상차고지',
    stops:['가상차고지','가상중간정류장','가상회차지'],
    assignments:Array.from({length:19},(_,index)=>{const sequence=index+1;return [sequence,`가상5번토요기사${String(sequence).padStart(2,'0')}`,String(9200+sequence)];}),
    tripTimings:timings,
    operatingRules:{
      firstTripOrigins:{'1':'가상회차지','3':'가상회차지','5':'가상회차지'},
      firstScheduledTrips:{'1':1,'2':2,'3':1,'4':2,'5':1},
      finalServices:[{sequence:4,trip:7,type:'UPBOUND_LAST'},{sequence:15,trip:6,type:'ROUND_TRIP_LAST'}],
      handwrittenAdjustmentPolicy:{publishedTimeImmutable:true,applyOnlyWhenConfirmed:true}
    },
    serviceExceptions:{
      2:{7:{serviceEndType:'UPBOUND_ONLY',serviceRole:'SHORT_TURN_END',serviceEndPlace:'가상종점',deadheadDestination:'가상차고지'}},
      4:{7:{serviceEndType:'UPBOUND_LAST',serviceRole:'FINAL_UPBOUND_LAST',finalService:true,serviceEndPlace:'가상종점',deadheadDestination:'가상차고지'}},
      15:{6:{serviceEndType:'ROUND_TRIP_LAST',serviceRole:'FINAL_ROUND_TRIP_LAST',finalService:true,serviceEndPlace:'가상차고지'}},
      16:{6:{serviceEndType:'UPBOUND_ONLY',serviceRole:'SHORT_TURN_END',serviceEndPlace:'가상종점',deadheadDestination:'가상차고지'}},
      17:{6:{serviceEndType:'UPBOUND_ONLY',serviceRole:'SHORT_TURN_END',serviceEndPlace:'가상종점',deadheadDestination:'가상차고지'}},
      18:{6:{serviceEndType:'UPBOUND_ONLY',serviceRole:'SHORT_TURN_END',serviceEndPlace:'가상종점',deadheadDestination:'가상차고지'}},
      19:{6:{serviceEndType:'UPBOUND_ONLY',serviceRole:'SHORT_TURN_END',serviceEndPlace:'가상종점',deadheadDestination:'가상차고지'}}
    }
  };
}

function route70Fixture() {
  return {
    serviceType:'합성 평일',shift:'B',scheduleVersion:'SYN-R70-V1',timetableSequences:11,
    sourceNote:'SYNTHETIC TEST FIXTURE',verificationStatus:'합성 테스트 자료',
    defaultOrigin:'가상차고지',turnPlace:'가상회차지',defaultEndPlace:'가상차고지',
    stops:['가상차고지','가상70중간정류장','가상회차지'],
    assignments:Array.from({length:11},(_,index)=>{const sequence=index+1;return [sequence,`가상70번기사${String(sequence).padStart(2,'0')}`,String(9100+sequence)];}),
    timings:Array.from({length:11},(_,index)=>Array.from({length:5},(_,tripIndex)=>{const start=270+(index+1)*6+tripIndex*190;return [clock(start),clock(start+70),clock(start+140)];}))
  };
}

function route70SaturdayFixture() {
  return {
    serviceType:'합성 토·휴일',shift:'B',scheduleVersion:'SYN-R70-SAT-V1',timetableSequences:8,
    sourceNote:'SYNTHETIC TEST FIXTURE',verificationStatus:'합성 테스트 자료',
    defaultOrigin:'가상차고지',turnPlace:'가상회차지',defaultEndPlace:'가상차고지',
    stops:['가상차고지','가상70중간정류장','가상회차지'],
    assignments:Array.from({length:8},(_,index)=>{const sequence=index+1;return [sequence,`가상70번토요기사${String(sequence).padStart(2,'0')}`,String(9300+sequence)];}),
    timings:Array.from({length:8},(_,index)=>Array.from({length:5},(_,tripIndex)=>{
      const sequence=index+1,start=270+sequence*20+tripIndex*238;
      if(sequence===1&&tripIndex===0)return ['',clock(start+69),clock(start+139)];
      return [clock(start),clock(start+69),clock(start+139)];
    }))
  };
}

module.exports={
  config:{shiftAnchorDate:'2099-01-08',shiftAnchor:'B',driverOnlyIds:['DRV-B-TEST-002']},
  '5':{'2099-01-08':route5Fixture(),'2099-01-10':route5SaturdayFixture()},
  '70':{'2099-01-08':route70Fixture(),'2099-01-10':route70SaturdayFixture()}
};
