(()=>{
  'use strict';

  const ROOT='mmdProfilesV8';
  const SUPPORTED_GENDERS=['male','female'];
  const PACKAGE_SELECTORS=[
    '[data-driver-packages]',
    '[data-culinary-packages]',
    '[data-dayoff-packages]',
    '[data-nightlife-packages]',
    '[data-social-packages]',
    '[data-bangkok-packages]',
    '[data-sport-packages]',
    '[data-wellness-packages]',
    '[data-business-packages]',
    '[data-creative-packages]',
    '[data-medical-request-only]'
  ];

  const COPY={
    th:{
      gateEyebrow:'PROFILE VISIBILITY',
      gateTitle:'ใครกำลังดู Profiles?',
      gateCopy:'แต่ละ Model เปิดรับลูกค้าไม่เหมือนกัน เลือกเพศของลูกค้าก่อน ระบบจะแสดงเฉพาะคนที่เปิดให้คุณดูได้จริง',
      male:'ลูกค้าผู้ชาย',
      female:'ลูกค้าผู้หญิง',
      profileEyebrow:'VISIBLE TO YOU',
      profileTitle:'คนที่เปิดให้คุณดูได้',
      genderMale:'ลูกค้าผู้ชาย',
      genderFemale:'ลูกค้าผู้หญิง',
      chooseRole:'เลือกบทบาทก่อน',
      roleFallback:'บทบาทที่เลือก'
    },
    en:{
      gateEyebrow:'PROFILE VISIBILITY',
      gateTitle:'Who is viewing Profiles?',
      gateCopy:'Models do not all accept the same customer visibility. Choose the customer gender first and we will show only profiles actually open to you.',
      male:'Male customer',
      female:'Female customer',
      profileEyebrow:'VISIBLE TO YOU',
      profileTitle:'Profiles open to you',
      genderMale:'Male customer',
      genderFemale:'Female customer',
      chooseRole:'Choose a role first',
      roleFallback:'Selected role'
    },
    zh:{
      gateEyebrow:'PROFILE VISIBILITY',
      gateTitle:'谁正在查看 Profiles？',
      gateCopy:'不同 Model 对客户的开放范围不同。请先选择客户性别，系统只会显示真正对你开放的资料。',
      male:'男性客户',
      female:'女性客户',
      profileEyebrow:'VISIBLE TO YOU',
      profileTitle:'对你开放的人选',
      genderMale:'男性客户',
      genderFemale:'女性客户',
      chooseRole:'请先选择角色',
      roleFallback:'已选角色'
    }
  };

  function lang(){
    const x=String(document.documentElement.lang||'th').toLowerCase();
    if(x.startsWith('zh'))return'zh';
    if(x.startsWith('en'))return'en';
    return'th';
  }

  function queryGender(){
    try{
      const value=new URLSearchParams(location.search).get('gender');
      return SUPPORTED_GENDERS.includes(value)?value:'';
    }catch(_){
      return'';
    }
  }

  function selectedGender(root){
    const b=root.querySelector('[data-gender-value][aria-pressed="true"]:not([data-gender-value="all"])');
    return b&&SUPPORTED_GENDERS.includes(b.dataset.genderValue)?b.dataset.genderValue:'';
  }

  function selectedRole(root){
    const b=root.querySelector('[data-role-value][aria-pressed="true"]');
    return b?String(b.dataset.roleValue||''):'';
  }

  function selectedRoleLabel(root){
    const b=root.querySelector('[data-role-value][aria-pressed="true"] b');
    return b?b.textContent.trim():'';
  }

  function syncUrlGender(gender){
    if(!SUPPORTED_GENDERS.includes(gender))return;
    try{
      const u=new URL(location.href);
      u.searchParams.set('gender',gender);
      history.replaceState(null,'',u.pathname+u.search+u.hash);
    }catch(_){}
  }

  function buildGate(root){
    const roleFirst=root.querySelector('.mp8-role-first');
    const gate=root.querySelector('[data-role-stage2]');
    if(!roleFirst||!gate)return null;

    gate.hidden=false;
    gate.classList.add('mp8-visibility-gate');

    let copywrap=gate.querySelector('.mp8-visibility-gate__copywrap');
    if(!copywrap){
      copywrap=document.createElement('div');
      copywrap.className='mp8-visibility-gate__copywrap';

      const eyebrow=document.createElement('p');
      eyebrow.className='mp8-visibility-gate__eyebrow';
      eyebrow.dataset.visibilityEyebrow='';

      const title=document.createElement('h2');
      title.className='mp8-visibility-gate__title';
      title.dataset.visibilityTitle='';

      const desc=document.createElement('p');
      desc.className='mp8-visibility-gate__copy';
      desc.dataset.visibilityCopy='';

      copywrap.append(eyebrow,title,desc);
      gate.insertBefore(copywrap,gate.firstChild);
    }

    const all=gate.querySelector('[data-gender-value="all"]');
    if(all){
      all.setAttribute('aria-pressed','false');
      all.hidden=true;
    }

    const introHead=roleFirst.querySelector('.mp8-step01-head')||roleFirst.querySelector('.mp8-role-intro');
    roleFirst.insertBefore(gate,introHead||roleFirst.firstChild);

    return gate;
  }

  function buildProfileFocus(root){
    const track=root.querySelector('[data-track]');
    const results=root.querySelector('.mp8-results');
    const empty=root.querySelector('[data-empty]');
    const swipe=root.querySelector('[data-swipe]');
    if(!track||!results)return null;

    let focus=root.querySelector('.mp8-profile-focus');
    if(!focus){
      focus=document.createElement('section');
      focus.className='mp8-profile-focus';
      focus.dataset.profileFocus='';

      const head=document.createElement('div');
      head.className='mp8-profile-focus__head';

      const titleBox=document.createElement('div');
      const eyebrow=document.createElement('p');
      eyebrow.className='mp8-profile-focus__eyebrow';
      eyebrow.dataset.focusEyebrow='';
      const title=document.createElement('h2');
      title.className='mp8-profile-focus__title';
      title.dataset.focusTitle='';
      titleBox.append(eyebrow,title);

      const meta=document.createElement('div');
      meta.className='mp8-profile-focus__meta';
      const gender=document.createElement('span');
      gender.dataset.focusGender='';
      const role=document.createElement('span');
      role.dataset.focusRole='';
      meta.append(gender,role);

      head.append(titleBox,meta);
      focus.append(head);

      results.parentNode.insertBefore(focus,results);
      focus.append(results,track);
      if(empty)focus.append(empty);
      if(swipe)focus.append(swipe);
    }

    return focus;
  }

  function moveOffersBelowProfiles(root,focus){
    if(!focus)return null;

    let holder=root.querySelector('.mp8-role-offers-secondary');
    if(!holder){
      holder=document.createElement('div');
      holder.className='mp8-role-offers-secondary';
      holder.dataset.roleOffersSecondary='';
      focus.insertAdjacentElement('afterend',holder);
    }

    PACKAGE_SELECTORS.forEach(selector=>{
      const section=root.querySelector(selector);
      if(section&&!holder.contains(section))holder.appendChild(section);
    });

    const confidential=root.querySelector('.mp8-confidential-talent');
    if(confidential&&confidential.previousElementSibling!==holder){
      holder.insertAdjacentElement('afterend',confidential);
    }

    return holder;
  }

  function applyCopy(root,gate,focus){
    const d=COPY[lang()]||COPY.th;

    if(gate){
      const e=gate.querySelector('[data-visibility-eyebrow]');
      const t=gate.querySelector('[data-visibility-title]');
      const c=gate.querySelector('[data-visibility-copy]');
      if(e)e.textContent=d.gateEyebrow;
      if(t)t.textContent=d.gateTitle;
      if(c)c.textContent=d.gateCopy;

      const male=gate.querySelector('[data-gender-value="male"]');
      const female=gate.querySelector('[data-gender-value="female"]');
      if(male)male.textContent=d.male;
      if(female)female.textContent=d.female;
      const group=gate.querySelector('.mp8-segment');
      if(group)group.setAttribute('aria-label',d.gateTitle);
    }

    if(focus){
      const e=focus.querySelector('[data-focus-eyebrow]');
      const t=focus.querySelector('[data-focus-title]');
      const g=focus.querySelector('[data-focus-gender]');
      const r=focus.querySelector('[data-focus-role]');
      const gender=selectedGender(root);
      const role=selectedRoleLabel(root);

      if(e)e.textContent=d.profileEyebrow;
      if(t)t.textContent=d.profileTitle;
      if(g)g.textContent=gender==='male'?d.genderMale:gender==='female'?d.genderFemale:'';
      if(r)r.textContent=role||d.chooseRole;
    }
  }

  function setPending(root,pending){
    root.classList.toggle('is-visibility-pending',pending);
    root.dataset.customerGender=pending?'':selectedGender(root);
  }

  function revealFocus(focus){
    if(!focus)return;
    focus.classList.remove('is-profile-focus-visible');
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      focus.classList.add('is-profile-focus-visible');
    }));
  }

  function focusProfiles(root,gate,focus){
    const gender=selectedGender(root);
    const role=selectedRole(root);

    if(!gender){
      setPending(root,true);
      if(gate){
        gate.classList.remove('needs-attention');
        void gate.offsetWidth;
        gate.classList.add('needs-attention');
        gate.scrollIntoView({
          behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',
          block:'center'
        });
      }
      return;
    }

    setPending(root,false);
    applyCopy(root,gate,focus);

    if(!role)return;

    const roleFirst=root.querySelector('.mp8-role-first');
    if(roleFirst)roleFirst.classList.add('has-role-selected');

    revealFocus(focus);

    window.setTimeout(()=>{
      focus.scrollIntoView({
        behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',
        block:'start'
      });
    },80);
  }

  function applyInitialGender(root,gate,focus){
    const initial=queryGender();
    if(!initial){
      const all=root.querySelector('[data-gender-value="all"]');
      if(all)all.setAttribute('aria-pressed','false');
      root.querySelectorAll('[data-gender-value="male"],[data-gender-value="female"]').forEach(b=>{
        b.setAttribute('aria-pressed','false');
      });
      setPending(root,true);
      return;
    }

    const button=root.querySelector('[data-gender-value="'+initial+'"]');
    if(button){
      button.click();
      syncUrlGender(initial);
      setPending(root,false);
      window.setTimeout(()=>applyCopy(root,gate,focus),0);
    }
  }

  function boot(){
    const root=document.getElementById(ROOT);
    if(!root||root.dataset.genderModelFocus==='1')return;
    root.dataset.genderModelFocus='1';

    const gate=buildGate(root);
    const focus=buildProfileFocus(root);
    moveOffersBelowProfiles(root,focus);
    applyCopy(root,gate,focus);
    applyInitialGender(root,gate,focus);

    root.addEventListener('click',event=>{
      const genderButton=event.target.closest&&event.target.closest('[data-gender-value]');
      if(genderButton&&SUPPORTED_GENDERS.includes(genderButton.dataset.genderValue)){
        const gender=genderButton.dataset.genderValue;
        syncUrlGender(gender);
        window.setTimeout(()=>{
          setPending(root,false);
          applyCopy(root,gate,focus);
          if(selectedRole(root))focusProfiles(root,gate,focus);
        },20);
        return;
      }

      const roleButton=event.target.closest&&event.target.closest('[data-role-value]');
      if(roleButton){
        window.setTimeout(()=>{
          applyCopy(root,gate,focus);
          focusProfiles(root,gate,focus);
        },50);
      }
    });

    new MutationObserver(()=>{
      applyCopy(root,gate,focus);
    }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});

    const track=root.querySelector('[data-track]');
    if(track){
      new MutationObserver(()=>{
        applyCopy(root,gate,focus);
        if(selectedGender(root)&&selectedRole(root))revealFocus(focus);
      }).observe(track,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else{
    boot();
  }
})();
