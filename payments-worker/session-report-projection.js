import {sessionBalanceView} from '../shared/session-balance-view.mjs';

// Opt-in only: no field IDs are guessed and no production config enables this.
export const REPORT_FIELDS = Object.freeze({
  total_amount_thb: 'balance_total_thb', verified_paid_thb: 'balance_cash_thb',
  paid_credit_thb: 'paid_credit_applied_thb', bonus_credit_thb: 'bonus_credit_applied_thb',
  remaining_amount_thb: 'balance_cash_due_thb', overpaid_amount_thb: 'balance_overpaid_thb',
  status: 'balance_truth_status', expires: 'balance_snapshot_expires_at', session: 'balance_session_id',
});
export function reportFieldMap(env) {
  if (env.SESSION_REPORT_PROJECTION_ENABLED !== 'true') return null;
  let fields;
  try { fields = JSON.parse(env.SESSION_REPORT_FIELD_IDS); } catch { throw Error('report_field_mapping_required'); }
  const keys = Object.keys(REPORT_FIELDS);
  if (!fields || Object.keys(fields).length !== keys.length || keys.some(k => !/^fld[A-Za-z0-9]{14}$/.test(fields[k] || '')) || new Set(Object.values(fields)).size !== keys.length || Object.values(fields).some(id => ['fldAdtXEaedGdfOKc','fldvJowquu8RrsOMc','fldR4e1DrhO4bNnrS','fldgDFls79uvxVmb8','fldhwC79ndbnEXSZz'].includes(id))) throw Error('report_field_mapping_invalid');
  return fields;
}
export function reportUnavailableFields(map, sid) {
  return Object.fromEntries(Object.keys(REPORT_FIELDS).map(k => [map[k], k === 'status' ? 'unavailable' : k === 'session' ? sid : null]));
}
export function reportVerifiedFields(map, summary, now = Date.now()) {
  const balance = sessionBalanceView(summary, summary.session_id);
  return Object.fromEntries(Object.keys(REPORT_FIELDS).map(k => [map[k], k === 'status' ? 'verified' : k === 'expires' ? new Date(now + 60000).toISOString() : k === 'session' ? summary.session_id : balance[k]]));
}
export function readSessionReport(fields, map, sid, now = Date.now()) {
  const unavailable = {status: 'unavailable', session_id: sid, balance: null};
  if (!map || fields?.[map.status] !== 'verified' || fields[map.session] !== sid) return unavailable;
  const expiry = Date.parse(fields[map.expires]);
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 60000) return unavailable;
  const values = Object.fromEntries(Object.keys(REPORT_FIELDS).filter(k => k.endsWith('_thb')).map(k => [k, fields[map[k]]]));
  try {
    const balance = sessionBalanceView({...values, session_id: sid, verified_deposit_thb: 0, credit_applied_thb: values.paid_credit_thb + values.bonus_credit_thb}, sid);
    delete balance.verified_deposit_thb; // Not part of this reporting snapshot.
    return {status: 'verified', session_id: sid, balance};
  } catch { return unavailable; }
}
