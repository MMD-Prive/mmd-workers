// Durable HYPE/Ops notification delivery for LINE payment evidence.
//
// Authority boundaries this module must never cross:
//   - Money Truth stays in payments-worker. Nothing here settles, re-settles,
//     verifies, or reverses a payment.
//   - Telegram route ownership stays in telegram-worker. This outbox only asks
//     telegram-worker to send an already-rendered, bounded operator message.
//   - A delivery receipt is never payment verification.
//
// The outbox stores the rendered message, not the inputs that produced it, so a
// retry can only re-send an operator notification. It can never re-run
// settlement, re-create a Payment Proof, or mutate canonical truth.
//
// Records live in the private LINE evidence bucket (LINE_SLIP_EVIDENCE). They
// are never public, never logged raw, and are garbage-collected after a bounded
// retention window.

const SCHEMA = "line_ops_notification_outbox_v1";
const OUTBOX_PREFIX = "line-ofc/ops-outbox/";
const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_BASE_BACKOFF_MS = 60 * 1000;
const DEFAULT_MAX_BACKOFF_MS = 30 * 60 * 1000;
const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DRAIN_LIMIT = 25;

export const OPS_NOTIFICATION_STATUS = Object.freeze({
  PENDING: "pending_delivery",
  DELIVERING: "delivering",
  DELIVERED: "delivered",
  RETRYABLE: "retryable",
  FAILED_TERMINAL: "failed_terminal",
});

const TERMINAL_STATUSES = new Set([OPS_NOTIFICATION_STATUS.DELIVERED, OPS_NOTIFICATION_STATUS.FAILED_TERMINAL]);

function text(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function safeCode(value, max = 120) {
  return text(value, max).replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, max);
}

function positiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  const floored = Math.floor(n);
  return max ? Math.min(floored, max) : floored;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value ?? "")));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function opsOutboxMaxAttempts(env = {}) {
  return positiveInt(env.LINE_OPS_OUTBOX_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, 12);
}

export function opsOutboxRetentionMs(env = {}) {
  return positiveInt(env.LINE_OPS_OUTBOX_RETENTION_HOURS, DEFAULT_RETENTION_MS / 3600000, 720) * 3600000;
}

export function opsOutboxLeaseMs(env = {}) {
  return positiveInt(env.LINE_OPS_OUTBOX_LEASE_SECONDS, DEFAULT_LEASE_MS / 1000, 900) * 1000;
}

export function opsOutboxBackoffMs(attempts = 1, env = {}) {
  const base = positiveInt(env.LINE_OPS_OUTBOX_BASE_BACKOFF_SECONDS, DEFAULT_BASE_BACKOFF_MS / 1000, 3600) * 1000;
  const max = positiveInt(env.LINE_OPS_OUTBOX_MAX_BACKOFF_SECONDS, DEFAULT_MAX_BACKOFF_MS / 1000, 21600) * 1000;
  const exponent = Math.max(0, Math.min(Number(attempts) || 1, 16) - 1);
  return Math.min(max, base * 2 ** exponent);
}

/**
 * Stable semantic identity for one operator notification.
 *
 * Keyed by event (the canonical proof/evidence id) + destination + purpose, so
 * a duplicate LINE webhook, a redelivery, or a repeated observer pass resolves
 * to the same record instead of spamming Ops.
 */
export async function opsNotificationId({ eventKey = "", destination = {}, purpose = "" } = {}) {
  const chatId = text(destination?.chat_id, 80);
  const threadId = text(destination?.message_thread_id, 20);
  return sha256Hex(`${SCHEMA}|${text(eventKey, 180)}|${chatId}|${threadId}|${safeCode(purpose, 80)}`);
}

export function opsOutboxKey(id = "") {
  return `${OUTBOX_PREFIX}${text(id, 64)}.json`;
}

function outboxBucket(env = {}) {
  const bucket = env?.LINE_SLIP_EVIDENCE;
  if (!bucket || typeof bucket.put !== "function" || typeof bucket.get !== "function") return null;
  return bucket;
}

async function readRecordEnvelope(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    const parsed = JSON.parse(await object.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return { record: parsed, etag: text(object.etag, 160) };
  } catch (_) {
    return null;
  }
}

async function readRecord(bucket, key) {
  return (await readRecordEnvelope(bucket, key))?.record || null;
}

