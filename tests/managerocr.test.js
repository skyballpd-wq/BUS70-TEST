const assert = require("assert");
require("../manager-ocr.js");

const drivers=[{id:"D1",name:"김순식"},{id:"D2",name:"박철완"},{id:"D3",name:"이성준"}];
const vehicles=[{id:"V1",last3:"609"},{id:"V2",last3:"499"},{id:"V3",last3:"505"}];
const result=globalThis.Bus70Ocr.suggest(
  "김순식 1609 박철완 경기71아1499 이성준 1505",
  "05:20 06:05 06:45",
  [1,2,3],drivers,vehicles,{1:{time:"05:20"},2:{time:"06:05"},3:{time:"06:45"}}
);
assert.deepEqual(result.map(v=>v.driverId),["D1","D2","D3"]);
assert.deepEqual(result.map(v=>v.vehicleId),["V1","V2","V3"]);
assert.equal(result.every(v=>v.timeMatched),true);

const partial=globalThis.Bus70Ocr.suggest("박철완 1499","06:05",[1,2],drivers,vehicles,{1:{time:"05:20"},2:{time:"06:05"}});
assert.equal(partial[0].driverId,"D2");
assert.equal(partial[1].driverMatched,false);
assert.equal(partial[0].vehicleId,"V2");

const verified=globalThis.Bus70Ocr.verify(
  "김순삭 1609 박철완 경기71아1499 이성준 1505",
  "05:20 06:05 06:45",
  [{sequence:1,driverId:"D1",vehicleId:"V1"},{sequence:2,driverId:"D2",vehicleId:"V2"},{sequence:3,driverId:"D3",vehicleId:"V3"}],
  drivers,vehicles,{1:{time:"05:20"},2:{time:"06:05"},3:{time:"06:45"}}
);
assert.equal(verified.every(v=>v.driverMatched && v.vehicleMatched && v.timeMatched),true);
console.log("Manager OCR tests passed");
