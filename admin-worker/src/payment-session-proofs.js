import { exactRows } from './payment-review-display-context.js';
import { completeSummaryRows } from './payment-job-slip-summary.js';
const text = value => String(value ?? '').trim();
const ids = value => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };

// Resolve this job before applying the queue limit; never scan only recent proofs.
export async function paymentSessionProofs(sessionId, { page, sessionsTable, paymentsTable, proofsTable }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(sessionId)) fail('invalid_session_id', 400);
  const list = (table, params) => completeSummaryRows(page, table, params);
  const sessions = await exactRows(list, sessionsTable, 'session_id', [sessionId]);
  if (sessions.length !== 1) fail(sessions.length ? 'payment_session_ambiguous' : 'payment_session_missing', sessions.length ? 409 : 404);
  const session = sessions[0];
  const backlinks = session.fields?.['MMD — Payment Proofs'];
  if (backlinks !== undefined && !Array.isArray(backlinks)) fail('payment_session_links_invalid');
  const payments = await exactRows(list, paymentsTable, 'session_id', [sessionId]);
  const refs = payments.map(row => text(row.fields?.['Payment Reference'] || row.fields?.payment_ref)).filter(Boolean);
  const linked = await exactRows(list, proofsTable, 'RECORD_ID()', ids(backlinks));
  if (ids(backlinks).some(id => !linked.some(row => row.id === id))) fail('payment_session_read_incomplete', 503);
  const rows = [...linked, ...await exactRows(list, proofsTable, 'payment_ref', refs)];
  const unique = new Map();
  for (const row of rows) {
    const f = row.fields || {}, sid = text(f.session_id), links = ids(f.session || f.Session);
    if ((sid && sid !== sessionId) || links.some(id => id !== session.id)) fail('payment_session_context_conflict');
    if (ids(f.payment || f.Payment).some(id => !payments.some(payment => payment.id === id))) fail('payment_session_payment_conflict');
    if (unique.has(row.id) && JSON.stringify(unique.get(row.id)) !== JSON.stringify(row)) fail('payment_session_changed', 503);
    unique.set(row.id, row);
  }
  return [...unique.values()];
}
