// V2 amounts are integer satang; no market rates or travel estimates are inferred.
const ROLES = ['therapist', 'spa', 'partner', 'mms'];
const SPLIT = ROLES.slice(1);
const fail = code => { throw Object.assign(new Error(code), { status: 409, code }); };
export const satang = n => { if (!Number.isSafeInteger(n) || n < 0 || n > 100_000_000) fail('AMOUNT_INVALID'); return n; };
const detail = v => { if (typeof v !== 'string' || !v.trim() || v.length > 1000 || /[\u0000-\u001f<>]/.test(v)) fail('DETAIL_REQUIRED'); return v.trim(); };
const account = v => /^(?:mms-partner:[A-Za-z0-9_.-]{3,80}|partner:rec[A-Za-z0-9]{14,24})$/.test(v || '');

export function inclusivePlan(a) {
  const gross = satang(a.customer_amount), therapist = satang(a.therapist_amount);
  if (!gross || therapist > gross) fail('ALLOCATION_EXCEEDS_REVENUE');
  if (!['remaining_revenue', 'received_revenue'].includes(a.basis)) fail('BASIS_INVALID');
  const basis = a.basis === 'remaining_revenue' ? gross - therapist : gross;
  const bps = SPLIT.map(role => {
    const n = a.shares_bps?.[role];
    if (!Number.isInteger(n) || n < 0 || n > 10000) fail('SHARE_INVALID');
    return n;
  });
  const sumBps = bps.reduce((s, n) => s + n, 0);
  if (a.basis === 'remaining_revenue' ? sumBps !== 10000 : BigInt(basis) * BigInt(sumBps) !== BigInt(gross - therapist) * 10000n) fail('ALLOCATION_MUST_BALANCE');
  if ((a.shares_bps?.therapist ?? 0) !== 0) fail('THERAPIST_FIXED_INCLUSIVE_REQUIRED');
  if (bps[1] > 0 ? !account(a.referrer_id) : !!a.referrer_id) fail('REFERRER_EXPLICIT_REQUIRED');
  const rows = SPLIT.map((role, i) => {
    const product = BigInt(basis) * BigInt(bps[i]);
    return { role, amount: Number(product / 10000n), remainder: Number(product % 10000n) };
  });
  let spare = gross - therapist - rows.reduce((s, r) => s + r.amount, 0);
  for (const r of [...rows].sort((x, y) => y.remainder - x.remainder || SPLIT.indexOf(x.role) - SPLIT.indexOf(y.role))) if (spare-- > 0) r.amount++;
  const shares = { therapist, ...Object.fromEntries(rows.map(r => [r.role, r.amount])) };
  if (!Array.isArray(a.adjustments) || a.adjustments.length > 20) fail('ADJUSTMENTS_INVALID');
  let discount = 0, refund = 0, costs = 0;
  for (const adj of a.adjustments) {
    if (!['fee', 'discount', 'tax', 'refund'].includes(adj.kind) || !ROLES.includes(adj.bearer) || adj.basis !== 'fixed_satang') fail('ADJUSTMENT_BASIS_REQUIRED');
    const amount = satang(adj.amount); detail(adj.evidence_ref);
    shares[adj.bearer] -= amount;
    if (shares[adj.bearer] < 0) fail('NEGATIVE_PARTY_SHARE');
    if (adj.kind === 'discount') discount += amount;
    else if (adj.kind === 'refund') refund += amount;
    else costs += amount;
  }
  const expected = gross - discount, received = expected - refund;
  const allocated = Object.values(shares).reduce((s, n) => s + n, 0);
  if (received < 0 || allocated + costs !== received) fail('ALLOCATION_MUST_BALANCE');
  return { formula_version: 'inclusive-travel-v2', rounding: 'largest_remainder_satang_spa_partner_mms',
    received, costs, basis_amount: basis, shares, total_allocated: allocated, expected_amount: expected, refund_due: refund };
}

export function agreementV2(body, actor, now) {
  if (body.schema_version !== 2) fail('INCLUSIVE_AGREEMENT_REQUIRED');
  if (!['draft', 'confirmed'].includes(body.status)) fail('AGREEMENT_STATUS_REQUIRED');
  const draft = body.status === 'draft';
  const a = { schema_version: 2, formula_version: 'inclusive-travel-v2', status: body.status,
    title: detail(body.title), therapist_id: body.therapist_id ?? null, spa_id: body.spa_id ?? 'relax-spa-by-9',
    duration_minutes: body.duration_minutes ?? null, therapist_amount: body.therapist_amount ?? null,
    customer_amount: body.customer_amount ?? null, basis: body.basis ?? null,
    shares_bps: structuredClone(body.shares_bps ?? null), referrer_id: body.referrer_id || null,
    adjustments: structuredClone(body.adjustments ?? []), travel: structuredClone(body.travel ?? null),
    terms_ref: body.terms_ref || null, created_by: actor.id, created_at: now };
  if (a.spa_id !== 'relax-spa-by-9') fail('SPA_SCOPE_MISMATCH');
  // Drafts carry incomplete data, but never act as a rate or quote authority.
  if (draft) return a;
  if (!/^mmst_[a-f0-9]{24}$/.test(a.therapist_id || '')) fail('THERAPIST_SCOPE_REQUIRED');
  if (!Number.isSafeInteger(a.duration_minutes) || a.duration_minutes <= 0 || a.duration_minutes > 1440) fail('DURATION_REQUIRED');
  if (body.approval_confirmed !== true) fail('AGREEMENT_APPROVAL_REQUIRED');
  detail(a.terms_ref);
  const travel = a.travel;
  if (!travel || travel.estimate_amount == null) fail('TRAVEL_ASSESSMENT_REQUIRED');
  satang(travel.estimate_amount);
  if (travel.estimate_amount > satang(a.therapist_amount)) fail('TRAVEL_EXCEEDS_INCLUSIVE_AMOUNT');
  const assessed = Date.parse(travel.assessed_at);
  if (!Number.isFinite(assessed) || assessed > Date.parse(now)) fail('TRAVEL_ASSESSMENT_REQUIRED');
  a.travel = { estimate_amount: travel.estimate_amount, method: detail(travel.method), assessed_at: new Date(assessed).toISOString(),
    evidence_ref: detail(travel.evidence_ref), origin_scope: 'therapist_home_roundtrip', confirmed_by: actor.id, confirmed_at: now };
  a.preview = inclusivePlan(a);
  return { ...a, approved_by: actor.id, approved_at: now };
}

export function inclusiveActual(service) {
  if (service.agreement.formula_version !== 'inclusive-travel-v2') fail('FORMULA_VERSION_UNSUPPORTED');
  const plan = inclusivePlan(service.agreement);
  if (JSON.stringify(plan) !== JSON.stringify(service.quote_preview)) fail('QUOTE_SNAPSHOT_MISMATCH');
  const grossReceived = service.receipts.reduce((s, r) => s + satang(r.amount), 0);
  const refunded = (service.refunds || []).reduce((s, r) => s + satang(r.amount), 0);
  if (grossReceived !== plan.expected_amount || refunded !== plan.refund_due) fail('FULL_PAYMENT_REQUIRED');
  if (service.costs?.length) fail('INCLUSIVE_TRAVEL_NO_EXTRA_COSTS');
  return { ...plan, received: grossReceived - refunded, gross_received: grossReceived, refunded };
}
