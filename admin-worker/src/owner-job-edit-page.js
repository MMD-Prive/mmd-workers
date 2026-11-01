export function renderOwnerJobEdit(){return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>แก้ไขงาน · SĪGIL System</title><style>
:root{color-scheme:light;font:16px/1.6 system-ui,sans-serif;color:#292b2e;background:#f6f6f4}*{box-sizing:border-box}body{margin:0}main{max-width:780px;margin:auto;padding:24px 18px 80px}a{color:#8c441d}h1{font-size:28px;margin:16px 0 4px}h2{font-size:19px;margin:0 0 12px}p{margin:6px 0 18px}.muted{color:#62656b}section{background:white;padding:22px;border:1px solid #dddeda;border-radius:18px;margin:16px 0}label{display:block;margin:12px 0}input,button{font:inherit;min-height:46px;border-radius:10px;border:1px solid #a3a6aa;padding:10px 12px}input{width:100%;background:white;color:#222}button{cursor:pointer;background:#ffe0c5;color:#56270d;border-color:#dfb08c;font-weight:650}button:disabled{opacity:.55;cursor:default}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.result{display:flex;align-items:center;gap:12px;text-align:left;width:100%;margin:8px 0;background:#fff8f1}.result img,#modelPhoto{width:62px;height:74px;object-fit:cover;border-radius:8px;background:#eee}.chosen{display:flex;gap:15px;align-items:center}.summary{background:#fff5e9;border-color:#e6c09e;font-size:17px}.summary b{font-size:22px}.actions{display:flex;gap:12px;flex-wrap:wrap}.actions button{flex:1}#message{white-space:pre-wrap}progress{width:100%;accent-color:#b55f2c}#loadState{font-size:14px;color:#73502f}dialog{width:calc(100% - 32px);max-width:520px;border:1px solid #ddd;border-radius:18px;padding:24px;color:#222}dialog::backdrop{background:#1117}.history{font-size:14px;border-top:1px solid #ddd;padding:12px 0}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #9c4a1c;outline-offset:3px}[hidden]{display:none!important}@media(max-width:480px){section{padding:16px}.grid{gap:10px}main{padding:16px 12px 60px}h1{font-size:25px}}
</style></head><body><main><a href="/internal/admin/jobs/all">← งานทั้งหมด</a><h1>แก้ไขงาน</h1><p class="muted">เปลี่ยนน้องและปรับราคาในงานเดิม</p><section id="picker"><h2>เลือกงานที่ต้องการแก้ไข</h2><label>ชื่อลูกค้าหรือน้อง<input id="jobQuery" autocomplete="off"></label><button id="findJobs" type="button">ค้นหางาน</button><div id="jobList"></div></section><details><summary>เปิดด้วยรหัสงาน</summary><form id="lookup"><label>รหัสงาน<input id="session" required autocomplete="off"></label><button>เปิดงาน</button></form></details><div id="loadState" role="status" hidden><progress id="progress" max="100" value="0"></progress><span id="percent">0%</span></div><p id="message" role="status" aria-live="polite"></p><button id="retry" type="button" hidden>ลองใหม่</button><form id="editor" hidden>
<section><h2 id="client"></h2><p id="where" class="muted"></p><div class="chosen"><img id="modelPhoto" alt="รูปน้องที่เลือก"><div><strong id="modelName"></strong><div class="muted">น้องที่รับงาน</div></div></div><details><summary>เปลี่ยนน้อง</summary><label>ค้นหาน้องๆและนายแบบ<input id="search" autocomplete="off"></label><button id="searchButton" type="button">ค้นหา</button><div id="results"></div></details></section>
<section><h2>ราคาลูกค้า</h2><div class="grid"><label>PN<input id="clientBase" type="number" min="0.01" step="0.01" required></label><label>ค่าเดินทาง<input id="travel" type="number" min="0" step="0.01" required></label></div><div id="clientAddons"></div></section>
<section><h2>ยอดถึงตัวน้อง</h2><div class="grid"><label>PN<input id="modelBase" type="number" min="0.01" step="0.01" required></label><label>ค่าเดินทางน้อง<input id="modelTravel" type="number" min="0" step="0.01" required></label></div><div id="modelAddons"></div></section>
<section class="summary"><div>ยอดลูกค้า <b id="total"></b></div><div>ยอดถึงตัวน้อง <b id="payout"></b></div><div>รับเงินตามรายการเดิม <span id="paid"></span></div><div>คงเหลือ <b id="remaining"></b></div></section>
<label>เหตุผลที่แก้ไข<input id="reason" minlength="3" maxlength="300" required></label><p class="muted">หลังแก้ไข ลูกค้าและน้องต้องอ่านรายละเอียดและยืนยันใหม่ การบันทึกจะไม่ส่งข้อความให้อัตโนมัติ</p><button id="review">ตรวจทานการแก้ไข</button></form><section id="historyBox" hidden><details><summary>ประวัติการแก้ไข</summary><div id="history"></div></details></section>
<dialog id="confirm"><h2>ตรวจทานก่อนบันทึก</h2><p id="confirmText"></p><div class="actions"><button id="back" type="button">กลับไปแก้</button><button id="save" type="button">บันทึกการแก้ไข</button></div></dialog></main><script>
(function(){
'use strict';
const $=id=>document.getElementById(id);
const fmt=v=>Number(v).toLocaleString('th-TH',{maximumFractionDigits:2})+' บาท';
const labels={mk:'MK',burn:'Burn',live:'Live',group:'Group'};
const tasks=new Map();
let job=null,rev='',model=null,addons=[],pending=null,saveLocked=false,retryAction=null;
const errors={edit_list_incomplete:'โหลดรายการงานยังไม่ครบ กรุณาลองใหม่หรือค้นหาด้วยชื่อลูกค้า',job_changed_reload:'งานนี้มีการเปลี่ยนแปลงแล้ว กรุณาเปิดงานใหม่ก่อนแก้ไข',job_already_started:'งานนี้เริ่มดำเนินการแล้ว กรุณาตรวจรายการกับเปอร์ก่อนปรับยอด',pricing_review_required:'งานนี้มีรายละเอียดราคาเพิ่มเติม ต้องตรวจรายการเดิมก่อนแก้ไข',partner_settlement_review_required:'งานนี้มีข้อตกลง Partner ต้องตรวจส่วนแบ่งก่อนแก้ไข',settlement_review_required:'ยอดใหม่ต่ำกว่ายอดรับเงิน หรือยอดถึงตัวเกินยอดลูกค้า กรุณาตรวจราคา',edit_conflict_requires_review:'พบข้อมูลเปลี่ยนระหว่างบันทึก หยุดไว้ให้ตรวจรายการก่อน กรุณาแจ้งเปอร์',edit_recovery_required:'บันทึกยังไม่ครบ กรุณากดบันทึกซ้ำรายการเดิม หากเปิดหน้าใหม่แล้วกรุณาแจ้งเปอร์พร้อมรหัสงาน',edit_in_progress:'กำลังบันทึกรายการนี้อยู่ กรุณารอสักครู่',unauthorized:'กรุณาเข้าสู่ระบบใหม่',forbidden:'บัญชีนี้ไม่มีสิทธิ์แก้ไขงาน',job_not_unique:'ไม่พบงานที่ตรงเพียงรายการเดียว',model_unavailable:'น้องที่เลือกยังไม่พร้อมสำหรับการผูกงาน กรุณาตรวจรายการ',invalid_amount:'กรุณาตรวจตัวเลขราคาให้ถูกต้อง',invalid_edit:'กรุณาระบุเหตุผลและเลือกน้องให้ครบ',edit_unavailable:'ยังเปิดระบบแก้ไขไม่ได้ กรุณาลองใหม่',audit_capacity_reached:'ประวัติงานนี้มีรายละเอียดมาก กรุณาให้เปอร์ตรวจรายการก่อนแก้ไข'};
const current=t=>tasks.get(t.key)===t&&!t.cancelled;
const foreground=()=>[...tasks.values()].some(t=>t.active&&t.key!=='history');
function sync(){
  const active=foreground();
  $('loadState').hidden=!active;
  $('progress').value=active?25:100;
  $('percent').textContent=active?'25%':'100%';
  $('save').disabled=active||!pending;
  $('review').disabled=active||saveLocked||!job;
  $('retry').disabled=active;
  for(const root of ['picker','lookup','editor'])for(const el of $(root).querySelectorAll('input,button')){
    if(el.id!=='review')el.disabled=saveLocked;
  }
}
function cancel(key){const t=tasks.get(key);if(t){t.cancelled=true;t.active=false;t.controller.abort();tasks.delete(key);}sync();}
function start(key){cancel(key);const t={key,controller:new AbortController(),active:true,cancelled:false};tasks.set(key,t);sync();return t;}
function finish(t){if(current(t)){t.active=false;sync();}}
function clearRetry() {retryAction=null;$('retry').hidden=true;}
function offerRetry(action){retryAction=action;$('retry').hidden=false;}
// Race the entire fetch + JSON read: abort alone cannot bound a stalled body.
async function api(t,url,body){
  const signal=t.controller.signal;
  let timer,onAbort;
  const interrupted=new Promise((_,reject)=>{
    onAbort=()=>reject(signal.reason||new Error('cancelled'));
    signal.addEventListener('abort',onAbort,{once:true});
    if(signal.aborted)onAbort();
    timer=setTimeout(()=>t.controller.abort(new Error('request_timeout')),15000);
  });
  try{
    return await Promise.race([interrupted,(async()=>{
      const r=await fetch(url,{signal,credentials:'same-origin',cache:'no-store',headers:body?{'content-type':'application/json'}:{},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
      const d=await r.json();
      if(!r.ok||!d.ok)throw Object.assign(Error(errors[d.error]||'ทำรายการไม่ได้ กรุณาลองใหม่'),{code:d.error});
      return d;
    })()]);
  }finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);}
}
function readError(e){return e.message==='request_timeout'?'โหลดข้อมูลนานเกินไป กรุณาลองใหม่':Object.values(errors).includes(e.message)?e.message:'ทำรายการไม่ได้ กรุณาลองใหม่';}
function selected(m){model=m;$('modelName').textContent=m.name;$('modelPhoto').src='/v1/admin/calendar/model-photo?model_id='+encodeURIComponent(m.id);$('results').replaceChildren();pending=null;sync();}
function values(){return {client_base:Number($('clientBase').value),model_base:Number($('modelBase').value),travel:Number($('travel').value),model_travel:Number($('modelTravel').value),addons:addons.map(o=>({option:o,client_amount_thb:Number($('c_'+o).value),model_payout_thb:Number($('m_'+o).value)}))};}
function totals(){const v=values(),amount=v.client_base+v.travel+v.addons.reduce((s,a)=>s+a.client_amount_thb,0),payout=v.model_base+v.model_travel+v.addons.reduce((s,a)=>s+a.model_payout_thb,0);$('total').textContent=fmt(amount);$('payout').textContent=fmt(payout);$('paid').textContent=fmt(job.paid);$('remaining').textContent=fmt(amount-job.paid);return {amount,payout};}
function resetJob(){
  for(const key of ['job','models','history'])cancel(key);
  job=null;model=null;pending=null;rev='';addons=[];
  $('editor').hidden=true;$('historyBox').hidden=true;
  $('history').replaceChildren();$('results').replaceChildren();
  $('search').value='';$('reason').value='';$('confirm').close();sync();
}
async function load(){
  if(saveLocked)return;
  const id=$('session').value.trim();
  resetJob();clearRetry();$('message').textContent='';
  const t=start('job');
  try{
    const d=await api(t,'/v1/admin/jobs/edit?session_id='+encodeURIComponent(id));
    if(!current(t)||$('session').value.trim()!==id)return;
    if(d.job.blocked)throw Error(errors[d.job.blocked]||'งานนี้ต้องตรวจรายละเอียดก่อนแก้ไข');
    job=d.job;rev=d.revision;
    $('client').textContent=job.client;$('where').textContent=[job.date,job.location].join(' · ');
    selected({id:job.model_id,name:job.model_name});
    const p=job.pricing;
    $('clientBase').value=p.client_base_amount_thb;$('modelBase').value=p.model_base_payout_thb;
    $('travel').value=job.travel;$('modelTravel').value=job.model_travel;
    addons=[...new Set(['mk',...p.addons.map(a=>a.option)])];
    for(const [container,prefix,key] of [['clientAddons','c_','client_amount_thb'],['modelAddons','m_','model_payout_thb']]){
      $(container).replaceChildren();
      for(const o of addons){const label=document.createElement('label');label.textContent=labels[o]||o;const input=document.createElement('input');input.type='number';input.min='0';input.step='.01';input.required=true;input.id=prefix+o;input.value=p.addons.find(a=>a.option===o)?.[key]||0;label.append(input);$(container).append(label);}
    }
    $('editor').hidden=false;totals();history(job);
  }catch(e){if(current(t)){$('message').textContent=readError(e);offerRetry(load);}}
  finally{finish(t);}
}
async function history(target){
  const t=start('history');
  try{
    const d=await api(t,'/v1/admin/jobs/edit?session_id='+encodeURIComponent(target.session_id)+'&history=1');
    if(!current(t)||job!==target)return;
    $('historyBox').hidden=false;$('history').replaceChildren();
    for(const h of d.history||[]){const p=document.createElement('p');p.className='history';p.textContent=new Date(h.at).toLocaleString('th-TH')+' · '+h.reason+' · '+h.before.model_name+' → '+h.after.model_name+' · '+fmt(h.before.amount)+' → '+fmt(h.after.amount);$('history').append(p);}
    if(!d.history?.length)$('history').textContent='ยังไม่มีการแก้ไขผ่านหน้านี้';
    if(d.pending){saveLocked=true;$('message').textContent='มีรายการบันทึกค้าง กรุณาแจ้งเปอร์พร้อมรหัสงาน';clearRetry();sync();}
  }catch{if(current(t)&&job===target){$('historyBox').hidden=false;$('history').textContent='โหลดประวัติไม่ได้ กรุณาเปิดงานอีกครั้ง';}}
  finally{finish(t);}
}
async function findJobs(){
  if(saveLocked)return;
  const query=$('jobQuery').value;
  $('jobList').replaceChildren();clearRetry();$('message').textContent='';
  const t=start('list');
  try{
    const d=await api(t,'/v1/admin/jobs/edit?list=1&q='+encodeURIComponent(query));
    if(!current(t)||$('jobQuery').value!==query)return;
    for(const j of d.jobs){const b=document.createElement('button');b.type='button';b.className='result';b.textContent=j.date+' · '+j.client+' · '+j.model+' · '+fmt(j.amount);b.onclick=()=>{if(saveLocked||!current(t)||$('jobQuery').value!==query)return;$('session').value=j.session_id;load();};$('jobList').append(b);}
    if(!d.jobs.length)$('jobList').textContent='ไม่พบงานที่กำลังจะมาถึง';
  }catch(e){if(current(t)){$('message').textContent=readError(e);offerRetry(findJobs);}}
  finally{finish(t);}
}
async function searchModels(){
  if(saveLocked||!job||$('editor').hidden)return;
  const query=$('search').value,target=job;
  $('results').replaceChildren();clearRetry();$('message').textContent='';
  const t=start('models');
  try{
    const d=await api(t,'/v1/admin/jobs/edit/models?q='+encodeURIComponent(query));
    if(!current(t)||job!==target||$('search').value!==query)return;
    for(const m of d.models){const b=document.createElement('button');b.type='button';b.className='result';const img=document.createElement('img');img.alt='';img.src='/v1/admin/calendar/model-photo?model_id='+encodeURIComponent(m.id);const span=document.createElement('span');span.textContent=m.name;b.append(img,span);b.onclick=()=>{if(!saveLocked&&current(t)&&job===target&&$('search').value===query)selected(m);};$('results').append(b);}
    if(!d.models.length)$('results').textContent='ไม่พบชื่อที่ค้นหา';
  }catch(e){if(current(t)&&job===target){$('message').textContent=readError(e);offerRetry(searchModels);}}
  finally{finish(t);}
}
async function save(){
  if(foreground()||!pending||!job)return;
  // Keep this exact request (including request_id) after any uncertain outcome.
  const body=pending,target=job,modelName=model.name;
  saveLocked=true;clearRetry();const t=start('save');
  try{
    const d=await api(t,'/v1/admin/jobs/edit',body);
    if(!current(t))return;
    pending=null;saveLocked=false;$('confirm').close();$('editor').hidden=true;
    $('message').textContent='บันทึกแล้ว · '+modelName+' · ยอดลูกค้า '+fmt(d.amount)+' · ยอดถึงตัว '+fmt(d.payout)+' · คงเหลือ '+fmt(d.remaining);
    history(target);
  }catch(e){if(current(t)){
    $('confirm').close();
    const rejected=['invalid_amount','invalid_edit','model_unavailable','settlement_review_required','job_already_started','pricing_review_required','partner_settlement_review_required','job_changed_reload','forbidden_origin','unauthorized','forbidden','invalid_session','job_not_unique','audit_capacity_reached'].includes(e.code);
    if(rejected){saveLocked=false;pending=null;$('message').textContent=e.message;offerRetry(load);return;}
    $('message').textContent=(e.message==='request_timeout'?'ยังยืนยันผลบันทึกไม่ได้':readError(e))+' · กดลองใหม่เพื่อส่งรายการเดิม หากยังไม่สำเร็จ กรุณาแจ้งเปอร์พร้อมรหัสงาน';
    offerRetry(save);
  }}finally{finish(t);}
}
$('retry').onclick=()=>{if(!foreground()&&retryAction)retryAction();};
$('findJobs').onclick=findJobs;
$('lookup').onsubmit=e=>{e.preventDefault();load();};
$('session').oninput=()=>{if(!saveLocked){resetJob();clearRetry();$('message').textContent='';}};
$('jobQuery').oninput=()=>{if(!saveLocked){cancel('list');$('jobList').replaceChildren();clearRetry();}};
$('search').oninput=()=>{if(!saveLocked){cancel('models');$('results').replaceChildren();clearRetry();}};
$('editor').oninput=()=>{if(!saveLocked&&job){pending=null;totals();sync();}};
$('searchButton').onclick=searchModels;
$('editor').onsubmit=e=>{
  e.preventDefault();if(saveLocked||foreground()||!job||!model||$('editor').hidden)return;
  const t=totals();pending={session_id:job.session_id,revision:rev,request_id:crypto.randomUUID(),reason:$('reason').value.trim(),model_id:model.id,...values()};
  $('confirmText').textContent=job.client+' · '+model.name+' · ยอดลูกค้า '+fmt(t.amount)+' · ยอดถึงตัว '+fmt(t.payout)+' · รับแล้ว '+fmt(job.paid)+' · คงเหลือ '+fmt(t.amount-job.paid);
  sync();$('confirm').showModal();
};
$('back').onclick=()=>$('confirm').close();$('save').onclick=save;
window.addEventListener('beforeunload',e=>{if(saveLocked){e.preventDefault();e.returnValue='';}});
$('session').value=new URLSearchParams(location.search).get('session_id')||'';
if($('session').value)load();else findJobs();
})();
</script></body></html>`;}

export function ownerEditLink(sessionId=''){
  return '<a href="/internal/admin/jobs/edit'+(sessionId?'?session_id='+encodeURIComponent(sessionId):'')+'" style="position:fixed;right:16px;bottom:24px;z-index:10000;background:#ffe0c5;color:#56270d;border:1px solid #d5a783;padding:12px 18px;border-radius:12px;font:600 15px system-ui;text-decoration:none;box-shadow:0 4px 16px #0002">แก้ไขงาน</a>';
}

