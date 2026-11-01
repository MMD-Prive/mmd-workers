import {dispatchPaymentNotification,drainPaymentNotifications,notificationDigest} from '../../shared/payment-notification-outbox.mjs';
import {readTravelSession} from '../../shared/model-travel-store.mjs';
import {resolveOwnerDestination} from '../../admin-worker/src/model-reconfirm-guard.js';
import {deliverTelegramOnce} from '../../shared/telegram-delivery-once.mjs';
const lane='customer-aftercare-owner';
const bucket=env=>env.SESSION_COMPLETION_STATE||env.PRIVATE_MODEL_MEDIA;
const read=(env,id)=>readTravelSession({...env,AIRTABLE_TABLE_SESSIONS:env.AIRTABLE_TABLE_SESSIONS||'Sessions'},id);
export async function deliverAftercareOwner(env,journal,checkpoint,validateOnly=false){
  const p=journal.payload||{},owner=resolveOwnerDestination(env);
  if(!p.session_id||!p.evidence_digest||!owner||owner.chat_id!==p.owner_id||!/^[1-9]\d*$/.test(owner.chat_id)||owner.thread_id)return {ok:false,retryable:false,error:'owner_context_changed'};
  const current=await read(env,p.session_id),f=current.fields||{};
  if(!['under_review','payout_pending'].includes(f.model_session_state)||await notificationDigest(f.customer_aftercare_json||'')!==p.evidence_digest)return {ok:false,retryable:false,error:'aftercare_context_changed'};
  const token=env.AUTH_SERVICE_EVENTS_TO_TELEGRAM||env.AUTH_SERVICE_STUDIO_TO_TELEGRAM;
  if(!token||!env.TELEGRAM_INTERNAL_SEND_URL)return {ok:false,error:'owner_transport_unavailable'};
  if(validateOnly)return {ok:true,state:f.model_session_state,recipient:owner.chat_id,evidence_digest:p.evidence_digest};
  const text=['MMD · '+(p.intent==='customer_completion_approved'?'Customer approved completion':'Customer review received'),'Session: '+p.session_id,f.completion_review_status==='hold'?'HOLD: review requires attention':'Owner completion/payment review is still required','https://mmdbkk.com/internal/admin/jobs/completion?session_id='+encodeURIComponent(p.session_id)].join('\n');
  return deliverTelegramOnce(journal,checkpoint,()=>fetch(env.TELEGRAM_INTERNAL_SEND_URL,{method:'POST',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json','x-internal-token':token},body:JSON.stringify({chat_id:owner.chat_id,text,idempotency_key:journal.id,source:'events-worker',intent:p.intent})}));
}
export async function notifyAftercareOwner(env,record,intent){
  try{
    const owner=resolveOwnerDestination(env),storage=bucket(env),f=record.fields;
    if(!owner||!/^[1-9]\d*$/.test(owner.chat_id)||owner.thread_id||!storage?.get||!storage?.put)return {ok:false,status:'owner_notification_unavailable'};
    const digest=await notificationDigest(f.customer_aftercare_json||'');
    const result=await dispatchPaymentNotification({bucket:storage,lane,eventKey:JSON.stringify([f.session_id,intent,digest,owner.chat_id]),payload:{session_id:f.session_id,intent,evidence_digest:digest,owner_id:owner.chat_id},deliver:(journal,checkpoint)=>deliverAftercareOwner(env,journal,checkpoint)});
    return {ok:result.delivered===true,status:result.status};
  }catch{return {ok:false,status:'owner_notification_unavailable'};}
}
export const drainAftercareOwner=(env,now=Date.now())=>drainPaymentNotifications({bucket:bucket(env),lane,deliver:(journal,checkpoint)=>deliverAftercareOwner(env,journal,checkpoint),now,limit:5});
