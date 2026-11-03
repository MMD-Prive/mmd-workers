const amounts = ['total_amount_thb', 'verified_paid_thb', 'verified_deposit_thb', 'paid_credit_thb', 'bonus_credit_thb', 'credit_applied_thb', 'remaining_amount_thb', 'overpaid_amount_thb'];
const unavailable = () => { throw Object.assign(new Error('verified_balance_unavailable'), {status: 503}); };
export function sessionBalanceView(summary, sessionId) {
  if (!summary || summary.session_id !== sessionId) unavailable();
  const cents = {};
  for (const key of amounts) {
    const value = summary[key], rounded = Math.round(value * 100);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isSafeInteger(rounded) || Math.abs(value * 100 - rounded) > 0.00001) unavailable();
    cents[key] = rounded;
  }
  const c = cents, due = c.total_amount_thb - c.verified_paid_thb - c.credit_applied_thb;
  if (c.total_amount_thb <= 0 || c.verified_deposit_thb > c.verified_paid_thb || c.credit_applied_thb !== c.paid_credit_thb + c.bonus_credit_thb || c.remaining_amount_thb !== Math.max(0, due) || c.overpaid_amount_thb !== Math.max(0, -due)) unavailable();
  return {schema: 'verified_session_balance_v1', session_id: sessionId, ...Object.fromEntries(amounts.map(key => [key, summary[key]]))};
}
