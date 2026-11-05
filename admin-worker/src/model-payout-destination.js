import { dispatchPaymentNotification, drainPaymentNotifications, notificationDigest } from '../../shared/payment-notification-outbox.mjs';
import { resolveOwnerDestination } from './model-reconfirm-guard.js';
import { readCustomerCompletion,withSessionCompletionLock } from '../../shared/session-completion.mjs';
import { deliverTelegramOnce } from '../../shared/telegram-delivery-once.mjs';

const SESSIONS = 'tblC98mKWbzmPuNzX';
const MODELS = 'tblI4B0bI446vp9GX';
const clean = value => String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160);
const reviewRevision = fields => fields.completion_reviewed_at || fields.fldwFJHdx52esyQcq || '';

async function read(env, table, id) {
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${table}/${encodeURIComponent(id)}`, {
    signal: AbortSignal.timeout(10000),
    headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN}` },
  });
  if (!response.ok) throw new Error('payout_source_unavailable');
  return response.json();
}

export async function readVerifiedPayoutDestination(env, session) {
  const links = session.fields?.['Canonical Model'] ?? session.fields?.fldrXQAyOMPCvbOaY;
  if (!Array.isArray(links) || links.length !== 1 || !/^rec[A-Za-z0-9]+$/.test(links[0])) throw new Error('payout_model_ambiguous');
  const model = await read(env, MODELS, links[0]);
  const f = model.fields || {};
  if (model.id !== links[0] || f.payout_dest_status !== 'verified' || !f.payout_dest_verified_by ||
      !Number.isFinite(Date.parse(f.payout_dest_verified_at)) ||
      (f.payout_dest_submitted_at && (!Number.isFinite(Date.parse(f.payout_dest_submitted_at)) || Date.parse(f.payout_dest_submitted_at) > Date.parse(f.payout_dest_verified_at)))) {
    throw new Error('payout_destination_not_verified');
  }
  const destination = { model_id: model.id, type: clean(f.payout_dest_type), bank: clean(f.payout_dest_bank),
    name: clean(f.payout_dest_name), reference: clean(f.payout_dest_ref), verified_at: f.payout_dest_verified_at };
  if (!['bank_account', 'promptpay_phone', 'promptpay_national_id'].includes(destination.type) || !destination.name || !/^[0-9][0-9 -]{6,24}[0-9]$/.test(destination.reference) ||
      (destination.type === 'bank_account' && !destination.bank)) throw new Error('payout_destination_incomplete');
  return destination;
}

export async function sendOwnerPayoutInstructions(env, session, amount, canSend = async () => false) {
  if(!env.PRIVATE_MODEL_MEDIA?.get||!env.PRIVATE_MODEL_MEDIA?.put)return {delivered:false,status:'owner_notification_storage_unavailable'};
  const owner = resolveOwnerDestination(env);
  // Full bank details may go only to the explicitly configured owner's private chat.
  if (!owner || !/^[1-9]\d*$/.test(owner.chat_id)) return { delivered: false, status: 'owner_private_chat_required' };
  const token = env.AUTH_SERVICE_STUDIO_TO_TELEGRAM;
  if (!token || !env.TELEGRAM_INTERNAL_SEND_URL) return { delivered: false, status: 'owner_transport_unavailable' };
  try {
    const destination = await readVerifiedPayoutDestination(env, session);
    const sessionId = session.fields.session_id ?? session.fields.fldLTq2kZbyRv22IA;
    const result = await dispatchPaymentNotification({ bucket: env.PRIVATE_MODEL_MEDIA, lane: 'model-payout-instructions',
      eventKey: `${sessionId}:${destination.model_id}:${destination.verified_at}:${amount}:${owner.chat_id}:${session.fields.completion_reviewed_at||session.fields.fldwFJHdx52esyQcq||''}`,
      payload: { session_id: sessionId, record_id:session.id, amount, owner_id:owner.chat_id, review_revision:reviewRevision(session.fields), destination_digest:await notificationDigest(JSON.stringify(destination)) },
      deliver: (journal,checkpoint) => deliverPayoutJournal(env,journal,canSend,checkpoint),
    });
    return { delivered: result?.delivered === true, status: result?.status || 'unavailable' };
  } catch { return { delivered: false, status: 'payout_notification_unavailable' }; }
}

