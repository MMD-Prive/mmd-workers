import {dispatchPaymentNotification,notificationDigest,readPaymentNotification} from '../../shared/payment-notification-outbox.mjs';
import {deliverTelegramOnce} from '../../shared/telegram-delivery-once.mjs';
import {readTravelSession} from '../../shared/model-travel-store.mjs';
import {checkReconfirmFreshness,reconfirmRevision,reconfirmSnapshot} from './model-reconfirm-freshness.js';
import {resolveOwnerDestination} from './model-reconfirm-guard.js';

export const RECONFIRM_OWNER_LANE='model-reconfirm-overdue-owner';
async function currentOwnerContext(env,payload,now){
  if(!env.AUTH_SERVICE_EVENTS_TO_TELEGRAM&&!env.AUTH_SERVICE_STUDIO_TO_TELEGRAM)return {ok:false,error:'owner_notify_config_missing'};
  const destination=resolveOwnerDestination(env),endpoint=String(env.TELEGRAM_INTERNAL_SEND_URL||'').trim();
  if(!destination||destination.chat_id!==payload.recipient||(destination.thread_id||'')!==payload.thread||await notificationDigest(endpoint)!==payload.endpoint_digest)return {ok:false,error:'owner_recipient_changed'};
  const record=await readTravelSession(env,payload.session_id),f=record.fields,snapshot=reconfirmSnapshot(f);
  const state=String(f[env.AT_SESSIONS__STATE||'model_session_state']||f.session_state||f.state||'').toLowerCase();
  if(!['confirmed','accepted'].includes(state))return {ok:false,error:'owner_job_not_pending_reconfirm'};
  if(f[env.AT_SESSIONS__RECONFIRM_ACKNOWLEDGED_AT||'reconfirm_acknowledged_at'])return {ok:false,error:'model_already_acknowledged'};
  const notified=f[env.AT_SESSIONS__RECONFIRM_NOTIFIED_AT||'reconfirm_notified_at'];
  const deadline=f[env.AT_SESSIONS__RECONFIRM_OVERDUE_AT||'reconfirm_overdue_at'];
  if(!Number.isFinite(Date.parse(notified))||Date.parse(deadline)!==Date.parse(payload.overdue_at)||!Number.isFinite(Date.parse(snapshot.start_time))||now>=Date.parse(snapshot.start_time))return {ok:false,error:'owner_reconfirm_expired_or_changed'};
  if(await reconfirmRevision(snapshot)!==payload.revision)return {ok:false,error:'owner_job_revision_changed'};
  const fresh=await checkReconfirmFreshness(env,record,{now,readChanges:async()=>{
    const table=env.AIRTABLE_TABLE_CUSTOMER_CHANGE_REQUESTS||'tblhQGfJc4GgiteZr';
    const q=new URLSearchParams({filterByFormula:`{session_id}="${payload.session_id}"`,returnFieldsByFieldId:'true',pageSize:'100'});
    const request=new Request(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${q}`,{headers:{authorization:`Bearer ${env.AIRTABLE_API_KEY}`},signal:AbortSignal.timeout(10000)});
    const response=await (env.AIRTABLE_HTTP?.fetch?.bind(env.AIRTABLE_HTTP)||fetch)(request),d=await response.json();
    if(!response.ok||!Array.isArray(d.records)||d.offset)throw Error('changes_unavailable');return d.records;
  }});
  if(fresh.action!=='current')return {ok:false,error:fresh.reason||'owner_job_source_unavailable'};
  const reread=await readTravelSession(env,payload.session_id);
  if(reread.id!==record.id||JSON.stringify(reread.fields)!==JSON.stringify(f))return {ok:false,error:'owner_job_changed_during_review'};
  return {ok:true,state,recipient:destination.chat_id,thread:destination.thread_id||'',revision:payload.revision,source_digest:await notificationDigest(JSON.stringify(f)),record};
}
export async function deliverReconfirmOwnerJournal(env,journal,checkpoint,validateOnly=false){
  const context=await currentOwnerContext(env,journal.payload||{},validateOnly?Date.now():journal.created_at);
  if(!context.ok)return {ok:false,retryable:false,error:context.error};
  const {record,...current}=context;
  if(validateOnly)return current;
  const token=env.AUTH_SERVICE_EVENTS_TO_TELEGRAM||env.AUTH_SERVICE_STUDIO_TO_TELEGRAM;
  if(!token)return {ok:false,error:'owner_notify_config_missing'};
  const escape=v=>String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const f=record.fields,text=['<b>Reconfirm Overdue</b>',`Model: <b>${escape(f.model_name)}</b>`,`Job date: <b>${escape(f.job_date)}</b>`,`Session: <code>${escape(journal.payload.session_id)}</code>`,'ยังไม่มีหลักฐานการรับทราบรายละเอียดล่าสุดในระบบหลังส่งคำขอ reconfirm','กรุณาติดตาม Model และตรวจสอบว่าเกิดอะไรขึ้น','งานยังไม่ถูกยกเลิก และยังไม่แจ้งลูกค้าว่างานมีปัญหา'].join('\n');
  return deliverTelegramOnce(journal,checkpoint,()=>fetch(env.TELEGRAM_INTERNAL_SEND_URL,{method:'POST',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json','x-internal-token':token},body:JSON.stringify({chat_id:current.recipient,text,parse_mode:'HTML',disable_web_page_preview:true,source:'events-worker',intent:'model_reconfirm_overdue',session_id:journal.payload.session_id,...(current.thread?{message_thread_id:current.thread,thread_id:current.thread}:{})})}));
}
export async function sendReconfirmOwnerOnce(env,{destination,sessionId,overdueAt,revision,text,validate,now=Date.now()}){
  const bucket=env.SESSION_COMPLETION_STATE||env.PRIVATE_MODEL_MEDIA;
  if(!bucket?.get||!bucket?.put)return {ok:false,error:'owner_notification_storage_unavailable'};
  const endpoint=String(env.TELEGRAM_INTERNAL_SEND_URL||'').trim();
  const token=env.AUTH_SERVICE_EVENTS_TO_TELEGRAM||env.AUTH_SERVICE_STUDIO_TO_TELEGRAM;
  if(!endpoint||!token||!destination?.chat_id)return {ok:false,error:'owner_notify_config_missing'};
  const eventKey=JSON.stringify([sessionId,overdueAt,'model_reconfirm_overdue']);
  const payload={session_id:sessionId,overdue_at:overdueAt,revision,recipient:destination.chat_id,thread:destination.thread_id||'',endpoint_digest:await notificationDigest(endpoint)};
  const prior=await readPaymentNotification({bucket,lane:RECONFIRM_OWNER_LANE,eventKey});
  if(prior&&JSON.stringify(prior.payload)!==JSON.stringify(payload))return {ok:false,error:'owner_notification_context_changed'};
  const result=await dispatchPaymentNotification({bucket,lane:RECONFIRM_OWNER_LANE,eventKey,payload,now,deliver:async(journal,checkpoint)=>{
    if(typeof validate!=='function'||!await validate())return {ok:false,retryable:false,error:'owner_notification_context_changed'};
    return deliverReconfirmOwnerJournal(env,journal,checkpoint);
  }});
  return {ok:result.delivered===true,status:result.status,error:result.delivered?undefined:'owner_notification_'+result.status};
}
