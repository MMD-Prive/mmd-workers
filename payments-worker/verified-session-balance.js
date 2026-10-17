/** Customer service balance from verified Payment rows, never planned deposits.
 * Read-only projection. Does not create/verify Payments or advance job state.
 */
export const BALANCE_FIELDS = Object.freeze({
  sessionId: 'fldLTq2kZbyRv22IA', total: 'fldhwC79ndbnEXSZz',
  sessionStatus: 'fldmwuvOaiCFdzzRa', paidSum: 'fldAdtXEaedGdfOKc',
  customerDue: 'fldvJowquu8RrsOMc',
  ref: 'fldOO6SY49iDw8VBZ', paymentSession: 'fld2wdhBvc8xrV6y5',
  amount: 'fldvCSwrUW8OMAooS', verification: 'fldJ7a0Ube9F0bmRy',
  status: 'fldEJ1hmm7KwWuI6q', intent: 'fld04fr3bRJTohO6y',
  stage: 'fldrr9g8ZZjqAbdKQ', type: 'fldydUWHhqVLMkNSC',
  transaction: 'fldHUvPn5CxK9i1Mq', provider: 'fldJNMenT0woUXbKG',
});
const F = BALANCE_FIELDS;
const VERIFIED = new Set(['verified', 'approved', 'official_verified']);
const REVERSED = new Set(['refunded', 'reversed', 'chargeback', 'disputed']);
const VOID = new Set(['cancelled', 'canceled', 'void', 'failed', 'rejected']);
const EXCLUDED = new Set(['tips', 'tip', 'membership', 'renewal', 'extension', 'shop']);
export function balanceError(code, status = 409) { return Object.assign(new Error(code), { status }); }
function text(value) { return String(value?.name ?? value ?? '').trim(); }
function code(value) { return text(value).toLowerCase().replace(/[\s-]+/g, '_'); }
function value(fields, configured, id, name) { return fields[configured || id] ?? fields[id] ?? fields[name]; }
function cents(value, allowZero = true) {
  if (value === null || value === undefined || text(value) === '') throw balanceError('balance_amount_missing');
  const n = Number(value);
  const result = Math.round(n * 100);
  if (!Number.isFinite(n) || !Number.isSafeInteger(result) || result < (allowZero ? 0 : 1) || Math.abs(n * 100 - result) > 0.00001) throw balanceError('balance_amount_invalid');
  return result;
}
export function balancePayment(record, env = {}) {
  const f = record?.fields || {};
  let stage = code(value(f, env.AT_PAYMENTS__PAYMENT_STAGE, F.stage, 'payment_stage') || value(f, env.AT_PAYMENTS__PAYMENT_TYPE, F.type, 'payment_type'));
  if (['balance', 'remaining', 'remainder', 'finalpayment', 'คงเหลือ'].includes(stage)) stage = 'final';
  if (stage === 'มัดจำ') stage = 'deposit';
  if (['fullpayment', 'payinfull'].includes(stage)) stage = 'full';
  const verification = code(value(f, env.AT_PAYMENTS__VERIFICATION_STATUS, F.verification, 'Verification Status'));
  const status = code(value(f, env.AT_PAYMENTS__PAYMENT_STATUS, F.status, 'Payment Status'));
  return {
    id: text(record?.id), ref: text(value(f, env.AT_PAYMENTS__PAYMENT_REF, F.ref, 'Payment Reference')),
    sessionId: text(value(f, env.AT_PAYMENTS__SESSION_ID, F.paymentSession, 'session_id')),
    amount: value(f, env.AT_PAYMENTS__AMOUNT, F.amount, 'Amount'), stage, verification, status,
    intent: code(value(f, env.AT_PAYMENTS__PAYMENT_INTENT_STATUS, F.intent, 'Payment Intent Status')),
    verified: VERIFIED.has(verification) && !VOID.has(status) && !REVERSED.has(status),
    reversed: REVERSED.has(status) || REVERSED.has(verification),
    transaction: text(f[F.transaction] ?? f.provider_txn_id),
    provider: code(f[F.provider] ?? f.provider),
  };
}
export function shouldResolveCustomerBalance(record, env = {}) {
  const p = balancePayment(record, env);
  return ['final', 'balance'].includes(p.stage) || (p.stage === 'deposit' && (p.verified || p.reversed));
}
export function calculateVerifiedSessionBalance(session, records, env = {}) {
  const fields = session?.fields || {};
  const sessionId = text(value(fields, env.AT_SESSIONS__SESSION_ID, F.sessionId, 'session_id'));
  if (!sessionId || !session?.id) throw balanceError('balance_session_missing');
  const state = code(fields[F.sessionStatus] ?? fields['Session Status']);
  if (VOID.has(state) || REVERSED.has(state)) throw balanceError('balance_session_not_payable');
  const total = cents(value(fields, env.AT_SESSIONS__AMOUNT_THB, F.total, 'amount_thb'), false);
  if (!Array.isArray(records)) throw balanceError('balance_ledger_unavailable', 503);
  let received = 0, deposit = 0;
  const seenIds = new Map(), seenRefs = new Set(), seenTransactions = new Set();
  const normalized = [];
  for (const record of records) {
    const p = balancePayment(record, env);
    if (p.sessionId !== sessionId) throw balanceError('balance_payment_session_mismatch');
    const fingerprint = JSON.stringify(p);
    if (seenIds.has(p.id)) {
      if (seenIds.get(p.id) !== fingerprint) throw balanceError('balance_ledger_changed');
      continue;
    }
    if (!p.id || !p.ref) throw balanceError('balance_payment_identity_missing');
    seenIds.set(p.id, fingerprint);
    normalized.push({ record, ...p });
    if (EXCLUDED.has(p.stage)) continue;
    if (p.reversed) throw balanceError('balance_refund_review_required');
    if (!p.verified) continue;
    if (!['deposit', 'full', 'final'].includes(p.stage)) throw balanceError('balance_stage_review_required');
    if (seenRefs.has(p.ref)) throw balanceError('balance_duplicate_verified_reference');
    seenRefs.add(p.ref);
    if (p.transaction) {
      const key = p.provider + ':' + p.transaction;
      if (seenTransactions.has(key)) throw balanceError('balance_duplicate_verified_transaction');
      seenTransactions.add(key);
    }
    const amount = cents(p.amount, false);
    received += amount;
    if (!Number.isSafeInteger(received)) throw balanceError('balance_amount_invalid');
    if (p.stage === 'deposit') deposit += amount;
  }
  return {
    session_id: sessionId, total_amount_thb: total / 100,
    verified_paid_thb: received / 100, verified_deposit_thb: deposit / 100,
    remaining_amount_thb: Math.max(0, total - received) / 100,
    overpaid_amount_thb: Math.max(0, received - total) / 100,
    records: normalized,
  };
}
export async function readVerifiedSessionBalance(env, session) {
  const fields = session?.fields || {};
  const sessionId = text(value(fields, env.AT_SESSIONS__SESSION_ID, F.sessionId, 'session_id'));
  if (!sessionId) throw balanceError('balance_session_missing');
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) throw balanceError('airtable_not_ready', 503);
  const table = env.AIRTABLE_TABLE_PAYMENTS || 'tblWGGJJOx5eBvBZJ';
  const url = new URL('https://api.airtable.com/v0/' + encodeURIComponent(env.AIRTABLE_BASE_ID) + '/' + encodeURIComponent(table));
  const escaped = sessionId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  url.searchParams.set('filterByFormula', "{session_id}='" + escaped + "'");
  url.searchParams.set('returnFieldsByFieldId', 'true');
  url.searchParams.set('pageSize', '100');
  const rows = [], offsets = new Set();
  for (let page = 0; page < 50; page += 1) {
    const req = new Request(url, { method: 'GET', headers: { authorization: 'Bearer ' + env.AIRTABLE_API_KEY, accept: 'application/json' } });
    const res = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
    if (!res.ok) throw balanceError('balance_ledger_unavailable', 503);
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data?.records)) throw balanceError('balance_ledger_unavailable', 503);
    rows.push(...data.records);
    if (!data.offset) return calculateVerifiedSessionBalance(session, rows, env);
    if (typeof data.offset !== 'string' || offsets.has(data.offset)) throw balanceError('balance_ledger_pagination_invalid', 503);
    offsets.add(data.offset);
    url.searchParams.set('offset', data.offset);
  }
  throw balanceError('balance_ledger_incomplete', 503);
}
/** Read-only final-stage projection. The stable ref is issued by payments-worker.
 * QR viewing does not create a second Payment; arrival/proof intake reuse that ref.
 */