async function writeRecord(bucket, record, onlyIf = null) {
  const options = {
    httpMetadata: { contentType: "application/json" },
    // Bounded, non-identifying metadata only. Never the message body, never a
    // LINE identity, never an amount.
    customMetadata: {
      schema: SCHEMA,
      status: safeCode(record.status, 40),
      purpose: safeCode(record.purpose, 80),
      attempts: String(Number(record.attempts) || 0),
    },
  };
  if (onlyIf) options.onlyIf = onlyIf;
  const stored = await bucket.put(opsOutboxKey(record.id), JSON.stringify(record), options);
  return { record, stored, etag: text(stored?.etag, 160) };
}

function newRecord({ id, eventKey, purpose, destination, message, nowMs }) {
  return {
    schema: SCHEMA,
    id,
    event_key: text(eventKey, 180),
    purpose: safeCode(purpose, 80),
    destination: {
      chat_id: text(destination?.chat_id, 80),
      message_thread_id: Number(destination?.message_thread_id) || null,
      flow: safeCode(destination?.flow, 60),
      owner: "telegram-worker",
    },
    message: text(message, 3500),
    status: OPS_NOTIFICATION_STATUS.PENDING,
    attempts: 0,
    created_at_ms: nowMs,
    updated_at_ms: nowMs,
    next_attempt_at_ms: nowMs,
    delivering_until_ms: 0,
    delivered_at_ms: null,
    last_error: null,
    authority_note: "notification_only_money_truth_remains_payments_worker",
  };
}

/**
 * Default transport. telegram-worker stays the Telegram route owner; this
 * worker only requests a send through the trusted service binding.
 */
export async function sendThroughTelegramWorker(env = {}, record = {}) {
  const token = text(env.AUTH_SERVICE_LINE_TO_TELEGRAM || env.INTERNAL_TOKEN, 2000);
  const chatId = text(record?.destination?.chat_id, 80);
  // A missing binding/secret is treated as recoverable: a redeploy or secret
  // rotation can restore delivery, and the operator notice must survive it.
  if (!env?.TELEGRAM_WORKER || typeof env.TELEGRAM_WORKER.fetch !== "function") {
    return { ok: false, retryable: true, error: "telegram_binding_missing" };
  }
  if (!token || !chatId) return { ok: false, retryable: true, error: "telegram_config_missing" };
  try {
    const response = await env.TELEGRAM_WORKER.fetch(new Request("https://telegram-worker/telegram/internal/send", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        flow: record?.destination?.flow || "payment_proof",
        chat_id: chatId,
        message_thread_id: record?.destination?.message_thread_id || undefined,
        text: record?.message || "",
      }),
    }));
    if (response.ok) return { ok: true, status: response.status };
    const status = Number(response.status) || 0;
    // 4xx other than 408/429 is a contract problem, not a transient outage.
    const retryable = status === 408 || status === 429 || status >= 500 || status === 0;
    return { ok: false, retryable, error: `telegram_${status || "failed"}`, status };
  } catch (error) {
    return { ok: false, retryable: true, error: safeCode(error?.message || error || "telegram_send_failed") };
  }
}

