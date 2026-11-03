import {dispatchPaymentNotification,notificationDigest,readPaymentNotification} from '../../shared/payment-notification-outbox.mjs';
import {withSessionCompletionLock} from '../../shared/session-completion.mjs';
import {deliverPayoutJournal} from './model-payout-destination.js';
import {deliverOwnerTravelJournal} from './model-travel-owner.js';
import {deliverAftercareOwner} from '../../events-worker/src/owner-aftercare-notification.js';
import {deliverReconfirmOwnerJournal,RECONFIRM_OWNER_LANE} from './model-reconfirm-owner-delivery.js';

export const MANUAL_REVIEW_PATH='/v1/admin/jobs/notification-review';
const root='payment-notifications/v1/';
const lanes={
  'model-payout-instructions':{deliver:(env,j,c,validate)=>deliverPayoutJournal(env,j,undefined,c,validate)},
  'model-travel-owner':{deliver:deliverOwnerTravelJournal},
  'customer-aftercare-owner':{deliver:deliverAftercareOwner,completion:true},
  [RECONFIRM_OWNER_LANE]:{deliver:deliverReconfirmOwnerJournal,completion:true},
};
const fail=(error,status=409)=>Object.assign(new Error(error),{status});
const storage=(env,lane)=>lanes[lane]?.completion?(env.SESSION_COMPLETION_STATE||env.PRIVATE_MODEL_MEDIA):env.PRIVATE_MODEL_MEDIA;
const receiptKey=(lane,id)=>`${root}${lane}/receipts/${id}.json`;
async function read(bucket,key){const obj=await bucket.get(key);return obj?{record:JSON.parse(await obj.text()),etag:obj.etag}:null;}
async function checked(env,lane,journal){
  const current=await lanes[lane].deliver(env,journal,undefined,true);
  return {current,snapshot:current.ok?await notificationDigest(JSON.stringify(current)):null};
}

export async function listNotificationReviews(env,{lane='model-payout-instructions',cursor=''}={}){
  if(!lanes[lane]||typeof cursor!=='string'||cursor.length>1000)throw fail('review_selector_invalid',400);
  const bucket=storage(env,lane);
  if(!bucket?.list||!bucket?.get)throw fail('review_storage_unavailable',503);
  const listing=await bucket.list({prefix:`${root}${lane}/receipts/`,limit:20,...(cursor?{cursor}:{})});
  const items=[];
  for(const object of listing.objects||[]){
    const entry=await read(bucket,object.key),j=entry?.record;
    if(j?.status!=='manual_review')continue;
    let check;
    try{check=await checked(env,lane,j);}catch{check={current:{ok:false,error:'review_source_unavailable'},snapshot:null};}
    const {current,snapshot}=check;
    const child=j.owner_review?.decision==='not_received'?await readPaymentNotification({bucket,lane,eventKey:`owner-reviewed:${j.id}`}):null;
    items.push({id:j.id,lane,session_id:j.payload?.session_id,status:j.status,error:j.last_error,created_at:new Date(j.created_at).toISOString(),
      resolution:j.owner_review?.decision||null,reviewed_at:j.owner_review?.at||null,
      review_note:j.owner_review?.note||null,
      state:current.state||null,recipient_last4:current.recipient?.slice(-4)||null,account_last4:current.account_last4||null,
      delivery_status:child?.status||null,
      can_resend:current.ok===true&&(!j.owner_review||(j.owner_review.decision==='not_received'&&!child)),snapshot,blocked_reason:current.ok?null:current.error});
  }
  return {ok:true,items,next_cursor:listing.truncated?listing.cursor:null};
}

export async function resolveNotificationReview(env,body,actor){
  if(!actor?.id||!['owner','admin','super_admin','superadmin'].includes(actor.role))throw fail('owner_admin_session_required',403);
  const {lane,id,decision,snapshot}=body||{},note=String(body?.note||'').trim();
  if(lane===RECONFIRM_OWNER_LANE&&body?.inspection_confirmed!==true)throw fail('telegram_inspection_required',400);
  if(!lanes[lane]||! /^[a-f0-9]{64}$/.test(id||'')||!['received','not_received'].includes(decision)||note.length<5||note.length>500)
    throw fail('review_evidence_required',400);
  const bucket=storage(env,lane),key=receiptKey(lane,id);
  if(!bucket?.get||!bucket?.put)throw fail('review_storage_unavailable',503);
  const first=await read(bucket,key);
  if(!first||first.record.status!=='manual_review')throw fail('manual_review_required');
  const sessionId=first.record.payload?.session_id;
  if(!sessionId)throw fail('review_session_missing');
  return withSessionCompletionLock(env,sessionId,async()=>{
    const entry=await read(bucket,key),j=entry?.record;
    if(!j||j.status!=='manual_review')throw fail('manual_review_required');
    if(j.owner_review){
      const child=j.owner_review.decision==='not_received'?await readPaymentNotification({bucket,lane,eventKey:`owner-reviewed:${id}`}):null;
      if(decision!=='not_received'||j.owner_review.decision!=='not_received'||child)throw fail('review_already_resolved');
    }
    if(decision==='not_received'){
      const check=await checked(env,lane,j);
      if(!check.current.ok)throw fail(check.current.error||'review_context_changed');
      if(!snapshot||snapshot!==check.snapshot)throw fail('review_context_changed');
    }
    const reviewed={...j,owner_review:{decision,actor_id:actor.id,note,snapshot:decision==='not_received'?snapshot:null,at:new Date().toISOString()}};
    if(!j.owner_review){
      const saved=await bucket.put(key,JSON.stringify(reviewed),{onlyIf:{etagMatches:entry.etag},httpMetadata:{contentType:'application/json'}});
      if(saved===null)throw fail('review_already_resolved');
    }
    if(decision==='received')return {ok:true,resolution:'received',message_sent:false};
    // Separate durable child journal; never reset or erase the uncertain receipt.
    const result=await dispatchPaymentNotification({bucket,lane,eventKey:`owner-reviewed:${id}`,payload:j.payload,
      deliver:(journal,checkpoint)=>lanes[lane].deliver(env,journal,checkpoint)});
    return {ok:true,resolution:'not_received',delivery_status:result.status,delivered:result.delivered};
  });
}
