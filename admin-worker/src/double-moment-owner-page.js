import {SYSTEM_LIGHT} from '../../webflow/global/sigil-brand-v1.mjs';

export function doubleMomentOwnerClient(){
 const $=id=>document.getElementById(id),root='/v1/admin/double-moment',key='sigil.double-moment.extension.v1';
 const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('th-TH-u-ca-gregory',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}):'ยังยืนยันไม่ได้';
 const messages={legacy_terms_preserved:'สิทธิ์เดิมคงวันหมดอายุเดิม ไม่เปลี่ยนเป็นกติกาใหม่',claim_not_active:'ยังไม่ยืนยันการออกสิทธิ์ชุดนี้',extension_no_unused_moments:'ใช้ครบทั้งสองครั้งแล้ว',extension_outside_five_month_limit:'ขยายไม่ได้เกิน 5 เดือนนับจากออกเครดิตเดิม',extension_pending_requires_retry:'มีคำขอที่ยังยืนยันผลไม่ได้ กรุณาตรวจและส่งคำขอเดิม',extension_credit_on_hold_or_changed:'ชุดสิทธิ์อยู่ระหว่าง HOLD หรือข้อมูลเปลี่ยน ต้องตรวจสอบก่อน',extension_expiry_changed:'ข้อมูลเปลี่ยนแล้ว กรุณาตรวจชุดสิทธิ์อีกครั้ง',unauthorized:'กรุณาเข้าสู่ระบบเปอร์อีกครั้ง',owner_only:'เฉพาะเปอร์เท่านั้น',extension_credit_conflict:'ข้อมูลเครดิตไม่ตรงกัน หยุดไว้ให้ตรวจสอบ',activation_journal_missing:'ยังยืนยันประวัติสิทธิ์ไม่ได้ หยุดไว้ให้ตรวจสอบ'};
 let rows=[],selected=null,context=null,cursor=null,busy=false,generation=0,pending=null;
 try{const value=JSON.parse(sessionStorage.getItem(key)||'null');if(value&&typeof value.request_id==='string'&&typeof value.claim_id==='string'&&typeof value.client_record_id==='string')pending=value;}catch{}
 const persist=()=>{try{if(pending)sessionStorage.setItem(key,JSON.stringify(pending));else sessionStorage.removeItem(key);}catch{throw Error('pending_storage_unavailable');}};
 function status(text){$('status').textContent=text;}
 function sync(){
  $('search').disabled=busy||!!pending;$('query').disabled=busy||!!pending;$('more').disabled=busy||!!pending;
  for(const input of $('sets').querySelectorAll('input'))input.disabled=busy||!!pending;
  $('refresh').disabled=busy||!selected;$('review').disabled=busy||!!pending||!context?.can_extend;
  $('expiry').disabled=busy||!!pending||!context?.can_extend;$('reason').disabled=busy||!!pending||!context?.can_extend;
  const retryReady=context&&pending&&context.claim_id===pending.claim_id&&context.client_record_id===pending.client_record_id&&(context.pending_request?.request_id===pending.request_id||context.can_extend&&context.expires_at===pending.expected_expires_at||context.expires_at===pending.expires_at&&[null,'extension_outside_five_month_limit'].includes(context.blocked_reason));
  $('save').disabled=busy;$('back').disabled=busy;$('retry').hidden=!pending;$('retry').disabled=busy||!retryReady;
 }
 async function api(path,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const r=await fetch(root+path,{credentials:'same-origin',cache:'no-store',signal:controller.signal,...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok||d.ok!==true)throw Object.assign(Error(d.error||'unavailable'),{code:d.error});return d;}finally{clearTimeout(timer);}
 }
 const fail=e=>messages[e.code]||'ยังยืนยันผลไม่ได้ กรุณาตรวจสถานะและลองคำขอเดิม';
 function renderRows(){
  $('sets').replaceChildren();
  for(const row of rows){const label=document.createElement('label');label.className='dm-set';const radio=document.createElement('input');radio.type='radio';radio.name='claim';radio.value=row.claim_id;radio.checked=selected?.claim_id===row.claim_id;radio.onchange=()=>choose(row);const text=document.createElement('span'),title=document.createElement('strong'),detail=document.createElement('small');title.textContent=(row.member_id||'สมาชิกไม่ระบุชื่อ')+' · '+(row.round_id||'สิทธิ์เดิม');detail.textContent=(row.policy_version==='v3'?'2 ครั้ง ครั้งละ 10,000 บาท':'เงื่อนไขเดิม')+' · หมดอายุ '+date(row.expires_at);text.append(title,detail);label.append(radio,text);$('sets').append(label);}
  $('empty').hidden=rows.length>0;$('more').hidden=!cursor;sync();
 }
 async function list(more=false){
  if(busy||pending)return;busy=true;sync();status('กำลังตรวจรายการสิทธิ์');const run=++generation;
  if(!more){rows=[];selected=null;context=null;cursor=null;$('detail').hidden=true;renderRows();}
  try{const q=new URLSearchParams({q:$('query').value.trim(),...(more&&cursor?{cursor}:{})}),d=await api('/claims?'+q);if(run!==generation)return;if(!Array.isArray(d.items))throw Error('invalid_list');if(more&&d.items.some(r=>rows.some(old=>old.claim_id===r.claim_id)))throw Error('duplicate_list');rows=more?[...rows,...d.items]:d.items;cursor=d.next_cursor;renderRows();status(rows.length?'เลือกชุดสิทธิ์':'ไม่พบชุดสิทธิ์');}catch(e){status(fail(e));}finally{busy=false;sync();}
 }
 function renderContext(d){
  context=d;$('detail').hidden=false;$('member').textContent=d.member_id||'สมาชิกไม่ระบุชื่อ';$('round').textContent=d.round_id||'สิทธิ์เดิม';
  $('issued').textContent=date(d.issued_at);$('current').textContent=date(d.expires_at);$('maximum').textContent=d.maximum_expires_at?date(d.maximum_expires_at):'คงเงื่อนไขเดิม';
  $('remaining').textContent=Number.isInteger(d.remaining_moments)?d.remaining_moments+' ครั้ง':'ตามสิทธิ์เดิม';$('reference').textContent=d.claim_id;
  $('expiry').replaceChildren();for(const option of d.options||[]){const el=document.createElement('option');el.value=option.expires_at;el.textContent=date(option.expires_at)+' · รวม '+option.months+' เดือน';$('expiry').append(el);}
  if(!pending&&d.pending_request){pending=d.pending_request;persist();}
  $('blocked').textContent=d.blocked_reason?(messages[d.blocked_reason]||'ต้องตรวจข้อมูลก่อนอนุมัติ'):'';
  $('reason').value=pending?.reason||'';sync();
 }
 async function choose(row){
  if(busy)return;selected=row;context=null;busy=true;$('detail').hidden=true;sync();status('กำลังตรวจชุดสิทธิ์ล่าสุด');
  try{const d=await api('/context?'+new URLSearchParams({client_record_id:row.client_record_id,claim_id:row.claim_id}));if(d.claim_id!==row.claim_id||d.client_record_id!==row.client_record_id)throw Error('wrong_context');renderContext(d);status(pending?'มีคำขอเดิมรอการตรวจผล':'ตรวจข้อมูลล่าสุดแล้ว');}catch(e){status(fail(e));}finally{busy=false;sync();}
 }
 function review(){
  if(busy)return;
  if(!pending){if(!context?.can_extend||!$('form').reportValidity())return;const option=context.options.find(o=>o.expires_at===$('expiry').value);if(!option||Date.parse(option.expires_at)>Date.parse(context.maximum_expires_at)){status(messages.extension_outside_five_month_limit);return;}}
  const target=pending?.expires_at||$('expiry').value;
  $('confirmation').textContent=(context?.member_id||'สมาชิกชุดที่เลือก')+' · '+(context?.round_id||'ชุดสิทธิ์เดิม')+' · ขยายถึง '+date(target)+' · จำนวนครั้งและยอดใช้ไปคงเดิม';
  $('confirm').showModal();
 }
 async function save(){
  if(busy)return;
  if(!pending){if(!context?.can_extend)return;pending={client_record_id:context.client_record_id,claim_id:context.claim_id,request_id:crypto.randomUUID(),expected_expires_at:context.expires_at,expires_at:$('expiry').value,reason:$('reason').value.trim()};try{persist();}catch{pending=null;status('ยังเก็บคำขอนี้ไม่ได้ จึงยังไม่ส่งรายการ');$('confirm').close();return;}}
  busy=true;sync();const request=pending;
  try{const d=await api('/extend',request);if(d.claim_id!==request.claim_id||d.request_id!==request.request_id||d.expires_at!==request.expires_at)throw Error('unknown_result');pending=null;persist();status('อนุมัติแล้ว · ขยายถึง '+date(d.expires_at));context=null;$('confirm').close();busy=false;await choose(selected||request);status('อนุมัติแล้ว · ขยายถึง '+date(d.expires_at));}
  catch(e){$('confirm').close();status(fail(e));if(['extension_expiry_changed','extension_outside_five_month_limit','extension_must_increase_expiry','invalid_extension'].includes(e.code)){pending=null;persist();context=null;$('detail').hidden=true;}}
  finally{busy=false;sync();}
 }
 $('lookup').onsubmit=e=>{e.preventDefault();list();};$('more').onclick=()=>list(true);$('refresh').onclick=()=>choose(selected);
 $('form').onsubmit=e=>{e.preventDefault();review();};$('retry').onclick=()=>{if(!$('retry').disabled)review();};$('save').onclick=save;$('back').onclick=()=>$('confirm').close();
 $('confirm').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 if(pending){selected=pending;choose(pending);}else list();
}