export async function deliverPayoutJournal(env,journal,extraCheck=async()=>true,checkpoint,validateOnly=false){
        const {session_id:sessionId,record_id:recordId,amount,owner_id:ownerId,destination_digest:digest}=journal.payload||{};
        const owner=resolveOwnerDestination(env),token=env.AUTH_SERVICE_STUDIO_TO_TELEGRAM;
        if(!recordId||!sessionId||!Number.isFinite(amount)||amount<=0||!digest||!owner||owner.chat_id!==ownerId||!/^[1-9]\d*$/.test(owner.chat_id))return {ok:false,retryable:false,error:'payout_retry_context_invalid'};
        if(!token||!env.TELEGRAM_INTERNAL_SEND_URL)return {ok:false,error:'owner_transport_unavailable'};
        const fresh = await read(env, SESSIONS, recordId);
        const fields = fresh.fields || {};
        if (!journal.payload.review_revision || journal.payload.review_revision !== reviewRevision(fields))
          return {ok:false,retryable:false,error:'payout_authorization_changed'};
        if (fields.session_id!==sessionId||!readCustomerCompletion(fields).approved || fields.model_session_state !== 'payout_pending' ||
            !['clear', 'resolved'].includes(fields.completion_review_status) || fields.payout_hold_reason ||
            Number(fields.pay_model_thb) !== amount) return { ok: false, retryable:false,error: 'payout_not_ready' };
        const {readPayoutRetryAction}=await import('./job-orchestrator-owner-ops-runtime.js');
        const item=await readPayoutRetryAction(env,sessionId,recordId);
        if(item.error)return {ok:false,retryable:false,error:item.error};
        if(!item?.actions?.can_resend_payout_instructions||!await extraCheck(fresh))return {ok:false,retryable:false,error:'payout_not_ready'};
        const current = await readVerifiedPayoutDestination(env, fresh);
        if (await notificationDigest(JSON.stringify(current)) !== digest) return { ok: false,retryable:false,error: 'payout_destination_changed' };
        const latest=await read(env,SESSIONS,recordId);
        if(JSON.stringify(latest.fields)!==JSON.stringify(fields))return {ok:false,retryable:false,error:'payout_session_changed'};
        if(validateOnly)return {ok:true,state:fields.model_session_state,recipient:owner.chat_id,account_last4:current.reference.slice(-4),review_revision:reviewRevision(fields)};
        const text = ['MMD · READY TO PAY', `Session: ${sessionId}`, `Amount: ${amount.toFixed(2)} THB`,
          `Bank/type: ${current.bank || current.type}`, `Account name: ${current.name}`, `Account: ${current.reference}`,
          'Manual transfer by Per only. Record transfer reference after the actual transfer.'].join('\n');
        return deliverTelegramOnce(journal,checkpoint,()=>fetch(env.TELEGRAM_INTERNAL_SEND_URL, { method: 'POST',
          signal: AbortSignal.timeout(10000),
          headers: { 'content-type': 'application/json', 'x-internal-token': token },
          body: JSON.stringify({ chat_id: owner.chat_id, text, idempotency_key: journal.id,
            source: 'admin-worker', intent: 'model_payout_instructions' }),
        }));
}

export const drainOwnerPayoutInstructions=(env,now=Date.now())=>drainPaymentNotifications({bucket:env.PRIVATE_MODEL_MEDIA,lane:'model-payout-instructions',deliver:(journal,checkpoint)=>journal.payload?.session_id?withSessionCompletionLock(env,journal.payload.session_id,()=>deliverPayoutJournal(env,journal,undefined,checkpoint)):Promise.resolve({ok:false,retryable:false,error:'payout_retry_context_invalid'}),now,limit:5});
