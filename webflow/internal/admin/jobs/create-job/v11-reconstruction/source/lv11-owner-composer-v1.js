// Canonical Webflow mirror for /internal/admin/jobs/create-job
// LV11 Owner Composer — staged 2026-09-28.
// Presentation / operator continuity only. No business authority moves into Webflow.

<script id="mmd-create-job-lv11-owner-composer">
(()=>{'use strict';
const boot=()=>{
 const root=document.getElementById('mmd-cj-split-v1');
 if(!root||root.dataset.lv11OwnerComposer==='1')return;
 root.dataset.lv11OwnerComposer='1';
 const q=(s,p=root)=>p.querySelector(s),qa=(s,p=root)=>Array.from(p.querySelectorAll(s)),by=k=>q('[data-cj="'+k+'"]');
 const K='https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6ab030ae56be7bcca053d2cd_Kenji%20sigil%20start.webp';
 const D='mmd.create-job.draft.v1';
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
 let clientRecords=[],modelRecords=[],selectedClient=null,gallery=[],gIndex=0,gZoom=1,gFocus=null;

 function photos(r){
   const a=[],seen=new Set(),push=v=>{if(!v||a.length>=8)return;if(typeof v==='string'){const u=v.trim();if(u&&!seen.has(u)){seen.add(u);a.push(u)}return}if(Array.isArray(v)){v.forEach(push);return}if(typeof v==='object')push(v.url||v.src||v.href||v.secure_url||v.thumbnail_url||v.image_url)};
   ['profile_photos','profilePhotos','profile_images','profileImages','photos','gallery','images'].forEach(k=>push(r?.[k]));
   push(r?.profile_image_url||r?.primary_image_url||r?.thumbnail_url||r?.photo_url||r?.image_url||r?.card_image_url||r?.avatar_url||r?.profile_image||r?.photo||r?.image);
   return a.slice(0,8);
 }
 function clientName(r){return String(r?.current_line_rename||r?.per_rename||r?.remembered_name||r?.client_name||r?.canonical_name||r?.name||'Client')}
 function modelName(r){return String(r?.model_name||r?.working_name||r?.display_name||r?.name||r?.code||'Model')}
 function notice(msg,tone='ok'){const n=by('notice');if(!n)return;n.textContent=msg;n.className='mmd-cj__alert is-'+tone}

 function addChrome(){
   qa('.mmd-cj__card[data-step] .mmd-cj__cardHead').forEach(h=>{if(h.querySelector('.mmd-cj__kenjiAsset'))return;const w=document.createElement('span');w.className='mmd-cj__kenjiAsset';w.setAttribute('aria-hidden','true');w.innerHTML='<img src="'+K+'" alt="" loading="lazy" decoding="async">';h.appendChild(w)});
   const shell=q('.mmd-cj__shell'),grid=q('.mmd-cj__grid'),steps=q('.mmd-cj__steps'),n=by('notice');
   if(shell&&grid&&steps&&n&&!q('.mmd-cj__rail')){
     const rail=document.createElement('aside');rail.className='mmd-cj__rail';rail.setAttribute('aria-label','Create Job stages');
     rail.innerHTML='<div class="mmd-cj__railBrand"><img src="'+K+'" alt=""><div><small>KENJI</small><b>JOB FLOW</b></div></div><div class="mmd-cj__railSteps"></div><div class="mmd-cj__railStatus"></div>';
     shell.insertBefore(rail,grid);q('.mmd-cj__railSteps',rail).appendChild(steps);q('.mmd-cj__railStatus',rail).appendChild(n);
   }
   ensureDraft();ensureNeeds();
 }

 function readDraft(){try{const d=JSON.parse(localStorage.getItem(D)||'null');return d&&d.version===1&&d.fields?d:null}catch{return null}}
 function ensureDraft(){
   const side=q('.mmd-cj__side');if(!side)return null;let p=by('draftResumePanel');
   if(!p){p=document.createElement('section');p.className='mmd-cj__draftPanel';p.dataset.cj='draftResumePanel';p.innerHTML='<div class="mmd-cj__draftPanelHead"><img src="'+K+'" alt=""><div><small>KENJI · DRAFT</small><b data-cj="draftResumeTitle">ยังไม่มี Draft</b></div></div><span data-cj="draftResumeMeta">ระบบจะเก็บงานที่ยังทำไม่เสร็จให้อัตโนมัติ</span><button type="button" data-cj="draftResumeOpen" disabled>เปิด Draft</button>';const top=q('.mmd-cj__sideTop',side);top?top.insertAdjacentElement('afterend',p):side.prepend(p)}
   renderDraft();return p;
 }
 function renderDraft(){const p=by('draftResumePanel'),d=readDraft();if(!p)return;const b=by('draftResumeOpen'),t=by('draftResumeTitle'),m=by('draftResumeMeta');b.disabled=!d;if(!d){t.textContent='ยังไม่มี Draft';m.textContent='ระบบจะเก็บงานที่ยังทำไม่เสร็จให้อัตโนมัติ';return}const names=[d.client_hint?.client_name,d.model_hint?.model_name].filter(Boolean);t.textContent=names.length?names.join(' · '):'งานที่ยังทำไม่เสร็จ';let when='';try{when=d.saved_at?new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'short'}).format(new Date(d.saved_at)):''}catch{}m.textContent=[d.world==='public'?'Public':d.world==='private'?'Private':'',when?'บันทึก '+when:''].filter(Boolean).join(' · ')||'พร้อมเปิดต่อ'}
 function ensureNeeds(){const side=q('.mmd-cj__side');if(!side)return null;let p=by('needsYouPanel');if(!p){p=document.createElement('section');p.className='mmd-cj__needsPanel';p.dataset.cj='needsYouPanel';p.innerHTML='<div><small>NEEDS YOU</small><b data-cj="needsYouTitle">กำลังตรวจ</b></div><ul data-cj="needsYouList"></ul>';const d=ensureDraft();d?d.insertAdjacentElement('afterend',p):side.prepend(p)}return p}
 function missing(){
   const x=[];if(!q('[data-cj="clientSelected"]:not([hidden])'))x.push('ลูกค้า');if(!q('[data-cj-world].is-selected'))x.push('ประเภทงาน');
   if(!by('folder')?.value)x.push('กลุ่มนายแบบ');if(!by('gender')?.value)x.push('ประเภทนายแบบ');if(!q('[data-cj="modelSelected"]:not([hidden])'))x.push('นายแบบ');
   if(!by('date')?.value)x.push('วันที่');if(!by('start')?.value)x.push('เวลาเริ่ม');if(!by('duration')?.value)x.push('ระยะเวลา');if(!by('location')?.value)x.push('สถานที่');
   if(!(Number(String(by('finalPrice')?.value||'').replace(/[^0-9.]/g,''))>0))x.push('Final Price');return x;
 }
 function renderNeeds(){const p=ensureNeeds();if(!p)return;const a=missing(),t=by('needsYouTitle'),l=by('needsYouList');p.dataset.ready=a.length?'0':'1';t.textContent=a.length?'เหลือ '+a.length+' จุด':'พร้อมสร้างงาน';l.innerHTML=a.length?a.slice(0,5).map(v=>'<li>'+esc(v)+'</li>').join('')+(a.length>5?'<li>+'+(a.length-5)+' จุดเพิ่มเติม</li>':''):'<li>ข้อมูลหลักครบแล้ว · ตรวจ Review ก่อนสร้าง</li>'}

 async function json(url,opts={}){const res=await fetch(url,{credentials:'include',cache:'no-store',...opts,headers:{...(opts.headers||{}),...(opts.body?{'content-type':'application/json'}:{})}});const d=await res.json().catch(()=>({}));if(!res.ok||d.ok===false)throw new Error(d?.error?.message||d?.error||d?.message||'HTTP '+res.status);return d}
 async function refreshClients(recent=false){
   try{let d;if(recent)d=await json(root.dataset.clientRecentEndpoint||'/v1/admin/clients/recent');else{const query=by('clientQuery')?.value?.trim();if(!query)return;d=await json(root.dataset.clientLookupEndpoint||'/v1/admin/clients/lineage-lookup',{method:'POST',body:JSON.stringify({query,canonical_only:true,allow_manual_fallback:false})})}clientRecords=Array.isArray(d.records)?d.records:Array.isArray(d.items)?d.items:[];setTimeout(decorateClients,80)}catch{}
 }
 function modelUrl(){
   const u=new URL(root.dataset.modelSearchEndpoint||'/v1/admin/models/search',location.origin),world=q('[data-cj-world].is-selected')?.dataset.cjWorld||'',folder=by('folder')?.value||'',gender=by('gender')?.value||'';
   u.searchParams.set('work_type',world);u.searchParams.set('selected_access_folder',folder);u.searchParams.set('folder',folder);u.searchParams.set('selected_orientation',gender);u.searchParams.set('customer_lane',gender);
   if(world==='private'){u.searchParams.set('booking_visibility','private');u.searchParams.set('inventory_only','1');const pw=by('privateWork')?.value||'';if(pw){u.searchParams.set('private_work',pw);u.searchParams.set('job_type',pw)}const c=selectedClient||{};[['client_id','client_id'],['member_id','member_id'],['memberstack_id','memberstack_id'],['line_record_id','line_record_id'],['line_user_id','line_user_id'],['member_email','member_email'],['customer_telegram_username','customer_telegram_username']].forEach(([p,k])=>{if(c[k])u.searchParams.set(p,c[k])})}
   const opts=qa('[data-cj-opt].is-selected').map(b=>b.dataset.cjOpt).filter(Boolean);if(opts.length)u.searchParams.set('service_options',opts.join(','));const qq=by('modelQuery')?.value?.trim();if(qq)u.searchParams.set('q',qq);return u;
 }
 async function refreshModels(){try{const d=await json(modelUrl());modelRecords=Array.isArray(d.items)?d.items:Array.isArray(d.models)?d.models:Array.isArray(d.records)?d.records:[];setTimeout(decorateModels,80)}catch{}}
 function decorateClients(){qa('[data-cj-client-index]').forEach(card=>{const i=Number(card.dataset.cjClientIndex),r=clientRecords[i];if(!r)return;let row=card.closest('.mmd-cj__resultRow');if(!row){row=document.createElement('div');row.className='mmd-cj__resultRow';card.parentNode.insertBefore(row,card);row.appendChild(card)}let b=q('[data-lv11-photo]',row);if(!b){b=document.createElement('button');b.type='button';b.className='mmd-cj__galleryPeek';b.dataset.lv11Photo='client';b.dataset.index=String(i);row.prepend(b)}const p=photos(r);b.classList.toggle('is-empty',!p.length);b.innerHTML=p.length?'<img src="'+esc(p[0])+'" alt="" loading="lazy">'+(p.length>1?'<span>'+p.length+'</span>':''):'รูป'})}
 function decorateModels(){qa('[data-cj-model-index]').forEach(card=>{const i=Number(card.dataset.cjModelIndex),r=modelRecords[i];if(!r)return;let row=card.closest('.mmd-cj__resultRow');if(!row){row=document.createElement('div');row.className='mmd-cj__resultRow';card.parentNode.insertBefore(row,card);row.appendChild(card)}let b=q('[data-lv11-photo]',row);if(!b){b=document.createElement('button');b.type='button';b.className='mmd-cj__galleryPeek';b.dataset.lv11Photo='model';b.dataset.index=String(i);row.prepend(b)}const p=photos(r);b.classList.toggle('is-empty',!p.length);b.innerHTML=p.length?'<img src="'+esc(p[0])+'" alt="" loading="lazy">'+(p.length>1?'<span>'+p.length+'</span>':''):'NO IMAGE'})}

 function modal(){let m=document.getElementById('mmd-cj-lv11-gallery');if(m)return m;m=document.createElement('div');m.id='mmd-cj-lv11-gallery';m.className='mmd-cj__galleryBackdrop';m.setAttribute('aria-hidden','true');m.innerHTML='<section class="mmd-cj__galleryDialog" role="dialog" aria-modal="true" aria-label="Profile Photo"><header><div><b data-g-name>Profile</b><small>Profile Photo · สูงสุด 8 รูป</small></div><button type="button" data-g-close>×</button></header><div class="mmd-cj__galleryStage"><div class="mmd-cj__galleryImageWrap"><img data-g-image alt=""></div><button type="button" class="prev" data-g-prev>‹</button><button type="button" class="next" data-g-next>›</button></div><footer><div class="mmd-cj__galleryTools"><span data-g-count>1 / 1</span><div><button type="button" data-g-minus>−</button><button type="button" data-g-reset>100%</button><button type="button" data-g-plus>+</button></div></div><div class="mmd-cj__galleryStrip" data-g-strip></div></footer></section>';document.body.appendChild(m);return m}
 function zoom(v){gZoom=Math.max(1,Math.min(2.5,Math.round(v*4)/4));const m=modal();q('[data-g-image]',m).style.setProperty('--mmd-gallery-zoom',gZoom);q('[data-g-reset]',m).textContent=Math.round(gZoom*100)+'%'}
 function paint(){const m=modal();if(!gallery.length)return;gIndex=(gIndex+gallery.length)%gallery.length;const im=q('[data-g-image]',m);im.src=gallery[gIndex];q('[data-g-count]',m).textContent=(gIndex+1)+' / '+gallery.length;q('[data-g-prev]',m).disabled=gallery.length<2;q('[data-g-next]',m).disabled=gallery.length<2;zoom(1);q('[data-g-strip]',m).innerHTML=gallery.map((u,i)=>'<button type="button" data-g-index="'+i+'" class="'+(i===gIndex?'is-active':'')+'"><img src="'+esc(u)+'" alt=""></button>').join('')}
 function openGallery(r,focus){const p=photos(r);if(!p.length){notice('ยังไม่มีรูป Profile Photo ของรายการนี้','warn');return}gallery=p;gIndex=0;gFocus=focus;const m=modal();q('[data-g-name]',m).textContent=clientName(r)||modelName(r);m.classList.add('is-open');m.setAttribute('aria-hidden','false');document.documentElement.classList.add('mmd-cj-gallery-open');paint();q('[data-g-close]',m).focus()}
 async function openClientPhoto(i,b){const r=clientRecords[i];if(!r)return;try{const id=String(r.client_id||r.id||'');if(id){const d=await json('/v1/admin/clients/profile-photo/sync',{method:'POST',body:JSON.stringify({client_id:id})});if(Array.isArray(d.profile_photos)&&d.profile_photos.length)r.profile_photos=d.profile_photos.slice(0,8);decorateClients();if(d.added)notice('บันทึกรูป LINE ล่าสุดเข้า Profile Photo แล้ว','ok')}}catch(e){if(!photos(r).length){notice('โหลดรูปโปรไฟล์ไม่สำเร็จ','warn');return}}openGallery(r,b)}
 function closeGallery(){const m=modal();m.classList.remove('is-open');m.setAttribute('aria-hidden','true');document.documentElement.classList.remove('mmd-cj-gallery-open');gallery=[];gFocus?.focus?.()}
 function move(d){if(gallery.length<2)return;gIndex=(gIndex+d+gallery.length)%gallery.length;paint()}

 function setField(k,v){const n=by(k);if(!n||v==null)return;if(n.type==='checkbox')n.checked=!!v;else n.value=String(v);n.dispatchEvent(new Event('change',{bubbles:true}));if(!(n instanceof HTMLSelectElement))n.dispatchEvent(new Event('input',{bubbles:true}))}
 async function waitRows(sel,ms=8000){const end=Date.now()+ms;while(Date.now()<end){const a=qa(sel);if(a.length)return a;await sleep(120)}return[]}
 async function resumeDraft(){
   const d=readDraft(),p=ensureDraft();if(!d||!p)return;if(by('auth')?.dataset.auth!=='ready'){notice('เข้าสู่ระบบก่อนเปิด Draft','warn');return}
   p.dataset.busy='1';by('draftResumeMeta').textContent='กำลังยืนยัน Client และ Model ใหม่…';
   try{
     if(d.client_hint){by('clientQuery').value=d.client_hint.client_id||d.client_hint.client_name||'';by('clientSearch')?.click();await refreshClients(false);await waitRows('[data-cj-client-index]');const key=String(d.client_hint.client_id||'').toLowerCase(),name=String(d.client_hint.client_name||'').toLowerCase();let i=clientRecords.findIndex(r=>(key&&String(r.client_id||r.id||'').toLowerCase()===key)||(name&&clientName(r).toLowerCase()===name));if(i<0)i=0;const card=q('[data-cj-client-index="'+i+'"]');if(!card){notice('เปิด Draft แล้ว · แต่ยังหาลูกค้า canonical เดิมไม่เจอ','warn');return}selectedClient=clientRecords[i]||null;card.click();await sleep(160)}
     const f=d.fields||{};if(d.world)q('[data-cj-world="'+d.world+'"]')?.click();['folder','gender','privateWork'].forEach(k=>setField(k,d[k]||f[k]||''));Object.entries(f).forEach(([k,v])=>{if(!['clientQuery','modelQuery','folder','gender','privateWork'].includes(k))setField(k,v)});
     if(d.model_hint){by('modelQuery').value=d.model_hint.model_id||d.model_hint.model_name||'';by('modelSearch')?.click();await refreshModels();await waitRows('[data-cj-model-index]',10000);const key=String(d.model_hint.model_id||'').toLowerCase(),name=String(d.model_hint.model_name||'').toLowerCase();let i=modelRecords.findIndex(r=>(key&&String(r.model_id||r.id||r.code||'').toLowerCase()===key)||(name&&modelName(r).toLowerCase()===name));if(i<0)i=0;q('[data-cj-model-index="'+i+'"]')?.click()}
     notice('เปิด Draft แล้ว · Client / Model ถูกค้นหาใหม่จากระบบก่อนใช้','ok')
   }finally{p.dataset.busy='0';renderDraft();setTimeout(renderNeeds,80)}
 }

 root.addEventListener('click',e=>{
   const photo=e.target.closest('[data-lv11-photo]');if(photo&&root.contains(photo)){e.preventDefault();e.stopPropagation();const i=Number(photo.dataset.index);photo.dataset.lv11Photo==='client'?openClientPhoto(i,photo):openGallery(modelRecords[i],photo);return}
   const c=e.target.closest('[data-cj-client-index]');if(c){const i=Number(c.dataset.cjClientIndex);selectedClient=clientRecords[i]||selectedClient;setTimeout(renderNeeds,80)}
   if(e.target.closest('[data-cj="clientSearch"]'))setTimeout(()=>refreshClients(false),20);
   if(e.target.closest('[data-cj="clientRecent"]'))setTimeout(()=>refreshClients(true),20);
   if(e.target.closest('[data-cj="modelSearch"]'))setTimeout(refreshModels,20);
   if(e.target.closest('[data-cj="draftResumeOpen"]')){e.preventDefault();resumeDraft()}
   setTimeout(()=>{renderDraft();renderNeeds();addChrome()},100)
 },true);
 root.addEventListener('input',()=>setTimeout(renderNeeds,40),true);root.addEventListener('change',()=>setTimeout(renderNeeds,40),true);
 document.addEventListener('click',e=>{const m=modal();if(!m.classList.contains('is-open'))return;if(e.target===m||e.target.closest('[data-g-close]'))closeGallery();else if(e.target.closest('[data-g-prev]'))move(-1);else if(e.target.closest('[data-g-next]'))move(1);else if(e.target.closest('[data-g-plus]'))zoom(gZoom+.25);else if(e.target.closest('[data-g-minus]'))zoom(gZoom-.25);else if(e.target.closest('[data-g-reset]'))zoom(1);else{const b=e.target.closest('[data-g-index]');if(b){gIndex=Number(b.dataset.gIndex)||0;paint()}}});
 document.addEventListener('keydown',e=>{const m=document.getElementById('mmd-cj-lv11-gallery');if(!m?.classList.contains('is-open'))return;if(e.key==='Escape'){e.preventDefault();closeGallery()}else if(e.key==='ArrowLeft'){e.preventDefault();move(-1)}else if(e.key==='ArrowRight'){e.preventDefault();move(1)}});
 window.addEventListener('storage',e=>{if(e.key===D)renderDraft()});
 addChrome();modal();renderDraft();renderNeeds();
};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();
</script>
