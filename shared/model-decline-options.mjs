// Proposal only: no booking, notification, pricing or identity authority.
export function normalizeModelDecline(input = {}, now = Date.now()) {
  const fail = () => ({ ok: false, error: 'decline_options_invalid' });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail();
  if (input.reason != null && typeof input.reason !== 'string') return fail();
  const reason = (input.reason || '').trim();
  if (!Object.prototype.hasOwnProperty.call(input, 'availability_options')) return { ok: true, reason: reason.slice(0, 500), options: [] };
  if (reason.length > 200 || /[\r\n\x00-\x1f]/.test(reason)) return fail();
  const options = input.availability_options;
  if (!Array.isArray(options) || options.length < 1 || options.length > 3 || !Number.isFinite(now)) return fail();
  const seen = new Set();
  for (const value of options) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return fail();
    const time = Date.parse(value + ':00+07:00');
    // Round-trip rejects impossible dates, 24:00 and minute overflow.
    if (!Number.isFinite(time) || new Date(time + 7 * 3600000).toISOString().slice(0, 16) !== value || time <= now || seen.has(value)) return fail();
    seen.add(value);
  }
  const sorted = [...seen].sort();
  // Reuse existing decline_reason; do not add Airtable fields or confirm a date.
  return { ok: true, options: sorted, reason: [reason, 'Proposed only (Asia/Bangkok): ' + sorted.join(', ')].filter(Boolean).join(' | ') };
}
