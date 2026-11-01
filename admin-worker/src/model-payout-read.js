import {OWNER_OPS_FIELDS as F} from './job-orchestrator-owner-ops-runtime.js';

// Read-only model projection. Raw transfer references, slips and bank details stay private.
export async function readModelPayout(env,record,session){
 const unknown={status:'unconfirmed',verified:false};
 const state=session.normalized_state||session.state;
 if(!['work_finished','separated','under_review','payout_pending','closed'].includes(state))return {status:'not_due',verified:false};
 const text=v=>typeof v==='string'?v.trim():'';
 const fields=record?.fields||{};
 const value=(id,name)=>{
  const a=fields[id],b=fields[name];
  if(a!==undefined&&b!==undefined&&a!==b)throw Error('conflicting_session_fields');
  return a??b;
 };
 try{
  if(text(value(F.session.holdReason,'payout_hold_reason'))||text(value(F.session.completion,'completion_review_status'))==='hold')return {status:'hold',verified:false};
  const token=env.AIRTABLE_API_KEY||env.AIRTABLE_TOKEN,base=env.AIRTABLE_BASE_ID;
  if(!token||!base||!session.session_id)return unknown;
  const url=new URL('https://api.airtable.com/v0/'+encodeURIComponent(base)+'/tblMvsl7qYozD05e5');
  const escaped=session.session_id.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  url.searchParams.set('filterByFormula',`AND({${F.payout.sessionId}}='${escaped}',{${F.payout.type}}='session_payout')`);
  url.searchParams.set('returnFieldsByFieldId','true');url.searchParams.set('pageSize','2');
  const response=await fetch(url,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return unknown;
  const result=await response.json();
  if(!Array.isArray(result?.records)||result.offset||result.records.length!==1)return unknown;
  const p=result.records[0]?.fields;
  const expected=session.pay_model_thb;
  if(!p||p[F.payout.sessionId]!==session.session_id||p[F.payout.type]!=='session_payout'||
   p[F.payout.payoutRef]!==`payout:${session.session_id}:session_payout`||
   !text(value(F.session.modelName,'model_name'))||p[F.payout.modelName]!==value(F.session.modelName,'model_name')||
   typeof expected!=='number'||!(expected>0)||p[F.payout.amount]!==expected)return unknown;
  if(p[F.payout.status]==='payout_pending'&&state==='payout_pending')return {status:'pending',verified:false};
  const paymentRef=text(value(F.session.paymentRef,'payment_ref'));
  const completion=text(value(F.session.completion,'completion_review_status'));
  const paidAt=Date.parse(p[F.payout.paidAt]),verifiedAt=Date.parse(p[F.payout.verifiedAt]);
  const ref=/(?:^|;\s*)owner_transfer_ref=([^;]+)/.exec(text(p[F.payout.notes]));
  if(state!=='closed'||!['clear','resolved'].includes(completion)||p[F.payout.status]!=='payout_paid'||
   p[F.payout.verification]!=='verified'||!text(p[F.payout.verifiedBy])||
   !Number.isFinite(paidAt)||!Number.isFinite(verifiedAt)||paidAt>Date.now()||verifiedAt>Date.now()||
   !ref||ref[1].trim().length<4||!paymentRef||p[F.payout.linkedPaymentRef]!==paymentRef)return unknown;
  return {status:'paid',verified:true,amount_thb:expected,paid_at:new Date(paidAt).toISOString(),source:'owner_verified_transfer'};
 }catch{return unknown;}
}
