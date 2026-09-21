import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';
const PAGE='/internal/admin/partners';
const ROOT='/v1/admin/partners/';
const ROUTES={
  'requests':['GET','model-changes'],
  'decision':['POST','model-changes/decision'],
  'agreements':['GET','working-systems'],
  'agreement-decision':['POST','working-systems/decision'],
  'ledger':['GET','ledger'],
  'settlements':['GET','settlements'],
  'capture':['POST','agreement/capture'],
  'settlement-approve':['POST','settlement/approve'],
  'asset-preview':['GET','model-changes/asset'],
  'materialize':['POST','ledger/materialize'],
  'payout':['POST','ledger/action']
};
export function isPartnerOwnerConsoleRequest(request){const path=new URL(request.url).pathname.replace(/\/+$/,'');return path===PAGE||path.startsWith(ROOT);}
const json=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
export async function handlePartnerOwnerConsole(request,env,ctx){
  const url=new URL(request.url);if(!['https://mmdbkk.com','https://www.mmdbkk.com'].includes(url.origin))return json({ok:false,error:'forbidden_origin'},403);
  const actor=await readCredentialBoundAdminActor(request,env);
  if(!actor)return url.pathname===PAGE?new Response(null,{status:302,headers:{location:'/internal/admin/login','cache-control':'no-store'}}):json({ok:false,error:'unauthorized'},401);
  if(!['owner','admin'].includes(actor.role))return json({ok:false,error:'owner_required'},403);
  if(url.pathname===PAGE&&request.method==='GET')return new Response(PAGE_HTML,{headers:{'content-type':'text/html;charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-frame-options':'DENY'}});
  const key=url.pathname.slice(ROOT.length),route=ROUTES[key];if(!route||request.method!==route[0])return json({ok:false,error:'route_not_found'},404);
  if(request.method==='POST'&&(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json')))return json({ok:false,error:'forbidden_origin'},403);
  if(!env.PARTNERS_WORKER?.fetch)return json({ok:false,error:'partner_service_unavailable'},503);
  // Fixed destinations only. No generic proxy or browser-owned admin identity.
  const target=new URL('https://partners-worker.internal/v1/partner/admin/'+route[1]);
  if(key==='asset-preview'){const id=url.searchParams.get('request_id')||'';if(!/^rec[A-Za-z0-9]{14,24}$/.test(id))return json({ok:false,error:'request_invalid'},400);target.searchParams.set('request_id',id);}
  return env.PARTNERS_WORKER.fetch(new Request(target,{method:request.method,headers:{'content-type':'application/json','x-mmd-service-binding':'admin-worker','x-mmd-owner-id':String(actor.id),'x-mmd-owner-role':actor.role},body:request.method==='POST'?await request.text():undefined}));
}
const PAGE_HTML=String.raw`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>SĪGIL · Partner Review</title><style>*{box-sizing:border-box}body{margin:0;background:#12100d;color:#eee7d8;font:16px/1.6 system-ui}main{max-width:1000px;margin:auto;padding:28px 20px}a{color:#e6bd72}h1{font-size:32px}nav{display:flex;gap:10px;flex-wrap:wrap}button,input,textarea,select{font:inherit;padding:10px;border:1px solid #59462c;border-radius:10px;background:#211b13;color:#fff}button{cursor:pointer;min-height:44px}button:disabled{opacity:.5}article{padding:20px;border:1px solid #463923;border-radius:18px;margin:16px 0}dl{display:grid;grid-template-columns:1fr 2fr;gap:8px;overflow-wrap:anywhere}dt{color:#cbb28b}dd{margin:0}textarea{width:100%;margin:14px 0}.actions{display:flex;gap:10px;flex-wrap:wrap}article img{display:block;max-width:100%;max-height:420px;margin:16px 0}input[type=checkbox]{width:auto}#status{position:sticky;top:0;background:#12100d;padding:12px}small{color:#cbb28b}label{display:grid;gap:6px;margin:12px 0}</style></head><body><main><a href="/internal/admin/dashboard">← MMD OS</a><small> · SĪGIL PARTNER</small><h1>Partner Review</h1><p>ตรวจข้อมูลที่ Partner เลือกแชร์ ข้อมูลใน Private Vault ไม่ปรากฏที่นี่</p><nav><button data-tab="requests">โปรไฟล์ / รูป / ประสานงาน</button><button data-tab="agreements">ข้อตกลง</button><button data-tab="settlements">ตรวจยอด / สร้างรายได้</button><button data-tab="ledger">รายได้ / จ่ายเงิน</button><a href="/internal/admin/kenji">Sales Control ใน Kenji → Models</a></nav><p id="status" role="status"></p><section id="content"></section></main><script>
(function(){
  var view='requests',data=[],generation=0,blobs=[];
  var status=document.querySelector('#status'),content=document.querySelector('#content');
  var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
  async function api(path,body){var r=await fetch('/v1/admin/partners/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});var d=await r.json();if(!r.ok||!d.ok)throw Error(typeof d.error==='string'?d.error:d.error&&d.error.message||d.error&&d.error.code||'บันทึกไม่สำเร็จ');return d;}
  function fields(obj){return '<dl>'+Object.entries(obj||{}).filter(function(pair){return !['private_note','r2_key'].includes(pair[0]);}).map(function(pair){return '<dt>'+esc(pair[0])+'</dt><dd>'+esc(typeof pair[1]==='object'?JSON.stringify(pair[1]):pair[1])+'</dd>';}).join('')+'</dl>';}
  function settlementCard(row){
    var agreement=row.agreement&&row.agreement.contract==='partner_agreement_v1';
    var body=fields({session_id:row.session_id,model:row.model,payment_status:row.payment_status,completion_review:row.completion_review,payout_hold:row.payout_hold,agreement:row.agreement,receipts:row.receipts});
    if(!agreement&&!row.snapshot_locked){
      var legacy=row.agreement&&row.agreement.schema==='mmd_model_partner_referral_snapshot_v1'&&row.agreement.commission_terms==='not_set';
      if(legacy)return body+'<p>งานเดิมยังไม่ได้ตกลงค่าตอบแทน เลือกข้อตกลงที่อนุมัติแล้วและระบุเหตุผลที่ใช้กับงานนี้ ระบบจะเก็บประวัติเดิมและวันอนุมัติจริง</p><label>ข้อตกลง<select name="agreement_request_id"><option value="">เลือกข้อตกลงที่อนุมัติแล้ว</option>'+(row.agreement_options||[]).map(function(o){return '<option value="'+esc(o.request_id)+'">'+esc(o.payload.system)+' · v'+esc(o.payload.version)+' · '+esc(o.payload.decided_at)+'</option>';}).join('')+'</select></label><label>หลักฐาน / เหตุผลที่ข้อตกลงนี้ครอบคลุมงานเดิม<textarea name="reconciliation_reason" minlength="10" maxlength="2000"></textarea></label><label><span><input type="checkbox" name="reconcile_legacy"> ยืนยันใช้ข้อตกลงนี้กับงานเดิมโดยไม่แก้วันอนุมัติย้อนหลัง</span></label><button data-action="capture">บันทึกข้อตกลงของงานเดิม</button>';
      return body+'<p>ตรวจและตรึงข้อตกลงที่อนุมัติ ณ เวลาสร้างงาน ระบบไม่ใช้เรทปัจจุบันแทนประวัติ</p><button data-action="capture">ตรวจข้อตกลงย้อนหลัง</button>';
    }
    if(row.snapshot_locked)return body+'<p>ตรึงยอดที่อนุมัติแล้ว</p><button data-action="materialize">สร้าง / ตรวจรายการรายได้</button>';
    return body+'<label>รูปแบบยอดที่ตรวจ<select name="receipt_mode"><option value="full">ชำระเต็มครั้งเดียว</option><option value="deposit_and_final">มัดจำ + ยอดสุดท้าย (รวมรายรับทั้งงาน)</option></select></label><label>ยอดรวมที่ตรวจแล้ว (THB)<input name="reviewed_total_thb" type="number" min="0.01" step="0.01" required></label>'+(row.agreement.system==='profit_share'?'<label>ต้นทุนที่อนุมัติ (รวม 0 หากไม่มี)<input name="costs_total_thb" type="number" min="0" step="0.01"></label><label>อ้างอิงหลักฐานต้นทุน<input name="cost_evidence_ref" maxlength="500"></label>':'')+'<label><span><input type="checkbox" name="approve_settlement"> ตรวจยอดรับเงินจริงและอนุมัติใช้เป็นฐานค่าตอบแทนของงานนี้</span></label><button data-action="settlement-approve">ตรึงยอดที่อนุมัติ</button>';
  }
  async function preview(card,row,version){
    try {var response=await fetch('/v1/admin/partners/asset-preview?request_id='+encodeURIComponent(row.request_id),{credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('เปิดรูปสำหรับตรวจไม่สำเร็จ');var digest=response.headers.get('x-media-sha256'),blob=await response.blob();if(version!==generation)return;var image=document.createElement('img'),url=URL.createObjectURL(blob);blobs.push(url);image.alt='รูปที่ Partner ขอให้ตรวจ';image.onload=function(){card.dataset.reviewedSha256=digest;};image.src=url;card.querySelector('[data-preview]').replaceChildren(image);}catch(e){if(version===generation)card.querySelector('[data-preview]').textContent=e.message;}
  }
  async function load(){
    var version=++generation,currentView=view;status.textContent='กำลังโหลด';blobs.forEach(function(u){URL.revokeObjectURL(u);});blobs=[];
    try {var d=await api(currentView);if(version!==generation)return;data=d.requests||d.commissions||d.sessions||[];
      content.innerHTML=data.map(function(row,i){
        if(currentView==='settlements')return '<article data-index="'+i+'">'+settlementCard(row)+'</article>';
        var pending=currentView==='ledger'?['earned','approved'].includes(row.status):row.status==='review';
        var media=['set_cover','archive_asset','restore_asset'].includes(row.action);
        var form=currentView==='ledger'?'<label>เลขอ้างอิงการจ่ายจริง<input name="payout_reference" maxlength="180"></label><label>เหตุผลและหลักฐานกรณียกเลิกรายได้<textarea name="note" maxlength="1200"></textarea></label>':'<label>คำตอบ / เหตุผล<textarea name="note" maxlength="2000"></textarea></label>';
        if(row.action==='set_cover')form+='<label><span><input type="checkbox" name="approve_public_image"> ตรวจรูปแล้วและอนุมัติให้ใช้เป็นภาพสาธารณะของโมเดล</span></label>';
        var caption=['update_profile','add_model'].includes(row.action)?'อนุมัติและส่งโปรไฟล์เข้า MMD':'อนุมัติ / ตอบกลับ';
        return '<article data-index="'+i+'"><b>'+esc(row.action||row.system||'Partner')+'</b>'+fields(currentView==='ledger'?row:Object.assign({request_id:row.request_id,status:row.status,model_record_id:row.model_record_id},row.payload))+(media?'<div data-preview>กำลังโหลดภาพเพื่อตรวจ</div>':'')+(pending?form+'<div class="actions">'+(currentView==='ledger'?'<button data-action="'+(row.status==='earned'?'approve':'mark_paid')+'">'+(row.status==='earned'?'อนุมัติค่าตอบแทน':'บันทึกว่าจ่ายแล้ว')+'</button><button data-action="void">ยกเลิกรายได้ที่ยังไม่จ่าย</button>':'<button data-action="approve">'+caption+'</button><button data-action="reject">ไม่อนุมัติ</button>')+'</div>':'')+'</article>';
      }).join('')||'<p>ยังไม่มีรายการ</p>';
      status.textContent='โหลดประวัติครบ '+data.length+' รายการ';
      content.querySelectorAll('[data-preview]').forEach(function(el){var card=el.closest('article');preview(card,data[Number(card.dataset.index)],version);});
      content.querySelectorAll('[data-action]').forEach(function(button){button.onclick=async function(){
        var card=button.closest('article'),row=data[Number(card.dataset.index)],action=button.dataset.action;
        var input=function(name){var el=card.querySelector('[name="'+name+'"]');return el?el.value:'';};
        var checked=function(name){return card.querySelector('[name="'+name+'"]')?.checked===true;};
        var path,body;
        if(currentView==='settlements'){
          path=action;body={session_record_id:row.session_record_id};
          if(action==='capture'&&checked('reconcile_legacy'))Object.assign(body,{reconcile_legacy:true,agreement_request_id:input('agreement_request_id'),reconciliation_reason:input('reconciliation_reason')});
          if(action==='settlement-approve')Object.assign(body,{receipt_mode:input('receipt_mode'),reviewed_total_thb:Number(input('reviewed_total_thb')),costs_total_thb:input('costs_total_thb')===''?null:Number(input('costs_total_thb')),cost_evidence_ref:input('cost_evidence_ref'),approve_settlement:checked('approve_settlement')});
        }else if(currentView==='ledger'){path='payout';body={commission_record_id:row.commission_record_id,action:action,payout_reference:input('payout_reference'),note:input('note')};}
        else {path=currentView==='agreements'?'agreement-decision':'decision';body={request_record_id:row.request_id,decision:action,note:input('note'),approve_public_image:checked('approve_public_image'),reviewed_sha256:card.dataset.reviewedSha256||''};}
        if(!confirm('ยืนยันการบันทึกการตัดสินใจนี้?'))return;
        button.disabled=true;try{await api(path,body);await load();}catch(e){status.textContent=e.message;button.disabled=false;}
      };});
    }catch(e){status.textContent=e.message;}
  }
  document.querySelectorAll('[data-tab]').forEach(function(button){button.onclick=function(){view=button.dataset.tab;load();};});load();
})();
</script></body></html>`;
