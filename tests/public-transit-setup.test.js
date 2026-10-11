const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

function setup(input,button='OK',fail=false) {
  const properties=new Map(Array.from({length:60},(_,i)=>['BUS70_AUTH_'+i,'session-'+i]));
  properties.set('BUS70_DATA_GO_KR_SERVICE_KEY','old-key');
  properties.set('BUS70_PUBLIC_ROUTE_API_CONFIG_JSON','existing-config');
  const before=new Map(properties),alerts=[];
  const ui={Button:{OK:'OK'},ButtonSet:{OK_CANCEL:'OK_CANCEL'},
    prompt:()=>({getSelectedButton:()=>button,getResponseText:()=>input}),alert:message=>alerts.push(message)};
  const context={SpreadsheetApp:{getUi:()=>ui},PropertiesService:{getScriptProperties:()=>({
    setProperty:(key,value)=>{if(fail)throw new Error(input);properties.set(key,value);},getProperty:key=>properties.get(key)
  })}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('apps-script/PublicTransitApi.gs','utf8'),context);
  context.BUS70_setupPublicDataKey();
  for(const [key,value] of before)if(key!=='BUS70_DATA_GO_KR_SERVICE_KEY')assert.equal(properties.get(key),value);
  assert.equal(properties.size,before.size);
  return {properties,alerts};
}

const success=setup('  synthetic%2Bsecret%3D  ');
assert.equal(success.properties.get('BUS70_DATA_GO_KR_SERVICE_KEY'),'synthetic%2Bsecret%3D');
assert.match(success.alerts.join(' '),/저장 완료/);
assert.doesNotMatch(success.alerts.join(' '),/synthetic|old-key|session-/);
for(const [value,button] of [['new-key','CANCEL'],['new-key','CLOSE'],['','OK'],['key\nother','OK'],['https://example.test/key','OK']]) {
  assert.equal(setup(value,button).properties.get('BUS70_DATA_GO_KR_SERVICE_KEY'),'old-key');
}
const failed=setup('synthetic-secret','OK',true);
assert.equal(failed.properties.get('BUS70_DATA_GO_KR_SERVICE_KEY'),'old-key');
assert.match(failed.alerts.join(' '),/확인하지 못했습니다/);
assert.doesNotMatch(failed.alerts.join(' '),/synthetic-secret/);
console.log('Public transit setup preserves sessions and protects key output');
