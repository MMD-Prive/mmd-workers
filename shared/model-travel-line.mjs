import { readTravelSession, travelBinding, travelState, travelError } from './model-travel-store.mjs';

export const travelNoticeLabels = Object.freeze({ submission: 'โมเดลส่งข้อความหรือภาพเพิ่มเติมเกี่ยวกับงาน', start_travel: 'โมเดลเริ่มเดินทางแล้ว', mark_nearby: 'โมเดลแจ้งว่าใกล้ถึงแล้ว', mark_arrived: 'โมเดลถึงแล้ว', eta: 'โมเดลอัปเดตเวลาคาดว่าจะถึง' });

export async function deliverTravelNotice(env, input) {
  if (!travelNoticeLabels[input?.kind] || !/^[0-9a-f-]{36}$/.test(input.retry_key || '')) throw travelError('travel_notice_invalid', 400);
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) throw travelError('customer_line_transport_unavailable', 503);
  const record = await readTravelSession(env, input.session_id);
  if (await travelBinding(record) !== input.binding) throw travelError('travel_recipient_changed');
  if (['checking', 'cancelled', 'canceled', 'closed', 'completed'].includes(travelState(record))) throw travelError('travel_notification_not_current');
  const to = record.fields.line_user_id;
  if (!/^U[0-9a-f]{32}$/i.test(to || '')) throw travelError('travel_recipient_unlinked');
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, 'content-type': 'application/json', 'x-line-retry-key': input.retry_key },
    body: JSON.stringify({ to, messages: [{ type: 'text', text: `MY MMD\n${travelNoticeLabels[input.kind]}\nเปิดดูงานของคุณ: https://www.mmdbkk.com/my-mmd/?session_id=${encodeURIComponent(input.session_id)}` }] }),
  });
  const accepted = response.ok || (response.status === 409 && Boolean(response.headers.get('x-line-accepted-request-id')));
  return { ok: accepted, error: accepted ? null : `line_http_${response.status}` };
}
