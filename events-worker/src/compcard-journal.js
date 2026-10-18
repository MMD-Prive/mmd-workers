// Private delivery state only. No model, session, payment or membership writes.
// A Telegram timeout is not proof of failure: never automatically repeat it.
import { destinationsForCategory } from "./compcard-policy.js";

export const COMPCARD_JOURNAL_ROOT = "hype-compcards/v1/";
const LEASE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const TERMINAL = new Set(["sent", "delivery_uncertain", "blocked"]);
const STATES = new Set(["pending", "preparing", "sending", "not_sent", ...TERMINAL]);
const validEtag = value => typeof value === "string" && value.trim().length > 0 && value.length <= 256;

export function compcardStorage(env) {
  const bucket = env?.HYPE_COMPCARD_STATE;
  return bucket?.get && bucket?.put ? bucket : null;
}

export async function readCompcardJson(bucket, key) {
  const object = await bucket.get(`${COMPCARD_JOURNAL_ROOT}${key}`);
  if (!object) return null;
  const record = JSON.parse(await object.text());
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("compcard_journal_invalid");
  if (!validEtag(object.etag)) throw new Error("compcard_journal_etag_missing");
  return { record, etag: object.etag };
}

export async function writeCompcardJson(bucket, key, record, etag) {
  if (etag !== undefined && etag !== null && !validEtag(etag)) throw new Error("compcard_journal_etag_missing");
  const saved = await bucket.put(`${COMPCARD_JOURNAL_ROOT}${key}`, JSON.stringify(record), {
    ...(etag === undefined ? {} : { onlyIf: etag === null ? { etagDoesNotMatch: "*" } : { etagMatches: etag } }),
    httpMetadata: { contentType: "application/json" },
  });
  if (saved === null && etag !== undefined) return null;
  if (!saved || !validEtag(saved.etag)) throw new Error("compcard_journal_etag_missing");
  return saved;
}

export async function freezeCompcardPlan(bucket, date, slot, plan) {
  const key = `plans/${date}/${slot}.json`;
  const existing = await readCompcardJson(bucket, key);
  if (existing) return existing.record;
  const created = await writeCompcardJson(bucket, key, plan, null);
  if (created) return plan;
  const winner = await readCompcardJson(bucket, key);
  if (!winner) throw new Error("compcard_plan_claim_failed");
  return winner.record;
}

export async function readCompcardHistory(bucket, cards) {
  const ids = [...new Set(cards.map((card) => card.model_id).filter(Boolean))];
  const rows = await Promise.all(ids.map(async (id) => (await readCompcardJson(bucket, `history/${id}.json`))?.record));
  return rows.filter(Boolean).flatMap(row => row.status === "not_sent" && row.previous_exposure ? [row, row.previous_exposure] : [row]);
}

function priorExposure(record) {
  const previous = record?.status === "not_sent" ? record.previous_exposure : record;
  if (!previous || previous.status === "not_sent") return null;
  return { model_id: previous.model_id, category: previous.category, date: previous.date, status: previous.status, updated_at: previous.updated_at };
}

// Reserve exposure before a message can leave. If an execution dies after a
// Telegram acceptance, this still prevents the same model from being selected
// again as though it had never been promoted. A reservation makes no revenue claim.
export async function reserveCompcardExposure(bucket, card, date, now) {
  const key = `history/${card.model_id}.json`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const old = await readCompcardJson(bucket, key);
    if (old?.record.date > date || old?.record.date === date && old.record.status !== "not_sent") return;
    const record = { model_id: card.model_id, category: card.category, date, status: "sending", updated_at: now,
      previous_exposure: priorExposure(old?.record) };
    if (await writeCompcardJson(bucket, key, record, old?.etag ?? null)) return;
  }
  throw new Error("compcard_history_conflict");
}

export async function settleCompcardExposure(bucket, card, date, now, outcomes) {
  const expected = destinationsForCategory(card.category);
  const rows = Array.isArray(outcomes) ? outcomes : [];
  const complete = expected.length > 0 && rows.length === expected.length
    && expected.every(destination => rows.filter(row => row.destination === destination).length === 1);
  const uncertain = rows.some(row => row.state_write_conflict || ["sending", "delivery_uncertain"].includes(row.status));
  const preparing = rows.some(row => ["preparing", "pending"].includes(row.status));
  const sent = rows.some(row => row.status === "sent");
  const notSent = complete && rows.every(row => ["not_sent", "blocked"].includes(row.status));
  const status = sent ? "sent" : uncertain ? "delivery_uncertain" : preparing ? "sending" : notSent ? "not_sent" : "delivery_uncertain";
  const key = `history/${card.model_id}.json`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const old = await readCompcardJson(bucket, key);
    // Nothing was reserved if prepare rejected before exposure reservation.
    if (!old || old.record.date !== date) return;
    if (old.record.model_id !== card.model_id || old.record.category !== card.category) throw new Error("compcard_history_context_changed");
    // A delayed not_sent result from an earlier attempt must not clear a newer
    // retry's sending reservation. Confirmed exposure can still upgrade it.
    if (old.record.updated_at > now && !sent) return;
    // A later incomplete execution cannot erase confirmed or uncertain exposure.
    if (old.record.status === "sent" || old.record.status === "delivery_uncertain" && status !== "sent" || status === "sending") return;
    const record = { ...old.record, status, updated_at: Math.max(now, old.record.updated_at || 0) };
    if (await writeCompcardJson(bucket, key, record, old.etag)) return;
  }
  throw new Error("compcard_history_conflict");
}

