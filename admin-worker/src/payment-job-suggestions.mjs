// Read-only suggestions. Choosing a candidate still uses the binding preview and confirmation.
export function suggestPaymentJobs(jobs, amount, paidAt = '') {
  const cents = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
  const target = cents(amount);
  if (!target) return [];
  const tolerance = Math.min(200000, Math.max(50000, Math.round(target * .1)));
  const transferDay = Date.parse(paidAt);
  const candidates = [];
  for (const job of jobs || []) {
    if (job.cancelled || !job.session_id || !job.client_record_id) continue;
    for (const payment of job.payments || []) {
      const expected = cents(payment.expected_amount_thb);
      if (payment.state !== 'waiting_proof' || payment.has_evidence !== false ||
          !payment.payment_ref || !['deposit', 'final', 'full'].includes(payment.payment_stage) || !expected) continue;
      const difference = target - expected;
      if (Math.abs(difference) > tolerance) continue;
      const jobTime = Date.parse(job.job_date + (job.job_date?.length === 10 ? 'T12:00:00+07:00' : ''));
      candidates.push({ ...job, payment_ref: payment.payment_ref, payment_stage: payment.payment_stage,
        expected_amount_thb: expected / 100, difference_thb: difference / 100, exact: difference === 0,
        date_distance: Number.isFinite(transferDay) && Number.isFinite(jobTime) ? Math.abs(jobTime - transferDay) : Infinity });
    }
  }
  return candidates.sort((a, b) => Math.abs(a.difference_thb) - Math.abs(b.difference_thb) ||
    a.date_distance - b.date_distance || a.session_id.localeCompare(b.session_id) || a.payment_ref.localeCompare(b.payment_ref)).slice(0, 10);
}