async function attemptDelivery(env, bucket, record, { transport, nowMs, expectedEtag = "" }) {
  const attempts = (Number(record.attempts) || 0) + 1;
  const leased = {
    ...record,
    status: OPS_NOTIFICATION_STATUS.DELIVERING,
    attempts,
    updated_at_ms: nowMs,
    delivering_until_ms: nowMs + opsOutboxLeaseMs(env),
  };

  let leaseEtag = expectedEtag;
  if (bucket) {
    const claim = await writeRecord(bucket, leased, expectedEtag ? { etagMatches: expectedEtag } : null);
    if (expectedEtag && claim.stored === null) {
      const winner = await readRecord(bucket, opsOutboxKey(record.id));
      return { record: winner || record, delivered: winner?.status === OPS_NOTIFICATION_STATUS.DELIVERED, attempts: Number(winner?.attempts) || Number(record.attempts) || 0, claimed: false, duplicate: true };
    }
    leaseEtag = claim.etag || expectedEtag;
  }

  const outcome = await transport(env, leased);
  if (outcome?.ok === true) {
    const delivered = {
      ...leased,
      status: OPS_NOTIFICATION_STATUS.DELIVERED,
      updated_at_ms: nowMs,
      delivered_at_ms: nowMs,
      delivering_until_ms: 0,
      next_attempt_at_ms: null,
      last_error: null,
    };
    if (bucket) {
      const finalWrite = await writeRecord(bucket, delivered, leaseEtag ? { etagMatches: leaseEtag } : null);
      if (leaseEtag && finalWrite.stored === null) {
        const latest = await readRecord(bucket, opsOutboxKey(record.id));
        return { record: latest || delivered, delivered: latest?.status === OPS_NOTIFICATION_STATUS.DELIVERED, attempts, claimed: true, state_write_conflict: true };
      }
    }
    return { record: delivered, delivered: true, attempts, claimed: true };
  }

  const maxAttempts = opsOutboxMaxAttempts(env);
  const exhausted = attempts >= maxAttempts || outcome?.retryable === false;
  const failed = {
    ...leased,
    status: exhausted ? OPS_NOTIFICATION_STATUS.FAILED_TERMINAL : OPS_NOTIFICATION_STATUS.RETRYABLE,
    updated_at_ms: nowMs,
    delivering_until_ms: 0,
    next_attempt_at_ms: exhausted ? null : nowMs + opsOutboxBackoffMs(attempts, env),
    last_error: safeCode(outcome?.error || "telegram_send_failed"),
  };
  if (bucket) {
    const finalWrite = await writeRecord(bucket, failed, leaseEtag ? { etagMatches: leaseEtag } : null);
    if (leaseEtag && finalWrite.stored === null) {
      const latest = await readRecord(bucket, opsOutboxKey(record.id));
      return { record: latest || failed, delivered: latest?.status === OPS_NOTIFICATION_STATUS.DELIVERED, attempts, terminal: latest?.status === OPS_NOTIFICATION_STATUS.FAILED_TERMINAL, claimed: true, state_write_conflict: true };
    }
  }
  return { record: failed, delivered: false, attempts, terminal: exhausted, claimed: true };
}
/**
 * Durable enqueue + immediate best-effort delivery.
 *
 * The record is persisted BEFORE the first send attempt, so a Telegram outage
 * leaves a recoverable delivery instead of a log line. Payment/proof processing
 * is already complete by the time this runs and is never repeated by a retry.
 */
export async function dispatchOpsNotification(env = {}, input = {}, options = {}) {
  const transport = typeof options.transport === "function" ? options.transport : sendThroughTelegramWorker;
  const nowMs = Number(options.now) || Date.now();
  const bucket = outboxBucket(env);
  const destination = {
    chat_id: text(input?.destination?.chat_id, 80),
    message_thread_id: Number(input?.destination?.message_thread_id) || null,
    flow: safeCode(input?.destination?.flow, 60),
  };
  const id = await opsNotificationId({ eventKey: input.eventKey, destination, purpose: input.purpose });

  if (!bucket) {
    // Fail-open transport only: no durable store is bound, so deliver directly
    // and report that durability is unavailable. Money truth is unaffected.
    const record = newRecord({ id, eventKey: input.eventKey, purpose: input.purpose, destination, message: input.message, nowMs });
    const outcome = await transport(env, record);
    return {
      id,
      durable: false,
      duplicate: false,
      delivered: outcome?.ok === true,
      status: outcome?.ok === true ? OPS_NOTIFICATION_STATUS.DELIVERED : OPS_NOTIFICATION_STATUS.RETRYABLE,
      attempts: 1,
      reason: outcome?.ok === true ? null : safeCode(outcome?.error || "telegram_send_failed"),
      outbox_unavailable: true,
    };
  }

  let envelope = await readRecordEnvelope(bucket, opsOutboxKey(id));
  let existing = envelope?.record || null;
  if (existing && TERMINAL_STATUSES.has(existing.status)) {
    return { id, durable: true, duplicate: true, delivered: existing.status === OPS_NOTIFICATION_STATUS.DELIVERED, status: existing.status, attempts: Number(existing.attempts) || 0 };
  }
  if (existing && existing.status === OPS_NOTIFICATION_STATUS.DELIVERING && Number(existing.delivering_until_ms) > nowMs) {
    return { id, durable: true, duplicate: true, delivered: false, status: existing.status, attempts: Number(existing.attempts) || 0, reason: "delivery_in_flight" };
  }

  let base = existing
    ? { ...existing, message: text(input.message, 3500) || existing.message, updated_at_ms: nowMs }
    : newRecord({ id, eventKey: input.eventKey, purpose: input.purpose, destination, message: input.message, nowMs });

  if (!existing) {
    const created = await writeRecord(bucket, base, { etagDoesNotMatch: "*" });
    if (created.stored === null) {
      envelope = await readRecordEnvelope(bucket, opsOutboxKey(id));
      existing = envelope?.record || null;
      if (!existing) return { id, durable: true, duplicate: true, delivered: false, status: OPS_NOTIFICATION_STATUS.PENDING, attempts: 0, reason: "concurrent_create_unresolved" };
      if (TERMINAL_STATUSES.has(existing.status)) return { id, durable: true, duplicate: true, delivered: existing.status === OPS_NOTIFICATION_STATUS.DELIVERED, status: existing.status, attempts: Number(existing.attempts) || 0 };
      if (existing.status === OPS_NOTIFICATION_STATUS.DELIVERING && Number(existing.delivering_until_ms) > nowMs) return { id, durable: true, duplicate: true, delivered: false, status: existing.status, attempts: Number(existing.attempts) || 0, reason: "delivery_in_flight" };
      base = existing;
    } else {
      envelope = { record: base, etag: created.etag };
    }
  }

  const result = await attemptDelivery(env, bucket, base, { transport, nowMs, expectedEtag: envelope?.etag || "" });
  return {
    id,
    durable: true,
    duplicate: Boolean(existing) || result.duplicate === true,
    delivered: result.delivered,
    status: result.record.status,
    attempts: result.attempts,
    reason: result.claimed === false ? "delivery_in_flight" : result.record.last_error || null,
  };
}

