/* Browser capabilities are not a promise of background execution. */
(function(root){
  'use strict';
  function capabilities(win){
    const nav=win.navigator||{},bridge=win.Bus70Android||{};
    const ios=/iPhone|iPad|iPod/.test(nav.userAgent||'')||(/Mac/.test(nav.platform||'')&&nav.maxTouchPoints>1);
    return {ios,standalone:nav.standalone===true||Boolean(win.matchMedia&&win.matchMedia('(display-mode: standalone)').matches),
      nativeAlarm:typeof bridge.syncSchedule==='function',nativeLocation:typeof bridge.startLocationTracking==='function',
      vibration:typeof nav.vibrate==='function',voice:'speechSynthesis' in win,
      notification:'Notification' in win,wakeLock:Boolean(nav.wakeLock&&typeof nav.wakeLock.request==='function')};
  }
  function screenAwake(win,onChange){
    let enabled=false,active=false,sentinel=null,pending=false,generation=0,state='off';
    const emit=value=>{state=value;if(onChange)onChange(value);};
    const wanted=()=>enabled&&active&&!win.document.hidden;
    async function sync(){
      if(!wanted()){
        generation++;const previous=sentinel;sentinel=null;
        if(previous)try{await previous.release();}catch(ignore){}
        emit(enabled?'waiting':'off');return;
      }
      if(sentinel||pending)return;
      if(!capabilities(win).wakeLock){emit('unsupported');return;}
      pending=true;const ticket=++generation;
      try{
        const lock=await win.navigator.wakeLock.request('screen');
        if(ticket!==generation||!wanted()){await lock.release();return;}
        sentinel=lock;emit('on');
        lock.addEventListener('release',()=>{if(sentinel===lock){sentinel=null;emit(wanted()?'released':enabled?'waiting':'off');}});
      }catch(ignore){if(ticket===generation)emit('denied');}
      finally{pending=false;if(ticket!==generation&&wanted())sync();}
    }
    return {enable(value){enabled=Boolean(value);return sync();},setActive(value){if(active===Boolean(value))return;active=Boolean(value);return sync();},sync,
      get enabled(){return enabled;},get state(){return state;}};
  }
  const api={capabilities,screenAwake};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.Bus70Mobile=api;
})(typeof window!=='undefined'?window:globalThis);
