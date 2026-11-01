import { agreedMeetingLocation, meetingBinding, readTravelSession, resolveTravelEta, travelError, travelJson } from '../../shared/model-travel-store.mjs';
import { customerSessionLifecycle } from '../../shared/model-travel-lifecycle.mjs';
import { dispatchPaymentNotification,drainPaymentNotifications } from '../../shared/payment-notification-outbox.mjs';
import { resolveOwnerDestination } from './model-reconfirm-guard.js';
import { deliverTelegramOnce } from '../../shared/telegram-delivery-once.mjs';

export const OWNER_TRAVEL_PATH = '/v1/admin/jobs/travel';
const STATES = ['confirmed', 'en_route', 'nearby', 'arrived', 'met_customer'];
const clean = (value, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const stateOf = record => customerSessionLifecycle({model_session_state:record.fields?.model_session_state, session_state:record.fields?.session_state});

// No chat, photos, room numbers, payment data or participant identities.
export async function projectOwnerTravel(env, record, now = Date.now()) {
  const fields = record.fields || {}, state = stateOf(record);
  const canonical = {...record, fields:{...fields, model_session_state:state, session_state:state}};
  const eta = await resolveTravelEta(env, canonical, now);
  return {session_id:clean(fields.session_id), model_name:clean(fields.model_name), state:state || 'unavailable',
    appointment_location:agreedMeetingLocation(env, record), eta,
    location_alert:eta.location_report ? {kind:'wrong_location', ...eta.location_report} : null};
}

export async function readOwnerTravel(env, params = new URLSearchParams(), now = Date.now()) {
  if ([...params.keys()].some(key => !['session_id', 'cursor'].includes(key)) || params.getAll('session_id').length > 1 || params.getAll('cursor').length > 1) throw travelError('owner_travel_selector_invalid', 400);
  const sessionId = params.get('session_id'), cursor = params.get('cursor');
  if (sessionId && cursor || cursor && (cursor.length > 500 || /[\u0000-\u001f]/.test(cursor))) throw travelError('owner_travel_selector_invalid', 400);
  if (params.has('session_id') && !sessionId) throw travelError('session_id_invalid', 400);
  let records, next = null;
  if (sessionId) records = [await readTravelSession(env, sessionId)];
  else {
    if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) throw travelError('travel_authority_unavailable', 503);
    const query = new URLSearchParams({pageSize:'20', filterByFormula:'OR('+STATES.map(state => `{model_session_state}="${state}"`).join(',')+')'});
    if (cursor) query.set('offset', cursor);
    const response = await (env.AIRTABLE_HTTP?.fetch?.bind(env.AIRTABLE_HTTP) || fetch)(new Request(
      `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_TABLE_SESSIONS || 'tblC98mKWbzmPuNzX')}?${query}`,
      {headers:{authorization:`Bearer ${env.AIRTABLE_API_KEY}`}, signal:AbortSignal.timeout(10000)}));
    if (!response.ok) throw travelError('owner_travel_unavailable', 503);
    const result = await response.json();
    if (!Array.isArray(result.records) || result.records.length > 20 || result.offset && (typeof result.offset !== 'string' || result.offset.length > 500)) throw travelError('owner_travel_unavailable', 503);
    records = result.records; next = result.offset || null;
  }
  const seen = new Set(), items = [];
  for (const record of records) {
    const id = record.fields?.session_id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(id) || seen.has(id)) throw travelError('owner_travel_source_ambiguous', 409);
    seen.add(id);
    if (STATES.includes(stateOf(record)) || sessionId) items.push(await projectOwnerTravel(env, record, now));
  }
  return {ok:true, server_now:new Date(now).toISOString(), items, next_cursor:next};
}

export async function ownerTravelResponse(request, env) {
  if (request.method !== 'GET') return travelJson({ok:false, error:'method_not_allowed'}, 405);
  try { return travelJson(await readOwnerTravel(env, new URL(request.url).searchParams)); }
  catch (error) { return travelJson({ok:false, error:error.code || 'owner_travel_unavailable'}, error.status || 503); }
}

