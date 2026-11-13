// Request-local only: share persistence results without adding webhook fields
// or copying the inbound text, LINE user ID, or reply token.
export const KENJI_LINE_INTAKE_RECEIPTS = Symbol("kenji_line_intake_receipts");

export function kenjiIntakeEventKey(event) {
  const id = event?.message?.id || event?.webhookEventId;
  return typeof id === "string" ? id.trim() : "";
}

export function trackKenjiLineIntake(env, event, persist) {
  const key = kenjiIntakeEventKey(event);
  const receipts = env[KENJI_LINE_INTAKE_RECEIPTS];
  if (key && receipts) receipts.set(key, persist.catch(() => null));
  return persist;
}

export async function confirmedKenjiInboxId(receipts, event) {
  const key = kenjiIntakeEventKey(event);
  const record = key ? await receipts.get(key) : null;
  const inboxId = record?.inbox_id;
  return record?.id && !record.skipped && typeof inboxId === "string" &&
    /^line_[A-Za-z0-9_-]{1,155}$/.test(inboxId) ? inboxId : "";
}
