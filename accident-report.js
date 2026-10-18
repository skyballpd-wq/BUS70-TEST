/* Accident evidence stays on this device until the driver submits the report. */
(function(root){
  'use strict';
  const REQUIRED=[['OWN_PLATE','우리 차량 번호판'],['OTHER_PLATE','상대 차량 번호판'],['SCENE','사고 현장 전경'],['OWN_DAMAGE','우리 차량 접촉·파손 부위'],['OTHER_DAMAGE','상대 차량 접촉·파손 부위']];
  const LIMIT=10, MAX_BYTES=512000;
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function validate(data){
    if(!data.ownPlate?.trim()||!data.otherPlate?.trim())return '우리 차량과 상대 차량의 전체 차량번호를 입력하세요.';
    if(data.ownPlate.replace(/\s/g,'')===data.otherPlate.replace(/\s/g,''))return '양쪽 차량번호가 같습니다. 다시 확인하세요.';
    if(!data.occurredAt||!data.location?.trim()||!data.contactArea?.trim())return '사고 시각·현장 위치·접촉 부위를 입력하세요.';
    if(!Array.isArray(data.photos)||data.photos.length<5)return '필수 사진 5장을 모두 첨부하세요.';
    if(data.photos.length>LIMIT)return '사진은 최대 10장까지 첨부할 수 있습니다.';
    if(data.evidenceMode==='BULK'&&data.evidenceConfirmed!==true)return '양쪽 번호판·현장·양쪽 접촉 부위 사진이 포함됐는지 확인해 주세요.';
    const missing=data.evidenceMode==='BULK'?[]:REQUIRED.filter(([key])=>!data.photos.some(p=>p.category===key));
    if(missing.length)return missing.map(x=>x[1]).join(', ')+' 사진을 첨부하세요.';
    if(new Set(data.photos.map(p=>p.data)).size!==data.photos.length)return '같은 사진이 중복되었습니다. 서로 다른 사진을 첨부하세요.';
    return '';
  }
  async function prepare(file){
    if(!file||!/^image\//.test(file.type))throw Error('사진 파일을 선택하세요.');
    if(file.size>25000000)throw Error('25MB 이하 사진을 선택하세요.');
    const url=URL.createObjectURL(file),img=new Image();
    try{
      img.src=url;await img.decode();
      const scale=Math.min(1,1920/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      let blob;for(const quality of [.9,.8,.7,.6,.5]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=MAX_BYTES)break;}
      if(!blob||blob.size>MAX_BYTES)throw Error('사진 용량이 큽니다. 접촉 부위가 잘 보이게 다시 촬영해 주세요.');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
      return {data:data.split(',')[1],preview:data,bytes:blob.size,mimeType:'image/jpeg',selectedAt:new Date().toISOString()};
    }finally{URL.revokeObjectURL(url);}
  }
  function mount(host){
    host.classList.add('accident-report');
    const fields={},photos=[];let busy=false,processing=false,requestId='',locked=false,generation=0,lastPrefill='';
    const controls=[],changed=()=>{if(!locked)requestId='';};
    const hint=node('p','양쪽 번호판 · 현장 전경 · 양쪽 접촉 부위가 보이는 사진을 5장 이상 첨부하세요.','hint');
    const count=node('strong','사진 0/5장 이상','accident-count');count.setAttribute('aria-live','polite');
    const actions=node('div',undefined,'accident-upload-actions'),list=node('div',undefined,'accident-photo-grid'),status=node('p','','accident-message');status.setAttribute('role','status');
    const coverageLabel=node('label',undefined,'accident-coverage'),coverage=node('input');coverage.type='checkbox';coverage.addEventListener('change',changed);controls.push(coverage);
    coverageLabel.append(coverage,node('span','양쪽 번호판·현장·양쪽 접촉 부위 사진을 포함했습니다.'));
    const refresh=()=>{
      count.textContent='사진 '+photos.length+'장 / 최소 5장';list.replaceChildren();
      photos.forEach((photo,index)=>{const card=node('div',undefined,'accident-photo'),preview=node('img'),remove=node('button','삭제');preview.src=photo.preview;preview.alt='사고 사진 '+(index+1);remove.type='button';remove.disabled=busy||locked||processing;remove.setAttribute('aria-label','사고 사진 '+(index+1)+' 삭제');
        remove.onclick=()=>{if(busy||locked||processing)return;photos.splice(index,1);coverage.checked=false;changed();refresh();};
        preview.onclick=()=>{const dialog=node('dialog',undefined,'accident-preview'),large=node('img'),close=node('button','닫기');large.src=preview.src;large.alt=preview.alt;close.type='button';close.onclick=()=>dialog.close();dialog.append(large,close);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();};card.append(preview,remove);list.append(card);
      });
    };
    const disable=()=>{[...Object.values(fields),...controls].forEach(n=>n.disabled=busy||locked||processing);list.querySelectorAll('button').forEach(n=>n.disabled=busy||locked||processing);};
    for(const [caption,capture] of [['사진 여러 장 선택',false],['추가 촬영',true]]){
      const input=node('input'),button=node('button',caption);input.type='file';input.accept='image/*';input.hidden=true;input.multiple=!capture;if(capture)input.setAttribute('capture','environment');input.setAttribute('aria-label',caption+' 파일');button.type='button';button.onclick=()=>{if(!busy&&!locked&&!processing)input.click();};controls.push(input,button);
      input.onchange=async()=>{
        const files=Array.from(input.files||[]);input.value='';if(!files.length||busy||locked||processing)return;
        if(photos.length+files.length>LIMIT){status.textContent='사진은 최대 '+LIMIT+'장입니다. 선택 수를 줄여 주세요.';return;}
        const current=generation;processing=true;disable();let added=0,duplicates=0,failed=0;
        try{for(let i=0;i<files.length;i++){
          if(current!==generation)return;status.textContent='사진 준비 '+(i+1)+'/'+files.length+'…';
          try{const photo=await prepare(files[i]);if(current!==generation)return;if(photos.some(p=>p.data===photo.data)){duplicates++;continue;}photos.push({...photo,category:'EVIDENCE'});added++;coverage.checked=false;changed();refresh();}catch(e){failed++;}
        }status.textContent=added+'장 추가'+(duplicates?' · 중복 '+duplicates+'장 제외':'')+(failed?' · 읽기 실패 '+failed+'장, 다시 선택해 주세요.':'');}
        finally{if(current===generation){processing=false;disable();}}
      };actions.append(button,input);
    }
    host.append(hint,actions,count,list,coverageLabel,status);
    const grid=node('div',undefined,'accident-fields');
    const defs=[['ownPlate','우리 차량 전체 번호','text'],['otherPlate','상대 차량 전체 번호','text'],['location','사고 현장 위치','text'],['contactArea','양쪽 차량 접촉·파손 부위','text'],['occurredAt','사고 발생 시각','datetime-local']];
    defs.forEach(([key,label,type])=>{const wrap=node('label',label),input=node('input');input.type=type;input.maxLength=key.includes('Plate')?30:200;input.setAttribute('aria-label',label);input.addEventListener('input',changed);wrap.append(input);grid.append(wrap);fields[key]=input;});
    const roleWrap=node('label','우리 차량 가해·피해 구분'),role=node('select');['미확정','가해','피해','쌍방'].forEach(v=>role.add(new Option(v,v)));role.setAttribute('aria-label','우리 차량 가해·피해 구분');role.addEventListener('change',changed);roleWrap.append(role);grid.append(roleWrap);fields.ownRole=role;host.append(grid);
    const controller={
      data(){return {requestId:requestId||(requestId=crypto.randomUUID()),...Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,n.value.trim()])),evidenceMode:'BULK',evidenceConfirmed:coverage.checked,photos:photos.map(({preview,...p})=>p)};},
      validate(){return processing?'사진 준비가 끝난 뒤 보고하세요.':validate(this.data());},
      prefill(plate){if(!locked&&(!fields.ownPlate.value||fields.ownPlate.value===lastPrefill)){if(fields.ownPlate.value!==(plate||''))changed();fields.ownPlate.value=plate||'';lastPrefill=plate||'';}if(!fields.occurredAt.value){const d=new Date(Date.now()+9*3600000);fields.occurredAt.value=d.toISOString().slice(0,16);}},
      message(text){status.textContent=text;},
      busy(value){busy=value;disable();},
      uncertain(){locked=true;this.busy(false);status.textContent='접수 결과를 확인하지 못했습니다. 같은 내용으로 다시 보내면 중복 접수 없이 결과를 확인합니다.';},
      reset(){generation++;processing=false;photos.length=0;requestId='';locked=false;lastPrefill='';coverage.checked=false;Object.values(fields).forEach(n=>n.value=n.tagName==='SELECT'?'미확정':'');refresh();this.busy(false);status.textContent='';},
      show(value){host.hidden=!value;}
    };return controller;
  }
  async function showSaved(host,incident,send){
    const a=incident.accident;if(!a)return;
    host.append(node('p',a.occurredAt.replace('T',' ')+' · '+a.location),node('p','우리 차량 '+a.ownPlate+' ('+a.ownRole+') · 상대 차량 '+a.otherPlate+' ('+a.otherRole+')'),node('p','접촉 부위: '+a.contactArea));
    const button=node('button','첨부 사진 '+a.photoCount+'장 보기'),photos=node('div',undefined,'accident-photo-grid');button.type='button';host.append(button,photos);
    button.onclick=async()=>{button.disabled=true;photos.replaceChildren();try{for(let index=0;index<a.photoCount;index++){const result=await send({operation:'accidentPhotoGet',incidentId:incident.incidentId,index});if(!result.ok)throw Error(result.message||'사진을 불러오지 못했습니다.');const card=node('div',undefined,'accident-photo'),img=node('img');img.src='data:image/jpeg;base64,'+result.data;img.alt=result.category;card.append(node('strong',REQUIRED.find(x=>x[0]===result.category)?.[1]||'추가 사진'),img);photos.append(card);}button.hidden=true;}catch(e){button.textContent='사진 다시 보기 · '+e.message;button.disabled=false;}};
  }
  const api={REQUIRED,LIMIT,MAX_BYTES,validate,prepare,mount,showSaved};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.Bus70Accident=api;
})(typeof window!=='undefined'?window:globalThis);
