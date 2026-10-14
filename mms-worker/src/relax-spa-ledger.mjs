const PREFIX = '/internal/mms/admin/relax-spa';
const ROLES = ['therapist', 'spa', 'partner', 'mms'];
const OWNER = 'owner';
const ACCESS = [OWNER, 'mms_partner', 'spa_partner'];
const fail = (status, code) => { throw Object.assign(new Error(code), { status, code }); };
const text = (v, max = 240) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const response = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
const money = v => { if (!Number.isSafeInteger(v) || v < 0 || v > 100_000_000) fail(400, 'AMOUNT_INVALID'); return v; };
const required = (v, max = 240) => { const s = text(v, max); if (!s) fail(400, 'DETAIL_REQUIRED'); return s; };
const reference = v => { const s = required(v); if (/[\u0000-\u001f<>]/.test(s)) fail(400, 'EVIDENCE_INVALID'); return s; };
const time = v => { const s = required(v, 40), n = Date.parse(s); if (!Number.isFinite(n) || n > Date.now() + 60_000) fail(400, 'DATE_INVALID'); return new Date(n).toISOString(); };
const owner = a => { if (a?.role !== OWNER) fail(403, 'OWNER_REQUIRED'); };
const id = prefix => prefix + '_' + crypto.randomUUID().replaceAll('-', '');
const empty = () => ({ referrals: [], agreements: [], services: [], events: [], requests: {} });

export function calculateSpaShares(service, agreement) {
  const received = service.receipts.reduce((sum, r) => sum + money(r.amount), 0);
  const costs = service.costs.reduce((sum, c) => sum + money(c.amount), 0);
  const basis = agreement.basis === 'net_profit' ? received - costs : received;
  if (basis < 0) fail(409, 'NEGATIVE_PROFIT_REQUIRES_REVIEW');
  if (ROLES.reduce((sum, role) => sum + agreement.shares_bps[role], 0) !== 10_000) fail(409, 'SHARES_MUST_TOTAL_100');
  const rows = ROLES.map(role => {
    const product = BigInt(basis) * BigInt(agreement.shares_bps[role]);
    return { role, amount: Number(product / 10_000n), remainder: Number(product % 10_000n) };
  });
  let spare = basis - rows.reduce((sum, row) => sum + row.amount, 0);
  for (const row of [...rows].sort((a, b) => b.remainder - a.remainder || ROLES.indexOf(a.role) - ROLES.indexOf(b.role))) {
    if (spare-- > 0) row.amount += 1;
  }
  return { received, costs, basis_amount: basis, shares: Object.fromEntries(rows.map(r => [r.role, r.amount])) };
}

function visible(state, actor) {
  const full = actor.role === OWNER;
  const referrals = state.referrals.filter(r => full || r.partner_id === actor.id);
  const ids = new Set(referrals.map(r => r.id));
  const services = state.services.filter(s => ids.has(s.referral_id));
  const agreementIds = new Set(services.map(s => s.agreement.id));
  return { actor: { id: actor.id, role: actor.role }, referrals,
    agreements: state.agreements.filter(a => full || agreementIds.has(a.id)),
    services: services.map(s => full ? s : { id: s.id, referral_id: s.referral_id, job_id: s.job_id,
      therapist_name: s.therapist_name, agreement_title: s.agreement.title, created_at: s.created_at,
      payment_status: s.receipts.length ? 'recorded' : 'awaiting_payment', settlement_status: s.settlement ? 'approved' : 'awaiting_review',
      partner_share: s.settlement?.shares.partner ?? null, partner_payout: s.payouts.find(p => p.role === 'partner') || null }),
    events: full ? state.events : state.events.filter(e => ids.has(e.referral_id)).map(e => ({ at: e.at, action: e.action, referral_id: e.referral_id })),
  };
}