function result(record, extra = {}) {
  return { status: record.status, attempts: record.attempts, receipt: record.receipt || null, error: record.error || null, ...extra };
}
function safeError(value) {
  const code = String(value?.code || value?.message || value || "compcard_failed");
  // Replacing punctuation is not redaction: URLs can still expose token bytes.
  return /^(?:compcard|telegram)_[a-z0-9_]{1,100}$/.test(code) ? code : "compcard_failed";
}

export async function deliverCompcardOnce({ bucket, key, context, prepare, deliver, now }) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("compcard_invalid_clock");
  if (!context || !["premium", "standard", "preview"].includes(context.destination)
      || !/^[a-f0-9]{64}$/.test(context.approved_sha256 || "")
      || typeof context.expected_chat_id !== "string" || !/^-[1-9]\d{0,15}$/.test(context.expected_chat_id)
      || !Number.isSafeInteger(Number(context.expected_chat_id))) throw new Error("compcard_delivery_context_invalid");
  let envelope = await readCompcardJson(bucket, key);
  if (!envelope) {
    const record = { schema: "hype_compcard_delivery_v1", ...context, status: "pending", attempts: 0, created_at: now, lease_until: 0 };
    const created = await writeCompcardJson(bucket, key, record, null);
    envelope = created ? { record, etag: created.etag } : await readCompcardJson(bucket, key);
  }
  if (!envelope) throw new Error("compcard_delivery_claim_failed");
  let { record, etag } = envelope;
  if (record.schema !== "hype_compcard_delivery_v1" || !STATES.has(record.status)
      || !Number.isInteger(record.attempts) || record.attempts < 0 || record.attempts > MAX_ATTEMPTS
      || !Number.isFinite(record.lease_until) || record.lease_until < 0
      || (record.next_attempt_at != null && (!Number.isFinite(record.next_attempt_at) || record.next_attempt_at < 0))) {
    return { status: "blocked", error: "compcard_delivery_record_invalid" };
  }
  if (Object.entries(context).some(([field, value]) => record[field] !== value)) {
    return { status: "blocked", error: "compcard_delivery_context_changed" };
  }
  if (TERMINAL.has(record.status)) return result(record, { duplicate: true });
  if (record.lease_until > now || record.next_attempt_at > now) return result(record, { duplicate: true });
  if (record.status === "sending") {
    // Even a crash between this marker and fetch is uncertain. There is no
    // distributed exactly-once guarantee in Telegram sendPhoto.
    const uncertain = { ...record, status: "delivery_uncertain", lease_until: 0, updated_at: now, error: "compcard_send_receipt_missing" };
    await writeCompcardJson(bucket, key, uncertain, etag);
    return result(uncertain);
  }
  if (record.attempts >= MAX_ATTEMPTS) return result(record, { exhausted: true });

  record = { ...record, status: "preparing", attempts: record.attempts + 1, lease_until: now + LEASE_MS, updated_at: now };
  let saved = await writeCompcardJson(bucket, key, record, etag);
  if (!saved) return { status: "preparing", duplicate: true };
  etag = saved.etag;
  let prepared;
  try { prepared = await prepare(); }
  catch (error) {
    record = { ...record, status: error?.retryable === false ? "blocked" : "not_sent", error: safeError(error), lease_until: 0, next_attempt_at: now + 15 * 60000, updated_at: now };
    saved = await writeCompcardJson(bucket, key, record, etag);
    return result(record, saved ? {} : { state_write_conflict: true });
  }
  record = { ...record, status: "sending", lease_until: now + LEASE_MS, updated_at: now };
  saved = await writeCompcardJson(bucket, key, record, etag);
  if (!saved) return { status: "preparing", error: "compcard_send_claim_lost" };
  etag = saved.etag;
  let outcome;
  try { outcome = await deliver(prepared); }
  catch { outcome = { delivery_state: "delivery_uncertain", error: "compcard_transport_unknown" }; }
  const state = outcome?.delivery_state;
  const sent = outcome?.ok === true && state === "sent" && Number.isSafeInteger(outcome?.message_id) && outcome.message_id > 0
    && String(outcome?.chat_id) === context.expected_chat_id && outcome.destination === context.destination
    && outcome.approved_sha256 === context.approved_sha256;
  record = {
    ...record,
    status: sent ? "sent" : state === "not_sent" ? "not_sent" : "delivery_uncertain",
    receipt: sent ? { message_id: outcome.message_id, chat_id: String(outcome.chat_id), file_unique_id: outcome.file_unique_id || null, approved_sha256: outcome.approved_sha256 || null } : null,
    error: sent ? null : safeError(outcome?.error || "compcard_delivery_unconfirmed"),
    lease_until: 0,
    next_attempt_at: state === "not_sent" ? now + 15 * 60000 : null,
    updated_at: now,
  };
  saved = await writeCompcardJson(bucket, key, record, etag);
  // If this write fails, the durable 'sending' marker is kept and the next
  // execution will hold for review rather than repeat an accepted message.
  return result(record, saved ? {} : { state_write_conflict: true });
}