export function renderDoubleMomentOwnerPage(){return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Double Moment · SĪGIL System</title><style>
html body.sigil-directory-offset{padding:0!important}html body #sigil-workspace-directory#sigil-workspace-directory{position:static!important;inset:auto!important;width:calc(100% - 32px)!important;max-width:852px!important;margin:16px auto 0!important;max-height:none!important;box-shadow:none!important;border-radius:6px!important}
*{box-sizing:border-box}body{margin:0;background:#fff;color:#272b30;font:16px/1.65 system-ui,sans-serif;letter-spacing:0}main{max-width:900px;margin:auto;padding:24px 24px 96px}header{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid #c7ccd2;padding-bottom:16px}.dm-logo{width:158px;display:block}.dm-logo svg{width:100%;height:auto;display:block}a{color:#305c65}h1{font-size:28px;line-height:1.25;margin:26px 0 6px}h2{font-size:20px;margin:0 0 8px}p{margin:6px 0 20px;color:#555e65}section{padding:24px 0;border-bottom:1px solid #c7ccd2}label{display:block}input,select,textarea,button{font:inherit;min-height:44px;border:1px solid #9ca6af;border-radius:6px;padding:9px 12px;background:white;color:inherit;max-width:100%}input,select,textarea{width:100%}button{cursor:pointer;font-weight:600}button:disabled{opacity:.55;cursor:not-allowed}.dm-search{display:flex;align-items:end;gap:12px}.dm-search label{flex:1;min-width:0}.dm-set{display:flex;gap:14px;padding:16px 0;border-top:1px solid #e1e4e7;cursor:pointer;align-items:start}.dm-set input{width:20px;min-height:24px;flex-shrink:0;accent-color:#305c65}.dm-set strong,.dm-set small{display:block;overflow-wrap:anywhere}.dm-set small{color:#5b6269}dl{display:grid;grid-template-columns:minmax(110px,1fr) 2fr;gap:10px 16px;margin:18px 0}dt{color:#555e65}dd{margin:0;overflow-wrap:anywhere}.dm-form{display:grid;gap:16px}.dm-form label{display:grid;gap:6px}.dm-action{background:#d9ebe4;border-color:#6c8c80;color:#183c2b}.dm-status{min-height:32px;padding:10px 0;white-space:pre-wrap;overflow-wrap:anywhere}#blocked{color:#8f3b30;margin:14px 0}details{font-size:13px;color:#5b6269;overflow-wrap:anywhere}.dm-actions{display:flex;gap:12px;flex-wrap:wrap}dialog{width:calc(100% - 32px);max-width:500px;border:1px solid #9ca6af;border-radius:8px;padding:24px}dialog::backdrop{background:#0006}[hidden]{display:none!important}:focus-visible{outline:3px solid #477a70;outline-offset:3px}@media(max-width:520px){main{padding:16px 16px 80px}h1{font-size:26px}header a{font-size:14px}.dm-search{gap:8px}.dm-search button{padding:9px}dl{grid-template-columns:1fr;gap:2px}dd{margin-bottom:8px}.dm-actions button{flex:1}}
</style></head><body><main><header><span class="dm-logo" aria-label="SĪGIL System">${SYSTEM_LIGHT}</span><a href="/internal/admin/dashboard">หน้าหลักเปอร์</a></header><h1>Double Moment</h1><p>อนุมัติขยายเวลาชุดสิทธิ์</p><form id="lookup" class="dm-search"><label for="query">สมาชิกหรือรหัสชุดสิทธิ์<input id="query" type="search" maxlength="120" autocomplete="off"></label><button id="search">ค้นหา</button></form><div id="status" class="dm-status" role="status" aria-live="polite"></div><section aria-label="ชุดสิทธิ์"><div id="sets"></div><p id="empty" hidden>ไม่พบชุดสิทธิ์</p><button id="more" type="button" hidden>รายการถัดไป</button></section><section id="detail" hidden><h2 id="member"></h2><p id="round"></p><dl><dt>ออกเครดิต</dt><dd id="issued"></dd><dt>หมดอายุปัจจุบัน</dt><dd id="current"></dd><dt>ขยายได้สูงสุด</dt><dd id="maximum"></dd><dt>คงเหลือ</dt><dd id="remaining"></dd></dl><p id="blocked"></p><form id="form" class="dm-form"><label>วันหมดอายุใหม่<select id="expiry" required></select></label><label>เหตุผลที่อนุมัติ<textarea id="reason" required minlength="3" maxlength="300" rows="3"></textarea></label><div class="dm-actions"><button id="review" class="dm-action">ตรวจทานก่อนอนุมัติ</button><button id="refresh" type="button">ตรวจสถานะล่าสุด</button></div></form><details><summary>ข้อมูลอ้างอิง</summary><p id="reference"></p></details></section><button id="retry" type="button" class="dm-action" hidden>ตรวจและส่งคำขอเดิมอีกครั้ง</button><dialog id="confirm"><h2>ยืนยันขยายเวลา</h2><p id="confirmation"></p><div class="dm-actions"><button id="back" type="button">กลับไปตรวจ</button><button id="save" type="button" class="dm-action">อนุมัติขยายเวลา</button></div></dialog></main><script>(${doubleMomentOwnerClient.toString()})();</script></body></html>`;}