export function applySpaCommand(state, actor, command, body, canonical = {}) {
  if (!actor?.id || !ACCESS.includes(actor.role)) fail(403, 'SPA_ACCESS_REQUIRED');
  const key = required(body.request_key, 100);
  if (!/^[A-Za-z0-9_:.-]{8,100}$/.test(key)) fail(400, 'REQUEST_KEY_INVALID');
  const requestId = actor.id + ':' + key;
  const fingerprint = JSON.stringify({ command, body });
  if (state.requests[requestId]) {
    if (state.requests[requestId].fingerprint !== fingerprint) fail(409, 'REQUEST_KEY_REUSED');
    return { ...state.requests[requestId].result, duplicate: true };
  }
  if (state.events.length >= 5000) fail(409, 'LEDGER_ARCHIVE_REQUIRED');
  let result, referralId;
  const now = new Date().toISOString();
  if (command === 'referrals') {
    if (state.referrals.length >= 200) fail(409, 'LEDGER_ARCHIVE_REQUIRED');
    const partnerId = actor.role === OWNER ? required(body.partner_id, 100) : actor.id;
    if (!/^(?:mms-partner:[A-Za-z0-9_.-]{3,80}|partner:rec[A-Za-z0-9]{14,24})$/.test(partnerId)) fail(400, 'PARTNER_ACCOUNT_INVALID');
    if (!canonical.therapist || canonical.therapist.id !== body.therapist_id || canonical.therapist.status !== 'Active') fail(409, 'THERAPIST_NOT_ACTIVE');
    const existing = state.referrals.find(r => r.partner_id === partnerId && r.therapist_id === body.therapist_id && r.status !== 'declined');
    if (existing) fail(409, 'REFERRAL_ALREADY_EXISTS');
    result = { id: id('sparef'), partner_id: partnerId, therapist_id: body.therapist_id, therapist_name: canonical.therapist.name,
      spa: 'Relax Spa by 9', status: 'referred', note: text(body.note, 1000), created_at: now };
    referralId = result.id;
    state.referrals.push(result);
  } else if (command === 'referral-decision') {
    owner(actor);
    const referral = state.referrals.find(r => r.id === body.referral_id);
    if (!referral) fail(404, 'REFERRAL_NOT_FOUND');
    if (referral.status !== 'referred') fail(409, 'REFERRAL_DECISION_LOCKED');
    if (!['accepted', 'declined'].includes(body.decision)) fail(400, 'DECISION_INVALID');
    referral.status = body.decision; referral.decision_evidence = reference(body.evidence_ref); referral.decided_at = now;
    result = referral; referralId = referral.id;
  } else if (command === 'agreements') {
    owner(actor);
    if (state.agreements.length >= 200) fail(409, 'LEDGER_ARCHIVE_REQUIRED');
    if (!['received_revenue', 'net_profit'].includes(body.basis)) fail(400, 'BASIS_INVALID');
    const shares = {};
    for (const role of ROLES) { const n = body.shares_bps?.[role]; if (!Number.isInteger(n) || n < 0 || n > 10_000) fail(400, 'SHARE_INVALID'); shares[role] = n; }
    if (Object.values(shares).reduce((s, n) => s + n, 0) !== 10_000) fail(400, 'SHARES_MUST_TOTAL_100');
    if (body.approval_confirmed !== true) fail(400, 'AGREEMENT_APPROVAL_REQUIRED');
    result = { id: id('spaagr'), title: required(body.title, 120), basis: body.basis, shares_bps: shares,
      terms_ref: reference(body.terms_ref), approved_by: actor.id, approved_at: now };
    state.agreements.push(result);
  } else if (command === 'services') {
    owner(actor);
    if (state.services.length >= 200) fail(409, 'LEDGER_ARCHIVE_REQUIRED');
    const referral = state.referrals.find(r => r.id === body.referral_id);
    const agreement = state.agreements.find(a => a.id === body.agreement_id);
    if (!referral || referral.status !== 'accepted') fail(409, 'SPA_ACCEPTANCE_REQUIRED');
    if (!agreement) fail(409, 'APPROVED_AGREEMENT_REQUIRED');
    if (!canonical.job || canonical.job.id !== body.job_id || canonical.job.therapist_id !== referral.therapist_id || canonical.job.is_test || ['Cancelled', 'Expired'].includes(canonical.job.status)) fail(409, 'CANONICAL_JOB_MISMATCH');
    if (state.services.some(s => s.job_id === body.job_id)) fail(409, 'JOB_ALREADY_LINKED');
    const expected = money(body.expected_amount); if (expected <= 0) fail(400, 'SERVICE_AMOUNT_REQUIRED');
    if (!Array.isArray(body.costs) || body.costs.length > 20) fail(400, 'COSTS_INVALID');
    const costs = body.costs.map(c => ({ label: required(c.label, 100), amount: money(c.amount), evidence_ref: reference(c.evidence_ref) }));
    if (costs.reduce((s, c) => s + c.amount, 0) > expected) fail(400, 'COSTS_EXCEED_SERVICE_AMOUNT');
    result = { id: id('spasvc'), referral_id: referral.id, therapist_name: referral.therapist_name, partner_id: referral.partner_id,
      job_id: body.job_id, spa: 'Relax Spa by 9', service_evidence: reference(body.service_evidence),
      expected_amount: expected, agreement: structuredClone(agreement), costs, receipts: [], payouts: [], settlement: null, created_at: now };
    state.services.push(result); referralId = referral.id;
  } else {
    owner(actor);
    const service = state.services.find(s => s.id === body.service_id);
    if (!service) fail(404, 'SERVICE_NOT_FOUND');
    referralId = service.referral_id;
    if (command === 'receipts') {
      if (service.settlement) fail(409, 'SETTLEMENT_LOCKED');
      const amount = money(body.amount); if (!amount) fail(400, 'PAYMENT_AMOUNT_REQUIRED');
      const evidence = reference(body.evidence_ref);
      if (body.verification_confirmed !== true) fail(400, 'PAYMENT_VERIFICATION_REQUIRED');
      if (state.services.some(s => s.receipts.some(r => r.evidence_ref === evidence))) fail(409, 'PAYMENT_EVIDENCE_ALREADY_USED');
      if (service.receipts.reduce((s, r) => s + r.amount, 0) + amount > service.expected_amount) fail(409, 'OVERPAYMENT_REQUIRES_REVIEW');
      result = { id: id('spapay'), amount, evidence_ref: evidence, received_by: required(body.received_by, 120), received_at: time(body.received_at), verified_by: actor.id, verified_at: now, verification_source: 'owner_manual_evidence_review' };
      service.receipts.push(result);
    } else if (command === 'settlements') {
      if (service.settlement) fail(409, 'SETTLEMENT_ALREADY_APPROVED');
      if (!canonical.job || canonical.job.id !== service.job_id || canonical.job.therapist_id !== state.referrals.find(r => r.id === service.referral_id)?.therapist_id || canonical.job.status !== 'Completed' || canonical.job.is_test) fail(409, 'COMPLETED_JOB_REQUIRED');
      const totals = calculateSpaShares(service, service.agreement);
      if (totals.received !== service.expected_amount) fail(409, 'FULL_PAYMENT_REQUIRED');
      if (body.approval_confirmed !== true) fail(400, 'SETTLEMENT_APPROVAL_REQUIRED');
      result = { ...totals, approved_by: actor.id, approved_at: now, canonical_job_checked_at: now };
      service.settlement = result;
    } else if (command === 'payouts') {
      if (!service.settlement) fail(409, 'SETTLEMENT_APPROVAL_REQUIRED');
      if (!canonical.job || canonical.job.id !== service.job_id || canonical.job.therapist_id !== state.referrals.find(r => r.id === service.referral_id)?.therapist_id || canonical.job.status !== 'Completed' || canonical.job.is_test) fail(409, 'COMPLETED_JOB_REQUIRED');
      if (!ROLES.includes(body.role)) fail(400, 'RECIPIENT_INVALID');
      if (service.payouts.some(p => p.role === body.role)) fail(409, 'PAYOUT_ALREADY_RECORDED');
      const amount = money(body.amount);
      if (!amount || amount !== service.settlement.shares[body.role]) fail(409, 'PAYOUT_AMOUNT_MISMATCH');
      if (body.verification_confirmed !== true) fail(400, 'PAYOUT_VERIFICATION_REQUIRED');
      const evidence = reference(body.evidence_ref);
      if (state.services.some(s => s.payouts.some(p => p.evidence_ref === evidence))) fail(409, 'PAYOUT_EVIDENCE_ALREADY_USED');
      result = { id: id('spaout'), role: body.role, amount, recipient: required(body.recipient, 120), evidence_ref: evidence,
        paid_at: time(body.paid_at), recorded_by: actor.id, recorded_at: now, verification_source: 'owner_manual_evidence_review' };
      service.payouts.push(result);
    } else fail(404, 'COMMAND_NOT_FOUND');
  }
  state.events.push({ id: id('spaaudit'), action: command, actor_id: actor.id, at: now, referral_id: referralId || null, result_id: result.id || body.service_id });
  const saved = { id: result.id || body.service_id, saved: true };
  state.requests[requestId] = { fingerprint, result: saved };
  return saved;
}

