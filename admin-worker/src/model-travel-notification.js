import { dispatchPaymentNotification, readPaymentNotification } from '../../shared/payment-notification-outbox.mjs';
import { readTravelSession, travelBinding, travelState } from '../../shared/model-travel-store.mjs';
import { deliverTravelNotice, travelNoticeLabels } from '../../shared/model-travel-line.mjs';

const LANE = 'model-travel';
const safe = result => ({ delivered: result?.delivered === true, status: result?.status || 'unavailable' });
const eventKey = (sessionId, binding, id) => `${sessionId}:${binding}:${id}`;

export async function travelDeliveryStatus(env, record, id) {
  try {
    const result = await readPaymentNotification({ bucket: env.PRIVATE_MODEL_MEDIA, lane: LANE, eventKey: eventKey(record.fields.session_id, await travelBinding(record), id) });
    return { delivered: result?.status === 'delivered', status: result?.status || 'pending' };
  } catch { return safe(null); }
}

export async function notifyTravelEvent(env, record, id, kind = 'submission') {
  if (!travelNoticeLabels[kind] || !env.PRIVATE_MODEL_MEDIA?.put || (!env.MEMBER_DASHBOARD_CHAT_WORKER?.fetch && !env.LINE_CHANNEL_ACCESS_TOKEN)) return safe(null);
  // Existing MMD customer OA transport; never borrow MODEL or MMS tokens.
  try {
    const binding = await travelBinding(record), sessionId = record.fields.session_id;
    const result = await dispatchPaymentNotification({ bucket: env.PRIVATE_MODEL_MEDIA, lane: LANE,
      eventKey: eventKey(sessionId, binding, id), payload: { session_id: sessionId, binding, kind },
      deliver: async journal => {
        const fresh = await readTravelSession(env, sessionId);
        if (await travelBinding(fresh) !== binding) return { ok: false, error: 'travel_recipient_changed' };
        if (['checking', 'cancelled', 'canceled', 'closed', 'completed'].includes(travelState(fresh))) return { ok: false, error: 'travel_notification_not_current' };
        const h = journal.id;
        const retryKey = `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;
        const payload = { session_id: sessionId, binding, kind, retry_key: retryKey };
        if (!env.MEMBER_DASHBOARD_CHAT_WORKER?.fetch) return deliverTravelNotice(env, payload);
        if (!env.INTERNAL_TOKEN) return { ok: false, error: 'travel_service_auth_unavailable' };
        const response = await env.MEMBER_DASHBOARD_CHAT_WORKER.fetch(new Request('https://member-dashboard-chat-worker.local/__internal/line/model-travel-notify', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.INTERNAL_TOKEN}`, 'x-mmd-internal-call': 'true', 'x-mmd-service-binding': 'admin-worker' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
        }));
        const result = await response.json();
        return { ok: response.ok && result.ok === true, error: result.error || null };
      },
    });
    return safe(result);
  } catch { return safe(null); }
}
