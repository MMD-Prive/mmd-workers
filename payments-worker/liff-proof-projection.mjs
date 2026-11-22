import { formulaValue } from './lib/payment-primitives.js';

const clean = value => String(value ?? '').trim();
const code = value => clean(value).toLowerCase();
const ids = value => Array.isArray(value) ? value.map(v => clean(typeof v === 'string' ? v : v?.id)).filter(Boolean) : [];

// Bookkeeping only: canonical Payment and Proof are the authority. This never
// settles money, grants membership, or changes the LIFF business state.
export async function syncLiffProofProjection(env, proof) {
  const fields = proof?.fields || {};
  const ref = clean(fields.payment_ref);
  if (!proof?.id || !ref) return { status: 'not_applicable' };
  try {
    const base = clean(env.AIRTABLE_BASE_ID);
    const token = clean(env.AIRTABLE_API_KEY);
    if (!base || !token) throw Error('airtable_not_ready');
    const payments = env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || 'tblWGGJJOx5eBvBZJ';
    const renewals = env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID || env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || 'tblXjQFwo0A2cHseh';
    const proofs = env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || 'tblfJfM4Sqag9zrLi';
    async function request(table, record = '', init = {}, formula = '') {
      const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}${record ? '/' + encodeURIComponent(record) : ''}`);
      if (formula) { url.searchParams.set('filterByFormula', formula); url.searchParams.set('pageSize', '100'); }
      const req = new Request(url, { ...init, signal: AbortSignal.timeout(8000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } });
      const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
      const data = await response.json();
      if (!response.ok) throw Error(`airtable_${response.status}`);
      if (formula && (data.offset || !Array.isArray(data.records))) throw Error('liff_projection_candidates_incomplete');
      return data;
    }
    const paymentRows = (await request(payments, '', {}, `{Payment Reference}='${formulaValue(ref)}'`)).records;
    if (paymentRows.length !== 1) throw Error('liff_projection_payment_ambiguous');
    const payment = paymentRows[0];
    const pf = payment.fields || {};
    if (code(pf.payment_stage) !== 'membership') return { status: 'not_applicable' };
    const session = clean(pf.session_id);
    if (!session) throw Error('liff_projection_session_missing');
    const rows = (await request(renewals, '', {}, `OR({renewal_session_id}='${formulaValue(session)}',{payment_intent_session_id}='${formulaValue(session)}')`)).records;
    if (!rows.length) return { status: 'not_applicable' };
    if (rows.length !== 1) throw Error('liff_projection_session_ambiguous');
    const renewal = rows[0];
    const rf = renewal.fields || {};
    if (['blocked', 'cancelled', 'revoked', 'suspended'].includes(code(rf.renewal_flow_status))) throw Error('liff_projection_session_blocked');
    if (!clean(rf.requested_package) || code(rf.requested_package) !== code(pf['Package Code'])) throw Error('liff_projection_package_mismatch');
    const amount = Number(pf.Amount);
    if (!(amount > 0) || Number(fields.amount_thb) !== amount || Number(rf.renewal_amount_thb) !== amount) throw Error('liff_projection_amount_mismatch');
    const linkedPayments = ids(fields.payment);
    const linkedRenewals = ids(fields['MMD — LIFF Renewal Sessions']);
    if (linkedPayments.some(id => id !== payment.id) || linkedRenewals.some(id => id !== renewal.id)) throw Error('liff_projection_proof_link_conflict');
    const paid = code(pf['Payment Status']) === 'paid' && code(pf['Verification Status']) === 'verified' && code(fields.status) === 'verified';
    if (['rejected', 'blocked', 'revoked'].includes(code(fields.status))) throw Error('liff_projection_proof_blocked');
    // The reciprocal Payment Proof field is maintained by Airtable. Never
    // replace its array here: concurrent uploads could otherwise lose a link.
    await request(proofs, proof.id, { method: 'PATCH', body: JSON.stringify({ fields: { payment: [payment.id], 'MMD — LIFF Renewal Sessions': [renewal.id] } }) });
    const projection = {};
    if (!rf.proof_uploaded_at) projection.proof_uploaded_at = proof.createdTime || fields.created_at || new Date().toISOString();
    if (paid && !rf.verified_at) projection.verified_at = fields.verified_at || new Date().toISOString();
    if (Object.keys(projection).length) await request(renewals, renewal.id, { method: 'PATCH', body: JSON.stringify({ fields: projection }) });
    return { status: 'linked', verified: paid, renewal_record_id: renewal.id };
  } catch (error) {
    // The proof or payment may already be saved. Report repair work without
    // telling the customer their successful evidence upload failed.
    return { status: 'review_required', reason: clean(error.message), retry_on_replay: true };
  }
}
