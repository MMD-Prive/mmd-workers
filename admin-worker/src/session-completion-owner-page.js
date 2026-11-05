import { travelClock } from '../../shared/model-travel-eta.mjs';
import { mountOwnerTravel } from './model-travel-owner-client.js';
import { mountNotificationReview } from './notification-manual-review-client.js';

export const COMPLETION_OWNER_PAGE = '/internal/admin/jobs/completion';

export function completionOwnerPage() {
  return new Response(String.raw`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MMD | Travel, Completion & Payout</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f7;color:#202326;font:15px system-ui;letter-spacing:0}header,main{max-width:1100px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;border-bottom:1px solid #d3d7da}h1{font-size:23px;margin:0}h2{font-size:18px}article{padding:22px 0;border-bottom:1px solid #c9ced2}.meta{display:flex;gap:16px;flex-wrap:wrap}.review{white-space:pre-wrap;overflow-wrap:anywhere;color:#41494e}button,input{font:inherit;padding:10px;border:1px solid #8c969c;border-radius:4px}button{cursor:pointer;background:#fff}button:disabled{opacity:.5;cursor:default}button.primary{background:#115f53;color:white}input{min-width:0;flex:1}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}a{color:#115f53}#status{min-height:24px;color:#8c3525}@media(max-width:600px){header,main{padding:16px}.actions input{flex-basis:100%}}</style>
<style>.travel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.travel-heading button{width:44px;height:44px;padding:0;font-size:24px}.travel-eta{font-size:19px;font-weight:600;color:#115f53}.travel-alert{background:#fff2eb;border-left:4px solid #a94027;padding:12px 16px;color:#80351f;overflow-wrap:anywhere}.travel-alert p{margin:6px 0}#travel{border-bottom:1px solid #c9ced2;padding-bottom:20px}#travel article{overflow-wrap:anywhere}h3{font-size:17px;margin:12px 0}header{gap:12px;flex-wrap:wrap}header h1{overflow-wrap:anywhere}
</style><header><h1>MMD · Travel & Completion</h1><a href="/internal/admin/jobs/all">Jobs</a></header>
<main><section id="travel" aria-label="ติดตามการเดินทาง"></section><h2>ตรวจจบงานและจ่ายเงิน</h2><p id="status" role="status"></p><div id="jobs"></div></main><script>
const travelClock=${travelClock.toString()};
const mountOwnerTravel=${mountOwnerTravel.toString()};
mountOwnerTravel(document.getElementById('travel'));
const notificationReview=document.createElement('section');notificationReview.id='notification-review';document.querySelector('main').append(notificationReview);
const mountNotificationReview=${mountNotificationReview.toString()};
mountNotificationReview(notificationReview);
const api='/v1/admin/jobs/owner-actions', jobs=document.getElementById('jobs'), status=document.getElementById('status');
const selected=new URL(location.href).searchParams.get('session_id');
function text(tag,value,cls){const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;}
async function load(){
try{const r=await fetch(api,{credentials:'same-origin',cache:'no-store'}),d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'โหลดรายการไม่ได้');jobs.replaceChildren();
for(const item of d.items.filter(x=>!selected||x.session_id===selected)){
const row=document.createElement('article');row.append(text('h2',item.model_name||item.session_id));
row.append(text('p',item.session_id+' · '+item.state+' · '+(item.customer_approved?'ลูกค้าอนุมัติแล้ว':'รอลูกค้าอนุมัติ')+' · '+(item.payout_amount_thb??'—')+' THB','meta'));
if(item.payout_hold_reason)row.append(text('p',item.payout_hold_reason));
const review=item.customer_review;if(review)row.append(text('p','รีวิว '+review.rating+'/'+(review.rating_scale||5)+'\n'+(review.issue_tags||[]).join(', ')+'\nข้อความถึง MMD: '+(review.private_mmd_message||'—')+'\nข้อความถึง Model: '+(review.private_model_message||'—'),'review'));
const actions=document.createElement('div');actions.className='actions';const reason=document.createElement('input');reason.placeholder='เหตุผลตรวจสอบ / เลขอ้างอิงการโอน';reason.maxLength=500;reason.setAttribute('aria-label','เหตุผลหรือเลขอ้างอิงการโอน');actions.append(reason);
for(const [action,label,enabled] of [['clear_completion_review','ตรวจจบงานผ่าน',item.actions.can_clear_completion],['hold_completion_review','พักการจ่าย',item.actions.can_hold_completion],['mark_payout_ready',item.state==='payout_pending'?'ส่งข้อมูลโอนซ้ำ':'พร้อมจ่าย / ส่งบัญชี',item.actions.can_mark_payout_ready||item.actions.can_resend_payout_instructions],['mark_payout_paid','ยืนยันโอนแล้ว',item.actions.can_mark_payout_paid]]){
const b=text('button',label);b.disabled=!enabled;b.type='button';if(action==='mark_payout_ready')b.className='primary';b.onclick=async()=>{if(action==='mark_payout_paid'&&!confirm('ยืนยันว่าโอนเงินจริงแล้ว และกรอกเลขอ้างอิงการโอนถูกต้อง?'))return;
b.disabled=true;status.textContent='กำลังบันทึก';try{const r=await fetch(api,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({session_id:item.session_id,action,reason:reason.value,transfer_ref:reason.value})}),d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'บันทึกไม่สำเร็จ');status.textContent=d.owner_notification?(d.owner_notification.delivered?'ส่งข้อมูลให้เปอร์แล้ว':'บันทึกพร้อมจ่ายแล้ว แต่ยังส่งข้อมูลให้เปอร์ไม่สำเร็จ: '+d.owner_notification.status):'บันทึกแล้ว';await load();}catch(e){status.textContent=e.message;b.disabled=false;}};actions.append(b);
}row.append(actions);jobs.append(row);}
if(!jobs.children.length)jobs.append(text('p','ไม่มีรายการ'));
}catch(e){status.textContent=e.message;}}
load();
</script></html>`, {headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, private',
    'content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"}});
}
