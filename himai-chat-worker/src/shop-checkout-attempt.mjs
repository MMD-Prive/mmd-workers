import { SHOP_BRANDS, shopForCheckoutPath } from "../../shared/shop-brand.mjs";

const RECORD = "checkout_attempt_v1";
const LIMIT = 32768;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const KEY_PATTERN = /^(?:[a-f0-9]{64}|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i;

function reply(body, status = 200) {
  return Response.json(body, { status, headers: {
    "cache-control": "no-store, private", "x-mmd-checkout-reliability": "1",
    "x-content-type-options": "nosniff",
  } });
}
function fault(message, status = 400) { return Object.assign(new Error(message), { status }); }
export async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  return value;
}
export async function checkoutFingerprint(body, shop) {
  const items = Array.isArray(body.items) ? body.items.map((x) => ({ product_id: x?.product_id, quantity: x?.quantity })) : [];
  items.sort((a, b) => String(a.product_id).localeCompare(String(b.product_id)));
  return digest(JSON.stringify(stable({ shop, customer: body.customer, shipping: body.shipping, items, quote: body.quote })));
}

export async function boundedBody(request) {
  if (Number(request.headers.get("content-length")) > LIMIT) throw fault("checkout_body_too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) throw fault("invalid_json_body");
  const chunks = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMIT) { await reader.cancel(); throw fault("checkout_body_too_large", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(all)); } catch { throw fault("invalid_json_body"); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw fault("invalid_json_body");
  return body;
}

/** Public ingress. Only the route decides the shop; identity came from server verification. */
export async function forwardCheckoutAttempt(request, env, memberContext = null) {
  const shop = shopForCheckoutPath(new URL(request.url).pathname);
  if (!shop) return null;
  let body, handedOff = false;
  try {
    const origin = request.headers.get("origin");
    if (origin && !["https://mmdbkk.com", "https://www.mmdbkk.com"].includes(origin))
      return reply({ ok: false, error: "checkout_origin_not_allowed", safe_new_attempt: true }, 403);
    body = await boundedBody(request);
    const id = String(body.checkout_request_id || "");
    if (!KEY_PATTERN.test(id)) return reply({ ok: false, error: "checkout_request_key_required", safe_new_attempt: true }, 428);
    const ns = env.MMD_SHOP_STOCK_COORDINATOR;
    if (!ns?.idFromName || !ns?.get) return reply({ ok: false, error: "checkout_coordinator_unavailable", safe_new_attempt: false }, 503);
    const subject = memberContext?.member_id
      ? `member:${memberContext.member_id}:${memberContext.line_user_id || ""}` : "guest";
    const subjectHash = await digest(subject);
    const keyHash = await digest(id);
    const stub = ns.get(ns.idFromName(`checkout-v1:${shop.key}:${keyHash}`));
    // A separate DO instance per attempt. Never hold the global stock coordinator while calling it.
    handedOff = true;
    const response = await stub.fetch(`https://checkout.internal/checkout-attempt/${shop.key}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ shop: shop.key, key_hash: keyHash, subject_hash: subjectHash,
        member_context: memberContext, request_body: body }),
    });
    const result = await response.json().catch(() => null);
    if (!result || typeof result.ok !== "boolean") throw fault("checkout_response_uncertain", 503);
    return reply(result, response.status);
  } catch (error) {
    return reply({ ok: false, error: error.status === 400 || error.status === 413 ? error.message : "checkout_response_uncertain",
      safe_new_attempt: !handedOff && (error.status === 400 || error.status === 413) }, handedOff ? 503 : (error.status || 503));
  }
}

/** A durable at-most-once attempt. Ambiguous worker/external-write failures never acquire a new lease. */
export async function durableCheckoutAttempt(state, env, envelope, execute, now = Date.now) {
  if (!SHOP_BRANDS[envelope?.shop] || !/^[a-f0-9]{64}$/.test(envelope?.key_hash || "")
    || !/^[a-f0-9]{64}$/.test(envelope?.subject_hash || "")) return reply({ ok: false, error: "invalid_checkout_envelope" }, 400);
  const shop = SHOP_BRANDS[envelope.shop];
  const body = envelope.request_body;
  if (!body || typeof body !== "object" || !KEY_PATTERN.test(body.checkout_request_id || "")
    || await digest(body.checkout_request_id) !== envelope.key_hash)
    return reply({ ok: false, error: "invalid_checkout_envelope" }, 400);
  const recovering = body.recover === true;
  const fingerprint = recovering ? null : await checkoutFingerprint(body, shop.key);
  const claim = await state.blockConcurrencyWhile(async () => {
    const previous = await state.storage.get(RECORD);
    if (previous) {
      if (previous.shop !== shop.key || previous.key_hash !== envelope.key_hash || previous.subject_hash !== envelope.subject_hash)
        return { response: reply({ ok: false, error: "checkout_context_conflict", safe_new_attempt: false }, 409) };
      if (!recovering && previous.fingerprint !== fingerprint)
        return { response: reply({ ok: false, error: "checkout_request_conflict", order_id: previous.order_id, safe_new_attempt: false }, 409) };
      if (now() - previous.started_at > RETENTION_MS) {
        // Keep a non-secret tombstone permanently: expiration must never make the same key executable again.
        const tombstone = { ...previous, state: "expired", response: null };
        await state.storage.put(RECORD, tombstone);
        return { response: reply({ ok: false, error: "checkout_attempt_expired", order_id: previous.order_id, safe_new_attempt: false }, 409) };
      }
      if (previous.response) {
        const payload = previous.response.body;
        const expiry = Date.parse(payload?.reservation?.expires_at || "");
        if (payload.ok && Number.isFinite(expiry) && expiry <= now())
          return { response: reply({ ok: false, error: "checkout_recovery_required", order_id: previous.order_id, safe_new_attempt: false }, 409) };
        return { response: reply({ ...payload, idempotent: true, checkout_replayed: true }, previous.response.status) };
      }
      const stale = now() - previous.started_at > 120000;
      return { response: reply({ ok: false, error: stale ? "checkout_recovery_required" : "checkout_in_progress",
        order_id: previous.order_id, safe_new_attempt: false, retry_same_request: !stale }, stale ? 409 : 202) };
    }
    if (recovering) return { response: reply({ ok: false, error: "checkout_attempt_not_received", retry_same_request: true, safe_new_attempt: false }, 404) };
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now())).replace(/-/g, "");
    const record = { version: 1, shop: shop.key, key_hash: envelope.key_hash, subject_hash: envelope.subject_hash,
      fingerprint, state: "running", started_at: now(), order_id: `${shop.orderPrefix}-${date}-${envelope.key_hash.slice(0, 24).toUpperCase()}` };
    await state.storage.put(RECORD, record);
    if (state.storage.setAlarm) await state.storage.setAlarm(record.started_at + RETENTION_MS);
    return { record };
  });
  if (claim.response) return claim.response;
  const record = claim.record;
  try {
    const request = new Request(`https://mmdbkk.com${shop.path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const response = await execute(request, env, state, {
      orderId: record.order_id, memberContext: envelope.member_context || null,
    });
    const payload = await response.json();
    if (!payload || typeof payload.ok !== "boolean") throw new Error("invalid_checkout_reply");
    const terminal = { ...payload, checkout_request_id: body.checkout_request_id, idempotent: false };
    await state.storage.put(RECORD, { ...record, state: payload.ok ? "completed" : payload.safe_new_attempt ? "rejected" : "held",
      response: { status: response.status, body: terminal } });
    return reply(terminal, response.status);
  } catch {
    // Do not rerun after crashes, lost acknowledgements or storage failures. The deterministic order reference is recoverable by an operator.
    return reply({ ok: false, error: "checkout_recovery_required", order_id: record.order_id, safe_new_attempt: false }, 503);
  }
}

/** Remove cached signed URLs after the replay window; keep the anti-reuse tombstone. */
export async function expireCheckoutAttempt(state, now = Date.now) {
  const record = await state.storage.get(RECORD);
  if (!record) return;
  if (now() < record.started_at + RETENTION_MS) {
    if (state.storage.setAlarm) await state.storage.setAlarm(record.started_at + RETENTION_MS);
    return;
  }
  await state.storage.put(RECORD, { ...record, state: "expired", response: null });
}
