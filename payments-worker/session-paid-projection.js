// A derived Session cache only. Payments remain the money authority.
import { BALANCE_FIELDS as F, readVerifiedSessionBalance } from './verified-session-balance.js';
const text = value => String(value?.name ?? value ?? '').trim();
const code = value => text(value).toLowerCase();
const ids = value => Array.isArray(value) ? value.map(v => text(v?.id ?? v)).sort() : [];
const serviceStages = new Set(['deposit', 'final', 'full']);
const laneFields = ['fldzYGziqLqTQaoaK', 'model_work_lane', 'fldxo2T68yebcpGkw', 'session_type_raw', 'fldr4t9Cz58oCU96A', 'Session Type', 'fldjK3U9bghnj7xUe', 'job_type'];
const excluded = value => /mms|massage|membership|renewal|shop|historical/i.test(text(value));
const mmdLanes = new Set(['pn', 'vip', 'svip', 'public', 'private', 'public_model', 'private_model']);
const clientIds = f => ids(f.fld6P6if0vDZCeV0C ?? f.Client ?? f.client);
const quote = value => text(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const sidOf = f => text(f[F.sessionId] ?? f.session_id);
const table = env => env.AIRTABLE_TABLE_SESSIONS || env.AIRTABLE_TABLE_SESSIONS_ID || 'tblC98mKWbzmPuNzX';
const validSid = value => /^sess[-_][A-Za-z0-9_-]{1,210}$/.test(text(value));
const result = (status, reason, extra = {}) => ({ status, ...(reason ? { reason } : {}), payment_truth_changed: false, ...extra });
const fail = (message, transient = false) => { throw Object.assign(new Error(message), { transient }); };

export function sessionProjectionScope(session) {
  const f = session?.fields || {}, lanes = laneFields.map(k => code(f[k])).filter(Boolean);
  if (lanes.some(excluded)) return 'excluded';
  if (!lanes.some(v => mmdLanes.has(v))) return 'unknown';
  return 'mmd';
}

// Called only after the existing authorized payment write succeeded. No incoming
// amount or slip count is passed to the coordinator; it must re-read the ledger.
export async function requestSessionPaidProjection(env, { session_id, stage, payment_ref = '' } = {}) {
  if (!serviceStages.has(code(stage)) || !validSid(session_id)) return result('skipped', 'non_service_payment');
  if (!env.SESSION_PAID_PROJECTION_COORDINATOR) return result('not_configured', 'projection_coordinator_missing');
  try {
    const ns = env.SESSION_PAID_PROJECTION_COORDINATOR;
    const stub = ns.get(ns.idFromName(`session:${session_id}`));
    const response = await stub.fetch('https://session-paid-projection.internal/reconcile', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id, payment_ref: text(payment_ref) }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.status) throw Error('projection_dispatch_failed');
    return payload;
  } catch { return result('retry_required', 'projection_dispatch_failed'); }
}

