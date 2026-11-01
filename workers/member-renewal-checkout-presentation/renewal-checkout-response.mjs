// Extends the existing presentation Worker only after separate route approval.
const EDITS = [
  {
    "before": "<style>.spk__error.spk__entry{border-color:rgba(215,189,122,.28)!important}.spk__error.spk__entry .spk__error-icon{background:rgba(215,189,122,.12)!important;color:var(--gold)!important}</style>",
    "after": "<style>.mmd-renewal-finish{display:grid;gap:12px;margin-top:16px;max-width:100%;overflow-wrap:anywhere}.mmd-renewal-finish p{margin:0}.mmd-renewal-finish a{box-sizing:border-box;min-height:46px;display:block;text-align:center;padding:13px 16px;border-radius:12px;color:inherit}.mmd-renewal-finish-primary{background:#d7bd7a;color:#17130d!important;font-weight:700;text-decoration:none}.spk__error.spk__entry{border-color:rgba(215,189,122,.28)!important}.spk__error.spk__entry .spk__error-icon{background:rgba(215,189,122,.12)!important;color:var(--gold)!important}</style>"
  },
  {
    "before": "function syncProofState(status){const form=$('[data-spk-proof-form]'),state=$('[data-spk-proof-state]');if(!form||!state)return;const s=String(status||'').toLowerCase();const lock={evidence_submitted:'MMD รับหลักฐานไว้แล้วครับ ตอนนี้กำลังรอตรวจยอดจริง',pending_verification:'MMD กำลังตรวจสอบยอดจริงครับ ไม่ต้องส่งหลักฐานซ้ำ',verified:'ยอดนี้ได้รับการยืนยันแล้วครับ ดูสถานะและขั้นตอนถัดไปได้ใน My MMD',paid:'ยอดนี้ได้รับการยืนยันแล้วครับ ดูสถานะและขั้นตอนถัดไปได้ใน My MMD',expired:'ลิงก์รายการนี้หมดอายุแล้วครับ กรุณาติดต่อ MMD เพื่อขอลิงก์ใหม่',cancelled:'รายการนี้ถูกยกเลิกแล้วครับ',refunded:'รายการนี้อยู่ในสถานะคืนเงินแล้วครับ'};if(lock[s]){form.hidden=true;state.hidden=false;state.textContent=lock[s]}else{form.hidden=false;state.hidden=true}}",
    "after": "function isRenewalPayment(p){return p&&p.payment_type==='membership'&&/^liffrenew_(standard|premium)_[a-f0-9]{24}$/.test(String(p.session_id||''))}function renewalEvidenceState(p,result){if(!isRenewalPayment(p)||result?.ok!==true||result.evidence_submitted!==true||result.payment_ref!==p.payment_ref||typeof result.proof_id!=='string'||!result.proof_id.trim())return'';if(result.payment_status==='pending'&&result.verification_status==='pending_verification')return'pending_verification';if(result.payment_status==='paid'&&result.verification_status==='verified')return'paid';return''}function syncRenewalFinish(p,status,state){if(!isRenewalPayment(p)||status!=='pending_verification')return;const panel=document.createElement('div');panel.className='mmd-renewal-finish';panel.setAttribute('data-mmd-renewal-finish','pending');const title=document.createElement('strong');title.textContent='ส่งหลักฐานแล้ว · รอตรวจสอบ';const note=document.createElement('p');note.textContent='ไม่ต้องส่งสลิปซ้ำครับ สิทธิ์สมาชิกจะอัปเดตหลังตรวจสอบการชำระเงินเรียบร้อยแล้ว';const finish=document.createElement('a');finish.className='mmd-renewal-finish-primary';finish.href='/member/payments';finish.textContent='เสร็จสิ้น · Finish';const home=document.createElement('a');home.href='/member/my-mmd';home.textContent='กลับ MY MMD';panel.append(title,note,finish,home);state.append(panel)}function syncProofState(status){const form=$('[data-spk-proof-form]'),state=$('[data-spk-proof-state]');if(!form||!state)return;const s=String(status||'').toLowerCase();const lock={evidence_submitted:'MMD รับหลักฐานไว้แล้วครับ ตอนนี้กำลังรอตรวจยอดจริง',pending_verification:'MMD กำลังตรวจสอบยอดจริงครับ ไม่ต้องส่งหลักฐานซ้ำ',verified:'ยอดนี้ได้รับการยืนยันแล้วครับ ดูสถานะและขั้นตอนถัดไปได้ใน My MMD',paid:'ยอดนี้ได้รับการยืนยันแล้วครับ ดูสถานะและขั้นตอนถัดไปได้ใน My MMD',expired:'ลิงก์รายการนี้หมดอายุแล้วครับ กรุณาติดต่อ MMD เพื่อขอลิงก์ใหม่',cancelled:'รายการนี้ถูกยกเลิกแล้วครับ',refunded:'รายการนี้อยู่ในสถานะคืนเงินแล้วครับ'};if(lock[s]){form.hidden=true;state.hidden=false;state.textContent=lock[s]}else{form.hidden=false;state.hidden=true}syncRenewalFinish(payment,s,state)}"
  },
  {
    "before": "if(submit)submit.addEventListener('click',async()=>{if(!payment||!file||!consent.checked)return;submit.disabled=true;text('[data-spk-submit-label]','กำลังส่งหลักฐานครับ');const fd=new FormData();fd.append('payment_ref',payment.payment_ref||'');fd.append('session_id',payment.session_id||'');fd.append('payment_type',payment.payment_type||'full');fd.append('payment_stage',payment.payment_type||'full');fd.append('proof_type','payment_slip');fd.append('source_page','public_pay');fd.append('t',token());fd.append('file',file);fd.append('note',($('[data-spk-note]')||{}).value||'');if(lineUserId)fd.append('line_user_id',lineUserId);try{const res=await fetch(submitApi,{method:'POST',body:fd});const payload=await res.json().catch(()=>({}));if(!res.ok||payload.ok===false)throw new Error(payload.message||payload.error||'ส่งหลักฐานไม่สำเร็จ');if(payment)payment.status='pending_verification';text('[data-spk-order-status]','กำลังตรวจสอบ');text('[data-spk-status-badge]','กำลังตรวจสอบ');syncProofState('pending_verification');const dlg=$('[data-spk-dialog]');if(dlg){dlg.hidden=false;dlg.setAttribute('aria-hidden','false')}text('[data-spk-submit-status]','MMD รับหลักฐานแล้ว รอตรวจยอดจริงครับ')}catch(e){text('[data-spk-submit-status]',e.message||'ส่งหลักฐานไม่สำเร็จ กรุณาลองใหม่');submit.disabled=false;text('[data-spk-submit-label]','ส่งหลักฐานให้ MMD ตรวจ')}});",
    "after": "if(submit)submit.addEventListener('click',async()=>{if(!payment||!file||!consent.checked)return;submit.disabled=true;text('[data-spk-submit-label]','กำลังส่งหลักฐานครับ');const fd=new FormData();fd.append('payment_ref',payment.payment_ref||'');fd.append('session_id',payment.session_id||'');fd.append('payment_type',payment.payment_type||'full');fd.append('payment_stage',payment.payment_type||'full');fd.append('proof_type','payment_slip');fd.append('source_page','public_pay');fd.append('t',token());fd.append('file',file);fd.append('note',($('[data-spk-note]')||{}).value||'');if(lineUserId)fd.append('line_user_id',lineUserId);try{const res=await fetch(submitApi,{method:'POST',body:fd});const payload=await res.json().catch(()=>({}));if(!res.ok||payload.ok===false)throw new Error(payload.message||payload.error||'ส่งหลักฐานไม่สำเร็จ');const renewal=isRenewalPayment(payment);const nextState=renewal?renewalEvidenceState(payment,payload):'pending_verification';if(renewal&&!nextState)throw new Error('ยังยืนยันการรับสลิปไม่ได้ครับ กรุณาตรวจสถานะอีกครั้งก่อนส่งซ้ำ');if(payment)payment.status=nextState;text('[data-spk-order-status]',statusLabel(nextState));text('[data-spk-status-badge]',statusLabel(nextState));syncProofState(nextState);const dlg=$('[data-spk-dialog]');if(dlg){dlg.hidden=false;dlg.setAttribute('aria-hidden','false')}text('[data-spk-submit-status]',nextState==='paid'?'ยอดนี้ได้รับการยืนยันแล้วครับ ดูสถานะใน My MMD':'MMD รับหลักฐานแล้ว รอตรวจยอดจริงครับ')}catch(e){text('[data-spk-submit-status]',e.message||'ส่งหลักฐานไม่สำเร็จ กรุณาลองใหม่');submit.disabled=false;text('[data-spk-submit-label]','ส่งหลักฐานให้ MMD ตรวจ')}});"
  }
];
export function patchCheckoutHtml(html) {
 let result=html;
 for(const edit of EDITS){
  const at=result.indexOf(edit.before);
  if(at<0||result.indexOf(edit.before,at+1)!==-1)return null;
  result=result.slice(0,at)+edit.after+result.slice(at+edit.before.length);
 }
 return result;
}
export async function decorateCheckoutResponse(response) {
 if(!response.ok||!String(response.headers.get('content-type')||'').includes('text/html'))return response;
 // Never relax or rewrite an existing CSP in order to run the UI patch.
 if(response.headers.get('content-security-policy'))return response;
 const html=await response.clone().text(),patched=patchCheckoutHtml(html);
 if(patched===null)return response;
 const headers=new Headers(response.headers);
 for(const name of ['content-length','content-encoding','etag'])headers.delete(name);
 headers.set('cache-control','no-store');headers.set('x-mmd-renewal-checkout-ui','pending-finish-v1');
 return new Response(patched,{status:response.status,statusText:response.statusText,headers});
}
export function createCheckoutPresentation(existing,originFetch=request=>fetch(request)) {
 return {async fetch(request,env,ctx){
  const url=new URL(request.url);
  if((url.hostname==='mmdbkk.com'||url.hostname==='www.mmdbkk.com')&&(url.pathname==='/pay/checkout'||url.pathname==='/pay/checkout/')&&request.method==='GET'){
   return decorateCheckoutResponse(await originFetch(request));
  }
  return existing.fetch(request,env,ctx);
 }};
}
