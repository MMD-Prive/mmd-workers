/** An actual time and zone are required; a date-only Airtable field is not a transfer time. */
export function transferTimestamp(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/\.\d{1,3}(?=Z|[+-])/, '');
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(raw);
  if (!m || Number(m[6] || 0) > 14 || Number(m[7] || 0) > 59) return null;
  const seconds = m[3] || '00';
  const normalized = `${m[1]}T${m[2]}:${seconds}${m[4]}`;
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) return null;
  const offset = m[4] === 'Z' ? 0 : (m[5] === '-' ? -1 : 1) * (Number(m[6]) * 60 + Number(m[7]));
  if (new Date(ms + offset * 60000).toISOString().slice(0, 19) !== `${m[1]}T${m[2]}:${seconds}`) return null;
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}
export function slipTransferAt(fields = {}, note = {}) {
  for (const value of [note.manual_evidence_review?.paid_at, note.extraction?.paid_at, fields.paid_at, fields['Payment Date']]) {
    const normalized = transferTimestamp(value);
    if (normalized) return normalized;
  }
  return typeof fields.paid_at === 'string' ? fields.paid_at.trim() : '';
}
export async function internalEvidenceReference(proofId) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`manual-evidence:v1:${proofId}`));
  return 'mmd_evidence_' + [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