export async function notifyOwnerWrongLocation(env, record, report, etaResult) {
  const owner = resolveOwnerDestination(env);
  // Private owner destination only, with a durable receipt before any send.
  if (!owner || !/^[1-9]\d*$/.test(owner.chat_id) || owner.thread_id) return {delivered:false, status:'owner_private_chat_required'};
  if (!env.PRIVATE_MODEL_MEDIA?.get || !env.PRIVATE_MODEL_MEDIA?.put) return {delivered:false, status:'owner_notification_storage_unavailable'};
  const token = env.AUTH_SERVICE_STUDIO_TO_TELEGRAM;
  if (!token || !env.TELEGRAM_INTERNAL_SEND_URL) return {delivered:false, status:'owner_transport_unavailable'};
  try {
    const sessionId = record.fields.session_id, binding = await meetingBinding(env, record);
    const result = await dispatchPaymentNotification({bucket:env.PRIVATE_MODEL_MEDIA, lane:'model-travel-owner',
      eventKey:JSON.stringify([binding, report.report_id, owner.chat_id]), payload:{session_id:sessionId,binding,report,etaResult,owner_id:owner.chat_id},
      deliver:(journal,checkpoint)=>deliverOwnerTravelJournal(env,journal,checkpoint),
    });
    return {delivered:result.delivered === true, status:result.status};
  } catch { return {delivered:false, status:'owner_travel_notification_unavailable'}; }
}

export async function deliverOwnerTravelJournal(env,journal,checkpoint,validateOnly=false){
        const {session_id:sessionId,binding,report,etaResult,owner_id:ownerId}=journal.payload||{};
        const owner=resolveOwnerDestination(env),token=env.AUTH_SERVICE_STUDIO_TO_TELEGRAM;
        if(!sessionId||!binding||!report||!etaResult||!owner||owner.chat_id!==ownerId||!/^[1-9]\d*$/.test(owner.chat_id)||owner.thread_id)return {ok:false,retryable:false,error:'owner_travel_context_changed'};
        if(!token||!env.TELEGRAM_INTERNAL_SEND_URL)return {ok:false,error:'owner_transport_unavailable'};
        const fresh = await readTravelSession(env, sessionId);
        const eta = await resolveTravelEta(env, fresh);
        if (!['en_route', 'nearby'].includes(stateOf(fresh)) || await meetingBinding(env, fresh) !== binding ||
            eta.location_report?.current_place !== report.current_place || eta.location_report?.reported_at !== etaResult.eta_updated_at) return {ok:false, retryable:false, error:'owner_travel_context_changed'};
        if(validateOnly)return {ok:true,state:stateOf(fresh),recipient:owner.chat_id,reported_at:eta.location_report.reported_at};
        const text = ['MMD · นายแบบแจ้งไปผิดสถานที่', `Session: ${sessionId}`, `นายแบบ: ${clean(fresh.fields.model_name) || '—'}`,
          `ETA ที่แจ้ง: ${report.eta_minutes} นาที`, 'กำลังไปสถานที่นัดเดิม · ลูกค้าและนายแบบคุยกันโดยตรง',
          `https://mmdbkk.com/internal/admin/jobs/completion?session_id=${encodeURIComponent(sessionId)}`].join('\n');
        const request = new Request(env.TELEGRAM_WORKER?.fetch ? 'https://telegram-worker/telegram/internal/send' : env.TELEGRAM_INTERNAL_SEND_URL, {
          method:'POST', signal:AbortSignal.timeout(10000), headers:{'content-type':'application/json', 'x-internal-token':token},
          body:JSON.stringify({chat_id:owner.chat_id, text:text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'), parse_mode:'HTML', idempotency_key:journal.id, source:'admin-worker', intent:'model_wrong_location_owner'}),
        });
        return deliverTelegramOnce(journal,checkpoint,()=>env.TELEGRAM_WORKER?.fetch ? env.TELEGRAM_WORKER.fetch(request) : fetch(request));
}
export const drainOwnerTravelAlerts=(env,now=Date.now())=>drainPaymentNotifications({bucket:env.PRIVATE_MODEL_MEDIA,lane:'model-travel-owner',deliver:(journal,checkpoint)=>deliverOwnerTravelJournal(env,journal,checkpoint),now,limit:5});
