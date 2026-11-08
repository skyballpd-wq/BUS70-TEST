/* Manager vehicle replacement. All dynamic strings are rendered as text. */
(function(){
  'use strict';
  let data=null,epoch=0,pending=null,session='',busy=false,mounted=false;
  const $=id=>document.getElementById('vr'+id),status=text=>{$('Status').textContent=text;};
  const call=(operation,body)=>apiPost({action:'managerAccountUpsert',token:authToken,operation,...body});
  function mount(){
    if(mounted)return;mounted=true;
    document.getElementById('replacementPanel').innerHTML=`
      <h2>차량 대차</h2>
      <p class="hint">배차된 차량을 다른 차량으로 바꿉니다. 선택한 날짜·순차의 전체 운행에 적용됩니다.</p>
      <fieldset id="vrFields"><legend>1. 적용할 배차</legend>
        <div class="vr-grid"><div><label for="vrDate">배차 적용일</label><input id="vrDate" type="date" required></div>
        <div><label for="vrRoute">운행 노선</label><select id="vrRoute"><option value="5">5번</option><option value="23">23번</option><option value="70">70번</option></select></div></div>
        <button id="vrLoad" type="button" class="secondary">확정 배차 불러오기</button>
        <label for="vrDispatch">변경할 순차 · 기사 · 원차</label><select id="vrDispatch"><option value="">배차를 먼저 불러오세요</option></select>
        <h3>2. 발생·통보 내용</h3>
        <div class="vr-grid"><div><label for="vrKind">시각 구분</label><select id="vrKind"><option value="통보">통보받은 시각</option><option value="발생">실제 발생한 시각</option></select></div>
        <div><label for="vrReported">발생·통보일시 (한국시간)</label><input id="vrReported" type="datetime-local" required></div></div>
        <p class="hint">통보받은 시각과 차량이 바뀌는 운행 날짜를 각각 입력하세요.</p>
        <label for="vrType">대차 구분</label><select id="vrType"><option value="고장">고장 · 정비 요청</option><option value="점검">점검 · 검사</option><option value="기타">기타 차량 변경</option></select>
        <label for="vrReason">상세 사유</label><textarea id="vrReason" rows="2" maxlength="500" placeholder="예: 에어펌프 고장, 공단검사" required></textarea>
        <h3>3. 대체 차량</h3>
        <label for="vrSearch">전체 노선 차량 검색</label><input id="vrSearch" type="search" inputmode="numeric" placeholder="차량번호 4자리 검색">
        <label for="vrVehicle">대체 차량 선택</label><select id="vrVehicle"><option value="">차량 선택</option></select>
        <p id="vrAvailability" class="hint" aria-live="polite">검색칸을 비우면 대차 가능한 전체 노선 차량과 예비차가 표시됩니다. 차량번호 4자리가 정확히 일치하면 자동 선택됩니다.</p>
        <details id="vrAdd"><summary>목록에 없는 차량 추가</summary>
          <p class="hint">등록하면 모든 노선에서 검색할 수 있습니다. 기존 차량의 소속 노선은 대차로 바뀌지 않습니다.</p>
          <div class="vr-grid"><div><label for="vrNewNo">차량번호 4자리</label><input id="vrNewNo" inputmode="numeric" maxlength="4" placeholder="4자리 입력"></div>
          <div><label for="vrNewRoute">소속 노선</label><select id="vrNewRoute"><option value="">선택</option><option value="5">5번</option><option value="23">23번</option><option value="70">70번</option></select></div>
          <div><label for="vrNewType">차량 구분</label><select id="vrNewType"><option value="">선택</option><option>일반</option><option>예비</option></select></div>
          <div><label for="vrNewStatus">현재 운행 상태</label><select id="vrNewStatus"><option value="">선택</option><option>운행가능</option><option>정비중</option><option>운행불가</option></select></div></div>
          <label class="vr-check"><input id="vrNewConfirm" type="checkbox">실제 차량번호·소속·운행 상태를 확인했습니다.</label>
          <button id="vrRegister" type="button" class="secondary">차량 등록</button><p id="vrRegisterStatus" role="status"></p>
        </details>
        <h3>4. 변경 내용 확인</h3><p id="vrPreview" class="vr-preview">배차와 대체 차량을 선택하세요.</p>
        <p class="hint">고장·점검은 원차 정비 내역에 연결됩니다. 정비 완료는 차량·정비에서 별도로 처리합니다.</p>
        <label class="vr-check"><input id="vrConfirm" type="checkbox">적용일·순차·대체 차량과 사유를 확인했습니다.</label>
      </fieldset>
      <button id="vrSave" type="button">대차 저장 · 배차 반영</button>
      <p id="vrStatus" role="status" aria-live="polite"></p>
      <button id="vrDispatchLink" type="button" class="secondary">배차·시간표에서 확인</button>
      <details><summary>선택 날짜의 대차 이력</summary><div id="vrHistory"></div></details>`;
    $('Load').addEventListener('click',()=>load());
    ['Date','Route'].forEach(id=>$(id).addEventListener('change',()=>{epoch++;data=null;pending=null;$('Confirm').checked=false;clearLists();preview();status('날짜·노선이 바뀌었습니다. 확정 배차를 불러오세요.');}));
    $('Fields').addEventListener('input',e=>{if(e.target!==$('Confirm'))$('Confirm').checked=false;preview();});
    $('Dispatch').addEventListener('change',()=>{renderVehicles();preview();});
    $('Search').addEventListener('input',()=>{renderVehicles();preview();});
    $('Save').addEventListener('click',save);$('Register').addEventListener('click',register);
    $('DispatchLink').addEventListener('click',()=>{
      if(busy||pending)return;
      document.getElementById('managerDate').value=$('Date').value;document.getElementById('managerRoute').value=$('Route').value;
      managerData=null;invalidateManagerRequest();refreshManagerContext();showManagerPage('DISPATCH');
    });
  }
  function clearLists(){$('Dispatch').replaceChildren(new Option('배차를 먼저 불러오세요',''));$('Vehicle').replaceChildren(new Option('차량 선택',''));$('History').replaceChildren();$('Availability').textContent='확정 배차를 불러오면 대차 가능한 차량을 확인할 수 있습니다.';}
  function vehicle(id){return data?.vehicles.find(v=>v.id===id);}
  function selected(){return data?.assignments.find(a=>a.id===$('Dispatch').value);}
  function vehicleLabel(v){return v?v.no+'호 · '+v.route+'번 소속 · '+v.type:'차량 미등록';}
  function unavailable(v){if(v.id===selected()?.vehicleId)return '원차';if(v.unavailable?.length)return v.unavailable.join(' · ');if(v.assignments?.length)return v.assignments.map(a=>a.route+'번 '+a.sequence+'순차 배차됨').join(' · ');return '';}
  function renderVehicles(){
    const prior=$('Vehicle').value,term=$('Search').value.trim();$('Vehicle').replaceChildren(new Option('대체 차량 선택',''));
    const matches=(data?.vehicles||[]).filter(v=>term?String(v.no).includes(term):!unavailable(v)).sort((a,b)=>String(a.no).localeCompare(String(b.no)));
    matches.forEach(v=>{const reason=unavailable(v),option=new Option(vehicleLabel(v)+(reason?' · '+reason:''),v.id);option.disabled=Boolean(reason);$('Vehicle').add(option);});
    if([...$('Vehicle').options].some(o=>o.value===prior&&!o.disabled))$('Vehicle').value=prior;
    const exact=/^\d{4}$/.test(term)?matches.filter(v=>String(v.no)===term):[];
    if(exact.length===1&&!unavailable(exact[0])){
      $('Vehicle').value=exact[0].id;$('Availability').textContent=vehicleLabel(exact[0])+'를 자동 선택했습니다. 변경 내용을 확인한 뒤 저장하세요.';
    }else if(exact.length===1){
      $('Availability').textContent=term+'호는 선택할 수 없습니다: '+unavailable(exact[0]);
    }else if(exact.length>1){
      $('Vehicle').value='';$('Availability').textContent='같은 번호의 차량이 여러 건입니다. 소속과 차량 정보를 확인하여 직접 선택하세요.';
    }else if(term&&!matches.length){
      $('Availability').textContent='일치하는 차량이 없습니다. 번호를 확인하거나 「목록에 없는 차량 추가」에서 등록하세요.';
    }else{
      $('Availability').textContent=term?'검색 결과에서 차량을 선택하세요. 차량번호 4자리가 정확히 일치하면 자동 선택됩니다.':`대차 가능한 차량 ${matches.length}대가 표시됩니다. 전체 노선 차량과 예비차 중에서 선택하세요.`;
    }
  }
  function preview(){
    const a=selected(),v=vehicle($('Vehicle').value);
    $('Preview').textContent=a&&v?`${$('Date').value} · ${$('Route').value}번 ${a.sequence}순차 (${a.shift}조 ${a.driverName})\n${vehicle(a.vehicleId)?.no||a.vehicleId}호 → ${v.no}호\n${$('Kind').value}: ${$('Reported').value.replace('T',' ')||'일시 미입력'} (한국시간)\n사유: ${$('Reason').value.trim()||'미입력'}`:'배차와 대체 차량을 선택하세요.';
  }
  function renderHistory(){
    $('History').replaceChildren();(data.history||[]).forEach(h=>{const p=document.createElement('p');p.textContent=`${h.sequence}순차 · ${vehicle(h.from)?.no||h.from} → ${vehicle(h.to)?.no||h.to} · ${h.state}\n${h.reportedKind} ${h.reportedAt.replace('T',' ')} · ${h.reason}`;$('History').append(p);});
    if(!$('History').children.length)$('History').textContent='등록된 대차 이력이 없습니다.';
  }
  function lock(value){busy=value;$('Fields').disabled=value||Boolean(pending);$('Save').disabled=value;$('DispatchLink').disabled=value||Boolean(pending);}
  async function load(keep=false){
    if(busy||pending)return;
    const token=authToken,version=++epoch,date=$('Date').value,route=$('Route').value,prior=keep?$('Dispatch').value:'';
    if(!date){status('배차 적용일을 선택하세요.');return;}
    lock(true);status('확정 배차와 전체 노선 차량을 확인하고 있습니다.');
    try{const result=await call('vehicleReplacementLoad',{date,route});if(token!==authToken||version!==epoch)return false;
      if(!result.ok){data=null;clearLists();status(result.message||'불러오지 못했습니다.');return false;}
      data=result;$('Dispatch').replaceChildren(new Option('변경할 순차 선택',''));
      data.assignments.forEach(a=>$('Dispatch').add(new Option(`${a.sequence}순차 · ${a.shift}조 · ${a.driverName} · ${vehicle(a.vehicleId)?.no||a.vehicleId}호`,a.id)));
      if(prior&&data.assignments.some(a=>a.id===prior))$('Dispatch').value=prior;
      $('Confirm').checked=false;renderVehicles();renderHistory();preview();status(data.assignments.length?`${date} ${route}번 확정 배차 ${data.assignments.length}건을 불러왔습니다.`:'확정 배차가 없습니다. 배차·시간표에서 먼저 배차를 저장하세요.');return true;
    }catch(e){if(token===authToken&&version===epoch){data=null;clearLists();status('통신을 확인하지 못했습니다. 다시 불러오세요.');}return false;
    }finally{if(token===authToken&&version===epoch)lock(false);}
  }
  async function register(){
    if(busy||pending)return;
    if(!/^\d{4}$/.test($('NewNo').value)||!$('NewRoute').value||!$('NewType').value||!$('NewStatus').value||!$('NewConfirm').checked){$('RegisterStatus').textContent='차량번호 4자리·소속·구분·상태와 확인 항목을 입력하세요.';return;}
    const token=authToken;lock(true);$('RegisterStatus').textContent='등록 중…';let result;
    try{result=await call('replacementVehicleRegister',{vehicleNo:$('NewNo').value,vehicleRoute:$('NewRoute').value,vehicleType:$('NewType').value,vehicleStatus:$('NewStatus').value,confirmed:true});if(token!==authToken)return;$('RegisterStatus').textContent=result.message||'등록 결과를 확인하세요.';
    }catch(e){if(token===authToken)$('RegisterStatus').textContent='통신을 확인하지 못했습니다. 같은 번호로 다시 등록하면 기존 차량을 확인합니다.';
    }finally{if(token===authToken)lock(false);}
    if(token===authToken&&result?.ok){$('Search').value='';await load(true);if(data?.vehicles.some(v=>v.id===result.vehicleId&&!unavailable(v)))$('Vehicle').value=result.vehicleId;$('NewConfirm').checked=false;preview();}
  }
  async function save(){
    if(busy)return;
    if(!pending){
      const a=selected(),v=vehicle($('Vehicle').value);
      if(!a||!v||unavailable(v)||!$('Reported').value||!$('Reason').value.trim()||!$('Confirm').checked){status('적용할 배차, 발생·통보일시, 사유, 대체 차량과 확인 항목을 입력하세요.');return;}
      const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
      pending={date:data.date,route:data.route,dispatchId:a.id,revision:a.revision,originalVehicleId:a.vehicleId,replacementVehicleId:v.id,reportedAt:$('Reported').value,reportedKind:$('Kind').value,type:$('Type').value,reason:$('Reason').value.trim(),confirmed:true,requestId:'REPL-'+[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')};
    }
    const token=authToken;lock(true);status('대차를 저장하고 배차에 반영하고 있습니다.');
    try{const result=await call('vehicleReplacementSave',pending);if(token!==authToken)return;
      pending=null;$('Save').textContent='대차 저장 · 배차 반영';lock(false);
      if(result.ok){managerData=null;invalidateManagerRequest();resetOperationsData();$('Reason').value='';$('Reported').value='';$('Search').value='';await load();status(result.message);}
      else{status(result.message||'저장하지 못했습니다.');$('Confirm').checked=false;}
    }catch(e){if(token===authToken){status('저장 응답을 확인하지 못했습니다. 아래 버튼으로 같은 요청의 처리 결과를 재확인하세요.');$('Save').textContent='같은 요청 재확인';}}
    finally{if(token===authToken)lock(false);}
  }
  function open(){
    mount();if(session!==authToken){reset();session=authToken;}
    if(!data&&!pending&&!busy){$('Date').value=document.getElementById('managerDate').value||todayLocal();$('Route').value=['5','23','70'].includes(document.getElementById('managerRoute').value)?document.getElementById('managerRoute').value:'5';load();}
  }
  function reset(){epoch++;data=null;pending=null;session='';busy=false;if(!mounted)return;clearLists();$('Fields').disabled=false;$('Save').disabled=false;$('Save').textContent='대차 저장 · 배차 반영';$('DispatchLink').disabled=false;['Reported','Reason','Search','NewNo'].forEach(id=>$(id).value='');$('Confirm').checked=false;$('NewConfirm').checked=false;status('');preview();}
  window.Bus70Replacement={open,reset};
})();
