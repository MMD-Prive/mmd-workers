import {readVerifiedSessionBalance,BALANCE_FIELDS as F} from '../../payments-worker/verified-session-balance.js';

// Reuse Payments' verified-ledger calculation, without its lifecycle-writing status endpoint.
export async function readModelCustomerPayment(env,record,session){
 const unavailable={status:'unavailable'};
 try{
  const summary=await readVerifiedSessionBalance(env,record);
  if(summary.session_id!==session.session_id)return unavailable;
  const equal=(fields,id,name)=>fields[id]===undefined||fields[name]===undefined||fields[id]===fields[name];
  if(!equal(record.fields,F.total,'amount_thb')||!equal(record.fields,F.sessionId,'session_id'))return unavailable;
  for(const p of summary.records){
   const f=p.record.fields;
   for(const [id,name] of [[F.paymentSession,'session_id'],[F.amount,'Amount'],[F.verification,'Verification Status'],[F.status,'Payment Status'],[F.stage,'payment_stage'],[F.ref,'Payment Reference']])if(!equal(f,id,name))return unavailable;
  }
  const paid=summary.verified_paid_thb>0&&summary.remaining_amount_thb===0;
  return {schema:'model_customer_payment_v1',source:'payments_verified_ledger',session_id:session.session_id,
   status:paid?'fully_paid':summary.verified_deposit_thb>0?'deposit_paid':'pending'};
 }catch{return unavailable;}
}