export function customerBalanceProjection(summary, activeRecord, finalRef, env = {}) {
  const current = balancePayment(activeRecord, env);
  const anchor = summary.records.find(p => p.id === current.id && p.ref === current.ref);
  if (!anchor || anchor.verified !== current.verified || String(anchor.amount) !== String(current.amount)) throw balanceError('balance_ledger_changed');
  const finals = summary.records.filter(p => p.ref === finalRef);
  if (finals.length > 1) throw balanceError('final_payment_ref_ambiguous');
  const final = finals[0];
  if (final && final.stage !== 'final') throw balanceError('final_payment_stage_mismatch');
  if (final?.reversed || (final && VOID.has(final.status))) throw balanceError('final_payment_not_payable');
  if (final?.verified && summary.remaining_amount_thb > 0) throw balanceError('balance_after_final_review_required');
  if (final && !final.verified && final.amount != null && text(final.amount) !== '' && cents(final.amount) !== cents(summary.remaining_amount_thb)) throw balanceError('final_payment_amount_mismatch');
  if (summary.remaining_amount_thb > 0 && summary.verified_deposit_thb <= 0) throw balanceError('verified_deposit_required');
  const useFinal = summary.remaining_amount_thb > 0 || current.stage === 'final';
  const activeRef = useFinal ? finalRef : current.ref;
  const paymentRecord = useFinal ? final?.record || { fields: {
    [F.ref]: finalRef, [F.paymentSession]: summary.session_id,
    [F.stage]: 'final', [F.amount]: summary.remaining_amount_thb,
    [F.status]: 'Pending', [F.verification]: 'pending_review',
    [F.intent]: 'Pending Confirmation',
  } } : activeRecord;
  return {
    payment_ref: activeRef, payment_type: useFinal ? 'final' : current.stage,
    paymentRecord,
    verified: useFinal ? Boolean(final?.verified) : current.verified,
    amount_due_thb: summary.remaining_amount_thb,
    summary: {
      schema: 'verified_session_balance_v1', total_amount_thb: summary.total_amount_thb,
      verified_paid_thb: summary.verified_paid_thb,
      verified_deposit_thb: summary.verified_deposit_thb,
      remaining_amount_thb: summary.remaining_amount_thb,
    },
  };
}
