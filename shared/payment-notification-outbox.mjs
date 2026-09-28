// Private R2 delivery journal. Payloads are evidence/notification context only;
// retry handlers must never settle money, approve proofs, or issue entitlements.
const ROOT = "payment-notifications/v1/";
const LEASE_MS = 5 * 60000;
const MAX_ATTEMPTS = 12;
const MAX_AGE_MS = 23 * 3600000; // Keep LINE retries inside its 24-hour window.
const terminal = (record) => ["delivered", "manual_review"].includes(record.status);
const safeError = (error) => String(error?.message || error || "delivery_failed").replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160);

export async function notificationDigest(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const prefix = (lane) => `${ROOT}${lane}/records/`;
const keyOf = (lane, id) => `${prefix(lane)}${id}.json`;
const receiptKey = (lane, id) => `${ROOT}${lane}/receipts/${id}.json`;

// Internal journal access only. HTTP callers must project a safe subset and
// authorize the exact canonical payment before using the delivery-only retry.
export async function readPaymentNotification({ bucket, lane, eventKey }) {
  if (!bucket?.get) throw new Error("notification_storage_unavailable");
  const id = await notificationDigest(`${lane}:${eventKey}`);
  return (await read(bucket, receiptKey(lane, id)) || await read(bucket, keyOf(lane, id)))?.record || null;
}

export async function retryPaymentNotification({ bucket, lane, eventKey, expectedPayload, deliver, now = Date.now() }) {
  if (!bucket?.get || !bucket?.put) throw new Error("notification_storage_unavailable");
  const id = await notificationDigest(`${lane}:${eventKey}`);
  const envelope = await read(bucket, receiptKey(lane, id)) || await read(bucket, keyOf(lane, id));
  if (!envelope) throw new Error("notification_not_found");
  if (Object.entries(expectedPayload).some(([key, value]) => envelope.record.payload?.[key] !== value)) {
    throw new Error("notification_context_mismatch");
  }
  // Never enqueue, reset an expired receipt, bypass backoff, or change money.
  return attempt({ bucket, lane, envelope, deliver, now });
}

async function read(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  return { record: JSON.parse(await object.text()), etag: object.etag };
}

async function put(bucket, lane, record, etag) {
  return bucket.put(keyOf(lane, record.id), JSON.stringify(record), {
    onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
    customMetadata: { status: record.status, attempts: String(record.attempts) },
  });
}

function result(record, extra = {}) {
  return {
    id: record.id,
    durable: true,
    delivered: record.status === "delivered",
    queued: !terminal(record),
    status: record.status,
    attempts: record.attempts,
    result: record.result || null,
    ...extra,
  };
}

async function archive(bucket, lane, record) {
  // Write the terminal receipt before removing it from the retry scan. There
  // is no gap where a repeated event could enqueue a second delivery.
  await bucket.put(receiptKey(lane, record.id), JSON.stringify(record), {
    onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" },
  });
  if (bucket.delete) await bucket.delete(keyOf(lane, record.id));
}

async function attempt({ bucket, lane, envelope, deliver, now }) {
  let { record, etag } = envelope;
  const completed = await read(bucket, receiptKey(lane, record.id));
  if (completed) {
    if (bucket.delete) await bucket.delete(keyOf(lane, record.id));
    return result(completed.record, { duplicate: true });
  }
  if (terminal(record)) {
    await archive(bucket, lane, record);
    return result(record, { duplicate: true });
  }
  if (record.lease_until > now || record.next_attempt_at > now) return result(record, { duplicate: true });
  const expired = now - record.created_at >= MAX_AGE_MS;
  record = { ...record, status: expired ? "manual_review" : "delivering", attempts: record.attempts + (expired ? 0 : 1), lease_until: now + LEASE_MS };
  const claim = await put(bucket, lane, record, etag);
  if (claim === null) return { durable: true, delivered: false, queued: true, status: "delivering", duplicate: true };
  etag = claim.etag;
  if (expired) {
    await archive(bucket, lane, record);
    return result(record);
  }

  // Called after each successful recipient. A later recipient failure must not
  // cause a retry to resend previously acknowledged deliveries.
  const checkpoint = async (state) => {
    const next = { ...record, state };
    const saved = await put(bucket, lane, next, etag);
    if (saved === null) throw new Error("notification_lease_lost");
    record = next;
    etag = saved.etag;
  };
  let outcome;
  try { outcome = await deliver(record, checkpoint); }
  catch (error) { outcome = { ok: false, error: safeError(error) }; }
  const done = outcome?.ok === true;
  record = {
    ...record,
    status: done ? "delivered" : outcome?.retryable === false || record.attempts >= MAX_ATTEMPTS ? "manual_review" : "pending",
    lease_until: 0,
    next_attempt_at: done ? null : now + Math.min(3600000, 60000 * 2 ** (record.attempts - 1)),
    updated_at: now,
    result: outcome?.result || null,
    last_error: done ? null : safeError(outcome?.error),
  };
  const saved = await put(bucket, lane, record, etag);
  if (saved === null) return { durable: true, delivered: false, queued: true, status: "delivering", state_write_conflict: true };
  if (terminal(record)) await archive(bucket, lane, record);
  return result(record);
}

export async function dispatchPaymentNotification({ bucket, lane, eventKey, payload, deliver, now = Date.now() }) {
  const id = await notificationDigest(`${lane}:${eventKey}`);
  if (!bucket?.get || !bucket?.put) {
    // Compatibility runtimes can still deliver, but never claim durable retry.
    const record = { id, payload, state: {}, attempts: 1, created_at: now };
    let outcome;
    try { outcome = await deliver(record, async (state) => { record.state = state; }); }
    catch (error) { outcome = { ok: false, error: safeError(error) }; }
    return { id, durable: false, delivered: outcome?.ok === true, queued: false, status: outcome?.ok ? "delivered" : "manual_review", result: outcome?.result || null };
  }
  const key = keyOf(lane, id);
  const receipt = await read(bucket, receiptKey(lane, id));
  if (receipt) return result(receipt.record, { duplicate: true });
  let envelope = await read(bucket, key);
  if (!envelope) {
    const record = { schema: "payment_notification_v1", id, payload, state: {}, status: "pending", attempts: 0, created_at: now, next_attempt_at: now, lease_until: 0 };
    const created = await put(bucket, lane, record);
    envelope = created === null ? await read(bucket, key) : { record, etag: created.etag };
  }
  if (!envelope) throw new Error("notification_enqueue_failed");
  return attempt({ bucket, lane, envelope, deliver, now });
}

export async function drainPaymentNotifications({ bucket, lane, deliver, now = Date.now(), limit = 5 }) {
  if (!bucket?.get || !bucket?.put || !bucket?.list) return { skipped: "outbox_unavailable" };
  limit = Math.max(1, Math.min(10, Number(limit) || 5));
  const cursorKey = `${ROOT}${lane}/cursor.json`;
  const savedCursor = await read(bucket, cursorKey);
  const listing = await bucket.list({ prefix: prefix(lane), limit, ...(savedCursor?.record?.cursor ? { cursor: savedCursor.record.cursor } : {}) });
  const summary = { scanned: 0, delivered: 0, pending: 0, manual_review: 0 };
  for (const object of listing.objects || []) {
    const envelope = await read(bucket, object.key);
    if (!envelope) continue;
    summary.scanned += 1;
    const outcome = await attempt({ bucket, lane, envelope, deliver, now });
    if (outcome.delivered) summary.delivered += 1;
    else if (outcome.status === "manual_review") summary.manual_review += 1;
    else summary.pending += 1;
  }
  // Persist pagination so old receipts cannot starve newer failed deliveries.
  await bucket.put(cursorKey, JSON.stringify({ cursor: listing.truncated ? listing.cursor : null }), { httpMetadata: { contentType: "application/json" } });
  return summary;
}
