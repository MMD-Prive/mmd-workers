import { readCredentialBoundAdminActor } from './credential-bound-admin-session.js';
import { requestPaymentsConfirmationReissue } from './payments-issuer-transport.js';
import { assertConfirmationUrlPair } from './confirmation-link-role-guard.js';

const PATH = /^\/v1\/admin\/jobs\/([^/]+)\/confirm-links\/reissue\/?$/;
const ORIGINS = new Set(['https://mmdbkk.com', 'https://www.mmdbkk.com']);
const F = { id: 'fldLTq2kZbyRv22IA', ref: 'fldojgjSQLaO0uQLX', state: 'fldmwuvOaiCFdzzRa',
  customer: 'fldi9ZdoiUXzSv1rI', model: 'fld0mFma9J9yfEaKb' };
export const isJobConfirmationReissuePath = path => PATH.test(path);
const json = (body, status = 200) => Response.json(body, { status,
  headers: { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer' } });

async function session(env, id) {
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) throw Error('airtable_not_ready');
  const formula = id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const q = new URLSearchParams({ filterByFormula: `{session_id}='${formula}'`, maxRecords: '2', returnFieldsByFieldId: 'true' });
  for (const field of Object.values(F)) q.append('fields[]', field);
  const req = new Request(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_TABLE_SESSIONS || 'tblC98mKWbzmPuNzX')}?${q}`,
    { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
  const res = await (env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(req) : fetch(req));
  if (!res.ok) throw Error('session_read_failed');
  const data = await res.json();
  if (data.records?.length > 1) throw Error('session_ambiguous');
  return data.records?.[0] || null;
}

function checkedUrl(raw, role, id, ref) {
  const u = new URL(raw);
  if (!ORIGINS.has(u.origin) || u.username || u.password || u.hash || [...u.searchParams.keys()].join() !== 't') throw Error('confirmation_pair_invalid');
  const token = u.searchParams.get('t');
  const part = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
  const claims = JSON.parse(atob(part + '='.repeat((4 - part.length % 4) % 4)));
  if (claims.role !== role || claims.session_id !== id || claims.payment_ref !== ref || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) throw Error('confirmation_pair_invalid');
  return { url: u.toString(), expires: claims.exp };
}

export async function handleJobConfirmationReissue(request, env = {}) {
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!['owner', 'admin'].includes(actor.role)) return json({ ok: false, error: 'forbidden' }, 403);
  const u = new URL(request.url);
  if (!ORIGINS.has(u.origin) || request.headers.get('Origin') !== u.origin) return json({ ok: false, error: 'forbidden_origin' }, 403);
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  let id;
  try { id = decodeURIComponent(u.pathname.match(PATH)?.[1] || ''); } catch { return json({ ok: false, error: 'session_id_invalid' }, 400); }
  const body = await request.json().catch(() => null);
  if (!/^sess_[A-Za-z0-9_\-]{1,210}$/.test(id) || !body || Array.isArray(body) || Object.keys(body).some(k => k !== 'session_id') || body.session_id !== id) {
    return json({ ok: false, error: 'session_id_mismatch' }, 400);
  }
  let issued = false;
  let attempted = false;
  try {
    const before = await session(env, id);
    if (!before) return json({ ok: false, error: 'session_not_found' }, 404);
    if (/cancel|void|refund/i.test(String(before.fields[F.state] || ''))) return json({ ok: false, error: 'session_not_reissuable' }, 409);
    const ref = before.fields[F.ref];
    if (!ref) return json({ ok: false, error: 'session_payment_ref_missing' }, 409);
    // The existing issuer owns signing and TTL. Never create another Payment or retry an ambiguous write.
    attempted = true;
    const res = await requestPaymentsConfirmationReissue(env, { session_id: id });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok !== true) return json({ ok: false, error: 'confirmation_reissue_failed', upstream_status: res.status }, res.status === 409 ? 409 : 503);
    issued = true;
    if (data.session_id !== id || data.payment_ref !== ref || data.payment_state_mutated !== false) throw Error('issuer_contract_mismatch');
    const after = await session(env, id);
    if (!after || after.fields[F.id] !== id || after.fields[F.ref] !== ref || /cancel|void|refund/i.test(String(after.fields[F.state] || ''))) throw Error('session_changed');
    assertConfirmationUrlPair(after.fields[F.customer], after.fields[F.model]);
    const customer = checkedUrl(after.fields[F.customer], 'customer', id, ref);
    const model = checkedUrl(after.fields[F.model], 'model', id, ref);
    if (customer.expires !== data.expires_at || model.expires !== data.expires_at) throw Error('confirmation_pair_invalid');
    return json({ ok: true, session_id: id, payment_ref: ref, customer_url: customer.url, model_url: model.url,
      expires_at: new Date(data.expires_at * 1000).toISOString(), payment_state_mutated: false, notification_sent: false });
  } catch {
    return json({ ok: false, error: { code: issued ? 'confirmation_reissued_readback_failed' : 'confirmation_reissue_unavailable',
      message: attempted ? 'ออกลิงก์แล้วแต่ตรวจผลไม่ครบ ตรวจ Session เดิมก่อนกดซ้ำ' : 'ยังออกลิงก์ไม่สำเร็จ ตรวจการเชื่อมต่อหลังบ้าน' }, review_required: attempted }, attempted ? 409 : 503);
  }
}