function boundedEnv(env) {
  const deadline = Date.now() + 12000;
  return { ...env, AIRTABLE_HTTP: { async fetch(input) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) fail('projection_lookup_timeout', true);
    const req = new Request(input, { signal: AbortSignal.timeout(Math.min(remaining, 4000)) });
    return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(req) : fetch(req);
  } } };
}
async function request(env, url, init = {}) {
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) fail('projection_airtable_not_ready', true);
  let response;
  try { response = await env.AIRTABLE_HTTP.fetch(new Request(url, { ...init, headers: {
    authorization: `Bearer ${env.AIRTABLE_API_KEY}`, 'content-type': 'application/json', ...init.headers,
  } })); } catch { fail('projection_lookup_unavailable', true); }
  if (!response.ok) fail('projection_airtable_failed', response.status === 429 || response.status >= 500);
  const data = await response.json().catch(() => null);
  if (!data) fail('projection_response_invalid', true);
  return data;
}
function urlFor(env, recordId = '') {
  return new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table(env))}${recordId ? '/' + encodeURIComponent(recordId) : ''}`);
}
async function sessionFor(env, sessionId) {
  const url = urlFor(env);
  url.searchParams.set('filterByFormula', `{session_id}='${quote(sessionId)}'`);
  url.searchParams.set('returnFieldsByFieldId', 'true'); url.searchParams.set('pageSize', '2');
  const data = await request(env, url);
  if (data.offset || !Array.isArray(data.records) || data.records.length !== 1) fail('projection_session_not_unique');
  const s = data.records[0];
  if (!s.id || sidOf(s.fields || {}) !== sessionId) fail('projection_session_identity_conflict');
  return s;
}
function snapshot(session, summary) {
  const f = session.fields || {};
  return JSON.stringify({ id: session.id, sid: summary.session_id, clients: clientIds(f),
    lane: laneFields.map(k => code(f[k])), total: summary.total_amount_thb,
    state: code(f[F.sessionStatus] ?? f['Session Status']),
    ledger: summary.records.map(({ record, ...p }) => ({ ...p,
      clients: ids(record.fields?.fldcrLuJijj7xr0y8 ?? record.fields?.Client ?? record.fields?.client),
      lane: code(record.fields?.fldB16bQWf4sVt7Ep ?? record.fields?.model_work_lane),
    })).sort((a, b) => a.id.localeCompare(b.id)),
  });
}
async function readSnapshot(env, sessionId, anchor) {
  const session = await sessionFor(env, sessionId);
  const scope = sessionProjectionScope(session);
  if (scope !== 'mmd') return { skipped: result('skipped', scope === 'excluded' ? 'excluded_lane' : 'unknown_job_lane') };
  if (/^(?:cancelled|canceled|rejected|void|refunded|reversed)(?:_|$)/.test(code(session.fields[F.sessionStatus] ?? session.fields['Session Status']))) fail('projection_session_not_payable');
  const clients = clientIds(session.fields);
  if (clients.length !== 1) fail('projection_client_not_unique');
  let summary;
  try { summary = await readVerifiedSessionBalance(env, session); }
  catch (e) {
    const known = /^balance_[a-z0-9_]+$/.test(text(e.message));
    fail(known ? text(e.message) : 'projection_ledger_unavailable', !known || Number(e.status) >= 500);
  }
  for (const p of summary.records) {
    const f = p.record.fields || {}, clientsOnPayment = ids(f.fldcrLuJijj7xr0y8 ?? f.Client ?? f.client);
    if (excluded(f.fldB16bQWf4sVt7Ep ?? f.model_work_lane)) fail('projection_payment_lane_conflict');
    // Older Payments have no Client link; the exact unique canonical session_id
    // remains their existing money linkage. A present Client must agree.
    if (clientsOnPayment.length && (clientsOnPayment.length !== 1 || clientsOnPayment[0] !== clients[0])) fail('projection_payment_client_conflict');
  }
  if (anchor && !summary.records.some(p => p.ref === anchor && p.verified && serviceStages.has(p.stage))) fail('projection_verified_anchor_missing');
  return { session, summary, fingerprint: snapshot(session, summary) };
}

// Private implementation: the per-session coordinator is the only new writer.
async function reconcile(env, task) {
  env = boundedEnv(env);
  const first = await readSnapshot(env, task.session_id, task.payment_ref);
  if (first.skipped) return first.skipped;
  // Verify the complete ledger and scope again before the absolute assignment.
  const fresh = await readSnapshot(env, task.session_id, task.payment_ref);
  if (fresh.skipped || fresh.fingerprint !== first.fingerprint) fail('projection_snapshot_changed', true);
  const sum = fresh.summary.verified_paid_thb;
  const old = fresh.session.fields[F.paidSum] ?? fresh.session.fields.paid_received_sum;
  let changed = false;
  if (old === null || old === undefined || Number(old) !== sum) {
    const url = urlFor(env, fresh.session.id); url.searchParams.set('returnFieldsByFieldId', 'true');
    await request(env, url, { method: 'PATCH', body: JSON.stringify({ fields: { [F.paidSum]: sum }, typecast: false }) });
    changed = true;
  }
  const after = await readSnapshot(env, task.session_id, task.payment_ref);
  if (after.skipped || after.fingerprint !== fresh.fingerprint) fail('projection_changed_after_write', true);
  if (Number(after.session.fields[F.paidSum] ?? after.session.fields.paid_received_sum) !== sum) fail('projection_write_not_visible', true);
  return result(changed ? 'updated' : 'unchanged', '', { session_id: task.session_id, paid_received_sum: sum,
    remaining_amount_thb: after.summary.remaining_amount_thb, verified_payment_count: after.summary.records.filter(p => p.verified && serviceStages.has(p.stage)).length });
}

// No public HTTP route is added. All cache writers for one job share this object.
export class SessionPaidProjectionState {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/reconcile') return Response.json({ error: 'not_found' }, { status: 404 });
    const body = await request.json().catch(() => null);
    if (!validSid(body?.session_id) || text(body?.payment_ref).length > 180) return Response.json({ error: 'invalid_projection_task' }, { status: 400 });
    return this.state.blockConcurrencyWhile(async () => {
      const bound = await this.state.storage.get('session_id');
      if (bound && bound !== body.session_id) return Response.json({ error: 'projection_session_conflict' }, { status: 409 });
      await this.state.storage.put('session_id', body.session_id);
      const task = { session_id: body.session_id, payment_ref: text(body.payment_ref), attempts: 0 };
      // Alarm is durable before any Airtable write; an interrupted/ambiguous
      // PATCH is recovered by fresh absolute reconciliation, never an increment.
      await this.state.storage.put('pending', task);
      await this.state.storage.setAlarm(Date.now() + 60000);
      return Response.json(await this.process(task));
    });
  }
  async process(task) {
    task = { ...task, attempts: Number(task.attempts || 0) + 1 };
    await this.state.storage.put('pending', task);
    try {
      const answer = await reconcile(this.env, task);
      await this.state.storage.put('last_result', answer);
      await this.state.storage.delete('pending'); await this.state.storage.deleteAlarm();
      return answer;
    } catch (e) {
      const retry = e.transient && task.attempts < 6;
      const answer = result(retry ? 'retry_scheduled' : 'needs_review', text(e.message), { retry_exhausted: Boolean(e.transient && !retry) });
      await this.state.storage.put('last_result', answer);
      if (retry) await this.state.storage.setAlarm(Date.now() + Math.min(60000 * 2 ** (task.attempts - 1), 3600000));
      else { await this.state.storage.delete('pending'); await this.state.storage.deleteAlarm(); }
      return answer;
    }
  }
  async alarm() {
    return this.state.blockConcurrencyWhile(async () => {
      const task = await this.state.storage.get('pending');
      if (task) return this.process(task);
    });
  }
}
