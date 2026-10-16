import { spaJobId, produceSpaJob } from './relax-spa-job.mjs';
import { agreementV2, agreementV3, inclusivePlan, inclusiveActual } from './relax-spa-agreement.mjs';
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

const sameEvidence = (a, b) => a.normalize('NFKC').toLowerCase() === b.normalize('NFKC').toLowerCase();
function paymentStatus(s) {
  const received = s.receipts.reduce((n, r) => n + r.amount, 0), refunded = [...(s.refunds || []), ...(s.corrections || []).filter(c=>c.type==='customer_refund')].reduce((n, r) => n + r.amount, 0);
  if (refunded) return refunded === received ? 'refunded' : 'partially_refunded';
  return received === 0 ? 'awaiting_payment' : received === s.expected_amount ? 'paid' : 'partial';
}
function completedJob(service, state, canonical) {
  if (!canonical.job || canonical.job.id !== service.job_id || canonical.job.therapist_id !== state.referrals.find(r => r.id === service.referral_id)?.therapist_id || canonical.job.status !== 'Completed' || canonical.job.is_test) fail(409, 'COMPLETED_JOB_REQUIRED');
  if (service.agreement?.schema_version >= 2) {
    if (canonical.job.duration_minutes !== service.agreement.duration_minutes) fail(409, 'DURATION_AGREEMENT_MISMATCH');
    canonicalMoney(canonical.job, service.agreement);
  }
}

const empty = () => ({ referrals: [], agreements: [], services: [], events: [], requests: {} });

export function calculateSpaShares(service, agreement) {
  if (agreement.schema_version >= 2) return inclusiveActual(service);
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
  return { actor: { id: actor.id, role: actor.role }, referrals,
    agreements: full ? state.agreements : [],
    services: services.map(s => full ? { ...s, job_creation: s.job_creation ? { job_id:s.job_creation.job_id, service_start_at:s.job_creation.service_start_at, service_evidence:s.job_creation.service_evidence, requested_at:s.job_creation.requested_at, completed_at:s.job_creation.completed_at } : undefined, payment_status: paymentStatus(s), reconciliation_summary: reconciliationSummary(s) } : { id: s.id, referral_id: s.referral_id, job_id: s.job_id,
      therapist_name: s.therapist_name, status: s.status || 'booked', agreement_title: s.agreement?.title || 'ฉบับร่าง', created_at: s.created_at,
      payment_status: paymentStatus(s), settlement_status: s.settlement ? 'approved' : 'awaiting_review',
      partner_share: reconciliationSummary(s)?.shares.partner ?? null, partner_return_due: reconciliationSummary(s)?.return_due.partner ?? 0, partner_payout: s.payouts.find(p => p.role === 'partner') ? { amount: reconciliationSummary(s)?.net_paid.partner ?? s.payouts.find(p => p.role === 'partner').amount, recorded_at: s.payouts.find(p => p.role === 'partner').recorded_at } : null }),
    events: full ? state.events : state.events.filter(e => ids.has(e.referral_id)).map(e => ({ at: e.at, action: e.action, referral_id: e.referral_id })),
  };
}

