const F = Object.freeze({
  amount: 'fldvCSwrUW8OMAooS', verification: 'fldJ7a0Ube9F0bmRy',
  status: 'fldEJ1hmm7KwWuI6q', stage: 'fldrr9g8ZZjqAbdKQ', type: 'fldydUWHhqVLMkNSC',
  depositStatus: 'fldD0mQWTfdmyBAeT', officialAt: 'fldPNK6qgxCSdaJRM',
  officialRef: 'flddkMKy5H8RbFwt9', officialBy: 'fld208LCmQZB5llNo',
});
const token = value => String(value?.name ?? value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const blocked = /^(?:refunded|reversed|chargeback|disputed|cancelled|canceled|void|failed|rejected)(?:_|$)/;
function field(fields, keys, normalize = value => value) {
  const values = [...new Set(keys.filter(Boolean))].filter(key => Object.hasOwn(fields, key)).map(key => normalize(fields[key]));
  if (values.some(value => value !== values[0])) throw Error('payment_field_conflict');
  return values[0];
}
function amount(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const n = Number(value), cents = Math.round(n * 100);
  return Number.isFinite(n) && n > 0 && Number.isSafeInteger(cents) && Math.abs(n * 100 - cents) < 0.00001 ? cents / 100 : null;
}

// Amount is the writable cash Payment amount. Amt Received is a formula and is
// deliberately never a fallback, even when it is nonzero or appears verified.
export function isWritablePaymentAmountField(amountField = F.amount) {
  return Boolean(amountField) && !['fld5rTIVEF1DXwfe2', 'Amt Received', 'Amount Received', 'amount_received_thb'].includes(amountField);
}
export function readPaymentCashAmount(record, amountField = F.amount) {
  if (!isWritablePaymentAmountField(amountField)) return null;
  try { return field(record?.fields || {}, [amountField, F.amount, 'Amount'], amount) ?? null; }
  catch { return null; }
}

export function readPaymentCashReceipt(record, options = {}) {
  const fields = record?.fields || {}, unavailable = {status: 'review_required', amount_thb: null};
  try {
    const value = (key, names) => field(fields, [options[`${key}Field`], F[key], ...names], token) || '';
    const verification = value('verification', ['Verification Status', 'verification_status']);
    const status = value('status', ['Payment Status', 'payment_status']);
    const stage = value('stage', ['payment_stage']), type = value('type', ['payment_type']);
    if (blocked.test(status) || blocked.test(verification) || /credit|bonus|wallet|redemption/.test(`${stage} ${type} ${status}`)) return unavailable;
    const official = ['officialAt', 'officialRef', 'officialBy'].some(key => value(key, [{officialAt: 'official_verified_at', officialRef: 'official_verification_ref', officialBy: 'official_verified_by'}[key]]));
    const approved = ['verified', 'official_verified', 'approved', ...(options.allowConfirmed ? ['confirmed'] : [])].includes(verification);
    const legacyOfficial = options.allowLegacyOfficial && !verification && official && value('depositStatus', ['deposit_status']) === 'official_verified';
    if (!approved && !legacyOfficial) return {status: 'not_verified', amount_thb: null};
    if (options.requireOfficialEvidence && !official) return unavailable;
    const cash = readPaymentCashAmount(record, options.amountField);
    return cash === null ? unavailable : {status: 'verified', amount_thb: cash};
  } catch { return unavailable; }
}
