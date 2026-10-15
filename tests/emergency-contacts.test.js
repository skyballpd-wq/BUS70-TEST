const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const html=fs.readFileSync('index.html','utf8');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.value='';this.textContent='';}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  setAttribute(key,value){this.attributes[key]=value;}
}
const ids=Object.fromEntries(['driverDepotContacts','managerContactFields','driverContactStatus','managerContactStatus','managerContactsSave'].map(id=>[id,new Element('div')]));
const descendants=node=>[node,...node.children.flatMap(descendants)];
const context={console,authToken:'test-session',document:{getElementById:id=>ids[id]||descendants(ids.managerContactFields).find(n=>n.id===id)},el:(tag,text,cls)=>{const n=new Element(tag);n.textContent=text||'';n.className=cls;return n;}};
vm.createContext(context);
const source=html.slice(html.indexOf('  function depotContactPhones('),html.indexOf('  document.querySelectorAll("[data-manager-page]")'));
vm.runInContext('let depotContacts=[],depotContactsVersion=0,depotContactRequestId=0;'+source,context);
const contacts=Array.from({length:7},(_,i)=>({id:'C'+i,role:'시험 직책 '+i,name:i<4?'시험 담당자 '+i:'',phones:[`070-0000-000${i}`],note:i===1?'B조 아침 배차':i===5?'17시까지 근무':i===6?'24시간 근무':''}));
contacts[4].phones.push('070-0000-0014');contacts[6].phones.push('032-000-0006');
context.renderDepotContacts(contacts);
const cards=ids.driverDepotContacts.children;
assert.equal(cards.length,7);
const links=descendants(ids.driverDepotContacts).filter(n=>n.tag==='a');
assert.equal(links.length,9,'both telephone numbers remain separate tappable links');
assert.equal(links[5].href,'tel:07000000014');
assert.ok(links[0].attributes['aria-label'].includes('시험 담당자 0'));
assert.ok(descendants(cards[1]).some(n=>n.textContent==='B조 아침 배차'));
assert.ok(descendants(cards[6]).some(n=>n.textContent==='24시간 근무'));
assert.equal(context.document.getElementById('depotPhone6').value,'070-0000-0006\n032-000-0006');
context.renderDepotContacts([{role:'시험',phones:['javascript:alert(1)','1234567','010-0000-0000']}]);
assert.equal(descendants(ids.driverDepotContacts).filter(n=>n.tag==='a').length,1);
(async()=>{
  context.apiPost=async()=>({ok:true,contactsVersion:2,contacts});
  await context.loadDepotContacts();
  assert.equal(ids.managerContactsSave.disabled,false);
  context.document.getElementById('depotNote5').value='근무시간 변경';
  let posted;
  context.apiPost=async body=>{posted=body;return {ok:true,contactsVersion:2,contacts:body.contacts,message:'저장 완료'};};
  await context.saveDepotContacts();
  assert.equal(posted.contacts.length,7);assert.equal(posted.contacts[6].phones.length,2);assert.equal(posted.contacts[5].note,'근무시간 변경');
  context.apiPost=async()=>{throw new Error('offline');};
  await context.loadDepotContacts();
  assert.equal(ids.managerContactsSave.disabled,true);
  assert.match(ids.driverContactStatus.textContent,/불러오지 못했습니다/);
  assert.equal(ids.driverDepotContacts.children.length,0,'failed fetch must not show old contacts as current');
  let resolveRequest;
  context.apiPost=()=>new Promise(resolve=>{resolveRequest=resolve;});
  const pending=context.loadDepotContacts();context.authToken='different-session';resolveRequest({ok:true,contactsVersion:2,contacts});await pending;
  assert.equal(ids.driverDepotContacts.children.length,0,'responses for the previous login are ignored');
  console.log('Emergency contact cards, 9 phone links, editing, load failure and session race passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
