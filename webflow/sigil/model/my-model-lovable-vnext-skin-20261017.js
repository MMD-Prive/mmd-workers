(function myModelLovableSkin(win,doc){
'use strict';
if(!doc||!win||!/^\/sigil\/model\/dashboard\/?$/.test(win.location.pathname))return;
const root=doc.getElementById('mmd-model-home-v4');
if(!root||root.dataset.mmLovableSkin)return;
const shell=root.querySelector('.mmhome-shell');
if(!shell)return;
const source='lovable-vnext-20261017';
root.dataset.mmLovableSkin=source;root.dataset.mmLvLane='neutral';root.dataset.mmPremiumSkin='atelier-v2';
const picture=doc.createElement('img');
picture.className='mm-lv-atmosphere';picture.alt='';picture.setAttribute('aria-hidden','true');
picture.src='https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ad1028480c73d0f43f1c960_Midnight%20Bangkok%20Through%20Rainy%20Glass.webp';
root.prepend(picture);
const header=doc.createElement('header');
header.className='mm-lv-header';
header.innerHTML='<div class="mm-lv-brand"><strong>MY MODEL</strong><small data-mm-lv-text="space">พื้นที่ของคุณ</small><span class="mm-lv-sigil" aria-hidden="true">SĪGIL</span></div><div class="mm-lv-languages" role="radiogroup" aria-label="ภาษา"><button type="button" role="radio" data-mm-lv-lang="th" aria-checked="true" lang="th">TH</button><button type="button" role="radio" data-mm-lv-lang="en" aria-checked="false" lang="en">EN</button><button type="button" role="radio" data-mm-lv-lang="zh" aria-checked="false" lang="zh-Hans">中文</button></div>';
shell.prepend(header);
const hero=shell.querySelector('.mmhome-hero');
if(hero)hero.innerHTML='<p class="mmeyebrow">MY MODEL / HOME</p><h1 data-mm-lv-text="homeTitle">งานปัจจุบัน</h1><p data-mm-lv-text="homeDescription">งาน ความพร้อม และข้อมูลของคุณอยู่ที่นี่</p>';
const workspace=shell.querySelector('[data-mm-workspace]');
if(workspace){
 const identity=workspace.querySelector('.mmidentity');
 const work=workspace.querySelector('[aria-label="งานของคุณ"]');
 if(identity&&work){workspace.prepend(work,identity);work.classList.add('mm-lv-work');}
 const profile=workspace.querySelector('#mmd-model-self-service');
 const gallery=workspace.querySelector('[data-mm-gallery]')?.closest('section');
 const mediaHost=workspace.querySelector('[data-mm-media-host]');
 if(profile&&gallery&&mediaHost){
  const you=doc.createElement('details');you.id='mm-lv-you';you.className='mm-lv-panel';
  const youTitle=doc.createElement('summary');youTitle.dataset.mmLvText='you';youTitle.textContent='ข้อมูลของคุณ';
  profile.before(you);you.append(youTitle,profile);
  const media=doc.createElement('details');media.id='mm-lv-media';media.className='mm-lv-panel';
  const mediaTitle=doc.createElement('summary');mediaTitle.dataset.mmLvText='media';mediaTitle.textContent='รูปภาพและคลิป';
  gallery.before(media);media.append(mediaTitle,gallery,mediaHost);
  const quick=doc.createElement('nav');quick.className='mm-lv-quick';quick.setAttribute('aria-label','Quick access');
  quick.innerHTML='<a href="#mm-lv-you" data-mm-lv-open="mm-lv-you"><span data-mm-lv-text="quickYou">ข้อมูลของฉัน</span><span aria-hidden="true">↗</span></a><a href="#mm-lv-media" data-mm-lv-open="mm-lv-media"><span data-mm-lv-text="quickMedia">รูปและคลิป</span><span aria-hidden="true">↗</span></a>';
  you.before(quick);
 }
}
// Keep secondary rules accessible but not above the primary operational surface.
const guideLinks=shell.querySelector('.mmshortcuts');
if(guideLinks&&!guideLinks.closest('.mm-lv-guides')){
 const guides=doc.createElement('details');guides.className='mm-lv-guides';guides.id='mm-lv-guides';
 const summary=doc.createElement('summary');summary.dataset.mmLvText='guides';summary.textContent='คู่มือและกติกา';
 guideLinks.before(guides);guides.append(summary,guideLinks);
}
const dock=doc.createElement('nav');dock.className='mm-lv-dock';dock.setAttribute('aria-label','เมนูหลัก');
dock.innerHTML='<a href="#mmd-model-home-v4" aria-current="page" data-mm-lv-nav="home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/></svg><span>HOME</span></a><a href="/sigil/model/dashboard/jobs" data-mm-lv-nav="jobs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/></svg><span>JOBS</span></a><a href="/sigil/model/console" data-mm-lv-nav="console"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v4m0 10v4m-9-9h4m10 0h4"/></svg><span>CONSOLE</span></a><a href="#mm-lv-you" data-mm-lv-nav="you" data-mm-lv-open="mm-lv-you"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg><span>YOU</span></a>';
root.append(dock);
const messages={
 th:{space:'พื้นที่ของคุณ',homeTitle:'งานปัจจุบัน',homeDescription:'งาน ความพร้อม และข้อมูลของคุณอยู่ที่นี่',you:'ข้อมูลของคุณ',media:'รูปภาพและคลิป',quickYou:'ข้อมูลของฉัน',quickMedia:'รูปและคลิป',guides:'คู่มือและกติกา'},
 en:{space:'Your space',homeTitle:'Current work',homeDescription:'Jobs, availability and your profile in one place',you:'Your profile',media:'Photos and videos',quickYou:'My profile',quickMedia:'Photos & videos',guides:'Guides & policies'},
 zh:{space:'你的空间',homeTitle:'当前工作',homeDescription:'在这里查看工作、接单状态和个人资料',you:'你的资料',media:'照片与视频',quickYou:'个人资料',quickMedia:'照片与视频',guides:'指南与规定'}
};
const params=new URLSearchParams(win.location.search);
let lang=messages[params.get('lang')]?params.get('lang'):'th';
function updateLanguage(){
 root.querySelectorAll('[data-mm-lv-text]').forEach(el=>{const v=messages[lang][el.dataset.mmLvText];if(v)el.textContent=v;});
 root.querySelectorAll('[data-mm-lv-lang]').forEach(el=>el.setAttribute('aria-checked',String(el.dataset.mmLvLang===lang)));
 root.dataset.mmLvLang=lang;
}
updateLanguage();
function setNavCurrent(tab){dock.querySelectorAll('a').forEach(a=>{if(a.dataset.mmLvNav===tab)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
root.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-mm-lv-lang]');
 if(button&&messages[button.dataset.mmLvLang]){
  lang=button.dataset.mmLvLang;updateLanguage();
  if(win.history?.replaceState){const url=new URL(win.location.href);url.searchParams.set('lang',lang);win.history.replaceState(null,'',url.pathname+url.search+url.hash);}
 }
 const opener=event.target.closest?.('[data-mm-lv-open]');
 if(opener){const panel=root.querySelector('#'+opener.dataset.mmLvOpen);if(panel){panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'start'});setNavCurrent('you');}}
 const home=event.target.closest?.('[data-mm-lv-nav="home"]');
 if(home)setNavCurrent('home');
 const nav=event.target.closest?.('a[data-mm-lv-nav="jobs"],a[data-mm-lv-nav="console"]');
 if(nav){const target=new URL(nav.getAttribute('href'),win.location.origin);if(target.origin===win.location.origin&&['/sigil/model/dashboard/jobs','/sigil/model/console'].includes(target.pathname)){
  const sourceParams=new URLSearchParams(win.location.search);for(const key of ['t','liff_env','lang'])if(sourceParams.has(key)&&!target.searchParams.has(key))target.searchParams.set(key,sourceParams.get(key));
  nav.href=target.href;
 }}
});
win.addEventListener('mmd:model-session-ready',event=>{
 const p=event.detail,s=p?.session;
 if(p?.ok!==true||!s?.session_id)return;
 const lanes=[s.model_work_lane,s.payout_terms?.money_lane].filter(Boolean);
 root.dataset.mmLvLane=lanes.length&&lanes.every(x=>x==='private_model')?'private':lanes.length&&lanes.every(x=>x==='public_model')?'public':'neutral';
 const orig=root.querySelector('[data-mm-console]'),consoleLink=dock.querySelector('[data-mm-lv-nav="console"]');
 if(orig&&consoleLink)consoleLink.href=orig.href;
});
win.addEventListener('mmd:model-workspace-locked',()=>{root.dataset.mmLvLane='neutral';setNavCurrent('home');});
})(window,document);