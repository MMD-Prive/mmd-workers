const RECEIPT_SCHEMA = "mmd.kenji_line_conversation_shadow_receipt.v1";
const RECEIPT_KEY = "latest";
const RECEIPT_PATH = "/__internal/kenji/conversation-shadow-receipt";
const RECEIPT_DO_RECORD_PATH = "/record";
const RECEIPT_DO_LATEST_PATH = "/latest";
const RECEIPT_DO_NAME = "kenji-conversation-shadow-receipt-v1";
const RECEIPT_TIMEOUT_MS = 800;

function text(value, max = 80) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value, 16).toLowerCase());
}

function count(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? Math.min(number, 100) : 0;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private, max-age=0",
    },
  });
}

function safeReceipt(result = {}, now = new Date()) {
  const observed = count(result.observed);
  const succeeded = Math.min(observed, count(result.succeeded));
  const observedSuccessfully = result.ok === true || text(result.status, 32) === "shadow_observed";
  return {
    schema: RECEIPT_SCHEMA,
    receipt_id: `ksr_${now.getTime().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
    observed_at: now.toISOString(),
    status: observedSuccessfully && observed > 0 && succeeded === observed ? "shadow_observed" : "shadow_degraded",
    events: count(result.events),
    observed,
    succeeded,
    evidence_incomplete: count(result.evidence_incomplete),
    memory_used: count(result.memory_used),
    review_required: count(result.review_required),
    shadow_only: true,
    customer_copy_changed: false,
    reply_transport_muted: true,
  };
}

function hasAdminServiceBinding(request) {
  return text(request?.headers?.get?.("x-mmd-internal-call"), 16).toLowerCase() === "true"
    && text(request?.headers?.get?.("x-mmd-service-binding"), 40) === "admin-worker";
}

async function fetchReceiptStub(binding, path, init = {}) {
  if (!binding?.idFromName || !binding?.get) throw new Error("shadow_receipt_binding_missing");
  const id = binding.idFromName(RECEIPT_DO_NAME);
  return binding.get(id).fetch(new Request(`https://kenji-shadow-receipt.internal${path}`, init));
}

export async function recordKenjiConversationShadowReceipt(env = {}, result = {}) {
  if (!env.KENJI_SHADOW_RECEIPT) return { ok: false, reason: "shadow_receipt_binding_missing" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("shadow_receipt_timeout"), RECEIPT_TIMEOUT_MS);
  try {
    const response = await fetchReceiptStub(env.KENJI_SHADOW_RECEIPT, RECEIPT_DO_RECORD_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(safeReceipt(result)),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok && payload?.ok === true, status: response.status, receipt_id: text(payload?.receipt?.receipt_id, 64) };
  } catch (_) {
    return { ok: false, reason: "shadow_receipt_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleKenjiConversationShadowReceipt(request, env = {}) {
  if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!hasAdminServiceBinding(request)) return json({ ok: false, error: "internal_auth_required" }, 401);
  try {
    const response = await fetchReceiptStub(env.KENJI_SHADOW_RECEIPT, RECEIPT_DO_LATEST_PATH, { method: "GET" });
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") return json({ ok: false, error: "shadow_receipt_unavailable" }, 502);
    return json(payload, response.status);
  } catch (_) {
    return json({ ok: false, error: "shadow_receipt_unavailable" }, 502);
  }
}

export class KenjiShadowReceipt {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === RECEIPT_DO_LATEST_PATH) {
      const receipt = await this.state.storage.get(RECEIPT_KEY);
      return json({ ok: true, schema: RECEIPT_SCHEMA, receipt: receipt || null, available: Boolean(receipt) });
    }
    if (request.method !== "POST" || path !== RECEIPT_DO_RECORD_PATH) return json({ ok: false, error: "not_found" }, 404);
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ ok: false, error: "invalid_receipt" }, 400);
    const receipt = safeReceipt(input, new Date());
    await this.state.storage.put(RECEIPT_KEY, receipt);
    return json({ ok: true, schema: RECEIPT_SCHEMA, receipt });
  }
}

export const KENJI_CONVERSATION_SHADOW_RECEIPT_INTERNALS = Object.freeze({
  RECEIPT_SCHEMA,
  RECEIPT_PATH,
  safeReceipt,
  hasAdminServiceBinding,
});
