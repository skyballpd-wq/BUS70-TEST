/* Optional two-set Korean keyboard conversion, performed only on user request. */
(function(root){
  function koreanNameFromKeys(value){
    const text=String(value||'');
    if(!/^[A-Za-z\s]+$/.test(text))return text;
    const keys={r:'ㄱ',R:'ㄲ',s:'ㄴ',e:'ㄷ',E:'ㄸ',f:'ㄹ',a:'ㅁ',q:'ㅂ',Q:'ㅃ',t:'ㅅ',T:'ㅆ',d:'ㅇ',w:'ㅈ',W:'ㅉ',c:'ㅊ',z:'ㅋ',x:'ㅌ',v:'ㅍ',g:'ㅎ',k:'ㅏ',o:'ㅐ',i:'ㅑ',O:'ㅒ',j:'ㅓ',p:'ㅔ',u:'ㅕ',P:'ㅖ',h:'ㅗ',y:'ㅛ',n:'ㅜ',b:'ㅠ',m:'ㅡ',l:'ㅣ'};
    const first='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ',vowels='ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ',last=' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
    const joinedV={'ㅗㅏ':'ㅘ','ㅗㅐ':'ㅙ','ㅗㅣ':'ㅚ','ㅜㅓ':'ㅝ','ㅜㅔ':'ㅞ','ㅜㅣ':'ㅟ','ㅡㅣ':'ㅢ'};
    const joinedT={'ㄱㅅ':'ㄳ','ㄴㅈ':'ㄵ','ㄴㅎ':'ㄶ','ㄹㄱ':'ㄺ','ㄹㅁ':'ㄻ','ㄹㅂ':'ㄼ','ㄹㅅ':'ㄽ','ㄹㅌ':'ㄾ','ㄹㅍ':'ㄿ','ㄹㅎ':'ㅀ','ㅂㅅ':'ㅄ'};
    const splitT=Object.fromEntries(Object.entries(joinedT).map(([pair,jamo])=>[jamo,pair]));
    let output='',l='',v='',t='';
    function flush(){output+=l&&v?String.fromCharCode(0xac00+(first.indexOf(l)*21+vowels.indexOf(v))*28+(t?last.indexOf(t):0)):(l||v);l='';v='';t='';}
    for(const key of text){
      const jamo=keys[key]||keys[key.toLowerCase()];
      if(!jamo){flush();output+=key;continue;}
      if(vowels.includes(jamo)){
        if(!v){v=jamo;continue;}
        if(t){const pair=splitT[t],move=pair?pair[1]:t;t=pair?pair[0]:'';flush();l=move;v=jamo;continue;}
        if(joinedV[v+jamo])v=joinedV[v+jamo];else{flush();v=jamo;}
      }else if(!l&&!v){l=jamo;}
      else if(l&&v&&!t&&last.includes(jamo)){t=jamo;}
      else if(l&&v&&t&&joinedT[t+jamo]){t=joinedT[t+jamo];}
      else{flush();l=jamo;}
    }
    flush();return output.normalize('NFC');
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={koreanNameFromKeys};
  else root.koreanNameFromKeys=koreanNameFromKeys;
})(typeof window!=='undefined'?window:this);
