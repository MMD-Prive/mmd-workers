/** Durable at-most-once execution. Ambiguous work is never restarted automatically. */
export const CHECKOUT_STATE_KEY = 'shop_checkout_once_v1';
export const CHECKOUT_RECEIPT_TTL_MS = 45 * 60 * 1000;
export async function digestCheckout(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function reply(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private', 'retry-after': '2' } });
}
export async function runCheckoutOnce({ storage, fingerprint, shop, orderId, execute, now = () => Date.now() }) {
  if (!storage?.transaction || !storage?.get || !storage?.put) return reply({ ok: false, error: 'checkout_durability_unavailable' }, 503);
  let initial;
  try {
    initial = await storage.transaction(async txn => {
      const old = await txn.get(CHECKOUT_STATE_KEY);
      if (old) return { old };
      const row = { schema: CHECKOUT_STATE_KEY, fingerprint, shop, order_id: orderId, state: 'processing', stage: 'claimed', started_at: now() };
      await txn.put(CHECKOUT_STATE_KEY, row);
      return { row };
    });
  } catch { return reply({ ok: false, error: 'checkout_durability_unavailable' }, 503); }
  if (initial.old) {
    const old = initial.old;
    if (old.fingerprint !== fingerprint || old.shop !== shop) return reply({ ok: false, error: 'checkout_key_conflict', new_attempt_allowed: false }, 409);
    if (old.response && old.expires_at > now()) return reply({ ...old.response, idempotent: true }, old.http_status);
    const processing = old.state === 'processing' && now() - old.started_at < 120000;
    return reply({ ok: false, error: processing ? 'checkout_in_progress' : old.state === 'complete' || old.state === 'expired' ? 'checkout_resume_expired' : 'checkout_recovery_required', order_id: old.order_id, new_attempt_allowed: false, retry_same_key: processing, manual_review_required: !processing }, 409);
  }
  let row = initial.row;
  const checkpoint = async stage => {
    row = { ...row, stage, updated_at: now() };
    await storage.put(CHECKOUT_STATE_KEY, row); // Must be durable BEFORE the next external write.
  };
  try {
    const response = await execute({ orderId: row.order_id, checkpoint });
    const body = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid_checkout_response');
    const noDomainWrites = row.stage === 'claimed' && response.status >= 400 && response.status < 500;
    const payload = { ...body, checkout_request_version: 1, idempotent: false, new_attempt_allowed: noDomainWrites };
    if (!response.ok && !noDomainWrites) {
      payload.order_id = row.order_id;
      payload.new_attempt_allowed = false;
      payload.manual_review_required = true;
    }
    const reservationExpiry = Date.parse(body.reservation?.expires_at || '');
    const expires = Math.min(now() + CHECKOUT_RECEIPT_TTL_MS, Number.isFinite(reservationExpiry) ? reservationExpiry : Infinity);
    const storedPayload = response.ok ? Object.fromEntries(['ok', 'shop', 'order_id', 'payment_ref', 'payment_url', 'total_thb', 'currency', 'official_payment_verification_required', 'checkout_request_version', 'new_attempt_allowed'].filter(key => payload[key] !== undefined).map(key => [key, payload[key]])) : payload;
    row = { ...row, state: response.ok ? 'complete' : 'failed', response: storedPayload, http_status: response.status, expires_at: Math.max(now() + 1, expires), completed_at: now() };
    await storage.put(CHECKOUT_STATE_KEY, row);
    // Alarm failure must not discard an already durable successful receipt.
    if (storage.setAlarm) await storage.setAlarm(row.expires_at).catch(() => {});
    return reply(payload, response.status);
  } catch {
    // Do not erase the claim or call execute again after a partial/unknown outcome.
    return reply({ ok: false, error: 'checkout_recovery_required', order_id: row.order_id, new_attempt_allowed: false, manual_review_required: true }, 503);
  }
}
export async function expireCheckoutReceipt(storage, now = Date.now()) {
  const row = await storage.get(CHECKOUT_STATE_KEY);
  if (!row || !row.expires_at || row.expires_at > now) return;
  const { response, ...tombstone } = row;
  await storage.put(CHECKOUT_STATE_KEY, { ...tombstone, state: 'expired' });
}