export class RelaxSpaLedger {
  constructor(ctx) { this.storage = ctx.storage; }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'spa-ledger.internal' || request.method !== 'POST') fail(404, 'NOT_FOUND');
      const input = await request.json();
      const actor = input.actor;
      if (!actor?.id || !ACCESS.includes(actor.role)) fail(403, 'SPA_ACCESS_REQUIRED');
      if (input.command === 'snapshot') return response({ ok: true, data: visible(await this.storage.get('state') || empty(), actor) });
      if (input.command === 'job-context') {
        owner(actor);
        const state = await this.storage.get('state') || empty();
        const service = state.services.find(s => s.id === input.body.service_id);
        if (!service) fail(404, 'SERVICE_NOT_FOUND');
        return response({ ok: true, job_id: service.job_id });
      }
      const data = await this.storage.transaction(async tx => {
        const state = await tx.get('state') || empty();
        const result = applySpaCommand(state, actor, input.command, input.body, input.canonical);
        await tx.put('state', state);
        return result;
      });
      return response({ ok: true, data });
    } catch (e) { return response({ ok: false, error: { code: e.code || 'SPA_LEDGER_UNAVAILABLE' } }, e.status || 503); }
  }
}

async function canonicalRecord(env, table, field, value, pattern) {
  if (!pattern.test(value || '')) fail(400, 'CANONICAL_ID_INVALID');
  const tableId = env[`AIRTABLE_${table}_TABLE_ID`];
  if (!/^tbl[A-Za-z0-9]{14}$/.test(tableId || '') || !/^app[A-Za-z0-9]{14}$/.test(env.AIRTABLE_BASE_ID || '') || !env.AIRTABLE_API_TOKEN) fail(503, 'CANONICAL_STORE_UNAVAILABLE');
  const q = new URLSearchParams({ maxRecords: '2', filterByFormula: `{${field}}='${value}'` });
  const r = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableId}?${q}`, { headers: { authorization: `Bearer ${env.AIRTABLE_API_TOKEN}` } });
  const p = await r.json();
  if (!r.ok || !Array.isArray(p.records)) fail(503, 'CANONICAL_STORE_UNAVAILABLE');
  if (p.records.length !== 1) fail(409, 'CANONICAL_RECORD_UNRESOLVED');
  return p.records[0].fields;
}
async function jobRecord(env, jobId) {
  const f = await canonicalRecord(env, 'JOBS', 'Job ID', jobId, /^mmsjob_[a-f0-9]{24}$/);
  let payload; try { payload = JSON.parse(f['Internal Payload JSON'] || '{}'); } catch { fail(409, 'CANONICAL_JOB_INVALID'); }
  return { id: f['Job ID'], therapist_id: f['Accepted Therapist ID'], status: f['Job Status'], is_test: payload.is_test === true || /^\[TEST/i.test(f.Service || '') };
}

export async function maybeHandleRelaxSpaLedger(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + '/')) return null;
  try {
    if (url.hostname !== (env.MMS_INTERNAL_HOST || 'mms.internal')) fail(404, 'NOT_FOUND');
    const actor = { id: text(request.headers.get('x-mms-spa-actor'), 100), role: text(request.headers.get('x-mms-spa-role'), 40) };
    if (!actor.id || !ACCESS.includes(actor.role)) fail(403, 'SPA_ACCESS_REQUIRED');
    const command = url.pathname.slice(PREFIX.length + 1);
    if (!['snapshot', 'catalog', 'referrals', 'referral-decision', 'agreements', 'services', 'receipts', 'settlements', 'payouts'].includes(command)) fail(404, 'NOT_FOUND');
    if (request.method !== (['snapshot', 'catalog'].includes(command) ? 'GET' : 'POST')) fail(405, 'METHOD_NOT_ALLOWED');
    if (actor.role !== OWNER && !['snapshot', 'catalog', 'referrals'].includes(command)) fail(403, 'OWNER_REQUIRED');
    if (command === 'catalog') {
      const table = env.AIRTABLE_THERAPISTS_TABLE_ID;
      if (!/^tbl[A-Za-z0-9]{14}$/.test(table || '') || !/^app[A-Za-z0-9]{14}$/.test(env.AIRTABLE_BASE_ID || '') || !env.AIRTABLE_API_TOKEN) fail(503, 'CANONICAL_STORE_UNAVAILABLE');
      const q = new URLSearchParams({ maxRecords: '100', filterByFormula: "{Status}='Active'" });
      const r = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${table}?${q}`, { headers: { authorization: `Bearer ${env.AIRTABLE_API_TOKEN}` } });
      const p = await r.json(); if (!r.ok || !Array.isArray(p.records)) fail(503, 'CANONICAL_STORE_UNAVAILABLE');
      if (p.offset) fail(503, 'THERAPIST_CATALOG_INCOMPLETE');
      return response({ ok: true, data: { therapists: p.records.filter(r => r.fields?.Status === 'Active').map(r => ({ therapist_id: r.fields['Therapist ID'], display_name: text(r.fields['Display Name'], 120), status: 'Active' })).filter(t => /^mmst_[a-f0-9]{24}$/.test(t.therapist_id || '')) } });
    }
    if (!env.RELAX_SPA_LEDGER?.get || !env.RELAX_SPA_LEDGER?.idFromName) fail(503, 'SPA_LEDGER_NOT_CONFIGURED');
    const stub = env.RELAX_SPA_LEDGER.get(env.RELAX_SPA_LEDGER.idFromName('relax-spa-by-9:v1'));
    const invoke = (c, body = {}, canonical = {}) => stub.fetch(new Request('https://spa-ledger.internal', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ actor, command: c, body, canonical }) }));
    if (command === 'snapshot') return invoke(command);
    if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'JSON_REQUIRED');
    const raw = await request.text(); if (raw.length > 16_384) fail(413, 'BODY_TOO_LARGE');
    let body; try { body = JSON.parse(raw); } catch { fail(400, 'INVALID_JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'INVALID_JSON');
    const canonical = {};
    if (command === 'referrals') {
      const f = await canonicalRecord(env, 'THERAPISTS', 'Therapist ID', body.therapist_id, /^mmst_[a-f0-9]{24}$/);
      canonical.therapist = { id: f['Therapist ID'], name: text(f['Display Name'], 120), status: f.Status };
    }
    if (command === 'services') canonical.job = await jobRecord(env, body.job_id);
    if (['settlements', 'payouts'].includes(command)) {
      const context = await invoke('job-context', body);
      if (!context.ok) return context;
      canonical.job = await jobRecord(env, (await context.json()).job_id);
    }
    return invoke(command, body, canonical);
  } catch (e) { return response({ ok: false, error: { code: e.code || 'SPA_LEDGER_UNAVAILABLE' } }, e.status || 503); }
}
