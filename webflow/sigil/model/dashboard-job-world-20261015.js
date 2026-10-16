(function modelJobWorld(global){
'use strict';
function resolveJobWorld(payload,expectedSession=''){
 const s=payload?.session;
 if(payload?.ok!==true||!s||!String(s.session_id||'').trim())return 'public';
 if(expectedSession&&s.session_id!==expectedSession)return 'public';
 const lanes=[s.model_work_lane,s.payout_terms?.money_lane].filter(Boolean);
 if(!lanes.length)return 'public';
 return lanes.every(x=>x==='private_model')?'private':'public';
}
function profileImageUrl(value,origin){
 if(typeof value!=='string'||!value.trim())return '';
 try{const u=new URL(value,origin);if(u.protocol!=='https:')return '';return u.href;}catch{return '';}
}
if(typeof module!=='undefined'&&module.exports)module.exports={resolveJobWorld,profileImageUrl};
if(!global.document)return;
const root=document.getElementById('mmd-model-home-v3');
if(!root||global.__MODEL_JOB_WORLD_V1__)return;global.__MODEL_JOB_WORLD_V1__=true;
const q=s=>root.querySelector(s),text=(s,v)=>{const e=q(s);if(e)e.textContent=v;};
root.querySelectorAll('.model-lane-switch').forEach(x=>x.remove());
function supportCard(){
 if(root.querySelector('[data-model-support-card]'))return;
 const card=document.createElement('aside');card.dataset.modelSupportCard='1';
 const link=document.createElement('a');link.href='https://lin.ee/xRqsALs';link.textContent='ให้ MMD ช่วย';card.appendChild(link);
 (q('.mdhome__shell')||root).appendChild(card);
}
supportCard();
function renderWorld(world,hasJob=false){
 root.dataset.modelBrandLane=world;
 text('.mdhome__eyebrow',world==='private'?'SĪGIL · PRIVATE MODEL':hasJob?'MMD · PUBLIC MODEL':'MMD Privé');
 const title=q('.mdhome__title');
 if(title){title.innerHTML='<span class="model-guide-title">Your guide application</span><span class="model-guide-name">MY MODEL</span>';}
 text('.mdhome__copy',world==='private'?'เช็กบรีฟและเตรียมตัวสำหรับงานของคุณครับ':'โปรไฟล์ รูป และงานของคุณ อยู่ที่นี่ครับ');
 const links=root.querySelectorAll('.model-blend-guide');
 if(links.length>=2){
  links[0].href=world==='private'?'/rules/model/private/job-day':'#mmd-media-upload-v1';
  links[1].href=world==='private'?'/rules/model':'https://t.me/mmdprivebot';
  links[0].querySelector('strong').textContent=world==='private'?'คู่มือวันงาน':'รูปและคลิปของฉัน';
  links[0].querySelector('small').textContent=world==='private'?'บรีฟ · เดินทาง · ระหว่างงาน':'จัดการ Public และ Private media';
  links[1].querySelector('strong').textContent=world==='private'?'กติกาการทำงาน':'ให้ MMD ช่วย';
  links[1].querySelector('small').textContent=world==='private'?'อ่านก่อนรับงาน':'มีเรื่องสงสัย ทักได้เลยครับ';
 }
}
renderWorld('public');
const avatar=q('[data-mdhome-avatar]');
function avatarFallback(){if(!avatar)return;avatar.replaceChildren();const a=document.createElement('a');a.href='#mmd-media-upload-v1';a.className='model-avatar-placeholder';a.setAttribute('aria-label','ยังไม่มีรูปโปรไฟล์ กดเพื่ออัปโหลด');a.innerHTML='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="16" cy="11" r="5"/><path d="M6 28v-3a10 10 0 0 1 20 0v3M25 5v8m-4-4h8"/></svg><span>เพิ่มรูป</span>';avatar.append(a);}
function renderProfile(model={}){
 const src=profileImageUrl(model.current_profile_image_url,location.origin);
 if(!avatar)return;if(!src){avatarFallback();return;}
 const img=document.createElement('img');img.alt='รูปโปรไฟล์ '+(model.working_name||'ของคุณ');img.className='model-avatar-image';img.addEventListener('error',avatarFallback,{once:true});img.src=src;avatar.replaceChildren(img);
}
avatarFallback();
const shortcuts=root.querySelectorAll('.mdhome__rail-card');if(shortcuts[2])shortcuts[2].href='#mmd-media-upload-v1';
text('.mdhome__rail-card:nth-child(3) .mdhome__rail-title','รูปและคลิป');
const profileForm=document.querySelector('[data-mss-profile-form]');
if(profileForm&&!profileForm.closest('details')){
 const details=document.createElement('details');details.className='model-profile-details';const summary=document.createElement('summary');summary.textContent='แก้ข้อมูลโปรไฟล์และสถานะรับงาน';profileForm.before(details);details.append(summary,profileForm);
 root.querySelectorAll('a[href="#mmd-model-self-service"]').forEach(a=>a.addEventListener('click',()=>{details.open=true;}));
}
let pending=false,retryTimer,alive=true,entryState=null;
const controllers=new Set();
async function read(endpoint){const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch(endpoint,{credentials:'include',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});if(!response.ok)return {ok:false,status:response.status};return await response.json();}catch{return {ok:false,status:0};}finally{clearTimeout(timer);controllers.delete(controller);}}
async function refresh(){
 if(pending||!alive)return;pending=true;
 try{
  const params=new URLSearchParams(location.search),endpoint=new URL('/v1/model/session/current',location.origin);
  // Forward the signed work link for server verification; no browser field selects the world.
  const signed=params.get('t');if(signed)endpoint.searchParams.set('t',signed);
  const [job,profile]=await Promise.all([read(endpoint.href),read('/v1/model/profile')]);
  if(!alive)return;
  if(profile?.ok!==true||job?.ok!==true){
   renderWorld('public');
   text('[data-mdhome-job]','ยังตรวจงานไม่สำเร็จ');
   text('[data-mdhome-job-copy]','ยังสรุปไม่ได้ว่าไม่มีงาน กรุณายืนยัน LINE หรือลองใหม่');
   text('[data-mdhome-ready]','ยังไม่ยืนยันข้อมูล');
   if(entryState)text('.mdhome__copy',entryState.copy);
   return;
  }
  const expected=params.get('session_id')||'';
  const valid=job?.ok===true&&Boolean(job.session?.session_id)&&(!expected||job.session.session_id===expected);
  renderWorld(resolveJobWorld(job,expected),valid);
  if(profile?.ok===true)renderProfile(profile.model||{});
 }finally{pending=false;}
}
global.addEventListener('mmd:model-session-ready',()=>{clearTimeout(retryTimer);retryTimer=setTimeout(refresh,150);});
global.addEventListener('mmd:model-entry-state',event=>{
 entryState=event.detail;
 text('[data-mdhome-auth]',event.detail.title);
 text('.mdhome__copy',event.detail.copy);
 text('[data-mdhome-job]','รอยืนยันบัญชีและข้อมูลงาน');
});
global.addEventListener('pageshow',()=>{alive=true;refresh();});
global.addEventListener('pagehide',()=>{alive=false;clearTimeout(retryTimer);controllers.forEach(c=>c.abort());});
refresh();
})(typeof window==='undefined'?globalThis:window);
