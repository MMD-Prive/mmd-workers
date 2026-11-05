import {readMemberAppSession,rememberMemberPaymentSnapshot} from './member-app-api.js';
import {renderDoubleMomentCheckout} from './double-moment-checkout-page.js';
import {doubleMomentLoginPath} from '../../shared/double-moment-navigation.mjs';
const page='/member/double-moment',root='/member/api/liff/promotions/double-moment/';
const json=(d,status=200)=>Response.json(d,{status,headers:{'cache-control':'no-store, private'}});
export const isDoubleMomentCheckoutRequest=r=>[page,root+'context',root+'checkout'].includes(new URL(r.url).pathname);
export async function handleDoubleMomentCheckout(request,env){
 const url=new URL(request.url),html=url.pathname===page,write=url.pathname===root+'checkout';
 if(request.method!==(write?'POST':'GET'))return json({ok:false,error:'method_not_allowed'},405);
 if(!['https://mmdbkk.com','https://www.mmdbkk.com'].includes(url.origin)||request.headers.has('authorization')||request.headers.has('x-internal-token')||request.headers.get('sec-fetch-site')==='cross-site'||write&&request.headers.get('origin')!==url.origin)return json({ok:false,error:'forbidden'},403);
 const session=await readMemberAppSession(request,env);
 if(!session?.lineUserId||!session.memberExists||session.readGraceOnly)return html?Response.redirect(new URL(doubleMomentLoginPath(url.searchParams),url),302):json({ok:false,error:'customer_login_required'},401);
 if(html)return new Response(renderDoubleMomentCheckout(),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, private','referrer-policy':'no-referrer'}});
 const body=write?await request.json().catch(()=>null):Object.fromEntries(url.searchParams);
 const allowed=write?['session_id','claim_id']:['session_id'];
 if(!body||Object.keys(body).some(k=>!allowed.includes(k))||!write&&url.searchParams.size!==Object.keys(body).length||write&&Object.keys(body).length!==2)return json({ok:false,error:'invalid_credit_request'},400);
 const sid=body.session_id||(!write?session.paymentSnapshot?.sessionId:null);
 if(typeof sid!=='string'||!/^[-\w]{1,220}$/.test(sid))return json({ok:false,error:'job_link_required'},400);
 if(!env.PAYMENTS_WORKER?.fetch||!env.AUTH_SERVICE_MEMBER_TO_PAYMENTS)return json({ok:false,error:'credit_unavailable'},503);
 try{
  const r=await env.PAYMENTS_WORKER.fetch(new Request('https://payments.internal/v1/confirm/double-moment/'+(write?'customer-checkout':'customer-context'),{method:'POST',headers:{'content-type':'application/json','x-internal-token':env.AUTH_SERVICE_MEMBER_TO_PAYMENTS},body:JSON.stringify({session_id:sid,line_user_id:session.lineUserId,...(write?{claim_id:body.claim_id}:{})}),signal:AbortSignal.timeout(12000)}));
  const d=await r.json();if(!r.ok||d?.ok!==true)return json({ok:false,error:/^[a-zA-Z0-9_]+$/.test(d?.error||'')?d.error:'credit_unavailable'},[400,403,409,422].includes(r.status)?r.status:503);
  if(d.session_id!==sid)throw Error('session_mismatch');
  if(write){
   if(d.payment_stage!=='final'||typeof d.amount_due_thb!=='number'||d.amount_due_thb<=0||d.balance?.remaining_amount_thb!==d.amount_due_thb)throw Error('invalid_final');
   const remembered=await rememberMemberPaymentSnapshot(request,env,{payment_ref:d.payment_ref,session_id:sid,payment_stage:'final',package_code:'double_moment_service',amount_thb:d.amount_due_thb,customer_payment_url:d.customer_payment_url},session);
   if(!remembered)return json({ok:false,error:'payment_cache_pending_retry_same_claim'},503);
  }
  return json(d);
 }catch{return json({ok:false,error:'credit_unavailable_retry_same_claim'},503);}
}