export function applySpaCommand(state, actor, command, body, canonical = {}) {
  if (!actor?.id || !ACCESS.includes(actor.role)) fail(403, 'SPA_ACCESS_REQUIRED');
  if (actor.role !== OWNER && command !== 'referrals') fail(403, 'OWNER_REQUIRED');
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
    const evidence = reference(body.evidence_ref);
    referral.status = body.decision; referral.decision_evidence = evidence; referral.decided_at = now;
    result = referral; referralId = referral.id;
  } else if (command === 'agreements') {
    owner(actor);
    if (state.agreements.length >= 200) fail(409, 'LEDGER_ARCHIVE_REQUIRED');
    result = { id: id('spaagr'), ...agreementV3(body, actor, now) };
    state.agreements.push(result);
  } else if (command === 'drafts') {
    owner(actor);
    if (state.services.length >= 200) fail(409, 'LEDGER_ARCHIVE_REQUIRED');
    const referral = state.referrals.find(r => r.id === body.referral_id);
    if (!referral || referral.status !== 'accepted') fail(409, 'SPA_ACCEPTANCE_REQUIRED');
    result = { id: id('spasvc'), referral_id: referral.id, therapist_id: referral.therapist_id,
      therapist_name: referral.therapist_name, partner_id: referral.partner_id, spa: 'Relax Spa by 9', spa_id: 'relax-spa-by-9',
      status: 'draft', note: text(body.note, 1000), agreement: null, job_id: null, costs: [], receipts: [], refunds: [], payouts: [], expenses: [], settlement: null, created_at: now };
    state.services.push(result); referralId = referral.id;
  } else if (command === 'quotes') {
    owner(actor);
    const service = state.services.find(s => s.id === body.service_id);
    if (!service) fail(404, 'SERVICE_NOT_FOUND');
    if (service.status !== 'draft') fail(409, 'QUOTE_LOCKED');
    const a = state.agreements.find(a => a.id === body.agreement_id);
    if (!a || a.schema_version !== 3 || a.status !== 'confirmed') fail(409, 'CONFIRMED_AGREEMENT_REQUIRED');
    if (a.therapist_id !== service.therapist_id || a.spa_id !== service.spa_id) fail(409, 'AGREEMENT_SCOPE_MISMATCH');
    if (a.referrer_id && a.referrer_id !== service.partner_id) fail(409, 'REFERRER_SCOPE_MISMATCH');
    if (body.approval_confirmed !== true) fail(400, 'QUOTE_APPROVAL_REQUIRED');
    const preview = inclusivePlan(a);
    service.agreement = structuredClone(a); service.quote_preview = preview;
    service.expected_amount = preview.expected_amount; service.status = 'quoted';
    service.quoted_by = actor.id; service.quoted_at = now;
    result = service; referralId = service.referral_id;
  } else if (command === 'services') {
    owner(actor);
    const service = state.services.find(s => s.id === body.service_id);
    if (!service || service.status !== 'quoted' || !(service.agreement?.schema_version >= 2)) fail(409, 'CONFIRMED_QUOTE_REQUIRED');
    const referral = state.referrals.find(r => r.id === service.referral_id);
    if (!canonical.job || canonical.job.id !== body.job_id || canonical.job.therapist_id !== referral?.therapist_id || canonical.job.is_test || ['Cancelled', 'Expired'].includes(canonical.job.status)) fail(409, 'CANONICAL_JOB_MISMATCH');
    if (state.services.some(s => s.job_id === body.job_id)) fail(409, 'JOB_ALREADY_LINKED');
    if (body.duration_minutes !== service.agreement.duration_minutes || canonical.job.duration_minutes !== service.agreement.duration_minutes) fail(409, 'DURATION_AGREEMENT_MISMATCH');
    if ((body.costs?.length) || (body.expected_amount != null && body.expected_amount !== service.expected_amount)) fail(409, 'INCLUSIVE_TRAVEL_NO_EXTRA_COSTS');
    canonicalMoney(canonical.job, service.agreement);
    const evidence = reference(body.service_evidence);
    service.job_id = body.job_id; service.service_evidence = evidence;
    service.status = 'booked'; service.booked_by = actor.id; service.booked_at = now;
    result = service; referralId = service.referral_id;
  } else {
    owner(actor);
    const service = state.services.find(s => s.id === body.service_id);
    if (!service) fail(404, 'SERVICE_NOT_FOUND');
    referralId = service.referral_id;
    if (!service.agreement || !service.job_id) fail(409, 'BOOKED_SERVICE_REQUIRED');
    if (command === 'corrections') return recordCorrection(state,actor,service,body,canonical,requestId,fingerprint);
    if (service.status === 'closed') fail(409, 'SERVICE_CLOSED');
    if (service.agreement?.schema_version >= 2 && !['booked','reconciling'].includes(service.status)) fail(409, 'BOOKED_SERVICE_REQUIRED');
    if (command === 'receipts') {
      if (service.settlement) fail(409, 'SETTLEMENT_LOCKED');
      const amount = money(body.amount); if (!amount) fail(400, 'PAYMENT_AMOUNT_REQUIRED');
      const evidence = reference(body.evidence_ref);
      if (body.verification_confirmed !== true) fail(400, 'PAYMENT_VERIFICATION_REQUIRED');
      if (state.services.some(s => s.receipts.some(r => sameEvidence(r.evidence_ref, evidence)))) fail(409, 'PAYMENT_EVIDENCE_ALREADY_USED');
      if (service.receipts.reduce((s, r) => s + r.amount, 0) + amount > service.expected_amount) fail(409, 'OVERPAYMENT_REQUIRES_REVIEW');
      result = { id: id('spapay'), amount, evidence_ref: evidence, received_by: required(body.received_by, 120), received_at: time(body.received_at), verified_by: actor.id, verified_at: now, verification_source: 'owner_manual_evidence_review' };
      service.receipts.push(result);
    } else if (command === 'refunds') {
      if (!(service.agreement?.schema_version >= 2) || service.settlement) fail(409, 'REFUND_RECONCILIATION_REQUIRED');
      const plan = inclusivePlan(service.agreement), amount = money(body.amount);
      const refunded = (service.refunds || []).reduce((sum, r) => sum + r.amount, 0);
      const received = service.receipts.reduce((sum, r) => sum + r.amount, 0);
      if (!amount || amount + refunded > plan.refund_due || amount + refunded > received) fail(409, 'REFUND_EXCEEDS_APPROVED_AMOUNT');
      if (body.verification_confirmed !== true) fail(400, 'REFUND_VERIFICATION_REQUIRED');
      const evidence = reference(body.evidence_ref);
      if (state.services.some(s => (s.refunds || []).some(r => sameEvidence(r.evidence_ref, evidence)))) fail(409, 'REFUND_EVIDENCE_ALREADY_USED');
      result = { id: id('sparefund'), amount, evidence_ref: evidence, refunded_at: time(body.refunded_at), reason: required(body.reason, 1000), verified_by: actor.id, verified_at: now };
      service.refunds ||= []; service.refunds.push(result);
    } else if (command === 'expenses') {
      if (!(service.agreement?.schema_version >= 2) || !service.settlement) fail(409, 'SETTLEMENT_APPROVAL_REQUIRED');
      completedJob(service, state, canonical);
      const index = body.adjustment_index, item = service.agreement.adjustments[index];
      if (!Number.isSafeInteger(index) || index < 0 || !item || !['fee', 'tax'].includes(item.kind)) fail(400, 'EXPENSE_ITEM_INVALID');
      if ((service.expenses || []).some(e => e.adjustment_index === index)) fail(409, 'EXPENSE_ALREADY_RECORDED');
      if (!body.amount || money(body.amount) !== item.amount) fail(409, 'EXPENSE_AMOUNT_MISMATCH');
      if (body.verification_confirmed !== true) fail(400, 'EXPENSE_VERIFICATION_REQUIRED');
      const evidence = reference(body.evidence_ref);
      if (state.services.some(s => [...(s.expenses || []), ...s.payouts].some(p => sameEvidence(p.evidence_ref, evidence)))) fail(409, 'PAYOUT_EVIDENCE_ALREADY_USED');
      result = { id: id('spaexpense'), adjustment_index: index, kind: item.kind, bearer: item.bearer, amount: item.amount, recipient: required(body.recipient, 120), evidence_ref: evidence, paid_at: time(body.paid_at), recorded_by: actor.id, recorded_at: now, verification_source: 'owner_manual_evidence_review' };
      service.expenses ||= []; service.expenses.push(result);
    } else if (command === 'close') {
      if (!service.settlement || body.approval_confirmed !== true) fail(409, 'SETTLEMENT_APPROVAL_REQUIRED');
      completedJob(service, state, canonical);
      if (!reconciliationSummary(service).balanced) fail(409, 'PAYOUTS_INCOMPLETE');
      if (service.agreement?.schema_version >= 2 && service.agreement.adjustments.some((a, i) => ['fee', 'tax'].includes(a.kind) && a.amount > 0 && !(service.expenses || []).some(e => e.adjustment_index === i && e.amount === a.amount))) fail(409, 'EXPENSES_INCOMPLETE');
      service.status = 'closed'; service.closed_by = actor.id; service.closed_at = now; result = service;
    } else if (command === 'settlements') {
      if (service.settlement) fail(409, 'SETTLEMENT_ALREADY_APPROVED');
      completedJob(service, state, canonical);
      const totals = calculateSpaShares(service, service.agreement);
      if (!(service.agreement.schema_version >= 2) && totals.received !== service.expected_amount) fail(409, 'FULL_PAYMENT_REQUIRED');
      if (body.approval_confirmed !== true) fail(400, 'SETTLEMENT_APPROVAL_REQUIRED');
      result = { ...totals, approved_by: actor.id, approved_at: now, canonical_job_checked_at: now };
      service.settlement = result;
    } else if (command === 'payouts') {
      if (!service.settlement) fail(409, 'SETTLEMENT_APPROVAL_REQUIRED');
      completedJob(service, state, canonical);
      if (!ROLES.includes(body.role)) fail(400, 'RECIPIENT_INVALID');
      if (service.payouts.some(p => p.role === body.role)) fail(409, 'PAYOUT_ALREADY_RECORDED');
      const amount = money(body.amount);
      if (!amount || amount !== reconciliationSummary(service).shares[body.role]) fail(409, 'PAYOUT_AMOUNT_MISMATCH');
      if (body.verification_confirmed !== true) fail(400, 'PAYOUT_VERIFICATION_REQUIRED');
      if (service.agreement.schema_version === 3 && required(body.recipient,120) !== service.agreement.payees[body.role]) fail(409, 'PAYEE_MISMATCH');
      const evidence = reference(body.evidence_ref);
      if (state.services.some(s => [...s.payouts, ...(s.expenses || [])].some(p => sameEvidence(p.evidence_ref, evidence)))) fail(409, 'PAYOUT_EVIDENCE_ALREADY_USED');
      result = { id: id('spaout'), role: body.role, amount, recipient: required(body.recipient, 120), evidence_ref: evidence,
        paid_at: time(body.paid_at), recorded_by: actor.id, recorded_at: now, verification_source: 'owner_manual_evidence_review' };
      service.payouts.push(result);
    } else fail(404, 'COMMAND_NOT_FOUND');
  }
  state.events.push({ id: id('spaaudit'), action: command, actor_id: actor.id, at: now, referral_id: referralId || null, result_id: result.id || body.service_id, service_id: body.service_id || null, agreement_id: result.agreement?.id || (command === 'agreements' ? result.id : null), formula_version: result.formula_version || result.agreement?.formula_version || null });
  const saved = { id: result.id || body.service_id, saved: true };
  state.requests[requestId] = { fingerprint, result: saved };
  return saved;
}

