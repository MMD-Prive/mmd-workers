import { readMemberAppSession } from './member-app-api.js';
import baseWorker from './index.js';

export const MEMBER_ATTENTION_PATH = '/api/member/app/attention';
const headers = { 'cache-control': 'private, no-store', vary: 'Cookie', 'x-content-type-options': 'nosniff' };
export const isMemberAttentionRequest = request => new URL(request.url).pathname.replace(/\/$/, '') === MEMBER_ATTENTION_PATH;

// Navigation only: each owning API still checks the current session at use time.
export function projectAttention(membership, payments, session) {
  const items = [];
  for (const payment of payments?.records || []) {
    if (payment.official_status !== 'awaiting_payment') continue;
    let target;
    try { target = new URL(payment.customer_payment_url); } catch { continue; }
    if (target.origin !== 'https://mmdbkk.com' || target.username || target.password || target.hash
      || !['/pay/checkout', '/sigil/pay'].includes(target.pathname)
      || [...target.searchParams.keys()].join(',') !== 't'
      || !/^[A-Za-z0-9._~-]+$/.test(target.searchParams.get('t') || '')) continue;
    items.push({ id: payment.id, kind: 'payment', title: 'ชำระเงินรายการที่ค้าง', label: 'ไปชำระเงิน', url: target.href, priority: 100, authority: 'member-payments-bff', status: 'awaiting_payment' });
  }
  if (session?.acknowledgement?.customerAckAllowed === true && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(session.sessionId || '')) {
    items.push({ id: `booking-${session.sessionId}`, kind: 'booking', title: 'ตรวจและยืนยันการจอง', label: 'ดูการจอง', url: `/member/dashboard?session_id=${encodeURIComponent(session.sessionId)}#/booking`, priority: 80, authority: 'member-app-session', status: 'awaiting_acknowledgement', date: session.jobDate || null });
  }
  const action = membership?.nextAction;
  // Reuse the resolver's exact expired-member renewal decision, never invent an eligibility window.
  if (membership?.lifecycle === 'expired' && action?.kind === 'renew'
    && action.url === '/sigil/member/membership?source=line&intent=renew'
    && Array.isArray(payments?.records)
    && !(payments?.records || []).some(p => ['awaiting_payment', 'pending_review'].includes(p.official_status))) {
    items.push({ id: 'membership-renew', kind: 'renewal', title: 'ต่ออายุสมาชิก', label: 'ดูแพ็กเกจสมาชิก', url: action.url, priority: 60, authority: 'member-app-membership', status: 'expired' });
  }
  return [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export async function handleMemberAttention(request, env = {}, dependencies = {}) {
  const json = (body, status = 200) => Response.json(body, { status, headers });
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  if (new URL(request.url).search) return json({ ok: false, error: 'browser_authority_rejected' }, 400);
  const identity = await (dependencies.readSession || readMemberAppSession)(request, env);
  if (!identity?.lineUserId) return json({ ok: false, error: 'member_session_required' }, 401);
  const readers = dependencies.readers || {
    // Preserve canonical entitlement decorators and the same gates as the public APIs.
    membership: req => baseWorker.fetch(req, env),
    payments: req => baseWorker.fetch(req, env),
    booking: req => baseWorker.fetch(req, env),
  };
  const paths = { membership: '/api/member/app/membership', payments: '/v1/member/payments', booking: '/api/member/app/session/current' };
  const data = {}, sources = {};
  await Promise.all(Object.entries(paths).map(async ([key, path]) => {
    try {
      // Do not forward browser identity selectors or authority headers.
      const url = new URL(path, request.url);
      const response = await readers[key](new Request(url, { headers: request.headers, method: 'GET' }));
      if (response.status === 401 || response.status === 403) { sources[key] = 'auth_required'; return; }
      if (response.status === 204 && key === 'booking') { sources[key] = 'resolved'; return; }
      const value = await response.json();
      if (!response.ok || value?.ok === false || !value || typeof value !== 'object') throw Error();
      if (key === 'payments' && (!Array.isArray(value.records) || value.ok !== true)) throw Error();
      if (key === 'membership' && !['active', 'expired', 'new'].includes(value.lifecycle)) throw Error();
      if (key === 'booking' && !value.sessionId) throw Error();
      data[key] = value; sources[key] = 'resolved';
    } catch { sources[key] = 'unavailable'; }
  }));
  if (Object.values(sources).includes('auth_required')) return json({ ok: false, error: 'member_session_required' }, 401);
  // No actionable amendment-list contract is proven; never turn that gap into an empty success.
  sources.amendments = 'not_connected';
  const items = projectAttention(data.membership, data.payments, data.booking);
  return json({ ok: true, state: 'partial', checked_at: new Date().toISOString(), sources, items, total: items.length, scope: 'current_payment_current_booking_and_membership_only', mutation_allowed: false });
}
