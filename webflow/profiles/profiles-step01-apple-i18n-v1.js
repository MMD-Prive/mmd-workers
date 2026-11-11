(()=>{
  'use strict';

  const ROOT_ID='mmdProfilesV8';
  const IMAGE='https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6abe21bf8b4385f0a73a7635_Midnight%20Penthouse%20Fashion%20Portrait.webp';

  const COPY={
    th:{
      kicker:'STEP 01 · เลือกบทบาทก่อน',
      title:'วันนี้อยากได้ใคร<br><span>มาอยู่ข้าง ๆ?</span>',
      body:'เลือกบทบาทก่อน แล้ว MMD จะเปิดเฉพาะคนที่ผ่านการอนุมัติสำหรับบทบาทนั้นจริง ไม่ดึงนายแบบทุกคนขึ้นมาให้เลือกพร้อมกันครับ',
      group:'เลือกบทบาท',
      imageAlt:'MMD Privé Public Profile — Midnight Penthouse Fashion Portrait',
      caption:'เลือกจากบทบาทและบรรยากาศก่อน แล้วค่อยให้ MMD ช่วยดูคนที่เหมาะกับวันของคุณ',
      roles:{
        everyday_companion:['เพื่อนคู่ใจ','คาเฟ่ หนัง ช้อปปิ้ง และวันธรรมดาที่อยากมีใครอยู่ด้วย'],
        driver_companion:['คนขับรถหล่อ','รับส่ง Day trip และการเดินทางที่อยากมีเพื่อนร่วมทาง'],
        culinary_companion:['เชฟหล่อ','ทำอาหาร Private dining และกิจกรรมในครัว'],
        social_appearance:['คู่หูออกงาน','Dinner, Event และ Social appearance'],
        bangkok_companion:['เพื่อนเที่ยวกรุงเทพ','เที่ยวเมือง Local day และพาไปใช้กรุงเทพในอีกมุม'],
        sport_activity:['หนุ่มสายกีฬา','วิ่ง กีฬา Outdoor และกิจกรรมแอคทีฟ'],
        wellness_companion:['หนุ่มสายสุขภาพ','Wellness, Fitness และกิจกรรมดูแลตัวเอง'],
        business_companion:['หนุ่มออฟฟิศ','Business dinner, Meeting companion และ Smart casual'],
        nightlife_companion:['เพื่อนสายปาร์ตี้','Night out, Concert และ Celebration'],
        creative_companion:['เพื่อนสายศิลป์','Gallery, Music, Photo walk และ Creative day'],
        medical_professional:['บุรุษทางการแพทย์','เฉพาะผู้มี credential ที่ MMD ตรวจสอบแล้ว']
      },
      maleMassage:['Male Massage','MMS เป็นบริการ Therapist แยกจาก Public Model'],
      customBrief:['บรีฟแบบของคุณเอง','บอก MMD ว่าวันนี้คุณกำลังมองหาใครแบบไหน'],
      result:'แสดง {n} โปรไฟล์ · {role}',
      none:'ตอนนี้ยังไม่มีคนที่ MMD เปิดสำหรับบทบาทนี้'
    },
    en:{
      kicker:'STEP 01 · CHOOSE THE ROLE',
      title:'Who would you like<br><span>by your side today?</span>',
      body:'Choose the role first. MMD will show only people approved for that role instead of placing every public model in one list.',
      group:'Choose a role',
      imageAlt:'MMD Privé Public Profile — Midnight Penthouse Fashion Portrait',
      caption:'Start with the role and the mood. MMD can then help narrow down who fits your day.',
      roles:{
        everyday_companion:['Everyday companion','Cafés, movies, shopping and ordinary days that feel better with company.'],
        driver_companion:['Driver companion','Pick-ups, day trips and travel with someone beside you.'],
        culinary_companion:['Culinary companion','Cooking, private dining and time together in the kitchen.'],
        social_appearance:['Social appearance','Dinner, events and polished social occasions.'],
        bangkok_companion:['Bangkok companion','Local city days and a more personal way to experience Bangkok.'],
        sport_activity:['Sport & activity','Running, outdoor plans and active days.'],
        wellness_companion:['Wellness companion','Wellness, fitness and self-care activities.'],
        business_companion:['Business companion','Business dinners, meeting companion and smart-casual settings.'],
        nightlife_companion:['Nightlife companion','Night outs, concerts and celebrations.'],
        creative_companion:['Creative companion','Galleries, music, photo walks and creative days.'],
        medical_professional:['Verified medical professional','Only credential-checked professionals approved by MMD.']
      },
      maleMassage:['Male Massage','MMS is a separate Therapist service, not a Public Model role.'],
      customBrief:['Your own brief','Tell MMD what kind of person or presence you are looking for today.'],
      result:'Showing {n} profiles · {role}',
      none:'No MMD-approved profile is currently open for this role.'
    },
    zh:{
      kicker:'STEP 01 · 先选择角色',
      title:'今天想让谁<br><span>陪在你身边？</span>',
      body:'先选择角色。MMD 只会显示真正通过该角色审核的人选，而不是一次把所有 Public Model 都列出来。',
      group:'选择角色',
      imageAlt:'MMD Privé Public Profile — Midnight Penthouse Fashion Portrait',
      caption:'先从角色和氛围开始，再由 MMD 帮你筛选更适合这一天的人选。',
      roles:{
        everyday_companion:['日常陪伴','咖啡、电影、购物，以及想有人陪伴的普通一天。'],
        driver_companion:['司机陪伴','接送、Day trip，以及想有人同行的旅程。'],
        culinary_companion:['料理陪伴','一起做饭、Private dining 和厨房活动。'],
        social_appearance:['社交出席','Dinner、Event 及需要得体陪同的社交场合。'],
        bangkok_companion:['曼谷同行','Local day，用更贴近城市的方式体验曼谷。'],
        sport_activity:['运动陪伴','跑步、Outdoor 和各类活力活动。'],
        wellness_companion:['健康生活陪伴','Wellness、Fitness 与自我照顾活动。'],
        business_companion:['商务陪伴','Business dinner、Meeting companion 与 Smart casual 场合。'],
        nightlife_companion:['夜生活陪伴','Night out、Concert 与 Celebration。'],
        creative_companion:['艺术创意陪伴','Gallery、Music、Photo walk 与 Creative day。'],
        medical_professional:['经验证医疗专业人士','仅显示经 MMD 核验 credential 的专业人士。']
      },
      maleMassage:['Male Massage','MMS 是独立的 Therapist 服务，不属于 Public Model 角色。'],
      customBrief:['自定义需求','告诉 MMD 今天想寻找怎样的人或怎样的陪伴感。'],
      result:'显示 {n} 个资料 · {role}',
      none:'目前此角色暂无经 MMD 批准公开的资料。'
    }
  };

  const ROLE_KEYS=Object.keys(COPY.th.roles);

  function normalizeLang(value){
    const x=String(value||'').trim().toLowerCase();
    if(x==='zh'||x.startsWith('zh-')||x==='cn')return'zh';
    if(x==='en'||x.startsWith('en-'))return'en';
    if(x==='th'||x.startsWith('th-'))return'th';
    return'';
  }

  function detectLang(){
    try{
      const query=normalizeLang(new URLSearchParams(location.search).get('lang'));
      if(query)return query;
    }catch(_){}
    const html=normalizeLang(document.documentElement.lang);
    if(html)return html;
    try{
      const stored=normalizeLang(localStorage.getItem('mmd_lang'));
      if(stored)return stored;
    }catch(_){}
    return'th';
  }

  function setText(node,value){
    if(node&&node.textContent!==value)node.textContent=value;
  }

  function setHtml(node,value){
    if(node&&node.innerHTML!==value)node.innerHTML=value;
  }

  function activeRole(root){
    const selected=root.querySelector('[data-role-value][aria-pressed="true"]');
    return selected&&ROLE_KEYS.includes(selected.dataset.roleValue)?selected.dataset.roleValue:'';
  }

  function build(root){
    const section=root.querySelector('.mp8-role-first');
    const intro=section&&section.querySelector(':scope > .mp8-role-intro');
    const grid=section&&section.querySelector(':scope > .mp8-role-grid');
    if(!section||!intro||!grid)return null;

    if(section.dataset.step01Apple==='1'){
      return {section,intro,grid,head:section.querySelector('.mp8-step01-head'),visual:section.querySelector('.mp8-step01-visual')};
    }

    section.dataset.step01Apple='1';
    section.classList.add('mp8-step01-apple');

    const head=document.createElement('div');
    head.className='mp8-step01-head';

    const figure=document.createElement('figure');
    figure.className='mp8-step01-visual';
    figure.dataset.step01Visual='';

    const image=document.createElement('img');
    image.src=IMAGE;
    image.loading='eager';
    image.decoding='async';
    image.fetchPriority='high';

    const badge=document.createElement('span');
    badge.className='mp8-step01-visual__badge';
    badge.textContent='STEP 01';

    const caption=document.createElement('figcaption');

    figure.append(image,badge,caption);
    section.insertBefore(head,intro);
    head.append(intro,figure);

    const heading=intro.querySelector('h2');
    if(heading){
      heading.id=heading.id||'mp8-step01-title';
      section.setAttribute('aria-labelledby',heading.id);
    }

    Array.from(grid.querySelectorAll('.mp8-role-card')).forEach((card,index)=>{
      card.style.setProperty('--mp8-step-delay',Math.min(index*34,340)+'ms');
    });

    return {section,intro,grid,head,visual:figure};
  }

  function translateRoleCards(root,lang){
    const words=COPY[lang];

    ROLE_KEYS.forEach(key=>{
      const card=root.querySelector('[data-role-value="'+key+'"]');
      if(!card)return;
      const copy=words.roles[key];
      setText(card.querySelector('b'),copy[0]);
      setText(card.querySelector('small'),copy[1]);
    });

    const male=root.querySelector('.mp8-role-card--separate[href^="/male-massage/"]');
    if(male){
      setText(male.querySelector('b'),words.maleMassage[0]);
      setText(male.querySelector('small'),words.maleMassage[1]);
    }

    const custom=root.querySelector('.mp8-role-card--separate[href*="role=custom_brief"]');
    if(custom){
      setText(custom.querySelector('b'),words.customBrief[0]);
      setText(custom.querySelector('small'),words.customBrief[1]);
    }

    const grid=root.querySelector('.mp8-role-grid');
    if(grid)grid.setAttribute('aria-label',words.group);
  }

  function syncDynamicRoleCopy(root,lang){
    const role=activeRole(root);
    if(!role)return;
    const label=COPY[lang].roles[role][0];

    root.querySelectorAll('[data-track] .mp8-profile').forEach(card=>{
      setText(card.querySelector('.mp8-card__title p'),label.toUpperCase());
      setText(card.querySelector('.mp8-tags span:first-child'),label);
    });

    const count=root.querySelector('[data-result-count]');
    if(count){
      const visible=Array.from(root.querySelectorAll('[data-track] .mp8-profile')).filter(card=>!card.hidden).length;
      const next=visible
        ? COPY[lang].result.replace('{n}',String(visible)).replace('{role}',label)
        : COPY[lang].none;
      setText(count,next);
    }
  }

  function applyCopy(root,ui,lang){
    const words=COPY[lang]||COPY.th;
    const kicker=ui.intro.querySelector('.mp8-kicker');
    const heading=ui.intro.querySelector('h2');
    const body=Array.from(ui.intro.children).find(el=>el.tagName==='P'&&!el.classList.contains('mp8-kicker'));

    setText(kicker,words.kicker);
    setHtml(heading,words.title);
    setText(body,words.body);

    const image=ui.visual&&ui.visual.querySelector('img');
    const caption=ui.visual&&ui.visual.querySelector('figcaption');
    if(image)image.alt=words.imageAlt;
    setText(caption,words.caption);

    translateRoleCards(root,lang);
    syncDynamicRoleCopy(root,lang);
  }

  function swapLanguage(root,ui,raw,animate){
    const lang=normalizeLang(raw)||'th';
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

    if(!animate||reduced){
      applyCopy(root,ui,lang);
      return;
    }

    ui.section.classList.add('is-language-swapping');
    window.setTimeout(()=>{
      applyCopy(root,ui,lang);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        ui.section.classList.remove('is-language-swapping');
      }));
    },145);
  }

  function installReveal(ui){
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(reduced||!('IntersectionObserver'in window)){
      ui.head.classList.add('is-inview');
      ui.section.classList.add('is-step01-visible');
      return;
    }

    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(!entry.isIntersecting)return;
        ui.head.classList.add('is-inview');
        ui.section.classList.add('is-step01-visible');
        observer.disconnect();
      });
    },{threshold:.14,rootMargin:'0px 0px -8% 0px'});

    observer.observe(ui.head);
  }

  function boot(){
    const root=document.getElementById(ROOT_ID);
    if(!root||root.dataset.step01AppleRuntime==='1')return;
    root.dataset.step01AppleRuntime='1';

    const ui=build(root);
    if(!ui)return;

    let current=detectLang();
    applyCopy(root,ui,current);
    installReveal(ui);

    document.addEventListener('click',event=>{
      const button=event.target.closest&&event.target.closest('#'+ROOT_ID+' [data-lang]');
      if(!button)return;
      current=normalizeLang(button.dataset.lang)||'th';
      swapLanguage(root,ui,current,true);
    });

    new MutationObserver(()=>{
      const next=normalizeLang(document.documentElement.lang)||detectLang();
      if(next!==current){
        current=next;
        swapLanguage(root,ui,current,true);
      }
      syncDynamicRoleCopy(root,current);
    }).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});

    const track=root.querySelector('[data-track]');
    if(track){
      new MutationObserver(()=>syncDynamicRoleCopy(root,current))
        .observe(track,{childList:true,subtree:true});
    }

    root.querySelectorAll('[data-role-value]').forEach(button=>{
      button.addEventListener('click',()=>{
        window.setTimeout(()=>syncDynamicRoleCopy(root,current),0);
      });
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else{
    boot();
  }
})();