function reconciliationSummary(s) {
  if (!s.settlement) return null;
  const shares={...s.settlement.shares},netPaid=Object.fromEntries(ROLES.map(role=>[role,s.payouts.filter(p=>p.role===role).reduce((n,p)=>n+p.amount,0)]));
  let refunded=0;
  for(const c of s.corrections || []) {
    if(c.type==='customer_refund'){shares[c.role]-=c.amount;refunded+=c.amount;}
    else netPaid[c.role]-=c.amount;
  }
  return {shares,net_paid:netPaid,return_due:Object.fromEntries(ROLES.map(role=>[role,Math.max(0,netPaid[role]-shares[role])])),total_refunded:refunded,
    net_received:s.settlement.received-refunded,balanced:ROLES.every(role=>netPaid[role]===shares[role])};
}
function recordCorrection(state,actor,service,body,canonical,requestId,fingerprint) {
  if (!service.settlement) fail(409,'SETTLEMENT_APPROVAL_REQUIRED');
  completedJob(service,state,canonical);
  if (!ROLES.includes(body.role) || !['customer_refund','payee_return'].includes(body.type)) fail(400,'CORRECTION_TYPE_INVALID');
  if (body.approval_confirmed!==true || body.verification_confirmed!==true) fail(400,'CORRECTION_REVIEW_REQUIRED');
  const amount=money(body.amount),summary=reconciliationSummary(service);
  if (!amount || amount>(body.type==='customer_refund'?summary.shares[body.role]:summary.return_due[body.role])) fail(409,'CORRECTION_EXCEEDS_BALANCE');
  const evidence=reference(body.evidence_ref);
  if (state.services.some(s=>[...s.receipts,...s.payouts,...(s.expenses||[]),...(s.refunds||[]),...(s.corrections||[])].some(p=>sameEvidence(p.evidence_ref,evidence)))) fail(409,'CORRECTION_EVIDENCE_ALREADY_USED');
  const entry={id:id('spacorrection'),type:body.type,role:body.role,amount,basis:'fixed_satang',recipient:required(body.recipient,120),evidence_ref:evidence,
    occurred_at:time(body.occurred_at),reason:required(body.reason,1000),terms_ref:reference(body.terms_ref),approved_by:actor.id,approved_at:new Date().toISOString(),verification_source:'owner_manual_evidence_review'};
  service.corrections ||= [];service.corrections.push(entry);service.status='reconciling';
  state.events.push({id:id('spaaudit'),action:'corrections',actor_id:actor.id,at:entry.approved_at,referral_id:service.referral_id,result_id:entry.id,service_id:service.id});
  const result={id:entry.id,saved:true};state.requests[requestId]={fingerprint,result};return result;
}

