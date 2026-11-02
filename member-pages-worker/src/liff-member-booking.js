export function renderMemberBooking(){return `<section id="member-booking" class="card" aria-label="ค้นหาและส่งคำขอจอง"><h2>ค้นหาและส่งคำขอจอง</h2><p data-booking-scope-copy>Public Models · ส่งคำขอให้ MMD ตรวจคิวและรายละเอียดก่อนยืนยัน</p><form data-booking-search><label data-booking-scope hidden>ประเภท<select name="scope"><option value="public">Public Models</option></select></label><label>ชื่อนายแบบ<input name="query" type="search" maxlength="80" placeholder="พิมพ์ชื่อ หรือดูทั้งหมด"></label><button type="submit">ค้นหานายแบบ</button></form><p data-booking-message role="status"></p><div data-booking-results class="member-services"></div><form data-booking-details hidden><strong data-booking-selected></strong><label>วันที่<input name="date" type="date" required></label><label>เวลา<input name="time" type="time" required></label><label>พื้นที่<input name="area" maxlength="120" required></label><label>รายละเอียดเพิ่มเติม<textarea name="note" maxlength="700"></textarea></label><button type="submit">ส่งคำขอจอง</button><button type="button" data-booking-change>เปลี่ยนนายแบบ</button></form><button type="button" data-booking-new hidden>เริ่มคำขอใหม่</button><h3>คำขอจองของฉัน</h3><button type="button" data-booking-refresh>ตรวจสถานะอีกครั้ง</button><div data-booking-list></div></section>`;}
export function createMemberBookingUI(root,api,getBinding,returnModel="",returnScope="public"){
 if(!root)return {load(){},reset(){},leave(){}};
 const search=root.querySelector('[data-booking-search]'),details=root.querySelector('[data-booking-details]'),message=root.querySelector('[data-booking-message]'),results=root.querySelector('[data-booking-results]'),list=root.querySelector('[data-booking-list]');
 let generation=0,selected=null,requestId='',ackRef='',sending=false,pending=false,resumeModel=/^rec[A-Za-z0-9]{14,24}$/.test(returnModel)?returnModel:'';
 const statusLabel=status=>({request_pending_admin_review:'รอ MMD ตรวจสอบ',under_review:'MMD กำลังตรวจสอบ',request_accepted:'MMD รับคำขอแล้ว',cancelled:'คำขอยกเลิกแล้ว',closed:'ปิดคำขอแล้ว',checking:'กำลังตรวจสอบสถานะคำขอ'}[status]||'กำลังตรวจสอบสถานะคำขอ');
 const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
 const refLabel=ref=>/^mmdreq_[a-f0-9]{64}$/.test(ref||'')?'#'+ref.slice(-10).toUpperCase():String(ref||'');
 const node=(tag,text)=>{const n=root.ownerDocument.createElement(tag);n.textContent=text;return n;};
 function syncScopeCopy(){root.querySelector('[data-booking-scope-copy]').textContent=search.elements.scope.value==='private'?'SĪGIL Models · ระบบตรวจสิทธิ์ปัจจุบันก่อนค้นหาและส่งคำขอ':'Public Models · ส่งคำขอให้ MMD ตรวจคิวและรายละเอียดก่อนยืนยัน';}
 function current(g,b){return generation===g&&getBinding()===b&&!!b;}
 function key(){return 'mmd-booking-request:'+getBinding();}
 function storedToken(){try{const value=sessionStorage.getItem(key())||'';return uuid.test(value)?value:'';}catch{return '';}}
 function token(){if(requestId)return requestId;requestId=storedToken()||crypto.randomUUID();try{sessionStorage.setItem(key(),requestId);}catch{}return requestId;}
 function clearAttempt(){try{sessionStorage.removeItem(key());}catch{}requestId='';pending=false;}
 function reset(){generation++;selected=null;requestId='';ackRef='';sending=false;pending=false;search.reset();search.elements.scope.replaceChildren(node('option','Public Models'));search.elements.scope.options[0].value='public';syncScopeCopy();root.querySelector('[data-booking-scope]').hidden=true;search.querySelector('button').disabled=false;details.reset();details.hidden=true;results.replaceChildren();list.replaceChildren();message.textContent='';root.querySelector('[data-booking-selected]').textContent='';root.querySelector('[data-booking-new]').hidden=true;details.querySelector('button[type="submit"]').disabled=false;}
 async function load(){
  let g=generation;const b=getBinding();if(!b)return;
  list.textContent='กำลังตรวจสอบคำขอ';
  try{
   const contextResponse=await api('/member/api/liff/booking/context',{credentials:'same-origin',cache:'no-store'},()=>current(g,b));
   const context=await contextResponse.json();if(!current(g,b))return;
   if(contextResponse.ok&&context?.ok===true&&Array.isArray(context.scopes)&&context.scopes.includes('private')&&!search.elements.scope.querySelector('option[value=private]')){
    const option=node('option','SĪGIL Models');option.value='private';search.elements.scope.append(option);root.querySelector('[data-booking-scope]').hidden=false;
    if(resumeModel&&returnScope==='private')search.elements.scope.value='private';
   }
   if(!contextResponse.ok||context?.ok!==true||!context.scopes?.includes('private')){
    const option=search.elements.scope.querySelector('option[value=private]');if(option){option.remove();search.elements.scope.value='public';root.querySelector('[data-booking-scope]').hidden=true;selected=null;details.hidden=true;results.replaceChildren();g=++generation;}
   }
   syncScopeCopy();
   const stored=storedToken();
   const res=await api('/member/api/liff/booking/requests'+(stored?'?request_id='+encodeURIComponent(stored):''),{credentials:'same-origin',cache:'no-store'},()=>current(g,b));const body=await res.json();if(!current(g,b))return;
   if(!res.ok||body?.ok!==true||!Array.isArray(body.items))throw Error();
   list.replaceChildren();if(!body.items.length)list.textContent='ยังไม่มีคำขอจองที่ยืนยันการรับแล้ว';
   for(const item of body.items){const row=node('p',[item.date,item.time,refLabel(item.request_ref),statusLabel(item.status)].filter(Boolean).join(' · '));list.append(row);}
   if(stored){requestId=stored;pending=true;const matching=body.items.find(item=>item.request_ref===(body.active_request_ref||ackRef));root.querySelector('[data-booking-new]').hidden=!matching;details.hidden=true;if(!matching)message.textContent='กรุณาตรวจสถานะหรือติดต่อเปอร์ก่อนส่งคำขอเดิมอีกครั้ง';}
   if(resumeModel&&!pending){search.elements.query.value=resumeModel;await searchModels({preventDefault(){}});}
  }catch{if(current(g,b))list.textContent='ยังตรวจสถานะคำขอไม่ได้ ลองตรวจอีกครั้งได้ครับ';}
 }
 async function searchModels(e){
  e.preventDefault();if(sending||pending)return;const g=++generation,b=getBinding();if(!b)return;
  const button=search.querySelector('button');button.disabled=true;message.textContent='กำลังค้นหา';selected=null;details.hidden=true;results.replaceChildren();
  try{const q=search.elements.query.value.trim();const res=await api('/member/api/liff/booking/search?q='+encodeURIComponent(q)+'&scope='+encodeURIComponent(search.elements.scope.value),{credentials:'same-origin',cache:'no-store'},()=>current(g,b));const body=await res.json();if(!current(g,b))return;
   if(!res.ok||body?.ok!==true||!Array.isArray(body.items))throw Error();
   for(const item of body.items){if(!/^rec[A-Za-z0-9]{14,24}$/.test(item.model_id||''))continue;
    const choose=node('button',item.display_name||'Model');choose.type='button';choose.style.minHeight='48px';
    if(/^media_[a-zA-Z0-9_-]{8,100}$/.test(item.media_id||'')){const image=root.ownerDocument.createElement('img');image.src='https://sigil.mmdbkk.com/sigil/api/models/media/'+encodeURIComponent(item.media_id);image.alt=item.display_name||'Model';image.style.width='100%';image.style.maxHeight='180px';image.style.objectFit='cover';choose.prepend(image);}
    choose.addEventListener('click',()=>{selected={...item,scope:search.elements.scope.value};details.hidden=false;root.querySelector('[data-booking-selected]').textContent='เลือก: '+item.display_name;message.textContent='เลือกวัน เวลา และพื้นที่ แล้วส่งให้ MMD ตรวจสอบ';});results.append(choose);if(resumeModel===item.model_id){choose.click();resumeModel='';}
   }message.textContent=results.children.length?'เลือกนายแบบที่สนใจ':'ยังไม่พบคนที่ตรง ลองค้นหาใหม่ได้';
  }catch{if(current(g,b))message.textContent='ยังค้นหาไม่ได้ กรุณาลองอีกครั้ง';}
  finally{if(current(g,b))button.disabled=false;}
 }
 search.addEventListener('submit',searchModels);
 details.addEventListener('submit',async e=>{
  e.preventDefault();if(sending||pending||!selected||!details.reportValidity())return;
  const g=generation,b=getBinding();if(!b)return;sending=true;const button=details.querySelector('button[type="submit"]');button.disabled=true;
  message.textContent='กำลังส่งคำขอ';const model=selected;
  try{const res=await api('/member/api/liff/booking/requests',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({request_id:token(),model_id:model.model_id,date:details.elements.date.value,time:details.elements.time.value,area:details.elements.area.value,note:details.elements.note.value,scope:model.scope||'public'})},()=>current(g,b));const body=await res.json();if(!current(g,b))return;
   if(!res.ok||body?.ok!==true){if(body?.outcome==='not_started'){clearAttempt();message.textContent=body.error==='booking_submission_not_ready'?'กำลังเตรียมระบบส่งคำขอ กรุณาติดต่อเปอร์ก่อนครับ':'ยังไม่ได้ส่งคำขอ กรุณาตรวจการเลือกแล้วลองใหม่';return;}pending=true;throw Error();}
   pending=true;ackRef=body.request_ref;root.querySelector('[data-booking-new]').hidden=false;message.textContent='รับคำขอแล้ว · '+refLabel(body.request_ref)+' · รอ MMD ตรวจสอบ ยังไม่ใช่การยืนยันงาน';details.hidden=true;await load();
  }catch{if(current(g,b)){pending=true;message.textContent='ยังยืนยันผลการส่งไม่ได้ กรุณาตรวจสถานะหรือติดต่อเปอร์ก่อนส่งใหม่';}}
  finally{if(current(g,b)){sending=false;button.disabled=pending;}}
 });
 root.querySelector('[data-booking-change]').addEventListener('click',()=>{if(!sending&&!pending){selected=null;details.hidden=true;}});
 root.querySelector('[data-booking-new]').addEventListener('click',()=>{if(sending||root.querySelector('[data-booking-new]').hidden)return;try{sessionStorage.removeItem(key());}catch{}reset();load();});
 search.elements.scope.addEventListener('change',()=>{syncScopeCopy();if(!sending&&!pending){generation++;search.querySelector('button').disabled=false;selected=null;details.hidden=true;results.replaceChildren();}});
 root.querySelector('[data-booking-refresh]').addEventListener('click',load);
 function leave(){generation++;search.querySelector('button').disabled=false;if(sending){pending=true;sending=false;details.querySelector('button[type="submit"]').disabled=true;message.textContent='กรุณาตรวจสถานะคำขอก่อนส่งอีกครั้ง';}}
 return {load,reset,leave};
}

export const MEMBER_BOOKING_CSS = `
#member-booking{margin:20px 0;overflow-wrap:anywhere}
#member-booking form{display:grid;gap:14px}#member-booking label{display:grid;gap:6px;font-size:16px}
#member-booking input,#member-booking textarea,#member-booking button{font:inherit;font-size:16px;min-height:48px;box-sizing:border-box;width:100%;max-width:100%}
#member-booking [hidden]{display:none!important}#member-booking [data-booking-results]{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
#member-booking [data-booking-results] button{min-width:0;white-space:normal;padding:12px}
#member-booking [data-booking-message],#member-booking [data-booking-list]{font-size:15px;line-height:1.65;overflow-wrap:anywhere}
#member-booking [data-booking-details] button[type="submit"]{background:#a21e37;color:#fff}
body[data-brand-audience="private"] #member-booking [data-booking-details] button[type="submit"]{background:#cbb78b;color:#15140f}
#member-booking button[data-booking-change],#member-booking button[data-booking-refresh],#member-booking button[data-booking-new]{background:transparent;color:inherit;border:1px solid #b8aa94}
#member-booking [data-booking-details]{padding:18px 0;border-top:1px solid currentColor}
`;
