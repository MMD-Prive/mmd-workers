// Owner-approved free-text policy. This never expires the structured Companion,
// member identity, operational state, or replay/audit ledger.
export const BLACKCARD_FREE_TEXT_RETENTION_DAYS = 90;
export function textRetentionDue(row, now = Date.now()) {
  const cutoff = Date.parse(row.retention_expires_at);
  return Boolean(row.retention_redacted_at) || !Number.isFinite(cutoff) || cutoff <= Number(new Date(now));
}
