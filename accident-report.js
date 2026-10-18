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
    const missing=REQUIRED.filter(([key])=>!data.photos.some(p=>p.category===key));
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
    const fields={}, photos=new Map();let busy=false,processing=0,requestId='',locked=false,generation=0;
    const heading=node('h3','사고 차량·현장 정보'),hint=node('p','안전한 곳에서 촬영하세요. 양쪽 차량번호와 접촉 부위가 선명하게 보이도록 확인해 주세요.','hint');
    host.append(heading,hint);
    const grid=node('div',undefined,'accident-fields');
    const defs=[['ownPlate','우리 차량 전체 번호','text'],['otherPlate','상대 차량 전체 번호','text'],['occurredAt','사고 발생 시각','datetime-local'],['location','사고 현장 위치','text'],['contactArea','양쪽 차량 접촉·파손 부위','text']];
    const changed=()=>{if(!locked)requestId='';};
    defs.forEach(([key,label,type])=>{const wrap=node('label',label),input=node('input');input.type=type;input.maxLength=key.includes('Plate')?30:200;input.setAttribute('aria-label',label);input.addEventListener('input',changed);wrap.append(input);grid.append(wrap);fields[key]=input;});
    const roleWrap=node('label','우리 차량 가해·피해 구분'),role=node('select');[['미확정','미확정'],['가해','가해'],['피해','피해'],['쌍방','쌍방']].forEach(([v,t])=>role.add(new Option(t,v)));role.setAttribute('aria-label','우리 차량 가해·피해 구분');role.addEventListener('change',changed);roleWrap.append(role);grid.append(roleWrap);fields.ownRole=role;
    host.append(grid,node('p','가해·피해 구분은 현재 보고 내용이며, 확정 전에는 미확정을 선택하세요.','hint'));
    const count=node('p','필수 사진 0/5 · 전체 0장','accident-count');count.setAttribute('aria-live','polite');host.append(count);
    const list=node('div',undefined,'accident-photo-grid'),status=node('p','','accident-message');status.setAttribute('role','status');
    const refresh=()=>{count.textContent='필수 사진 '+REQUIRED.filter(([k])=>photos.has(k)).length+'/5 · 전체 '+photos.size+'장';};
    const controls=[];
    function slot(key,label){
      const card=node('div',undefined,'accident-photo'),title=node('strong',label),preview=node('img');preview.hidden=true;preview.alt=label+' 미리보기';
      const actions=node('div',undefined,'accident-photo-actions');
      for(const [caption,capture] of [['촬영',true],['사진 선택',false]]){
        const input=node('input');input.type='file';input.accept='image/*';input.hidden=true;if(capture)input.setAttribute('capture','environment');input.setAttribute('aria-label',label+' '+caption);
        const button=node('button',caption);button.type='button';button.setAttribute('aria-label',label+' '+caption);button.addEventListener('click',()=>{if(!busy&&!locked)input.click();});controls.push(button,input);
        input.addEventListener('change',async()=>{
          const file=input.files&&input.files[0];input.value='';if(!file||busy||locked)return;
          const currentGeneration=generation;processing++;button.disabled=true;status.textContent='사진 준비 중…';
          try{const photo=await prepare(file);if(currentGeneration!==generation)return;if([...photos.entries()].some(([k,p])=>k!==key&&p.data===photo.data))throw Error('이미 첨부된 사진입니다. 다른 사진을 선택하세요.');photos.set(key,{...photo,category:key.startsWith('EXTRA_')?'EXTRA':key});preview.src=photo.preview;preview.hidden=false;changed();refresh();status.textContent='사진을 확대해 차량번호와 접촉 부위가 잘 보이는지 확인해 주세요.';}
          catch(e){status.textContent=e.message||'사진을 읽지 못했습니다.';}finally{processing--;button.disabled=false;}
        });actions.append(button,input);
      }
      const remove=node('button','삭제');remove.type='button';remove.setAttribute('aria-label',label+' 삭제');remove.addEventListener('click',()=>{if(busy||locked)return;photos.delete(key);preview.removeAttribute('src');preview.hidden=true;changed();refresh();});controls.push(remove);actions.append(remove);
      preview.addEventListener('click',()=>{const dialog=node('dialog',undefined,'accident-preview'),large=node('img'),close=node('button','닫기');large.src=preview.src;large.alt=preview.alt;close.type='button';close.onclick=()=>dialog.close();dialog.append(large,close);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();});
      card.append(title,preview,actions);list.append(card);
    }
    REQUIRED.forEach(([k,label],i)=>slot(k,(i+1)+'. '+label));host.append(list);
    const extra=node('button','사진 더 추가 (최대 10장)');extra.type='button';let extras=0;extra.onclick=()=>{if(busy||locked||extras>=5)return;slot('EXTRA_'+(++extras),'추가 사진 '+extras);if(extras>=5)extra.hidden=true;};controls.push(extra);host.append(extra,status);
    const controller={
      data(){return {requestId:requestId||(requestId=crypto.randomUUID()),...Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,n.value.trim()])),photos:[...photos.values()].map(({preview,...p})=>p)};},
      validate(){return processing?'사진 준비가 끝난 뒤 보고하세요.':validate(this.data());},
      prefill(plate){if(!fields.ownPlate.value)fields.ownPlate.value=plate||'';if(!fields.occurredAt.value){const d=new Date(Date.now()+9*3600000);fields.occurredAt.value=d.toISOString().slice(0,16);}},
      message(text){status.textContent=text;},
      busy(value){busy=value;[...Object.values(fields),...controls].forEach(n=>n.disabled=value||locked);},
      uncertain(){locked=true;this.busy(false);status.textContent='접수 결과를 확인하지 못했습니다. 같은 내용으로 다시 보내면 중복 접수하지 않고 결과를 확인합니다.';},
      reset(){generation++;photos.clear();requestId='';locked=false;Object.values(fields).forEach(n=>n.value=n.tagName==='SELECT'?'미확정':'');list.querySelectorAll('img').forEach(n=>{n.hidden=true;n.removeAttribute('src');});refresh();this.busy(false);status.textContent='';},
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