/**
 * Retry sweep. Re-sends only what is already rendered and already persisted.
 * It never touches Airtable, payments-worker, entitlement, or proof state.
 */
export async function drainOpsNotificationOutbox(env = {}, options = {}) {
  const bucket = outboxBucket(env);
  if (!bucket || typeof bucket.list !== "function") {
    return { scanned: 0, retried: 0, delivered: 0, terminal: 0, collected: 0, skipped: "outbox_unavailable" };
  }
  const transport = typeof options.transport === "function" ? options.transport : sendThroughTelegramWorker;
  const nowMs = Number(options.now) || Date.now();
  const limit = positiveInt(options.limit, DEFAULT_DRAIN_LIMIT, 100);
  const retentionMs = opsOutboxRetentionMs(env);

  const listing = await bucket.list({ prefix: OUTBOX_PREFIX, limit: Math.min(limit * 4, 400) });
  const objects = Array.isArray(listing?.objects) ? listing.objects : [];
  const summary = { scanned: 0, retried: 0, delivered: 0, terminal: 0, collected: 0 };

  for (const entry of objects) {
    if (summary.retried >= limit) break;
    const key = text(entry?.key, 300);
    if (!key.startsWith(OUTBOX_PREFIX)) continue;
    const envelope = await readRecordEnvelope(bucket, key);
    const record = envelope?.record || null;
    summary.scanned += 1;
    if (!record?.id) continue;

    if (TERMINAL_STATUSES.has(record.status)) {
      if (nowMs - (Number(record.updated_at_ms) || 0) > retentionMs && typeof bucket.delete === "function") {
        await bucket.delete(key);
        summary.collected += 1;
      }
      continue;
    }

    if (record.status === OPS_NOTIFICATION_STATUS.DELIVERING && Number(record.delivering_until_ms) > nowMs) continue;
    if (Number(record.next_attempt_at_ms) > nowMs) continue;

    const result = await attemptDelivery(env, bucket, record, { transport, nowMs, expectedEtag: envelope?.etag || "" });
    if (result.claimed === false) continue;
    summary.retried += 1;
    if (result.delivered) summary.delivered += 1;
    if (result.terminal) summary.terminal += 1;
  }

  return summary;
}

export const LINE_OPS_OUTBOX_INTERNALS = Object.freeze({
  OUTBOX_PREFIX,
  SCHEMA,
  newRecord,
  readRecord,
  readRecordEnvelope,
  writeRecord,
});