function jobReservation(state,actor,command,body) {
  const service=state.services.find(s=>s.id===body.service_id);
  if (!service || service.agreement?.schema_version!==3) fail(409,'CONFIRMED_QUOTE_REQUIRED');
  const now=new Date().toISOString();
  if (command==='reserve-job') {
    const key=required(body.request_key,100);
    if (!/^[A-Za-z0-9_:.-]{8,100}$/.test(key)) fail(400,'REQUEST_KEY_INVALID');
    if (body.approval_confirmed!==true) fail(400,'JOB_APPROVAL_REQUIRED');
    const requestId=actor.id+':'+key,fingerprint=JSON.stringify({command:'create-job',body});
    if(state.requests[requestId] && state.requests[requestId].fingerprint!==fingerprint) fail(409,'REQUEST_KEY_REUSED');
    state.requests[requestId] ||= {fingerprint,result:{id:service.id,pending:true}};
    if (service.job_creation?.completed_at) return {id:service.id,job_id:service.job_id,duplicate:true};
    if (!['quoted','creating_job'].includes(service.status)) fail(409,'CONFIRMED_QUOTE_REQUIRED');
    if (JSON.stringify(inclusivePlan(service.agreement))!==JSON.stringify(service.quote_preview)) fail(409,'QUOTE_SNAPSHOT_MISMATCH');
    if (!service.job_creation) {
      const start=Date.parse(body.service_start_at);
      if (!Number.isFinite(start) || start<Date.now()) fail(400,'SERVICE_START_REQUIRED');
      if (state.events.length>=5000) fail(409,'LEDGER_ARCHIVE_REQUIRED');
      service.job_creation={job_id:body.job_id,service_start_at:new Date(start).toISOString(),service_evidence:reference(body.service_evidence),requested_by:actor.id,requested_at:now};
      state.events.push({id:id('spaaudit'),action:'create-job-requested',actor_id:actor.id,at:now,referral_id:service.referral_id,result_id:service.id,agreement_id:service.agreement.id});
    } else if ((body.service_start_at && Date.parse(body.service_start_at)!==Date.parse(service.job_creation.service_start_at)) || (body.service_evidence && body.service_evidence!==service.job_creation.service_evidence)) fail(409,'JOB_CREATION_LOCKED');
    if (service.job_creation.lease_until>Date.now()) return {id:service.id,pending:true};
    const token=crypto.randomUUID();service.job_creation.claim_token=token;service.job_creation.lease_until=Date.now()+120000;
    service.status='creating_job';
    return {id:service.id,claim_token:token,service:structuredClone(service)};
  }
  if (service.job_creation?.claim_token!==body.claim_token) fail(409,'JOB_CREATION_CLAIM_CHANGED');
  if (command==='release-job') {service.job_creation.lease_until=0;return {id:service.id,pending:true};}
  service.job_id=service.job_creation.job_id;service.service_evidence=service.job_creation.service_evidence;
  service.status='booked';service.booked_by=actor.id;service.booked_at=now;
  service.job_creation.completed_at=now;service.job_creation.lease_until=0;
  state.events.push({id:id('spaaudit'),action:'create-job',actor_id:actor.id,at:now,referral_id:service.referral_id,result_id:service.id,job_id:service.job_id,agreement_id:service.agreement.id});
  return {id:service.id,job_id:service.job_id,saved:true};
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
      if (['reserve-job','finish-job','release-job'].includes(input.command)) {
        owner(actor);
        const data=await this.storage.transaction(async tx=>{
          const state=await tx.get('state') || empty();
          const result=jobReservation(state,actor,input.command,input.body);
          await tx.put('state',state);return result;
        });
        return response({ok:true,data});
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
// Parse the canonical THB decimal without floating multiplication or rounding.
function decimalSatang(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value);
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(s)) return null;
  const [whole, fraction = ''] = s.split('.');
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(n) && n <= 100_000_000 ? n : null;
}
function canonicalMoney(job, agreement) {
  if (job.travel_amount == null) fail(409, 'CANONICAL_TRAVEL_UNCONFIRMED');
  if (job.travel_amount !== 0) fail(409, 'CANONICAL_TRAVEL_ALREADY_ADDED');
  if (agreement.schema_version === 3 && (job.venue_id !== agreement.spa_id || job.travel_included_confirmed !== true)) fail(409, 'CANONICAL_VENUE_TRAVEL_UNCONFIRMED');
  if (job.therapist_amount !== (agreement.schema_version === 3 ? inclusivePlan(agreement).shares.therapist : agreement.therapist_amount)) fail(409, 'CANONICAL_PAYOUT_MISMATCH');
  if (job.customer_amount == null) fail(409, 'CANONICAL_PRICE_UNCONFIRMED');
  if (job.customer_amount !== agreement.customer_amount) fail(409, 'CANONICAL_PRICE_MISMATCH');
}
function canonicalDuration(fields, payload) {
  const n = fields['Duration Minutes'];
  if (!Number.isSafeInteger(n) || n <= 0 || (payload.duration_minutes != null && payload.duration_minutes !== n)) return null;
  return n;
}
async function jobRecord(env, jobId) {
  const f = await canonicalRecord(env, 'JOBS', 'Job ID', jobId, /^mmsjob_[a-f0-9]{24}$/);
  let payload; try { payload = JSON.parse(f['Internal Payload JSON'] || '{}'); } catch { fail(409, 'CANONICAL_JOB_INVALID'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail(409, 'CANONICAL_JOB_INVALID');
  const quote=payload.spa_quote, pricing=payload.pricing;
  const therapist=f['Accepted Therapist ID'];
  return { id:f['Job ID'],therapist_id:therapist,status:f['Job Status'],duration_minutes:canonicalDuration(f,payload),
    therapist_amount:decimalSatang(f['Therapist Payout THB']),
    travel_amount:quote?.travel_included_confirmed===true ? 0 : pricing ? decimalSatang(pricing.travel_amount_thb) : null,
    travel_included_confirmed:quote?.travel_included_confirmed===true, venue_id:quote?.venue_id || null,
    customer_amount:quote ? quote.agreement?.customer_amount ?? null : pricing ? decimalSatang(pricing.full_amount_thb) : null,
    is_test:payload.is_test===true || /^\[TEST/i.test(f.Service || '') };

}

export async function maybeHandleRelaxSpaLedger(request, env = {}) {
  const url = new URL(request.url);
  if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + '/')) return null;
  try {
    if (url.hostname !== (env.MMS_INTERNAL_HOST || 'mms.internal')) fail(404, 'NOT_FOUND');
    const actor = { id: text(request.headers.get('x-mms-spa-actor'), 100), role: text(request.headers.get('x-mms-spa-role'), 40) };
    if (!actor.id || !ACCESS.includes(actor.role)) fail(403, 'SPA_ACCESS_REQUIRED');
    const command = url.pathname.slice(PREFIX.length + 1);
    if (!['snapshot', 'catalog', 'agreement-preview', 'create-job', 'referrals', 'referral-decision', 'agreements', 'drafts', 'quotes', 'services', 'receipts', 'refunds', 'settlements', 'payouts', 'expenses', 'corrections', 'close'].includes(command)) fail(404, 'NOT_FOUND');
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
    if (command === 'create-job') {
      owner(actor);
      const reserved=await invoke('reserve-job',{...body,job_id:await spaJobId(body.service_id)});
      if (!reserved.ok) return reserved;
      const r=(await reserved.json()).data;
      if (r.pending || r.duplicate) return response({ok:true,data:r});
      try {
        await produceSpaJob(env,r.service);
        return await invoke('finish-job',{service_id:body.service_id,claim_token:r.claim_token});
      } catch(e) {
        await invoke('release-job',{service_id:body.service_id,claim_token:r.claim_token});
        throw e;
      }
    }
    if (command === 'agreement-preview') {
      const a = agreementV3({ ...body, status: 'confirmed', approval_confirmed: true }, actor, new Date().toISOString());
      return response({ ok: true, data: { agreement: { ...a, status: 'preview' }, preview: a.preview } });
    }
    const canonical = {};
    if (command === 'referrals') {
      const f = await canonicalRecord(env, 'THERAPISTS', 'Therapist ID', body.therapist_id, /^mmst_[a-f0-9]{24}$/);
      canonical.therapist = { id: f['Therapist ID'], name: text(f['Display Name'], 120), status: f.Status };
    }
    if (command === 'services') canonical.job = await jobRecord(env, body.job_id);
    if (['settlements', 'payouts', 'expenses', 'corrections', 'close'].includes(command)) {
      const context = await invoke('job-context', body);
      if (!context.ok) return context;
      canonical.job = await jobRecord(env, (await context.json()).job_id);
    }
    return invoke(command, body, canonical);
  } catch (e) { return response({ ok: false, error: { code: e.code || 'SPA_LEDGER_UNAVAILABLE' } }, e.status || 503); }
}
