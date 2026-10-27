var __defProp = Object.defineProperty;
var __name = (target, value3) => __defProp(target, "name", { value: value3, configurable: true });

// kbank-sandbox.mjs
var KBANK_SMOKE_PATH = "/v1/internal/payments/kbank/sandbox/smoke";
var KBANK_STATUS_PATH = "/v1/internal/payments/kbank/sandbox/status";
var TOKEN_URL = "https://openapi-sandbox.kasikornbank.com/v2/oauth/token";
var OAUTH_ERROR_CODES = /* @__PURE__ */ new Set(["invalid_client", "unauthorized_client", "invalid_request", "invalid_grant", "unsupported_grant_type", "invalid_scope", "server_error", "temporarily_unavailable"]);
var MAX_BANK_RESPONSE_BYTES = 16 * 1024;
var BANK_RESPONSE_MEDIA_TYPES = /* @__PURE__ */ new Set(["json", "html", "text", "other", "missing"]);
var BANK_RESPONSE_BODY_SHAPES = /* @__PURE__ */ new Set(["json_object", "json_array", "json_scalar", "empty", "non_json", "size_limited"]);
var BANK_ERROR_SHAPES = /* @__PURE__ */ new Set(["oauth_error", "kbank_error_code", "gateway_fault_detail", "openapi_code_message", "none"]);
var OPENAPI_REASONS = /* @__PURE__ */ new Map([["Invalid ApiKey for given resource", "api_key_resource_mismatch"], ["Invalid API Key", "invalid_api_key"], ["Invalid API call as no apiproduct match found", "api_product_not_matched"], ["Invalid Consumer Secret", "invalid_consumer_secret"], ["Invalid Request Format", "invalid_request_format"], ["OAuth 2.0 Token Generate Error", "oauth_token_generation_failed"], ["Invalid Access Token", "invalid_access_token"], ["Access Token expired", "access_token_expired"], ["Access Token not approved", "access_token_not_approved"]]);
function openapiCategory(data) {
  return data?.code === "openapi_error" && typeof data?.message === "string" && data.message.length <= 200 ? OPENAPI_REASONS.get(data.message.trim()) : void 0;
}
__name(openapiCategory, "openapiCategory");
function safeOauthError(data) {
  const candidates = [data?.error, data?.ErrorCode, data?.fault?.detail?.errorcode];
  for (const code15 of candidates) {
    if (typeof code15 !== "string") continue;
    if (OAUTH_ERROR_CODES.has(code15)) return code15;
    if (["oauth.v2.InvalidClientIdentifier", "steps.oauth.v2.invalid_client", "steps.oauth.v2.invalid_client-invalid_client_id"].includes(code15)) return "invalid_client";
  }
  return null;
}
__name(safeOauthError, "safeOauthError");
function bankResponseMediaType(contentType) {
  if (contentType == null || !contentType.trim()) return "missing";
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mime === "application/json" || mime.endsWith("+json")) return "json";
  if (mime === "text/html" || mime === "application/xhtml+xml") return "html";
  if (mime.startsWith("text/")) return "text";
  return "other";
}
__name(bankResponseMediaType, "bankResponseMediaType");
function bankErrorShape(data) {
  const candidates = [
    [data?.error, "oauth_error"],
    [data?.ErrorCode, "kbank_error_code"],
    [data?.fault?.detail?.errorcode, "gateway_fault_detail"]
  ];
  for (const [code15, shape] of candidates) {
    if (typeof code15 === "string" && safeOauthError({ error: code15 })) return shape;
  }
  if (typeof data?.code === "string" && typeof data?.message === "string") return "openapi_code_message";
  for (const [code15, shape] of candidates) if (typeof code15 === "string") return shape;
  return "none";
}
__name(bankErrorShape, "bankErrorShape");
async function readBoundedBankBody(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  let truncated = false;
  try {
    while (true) {
      const { value: value3, done } = await reader.read();
      if (done) break;
      const remaining = MAX_BANK_RESPONSE_BYTES - length;
      if (value3.byteLength > remaining) {
        if (remaining > 0) {
          chunks.push(value3.subarray(0, remaining));
          length += remaining;
        }
        truncated = true;
        await reader.cancel().catch(() => {
        });
        break;
      }
      chunks.push(value3);
      length += value3.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), truncated };
}
__name(readBoundedBankBody, "readBoundedBankBody");
async function inspectBankResponse(response) {
  const mediaType = bankResponseMediaType(response.headers.get("content-type"));
  const body = await readBoundedBankBody(response);
  const text17 = typeof body === "string" ? body : body.text;
  let data = null;
  let bodyShape = typeof body === "string" || !body.truncated ? "empty" : "size_limited";
  if (text17.trim()) {
    bodyShape = typeof body === "string" || !body.truncated ? "non_json" : "size_limited";
    if (typeof body === "string" || !body.truncated) {
      try {
        data = JSON.parse(text17);
        bodyShape = data === null || typeof data !== "object" ? "json_scalar" : Array.isArray(data) ? "json_array" : "json_object";
      } catch {
      }
    }
  }
  const errorShape = bankErrorShape(data);
  const oauthError = safeOauthError(data);
  return {
    data,
    bank_response_media_type: BANK_RESPONSE_MEDIA_TYPES.has(mediaType) ? mediaType : "other",
    bank_response_body_shape: BANK_RESPONSE_BODY_SHAPES.has(bodyShape) ? bodyShape : "non_json",
    bank_error_shape: BANK_ERROR_SHAPES.has(errorShape) ? errorShape : "none",
    bank_error_code_recognized: oauthError !== null || data?.code === "openapi_error",
    ...openapiCategory(data) ? { bank_error_category: openapiCategory(data) } : {}
  };
}
__name(inspectBankResponse, "inspectBankResponse");
var WINDOW_MS = 30 * 60 * 1e3;
var reply = /* @__PURE__ */ __name((data, status = 200) => Response.json({ environment: "sandbox", ...data }, {
  status,
  headers: { "cache-control": "no-store, private" }
}), "reply");
async function handleKbankSandbox(request2, env) {
  const path = new URL(request2.url).pathname;
  if (path !== KBANK_SMOKE_PATH && path !== KBANK_STATUS_PATH) return null;
  if (request2.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  const expected = env.AUTH_SERVICE_ADMIN_TO_PAYMENTS;
  const supplied = request2.headers.get("x-internal-token") || request2.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!expected || !supplied || supplied !== expected) return reply({ ok: false, error: "service_auth_required" }, 401);
  if (path === KBANK_STATUS_PATH) {
    const checks = { enabled: env.KBANK_SANDBOX_ENABLED === "true", consumer_id_present: Boolean(env.KBANK_SANDBOX_CONSUMER_ID), consumer_secret_present: Boolean(env.KBANK_SANDBOX_CONSUMER_SECRET), coordinator_present: Boolean(env.KBANK_SANDBOX_COORDINATOR) };
    let cooldown = { known: false };
    if (Object.values(checks).every(Boolean)) {
      try {
        const stub2 = env.KBANK_SANDBOX_COORDINATOR.get(env.KBANK_SANDBOX_COORDINATOR.idFromName("oauth-smoke-v1"));
        const result3 = await stub2.fetch(new Request("https://kbank-coordinator/status", { method: "POST" }));
        const data = await result3.json();
        if (result3.ok && data.environment === "sandbox" && data.bank_called === false) cooldown = data.cooldown || cooldown;
      } catch {
      }
    }
    return reply({ ok: true, ready: Object.values(checks).every(Boolean) && cooldown.known === true && cooldown.retry_after_seconds === 0, checks, cooldown, bank_called: false, transfers_enabled: false });
  }
  if (env.KBANK_SANDBOX_ENABLED !== "true") return reply({ ok: false, error: "sandbox_disabled" }, 503);
  if (!env.KBANK_SANDBOX_CONSUMER_ID || !env.KBANK_SANDBOX_CONSUMER_SECRET || !env.KBANK_SANDBOX_COORDINATOR) {
    return reply({ ok: false, error: "sandbox_not_configured" }, 503);
  }
  const stub = env.KBANK_SANDBOX_COORDINATOR.get(env.KBANK_SANDBOX_COORDINATOR.idFromName("oauth-smoke-v1"));
  return stub.fetch(new Request("https://kbank-coordinator/smoke", { method: "POST" }));
}
__name(handleKbankSandbox, "handleKbankSandbox");
var KbankSandboxCoordinator = class {
  static {
    __name(this, "KbankSandboxCoordinator");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.pending = null;
  }
  async fetch(request2) {
    const path = new URL(request2.url).pathname;
    if (request2.method !== "POST" || !["/smoke", "/status"].includes(path)) return reply({ ok: false, error: "not_found" }, 404);
    if (path === "/status") {
      if (this.pending) return reply({ ok: true, cooldown: { known: false }, bank_called: false, transfers_enabled: false });
      const previous = await this.state.storage.get("attempt"), now = Date.now();
      const valid = !previous || Number.isSafeInteger(previous.nextAttemptAt) && previous.nextAttemptAt >= WINDOW_MS && previous.nextAttemptAt <= now + WINDOW_MS + 1e3 && typeof previous.success === "boolean";
      const cooldown = !valid ? { known: false } : {
        known: true,
        retry_after_seconds: previous ? Math.max(0, Math.ceil((previous.nextAttemptAt - now) / 1e3)) : 0,
        last_attempt_at: previous ? previous.nextAttemptAt - WINDOW_MS : null,
        next_attempt_at: previous ? previous.nextAttemptAt : null,
        last_success: previous ? previous.success : null
      };
      return reply({ ok: true, cooldown, bank_called: false, transfers_enabled: false });
    }
    if (this.env.KBANK_SANDBOX_ENABLED !== "true") return reply({ ok: false, error: "sandbox_disabled" }, 503);
    if (!this.env.KBANK_SANDBOX_CONSUMER_ID || !this.env.KBANK_SANDBOX_CONSUMER_SECRET) return reply({ ok: false, error: "sandbox_not_configured" }, 503);
    if (!this.pending) this.pending = this.run().finally(() => {
      this.pending = null;
    });
    return (await this.pending).clone();
  }
  async run() {
    const now = Date.now();
    const previous = await this.state.storage.get("attempt");
    if (previous && now < previous.nextAttemptAt) {
      return reply({ ok: false, error: "oauth_smoke_cooldown", retry_after_seconds: Math.ceil((previous.nextAttemptAt - now) / 1e3), last_success: previous.success === true }, 429);
    }
    await this.state.storage.put("attempt", { nextAttemptAt: now + WINDOW_MS, success: false });
    try {
      const bytes = new TextEncoder().encode(`${this.env.KBANK_SANDBOX_CONSUMER_ID}:${this.env.KBANK_SANDBOX_CONSUMER_SECRET}`);
      const basic = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
      const response = await fetch(TOKEN_URL, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(15e3),
        headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded", "x-test-mode": "true", "env-id": "OAUTH2" },
        body: new URLSearchParams({ grant_type: "client_credentials" }).toString()
      });
      const inspection = await inspectBankResponse(response);
      const { data, bank_response_media_type, bank_response_body_shape, bank_error_shape, bank_error_code_recognized, bank_error_category } = inspection;
      const expires = Number(data?.expires_in);
      if (!response.ok || typeof data?.access_token !== "string" || !data.access_token || String(data.token_type).toLowerCase() !== "bearer" || !Number.isFinite(expires) || expires <= 0) {
        const oauthError = safeOauthError(data);
        return reply({
          ok: false,
          error: "kbank_oauth_failed",
          upstream_status: response.status,
          bank_response_media_type,
          bank_response_body_shape,
          bank_error_shape,
          bank_error_code_recognized,
          ...oauthError ? { oauth_error: oauthError } : {},
          ...bank_error_category ? { bank_error_category } : {}
        }, 502);
      }
      await this.state.storage.put("attempt", { nextAttemptAt: now + WINDOW_MS, success: true });
      return reply({ ok: true, oauth: "connected", expires_in: expires, transfers_enabled: false });
    } catch {
      return reply({ ok: false, error: "kbank_oauth_unavailable" }, 502);
    }
  }
};

// verified-session-balance.js
var BALANCE_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  total: "fldhwC79ndbnEXSZz",
  sessionStatus: "fldmwuvOaiCFdzzRa",
  paidSum: "fldAdtXEaedGdfOKc",
  customerDue: "fldvJowquu8RrsOMc",
  ref: "fldOO6SY49iDw8VBZ",
  paymentSession: "fld2wdhBvc8xrV6y5",
  amount: "fldvCSwrUW8OMAooS",
  verification: "fldJ7a0Ube9F0bmRy",
  status: "fldEJ1hmm7KwWuI6q",
  intent: "fld04fr3bRJTohO6y",
  stage: "fldrr9g8ZZjqAbdKQ",
  type: "fldydUWHhqVLMkNSC",
  transaction: "fldHUvPn5CxK9i1Mq",
  provider: "fldJNMenT0woUXbKG"
});
var F = BALANCE_FIELDS;
var VERIFIED = /* @__PURE__ */ new Set(["verified", "approved", "official_verified"]);
var REVERSED = /* @__PURE__ */ new Set(["refunded", "reversed", "chargeback", "disputed"]);
var VOID = /* @__PURE__ */ new Set(["cancelled", "canceled", "void", "failed", "rejected"]);
var EXCLUDED = /* @__PURE__ */ new Set(["tips", "tip", "membership", "renewal", "extension", "shop"]);
function balanceError(code15, status = 409) {
  return Object.assign(new Error(code15), { status });
}
__name(balanceError, "balanceError");
function text(value3) {
  return String(value3?.name ?? value3 ?? "").trim();
}
__name(text, "text");
function code(value3) {
  return text(value3).toLowerCase().replace(/[\s-]+/g, "_");
}
__name(code, "code");
function value(fields2, configured, id, name) {
  return fields2[configured || id] ?? fields2[id] ?? fields2[name];
}
__name(value, "value");
function cents(value3, allowZero = true) {
  if (value3 === null || value3 === void 0 || text(value3) === "") throw balanceError("balance_amount_missing");
  const n = Number(value3);
  const result3 = Math.round(n * 100);
  if (!Number.isFinite(n) || !Number.isSafeInteger(result3) || result3 < (allowZero ? 0 : 1) || Math.abs(n * 100 - result3) > 1e-5) throw balanceError("balance_amount_invalid");
  return result3;
}
__name(cents, "cents");
function balancePayment(record, env = {}) {
  const f = record?.fields || {};
  let stage2 = code(value(f, env.AT_PAYMENTS__PAYMENT_STAGE, F.stage, "payment_stage") || value(f, env.AT_PAYMENTS__PAYMENT_TYPE, F.type, "payment_type"));
  if (["balance", "remaining", "remainder", "finalpayment", "\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D"].includes(stage2)) stage2 = "final";
  if (stage2 === "\u0E21\u0E31\u0E14\u0E08\u0E33") stage2 = "deposit";
  if (["fullpayment", "payinfull"].includes(stage2)) stage2 = "full";
  const verification = code(value(f, env.AT_PAYMENTS__VERIFICATION_STATUS, F.verification, "Verification Status"));
  const status = code(value(f, env.AT_PAYMENTS__PAYMENT_STATUS, F.status, "Payment Status"));
  return {
    id: text(record?.id),
    ref: text(value(f, env.AT_PAYMENTS__PAYMENT_REF, F.ref, "Payment Reference")),
    sessionId: text(value(f, env.AT_PAYMENTS__SESSION_ID, F.paymentSession, "session_id")),
    amount: value(f, env.AT_PAYMENTS__AMOUNT, F.amount, "Amount"),
    stage: stage2,
    verification,
    status,
    intent: code(value(f, env.AT_PAYMENTS__PAYMENT_INTENT_STATUS, F.intent, "Payment Intent Status")),
    verified: VERIFIED.has(verification) && !VOID.has(status) && !REVERSED.has(status),
    reversed: REVERSED.has(status) || REVERSED.has(verification),
    transaction: text(f[F.transaction] ?? f.provider_txn_id),
    provider: code(f[F.provider] ?? f.provider)
  };
}
__name(balancePayment, "balancePayment");
function shouldResolveCustomerBalance(record, env = {}) {
  const p = balancePayment(record, env);
  return ["final", "balance"].includes(p.stage) || p.stage === "deposit" && (p.verified || p.reversed);
}
__name(shouldResolveCustomerBalance, "shouldResolveCustomerBalance");
function calculateVerifiedSessionBalance(session, records, env = {}) {
  const fields2 = session?.fields || {};
  const sessionId = text(value(fields2, env.AT_SESSIONS__SESSION_ID, F.sessionId, "session_id"));
  if (!sessionId || !session?.id) throw balanceError("balance_session_missing");
  const state = code(fields2[F.sessionStatus] ?? fields2["Session Status"]);
  if (VOID.has(state) || REVERSED.has(state)) throw balanceError("balance_session_not_payable");
  const total = cents(value(fields2, env.AT_SESSIONS__AMOUNT_THB, F.total, "amount_thb"), false);
  if (!Array.isArray(records)) throw balanceError("balance_ledger_unavailable", 503);
  let received = 0, deposit = 0;
  const seenIds = /* @__PURE__ */ new Map(), seenRefs = /* @__PURE__ */ new Set(), seenTransactions = /* @__PURE__ */ new Set();
  const normalized3 = [];
  for (const record of records) {
    const p = balancePayment(record, env);
    if (p.sessionId !== sessionId) throw balanceError("balance_payment_session_mismatch");
    const fingerprint = JSON.stringify(p);
    if (seenIds.has(p.id)) {
      if (seenIds.get(p.id) !== fingerprint) throw balanceError("balance_ledger_changed");
      continue;
    }
    if (!p.id || !p.ref) throw balanceError("balance_payment_identity_missing");
    seenIds.set(p.id, fingerprint);
    normalized3.push({ record, ...p });
    if (EXCLUDED.has(p.stage)) continue;
    if (p.reversed) throw balanceError("balance_refund_review_required");
    if (!p.verified) continue;
    if (!["deposit", "full", "final"].includes(p.stage)) throw balanceError("balance_stage_review_required");
    if (seenRefs.has(p.ref)) throw balanceError("balance_duplicate_verified_reference");
    seenRefs.add(p.ref);
    if (p.transaction) {
      const key = p.provider + ":" + p.transaction;
      if (seenTransactions.has(key)) throw balanceError("balance_duplicate_verified_transaction");
      seenTransactions.add(key);
    }
    const amount3 = cents(p.amount, false);
    received += amount3;
    if (!Number.isSafeInteger(received)) throw balanceError("balance_amount_invalid");
    if (p.stage === "deposit") deposit += amount3;
  }
  return {
    session_id: sessionId,
    total_amount_thb: total / 100,
    verified_paid_thb: received / 100,
    verified_deposit_thb: deposit / 100,
    remaining_amount_thb: Math.max(0, total - received) / 100,
    overpaid_amount_thb: Math.max(0, received - total) / 100,
    records: normalized3
  };
}
__name(calculateVerifiedSessionBalance, "calculateVerifiedSessionBalance");
async function readVerifiedSessionBalance(env, session) {
  const fields2 = session?.fields || {};
  const sessionId = text(value(fields2, env.AT_SESSIONS__SESSION_ID, F.sessionId, "session_id"));
  if (!sessionId) throw balanceError("balance_session_missing");
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) throw balanceError("airtable_not_ready", 503);
  const table7 = env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ";
  const url = new URL("https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" + encodeURIComponent(table7));
  const escaped = sessionId.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  url.searchParams.set("filterByFormula", "{session_id}='" + escaped + "'");
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("pageSize", "100");
  const rows2 = [], offsets = /* @__PURE__ */ new Set();
  for (let page = 0; page < 50; page += 1) {
    const req = new Request(url, { method: "GET", headers: { authorization: "Bearer " + env.AIRTABLE_API_KEY, accept: "application/json" } });
    const res = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
    if (!res.ok) throw balanceError("balance_ledger_unavailable", 503);
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data?.records)) throw balanceError("balance_ledger_unavailable", 503);
    rows2.push(...data.records);
    if (!data.offset) return calculateVerifiedSessionBalance(session, rows2, env);
    if (typeof data.offset !== "string" || offsets.has(data.offset)) throw balanceError("balance_ledger_pagination_invalid", 503);
    offsets.add(data.offset);
    url.searchParams.set("offset", data.offset);
  }
  throw balanceError("balance_ledger_incomplete", 503);
}
__name(readVerifiedSessionBalance, "readVerifiedSessionBalance");
function customerBalanceProjection(summary2, activeRecord, finalRef, env = {}) {
  const current = balancePayment(activeRecord, env);
  const anchor = summary2.records.find((p) => p.id === current.id && p.ref === current.ref);
  if (!anchor || anchor.verified !== current.verified || String(anchor.amount) !== String(current.amount)) throw balanceError("balance_ledger_changed");
  const finals = summary2.records.filter((p) => p.ref === finalRef);
  if (finals.length > 1) throw balanceError("final_payment_ref_ambiguous");
  const final = finals[0];
  if (final && final.stage !== "final") throw balanceError("final_payment_stage_mismatch");
  if (final?.reversed || final && VOID.has(final.status)) throw balanceError("final_payment_not_payable");
  if (final?.verified && summary2.remaining_amount_thb > 0) throw balanceError("balance_after_final_review_required");
  if (final && !final.verified && final.amount != null && text(final.amount) !== "" && cents(final.amount) !== cents(summary2.remaining_amount_thb)) throw balanceError("final_payment_amount_mismatch");
  if (summary2.remaining_amount_thb > 0 && summary2.verified_deposit_thb <= 0) throw balanceError("verified_deposit_required");
  const useFinal = summary2.remaining_amount_thb > 0 || current.stage === "final";
  const activeRef = useFinal ? finalRef : current.ref;
  const paymentRecord = useFinal ? final?.record || { fields: {
    [F.ref]: finalRef,
    [F.paymentSession]: summary2.session_id,
    [F.stage]: "final",
    [F.amount]: summary2.remaining_amount_thb,
    [F.status]: "Pending",
    [F.verification]: "pending_review",
    [F.intent]: "Pending Confirmation"
  } } : activeRecord;
  return {
    payment_ref: activeRef,
    payment_type: useFinal ? "final" : current.stage,
    paymentRecord,
    verified: useFinal ? Boolean(final?.verified) : current.verified,
    amount_due_thb: summary2.remaining_amount_thb,
    summary: {
      schema: "verified_session_balance_v1",
      total_amount_thb: summary2.total_amount_thb,
      verified_paid_thb: summary2.verified_paid_thb,
      verified_deposit_thb: summary2.verified_deposit_thb,
      remaining_amount_thb: summary2.remaining_amount_thb
    }
  };
}
__name(customerBalanceProjection, "customerBalanceProjection");

// session-paid-projection.js
var text2 = /* @__PURE__ */ __name((value3) => String(value3?.name ?? value3 ?? "").trim(), "text");
var code2 = /* @__PURE__ */ __name((value3) => text2(value3).toLowerCase(), "code");
var ids = /* @__PURE__ */ __name((value3) => Array.isArray(value3) ? value3.map((v) => text2(v?.id ?? v)).sort() : [], "ids");
var serviceStages = /* @__PURE__ */ new Set(["deposit", "final", "full"]);
var laneFields = ["fldzYGziqLqTQaoaK", "model_work_lane", "fldxo2T68yebcpGkw", "session_type_raw", "fldr4t9Cz58oCU96A", "Session Type", "fldjK3U9bghnj7xUe", "job_type"];
var excluded = /* @__PURE__ */ __name((value3) => /mms|massage|membership|renewal|shop|historical/i.test(text2(value3)), "excluded");
var mmdLanes = /* @__PURE__ */ new Set(["pn", "vip", "svip", "public", "private", "public_model", "private_model"]);
var clientIds = /* @__PURE__ */ __name((f) => ids(f.fld6P6if0vDZCeV0C ?? f.Client ?? f.client), "clientIds");
var quote = /* @__PURE__ */ __name((value3) => text2(value3).replace(/\\/g, "\\\\").replace(/'/g, "\\'"), "quote");
var sidOf = /* @__PURE__ */ __name((f) => text2(f[BALANCE_FIELDS.sessionId] ?? f.session_id), "sidOf");
var table = /* @__PURE__ */ __name((env) => env.AIRTABLE_TABLE_SESSIONS || env.AIRTABLE_TABLE_SESSIONS_ID || "tblC98mKWbzmPuNzX", "table");
var validSid = /* @__PURE__ */ __name((value3) => /^sess[-_][A-Za-z0-9_-]{1,210}$/.test(text2(value3)), "validSid");
var result = /* @__PURE__ */ __name((status, reason, extra = {}) => ({ status, ...reason ? { reason } : {}, payment_truth_changed: false, ...extra }), "result");
var fail = /* @__PURE__ */ __name((message, transient = false) => {
  throw Object.assign(new Error(message), { transient });
}, "fail");
function sessionProjectionScope(session) {
  const f = session?.fields || {}, lanes = laneFields.map((k) => code2(f[k])).filter(Boolean);
  if (lanes.some(excluded)) return "excluded";
  if (!lanes.some((v) => mmdLanes.has(v))) return "unknown";
  return "mmd";
}
__name(sessionProjectionScope, "sessionProjectionScope");
async function requestSessionPaidProjection(env, { session_id, stage: stage2, payment_ref = "" } = {}) {
  if (!serviceStages.has(code2(stage2)) || !validSid(session_id)) return result("skipped", "non_service_payment");
  if (!env.SESSION_PAID_PROJECTION_COORDINATOR) return result("not_configured", "projection_coordinator_missing");
  try {
    const ns = env.SESSION_PAID_PROJECTION_COORDINATOR;
    const stub = ns.get(ns.idFromName(`session:${session_id}`));
    const response = await stub.fetch("https://session-paid-projection.internal/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id, payment_ref: text2(payment_ref) })
    });
    const payload = await response.json();
    if (!response.ok || !payload?.status) throw Error("projection_dispatch_failed");
    return payload;
  } catch {
    return result("retry_required", "projection_dispatch_failed");
  }
}
__name(requestSessionPaidProjection, "requestSessionPaidProjection");
function boundedEnv(env) {
  const deadline = Date.now() + 12e3;
  return { ...env, AIRTABLE_HTTP: { async fetch(input) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) fail("projection_lookup_timeout", true);
    const req = new Request(input, { signal: AbortSignal.timeout(Math.min(remaining, 4e3)) });
    return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(req) : fetch(req);
  } } };
}
__name(boundedEnv, "boundedEnv");
async function request(env, url, init = {}) {
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) fail("projection_airtable_not_ready", true);
  let response;
  try {
    response = await env.AIRTABLE_HTTP.fetch(new Request(url, { ...init, headers: {
      authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "content-type": "application/json",
      ...init.headers
    } }));
  } catch {
    fail("projection_lookup_unavailable", true);
  }
  if (!response.ok) fail("projection_airtable_failed", response.status === 429 || response.status >= 500);
  const data = await response.json().catch(() => null);
  if (!data) fail("projection_response_invalid", true);
  return data;
}
__name(request, "request");
function urlFor(env, recordId3 = "") {
  return new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table(env))}${recordId3 ? "/" + encodeURIComponent(recordId3) : ""}`);
}
__name(urlFor, "urlFor");
async function sessionFor(env, sessionId) {
  const url = urlFor(env);
  url.searchParams.set("filterByFormula", `{session_id}='${quote(sessionId)}'`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("pageSize", "2");
  const data = await request(env, url);
  if (data.offset || !Array.isArray(data.records) || data.records.length !== 1) fail("projection_session_not_unique");
  const s = data.records[0];
  if (!s.id || sidOf(s.fields || {}) !== sessionId) fail("projection_session_identity_conflict");
  return s;
}
__name(sessionFor, "sessionFor");
function snapshot(session, summary2) {
  const f = session.fields || {};
  return JSON.stringify({
    id: session.id,
    sid: summary2.session_id,
    clients: clientIds(f),
    lane: laneFields.map((k) => code2(f[k])),
    total: summary2.total_amount_thb,
    state: code2(f[BALANCE_FIELDS.sessionStatus] ?? f["Session Status"]),
    ledger: summary2.records.map(({ record, ...p }) => ({
      ...p,
      clients: ids(record.fields?.fldcrLuJijj7xr0y8 ?? record.fields?.Client ?? record.fields?.client),
      lane: code2(record.fields?.fldB16bQWf4sVt7Ep ?? record.fields?.model_work_lane)
    })).sort((a, b) => a.id.localeCompare(b.id))
  });
}
__name(snapshot, "snapshot");
async function readSnapshot(env, sessionId, anchor) {
  const session = await sessionFor(env, sessionId);
  const scope = sessionProjectionScope(session);
  if (scope !== "mmd") return { skipped: result("skipped", scope === "excluded" ? "excluded_lane" : "unknown_job_lane") };
  if (/^(?:cancelled|canceled|rejected|void|refunded|reversed)(?:_|$)/.test(code2(session.fields[BALANCE_FIELDS.sessionStatus] ?? session.fields["Session Status"]))) fail("projection_session_not_payable");
  const clients = clientIds(session.fields);
  if (clients.length !== 1) fail("projection_client_not_unique");
  let summary2;
  try {
    summary2 = await readVerifiedSessionBalance(env, session);
  } catch (e) {
    const known = /^balance_[a-z0-9_]+$/.test(text2(e.message));
    fail(known ? text2(e.message) : "projection_ledger_unavailable", !known || Number(e.status) >= 500);
  }
  for (const p of summary2.records) {
    const f = p.record.fields || {}, clientsOnPayment = ids(f.fldcrLuJijj7xr0y8 ?? f.Client ?? f.client);
    if (excluded(f.fldB16bQWf4sVt7Ep ?? f.model_work_lane)) fail("projection_payment_lane_conflict");
    if (clientsOnPayment.length && (clientsOnPayment.length !== 1 || clientsOnPayment[0] !== clients[0])) fail("projection_payment_client_conflict");
  }
  if (anchor && !summary2.records.some((p) => p.ref === anchor && p.verified && serviceStages.has(p.stage))) fail("projection_verified_anchor_missing");
  return { session, summary: summary2, fingerprint: snapshot(session, summary2) };
}
__name(readSnapshot, "readSnapshot");
async function reconcile(env, task) {
  env = boundedEnv(env);
  const first2 = await readSnapshot(env, task.session_id, task.payment_ref);
  if (first2.skipped) return first2.skipped;
  const fresh = await readSnapshot(env, task.session_id, task.payment_ref);
  if (fresh.skipped || fresh.fingerprint !== first2.fingerprint) fail("projection_snapshot_changed", true);
  const sum = fresh.summary.verified_paid_thb;
  const old = fresh.session.fields[BALANCE_FIELDS.paidSum] ?? fresh.session.fields.paid_received_sum;
  let changed = false;
  if (old === null || old === void 0 || Number(old) !== sum) {
    const url = urlFor(env, fresh.session.id);
    url.searchParams.set("returnFieldsByFieldId", "true");
    await request(env, url, { method: "PATCH", body: JSON.stringify({ fields: { [BALANCE_FIELDS.paidSum]: sum }, typecast: false }) });
    changed = true;
  }
  const after = await readSnapshot(env, task.session_id, task.payment_ref);
  if (after.skipped || after.fingerprint !== fresh.fingerprint) fail("projection_changed_after_write", true);
  if (Number(after.session.fields[BALANCE_FIELDS.paidSum] ?? after.session.fields.paid_received_sum) !== sum) fail("projection_write_not_visible", true);
  return result(changed ? "updated" : "unchanged", "", {
    session_id: task.session_id,
    paid_received_sum: sum,
    remaining_amount_thb: after.summary.remaining_amount_thb,
    verified_payment_count: after.summary.records.filter((p) => p.verified && serviceStages.has(p.stage)).length
  });
}
__name(reconcile, "reconcile");
var SessionPaidProjectionState = class {
  static {
    __name(this, "SessionPaidProjectionState");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request2) {
    if (request2.method !== "POST" || new URL(request2.url).pathname !== "/reconcile") return Response.json({ error: "not_found" }, { status: 404 });
    const body = await request2.json().catch(() => null);
    if (!validSid(body?.session_id) || text2(body?.payment_ref).length > 180) return Response.json({ error: "invalid_projection_task" }, { status: 400 });
    return this.state.blockConcurrencyWhile(async () => {
      const bound = await this.state.storage.get("session_id");
      if (bound && bound !== body.session_id) return Response.json({ error: "projection_session_conflict" }, { status: 409 });
      await this.state.storage.put("session_id", body.session_id);
      const task = { session_id: body.session_id, payment_ref: text2(body.payment_ref), attempts: 0 };
      await this.state.storage.put("pending", task);
      await this.state.storage.setAlarm(Date.now() + 6e4);
      return Response.json(await this.process(task));
    });
  }
  async process(task) {
    task = { ...task, attempts: Number(task.attempts || 0) + 1 };
    await this.state.storage.put("pending", task);
    try {
      const answer = await reconcile(this.env, task);
      await this.state.storage.put("last_result", answer);
      await this.state.storage.delete("pending");
      await this.state.storage.deleteAlarm();
      return answer;
    } catch (e) {
      const retry = e.transient && task.attempts < 6;
      const answer = result(retry ? "retry_scheduled" : "needs_review", text2(e.message), { retry_exhausted: Boolean(e.transient && !retry) });
      await this.state.storage.put("last_result", answer);
      if (retry) await this.state.storage.setAlarm(Date.now() + Math.min(6e4 * 2 ** (task.attempts - 1), 36e5));
      else {
        await this.state.storage.delete("pending");
        await this.state.storage.deleteAlarm();
      }
      return answer;
    }
  }
  async alarm() {
    return this.state.blockConcurrencyWhile(async () => {
      const task = await this.state.storage.get("pending");
      if (task) return this.process(task);
    });
  }
};

// index.js
var LOCK = "payments-production-v10-clean";
var AIRTABLE_API = "https://api.airtable.com/v0";
function toStr(v) {
  return v == null ? "" : String(v).trim();
}
__name(toStr, "toStr");
function toNum(v) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
__name(toNum, "toNum");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(esc, "esc");
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}
__name(jsonResponse, "jsonResponse");
async function readJson(req) {
  try {
    const text17 = await req.text();
    if (!text17) return {};
    return JSON.parse(text17);
  } catch {
    return {};
  }
}
__name(readJson, "readJson");
function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
}
__name(getAllowedOrigins, "getAllowedOrigins");
function buildCorsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = getAllowedOrigins(env);
  const headers = new Headers();
  if (origin && allow.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Internal-Token");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}
__name(buildCorsHeaders, "buildCorsHeaders");
function withCors(req, env, res) {
  const headers = new Headers(res.headers);
  const cors = buildCorsHeaders(req, env);
  cors.forEach((v, k) => headers.set(k, v));
  return new Response(res.body, {
    status: res.status,
    headers
  });
}
__name(withCors, "withCors");
function isInternalAuthed(req, env) {
  const headerToken = toStr(req.headers.get("X-Internal-Token")) || toStr(req.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  return !!env.INTERNAL_TOKEN && headerToken === env.INTERNAL_TOKEN;
}
__name(isInternalAuthed, "isInternalAuthed");
function isServiceAuthed(req, env, secretNames) {
  const expected = (Array.isArray(secretNames) ? secretNames : [secretNames]).map((secretName) => toStr(env[secretName])).filter(Boolean);
  if (!expected.length) return false;
  const direct = toStr(req.headers.get("X-Internal-Token"));
  const bearer = toStr(req.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  return expected.includes(direct || bearer);
}
__name(isServiceAuthed, "isServiceAuthed");
function serviceAuthRequired(req, env, secretNames) {
  if (isServiceAuthed(req, env, secretNames)) return null;
  return withCors(req, env, jsonResponse({ ok: false, error: "service_auth_required" }, 401));
}
__name(serviceAuthRequired, "serviceAuthRequired");
function assertRequired(value3, field7) {
  if (!toStr(value3)) throw new Error(`${field7}_required`);
  return value3;
}
__name(assertRequired, "assertRequired");
function ensurePositiveNumber(value3, field7) {
  const n = toNum(value3);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${field7}_must_be_positive_number`);
  }
  return n;
}
__name(ensurePositiveNumber, "ensurePositiveNumber");
function ensureNonNegativeNumber(value3, field7) {
  const n = toNum(value3);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${field7}_must_be_non_negative_number`);
  }
  return n;
}
__name(ensureNonNegativeNumber, "ensureNonNegativeNumber");
function makePaymentRef(prefix2 = "pay") {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix2}_${Date.now().toString(36)}_${hex}`;
}
__name(makePaymentRef, "makePaymentRef");
function normalizeStage(value3) {
  const s = toStr(value3).toLowerCase();
  const allowed = ["deposit", "final", "tips", "full", "extension", "membership", "shop"];
  if (!allowed.includes(s)) throw new Error("invalid_payment_stage");
  return s;
}
__name(normalizeStage, "normalizeStage");
function truthy(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}
__name(truthy, "truthy");
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== void 0));
}
__name(compact, "compact");
function base64UrlEncode(input) {
  const bytes = new TextEncoder().encode(String(input || ""));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64UrlEncode, "base64UrlEncode");
function base64UrlDecode(input) {
  const value3 = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = value3.padEnd(Math.ceil(value3.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
__name(base64UrlDecode, "base64UrlDecode");
function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex, "bytesToHex");
async function hmacSha256Hex(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(message || "")));
  return bytesToHex(sig);
}
__name(hmacSha256Hex, "hmacSha256Hex");
async function verifyHmacSha256Hex(message, signature, secret) {
  if (!/^[a-f0-9]{64}$/i.test(String(signature || ""))) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signatureBytes = Uint8Array.from(
    String(signature).match(/.{2}/g) || [],
    (byte) => Number.parseInt(byte, 16)
  );
  return crypto.subtle.verify("HMAC", key, signatureBytes, enc.encode(String(message || "")));
}
__name(verifyHmacSha256Hex, "verifyHmacSha256Hex");
async function sha256Hex(text17) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(String(text17 || "")));
  return bytesToHex(digest);
}
__name(sha256Hex, "sha256Hex");
async function signConfirmToken(payload, secret) {
  const encoded = base64UrlEncode(JSON.stringify(payload || {}));
  const signature = await hmacSha256Hex(encoded, secret);
  return `${encoded}.${signature}`;
}
__name(signConfirmToken, "signConfirmToken");
async function tokenSig(token4) {
  const hex = await sha256Hex(token4);
  return hex.slice(0, 24);
}
__name(tokenSig, "tokenSig");
function getConfirmKey(env) {
  const key = toStr(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY);
  if (!key) throw new Error("missing_payment_confirmation_signing_secret");
  return key;
}
__name(getConfirmKey, "getConfirmKey");
function getConfirmTokenTtlSeconds(env) {
  const requested = Math.floor(toNum(env.PAY_TOKEN_TTL_SECONDS) || 60 * 60 * 24 * 30);
  return Math.min(Math.max(requested, 60), 60 * 60 * 24 * 30);
}
__name(getConfirmTokenTtlSeconds, "getConfirmTokenTtlSeconds");
function getPayKv(env) {
  if (!env.PAY_SESSIONS_KV) throw new Error("missing_pay_sessions_kv");
  return env.PAY_SESSIONS_KV;
}
__name(getPayKv, "getPayKv");
function getWebBaseUrl(env) {
  return toStr(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
}
__name(getWebBaseUrl, "getWebBaseUrl");
function buildAbsoluteUrl(value3, fallbackBase) {
  const raw = toStr(value3);
  if (!raw) return fallbackBase;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${fallbackBase}${raw.startsWith("/") ? "" : "/"}${raw}`;
}
__name(buildAbsoluteUrl, "buildAbsoluteUrl");
function makeSessionId(prefix2 = "sess") {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix2}_${Date.now().toString(36)}_${hex}`;
}
__name(makeSessionId, "makeSessionId");
async function createConfirmTokenRecord(env, token4, payload) {
  const kv = getPayKv(env);
  const nowSeconds = Math.floor(Date.now() / 1e3);
  const expirationTtl = Math.min(
    getConfirmTokenTtlSeconds(env),
    Math.max(60, Math.floor(Number(payload.exp) - nowSeconds))
  );
  await kv.put(`sig:${await tokenSig(token4)}`, JSON.stringify(payload), {
    expirationTtl
  });
}
__name(createConfirmTokenRecord, "createConfirmTokenRecord");
function validateConfirmClaims(payload, expectedRole = "", nowSeconds = Math.floor(Date.now() / 1e3)) {
  const role = toStr(payload?.role);
  const kind = toStr(payload?.kind);
  const validKindForRole = role === "customer" && kind === "customer_confirm" || role === "model" && kind === "model_confirm";
  if (!validKindForRole || expectedRole && role !== expectedRole) {
    throw new Error("invalid_confirmation_token_purpose");
  }
  if (!toStr(payload?.session_id) || !toStr(payload?.payment_ref)) {
    throw new Error("invalid_confirmation_token_subject");
  }
  if (!Number.isInteger(payload?.iat) || !Number.isInteger(payload?.exp) || payload.exp <= payload.iat) {
    throw new Error("invalid_confirmation_token_lifetime");
  }
  if (payload.iat > nowSeconds + 60) throw new Error("confirmation_token_not_yet_valid");
  if (payload.exp <= nowSeconds) throw new Error("confirmation_token_expired");
}
__name(validateConfirmClaims, "validateConfirmClaims");
async function verifyConfirmToken(env, token4, options = {}) {
  const rawToken = toStr(token4);
  const parts = rawToken.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("invalid_confirmation_token");
  }
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(parts[0]));
  } catch {
    throw new Error("invalid_confirmation_token");
  }
  const signatureValid = await verifyHmacSha256Hex(parts[0], parts[1], getConfirmKey(env));
  if (!signatureValid) throw new Error("invalid_confirmation_token_signature");
  validateConfirmClaims(payload, toStr(options.expectedRole), options.nowSeconds);
  const storedRaw = await getPayKv(env).get(`sig:${await tokenSig(rawToken)}`);
  if (!storedRaw) throw new Error("confirmation_token_not_active");
  let stored;
  try {
    stored = JSON.parse(storedRaw);
  } catch {
    throw new Error("confirmation_token_record_invalid");
  }
  for (const field7 of ["kind", "role", "session_id", "payment_ref", "payment_type", "iat", "exp"]) {
    if (stored?.[field7] !== payload?.[field7]) {
      throw new Error("confirmation_token_record_mismatch");
    }
  }
  return payload;
}
__name(verifyConfirmToken, "verifyConfirmToken");
async function createSessionIfMissing(env, payload) {
  const existing = await findSessionBySessionId(env, payload.session_id);
  if (existing?.id) {
    await airtablePatch(env, getSessionsTable(env), existing.id, compact({
      status: payload.status || "pending",
      "Session Status": payload.status || "pending",
      "Payment Status": payload.payment_status || "pending",
      payment_ref: payload.payment_ref,
      payment_type: payload.payment_type,
      amount_thb: payload.amount_thb,
      pay_model_thb: payload.pay_model_thb,
      client_name: payload.client_name,
      model_name: payload.model_name,
      job_type: payload.job_type,
      job_date: payload.job_date,
      start_time: payload.start_time,
      end_time: payload.end_time,
      location_name: payload.location_name,
      google_map_url: payload.google_map_url,
      note: payload.note,
      notes: payload.note,
      created_at: payload.created_at
    }));
    return { ok: true, mode: "update", record_id: existing.id };
  }
  const created = await airtableCreate(env, getSessionsTable(env), compact({
    session_id: payload.session_id,
    status: payload.status || "pending",
    "Session Status": payload.status || "pending",
    "Payment Status": payload.payment_status || "pending",
    payment_ref: payload.payment_ref,
    payment_type: payload.payment_type,
    amount_thb: payload.amount_thb,
    pay_model_thb: payload.pay_model_thb,
    client_name: payload.client_name,
    model_name: payload.model_name,
    job_type: payload.job_type,
    job_date: payload.job_date,
    start_time: payload.start_time,
    end_time: payload.end_time,
    location_name: payload.location_name,
    google_map_url: payload.google_map_url,
    note: payload.note,
    notes: payload.note,
    created_at: payload.created_at || nowIso()
  }));
  return { ok: true, mode: "create", record_id: created?.id || null };
}
__name(createSessionIfMissing, "createSessionIfMissing");
async function telegramSend(env, text17, threadId2 = null) {
  const service = env.TELEGRAM_WORKER;
  const token4 = toStr(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM);
  if (!service || typeof service.fetch !== "function") return { ok: false, skipped: true, reason: "telegram_router_binding_missing" };
  if (!token4) return { ok: false, skipped: true, reason: "telegram_router_auth_missing" };
  const thread = Number(toStr(threadId2 || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || "22"));
  const flow = thread === 17 ? "points_threshold" : thread === 20 ? "membership" : "payment";
  const res = await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token4}`
    },
    body: JSON.stringify({
      flow,
      text: toStr(text17),
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  }));
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data?.ok === true && data?.telegram?.ok === true, status: res.status, data, flow };
}
__name(telegramSend, "telegramSend");
function getAirtableBaseId(env) {
  const baseId2 = toStr(env.AIRTABLE_BASE_ID);
  if (!baseId2) throw new Error("missing_airtable_base_id");
  return baseId2;
}
__name(getAirtableBaseId, "getAirtableBaseId");
function getAirtableApiKey(env) {
  const apiKey = toStr(env.AIRTABLE_API_KEY);
  if (!apiKey) throw new Error("missing_airtable_api_key");
  return apiKey;
}
__name(getAirtableApiKey, "getAirtableApiKey");
function getPaymentsTable(env) {
  return toStr(env.AIRTABLE_TABLE_PAYMENTS || "payments");
}
__name(getPaymentsTable, "getPaymentsTable");
function getSessionsTable(env) {
  return toStr(env.AIRTABLE_TABLE_SESSIONS || "sessions");
}
__name(getSessionsTable, "getSessionsTable");
function getPointsLedgerTable(env) {
  return toStr(env.AIRTABLE_TABLE_POINTS_LEDGER || "points_ledger");
}
__name(getPointsLedgerTable, "getPointsLedgerTable");
async function airtableFetch(env, path, init = {}) {
  const apiKey = getAirtableApiKey(env);
  const baseId2 = getAirtableBaseId(env);
  const res = await fetch(`${AIRTABLE_API}/${baseId2}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`airtable_error_${res.status}:${JSON.stringify(data)}`);
  }
  return data;
}
__name(airtableFetch, "airtableFetch");
function encodeFormulaValue(v) {
  return String(v || "").replace(/'/g, "\\'");
}
__name(encodeFormulaValue, "encodeFormulaValue");
async function airtableFindFirstByFormula(env, table7, formula5) {
  const path = `${encodeURIComponent(table7)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula5)}`;
  const data = await airtableFetch(env, path, { method: "GET" });
  return data?.records?.[0] || null;
}
__name(airtableFindFirstByFormula, "airtableFindFirstByFormula");
async function airtableCreate(env, table7, fields2, options = {}) {
  const data = await airtableFetch(env, encodeURIComponent(table7), {
    method: "POST",
    body: JSON.stringify({
      records: [{ fields: fields2 }],
      ...options.typecast === true ? { typecast: true } : {}
    })
  });
  return data?.records?.[0] || null;
}
__name(airtableCreate, "airtableCreate");
async function airtablePatch(env, table7, recordId3, fields2, options = {}) {
  const data = await airtableFetch(env, `${encodeURIComponent(table7)}/${encodeURIComponent(recordId3)}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: fields2,
      ...options.typecast === true ? { typecast: true } : {}
    })
  });
  return data || null;
}
__name(airtablePatch, "airtablePatch");
async function findPaymentByPaymentRef(env, paymentRef) {
  const table7 = getPaymentsTable(env);
  const formula5 = `{payment_ref}='${encodeFormulaValue(paymentRef)}'`;
  return airtableFindFirstByFormula(env, table7, formula5);
}
__name(findPaymentByPaymentRef, "findPaymentByPaymentRef");
async function findSuccessfulPaymentBySessionAndType(env, sessionId, stage2) {
  const table7 = getPaymentsTable(env);
  const formula5 = `AND({session_id}='${encodeFormulaValue(sessionId)}',{payment_type}='${encodeFormulaValue(stage2)}',OR({Payment Status}='success',{Payment Status}='paid',{Payment Status}='verified'))`;
  return airtableFindFirstByFormula(env, table7, formula5);
}
__name(findSuccessfulPaymentBySessionAndType, "findSuccessfulPaymentBySessionAndType");
async function findSessionBySessionId(env, sessionId) {
  const table7 = getSessionsTable(env);
  const formula5 = `{session_id}='${encodeFormulaValue(sessionId)}'`;
  return airtableFindFirstByFormula(env, table7, formula5);
}
__name(findSessionBySessionId, "findSessionBySessionId");
var CANONICAL_MEMBERSHIP_PACKAGES = /* @__PURE__ */ new Set(["mmd_member", "elite", "red_card", "standard", "premium"]);
function reviewedMembershipSchemaTypecast(payload = {}, options = {}) {
  if (options.allow_membership_schema_typecast !== true) return false;
  if (toStr(payload.payment_stage).toLowerCase() !== "membership") return false;
  return CANONICAL_MEMBERSHIP_PACKAGES.has(toStr(payload.package_code).toLowerCase());
}
__name(reviewedMembershipSchemaTypecast, "reviewedMembershipSchemaTypecast");
async function createOrUpdatePaymentIntent(env, payload, options = {}) {
  const table7 = getPaymentsTable(env);
  const existing = await findPaymentByPaymentRef(env, payload.payment_ref);
  const typecast = reviewedMembershipSchemaTypecast(payload, options);
  const paymentMethodRaw = toStr(payload.payment_method || "promptpay").toLowerCase();
  const paymentMethod = paymentMethodRaw.includes("prompt") ? "PromptPay" : paymentMethodRaw.includes("bank") ? "Bank Transfer" : paymentMethodRaw.includes("credit") ? "Credit Card" : paymentMethodRaw.includes("cash") ? "Cash" : "Other";
  const paymentDate2 = toStr(payload.paid_at || nowIso()).slice(0, 10);
  const alreadyVerified = toStr(existing?.fields?.[toStr(env.AT_PAYMENTS__PAYMENT_STATUS || "Payment Status")]).toLowerCase() === "paid" && toStr(existing?.fields?.[toStr(env.AT_PAYMENTS__VERIFICATION_STATUS || "Verification Status")]).toLowerCase() === "verified";
  const verified = alreadyVerified || toStr(payload.payment_status).toLowerCase() === "paid" && toStr(payload.verification_status).toLowerCase() === "verified";
  const fields2 = compact({
    [toStr(env.AT_PAYMENTS__PAYMENT_REF || "Payment Reference")]: payload.payment_ref,
    [toStr(env.AT_PAYMENTS__PAYMENT_DATE || "Payment Date")]: paymentDate2,
    [toStr(env.AT_PAYMENTS__AMOUNT || "Amount")]: payload.amount,
    [toStr(env.AT_PAYMENTS__PAYMENT_STATUS || "Payment Status")]: verified ? "Paid" : "Pending",
    [toStr(env.AT_PAYMENTS__PAYMENT_METHOD || "Payment Method")]: paymentMethod,
    [toStr(env.AT_PAYMENTS__NOTES || "Notes")]: toStr(payload.notes) || void 0,
    [toStr(env.AT_PAYMENTS__VERIFICATION_STATUS || "Verification Status")]: verified ? "verified" : "pending_review",
    [toStr(env.AT_PAYMENTS__PAYMENT_INTENT_STATUS || "Payment Intent Status")]: verified ? "Confirmed" : "Pending Confirmation",
    [toStr(env.AT_PAYMENTS__PACKAGE_CODE || "Package Code")]: toStr(payload.package_code) || void 0,
    [toStr(env.AT_PAYMENTS__SESSION_ID || "session_id")]: toStr(payload.session_id) || void 0,
    [toStr(env.AT_PAYMENTS__PAYMENT_STAGE || "payment_stage")]: toStr(payload.payment_stage) || void 0,
    [toStr(env.AT_PAYMENTS__PAYMENT_TYPE || "payment_type")]: ["deposit", "final", "tips", "full", "extension"].includes(toStr(payload.payment_stage)) ? toStr(payload.payment_stage) : void 0,
    [toStr(env.AT_PAYMENTS__CREATED_AT || "Created At")]: existing?.id ? void 0 : payload.created_at || nowIso()
  });
  if (existing?.id) {
    if (payload.payment_stage === "membership" && /^liffrenew_(standard|premium)_[a-f0-9]{24}$/.test(toStr(payload.session_id))) {
      for (const key of ["SESSION_ID", "PACKAGE_CODE", "AMOUNT", "PAYMENT_STAGE"]) {
        const fallback = { SESSION_ID: "session_id", PACKAGE_CODE: "Package Code", AMOUNT: "Amount", PAYMENT_STAGE: "payment_stage" }[key];
        const field7 = toStr(env[`AT_PAYMENTS__${key}`] || fallback);
        if (String(existing.fields?.[field7] ?? "") !== String(fields2[field7] ?? "")) throw new Error("renewal_payment_identity_conflict");
      }
      return { ok: true, mode: "reuse", record_id: existing.id };
    }
    await airtablePatch(env, table7, existing.id, fields2, { typecast });
    return { ok: true, mode: "update", record_id: existing.id };
  }
  if (payload.payment_stage === "membership" && /^liffrenew_(standard|premium)_[a-f0-9]{24}$/.test(toStr(payload.session_id))) {
    const intentFields = { ...fields2 };
    for (const name of ["PAYMENT_STATUS", "VERIFICATION_STATUS", "PAYMENT_INTENT_STATUS", "PAYMENT_DATE"]) {
      const fallback = { PAYMENT_STATUS: "Payment Status", VERIFICATION_STATUS: "Verification Status", PAYMENT_INTENT_STATUS: "Payment Intent Status", PAYMENT_DATE: "Payment Date" }[name];
      delete intentFields[toStr(env[`AT_PAYMENTS__${name}`] || fallback)];
    }
    const data = await airtableFetch(env, encodeURIComponent(table7), {
      method: "PATCH",
      body: JSON.stringify({ performUpsert: { fieldsToMergeOn: [toStr(env.AT_PAYMENTS__PAYMENT_REF || "Payment Reference")] }, records: [{ fields: intentFields }], ...typecast ? { typecast: true } : {} })
    });
    if (data?.records?.length !== 1 || !data.records[0]?.id) throw new Error("renewal_payment_upsert_failed");
    return { ok: true, mode: "upsert", record_id: data.records[0].id };
  }
  const created = await airtableCreate(env, table7, fields2, { typecast });
  return { ok: true, mode: "create", record_id: created?.id || null };
}
__name(createOrUpdatePaymentIntent, "createOrUpdatePaymentIntent");
async function updateSessionFromPayment(env, payload) {
  const session = await findSessionBySessionId(env, payload.session_id);
  if (!session?.id) {
    return { ok: false, skipped: true, reason: "session_not_found" };
  }
  const currentPaymentStatus = toStr(
    session.fields?.[toStr(env.AT_SESSIONS__PAYMENT_STATUS || "payment_status")] || session.fields?.payment_status
  ).toLowerCase();
  const nextPaymentStatus = payload.stage === "deposit" ? "partial" : ["final", "full", "membership"].includes(payload.stage) ? "paid" : currentPaymentStatus;
  const fields2 = compact({
    [toStr(env.AT_SESSIONS__PAYMENT_STATUS || "payment_status")]: nextPaymentStatus || void 0,
    [toStr(env.AT_SESSIONS__PAYMENT_REF || "payment_ref")]: payload.stage === "deposit" && !toStr(session.fields?.[toStr(env.AT_SESSIONS__PAYMENT_REF || "payment_ref")]) ? payload.payment_ref : void 0
  });
  if (Object.keys(fields2).length) {
    await airtablePatch(env, getSessionsTable(env), session.id, fields2);
  }
  return {
    ok: true,
    session_record_id: session.id,
    payment_status: nextPaymentStatus || null,
    lifecycle_unchanged: true
  };
}
__name(updateSessionFromPayment, "updateSessionFromPayment");
async function awardPointsIfEligible(env, payload) {
  return {
    ok: true,
    skipped: true,
    awarded: false,
    reason: "legacy_points_writer_retired",
    canonical_writer: "points_phase1",
    payment_ref: toStr(payload?.payment_ref) || null
  };
}
__name(awardPointsIfEligible, "awardPointsIfEligible");
async function handlePing(req, env) {
  return withCors(
    req,
    env,
    jsonResponse({
      ok: true,
      worker: "payments-worker",
      lock: LOCK,
      ts: Date.now(),
      env: {
        airtable_base_id: toStr(env.AIRTABLE_BASE_ID),
        payments_table: getPaymentsTable(env),
        sessions_table: getSessionsTable(env),
        points_ledger_table: getPointsLedgerTable(env),
        telegram_chat_id: toStr(env.TELEGRAM_CHAT_ID || "-1003546439681"),
        tg_thread_confirm: toStr(env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || "21"),
        tg_thread_points: toStr(env.TG_THREAD_POINTS || "17")
      }
    })
  );
}
__name(handlePing, "handlePing");
async function handleVerify(req, env) {
  const body = await readJson(req);
  try {
    const session_id = toStr(assertRequired(body.session_id, "session_id"));
    const payment_stage = normalizeStage(body.payment_stage || body.payment_type || "deposit");
    const amount3 = ensurePositiveNumber(body.amount, "amount");
    const payment_method = toStr(body.payment_method || "promptpay");
    const member_email = toStr(body.member_email || body.email);
    const package_code = toStr(body.package_code || body.package);
    const notes = toStr(body.notes || body.note);
    const receipt_url = toStr(body.receipt_url || body.slip_url);
    const paid_at = toStr(body.paid_at || nowIso());
    const payment_ref = toStr(body.payment_ref || body.transaction_ref || makePaymentRef("pay"));
    const verify_strict = truthy(env.VERIFY_STRICT);
    const duplicateByRef = await findPaymentByPaymentRef(env, payment_ref);
    if (duplicateByRef?.id) {
      if (/^liffrenew_(standard|premium)_[a-f0-9]{24}$/.test(session_id)) {
        const f = duplicateByRef.fields || {};
        if (toStr(f[toStr(env.AT_PAYMENTS__SESSION_ID || "session_id")]) !== session_id || toStr(f[toStr(env.AT_PAYMENTS__PACKAGE_CODE || "Package Code")]) !== package_code || toNum(f[toStr(env.AT_PAYMENTS__AMOUNT || "Amount")]) !== amount3 || toStr(f[toStr(env.AT_PAYMENTS__PAYMENT_STAGE || "payment_stage")]) !== payment_stage) {
          throw new Error("renewal_payment_identity_conflict");
        }
      }
      return withCors(
        req,
        env,
        jsonResponse({
          ok: true,
          duplicated: true,
          idempotent: true,
          reason: "payment_ref_already_exists",
          payment_ref,
          session_id,
          existing_record_id: duplicateByRef.id
        })
      );
    }
    const duplicateByStage = await findSuccessfulPaymentBySessionAndType(env, session_id, payment_stage);
    if (duplicateByStage?.id && verify_strict) {
      return withCors(
        req,
        env,
        jsonResponse({
          ok: true,
          duplicated: true,
          idempotent: true,
          reason: "session_id_payment_type_already_verified",
          payment_ref,
          session_id,
          existing_record_id: duplicateByStage.id
        })
      );
    }
    const paymentWrite = await createOrUpdatePaymentIntent(env, {
      session_id,
      payment_stage,
      amount: amount3,
      payment_method,
      member_email,
      package_code,
      notes,
      receipt_url,
      paid_at,
      payment_ref,
      payment_status: "pending",
      verification_status: "pending",
      intent_status: receipt_url ? "manual_slip_submitted" : "manual_review",
      created_at: nowIso()
    });
    try {
      await telegramSend(
        env,
        [
          "\u{1F9FE} <b>PAYMENT INTENT CREATED</b>",
          `Session: <code>${esc(session_id)}</code>`,
          `Stage: <b>${esc(payment_stage)}</b>`,
          `Amount: <b>${Number(amount3 || 0)} THB</b>`,
          `Payment Ref: <code>${esc(payment_ref)}</code>`,
          package_code ? `Package: <b>${esc(package_code)}</b>` : "",
          member_email ? `Member: ${esc(member_email)}` : ""
        ].filter(Boolean).join("\n"),
        env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || "21"
      );
    } catch (_) {
    }
    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        session_id,
        payment_stage,
        payment_ref,
        amount: amount3,
        payment_method,
        payment_write: paymentWrite,
        status: "pending",
        verification_status: "pending"
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 400)
    );
  }
}
__name(handleVerify, "handleVerify");
async function handleNotify(req, env) {
  if (!isInternalAuthed(req, env)) {
    return withCors(req, env, jsonResponse({ ok: false, error: "unauthorized" }, 401));
  }
  const body = await readJson(req);
  try {
    const payment_ref = toStr(assertRequired(body.payment_ref || body.transaction_ref, "payment_ref"));
    const stage2 = normalizeStage(body.stage || body.payment_stage || body.payment_type || "deposit");
    const session_id = toStr(body.session_id);
    const amount_thb = ensurePositiveNumber(body.amount_thb || body.amount, "amount_thb");
    const member_email = toStr(body.member_email || body.email);
    const package_code = toStr(body.package_code || body.package);
    const payment_method = toStr(body.payment_method || "promptpay");
    const receipt_url = toStr(body.receipt_url || body.slip_url);
    const paid_at = toStr(body.paid_at || nowIso());
    const paymentWrite = await createOrUpdatePaymentIntent(env, {
      session_id,
      payment_stage: stage2,
      amount: amount_thb,
      payment_method,
      member_email,
      package_code,
      receipt_url,
      paid_at,
      payment_ref,
      payment_status: "paid",
      verification_status: "verified",
      intent_status: receipt_url ? "manual_slip_submitted" : "manual_review",
      created_at: nowIso()
    }, {
      // Only the internal Official Verify path may extend Airtable select choices
      // for canonical membership packages. Public/browser verify paths keep
      // schema typecasting disabled.
      allow_membership_schema_typecast: true
    });
    const session_updated = session_id && stage2 !== "shop" ? await updateSessionFromPayment(env, {
      payment_ref,
      stage: stage2,
      session_id,
      amount_thb,
      member_email,
      package_code,
      receipt_url,
      paid_at
    }) : { ok: false, skipped: true, reason: "missing_session_id" };
    const paid_received_projection = await requestSessionPaidProjection(env, {
      session_id,
      stage: stage2,
      payment_ref
    });
    const points_ledger = await awardPointsIfEligible(env, {
      payment_ref,
      stage: stage2,
      session_id,
      amount_thb,
      member_email,
      package_code
    });
    try {
      await telegramSend(
        env,
        [
          "\u2705 <b>PAYMENT NOTIFIED / PAID</b>",
          `Ref: <code>${esc(payment_ref)}</code>`,
          stage2 ? `Stage: <b>${esc(stage2)}</b>` : "",
          session_id ? `Session: <code>${esc(session_id)}</code>` : "",
          package_code ? `Package: <b>${esc(package_code)}</b>` : "",
          amount_thb ? `Amount: <b>${Number(amount_thb)} THB</b>` : "",
          member_email ? `Member: ${esc(member_email)}` : "",
          session_updated?.ok ? "Session updated: <b>yes</b>" : "Session updated: <b>no</b>"
        ].filter(Boolean).join("\n"),
        env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || "21"
      );
    } catch (_) {
    }
    if (points_ledger && points_ledger.ok && points_ledger.awarded) {
      try {
        await telegramSend(
          env,
          [
            "\u{1F3AF} <b>POINTS AWARDED</b>",
            `Ref: <code>${esc(payment_ref)}</code>`,
            `Points: <b>${Number(points_ledger.points || 0)}</b>`,
            amount_thb ? `Amount: <b>${Number(amount_thb)} THB</b>` : "",
            member_email ? `Member: ${esc(member_email)}` : ""
          ].filter(Boolean).join("\n"),
          env.TG_THREAD_POINTS || "17"
        );
      } catch (_) {
      }
    }
    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        payment_ref,
        stage: stage2,
        session_id,
        amount_thb,
        payment_write: paymentWrite,
        ...paid_received_projection.status !== "skipped" ? { paid_received_projection } : {},
        session_updated,
        points_ledger
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 400)
    );
  }
}
__name(handleNotify, "handleNotify");
async function handleConfirmLink(req, env) {
  const denied = serviceAuthRequired(req, env, [
    "AUTH_SERVICE_ADMIN_TO_PAYMENTS",
    "AUTH_SERVICE_IMMIGRATE_TO_PAYMENTS"
  ]);
  if (denied) return denied;
  const body = await readJson(req);
  try {
    const session_id = toStr(body.session_id || makeSessionId("sess"));
    const client_name = toStr(assertRequired(body.client_name, "client_name"));
    const model_name = toStr(assertRequired(body.model_name, "model_name"));
    const job_type = toStr(assertRequired(body.job_type, "job_type"));
    const job_date = toStr(assertRequired(body.job_date, "job_date"));
    const start_time = toStr(assertRequired(body.start_time, "start_time"));
    const end_time = toStr(assertRequired(body.end_time, "end_time"));
    const location_name = toStr(assertRequired(body.location_name, "location_name"));
    const google_map_url = toStr(body.google_map_url);
    const amount_thb = ensurePositiveNumber(body.amount_thb || body.amount, "amount_thb");
    const pay_model_thb = body.pay_model_thb == null && body.pay_model == null && body.model_pay_thb == null && body.model_pay == null ? void 0 : ensureNonNegativeNumber(
      body.pay_model_thb ?? body.pay_model ?? body.model_pay_thb ?? body.model_pay,
      "pay_model_thb"
    );
    const payment_type = normalizeStage(body.payment_type || body.payment_stage || "full");
    const payment_method = toStr(body.payment_method || "promptpay");
    const note = toStr(body.note || body.notes);
    const payment_ref = toStr(body.payment_ref || makePaymentRef("pay"));
    const created_at = nowIso();
    const issuedAt = Math.floor(Date.now() / 1e3);
    const expiresAt = issuedAt + getConfirmTokenTtlSeconds(env);
    const base = getWebBaseUrl(env);
    const customerConfirmPage = buildAbsoluteUrl(body.confirm_page || "/confirm/job-confirmation", base);
    const modelConfirmPage = buildAbsoluteUrl(body.model_confirm_page || "/confirm/job-model", base);
    const confirmKey = getConfirmKey(env);
    const customerPayload = {
      kind: "customer_confirm",
      role: "customer",
      session_id,
      payment_ref,
      payment_type,
      iat: issuedAt,
      exp: expiresAt
    };
    const modelPayload = {
      kind: "model_confirm",
      role: "model",
      session_id,
      payment_ref,
      payment_type,
      iat: issuedAt,
      exp: expiresAt
    };
    const customer_t = await signConfirmToken(customerPayload, confirmKey);
    const model_t = await signConfirmToken(modelPayload, confirmKey);
    await createConfirmTokenRecord(env, customer_t, customerPayload);
    await createConfirmTokenRecord(env, model_t, modelPayload);
    const session_write = await createSessionIfMissing(env, {
      session_id,
      payment_ref,
      payment_type,
      payment_status: "pending",
      status: "pending",
      amount_thb,
      pay_model_thb,
      client_name,
      model_name,
      job_type,
      job_date,
      start_time,
      end_time,
      location_name,
      google_map_url,
      note,
      created_at
    });
    const payment_write = await createOrUpdatePaymentIntent(env, {
      session_id,
      payment_ref,
      payment_stage: payment_type,
      amount: amount_thb,
      payment_method,
      notes: note,
      created_at,
      payment_status: "pending",
      verification_status: "pending",
      intent_status: "manual_review"
    });
    const customer_confirmation_url = `${customerConfirmPage}?t=${encodeURIComponent(customer_t)}`;
    const model_confirmation_url = `${modelConfirmPage}?t=${encodeURIComponent(model_t)}`;
    try {
      await telegramSend(
        env,
        [
          "\u{1F517} <b>CONFIRM LINKS CREATED</b>",
          `Session: <code>${esc(session_id)}</code>`,
          `Payment Ref: <code>${esc(payment_ref)}</code>`,
          `Client: <b>${esc(client_name)}</b>`,
          `Model: <b>${esc(model_name)}</b>`,
          `Type: <b>${esc(job_type)}</b>`,
          `Amount: <b>${Number(amount_thb)} THB</b>`,
          pay_model_thb != null ? `Pay Model: <b>${Number(pay_model_thb)} THB</b>` : ""
        ].join("\n"),
        env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || "21"
      );
    } catch (_) {
    }
    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        session_id,
        payment_ref,
        customer_t,
        model_t,
        customer_confirmation_url,
        model_confirmation_url,
        payment_write,
        session_write
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 400)
    );
  }
}
__name(handleConfirmLink, "handleConfirmLink");
async function handleConfirmVerify(req, env) {
  const body = await readJson(req);
  try {
    const claims = await verifyConfirmToken(env, body.t || body.token, {
      expectedRole: toStr(body.expected_role)
    });
    return withCors(
      req,
      env,
      jsonResponse({
        ok: true,
        claims: {
          kind: claims.kind,
          role: claims.role,
          session_id: claims.session_id,
          payment_ref: claims.payment_ref,
          payment_type: claims.payment_type,
          iat: claims.iat,
          exp: claims.exp
        }
      })
    );
  } catch (err) {
    return withCors(
      req,
      env,
      jsonResponse({ ok: false, error: String(err?.message || err) }, 401)
    );
  }
}
__name(handleConfirmVerify, "handleConfirmVerify");
var index_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(req, env)
      });
    }
    if (method === "GET" && (path === "/ping" || path === "/health")) {
      return handlePing(req, env);
    }
    if (method === "POST" && path === "/v1/internal/pay/verify") {
      const denied = serviceAuthRequired(req, env, "AUTH_SERVICE_EVENTS_TO_PAYMENTS");
      if (denied) return denied;
      return handleVerify(req, env);
    }
    if (method === "POST" && path === "/v1/confirm/link") {
      return handleConfirmLink(req, env);
    }
    if (method === "POST" && path === "/v1/confirm/verify") {
      return handleConfirmVerify(req, env);
    }
    if (method === "POST" && path === "/v1/pay/verify") {
      return handleVerify(req, env);
    }
    if (method === "POST" && path === "/v1/payments/notify") {
      return handleNotify(req, env);
    }
    return withCors(req, env, jsonResponse({ ok: false, error: "not_found" }, 404));
  }
};

// index.with-slip-evidence.js
var AIRTABLE_API2 = "https://api.airtable.com/v0";
var SLIP_EVIDENCE_PATH = "/v1/pay/slip/evidence";
function toStr2(value3) {
  return value3 == null ? "" : String(value3).trim();
}
__name(toStr2, "toStr");
function nowIso2() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso2, "nowIso");
function esc2(value3) {
  return String(value3 || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(esc2, "esc");
function compact2(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value3]) => value3 !== void 0 && value3 !== ""));
}
__name(compact2, "compact");
function jsonResponse2(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}
__name(jsonResponse2, "jsonResponse");
function getAllowedOrigins2(env) {
  return String(env.ALLOWED_ORIGINS || "").replace(/^\"+|\"+$/g, "").split(",").map((item) => item.trim()).filter(Boolean);
}
__name(getAllowedOrigins2, "getAllowedOrigins");
function buildCorsHeaders2(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = getAllowedOrigins2(env);
  const headers = new Headers();
  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Internal-Token, X-Confirm-Key");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}
__name(buildCorsHeaders2, "buildCorsHeaders");
function withCors2(req, env, res) {
  const headers = new Headers(res.headers);
  const cors = buildCorsHeaders2(req, env);
  cors.forEach((value3, key) => headers.set(key, value3));
  return new Response(res.body, {
    status: res.status,
    headers
  });
}
__name(withCors2, "withCors");
function atField(env, envKey, fallbackName) {
  return toStr2(env[envKey] || fallbackName);
}
__name(atField, "atField");
function getAirtableBaseId2(env) {
  const baseId2 = toStr2(env.AIRTABLE_BASE_ID);
  if (!baseId2) throw new Error("missing_airtable_base_id");
  return baseId2;
}
__name(getAirtableBaseId2, "getAirtableBaseId");
function getAirtableApiKey2(env) {
  const apiKey = toStr2(env.AIRTABLE_API_KEY);
  if (!apiKey) throw new Error("missing_airtable_api_key");
  return apiKey;
}
__name(getAirtableApiKey2, "getAirtableApiKey");
function getPaymentsTable2(env) {
  return toStr2(env.AIRTABLE_TABLE_PAYMENTS || "payments");
}
__name(getPaymentsTable2, "getPaymentsTable");
function getPaymentRefFormulaField(env) {
  return toStr2(
    env.AT_PAYMENTS__PAYMENT_REF_NAME || env.AIRTABLE_PAYMENTS_FIELD_PAYMENT_REF_NAME || env.AIRTABLE_FIELD_PAYMENT_REF_NAME || "Payment Reference"
  );
}
__name(getPaymentRefFormulaField, "getPaymentRefFormulaField");
function encodeFormulaValue2(value3) {
  return String(value3 || "").replace(/'/g, "\\'");
}
__name(encodeFormulaValue2, "encodeFormulaValue");
async function airtableFetch2(env, path, init = {}) {
  const res = await fetch(`${AIRTABLE_API2}/${getAirtableBaseId2(env)}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getAirtableApiKey2(env)}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`airtable_error_${res.status}:${JSON.stringify(data)}`);
  return data;
}
__name(airtableFetch2, "airtableFetch");
async function findPaymentByPaymentRef2(env, paymentRef) {
  if (!paymentRef) return { record: null, error: null, skipped: true };
  try {
    const table7 = getPaymentsTable2(env);
    const fieldName = getPaymentRefFormulaField(env);
    const formula5 = `{${fieldName}}='${encodeFormulaValue2(paymentRef)}'`;
    const path = `${encodeURIComponent(table7)}?maxRecords=1&filterByFormula=${encodeURIComponent(formula5)}`;
    const data = await airtableFetch2(env, path, { method: "GET" });
    return { record: data?.records?.[0] || null, error: null, skipped: false, formula_field: fieldName };
  } catch (err) {
    return { record: null, error: String(err?.message || err), skipped: false };
  }
}
__name(findPaymentByPaymentRef2, "findPaymentByPaymentRef");
function buildEvidenceNote(payload, lookupInfo = null) {
  return [
    `slip_evidence_received_at=${nowIso2()}`,
    "evidence_only=true",
    "official_verification_required=true",
    payload.payment_ref ? `payment_ref=${payload.payment_ref}` : "",
    payload.session_id ? `session_id=${payload.session_id}` : "",
    payload.payment_stage ? `payment_stage=${payload.payment_stage}` : "",
    payload.proof_type ? `proof_type=${payload.proof_type}` : "",
    payload.source_page ? `source_page=${payload.source_page}` : "",
    payload.file_meta?.name ? `file_name=${payload.file_meta.name}` : "",
    payload.file_meta?.type ? `file_type=${payload.file_meta.type}` : "",
    payload.file_meta?.size ? `file_size=${payload.file_meta.size}` : "",
    lookupInfo?.error ? `lookup_error=${lookupInfo.error}` : ""
  ].filter(Boolean).join("; ");
}
__name(buildEvidenceNote, "buildEvidenceNote");
function putField(fields2, key, value3) {
  if (!key || value3 === void 0 || value3 === "") return;
  fields2[key] = value3;
}
__name(putField, "putField");
function buildAirtableFields(env, payload, lookupInfo = null, minimal = false) {
  const fields2 = {};
  const note = buildEvidenceNote(payload, lookupInfo);
  putField(fields2, atField(env, "AT_PAYMENTS__PAYMENT_REF", "Payment Reference"), payload.payment_ref);
  putField(fields2, atField(env, "AT_PAYMENTS__NOTES", "Notes"), note);
  if (!minimal) {
    putField(fields2, atField(env, "AT_PAYMENTS__PAYMENT_STATUS", "Payment Status"), "Pending");
    putField(fields2, atField(env, "AT_PAYMENTS__VERIFICATION_STATUS", "Verification Status"), "pending_review");
  }
  return compact2(fields2);
}
__name(buildAirtableFields, "buildAirtableFields");
async function createPaymentEvidenceRecord(env, fields2) {
  const table7 = getPaymentsTable2(env);
  const data = await airtableFetch2(env, encodeURIComponent(table7), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: fields2 }] })
  });
  return data?.records?.[0] || null;
}
__name(createPaymentEvidenceRecord, "createPaymentEvidenceRecord");
async function patchPaymentEvidence(env, recordId3, fields2) {
  const table7 = getPaymentsTable2(env);
  const data = await airtableFetch2(env, `${encodeURIComponent(table7)}/${encodeURIComponent(recordId3)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: fields2 })
  });
  return data || null;
}
__name(patchPaymentEvidence, "patchPaymentEvidence");
async function writeEvidencePendingReview(env, payload) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_TABLE_PAYMENTS) {
    return { ok: true, skipped: true, reason: "missing_airtable_config" };
  }
  const lookup = await findPaymentByPaymentRef2(env, payload.payment_ref);
  const record = lookup.record;
  const fullFields = buildAirtableFields(env, payload, lookup, false);
  const minimalFields = buildAirtableFields(env, payload, lookup, true);
  try {
    if (record?.id) {
      await patchPaymentEvidence(env, record.id, fullFields);
      return { ok: true, mode: "update", record_id: record.id, lookup_error: lookup.error || null };
    }
    const created = await createPaymentEvidenceRecord(env, fullFields);
    return { ok: true, mode: "create", record_id: created?.id || null, lookup_error: lookup.error || null };
  } catch (err) {
    const firstError = String(err?.message || err);
    try {
      if (record?.id) {
        await patchPaymentEvidence(env, record.id, minimalFields);
        return { ok: true, mode: "update_minimal", record_id: record.id, retry_from: firstError, lookup_error: lookup.error || null };
      }
      const created = await createPaymentEvidenceRecord(env, minimalFields);
      return { ok: true, mode: "create_minimal", record_id: created?.id || null, retry_from: firstError, lookup_error: lookup.error || null };
    } catch (retryErr) {
      return {
        ok: false,
        error: String(retryErr?.message || retryErr),
        first_error: firstError,
        lookup_error: lookup.error || null
      };
    }
  }
}
__name(writeEvidencePendingReview, "writeEvidencePendingReview");
async function telegramSend2(env, text17, threadId2 = null) {
  const service = env.TELEGRAM_WORKER;
  const token4 = toStr2(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM);
  if (!service || typeof service.fetch !== "function") return { ok: false, skipped: true, reason: "telegram_router_binding_missing" };
  if (!token4) return { ok: false, skipped: true, reason: "telegram_router_auth_missing" };
  const thread = Number(toStr2(threadId2 || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || "22"));
  const flow = thread === 17 ? "points_threshold" : thread === 20 ? "membership" : "payment_proof";
  const res = await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token4}`
    },
    body: JSON.stringify({
      flow,
      text: toStr2(text17),
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  }));
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data?.ok === true && data?.telegram?.ok === true, status: res.status, data, flow };
}
__name(telegramSend2, "telegramSend");
function normalizeEvidenceStage(value3) {
  const raw = toStr2(value3).toLowerCase();
  if (!raw) return "";
  const allowed = /* @__PURE__ */ new Set(["deposit", "final", "tips", "full", "extension", "membership"]);
  if (allowed.has(raw)) return raw;
  return "";
}
__name(normalizeEvidenceStage, "normalizeEvidenceStage");
function getFileMeta(value3) {
  if (!value3 || typeof value3 !== "object") return null;
  const name = "name" in value3 ? toStr2(value3.name) : "";
  const type = "type" in value3 ? toStr2(value3.type) : "";
  const size = "size" in value3 ? Number(value3.size || 0) : 0;
  if (!name && !type && !size) return null;
  return { name, type, size };
}
__name(getFileMeta, "getFileMeta");
async function readSlipEvidenceForm(req) {
  const contentType = req.headers.get("Content-Type") || req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    const err = new Error("multipart_form_data_required");
    err.status = 415;
    throw err;
  }
  const form = await req.formData();
  const fileValue = form.get("file") || form.get("slip") || form.get("proof") || form.get("receipt") || form.get("receipt_photo") || null;
  const payment_ref = toStr2(form.get("payment_ref") || form.get("transaction_ref") || form.get("ref"));
  const session_id = toStr2(form.get("session_id") || form.get("sid"));
  const payment_stage = normalizeEvidenceStage(form.get("payment_stage") || form.get("payment_type") || form.get("stage"));
  const proof_type = toStr2(form.get("proof_type") || "payment_slip") || "payment_slip";
  const source_page = toStr2(form.get("source_page") || form.get("from") || "payment_confirmation");
  const token_present = !!toStr2(form.get("t") || form.get("token"));
  const file_meta = getFileMeta(fileValue);
  if (!payment_ref && !session_id) {
    const err = new Error("missing_payment_ref_or_session_id");
    err.status = 400;
    throw err;
  }
  return {
    payment_ref,
    session_id,
    payment_stage,
    proof_type,
    source_page,
    token_present,
    file_meta,
    file_received: !!file_meta
  };
}
__name(readSlipEvidenceForm, "readSlipEvidenceForm");
async function notifySlipEvidence(env, payload, airtableWrite2) {
  const text17 = [
    "\u{1F9FE} <b>SLIP EVIDENCE RECEIVED</b>",
    "<b>Evidence only. Official verification required.</b>",
    payload.payment_ref ? `Ref: <code>${esc2(payload.payment_ref)}</code>` : "",
    payload.session_id ? `Session: <code>${esc2(payload.session_id)}</code>` : "",
    payload.payment_stage ? `Stage: <b>${esc2(payload.payment_stage)}</b>` : "",
    payload.proof_type ? `Proof: <b>${esc2(payload.proof_type)}</b>` : "",
    payload.source_page ? `Source: ${esc2(payload.source_page)}` : "",
    payload.file_meta?.name ? `File: ${esc2(payload.file_meta.name)}` : "File: not included",
    payload.file_meta?.size ? `Size: ${Number(payload.file_meta.size)} bytes` : "",
    airtableWrite2?.record_id ? `Airtable: <code>${esc2(airtableWrite2.record_id)}</code>` : ""
  ].filter(Boolean).join("\n");
  return telegramSend2(env, text17, env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || "21");
}
__name(notifySlipEvidence, "notifySlipEvidence");
function methodNotAllowed(req, env) {
  return withCors2(
    req,
    env,
    jsonResponse2(
      {
        ok: false,
        error: "method_not_allowed",
        message: "Use POST multipart/form-data for slip evidence upload."
      },
      405,
      { Allow: "POST" }
    )
  );
}
__name(methodNotAllowed, "methodNotAllowed");
async function handleSlipEvidence(req, env) {
  try {
    const payload = await readSlipEvidenceForm(req);
    const airtable_write = await writeEvidencePendingReview(env, payload).catch((err) => ({
      ok: false,
      error: String(err?.message || err)
    }));
    const unifiedWrapped = req.headers.get("x-mmd-unified-slip-evidence") === "1";
    const telegram_notify = unifiedWrapped ? { ok: true, skipped: true, reason: "unified_wrapper_handles_telegram" } : await notifySlipEvidence(env, payload, airtable_write).catch((err) => ({
      ok: false,
      error: String(err?.message || err)
    }));
    return withCors2(
      req,
      env,
      jsonResponse2({
        ok: true,
        evidence_only: true,
        official_verification_required: true,
        verification_status: "pending",
        payment_status: "pending",
        payment_ref: payload.payment_ref || null,
        session_id: payload.session_id || null,
        payment_stage: payload.payment_stage || null,
        proof_type: payload.proof_type,
        source_page: payload.source_page,
        file_received: payload.file_received,
        file_meta: payload.file_meta,
        storage: "not_stored_by_this_route",
        airtable_write,
        telegram_notify,
        message: "Slip evidence received. Official verification is still required."
      })
    );
  } catch (err) {
    const status = Number(err?.status || 400);
    return withCors2(
      req,
      env,
      jsonResponse2(
        {
          ok: false,
          evidence_only: true,
          official_verification_required: true,
          error: String(err?.message || err)
        },
        status
      )
    );
  }
}
__name(handleSlipEvidence, "handleSlipEvidence");
var index_with_slip_evidence_default = {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/g, "") || "/";
    const method = req.method.toUpperCase();
    if (path === SLIP_EVIDENCE_PATH) {
      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: buildCorsHeaders2(req, env) });
      }
      if (method !== "POST") return methodNotAllowed(req, env);
      return handleSlipEvidence(req, env);
    }
    return index_default.fetch(req, env, ctx);
  }
};

// points-phase1.js
var AIRTABLE_API3 = "https://api.airtable.com/v0";
var RATE_THB = 100;
var POINTS_TTL_MS = 365 * 24 * 60 * 60 * 1e3;
var ELIGIBLE_STAGES = /* @__PURE__ */ new Set(["deposit", "full", "membership"]);
function computePhase1Points(priorRemainderThb, eligibleAmountThb) {
  const prior = normalizeWholeThb(priorRemainderThb);
  const eligible = normalizeWholeThb(eligibleAmountThb);
  const pool = prior + eligible;
  return {
    prior_remainder_thb: prior,
    eligible_amount_thb: eligible,
    pool_thb: pool,
    points: Math.floor(pool / RATE_THB),
    remainder_after_thb: pool % RATE_THB,
    rate_thb_per_point: RATE_THB
  };
}
__name(computePhase1Points, "computePhase1Points");
async function awardBasePointsPhase1(env, payload) {
  const stage2 = clean(payload.stage).toLowerCase();
  if (!ELIGIBLE_STAGES.has(stage2)) {
    return { ok: true, skipped: true, reason: "stage_not_eligible" };
  }
  requireAirtable(env);
  const paymentRef = clean(payload.payment_ref);
  if (!paymentRef) return { ok: false, skipped: true, reason: "payment_ref_required" };
  const suppliedId = canonicalMemberId(payload);
  const email5 = clean(payload.member_email).toLowerCase();
  const memberId = suppliedId === null ? "" : email5 ? await resolveCanonicalMemberId(env, email5, suppliedId) : suppliedId;
  if (!memberId) {
    return { ok: true, skipped: true, awarded: false, reason: "canonical_member_id_required" };
  }
  if (!env.POINTS_PHASE1_COORDINATOR) {
    throw new Error("points_phase1_coordinator_missing");
  }
  const id = env.POINTS_PHASE1_COORDINATOR.idFromName(`member:${memberId}`);
  const stub = env.POINTS_PHASE1_COORDINATOR.get(id);
  const response = await stub.fetch("https://points.internal/award", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      payment_ref: paymentRef,
      stage: stage2,
      session_id: clean(payload.session_id),
      amount_thb: payload.amount_thb,
      member_id: memberId,
      member_email: clean(payload.member_email).toLowerCase()
    })
  });
  const result3 = await response.json().catch(() => null);
  if (!response.ok || !result3) throw new Error(result3?.error || `points_phase1_coordinator_${response.status}`);
  return result3;
}
__name(awardBasePointsPhase1, "awardBasePointsPhase1");
var PointsPhase1Coordinator = class {
  static {
    __name(this, "PointsPhase1Coordinator");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  async fetch(request2) {
    if (request2.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    const body = await request2.json().catch(() => ({}));
    try {
      const result3 = await writeSerializedLedgerEvent(this.env, body);
      return json(result3, 200);
    } catch (error2) {
      return json({ ok: false, error: String(error2?.message || error2 || "points_phase1_failed") }, 500);
    }
  }
};
async function writeSerializedLedgerEvent(env, payload) {
  requireAirtable(env);
  const paymentRef = clean(payload.payment_ref);
  const memberId = canonicalMemberId(payload);
  if (!paymentRef) throw new Error("payment_ref_required");
  if (!memberId) throw new Error("canonical_member_id_required");
  const ledgerTable = clean(env.AIRTABLE_TABLE_POINTS_LEDGER || "tbl5dfnwjUFMLbnWL");
  const duplicate = await findFirst(env, ledgerTable, `{payment_ref}=${formulaText(paymentRef)}`);
  if (duplicate?.id) {
    if (canonicalMemberId(duplicate.fields || {}) !== memberId) throw new Error("canonical_member_id_required");
    return {
      ok: true,
      duplicate: true,
      awarded: false,
      record_id: duplicate.id,
      member_id: clean(duplicate.fields?.member_id || memberId),
      points: Number(duplicate.fields?.points || 0),
      remainder_after_thb: Number(duplicate.fields?.remainder_after_thb || 0)
    };
  }
  const latest = await findLatestBaseEntry(env, ledgerTable, memberId);
  const priorRemainder = Number(latest?.fields?.remainder_after_thb || 0);
  const computed = computePhase1Points(priorRemainder, payload.amount_thb);
  const postedAt = (/* @__PURE__ */ new Date()).toISOString();
  const expiresAt = new Date(Date.parse(postedAt) + POINTS_TTL_MS).toISOString();
  const record = await createRecord(env, ledgerTable, {
    member_id: memberId,
    member_email: clean(payload.member_email).toLowerCase(),
    payment_ref: paymentRef,
    session_id: clean(payload.session_id),
    amount_thb: computed.eligible_amount_thb,
    eligible_amount_thb: computed.eligible_amount_thb,
    prior_remainder_thb: computed.prior_remainder_thb,
    pool_thb: computed.pool_thb,
    points: computed.points,
    remainder_after_thb: computed.remainder_after_thb,
    points_bucket: "base_phase1",
    rate_policy: "phase1_100_thb_1_pt_remainder",
    source: "system",
    note: "Base Points. Writer: payments-worker. Each awarded lot expires 365 days after posted_at; redemption consumes the nearest expiry first.",
    idempotency_key: `base_phase1:${paymentRef}`,
    posted_at: postedAt,
    expires_at: expiresAt,
    transaction_status: "posted"
  });
  return {
    ok: true,
    awarded: computed.points > 0,
    record_id: record?.id || null,
    member_id: memberId,
    ...computed,
    expires_at: expiresAt
  };
}
__name(writeSerializedLedgerEvent, "writeSerializedLedgerEvent");
function canonicalMemberId(fields2 = {}) {
  const values = [];
  for (const key of ["member_id", "Member ID"]) {
    const value3 = fields2[key];
    if (value3 == null || value3 === "") continue;
    if (typeof value3 !== "string") return null;
    const id = value3.trim();
    if (id) values.push(id);
  }
  const ids3 = [...new Set(values)];
  return ids3.length > 1 ? null : ids3[0] || "";
}
__name(canonicalMemberId, "canonicalMemberId");
async function resolveCanonicalMemberId(env, emailRaw, suppliedId = "") {
  const email5 = clean(emailRaw).toLowerCase();
  if (!email5 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email5)) return "";
  const table7 = clean(env.AIRTABLE_TABLE_MEMBERS || env.AIRTABLE_TABLE_MEMBERS_ID || "Members");
  const formulas = [
    `LOWER({email})=${formulaText(email5)}`,
    `LOWER({Contact Email})=${formulaText(email5)}`,
    `LOWER({member_email})=${formulaText(email5)}`
  ];
  const matches2 = /* @__PURE__ */ new Map();
  for (const formula5 of formulas) {
    try {
      const qs = new URLSearchParams({ maxRecords: "2", pageSize: "2", filterByFormula: formula5 });
      const data = await airtable(env, `${encodeURIComponent(table7)}?${qs.toString()}`, { method: "GET" });
      if (!Array.isArray(data?.records) || data.offset || data.records.length > 1) return "";
      for (const row of data.records) {
        const id = canonicalMemberId(row?.fields || {});
        if (!row?.id || !id || suppliedId && suppliedId !== id) return "";
        if (matches2.has(row.id) && matches2.get(row.id) !== id) return "";
        matches2.set(row.id, id);
      }
    } catch (error2) {
      if (!/^airtable_422:/.test(String(error2?.message)) || !/Unknown field names?|UNKNOWN_FIELD_NAME/i.test(String(error2?.message))) return "";
    }
  }
  return matches2.size === 1 ? [...matches2.values()][0] : "";
}
__name(resolveCanonicalMemberId, "resolveCanonicalMemberId");
async function findLatestBaseEntry(env, table7, memberId) {
  const qs = new URLSearchParams({
    maxRecords: "1",
    pageSize: "1",
    filterByFormula: `AND({member_id}=${formulaText(memberId)},{points_bucket}=${formulaText("base_phase1")})`
  });
  qs.set("sort[0][field]", "posted_at");
  qs.set("sort[0][direction]", "desc");
  const data = await airtable(env, `${encodeURIComponent(table7)}?${qs.toString()}`, { method: "GET" });
  return data?.records?.[0] || null;
}
__name(findLatestBaseEntry, "findLatestBaseEntry");
async function findFirst(env, table7, formula5) {
  const qs = new URLSearchParams({ maxRecords: "1", pageSize: "1", filterByFormula: formula5 });
  const data = await airtable(env, `${encodeURIComponent(table7)}?${qs.toString()}`, { method: "GET" });
  return data?.records?.[0] || null;
}
__name(findFirst, "findFirst");
async function createRecord(env, table7, fields2) {
  const data = await airtable(env, encodeURIComponent(table7), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: compact3(fields2) }] })
  });
  return data?.records?.[0] || null;
}
__name(createRecord, "createRecord");
async function airtable(env, path, init) {
  const response = await fetch(`${AIRTABLE_API3}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`,
      "content-type": "application/json",
      ...init?.headers || {}
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}:${JSON.stringify(data)}`);
  return data;
}
__name(airtable, "airtable");
function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) throw new Error("airtable_config_missing");
}
__name(requireAirtable, "requireAirtable");
function normalizeWholeThb(value3) {
  const n = Number(value3 || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
__name(normalizeWholeThb, "normalizeWholeThb");
function formulaText(value3) {
  return `"${clean(value3).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
__name(formulaText, "formulaText");
function clean(value3) {
  return String(value3 ?? "").trim();
}
__name(clean, "clean");
function compact3(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value3]) => value3 !== void 0 && value3 !== ""));
}
__name(compact3, "compact");
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
__name(json, "json");

// ../shared/confirmation-revision.mjs
var fields = ["fldpnqoIsUMfN7y3c", "fldBeG0FkWwa8kgnp", "fldiDSz0wW9Ct9I3P", "fldIiRpaxoafjTkFt", "fldoUDQ8sH93idPx0", "fldmwuvOaiCFdzzRa", "fldrXQAyOMPCvbOaY", "fld6P6if0vDZCeV0C"];
var fail2 = /* @__PURE__ */ __name((code15) => {
  throw Object.assign(new Error(code15), { status: 503 });
}, "fail");
async function confirmationRevision(env, session, sessionId) { return __mmdOwnerRevision2736.confirmationRevision(env, session, sessionId); }

// ../shared/shop-brand-context.mjs
var SHOP_BRANDS = Object.freeze({
  shop: Object.freeze({ key: "shop", publicName: "Himai Shop", title: "HIMAI SHOP", root: "/shop", prefix: "HIMAI", paymentFlow: "himai_payments", paymentThread: 158, alertThread: 159 }),
  "mmd-shop": Object.freeze({ key: "mmd-shop", publicName: "MMD Shop", title: "MMD SHOP", root: "/mmd-shop", prefix: "MMD", paymentFlow: "mmd_shop_payments", paymentThread: 161, alertThread: 162 })
});
function value2(v) {
  return String(v && typeof v === "object" ? v.name || "" : v || "").trim();
}
__name(value2, "value");
function normalizeShopBrand(v) {
  const key = value2(v).toLowerCase().replace(/\s+/g, " ");
  if (["shop", "himai", "himai shop"].includes(key)) return "shop";
  if (["mmd", "mmd-shop", "mmd shop"].includes(key)) return "mmd-shop";
  return null;
}
__name(normalizeShopBrand, "normalizeShopBrand");
function conflict(message) {
  return Object.assign(new Error(message), { status: 409 });
}
__name(conflict, "conflict");
function resolvePersistedShopBrand(record = {}) {
  const f = record.fields || record;
  const evidence = [];
  for (const key of ["fld97aHqq3IbPam84", "Shop Brand", "shop_brand"]) {
    if (!value2(f[key])) continue;
    const brand = normalizeShopBrand(f[key]);
    if (!brand) throw conflict("shop_brand_unknown");
    evidence.push(brand);
  }
  const notes = [f.fldWG0u77XQ5W0wpT, f.fldjsZIKoJPawlb2u, f.Notes, f.notes].map(value2).join("\n");
  for (const match of notes.matchAll(/(?:^|[;\n])\s*shop_brand=([^;\n]+)/g)) {
    const brand = normalizeShopBrand(match[1]);
    if (!brand) throw conflict("shop_brand_unknown");
    evidence.push(brand);
  }
  const ids3 = [f.flde515MCoEq08YzU, f["Order ID"], f.order_id, f.fld2wdhBvc8xrV6y5, f["Session ID"], f.session_id].map(value2).filter(Boolean);
  for (const id of ids3) {
    if (/^HIMAI-/i.test(id)) evidence.push("shop");
    else if (/^MMD-/i.test(id)) evidence.push("mmd-shop");
  }
  if (new Set(evidence).size > 1) throw conflict("shop_brand_conflict");
  return SHOP_BRANDS[evidence[0] || "mmd-shop"];
}
__name(resolvePersistedShopBrand, "resolvePersistedShopBrand");
function shopPaymentThreads(env, brand) {
  const read2 = /* @__PURE__ */ __name((name, fallback) => {
    const n = Number(env[name]);
    return Number.isSafeInteger(n) && n > 0 ? n : fallback;
  }, "read");
  const prefix2 = brand.key === "shop" ? "TG_THREAD_HIMAI" : "TG_THREAD_MMD_SHOP";
  return { thread_id: read2(prefix2 + "_PAYMENTS", brand.paymentThread), alerts_thread_id: read2(prefix2 + "_ALERTS", brand.alertThread) };
}
__name(shopPaymentThreads, "shopPaymentThreads");

// ../shared/payment-intelligence.mjs
var MEMBERSHIP_AMOUNTS = Object.freeze({
  499: { package_code: "standard", intent: "renewal", price_rule: "private_standard_spend_50000" },
  690: { package_code: "mmd_member", intent: "membership", price_rule: "public_member" },
  799: { package_code: "standard", intent: "renewal", price_rule: "private_standard_spend_10000" },
  999: { package_code: "premium", intent: "renewal", price_rule: "private_premium_spend_100000" },
  1e3: { package_code: "standard", intent: "renewal", price_rule: "private_standard_renewal" },
  1199: { package_code: "standard", intent: "signup", price_rule: "private_standard_signup" },
  1999: { package_code: "premium", intent: "renewal", price_rule: "private_premium_spend_20000" },
  2500: { package_code: "premium", intent: "renewal", price_rule: "private_premium_renewal" },
  2999: { package_code: "premium", intent: "signup", price_rule: "private_premium_signup" },
  4990: { package_code: "elite", intent: "membership", price_rule: "public_elite" },
  11499: { package_code: "red_card", intent: "membership", price_rule: "public_red_card" }
});
var TERM_DAYS = Object.freeze({ standard: 365, premium: 730, mmd_member: 365, elite: 730, red_card: 365 });
var PUBLIC_MEMBERSHIP_CATALOG = Object.freeze({
  mmd_member: Object.freeze({
    package_code: "mmd_member",
    label: "MMD Member",
    amount_thb: 690,
    duration_days: 365,
    entitlement_level: "public_member"
  }),
  elite: Object.freeze({
    package_code: "elite",
    label: "Elite",
    amount_thb: 4990,
    duration_days: 730,
    entitlement_level: "elite"
  }),
  red_card: Object.freeze({
    package_code: "red_card",
    label: "Red Card",
    amount_thb: 11499,
    duration_days: 365,
    entitlement_level: "red_card"
  })
});
var MEMBERSHIP_STAGES = /* @__PURE__ */ new Set(["membership", "member", "renewal", "member_renewal", "membership_fee", "signup"]);
var SERVICE_STAGES = /* @__PURE__ */ new Set(["deposit", "final", "balance", "tips", "tip", "full", "extension", "service", "booking"]);
var MEMBERSHIP_PACKAGES = /* @__PURE__ */ new Set(["standard", "premium", "mmd_member", "elite", "red_card"]);
var MEMBERSHIP_SOURCE_RE = /(?:^|[_\s-])(pay_membership|member_payments|membership|member_renewal|renewal)(?:$|[_\s-])/i;
var MEMBERSHIP_CONTEXT_RE = /(?:ค่าสมาชิก|ต่ออายุ(?:สมาชิก)?|สมัคร(?:สมาชิก)?|membership|member\s*(?:fee|renewal)|renewal|renew\b|mmd\s*member|elite\s*membership|red\s*card|private\s*(?:standard|premium))/i;
var SERVICE_CONTEXT_RE = /(?:มัดจำ|ยอดคงเหลือ|ค่าบริการ|ค่างาน|deposit|balance|service\s*fee|booking\s*payment|final\s*payment|tips?)/i;
var clean2 = /* @__PURE__ */ __name((value3) => value3 == null ? "" : String(value3).trim(), "clean");
var token = /* @__PURE__ */ __name((value3) => clean2(value3).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""), "token");
var moneyKey = /* @__PURE__ */ __name((value3) => {
  const amount3 = Number(value3);
  return Number.isFinite(amount3) && amount3 > 0 && Math.abs(amount3 - Math.round(amount3)) < 0.01 ? Math.round(amount3) : null;
}, "moneyKey");
function canonicalMembershipPackage(value3) {
  const raw = token(value3);
  if (!raw) return "";
  if (["mmd_member", "member_690", "public_member", "membership"].includes(raw)) return "mmd_member";
  if (["elite", "elite_membership"].includes(raw)) return "elite";
  if (["red_card", "redcard"].includes(raw)) return "red_card";
  if (raw.includes("premium")) return "premium";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  return "";
}
__name(canonicalMembershipPackage, "canonicalMembershipPackage");
function paymentPresentationLane({ package_code = "", payment_stage = "" } = {}) {
  const packageCode = token(package_code);
  const stage2 = token(payment_stage);
  if (packageCode === "tmib_act_001" || stage2 === "tmib_story") return "public";
  if (PUBLIC_MEMBERSHIP_CATALOG[canonicalMembershipPackage(packageCode)] && MEMBERSHIP_STAGES.has(stage2 || "membership")) return "public";
  return "sigil";
}
__name(paymentPresentationLane, "paymentPresentationLane");
function inferMembershipPayment({ amount_thb, linked_member = false, linked_renewal = false, package_code = "", source_context = "" } = {}) {
  const amount3 = moneyKey(amount_thb);
  const rule = amount3 == null ? null : MEMBERSHIP_AMOUNTS[amount3];
  if (!rule) return null;
  const explicitPackage = clean2(package_code).toLowerCase();
  const packageMatches = !explicitPackage || explicitPackage === rule.package_code;
  const renewalEvidence = Boolean(linked_renewal) || Boolean(linked_member) && rule.intent === "renewal";
  const confidence = !packageMatches ? 0.35 : linked_renewal ? 0.99 : renewalEvidence ? 0.94 : rule.intent === "renewal" ? 0.78 : 0.72;
  return {
    schema: "mmd_payment_intelligence_v1",
    inferred_stage: "membership",
    inferred_intent: rule.intent,
    inferred_package_code: rule.package_code,
    inferred_price_rule: rule.price_rule,
    inferred_term_days: TERM_DAYS[rule.package_code] || null,
    confidence,
    identity_state: linked_member ? "canonical_member_linked" : "pending_identity_match",
    pending_member_profile: !linked_member,
    history_lookup_requested: !linked_member,
    official_verification_required: true,
    may_activate_membership: false,
    source_context: clean2(source_context) || null
  };
}
__name(inferMembershipPayment, "inferMembershipPayment");
function classifyPaymentOpsRoute({
  payment_stage = "",
  amount_thb = null,
  linked_member = false,
  linked_renewal = false,
  package_code = "",
  source_context = "",
  source_page = "",
  context_text = ""
} = {}) {
  const stage2 = token(payment_stage);
  const canonicalPackage5 = canonicalMembershipPackage(package_code);
  const source = [clean2(source_context), clean2(source_page)].filter(Boolean).join(" ");
  const context = clean2(context_text);
  const serviceStage = SERVICE_STAGES.has(stage2);
  const membershipStage = MEMBERSHIP_STAGES.has(stage2);
  const membershipPackage = MEMBERSHIP_PACKAGES.has(canonicalPackage5);
  const membershipSource = MEMBERSHIP_SOURCE_RE.test(source);
  const membershipText = MEMBERSHIP_CONTEXT_RE.test(context);
  const serviceText = SERVICE_CONTEXT_RE.test(context);
  const explicitMembership = membershipStage || membershipPackage || membershipSource || membershipText;
  const explicitService = serviceStage || serviceText;
  const inference = inferMembershipPayment({
    amount_thb,
    linked_member,
    linked_renewal,
    package_code: canonicalPackage5 || package_code,
    source_context: source || source_context
  });
  const base = {
    schema: "mmd_payment_ops_route_v1",
    official_verification_required: true,
    may_activate_membership: false,
    inferred_membership: Boolean(inference),
    inference
  };
  if (explicitService && explicitMembership) {
    return {
      ...base,
      topic: "payment",
      flow: "payment_proof",
      classification: "conflict",
      confidence: 1,
      reason: "conflicting_payment_context",
      should_alert: true
    };
  }
  if (explicitService) {
    return {
      ...base,
      topic: "payment",
      flow: "payment_proof",
      classification: "service_payment",
      confidence: 1,
      reason: "explicit_service_context",
      should_alert: false
    };
  }
  if (explicitMembership) {
    if (inference && canonicalPackage5 && inference.inferred_package_code !== canonicalPackage5) {
      return {
        ...base,
        topic: "payment",
        flow: "payment_proof",
        classification: "conflict",
        confidence: 1,
        reason: "membership_amount_package_mismatch",
        should_alert: true
      };
    }
    return {
      ...base,
      topic: "membership",
      flow: "membership",
      classification: "membership_payment",
      confidence: membershipStage || membershipPackage || membershipSource ? 1 : 0.96,
      reason: inference ? "explicit_membership_context_with_amount_match" : "explicit_membership_context",
      should_alert: false
    };
  }
  if (inference) {
    return {
      ...base,
      topic: "payment",
      flow: "payment_proof",
      classification: "unresolved_payment",
      confidence: Math.min(Number(inference.confidence || 0), 0.78),
      reason: "amount_matches_membership_but_context_unconfirmed",
      should_alert: false
    };
  }
  return {
    ...base,
    topic: "payment",
    flow: "payment_proof",
    classification: "unresolved_payment",
    confidence: explicitService ? 1 : 0.5,
    reason: "membership_context_not_confirmed",
    should_alert: false
  };
}
__name(classifyPaymentOpsRoute, "classifyPaymentOpsRoute");
function membershipInferenceLabel(inference) {
  if (!inference) return "";
  const packages = { standard: "Private Standard", premium: "Private Premium", mmd_member: "MMD Member", elite: "Elite Membership", red_card: "Red Card" };
  const actions = { renewal: "\u0E15\u0E48\u0E2D\u0E2D\u0E32\u0E22\u0E38", signup: "\u0E2A\u0E21\u0E31\u0E04\u0E23\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01", membership: "\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01" };
  return `${actions[inference.inferred_intent] || "\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01"} ${packages[inference.inferred_package_code] || inference.inferred_package_code}`.trim();
}
__name(membershipInferenceLabel, "membershipInferenceLabel");

// ../shared/canonical-payment-evidence.mjs
var text3 = /* @__PURE__ */ __name((value3) => String(value3 ?? "").trim(), "text");
async function paymentEvidenceKey(paymentRef) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text3(paymentRef)));
  return `payment-evidence/locks/${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}.json`;
}
__name(paymentEvidenceKey, "paymentEvidenceKey");
async function withPaymentEvidenceLock(bucket, paymentRef, operation) {
  if (!bucket?.get || !bucket?.put) throw Object.assign(new Error("payment_evidence_storage_unavailable"), { status: 503 });
  const key = await paymentEvidenceKey(paymentRef);
  const current = await bucket.get(key);
  const previous = current ? JSON.parse(await current.text()) : null;
  if (previous?.until > Date.now()) throw Object.assign(new Error("payment_evidence_intake_in_progress"), { status: 409 });
  const lease = { until: Date.now() + 3e5, nonce: crypto.randomUUID() };
  const stored = await bucket.put(key, JSON.stringify(lease), {
    onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" }
  });
  if (stored === null) throw Object.assign(new Error("payment_evidence_intake_in_progress"), { status: 409 });
  try {
    return await operation();
  } finally {
    await bucket.put(key, JSON.stringify({ until: 0, nonce: lease.nonce }), {
      onlyIf: { etagMatches: stored.etag },
      httpMetadata: { contentType: "application/json" }
    }).catch(() => {
    });
  }
}
__name(withPaymentEvidenceLock, "withPaymentEvidenceLock");

// ../shared/payment-proof-precheck.mjs
var text4 = /* @__PURE__ */ __name((value3) => String(value3 ?? "").trim(), "text");
var ids2 = /* @__PURE__ */ __name((value3) => Array.isArray(value3) ? [...new Set(value3.map(text4).filter(Boolean))] : [], "ids");
var quote2 = /* @__PURE__ */ __name((value3) => text4(value3).replace(/\\/g, "\\\\").replace(/'/g, "\\'"), "quote");
var money = /* @__PURE__ */ __name((value3) => value3 !== null && value3 !== void 0 && text4(value3) !== "" && Number.isFinite(Number(value3)) && Number(value3) > 0 ? Number(value3) : null, "money");
var stopped = /* @__PURE__ */ __name((value3) => /^(?:cancelled|canceled|rejected|void|refunded|failed|revoked)$/.test(text4(value3).toLowerCase()), "stopped");
var evidenceSchemas = /* @__PURE__ */ new Set(["mmd_web_payment_proof_v1", "mmd_shop_payment_proof_v1", "line_payment_evidence_v3", "line_payment_evidence_v4", "mmd_admin_slip_upload_v1"]);
function paymentProofReviewUrl(proofId, sessionId = "") {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(text4(proofId))) return null;
  const params = new URLSearchParams({ proof_id: proofId, focus: "verify" });
  if (/^sess[-_][A-Za-z0-9_-]{1,210}$/.test(text4(sessionId))) params.set("session_id", sessionId);
  return `https://www.mmdbkk.com/internal/admin/payments?${params}`;
}
__name(paymentProofReviewUrl, "paymentProofReviewUrl");
function paymentProofNote(value3) {
  try {
    const note = JSON.parse(text4(value3));
    if (note && typeof note === "object" && !Array.isArray(note)) return note;
  } catch {
  }
  return Object.fromEntries(text4(value3).split(/;\s*/).map((part) => {
    const i = part.indexOf("=");
    return i > 0 ? [part.slice(0, i), part.slice(i + 1)] : [];
  }).filter((part) => part.length === 2));
}
__name(paymentProofNote, "paymentProofNote");
function paymentProofIdentity(proof = {}) {
  const f = proof.fields || {}, n = paymentProofNote(f.note), x = n.extraction || {};
  const trusted = evidenceSchemas.has(n.schema);
  const hash = trusted ? text4(n.evidence_sha256).toLowerCase() : "";
  const ref = trusted ? text4(x.bank_transaction_ref || x.provider_txn_id || n.manual_evidence_review?.bank_reference) : "";
  const at = text4(x.paid_at || n.manual_evidence_review?.paid_at || f.paid_at);
  return {
    hash: /^[a-f0-9]{64}$/.test(hash) ? hash : "",
    bankRef: /^[A-Za-z0-9][A-Za-z0-9._/ -]{2,179}$/.test(ref) ? ref : "",
    bank: text4(x.sender_bank || x.provider).toLowerCase(),
    receiverBank: text4(x.receiver_bank).toLowerCase(),
    amount: money(x.amount_thb ?? f.amount_thb),
    at: /T.*(?:Z|[+-]\d\d:\d\d)$/.test(at) && Number.isFinite(Date.parse(at)) ? Date.parse(at) : null,
    clients: ids2(f.Client || f.client || (n.links?.client ? [n.links.client] : [])),
    members: ids2(f.member || f.Member || (n.links?.member ? [n.links.member] : []))
  };
}
__name(paymentProofIdentity, "paymentProofIdentity");
function sameCustomer(a, b) {
  if ([a.clients, b.clients, a.members, b.members].some((v) => v.length > 1)) return false;
  if (a.clients.length && b.clients.length && a.clients[0] !== b.clients[0]) return false;
  if (a.members.length && b.members.length && a.members[0] !== b.members[0]) return false;
  return Boolean(a.clients[0] && a.clients[0] === b.clients[0] || a.members[0] && a.members[0] === b.members[0]);
}
__name(sameCustomer, "sameCustomer");
var table2 = /* @__PURE__ */ __name((env, kind) => kind === "proofs" ? text4(env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || "tblfJfM4Sqag9zrLi") : kind === "payments" ? text4(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ") : text4(env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX"), "table");
async function rows(env, kind, formula5, limit = 20) {
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) throw Error("precheck_not_configured");
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table2(env, kind))}`);
  url.searchParams.set("filterByFormula", formula5);
  url.searchParams.set("pageSize", String(limit));
  const request2 = new Request(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` }, signal: AbortSignal.timeout(8e3) });
  const response = await (env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request2) : fetch(request2));
  if (!response.ok) throw Error("precheck_lookup_failed");
  const data = await response.json();
  if (data.offset || !Array.isArray(data.records) || data.records.length > limit) throw Error("precheck_incomplete");
  return data.records;
}
__name(rows, "rows");
async function canonicalContext(env, proof, identity) {
  const f = proof.fields || {}, ref = text4(f.payment_ref), linkedPayments = ids2(f.payment), linkedSessions = ids2(f.session);
  if (!ref || linkedPayments.length !== 1 || linkedSessions.length !== 1) return null;
  const payments = await rows(env, "payments", `{payment_ref}='${quote2(ref)}'`, 2);
  if (payments.length !== 1 || payments[0].id !== linkedPayments[0]) return null;
  const p = payments[0].fields || {}, pIdentity = paymentProofIdentity({ fields: p });
  if (!sameCustomer(identity, pIdentity) || stopped(p.payment_status || p["Payment Status"])) return null;
  const sid = text4(p.session_id), stage2 = text4(p.payment_stage || p.payment_type).toLowerCase();
  if (!/^sess[-_][A-Za-z0-9_-]{1,210}$/.test(sid) || !["deposit", "full", "final", "tips"].includes(stage2)) return null;
  const sessions = await rows(env, "sessions", `{session_id}='${quote2(sid)}'`, 2);
  if (sessions.length !== 1 || sessions[0].id !== linkedSessions[0]) return null;
  const s = sessions[0].fields || {};
  if (!sameCustomer(identity, paymentProofIdentity({ fields: s })) || stopped(s["Session Status"] || s.session_state)) return null;
  return {
    status: "exact",
    payment_record_id: payments[0].id,
    payment_ref: ref,
    session_record_id: sessions[0].id,
    session_id: sid,
    payment_stage: stage2,
    expected_amount_thb: money(p.amount_thb ?? p.Amount),
    client_name: text4(s.client_name),
    model_name: text4(s.model_name),
    job_date: text4(s.job_date),
    start_time: text4(s.start_time),
    end_time: text4(s.end_time),
    location_name: text4(s.location_name)
  };
}
__name(canonicalContext, "canonicalContext");
function unavailableProofPrecheck(proofId) {
  return {
    schema: "payment_proof_precheck_v1",
    status: "unavailable",
    complete: false,
    duplicate_count: null,
    matches: [],
    canonical: null,
    primary_proof_id: text4(proofId),
    review_url: paymentProofReviewUrl(proofId),
    money_truth_changed: false,
    official_verification_required: true
  };
}
__name(unavailableProofPrecheck, "unavailableProofPrecheck");
async function inspectPaymentProof(env, proof) {
  const f = proof.fields || {}, proofId = text4(f.proof_id), identity = paymentProofIdentity(proof);
  const base = { ...unavailableProofPrecheck(proofId), status: "insufficient_evidence", complete: true, duplicate_count: 0 };
  const terms = [];
  if (identity.hash) terms.push(`FIND('${identity.hash}',{note})`);
  if (identity.bankRef) terms.push(`FIND('${quote2(identity.bankRef)}',{note})`);
  if (text4(f.payment_ref) && ids2(f.payment).length === 1) terms.push(`{payment_ref}='${quote2(f.payment_ref)}'`);
  if (!terms.length) return base;
  try {
    const candidates = await rows(env, "proofs", `OR(${terms.join(",")})`);
    const exact = [], possible = [];
    for (const row of candidates) {
      if (row.id === proof.id || text4(row.fields?.proof_id) === proofId || stopped(row.fields?.status)) continue;
      const n = paymentProofNote(row.fields?.note);
      if (n.schema === "mmd_historical_slip_backfill_v1") continue;
      const other = paymentProofIdentity(row);
      const hashMatch = identity.hash && identity.hash === other.hash;
      const bankMatch = identity.bankRef && identity.bankRef === other.bankRef;
      if (!hashMatch && !bankMatch) {
        if (text4(f.payment_ref) && text4(f.payment_ref) === text4(row.fields?.payment_ref) && sameCustomer(identity, other)) {
          possible.push({ proof_id: text4(row.fields?.proof_id), channel: text4(row.fields?.channel), basis: "same_payment_different_evidence", same_customer: true, conflict: false, row });
        }
        continue;
      }
      const conflict3 = identity.amount !== null && other.amount !== null && Math.abs(identity.amount - other.amount) > 9e-3 || identity.at !== null && other.at !== null && identity.at !== other.at || identity.bankRef && other.bankRef && identity.bankRef !== other.bankRef || identity.bank && other.bank && identity.bank !== other.bank || identity.receiverBank && other.receiverBank && identity.receiverBank !== other.receiverBank;
      const transactionMatch = bankMatch && identity.bank && identity.bank === other.bank && identity.amount !== null && other.amount !== null && identity.at !== null && identity.at === other.at;
      const match = {
        proof_id: text4(row.fields?.proof_id),
        channel: text4(row.fields?.channel),
        basis: hashMatch ? "same_image_sha256" : "same_bank_transaction",
        same_customer: sameCustomer(identity, other),
        conflict: Boolean(conflict3),
        row
      };
      (match.same_customer && !conflict3 && (hashMatch || transactionMatch) ? exact : possible).push(match);
    }
    const contexts = [];
    const linked = /* @__PURE__ */ new Map();
    for (const match of exact) {
      const f2 = match.row.fields || {};
      if (text4(f2.payment_ref) && ids2(f2.payment).length === 1 && ids2(f2.session).length === 1) linked.set(`${f2.payment_ref}:${ids2(f2.payment)[0]}:${ids2(f2.session)[0]}`, match);
    }
    if (linked.size === 1) {
      const match = [...linked.values()][0], context = await canonicalContext(env, match.row, identity);
      if (context) contexts.push({ match, context });
    }
    const keys = new Set(contexts.map((x) => `${x.context.payment_ref}:${x.context.session_id}`));
    const ambiguous = linked.size > 1 || keys.size > 1 || possible.length > 0;
    const selected = !ambiguous ? contexts[0] : null;
    const currentRef = text4(f.payment_ref), currentPayments = ids2(f.payment), currentSessions = ids2(f.session);
    const conflict2 = selected && (currentPayments.length > 1 || currentSessions.length > 1 || currentPayments.length === 1 && currentPayments[0] !== selected.context.payment_record_id || currentSessions.length === 1 && currentSessions[0] !== selected.context.session_record_id || currentRef && currentPayments.length && currentRef !== selected.context.payment_ref);
    const canonical = conflict2 ? null : selected?.context || null;
    const primary = canonical ? selected.match.proof_id : proofId;
    return {
      ...base,
      status: ambiguous || conflict2 ? "needs_review" : exact.length ? "duplicate" : "clear",
      duplicate_count: exact.length,
      matches: [...exact, ...possible].map(({ row, ...match }) => match),
      canonical,
      primary_proof_id: primary,
      review_url: paymentProofReviewUrl(primary, canonical?.session_id),
      issues: [ambiguous ? "duplicate_match_ambiguous" : "", possible.some((match) => match.basis === "same_payment_different_evidence") ? "existing_payment_proof_not_transfer_dedup" : "", conflict2 ? "existing_payment_context_conflict" : ""].filter(Boolean)
    };
  } catch {
    return unavailableProofPrecheck(proofId);
  }
}
__name(inspectPaymentProof, "inspectPaymentProof");
function proofPrecheckLines(check = {}) {
  if (check.issues?.includes("existing_payment_proof_not_transfer_dedup")) return ["\u26A0\uFE0F Payment \u0E19\u0E35\u0E49\u0E21\u0E35\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E40\u0E14\u0E34\u0E21\u0E41\u0E25\u0E49\u0E27 \xB7 \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E27\u0E48\u0E32\u0E20\u0E32\u0E1E\u0E43\u0E2B\u0E21\u0E48\u0E40\u0E1B\u0E47\u0E19\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E0B\u0E49\u0E33", "\u0E40\u0E1B\u0E34\u0E14\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E14\u0E34\u0E21\u0E40\u0E1E\u0E37\u0E48\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E01\u0E48\u0E2D\u0E19\u0E19\u0E31\u0E1A\u0E22\u0E2D\u0E14\u0E23\u0E31\u0E1A"];
  if (check.status === "duplicate") {
    const sources = [...new Set((check.matches || []).map((match) => match.channel === "web_pay" ? "\u0E2B\u0E19\u0E49\u0E32 Payment" : ["line", "line_oa", "line_ofc"].includes(match.channel) ? "LINE OFC" : "\u0E04\u0E34\u0E27\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E40\u0E14\u0E34\u0E21"))];
    return ["\u26A0\uFE0F \u0E1E\u0E1A\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E0B\u0E49\u0E33\u0E08\u0E32\u0E01\u0E0A\u0E48\u0E2D\u0E07\u0E17\u0E32\u0E07\u0E2D\u0E37\u0E48\u0E19 \xB7 \u0E2D\u0E22\u0E48\u0E32\u0E19\u0E31\u0E1A\u0E22\u0E2D\u0E14\u0E23\u0E31\u0E1A\u0E0B\u0E49\u0E33", sources.length ? `\u0E15\u0E49\u0E19\u0E17\u0E32\u0E07\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E40\u0E14\u0E34\u0E21: ${sources.join(" / ")}` : "", "\u0E40\u0E17\u0E35\u0E22\u0E1A\u0E20\u0E32\u0E1E/\u0E40\u0E25\u0E02\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E01\u0E31\u0E1A\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E40\u0E14\u0E34\u0E21\u0E01\u0E48\u0E2D\u0E19\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E07\u0E34\u0E19\u0E40\u0E02\u0E49\u0E32"].filter(Boolean);
  }
  if (check.status === "needs_review") return ["\u26A0\uFE0F \u0E1E\u0E1A\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E17\u0E35\u0E48\u0E2D\u0E32\u0E08\u0E0B\u0E49\u0E33\u0E2B\u0E23\u0E37\u0E2D\u0E02\u0E49\u0E2D\u0E21\u0E39\u0E25\u0E02\u0E31\u0E14\u0E01\u0E31\u0E19 \xB7 \u0E15\u0E49\u0E2D\u0E07\u0E15\u0E23\u0E27\u0E08\u0E08\u0E31\u0E1A\u0E04\u0E39\u0E48\u0E01\u0E48\u0E2D\u0E19"];
  if (check.status === "clear") return ["\u0E15\u0E23\u0E27\u0E08\u0E40\u0E1A\u0E37\u0E49\u0E2D\u0E07\u0E15\u0E49\u0E19: \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1E\u0E1A\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E0B\u0E49\u0E33\u0E17\u0E35\u0E48\u0E15\u0E23\u0E07\u0E01\u0E31\u0E19 \xB7 \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E07\u0E34\u0E19\u0E40\u0E02\u0E49\u0E32"];
  return ["\u0E15\u0E23\u0E27\u0E08\u0E40\u0E1A\u0E37\u0E49\u0E2D\u0E07\u0E15\u0E49\u0E19\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E04\u0E23\u0E1A \xB7 \u0E15\u0E23\u0E27\u0E08\u0E20\u0E32\u0E1E\u0E41\u0E25\u0E30\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23\u0E40\u0E07\u0E34\u0E19\u0E40\u0E02\u0E49\u0E32\u0E01\u0E48\u0E2D\u0E19\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19"];
}
__name(proofPrecheckLines, "proofPrecheckLines");

// ../shared/payment-notification-outbox.mjs
var ROOT = "payment-notifications/v1/";
var LEASE_MS = 5 * 6e4;
var MAX_ATTEMPTS = 12;
var MAX_AGE_MS = 23 * 36e5;
var terminal = /* @__PURE__ */ __name((record) => ["delivered", "manual_review"].includes(record.status), "terminal");
var safeError = /* @__PURE__ */ __name((error2) => String(error2?.message || error2 || "delivery_failed").replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160), "safeError");
async function notificationDigest(value3) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value3)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(notificationDigest, "notificationDigest");
var prefix = /* @__PURE__ */ __name((lane) => `${ROOT}${lane}/records/`, "prefix");
var keyOf = /* @__PURE__ */ __name((lane, id) => `${prefix(lane)}${id}.json`, "keyOf");
var receiptKey = /* @__PURE__ */ __name((lane, id) => `${ROOT}${lane}/receipts/${id}.json`, "receiptKey");
async function read(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  return { record: JSON.parse(await object.text()), etag: object.etag };
}
__name(read, "read");
async function put(bucket, lane, record, etag) {
  return bucket.put(keyOf(lane, record.id), JSON.stringify(record), {
    onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
    customMetadata: { status: record.status, attempts: String(record.attempts) }
  });
}
__name(put, "put");
function result2(record, extra = {}) {
  return {
    id: record.id,
    durable: true,
    delivered: record.status === "delivered",
    queued: !terminal(record),
    status: record.status,
    attempts: record.attempts,
    result: record.result || null,
    ...extra
  };
}
__name(result2, "result");
async function archive(bucket, lane, record) {
  await bucket.put(receiptKey(lane, record.id), JSON.stringify(record), {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" }
  });
  if (bucket.delete) await bucket.delete(keyOf(lane, record.id));
}
__name(archive, "archive");
async function attempt({ bucket, lane, envelope, deliver, now }) {
  let { record, etag } = envelope;
  const completed = await read(bucket, receiptKey(lane, record.id));
  if (completed) {
    if (bucket.delete) await bucket.delete(keyOf(lane, record.id));
    return result2(completed.record, { duplicate: true });
  }
  if (terminal(record)) {
    await archive(bucket, lane, record);
    return result2(record, { duplicate: true });
  }
  if (record.lease_until > now || record.next_attempt_at > now) return result2(record, { duplicate: true });
  const expired = now - record.created_at >= MAX_AGE_MS;
  record = { ...record, status: expired ? "manual_review" : "delivering", attempts: record.attempts + (expired ? 0 : 1), lease_until: now + LEASE_MS };
  const claim = await put(bucket, lane, record, etag);
  if (claim === null) return { durable: true, delivered: false, queued: true, status: "delivering", duplicate: true };
  etag = claim.etag;
  if (expired) {
    await archive(bucket, lane, record);
    return result2(record);
  }
  const checkpoint = /* @__PURE__ */ __name(async (state) => {
    const next = { ...record, state };
    const saved2 = await put(bucket, lane, next, etag);
    if (saved2 === null) throw new Error("notification_lease_lost");
    record = next;
    etag = saved2.etag;
  }, "checkpoint");
  let outcome;
  try {
    outcome = await deliver(record, checkpoint);
  } catch (error2) {
    outcome = { ok: false, error: safeError(error2) };
  }
  const done = outcome?.ok === true;
  record = {
    ...record,
    status: done ? "delivered" : outcome?.retryable === false || record.attempts >= MAX_ATTEMPTS ? "manual_review" : "pending",
    lease_until: 0,
    next_attempt_at: done ? null : now + Math.min(36e5, 6e4 * 2 ** (record.attempts - 1)),
    updated_at: now,
    result: outcome?.result || null,
    last_error: done ? null : safeError(outcome?.error)
  };
  const saved = await put(bucket, lane, record, etag);
  if (saved === null) return { durable: true, delivered: false, queued: true, status: "delivering", state_write_conflict: true };
  if (terminal(record)) await archive(bucket, lane, record);
  return result2(record);
}
__name(attempt, "attempt");
async function dispatchPaymentNotification({ bucket, lane, eventKey, payload, deliver, now = Date.now() }) {
  const id = await notificationDigest(`${lane}:${eventKey}`);
  if (!bucket?.get || !bucket?.put) {
    const record = { id, payload, state: {}, attempts: 1, created_at: now };
    let outcome;
    try {
      outcome = await deliver(record, async (state) => {
        record.state = state;
      });
    } catch (error2) {
      outcome = { ok: false, error: safeError(error2) };
    }
    return { id, durable: false, delivered: outcome?.ok === true, queued: false, status: outcome?.ok ? "delivered" : "manual_review", result: outcome?.result || null };
  }
  const key = keyOf(lane, id);
  const receipt = await read(bucket, receiptKey(lane, id));
  if (receipt) return result2(receipt.record, { duplicate: true });
  let envelope = await read(bucket, key);
  if (!envelope) {
    const record = { schema: "payment_notification_v1", id, payload, state: {}, status: "pending", attempts: 0, created_at: now, next_attempt_at: now, lease_until: 0 };
    const created = await put(bucket, lane, record);
    envelope = created === null ? await read(bucket, key) : { record, etag: created.etag };
  }
  if (!envelope) throw new Error("notification_enqueue_failed");
  return attempt({ bucket, lane, envelope, deliver, now });
}
__name(dispatchPaymentNotification, "dispatchPaymentNotification");
async function drainPaymentNotifications({ bucket, lane, deliver, now = Date.now(), limit = 5 }) {
  if (!bucket?.get || !bucket?.put || !bucket?.list) return { skipped: "outbox_unavailable" };
  limit = Math.max(1, Math.min(10, Number(limit) || 5));
  const cursorKey = `${ROOT}${lane}/cursor.json`;
  const savedCursor = await read(bucket, cursorKey);
  const listing = await bucket.list({ prefix: prefix(lane), limit, ...savedCursor?.record?.cursor ? { cursor: savedCursor.record.cursor } : {} });
  const summary2 = { scanned: 0, delivered: 0, pending: 0, manual_review: 0 };
  for (const object of listing.objects || []) {
    const envelope = await read(bucket, object.key);
    if (!envelope) continue;
    summary2.scanned += 1;
    const outcome = await attempt({ bucket, lane, envelope, deliver, now });
    if (outcome.delivered) summary2.delivered += 1;
    else if (outcome.status === "manual_review") summary2.manual_review += 1;
    else summary2.pending += 1;
  }
  await bucket.put(cursorKey, JSON.stringify({ cursor: listing.truncated ? listing.cursor : null }), { httpMetadata: { contentType: "application/json" } });
  return summary2;
}
__name(drainPaymentNotifications, "drainPaymentNotifications");

// lib/payment-primitives.js
function formulaValue(value3) {
  return String(value3 || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
__name(formulaValue, "formulaValue");
function httpError(status, message) {
  const error2 = new Error(message);
  error2.status = status;
  return error2;
}
__name(httpError, "httpError");
async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(left ?? "").trim())),
    crypto.subtle.digest("SHA-256", encoder.encode(String(right ?? "").trim()))
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < aa.length; i += 1) difference |= aa[i] ^ bb[i];
  return difference === 0;
}
__name(constantTimeEqual, "constantTimeEqual");

// unified-payment-proof.js
var AIRTABLE_API4 = "https://api.airtable.com/v0";
var PAY_INTENT_PATH = "/v1/pay/verify";
var SLIP_EVIDENCE_PATH2 = "/v1/pay/slip/evidence";
var CONFIRM_VERIFY_PATH = "/v1/confirm/verify";
var CANONICAL_WEB_SOURCES = /* @__PURE__ */ new Set(["sigil_pay", "sigil_pay_v22", "public_pay", "job_confirmation", "pay_membership", "member_payments"]);
var PAID_STATES = /* @__PURE__ */ new Set(["paid", "verified", "success", "completed"]);
var PROOF_STATES = /* @__PURE__ */ new Set(["submitted", "pending", "pending_review", "review", "review_required", "needs_review", "under_review", "matched", "verified", "approved"]);
var MAX_FILE_BYTES = 15 * 1024 * 1024;
function clean3(value3, max = 4e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max);
}
__name(clean3, "clean");
function code3(value3) {
  return clean3(value3, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(code3, "code");
function normalizePath(value3) {
  const path = clean3(value3 || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
__name(normalizePath, "normalizePath");
function positive(value3) {
  const n = Number(String(value3 ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}
__name(positive, "positive");
function compact4(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value3]) => value3 !== void 0 && value3 !== null && value3 !== ""));
}
__name(compact4, "compact");
function bytesToHex2(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex2, "bytesToHex");
async function sha256Hex2(value3) {
  return bytesToHex2(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value3 || ""))));
}
__name(sha256Hex2, "sha256Hex");
function base64UrlEncode2(value3) {
  const bytes = new TextEncoder().encode(String(value3 || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64UrlEncode2, "base64UrlEncode");
async function hmacSha256Hex2(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToHex2(await crypto.subtle.sign("HMAC", key, encoder.encode(String(message || ""))));
}
__name(hmacSha256Hex2, "hmacSha256Hex");
function json2(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      ...headers
    }
  });
}
__name(json2, "json");
function rebuildJson(response, data) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(rebuildJson, "rebuildJson");
function requestWithJson(request2, body) {
  const headers = new Headers(request2.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return new Request(request2.url, {
    method: request2.method,
    headers,
    body: JSON.stringify(body)
  });
}
__name(requestWithJson, "requestWithJson");
function isUnifiedPaymentIntentRequest(path, method = "POST") {
  return normalizePath(path) === PAY_INTENT_PATH && String(method).toUpperCase() === "POST";
}
__name(isUnifiedPaymentIntentRequest, "isUnifiedPaymentIntentRequest");
function isUnifiedSlipEvidenceRequest(path, method = "POST") {
  return normalizePath(path) === SLIP_EVIDENCE_PATH2 && String(method).toUpperCase() === "POST";
}
__name(isUnifiedSlipEvidenceRequest, "isUnifiedSlipEvidenceRequest");
function isUnifiedConfirmVerifyRequest(path, method = "POST") {
  return normalizePath(path) === CONFIRM_VERIFY_PATH && String(method).toUpperCase() === "POST";
}
__name(isUnifiedConfirmVerifyRequest, "isUnifiedConfirmVerifyRequest");
async function stablePaymentRef(sessionId, paymentStage) {
  const session = clean3(sessionId, 220);
  const stage2 = code3(paymentStage || "deposit") || "deposit";
  if (!session) throw new Error("session_id_required");
  return `pay_${(await sha256Hex2(`${session}:${stage2}`)).slice(0, 24)}`;
}
__name(stablePaymentRef, "stablePaymentRef");
function signingSecret(env) {
  return clean3(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5e3);
}
__name(signingSecret, "signingSecret");
function tokenTtl(env) {
  const seconds = Math.floor(Number(env.PAY_TOKEN_TTL_SECONDS || 2592e3));
  return Math.min(Math.max(Number.isFinite(seconds) ? seconds : 2592e3, 60), 2592e3);
}
__name(tokenTtl, "tokenTtl");
async function mintCustomerToken(env, { session_id, payment_ref, payment_type }) {
  const secret = signingSecret(env);
  if (!secret) throw new Error("missing_payment_confirmation_signing_secret");
  if (!env.PAY_SESSIONS_KV) throw new Error("missing_pay_sessions_kv");
  const iat = Math.floor(Date.now() / 1e3);
  const exp = iat + tokenTtl(env);
  const claims = {
    kind: "customer_confirm",
    role: "customer",
    session_id: clean3(session_id, 220),
    payment_ref: clean3(payment_ref, 220),
    payment_type: code3(payment_type || "deposit") || "deposit",
    iat,
    exp
  };
  const encoded = base64UrlEncode2(JSON.stringify(claims));
  const token4 = `${encoded}.${await hmacSha256Hex2(encoded, secret)}`;
  const tokenHash = await sha256Hex2(token4);
  await env.PAY_SESSIONS_KV.put(`sig:${tokenHash.slice(0, 24)}`, JSON.stringify(claims), {
    expirationTtl: tokenTtl(env)
  });
  return token4;
}
__name(mintCustomerToken, "mintCustomerToken");
function paymentPageUrl(token4, context = {}) {
  const lane = paymentPresentationLane(context);
  const pathname = lane === "public" ? "/pay/checkout" : "/sigil/pay";
  return `https://mmdbkk.com${pathname}?t=${encodeURIComponent(token4)}`;
}
__name(paymentPageUrl, "paymentPageUrl");
async function handleUnifiedPaymentIntent(request2, env, downstream) {
  const body = await request2.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return downstream(request2);
  const sessionId = clean3(body.session_id, 220);
  const stage2 = code3(body.payment_stage || body.payment_type || "deposit") || "deposit";
  if (!sessionId) return downstream(request2);
  const paymentRef = clean3(body.payment_ref || body.transaction_ref, 220) || await stablePaymentRef(sessionId, stage2);
  const nextBody = { ...body, payment_ref: paymentRef };
  const response = await downstream(requestWithJson(request2, nextBody));
  if (!response.ok) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data || data.ok !== true) return response;
  try {
    const canonicalRef = clean3(data.payment_ref || paymentRef, 220);
    const canonicalSession = clean3(data.session_id || sessionId, 220);
    const canonicalStage = code3(data.payment_stage || stage2) || stage2;
    const canonicalPackage5 = code3(data.package_code || nextBody.package_code);
    const paymentSurface = paymentPresentationLane({
      package_code: canonicalPackage5,
      payment_stage: canonicalStage
    });
    const customerToken = await mintCustomerToken(env, {
      session_id: canonicalSession,
      payment_ref: canonicalRef,
      payment_type: canonicalStage
    });
    const liffRenewal = canonicalStage === "membership" && /^liffrenew_(standard|premium)_[a-f0-9]{24}$/.test(canonicalSession);
    return rebuildJson(response, {
      ...data,
      payment_ref: canonicalRef,
      session_id: canonicalSession,
      customer_t: customerToken,
      customer_payment_url: liffRenewal ? `https://mmdbkk.com/pay/checkout?t=${encodeURIComponent(customerToken)}` : paymentPageUrl(customerToken, {
        package_code: canonicalPackage5,
        payment_stage: canonicalStage
      }),
      payment_surface: liffRenewal ? "public" : paymentSurface,
      unified_payment_flow: "v1"
    });
  } catch (error2) {
    return json2({
      ok: false,
      error: clean3(error2?.message || error2 || "customer_payment_link_failed", 300),
      authority: "payments-worker"
    }, 503);
  }
}
__name(handleUnifiedPaymentIntent, "handleUnifiedPaymentIntent");
function airtableTable(env, kind) {
  if (kind === "proofs") return clean3(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi");
  if (kind === "sessions") return clean3(env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
  return clean3(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ");
}
__name(airtableTable, "airtableTable");
function airtableReady(env) {
  return Boolean(clean3(env.AIRTABLE_BASE_ID) && clean3(env.AIRTABLE_API_KEY));
}
__name(airtableReady, "airtableReady");
async function airtableFetch3(env, url, init = {}) {
  const request2 = new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean3(env.AIRTABLE_API_KEY)}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error2 = new Error(`airtable_${response.status}`);
    error2.status = response.status;
    throw error2;
  }
  return payload;
}
__name(airtableFetch3, "airtableFetch");
async function findFirstByFields(env, tableName, fieldNames, value3) {
  if (!airtableReady(env) || !clean3(value3)) return null;
  for (const fieldName of fieldNames) {
    const url = new URL(`${AIRTABLE_API4}/${encodeURIComponent(clean3(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("maxRecords", "1");
    url.searchParams.set("filterByFormula", `{${fieldName}}='${formulaValue(value3)}'`);
    try {
      const data = await airtableFetch3(env, url.toString(), { method: "GET" });
      if (Array.isArray(data.records) && data.records[0]) return data.records[0];
    } catch (error2) {
      if (Number(error2?.status) !== 422) throw error2;
    }
  }
  return null;
}
__name(findFirstByFields, "findFirstByFields");
async function findPayment(env, paymentRef) {
  return findFirstByFields(env, airtableTable(env, "payments"), ["payment_ref", "Payment Reference"], paymentRef);
}
__name(findPayment, "findPayment");
async function findProofsForUpload(env, paymentRef) {
  if (!airtableReady(env)) return [];
  const url = new URL(`${AIRTABLE_API4}/${encodeURIComponent(clean3(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(airtableTable(env, "proofs"))}`);
  url.searchParams.set("filterByFormula", `{payment_ref}='${formulaValue(paymentRef)}'`);
  url.searchParams.set("pageSize", "20");
  const data = await airtableFetch3(env, url.toString(), { method: "GET" });
  if (data.offset || !Array.isArray(data.records)) throw Object.assign(new Error("payment_proof_candidates_incomplete"), { status: 503 });
  return data.records;
}
__name(findProofsForUpload, "findProofsForUpload");
async function findSession(env, sessionId) {
  if (!clean3(sessionId)) return null;
  return findFirstByFields(env, airtableTable(env, "sessions"), ["session_id", "Session ID"], sessionId);
}
__name(findSession, "findSession");
function linkedRecordIds(value3) {
  if (!Array.isArray(value3)) return [];
  return value3.map((item) => clean3(typeof item === "string" ? item : item?.id, 80)).filter(Boolean);
}
__name(linkedRecordIds, "linkedRecordIds");
function canonicalProofLinks(payment, session) {
  const paymentFields3 = payment?.fields || {};
  const sessionFields2 = session?.fields || {};
  const clients = [
    ...linkedRecordIds(paymentFields3.Client || paymentFields3.client),
    ...linkedRecordIds(sessionFields2.Client || sessionFields2.client)
  ];
  return {
    payment: payment?.id ? [payment.id] : [],
    session: session?.id ? [session.id] : [],
    client: [...new Set(clients)]
  };
}
__name(canonicalProofLinks, "canonicalProofLinks");
async function createProof(env, fields2) {
  if (!airtableReady(env)) throw new Error("airtable_not_ready");
  const url = `${AIRTABLE_API4}/${encodeURIComponent(clean3(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(airtableTable(env, "proofs"))}`;
  const data = await airtableFetch3(env, url, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: fields2 }], typecast: true })
  });
  return data?.records?.[0] || null;
}
__name(createProof, "createProof");
function paymentFields(record) {
  return record?.fields || {};
}
__name(paymentFields, "paymentFields");
function firstValue(fields2, keys) {
  for (const key of keys) {
    if (fields2[key] !== void 0 && fields2[key] !== null && fields2[key] !== "") return fields2[key];
  }
  return null;
}
__name(firstValue, "firstValue");
function paymentSnapshot(record, form = null) {
  const fields2 = paymentFields(record);
  const persistedNotes = firstValue(fields2, ["Notes", "notes", "fldjsZIKoJPawlb2u"]) || "";
  const persistedSession = firstValue(fields2, ["session_id", "Session ID", "fld2wdhBvc8xrV6y5"]);
  const noteStage = String(persistedNotes).match(/(?:^|[;\n])\s*payment_stage=([a-z_]+)/i)?.[1];
  const rawStage = firstValue(fields2, ["payment_stage", "payment_type", "stage"]) || noteStage || form?.get("payment_stage") || form?.get("payment_type") || "";
  const canonicalShop = code3(rawStage) === "shop" ? resolvePersistedShopBrand({ session_id: persistedSession || "", Notes: persistedNotes }) : null;
  return {
    amount_thb: positive(firstValue(fields2, ["amount_thb", "amount", "Amount", "Amount THB"])) || positive(form?.get("amount_thb")),
    session_id: clean3(persistedSession || form?.get("session_id"), 220),
    canonical_shop_brand: canonicalShop?.key || null,
    member_email: clean3(firstValue(fields2, ["member_email", "email", "Contact Email"]) || form?.get("member_email"), 320).toLowerCase(),
    package_code: code3(firstValue(fields2, ["package_code", "package", "Package Code"]) || form?.get("package_code")),
    payment_stage: code3(rawStage) || "deposit",
    payment_stage_explicit: Boolean(clean3(rawStage)),
    payment_status: code3(firstValue(fields2, ["Payment Status", "payment_status", "status"])),
    verification_status: code3(firstValue(fields2, ["Verification Status", "verification_status"])),
    payer_name: clean3(form?.get("payer_name") || form?.get("client_name"), 180)
  };
}
__name(paymentSnapshot, "paymentSnapshot");
function proofSnapshot(record) {
  const fields2 = record?.fields || {};
  return {
    proof_id: clean3(fields2.proof_id, 160),
    status: code3(fields2.status || fields2.verification_status || fields2.payment_status || "submitted") || "submitted"
  };
}
__name(proofSnapshot, "proofSnapshot");
function fileFromForm(form) {
  const value3 = form.get("file") || form.get("slip") || form.get("proof") || form.get("receipt") || form.get("receipt_photo") || null;
  return value3 && typeof value3 === "object" && typeof value3.arrayBuffer === "function" ? value3 : null;
}
__name(fileFromForm, "fileFromForm");
function extensionFor(file) {
  const name = clean3(file?.name, 180);
  const match = name.match(/\.([a-z0-9]{1,10})$/i);
  if (match) return match[1].toLowerCase();
  const type = clean3(file?.type, 120).toLowerCase();
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "application/pdf") return "pdf";
  return "bin";
}
__name(extensionFor, "extensionFor");
function paymentProofLane(snapshot2 = {}) {
  return code3(snapshot2.payment_stage) === "shop" ? "mmd_shop" : "mmd";
}
__name(paymentProofLane, "paymentProofLane");
function paymentProofStoragePrefix(snapshot2 = {}) {
  return paymentProofLane(snapshot2) === "mmd_shop" ? "mmd-shop-payment-proofs" : "web-payment-proofs";
}
__name(paymentProofStoragePrefix, "paymentProofStoragePrefix");
async function storeEvidence(env, file, proofId, paymentRef, snapshot2 = {}) {
  if (!file) return { stored: false, reason: "file_missing" };
  if (Number(file.size || 0) > MAX_FILE_BYTES) {
    const error2 = new Error("slip_file_too_large");
    error2.status = 413;
    throw error2;
  }
  const bytes = await file.arrayBuffer();
  const sha2562 = bytesToHex2(await crypto.subtle.digest("SHA-256", bytes));
  const date = /* @__PURE__ */ new Date();
  const lane = paymentProofLane(snapshot2);
  const prefix2 = paymentProofStoragePrefix(snapshot2);
  const key = `${prefix2}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${proofId}/original.${extensionFor(file)}`;
  const bucket = env.PAYMENT_SLIP_EVIDENCE;
  if (!bucket || typeof bucket.put !== "function") return { stored: false, reason: "r2_not_bound", key, sha256: sha2562 };
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: clean3(file.type, 120) || "application/octet-stream" },
    customMetadata: { proof_id: proofId, payment_ref: paymentRef, payment_lane: lane, sha256: sha2562 }
  });
  return { stored: true, provider: "cloudflare_r2", key, sha256: sha2562 };
}
__name(storeEvidence, "storeEvidence");
function threadId(value3, fallback) {
  const numeric3 = Number(value3);
  return Number.isInteger(numeric3) && numeric3 > 0 ? numeric3 : fallback;
}
__name(threadId, "threadId");
async function notifyTelegramSlipFailure(env, { paymentRef = "", sessionId = "", sourcePage = "", reason = "", status = 0 } = {}) {
  const service = env.TELEGRAM_WORKER;
  const token4 = clean3(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM, 5e3);
  const chatId = clean3(env.TELEGRAM_CHAT_ID || "-1003546439681", 120);
  if (!service || typeof service.fetch !== "function" || !token4) return { ok: false, skipped: true };
  const response = await service.fetch(new Request("https://telegram-worker/telegram/internal/send", {
    method: "POST",
    headers: { authorization: `Bearer ${token4}`, "content-type": "application/json" },
    body: JSON.stringify({
      flow: "alert",
      chat_id: chatId,
      message_thread_id: threadId(env.TG_THREAD_ALERTS, 9),
      text: [
        "\u{1F6A8} <b>PAYMENT SLIP FLOW FAILED</b>",
        "\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E1E\u0E22\u0E32\u0E22\u0E32\u0E21\u0E2A\u0E48\u0E07\u0E2A\u0E25\u0E34\u0E1B\u0E08\u0E32\u0E01 signed payment link \u0E41\u0E25\u0E49\u0E27 \u0E41\u0E15\u0E48 flow \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E08\u0E1A",
        paymentRef ? `Payment Ref: <code>${tgHtml(paymentRef)}</code>` : "",
        sessionId ? `Session: <code>${tgHtml(sessionId)}</code>` : "",
        sourcePage ? `Source: <code>${tgHtml(sourcePage)}</code>` : "",
        status ? `HTTP: <b>${Number(status)}</b>` : "",
        reason ? `Error: <code>${tgHtml(reason)}</code>` : "",
        "Action: \u0E15\u0E23\u0E27\u0E08 Payment/Proof \u0E01\u0E48\u0E2D\u0E19\u0E02\u0E2D\u0E43\u0E2B\u0E49\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E2A\u0E48\u0E07\u0E0B\u0E49\u0E33"
      ].filter(Boolean).join("\n")
    }),
    signal: AbortSignal.timeout(1e4)
  })).catch(() => null);
  return { ok: response?.ok === true };
}
__name(notifyTelegramSlipFailure, "notifyTelegramSlipFailure");
function paymentProofTelegramRoute(env = {}, snapshot2 = {}, sourcePage = "") {
  if (paymentProofLane(snapshot2) === "mmd_shop") {
    const brand = SHOP_BRANDS[snapshot2.canonical_shop_brand] || SHOP_BRANDS["mmd-shop"];
    return {
      topic: "mmd_shop",
      reason: brand.key === "shop" ? "himai_shop_payment" : "mmd_shop_payment",
      shop: brand.key,
      shop_name: brand.publicName,
      shop_title: brand.title,
      should_alert: false,
      inference: null,
      ...shopPaymentThreads(env, brand)
    };
  }
  const route = classifyPaymentOpsRoute({
    payment_stage: snapshot2.payment_stage_explicit === false ? "" : snapshot2.payment_stage,
    amount_thb: snapshot2.amount_thb,
    package_code: snapshot2.package_code,
    source_page: sourcePage
  });
  return {
    ...route,
    thread_id: route.topic === "membership" ? threadId(env.TG_THREAD_PAYMENTS_MEMBERSHIP || env.TG_THREAD_MEMBERSHIP, 20) : threadId(env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM, 22),
    alerts_thread_id: threadId(env.TG_THREAD_ALERTS, 9)
  };
}
__name(paymentProofTelegramRoute, "paymentProofTelegramRoute");
async function notifyTelegramFile(env, file, { proofId, paymentRef, snapshot: snapshot2, sourcePage, jobContext = {}, precheck = {} }) {
  const service = env.TELEGRAM_WORKER;
  const token4 = clean3(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM, 5e3);
  const chatId = clean3(env.TELEGRAM_CHAT_ID || "-1003546439681", 120);
  if (!service || typeof service.fetch !== "function") return { ok: false, skipped: true, error_description: "telegram_service_binding_missing" };
  if (!token4 || !file) return { ok: false, skipped: true, error_description: !token4 ? "telegram_service_auth_missing" : "telegram_file_missing" };
  const route = paymentProofTelegramRoute(env, snapshot2, sourcePage);
  const inferenceLabel = membershipInferenceLabel(route.inference);
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("message_thread_id", String(route.thread_id));
  form.append("parse_mode", "HTML");
  const captionLines = [
    route.topic === "membership" ? "<b>\u{1F4B3} \u0E2A\u0E25\u0E34\u0E1B\u0E2A\u0E21\u0E32\u0E0A\u0E34\u0E01\u0E40\u0E02\u0E49\u0E32\u0E41\u0E25\u0E49\u0E27 \xB7 \u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08</b>" : route.topic === "mmd_shop" ? `<b>\u{1F4B3} ${tgHtml(route.shop_title)} \xB7 \u0E2A\u0E25\u0E34\u0E1B\u0E40\u0E02\u0E49\u0E32\u0E41\u0E25\u0E49\u0E27 \u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08</b>` : "<b>\u{1F4B3} \u0E2A\u0E25\u0E34\u0E1B\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32\u0E40\u0E02\u0E49\u0E32\u0E41\u0E25\u0E49\u0E27 \xB7 \u0E23\u0E2D\u0E40\u0E1B\u0E2D\u0E23\u0E4C\u0E15\u0E23\u0E27\u0E08</b>",
    `<a href="${tgHtml(precheck.review_url || paymentProofReviewUrl(proofId, snapshot2.session_id))}">\u0E40\u0E1B\u0E34\u0E14\u0E07\u0E32\u0E19\u0E19\u0E35\u0E49 \xB7 \u0E15\u0E23\u0E27\u0E08\u0E41\u0E25\u0E30\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E07\u0E34\u0E19\u0E40\u0E02\u0E49\u0E32</a>`,
    "\u{1F449} <b>\u0E15\u0E23\u0E27\u0E08\u0E40\u0E07\u0E34\u0E19\u0E40\u0E02\u0E49\u0E32\u0E08\u0E23\u0E34\u0E07 \u0E41\u0E25\u0E49\u0E27\u0E01\u0E14 \u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E07\u0E34\u0E19\u0E40\u0E02\u0E49\u0E32 (Official Verify)</b>",
    "\u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E1B\u0E25\u0E48\u0E2D\u0E22\u0E25\u0E34\u0E07\u0E01\u0E4C\u0E25\u0E39\u0E01\u0E04\u0E49\u0E32 / \u0E42\u0E21\u0E40\u0E14\u0E25\u0E08\u0E19\u0E01\u0E27\u0E48\u0E32\u0E08\u0E30\u0E2D\u0E19\u0E38\u0E21\u0E31\u0E15\u0E34",
    ...proofPrecheckLines(precheck).map(tgHtml),
    snapshot2.amount_thb ? `\u0E22\u0E2D\u0E14\u0E15\u0E32\u0E21\u0E23\u0E32\u0E22\u0E01\u0E32\u0E23: <b>${snapshot2.amount_thb} THB</b> \xB7 \u0E15\u0E23\u0E27\u0E08\u0E22\u0E2D\u0E14\u0E08\u0E23\u0E34\u0E07\u0E08\u0E32\u0E01\u0E2A\u0E25\u0E34\u0E1B` : "",
    snapshot2.payment_stage ? `\u0E23\u0E2D\u0E1A\u0E0A\u0E33\u0E23\u0E30: <b>${tgHtml(snapshot2.payment_stage)}</b>` : "",
    ...route.topic === "membership" || route.topic === "mmd_shop" ? route.topic === "mmd_shop" && snapshot2.session_id ? [`Order: <code>${tgHtml(snapshot2.session_id)}</code>`] : [] : webJobContextCaptionLines(jobContext),
    "",
    "",
    `Payment Ref: <code>${paymentRef}</code>`,
    `Proof: <code>${proofId}</code>`,
    inferenceLabel ? `\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17: <b>${tgHtml(inferenceLabel)}</b>` : route.topic === "membership" ? "\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17: <b>Membership / Renewal</b>" : route.topic === "mmd_shop" ? `\u0E1B\u0E23\u0E30\u0E40\u0E20\u0E17: <b>${tgHtml(route.shop_name)} Order</b>` : "",
    `Routing: <code>${tgHtml(route.reason)}</code>`
  ].filter(Boolean);
  const caption = captionLines.reduce((value3, line) => value3.length + line.length + 1 <= 880 ? value3 + (value3 ? "\n" : "") + line : value3, "");
  form.append("caption", caption);
  form.append("document", file, clean3(file.name, 180) || "payment-proof");
  const response = await service.fetch(new Request("https://telegram-worker/telegram/internal/payments/proof-document", {
    method: "POST",
    headers: { authorization: `Bearer ${token4}` },
    body: form,
    signal: AbortSignal.timeout(15e3)
  }));
  const responseData = await response.clone().json().catch(() => ({}));
  let alertSent = false;
  if (route.should_alert === true) {
    const alert = await service.fetch(new Request("https://telegram-worker/telegram/internal/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token4}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        flow: "alert",
        chat_id: chatId,
        message_thread_id: route.alerts_thread_id,
        text: [
          "\u{1F6A8} MMD Payment Classification Conflict",
          `Proof: ${proofId}`,
          `Ref: ${paymentRef}`,
          `Reason: ${route.reason}`,
          "Action: keep proof in Payment review; do not activate membership automatically."
        ].join("\n")
      })
    })).catch(() => null);
    alertSent = alert?.ok === true;
  }
  return {
    ok: response.ok && responseData?.ok === true,
    status: response.status,
    topic: route.topic,
    thread_id: route.thread_id,
    message_id: Number(responseData?.message_id || 0) || null,
    error_code: Number(responseData?.error_code || 0) || null,
    error_description: clean3(responseData?.error || responseData?.description, 300) || null,
    alert_sent: alertSent
  };
}
__name(notifyTelegramFile, "notifyTelegramFile");
function telegramDeliveryAuditNote(telegram = {}) {
  return [
    `telegram_delivered=${telegram?.ok === true ? "true" : "false"}`,
    telegram?.thread_id ? `telegram_thread_id=${telegram.thread_id}` : "",
    telegram?.message_id ? `telegram_message_id=${telegram.message_id}` : "",
    telegram?.status ? `telegram_http_status=${telegram.status}` : "",
    telegram?.error_code ? `telegram_error_code=${telegram.error_code}` : "",
    telegram?.error_description ? `telegram_error=${clean3(telegram.error_description, 180)}` : ""
  ].filter(Boolean).join("; ");
}
__name(telegramDeliveryAuditNote, "telegramDeliveryAuditNote");
async function deliverWebProofNotification(env, record, checkpoint) {
  const payload = record.payload;
  let telegram = record.state?.telegram;
  if (!telegram?.ok) {
    const object = await env.PAYMENT_SLIP_EVIDENCE?.get(payload.storageKey);
    if (!object) return { ok: false, error: "payment_evidence_file_unavailable" };
    const file = new File([await object.arrayBuffer()], payload.filename, {
      type: object.httpMetadata?.contentType || "application/octet-stream"
    });
    telegram = await notifyTelegramFile(env, file, payload);
    if (telegram.ok) {
      await checkpoint({ telegram });
      record.state = { telegram };
    }
  }
  const audit = await patchProofAuditNote(env, payload.proofRecordId, payload.note, telegram);
  return { ok: telegram.ok === true && audit.ok === true, result: { ...telegram, audit_persisted: audit.ok === true }, error: telegram.error_description || audit.error };
}
__name(deliverWebProofNotification, "deliverWebProofNotification");
async function dispatchWebProofNotification(env, proof, { snapshot: snapshot2, sourcePage, jobContext, precheck } = {}) {
  const note = clean3(proof.fields?.note, 6e3);
  const storageKey = /(?:^|;\s*)r2_key=([^;]+)/.exec(note)?.[1] || "";
  if (!storageKey) return { delivered: false, queued: false, status: "manual_review", result: null };
  const proofId = clean3(proof.fields?.proof_id, 160);
  const ext = storageKey.split(".").pop();
  return dispatchPaymentNotification({
    bucket: env.PAYMENT_SLIP_EVIDENCE,
    lane: "web-proof",
    eventKey: proofId,
    payload: {
      proofId,
      proofRecordId: proof.id,
      paymentRef: proof.fields.payment_ref,
      storageKey,
      filename: `${proofId}.${ext}`,
      note,
      snapshot: snapshot2,
      sourcePage,
      jobContext,
      precheck
    },
    deliver: /* @__PURE__ */ __name((record, checkpoint) => deliverWebProofNotification(env, record, checkpoint), "deliver")
  });
}
__name(dispatchWebProofNotification, "dispatchWebProofNotification");
async function drainWebProofNotifications(env, options = {}) {
  const original = await drainPaymentNotifications({
    ...options,
    bucket: env.PAYMENT_SLIP_EVIDENCE,
    lane: "web-proof",
    deliver: /* @__PURE__ */ __name((record, checkpoint) => deliverWebProofNotification(env, record, checkpoint), "deliver")
  });
  const duplicates = await drainPaymentNotifications({
    ...options,
    bucket: env.PAYMENT_SLIP_EVIDENCE,
    lane: "web-proof-duplicate",
    deliver: /* @__PURE__ */ __name((record) => deliverWebDuplicateNotice(env, record.payload), "deliver")
  });
  return { ...original, duplicate_notifications: duplicates };
}
__name(drainWebProofNotifications, "drainWebProofNotifications");
async function deliverWebDuplicateNotice(env, payload) {
  const token4 = clean3(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM, 5e3);
  if (!token4 || !env.TELEGRAM_WORKER?.fetch) return { ok: false, error: "telegram_service_unavailable" };
  const response = await env.TELEGRAM_WORKER.fetch(new Request("https://telegram-worker/telegram/internal/send", {
    method: "POST",
    headers: { authorization: `Bearer ${token4}`, "content-type": "application/json" },
    body: JSON.stringify(payload)
  }));
  const data = await response.json().catch(() => null);
  return { ok: response.ok && data?.ok === true, error: response.ok && data?.ok === true ? "" : "duplicate_notification_failed" };
}
__name(deliverWebDuplicateNotice, "deliverWebDuplicateNotice");
async function dispatchWebDuplicateNotice(env, proof, file) {
  if (!file || file.size > MAX_FILE_BYTES) return null;
  const hash = bytesToHex2(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
  const probe = { fields: { ...proof.fields, proof_id: `incoming_${hash.slice(0, 24)}`, note: `schema=mmd_web_payment_proof_v1; evidence_sha256=${hash}` } };
  const precheck = await inspectPaymentProof(env, probe);
  const route = paymentProofTelegramRoute(env, {}, "");
  const reviewUrl = paymentProofReviewUrl(proof.fields.proof_id);
  const text17 = [
    precheck.status === "duplicate" ? "\u26A0\uFE0F \u0E23\u0E31\u0E1A\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E0B\u0E49\u0E33\u0E08\u0E32\u0E01\u0E2B\u0E19\u0E49\u0E32 Payment \xB7 \u0E2D\u0E22\u0E48\u0E32\u0E19\u0E31\u0E1A\u0E22\u0E2D\u0E14\u0E23\u0E31\u0E1A\u0E0B\u0E49\u0E33" : "\u26A0\uFE0F Payment \u0E19\u0E35\u0E49\u0E21\u0E35\u0E2B\u0E25\u0E31\u0E01\u0E10\u0E32\u0E19\u0E40\u0E14\u0E34\u0E21\u0E2D\u0E22\u0E39\u0E48\u0E41\u0E25\u0E49\u0E27 \xB7 \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E27\u0E48\u0E32\u0E20\u0E32\u0E1E\u0E43\u0E2B\u0E21\u0E48\u0E40\u0E1B\u0E47\u0E19\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E0B\u0E49\u0E33",
    `\u0E40\u0E1B\u0E34\u0E14\u0E15\u0E23\u0E27\u0E08\u0E41\u0E25\u0E30\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E07\u0E34\u0E19\u0E40\u0E02\u0E49\u0E32: ${reviewUrl}`,
    "\u0E15\u0E23\u0E27\u0E08\u0E20\u0E32\u0E1E/\u0E40\u0E25\u0E02\u0E18\u0E38\u0E23\u0E01\u0E23\u0E23\u0E21\u0E41\u0E25\u0E30\u0E40\u0E07\u0E34\u0E19\u0E40\u0E02\u0E49\u0E32\u0E08\u0E23\u0E34\u0E07\u0E01\u0E48\u0E2D\u0E19\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19 \xB7 \u0E22\u0E31\u0E07\u0E44\u0E21\u0E48\u0E21\u0E35\u0E01\u0E32\u0E23\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E40\u0E07\u0E34\u0E19\u0E2D\u0E31\u0E15\u0E42\u0E19\u0E21\u0E31\u0E15\u0E34"
  ].join("\n");
  return dispatchPaymentNotification({
    bucket: env.PAYMENT_SLIP_EVIDENCE,
    lane: "web-proof-duplicate",
    eventKey: `${proof.fields.proof_id}:${hash}`,
    payload: { flow: "payment_proof", chat_id: clean3(env.TELEGRAM_CHAT_ID || "-1003546439681", 120), message_thread_id: route.thread_id, text: text17 },
    deliver: /* @__PURE__ */ __name((record) => deliverWebDuplicateNotice(env, record.payload), "deliver")
  });
}
__name(dispatchWebDuplicateNotice, "dispatchWebDuplicateNotice");
async function patchProofAuditNote(env, recordId3, currentNote, telegram) {
  if (!recordId3 || !airtableReady(env)) return { ok: false, skipped: true };
  const url = `${AIRTABLE_API4}/${encodeURIComponent(clean3(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(airtableTable(env, "proofs"))}/${encodeURIComponent(recordId3)}`;
  const audit = telegramDeliveryAuditNote(telegram);
  const note = [clean3(currentNote, 5e3), audit].filter(Boolean).join("; ");
  try {
    await airtableFetch3(env, url, {
      method: "PATCH",
      body: JSON.stringify({ fields: { note } })
    });
    return { ok: true };
  } catch (error2) {
    return { ok: false, error: clean3(error2?.message || error2, 180) };
  }
}
__name(patchProofAuditNote, "patchProofAuditNote");
function tgHtml(value3, max = 180) {
  return clean3(value3, max).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(tgHtml, "tgHtml");
function canonicalWebJobContext(session = null, snapshot2 = {}) {
  const fields2 = paymentFields(session);
  const context = {
    session_id: clean3(firstValue(fields2, ["session_id", "Session ID"]) || snapshot2.session_id, 180) || null,
    job_id: clean3(firstValue(fields2, ["job_id", "Job ID"]), 180) || null,
    client_name: clean3(firstValue(fields2, ["client_name", "Client Name"]), 180) || clean3(snapshot2.payer_name, 180) || null,
    model_name: clean3(firstValue(fields2, ["model_name", "Assigned Model", "Model"]), 180) || null,
    job_type: clean3(firstValue(fields2, ["job_type", "Session Type"]), 180) || null,
    job_date: clean3(firstValue(fields2, ["job_date", "Session Date"]), 180) || null,
    start_time: clean3(firstValue(fields2, ["start_time", "Start Time"]), 180) || null,
    end_time: clean3(firstValue(fields2, ["end_time", "End Time"]), 180) || null,
    location_name: clean3(firstValue(fields2, ["location_name", "Location", "Location (\u0E2A\u0E16\u0E32\u0E19\u0E17\u0E35\u0E48)"]), 180) || null
  };
  const exact = Boolean(context.job_id || context.session_id);
  return {
    status: exact ? "exact" : "unresolved",
    reason: exact ? "signed_payment_session" : "canonical_session_context_missing",
    ...context
  };
}
__name(canonicalWebJobContext, "canonicalWebJobContext");
function webJobContextCaptionLines(jobContext = {}) {
  if (jobContext.status !== "exact") return [
    "Job Match: <b>UNRESOLVED</b>",
    "Action: resolve the canonical Job before Official Verify."
  ];
  const when = [
    jobContext.job_date,
    jobContext.start_time && jobContext.end_time ? `${jobContext.start_time} \u2192 ${jobContext.end_time}` : jobContext.start_time || jobContext.end_time
  ].filter(Boolean).join(" \xB7 ");
  return [
    "Job Match: <b>EXACT</b>",
    jobContext.client_name ? `Customer: <b>${tgHtml(jobContext.client_name)}</b>` : "",
    jobContext.job_id ? `Job: <code>${tgHtml(jobContext.job_id)}</code>` : jobContext.session_id ? `Session: <code>${tgHtml(jobContext.session_id)}</code>` : "",
    jobContext.model_name ? `Model: <b>${tgHtml(jobContext.model_name)}</b>` : "",
    when ? `When: ${tgHtml(when, 300)}` : "",
    jobContext.location_name ? `Location: ${tgHtml(jobContext.location_name)}` : ""
  ].filter(Boolean);
}
__name(webJobContextCaptionLines, "webJobContextCaptionLines");
function canonicalProofRecordFields({ proofId, note, snapshot: snapshot2 = {}, paymentRef, links = {} } = {}) {
  return compact4({
    proof_id: proofId,
    channel: "web_pay",
    note,
    status: "pending",
    payer_name: snapshot2.payer_name,
    amount_thb: snapshot2.amount_thb,
    payment_ref: paymentRef,
    payment: links.payment,
    session: links.session,
    Client: links.client
  });
}
__name(canonicalProofRecordFields, "canonicalProofRecordFields");
async function buildProofFields(env, form, payment, paymentRef, file, session = null, imageIdentity = "") {
  const snapshot2 = paymentSnapshot(payment, form);
  const links = canonicalProofLinks(payment, session);
  if (!snapshot2.amount_thb) {
    const error2 = new Error("canonical_payment_amount_missing");
    error2.status = 409;
    throw error2;
  }
  const proofId = `webproof_${(await sha256Hex2(imageIdentity ? `${paymentRef}:${imageIdentity}` : paymentRef)).slice(0, 24)}`;
  const lane = paymentProofLane(snapshot2);
  const storage = await storeEvidence(env, file, proofId, paymentRef, snapshot2);
  const note = [
    lane === "mmd_shop" ? "schema=mmd_shop_payment_proof_v1" : "schema=mmd_web_payment_proof_v1",
    `payment_lane=${lane}`,
    "evidence_only=true",
    "official_verification_required=true",
    storage.key ? `r2_key=${storage.key}` : "",
    storage.sha256 ? `evidence_sha256=${storage.sha256}` : ""
  ].filter(Boolean).join("; ");
  const jobContext = canonicalWebJobContext(session, snapshot2);
  return {
    proofId,
    storage,
    snapshot: snapshot2,
    jobContext,
    fields: canonicalProofRecordFields({
      proofId,
      note,
      snapshot: snapshot2,
      paymentRef,
      links
    })
  };
}
__name(buildProofFields, "buildProofFields");
async function handleUnifiedSlipEvidence(request2, env, downstream) {
  const response = await handleSlipEvidenceIntake(request2, env, downstream);
  const origin = request2.headers.get("origin");
  const allowed = String(env.ALLOWED_ORIGINS || "").replace(/^["']|["']$/g, "").split(",").map((value3) => value3.trim());
  const headers = new Headers(response.headers);
  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.append("vary", "Origin");
  }
  return new Response(response.body, { status: response.status, headers });
}
__name(handleUnifiedSlipEvidence, "handleUnifiedSlipEvidence");
async function handleSlipEvidenceIntake(request2, env, downstream) {
  let form;
  try {
    form = await request2.clone().formData();
  } catch {
    return downstream(request2);
  }
  const paymentRef = clean3(form.get("payment_ref") || form.get("transaction_ref"), 220);
  if (!paymentRef) return downstream(request2);
  const source = code3(form.get("source_page") || "");
  let authenticatedWeb = false;
  let authenticatedSession = "";
  const failAfterAuth = /* @__PURE__ */ __name(async (error2, status) => {
    if (authenticatedWeb) {
      await notifyTelegramSlipFailure(env, {
        paymentRef,
        sessionId: authenticatedSession || clean3(form.get("session_id"), 220),
        sourcePage: source,
        reason: clean3(error2, 300),
        status
      }).catch(() => null);
    }
    return json2({ ok: false, error: error2, authority: "payments-worker", ...paymentRef ? { payment_ref: paymentRef } : {} }, status);
  }, "failAfterAuth");
  try {
    if (CANONICAL_WEB_SOURCES.has(source)) {
      const token4 = clean3(form.get("t") || form.get("token"), 12e3);
      if (!token4) return json2({ ok: false, error: "confirmation_token_required", authority: "payments-worker" }, 401);
      let claims;
      try {
        claims = await verifyConfirmToken(env, token4, { expectedRole: "customer" });
      } catch (error2) {
        return json2({
          ok: false,
          error: clean3(error2?.message || "invalid_confirmation_token", 180),
          authority: "payments-worker"
        }, 401);
      }
      authenticatedWeb = true;
      const claimRef = clean3(claims?.payment_ref, 220);
      const claimSession = clean3(claims?.session_id, 220);
      authenticatedSession = claimSession;
      const claimStage = code3(claims?.payment_type);
      const formSession = clean3(form.get("session_id"), 220);
      const formStage = code3(form.get("payment_stage") || form.get("payment_type"));
      if (claimRef !== paymentRef) {
        return await failAfterAuth("confirmation_payment_ref_mismatch", 409);
      }
      if (formSession && claimSession && formSession !== claimSession) {
        return await failAfterAuth("confirmation_session_mismatch", 409);
      }
      if (formStage && claimStage && formStage !== claimStage) {
        return await failAfterAuth("confirmation_payment_stage_mismatch", 409);
      }
    }
    return await withPaymentEvidenceLock(env.PAYMENT_SLIP_EVIDENCE, paymentRef, async () => {
      const file = fileFromForm(form);
      if (file && file.size > MAX_FILE_BYTES) return failAfterAuth("slip_file_too_large", 413);
      const imageHash = file ? bytesToHex2(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())) : "";
      const priorProofs = await findProofsForUpload(env, paymentRef);
      const existing = imageHash ? priorProofs.find((proof) => paymentProofIdentity(proof).hash === imageHash) : priorProofs[0];
      if (existing) {
        const proof = proofSnapshot(existing);
        await dispatchWebDuplicateNotice(env, existing, fileFromForm(form)).catch(() => null);
        let notification = null;
        if (existing.fields?.channel === "web_pay" && !/telegram_delivered=true/.test(existing.fields?.note || "")) {
          const payment2 = await findPayment(env, paymentRef);
          if (payment2) {
            const snapshot2 = paymentSnapshot(payment2);
            const session = await findSession(env, snapshot2.session_id);
            notification = await dispatchWebProofNotification(env, existing, {
              snapshot: snapshot2,
              sourcePage: source,
              jobContext: canonicalWebJobContext(session, snapshot2)
            }).catch(() => ({ status: "manual_review", queued: false }));
          }
        }
        return json2({
          ok: true,
          evidence_only: true,
          official_verification_required: true,
          duplicate: true,
          idempotent: true,
          already_submitted: true,
          evidence_submitted: true,
          payment_ref: paymentRef,
          proof_id: proof.proof_id || null,
          verification_status: proof.status === "verified" ? "verified" : "pending_verification",
          payment_status: proof.status === "verified" ? "paid" : "pending",
          telegram_retry_queued: notification?.queued === true,
          telegram_delivery_status: notification?.status || null,
          message: "Payment proof already received. Do not submit it again."
        });
      }
      const payment = await findPayment(env, paymentRef);
      if (!payment && CANONICAL_WEB_SOURCES.has(source)) {
        return await failAfterAuth("canonical_payment_not_found", 409);
      }
      if (CANONICAL_WEB_SOURCES.has(source) && !file) {
        return await failAfterAuth("payment_proof_file_required", 400);
      }
      let proofBundle = null;
      if (payment) {
        const snapshot2 = paymentSnapshot(payment, form);
        const session = await findSession(env, snapshot2.session_id);
        proofBundle = await buildProofFields(env, form, payment, paymentRef, file, session, priorProofs.length ? imageHash : "");
      }
      const downstreamHeaders = new Headers(request2.headers);
      downstreamHeaders.set("x-mmd-unified-slip-evidence", "1");
      const downstreamResponse = await downstream(new Request(request2, { headers: downstreamHeaders }));
      if (!downstreamResponse.ok) {
        await notifyTelegramSlipFailure(env, {
          paymentRef,
          sessionId: authenticatedSession || proofBundle?.snapshot?.session_id || "",
          sourcePage: source,
          reason: "downstream_proof_upload_failed",
          status: downstreamResponse.status
        }).catch(() => null);
        return downstreamResponse;
      }
      const downstreamData = await downstreamResponse.clone().json().catch(() => null);
      if (!downstreamData || downstreamData.ok !== true) {
        await notifyTelegramSlipFailure(env, {
          paymentRef,
          sessionId: authenticatedSession || proofBundle?.snapshot?.session_id || "",
          sourcePage: source,
          reason: "downstream_proof_response_invalid",
          status: downstreamResponse.status
        }).catch(() => null);
        return downstreamResponse;
      }
      if (!proofBundle) return downstreamResponse;
      const created = await createProof(env, proofBundle.fields);
      const precheck = await inspectPaymentProof(env, { ...created, fields: proofBundle.fields });
      const delivery = await dispatchWebProofNotification(env, { ...created, fields: proofBundle.fields }, {
        snapshot: proofBundle.snapshot,
        sourcePage: source,
        jobContext: proofBundle.jobContext,
        precheck
      }).catch(() => ({ delivered: false, queued: false, status: "manual_review" }));
      const telegram = delivery.result || {};
      if (authenticatedWeb && delivery.delivered !== true) {
        await notifyTelegramSlipFailure(env, {
          paymentRef,
          sessionId: authenticatedSession || proofBundle?.snapshot?.session_id || "",
          sourcePage: source,
          reason: delivery.queued === true ? "telegram_proof_delivery_failed_retry_queued" : "telegram_proof_delivery_failed_manual_review",
          status: Number(telegram.status || 0)
        }).catch(() => null);
      }
      return rebuildJson(downstreamResponse, {
        ...downstreamData,
        proof_id: proofBundle.proofId,
        proof_record_id: created?.id || null,
        evidence_submitted: true,
        already_submitted: false,
        duplicate: false,
        verification_status: "pending_verification",
        payment_status: "pending",
        storage: proofBundle.storage.stored ? proofBundle.storage.provider : downstreamData.storage,
        telegram_file_received: telegram.ok === true,
        telegram_topic: telegram.topic || null,
        telegram_thread_id: telegram.thread_id || null,
        telegram_message_id: telegram.message_id || null,
        telegram_alert_sent: telegram.alert_sent === true,
        telegram_audit_persisted: telegram.audit_persisted === true,
        telegram_retry_queued: delivery.queued === true,
        telegram_delivery_status: delivery.status,
        unified_payment_flow: "v1",
        message: "Payment proof received. MMD is reviewing it; no need to submit again."
      });
    });
  } catch (error2) {
    const status = Number(error2?.status || 500);
    const reason = clean3(error2?.message || error2 || "payment_proof_intake_failed", 300);
    if (authenticatedWeb) {
      await notifyTelegramSlipFailure(env, {
        paymentRef,
        sessionId: authenticatedSession || clean3(form.get("session_id"), 220),
        sourcePage: source,
        reason,
        status
      }).catch(() => null);
    }
    return json2({ ok: false, error: reason, authority: "payments-worker" }, status);
  }
}
__name(handleSlipEvidenceIntake, "handleSlipEvidenceIntake");
function unifiedStatus(payment, proof) {
  const paymentState = code3(firstValue(paymentFields(payment), ["Payment Status", "payment_status", "status"]));
  const verificationState = code3(firstValue(paymentFields(payment), ["Verification Status", "verification_status"]));
  if (PAID_STATES.has(paymentState) || PAID_STATES.has(verificationState)) return "paid";
  if (proof) {
    const proofState = proofSnapshot(proof).status;
    if (proofState === "verified" || proofState === "approved") return "paid";
    if (PROOF_STATES.has(proofState)) return "pending_verification";
  }
  return "awaiting_payment";
}
__name(unifiedStatus, "unifiedStatus");
async function enrichUnifiedConfirmVerify(request2, env, downstream) {
  let response;
  try {
    response = await downstream(request2);
  } catch (error2) {
    const reason = code3(error2?.message || error2);
    if (["invalid_confirmation_token", "invalid_confirmation_token_signature", "confirmation_token_not_active"].includes(reason)) {
      return json2({ ok: false, error: reason }, 401);
    }
    throw error2;
  }
  if (!response.ok) return response;
  const data = await response.clone().json().catch(() => null);
  const claims = data?.claims;
  const paymentRef = clean3(claims?.payment_ref, 220);
  if (!data?.ok || !paymentRef || !airtableReady(env)) return response;
  try {
    const [payment, proof] = await Promise.all([findPayment(env, paymentRef), findProof(env, paymentRef)]);
    if (!payment) return response;
    const snapshot2 = paymentSnapshot(payment);
    const status = unifiedStatus(payment, proof);
    const verificationStatus = status === "paid" ? "verified" : status;
    return rebuildJson(response, {
      ...data,
      status,
      payment_status: status === "paid" ? "paid" : "pending",
      verification_status: verificationStatus,
      evidence_submitted: Boolean(proof),
      claims: {
        ...claims,
        status,
        payment_status: status === "paid" ? "paid" : "pending",
        verification_status: verificationStatus,
        amount_thb: snapshot2.amount_thb || void 0,
        total_amount: snapshot2.amount_thb || void 0,
        package_code: snapshot2.package_code || void 0
      },
      unified_payment_flow: "v1"
    });
  } catch {
    return response;
  }
}
__name(enrichUnifiedConfirmVerify, "enrichUnifiedConfirmVerify");

// confirmation-ack.js
var AIRTABLE_API5 = "https://api.airtable.com/v0";
var CONFIRM_ACK_PATH = "/v1/confirm/ack";
var CONFIRM_CONTEXT_PATH = "/v1/confirm/context";
function clean4(value3, max = 5e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max);
}
__name(clean4, "clean");
function json3(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}
__name(json3, "json");
function allowedOrigins(env = {}) {
  return clean4(env.ALLOWED_ORIGINS || "", 5e3).replace(/^['\"]|['\"]$/g, "").split(",").map((value3) => value3.trim().replace(/^['\"]|['\"]$/g, "")).filter(Boolean);
}
__name(allowedOrigins, "allowedOrigins");
function corsHeaders(request2, env = {}) {
  const origin = clean4(request2.headers.get("origin"), 500);
  const allowed = allowedOrigins(env);
  const headers = {
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
  if (origin && allowed.includes(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}
__name(corsHeaders, "corsHeaders");
function withCors3(request2, env, response) {
  const headers = new Headers(response.headers);
  for (const [key, value3] of Object.entries(corsHeaders(request2, env))) headers.set(key, value3);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
__name(withCors3, "withCors");
function isAllowedOrigin(request2, env = {}) {
  const origin = clean4(request2.headers.get("origin"), 500);
  return Boolean(origin && allowedOrigins(env).includes(origin));
}
__name(isAllowedOrigin, "isAllowedOrigin");
function base64UrlDecode2(input) {
  const value3 = clean4(input).replace(/-/g, "+").replace(/_/g, "/");
  const padded = value3.padEnd(Math.ceil(value3.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
__name(base64UrlDecode2, "base64UrlDecode");
function bytesToHex3(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(bytesToHex3, "bytesToHex");
async function hmacSha256Hex3(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return bytesToHex3(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}
__name(hmacSha256Hex3, "hmacSha256Hex");
async function sha256Hex3(value3) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value3));
  return bytesToHex3(digest);
}
__name(sha256Hex3, "sha256Hex");
function confirmationSecret(env = {}) {
  return clean4(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5e3);
}
__name(confirmationSecret, "confirmationSecret");
async function verifyToken(env, token4, expectedRole) {
  const raw = clean4(token4, 12e3);
  const [payloadPart, suppliedSignature, extra] = raw.split(".");
  if (!payloadPart || !suppliedSignature || extra !== void 0) throw new Error("invalid_confirmation_token");
  const secret = confirmationSecret(env);
  if (!secret) {
    const error2 = new Error("confirmation_signing_not_ready");
    error2.status = 503;
    throw error2;
  }
  const expectedSignature = await hmacSha256Hex3(payloadPart, secret);
  if (expectedSignature.length !== suppliedSignature.length) throw new Error("invalid_confirmation_token_signature");
  let mismatch = 0;
  for (let i = 0; i < expectedSignature.length; i += 1) {
    mismatch |= expectedSignature.charCodeAt(i) ^ suppliedSignature.charCodeAt(i);
  }
  if (mismatch !== 0) throw new Error("invalid_confirmation_token_signature");
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode2(payloadPart));
  } catch {
    throw new Error("invalid_confirmation_token");
  }
  const role = clean4(payload?.role, 40);
  const kind = clean4(payload?.kind, 80);
  const validKind = role === "customer" && kind === "customer_confirm" || role === "model" && kind === "model_confirm";
  if (!validKind || !["customer", "model"].includes(role)) throw new Error("invalid_confirmation_token_purpose");
  if (!expectedRole || expectedRole !== role) throw new Error("confirmation_role_mismatch");
  if (!clean4(payload?.session_id, 200) || !clean4(payload?.payment_ref, 200)) throw new Error("invalid_confirmation_token_subject");
  const now = Math.floor(Date.now() / 1e3);
  if (!Number.isInteger(payload?.iat) || !Number.isInteger(payload?.exp) || payload.exp <= payload.iat) {
    throw new Error("invalid_confirmation_token_lifetime");
  }
  if (payload.iat > now + 60) throw new Error("confirmation_token_not_yet_valid");
  if (payload.exp <= now) {
    const error2 = new Error("confirmation_token_expired");
    error2.status = 410;
    throw error2;
  }
  if (!env.PAY_SESSIONS_KV) {
    const error2 = new Error("confirmation_token_store_not_ready");
    error2.status = 503;
    throw error2;
  }
  const tokenHash = await sha256Hex3(raw);
  const storedRaw = await env.PAY_SESSIONS_KV.get(`sig:${tokenHash.slice(0, 24)}`);
  if (!storedRaw) throw new Error("confirmation_token_not_active");
  let stored;
  try {
    stored = JSON.parse(storedRaw);
  } catch {
    throw new Error("confirmation_token_record_invalid");
  }
  for (const field7 of ["kind", "role", "session_id", "payment_ref", "payment_type", "iat", "exp"]) {
    if (stored?.[field7] !== payload?.[field7]) throw new Error("confirmation_token_record_mismatch");
  }
  return payload;
}
__name(verifyToken, "verifyToken");
function airtableConfig(env = {}) {
  const baseId2 = clean4(env.AIRTABLE_BASE_ID, 100);
  const tableId = clean4(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 100);
  const apiKey = clean4(env.AIRTABLE_API_KEY, 5e3);
  if (!baseId2 || !tableId || !apiKey) {
    const error2 = new Error("airtable_not_ready");
    error2.status = 503;
    throw error2;
  }
  return { baseId: baseId2, tableId, apiKey };
}
__name(airtableConfig, "airtableConfig");
function sessionFields(env = {}) {
  return {
    paymentRef: clean4(env.AT_SESSIONS__PAYMENT_REF || "fldojgjSQLaO0uQLX", 100),
    customerAck: clean4(env.AT_SESSIONS__CUSTOMER_ACK_AT || "fldJSS5GNN7quJwa8", 100),
    modelAck: clean4(env.AT_SESSIONS__MODEL_ACK_AT || "fldFgkHXivIAThfDz", 100),
    sessionStatus: clean4(
      env.AT_SESSIONS__SESSION_STATUS || env.AIRTABLE_SESSIONS_STATUS_FIELD || "fldmwuvOaiCFdzzRa",
      100
    ),
    modelSessionState: clean4(env.AT_SESSIONS__MODEL_SESSION_STATE || "fld57fhdWqIcOy4Jp", 100),
    modelSessionStateUpdatedAt: clean4(env.AT_SESSIONS__MODEL_SESSION_STATE_UPDATED_AT || "fldFJI1Leni6wvzR4", 100),
    clientName: clean4(env.AT_SESSIONS__CLIENT_NAME || "fldMvnQ0BzDfHUYjT", 100),
    modelName: clean4(env.AT_SESSIONS__MODEL_NAME || "flddVz6eoWRHrzIQr", 100),
    jobType: clean4(env.AT_SESSIONS__JOB_TYPE || "fldjK3U9bghnj7xUe", 100),
    jobDate: clean4(env.AT_SESSIONS__JOB_DATE || "fldpnqoIsUMfN7y3c", 100),
    startTime: clean4(env.AT_SESSIONS__START_TIME || "fldBeG0FkWwa8kgnp", 100),
    endTime: clean4(env.AT_SESSIONS__END_TIME || "fldiDSz0wW9Ct9I3P", 100),
    locationName: clean4(env.AT_SESSIONS__LOCATION_NAME || "fldIiRpaxoafjTkFt", 100)
  };
}
__name(sessionFields, "sessionFields");
async function airtableRequest(env, path, init = {}) {
  const { baseId: baseId2, apiKey } = airtableConfig(env);
  const response = await fetch(`${AIRTABLE_API5}/${baseId2}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...init.headers || {}
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error2 = new Error("airtable_request_failed");
    error2.status = response.status >= 500 ? 503 : 500;
    throw error2;
  }
  return data;
}
__name(airtableRequest, "airtableRequest");
async function findSession2(env, sessionId) {
  const { tableId } = airtableConfig(env);
  const formula5 = `{session_id}='${formulaValue(sessionId)}'`;
  const query = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: formula5,
    returnFieldsByFieldId: "true"
  });
  const data = await airtableRequest(env, `${encodeURIComponent(tableId)}?${query.toString()}`, { method: "GET" });
  return data?.records?.[0] || null;
}
__name(findSession2, "findSession");
async function assertSessionMatchesClaims(env, session, claims) {
  const fields2 = sessionFields(env);
  const sessionPaymentRef = clean4(session?.fields?.[fields2.paymentRef], 200);
  const accepted = /* @__PURE__ */ new Set([clean4(claims.payment_ref, 200), await stablePaymentRef(claims.session_id, "final")]);
  if (sessionPaymentRef && !accepted.has(sessionPaymentRef)) {
    const error2 = new Error("confirmation_session_mismatch");
    error2.status = 409;
    throw error2;
  }
}
__name(assertSessionMatchesClaims, "assertSessionMatchesClaims");
function safeConfirmationContext(env, session, role) {
  const fields2 = sessionFields(env);
  const source = session?.fields || {};
  return {
    job_type: clean4(source[fields2.jobType], 120) || null,
    job_date: clean4(source[fields2.jobDate], 120) || null,
    start_time: clean4(source[fields2.startTime], 120) || null,
    end_time: clean4(source[fields2.endTime], 120) || null,
    location_name: clean4(source[fields2.locationName], 300) || null,
    counterpart_name: role === "customer" ? clean4(source[fields2.modelName], 120) || null : clean4(source[fields2.clientName], 120) || null,
    acknowledged_at: clean4(source[role === "customer" ? fields2.customerAck : fields2.modelAck], 200) || null
  };
}
__name(safeConfirmationContext, "safeConfirmationContext");
function shouldPromoteCustomerStatus(value3) {
  const normalized3 = clean4(value3, 80).toLowerCase();
  return !normalized3 || normalized3 === "pending";
}
__name(shouldPromoteCustomerStatus, "shouldPromoteCustomerStatus");
async function patchAcknowledgement(env, session, role) {
  const { tableId } = airtableConfig(env);
  const fields2 = sessionFields(env);
  const fieldId = role === "customer" ? fields2.customerAck : fields2.modelAck;
  const existing = clean4(session?.fields?.[fieldId], 200);
  const promoteCustomerStatus = role === "customer" && shouldPromoteCustomerStatus(session?.fields?.[fields2.sessionStatus]);
  const currentModelSessionState = clean4(session?.fields?.[fields2.modelSessionState], 80).toLowerCase();
  const seedModelSessionState = role === "model" && !currentModelSessionState;
  if (existing && !promoteCustomerStatus && !seedModelSessionState) {
    return {
      acknowledged_at: existing,
      idempotent: true,
      session_status_promoted: false,
      model_session_state_seeded: false
    };
  }
  const acknowledgedAt = existing || (/* @__PURE__ */ new Date()).toISOString();
  const patchFields = {};
  if (!existing) patchFields[fieldId] = acknowledgedAt;
  if (promoteCustomerStatus) patchFields[fields2.sessionStatus] = "Confirmed";
  if (seedModelSessionState) {
    patchFields[fields2.modelSessionState] = "confirmed";
    patchFields[fields2.modelSessionStateUpdatedAt] = acknowledgedAt;
  }
  await airtableRequest(env, `${encodeURIComponent(tableId)}/${encodeURIComponent(session.id)}?returnFieldsByFieldId=true`, {
    method: "PATCH",
    body: JSON.stringify({ fields: patchFields })
  });
  return {
    acknowledged_at: acknowledgedAt,
    idempotent: Boolean(existing),
    session_status_promoted: promoteCustomerStatus,
    model_session_state_seeded: seedModelSessionState
  };
}
__name(patchAcknowledgement, "patchAcknowledgement");
function errorStatus(error2) {
  if (Number.isInteger(error2?.status)) return error2.status;
  const code15 = clean4(error2?.message, 200);
  if (code15 === "confirmation_token_expired") return 410;
  if (code15.startsWith("airtable_")) return 503;
  return 401;
}
__name(errorStatus, "errorStatus");
async function authorizeConfirmationRequest(request2, env) {
  if (!isAllowedOrigin(request2, env)) return { response: withCors3(request2, env, json3({ ok: false, error: "origin_not_allowed" }, 403)) };
  const body = await request2.json().catch(() => null);
  const token4 = clean4(body?.t || body?.token, 12e3);
  const expectedRole = clean4(body?.expected_role || body?.role, 40).toLowerCase();
  if (!token4) return { response: withCors3(request2, env, json3({ ok: false, error: "confirmation_token_required" }, 400)) };
  if (!["customer", "model"].includes(expectedRole)) {
    return { response: withCors3(request2, env, json3({ ok: false, error: "expected_role_required" }, 400)) };
  }
  try {
    const claims = await verifyToken(env, token4, expectedRole);
    const session = await findSession2(env, claims.session_id);
    if (!session?.id) return { response: withCors3(request2, env, json3({ ok: false, error: "session_not_found" }, 404)) };
    await assertSessionMatchesClaims(env, session, claims);
    return { claims, session, expectedRole, body };
  } catch (error2) {
    return {
      response: withCors3(request2, env, json3({ ok: false, error: clean4(error2?.message || "confirmation_authorization_failed", 200) }, errorStatus(error2)))
    };
  }
}
__name(authorizeConfirmationRequest, "authorizeConfirmationRequest");
async function handleConfirmationContext(request2, env = {}) {
  if (request2.method.toUpperCase() === "OPTIONS") return withCors3(request2, env, new Response(null, { status: 204 }));
  if (request2.method.toUpperCase() !== "POST") return withCors3(request2, env, json3({ ok: false, error: "method_not_allowed" }, 405));
  const authorized = await authorizeConfirmationRequest(request2, env);
  if (authorized.response) return authorized.response;
  return withCors3(request2, env, json3({
    ok: true,
    role: authorized.expectedRole,
    session_id: authorized.claims.session_id,
    confirmation: safeConfirmationContext(env, authorized.session, authorized.expectedRole)
  }));
}
__name(handleConfirmationContext, "handleConfirmationContext");
async function handleConfirmationAck(request2, env = {}) {
  if (request2.method.toUpperCase() === "OPTIONS") return withCors3(request2, env, new Response(null, { status: 204 }));
  if (request2.method.toUpperCase() !== "POST") return withCors3(request2, env, json3({ ok: false, error: "method_not_allowed" }, 405));
  const authorized = await authorizeConfirmationRequest(request2, env);
  if (authorized.response) return authorized.response;
  try {
    const revision = await confirmationRevision(env, authorized.session, authorized.claims.session_id);
    if (revision.confirmation_change_pending) return withCors3(request2, env, json3({ ok: false, error: "confirmation_change_pending" }, 409));
    const seenRevision = clean4(authorized.body?.confirmation_revision, 80);
    if ((revision.confirmation_revision_required || seenRevision) && seenRevision !== revision.confirmation_revision) {
      return withCors3(request2, env, json3({ ok: false, error: "confirmation_details_changed_reload_required" }, 409));
    }
    const ack = await patchAcknowledgement(env, authorized.session, authorized.expectedRole);
    return withCors3(request2, env, json3({
      ok: true,
      role: authorized.expectedRole,
      session_id: authorized.claims.session_id,
      acknowledged_at: ack.acknowledged_at,
      idempotent: ack.idempotent,
      session_status_promoted: ack.session_status_promoted,
      model_session_state_seeded: ack.model_session_state_seeded
    }));
  } catch (error2) {
    return withCors3(request2, env, json3({ ok: false, error: clean4(error2?.message || "confirmation_ack_failed", 200) }, errorStatus(error2)));
  }
}
__name(handleConfirmationAck, "handleConfirmationAck");

// confirmation-customer-presentation.js
var amount = /* @__PURE__ */ __name((v) => v == null || v === "" ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null, "amount");
var equal = /* @__PURE__ */ __name((a, b) => a != null && b != null && Math.abs(a - b) < 0.01, "equal");
function confirmationWorkLane(fields2, jobType, env = {}) {
  const lane = String(fields2[env.AT_SESSIONS__MODEL_WORK_LANE || "fldzYGziqLqTQaoaK"] || fields2.model_work_lane || "").toLowerCase().trim();
  if (["private_model", "public_model"].includes(lane)) return lane;
  const parts = String(jobType || "").toLowerCase().split(/[:+,|\s]+/);
  if (parts.includes("private") && !parts.includes("public")) return "private_model";
  if (parts.includes("public") && !parts.includes("private")) return "public_model";
  return null;
}
__name(confirmationWorkLane, "confirmationWorkLane");
function customerBillingBreakdown(pricing, totalValue, travelValue, service, jobType) {
  const total = amount(totalValue), full = amount(pricing?.full_price_thb), discount = amount(pricing?.discount_thb);
  const travel = amount(travelValue), net = full != null && discount != null ? full - discount : null;
  const included = travel > 0 && equal(net, total) && travel <= total;
  const added = travel > 0 && net != null && net >= 0 && equal(net + travel, total);
  const priceValid = net != null && net >= 0 && (equal(net, total) || added);
  const billing = {
    schema: "customer_billing_breakdown_v1",
    total_thb: total,
    original_price_thb: priceValid ? full : null,
    discount_thb: priceValid ? discount : null,
    discount_percent: priceValid && amount(pricing?.discount_percent) > 0 && amount(pricing?.discount_percent) <= 100 && Math.abs(full * amount(pricing.discount_percent) / 100 - discount) <= 1 ? amount(pricing.discount_percent) : null,
    travel_fee_thb: travel,
    travel_treatment: included ? "included" : added ? "added" : travel > 0 ? "review_required" : "none",
    breakdown_status: priceValid && !(travel > 0 && !included && !added) ? "complete" : "review_required",
    service_items: []
  };
  const base = amount(service?.client_base_amount_thb);
  if (base == null || !Array.isArray(service?.addons)) return billing;
  const allowed = /* @__PURE__ */ new Set(["mk", "burn", "kiss", "live", "group"]);
  const addons = service.addons.map((a) => ({ label: String(a.option || "").toUpperCase(), amount_thb: amount(a.client_amount_thb) }));
  if (addons.some((a) => !allowed.has(a.label.toLowerCase()) || a.amount_thb == null)) return billing;
  const gross = base + addons.reduce((n, a) => n + a.amount_thb, 0);
  if (!priceValid || !equal(gross, full)) return billing;
  const label = String(jobType || "").toUpperCase().split(/[:+,|\s]+/).find((x) => ["PN", "VIP"].includes(x)) || "\u0E04\u0E48\u0E32\u0E1A\u0E23\u0E34\u0E01\u0E32\u0E23";
  billing.service_items = [{ label, amount_thb: base }, ...addons];
  return billing;
}
__name(customerBillingBreakdown, "customerBillingBreakdown");

// confirmation-details.js
var AIRTABLE_API6 = "https://api.airtable.com/v0";
var CONFIRM_DETAILS_PATH = "/v1/confirm/details";
var SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  sessionStatus: "fldmwuvOaiCFdzzRa",
  createdAt: "flduULqxy2FIuJuaf",
  amountThb: "fldhwC79ndbnEXSZz",
  customerAmountDueThb: "fldvJowquu8RrsOMc",
  paymentRef: "fldojgjSQLaO0uQLX",
  paymentStatus: "fldTY5lE6m0kQf72n",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  jobType: "fldjK3U9bghnj7xUe",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  googleMapUrl: "fldoUDQ8sH93idPx0",
  note: "fldEcDkF7CH9VixWM",
  notes: "fldwl9Gs5tYlXG5ls",
  payModelThb: "fldlTO5aNfqUmlNWm",
  modelAckAt: "fldFgkHXivIAThfDz"
});
var MODEL_COMMON_KEYS = Object.freeze([
  "confirmation_revision",
  "confirmation_revision_required",
  "confirmation_change_pending",
  "ok",
  "authority",
  "schema",
  "role",
  "session_id",
  "session_status",
  "client_name",
  "model_name",
  "job_type",
  "model_work_lane",
  "neutral",
  "job_date",
  "start_time",
  "end_time",
  "location_name",
  "google_map_url",
  "vip_detail",
  "created_at"
]);
var PAYMENT_FIELDS = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  amountThb: "fldvCSwrUW8OMAooS",
  paymentStatus: "fldEJ1hmm7KwWuI6q",
  paymentMethod: "fldsblzIn0wzan3c9",
  paymentType: "fld1YPQ8j1CLxYeZ7",
  intentStatus: "fld04fr3bRJTohO6y",
  verificationStatus: "fldJ7a0Ube9F0bmRy",
  promptPayUrl: "fld8DEjbUmrzMWcNg",
  sessionId: "fld2wdhBvc8xrV6y5",
  paymentStage: "fldrr9g8ZZjqAbdKQ"
});
async function handleConfirmationDetails(request2, env = {}) {
  if (request2.method.toUpperCase() === "OPTIONS") {
    return withCors4(request2, env, new Response(null, { status: 204 }));
  }
  if (request2.method.toUpperCase() !== "POST") {
    return withCors4(request2, env, json4({ ok: false, error: "method_not_allowed" }, 405));
  }
  if (!isAllowedOrigin2(request2, env)) {
    return withCors4(request2, env, json4({ ok: false, error: "origin_not_allowed" }, 403));
  }
  const body = await request2.json().catch(() => null);
  const token4 = clean5(body?.t || body?.token, 12e3);
  const expectedRole = clean5(body?.expected_role || body?.role, 40).toLowerCase();
  if (!token4) return withCors4(request2, env, json4({ ok: false, error: "confirmation_token_required" }, 400));
  if (!["customer", "model"].includes(expectedRole)) {
    return withCors4(request2, env, json4({ ok: false, error: "expected_role_required" }, 400));
  }
  try {
    const claims = await verifyConfirmToken(env, token4, { expectedRole });
    const session = await findSession3(env, claims.session_id);
    if (!session?.id) return withCors4(request2, env, json4({ ok: false, error: "session_not_found" }, 404));
    const fields2 = session.fields || {};
    const sessionPaymentRef = text5(fields2[field(env.AT_SESSIONS__PAYMENT_REF, SESSION_FIELDS.paymentRef)], 200);
    const finalPaymentRef = await stablePaymentRef(claims.session_id, "final");
    if (sessionPaymentRef && !(/* @__PURE__ */ new Set([text5(claims.payment_ref, 200), finalPaymentRef])).has(sessionPaymentRef)) {
      return withCors4(request2, env, json4({ ok: false, error: "confirmation_session_mismatch" }, 409));
    }
    const note = clean5(fields2[SESSION_FIELDS.note] || fields2[SESSION_FIELDS.notes], 8e3);
    const pricing = parseMarkedJson(note, "SIGIL Pricing v1");
    const vip = parseMarkedJson(note, "SIGIL VIP Detail v1");
    const servicePricing = parseMarkedJson(note, "MMD SERVICE PRICING v1");
    const modelRateBreakdown = parseMarkedJson(note, "MMD MODEL PAYOUT BREAKDOWN v1");
    const modelPricing = modelRateBreakdown || servicePricing;
    const common = {
      ...await confirmationRevision(env, session, claims.session_id),
      ok: true,
      authority: "payments-worker",
      schema: "confirmation_details_v1",
      role: expectedRole,
      session_id: text5(claims.session_id, 200),
      payment_ref: text5(claims.payment_ref, 200),
      payment_type: text5(claims.payment_type, 80),
      session_status: text5(fields2[SESSION_FIELDS.sessionStatus], 120),
      payment_status: text5(fields2[field(env.AT_SESSIONS__PAYMENT_STATUS, SESSION_FIELDS.paymentStatus)], 120),
      client_name: text5(fields2[SESSION_FIELDS.clientName], 240),
      model_name: text5(fields2[SESSION_FIELDS.modelName], 240),
      job_type: modelJobType(text5(fields2[SESSION_FIELDS.jobType], 240), note, modelPricing),
      model_work_lane: confirmationWorkLane(fields2, fields2[SESSION_FIELDS.jobType], env),
      neutral: claims.neutral === true,
      job_date: text5(fields2[SESSION_FIELDS.jobDate], 120),
      start_time: text5(fields2[SESSION_FIELDS.startTime], 120),
      end_time: text5(fields2[SESSION_FIELDS.endTime], 120),
      location_name: text5(fields2[SESSION_FIELDS.locationName], 360),
      google_map_url: safeUrl(fields2[SESSION_FIELDS.googleMapUrl]),
      vip_detail: text5(vip?.vip_detail, 240) || null,
      created_at: text5(fields2[SESSION_FIELDS.createdAt], 120)
    };
    if (expectedRole === "customer") {
      const net = numberOrNull(fields2[field(env.AT_SESSIONS__AMOUNT_THB, SESSION_FIELDS.amountThb)]);
      let safePricing = customerPricing(pricing, net);
      let paymentRecord = null;
      let proofRecord = null;
      let activePaymentRef = text5(claims.payment_ref, 200);
      try {
        const finalPayment = await findPayment2(env, finalPaymentRef, claims.session_id);
        if (finalPayment?.id) {
          paymentRecord = finalPayment;
          activePaymentRef = finalPaymentRef;
        } else {
          paymentRecord = await findPayment2(env, claims.payment_ref, claims.session_id);
        }
      } catch (error2) {
        throw error2;
      }
      let balanceProjection = null;
      if (shouldResolveCustomerBalance(paymentRecord, env)) {
        const summary2 = await readVerifiedSessionBalance(env, session);
        balanceProjection = customerBalanceProjection(summary2, paymentRecord, finalPaymentRef, env);
        activePaymentRef = balanceProjection.payment_ref;
        paymentRecord = balanceProjection.paymentRecord;
        safePricing = {
          ...safePricing,
          net_price_thb: summary2.total_amount_thb,
          deposit_received_thb: summary2.verified_deposit_thb,
          balance_thb: summary2.remaining_amount_thb
        };
      }
      try {
        proofRecord = await findProofEvidence(env, activePaymentRef);
      } catch (error2) {
        if (balanceProjection) throw error2;
      }
      const customerAmountDue = numberOrNull(fields2[SESSION_FIELDS.customerAmountDueThb]);
      const display = customerPaymentDisplay({
        paymentRecord,
        pricing: safePricing,
        customerAmountDue,
        claimedPaymentType: claims.payment_type,
        sessionPaymentStatus: common.payment_status,
        paymentRef: activePaymentRef,
        proofRecord
      });
      if (balanceProjection) Object.assign(display, {
        stage: balanceProjection.payment_type,
        amount_due_thb: balanceProjection.amount_due_thb,
        verified: balanceProjection.verified,
        // Payment Instructions generates the current amount QR, not an old stored QR.
        qr_url: null
      });
      else if (snapshotClaimsDepositReceived(pricing)) {
        const summary2 = await readVerifiedSessionBalance(env, session);
        if (summary2.verified_deposit_thb > 0) {
          balanceProjection = customerBalanceProjection(summary2, paymentRecord, finalPaymentRef, env);
          activePaymentRef = balanceProjection.payment_ref;
          paymentRecord = balanceProjection.paymentRecord;
          safePricing = {
            ...safePricing,
            net_price_thb: summary2.total_amount_thb,
            deposit_received_thb: summary2.verified_deposit_thb,
            balance_thb: summary2.remaining_amount_thb
          };
          Object.assign(display, {
            stage: balanceProjection.payment_type,
            amount_due_thb: balanceProjection.amount_due_thb,
            verified: balanceProjection.verified,
            qr_url: null
          });
        } else {
          safePricing = {
            ...safePricing,
            deposit_received_thb: 0,
            balance_thb: summary2.remaining_amount_thb
          };
          if (paymentRecord) {
            display.stage = "deposit";
            display.amount_due_thb = numberOrNull(safePricing.deposit_due_thb) ?? customerAmountDue;
            display.verified = false;
            display.qr_url = null;
          }
        }
      }
      display.liff_url = ["deposit", "full", "final", "balance"].includes(display.stage) && display.amount_due_thb > 0 && display.accepting_payment !== false && !display.verified && !display.proof_received ? `https://miniapp.line.me/2010830159-0n1O3ANK?t=${encodeURIComponent(token4)}` : null;
      return withCors4(request2, env, json4({
        ...common,
        payment_ref: activePaymentRef,
        amount_thb: net,
        pricing: safePricing,
        billing: customerBillingBreakdown(
          pricing,
          balanceProjection?.summary.total_amount_thb ?? net,
          fields2["fld703jI4zQ0CYMHh"] ?? fields2.travel_fee_thb,
          servicePricing,
          common.job_type
        ),
        payment_type: balanceProjection?.payment_type || common.payment_type,
        ...balanceProjection ? { balance_summary: balanceProjection.summary } : {},
        payment: display
      }));
    }
    const modelPayout = numberOrNull(fields2[SESSION_FIELDS.payModelThb]);
    const modelRemark = parseMarkedJson(note, "MMD Model Remark v1");
    const modelCommon = Object.fromEntries(MODEL_COMMON_KEYS.map((key) => [key, common[key]]));
    modelCommon.job_type = modelJobType(common.job_type, note, modelPricing);
    const modelAcknowledgedAt = text5(fields2[field(env.AT_SESSIONS__MODEL_ACK_AT, SESSION_FIELDS.modelAckAt)], 200) || null;
    return withCors4(request2, env, json4({
      ...modelCommon,
      model_acknowledged_at: modelAcknowledgedAt,
      already_confirmed: Boolean(modelAcknowledgedAt),
      model_payout_thb: modelPayout,
      model_payout_breakdown: modelPayoutBreakdown(modelPricing, modelPayout, common.job_type),
      model_remark: text5(modelRemark?.text, 2e3) || null,
      model_meeting_point: text5(modelRemark?.meeting_point, 500) || null,
      amount_scope: "model_payout",
      // Partner-issued links render without MMD branding (signed claim, not a query flag).
      neutral: claims.neutral === true,
      issued_via: claims.via === "partner" ? "partner" : null
    }));
  } catch (error2) {
    return withCors4(request2, env, json4({
      ok: false,
      error: clean5(error2?.message || "confirmation_details_failed", 200)
    }, errorStatus2(error2)));
  }
}
__name(handleConfirmationDetails, "handleConfirmationDetails");
function modelJobType(jobType, note, servicePricing) {
  const options = serviceOptions(note, servicePricing);
  if (!options.length) return text5(jobType, 240);
  const parts = text5(jobType, 240).split(/[:+,|]/).map((part) => part.trim()).filter(Boolean);
  const existing = new Set(parts.map((part) => part.toLowerCase()));
  for (const option of options) if (!existing.has(option)) parts.push(option);
  return parts.join(":");
}
__name(modelJobType, "modelJobType");
function serviceOptions(note, servicePricing) {
  const allowed = /* @__PURE__ */ new Set(["mk", "burn", "kiss", "live", "group"]);
  const fromSnapshot = Array.isArray(servicePricing?.addons) ? servicePricing.addons.map((item) => String(item?.option || "").toLowerCase()) : [];
  const optionLine = String(note || "").match(/(?:^|[|\n])\s*options\s+([a-z, _-]+)/i)?.[1] || "";
  return [.../* @__PURE__ */ new Set([...fromSnapshot, ...optionLine.split(/[,_\s]+/).map((item) => item.toLowerCase())])].filter((item) => allowed.has(item));
}
__name(serviceOptions, "serviceOptions");
function modelPayoutBreakdown(servicePricing, modelPayout, jobType) {
  if (!servicePricing || !Array.isArray(servicePricing.addons) || modelPayout === null) return null;
  const base = numberOrNull(servicePricing.model_base_payout_thb);
  const baseLine = modelPayoutLine(base, servicePricing.model_standard_base_rate_thb, servicePricing.model_base_job_adjustment_thb);
  const additions = servicePricing.addons.map((item) => ({
    option: String(item?.option || "").toLowerCase(),
    ...modelPayoutLine(item?.model_payout_thb, item?.model_standard_rate_thb, item?.model_job_adjustment_thb)
  }));
  const total = numberOrNull(servicePricing.model_total_payout_thb);
  const allowed = /* @__PURE__ */ new Set(["mk", "burn", "kiss", "live", "group"]);
  if (baseLine === null || base <= 0 || additions.some((item) => !allowed.has(item.option) || item.amount_thb === null || item.amount_thb < 0) || !Number.isFinite(total) || Math.abs(base + additions.reduce((sum, item) => sum + item.amount_thb, 0) - total) > 0.01 || Math.abs(total - modelPayout) > 0.01) return null;
  const parts = text5(jobType, 240).split(/[:+,|]/).map((part) => part.trim()).filter(Boolean);
  const baseLabel = parts.find((part) => ["pn", "vip"].includes(part.toLowerCase())) || parts.at(-1) || "\u0E07\u0E32\u0E19\u0E2B\u0E25\u0E31\u0E01";
  return [
    { label: text5(baseLabel, 40).toUpperCase(), ...baseLine },
    ...additions.filter((item) => item.amount_thb > 0).map(({ option, ...line }) => ({ label: option.toUpperCase(), ...line }))
  ];
}
__name(modelPayoutBreakdown, "modelPayoutBreakdown");
function modelPayoutLine(amountValue, standardValue, adjustmentValue) {
  const amount_thb = numberOrNull(amountValue);
  const standard_amount_thb = numberOrNull(standardValue);
  const job_adjustment_thb = numberOrNull(adjustmentValue);
  if (amount_thb === null || amount_thb < 0) return null;
  if (standard_amount_thb === null && job_adjustment_thb === null) return { amount_thb };
  if (standard_amount_thb === null || standard_amount_thb < 0 || job_adjustment_thb === null || Math.abs(standard_amount_thb + job_adjustment_thb - amount_thb) > 0.01) return null;
  return { amount_thb, standard_amount_thb, job_adjustment_thb };
}
__name(modelPayoutLine, "modelPayoutLine");
function customerPricing(raw, netFallback) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const full = numberOrNull(source.full_price_thb);
  const discount = numberOrNull(source.discount_thb);
  const net = numberOrNull(source.net_price_thb) ?? netFallback;
  const basis = numberOrNull(source.deposit_basis_thb) ?? full;
  return {
    full_price_thb: full,
    discount_mode: text5(source.discount_mode, 40) || "none",
    discount_percent: numberOrNull(source.discount_percent),
    discount_thb: discount,
    net_price_thb: net,
    deposit_basis_thb: basis,
    deposit_percent: numberOrNull(source.deposit_percent),
    deposit_due_thb: numberOrNull(source.deposit_due_thb),
    deposit_received_thb: numberOrNull(source.deposit_received_thb),
    balance_thb: numberOrNull(source.balance_thb)
  };
}
__name(customerPricing, "customerPricing");
function snapshotClaimsDepositReceived(pricing) {
  return (numberOrNull(pricing?.deposit_received_thb) || 0) > 0;
}
__name(snapshotClaimsDepositReceived, "snapshotClaimsDepositReceived");
function customerPaymentDisplay({ paymentRecord, proofRecord, pricing, customerAmountDue, claimedPaymentType, sessionPaymentStatus, paymentRef }) {
  const fields2 = paymentRecord?.fields || {};
  const storedStage = normalizePaymentStage(fields2[PAYMENT_FIELDS.paymentStage] || fields2[PAYMENT_FIELDS.paymentType]);
  const claimedStage = normalizePaymentStage(claimedPaymentType);
  let stage2 = storedStage;
  let amountDue = null;
  if (storedStage) {
    amountDue = paymentAmountDue(storedStage, pricing, customerAmountDue);
  } else if (customerAmountDue !== null) {
    amountDue = customerAmountDue;
  } else {
    stage2 = claimedStage;
    amountDue = paymentAmountDue(claimedStage, pricing, null);
  }
  const method = text5(fields2[PAYMENT_FIELDS.paymentMethod], 80).toLowerCase() || (safeUrl(fields2[PAYMENT_FIELDS.promptPayUrl]) ? "promptpay" : null);
  const promptPayUrl = safeUrl(fields2[PAYMENT_FIELDS.promptPayUrl]) || null;
  const verified = isVerifiedPayment(
    fields2[PAYMENT_FIELDS.verificationStatus],
    fields2[PAYMENT_FIELDS.paymentStatus],
    sessionPaymentStatus
  );
  const proofReceived = isProofReceived(fields2[PAYMENT_FIELDS.intentStatus]) || isProofEvidenceRecord(proofRecord);
  return {
    schema: "customer_payment_display_v1",
    stage: stage2 || null,
    method: method || null,
    amount_due_thb: amountDue,
    qr_url: promptPayUrl,
    proof_status_available: Boolean(text5(paymentRef, 200)),
    proof_received: proofReceived,
    verified
  };
}
__name(customerPaymentDisplay, "customerPaymentDisplay");
function paymentAmountDue(stage2, pricing, customerAmountDue) {
  if (stage2 === "deposit") return numberOrNull(pricing?.deposit_due_thb) ?? customerAmountDue;
  if (stage2 === "balance" || stage2 === "final") return numberOrNull(pricing?.balance_thb) ?? customerAmountDue;
  if (stage2 === "full") return numberOrNull(pricing?.net_price_thb) ?? customerAmountDue;
  return customerAmountDue;
}
__name(paymentAmountDue, "paymentAmountDue");
function normalizePaymentStage(value3) {
  const raw = text5(value3, 80).toLowerCase().replace(/[\s_-]+/g, "");
  if (["deposit", "\u0E21\u0E31\u0E14\u0E08\u0E33"].includes(raw)) return "deposit";
  if (["balance", "remaining", "remainder", "\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D"].includes(raw)) return "balance";
  if (["final", "finalpayment"].includes(raw)) return "final";
  if (["full", "fullpayment", "payinfull"].includes(raw)) return "full";
  return "";
}
__name(normalizePaymentStage, "normalizePaymentStage");
function isVerifiedPayment(...values) {
  const accepted = /* @__PURE__ */ new Set(["verified", "approved", "paid", "completed", "complete"]);
  return values.some((value3) => accepted.has(text5(value3, 80).toLowerCase()));
}
__name(isVerifiedPayment, "isVerifiedPayment");
function isProofReceived(...values) {
  const accepted = /* @__PURE__ */ new Set([
    "evidence_received",
    "proof_received",
    "submitted",
    "pending_review",
    "reviewing",
    "manual_slip_evidence_received"
  ]);
  return values.some((value3) => accepted.has(text5(value3, 80).toLowerCase().replace(/[\s-]+/g, "_")));
}
__name(isProofReceived, "isProofReceived");
function parseMarkedJson(note, label) {
  const source = String(note || "");
  const marker = `[${String(label)}]`;
  let searchEnd = source.length;
  while (searchEnd > 0) {
    const markerIndex = source.lastIndexOf(marker, searchEnd - 1);
    if (markerIndex < 0) return null;
    let start = markerIndex + marker.length;
    while (start < source.length && /\s/.test(source[start])) start += 1;
    if (source[start] !== "{") {
      searchEnd = markerIndex;
      continue;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    let parsed = null;
    for (let i = start; i < source.length; i += 1) {
      const char = source[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") {
        depth += 1;
        continue;
      }
      if (char === "}") {
        depth -= 1;
        if (depth !== 0) continue;
        try {
          const candidate = JSON.parse(source.slice(start, i + 1));
          if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) parsed = candidate;
        } catch {
        }
        break;
      }
    }
    if (parsed) return parsed;
    searchEnd = markerIndex;
  }
  return null;
}
__name(parseMarkedJson, "parseMarkedJson");
async function findSession3(env, sessionId) {
  const baseId2 = clean5(env.AIRTABLE_BASE_ID, 100);
  const tableId = clean5(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 100);
  const apiKey = clean5(env.AIRTABLE_API_KEY, 5e3);
  if (!baseId2 || !tableId || !apiKey) throw httpError(503, "airtable_not_ready");
  const formula5 = `{session_id}='${formulaValue(sessionId)}'`;
  const query = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: formula5,
    returnFieldsByFieldId: "true"
  });
  const req = new Request(`${AIRTABLE_API6}/${baseId2}/${encodeURIComponent(tableId)}?${query.toString()}`, {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` }
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : 500, "airtable_request_failed");
  const records = Array.isArray(data?.records) ? data.records : [];
  if (records.length > 1) throw httpError(409, "session_id_ambiguous");
  return records[0] || null;
}
__name(findSession3, "findSession");
async function findProofEvidence(env, paymentRef) {
  const ref = text5(paymentRef, 200);
  if (!ref) return null;
  const baseId2 = clean5(env.AIRTABLE_BASE_ID, 100);
  const tableId = clean5(env.AIRTABLE_TABLE_PAYMENT_PROOFS || "tblfJfM4Sqag9zrLi", 100);
  const apiKey = clean5(env.AIRTABLE_API_KEY, 5e3);
  if (!baseId2 || !tableId || !apiKey) return null;
  const formula5 = `{payment_ref}='${formulaValue(ref)}'`;
  const query = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: formula5
  });
  const req = new Request(`${AIRTABLE_API6}/${baseId2}/${encodeURIComponent(tableId)}?${query.toString()}`, {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` }
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : 500, "airtable_proof_request_failed");
  const records = Array.isArray(data?.records) ? data.records : [];
  if (records.length > 1) throw httpError(409, "payment_evidence_ambiguous");
  return records[0] || null;
}
__name(findProofEvidence, "findProofEvidence");
function isProofEvidenceRecord(record) {
  const status = text5(record?.fields?.status, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (!record?.id) return false;
  if (!status) return true;
  return (/* @__PURE__ */ new Set([
    "submitted",
    "pending",
    "pending_review",
    "review",
    "review_required",
    "needs_review",
    "under_review",
    "matched",
    "verified",
    "approved"
  ])).has(status);
}
__name(isProofEvidenceRecord, "isProofEvidenceRecord");
async function findPayment2(env, paymentRef, sessionId) {
  const ref = text5(paymentRef, 200);
  const sid = text5(sessionId, 200);
  if (!ref || !sid) return null;
  const baseId2 = clean5(env.AIRTABLE_BASE_ID, 100);
  const tableId = clean5(env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ", 100);
  const apiKey = clean5(env.AIRTABLE_API_KEY, 5e3);
  if (!baseId2 || !tableId || !apiKey) return null;
  const formula5 = `AND({Payment Reference}='${formulaValue(ref)}',{session_id}='${formulaValue(sid)}')`;
  const query = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: formula5,
    returnFieldsByFieldId: "true"
  });
  const req = new Request(`${AIRTABLE_API6}/${baseId2}/${encodeURIComponent(tableId)}?${query.toString()}`, {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` }
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : 500, "airtable_payment_request_failed");
  const records = Array.isArray(data?.records) ? data.records : [];
  if (records.length > 1) throw httpError(409, "payment_evidence_ambiguous");
  const record = records[0] || null;
  if (!record?.fields) return null;
  const recordRef = text5(record.fields[PAYMENT_FIELDS.paymentRef], 200);
  const recordSessionId = text5(record.fields[PAYMENT_FIELDS.sessionId], 200);
  if (recordRef !== ref || recordSessionId !== sid) return null;
  return record;
}
__name(findPayment2, "findPayment");
function allowedOrigins2(env = {}) {
  return clean5(env.ALLOWED_ORIGINS || "", 5e3).replace(/^[\"']|[\"']$/g, "").split(",").map((value3) => value3.trim().replace(/^[\"']|[\"']$/g, "")).filter(Boolean);
}
__name(allowedOrigins2, "allowedOrigins");
function corsHeaders2(request2, env = {}) {
  const origin = clean5(request2.headers.get("origin"), 500);
  const headers = new Headers({
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin"
  });
  if (origin && allowedOrigins2(env).includes(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}
__name(corsHeaders2, "corsHeaders");
function withCors4(request2, env, response) {
  const headers = new Headers(response.headers);
  corsHeaders2(request2, env).forEach((value3, key) => headers.set(key, value3));
  headers.set("cache-control", "no-store, private");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
__name(withCors4, "withCors");
function isAllowedOrigin2(request2, env = {}) {
  const origin = clean5(request2.headers.get("origin"), 500);
  return Boolean(origin && allowedOrigins2(env).includes(origin));
}
__name(isAllowedOrigin2, "isAllowedOrigin");
function errorStatus2(error2) {
  if (Number.isInteger(error2?.status)) return error2.status;
  const code15 = clean5(error2?.message, 200);
  if (code15 === "confirmation_token_expired") return 410;
  if (code15.startsWith("airtable_")) return 503;
  return 401;
}
__name(errorStatus2, "errorStatus");
function field(configured, fallback) {
  return clean5(configured, 100) || fallback;
}
__name(field, "field");
function numberOrNull(value3) {
  if (value3 === null || value3 === void 0 || value3 === "") return null;
  const n = Number(value3);
  return Number.isFinite(n) ? n : null;
}
__name(numberOrNull, "numberOrNull");
function safeUrl(value3) {
  const raw = text5(value3, 1200);
  return /^https:\/\//i.test(raw) ? raw : "";
}
__name(safeUrl, "safeUrl");
function text5(value3, max = 5e3) {
  return clean5(value3, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}
__name(text5, "text");
function clean5(value3, max = 5e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max);
}
__name(clean5, "clean");
function json4(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
__name(json4, "json");

// confirmation-promo.js
var AIRTABLE_API7 = "https://api.airtable.com/v0";
var MEMBER_PAGES_REDEEM_URL = "https://member-pages-worker.internal/__internal/care-back/redeem-code";
var SERVICE_HEADER = "x-mmd-payments-secret";
var PRICING_LABEL = "SIGIL Pricing v1";
var PROMO_LABEL = "SIGIL Promo v1";
var SERVICE_DATE_WINDOW_DAYS = 90;
var SESSION_LINE_USER_ID = "fld5tzCzdTTh8AJyI";
var SESSION_MEMBER_ID = "fldHsczyzr8axfwUC";
var CONFIRM_APPLY_PROMO_PATH = "/v1/confirm/apply-promo";
async function handleConfirmApplyPromo(request2, env = {}, now = /* @__PURE__ */ new Date()) {
  const verb = request2.method.toUpperCase();
  if (verb === "OPTIONS") return withCors4(request2, env, new Response(null, { status: 204 }));
  if (verb !== "POST") return withCors4(request2, env, json4({ ok: false, error: "method_not_allowed" }, 405));
  if (!isAllowedOrigin2(request2, env)) return withCors4(request2, env, json4({ ok: false, error: "origin_not_allowed" }, 403));
  const body = await request2.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return withCors4(request2, env, json4({ ok: false, error: "invalid_json" }, 400));
  }
  for (const key of ["percent", "discount_percent", "approved_discount_percent", "discount_thb", "amount", "amount_thb", "net_price_thb"]) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return withCors4(request2, env, json4({ ok: false, error: "caller_discount_authority_rejected" }, 400));
    }
  }
  const token4 = clean5(body.t || body.token, 12e3);
  const code15 = clean5(body.code || body.promo_code, 40).toUpperCase();
  if (!token4) return withCors4(request2, env, json4({ ok: false, error: "confirmation_token_required" }, 400));
  if (!/^[A-Z0-9]{6}$/.test(code15)) return withCors4(request2, env, json4({ ok: false, error: "promo_code_invalid_format" }, 400));
  try {
    const claims = await verifyConfirmToken(env, token4, { expectedRole: "customer" });
    const session = await findSession3(env, claims.session_id);
    if (!session?.id) return withCors4(request2, env, json4({ ok: false, error: "session_not_found" }, 404));
    const fields2 = session.fields || {};
    const sessionPaymentRef = text5(fields2[field(env.AT_SESSIONS__PAYMENT_REF, SESSION_FIELDS.paymentRef)], 200);
    const finalPaymentRef = await stablePaymentRef(claims.session_id, "final");
    if (sessionPaymentRef && !(/* @__PURE__ */ new Set([text5(claims.payment_ref, 200), finalPaymentRef])).has(sessionPaymentRef)) {
      return withCors4(request2, env, json4({ ok: false, error: "confirmation_session_mismatch" }, 409));
    }
    const noteField = clean5(fields2[SESSION_FIELDS.note], 8e3) ? SESSION_FIELDS.note : SESSION_FIELDS.notes;
    const note = clean5(fields2[noteField], 8e3);
    const pricing = parseMarkedJson(note, PRICING_LABEL);
    const full = numberOrNull(pricing?.full_price_thb);
    if (!pricing || !full || full <= 0) return fail3(request2, env, 409, "pricing_unavailable");
    const paymentStatus = text5(fields2[field(env.AT_SESSIONS__PAYMENT_STATUS, SESSION_FIELDS.paymentStatus)], 120).toLowerCase();
    if (["verified", "approved", "paid", "completed", "complete"].includes(paymentStatus)) {
      return fail3(request2, env, 409, "payment_already_verified");
    }
    if (clean5(claims.payment_type).toLowerCase() !== "deposit") return fail3(request2, env, 409, "promo_only_on_deposit_stage");
    const prior = parseMarkedJson(note, PROMO_LABEL);
    if (prior?.source === "care_back") {
      if (clean5(prior.code).toUpperCase() === code15) {
        return withCors4(request2, env, json4({ ok: true, applied: true, already_applied: true, ...summary(pricing) }));
      }
      return fail3(request2, env, 409, "promo_already_applied");
    }
    if (clean5(pricing.discount_mode).toLowerCase() !== "none" || numberOrNull(pricing.discount_thb) > 0) {
      return fail3(request2, env, 409, "discount_already_applied");
    }
    const jobDate = Date.parse(text5(fields2[SESSION_FIELDS.jobDate], 120));
    if (Number.isFinite(jobDate) && jobDate > now.getTime() + SERVICE_DATE_WINDOW_DAYS * 864e5) {
      return fail3(request2, env, 409, "service_date_outside_window");
    }
    const jobFormat = jobFormatFrom(fields2[SESSION_FIELDS.jobType], note);
    const modelName = text5(fields2[SESSION_FIELDS.modelName], 240);
    if (!jobFormat) return fail3(request2, env, 409, "job_format_unresolved");
    if (!modelName) return fail3(request2, env, 409, "model_unresolved");
    const secret = clean5(env.AUTH_SERVICE_PAYMENTS_TO_MEMBER_PAGES);
    if (secret.length < 32 || !env.MEMBER_PAGES_WORKER?.fetch) return fail3(request2, env, 503, "promo_service_not_configured");
    const upstream = await env.MEMBER_PAGES_WORKER.fetch(new Request(MEMBER_PAGES_REDEEM_URL, {
      method: "POST",
      headers: { "content-type": "application/json", [SERVICE_HEADER]: secret },
      body: JSON.stringify({
        code: code15,
        session_id: text5(claims.session_id, 200),
        selected_model_name: modelName,
        job_format: jobFormat,
        line_user_id: text5(fields2[SESSION_LINE_USER_ID], 80),
        member_id: text5(fields2[SESSION_MEMBER_ID], 160)
      })
    }));
    const redeemed = await upstream.json().catch(() => null);
    if (!upstream.ok || redeemed?.ok !== true) {
      const status = upstream.status === 409 ? 409 : 503;
      return fail3(request2, env, status, clean5(redeemed?.error, 80) || "promo_service_unavailable");
    }
    const percent = Number(redeemed.approved_discount_percent);
    if (!Number.isInteger(percent) || percent < 3 || percent > 20) return fail3(request2, env, 502, "promo_percent_invalid");
    const next = discountedPricing(pricing, full, percent);
    const nextNote = withReplacedMarkedJson(withReplacedMarkedJson(note, PRICING_LABEL, next), PROMO_LABEL, {
      source: "care_back",
      code: code15,
      percent,
      applied_at: now.toISOString()
    }, true);
    const patch = { [noteField]: nextNote, [SESSION_FIELDS.amountThb]: next.net_price_thb };
    const oldDue = numberOrNull(fields2[SESSION_FIELDS.customerAmountDueThb]);
    if (oldDue !== null && oldDue === numberOrNull(pricing.balance_thb)) patch[SESSION_FIELDS.customerAmountDueThb] = next.balance_thb;
    await patchSession(env, session.id, patch);
    return withCors4(request2, env, json4({ ok: true, applied: true, already_applied: false, ...summary(next) }));
  } catch (error2) {
    return withCors4(request2, env, json4({ ok: false, error: clean5(error2?.message || "apply_promo_failed", 120) }, errorStatus2(error2)));
  }
}
__name(handleConfirmApplyPromo, "handleConfirmApplyPromo");
function discountedPricing(pricing, full, percent) {
  const discount = Math.round(full * percent / 100);
  const net = full - discount;
  const full_payment = clean5(pricing.payment_type).toLowerCase() === "full";
  const received = full_payment ? net : Math.max(0, numberOrNull(pricing.deposit_received_thb) || 0);
  const depositCovered = Math.max(received, numberOrNull(pricing.deposit_due_thb) || 0);
  return {
    ...pricing,
    discount_mode: "percent",
    discount_percent: percent,
    discount_thb: discount,
    net_price_thb: net,
    deposit_received_thb: received,
    balance_thb: full_payment ? 0 : Math.max(0, net - depositCovered)
  };
}
__name(discountedPricing, "discountedPricing");
function jobFormatFrom(jobType, note) {
  const tokens = /* @__PURE__ */ __name((value3) => new Set(String(value3 || "").toLowerCase().split(/[^a-z]+/).filter(Boolean)), "tokens");
  const fromType = tokens(jobType);
  const hasVip = fromType.has("vip");
  const hasPn = fromType.has("pn");
  if (hasVip !== hasPn) return hasVip ? "VIP" : "PN";
  if (hasVip && hasPn) return "";
  const work = /work\s+(pn|vip)\b/i.exec(String(note || ""));
  return work ? work[1].toUpperCase() : "";
}
__name(jobFormatFrom, "jobFormatFrom");
function withReplacedMarkedJson(note, label, value3, append = false) {
  const source = String(note || "");
  const marker = `[${label}]`;
  const encoded = JSON.stringify(value3);
  const markerIndex = source.lastIndexOf(marker);
  if (markerIndex < 0) return append ? `${source}${source && !source.endsWith("\n") ? "\n" : ""}${marker} ${encoded}` : source;
  let start = markerIndex + marker.length;
  while (start < source.length && /\s/.test(source[start])) start += 1;
  if (source[start] !== "{") return append ? `${source}
${marker} ${encoded}` : source;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return `${source.slice(0, markerIndex + marker.length)} ${encoded}${source.slice(i + 1)}`;
    }
  }
  return source;
}
__name(withReplacedMarkedJson, "withReplacedMarkedJson");
function summary(pricing) {
  return {
    pricing: {
      full_price_thb: numberOrNull(pricing.full_price_thb),
      discount_mode: text5(pricing.discount_mode, 40) || "none",
      discount_percent: numberOrNull(pricing.discount_percent),
      discount_thb: numberOrNull(pricing.discount_thb),
      net_price_thb: numberOrNull(pricing.net_price_thb),
      deposit_due_thb: numberOrNull(pricing.deposit_due_thb),
      deposit_received_thb: numberOrNull(pricing.deposit_received_thb),
      balance_thb: numberOrNull(pricing.balance_thb)
    }
  };
}
__name(summary, "summary");
function fail3(request2, env, status, error2) {
  return withCors4(request2, env, json4({ ok: false, error: error2 }, status));
}
__name(fail3, "fail");
async function patchSession(env, recordId3, fields2) {
  const baseId2 = clean5(env.AIRTABLE_BASE_ID, 100);
  const tableId = clean5(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 100);
  const apiKey = clean5(env.AIRTABLE_API_KEY, 5e3);
  if (!baseId2 || !apiKey) throw Object.assign(new Error("airtable_not_ready"), { status: 503 });
  const req = new Request(`${AIRTABLE_API7}/${baseId2}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId3)}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ fields: fields2, typecast: false })
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
  if (!response.ok) throw Object.assign(new Error("promo_session_update_failed_retry"), { status: 503 });
}
__name(patchSession, "patchSession");

// model-payout-destination.js
var PAYOUT_DEST_CONTEXT_PATH = "/v1/confirm/payout-destination/context";
var PAYOUT_DEST_SUBMIT_PATH = "/v1/confirm/payout-destination";
var AIRTABLE_API8 = "https://api.airtable.com/v0";
var DEFAULT_MODELS_TABLE = "tblI4B0bI446vp9GX";
var DEFAULT_SESSION_MODEL_ACK = "fldFgkHXivIAThfDz";
var DEFAULT_SESSION_CANONICAL_MODEL = "fldrXQAyOMPCvbOaY";
var RATE_LIMIT_MAX = 5;
var RATE_LIMIT_TTL_SECONDS = 3600;
var DESTINATION_TYPES = Object.freeze(["promptpay_phone", "promptpay_national_id", "bank_account"]);
var STATUS_PENDING = "pending";
var STATUS_VERIFIED = "verified";
function clean6(value3, max = 500) {
  return String(value3 == null ? "" : value3).trim().slice(0, max);
}
__name(clean6, "clean");
function json5(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
__name(json5, "json");
function withCors5(request2, env, response) {
  const origin = clean6(request2.headers.get("origin"), 500);
  const allowed = clean6(env.ALLOWED_ORIGINS || "", 5e3).replace(/^['"]|['"]$/g, "").split(",").map((value3) => value3.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-methods", "POST,OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  if (origin && allowed.includes(origin)) headers.set("access-control-allow-origin", origin);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
__name(withCors5, "withCors");
function isDestinationEnabled(env = {}) {
  return clean6(env.MODEL_PAYOUT_DESTINATION_ENABLED, 20).toLowerCase() === "true";
}
__name(isDestinationEnabled, "isDestinationEnabled");
function destinationFieldConfig(env = {}) {
  const config = {
    modelsTable: clean6(env.AT_MODELS__TABLE || DEFAULT_MODELS_TABLE, 100),
    sessionModelAck: clean6(env.AT_SESSIONS__MODEL_ACK_AT || DEFAULT_SESSION_MODEL_ACK, 100),
    sessionCanonicalModel: clean6(env.AT_SESSIONS__CANONICAL_MODEL || DEFAULT_SESSION_CANONICAL_MODEL, 100),
    type: clean6(env.AT_MODELS__PAYOUT_DEST_TYPE, 100),
    bank: clean6(env.AT_MODELS__PAYOUT_DEST_BANK, 100),
    name: clean6(env.AT_MODELS__PAYOUT_DEST_NAME, 100),
    ref: clean6(env.AT_MODELS__PAYOUT_DEST_REF, 100),
    status: clean6(env.AT_MODELS__PAYOUT_DEST_STATUS, 100),
    submittedAt: clean6(env.AT_MODELS__PAYOUT_DEST_SUBMITTED_AT, 100),
    verifiedBy: clean6(env.AT_MODELS__PAYOUT_DEST_VERIFIED_BY, 100),
    verifiedAt: clean6(env.AT_MODELS__PAYOUT_DEST_VERIFIED_AT, 100)
  };
  const required = ["type", "bank", "name", "ref", "status", "submittedAt", "verifiedBy", "verifiedAt"];
  config.ready = required.every((key) => Boolean(config[key]));
  return config;
}
__name(destinationFieldConfig, "destinationFieldConfig");
function normalizeThaiPhone(raw) {
  let digits2 = String(raw || "").replace(/[\s\-().]/g, "");
  if (digits2.startsWith("+66")) digits2 = `0${digits2.slice(3)}`;
  else if (digits2.startsWith("66") && digits2.length === 11) digits2 = `0${digits2.slice(2)}`;
  return /^0[0-9]{9}$/.test(digits2) ? digits2 : null;
}
__name(normalizeThaiPhone, "normalizeThaiPhone");
function isValidThaiNationalId(raw) {
  const digits2 = String(raw || "").replace(/[\s-]/g, "");
  if (!/^[0-9]{13}$/.test(digits2)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(digits2[i]) * (13 - i);
  return (11 - sum % 11) % 10 === Number(digits2[12]);
}
__name(isValidThaiNationalId, "isValidThaiNationalId");
function normalizeBankAccount(raw) {
  const digits2 = String(raw || "").replace(/[\s-]/g, "");
  return /^[0-9]{10,15}$/.test(digits2) ? digits2 : null;
}
__name(normalizeBankAccount, "normalizeBankAccount");
function maskReference(ref) {
  const value3 = String(ref || "");
  if (value3.length < 4) return value3 ? "\u2022\u2022\u2022\u2022" : "";
  return `\u2022\u2022\u2022\u2022${value3.slice(-4)}`;
}
__name(maskReference, "maskReference");
function validateDestination(input = {}) {
  const type = clean6(input.type, 40);
  if (!DESTINATION_TYPES.includes(type)) return { ok: false, error: "invalid_destination_type" };
  const accountName = clean6(input.account_name, 200).replace(/\s+/g, " ");
  if (accountName.length < 2 || accountName.length > 100 || /^[0-9\s]+$/.test(accountName)) {
    return { ok: false, error: "invalid_account_name" };
  }
  let ref = null;
  let bankName = "";
  if (type === "promptpay_phone") {
    ref = normalizeThaiPhone(input.account_ref);
    if (!ref) return { ok: false, error: "invalid_promptpay_phone" };
  } else if (type === "promptpay_national_id") {
    const digits2 = String(input.account_ref || "").replace(/[\s-]/g, "");
    if (!isValidThaiNationalId(digits2)) return { ok: false, error: "invalid_promptpay_national_id" };
    ref = digits2;
  } else {
    ref = normalizeBankAccount(input.account_ref);
    if (!ref) return { ok: false, error: "invalid_bank_account" };
    bankName = clean6(input.bank_name, 100).replace(/\s+/g, " ");
    if (bankName.length < 2 || bankName.length > 60) return { ok: false, error: "invalid_bank_name" };
  }
  return { ok: true, value: { type, accountName, ref, bankName } };
}
__name(validateDestination, "validateDestination");
function sameDestination(existing, next) {
  return existing.type === next.type && existing.ref === next.ref && existing.bankName.toLowerCase() === next.bankName.toLowerCase() && existing.accountName.toLowerCase() === next.accountName.toLowerCase();
}
__name(sameDestination, "sameDestination");
function airtableAuth(env = {}) {
  const baseId2 = clean6(env.AIRTABLE_BASE_ID, 100);
  const apiKey = clean6(env.AIRTABLE_API_KEY, 5e3);
  if (!baseId2 || !apiKey) {
    const error2 = new Error("airtable_not_ready");
    error2.status = 503;
    throw error2;
  }
  return { baseId: baseId2, apiKey };
}
__name(airtableAuth, "airtableAuth");
async function airtableRequest2(env, path, init = {}) {
  const { baseId: baseId2, apiKey } = airtableAuth(env);
  const response = await fetch(`${AIRTABLE_API8}/${baseId2}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...init.headers || {} }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error2 = new Error("airtable_request_failed");
    error2.status = response.status >= 500 ? 503 : 502;
    throw error2;
  }
  return data;
}
__name(airtableRequest2, "airtableRequest");
function resolveModelRecordId(session, config) {
  const link = session?.fields?.[config.sessionCanonicalModel];
  if (!Array.isArray(link) || link.length !== 1) return null;
  const id = typeof link[0] === "string" ? link[0] : link[0]?.id;
  return /^rec[A-Za-z0-9]{14}$/.test(String(id || "")) ? id : null;
}
__name(resolveModelRecordId, "resolveModelRecordId");
async function readModelDestination(env, config, modelRecordId) {
  const query = new URLSearchParams({ returnFieldsByFieldId: "true" });
  for (const id of [config.type, config.bank, config.name, config.ref, config.status]) query.append("fields[]", id);
  const record = await airtableRequest2(
    env,
    `${encodeURIComponent(config.modelsTable)}/${encodeURIComponent(modelRecordId)}?${query.toString()}`,
    { method: "GET" }
  );
  const fields2 = record?.fields || {};
  const status = clean6(fields2[config.status], 40).toLowerCase();
  return {
    type: clean6(fields2[config.type], 40),
    bankName: clean6(fields2[config.bank], 100),
    accountName: clean6(fields2[config.name], 200),
    ref: clean6(fields2[config.ref], 100),
    status: status || "none"
  };
}
__name(readModelDestination, "readModelDestination");
function publicView(destination) {
  if (!destination || !destination.ref) return { status: "none" };
  return {
    status: destination.status,
    type: destination.type,
    bank_name: destination.bankName || null,
    masked_ref: maskReference(destination.ref)
  };
}
__name(publicView, "publicView");
async function consumeRateLimit(env, sessionId) {
  const kv = env.PAY_SESSIONS_KV;
  if (!kv) return true;
  const key = `pdest:rl:${clean6(sessionId, 200)}`;
  const current = Number(await kv.get(key)) || 0;
  if (current >= RATE_LIMIT_MAX) return false;
  await kv.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_TTL_SECONDS });
  return true;
}
__name(consumeRateLimit, "consumeRateLimit");
function errorResponse(request2, env, error2) {
  const status = Number.isInteger(error2?.status) ? error2.status : 500;
  const code15 = status >= 500 || status === 502 ? clean6(error2?.message, 80) || "payout_destination_failed" : "payout_destination_failed";
  return withCors5(request2, env, json5({ ok: false, error: code15 }, status));
}
__name(errorResponse, "errorResponse");
async function authorizeModel(request2, env, authorize) {
  const authorized = await authorize(request2, env);
  if (authorized.response) return { response: authorized.response };
  if (authorized.expectedRole !== "model") {
    return { response: withCors5(request2, env, json5({ ok: false, error: "model_role_required" }, 403)) };
  }
  return authorized;
}
__name(authorizeModel, "authorizeModel");
function preconditions(request2, env, authorized, config) {
  if (!authorized.session?.fields?.[config.sessionModelAck]) {
    return withCors5(request2, env, json5({ ok: false, error: "model_ack_required" }, 409));
  }
  if (!config.ready) {
    return withCors5(request2, env, json5({ ok: false, error: "payout_destination_not_configured" }, 503));
  }
  return null;
}
__name(preconditions, "preconditions");
async function handlePayoutDestinationContext(request2, env = {}, deps = {}) {
  const method = request2.method.toUpperCase();
  if (method === "OPTIONS") return withCors5(request2, env, new Response(null, { status: 204 }));
  if (method !== "POST") return withCors5(request2, env, json5({ ok: false, error: "method_not_allowed" }, 405));
  if (!isDestinationEnabled(env)) return withCors5(request2, env, json5({ ok: true, enabled: false }));
  const authorize = deps.authorize || authorizeConfirmationRequest;
  try {
    const authorized = await authorizeModel(request2, env, authorize);
    if (authorized.response) return authorized.response;
    const config = destinationFieldConfig(env);
    const blocked = preconditions(request2, env, authorized, config);
    if (blocked) {
      const body = await blocked.clone().json().catch(() => ({}));
      if (body.error === "model_ack_required") return withCors5(request2, env, json5({ ok: true, enabled: true, can_submit: false, status: "none" }));
      return blocked;
    }
    const modelRecordId = resolveModelRecordId(authorized.session, config);
    if (!modelRecordId) return withCors5(request2, env, json5({ ok: false, error: "model_record_not_resolved" }, 409));
    const destination = await readModelDestination(env, config, modelRecordId);
    return withCors5(request2, env, json5({ ok: true, enabled: true, can_submit: true, destination: publicView(destination) }));
  } catch (error2) {
    return errorResponse(request2, env, error2);
  }
}
__name(handlePayoutDestinationContext, "handlePayoutDestinationContext");
async function handlePayoutDestinationSubmit(request2, env = {}, deps = {}) {
  const method = request2.method.toUpperCase();
  if (method === "OPTIONS") return withCors5(request2, env, new Response(null, { status: 204 }));
  if (method !== "POST") return withCors5(request2, env, json5({ ok: false, error: "method_not_allowed" }, 405));
  if (!isDestinationEnabled(env)) return withCors5(request2, env, json5({ ok: false, error: "not_enabled" }, 404));
  const authorize = deps.authorize || authorizeConfirmationRequest;
  try {
    const authorized = await authorizeModel(request2, env, authorize);
    if (authorized.response) return authorized.response;
    const config = destinationFieldConfig(env);
    const blocked = preconditions(request2, env, authorized, config);
    if (blocked) return blocked;
    const modelRecordId = resolveModelRecordId(authorized.session, config);
    if (!modelRecordId) return withCors5(request2, env, json5({ ok: false, error: "model_record_not_resolved" }, 409));
    if (!await consumeRateLimit(env, authorized.claims.session_id)) {
      return withCors5(request2, env, json5({ ok: false, error: "too_many_attempts" }, 429));
    }
    const checked = validateDestination(authorized.body?.destination || authorized.body || {});
    if (!checked.ok) return withCors5(request2, env, json5({ ok: false, error: checked.error }, 422));
    const next = checked.value;
    const existing = await readModelDestination(env, config, modelRecordId);
    if (existing.status === STATUS_VERIFIED && sameDestination(existing, next)) {
      return withCors5(request2, env, json5({ ok: true, unchanged: true, destination: publicView(existing) }));
    }
    await airtableRequest2(env, `${encodeURIComponent(config.modelsTable)}/${encodeURIComponent(modelRecordId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [config.type]: next.type,
          [config.bank]: next.bankName || null,
          [config.name]: next.accountName,
          [config.ref]: next.ref,
          [config.status]: STATUS_PENDING,
          [config.submittedAt]: (/* @__PURE__ */ new Date()).toISOString(),
          [config.verifiedBy]: null,
          [config.verifiedAt]: null
        }
      })
    });
    return withCors5(request2, env, json5({
      ok: true,
      unchanged: false,
      destination: publicView({ ...next, bankName: next.bankName, status: STATUS_PENDING })
    }));
  } catch (error2) {
    return errorResponse(request2, env, error2);
  }
}
__name(handlePayoutDestinationSubmit, "handlePayoutDestinationSubmit");

// customer-change-request.js
var AIRTABLE_API9 = "https://api.airtable.com/v0";
var CUSTOMER_CHANGE_REQUEST_PATH = "/v1/confirm/change-request";
var TYPES = /* @__PURE__ */ new Set([
  "time_change",
  "location_change",
  "date_change",
  "reschedule",
  "cancellation",
  "remark"
]);
var SESSION_FIELDS2 = Object.freeze({
  client: "fld6P6if0vDZCeV0C",
  sessionStatus: "fldmwuvOaiCFdzzRa",
  clientName: "fldMvnQ0BzDfHUYjT",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  googleMapUrl: "fldoUDQ8sH93idPx0",
  jobId: "fldHw5HdDDdkHXMhG"
});
var CHANGE_FIELDS = Object.freeze({
  requestId: "fldWMwebmHhyVQLzW",
  session: "fldbL2Ya44l6xEYe1",
  sessionId: "fldMD3Fhu0ibDmjk0",
  jobId: "flduFVxjPx6abaXQK",
  requestType: "fldxg0WIVCmxtdRCF",
  status: "fldcBkBS70bWBgI8A",
  currentValueJson: "fld9W8UEOXpsfJT5P",
  requestedValueJson: "fld8DqBrOmY6lQzGA",
  customerRemark: "fldjwQWRjxXqrFiAU",
  requestedBy: "fldVpKi8iu4AfAKfw",
  source: "fldFX2iXytQyVKRvf",
  requestedAt: "fldU2e6BO3fVdGyFF",
  idempotencyKey: "fldWiC7YFE0jYYBUN",
  notificationStatus: "fldY1Ix9xI3ccNJhX",
  notificationRef: "fldPLodDJTWfDlgET"
});
var INBOX_FIELDS = Object.freeze({
  inboxId: "fld0VtsSq9aZHSbbL",
  createdBy: "fldNIS9acBenkolcg",
  source: "fldft1PjSMU18coRz",
  intent: "fldQ4Zl1kZpLbN7fo",
  memberName: "fldCL1LmqhbZdBE8J",
  adminNote: "fld9NbPo1Q3E6MfB8",
  payloadJson: "fldn7MS0D9cdyQLtF",
  status: "fldCiOnawlgMkRPju",
  linkedSession: "fldtW0d8LPVgXkcBR",
  canonicalClient: "fld9gMhvFWegM345O"
});
async function handleCustomerChangeRequest(request2, env = {}) {
  if (request2.method.toUpperCase() === "OPTIONS") {
    return withCors6(request2, env, new Response(null, { status: 204 }));
  }
  if (request2.method.toUpperCase() !== "POST") {
    return withCors6(request2, env, json6({ ok: false, error: "method_not_allowed" }, 405));
  }
  const authorized = await authorizeConfirmationRequest(request2, env);
  if (authorized.response) return authorized.response;
  if (authorized.expectedRole !== "customer") {
    return withCors6(request2, env, json6({ ok: false, error: "customer_confirmation_required" }, 403));
  }
  try {
    const input = normalizeInput(authorized.body || {});
    validateInput(input);
    const session = authorized.session;
    const sessionFields2 = session?.fields || {};
    const currentValue = currentSnapshot(input.request_type, sessionFields2);
    const requestedValue = requestedSnapshot(input);
    const idempotencyKey = await sha256Hex4(JSON.stringify({
      session_id: authorized.claims.session_id,
      request_type: input.request_type,
      requested_value: requestedValue,
      remark: input.remark
    }));
    const requestId = `ccr_${idempotencyKey.slice(0, 20)}`;
    const existing = await findExisting(env, idempotencyKey);
    if (existing?.id) {
      return withCors6(request2, env, json6({
        ok: true,
        authority: "payments-worker",
        schema: "customer_change_request_v1",
        request_id: requestId,
        status: "pending_review",
        duplicate: true,
        mmd_notified: true,
        message: "MMD \u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E04\u0E33\u0E02\u0E2D\u0E19\u0E35\u0E49\u0E41\u0E25\u0E49\u0E27 \xB7 \u0E2D\u0E22\u0E39\u0E48\u0E23\u0E30\u0E2B\u0E27\u0E48\u0E32\u0E07\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A"
      }));
    }
    const requestedAt = (/* @__PURE__ */ new Date()).toISOString();
    const changeRecord = await createChangeRequest(env, {
      requestId,
      sessionRecordId: session.id,
      sessionId: authorized.claims.session_id,
      jobId: clean7(sessionFields2[SESSION_FIELDS2.jobId], 200),
      requestType: input.request_type,
      currentValue,
      requestedValue,
      remark: input.remark,
      requestedAt,
      idempotencyKey
    });
    const notificationPayload = {
      request_id: requestId,
      session_id: authorized.claims.session_id,
      job_id: clean7(sessionFields2[SESSION_FIELDS2.jobId], 200) || null,
      client_name: clean7(sessionFields2[SESSION_FIELDS2.clientName], 240) || null,
      request_type: input.request_type,
      current_value: currentValue,
      requested_value: requestedValue,
      customer_remark: input.remark || null,
      requested_at: requestedAt,
      status: "pending_review"
    };
    const inbox = await createConsoleInbox(env, {
      requestId,
      session,
      sessionFields: sessionFields2,
      payload: notificationPayload
    }).catch((error2) => ({ ok: false, error: clean7(error2?.message || error2, 240) }));
    const telegram = await notifyTelegram(env, notificationPayload).catch((error2) => ({ ok: false, error: clean7(error2?.message || error2, 240) }));
    const mmdNotified = inbox?.ok === true || telegram?.ok === true;
    const notificationRef = [
      inbox?.record_id ? `console:${inbox.record_id}` : "",
      telegram?.message_id ? `telegram:${telegram.message_id}` : ""
    ].filter(Boolean).join(";");
    await patchNotification(env, changeRecord.id, {
      status: mmdNotified ? "sent" : "failed",
      ref: notificationRef
    }).catch(() => null);
    return withCors6(request2, env, json6({
      ok: true,
      authority: "payments-worker",
      schema: "customer_change_request_v1",
      request_id: requestId,
      status: "pending_review",
      duplicate: false,
      mmd_notified: mmdNotified,
      notification: {
        console_inbox: inbox?.ok === true,
        telegram: telegram?.ok === true
      },
      message: "MMD \u0E44\u0E14\u0E49\u0E23\u0E31\u0E1A\u0E04\u0E33\u0E02\u0E2D\u0E41\u0E25\u0E49\u0E27 \xB7 \u0E23\u0E2D\u0E15\u0E23\u0E27\u0E08\u0E2A\u0E2D\u0E1A"
    }));
  } catch (error2) {
    return withCors6(request2, env, json6({
      ok: false,
      authority: "payments-worker",
      error: clean7(error2?.message || "customer_change_request_failed", 200)
    }, Number(error2?.status || 400)));
  }
}
__name(handleCustomerChangeRequest, "handleCustomerChangeRequest");
function normalizeInput(body) {
  return {
    request_type: code4(body?.request_type),
    requested_start_time: clean7(body?.requested_start_time, 120),
    requested_end_time: clean7(body?.requested_end_time, 120),
    requested_date: clean7(body?.requested_date, 40),
    requested_location_name: clean7(body?.requested_location_name, 360),
    requested_google_map_url: safeHttps(body?.requested_google_map_url),
    remark: clean7(body?.remark || body?.reason, 2e3)
  };
}
__name(normalizeInput, "normalizeInput");
function validateInput(input) {
  if (!TYPES.has(input.request_type)) throw httpError(400, "invalid_request_type");
  if (input.requested_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.requested_date)) {
    throw httpError(400, "invalid_requested_date");
  }
  if (input.requested_start_time && !validTimeValue(input.requested_start_time)) {
    throw httpError(400, "invalid_requested_start_time");
  }
  if (input.requested_end_time && !validTimeValue(input.requested_end_time)) {
    throw httpError(400, "invalid_requested_end_time");
  }
  if (input.request_type === "time_change" && !input.requested_start_time && !input.requested_end_time) {
    throw httpError(400, "requested_time_required");
  }
  if (input.request_type === "location_change" && !input.requested_location_name && !input.requested_google_map_url) {
    throw httpError(400, "requested_location_required");
  }
  if (input.request_type === "date_change" && !input.requested_date) {
    throw httpError(400, "requested_date_required");
  }
  if (input.request_type === "reschedule" && !input.requested_date && !input.requested_start_time && input.remark.length < 2) {
    throw httpError(400, "reschedule_detail_required");
  }
  if (input.request_type === "cancellation" && input.remark.length < 3) {
    throw httpError(400, "cancellation_reason_required");
  }
  if (input.request_type === "remark" && input.remark.length < 2) {
    throw httpError(400, "remark_required");
  }
}
__name(validateInput, "validateInput");
function currentSnapshot(type, fields2) {
  const all = {
    job_date: clean7(fields2[SESSION_FIELDS2.jobDate], 120) || null,
    start_time: clean7(fields2[SESSION_FIELDS2.startTime], 120) || null,
    end_time: clean7(fields2[SESSION_FIELDS2.endTime], 120) || null,
    location_name: clean7(fields2[SESSION_FIELDS2.locationName], 360) || null,
    google_map_url: safeHttps(fields2[SESSION_FIELDS2.googleMapUrl]) || null,
    session_status: clean7(fields2[SESSION_FIELDS2.sessionStatus], 120) || null
  };
  if (type === "time_change") return { start_time: all.start_time, end_time: all.end_time };
  if (type === "location_change") return { location_name: all.location_name, google_map_url: all.google_map_url };
  if (type === "date_change") return { job_date: all.job_date };
  if (type === "remark") return {};
  return all;
}
__name(currentSnapshot, "currentSnapshot");
function requestedSnapshot(input) {
  const out = {};
  if (input.requested_date) out.job_date = input.requested_date;
  if (input.requested_start_time) out.start_time = input.requested_start_time;
  if (input.requested_end_time) out.end_time = input.requested_end_time;
  if (input.requested_location_name) out.location_name = input.requested_location_name;
  if (input.requested_google_map_url) out.google_map_url = input.requested_google_map_url;
  return out;
}
__name(requestedSnapshot, "requestedSnapshot");
async function createChangeRequest(env, input) {
  const fields2 = {};
  fields2[CHANGE_FIELDS.requestId] = input.requestId;
  fields2[CHANGE_FIELDS.session] = [input.sessionRecordId];
  fields2[CHANGE_FIELDS.sessionId] = input.sessionId;
  if (input.jobId) fields2[CHANGE_FIELDS.jobId] = input.jobId;
  fields2[CHANGE_FIELDS.requestType] = input.requestType;
  fields2[CHANGE_FIELDS.status] = "pending_review";
  fields2[CHANGE_FIELDS.currentValueJson] = JSON.stringify(input.currentValue);
  fields2[CHANGE_FIELDS.requestedValueJson] = JSON.stringify(input.requestedValue);
  if (input.remark) fields2[CHANGE_FIELDS.customerRemark] = input.remark;
  fields2[CHANGE_FIELDS.requestedBy] = "customer";
  fields2[CHANGE_FIELDS.source] = "customer_confirmation";
  fields2[CHANGE_FIELDS.requestedAt] = input.requestedAt;
  fields2[CHANGE_FIELDS.idempotencyKey] = input.idempotencyKey;
  fields2[CHANGE_FIELDS.notificationStatus] = "pending";
  const data = await airtableRequest3(env, `${encodeURIComponent(changeTable(env))}?typecast=true`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: fields2 }] })
  });
  const record = data?.records?.[0];
  if (!record?.id) throw httpError(503, "change_request_write_failed");
  return record;
}
__name(createChangeRequest, "createChangeRequest");
async function findExisting(env, idempotencyKey) {
  const formula5 = `{idempotency_key}='${formulaValue(idempotencyKey)}'`;
  const query = new URLSearchParams({ maxRecords: "1", filterByFormula: formula5 });
  const data = await airtableRequest3(env, `${encodeURIComponent(changeTable(env))}?${query.toString()}`, { method: "GET" });
  return data?.records?.[0] || null;
}
__name(findExisting, "findExisting");
async function createConsoleInbox(env, { requestId, session, sessionFields: sessionFields2, payload }) {
  const fields2 = {};
  fields2[INBOX_FIELDS.inboxId] = `customer_change_${requestId}`;
  fields2[INBOX_FIELDS.createdBy] = "customer_confirmation";
  fields2[INBOX_FIELDS.source] = "web";
  fields2[INBOX_FIELDS.intent] = "note_only";
  const clientName = clean7(sessionFields2[SESSION_FIELDS2.clientName], 240);
  if (clientName) fields2[INBOX_FIELDS.memberName] = clientName;
  fields2[INBOX_FIELDS.adminNote] = adminNote(payload);
  fields2[INBOX_FIELDS.payloadJson] = JSON.stringify(payload);
  fields2[INBOX_FIELDS.status] = "new";
  fields2[INBOX_FIELDS.linkedSession] = [session.id];
  const linkedClient = Array.isArray(sessionFields2[SESSION_FIELDS2.client]) ? sessionFields2[SESSION_FIELDS2.client].filter((value3) => /^rec[A-Za-z0-9]{14}$/.test(String(value3 || ""))).slice(0, 1) : [];
  if (linkedClient.length) fields2[INBOX_FIELDS.canonicalClient] = linkedClient;
  const data = await airtableRequest3(env, `${encodeURIComponent(inboxTable(env))}?typecast=true`, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: fields2 }] })
  });
  return { ok: Boolean(data?.records?.[0]?.id), record_id: data?.records?.[0]?.id || null };
}
__name(createConsoleInbox, "createConsoleInbox");
function adminNote(payload) {
  const labels = {
    time_change: "\u0E02\u0E2D\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E40\u0E27\u0E25\u0E32",
    location_change: "\u0E02\u0E2D\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E2A\u0E16\u0E32\u0E19\u0E17\u0E35\u0E48",
    date_change: "\u0E02\u0E2D\u0E40\u0E1B\u0E25\u0E35\u0E48\u0E22\u0E19\u0E27\u0E31\u0E19",
    reschedule: "\u0E02\u0E2D\u0E40\u0E25\u0E37\u0E48\u0E2D\u0E19\u0E07\u0E32\u0E19",
    cancellation: "\u0E02\u0E2D\u0E22\u0E01\u0E40\u0E25\u0E34\u0E01\u0E07\u0E32\u0E19",
    remark: "\u0E41\u0E08\u0E49\u0E07\u0E40\u0E1E\u0E34\u0E48\u0E21\u0E40\u0E15\u0E34\u0E21"
  };
  return [
    `Customer Change Request \xB7 ${labels[payload.request_type] || payload.request_type}`,
    `Session: ${payload.session_id}`,
    payload.job_id ? `Job: ${payload.job_id}` : "",
    payload.client_name ? `Client: ${payload.client_name}` : "",
    `Current: ${JSON.stringify(payload.current_value)}`,
    `Requested: ${JSON.stringify(payload.requested_value)}`,
    payload.customer_remark ? `Remark: ${payload.customer_remark}` : "",
    "Status: pending_review \xB7 canonical Session unchanged"
  ].filter(Boolean).join("\n");
}
__name(adminNote, "adminNote");
async function notifyTelegram(env, payload) {
  const service = env.TELEGRAM_WORKER;
  const token4 = clean7(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM, 5e3);
  if (!service || typeof service.fetch !== "function") return { ok: false, skipped: true, reason: "telegram_router_binding_missing" };
  if (!token4) return { ok: false, skipped: true, reason: "telegram_router_auth_missing" };
  const labels = {
    time_change: "TIME CHANGE",
    location_change: "LOCATION CHANGE",
    date_change: "DATE CHANGE",
    reschedule: "RESCHEDULE",
    cancellation: "CANCELLATION REQUEST",
    remark: "CUSTOMER REMARK"
  };
  const message = [
    "<b>\u{1F4DD} CUSTOMER CHANGE REQUEST</b>",
    `Type: <b>${escapeHtml(labels[payload.request_type] || payload.request_type)}</b>`,
    `Session: <code>${escapeHtml(payload.session_id)}</code>`,
    payload.job_id ? `Job: <code>${escapeHtml(payload.job_id)}</code>` : "",
    payload.client_name ? `Client: <b>${escapeHtml(payload.client_name)}</b>` : "",
    `Current: <code>${escapeHtml(JSON.stringify(payload.current_value))}</code>`,
    `Requested: <code>${escapeHtml(JSON.stringify(payload.requested_value))}</code>`,
    payload.customer_remark ? `Remark: ${escapeHtml(payload.customer_remark)}` : "",
    "<b>Status: pending review \xB7 Session truth unchanged</b>"
  ].filter(Boolean).join("\n");
  const response = await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token4}`
    },
    body: JSON.stringify({
      flow: "confirm",
      chat_id: clean7(env.TELEGRAM_CHAT_ID || "-1003546439681", 120),
      message_thread_id: Number(env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || 22) || 22,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      text: message
    })
  }));
  const data = await response.json().catch(() => ({}));
  const telegram = data?.telegram || {};
  return {
    ok: response.ok && data?.ok === true && telegram?.ok === true,
    status: response.status,
    message_id: telegram?.result?.message_id || telegram?.message_id || null
  };
}
__name(notifyTelegram, "notifyTelegram");
async function patchNotification(env, recordId3, { status, ref }) {
  const fields2 = { [CHANGE_FIELDS.notificationStatus]: status };
  if (ref) fields2[CHANGE_FIELDS.notificationRef] = ref;
  return airtableRequest3(env, `${encodeURIComponent(changeTable(env))}/${encodeURIComponent(recordId3)}?typecast=true`, {
    method: "PATCH",
    body: JSON.stringify({ fields: fields2 })
  });
}
__name(patchNotification, "patchNotification");
async function airtableRequest3(env, path, init = {}) {
  const baseId2 = clean7(env.AIRTABLE_BASE_ID, 100);
  const apiKey = clean7(env.AIRTABLE_API_KEY, 5e3);
  if (!baseId2 || !apiKey) throw httpError(503, "airtable_not_ready");
  const request2 = new Request(`${AIRTABLE_API9}/${encodeURIComponent(baseId2)}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...init.headers || {}
    }
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : 500, "airtable_change_request_failed");
  return data;
}
__name(airtableRequest3, "airtableRequest");
function changeTable(env) {
  return clean7(env.AIRTABLE_TABLE_CUSTOMER_CHANGE_REQUESTS || "tblhQGfJc4GgiteZr", 120);
}
__name(changeTable, "changeTable");
function inboxTable(env) {
  return clean7(env.AIRTABLE_TABLE_CONSOLE_INBOX || "tblFHmfpB2TTrzO2e", 120);
}
__name(inboxTable, "inboxTable");
function validTimeValue(value3) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value3) || /^\d{4}-\d{2}-\d{2}T/.test(value3);
}
__name(validTimeValue, "validTimeValue");
function safeHttps(value3) {
  const raw = clean7(value3, 1200);
  return /^https:\/\//i.test(raw) ? raw : "";
}
__name(safeHttps, "safeHttps");
function code4(value3) {
  return clean7(value3, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(code4, "code");
async function sha256Hex4(value3) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value3 || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex4, "sha256Hex");
function escapeHtml(value3) {
  return clean7(value3, 3e3).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(escapeHtml, "escapeHtml");
function allowedOrigins3(env = {}) {
  return clean7(env.ALLOWED_ORIGINS || "", 5e3).replace(/^[\"']|[\"']$/g, "").split(",").map((value3) => value3.trim().replace(/^[\"']|[\"']$/g, "")).filter(Boolean);
}
__name(allowedOrigins3, "allowedOrigins");
function withCors6(request2, env, response) {
  const origin = clean7(request2.headers.get("origin"), 500);
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-methods", "POST,OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  headers.set("cache-control", "no-store, private");
  if (origin && allowedOrigins3(env).includes(origin)) headers.set("access-control-allow-origin", origin);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
__name(withCors6, "withCors");
function clean7(value3, max = 5e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}
__name(clean7, "clean");
function json6(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
__name(json6, "json");

// partner-job-confirm.js
var AIRTABLE_API10 = "https://api.airtable.com/v0";
var SESSION = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  workLane: "fldzYGziqLqTQaoaK",
  workType: "fldZiv3GeiafJTuRv",
  partnerIdSnapshot: "fld0jkscGAtyX7i2J",
  partnerSnapshotJson: "fldxyZ7S3tjF8chGR",
  referralSnapshotJson: "fldfqNBNKkmQdr6Fp",
  partnerConfirmationStatus: "fldrAQxUX4pRqz6qr",
  partnerConfirmationRevision: "fldhO72ZSYcyjbLzi",
  partnerNotificationStatus: "fldv1X9HIfgUjwpJw",
  partnerNotificationMessageId: "fldyG4XzAlMQz4gfG",
  partnerNotificationSentAt: "fldG2sWou0Zh18PHS",
  partnerNotificationError: "fldGLKYcQVPZelwue"
});
var PARTNER = Object.freeze({
  partnerId: "fldXb55aiAjNPOUWc",
  partnerName: "fldpJWfASq7PfkMgC",
  status: "fldajmg66pf2ifGPu",
  approvalStatus: "fldwRzdtIoPbHKr7n",
  telegramId: "fldi6XKGQAWUEdr3A",
  telegramUsername: "fldCqQx4XD7sf28SE",
  telegramVerificationStatus: "fldOPxUvKgAVW5a2M"
});
async function notifyPartnerJobAfterOfficialVerify(env, input = {}) {
  const stage2 = code5(input.stage || input.payment_stage || input.payment_type);
  const sessionId = text6(input.session_id, 180);
  if (!sessionId || !["deposit", "full"].includes(stage2)) {
    return { ok: true, skipped: true, reason: "partner_confirm_not_required_for_stage" };
  }
  const session = await findSession4(env, sessionId);
  if (!session) return { ok: true, skipped: true, reason: "session_not_found" };
  const sf = session.fields || {};
  const partnerId = field2(sf, SESSION.partnerIdSnapshot);
  if (!partnerId) return { ok: true, skipped: true, reason: "partner_snapshot_missing" };
  const agreementSystem = code5(parseObject(field2(sf, SESSION.referralSnapshotJson)).system);
  if (!["co_partner", "profit_share"].includes(agreementSystem)) {
    return { ok: true, skipped: true, reason: "partner_confirmation_not_required_for_system", system: agreementSystem };
  }
  const existingDelivery = code5(field2(sf, SESSION.partnerNotificationStatus));
  const existingMessageId = field2(sf, SESSION.partnerNotificationMessageId);
  if (existingDelivery === "sent" && existingMessageId) {
    return {
      ok: true,
      skipped: true,
      idempotent: true,
      reason: "partner_notification_already_sent",
      message_id: existingMessageId
    };
  }
  const snapshot2 = parseObject(field2(sf, SESSION.partnerSnapshotJson));
  const partnerRecordId = text6(snapshot2.partner_record_id, 40);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(partnerRecordId)) {
    await patchSession2(env, session.id, {
      [SESSION.partnerNotificationStatus]: "failed",
      [SESSION.partnerNotificationError]: "partner_record_snapshot_invalid"
    }).catch(() => null);
    await alertMmd(env, `Partner confirm blocked \xB7 ${safeRef(sessionId)} \xB7 partner snapshot invalid`).catch(() => null);
    return { ok: false, skipped: true, reason: "partner_record_snapshot_invalid" };
  }
  const partner = await getRecord(env, table3(env, "AIRTABLE_TABLE_MODEL_PARTNERS", "tbl1ksDlsTiiGEHWe"), partnerRecordId);
  if (!partner) {
    await patchSession2(env, session.id, {
      [SESSION.partnerNotificationStatus]: "failed",
      [SESSION.partnerNotificationError]: "partner_record_missing"
    }).catch(() => null);
    return { ok: false, skipped: true, reason: "partner_record_missing" };
  }
  const pf = partner.fields || {};
  if (field2(pf, PARTNER.partnerId) !== partnerId) {
    await patchSession2(env, session.id, {
      [SESSION.partnerNotificationStatus]: "failed",
      [SESSION.partnerNotificationError]: "partner_snapshot_mismatch"
    }).catch(() => null);
    return { ok: false, skipped: true, reason: "partner_snapshot_mismatch" };
  }
  const active = code5(field2(pf, PARTNER.status)) === "active";
  const recognized = code5(field2(pf, PARTNER.approvalStatus)) === "recognized";
  const telegramVerified = code5(field2(pf, PARTNER.telegramVerificationStatus)) === "verified";
  const telegramId = field2(pf, PARTNER.telegramId);
  if (!active || !recognized) {
    await patchSession2(env, session.id, {
      [SESSION.partnerNotificationStatus]: "failed",
      [SESSION.partnerNotificationError]: "partner_not_active"
    }).catch(() => null);
    return { ok: false, skipped: true, reason: "partner_not_active" };
  }
  if (!telegramVerified || !/^\d{5,20}$/.test(telegramId)) {
    await patchSession2(env, session.id, {
      [SESSION.partnerNotificationStatus]: "unbound",
      [SESSION.partnerNotificationError]: "partner_telegram_unbound"
    }).catch(() => null);
    await alertMmd(
      env,
      `Partner Telegram unbound \xB7 ${field2(pf, PARTNER.partnerName) || partnerId} \xB7 ${safeRef(sessionId)} \xB7 payment verified, manual follow-up required`
    ).catch(() => null);
    return { ok: true, skipped: true, reason: "partner_telegram_unbound" };
  }
  const currentRevision = Number(field2(sf, SESSION.partnerConfirmationRevision) || 0) || 0;
  const revision = Math.max(1, currentRevision + 1);
  const client = customerSafeName(field2(sf, SESSION.clientName));
  const model = text6(field2(sf, SESSION.modelName), 120) || "Model";
  const jobDate = text6(field2(sf, SESSION.jobDate), 40);
  const start = bangkokTime(field2(sf, SESSION.startTime));
  const end = bangkokTime(field2(sf, SESSION.endTime));
  const location = text6(field2(sf, SESSION.locationName), 160);
  const lane = text6(field2(sf, SESSION.workLane), 80);
  const workType = text6(field2(sf, SESSION.workType), 80);
  const partnerName = text6(field2(pf, PARTNER.partnerName), 120) || "Partner";
  await patchSession2(env, session.id, {
    [SESSION.partnerConfirmationStatus]: "pending",
    [SESSION.partnerConfirmationRevision]: revision,
    [SESSION.partnerNotificationStatus]: "pending",
    [SESSION.partnerNotificationError]: ""
  });
  const message = [
    "<b>MMD \xB7 NEW JOB TO CONFIRM</b>",
    "",
    `<b>Customer:</b> ${escapeHtml2(client || "MMD Client")}`,
    `<b>Model:</b> ${escapeHtml2(model)}`,
    jobDate ? `<b>Date:</b> ${escapeHtml2(jobDate)}` : "",
    start || end ? `<b>Time:</b> ${escapeHtml2([start, end].filter(Boolean).join("\u2013"))}` : "",
    location ? `<b>Location:</b> ${escapeHtml2(location)}` : "",
    lane || workType ? `<b>Work:</b> ${escapeHtml2([lane, workType].filter(Boolean).join(" \xB7 "))}` : "",
    "<b>Payment:</b> MMD verified",
    `<b>Ref:</b> <code>${escapeHtml2(safeRef(sessionId))}</code>`,
    "",
    `${escapeHtml2(partnerName)} \u0E01\u0E23\u0E38\u0E13\u0E32\u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E07\u0E32\u0E19\u0E08\u0E32\u0E01\u0E1B\u0E38\u0E48\u0E21\u0E14\u0E49\u0E32\u0E19\u0E25\u0E48\u0E32\u0E07\u0E04\u0E23\u0E31\u0E1A`
  ].filter(Boolean).join("\n");
  const replyMarkup = {
    inline_keyboard: [
      [{ text: "\u2705 \u0E22\u0E37\u0E19\u0E22\u0E31\u0E19\u0E07\u0E32\u0E19", callback_data: `pjc|${session.id}|c` }],
      [{ text: "\u270F\uFE0F \u0E02\u0E2D\u0E41\u0E01\u0E49\u0E44\u0E02\u0E23\u0E32\u0E22\u0E25\u0E30\u0E40\u0E2D\u0E35\u0E22\u0E14", callback_data: `pjc|${session.id}|x` }],
      [{ text: "\u274C \u0E23\u0E31\u0E1A\u0E07\u0E32\u0E19\u0E44\u0E21\u0E48\u0E44\u0E14\u0E49", callback_data: `pjc|${session.id}|d` }]
    ]
  };
  try {
    const telegram = await sendDirectTelegram(env, {
      chat_id: telegramId,
      text: message,
      reply_markup: replyMarkup
    });
    const messageId = String(telegram?.telegram?.result?.message_id || telegram?.result?.message_id || "");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    await patchSession2(env, session.id, {
      [SESSION.partnerNotificationStatus]: "sent",
      [SESSION.partnerNotificationMessageId]: messageId,
      [SESSION.partnerNotificationSentAt]: now,
      [SESSION.partnerNotificationError]: ""
    });
    return {
      ok: true,
      sent: true,
      partner_id: partnerId,
      partner_username: field2(pf, PARTNER.telegramUsername) || null,
      message_id: messageId || null,
      revision
    };
  } catch (error2) {
    const reason = text6(error2?.message || error2 || "partner_telegram_send_failed", 240);
    await patchSession2(env, session.id, {
      [SESSION.partnerNotificationStatus]: "failed",
      [SESSION.partnerNotificationError]: reason
    }).catch(() => null);
    await alertMmd(env, `Partner confirm send failed \xB7 ${partnerName} \xB7 ${safeRef(sessionId)}`).catch(() => null);
    return { ok: false, sent: false, reason: "partner_telegram_send_failed" };
  }
}
__name(notifyPartnerJobAfterOfficialVerify, "notifyPartnerJobAfterOfficialVerify");
async function sendDirectTelegram(env, payload) {
  const service = env.TELEGRAM_WORKER;
  const token4 = clean8(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM);
  if (!service?.fetch || !token4) throw new Error("partner_telegram_transport_unavailable");
  const response = await service.fetch(new Request("https://telegram-worker/telegram/internal/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token4}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      flow: "payment_verified",
      chat_id: payload.chat_id,
      text: payload.text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: payload.reply_markup
    })
  }));
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true || body?.telegram?.ok === false) {
    throw new Error("partner_telegram_transport_failed");
  }
  return body;
}
__name(sendDirectTelegram, "sendDirectTelegram");
async function alertMmd(env, textValue) {
  const service = env.TELEGRAM_WORKER;
  const token4 = clean8(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM);
  if (!service?.fetch || !token4) return { ok: false, skipped: true };
  const response = await service.fetch(new Request("https://telegram-worker/telegram/internal/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token4}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ flow: "alerts", text: text6(textValue, 700) })
  }));
  return { ok: response.ok };
}
__name(alertMmd, "alertMmd");
async function findSession4(env, sessionId) {
  const records = await listRecords(
    env,
    table3(env, "AIRTABLE_TABLE_SESSIONS", "tblC98mKWbzmPuNzX"),
    `{session_id}='${formula(sessionId)}'`,
    2
  );
  if (records.length !== 1) return null;
  return records[0];
}
__name(findSession4, "findSession");
async function getRecord(env, tableId, recordId3) {
  requireAirtable2(env);
  const url = new URL(
    `${AIRTABLE_API10}/${encodeURIComponent(clean8(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId3)}`
  );
  url.searchParams.set("returnFieldsByFieldId", "true");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${clean8(env.AIRTABLE_API_KEY)}` } });
  if (!response.ok) return null;
  return response.json();
}
__name(getRecord, "getRecord");
async function listRecords(env, tableId, filterByFormula, maxRecords = 2) {
  requireAirtable2(env);
  const url = new URL(`${AIRTABLE_API10}/${encodeURIComponent(clean8(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableId)}`);
  url.searchParams.set("maxRecords", String(maxRecords));
  url.searchParams.set("filterByFormula", filterByFormula);
  url.searchParams.set("returnFieldsByFieldId", "true");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${clean8(env.AIRTABLE_API_KEY)}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return Array.isArray(body.records) ? body.records : [];
}
__name(listRecords, "listRecords");
async function patchSession2(env, recordId3, fields2) {
  requireAirtable2(env);
  const tableId = table3(env, "AIRTABLE_TABLE_SESSIONS", "tblC98mKWbzmPuNzX");
  const response = await fetch(
    `${AIRTABLE_API10}/${encodeURIComponent(clean8(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableId)}/${encodeURIComponent(recordId3)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${clean8(env.AIRTABLE_API_KEY)}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ fields: fields2, typecast: true })
    }
  );
  if (!response.ok) throw new Error(`airtable_patch_${response.status}`);
  return response.json();
}
__name(patchSession2, "patchSession");
function field2(fields2, key) {
  const value3 = fields2?.[key];
  if (Array.isArray(value3)) return value3.length ? String(value3[0]?.name || value3[0] || "").trim() : "";
  if (value3 && typeof value3 === "object" && "name" in value3) return String(value3.name || "").trim();
  return String(value3 ?? "").trim();
}
__name(field2, "field");
function parseObject(value3) {
  try {
    const parsed = JSON.parse(String(value3 || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
__name(parseObject, "parseObject");
function customerSafeName(value3) {
  const raw = text6(value3, 120);
  return raw.replace(/\s*-\s*(?:SVIP|VIP|BLACK\s*CARD|PREMIUM|STANDARD|ELITE|RED\s*CARD)\s*-?\s*$/i, "").trim();
}
__name(customerSafeName, "customerSafeName");
function bangkokTime(value3) {
  const raw = clean8(value3);
  if (!raw) return "";
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return raw.slice(0, 5);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}
__name(bangkokTime, "bangkokTime");
function safeRef(value3) {
  const raw = text6(value3, 180);
  return raw.length <= 18 ? raw : `${raw.slice(0, 10)}\u2026${raw.slice(-5)}`;
}
__name(safeRef, "safeRef");
function table3(env, key, fallback) {
  return clean8(env?.[key]) || fallback;
}
__name(table3, "table");
function requireAirtable2(env) {
  if (!clean8(env.AIRTABLE_API_KEY) || !clean8(env.AIRTABLE_BASE_ID)) {
    throw new Error("airtable_not_ready");
  }
}
__name(requireAirtable2, "requireAirtable");
function formula(value3) {
  return String(value3 || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
__name(formula, "formula");
function code5(value3) {
  return clean8(value3).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(code5, "code");
function text6(value3, max = 240) {
  return clean8(value3).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}
__name(text6, "text");
function clean8(value3) {
  return String(value3 ?? "").trim();
}
__name(clean8, "clean");
function escapeHtml2(value3) {
  return String(value3 ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
__name(escapeHtml2, "escapeHtml");

// index.phase1.js
var NOTIFY_PATH = "/v1/payments/notify";
var HISTORICAL_REVIEW_PATH = "/v1/internal/payments/historical-slip/reviewed";
var HISTORICAL_SCHEMA = "mmd_historical_slip_backfill_v1";
var PAYMENT_STAGES = /* @__PURE__ */ new Set(["deposit", "final", "tips", "full", "extension", "membership"]);
var AIRTABLE_API11 = "https://api.airtable.com/v0";
var CANCELLATION_CREDIT_RECOVERY = Object.freeze({
  paymentsTable: "tblWGGJJOx5eBvBZJ",
  sessionsTable: "tblC98mKWbzmPuNzX",
  paymentRef: "fldOO6SY49iDw8VBZ",
  paymentClient: "fldcrLuJijj7xr0y8",
  paymentAmountReceived: "fld5rTIVEF1DXwfe2",
  paymentVerification: "fldJ7a0Ube9F0bmRy",
  paymentSessionId: "fld2wdhBvc8xrV6y5",
  paymentDepositStatus: "fldD0mQWTfdmyBAeT",
  paymentOfficialAt: "fldPNK6qgxCSdaJRM",
  paymentOfficialRef: "flddkMKy5H8RbFwt9",
  paymentOfficialBy: "fld208LCmQZB5llNo",
  sessionId: "fldLTq2kZbyRv22IA",
  sessionClient: "fld6P6if0vDZCeV0C",
  sessionStatus: "fldmwuvOaiCFdzzRa"
});
var CANCELLED_SESSION_STATES = /* @__PURE__ */ new Set([
  "cancelled",
  "canceled",
  "cancelled_by_client",
  "canceled_by_client",
  "client_cancelled",
  "client_canceled"
]);
var index_phase1_default = {
  async fetch(request2, env, ctx) {
    const url = new URL(request2.url);
    const path = normalizePath2(url.pathname);
    const method = request2.method.toUpperCase();
    if (path === CONFIRM_DETAILS_PATH && (method === "POST" || method === "OPTIONS")) {
      return handleConfirmationDetails(request2, env);
    }
    if (path === CONFIRM_APPLY_PROMO_PATH && (method === "POST" || method === "OPTIONS")) {
      return handleConfirmApplyPromo(request2, env);
    }
    if (path === CONFIRM_ACK_PATH && (method === "POST" || method === "OPTIONS")) {
      return handleConfirmationAck(request2, env);
    }
    if (path === CONFIRM_CONTEXT_PATH && (method === "POST" || method === "OPTIONS")) {
      return handleConfirmationContext(request2, env);
    }
    if (path === PAYOUT_DEST_CONTEXT_PATH && (method === "POST" || method === "OPTIONS")) {
      return handlePayoutDestinationContext(request2, env);
    }
    if (path === PAYOUT_DEST_SUBMIT_PATH && (method === "POST" || method === "OPTIONS")) {
      return handlePayoutDestinationSubmit(request2, env);
    }
    if (path === CUSTOMER_CHANGE_REQUEST_PATH && (method === "POST" || method === "OPTIONS")) {
      return handleCustomerChangeRequest(request2, env);
    }
    if (path === HISTORICAL_REVIEW_PATH) {
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: jsonHeaders() });
      if (method !== "POST") return json7({ ok: false, error: "method_not_allowed" }, 405);
      return handleHistoricalReviewedSlip(request2, env, ctx);
    }
    if (method !== "POST" || path !== NOTIFY_PATH) {
      return index_with_slip_evidence_default.fetch(request2, env, ctx);
    }
    const body = await request2.clone().json().catch(() => ({}));
    return runTrustedNotify(request2, env, ctx, body, { injectInternalToken: false });
  }
};
async function handleHistoricalReviewedSlip(request2, env, ctx) {
  if (!await serviceAuthed(request2, env.AUTH_SERVICE_ADMIN_TO_PAYMENTS)) {
    return json7({ ok: false, error: "service_auth_required", authority: "payments-worker" }, 401);
  }
  const body = await request2.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json7({ ok: false, error: "invalid_historical_review_request", authority: "payments-worker" }, 400);
  }
  try {
    const source = code6(body.source);
    const decision = code6(body.decision);
    const proofId = text7(body.proof_id, 120);
    const evidenceSha256 = text7(body.evidence_sha256, 64).toLowerCase();
    const paymentRef = text7(body.payment_ref || body.transaction_ref, 180);
    const amountThb = positiveAmount(body.amount_thb ?? body.amount);
    const paymentStage = normalizeStage2(body.payment_stage || body.stage || body.payment_type);
    const sessionId = text7(body.session_id, 180);
    const memberEmail = email(body.member_email || body.email);
    const packageCode = text7(body.package_code || body.package, 120);
    const paidAt = text7(body.paid_at, 80);
    const reviewReason = text7(body.review_reason, 600);
    const overrideReason = text7(body.override_reason, 600);
    const reviewActor = text7(body.review_actor || "internal_admin_owner", 120);
    const cancellationCreditRecovery = body.cancellation_credit_recovery === true;
    const recoveryClientRecordId = recordId(body.recovery_client_record_id || body.client_record_id);
    if (source !== "historical_slip_backfill") throw httpError(400, "invalid_historical_review_source");
    if (decision !== "approved") throw httpError(400, "explicit_approved_decision_required");
    if (!proofId) throw httpError(400, "proof_id_required");
    if (!/^[a-f0-9]{64}$/.test(evidenceSha256)) throw httpError(400, "evidence_sha256_required");
    if (!paymentRef) throw httpError(400, "payment_ref_required");
    if (amountThb == null) throw httpError(400, "amount_thb_required");
    if (reviewReason.length < 5) throw httpError(400, "review_reason_required");
    if (["deposit", "final", "tips", "full", "extension"].includes(paymentStage) && !sessionId) throw httpError(400, "session_id_required_for_service_payment");
    if (paymentStage === "membership" && !memberEmail) throw httpError(400, "member_email_required_for_membership_payment");
    if (cancellationCreditRecovery && paymentStage !== "deposit") throw httpError(409, "cancellation_credit_recovery_requires_deposit");
    if (cancellationCreditRecovery && !recoveryClientRecordId) throw httpError(400, "recovery_client_record_id_required");
    const proof = await loadHistoricalProof(env, proofId);
    if (!proof) throw httpError(404, "historical_proof_not_found");
    const proofNote = parseNote(proof.fields?.note);
    if (proofNote.schema !== HISTORICAL_SCHEMA) throw httpError(409, "historical_proof_schema_mismatch");
    if (!(/* @__PURE__ */ new Set(["line_album", "line_archive"])).has(code6(proofNote.source_type))) throw httpError(409, "historical_proof_source_mismatch");
    if (text7(proofNote.evidence_sha256, 64).toLowerCase() !== evidenceSha256) throw httpError(409, "historical_proof_sha_mismatch");
    const proofState = code6(proofNote.review_state || "pending");
    if (proofState === "processed") {
      return json7({
        ok: true,
        duplicate: true,
        idempotent: true,
        authority: "payments-worker",
        proof_id: proofId,
        payment_ref: text7(proofNote.payments_worker_result?.payment_ref || paymentRef, 180),
        payment_stage: code6(proofNote.payments_worker_result?.payment_stage || paymentStage),
        proof_status: code6(proof.fields?.status || "reviewed")
      });
    }
    if (proofState === "rejected") throw httpError(409, "historical_proof_rejected");
    if (proofState !== "pending") throw httpError(409, "historical_proof_not_pending");
    const proofRef = text7(proof.fields?.payment_ref || proofNote.extraction?.payment_ref, 180);
    const proofAmount = positiveAmount(proof.fields?.amount_thb ?? proofNote.extraction?.amount_thb);
    const conflict2 = Boolean(
      proofRef && proofRef !== paymentRef || proofAmount != null && Math.abs(proofAmount - amountThb) > 9e-3
    );
    if (conflict2 && overrideReason.length < 5) throw httpError(409, "override_reason_required_for_proof_conflict");
    let recoverySession = null;
    if (cancellationCreditRecovery) {
      recoverySession = await validateCancellationCreditRecoverySubject(env, {
        sessionId,
        clientRecordId: recoveryClientRecordId,
        paymentRef
      });
    }
    if (!clean9(env.INTERNAL_TOKEN)) throw httpError(503, "payments_internal_token_not_ready");
    const notifyBody = {
      payment_ref: paymentRef,
      payment_stage: paymentStage,
      stage: paymentStage,
      session_id: sessionId || void 0,
      amount_thb: amountThb,
      member_email: memberEmail || void 0,
      package_code: packageCode || void 0,
      paid_at: paidAt || void 0,
      payment_method: "promptpay",
      notes: `historical_slip_backfill proof_id=${proofId}; evidence_sha256=${evidenceSha256}; reviewed_by=${reviewActor}${cancellationCreditRecovery ? "; cancellation_credit_recovery=true" : ""}`
    };
    const notifyRequest = new Request(new URL(NOTIFY_PATH, request2.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notifyBody)
    });
    const response = await runTrustedNotify(notifyRequest, env, ctx, notifyBody, {
      injectInternalToken: true,
      skipPointsAndPartner: cancellationCreditRecovery
    });
    const payload = await response.clone().json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) return response;
    const recoveryPayment = cancellationCreditRecovery ? await finalizeCancellationCreditRecoveryPayment(env, {
      paymentWrite: payload.payment_write,
      paymentRef,
      amountThb,
      sessionId,
      clientRecordId: recoveryClientRecordId,
      sessionRecordId: recoverySession?.id || null,
      proofId
    }) : null;
    const processedAt = (/* @__PURE__ */ new Date()).toISOString();
    const nextNote = {
      ...proofNote,
      review_state: "processed",
      reviewed_at: processedAt,
      review_reason: reviewReason,
      override_reason: overrideReason || null,
      reviewed_by: reviewActor,
      payments_worker_processed_at: processedAt,
      payments_worker_result: {
        payment_ref: paymentRef,
        payment_stage: paymentStage,
        payment_record_id: text7(payload.payment_write?.record_id || payload.payment_write?.id, 120) || null,
        points_awarded: payload.points_ledger?.awarded === true,
        duplicate: payload.duplicated === true || payload.duplicate === true,
        cancellation_credit_recovery: cancellationCreditRecovery,
        recovery_client_record_id: cancellationCreditRecovery ? recoveryClientRecordId : null,
        recovery_session_record_id: cancellationCreditRecovery ? recoverySession?.id || null : null,
        recovery_payment_record_id: recoveryPayment?.record_id || null
      }
    };
    const proofAuditWrite = await patchHistoricalProof(env, proof.id, {
      status: "reviewed",
      note: JSON.stringify(nextNote)
    }).then(() => ({ ok: true })).catch((error2) => ({ ok: false, error: String(error2?.message || error2) }));
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store, private");
    headers.set("x-mmd-payment-authority", "payments-worker");
    return new Response(JSON.stringify({
      ...payload,
      ok: true,
      authority: "payments-worker",
      historical_slip_backfill: true,
      proof_id: proofId,
      proof_audit_write: proofAuditWrite,
      cancellation_credit_recovery: cancellationCreditRecovery,
      recovery_payment: recoveryPayment
    }), { status: response.status, headers });
  } catch (error2) {
    return json7({
      ok: false,
      error: clean9(error2?.message || error2 || "historical_review_failed"),
      authority: "payments-worker"
    }, Number(error2?.status || 500));
  }
}
__name(handleHistoricalReviewedSlip, "handleHistoricalReviewedSlip");
async function runTrustedNotify(request2, env, ctx, body, { injectInternalToken, skipPointsAndPartner = false }) {
  const baseEnv = { ...env, POINTS_RATE: "9007199254740991" };
  let downstreamRequest = request2;
  if (injectInternalToken) {
    const headers2 = new Headers(request2.headers);
    headers2.set("X-Internal-Token", clean9(env.INTERNAL_TOKEN));
    headers2.set("Authorization", `Bearer ${clean9(env.INTERNAL_TOKEN)}`);
    downstreamRequest = new Request(request2, { headers: headers2 });
  }
  const response = await index_with_slip_evidence_default.fetch(downstreamRequest, baseEnv, ctx);
  if (!response.ok) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok) return response;
  const pointsLedger = skipPointsAndPartner ? { ok: true, awarded: false, skipped: true, reason: "cancellation_credit_recovery" } : await awardBasePointsPhase1(env, {
    payment_ref: body.payment_ref || body.transaction_ref,
    stage: body.stage || body.payment_stage || body.payment_type || "deposit",
    session_id: body.session_id,
    amount_thb: body.amount_thb || body.amount,
    member_id: body.member_id,
    member_email: body.member_email || body.email
  }).catch((error2) => ({
    ok: false,
    awarded: false,
    error: String(error2?.message || error2 || "points_phase1_failed")
  }));
  const partnerConfirmation = skipPointsAndPartner ? { ok: true, sent: false, skipped: true, reason: "cancellation_credit_recovery" } : await notifyPartnerJobAfterOfficialVerify(env, {
    payment_ref: body.payment_ref || body.transaction_ref,
    stage: body.stage || body.payment_stage || body.payment_type || "deposit",
    session_id: body.session_id
  }).catch((error2) => ({
    ok: false,
    sent: false,
    reason: "partner_confirmation_hook_failed",
    error: String(error2?.message || error2 || "unknown")
  }));
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify({ ...payload, points_ledger: pointsLedger, partner_confirmation: partnerConfirmation }), {
    status: response.status,
    headers
  });
}
__name(runTrustedNotify, "runTrustedNotify");
async function loadHistoricalProof(env, proofId) {
  requireAirtable3(env);
  const table7 = historicalProofTable(env);
  const formula5 = `{proof_id}='${formulaValue(proofId)}'`;
  const url = new URL(`${AIRTABLE_API11}/${encodeURIComponent(clean9(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table7)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", formula5);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${clean9(env.AIRTABLE_API_KEY)}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status, `airtable_${response.status}`);
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (records.length > 1) throw httpError(409, "historical_proof_ambiguous");
  return records[0] || null;
}
__name(loadHistoricalProof, "loadHistoricalProof");
async function patchHistoricalProof(env, recordId3, fields2) {
  requireAirtable3(env);
  const url = `${AIRTABLE_API11}/${encodeURIComponent(clean9(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(historicalProofTable(env))}/${encodeURIComponent(recordId3)}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clean9(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fields2, typecast: true })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  return payload;
}
__name(patchHistoricalProof, "patchHistoricalProof");
function recordId(value3) {
  const valueText = text7(value3, 40);
  return /^rec[A-Za-z0-9]{14}$/.test(valueText) ? valueText : "";
}
__name(recordId, "recordId");
function recordLinks(value3) {
  return Array.isArray(value3) ? [...new Set(value3.map((item) => recordId(item)).filter(Boolean))] : [];
}
__name(recordLinks, "recordLinks");
function recoveryField(fields2, fieldId, ...aliases) {
  if (fields2?.[fieldId] !== void 0) return fields2[fieldId];
  for (const alias of aliases) if (fields2?.[alias] !== void 0) return fields2[alias];
  return void 0;
}
__name(recoveryField, "recoveryField");
function recoveryPaymentsTable(env) {
  return clean9(env.AIRTABLE_TABLE_PAYMENTS || env.AIRTABLE_TABLE_PAYMENTS_ID) || CANCELLATION_CREDIT_RECOVERY.paymentsTable;
}
__name(recoveryPaymentsTable, "recoveryPaymentsTable");
function recoverySessionsTable(env) {
  return clean9(env.AIRTABLE_TABLE_SESSIONS || env.AIRTABLE_TABLE_SESSIONS_ID) || CANCELLATION_CREDIT_RECOVERY.sessionsTable;
}
__name(recoverySessionsTable, "recoverySessionsTable");
async function recoveryAirtableRequest(env, table7, path = "", init = {}) {
  requireAirtable3(env);
  const url = new URL(`${AIRTABLE_API11}/${encodeURIComponent(clean9(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table7)}${path}`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  for (const [key, value3] of Object.entries(init.query || {})) {
    if (value3 !== void 0 && value3 !== null && value3 !== "") url.searchParams.set(key, String(value3));
  }
  const response = await fetch(url.toString(), {
    method: init.method || "GET",
    headers: {
      Authorization: `Bearer ${clean9(env.AIRTABLE_API_KEY)}`,
      Accept: "application/json",
      ...init.body ? { "Content-Type": "application/json" } : {}
    },
    body: init.body ? JSON.stringify(init.body) : void 0
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status, `airtable_${response.status}`);
  return payload;
}
__name(recoveryAirtableRequest, "recoveryAirtableRequest");
async function recoveryFindOne(env, table7, formula5) {
  const payload = await recoveryAirtableRequest(env, table7, "", { query: { maxRecords: 2, filterByFormula: formula5 } });
  const rows2 = Array.isArray(payload?.records) ? payload.records : [];
  if (rows2.length > 1) throw httpError(409, "recovery_subject_ambiguous");
  return rows2[0] || null;
}
__name(recoveryFindOne, "recoveryFindOne");
async function recoveryGetRecord(env, table7, id) {
  const normalizedId = recordId(id);
  if (!normalizedId) return null;
  return recoveryAirtableRequest(env, table7, `/${encodeURIComponent(normalizedId)}`).catch((error2) => {
    if (Number(error2?.status) === 404) return null;
    throw error2;
  });
}
__name(recoveryGetRecord, "recoveryGetRecord");
async function validateCancellationCreditRecoverySubject(env, { sessionId, clientRecordId, paymentRef }) {
  const session = await recoveryFindOne(
    env,
    recoverySessionsTable(env),
    `{session_id}='${formulaValue(sessionId)}'`
  );
  if (!session?.id) throw httpError(404, "recovery_session_not_found");
  const sessionClientIds = recordLinks(recoveryField(session.fields, CANCELLATION_CREDIT_RECOVERY.sessionClient, "Client"));
  if (sessionClientIds.length !== 1 || sessionClientIds[0] !== clientRecordId) {
    throw httpError(409, "recovery_session_client_mismatch");
  }
  const sessionStatus = code6(recoveryField(session.fields, CANCELLATION_CREDIT_RECOVERY.sessionStatus, "Session Status", "session_status"));
  if (!CANCELLED_SESSION_STATES.has(sessionStatus)) throw httpError(409, "recovery_session_not_cancelled");
  const existingPayment = await recoveryFindOne(
    env,
    recoveryPaymentsTable(env),
    `{Payment Reference}='${formulaValue(paymentRef)}'`
  );
  if (existingPayment?.id) {
    const existingSessionId = text7(recoveryField(existingPayment.fields, CANCELLATION_CREDIT_RECOVERY.paymentSessionId, "session_id", "Session ID"), 180);
    const existingClientIds = recordLinks(recoveryField(existingPayment.fields, CANCELLATION_CREDIT_RECOVERY.paymentClient, "Client"));
    if (existingSessionId && existingSessionId !== sessionId) throw httpError(409, "recovery_payment_session_mismatch");
    if (existingClientIds.length && (existingClientIds.length !== 1 || existingClientIds[0] !== clientRecordId)) {
      throw httpError(409, "recovery_payment_client_mismatch");
    }
  }
  return session;
}
__name(validateCancellationCreditRecoverySubject, "validateCancellationCreditRecoverySubject");
async function finalizeCancellationCreditRecoveryPayment(env, {
  paymentWrite,
  paymentRef,
  amountThb,
  sessionId,
  clientRecordId,
  sessionRecordId,
  proofId
}) {
  const paymentId = recordId(paymentWrite?.record_id || paymentWrite?.id);
  const payment = paymentId ? await recoveryGetRecord(env, recoveryPaymentsTable(env), paymentId) : await recoveryFindOne(env, recoveryPaymentsTable(env), `{Payment Reference}='${formulaValue(paymentRef)}'`);
  if (!payment?.id) throw httpError(502, "recovery_payment_write_unresolved");
  const writtenRef = text7(recoveryField(payment.fields, CANCELLATION_CREDIT_RECOVERY.paymentRef, "Payment Reference", "payment_ref"), 180);
  const writtenSessionId = text7(recoveryField(payment.fields, CANCELLATION_CREDIT_RECOVERY.paymentSessionId, "session_id", "Session ID"), 180);
  const writtenClientIds = recordLinks(recoveryField(payment.fields, CANCELLATION_CREDIT_RECOVERY.paymentClient, "Client"));
  if (writtenRef !== paymentRef || writtenSessionId !== sessionId) throw httpError(409, "recovery_payment_write_subject_mismatch");
  if (writtenClientIds.length && (writtenClientIds.length !== 1 || writtenClientIds[0] !== clientRecordId)) {
    throw httpError(409, "recovery_payment_write_client_mismatch");
  }
  const verifiedAt = (/* @__PURE__ */ new Date()).toISOString();
  await recoveryAirtableRequest(env, recoveryPaymentsTable(env), `/${encodeURIComponent(payment.id)}`, {
    method: "PATCH",
    body: {
      fields: {
        [CANCELLATION_CREDIT_RECOVERY.paymentClient]: [clientRecordId],
        [CANCELLATION_CREDIT_RECOVERY.paymentAmountReceived]: amountThb,
        [CANCELLATION_CREDIT_RECOVERY.paymentVerification]: "official_verified",
        [CANCELLATION_CREDIT_RECOVERY.paymentDepositStatus]: "official_verified",
        [CANCELLATION_CREDIT_RECOVERY.paymentOfficialAt]: verifiedAt,
        [CANCELLATION_CREDIT_RECOVERY.paymentOfficialRef]: paymentRef,
        [CANCELLATION_CREDIT_RECOVERY.paymentOfficialBy]: "payments-worker"
      },
      typecast: false
    }
  });
  return {
    record_id: payment.id,
    payment_ref: paymentRef,
    received_thb: amountThb,
    client_record_id: clientRecordId,
    session_record_id: recordId(sessionRecordId) || null,
    proof_id: proofId,
    official_verified_at: verifiedAt
  };
}
__name(finalizeCancellationCreditRecoveryPayment, "finalizeCancellationCreditRecoveryPayment");
function requireAirtable3(env) {
  if (!clean9(env.AIRTABLE_API_KEY) || !clean9(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready");
}
__name(requireAirtable3, "requireAirtable");
function historicalProofTable(env) {
  return clean9(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi");
}
__name(historicalProofTable, "historicalProofTable");
async function serviceAuthed(request2, expected) {
  const expectedToken = clean9(expected);
  if (!expectedToken) return false;
  const direct = clean9(request2.headers.get("X-Internal-Token"));
  const bearer = clean9(request2.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  return constantTimeEqual(direct || bearer, expectedToken);
}
__name(serviceAuthed, "serviceAuthed");
function normalizeStage2(value3) {
  const stage2 = code6(value3);
  if (!PAYMENT_STAGES.has(stage2)) throw httpError(400, "invalid_payment_stage");
  return stage2;
}
__name(normalizeStage2, "normalizeStage");
function positiveAmount(value3) {
  if (value3 == null || clean9(value3) === "") return null;
  const normalized3 = clean9(value3).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized3)) return null;
  const amount3 = Number(normalized3);
  if (!Number.isFinite(amount3) || amount3 <= 0 || amount3 > 1e7) return null;
  return Math.round((amount3 + Number.EPSILON) * 100) / 100;
}
__name(positiveAmount, "positiveAmount");
function parseNote(value3) {
  try {
    const parsed = JSON.parse(clean9(value3) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
__name(parseNote, "parseNote");
function email(value3) {
  const normalized3 = clean9(value3).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized3) ? normalized3 : "";
}
__name(email, "email");
function code6(value3) {
  return clean9(value3).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
}
__name(code6, "code");
function text7(value3, max = 240) {
  return clean9(value3).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}
__name(text7, "text");
function clean9(value3) {
  return String(value3 ?? "").trim();
}
__name(clean9, "clean");
function normalizePath2(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
__name(normalizePath2, "normalizePath");
function jsonHeaders() {
  return new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-MMD-Payment-Authority": "payments-worker"
  });
}
__name(jsonHeaders, "jsonHeaders");
function json7(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders() });
}
__name(json7, "json");

// public-session-extension-payment.js
var PATH_INTENT = "/v1/internal/payments/session-extension/intent";
var PATH_STATUS = "/v1/internal/payments/session-extension/status";
var API = "https://api.airtable.com/v0";
var DEFAULT_PAYMENTS = "tblWGGJJOx5eBvBZJ";
var F2 = Object.freeze({
  ref: "fldOO6SY49iDw8VBZ",
  amount: "fldvCSwrUW8OMAooS",
  status: "fldEJ1hmm7KwWuI6q",
  method: "fldsblzIn0wzan3c9",
  notes: "fldjsZIKoJPawlb2u",
  intent: "fld04fr3bRJTohO6y",
  verification: "fldJ7a0Ube9F0bmRy",
  createdAt: "flduxcPpowBxEZSLu",
  sessionId: "fld2wdhBvc8xrV6y5",
  stage: "fldrr9g8ZZjqAbdKQ",
  type: "fldydUWHhqVLMkNSC",
  officialAt: "fldPNK6qgxCSdaJRM",
  officialRef: "flddkMKy5H8RbFwt9",
  officialBy: "fld208LCmQZB5llNo",
  officialReason: "fldXH56EPA122RoGa"
});
function clean10(v, max = 4e3) {
  return String(v == null ? "" : v).trim().slice(0, max);
}
__name(clean10, "clean");
function normalizePath3(v) {
  const p = clean10(v || "/").replace(/\/{2,}/g, "/");
  return p.length > 1 ? p.replace(/\/+$/g, "") : p;
}
__name(normalizePath3, "normalizePath");
function amount2(v) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 1e7 ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}
__name(amount2, "amount");
function compact5(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== void 0 && v !== null && v !== ""));
}
__name(compact5, "compact");
function formula2(v) {
  return String(v || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
__name(formula2, "formula");
function json8(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store, private", "x-mmd-payment-authority": "payments-worker", "x-mmd-extension-payment": "v1" } });
}
__name(json8, "json");
function error(status, code15) {
  return json8({ ok: false, error: code15, authority: "payments-worker" }, status);
}
__name(error, "error");
async function constantTimeEqual2(a, b) {
  const e = new TextEncoder();
  const [aa, bb] = await Promise.all([crypto.subtle.digest("SHA-256", e.encode(clean10(a))), crypto.subtle.digest("SHA-256", e.encode(clean10(b)))]);
  const x = new Uint8Array(aa), y = new Uint8Array(bb);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
__name(constantTimeEqual2, "constantTimeEqual");
async function authed(request2, env) {
  const direct = clean10(request2.headers.get("X-Internal-Token"), 5e3);
  const bearer = clean10(request2.headers.get("Authorization"), 5e3).replace(/^Bearer\s+/i, "");
  const candidate = direct || bearer;
  const expected = [clean10(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS, 5e3), clean10(env.AUTH_SERVICE_IMMIGRATE_TO_PAYMENTS, 5e3)].filter(Boolean);
  if (!candidate || !expected.length) return false;
  for (const secret of expected) if (await constantTimeEqual2(candidate, secret)) return true;
  return false;
}
__name(authed, "authed");
function requireEnv(env) {
  if (!clean10(env.AIRTABLE_API_KEY) || !clean10(env.AIRTABLE_BASE_ID)) throw Object.assign(new Error("airtable_not_ready"), { status: 503 });
  if (!clean10(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY)) throw Object.assign(new Error("payment_signing_not_ready"), { status: 503 });
  if (!env.PAY_SESSIONS_KV?.put) throw Object.assign(new Error("payment_token_store_not_ready"), { status: 503 });
}
__name(requireEnv, "requireEnv");
async function afetch(env, url, init = {}) {
  const request2 = new Request(url, { ...init, headers: { Authorization: `Bearer ${clean10(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json", ...init.headers || {} } });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const e = new Error(`airtable_${response.status}`);
    e.status = response.status;
    throw e;
  }
  return payload;
}
__name(afetch, "afetch");
function table4(env) {
  return clean10(env.AIRTABLE_TABLE_PAYMENTS || env.AIRTABLE_TABLE_PAYMENTS_ID) || DEFAULT_PAYMENTS;
}
__name(table4, "table");
async function findByRef(env, ref) {
  const url = new URL(`${API}/${encodeURIComponent(clean10(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table4(env))}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{Payment Reference}='${formula2(ref)}'`);
  const data = await afetch(env, url.toString());
  const rows2 = Array.isArray(data.records) ? data.records : [];
  if (rows2.length > 1) {
    const e = new Error("payment_ref_ambiguous");
    e.status = 409;
    throw e;
  }
  return rows2[0] || null;
}
__name(findByRef, "findByRef");
async function writeIntent(env, record, fields2) {
  if (record?.id) {
    const data2 = await afetch(env, `${API}/${encodeURIComponent(clean10(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table4(env))}/${encodeURIComponent(record.id)}`, { method: "PATCH", body: JSON.stringify({ fields: fields2, typecast: false }) });
    return { mode: "update", record_id: data2.id || record.id };
  }
  const data = await afetch(env, `${API}/${encodeURIComponent(clean10(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table4(env))}`, { method: "POST", body: JSON.stringify({ records: [{ fields: fields2 }], typecast: false }) });
  const created = data.records?.[0];
  if (!created?.id) {
    const e = new Error("payment_create_malformed");
    e.status = 502;
    throw e;
  }
  return { mode: "create", record_id: created.id };
}
__name(writeIntent, "writeIntent");
function field3(fields2, id, ...names) {
  if (fields2?.[id] !== void 0) return fields2[id];
  for (const name of names) if (fields2?.[name] !== void 0) return fields2[name];
  return void 0;
}
__name(field3, "field");
function normalized(v) {
  return clean10(v, 120).toLowerCase().replace(/[\s-]+/g, "_");
}
__name(normalized, "normalized");
function paymentSnapshot2(record) {
  const f = record?.fields || {};
  return {
    payment_ref: clean10(field3(f, F2.ref, "Payment Reference", "payment_ref"), 220),
    session_id: clean10(field3(f, F2.sessionId, "session_id", "Session ID"), 220),
    amount_thb: amount2(field3(f, F2.amount, "Amount", "amount_thb")),
    payment_status: normalized(field3(f, F2.status, "Payment Status", "payment_status")),
    verification_status: normalized(field3(f, F2.verification, "Verification Status", "verification_status")),
    stage: normalized(field3(f, F2.stage, "payment_stage", "stage")),
    type: normalized(field3(f, F2.type, "payment_type")),
    official_verified_at: clean10(field3(f, F2.officialAt, "official_verified_at"), 120) || null,
    official_verification_ref: clean10(field3(f, F2.officialRef, "official_verification_ref"), 220) || null,
    official_verified_by: clean10(field3(f, F2.officialBy, "official_verified_by"), 160) || null,
    official_match_reason: clean10(field3(f, F2.officialReason, "official_match_reason"), 500) || null
  };
}
__name(paymentSnapshot2, "paymentSnapshot");
function extensionPaymentVerified(snapshot2, expected = {}) {
  if (!snapshot2) return false;
  const exactRef = clean10(snapshot2.payment_ref) === clean10(expected.payment_ref);
  const exactSession = clean10(snapshot2.session_id) === clean10(expected.session_id);
  const exactAmount = amount2(snapshot2.amount_thb) === amount2(expected.amount_thb);
  const stage2 = normalized(snapshot2.stage || snapshot2.type);
  const stageOk = stage2 === "extension" && (!snapshot2.type || normalized(snapshot2.type) === "extension");
  const paid = (/* @__PURE__ */ new Set(["paid", "success", "completed"])).has(normalized(snapshot2.payment_status));
  const verified = (/* @__PURE__ */ new Set(["verified", "official_verified", "approved"])).has(normalized(snapshot2.verification_status));
  const officialRef = clean10(snapshot2.official_verification_ref);
  const officialRefOk = !officialRef || officialRef === clean10(expected.payment_ref);
  return exactRef && exactSession && exactAmount && stageOk && paid && verified && officialRefOk;
}
__name(extensionPaymentVerified, "extensionPaymentVerified");
async function handleIntent(request2, env) {
  if (!await authed(request2, env)) return error(401, "service_auth_required");
  requireEnv(env);
  const body = await request2.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return error(400, "invalid_extension_payment_intent");
  const requestId = clean10(body.request_id, 180);
  const sessionId = clean10(body.session_id, 220);
  const paymentRef = clean10(body.payment_ref, 220);
  const price = amount2(body.amount_thb ?? body.amount);
  if (!requestId || !sessionId || !/^pay_ext_[a-f0-9]{24}$/.test(paymentRef) || price == null) return error(400, "invalid_extension_payment_subject");
  const existing = await findByRef(env, paymentRef);
  if (existing) {
    const snap = paymentSnapshot2(existing);
    if (snap.session_id !== sessionId || snap.amount_thb !== price || normalized(snap.stage || snap.type) !== "extension") return error(409, "extension_payment_ref_conflict");
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const note = [
    "schema=mmd_public_session_extension_v1",
    `request_id=${requestId}`,
    `session_id=${sessionId}`,
    "payment_stage=extension",
    body.original_end_at ? `original_end_at=${clean10(body.original_end_at, 120)}` : "",
    body.requested_end_at ? `requested_end_at=${clean10(body.requested_end_at, 120)}` : ""
  ].filter(Boolean).join("; ");
  const fields2 = compact5({
    [F2.ref]: paymentRef,
    [F2.amount]: price,
    [F2.status]: existing ? void 0 : "Pending",
    [F2.method]: existing ? void 0 : "PromptPay",
    [F2.notes]: note,
    [F2.intent]: existing ? void 0 : "Pending Confirmation",
    [F2.verification]: existing ? void 0 : "pending_review",
    [F2.createdAt]: existing ? void 0 : now,
    [F2.sessionId]: sessionId,
    [F2.stage]: "extension",
    [F2.type]: "extension"
  });
  const write = await writeIntent(env, existing, fields2);
  const iat = Math.floor(Date.now() / 1e3), exp = iat + getConfirmTokenTtlSeconds(env);
  const claims = { kind: "customer_confirm", role: "customer", session_id: sessionId, payment_ref: paymentRef, payment_type: "extension", iat, exp };
  const secret = clean10(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5e3);
  const token4 = await signConfirmToken(claims, secret);
  await createConfirmTokenRecord(env, token4, claims);
  const web = clean10(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
  return json8({
    ok: true,
    authority: "payments-worker",
    schema: "public_session_extension_payment_v1",
    request_id: requestId,
    session_id: sessionId,
    payment_ref: paymentRef,
    payment_stage: "extension",
    amount_thb: price,
    customer_payment_url: `${web}/pay/checkout?t=${encodeURIComponent(token4)}`,
    payment_write: write
  });
}
__name(handleIntent, "handleIntent");
async function handleStatus(request2, env) {
  if (!await authed(request2, env)) return error(401, "service_auth_required");
  requireEnv(env);
  const body = await request2.json().catch(() => null);
  const paymentRef = clean10(body?.payment_ref, 220), sessionId = clean10(body?.session_id, 220), price = amount2(body?.amount_thb ?? body?.amount);
  if (!paymentRef || !sessionId || price == null) return error(400, "invalid_extension_payment_status_subject");
  const record = await findByRef(env, paymentRef);
  if (!record) return json8({ ok: true, authority: "payments-worker", found: false, verified: false, payment_ref: paymentRef });
  const snapshot2 = paymentSnapshot2(record);
  const exact = snapshot2.payment_ref === paymentRef && snapshot2.session_id === sessionId && snapshot2.amount_thb === price && normalized(snapshot2.stage || snapshot2.type) === "extension";
  if (!exact) return error(409, "extension_payment_subject_mismatch");
  return json8({
    ok: true,
    authority: "payments-worker",
    found: true,
    verified: extensionPaymentVerified(snapshot2, { payment_ref: paymentRef, session_id: sessionId, amount_thb: price }),
    payment_ref: paymentRef,
    payment_stage: "extension",
    payment_status: snapshot2.payment_status,
    verification_status: snapshot2.verification_status,
    official_verified_at: snapshot2.official_verified_at
  });
}
__name(handleStatus, "handleStatus");
function isPublicSessionExtensionPaymentPath(input) {
  const path = normalizePath3(input instanceof URL ? input.pathname : new URL(String(input)).pathname);
  return path === PATH_INTENT || path === PATH_STATUS;
}
__name(isPublicSessionExtensionPaymentPath, "isPublicSessionExtensionPaymentPath");
async function handlePublicSessionExtensionPayment(request2, env) {
  const path = normalizePath3(new URL(request2.url).pathname);
  if (request2.method !== "POST") return error(405, "method_not_allowed");
  try {
    if (path === PATH_INTENT) return handleIntent(request2, env);
    if (path === PATH_STATUS) return handleStatus(request2, env);
    return error(404, "not_found");
  } catch (e) {
    return error(Number(e?.status) || 500, clean10(e?.message || e || "extension_payment_failed", 300));
  }
}
__name(handlePublicSessionExtensionPayment, "handlePublicSessionExtensionPayment");
var PUBLIC_EXTENSION_PAYMENT_INTERNALS = Object.freeze({ paymentSnapshot: paymentSnapshot2 });

// ../shared/posthog-authority-events.mjs
var DEFAULT_API_HOST = "https://us.i.posthog.com";
var DEFAULT_TIMEOUT_MS = 2500;
var SAFE_PROPERTY_KEYS = /* @__PURE__ */ new Set([
  "surface",
  "world",
  "flow",
  "route",
  "payment_stage",
  "package_code",
  "status",
  "amount_thb",
  "currency",
  "materialized",
  "duplicate",
  "verification",
  "decision",
  "terms_version",
  "lane",
  "job_class",
  "access_scope",
  "member_status",
  "shop",
  "stock_confirmation_required",
  "storage_status",
  "sync_status"
]);
function clean11(value3, max = 160) {
  return String(value3 == null ? "" : value3).trim().slice(0, max);
}
__name(clean11, "clean");
function safePrimitive(value3) {
  if (typeof value3 === "boolean") return value3;
  if (typeof value3 === "number" && Number.isFinite(value3)) return value3;
  if (typeof value3 === "string") return clean11(value3);
  return void 0;
}
__name(safePrimitive, "safePrimitive");
function safeProperties(input = {}) {
  const out = {};
  for (const [key, value3] of Object.entries(input || {})) {
    if (!SAFE_PROPERTY_KEYS.has(key)) continue;
    const safe = safePrimitive(value3);
    if (safe !== void 0 && safe !== "") out[key] = safe;
  }
  return out;
}
__name(safeProperties, "safeProperties");
async function sha256Hex5(value3) {
  const bytes = new TextEncoder().encode(String(value3 || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex5, "sha256Hex");
function analyticsEnabled(env = {}) {
  return !["1", "true", "yes", "on"].includes(clean11(env.POSTHOG_AUTHORITY_DISABLED, 16).toLowerCase());
}
__name(analyticsEnabled, "analyticsEnabled");
function apiHost(env = {}) {
  return clean11(env.POSTHOG_API_HOST || DEFAULT_API_HOST, 300).replace(/\/+$/, "");
}
__name(apiHost, "apiHost");
function projectToken(env = {}) {
  return clean11(env.POSTHOG_PROJECT_TOKEN, 300);
}
__name(projectToken, "projectToken");
function posthogAuthorityReady(env = {}) {
  return analyticsEnabled(env) && Boolean(projectToken(env));
}
__name(posthogAuthorityReady, "posthogAuthorityReady");
async function captureAuthorityEvent(env = {}, input = {}) {
  if (!analyticsEnabled(env)) return { ok: true, skipped: true, reason: "disabled" };
  const event = clean11(input.event, 120);
  const authority = clean11(input.authority, 80);
  const scope = clean11(input.scope || authority || "authority", 60).replace(/[^a-zA-Z0-9_-]/g, "_");
  const distinctValue = clean11(input.distinctValue, 500);
  const insertValue = clean11(input.insertValue || distinctValue, 500);
  const token4 = projectToken(env);
  if (!event || !/^[a-zA-Z0-9_ -]+$/.test(event)) {
    return { ok: false, skipped: true, reason: "invalid_event" };
  }
  if (!authority || !distinctValue) {
    return { ok: false, skipped: true, reason: "missing_required_context" };
  }
  if (!token4) {
    return { ok: false, skipped: true, reason: "project_token_missing" };
  }
  try {
    const [distinctHash, insertHash] = await Promise.all([
      sha256Hex5(`${scope}:${distinctValue}`),
      sha256Hex5(`${event}:${insertValue}`)
    ]);
    const properties = {
      ...safeProperties(input.properties),
      authority,
      source: "server",
      schema: "mmd_authority_v1",
      $process_person_profile: false,
      $insert_id: `mmd_authority_${insertHash.slice(0, 40)}`
    };
    const controller = new AbortController();
    const timeoutMs = Math.max(250, Math.min(1e4, Number(env.POSTHOG_AUTHORITY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)));
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${apiHost(env)}/i/v0/e/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          api_key: token4,
          event,
          distinct_id: `mmd_${scope}_${distinctHash.slice(0, 32)}`,
          properties,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        })
      });
      return { ok: response.ok, status: response.status };
    } finally {
      clearTimeout(timer);
    }
  } catch (error2) {
    return {
      ok: false,
      error: clean11(error2?.name === "AbortError" ? "posthog_timeout" : error2?.message || error2 || "posthog_capture_failed", 180)
    };
  }
}
__name(captureAuthorityEvent, "captureAuthorityEvent");
function authorityRuntimeHealth(env = {}, authority = "", ctx = null) {
  const configured = posthogAuthorityReady(env);
  const safeAuthority = clean11(authority, 80) || "unknown-worker";
  if (configured) {
    const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    queueAuthorityEvent(ctx, env, {
      event: "analytics_runtime_health",
      authority: safeAuthority,
      scope: "analytics_health",
      distinctValue: safeAuthority,
      insertValue: `${safeAuthority}:${day}`,
      properties: {
        surface: "system",
        world: "ops",
        status: "configured"
      }
    });
  }
  return {
    posthog_authority: configured ? "configured" : "missing",
    schema: "mmd_authority_v1"
  };
}
__name(authorityRuntimeHealth, "authorityRuntimeHealth");
function queueAuthorityEvent(ctx, env = {}, input = {}) {
  const task = captureAuthorityEvent(env, input).then((result3) => {
    if (!result3.ok && !result3.skipped) {
      console.warn(JSON.stringify({
        event: "posthog_authority_capture_failed",
        authority: clean11(input.authority, 80),
        analytics_event: clean11(input.event, 120),
        status: result3.status || null,
        error: result3.error || null
      }));
    }
    return result3;
  }).catch(() => ({ ok: false, error: "posthog_capture_failed" }));
  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(task);
    return;
  }
  void task;
}
__name(queueAuthorityEvent, "queueAuthorityEvent");

// ../shared/membership-promotion-policy.mjs
var CARE_BACK_START_AT = "2026-08-01T00:00:00+07:00";
var CARE_BACK_START_MS = Date.parse(CARE_BACK_START_AT);
var PROMO_PUBLIC_ENDS_BEFORE = "2026-11-01T00:00:00+07:00";
var PROMO_HONORED_BEFORE = "2027-01-01T00:00:00+07:00";
var PROMO_HONORED_BEFORE_MS = Date.parse(PROMO_HONORED_BEFORE);
var PRIVATE_CARE_BACK = Object.freeze({
  standard: Object.freeze({
    code: "care_back_private_standard_2026",
    bonus_days: 180,
    bonus_years: 0,
    label: "CARE BACK +180 days"
  }),
  premium: Object.freeze({
    code: "care_back_private_premium_2026",
    bonus_days: 0,
    bonus_years: 1,
    label: "CARE BACK +1 year"
  })
});
function isProtectedPrivateMembership(value3) {
  return (/* @__PURE__ */ new Set(["vip", "svip", "blackcard", "black_card"])).has(token2(value3));
}
__name(isProtectedPrivateMembership, "isProtectedPrivateMembership");
var PRIVATE_RENEWAL_BASE_YEARS = Object.freeze({ standard: 1, premium: 1 });
function privateRenewalBaseYears(packageCode) {
  return PRIVATE_RENEWAL_BASE_YEARS[token2(packageCode)] || 0;
}
__name(privateRenewalBaseYears, "privateRenewalBaseYears");
function privateRenewalTiming(expireAtValue, renewalAtValue) {
  const renewalAt = new Date(renewalAtValue);
  const expiry = new Date(expireAtValue || "invalid");
  if (!Number.isFinite(renewalAt.getTime())) return null;
  const knownExpiry = Number.isFinite(expiry.getTime());
  const active = knownExpiry && expiry > renewalAt;
  const oneYearAfterExpiry = knownExpiry ? new Date(expiry) : null;
  if (oneYearAfterExpiry) addBangkokCalendarYears(oneYearAfterExpiry, 1);
  return {
    expiry_known: knownExpiry,
    active,
    expired_within_90_days: knownExpiry && !active && renewalAt.getTime() - expiry.getTime() <= 90 * 864e5,
    expired_less_than_one_year: knownExpiry && !active && renewalAt < oneYearAfterExpiry,
    expired_one_year_or_more: knownExpiry && !active && renewalAt >= oneYearAfterExpiry,
    start_at: (active ? expiry : renewalAt).toISOString(),
    expired_over_one_year: !!oneYearAfterExpiry && oneYearAfterExpiry < renewalAt
  };
}
__name(privateRenewalTiming, "privateRenewalTiming");
function currentPrivateMembershipPromotion({ package_code = "", paid_at = "", action = "", existing_member = false, prior_expire_at = "" } = {}) {
  const packageCode = token2(package_code);
  const paidMs = Date.parse(String(paid_at || ""));
  if (!Number.isFinite(paidMs) || paidMs < CARE_BACK_START_MS || paidMs >= PROMO_HONORED_BEFORE_MS) return null;
  if (token2(action) === "signup" && existing_member === false) {
    return packageCode === "premium" ? { code: "private_premium_signup_total_two_years_2026", total_years: 2, bonus_days: 0, bonus_years: 0, label: "Premium signup total 2 years", starts_at: CARE_BACK_START_AT } : null;
  }
  if (token2(action) !== "renewal" || existing_member !== true) return null;
  const timing = privateRenewalTiming(prior_expire_at, paid_at);
  if (!timing?.expiry_known || timing.expired_one_year_or_more) return null;
  const policy = PRIVATE_CARE_BACK[packageCode];
  return policy ? { ...policy, code: `october_prepaid_${packageCode}_2026`, starts_at: CARE_BACK_START_AT, ends_before: PROMO_PUBLIC_ENDS_BEFORE, honored_before: PROMO_HONORED_BEFORE } : null;
}
__name(currentPrivateMembershipPromotion, "currentPrivateMembershipPromotion");
function applyMembershipPromotion(expireAtValue, promotion, { start_at = "" } = {}) {
  const expireAt = new Date(expireAtValue);
  if (Number.isNaN(expireAt.getTime()) || !promotion) return null;
  if (promotion.total_years === 2) {
    const start = new Date(start_at);
    if (!Number.isFinite(start.getTime())) return null;
    addBangkokCalendarYears(start, 2);
    return start;
  }
  const bonusYears = Number(promotion.bonus_years || 0);
  if (Number.isInteger(bonusYears) && bonusYears > 0) addBangkokCalendarYears(expireAt, bonusYears);
  const bonusDays = Number(promotion.bonus_days || 0);
  if (Number.isInteger(bonusDays) && bonusDays > 0) expireAt.setUTCDate(expireAt.getUTCDate() + bonusDays);
  return expireAt;
}
__name(applyMembershipPromotion, "applyMembershipPromotion");
function addBangkokCalendarYears(date, years) {
  date.setTime(date.getTime() + 7 * 60 * 60 * 1e3);
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  date.setTime(date.getTime() - 7 * 60 * 60 * 1e3);
  return date;
}
__name(addBangkokCalendarYears, "addBangkokCalendarYears");
function token2(value3) {
  return String(value3 || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(token2, "token");

// reviewed-proof.js
var REVIEW_SOURCE = "payment_review_console";
var LINE_OFC_SOURCE = "line_ofc_payment_ingress";
var HISTORICAL_SCHEMA2 = "mmd_historical_slip_backfill_v1";
var PAYMENT_STAGES2 = /* @__PURE__ */ new Set(["deposit", "final", "tips", "full", "extension", "membership", "shop"]);
var AIRTABLE_API12 = "https://api.airtable.com/v0";
var RECOVERY_CONTEXT = "liff_renewal_recovery";
var CANONICAL_ENTITLEMENTS = "tblNImdF9PKAxhXGi";
var CANONICAL_RENEWALS = "tblXjQFwo0A2cHseh";
var CANONICAL_MEMBERS = "tblgWc5VRon5o8Mhk";
var CANONICAL_CLIENTS = "tblVv58TCbwh5j1fS";
var RECOVERY_PRICE = Object.freeze({ standard: /* @__PURE__ */ new Set([499, 799, 1e3]), premium: /* @__PURE__ */ new Set([999, 1999, 2500]) });
var MEMBERSHIP_YEARS = Object.freeze({ standard: 1, premium: 2 });
var REVIEWED_PROOF_PATH = "/v1/internal/payments/reviewed-proof";
function isReviewedProofRequest(path, method = "POST") {
  return normalizePath4(path) === REVIEWED_PROOF_PATH && ["POST", "OPTIONS"].includes(String(method || "POST").toUpperCase());
}
__name(isReviewedProofRequest, "isReviewedProofRequest");
async function handleReviewedProof(request2, env = {}, ctx = null, notifyTrusted) {
  const method = request2.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: jsonHeaders2() });
  if (!isReviewedProofRequest(new URL(request2.url).pathname, method)) return json9({ ok: false, error: "not_found" }, 404);
  const lineOfcCaller = request2.headers.get("x-mmd-service-caller") === "member-dashboard-chat-worker";
  const adminAuthed = await serviceAuthed2(request2, env.AUTH_SERVICE_ADMIN_TO_PAYMENTS);
  const lineOfcAuthed = lineOfcCaller && await serviceAuthed2(request2, env.AUTH_SERVICE_LINE_TO_PAYMENTS || env.INTERNAL_TOKEN);
  if (!adminAuthed && !lineOfcAuthed) {
    return json9({ ok: false, error: "service_auth_required", authority: "payments-worker" }, 401);
  }
  if (typeof notifyTrusted !== "function") {
    return json9({ ok: false, error: "trusted_notify_adapter_missing", authority: "payments-worker" }, 503);
  }
  const body = await request2.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json9({ ok: false, error: "invalid_payment_review_request", authority: "payments-worker" }, 400);
  }
  try {
    const source = code7(body.source);
    const decision = code7(body.decision);
    const proofId = text8(body.proof_id, 120);
    const evidenceRecordId = text8(body.evidence_record_id, 120);
    const paymentRef = text8(body.payment_ref || body.transaction_ref, 180);
    const amountThb = positiveAmount2(body.amount_thb ?? body.amount);
    const paymentStage = normalizeStage3(body.payment_stage || body.stage || body.payment_type);
    const sessionId = text8(body.session_id, 180);
    const memberEmail = email2(body.member_email || body.email);
    const packageCode = canonicalPackage(body.package_code || body.package);
    const paymentMethod = text8(body.payment_method || "promptpay", 80) || "promptpay";
    const reviewReason = text8(body.review_reason, 600);
    const reviewActor = text8(body.review_actor || "internal_admin_owner", 120);
    const contextSource = code7(body.context_source);
    const memberId = text8(body.member_id, 120);
    const memberRecordId = recordId2(body.member_record_id);
    const clientRecordId = recordId2(body.client_record_id);
    const renewalRecordId = recordId2(body.renewal_record_id);
    const renewalSessionId = text8(body.renewal_session_id, 180);
    const lineUserId = lineId(body.line_user_id);
    const emailLessRecovery = paymentStage === "membership" && contextSource === RECOVERY_CONTEXT && !memberEmail;
    if (source !== REVIEW_SOURCE && source !== LINE_OFC_SOURCE) throw httpError(400, "invalid_payment_review_source");
    if (source === LINE_OFC_SOURCE && (!lineOfcAuthed || paymentStage !== "membership")) {
      throw httpError(403, "line_ofc_membership_settlement_only");
    }
    if (decision !== "approved") throw httpError(400, "explicit_approved_decision_required");
    if (!proofId) throw httpError(400, "proof_id_required");
    if (!paymentRef) throw httpError(400, "payment_ref_required");
    if (amountThb == null) throw httpError(400, "amount_thb_required");
    if (reviewReason.length < 5) throw httpError(400, "review_reason_required");
    if (["deposit", "final", "tips", "full", "extension"].includes(paymentStage) && !sessionId) {
      throw httpError(400, "session_id_required_for_service_payment");
    }
    if (paymentStage === "membership" && !memberEmail && !emailLessRecovery) {
      throw httpError(400, "member_email_required_for_membership_payment");
    }
    if (paymentStage === "membership" && !packageCode) throw httpError(400, "package_code_required_for_membership_payment");
    const proof = await loadProof(env, proofId);
    if (!proof) throw httpError(404, "payment_proof_not_found");
    if (evidenceRecordId && evidenceRecordId !== text8(proof.id, 120)) {
      throw httpError(409, "payment_proof_record_mismatch");
    }
    const fields2 = proof.fields || {};
    const note = parseNote2(fields2.note);
    if (note.schema === HISTORICAL_SCHEMA2) {
      throw httpError(409, "historical_proof_requires_historical_review_contract");
    }
    const proofStatus = code7(fields2.status || fields2.verification_status || fields2.payment_status || "pending");
    if (["rejected", "blocked", "revoked"].includes(proofStatus)) {
      throw httpError(409, "payment_proof_not_approvable");
    }
    const proofRef = text8(fields2.payment_ref || fields2.transaction_ref, 180);
    const proofAmount = positiveAmount2(fields2.amount_thb ?? fields2.amount ?? fields2.total_thb);
    if (!proofRef) throw httpError(409, "payment_proof_reference_missing");
    if (proofAmount == null) throw httpError(409, "payment_proof_amount_missing");
    if (proofRef !== paymentRef) throw httpError(409, "payment_proof_reference_mismatch");
    if (Math.abs(proofAmount - amountThb) > 9e-3) throw httpError(409, "payment_proof_amount_mismatch");
    let recovery = null;
    if (emailLessRecovery) {
      recovery = await validateEmailLessRecovery(env, {
        proof,
        amountThb,
        paymentRef,
        packageCode,
        memberId,
        memberRecordId,
        clientRecordId,
        renewalRecordId,
        renewalSessionId,
        lineUserId
      });
    }
    if (!clean12(env.INTERNAL_TOKEN)) throw httpError(503, "payments_internal_token_not_ready");
    const notifyBody = {
      payment_ref: paymentRef,
      payment_stage: paymentStage,
      stage: paymentStage,
      session_id: sessionId || void 0,
      amount_thb: amountThb,
      member_email: memberEmail || void 0,
      package_code: packageCode || void 0,
      payment_method: paymentMethod,
      receipt_url: evidenceUrl(fields2) || void 0,
      paid_at: text8(fields2.paid_at || fields2["Payment Date"], 80) || void 0,
      notes: recovery ? `${source} proof_id=${proofId}; reviewed_by=${reviewActor}; recovered_member_id=${recovery.member_id}; line_identity=${recovery.line_user_id}` : `${source} proof_id=${proofId}; reviewed_by=${reviewActor}`
    };
    const response = await notifyTrusted(notifyBody, { request: request2, env, ctx });
    const payload = await response.clone().json().catch(() => ({}));
    if (!response.ok || payload?.ok !== true) return response;
    let materialization = null;
    if (recovery) {
      materialization = await materializeRecoveredMembership(env, {
        ...recovery,
        proof,
        payment_ref: paymentRef,
        package_code: packageCode,
        amount_thb: amountThb,
        review_actor: reviewActor
      });
    }
    let proofVerification = {
      ok: true,
      verified: recovery ? true : code7(fields2.status || fields2.verification_status) === "verified",
      duplicate: recovery ? false : code7(fields2.status || fields2.verification_status) === "verified"
    };
    if (!recovery && !proofVerification.verified) {
      proofVerification = await airtableUpdate(env, proofTable(env), proof.id, {
        status: "verified",
        verified_at: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
        verified_by: "payments-worker"
      }).then(() => ({
        ok: true,
        verified: true,
        duplicate: false
      })).catch((error2) => ({
        ok: false,
        verified: false,
        duplicate: false,
        error: clean12(error2?.message || error2 || "proof_verification_write_failed")
      }));
    }
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store, private");
    headers.set("x-mmd-payment-authority", "payments-worker");
    return new Response(JSON.stringify({
      ...payload,
      ok: true,
      authority: "payments-worker",
      payment_review_console: source === REVIEW_SOURCE,
      line_ofc_payment_ingress: source === LINE_OFC_SOURCE,
      proof_id: proofId,
      evidence_record_id: proof.id,
      paid_at: notifyBody.paid_at || payload.paid_at || null,
      context_source: recovery ? RECOVERY_CONTEXT : contextSource || void 0,
      recovery_context: Boolean(recovery),
      entitlement_materialized: Boolean(materialization?.entitlement_record_id),
      entitlement_record_id: materialization?.entitlement_record_id || void 0,
      membership_expire_at: materialization?.expire_at || void 0,
      membership_term: materialization?.membership_term || void 0,
      membership_expiry_rule: materialization?.membership_expiry_rule || void 0,
      membership_promotion: materialization?.promotion || void 0,
      downstream_access_reconcile_required: Boolean(materialization),
      proof_verification: proofVerification,
      proof_reconciled: proofVerification.verified === true,
      proof_reconcile_failed: proofVerification.ok === false
    }), { status: response.status, headers });
  } catch (error2) {
    return json9({
      ok: false,
      error: clean12(error2?.message || error2 || "payment_review_failed"),
      authority: "payments-worker"
    }, Number(error2?.status || 500));
  }
}
__name(handleReviewedProof, "handleReviewedProof");
async function validateEmailLessRecovery(env, input) {
  const expectedPrices = RECOVERY_PRICE[input.packageCode];
  if (!expectedPrices || !expectedPrices.has(input.amountThb)) throw httpError(409, "recovery_package_amount_mismatch");
  if (!input.memberId || !input.memberRecordId || !input.clientRecordId || !input.renewalRecordId || !input.lineUserId) {
    throw httpError(409, "recovery_identity_context_incomplete");
  }
  const [member, client, renewal] = await Promise.all([
    airtableGet(env, membersTable(env), input.memberRecordId),
    airtableGet(env, clientsTable(env), input.clientRecordId),
    airtableGet(env, renewalTable(env), input.renewalRecordId)
  ]);
  const mf = member.fields || {};
  if (isProtectedPrivateMembership(mf["Membership Tier"] || mf.tier)) throw httpError(409, "recovery_protected_membership_manual_review_required");
  const cf = client.fields || {};
  const rf = renewal.fields || {};
  if (lineId(mf.line_id) !== input.lineUserId) throw httpError(409, "recovery_member_line_mismatch");
  if (lineId(cf.line_user_id) !== input.lineUserId) throw httpError(409, "recovery_client_line_mismatch");
  if (lineId(rf.line_user_id) !== input.lineUserId) throw httpError(409, "recovery_renewal_line_mismatch");
  if (text8(mf.member_id, 120) !== input.memberId) throw httpError(409, "recovery_member_id_mismatch");
  if (canonicalPackage(rf.requested_package || rf.package_code) !== input.packageCode) throw httpError(409, "recovery_package_mismatch");
  const renewalAmount = positiveAmount2(rf.renewal_amount_thb ?? rf.amount_thb);
  if (renewalAmount == null || Math.abs(renewalAmount - input.amountThb) > 9e-3) throw httpError(409, "recovery_renewal_amount_mismatch");
  if (input.renewalSessionId && text8(rf.renewal_session_id, 180) !== input.renewalSessionId) throw httpError(409, "recovery_renewal_session_mismatch");
  const proofMembers = linkedIds(input.proof.fields?.member || input.proof.fields?.Member);
  if (proofMembers.length !== 1 || proofMembers[0] !== member.id) throw httpError(409, "recovery_proof_member_mismatch");
  const renewalClients = linkedIds(rf.Client || rf.client);
  if (renewalClients.length !== 1 || renewalClients[0] !== client.id) throw httpError(409, "recovery_renewal_client_mismatch");
  return {
    member_id: input.memberId,
    member_record_id: member.id,
    client_record_id: client.id,
    renewal_record_id: renewal.id,
    renewal_session_id: text8(rf.renewal_session_id, 180),
    line_user_id: input.lineUserId
  };
}
__name(validateEmailLessRecovery, "validateEmailLessRecovery");
async function materializeRecoveredMembership(env, input) {
  const existing = await airtableList(env, entitlementsTable(env), {
    filterByFormula: `{payment_ref}='${formulaValue(input.payment_ref)}'`,
    maxRecords: 2
  });
  if (existing.length > 1) throw httpError(409, "recovery_entitlement_payment_ref_ambiguous");
  const paidAtRaw = text8(input.proof.fields?.paid_at || input.proof.fields?.["Payment Date"], 80);
  const paidAt = validDate(paidAtRaw);
  if (!paidAt && !existing.length) throw httpError(409, "recovery_canonical_payment_date_required");
  if (existing.length) {
    const row = existing[0];
    if (text8(row.fields?.member_id, 120) !== input.member_id || canonicalPackage(row.fields?.package_code) !== input.package_code || !validDate(row.fields?.expire_at) || lineId(row.fields?.line_user_id) && lineId(row.fields.line_user_id) !== input.line_user_id) throw httpError(409, "recovery_existing_entitlement_conflict");
    const currentRows = await airtableList(env, entitlementsTable(env), {
      filterByFormula: `{member_id}='${formulaValue(input.member_id)}'`,
      maxRecords: 200,
      requireComplete: true
    });
    if (currentRows.some((item) => [item.fields?.entitlement_level, item.fields?.package_code, item.fields?.capability].some(isProtectedPrivateMembership))) throw httpError(409, "recovery_protected_membership_manual_review_required");
    await reconcileRecoveredMembership(env, input, row);
    return { entitlement_record_id: row.id, expire_at: row.fields.expire_at, start_at: row.fields.start_at, membership_expiry_rule: row.fields.membership_expiry_rule, membership_term: row.fields.membership_term, promotion: null, duplicate: true };
  }
  const prior = await airtableList(env, entitlementsTable(env), {
    filterByFormula: `OR({member_id}='${formulaValue(input.member_id)}',{line_user_id}='${formulaValue(input.line_user_id)}')`,
    maxRecords: 200,
    requireComplete: true
  });
  const own = prior.filter((row) => row.fields?.payment_ref !== input.payment_ref && (text8(row.fields?.member_id, 120) === input.member_id || lineId(row.fields?.line_user_id) === input.line_user_id || linkedIds(row.fields?.member).includes(input.member_record_id)));
  if (own.some((row) => [row.fields?.entitlement_level, row.fields?.package_code, row.fields?.capability].some(isProtectedPrivateMembership))) throw httpError(409, "recovery_protected_membership_manual_review_required");
  const exact = own.filter((row) => canonicalPackage(row.fields?.package_code) === input.package_code);
  const expiries = exact.map((row) => validDate(row.fields?.expire_at)).filter(Boolean).sort((a, b) => b - a);
  const timing = privateRenewalTiming(expiries[0]?.toISOString(), paidAt);
  if (!timing?.expiry_known) throw httpError(409, "recovery_canonical_expiry_required");
  if (!timing.active && !timing.expired_within_90_days) throw httpError(409, "renewal_expired_over_90_days_review_required");
  const packages = await airtableList(env, env.AIRTABLE_TABLE_PACKAGES || "tblg2z8dENx75yHka", { filterByFormula: `{code}='${formulaValue(input.package_code)}'`, maxRecords: 2 });
  const catalog = packages.length === 1 ? packages[0].fields : null;
  if (!catalog || catalog.is_active === false || catalog.require_approval === true || Number(catalog.duration_days) !== MEMBERSHIP_YEARS[input.package_code] * 365) throw httpError(409, "recovery_package_term_review_required");
  const expectedAmount = { standard: 1e3, premium: 2500 }[input.package_code];
  if (!(expectedAmount > 0) || input.amount_thb !== expectedAmount) throw httpError(409, "recovery_renewal_price_policy_required");
  const startAt = new Date(timing.start_at);
  const renewalYears = privateRenewalBaseYears(input.package_code);
  const membershipTerm = renewalYears ? {
    expire_at: addBangkokCalendarYears(new Date(startAt), renewalYears),
    membership_term: `${renewalYears}_year`,
    membership_expiry_rule: `${renewalYears}_year_from_${timing.active ? "current_expiry" : "verified_payment"}`
  } : null;
  if (!membershipTerm) throw httpError(409, "recovery_membership_term_invalid");
  const promotion = currentPrivateMembershipPromotion({ package_code: input.package_code, paid_at: paidAt.toISOString(), action: "renewal", existing_member: true, prior_expire_at: expiries[0].toISOString() });
  const promotedExpireAt = applyMembershipPromotion(membershipTerm.expire_at, promotion, { start_at: startAt.toISOString() });
  const expireAt = promotedExpireAt || membershipTerm.expire_at;
  const membershipExpiryRule = promotion?.total_years === 2 ? `2_years_from_${expiries[0] && expiries[0] > paidAt ? "current_expiry" : "verified_payment"}_${promotion.code}` : promotion ? `${membershipTerm.membership_expiry_rule}_plus_${promotion.code}` : membershipTerm.membership_expiry_rule;
  const membershipTermLabel = promotion?.total_years === 2 ? "2_years" : promotion ? `${membershipTerm.membership_term}_plus_${promotion.bonus_years ? `${promotion.bonus_years}_year` : `${promotion.bonus_days}_days`}` : membershipTerm.membership_term;
  const entitlementLevel = input.package_code === "premium" ? "premium" : "standard_basic";
  let entitlement = existing[0] || null;
  if (!entitlement) {
    entitlement = await airtableCreate2(env, entitlementsTable(env), {
      entitlement_id: `pay_${code7(input.payment_ref).slice(0, 80)}_${input.package_code}`.slice(0, 180),
      member: [input.member_record_id],
      member_id: input.member_id,
      client: [input.client_record_id],
      line_user_id: input.line_user_id,
      member_status: input.package_code,
      access_status: "active",
      entitlement_level: entitlementLevel,
      package_code: input.package_code,
      start_at: startAt.toISOString(),
      expire_at: expireAt.toISOString(),
      renewal_status: "renewed",
      membership_expiry_rule: membershipExpiryRule,
      telegram_access_status: "pending_invite",
      source: "renewal",
      source_ref: `payment:${input.payment_ref}`,
      payment_ref: input.payment_ref,
      notes: `Materialized by payments-worker after official reviewed LINE renewal proof; amount=${input.amount_thb}; member_id=${input.member_id}${promotion ? `; promotion=${promotion.code}` : ""}`
    });
  }
  await reconcileRecoveredMembership(env, input, entitlement);
  return {
    entitlement_record_id: entitlement.id,
    start_at: validDate(entitlement.fields?.start_at)?.toISOString() || startAt.toISOString(),
    expire_at: validDate(entitlement.fields?.expire_at)?.toISOString() || expireAt.toISOString(),
    membership_term: membershipTermLabel,
    membership_expiry_rule: membershipExpiryRule,
    promotion
  };
}
__name(materializeRecoveredMembership, "materializeRecoveredMembership");
async function reconcileRecoveredMembership(env, input, entitlement) {
  const packageLabel = input.package_code === "premium" ? "Premium" : "Standard";
  const expiry = validDate(entitlement.fields?.expire_at);
  const [member, currentRows] = await Promise.all([
    airtableGet(env, membersTable(env), input.member_record_id),
    airtableList(env, entitlementsTable(env), {
      filterByFormula: `OR({member_id}='${formulaValue(input.member_id)}',{line_user_id}='${formulaValue(input.line_user_id)}')`,
      maxRecords: 200,
      requireComplete: true
    })
  ]);
  const memberFields = member.fields || {};
  if (text8(memberFields.member_id, 120) !== input.member_id || lineId(memberFields.line_id) !== input.line_user_id) throw httpError(409, "recovery_current_member_identity_mismatch");
  if (isProtectedPrivateMembership(memberFields["Membership Tier"] || memberFields.tier)) throw httpError(409, "recovery_protected_membership_manual_review_required");
  const ownRows = currentRows.filter((row) => text8(row.fields?.member_id, 120) === input.member_id || lineId(row.fields?.line_user_id) === input.line_user_id || linkedIds(row.fields?.member).includes(input.member_record_id));
  const memberBlocked = activationBlocked(memberFields, true);
  const memberWideBlocked = ownRows.some((row) => activationBlocked(row.fields));
  const currentlyActive = expiry && expiry.getTime() > Date.now() && !activationBlocked(entitlement.fields, true) && !memberBlocked && !memberWideBlocked;
  await Promise.all([
    currentlyActive ? airtableUpdate(env, membersTable(env), input.member_record_id, {
      "Membership Tier": packageLabel,
      "Membership Status": "Active"
    }) : Promise.resolve(),
    airtableUpdate(env, renewalTable(env), input.renewal_record_id, {
      renewal_flow_status: "materialized",
      "Member Entitlement": [entitlement.id],
      verified_at: (/* @__PURE__ */ new Date()).toISOString(),
      materialized_at: (/* @__PURE__ */ new Date()).toISOString(),
      reviewed_by: input.review_actor,
      review_note: `Official ${input.amount_thb} THB ${packageLabel} renewal verified by payments-worker; entitlement ${entitlement.id}.`
    }),
    airtableUpdate(env, proofTable(env), input.proof.id, {
      status: "verified",
      verified_at: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      verified_by: "payments-worker"
    })
  ]);
}
__name(reconcileRecoveredMembership, "reconcileRecoveredMembership");
function activationBlocked(fields2 = {}, includeRevoked = false) {
  return [fields2["Membership Status"], fields2.member_status, fields2.member_lifecycle_status, fields2.access_status, fields2.status].some((value3) => ["blocked", "suspended", ...includeRevoked ? ["revoked"] : []].includes(code7(value3)));
}
__name(activationBlocked, "activationBlocked");
async function loadProof(env, proofId) {
  requireAirtable4(env);
  const formula5 = `{proof_id}='${formulaValue(proofId)}'`;
  const records = await airtableList(env, proofTable(env), { filterByFormula: formula5, maxRecords: 2 });
  if (records.length > 1) throw httpError(409, "payment_proof_ambiguous");
  return records[0] || null;
}
__name(loadProof, "loadProof");
async function airtableList(env, tableName, params = {}) {
  const url = new URL(`${AIRTABLE_API12}/${encodeURIComponent(clean12(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const request2 = new Request(url.toString(), { headers: { Authorization: `Bearer ${clean12(env.AIRTABLE_API_KEY)}` } });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  if (params.requireComplete && payload.offset) throw httpError(409, "recovery_entitlement_history_incomplete");
  return payload.records;
}
__name(airtableList, "airtableList");
async function airtableGet(env, tableName, recordIdValue2) {
  requireAirtable4(env);
  const url = `${AIRTABLE_API12}/${encodeURIComponent(clean12(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordIdValue2)}`;
  const request2 = new Request(url, { headers: { Authorization: `Bearer ${clean12(env.AIRTABLE_API_KEY)}` } });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload;
}
__name(airtableGet, "airtableGet");
async function airtableCreate2(env, tableName, fields2) {
  requireAirtable4(env);
  const url = `${AIRTABLE_API12}/${encodeURIComponent(clean12(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`;
  const request2 = new Request(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clean12(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ performUpsert: { fieldsToMergeOn: ["payment_ref"] }, records: [{ fields: fields2 }], typecast: false })
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  const payload = await response.json().catch(() => ({}));
  const record = payload?.records?.[0];
  if (!response.ok || !record?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return record;
}
__name(airtableCreate2, "airtableCreate");
async function airtableUpdate(env, tableName, recordIdValue2, fields2) {
  requireAirtable4(env);
  const url = `${AIRTABLE_API12}/${encodeURIComponent(clean12(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordIdValue2)}`;
  const request2 = new Request(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clean12(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fields2, typecast: false })
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload;
}
__name(airtableUpdate, "airtableUpdate");
function proofTable(env) {
  return clean12(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi");
}
__name(proofTable, "proofTable");
function membersTable(env) {
  return clean12(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || CANONICAL_MEMBERS);
}
__name(membersTable, "membersTable");
function clientsTable(env) {
  return clean12(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CANONICAL_CLIENTS);
}
__name(clientsTable, "clientsTable");
function entitlementsTable(env) {
  return clean12(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || CANONICAL_ENTITLEMENTS);
}
__name(entitlementsTable, "entitlementsTable");
function renewalTable(env) {
  return clean12(env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID || env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || CANONICAL_RENEWALS);
}
__name(renewalTable, "renewalTable");
function requireAirtable4(env) {
  if (!clean12(env.AIRTABLE_API_KEY) || !clean12(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready");
}
__name(requireAirtable4, "requireAirtable");
async function serviceAuthed2(request2, expected) {
  const expectedToken = clean12(expected);
  if (!expectedToken) return false;
  const direct = clean12(request2.headers.get("X-Internal-Token"));
  const bearer = clean12(request2.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  return constantTimeEqual(direct || bearer, expectedToken);
}
__name(serviceAuthed2, "serviceAuthed");
function evidenceUrl(fields2 = {}) {
  for (const value3 of [fields2.receipt_url, fields2.slip_url, fields2.evidence_url, fields2["Receipt Photo"]]) {
    if (typeof value3 === "string" && /^https:\/\//i.test(value3)) return value3.slice(0, 1200);
    if (Array.isArray(value3) && value3[0] && typeof value3[0].url === "string" && /^https:\/\//i.test(value3[0].url)) return value3[0].url.slice(0, 1200);
  }
  return "";
}
__name(evidenceUrl, "evidenceUrl");
function normalizeStage3(value3) {
  const stage2 = code7(value3);
  if (!PAYMENT_STAGES2.has(stage2)) throw httpError(400, "invalid_payment_stage");
  return stage2;
}
__name(normalizeStage3, "normalizeStage");
function canonicalPackage(value3) {
  const v = code7(value3);
  if (v.includes("premium")) return "premium";
  if (v.includes("standard") || v.includes("lite")) return "standard";
  return "";
}
__name(canonicalPackage, "canonicalPackage");
function positiveAmount2(value3) {
  if (value3 == null || clean12(value3) === "") return null;
  const normalized3 = clean12(value3).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized3)) return null;
  const n = Number(normalized3);
  if (!Number.isFinite(n) || n <= 0 || n > 1e7) return null;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
__name(positiveAmount2, "positiveAmount");
function linkedIds(value3) {
  return Array.isArray(value3) ? value3.map((v) => recordId2(v)).filter(Boolean) : [];
}
__name(linkedIds, "linkedIds");
function recordId2(value3) {
  const v = text8(value3, 120);
  return /^rec[A-Za-z0-9]{14}$/.test(v) ? v : "";
}
__name(recordId2, "recordId");
function lineId(value3) {
  const v = text8(value3, 100);
  return /^U[A-Za-z0-9_-]{20,80}$/.test(v) ? v : "";
}
__name(lineId, "lineId");
function validDate(value3) {
  const ms = Date.parse(clean12(value3));
  return Number.isFinite(ms) ? new Date(ms) : null;
}
__name(validDate, "validDate");
function parseNote2(value3) {
  try {
    const parsed = JSON.parse(clean12(value3) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
__name(parseNote2, "parseNote");
function email2(value3) {
  const v = clean12(value3).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
}
__name(email2, "email");
function code7(value3) {
  return clean12(value3).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
}
__name(code7, "code");
function text8(value3, max = 240) {
  return clean12(value3).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}
__name(text8, "text");
function clean12(value3) {
  return String(value3 ?? "").trim();
}
__name(clean12, "clean");
function normalizePath4(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
__name(normalizePath4, "normalizePath");
function jsonHeaders2() {
  return new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private", "X-MMD-Payment-Authority": "payments-worker" });
}
__name(jsonHeaders2, "jsonHeaders");
function json9(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders2() });
}
__name(json9, "json");

// reviewed-proof-canonical-money-truth.js
var AIRTABLE_API13 = "https://api.airtable.com/v0";
var RECOVERY_PRICES = Object.freeze({ standard: /* @__PURE__ */ new Set([499, 799, 1e3]), premium: /* @__PURE__ */ new Set([999, 1999, 2500]) });
function isEmailLessLineRenewalMoneyTruth(body = {}) {
  const stage2 = clean13(body.payment_stage || body.stage || body.payment_type).toLowerCase();
  const memberEmail = clean13(body.member_email || body.email).toLowerCase();
  const notes = clean13(body.notes);
  return stage2 === "membership" && !memberEmail && /(?:^|;\s*)recovered_member_id=[^;\s]+/i.test(notes);
}
__name(isEmailLessLineRenewalMoneyTruth, "isEmailLessLineRenewalMoneyTruth");
async function commitEmailLessLineRenewalMoneyTruth(env = {}, body = {}) {
  try {
    if (!isEmailLessLineRenewalMoneyTruth(body)) {
      return json10({ ok: false, error: "not_email_less_line_renewal_recovery", authority: "payments-worker" }, 400);
    }
    requireAirtable5(env);
    const paymentRef = text9(body.payment_ref || body.transaction_ref, 180);
    const amountThb = positiveAmount3(body.amount_thb ?? body.amount);
    const packageCode = canonicalPackage2(body.package_code || body.package);
    const memberId = recoveredMemberId(body.notes);
    if (!paymentRef) throw httpError(400, "payment_ref_required");
    if (amountThb == null) throw httpError(400, "amount_thb_required");
    if (!packageCode) throw httpError(400, "package_code_required_for_membership_payment");
    if (!memberId) throw httpError(409, "recovered_member_id_required");
    const expectedPrices = RECOVERY_PRICES[packageCode];
    if (!expectedPrices || !expectedPrices.has(amountThb)) {
      throw httpError(409, "recovery_package_amount_mismatch");
    }
    const existing = await findPaymentByCanonicalReference(env, paymentRef);
    if (existing?.id) {
      const existingAmount = positiveAmount3(existing.fields?.Amount ?? existing.fields?.amount_thb ?? existing.fields?.amount);
      if (existingAmount != null && Math.abs(existingAmount - amountThb) > 9e-3) {
        throw httpError(409, "canonical_payment_amount_mismatch");
      }
    }
    const fields2 = canonicalPaymentFields(env, {
      payment_ref: paymentRef,
      amount_thb: amountThb,
      package_code: packageCode,
      payment_method: body.payment_method,
      paid_at: body.paid_at,
      notes: body.notes
    });
    const payment = existing?.id ? await airtableUpdate2(env, paymentsTable(env), existing.id, fields2) : await airtableCreate3(env, paymentsTable(env), fields2);
    let pointsLedger = { ok: true, awarded: false, skipped: true, reason: "points_not_attempted" };
    try {
      pointsLedger = await awardBasePointsPhase1(env, {
        payment_ref: paymentRef,
        stage: "membership",
        amount_thb: amountThb,
        member_id: memberId,
        member_email: ""
      });
    } catch (error2) {
      pointsLedger = {
        ok: false,
        awarded: false,
        error: clean13(error2?.message || error2 || "points_phase1_failed")
      };
    }
    return json10({
      ok: true,
      authority: "payments-worker",
      payment_ref: paymentRef,
      payment_stage: "membership",
      duplicate: Boolean(existing?.id),
      idempotent: Boolean(existing?.id),
      payment_write: {
        ok: true,
        mode: existing?.id ? "update" : "create",
        record_id: payment?.id || existing?.id || null,
        canonical_reference_field: "Payment Reference"
      },
      points_ledger: pointsLedger
    });
  } catch (error2) {
    return json10({
      ok: false,
      error: clean13(error2?.message || error2 || "canonical_payment_write_failed"),
      authority: "payments-worker"
    }, Number(error2?.status || 500));
  }
}
__name(commitEmailLessLineRenewalMoneyTruth, "commitEmailLessLineRenewalMoneyTruth");
function canonicalPaymentFields(env, input) {
  const fields2 = {};
  put2(fields2, env.AT_PAYMENTS__PAYMENT_REF || "Payment Reference", input.payment_ref);
  put2(fields2, env.AT_PAYMENTS__PAYMENT_DATE || "Payment Date", paymentDate(input.paid_at));
  put2(fields2, env.AT_PAYMENTS__AMOUNT || "Amount", input.amount_thb);
  put2(fields2, env.AT_PAYMENTS__PAYMENT_STATUS || "Payment Status", "Paid");
  put2(fields2, env.AT_PAYMENTS__PAYMENT_METHOD || "Payment Method", canonicalPaymentMethod(input.payment_method));
  put2(fields2, env.AT_PAYMENTS__NOTES || "Notes", reviewedNote(input.notes, input.payment_ref));
  put2(fields2, env.AT_PAYMENTS__VERIFICATION_STATUS || "Verification Status", "verified");
  put2(fields2, env.AT_PAYMENTS__PAYMENT_INTENT_STATUS || "Payment Intent Status (AI)", "Confirmed");
  put2(fields2, env.AT_PAYMENTS__PACKAGE_CODE || "Package Code", input.package_code);
  put2(fields2, env.AT_PAYMENTS__CREATED_AT || "Created At", (/* @__PURE__ */ new Date()).toISOString());
  return fields2;
}
__name(canonicalPaymentFields, "canonicalPaymentFields");
async function findPaymentByCanonicalReference(env, paymentRef) {
  const formula5 = `{Payment Reference}='${formulaValue(paymentRef)}'`;
  const url = new URL(`${AIRTABLE_API13}/${encodeURIComponent(clean13(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(paymentsTable(env))}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", formula5);
  const payload = await airtableRequest4(env, url.toString(), { method: "GET" });
  const records = Array.isArray(payload.records) ? payload.records : [];
  if (records.length > 1) throw httpError(409, "canonical_payment_reference_ambiguous");
  return records[0] || null;
}
__name(findPaymentByCanonicalReference, "findPaymentByCanonicalReference");
async function airtableCreate3(env, table7, fields2) {
  const url = `${AIRTABLE_API13}/${encodeURIComponent(clean13(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table7)}`;
  const payload = await airtableRequest4(env, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields: fields2 }], typecast: false })
  });
  const record = payload?.records?.[0];
  if (!record?.id) throw httpError(502, "airtable_payment_create_malformed");
  return record;
}
__name(airtableCreate3, "airtableCreate");
async function airtableUpdate2(env, table7, recordId3, fields2) {
  const url = `${AIRTABLE_API13}/${encodeURIComponent(clean13(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table7)}/${encodeURIComponent(recordId3)}`;
  const payload = await airtableRequest4(env, url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fields2, typecast: false })
  });
  if (!payload?.id) throw httpError(502, "airtable_payment_update_malformed");
  return payload;
}
__name(airtableUpdate2, "airtableUpdate");
async function airtableRequest4(env, url, init = {}) {
  const request2 = new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean13(env.AIRTABLE_API_KEY)}`,
      ...init.headers || {}
    }
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = clean13(payload?.error?.message || payload?.error?.type || `airtable_${response.status}`);
    throw httpError(response.status || 502, `airtable_${response.status}:${detail}`);
  }
  return payload;
}
__name(airtableRequest4, "airtableRequest");
function paymentsTable(env) {
  return clean13(env.AIRTABLE_TABLE_PAYMENTS || env.AIRTABLE_TABLE_PAYMENTS_ID || "tblWGGJJOx5eBvBZJ");
}
__name(paymentsTable, "paymentsTable");
function recoveredMemberId(notes) {
  const match = clean13(notes).match(/(?:^|;\s*)recovered_member_id=([^;\s]+)/i);
  return text9(match?.[1], 120);
}
__name(recoveredMemberId, "recoveredMemberId");
function reviewedNote(notes, paymentRef) {
  const base = text9(notes, 1200);
  const marker = `official_reviewed_recovery=true; payment_ref=${paymentRef}`;
  return base ? `${base}; ${marker}` : marker;
}
__name(reviewedNote, "reviewedNote");
function paymentDate(value3) {
  const raw = clean13(value3);
  const direct = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1];
  if (direct) return direct;
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
__name(paymentDate, "paymentDate");
function canonicalPaymentMethod(value3) {
  const raw = clean13(value3).toLowerCase();
  if (raw.includes("prompt")) return "PromptPay";
  if (raw.includes("bank")) return "Bank Transfer";
  if (raw.includes("credit")) return "Credit Card";
  if (raw.includes("cash")) return "Cash";
  return "Other";
}
__name(canonicalPaymentMethod, "canonicalPaymentMethod");
function canonicalPackage2(value3) {
  const raw = clean13(value3).toLowerCase();
  if (raw.includes("premium")) return "premium";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  return "";
}
__name(canonicalPackage2, "canonicalPackage");
function positiveAmount3(value3) {
  if (value3 == null || clean13(value3) === "") return null;
  const normalized3 = clean13(value3).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized3)) return null;
  const amount3 = Number(normalized3);
  if (!Number.isFinite(amount3) || amount3 <= 0 || amount3 > 1e7) return null;
  return Math.round((amount3 + Number.EPSILON) * 100) / 100;
}
__name(positiveAmount3, "positiveAmount");
function put2(fields2, key, value3) {
  const field7 = clean13(key);
  if (!field7 || value3 === void 0 || value3 === null || value3 === "") return;
  fields2[field7] = value3;
}
__name(put2, "put");
function requireAirtable5(env) {
  if (!clean13(env.AIRTABLE_API_KEY) || !clean13(env.AIRTABLE_BASE_ID) || !paymentsTable(env)) {
    throw httpError(503, "airtable_not_ready");
  }
}
__name(requireAirtable5, "requireAirtable");
function text9(value3, max = 240) {
  return clean13(value3).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}
__name(text9, "text");
function clean13(value3) {
  return String(value3 ?? "").trim();
}
__name(clean13, "clean");
function json10(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-MMD-Payment-Authority": "payments-worker"
    }
  });
}
__name(json10, "json");

// ../shared/sigil-membership-payment-components.mjs
var MARKER = "[MMD_MEMBERSHIP_ACTION_V1]";
var VERSION = "membership_action_v1";
function parseSigilMembershipPaymentComponents(note, expectedCustomerTotal = null) {
  const raw = clean14(note);
  const markerAt = raw.indexOf(MARKER);
  if (markerAt < 0) return null;
  const jsonStart = markerAt + MARKER.length;
  const jsonText = raw.slice(jsonStart).split("\n", 1)[0].trim();
  let action;
  try {
    action = JSON.parse(jsonText);
  } catch (_) {
    throw moneyError("sigil_membership_action_marker_invalid_json");
  }
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw moneyError("sigil_membership_action_marker_invalid");
  }
  if (clean14(action.version) !== VERSION) throw moneyError("sigil_membership_action_version_invalid");
  if (clean14(action.type) !== "renew") throw moneyError("sigil_membership_action_type_invalid");
  if (clean14(action.source) !== "sigil_jobs") throw moneyError("sigil_membership_action_source_invalid");
  if (clean14(action.state) !== "pending_official_verify") throw moneyError("sigil_membership_action_state_invalid");
  if (clean14(action.materialization_policy) !== "official_verify_required") {
    throw moneyError("sigil_membership_action_materialization_policy_invalid");
  }
  if (action.entitlement_mutation_allowed !== false) {
    throw moneyError("sigil_membership_action_entitlement_boundary_invalid");
  }
  if (action.points_eligible !== false || action.service_spend_eligible !== false || action.referral_reward_eligible !== false) {
    throw moneyError("sigil_membership_action_reward_boundary_invalid");
  }
  const serviceAmountThb = positiveMoney(action.service_amount_thb, "sigil_service_amount_invalid");
  const renewalAmountThb = positiveMoney(action.renewal_amount_thb, "sigil_renewal_amount_invalid");
  const customerTotalThb = positiveMoney(action.customer_total_thb, "sigil_customer_total_invalid");
  const includeInPayment = action.include_in_payment === true;
  const expectedTotal = includeInPayment ? serviceAmountThb + renewalAmountThb : serviceAmountThb;
  if (!sameMoney(customerTotalThb, expectedTotal)) throw moneyError("sigil_membership_action_total_mismatch");
  const expected = optionalPositiveMoney(expectedCustomerTotal);
  if (expected != null && !sameMoney(customerTotalThb, expected)) {
    throw moneyError("sigil_membership_action_payment_amount_mismatch");
  }
  return Object.freeze({
    version: VERSION,
    type: "renew",
    source: "sigil_jobs",
    include_in_payment: includeInPayment,
    service_amount_thb: serviceAmountThb,
    membership_renewal_amount_thb: renewalAmountThb,
    customer_total_thb: customerTotalThb,
    points_eligible_amount_thb: serviceAmountThb,
    service_spend_amount_thb: serviceAmountThb,
    referral_reward_eligible_amount_thb: serviceAmountThb,
    membership_fee_points_eligible: false,
    membership_fee_service_spend_eligible: false,
    membership_fee_referral_reward_eligible: false,
    state: "pending_official_verify",
    materialization_policy: "official_verify_required"
  });
}
__name(parseSigilMembershipPaymentComponents, "parseSigilMembershipPaymentComponents");
function positiveMoney(value3, code15) {
  const amount3 = optionalPositiveMoney(value3);
  if (amount3 == null) throw moneyError(code15);
  return amount3;
}
__name(positiveMoney, "positiveMoney");
function optionalPositiveMoney(value3) {
  if (value3 == null || clean14(value3) === "") return null;
  const amount3 = Number(clean14(value3).replace(/,/g, ""));
  if (!Number.isFinite(amount3) || amount3 <= 0 || amount3 > 1e7) return null;
  return Math.round((amount3 + Number.EPSILON) * 100) / 100;
}
__name(optionalPositiveMoney, "optionalPositiveMoney");
function sameMoney(a, b) {
  return Math.abs(Number(a) - Number(b)) <= 9e-3;
}
__name(sameMoney, "sameMoney");
function clean14(value3) {
  return String(value3 ?? "").trim();
}
__name(clean14, "clean");
function moneyError(message, status = 409) {
  const error2 = new Error(message);
  error2.status = status;
  return error2;
}
__name(moneyError, "moneyError");

// sigil-membership-payment-components.js
var AIRTABLE_API14 = "https://api.airtable.com/v0";
var MARKER2 = "[MMD_MEMBERSHIP_ACTION_V1]";
var VERSION2 = "membership_action_v1";
var DEFAULT_TABLES = Object.freeze({
  sessions: "tblC98mKWbzmPuNzX",
  payments: "tblWGGJJOx5eBvBZJ"
});
var DEFAULT_FIELDS = Object.freeze({
  sessionAmountThb: "fldhwC79ndbnEXSZz",
  paymentAmount: "fldvCSwrUW8OMAooS",
  paymentNotes: "fldjsZIKoJPawlb2u"
});
async function reconcileSigilConfirmLinkMoneyTruth(request2, response, env = {}) {
  if (!response || response.status < 200 || response.status >= 300) return response;
  const body = await request2.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return response;
  const note = clean15(body.note || body.notes);
  if (!note.includes(MARKER2)) return response;
  let components;
  try {
    components = parseSigilMembershipPaymentComponents(note, body.amount_thb ?? body.amount);
  } catch (error2) {
    return json11({ ok: false, authority: "payments-worker", error: clean15(error2?.message || error2) }, Number(error2?.status || 409));
  }
  if (!components) return response;
  const payload = await response.clone().json().catch(() => null);
  if (payload?.schema === "canonical_confirm_link_v1" && payload?.pricing_breakdown?.version === VERSION2) return response;
  const sessionId = clean15(payload?.session_id || payload?.sessionId);
  if (!sessionId) {
    return json11({ ok: false, authority: "payments-worker", error: "sigil_membership_action_session_id_missing" }, 502);
  }
  try {
    await patchSessionServiceAmount(env, sessionId, components.service_amount_thb);
  } catch (error2) {
    return json11({
      ok: false,
      authority: "payments-worker",
      error: clean15(error2?.message || error2 || "sigil_session_service_amount_reconcile_failed")
    }, Number(error2?.status || 502));
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("x-mmd-payment-components", VERSION2);
  return new Response(JSON.stringify({
    ...payload,
    pricing_breakdown: components
  }), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(reconcileSigilConfirmLinkMoneyTruth, "reconcileSigilConfirmLinkMoneyTruth");
async function resolveSigilCombinedPaymentComponents(env = {}, paymentRef = "", expectedCustomerTotal = null) {
  const ref = clean15(paymentRef);
  if (!ref) return null;
  requireAirtable6(env);
  const payment = await findOne(env, paymentsTable2(env), "Payment Reference", ref);
  if (!payment) return null;
  const fields2 = payment.fields || {};
  const notes = first(fields2, [
    "Notes",
    "notes",
    field4(env.AT_PAYMENTS__NOTES, DEFAULT_FIELDS.paymentNotes)
  ]);
  if (!clean15(notes).includes(MARKER2)) return null;
  const paymentAmount = positiveMoney2(first(fields2, [
    "Amount",
    "amount_thb",
    "amount",
    field4(env.AT_PAYMENTS__AMOUNT, DEFAULT_FIELDS.paymentAmount)
  ]), "canonical_payment_amount_invalid");
  const expected = optionalPositiveMoney2(expectedCustomerTotal);
  if (expected != null && !sameMoney2(paymentAmount, expected)) throw moneyError2("canonical_payment_amount_mismatch");
  const components = parseSigilMembershipPaymentComponents(notes, paymentAmount);
  if (!components?.include_in_payment) return null;
  return components;
}
__name(resolveSigilCombinedPaymentComponents, "resolveSigilCombinedPaymentComponents");
async function enforceSigilSessionServiceAmount(env = {}, sessionId = "", components = null) {
  if (!components || !clean15(sessionId)) return;
  await patchSessionServiceAmount(env, sessionId, components.service_amount_thb);
}
__name(enforceSigilSessionServiceAmount, "enforceSigilSessionServiceAmount");
async function patchSessionServiceAmount(env, sessionId, serviceAmountThb) {
  requireAirtable6(env);
  const session = await findOne(env, sessionsTable(env), "session_id", sessionId);
  if (!session?.id) throw moneyError2("canonical_session_not_found", 409);
  const amountField = field4(env.AT_SESSIONS__AMOUNT_THB, DEFAULT_FIELDS.sessionAmountThb);
  await airtableRequest5(env, `${encodeURIComponent(sessionsTable(env))}/${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { [amountField]: serviceAmountThb }, typecast: false })
  });
}
__name(patchSessionServiceAmount, "patchSessionServiceAmount");
async function findOne(env, table7, fieldName, value3) {
  const url = new URL(`${AIRTABLE_API14}/${encodeURIComponent(clean15(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table7)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{${fieldName}}='${formulaValue(value3)}'`);
  const payload = await airtableRequest5(env, url.toString(), { method: "GET" }, true);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (records.length > 1) throw moneyError2(`airtable_${safeCode(fieldName)}_ambiguous`, 409);
  return records[0] || null;
}
__name(findOne, "findOne");
async function airtableRequest5(env, pathOrUrl, init = {}, absolute = false) {
  requireAirtable6(env);
  const url = absolute ? pathOrUrl : `${AIRTABLE_API14}/${encodeURIComponent(clean15(env.AIRTABLE_BASE_ID))}/${pathOrUrl}`;
  const request2 = new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean15(env.AIRTABLE_API_KEY)}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = clean15(payload?.error?.message || payload?.error?.type || `HTTP ${response.status}`);
    throw moneyError2(`airtable_${response.status}:${detail}`, response.status || 502);
  }
  return payload;
}
__name(airtableRequest5, "airtableRequest");
function sessionsTable(env) {
  return clean15(env.AIRTABLE_TABLE_SESSIONS) || DEFAULT_TABLES.sessions;
}
__name(sessionsTable, "sessionsTable");
function paymentsTable2(env) {
  return clean15(env.AIRTABLE_TABLE_PAYMENTS) || DEFAULT_TABLES.payments;
}
__name(paymentsTable2, "paymentsTable");
function requireAirtable6(env) {
  if (!clean15(env.AIRTABLE_BASE_ID) || !clean15(env.AIRTABLE_API_KEY)) throw moneyError2("airtable_not_ready", 503);
}
__name(requireAirtable6, "requireAirtable");
function field4(value3, fallback) {
  return clean15(value3) || fallback;
}
__name(field4, "field");
function first(fields2, keys) {
  for (const key of keys) {
    if (key && fields2[key] !== void 0 && fields2[key] !== null && fields2[key] !== "") return fields2[key];
  }
  return void 0;
}
__name(first, "first");
function positiveMoney2(value3, code15) {
  const amount3 = optionalPositiveMoney2(value3);
  if (amount3 == null) throw moneyError2(code15);
  return amount3;
}
__name(positiveMoney2, "positiveMoney");
function optionalPositiveMoney2(value3) {
  if (value3 == null || clean15(value3) === "") return null;
  const amount3 = Number(clean15(value3).replace(/,/g, ""));
  if (!Number.isFinite(amount3) || amount3 <= 0 || amount3 > 1e7) return null;
  return Math.round((amount3 + Number.EPSILON) * 100) / 100;
}
__name(optionalPositiveMoney2, "optionalPositiveMoney");
function sameMoney2(a, b) {
  return Math.abs(Number(a) - Number(b)) <= 9e-3;
}
__name(sameMoney2, "sameMoney");
function safeCode(value3) {
  return clean15(value3).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 100);
}
__name(safeCode, "safeCode");
function clean15(value3) {
  return String(value3 ?? "").trim();
}
__name(clean15, "clean");
function moneyError2(message, status = 409) {
  const error2 = new Error(message);
  error2.status = status;
  return error2;
}
__name(moneyError2, "moneyError");
function json11(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-MMD-Payment-Authority": "payments-worker"
    }
  });
}
__name(json11, "json");

// canonical-confirm-link.js
var AIRTABLE_API15 = "https://api.airtable.com/v0";
var CONFIRM_LINK_PATH = "/v1/confirm/link";
var DEFAULT_TABLES2 = Object.freeze({
  sessions: "tblC98mKWbzmPuNzX",
  payments: "tblWGGJJOx5eBvBZJ"
});
var SESSION_FIELDS3 = Object.freeze({
  sessionStatus: "fldmwuvOaiCFdzzRa",
  sessionId: "fldLTq2kZbyRv22IA",
  createdAt: "flduULqxy2FIuJuaf",
  amountThb: "fldhwC79ndbnEXSZz",
  paymentRef: "fldojgjSQLaO0uQLX",
  paymentStatus: "fldTY5lE6m0kQf72n",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  jobType: "fldjK3U9bghnj7xUe",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  googleMapUrl: "fldoUDQ8sH93idPx0",
  note: "fldEcDkF7CH9VixWM",
  notes: "fldwl9Gs5tYlXG5ls",
  payModelThb: "fldlTO5aNfqUmlNWm",
  travelFeeThb: "fld703jI4zQ0CYMHh",
  modelTravelFeeThb: "fldqYkGm9Vd3P366W",
  customerConfirmationUrl: "fldi9ZdoiUXzSv1rI",
  modelConfirmationUrl: "fld0mFma9J9yfEaKb"
});
var PAYMENT_FIELDS2 = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  sessionId: "fld2wdhBvc8xrV6y5",
  amount: "fldvCSwrUW8OMAooS",
  paymentStatus: "fldEJ1hmm7KwWuI6q",
  paymentMethod: "fldsblzIn0wzan3c9",
  notes: "fldjsZIKoJPawlb2u",
  paymentIntentStatus: "fld04fr3bRJTohO6y",
  verificationStatus: "fldJ7a0Ube9F0bmRy",
  createdAt: "flduxcPpowBxEZSLu",
  paymentStage: "fldrr9g8ZZjqAbdKQ",
  paymentType: "fldydUWHhqVLMkNSC",
  needsBillingReview: "fld42LJQsJZgnbNnL",
  depositStatus: "fldD0mQWTfdmyBAeT"
});
var PAYMENT_STAGES3 = /* @__PURE__ */ new Set(["deposit", "final", "tips", "full", "membership"]);
var PAYMENT_TYPES = /* @__PURE__ */ new Set(["deposit", "final", "tips", "full"]);
var CUSTOMER_DEPOSIT_PERCENT = 30;
var CUSTOMER_DEPOSIT_ROUND_STEP_THB = 1;
function computeFixedCustomerDeposit(serviceAmountThb) {
  const total = Number(serviceAmountThb);
  if (!Number.isFinite(total) || total <= 0) return 0;
  const raw = total * CUSTOMER_DEPOSIT_PERCENT / 100;
  return Math.min(total, Math.ceil(raw));
}
__name(computeFixedCustomerDeposit, "computeFixedCustomerDeposit");
function isCanonicalConfirmLinkRequest(path, method) {
  return String(method || "").toUpperCase() === "POST" && normalizePath5(path) === CONFIRM_LINK_PATH;
}
__name(isCanonicalConfirmLinkRequest, "isCanonicalConfirmLinkRequest");
async function handleCanonicalConfirmLink(request2, env) {
  if (!await serviceAuthed3(request2, env)) {
    return json12(request2, env, { ok: false, error: "service_auth_required" }, 401);
  }
  let body = await request2.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json12(request2, env, { ok: false, error: "invalid_confirm_link_request" }, 400);
  }
  if (body.operational_status === "pending_client_link" && body.held_job && typeof body.held_job === "object" && !Array.isArray(body.held_job)) {
    body = { ...body.held_job, operational_status: "pending_client_link" };
  }
  let attemptedWrite = null;
  try {
    requireAirtable7(env);
    const sessionId = text10(body.session_id || makeId("sess"), 180);
    const held = body.operational_status === "pending_client_link";
    const paymentRef = held ? null : text10(body.payment_ref || makeId("pay"), 180);
    const clientName = requiredText(body.client_name, "client_name", 240);
    const modelName = requiredText(body.model_name, "model_name", 240);
    const jobType = requiredText(body.job_type, "job_type", 180);
    const jobDate = canonicalDate(body.job_date, "job_date");
    const startRaw = requiredText(body.start_time, "start_time", 80);
    const endRaw = requiredText(body.end_time, "end_time", 80);
    const locationName = requiredText(body.location_name, "location_name", 300);
    const googleMapUrl = text10(body.google_map_url, 1e3);
    const amountThb = positiveNumber(body.amount_thb ?? body.amount, "amount_thb");
    const travelFeeThb = optionalNonNegativeNumber(body.travel_fee_thb, "travel_fee_thb") ?? 0;
    const modelTravelFeeThb = optionalNonNegativeNumber(body.model_travel_fee_thb, "model_travel_fee_thb") ?? 0;
    const originalAmountCandidate = optionalNonNegativeNumber(
      body.original_amount_thb ?? body.payment_original_amount_thb,
      "original_amount_thb"
    );
    const originalAmountThb = originalAmountCandidate != null && originalAmountCandidate >= amountThb ? originalAmountCandidate : amountThb;
    const pricingAdjustment = clean16(body.pricing_adjustment).toLowerCase();
    const discountThb = Math.max(0, originalAmountThb - amountThb);
    const discountMode = discountThb > 0 && pricingAdjustment === "discount" ? "amount" : "none";
    const payModelThb = optionalNonNegativeNumber(
      body.pay_model_thb ?? body.pay_model ?? body.model_pay_thb ?? body.model_pay,
      "pay_model_thb"
    );
    const paymentStage = normalizeStage4(body.payment_type || body.payment_stage || "deposit");
    const paymentMethod = canonicalPaymentMethod2(body.payment_method || "promptpay");
    const note = clean16(body.note || body.notes).replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ").slice(0, 4e3);
    const components = parseSigilMembershipPaymentComponents(note, amountThb);
    const serviceAmountThb = body.service_amount_thb != null ? positiveNumber(body.service_amount_thb, "service_amount_thb") : components?.service_amount_thb ?? amountThb;
    if (components && components.service_amount_thb !== serviceAmountThb) {
      throw httpError(400, "service_amount_component_mismatch");
    }
    const minimumDepositThb = computeFixedCustomerDeposit(serviceAmountThb);
    let selectedDepositThb = minimumDepositThb;
    if (paymentStage === "deposit") {
      if (body.deposit_percent != null) {
        const requestedPercent = Number(body.deposit_percent);
        if (!Number.isFinite(requestedPercent) || requestedPercent <= 0 || requestedPercent > 100) {
          throw httpError(400, "invalid_deposit_percent");
        }
        if (body.deposit_amount_thb == null) {
          selectedDepositThb = Math.min(serviceAmountThb, Math.max(1, Math.ceil(serviceAmountThb * requestedPercent / 100)));
        }
      }
      if (body.deposit_amount_thb != null) {
        selectedDepositThb = positiveNumber(body.deposit_amount_thb, "deposit_amount_thb");
      }
      if (selectedDepositThb > serviceAmountThb) throw httpError(400, "deposit_exceeds_service_amount");
    }
    const selectedDepositPercent = paymentStage === "deposit" ? Number((selectedDepositThb / serviceAmountThb * 100).toFixed(2)) : null;
    const depositBelowMinimum = paymentStage === "deposit" && selectedDepositThb < minimumDepositThb;
    const depositShortfallThb = depositBelowMinimum ? Math.max(0, minimumDepositThb - selectedDepositThb) : 0;
    const selectedBalanceThb = Math.max(0, serviceAmountThb - selectedDepositThb);
    const pricing = paymentStage === "deposit" ? {
      full_price_thb: Math.max(originalAmountThb, serviceAmountThb),
      discount_mode: discountMode,
      discount_percent: null,
      discount_thb: discountMode === "amount" ? discountThb : 0,
      net_price_thb: serviceAmountThb,
      deposit_basis_thb: serviceAmountThb,
      deposit_minimum_percent: CUSTOMER_DEPOSIT_PERCENT,
      deposit_minimum_thb: minimumDepositThb,
      deposit_percent: selectedDepositPercent,
      deposit_due_thb: selectedDepositThb,
      deposit_received_thb: 0,
      deposit_below_minimum: depositBelowMinimum,
      deposit_shortfall_thb: depositShortfallThb,
      balance_thb: selectedBalanceThb,
      deposit_round_step_thb: CUSTOMER_DEPOSIT_ROUND_STEP_THB,
      deposit_rounding: "ceil_to_baht"
    } : null;
    const pricingMarker = pricing ? `[SIGIL Pricing v1] ${JSON.stringify(pricing)}` : "";
    const noteWithPricing = pricingMarker && !note.includes("[SIGIL Pricing v1]") ? [note, pricingMarker].filter(Boolean).join("\n").slice(0, 4e3) : note;
    const storedNote = held ? `[MMD_JOB_HOLD_V1] ${JSON.stringify({ status: "pending_client_link", confirmation_hold: true, dispatch_hold: true, entitlement_release_hold: true })}
${noteWithPricing}`.slice(0, 4e3) : noteWithPricing;
    const createdAt = (/* @__PURE__ */ new Date()).toISOString();
    const { startAt, endAt } = canonicalJobWindow(jobDate, startRaw, endRaw);
    const issuedAt = Math.floor(Date.now() / 1e3);
    const expiresAt = issuedAt + getConfirmTokenTtlSeconds(env);
    const signingSecret3 = clean16(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY);
    if (!held && !signingSecret3) throw httpError(503, "missing_payment_confirmation_signing_secret");
    const customerClaims = {
      kind: "customer_confirm",
      role: "customer",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentStage,
      iat: issuedAt,
      exp: expiresAt
    };
    const modelClaims = {
      kind: "model_confirm",
      role: "model",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentStage,
      iat: issuedAt,
      exp: expiresAt
    };
    const customerToken = held ? null : await signConfirmToken(customerClaims, signingSecret3);
    const modelToken = held ? null : await signConfirmToken(modelClaims, signingSecret3);
    const webBase = clean16(env.WEB_BASE_URL || "https://mmdbkk.com").replace(/\/+$/, "");
    const customerPage = absoluteUrl(body.confirm_page || "/confirm/job-confirmation", webBase);
    const modelPage = absoluteUrl(body.model_confirm_page || "/confirm/job-model", webBase);
    const customerConfirmationUrl = held ? void 0 : `${customerPage}?t=${encodeURIComponent(customerToken)}`;
    const modelConfirmationUrl = held ? void 0 : `${modelPage}?t=${encodeURIComponent(modelToken)}`;
    const customerPaymentUrl = held ? void 0 : `${webBase}/sigil/pay?t=${encodeURIComponent(customerToken)}`;
    const sessionFields2 = compact6({
      [field5(env.AT_SESSIONS__SESSION_ID, SESSION_FIELDS3.sessionId)]: sessionId,
      [SESSION_FIELDS3.sessionStatus]: "Pending",
      [field5(env.AT_SESSIONS__PAYMENT_STATUS, SESSION_FIELDS3.paymentStatus)]: "pending",
      [field5(env.AT_SESSIONS__PAYMENT_REF, SESSION_FIELDS3.paymentRef)]: paymentRef || void 0,
      [field5(env.AT_SESSIONS__AMOUNT_THB, SESSION_FIELDS3.amountThb)]: components ? serviceAmountThb : amountThb,
      [SESSION_FIELDS3.payModelThb]: payModelThb,
      [SESSION_FIELDS3.travelFeeThb]: travelFeeThb,
      [SESSION_FIELDS3.modelTravelFeeThb]: modelTravelFeeThb,
      [SESSION_FIELDS3.clientName]: clientName,
      [SESSION_FIELDS3.modelName]: modelName,
      [SESSION_FIELDS3.jobType]: jobType,
      [SESSION_FIELDS3.jobDate]: jobDate,
      [SESSION_FIELDS3.startTime]: startAt,
      [SESSION_FIELDS3.endTime]: endAt,
      [SESSION_FIELDS3.locationName]: locationName,
      [SESSION_FIELDS3.googleMapUrl]: googleMapUrl || void 0,
      [SESSION_FIELDS3.note]: storedNote || void 0,
      [SESSION_FIELDS3.notes]: storedNote || void 0,
      [SESSION_FIELDS3.createdAt]: createdAt,
      [SESSION_FIELDS3.customerConfirmationUrl]: customerConfirmationUrl,
      [SESSION_FIELDS3.modelConfirmationUrl]: modelConfirmationUrl
    });
    attemptedWrite = { session_id: sessionId, payment_ref: paymentRef };
    const sessionWrite = await upsertRecord(env, {
      table: sessionsTable2(env),
      lookupFieldName: "session_id",
      lookupValue: sessionId,
      fields: sessionFields2
    });
    if (held) {
      return json12(request2, env, {
        ok: true,
        authority: "payments-worker",
        schema: "canonical_confirm_link_v1",
        session_id: sessionId,
        payment_ref: null,
        session_write: sessionWrite,
        operational_status: "pending_client_link",
        confirmations_held: true,
        dispatch_held: true,
        entitlement_release_held: true,
        pricing_breakdown: pricing || components
      });
    }
    const paymentFields3 = compact6({
      [field5(env.AT_PAYMENTS__PAYMENT_REF, PAYMENT_FIELDS2.paymentRef)]: paymentRef,
      [PAYMENT_FIELDS2.sessionId]: sessionId,
      // Combined membership renewal keeps its separately itemized full
      // customer payment contract. Ordinary jobs store only the fixed rounded
      // service deposit as the initial Payment intent.
      [field5(env.AT_PAYMENTS__AMOUNT, PAYMENT_FIELDS2.amount)]: paymentStage === "deposit" && !components ? selectedDepositThb : amountThb,
      [field5(env.AT_PAYMENTS__PAYMENT_STATUS, PAYMENT_FIELDS2.paymentStatus)]: "Pending",
      [field5(env.AT_PAYMENTS__PAYMENT_METHOD, PAYMENT_FIELDS2.paymentMethod)]: paymentMethod,
      [field5(env.AT_PAYMENTS__NOTES, PAYMENT_FIELDS2.notes)]: note || void 0,
      [field5(env.AT_PAYMENTS__VERIFICATION_STATUS, PAYMENT_FIELDS2.verificationStatus)]: "pending_review",
      [field5(env.AT_PAYMENTS__PAYMENT_INTENT_STATUS, PAYMENT_FIELDS2.paymentIntentStatus)]: "Pending Confirmation",
      [field5(env.AT_PAYMENTS__CREATED_AT, PAYMENT_FIELDS2.createdAt)]: createdAt,
      [PAYMENT_FIELDS2.paymentStage]: paymentStage,
      [PAYMENT_FIELDS2.paymentType]: PAYMENT_TYPES.has(paymentStage) ? paymentStage : void 0,
      [field5(env.AT_PAYMENTS__NEEDS_BILLING_REVIEW, PAYMENT_FIELDS2.needsBillingReview)]: depositBelowMinimum || void 0,
      [field5(env.AT_PAYMENTS__DEPOSIT_STATUS, PAYMENT_FIELDS2.depositStatus)]: paymentStage === "deposit" ? depositBelowMinimum ? "under_minimum_review" : "minimum_met" : void 0
    });
    const paymentWrite = await upsertRecord(env, {
      table: paymentsTable3(env),
      lookupFieldName: "Payment Reference",
      lookupValue: paymentRef,
      fields: paymentFields3
    });
    await Promise.all([
      createConfirmTokenRecord(env, customerToken, customerClaims),
      createConfirmTokenRecord(env, modelToken, modelClaims)
    ]);
    try {
      await telegramSend3(env, [
        "\u{1F4B3} <b>PAYMENT INTENT CREATED</b>",
        `Session: <code>${escapeHtml3(sessionId)}</code>`,
        `Payment Ref: <code>${escapeHtml3(paymentRef)}</code>`,
        `Client: <b>${escapeHtml3(clientName)}</b>`,
        `Model: <b>${escapeHtml3(modelName)}</b>`,
        `Type: <b>${escapeHtml3(jobType)}</b>`,
        `Amount: <b>${Number(amountThb)} THB</b>`,
        paymentStage === "deposit" ? `Deposit received/expected: <b>${Number(selectedDepositThb)} THB</b> (${selectedDepositPercent}%)` : "",
        depositBelowMinimum ? `\u26A0\uFE0F <b>UNDER 30% \u2014 OWNER REVIEW</b> \xB7 minimum ${Number(minimumDepositThb)} THB \xB7 short ${Number(depositShortfallThb)} THB` : "",
        payModelThb != null ? `Pay Model: <b>${Number(payModelThb)} THB</b>` : ""
      ].filter(Boolean).join("\n"));
    } catch (_) {
    }
    return json12(request2, env, {
      ok: true,
      authority: "payments-worker",
      schema: "canonical_confirm_link_v1",
      session_id: sessionId,
      payment_ref: paymentRef,
      customer_t: customerToken,
      model_t: modelToken,
      customer_payment_url: customerPaymentUrl,
      // Internal service response only. The admin-worker must hold these until
      // official payment approval before exposing/dispatching them.
      customer_confirmation_url: customerConfirmationUrl,
      model_confirmation_url: modelConfirmationUrl,
      payment_write: paymentWrite,
      session_write: sessionWrite,
      pricing_breakdown: pricing || components
    });
  } catch (error2) {
    const status = Number.isInteger(error2?.status) && error2.status >= 400 && error2.status <= 599 ? error2.status : 500;
    return json12(request2, env, {
      ok: false,
      authority: "payments-worker",
      error: clean16(error2?.message || error2 || "canonical_confirm_link_failed"),
      ...attemptedWrite ? { creation_outcome: "unknown", ...attemptedWrite } : { creation_outcome: "not_created" }
    }, status);
  }
}
__name(handleCanonicalConfirmLink, "handleCanonicalConfirmLink");
function sessionsTable2(env) {
  return clean16(env.AIRTABLE_TABLE_SESSIONS || "") || DEFAULT_TABLES2.sessions;
}
__name(sessionsTable2, "sessionsTable");
function paymentsTable3(env) {
  return clean16(env.AIRTABLE_TABLE_PAYMENTS || "") || DEFAULT_TABLES2.payments;
}
__name(paymentsTable3, "paymentsTable");
async function upsertRecord(env, { table: table7, lookupFieldName, lookupValue, fields: fields2 }) {
  const existing = await findOne2(env, table7, lookupFieldName, lookupValue);
  if (existing?.id) {
    const updated = await airtableRequest6(
      env,
      `${encodeURIComponent(table7)}/${encodeURIComponent(existing.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ fields: fields2, typecast: false })
      }
    );
    return { ok: true, mode: "update", record_id: updated?.id || existing.id };
  }
  const created = await airtableRequest6(env, encodeURIComponent(table7), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: fields2 }], typecast: false })
  });
  const record = created?.records?.[0];
  if (!record?.id) throw httpError(502, "airtable_create_malformed");
  return { ok: true, mode: "create", record_id: record.id };
}
__name(upsertRecord, "upsertRecord");
async function findOne2(env, table7, fieldName, value3) {
  const url = new URL(`${AIRTABLE_API15}/${encodeURIComponent(clean16(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table7)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{${fieldName}}='${formulaValue(value3)}'`);
  const payload = await airtableRequest6(env, url.toString(), { method: "GET" }, true);
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (records.length > 1) throw httpError(409, `airtable_${safeCode2(fieldName)}_ambiguous`);
  return records[0] || null;
}
__name(findOne2, "findOne");
async function airtableRequest6(env, pathOrUrl, init = {}, absolute = false) {
  requireAirtable7(env);
  const url = absolute ? pathOrUrl : `${AIRTABLE_API15}/${encodeURIComponent(clean16(env.AIRTABLE_BASE_ID))}/${pathOrUrl}`;
  const request2 = new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean16(env.AIRTABLE_API_KEY)}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = text10(payload?.error?.message || payload?.error?.type || `HTTP ${response.status}`, 300);
    throw httpError(response.status || 502, `airtable_${response.status}:${detail}`);
  }
  return payload;
}
__name(airtableRequest6, "airtableRequest");
function requireAirtable7(env) {
  if (!clean16(env.AIRTABLE_BASE_ID) || !clean16(env.AIRTABLE_API_KEY)) {
    throw httpError(503, "airtable_not_ready");
  }
}
__name(requireAirtable7, "requireAirtable");
async function serviceAuthed3(request2, env) {
  const direct = clean16(request2.headers.get("X-Internal-Token"));
  const bearer = clean16(request2.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  const candidate = direct || bearer;
  const expected = [
    clean16(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS),
    clean16(env.AUTH_SERVICE_IMMIGRATE_TO_PAYMENTS)
  ].filter(Boolean);
  if (!candidate || !expected.length) return false;
  for (const secret of expected) {
    if (await constantTimeEqual(candidate, secret)) return true;
  }
  return false;
}
__name(serviceAuthed3, "serviceAuthed");
function canonicalJobWindow(jobDate, startRaw, endRaw) {
  const startClock = parseClock(startRaw);
  const endClock = parseClock(endRaw);
  const startAt = canonicalDateTime(jobDate, startRaw, 0);
  let endDayOffset = 0;
  if (startClock && endClock && endClock.totalMinutes <= startClock.totalMinutes) endDayOffset = 1;
  const endAt = canonicalDateTime(jobDate, endRaw, endDayOffset);
  if (Date.parse(endAt) <= Date.parse(startAt)) throw httpError(400, "end_time_must_be_after_start_time");
  return { startAt, endAt };
}
__name(canonicalJobWindow, "canonicalJobWindow");
function canonicalDateTime(jobDate, value3, dayOffset) {
  const raw = clean16(value3);
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    if (!Number.isFinite(Date.parse(raw))) throw httpError(400, "invalid_job_datetime");
    return raw;
  }
  const clock = parseClock(raw);
  if (!clock) throw httpError(400, "invalid_job_time");
  const date = dayOffset ? addDays(jobDate, dayOffset) : jobDate;
  return `${date}T${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}:${String(clock.second).padStart(2, "0")}+07:00`;
}
__name(canonicalDateTime, "canonicalDateTime");
function parseClock(value3) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(clean16(value3));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  return { hour, minute, second, totalMinutes: hour * 60 + minute };
}
__name(parseClock, "parseClock");
function addDays(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const value3 = new Date(Date.UTC(year, month - 1, day + days));
  return value3.toISOString().slice(0, 10);
}
__name(addDays, "addDays");
function canonicalDate(value3, name) {
  const raw = clean16(value3);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw httpError(400, `${name}_invalid`);
  const parsed = /* @__PURE__ */ new Date(`${raw}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw httpError(400, `${name}_invalid`);
  }
  return raw;
}
__name(canonicalDate, "canonicalDate");
function normalizeStage4(value3) {
  const stage2 = clean16(value3).toLowerCase();
  if (!PAYMENT_STAGES3.has(stage2)) throw httpError(400, "invalid_payment_stage");
  return stage2;
}
__name(normalizeStage4, "normalizeStage");
function canonicalPaymentMethod2(value3) {
  const raw = clean16(value3).toLowerCase();
  if (raw.includes("prompt")) return "PromptPay";
  if (raw.includes("bank")) return "Bank Transfer";
  if (raw.includes("credit")) return "Credit Card";
  if (raw.includes("cash")) return "Cash";
  return "Other";
}
__name(canonicalPaymentMethod2, "canonicalPaymentMethod");
function positiveNumber(value3, name) {
  const number2 = numeric(value3);
  if (number2 == null || number2 <= 0) throw httpError(400, `${name}_must_be_positive_number`);
  return number2;
}
__name(positiveNumber, "positiveNumber");
function optionalNonNegativeNumber(value3, name) {
  if (value3 == null || clean16(value3) === "") return void 0;
  const number2 = numeric(value3);
  if (number2 == null || number2 < 0) throw httpError(400, `${name}_must_be_non_negative_number`);
  return number2;
}
__name(optionalNonNegativeNumber, "optionalNonNegativeNumber");
function numeric(value3) {
  const raw = clean16(value3).replace(/,/g, "");
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw)) return null;
  const number2 = Number(raw);
  return Number.isFinite(number2) ? number2 : null;
}
__name(numeric, "numeric");
function requiredText(value3, name, max) {
  const result3 = text10(value3, max);
  if (!result3) throw httpError(400, `${name}_required`);
  return result3;
}
__name(requiredText, "requiredText");
function makeId(prefix2) {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix2}_${Date.now().toString(36)}_${hex}`;
}
__name(makeId, "makeId");
function absoluteUrl(value3, base) {
  const raw = clean16(value3);
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
}
__name(absoluteUrl, "absoluteUrl");
async function telegramSend3(env, message) {
  const service = env.TELEGRAM_WORKER;
  const token4 = clean16(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM);
  if (!service || typeof service.fetch !== "function" || !token4) return;
  await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token4}`
    },
    body: JSON.stringify({
      flow: "payment",
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  }));
}
__name(telegramSend3, "telegramSend");
function field5(configured, fallback) {
  return clean16(configured) || fallback;
}
__name(field5, "field");
function compact6(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value3]) => value3 !== void 0));
}
__name(compact6, "compact");
function safeCode2(value3) {
  return clean16(value3).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}
__name(safeCode2, "safeCode");
function escapeHtml3(value3) {
  return String(value3 || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(escapeHtml3, "escapeHtml");
function text10(value3, max = 240) {
  return clean16(value3).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}
__name(text10, "text");
function clean16(value3) {
  return String(value3 ?? "").trim();
}
__name(clean16, "clean");
function normalizePath5(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
__name(normalizePath5, "normalizePath");
function json12(request2, env, data, status = 200) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-MMD-Payment-Authority": "payments-worker"
  });
  const origin = clean16(request2.headers.get("Origin"));
  const allow = clean16(env.ALLOWED_ORIGINS).replace(/^"|"$/g, "").split(",").map((item) => item.trim().replace(/^"|"$/g, "")).filter(Boolean);
  if (origin && allow.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(data), { status, headers });
}
__name(json12, "json");

// confirmation-link-reissue.js
var AIRTABLE_API16 = "https://api.airtable.com/v0";
var CONFIRM_REISSUE_PATH = "/v1/internal/confirm/reissue";
var CONFIRM_MODEL_REISSUE_PATH = "/v1/internal/confirm/reissue-model";
var SESSION_FIELDS4 = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  paymentRef: "fldojgjSQLaO0uQLX",
  paymentStatus: "fldTY5lE6m0kQf72n",
  customerUrl: "fldi9ZdoiUXzSv1rI",
  modelUrl: "fld0mFma9J9yfEaKb"
});
var PAYMENT_FIELDS3 = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  sessionId: "fld2wdhBvc8xrV6y5",
  paymentStatus: "fldEJ1hmm7KwWuI6q",
  verificationStatus: "fldJ7a0Ube9F0bmRy",
  paymentStage: "fldrr9g8ZZjqAbdKQ",
  paymentType: "fldydUWHhqVLMkNSC"
});
function approvedForConfirmation(session, payment, sessionId) {
  return (/* @__PURE__ */ new Set(["partial", "paid"])).has(clean17(session.fields?.[SESSION_FIELDS4.paymentStatus], 80).toLowerCase()) && clean17(payment.fields?.[PAYMENT_FIELDS3.sessionId], 220) === sessionId && clean17(payment.fields?.[PAYMENT_FIELDS3.paymentStatus], 80).toLowerCase() === "paid" && clean17(payment.fields?.[PAYMENT_FIELDS3.verificationStatus], 80).toLowerCase() === "verified";
}
__name(approvedForConfirmation, "approvedForConfirmation");
function clean17(value3, max = 4096) {
  return String(value3 ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}
__name(clean17, "clean");
function formula3(value3) {
  return String(value3 || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
__name(formula3, "formula");
function json13(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store, private",
      "x-mmd-confirm-reissue": "v1"
    }
  });
}
__name(json13, "json");
function authed2(request2, env) {
  const expected = clean17(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS, 5e3);
  const direct = clean17(request2.headers.get("x-internal-token"), 5e3);
  const bearer = clean17(request2.headers.get("authorization"), 5e3).replace(/^Bearer\s+/i, "");
  return Boolean(expected && (direct === expected || bearer === expected));
}
__name(authed2, "authed");
async function airtable2(env, path, init = {}) {
  const baseId2 = clean17(env.AIRTABLE_BASE_ID, 160);
  const apiKey = clean17(env.AIRTABLE_API_KEY, 5e3);
  if (!baseId2 || !apiKey) throw Object.assign(new Error("airtable_not_ready"), { status: 503 });
  const response = await fetch(`${AIRTABLE_API16}/${encodeURIComponent(baseId2)}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...init.headers || {}
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`airtable_http_${response.status}`), { status: response.status >= 500 ? 503 : 500 });
  return payload;
}
__name(airtable2, "airtable");
async function findSingle(env, table7, fieldName, value3) {
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{${fieldName}}='${formula3(value3)}'`,
    returnFieldsByFieldId: "true"
  });
  const data = await airtable2(env, `${encodeURIComponent(table7)}?${params.toString()}`, { method: "GET" });
  const rows2 = Array.isArray(data.records) ? data.records : [];
  if (rows2.length !== 1) return null;
  return rows2[0];
}
__name(findSingle, "findSingle");
function isConfirmationReissueRequest(path, method) {
  return String(method || "").toUpperCase() === "POST" && String(path || "").replace(/\/+$/g, "") === CONFIRM_REISSUE_PATH;
}
__name(isConfirmationReissueRequest, "isConfirmationReissueRequest");
function isModelConfirmationReissueRequest(path, method) {
  return String(method || "").toUpperCase() === "POST" && String(path || "").replace(/\/+$/g, "") === CONFIRM_MODEL_REISSUE_PATH;
}
__name(isModelConfirmationReissueRequest, "isModelConfirmationReissueRequest");
async function handleConfirmationReissue(request2, env = {}) {
  if (!authed2(request2, env)) return json13({ ok: false, error: "service_auth_required" }, 401);
  const body = await request2.json().catch(() => null);
  const sessionId = clean17(body?.session_id, 220);
  if (!sessionId || Object.keys(body || {}).some((key) => key !== "session_id")) {
    return json13({ ok: false, error: "session_id_required" }, 400);
  }
  try {
    const sessionsTable4 = clean17(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 160);
    const paymentsTable6 = clean17(env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ", 160);
    const session = await findSingle(env, sessionsTable4, "session_id", sessionId);
    if (!session?.id) return json13({ ok: false, error: "session_not_found" }, 404);
    const paymentRef = clean17(session.fields?.[SESSION_FIELDS4.paymentRef], 220);
    if (!paymentRef) return json13({ ok: false, error: "session_payment_ref_missing" }, 409);
    const payment = await findSingle(env, paymentsTable6, "payment_ref", paymentRef);
    if (!payment?.id) return json13({ ok: false, error: "payment_not_found" }, 409);
    if (!approvedForConfirmation(session, payment, sessionId)) {
      return json13({ ok: false, error: "payment_approval_required" }, 409);
    }
    const paymentType = clean17(
      payment.fields?.[PAYMENT_FIELDS3.paymentStage] || payment.fields?.[PAYMENT_FIELDS3.paymentType] || "deposit",
      80
    ).toLowerCase();
    if (!(/* @__PURE__ */ new Set(["deposit", "full", "final", "tips"])).has(paymentType)) {
      return json13({ ok: false, error: "payment_type_not_reissuable" }, 409);
    }
    const secret = clean17(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5e3);
    if (!secret) return json13({ ok: false, error: "confirmation_signing_not_ready" }, 503);
    const issuedAt = Math.floor(Date.now() / 1e3);
    const expiresAt = issuedAt + getConfirmTokenTtlSeconds(env);
    const claims = /* @__PURE__ */ __name((role) => ({
      kind: role === "customer" ? "customer_confirm" : "model_confirm",
      role,
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentType,
      iat: issuedAt,
      exp: expiresAt
    }), "claims");
    const customerClaims = claims("customer");
    const modelClaims = claims("model");
    const [customerToken, modelToken] = await Promise.all([
      signConfirmToken(customerClaims, secret),
      signConfirmToken(modelClaims, secret)
    ]);
    await Promise.all([
      createConfirmTokenRecord(env, customerToken, customerClaims),
      createConfirmTokenRecord(env, modelToken, modelClaims)
    ]);
    const base = clean17(env.WEB_BASE_URL || "https://mmdbkk.com", 500).replace(/\/+$/, "");
    const customerUrl = `${base}/sigil/confirm/job-confirmation?t=${encodeURIComponent(customerToken)}`;
    const modelUrl = `${base}/sigil/confirm/job-model?t=${encodeURIComponent(modelToken)}`;
    await airtable2(env, `${encodeURIComponent(sessionsTable4)}/${encodeURIComponent(session.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [SESSION_FIELDS4.customerUrl]: customerUrl,
          [SESSION_FIELDS4.modelUrl]: modelUrl
        },
        typecast: false
      })
    });
    return json13({
      ok: true,
      schema: "mmd_confirmation_pair_reissue_v1",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentType,
      expires_at: expiresAt,
      customer_confirmation_url_present: true,
      model_confirmation_url_present: true,
      payment_state_mutated: false,
      notification_sent: false
    });
  } catch (error2) {
    return json13({ ok: false, error: clean17(error2?.message || "confirmation_reissue_failed", 160) }, Number(error2?.status || 500));
  }
}
__name(handleConfirmationReissue, "handleConfirmationReissue");
async function handleModelConfirmationReissue(request2, env = {}) {
  if (!authed2(request2, env)) return json13({ ok: false, error: "service_auth_required" }, 401);
  const body = await request2.json().catch(() => null);
  const sessionId = clean17(body?.session_id, 220);
  if (!sessionId || Object.keys(body || {}).some((key) => key !== "session_id")) {
    return json13({ ok: false, error: "session_id_required" }, 400);
  }
  try {
    const sessionsTable4 = clean17(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 160);
    const paymentsTable6 = clean17(env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ", 160);
    const session = await findSingle(env, sessionsTable4, "session_id", sessionId);
    if (!session?.id) return json13({ ok: false, error: "session_not_found" }, 404);
    const paymentRef = clean17(session.fields?.[SESSION_FIELDS4.paymentRef], 220);
    if (!paymentRef) return json13({ ok: false, error: "session_payment_ref_missing" }, 409);
    const payment = await findSingle(env, paymentsTable6, "payment_ref", paymentRef);
    if (!payment?.id) return json13({ ok: false, error: "payment_not_found" }, 409);
    if (!approvedForConfirmation(session, payment, sessionId)) {
      return json13({ ok: false, error: "payment_approval_required" }, 409);
    }
    const paymentType = clean17(
      payment.fields?.[PAYMENT_FIELDS3.paymentStage] || payment.fields?.[PAYMENT_FIELDS3.paymentType] || "deposit",
      80
    ).toLowerCase();
    if (!(/* @__PURE__ */ new Set(["deposit", "full", "final", "tips"])).has(paymentType)) {
      return json13({ ok: false, error: "payment_type_not_reissuable" }, 409);
    }
    const secret = clean17(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5e3);
    if (!secret) return json13({ ok: false, error: "confirmation_signing_not_ready" }, 503);
    const issuedAt = Math.floor(Date.now() / 1e3);
    const expiresAt = issuedAt + getConfirmTokenTtlSeconds(env);
    const modelClaims = {
      kind: "model_confirm",
      role: "model",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentType,
      iat: issuedAt,
      exp: expiresAt
    };
    const modelToken = await signConfirmToken(modelClaims, secret);
    await createConfirmTokenRecord(env, modelToken, modelClaims);
    const base = clean17(env.WEB_BASE_URL || "https://mmdbkk.com", 500).replace(/\/+$/, "");
    const modelUrl = `${base}/sigil/confirm/job-model?t=${encodeURIComponent(modelToken)}`;
    await airtable2(env, `${encodeURIComponent(sessionsTable4)}/${encodeURIComponent(session.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          [SESSION_FIELDS4.modelUrl]: modelUrl
        },
        typecast: false
      })
    });
    return json13({
      ok: true,
      schema: "mmd_model_confirmation_reissue_v1",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentType,
      expires_at: expiresAt,
      model_confirmation_url: modelUrl,
      customer_confirmation_url_mutated: false,
      payment_state_mutated: false,
      notification_sent: false
    });
  } catch (error2) {
    return json13({ ok: false, error: clean17(error2?.message || "model_confirmation_reissue_failed", 160) }, Number(error2?.status || 500));
  }
}
__name(handleModelConfirmationReissue, "handleModelConfirmationReissue");

// partner-model-link.js
var AIRTABLE_API17 = "https://api.airtable.com/v0";
var PARTNER_MODEL_LINK_PATH = "/v1/internal/confirm/partner-model-link";
var SESSION_FIELDS5 = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  amountThb: "fldhwC79ndbnEXSZz",
  paymentRef: "fldojgjSQLaO0uQLX",
  payModelThb: "fldlTO5aNfqUmlNWm",
  partnerIdSnapshot: "fld0jkscGAtyX7i2J",
  referralSnapshotJson: "fldfqNBNKkmQdr6Fp"
});
var PAYMENT_FIELDS4 = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  paymentStage: "fldrr9g8ZZjqAbdKQ",
  verificationStatus: "fldJ7a0Ube9F0bmRy"
});
var PARTNER_SYSTEMS = /* @__PURE__ */ new Set(["co_partner", "profit_share"]);
function clean18(value3, max = 4096) {
  return String(value3 ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}
__name(clean18, "clean");
function formula4(value3) {
  return String(value3 || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
__name(formula4, "formula");
function json14(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store, private", "x-mmd-partner-model-link": "v1" }
  });
}
__name(json14, "json");
function authed3(request2, env) {
  const expected = clean18(env.AUTH_SERVICE_PARTNERS_TO_PAYMENTS, 5e3);
  const direct = clean18(request2.headers.get("x-internal-token"), 5e3);
  const bearer = clean18(request2.headers.get("authorization"), 5e3).replace(/^Bearer\s+/i, "");
  return Boolean(expected && (direct === expected || bearer === expected));
}
__name(authed3, "authed");
async function airtable3(env, path, init = {}) {
  const baseId2 = clean18(env.AIRTABLE_BASE_ID, 160);
  const apiKey = clean18(env.AIRTABLE_API_KEY, 5e3);
  if (!baseId2 || !apiKey) throw Object.assign(new Error("airtable_not_ready"), { status: 503 });
  const response = await fetch(`${AIRTABLE_API17}/${encodeURIComponent(baseId2)}/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...init.headers || {} }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`airtable_http_${response.status}`), { status: response.status >= 500 ? 503 : 500 });
  return payload;
}
__name(airtable3, "airtable");
async function findSingle2(env, table7, fieldName, value3) {
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{${fieldName}}='${formula4(value3)}'`,
    returnFieldsByFieldId: "true"
  });
  const data = await airtable3(env, `${encodeURIComponent(table7)}?${params.toString()}`, { method: "GET" });
  const rows2 = Array.isArray(data.records) ? data.records : [];
  return rows2.length === 1 ? rows2[0] : null;
}
__name(findSingle2, "findSingle");
function parseObject2(value3) {
  try {
    const parsed = JSON.parse(String(value3 || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
__name(parseObject2, "parseObject");
function isPartnerModelLinkRequest(path, method) {
  return String(method || "").toUpperCase() === "POST" && String(path || "").replace(/\/+$/g, "") === PARTNER_MODEL_LINK_PATH;
}
__name(isPartnerModelLinkRequest, "isPartnerModelLinkRequest");
async function handlePartnerModelLink(request2, env = {}) {
  if (!authed3(request2, env)) return json14({ ok: false, error: "service_auth_required" }, 401);
  const body = await request2.json().catch(() => null);
  const sessionId = clean18(body?.session_id, 220);
  const partnerId = clean18(body?.partner_id, 120);
  const payModel = Number(body?.pay_model_thb);
  const allowed = /* @__PURE__ */ new Set(["session_id", "partner_id", "pay_model_thb"]);
  if (!sessionId || !partnerId || Object.keys(body || {}).some((key) => !allowed.has(key))) {
    return json14({ ok: false, error: "session_id_and_partner_id_required" }, 400);
  }
  if (!Number.isInteger(payModel) || payModel <= 0) {
    return json14({ ok: false, error: "pay_model_thb_invalid" }, 400);
  }
  try {
    const sessionsTable4 = clean18(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 160);
    const paymentsTable6 = clean18(env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ", 160);
    const session = await findSingle2(env, sessionsTable4, "session_id", sessionId);
    if (!session?.id) return json14({ ok: false, error: "session_not_found" }, 404);
    const sf = session.fields || {};
    if (clean18(sf[SESSION_FIELDS5.partnerIdSnapshot], 120) !== partnerId) {
      return json14({ ok: false, error: "partner_not_owner_of_session" }, 403);
    }
    const system = clean18(parseObject2(sf[SESSION_FIELDS5.referralSnapshotJson]).system, 40).toLowerCase();
    if (!PARTNER_SYSTEMS.has(system)) return json14({ ok: false, error: "partner_system_not_allowed" }, 409);
    const amount3 = Number(sf[SESSION_FIELDS5.amountThb]);
    if (Number.isFinite(amount3) && amount3 > 0 && payModel > amount3) {
      return json14({ ok: false, error: "pay_model_exceeds_job_amount" }, 409);
    }
    const existingPay = Number(sf[SESSION_FIELDS5.payModelThb]);
    if (Number.isFinite(existingPay) && existingPay > 0 && existingPay !== payModel) {
      return json14({ ok: false, error: "pay_model_already_set" }, 409);
    }
    const paymentRef = clean18(sf[SESSION_FIELDS5.paymentRef], 220);
    if (!paymentRef) return json14({ ok: false, error: "session_payment_ref_missing" }, 409);
    const payment = await findSingle2(env, paymentsTable6, "payment_ref", paymentRef);
    if (!payment?.id) return json14({ ok: false, error: "payment_not_found" }, 409);
    if (clean18(payment.fields?.[PAYMENT_FIELDS4.verificationStatus], 40).toLowerCase() !== "verified") {
      return json14({ ok: false, error: "payment_not_official_verified" }, 409);
    }
    const paymentType = clean18(payment.fields?.[PAYMENT_FIELDS4.paymentStage] || "deposit", 80).toLowerCase();
    if (!(/* @__PURE__ */ new Set(["deposit", "full", "final"])).has(paymentType)) {
      return json14({ ok: false, error: "payment_type_not_reissuable" }, 409);
    }
    const secret = clean18(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5e3);
    if (!secret) return json14({ ok: false, error: "confirmation_signing_not_ready" }, 503);
    const issuedAt = Math.floor(Date.now() / 1e3);
    const expiresAt = issuedAt + getConfirmTokenTtlSeconds(env);
    const claims = {
      kind: "model_confirm",
      role: "model",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_type: paymentType,
      via: "partner",
      neutral: true,
      iat: issuedAt,
      exp: expiresAt
    };
    const token4 = await signConfirmToken(claims, secret);
    await createConfirmTokenRecord(env, token4, claims);
    if (!(Number.isFinite(existingPay) && existingPay === payModel)) {
      await airtable3(env, `${encodeURIComponent(sessionsTable4)}/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ fields: { [SESSION_FIELDS5.payModelThb]: payModel }, typecast: false })
      });
    }
    const base = clean18(env.WEB_BASE_URL || "https://mmdbkk.com", 500).replace(/\/+$/, "");
    return json14({
      ok: true,
      schema: "mmd_partner_model_link_v1",
      session_id: sessionId,
      system,
      pay_model_thb: payModel,
      expires_at: expiresAt,
      model_confirmation_url: `${base}/sigil/confirm/job-model?t=${encodeURIComponent(token4)}`,
      payment_state_mutated: false,
      notification_sent: false
    });
  } catch (error2) {
    return json14({ ok: false, error: clean18(error2?.message || "partner_model_link_failed", 160) }, Number(error2?.status || 500));
  }
}
__name(handlePartnerModelLink, "handlePartnerModelLink");

// confirm-route-canonicalizer.js
var CUSTOMER_CONFIRM_PATH = "/sigil/confirm/job-confirmation";
var MODEL_CONFIRM_PATH = "/sigil/confirm/job-model";
var LEGACY_CUSTOMER_CONFIRM_PATH = "/confirm/job-confirmation";
var LEGACY_MODEL_CONFIRM_PATH = "/confirm/job-model";
function clean19(value3) {
  return String(value3 == null ? "" : value3).trim();
}
__name(clean19, "clean");
function normalizePath6(pathname = "") {
  const path = clean19(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
__name(normalizePath6, "normalizePath");
function canonicalizeConfirmTarget(value3, legacyPath, canonicalPath) {
  const raw = clean19(value3);
  if (!raw) return canonicalPath;
  if (!/^https?:\/\//i.test(raw)) {
    return normalizePath6(raw) === normalizePath6(legacyPath) ? canonicalPath : raw;
  }
  try {
    const url = new URL(raw);
    if (normalizePath6(url.pathname) === normalizePath6(legacyPath)) {
      url.pathname = canonicalPath;
      return url.toString();
    }
  } catch (_) {
  }
  return raw;
}
__name(canonicalizeConfirmTarget, "canonicalizeConfirmTarget");
function canonicalizeConfirmLinkPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return {
    ...payload,
    confirm_page: canonicalizeConfirmTarget(
      payload.confirm_page,
      LEGACY_CUSTOMER_CONFIRM_PATH,
      CUSTOMER_CONFIRM_PATH
    ),
    model_confirm_page: canonicalizeConfirmTarget(
      payload.model_confirm_page,
      LEGACY_MODEL_CONFIRM_PATH,
      MODEL_CONFIRM_PATH
    )
  };
}
__name(canonicalizeConfirmLinkPayload, "canonicalizeConfirmLinkPayload");
async function canonicalizeConfirmLinkRequest(request2) {
  const body = await request2.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return request2;
  return new Request(request2, {
    body: JSON.stringify(canonicalizeConfirmLinkPayload(body))
  });
}
__name(canonicalizeConfirmLinkRequest, "canonicalizeConfirmLinkRequest");

// customer-session-v2.js
var AIRTABLE_API18 = "https://api.airtable.com/v0";
var CUSTOMER_SESSION_DETAILS_PATH = "/v1/confirm/details";
var TRAVEL_STATES = /* @__PURE__ */ new Set(["en_route", "nearby"]);
var ARRIVAL_STATES = /* @__PURE__ */ new Set([
  "arrived",
  "met_customer",
  "final_payment_pending",
  "final_payment_confirmed"
]);
var SERVICE_STATES = /* @__PURE__ */ new Set(["work_started", "work_finished"]);
var POST_SEPARATION_STATES = /* @__PURE__ */ new Set([
  "separated",
  "review",
  "under_review",
  "payout",
  "payout_pending",
  "closed"
]);
var STATE_ALIASES = Object.freeze({
  assigned: "confirmed",
  traveling: "en_route",
  met: "met_customer",
  met_client: "met_customer",
  payment_pending: "final_payment_pending",
  payment_confirmed: "final_payment_confirmed",
  working: "work_started",
  finished: "work_finished"
});
function isCustomerSessionDetailsRequest(path, method) {
  const normalized3 = normalizePath7(path);
  const verb = String(method || "GET").toUpperCase();
  return normalized3 === CUSTOMER_SESSION_DETAILS_PATH && (verb === "POST" || verb === "OPTIONS");
}
__name(isCustomerSessionDetailsRequest, "isCustomerSessionDetailsRequest");
async function handleCustomerSessionDetails(request2, env = {}, next) {
  if (typeof next !== "function") throw new TypeError("customer_session_next_required");
  const method = request2.method.toUpperCase();
  const tokenBodyPromise = method === "POST" ? request2.clone().json().catch(() => null) : Promise.resolve(null);
  const baseResponse = await next(request2);
  if (method !== "POST" || !baseResponse.ok) return baseResponse;
  const payload = await baseResponse.clone().json().catch(() => null);
  if (!payload?.ok || payload?.role !== "customer" || !text11(payload?.session_id, 200)) {
    return baseResponse;
  }
  const body = await tokenBodyPromise;
  const token4 = text11(body?.t || body?.token, 12e3);
  let job = null;
  let sourceAvailable = true;
  try {
    job = await findJobBySessionId(env, payload.session_id);
  } catch {
    sourceAvailable = false;
  }
  const tracker = buildCustomerSessionTracker({
    jobFields: job?.fields || null,
    confirmation: payload,
    token: token4,
    sourceAvailable
  });
  return replaceJson(baseResponse, {
    ...payload,
    customer_session: tracker
  });
}
__name(handleCustomerSessionDetails, "handleCustomerSessionDetails");
function buildCustomerSessionTracker({ jobFields, confirmation = {}, token: token4 = "", sourceAvailable = true } = {}) {
  const state = normalizeLifecycleState(jobFields?.status);
  const aftercareAvailable = POST_SEPARATION_STATES.has(state);
  const eta = TRAVEL_STATES.has(state) ? latestEta(jobFields?.events_json) : null;
  const signedToken = text11(token4, 12e3);
  return {
    schema: "customer_session_v2",
    source: jobFields ? "jobs" : "confirmation",
    source_available: Boolean(sourceAvailable),
    lifecycle_state: state || null,
    customer_stage: customerStage(state),
    status_updated_at: text11(jobFields?.last_update_at, 120) || null,
    eta,
    privacy: {
      live_gps: false,
      exposes_events_json: false,
      eta_source: eta ? "model_sent" : null
    },
    aftercare: {
      available: aftercareAvailable,
      unlock_state: "separated",
      url: aftercareAvailable && signedToken ? signedPath("/aftercare", signedToken) : null,
      rating_min: 1,
      rating_max: 5,
      quick_tags: ["on_time", "polite", "good_care", "matched_brief", "want_again"],
      private_model_message: true,
      private_mmd_message: true
    },
    private_care: {
      url: signedToken ? signedPath("/sigil/recovery", signedToken) : "/sigil/recovery",
      context_transport: signedToken ? "signed_confirmation_token" : "none",
      suggested_when: {
        rating_lte: 2,
        tags: ["privacy", "safety", "payment", "brief_mismatch"]
      }
    },
    context: {
      session_id: text11(confirmation?.session_id, 200) || null,
      payment_ref: text11(confirmation?.payment_ref, 200) || null,
      job_id: text11(jobFields?.job_id, 200) || null
    }
  };
}
__name(buildCustomerSessionTracker, "buildCustomerSessionTracker");
function latestEta(value3) {
  const events = parseEvents(value3);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const item = events[index];
    if (normalizeCode(item?.event) !== "eta_update") continue;
    const minutes = Number(item?.eta_minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) continue;
    return {
      minutes,
      updated_at: text11(item?.ts || item?.updated_at, 120) || null
    };
  }
  return null;
}
__name(latestEta, "latestEta");
function normalizeLifecycleState(value3) {
  const raw = normalizeCode(value3);
  return STATE_ALIASES[raw] || raw;
}
__name(normalizeLifecycleState, "normalizeLifecycleState");
function customerStage(stateValue) {
  const state = normalizeLifecycleState(stateValue);
  if (!state) return "confirmation";
  if (["offered", "offer_declined", "offer_expired"].includes(state)) return "confirmation";
  if (["confirmed", "reminder"].includes(state)) return "confirmed";
  if (state === "en_route") return "en_route";
  if (state === "nearby") return "nearby";
  if (ARRIVAL_STATES.has(state)) return "arrived";
  if (SERVICE_STATES.has(state)) return "service";
  if (POST_SEPARATION_STATES.has(state)) return "aftercare";
  return "confirmed";
}
__name(customerStage, "customerStage");
async function findJobBySessionId(env, sessionId) {
  const baseId2 = text11(env.AIRTABLE_BASE_ID, 100);
  const table7 = text11(env.AIRTABLE_TABLE_JOBS || "jobs", 120);
  const apiKey = text11(env.AIRTABLE_API_KEY, 5e3);
  if (!baseId2 || !table7 || !apiKey) throw new Error("customer_session_storage_not_ready");
  const query = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{session_id}='${formulaValue(sessionId)}'`
  });
  const req = new Request(`${AIRTABLE_API18}/${encodeURIComponent(baseId2)}/${encodeURIComponent(table7)}?${query.toString()}`, {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` }
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("customer_session_storage_lookup_failed");
  const records = Array.isArray(data?.records) ? data.records : [];
  if (records.length > 1) throw new Error("customer_session_id_ambiguous");
  return records[0] || null;
}
__name(findJobBySessionId, "findJobBySessionId");
function parseEvents(value3) {
  if (Array.isArray(value3)) return value3;
  try {
    const parsed = JSON.parse(String(value3 || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
__name(parseEvents, "parseEvents");
function signedPath(path, token4) {
  return `${path}?t=${encodeURIComponent(token4)}`;
}
__name(signedPath, "signedPath");
function replaceJson(response, payload) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-customer-session", "customer_session_v2");
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(replaceJson, "replaceJson");
function normalizePath7(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
__name(normalizePath7, "normalizePath");
function normalizeCode(value3) {
  return String(value3 || "").trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(normalizeCode, "normalizeCode");
function text11(value3, max = 5e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}
__name(text11, "text");

// payment-instructions-v1.js
var PAYMENT_INSTRUCTIONS_PATH = "/v1/confirm/payment-instructions";
var AIRTABLE_API19 = "https://api.airtable.com/v0";
var DEFAULT_TABLE = "tblTPC2yV1P3CwbgU";
var DEFAULT_CARD_FEE_PERCENT = 4;
var PRIMARY_INSTRUCTION_ID = "mmd_payment_primary_v1";
var SHOP_INSTRUCTION_ID = "mmd_shop_himai_v1";
var JOB_INSTRUCTION_ID = "mmd_job_v1";
var MEMBERSHIP_INSTRUCTION_ID = "mmd_membership_v1";
var JOB_STAGES = /* @__PURE__ */ new Set(["deposit", "\u0E21\u0E31\u0E14\u0E08\u0E33", "balance", "remaining", "remainder", "\u0E04\u0E07\u0E40\u0E2B\u0E25\u0E37\u0E2D", "final", "finalpayment", "full", "fullpayment", "payinfull", "extension", "adjustment", "pointstopup", "topup", "tmibstory"]);
var MEMBERSHIP_STAGES2 = /* @__PURE__ */ new Set(["membership", "renewal", "renew", "blackcard", "redcard", "elite", "mmdmember"]);
var PUBLIC_MEMBERSHIP_SESSION_PREFIX = "publicmem_";
function isPaymentInstructionsRequest(path, method) {
  const normalized3 = String(path || "/").replace(/\/{2,}/g, "/").replace(/\/+$/g, "") || "/";
  const verb = String(method || "GET").toUpperCase();
  return normalized3 === PAYMENT_INSTRUCTIONS_PATH && (verb === "POST" || verb === "OPTIONS");
}
__name(isPaymentInstructionsRequest, "isPaymentInstructionsRequest");
async function handlePaymentInstructions(request2, env = {}, fetchConfirmationDetails) {
  if (typeof fetchConfirmationDetails !== "function") {
    return json15({ ok: false, error: "confirmation_details_dependency_missing", authority: "payments-worker" }, 503);
  }
  if (request2.method.toUpperCase() === "OPTIONS") {
    const target = new URL("/v1/confirm/details", request2.url);
    return fetchConfirmationDetails(new Request(target, { method: "OPTIONS", headers: request2.headers }));
  }
  if (request2.method.toUpperCase() !== "POST") {
    return json15({ ok: false, error: "method_not_allowed", authority: "payments-worker" }, 405);
  }
  const body = await request2.json().catch(() => null);
  const token4 = text12(body?.t || body?.token, 12e3);
  const detailsRequest = new Request(new URL("/v1/confirm/details", request2.url), {
    method: "POST",
    headers: request2.headers,
    body: JSON.stringify({ t: token4, expected_role: "customer" })
  });
  const detailsResponse = await fetchConfirmationDetails(detailsRequest);
  const responseHeaders = customerHeaders(detailsResponse.headers);
  const detailsText = await detailsResponse.text();
  let details = null;
  try {
    details = detailsText ? JSON.parse(detailsText) : null;
  } catch {
  }
  if (!detailsResponse.ok || !details?.ok) {
    return new Response(detailsText || JSON.stringify({ ok: false, error: "confirmation_details_failed" }), {
      status: detailsResponse.status || 502,
      headers: responseHeaders
    });
  }
  const payment = details.payment && typeof details.payment === "object" ? details.payment : null;
  if (!payment) {
    return responseJson({ ok: false, error: "payment_state_unavailable", authority: "payments-worker" }, 409, responseHeaders);
  }
  const instructionIds = paymentInstructionIds(details, payment);
  const base = {
    ok: true,
    authority: "payments-worker",
    schema: "mmd_payment_instructions_v1",
    session_id: text12(details.session_id, 200) || null,
    payment_ref: text12(details.payment_ref, 200) || null,
    stage: text12(payment.stage, 80) || null,
    amount_due_thb: numberOrNull2(payment.amount_due_thb),
    currency: "THB",
    instruction_profile: instructionIds[0]
  };
  if (payment.accepting_payment === false) {
    return responseJson({ ...base, available: false, reason: "payment_not_accepting" }, 200, responseHeaders);
  }
  if (payment.verified) {
    return responseJson({ ...base, available: false, reason: "payment_verified" }, 200, responseHeaders);
  }
  if (payment.proof_received) {
    return responseJson({ ...base, available: false, reason: "proof_received_waiting_verification" }, 200, responseHeaders);
  }
  if (!(base.amount_due_thb > 0)) {
    return responseJson({ ...base, available: false, reason: "no_amount_due" }, 200, responseHeaders);
  }
  let config = null;
  let instructionId = instructionIds[instructionIds.length - 1];
  for (const candidateId of instructionIds) {
    const found = await readActiveInstructions(env, candidateId);
    if (found) {
      config = found;
      instructionId = candidateId;
      break;
    }
  }
  if (!config) {
    return responseJson({ ok: false, error: "payment_instructions_unavailable", authority: "payments-worker" }, 503, responseHeaders);
  }
  const methods = new Set(array(config.Methods).map((value3) => text12(value3, 80).toLowerCase()));
  const promptPayRef = digits(config["PromptPay Ref"]);
  const accountNumber = text12(config["Account Number"], 120);
  const paypalUrl = safeHttpsUrl(config["PayPal URL"]);
  const configuredCardFeePercent = numberOrNull2(config["Card Fee Percent"]);
  const cardFeePercent = configuredCardFeePercent !== null && configuredCardFeePercent >= 0 ? configuredCardFeePercent : DEFAULT_CARD_FEE_PERCENT;
  const cardFeeThb = roundMoney(base.amount_due_thb * cardFeePercent / 100);
  const cardAmountDueThb = roundMoney(base.amount_due_thb + cardFeeThb);
  const qrStrategy = text12(config["QR Strategy"], 80);
  const configuredQrUrl = safeHttpsUrl(config["QR Image URL"]);
  const qrUrl = methods.has("promptpay") ? qrStrategy === "dynamic_amount" && promptPayRef ? dynamicPromptPayQr(promptPayRef, base.amount_due_thb) : qrStrategy === "static_url" ? configuredQrUrl : null : null;
  const instructions = {
    promptpay: methods.has("promptpay") && qrUrl ? {
      enabled: true,
      display_ref: promptPayRef ? formatPromptPay(promptPayRef) : null,
      qr_url: qrUrl,
      qr_strategy: qrStrategy || null,
      amount_entry: qrStrategy === "static_url" ? "customer_manual" : "embedded"
    } : { enabled: false },
    bank_transfer: methods.has("bank_transfer") && accountNumber ? {
      enabled: true,
      provider: text12(config["Bank Provider"], 80) || null,
      bank_name_th: text12(config["Bank Name TH"], 160) || null,
      bank_name_en: text12(config["Bank Name EN"], 160) || null,
      account_name_th: text12(config["Account Name TH"], 160) || null,
      account_name_en: text12(config["Account Name EN"], 160) || null,
      account_number: accountNumber
    } : { enabled: false },
    paypal_card: methods.has("paypal_card") && paypalUrl ? {
      enabled: true,
      url: paypalUrl,
      fee_percent: cardFeePercent,
      fee_thb: cardFeeThb,
      service_amount_thb: base.amount_due_thb,
      amount_due_thb: cardAmountDueThb,
      fee_scope: "processing_fee_only"
    } : { enabled: false }
  };
  if (!instructions.promptpay.enabled && !instructions.bank_transfer.enabled && !instructions.paypal_card.enabled) {
    return responseJson({ ok: false, error: "payment_instructions_unavailable", authority: "payments-worker" }, 503, responseHeaders);
  }
  return responseJson({ ...base, instruction_profile: instructionId, available: true, instructions }, 200, responseHeaders);
}
__name(handlePaymentInstructions, "handlePaymentInstructions");
function paymentInstructionIds(details = {}, payment = {}) {
  const raw = text12(payment.stage || details.payment_type || details.payment_stage, 80).toLowerCase();
  if (raw === "shop" || details.shop_order) return [SHOP_INSTRUCTION_ID];
  const stage2 = raw.replace(/[\s_-]+/g, "");
  if (JOB_STAGES.has(stage2)) return [JOB_INSTRUCTION_ID, PRIMARY_INSTRUCTION_ID];
  if (MEMBERSHIP_STAGES2.has(stage2) || text12(details.session_id, 200).startsWith(PUBLIC_MEMBERSHIP_SESSION_PREFIX)) {
    return [MEMBERSHIP_INSTRUCTION_ID, PRIMARY_INSTRUCTION_ID];
  }
  return [PRIMARY_INSTRUCTION_ID];
}
__name(paymentInstructionIds, "paymentInstructionIds");
async function readActiveInstructions(env, instructionId) {
  const baseId2 = text12(env.AIRTABLE_BASE_ID, 120);
  const table7 = text12(env.AIRTABLE_TABLE_PAYMENT_INSTRUCTIONS, 120) || DEFAULT_TABLE;
  const apiKey = text12(env.AIRTABLE_API_KEY, 500);
  if (!baseId2 || !table7 || !apiKey) return null;
  const url = new URL(`${AIRTABLE_API19}/${encodeURIComponent(baseId2)}/${encodeURIComponent(table7)}`);
  url.searchParams.set("maxRecords", "50");
  url.searchParams.set("filterByFormula", `AND({Status}='active',{Instruction ID}='${formulaValue2(instructionId)}')`);
  const http = env.AIRTABLE_HTTP && typeof env.AIRTABLE_HTTP.fetch === "function" ? env.AIRTABLE_HTTP : globalThis;
  const response = await http.fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }
  });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const now = Date.now();
  const candidates = array(payload?.records).map((record) => record?.fields || {}).filter((fields2) => text12(fields2.Status, 40).toLowerCase() === "active").filter((fields2) => text12(fields2["Instruction ID"], 160) === instructionId).filter((fields2) => {
    const effective = Date.parse(text12(fields2["Effective From"], 120));
    return !Number.isFinite(effective) || effective <= now;
  }).sort((a, b) => (numberOrNull2(b.Version) || 0) - (numberOrNull2(a.Version) || 0));
  return candidates[0] || null;
}
__name(readActiveInstructions, "readActiveInstructions");
function dynamicPromptPayQr(ref, amount3) {
  const numeric3 = numberOrNull2(amount3);
  if (!ref || !(numeric3 > 0)) return null;
  return `https://promptpay.io/${encodeURIComponent(ref)}/${numeric3.toFixed(2)}.png`;
}
__name(dynamicPromptPayQr, "dynamicPromptPayQr");
function formatPromptPay(value3) {
  const raw = digits(value3);
  if (raw.length === 10) return `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6)}`;
  return raw;
}
__name(formatPromptPay, "formatPromptPay");
function customerHeaders(input) {
  const headers = new Headers(input || {});
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-payment-authority", "payments-worker");
  return headers;
}
__name(customerHeaders, "customerHeaders");
function responseJson(payload, status, headers) {
  return new Response(JSON.stringify(payload), { status, headers: customerHeaders(headers) });
}
__name(responseJson, "responseJson");
function json15(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-payment-authority": "payments-worker"
    }
  });
}
__name(json15, "json");
function safeHttpsUrl(value3) {
  const raw = text12(value3, 2e3);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
__name(safeHttpsUrl, "safeHttpsUrl");
function formulaValue2(value3) {
  return text12(value3, 240).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
__name(formulaValue2, "formulaValue");
function digits(value3) {
  return String(value3 ?? "").replace(/\D+/g, "");
}
__name(digits, "digits");
function array(value3) {
  return Array.isArray(value3) ? value3 : [];
}
__name(array, "array");
function numberOrNull2(value3) {
  if (value3 === null || value3 === void 0 || value3 === "") return null;
  const n = Number(value3);
  return Number.isFinite(n) ? n : null;
}
__name(numberOrNull2, "numberOrNull");
function roundMoney(value3) {
  const n = Number(value3);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}
__name(roundMoney, "roundMoney");
function text12(value3, max = 1e3) {
  return String(value3 ?? "").trim().slice(0, max);
}
__name(text12, "text");

// ../auth-worker/src/member-entitlement-resolver.js
var CAPABILITIES = Object.freeze({
  PUBLIC_MEMBER: "public_member",
  RED_CARD: "red_card",
  GUEST_PASS: "guest_pass",
  PRIVATE_STANDARD: "private_standard",
  PRIVATE_PREMIUM: "private_premium",
  VIP: "vip",
  SVIP: "svip",
  BLACK_CARD: "black_card"
});
var PROTECTED = /* @__PURE__ */ new Set([
  CAPABILITIES.VIP,
  CAPABILITIES.SVIP,
  CAPABILITIES.BLACK_CARD
]);
var PRIVATE = /* @__PURE__ */ new Set([
  CAPABILITIES.PRIVATE_STANDARD,
  CAPABILITIES.PRIVATE_PREMIUM,
  CAPABILITIES.VIP,
  CAPABILITIES.SVIP,
  CAPABILITIES.BLACK_CARD
]);
var HARD_BLOCK_STATUSES = /* @__PURE__ */ new Set(["blocked", "suspended"]);
var REVOKED_STATUSES = /* @__PURE__ */ new Set(["revoked"]);
var ACTIVE_STATUSES = /* @__PURE__ */ new Set(["active"]);
var EXPIRING_SOON_STATUSES = /* @__PURE__ */ new Set(["expiring_soon", "expiringsoon"]);
var GRACE_STATUSES = /* @__PURE__ */ new Set(["grace", "grace_period"]);
var DEFAULT_EXPIRING_SOON_DAYS = 7;
var GRACE_DAYS = 14;
var DAY_MS = 24 * 60 * 60 * 1e3;
function resolveMemberEntitlements(records = [], options = {}) {
  const now = parseNow(options.now);
  const expiringSoonDays = positiveDays(options.expiringSoonDays, DEFAULT_EXPIRING_SOON_DAYS);
  const normalized3 = Array.isArray(records) ? records.map((record, index) => normalizeEntitlement(record, index, now, { expiringSoonDays })).filter(Boolean) : [];
  const memberHardBlocked = normalized3.some((item) => HARD_BLOCK_STATUSES.has(item.member_status));
  const active = normalized3.filter((item) => item.lifecycle === "active");
  const expiringSoon = normalized3.filter((item) => item.lifecycle === "expiring_soon");
  const grace = normalized3.filter((item) => item.lifecycle === "grace");
  const inactive = normalized3.filter((item) => !["active", "expiring_soon", "grace"].includes(item.lifecycle));
  const currentlyValid = [...active, ...expiringSoon];
  const effective = memberHardBlocked ? [] : unique(currentlyValid.map((item) => item.capability));
  const expiringSoonCapabilities = memberHardBlocked ? [] : unique(expiringSoon.map((item) => item.capability));
  const graceCapabilities = memberHardBlocked ? [] : unique(grace.map((item) => item.capability));
  const allRecognized = unique(normalized3.map((item) => item.capability));
  const privateActive = effective.filter((capability) => PRIVATE.has(capability));
  const privateGrace = graceCapabilities.filter((capability) => PRIVATE.has(capability));
  const protectedActive = effective.filter((capability) => PROTECTED.has(capability));
  const protectedGrace = graceCapabilities.filter((capability) => PROTECTED.has(capability));
  const privateVisibilityEnvelope = memberHardBlocked ? "none" : highestPrivateEnvelope(privateActive);
  const gracePrivateHistoryEnvelope = memberHardBlocked ? "none" : highestPrivateEnvelope(privateGrace);
  const hasPublicMember = effective.includes(CAPABILITIES.PUBLIC_MEMBER);
  const hasGuestPass = effective.includes(CAPABILITIES.GUEST_PASS);
  const hasPrivate = privateActive.length > 0;
  const hasBlackCard = effective.includes(CAPABILITIES.BLACK_CARD);
  const hasRedCard = effective.includes(CAPABILITIES.RED_CARD);
  const publicServiceAccess = !memberHardBlocked && (hasPublicMember || hasGuestPass || hasPrivate);
  const redCardRequestLane = !memberHardBlocked && (hasRedCard || hasBlackCard);
  return {
    schema_version: "my_mmd_entitlement_resolver_v1",
    evaluated_at: new Date(now).toISOString(),
    lifecycle_policy: {
      flow: ["active", "expiring_soon", "grace", "expired"],
      expiring_soon_days: expiringSoonDays,
      grace_days: GRACE_DAYS
    },
    fail_closed: true,
    member_blocked: memberHardBlocked,
    entitlements: normalized3,
    capability_state: {
      active: effective,
      expiring_soon: expiringSoonCapabilities,
      grace: graceCapabilities,
      inactive: unique(inactive.map((item) => item.capability)),
      recognized: allRecognized
    },
    access: {
      public_service_access: publicServiceAccess,
      guest_pass_access: !memberHardBlocked && hasGuestPass,
      red_card_request_lane: redCardRequestLane,
      private_visibility_envelope: privateVisibilityEnvelope,
      grace_private_history_envelope: gracePrivateHistoryEnvelope,
      protected_allowlist_required: protectedActive.length > 0 || protectedGrace.length > 0,
      protected_capabilities_active: protectedActive,
      protected_capabilities_grace: protectedGrace,
      new_model_reveals_allowed: !memberHardBlocked && privateActive.length > 0,
      new_protected_grants_allowed: !memberHardBlocked && protectedActive.length > 0,
      new_drive_grants_allowed: !memberHardBlocked && currentlyValid.length > 0 && grace.length === 0,
      new_telegram_grants_allowed: !memberHardBlocked && currentlyValid.length > 0 && grace.length === 0,
      existing_grants_may_continue_in_grace: !memberHardBlocked && grace.length > 0
    },
    review: {
      unknown_records: normalized3.filter((item) => item.capability === "unknown").map((item) => item.source_ref).filter(Boolean),
      revoked_records: normalized3.filter((item) => item.lifecycle === "revoked").map((item) => item.source_ref).filter(Boolean),
      blocked_records: normalized3.filter((item) => item.lifecycle === "blocked").map((item) => item.source_ref).filter(Boolean)
    }
  };
}
__name(resolveMemberEntitlements, "resolveMemberEntitlements");
function normalizeEntitlement(record, index = 0, now = Date.now(), options = {}) {
  const fields2 = record?.fields || record || {};
  if (!fields2 || typeof fields2 !== "object" || Array.isArray(fields2)) return null;
  const expiringSoonDays = positiveDays(options.expiringSoonDays, DEFAULT_EXPIRING_SOON_DAYS);
  const capability = capabilityFromFields(fields2);
  const memberStatus = token3(fields2.member_lifecycle_status || fields2.member_status || fields2["Membership Status"]);
  const accessStatus = token3(fields2.access_status || fields2.status);
  const startAt = timestamp(fields2.start_at || fields2.start_date);
  const expireAt = timestamp(fields2.expire_at || fields2.end_date || fields2["Membership Expiry"]);
  const explicitGraceUntil = timestamp(fields2.grace_until);
  const isGuestPass = capability === CAPABILITIES.GUEST_PASS;
  const derivedGraceUntil = !isGuestPass && expireAt ? expireAt + GRACE_DAYS * DAY_MS : null;
  const graceUntil = explicitGraceUntil || derivedGraceUntil;
  const expiringSoonAt = expireAt ? expireAt - expiringSoonDays * DAY_MS : null;
  let lifecycle = "inactive";
  if (HARD_BLOCK_STATUSES.has(memberStatus) || HARD_BLOCK_STATUSES.has(accessStatus)) {
    lifecycle = "blocked";
  } else if (REVOKED_STATUSES.has(memberStatus) || REVOKED_STATUSES.has(accessStatus)) {
    lifecycle = "revoked";
  } else if (startAt && startAt > now) {
    lifecycle = "pending";
  } else if (expireAt && now > expireAt) {
    if (!isGuestPass && graceUntil && now <= graceUntil) lifecycle = "grace";
    else lifecycle = "expired";
  } else if (!isGuestPass && (GRACE_STATUSES.has(accessStatus) || GRACE_STATUSES.has(memberStatus))) {
    lifecycle = graceUntil && now <= graceUntil ? "grace" : "expired";
  } else if (EXPIRING_SOON_STATUSES.has(memberStatus) || EXPIRING_SOON_STATUSES.has(accessStatus)) {
    lifecycle = expireAt && now <= expireAt ? "expiring_soon" : "expired";
  } else if (expireAt && expiringSoonAt && now >= expiringSoonAt && now <= expireAt) {
    lifecycle = "expiring_soon";
  } else if (ACTIVE_STATUSES.has(accessStatus) || ACTIVE_STATUSES.has(memberStatus)) {
    lifecycle = "active";
  } else if (!accessStatus && !memberStatus && expireAt && expireAt >= now) {
    lifecycle = "active";
  }
  return {
    entitlement_id: text13(fields2.entitlement_id) || `row_${index + 1}`,
    capability,
    lifecycle,
    access_status: accessStatus,
    member_status: memberStatus,
    start_at: isoOrBlank(startAt),
    expire_at: isoOrBlank(expireAt),
    expiring_soon_at: isoOrBlank(expiringSoonAt),
    grace_until: isGuestPass ? "" : isoOrBlank(graceUntil),
    source: text13(fields2.source),
    source_ref: text13(fields2.source_ref || fields2.entitlement_id),
    package_code: text13(fields2.package_code),
    relationship_tier: text13(fields2.relationship_tier)
  };
}
__name(normalizeEntitlement, "normalizeEntitlement");
function capabilityFromFields(fields2 = {}) {
  const candidates = [
    fields2.capability,
    fields2.entitlement_level,
    fields2.package_code,
    fields2.target_package_label,
    fields2.relationship_tier,
    fields2.tier,
    fields2["Membership Tier"]
  ].map(token3).filter(Boolean);
  for (const value3 of candidates) {
    if (matches(value3, ["black_card", "blackcard"])) return CAPABILITIES.BLACK_CARD;
    if (matches(value3, ["svip"])) return CAPABILITIES.SVIP;
    if (matches(value3, ["vip"])) return CAPABILITIES.VIP;
    if (matches(value3, ["red_card", "redcard"])) return CAPABILITIES.RED_CARD;
    if (matches(value3, ["guest_pass", "guestpass", "7_day", "7_days", "7days"])) return CAPABILITIES.GUEST_PASS;
    if (matches(value3, ["premium_private", "private_premium", "premium"])) return CAPABILITIES.PRIVATE_PREMIUM;
    if (matches(value3, ["standard_private", "private_standard", "standard"])) return CAPABILITIES.PRIVATE_STANDARD;
    if (matches(value3, ["public_member", "public_membership", "member_690"])) return CAPABILITIES.PUBLIC_MEMBER;
  }
  return "unknown";
}
__name(capabilityFromFields, "capabilityFromFields");
function highestPrivateEnvelope(capabilities) {
  const set = new Set(capabilities);
  if (set.has(CAPABILITIES.BLACK_CARD)) return "black_card";
  if (set.has(CAPABILITIES.SVIP)) return "svip";
  if (set.has(CAPABILITIES.VIP)) return "vip";
  if (set.has(CAPABILITIES.PRIVATE_PREMIUM)) return "premium";
  if (set.has(CAPABILITIES.PRIVATE_STANDARD)) return "standard";
  return "none";
}
__name(highestPrivateEnvelope, "highestPrivateEnvelope");
function matches(value3, names) {
  return names.some((name) => value3 === name || value3.includes(name));
}
__name(matches, "matches");
function token3(value3) {
  return text13(value3).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(token3, "token");
function text13(value3) {
  if (value3 === void 0 || value3 === null) return "";
  if (Array.isArray(value3)) return value3.map(text13).filter(Boolean).join(",");
  if (typeof value3 === "object") return String(value3.name || value3.value || value3.id || "").trim();
  return String(value3).trim();
}
__name(text13, "text");
function timestamp(value3) {
  const raw = text13(value3);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
__name(timestamp, "timestamp");
function isoOrBlank(value3) {
  return Number.isFinite(value3) ? new Date(value3).toISOString() : "";
}
__name(isoOrBlank, "isoOrBlank");
function parseNow(value3) {
  if (value3 === void 0 || value3 === null || value3 === "") return Date.now();
  if (typeof value3 === "number" && Number.isFinite(value3)) return value3;
  const parsed = Date.parse(String(value3));
  if (!Number.isFinite(parsed)) throw new TypeError("options.now must be a valid timestamp");
  return parsed;
}
__name(parseNow, "parseNow");
function positiveDays(value3, fallback) {
  const number2 = Number(value3);
  if (!Number.isFinite(number2) || number2 <= 0) return fallback;
  return number2;
}
__name(positiveDays, "positiveDays");
function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
__name(unique, "unique");

// canonical-web-renewal-settlement.js
var AIRTABLE_API20 = "https://api.airtable.com/v0";
var PAYMENTS = "tblWGGJJOx5eBvBZJ";
var PROOFS = "tblfJfM4Sqag9zrLi";
var RENEWALS = "tblXjQFwo0A2cHseh";
var MEMBERS = "tblgWc5VRon5o8Mhk";
var ENTITLEMENTS = "tblNImdF9PKAxhXGi";
var PACKAGES = "tblg2z8dENx75yHka";
var AUTHORITY = "my_mmd_entitlement_resolver_v1";
var OWNER_POLICY = "membership_verified_before_entitlement_v2";
var EXTENDABLE = /* @__PURE__ */ new Set(["active", "expiring_soon", "pending"]);
var BLOCKED = /* @__PURE__ */ new Set(["blocked", "suspended", "revoked"]);
var POLICY = Object.freeze({
  standard: Object.freeze({ years: 1, capability: "private_standard", entitlement_level: "standard_basic", label: "Standard" }),
  premium: Object.freeze({ years: 2, capability: "private_premium", entitlement_level: "premium", label: "Premium" })
});
async function reconcileCanonicalWebRenewalProof(request2, response, env = {}) {
  if (!(response instanceof Response) || !response.ok) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok || payload.evidence_submitted !== true) return response;
  let form;
  try {
    form = await request2.clone().formData();
  } catch {
    return response;
  }
  const sourcePage = code8(form.get("source_page"));
  if (sourcePage !== "sigil_pay" || !uploadedFile(form)) return response;
  const paymentRef = text14(form.get("payment_ref") || form.get("transaction_ref"), 180);
  if (!paymentRef) return response;
  try {
    requireAirtable8(env);
    const paymentRows = await findByField(env, paymentsTable4(env), ["payment_ref", "Payment Reference"], paymentRef, 2);
    if (paymentRows.length !== 1) return withSettlement(response, payload, reviewReceipt(paymentRows.length ? "canonical_payment_ambiguous" : "canonical_payment_not_found"));
    const payment = paymentRows[0];
    const snapshot2 = paymentSnapshot3(payment);
    const inference = inferMembershipPayment({
      amount_thb: snapshot2.amount_thb,
      linked_renewal: true,
      package_code: snapshot2.package_code,
      source_context: "sigil_pay renewal"
    });
    const route = classifyPaymentOpsRoute({
      payment_stage: snapshot2.payment_stage,
      amount_thb: snapshot2.amount_thb,
      linked_renewal: true,
      package_code: snapshot2.package_code,
      source_page: sourcePage,
      context_text: "membership renewal"
    });
    if (snapshot2.payment_stage !== "membership" || !POLICY[snapshot2.package_code] || !snapshot2.session_id || snapshot2.amount_thb == null || route.topic !== "membership" || route.should_alert === true || !inference || code8(inference.inferred_intent) !== "renewal" || canonicalPackage3(inference.inferred_package_code) !== snapshot2.package_code) {
      return withSettlement(response, payload, reviewReceipt("renewal_payment_context_not_safe"));
    }
    const proof = await resolveProof(env, payload, paymentRef);
    if (!proof) return withSettlement(response, payload, reviewReceipt("canonical_payment_proof_not_found"));
    if (text14(proof.fields?.payment_ref || proof.fields?.transaction_ref, 180) !== paymentRef) {
      return withSettlement(response, payload, reviewReceipt("canonical_payment_proof_reference_mismatch"));
    }
    const pf = payment.fields || {};
    if (code8(pf["Payment Status"]) !== "paid" || code8(pf["Verification Status"]) !== "verified") {
      const rejected = code8(pf["Payment Status"]) === "rejected" || code8(pf["Verification Status"]) === "rejected";
      return withSettlement(response, { ...payload, payment_status: rejected ? "rejected" : "pending_review", verification_status: rejected ? "rejected" : "pending_verification" }, reviewReceipt("canonical_payment_verification_required"));
    }
    if (code8(proof.fields?.status) !== "verified") {
      return withSettlement(response, payload, reviewReceipt("canonical_proof_verification_required"));
    }
    const verifiedAt = (/* @__PURE__ */ new Date()).toISOString();
    const paidAt = iso(firstValue2(pf, ["Payment Date", "paid_at"]));
    const moneyReceipt = {
      status: "paid",
      authority: "payments-worker",
      owner_policy: OWNER_POLICY,
      payment_ref: paymentRef,
      package_code: snapshot2.package_code,
      amount_thb: snapshot2.amount_thb
    };
    const materialization = await materializeRenewal(env, {
      payment_ref: paymentRef,
      payment,
      proof,
      snapshot: snapshot2,
      inference,
      verified_at: verifiedAt,
      paid_at: paidAt
    });
    return withSettlement(response, payload, {
      ...moneyReceipt,
      ...materialization
    });
  } catch (error2) {
    return withSettlement(response, payload, {
      status: "review_required",
      authority: "payments-worker",
      owner_policy: OWNER_POLICY,
      reason: code8(error2?.message || error2 || "canonical_web_renewal_settlement_failed"),
      payment_ref: paymentRef,
      manual_membership_review_required: true
    });
  }
}
__name(reconcileCanonicalWebRenewalProof, "reconcileCanonicalWebRenewalProof");
async function materializeRenewal(env, input) {
  const sessionId = input.snapshot.session_id;
  const renewalRows = await findByField(env, renewalsTable(env), ["renewal_session_id"], sessionId, 2);
  if (renewalRows.length !== 1) return entitlementReview(renewalRows.length ? "renewal_session_ambiguous" : "renewal_session_not_found");
  const renewal = renewalRows[0];
  const rf = renewal.fields || {};
  if (code8(rf.liff_intent) !== "renew") return entitlementReview("renewal_intent_mismatch");
  if (BLOCKED.has(code8(rf.renewal_flow_status))) return entitlementReview("renewal_session_blocked");
  const lineUserId = lineId2(rf.line_user_id);
  if (!lineUserId) return entitlementReview("renewal_line_identity_missing");
  const requestedPackage = canonicalPackage3(rf.requested_package || rf.package_code);
  if (requestedPackage && requestedPackage !== input.snapshot.package_code) return entitlementReview("renewal_package_mismatch");
  const renewalAmount = positiveAmount4(rf.renewal_amount_thb ?? rf.amount_thb);
  if (renewalAmount != null && Math.abs(renewalAmount - input.snapshot.amount_thb) > 9e-3) return entitlementReview("renewal_amount_mismatch");
  const members = await findByField(env, membersTable2(env), ["line_id", "line_user_id"], lineUserId, 2);
  if (members.length !== 1) return entitlementReview(members.length ? "canonical_member_ambiguous" : "canonical_member_not_found");
  const member = members[0];
  const memberId = text14(member.fields?.member_id, 120);
  if (!memberId) return entitlementReview("canonical_member_id_required");
  const packagePolicy = POLICY[input.snapshot.package_code];
  if (isProtectedPrivateMembership(member.fields?.["Membership Tier"] || member.fields?.tier)) return entitlementReview("protected_membership_manual_review_required");
  const rows2 = await airtableList2(env, entitlementsTable2(env), {
    filterByFormula: `{member_id}='${formulaValue(memberId)}'`,
    maxRecords: 100
  });
  const snapshot2 = resolveMemberEntitlements(rows2, { now: input.verified_at });
  if (snapshot2.schema_version !== AUTHORITY || snapshot2.fail_closed !== true) return entitlementReview("canonical_resolver_unavailable");
  if (snapshot2.member_blocked === true || rows2.some(blockedRow)) return entitlementReview("canonical_member_blocked");
  const exactRows = snapshot2.entitlements.filter((item) => canonicalPackage3(item.package_code) === input.snapshot.package_code);
  const existing = await airtableList2(env, entitlementsTable2(env), {
    filterByFormula: `{payment_ref}='${formulaValue(input.payment_ref)}'`,
    maxRecords: 3
  });
  const entitlementId = deterministicEntitlementId(input.payment_ref, input.snapshot.package_code);
  if (existing.length > 1) return entitlementReview("payment_entitlement_payment_ref_ambiguous");
  if (existing.length === 1) {
    const ef = existing[0].fields || {};
    if (text14(ef.entitlement_id, 180) !== entitlementId || text14(ef.member_id, 120) !== memberId || canonicalPackage3(ef.package_code) !== input.snapshot.package_code || !iso(ef.expire_at) || lineId2(ef.line_user_id) && lineId2(ef.line_user_id) !== lineUserId) {
      return entitlementReview("payment_entitlement_conflict");
    }
    await markRenewalMaterialized(env, renewal, input.proof, member, existing[0], input, lineUserId);
    return entitlementSuccess(existing[0], input, packagePolicy, true);
  }
  if (!input.paid_at) return entitlementReview("canonical_payment_date_required");
  if (rows2.some((row) => [row.fields?.entitlement_level, row.fields?.package_code, row.fields?.capability].some(isProtectedPrivateMembership))) return entitlementReview("protected_membership_manual_review_required");
  if (!exactRows.length) return entitlementReview("renewal_history_not_found");
  const catalog = await loadPackage(env, input.snapshot.package_code);
  if (!catalog || catalog.active !== true) return entitlementReview("membership_package_unavailable");
  if (catalog.require_approval === true) return entitlementReview("membership_package_requires_separate_approval");
  if (catalog.duration_days !== packagePolicy.years * 365) return entitlementReview("membership_package_term_review_required");
  const priorExpiry = latestFutureExpiry(exactRows, input.paid_at) || latestHistoricalExpiry(exactRows);
  const timing = privateRenewalTiming(priorExpiry, input.paid_at);
  if (!timing.expiry_known) return entitlementReview("canonical_expiry_required");
  if (!timing.active && !timing.expired_within_90_days) return entitlementReview("renewal_expired_over_90_days_review_required");
  const expectedAmount = { standard: 1e3, premium: 2500 }[input.snapshot.package_code];
  if (!(expectedAmount > 0) || input.snapshot.amount_thb !== expectedAmount) return entitlementReview("renewal_price_policy_review_required");
  const startAt = timing.start_at;
  const renewalYears = privateRenewalBaseYears(input.snapshot.package_code);
  if (!renewalYears) return entitlementReview("membership_package_term_review_required");
  const baseExpireAt = addBangkokCalendarYears(new Date(startAt), renewalYears);
  const promotion = currentPrivateMembershipPromotion({ package_code: input.snapshot.package_code, paid_at: input.paid_at, action: "renewal", existing_member: true, prior_expire_at: priorExpiry });
  const expireAt = (applyMembershipPromotion(baseExpireAt, promotion, { start_at: startAt }) || baseExpireAt)?.toISOString() || "";
  if (!expireAt) return entitlementReview("membership_term_invalid");
  const baseRule = `${renewalYears}_year${renewalYears === 1 ? "" : "s"}_from_${timing.active ? "current_expiry" : "verified_payment"}`;
  const membershipTerm = `${renewalYears === 2 ? "2_years" : "1_year"}${promotion ? `_plus_${promotion.bonus_years ? `${promotion.bonus_years}_year` : `${promotion.bonus_days}_days`}` : ""}`;
  const memberEmail = email3(member.fields?.["Contact Email"] || member.fields?.email);
  const fields2 = compact7({
    entitlement_id: entitlementId,
    member: [member.id],
    member_id: memberId,
    member_email: memberEmail || void 0,
    line_user_id: lineUserId,
    member_status: "active",
    member_lifecycle_status: "active",
    access_status: "active",
    capability: packagePolicy.capability,
    entitlement_level: packagePolicy.entitlement_level,
    package_code: input.snapshot.package_code,
    target_package_label: packagePolicy.label,
    start_at: startAt,
    expire_at: expireAt,
    membership_expiry_rule: promotion ? `${baseRule}_plus_${promotion.code}` : baseRule,
    membership_term: membershipTerm,
    source_ref: `payment:${input.payment_ref}`,
    payment_ref: input.payment_ref,
    notes: `Canonical signed web renewal; owner_policy=${OWNER_POLICY}; amount=${input.snapshot.amount_thb}; price_rule=${timing.expired_less_than_one_year ? "expired_less_than_one_year" : "canonical_catalog_renew_price"}${promotion ? `; promotion=${promotion.code}` : ""}; authority=${AUTHORITY}`
  });
  const prospective = resolveMemberEntitlements([...rows2, { fields: fields2 }], { now: input.verified_at });
  if (prospective.schema_version !== AUTHORITY || prospective.fail_closed !== true || prospective.member_blocked === true) {
    return entitlementReview("prospective_resolver_rejected_entitlement");
  }
  const created = await airtableCreate4(env, entitlementsTable2(env), fields2);
  const freshRows = await airtableList2(env, entitlementsTable2(env), {
    filterByFormula: `{member_id}='${formulaValue(memberId)}'`,
    maxRecords: 100
  });
  const fresh = resolveMemberEntitlements(freshRows, { now: input.verified_at });
  const normalized3 = fresh.entitlements.find((item) => item.entitlement_id === entitlementId);
  if (!normalized3 || normalized3.capability !== packagePolicy.capability || !EXTENDABLE.has(code8(normalized3.lifecycle)) || fresh.member_blocked === true) {
    await airtableUpdate3(env, entitlementsTable2(env), created.id, {
      access_status: "revoked",
      member_lifecycle_status: "revoked",
      member_status: "revoked",
      notes: `Rollback after resolver verification failure; payment_ref=${input.payment_ref}`
    }).catch(() => {
    });
    return entitlementReview("post_write_resolver_verification_failed");
  }
  await markRenewalMaterialized(env, renewal, input.proof, member, created, input, lineUserId);
  return {
    status: "materialized",
    authority: AUTHORITY,
    entitlement_materialized: true,
    entitlement_record_id: created.id,
    duplicate: false,
    action: "renewal",
    package_code: input.snapshot.package_code,
    member_id: memberId,
    membership_expire_at: expireAt,
    membership_term: membershipTerm,
    membership_expiry_rule: fields2.membership_expiry_rule,
    manual_membership_review_required: false,
    downstream_access_reconcile_required: true
  };
}
__name(materializeRenewal, "materializeRenewal");
async function markRenewalMaterialized(env, renewal, proof, member, entitlement, input, lineUserId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await Promise.all([
    airtableUpdate3(env, renewalsTable(env), renewal.id, {
      renewal_flow_status: "materialized",
      requested_package: input.snapshot.package_code,
      renewal_amount_thb: input.snapshot.amount_thb,
      "Member Entitlement": [entitlement.id],
      verified_at: now,
      materialized_at: now,
      reviewed_by: "payments-worker-web-renewal",
      review_note: `Canonical signed renewal accepted by ${OWNER_POLICY}; payment_ref=${input.payment_ref}`
    }),
    airtableUpdate3(env, proofsTable(env), proof.id, {
      member: [member.id],
      "MMD \u2014 LIFF Renewal Sessions": [renewal.id],
      status: "verified",
      verified_by: "payments-worker-web-renewal"
    })
  ]);
}
__name(markRenewalMaterialized, "markRenewalMaterialized");
function entitlementSuccess(row, input, policy, duplicate) {
  const f = row.fields || {};
  return {
    status: "materialized",
    authority: AUTHORITY,
    entitlement_materialized: true,
    entitlement_record_id: row.id,
    duplicate,
    action: "renewal",
    package_code: input.snapshot.package_code,
    member_id: text14(f.member_id, 120) || null,
    membership_expire_at: iso(f.expire_at) || null,
    membership_term: text14(f.membership_term, 120) || (privateRenewalBaseYears(input.snapshot.package_code) === 2 ? "2_years" : "1_year"),
    membership_expiry_rule: text14(f.membership_expiry_rule, 120) || null,
    manual_membership_review_required: false,
    downstream_access_reconcile_required: true
  };
}
__name(entitlementSuccess, "entitlementSuccess");
function entitlementReview(reason) {
  return {
    status: "review_required",
    authority: AUTHORITY,
    entitlement_materialized: false,
    reason,
    manual_membership_review_required: true,
    downstream_access_reconcile_required: false
  };
}
__name(entitlementReview, "entitlementReview");
function reviewReceipt(reason) {
  return {
    status: "review_required",
    authority: "payments-worker",
    reason,
    owner_policy: OWNER_POLICY,
    entitlement_materialized: false,
    manual_membership_review_required: true
  };
}
__name(reviewReceipt, "reviewReceipt");
function withSettlement(response, payload, receipt) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  const paid = receipt.status === "paid" || receipt.status === "materialized" || receipt.payment_status === "paid";
  return new Response(JSON.stringify({
    ...payload,
    ...paid ? { payment_status: "paid", verification_status: "verified", evidence_submitted: true } : {},
    entitlement_materialized: receipt.entitlement_materialized === true,
    entitlement_record_id: receipt.entitlement_record_id || void 0,
    membership_expire_at: receipt.membership_expire_at || void 0,
    membership_term: receipt.membership_term || void 0,
    membership_expiry_rule: receipt.membership_expiry_rule || void 0,
    manual_membership_review_required: receipt.manual_membership_review_required === true,
    downstream_access_reconcile_required: receipt.downstream_access_reconcile_required === true,
    renewal_settlement: receipt,
    owner_policy: receipt.owner_policy || (paid ? OWNER_POLICY : void 0)
  }), { status: response.status, statusText: response.statusText, headers });
}
__name(withSettlement, "withSettlement");
async function resolveProof(env, payload, paymentRef) {
  const recordId3 = recordIdValue(payload.proof_record_id);
  if (recordId3) {
    try {
      return await airtableGet2(env, proofsTable(env), recordId3);
    } catch {
    }
  }
  const rows2 = await findByField(env, proofsTable(env), ["payment_ref", "transaction_ref"], paymentRef, 2);
  return rows2.length === 1 ? rows2[0] : null;
}
__name(resolveProof, "resolveProof");
function paymentSnapshot3(record) {
  const f = record?.fields || {};
  return {
    payment_ref: text14(firstValue2(f, ["payment_ref", "Payment Reference"]), 180),
    session_id: text14(firstValue2(f, ["session_id", "Session ID"]), 180),
    payment_stage: code8(firstValue2(f, ["payment_stage", "payment_type", "stage"]) || "membership"),
    amount_thb: positiveAmount4(firstValue2(f, ["amount_thb", "amount", "Amount", "Amount THB"])),
    package_code: canonicalPackage3(firstValue2(f, ["package_code", "package", "Package Code"]))
  };
}
__name(paymentSnapshot3, "paymentSnapshot");
function uploadedFile(form) {
  const value3 = form.get("file") || form.get("slip") || form.get("proof") || form.get("receipt") || form.get("receipt_photo");
  return Boolean(value3 && typeof value3 === "object" && typeof value3.arrayBuffer === "function" && Number(value3.size || 0) > 0);
}
__name(uploadedFile, "uploadedFile");
async function loadPackage(env, packageCode) {
  const rows2 = await airtableList2(env, packagesTable(env), {
    filterByFormula: `{code}='${formulaValue(packageCode)}'`,
    maxRecords: 2
  });
  if (rows2.length !== 1) return null;
  const f = rows2[0].fields || {};
  return { active: f.is_active !== false, require_approval: f.require_approval === true, duration_days: Number(f.duration_days), renew_price: positiveAmount4(f.renew_price) };
}
__name(loadPackage, "loadPackage");
function latestFutureExpiry(rows2, nowIso3) {
  const now = Date.parse(nowIso3);
  const values = rows2.filter((item) => EXTENDABLE.has(code8(item.lifecycle))).map((item) => Date.parse(item.expire_at || "")).filter((value3) => Number.isFinite(value3) && value3 > now);
  return values.length ? new Date(Math.max(...values)).toISOString() : "";
}
__name(latestFutureExpiry, "latestFutureExpiry");
function latestHistoricalExpiry(rows2) {
  const values = rows2.map((item) => Date.parse(item.expire_at || "")).filter(Number.isFinite);
  return values.length ? new Date(Math.max(...values)).toISOString() : "";
}
__name(latestHistoricalExpiry, "latestHistoricalExpiry");
function blockedRow(row) {
  const f = row?.fields || {};
  return BLOCKED.has(code8(f.member_lifecycle_status || f.member_status)) || BLOCKED.has(code8(f.access_status));
}
__name(blockedRow, "blockedRow");
function deterministicEntitlementId(paymentRef, packageCode) {
  return `pay_${code8(paymentRef).slice(0, 80) || "payment"}_${packageCode}`.slice(0, 180);
}
__name(deterministicEntitlementId, "deterministicEntitlementId");
async function findByField(env, tableName, fieldNames, value3, maxRecords = 2) {
  for (const field7 of fieldNames) {
    try {
      const rows2 = await airtableList2(env, tableName, {
        filterByFormula: `{${field7}}='${formulaValue(value3)}'`,
        maxRecords
      });
      if (rows2.length) return rows2;
    } catch (error2) {
      if (Number(error2?.status) !== 422) throw error2;
    }
  }
  return [];
}
__name(findByField, "findByField");
async function airtableList2(env, tableName, params = {}) {
  const url = airtableUrl(env, tableName);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const response = await airtableFetch4(env, new Request(url.toString(), { headers: { Authorization: `Bearer ${clean20(env.AIRTABLE_API_KEY)}` } }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload.records;
}
__name(airtableList2, "airtableList");
async function airtableGet2(env, tableName, recordId3) {
  const response = await airtableFetch4(env, new Request(`${airtableUrl(env, tableName).toString()}/${encodeURIComponent(recordId3)}`, {
    headers: { Authorization: `Bearer ${clean20(env.AIRTABLE_API_KEY)}` }
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload;
}
__name(airtableGet2, "airtableGet");
async function airtableCreate4(env, tableName, fields2) {
  const response = await airtableFetch4(env, new Request(airtableUrl(env, tableName).toString(), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clean20(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ performUpsert: { fieldsToMergeOn: ["payment_ref"] }, records: [{ fields: fields2 }], typecast: false })
  }));
  const payload = await response.json().catch(() => ({}));
  const row = payload?.records?.[0];
  if (!response.ok || !row?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return row;
}
__name(airtableCreate4, "airtableCreate");
async function airtableUpdate3(env, tableName, recordId3, fields2) {
  const url = `${airtableUrl(env, tableName).toString()}/${encodeURIComponent(recordId3)}`;
  const response = await airtableFetch4(env, new Request(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clean20(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fields2, typecast: false })
  }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload;
}
__name(airtableUpdate3, "airtableUpdate");
function airtableFetch4(env, request2) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request2) : fetch(request2);
}
__name(airtableFetch4, "airtableFetch");
function airtableUrl(env, tableName) {
  return new URL(`${AIRTABLE_API20}/${encodeURIComponent(clean20(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
}
__name(airtableUrl, "airtableUrl");
function paymentsTable4(env) {
  return clean20(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || PAYMENTS);
}
__name(paymentsTable4, "paymentsTable");
function proofsTable(env) {
  return clean20(env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || PROOFS);
}
__name(proofsTable, "proofsTable");
function renewalsTable(env) {
  return clean20(env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID || env.AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS || RENEWALS);
}
__name(renewalsTable, "renewalsTable");
function membersTable2(env) {
  return clean20(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || MEMBERS);
}
__name(membersTable2, "membersTable");
function entitlementsTable2(env) {
  return clean20(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || ENTITLEMENTS);
}
__name(entitlementsTable2, "entitlementsTable");
function packagesTable(env) {
  return clean20(env.AIRTABLE_TABLE_PACKAGES_ID || env.AIRTABLE_TABLE_PACKAGES || PACKAGES);
}
__name(packagesTable, "packagesTable");
function requireAirtable8(env) {
  if (!clean20(env.AIRTABLE_API_KEY) || !clean20(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready");
}
__name(requireAirtable8, "requireAirtable");
function firstValue2(fields2, keys) {
  for (const key of keys) if (fields2[key] !== void 0 && fields2[key] !== null && fields2[key] !== "") return fields2[key];
  return null;
}
__name(firstValue2, "firstValue");
function canonicalPackage3(value3) {
  const raw = code8(value3);
  if (raw.includes("premium")) return "premium";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  return "";
}
__name(canonicalPackage3, "canonicalPackage");
function positiveAmount4(value3) {
  const n = Number(String(value3 ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}
__name(positiveAmount4, "positiveAmount");
function recordIdValue(value3) {
  const id = text14(value3, 100);
  return /^rec[A-Za-z0-9]{6,32}$/.test(id) ? id : "";
}
__name(recordIdValue, "recordIdValue");
function lineId2(value3) {
  const id = text14(value3, 100);
  return /^U[A-Za-z0-9_-]{20,80}$/.test(id) ? id : "";
}
__name(lineId2, "lineId");
function email3(value3) {
  const v = clean20(value3, 320).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
}
__name(email3, "email");
function iso(value3) {
  const n = Date.parse(String(value3 || ""));
  return Number.isFinite(n) ? new Date(n).toISOString() : "";
}
__name(iso, "iso");
function code8(value3) {
  return clean20(value3, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(code8, "code");
function text14(value3, max = 240) {
  return clean20(value3, max).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}
__name(text14, "text");
function clean20(value3, max = 4e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max);
}
__name(clean20, "clean");
function compact7(value3) {
  return Object.fromEntries(Object.entries(value3).filter(([, v]) => v !== void 0 && v !== null && v !== ""));
}
__name(compact7, "compact");

// canonical-web-renewal-response.js
async function preserveCanonicalWebRenewalPaymentSuccess(response) {
  return response;
}
__name(preserveCanonicalWebRenewalPaymentSuccess, "preserveCanonicalWebRenewalPaymentSuccess");

// premium-membership-term.js
var AIRTABLE_API21 = "https://api.airtable.com/v0";
var ENTITLEMENTS_TABLE = "tblNImdF9PKAxhXGi";
function clean21(value3, max = 1e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max);
}
__name(clean21, "clean");
function code9(value3) {
  return clean21(value3, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(code9, "code");
function isRecordId(value3) {
  return /^rec[a-zA-Z0-9]{10,}$/.test(clean21(value3, 120));
}
__name(isRecordId, "isRecordId");
function addUtcYears(value3, years) {
  const date = new Date(value3);
  if (Number.isNaN(date.getTime())) return null;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}
__name(addUtcYears, "addUtcYears");
async function patchEntitlement(env, recordId3, fields2) {
  const baseId2 = clean21(env.AIRTABLE_BASE_ID, 120);
  const apiKey = clean21(env.AIRTABLE_API_KEY, 5e3);
  const table7 = clean21(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || ENTITLEMENTS_TABLE, 160);
  if (!baseId2 || !apiKey || !isRecordId(recordId3)) throw new Error("premium_term_airtable_not_ready");
  const url = `${AIRTABLE_API21}/${encodeURIComponent(baseId2)}/${encodeURIComponent(table7)}/${encodeURIComponent(recordId3)}`;
  const request2 = new Request(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: fields2, typecast: false })
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  if (!response.ok) throw new Error(`premium_term_airtable_${response.status}`);
}
__name(patchEntitlement, "patchEntitlement");
function rebuild(response, data) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(rebuild, "rebuild");
async function reconcilePremiumReviewedMembershipTerm(request2, response, env = {}) {
  if (!response?.ok) return response;
  const body = await request2.clone().json().catch(() => null);
  if (!body || code9(body.package_code || body.package) !== "premium") return response;
  const data = await response.clone().json().catch(() => null);
  if (!data?.ok || data.entitlement_materialized !== true || !isRecordId(data.entitlement_record_id)) return response;
  if (data.membership_term === "2_years" || data.membership_expiry_rule === "2_years_from_verified_payment" || String(data.membership_expiry_rule || "").includes("care_back_private_premium_2026")) {
    return response;
  }
  const oneYearExpiry = clean21(data.membership_expire_at, 120);
  const twoYearExpiry = addUtcYears(oneYearExpiry, 1);
  if (!twoYearExpiry) return response;
  try {
    await patchEntitlement(env, data.entitlement_record_id, {
      expire_at: twoYearExpiry.toISOString(),
      membership_expiry_rule: "2_years_from_verified_payment"
    });
  } catch (error2) {
    return rebuild(response, {
      ...data,
      ok: false,
      error: clean21(error2?.message || error2 || "premium_term_reconcile_failed", 300),
      authority: "payments-worker"
    });
  }
  return rebuild(response, {
    ...data,
    membership_expire_at: twoYearExpiry.toISOString(),
    membership_term: "2_years",
    membership_expiry_rule: "2_years_from_verified_payment",
    premium_term_reconciled: true
  });
}
__name(reconcilePremiumReviewedMembershipTerm, "reconcilePremiumReviewedMembershipTerm");

// reviewed-membership-write-through.js
var AIRTABLE_API22 = "https://api.airtable.com/v0";
var MEMBERS_TABLE = "tblgWc5VRon5o8Mhk";
var ENTITLEMENTS_TABLE2 = "tblNImdF9PKAxhXGi";
var PACKAGES_TABLE = "tblg2z8dENx75yHka";
var AUTHORITY2 = "my_mmd_entitlement_resolver_v1";
var PACKAGE_POLICY = Object.freeze({
  mmd_member: Object.freeze({ capability: "public_member", entitlement_level: "public_member", label: "MMD Member", years: 1, private_catalog: false }),
  elite: Object.freeze({ capability: "public_member", entitlement_level: "elite", label: "Elite Membership", years: 2, private_catalog: false }),
  red_card: Object.freeze({ capability: "red_card", entitlement_level: "red_card", label: "Red Card", years: 1, private_catalog: false }),
  standard: Object.freeze({ capability: "private_standard", entitlement_level: "standard_basic", label: "Standard", years: 1, private_catalog: true }),
  premium: Object.freeze({ capability: "private_premium", entitlement_level: "premium", label: "Premium", years: 2, private_catalog: true })
});
var BLOCKED2 = /* @__PURE__ */ new Set(["blocked", "suspended", "revoked"]);
var EXTENDABLE2 = /* @__PURE__ */ new Set(["active", "expiring_soon", "pending"]);
async function reconcileReviewedMembershipEntitlement(request2, response, env = {}) {
  if (!response?.ok) return response;
  const body = await request2.clone().json().catch(() => null);
  if (!body || stage(body) !== "membership") return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok) return response;
  if (payload.entitlement_materialized === true) {
    return withReceipt(response, payload, {
      status: "materialized",
      authority: AUTHORITY2,
      duplicate: payload.duplicate === true,
      entitlement_record_id: text15(payload.entitlement_record_id, 120) || null,
      expire_at: iso2(payload.membership_expire_at) || null,
      source: payload.recovery_context ? "liff_renewal_recovery" : "reviewed_proof"
    });
  }
  try {
    requireAirtable9(env);
    const plan = await resolveWriteThroughPlan(env, body, { paid_at: iso2(payload.paid_at) || void 0 });
    if (plan.status !== "ready") {
      return withReceipt(response, payload, {
        status: "review_required",
        authority: AUTHORITY2,
        reason: plan.reason,
        action: plan.action || null,
        package_code: plan.package_code || canonicalPackage4(body.package_code || body.package) || null,
        capability: plan.capability || null,
        current_expire_at: plan.current_expire_at || null,
        proposed_expire_at: plan.proposed_expire_at || null,
        confidence: plan.confidence ?? null
      });
    }
    const existing = await findByPaymentRef(env, plan.payment_ref);
    if (existing.length > 1) {
      return withReceipt(response, payload, failedReceipt("payment_entitlement_payment_ref_ambiguous", plan));
    }
    if (existing.length === 1) {
      const row = existing[0];
      if (!sameMaterialization(row, plan)) {
        return withReceipt(response, payload, failedReceipt("payment_entitlement_conflict", plan));
      }
      const existingExpiry = iso2(row.fields?.expire_at);
      plan.proposed_expire_at = existingExpiry;
      plan.membership_expiry_rule = text15(row.fields?.membership_expiry_rule, 180) || plan.membership_expiry_rule;
      return withReceipt(response, payload, successReceipt(plan, row.id, true));
    }
    const fields2 = entitlementFields(plan);
    const prospective = resolveMemberEntitlements([...plan.entitlement_rows, { fields: fields2 }], { now: plan.verified_at });
    if (prospective.schema_version !== AUTHORITY2 || prospective.fail_closed !== true || prospective.member_blocked === true) {
      return withReceipt(response, payload, failedReceipt("prospective_resolver_rejected_entitlement", plan));
    }
    const created = await airtableCreate5(env, entitlementsTable3(env), fields2);
    const freshRows = await loadMemberEntitlements(env, plan.member_id, plan.member_email);
    const fresh = resolveMemberEntitlements(freshRows, { now: plan.verified_at });
    const createdNormalized = fresh.entitlements.find((item) => item.entitlement_id === plan.entitlement_id);
    const accepted = createdNormalized && createdNormalized.capability === plan.capability && ["active", "expiring_soon", "pending"].includes(createdNormalized.lifecycle) && fresh.member_blocked !== true;
    if (!accepted) {
      await revokeCreated(env, created.id, plan).catch(() => {
      });
      return withReceipt(response, payload, failedReceipt("post_write_resolver_verification_failed", plan));
    }
    return withReceipt(response, payload, successReceipt(plan, created.id, false));
  } catch (error2) {
    return withReceipt(response, payload, {
      status: "failed",
      authority: AUTHORITY2,
      reason: code10(error2?.message || error2 || "membership_write_through_failed"),
      manual_reconciliation_required: true
    });
  }
}
__name(reconcileReviewedMembershipEntitlement, "reconcileReviewedMembershipEntitlement");
async function resolveWriteThroughPlan(env = {}, body = {}, options = {}) {
  const paymentRef = text15(body.payment_ref || body.transaction_ref, 180);
  const amountThb = positiveAmount5(body.amount_thb ?? body.amount);
  const packageCode = canonicalPackage4(body.package_code || body.package);
  const memberEmail = email4(body.member_email || body.email);
  const paidAt = iso2(options.paid_at || body.paid_at);
  const verifiedAt = paidAt || iso2(options.verified_at || body.verified_at) || (/* @__PURE__ */ new Date()).toISOString();
  const policy = PACKAGE_POLICY[packageCode];
  if (!paymentRef) return review("payment_ref_required", { package_code: packageCode });
  if (amountThb == null) return review("amount_required", { package_code: packageCode });
  if (!packageCode || !policy) return review("unsupported_membership_package", { package_code: packageCode });
  if (!memberEmail) return review("canonical_member_email_required", { package_code: packageCode, capability: policy.capability });
  const inference = inferMembershipPayment({
    amount_thb: amountThb,
    linked_member: true,
    linked_renewal: Boolean(body.renewal_session_id || body.renewal_record_id),
    package_code: packageCode,
    source_context: body.context_source
  });
  if (!inference || inference.inferred_package_code !== packageCode) {
    return review("membership_amount_package_mismatch", {
      package_code: packageCode,
      capability: policy.capability,
      confidence: inference?.confidence ?? null
    });
  }
  const members = await findMemberByEmail(env, memberEmail);
  if (members.length !== 1) {
    return review(members.length ? "canonical_member_ambiguous" : "canonical_member_not_found", {
      package_code: packageCode,
      capability: policy.capability,
      confidence: inference.confidence
    });
  }
  const member = members[0];
  if (isProtectedPrivateMembership(member.fields?.["Membership Tier"] || member.fields?.tier)) return review("protected_membership_manual_review_required", { package_code: packageCode });
  const memberId = text15(member.fields?.member_id, 120);
  if (!memberId) {
    return review("canonical_member_id_required", { package_code: packageCode, capability: policy.capability, confidence: inference.confidence });
  }
  const rows2 = await loadMemberEntitlements(env, memberId, memberEmail);
  const snapshot2 = resolveMemberEntitlements(rows2, { now: verifiedAt });
  if (snapshot2.schema_version !== AUTHORITY2 || snapshot2.fail_closed !== true) {
    return review("canonical_resolver_unavailable", { package_code: packageCode, capability: policy.capability, confidence: inference.confidence });
  }
  if (snapshot2.member_blocked === true || rows2.some((row) => blockedRow2(row))) {
    return review("canonical_member_blocked", { package_code: packageCode, capability: policy.capability, confidence: inference.confidence });
  }
  const previouslyPaid = rows2.filter((row) => text15(row.fields?.payment_ref, 180) === paymentRef);
  if (previouslyPaid.length > 1) return review("payment_entitlement_payment_ref_ambiguous", { package_code: packageCode });
  if (previouslyPaid.length === 1) {
    const f = previouslyPaid[0].fields;
    const plan = { status: "ready", payment_ref: paymentRef, member_id: memberId, package_code: packageCode, capability: policy.capability, entitlement_id: deterministicEntitlementId2(paymentRef, packageCode), proposed_expire_at: iso2(f.expire_at), start_at: iso2(f.start_at), membership_expiry_rule: f.membership_expiry_rule, membership_term: f.membership_term, action: "existing_paid", promotion: null };
    return sameMaterialization(previouslyPaid[0], plan) && plan.proposed_expire_at ? plan : review("payment_entitlement_conflict", { package_code: packageCode });
  }
  let catalog = null;
  if (policy.private_catalog) {
    catalog = await loadPrivatePackage(env, packageCode);
    if (!catalog) return review("membership_package_catalog_missing", { package_code: packageCode, capability: policy.capability });
    if (catalog.duration_days !== policy.years * 365) return review("membership_package_term_review_required", { package_code: packageCode });
    if (catalog.active === false) return review("membership_package_inactive", { package_code: packageCode, capability: policy.capability });
    if (catalog.require_approval === true) return review("membership_package_requires_separate_approval", { package_code: packageCode, capability: policy.capability });
  }
  if (policy.private_catalog && !paidAt) return review("canonical_payment_date_required", { package_code: packageCode });
  const priorRows = rows2.filter((row) => text15(row?.fields?.payment_ref, 180) !== paymentRef);
  const planningSnapshot = resolveMemberEntitlements(priorRows, { now: verifiedAt });
  if (priorRows.some((row) => [row.fields?.entitlement_level, row.fields?.package_code, row.fields?.capability].some(isProtectedPrivateMembership))) return review("protected_membership_manual_review_required", { package_code: packageCode });
  const normalizedRows = planningSnapshot.entitlements.filter((item) => item.package_code === packageCode || item.capability === policy.capability);
  const exactPackageRows = normalizedRows.filter((item) => canonicalPackage4(item.package_code) === packageCode);
  const hasExactHistory = exactPackageRows.length > 0;
  const inferredIntent = code10(inference.inferred_intent);
  if (inferredIntent === "renewal" && !hasExactHistory) {
    return review("renewal_history_not_found", {
      package_code: packageCode,
      capability: policy.capability,
      action: "renewal",
      confidence: inference.confidence
    });
  }
  const futureExpiry = latestFutureExpiry2(exactPackageRows, verifiedAt);
  const timing = privateRenewalTiming(futureExpiry || latestHistoricalExpiry2(exactPackageRows), verifiedAt);
  if (policy.private_catalog && hasExactHistory && timing?.expiry_known && !timing.active && !timing.expired_within_90_days) {
    return review("renewal_expired_over_90_days_review_required", { package_code: packageCode, action: "review_required" });
  }
  const requiresSignupReview = policy.private_catalog ? timing?.expired_one_year_or_more : timing?.expired_over_one_year;
  if (hasExactHistory && requiresSignupReview && inferredIntent === "renewal") return review(policy.private_catalog ? "expired_one_year_or_more_policy_review_required" : "expired_over_one_year_new_signup_required", { package_code: packageCode, action: timing.expired_over_one_year ? "signup" : "review_required" });
  const action = hasExactHistory && !requiresSignupReview ? "renewal" : "signup";
  if (policy.private_catalog && hasExactHistory && !timing?.expiry_known) return review("canonical_expiry_required", { package_code: packageCode });
  if (policy.private_catalog && hasExactHistory && timing.expired_one_year_or_more) return review("expired_one_year_or_more_policy_review_required", { package_code: packageCode });
  if (policy.private_catalog && action === "renewal") {
    const expectedAmount = { standard: 1e3, premium: 2500 }[packageCode];
    if (!(expectedAmount > 0) || amountThb !== expectedAmount) return review("renewal_price_policy_review_required", { package_code: packageCode });
  }
  const startAt = timing?.start_at || verifiedAt;
  const baseYears = policy.private_catalog && action === "renewal" ? privateRenewalBaseYears(packageCode) : policy.years;
  if (!baseYears) return review("membership_package_term_review_required", { package_code: packageCode });
  const baseExpireAt = (policy.private_catalog ? addBangkokCalendarYears(new Date(startAt), baseYears) : addCalendarYears(startAt, baseYears))?.toISOString() || "";
  const promotion = currentPrivateMembershipPromotion({ package_code: packageCode, paid_at: paidAt, action, existing_member: hasExactHistory, prior_expire_at: futureExpiry || latestHistoricalExpiry2(exactPackageRows) });
  const promotedExpireAt = applyMembershipPromotion(baseExpireAt, promotion, { start_at: startAt });
  const expireAt = (promotedExpireAt || (baseExpireAt ? new Date(baseExpireAt) : null))?.toISOString() || "";
  if (!expireAt) return review("membership_term_invalid", { package_code: packageCode, capability: policy.capability, action, confidence: inference.confidence });
  const lineUserId = lineId3(member.fields?.line_id || member.fields?.line_user_id) || uniqueLineUserId(rows2) || "";
  return {
    status: "ready",
    authority: AUTHORITY2,
    payment_ref: paymentRef,
    amount_thb: amountThb,
    package_code: packageCode,
    capability: policy.capability,
    entitlement_level: policy.entitlement_level,
    target_package_label: policy.label,
    member_record_id: member.id,
    member_id: memberId,
    member_email: memberEmail,
    line_user_id: lineUserId,
    verified_at: verifiedAt,
    action,
    confidence: Math.max(Number(inference.confidence || 0), 0.94),
    price_rule: text15(inference.inferred_price_rule, 120),
    current_expire_at: futureExpiry || latestHistoricalExpiry2(exactPackageRows) || null,
    start_at: startAt,
    proposed_expire_at: expireAt,
    membership_term: promotion?.total_years === 2 ? "2_years" : promotion ? `${baseYears === 2 ? "2_years" : "1_year"}_plus_${promotion.bonus_years ? `${promotion.bonus_years}_year` : `${promotion.bonus_days}_days`}` : baseYears === 2 ? "2_years" : "1_year",
    membership_expiry_rule: promotion?.total_years === 2 ? `2_years_from_${futureExpiry ? "current_expiry" : "verified_payment"}_${promotion.code}` : action === "renewal" && futureExpiry ? `${baseYears}_year${baseYears === 1 ? "" : "s"}_from_current_expiry${promotion ? `_plus_${promotion.code}` : ""}` : `${baseYears}_year${baseYears === 1 ? "" : "s"}_from_verified_payment${promotion ? `_plus_${promotion.code}` : ""}`,
    promotion,
    entitlement_id: deterministicEntitlementId2(paymentRef, packageCode),
    entitlement_rows: rows2
  };
}
__name(resolveWriteThroughPlan, "resolveWriteThroughPlan");
function entitlementFields(plan) {
  return compact8({
    entitlement_id: plan.entitlement_id,
    member: [plan.member_record_id],
    member_id: plan.member_id,
    member_email: plan.member_email,
    line_user_id: plan.line_user_id,
    member_status: "active",
    member_lifecycle_status: "active",
    access_status: "active",
    capability: plan.capability,
    entitlement_level: plan.entitlement_level,
    package_code: plan.package_code,
    target_package_label: plan.target_package_label,
    start_at: plan.start_at,
    expire_at: plan.proposed_expire_at,
    membership_expiry_rule: plan.membership_expiry_rule,
    source_ref: `payment:${plan.payment_ref}`,
    payment_ref: plan.payment_ref,
    notes: `Official payment write-through; action=${plan.action}; amount=${plan.amount_thb}; price_rule=${plan.price_rule}; authority=${AUTHORITY2}${plan.promotion ? `; promotion=${plan.promotion.code}` : ""}`
  });
}
__name(entitlementFields, "entitlementFields");
function successReceipt(plan, recordId3, duplicate) {
  return {
    status: "materialized",
    authority: AUTHORITY2,
    duplicate,
    action: plan.action,
    package_code: plan.package_code,
    capability: plan.capability,
    member_id: plan.member_id,
    entitlement_record_id: recordId3,
    entitlement_id: plan.entitlement_id,
    current_expire_at: plan.current_expire_at,
    start_at: plan.start_at,
    expire_at: plan.proposed_expire_at,
    membership_term: plan.membership_term,
    membership_expiry_rule: plan.membership_expiry_rule,
    promotion: plan.promotion || null,
    confidence: plan.confidence,
    manual_reconciliation_required: false
  };
}
__name(successReceipt, "successReceipt");
function failedReceipt(reason, plan = {}) {
  return {
    status: "failed",
    authority: AUTHORITY2,
    reason,
    action: plan.action || null,
    package_code: plan.package_code || null,
    capability: plan.capability || null,
    member_id: plan.member_id || null,
    manual_reconciliation_required: true
  };
}
__name(failedReceipt, "failedReceipt");
function review(reason, extra = {}) {
  return { status: "review_required", reason, ...extra };
}
__name(review, "review");
function withReceipt(response, payload, receipt) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return new Response(JSON.stringify({
    ...payload,
    entitlement_materialized: receipt.status === "materialized",
    entitlement_record_id: receipt.entitlement_record_id || payload.entitlement_record_id || void 0,
    membership_expire_at: receipt.expire_at || payload.membership_expire_at || void 0,
    membership_term: receipt.membership_term || payload.membership_term || void 0,
    membership_expiry_rule: receipt.membership_expiry_rule || payload.membership_expiry_rule || void 0,
    membership_write_through: receipt,
    manual_membership_review_required: receipt.status === "review_required" || receipt.status === "failed",
    downstream_access_reconcile_required: receipt.status === "materialized" || payload.downstream_access_reconcile_required === true
  }), { status: response.status, statusText: response.statusText, headers });
}
__name(withReceipt, "withReceipt");
async function findMemberByEmail(env, memberEmail) {
  for (const field7 of ["Contact Email", "email"]) {
    try {
      const rows2 = await airtableList3(env, membersTable3(env), {
        filterByFormula: `LOWER({${field7}})='${formulaValue(memberEmail)}'`,
        maxRecords: 2
      });
      if (rows2.length) return rows2;
    } catch (error2) {
      if (Number(error2?.status) !== 422) throw error2;
    }
  }
  return [];
}
__name(findMemberByEmail, "findMemberByEmail");
async function loadMemberEntitlements(env, memberId, memberEmail) {
  if (memberId) {
    try {
      const byMemberId = await airtableList3(env, entitlementsTable3(env), {
        filterByFormula: `{member_id}='${formulaValue(memberId)}'`,
        maxRecords: 100
      });
      if (byMemberId.length) return byMemberId;
    } catch (error2) {
      if (Number(error2?.status) !== 422) throw error2;
    }
  }
  return airtableList3(env, entitlementsTable3(env), {
    filterByFormula: `LOWER({member_email})='${formulaValue(memberEmail)}'`,
    maxRecords: 100
  });
}
__name(loadMemberEntitlements, "loadMemberEntitlements");
async function loadPrivatePackage(env, packageCode) {
  const rows2 = await airtableList3(env, packagesTable2(env), {
    filterByFormula: `{code}='${formulaValue(packageCode)}'`,
    maxRecords: 2
  });
  if (rows2.length !== 1) return null;
  const fields2 = rows2[0].fields || {};
  return {
    code: canonicalPackage4(fields2.code),
    active: fields2.is_active !== false,
    require_approval: fields2.require_approval === true,
    duration_days: Number(fields2.duration_days || 0) || null,
    price: Number(fields2.price || 0) || null,
    renew_price: Number(fields2.renew_price || 0) || null
  };
}
__name(loadPrivatePackage, "loadPrivatePackage");
async function findByPaymentRef(env, paymentRef) {
  return airtableList3(env, entitlementsTable3(env), {
    filterByFormula: `{payment_ref}='${formulaValue(paymentRef)}'`,
    maxRecords: 3
  });
}
__name(findByPaymentRef, "findByPaymentRef");
function sameMaterialization(record, plan) {
  const f = record?.fields || {};
  return text15(f.entitlement_id, 180) === plan.entitlement_id && text15(f.member_id, 120) === plan.member_id && canonicalPackage4(f.package_code) === plan.package_code && code10(f.capability || f.entitlement_level) === plan.capability;
}
__name(sameMaterialization, "sameMaterialization");
async function revokeCreated(env, recordId3, plan) {
  return airtableUpdate4(env, entitlementsTable3(env), recordId3, {
    access_status: "revoked",
    member_lifecycle_status: "revoked",
    member_status: "revoked",
    notes: `Rollback after resolver verification failure; payment_ref=${plan.payment_ref}`
  });
}
__name(revokeCreated, "revokeCreated");
function latestFutureExpiry2(rows2, nowIso3) {
  const now = Date.parse(nowIso3);
  const values = rows2.filter((item) => EXTENDABLE2.has(code10(item.lifecycle))).map((item) => Date.parse(item.expire_at || "")).filter((value3) => Number.isFinite(value3) && value3 > now);
  return values.length ? new Date(Math.max(...values)).toISOString() : "";
}
__name(latestFutureExpiry2, "latestFutureExpiry");
function latestHistoricalExpiry2(rows2) {
  const values = rows2.map((item) => Date.parse(item.expire_at || "")).filter(Number.isFinite);
  return values.length ? new Date(Math.max(...values)).toISOString() : "";
}
__name(latestHistoricalExpiry2, "latestHistoricalExpiry");
function uniqueLineUserId(rows2) {
  const values = [...new Set(rows2.map((row) => lineId3(row?.fields?.line_user_id)).filter(Boolean))];
  return values.length === 1 ? values[0] : "";
}
__name(uniqueLineUserId, "uniqueLineUserId");
function blockedRow2(row) {
  const f = row?.fields || {};
  return BLOCKED2.has(code10(f.member_lifecycle_status || f.member_status)) || BLOCKED2.has(code10(f.access_status));
}
__name(blockedRow2, "blockedRow");
function deterministicEntitlementId2(paymentRef, packageCode) {
  const ref = code10(paymentRef).slice(0, 80) || "payment";
  return `pay_${ref}_${packageCode}`.slice(0, 180);
}
__name(deterministicEntitlementId2, "deterministicEntitlementId");
function addCalendarYears(value3, years) {
  const date = new Date(value3);
  if (Number.isNaN(date.getTime()) || !Number.isInteger(years) || years < 1) return null;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  date.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}
__name(addCalendarYears, "addCalendarYears");
async function airtableList3(env, tableName, params = {}) {
  const url = airtableUrl2(env, tableName);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const response = await airtableFetch5(env, new Request(url.toString(), { headers: { Authorization: `Bearer ${clean22(env.AIRTABLE_API_KEY)}` } }));
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.records)) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return payload.records;
}
__name(airtableList3, "airtableList");
async function airtableCreate5(env, tableName, fields2) {
  const renewal = String(fields2.notes || "").includes("action=renewal;");
  const response = await airtableFetch5(env, new Request(airtableUrl2(env, tableName).toString(), {
    method: renewal ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${clean22(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    // Reached only after service-authenticated Official Verify, canonical
    // package/amount policy validation, and exact member resolution.
    // This permits policy-owned Public Membership values to extend legacy
    // Airtable single-select choices without giving the browser schema authority.
    body: JSON.stringify({ ...renewal ? { performUpsert: { fieldsToMergeOn: ["payment_ref"] } } : {}, records: [{ fields: fields2 }], typecast: true })
  }));
  const payload = await response.json().catch(() => ({}));
  const row = payload?.records?.[0];
  if (!response.ok || !row?.id) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return row;
}
__name(airtableCreate5, "airtableCreate");
async function airtableUpdate4(env, tableName, recordId3, fields2) {
  const response = await airtableFetch5(env, new Request(airtableUrl2(env, tableName).toString(), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${clean22(env.AIRTABLE_API_KEY)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ id: recordId3, fields: fields2 }], typecast: true })
  }));
  if (!response.ok) throw httpError(response.status || 502, `airtable_${response.status || "malformed"}`);
  return response.json().catch(() => ({}));
}
__name(airtableUpdate4, "airtableUpdate");
function airtableFetch5(env, request2) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request2) : fetch(request2);
}
__name(airtableFetch5, "airtableFetch");
function airtableUrl2(env, tableName) {
  return new URL(`${AIRTABLE_API22}/${encodeURIComponent(clean22(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
}
__name(airtableUrl2, "airtableUrl");
function membersTable3(env) {
  return clean22(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || MEMBERS_TABLE);
}
__name(membersTable3, "membersTable");
function entitlementsTable3(env) {
  return clean22(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || ENTITLEMENTS_TABLE2);
}
__name(entitlementsTable3, "entitlementsTable");
function packagesTable2(env) {
  return clean22(env.AIRTABLE_TABLE_PACKAGES_ID || env.AIRTABLE_TABLE_PACKAGES || PACKAGES_TABLE);
}
__name(packagesTable2, "packagesTable");
function requireAirtable9(env) {
  if (!clean22(env.AIRTABLE_API_KEY) || !clean22(env.AIRTABLE_BASE_ID)) throw httpError(503, "airtable_not_ready");
}
__name(requireAirtable9, "requireAirtable");
function stage(body = {}) {
  return code10(body.payment_stage || body.stage || body.payment_type);
}
__name(stage, "stage");
function canonicalPackage4(value3) {
  const raw = code10(value3).replace(/-/g, "_");
  if (raw === "mmd_member" || raw === "member_690" || raw === "membership") return "mmd_member";
  if (raw === "elite" || raw === "elite_membership") return "elite";
  if (raw === "red_card" || raw === "redcard") return "red_card";
  if (raw.includes("premium")) return "premium";
  if (raw.includes("standard") || raw.includes("lite")) return "standard";
  return "";
}
__name(canonicalPackage4, "canonicalPackage");
function email4(value3) {
  const v = clean22(value3).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
}
__name(email4, "email");
function lineId3(value3) {
  const v = text15(value3, 100);
  return /^U[A-Za-z0-9_-]{20,80}$/.test(v) ? v : "";
}
__name(lineId3, "lineId");
function positiveAmount5(value3) {
  const n = Number(String(value3 ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}
__name(positiveAmount5, "positiveAmount");
function iso2(value3) {
  const t = Date.parse(String(value3 || ""));
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}
__name(iso2, "iso");
function code10(value3) {
  return clean22(value3, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(code10, "code");
function text15(value3, max = 240) {
  return clean22(value3, max).replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, max);
}
__name(text15, "text");
function clean22(value3, max = 2e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max);
}
__name(clean22, "clean");
function compact8(value3) {
  return Object.fromEntries(Object.entries(value3).filter(([, v]) => v !== "" && v !== null && v !== void 0));
}
__name(compact8, "compact");

// double-moment-purchase-v1.js
var AIRTABLE_API23 = "https://api.airtable.com/v0";
var CAMPAIGN_ID = "promo_double_moment_sep2026";
var POLICY_VERSION = "v1";
var PACKAGE_CODE = "double_moment_20000";
var PAID_AMOUNT = 2e4;
var BONUS_AMOUNT = 3500;
var MINIMUM_SERVICE_AMOUNT = 2e4;
var VALID_DAYS = 180;
var START_PATH = "/v1/confirm/double-moment/start";
var OFFER_PATH = "/v1/confirm/double-moment/offer";
var HEALTH_PATH = "/v1/confirm/double-moment/health";
var PAID_STATES2 = /* @__PURE__ */ new Set(["paid", "verified", "success", "completed"]);
var VERIFIED_STATES = /* @__PURE__ */ new Set(["verified", "approved", "success", "completed"]);
function clean23(value3, max = 500) {
  return String(value3 == null ? "" : value3).trim().slice(0, max);
}
__name(clean23, "clean");
function normalized2(value3) {
  return clean23(value3, 120).toLowerCase().replace(/[\s-]+/g, "_");
}
__name(normalized2, "normalized");
function numeric2(value3) {
  const n = Number(String(value3 ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
__name(numeric2, "numeric");
function json16(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-mmd-payment-authority": "payments-worker", "x-mmd-double-moment": POLICY_VERSION } });
}
__name(json16, "json");
function normalizePath8(value3 = "") {
  const path = String(value3 || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
__name(normalizePath8, "normalizePath");
function tokenFromRequest(request2) {
  return clean23(request2.headers.get("X-Internal-Token"), 4e3) || clean23(request2.headers.get("Authorization"), 4e3).replace(/^Bearer\s+/i, "");
}
__name(tokenFromRequest, "tokenFromRequest");
function trustedCaller(request2, env = {}) {
  const token4 = tokenFromRequest(request2);
  if (!token4) return false;
  return [env.INTERNAL_TOKEN, env.AUTH_SERVICE_MEMBER_TO_PAYMENTS, env.AUTH_SERVICE_ADMIN_TO_PAYMENTS, env.AUTH_SERVICE_EVENTS_TO_PAYMENTS].map((value3) => clean23(value3, 4e3)).filter(Boolean).includes(token4);
}
__name(trustedCaller, "trustedCaller");
function baseId(env) {
  return clean23(env.AIRTABLE_BASE_ID, 80);
}
__name(baseId, "baseId");
function airtableToken(env) {
  return clean23(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 2e3);
}
__name(airtableToken, "airtableToken");
function table5(env, key) {
  if (key === "claims") return clean23(env.AIRTABLE_TABLE_CAMPAIGN_CLAIMS || "tblTH1LGJikBI0rly", 120);
  if (key === "payments") return clean23(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ", 120);
  if (key === "credits") return clean23(env.AIRTABLE_TABLE_CLIENT_CREDITS || "tblKvhl2zZm9yYBmT", 120);
  throw new Error("invalid_table_key");
}
__name(table5, "table");
function assertAirtable(env) {
  if (!baseId(env) || !airtableToken(env)) throw new Error("airtable_not_ready");
}
__name(assertAirtable, "assertAirtable");
async function airtableFetch6(env, url, init = {}) {
  assertAirtable(env);
  const req = new Request(url, { ...init, headers: { Authorization: `Bearer ${airtableToken(env)}`, "Content-Type": "application/json", ...init.headers || {} } });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error2 = new Error(`airtable_${response.status}`);
    error2.status = response.status;
    throw error2;
  }
  return payload;
}
__name(airtableFetch6, "airtableFetch");
async function findFirst2(env, tableName, formula5) {
  const url = new URL(`${AIRTABLE_API23}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableName)}`);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", formula5);
  const data = await airtableFetch6(env, url.toString(), { method: "GET" });
  return data?.records?.[0] || null;
}
__name(findFirst2, "findFirst");
async function createRecord2(env, tableName, fields2) {
  const url = `${AIRTABLE_API23}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableName)}`;
  const data = await airtableFetch6(env, url, { method: "POST", body: JSON.stringify({ records: [{ fields: fields2 }], typecast: true }) });
  return data?.records?.[0] || null;
}
__name(createRecord2, "createRecord");
async function patchRecord(env, tableName, recordId3, fields2) {
  const url = `${AIRTABLE_API23}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId3)}`;
  return airtableFetch6(env, url, { method: "PATCH", body: JSON.stringify({ fields: fields2, typecast: true }) });
}
__name(patchRecord, "patchRecord");
async function sha256(value3) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value3 || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
async function stableClaimId(clientRecordId) {
  return `dm_${(await sha256(`${CAMPAIGN_ID}:${clientRecordId}`)).slice(0, 24)}`;
}
__name(stableClaimId, "stableClaimId");
function addDaysIso(iso3, days) {
  const date = new Date(iso3);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
__name(addDaysIso, "addDaysIso");
function requestWithJson2(request2, url, body) {
  const headers = new Headers(request2.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return new Request(url, { method: "POST", headers, body: JSON.stringify(body) });
}
__name(requestWithJson2, "requestWithJson");
async function findClaim(env, claimId) {
  return findFirst2(env, table5(env, "claims"), `{claim_id}='${formulaValue(claimId)}'`);
}
__name(findClaim, "findClaim");
async function findPayment3(env, paymentRef) {
  return findFirst2(env, table5(env, "payments"), `OR({payment_ref}='${formulaValue(paymentRef)}',{Payment Reference}='${formulaValue(paymentRef)}')`);
}
__name(findPayment3, "findPayment");
async function findCredit(env, creditId) {
  return findFirst2(env, table5(env, "credits"), `{credit_id}='${formulaValue(creditId)}'`);
}
__name(findCredit, "findCredit");
async function findIssuedCampaignCredit(env, clientRecordId) {
  return findFirst2(env, table5(env, "credits"), `AND({client_record_id}='${formulaValue(clientRecordId)}',{Campaign ID}='${formulaValue(CAMPAIGN_ID)}',OR({Status}='available',{Status}='partially_used',{Status}='used'))`);
}
__name(findIssuedCampaignCredit, "findIssuedCampaignCredit");
function paymentFields2(record) {
  return record?.fields || {};
}
__name(paymentFields2, "paymentFields");
function verifiedDoubleMomentPayment(record) {
  const fields2 = paymentFields2(record);
  const amount3 = numeric2(fields2.amount_thb ?? fields2.Amount ?? fields2["Amount (THB no decimals)"]);
  const paymentStatus = normalized2(fields2["Payment Status"] || fields2.payment_status);
  const verificationStatus = normalized2(fields2["Verification Status"] || fields2.verification_status);
  const campaignCode = clean23(fields2.campaign_code, 120);
  const packageCode = normalized2(fields2["Package Code"] || fields2.package_code);
  return amount3 === PAID_AMOUNT && PAID_STATES2.has(paymentStatus) && VERIFIED_STATES.has(verificationStatus) && (campaignCode === CAMPAIGN_ID || packageCode === PACKAGE_CODE);
}
__name(verifiedDoubleMomentPayment, "verifiedDoubleMomentPayment");
function creditFields({ creditId, clientRecordId, memberId, paymentRecordId, paymentRef, claimId, amount: amount3, creditType, authority, bonusSequence = null, issuedAt, expiresAt }) {
  return { credit_id: creditId, Client: [clientRecordId], ...memberId ? { member_id: memberId } : {}, ...paymentRecordId ? { "Source Payment": [paymentRecordId] } : {}, ...paymentRef ? { source_payment_ref: paymentRef } : {}, "Original Amount THB": amount3, "Available Amount THB": amount3, "Applied Amount THB": 0, "Reserved Amount THB": 0, Status: "available", "Verification Status": "verified", "Verified Amount THB": creditType === "paid_credit" ? amount3 : 0, "Verified At": issuedAt, "Verified By": "payments-worker:double-moment-v1", "Verification Ref": paymentRef, "Verification Source": "payment_authority", "Credit Type": creditType, "Campaign ID": CAMPAIGN_ID, "Campaign Claim ID": claimId, ...bonusSequence ? { "Bonus Sequence": bonusSequence } : {}, "Issued At": issuedAt, "Expires At": expiresAt, "Minimum Service Amount THB": MINIMUM_SERVICE_AMOUNT, "Credit Authority": authority, "Policy Version": POLICY_VERSION, "Backing Payment Amount THB": PAID_AMOUNT, Refundable: false, "Customer Display Note": creditType === "paid_credit" ? "MMD DOUBLE MOMENT \xB7 \u0E40\u0E04\u0E23\u0E14\u0E34\u0E15\u0E0A\u0E33\u0E23\u0E30 20,000 \u0E1A\u0E32\u0E17" : `MMD DOUBLE MOMENT \xB7 \u0E42\u0E1A\u0E19\u0E31\u0E2A\u0E04\u0E23\u0E31\u0E49\u0E07\u0E17\u0E35\u0E48 ${bonusSequence} \u0E08\u0E33\u0E19\u0E27\u0E19 3,500 \u0E1A\u0E32\u0E17`, "Created By": "payments-worker:double-moment-v1", "Created At": issuedAt, idempotency_key: creditId, client_record_id: clientRecordId };
}
__name(creditFields, "creditFields");
async function ensureCredit(env, spec) {
  const existing = await findCredit(env, spec.creditId);
  if (existing?.id) return { record_id: existing.id, created: false, credit_id: spec.creditId };
  const created = await createRecord2(env, table5(env, "credits"), creditFields(spec));
  return { record_id: created?.id || null, created: true, credit_id: spec.creditId };
}
__name(ensureCredit, "ensureCredit");
async function issueDoubleMomentCredits(env, { claim, payment, paymentRef }) {
  const claimFields = claim?.fields || {};
  const clientRecordId = clean23(claimFields.matched_client_id, 60);
  const memberId = clean23(claimFields.matched_member_id, 180);
  if (!/^rec[A-Za-z0-9]{14}$/.test(clientRecordId)) throw new Error("double_moment_client_not_resolved");
  if (!verifiedDoubleMomentPayment(payment)) throw new Error("double_moment_payment_not_verified");
  const issuedAt = (/* @__PURE__ */ new Date()).toISOString();
  const expiresAt = addDaysIso(issuedAt, VALID_DAYS);
  const claimId = clean23(claimFields.claim_id, 160);
  const paymentRecordId = clean23(payment?.id, 60);
  const results = [];
  results.push(await ensureCredit(env, { creditId: `${claimId}:paid`, clientRecordId, memberId, paymentRecordId, paymentRef, claimId, amount: PAID_AMOUNT, creditType: "paid_credit", authority: "payment_authority", issuedAt, expiresAt }));
  results.push(await ensureCredit(env, { creditId: `${claimId}:bonus:1`, clientRecordId, memberId, paymentRecordId, paymentRef, claimId, amount: BONUS_AMOUNT, creditType: "bonus_credit", authority: "campaign_worker", bonusSequence: 1, issuedAt, expiresAt }));
  results.push(await ensureCredit(env, { creditId: `${claimId}:bonus:2`, clientRecordId, memberId, paymentRecordId, paymentRef, claimId, amount: BONUS_AMOUNT, creditType: "bonus_credit", authority: "campaign_worker", bonusSequence: 2, issuedAt, expiresAt }));
  await patchRecord(env, table5(env, "claims"), claim.id, { claim_status: "applied", applied_at: issuedAt, payment_status: "verified", payment_reference: paymentRef, updated_at: issuedAt, payload_json: JSON.stringify({ flow: "double_moment_purchase_v1", total_credit_thb: PAID_AMOUNT + BONUS_AMOUNT * 2, paid_credit_thb: PAID_AMOUNT, bonus_credit_thb: BONUS_AMOUNT * 2, minimum_service_thb: MINIMUM_SERVICE_AMOUNT, expires_at: expiresAt }) });
  return { results, expires_at: expiresAt, total_credit_thb: PAID_AMOUNT + BONUS_AMOUNT * 2 };
}
__name(issueDoubleMomentCredits, "issueDoubleMomentCredits");
async function clientForLine(env, lineUserId) {
  if (!/^U[0-9a-f]{32}$/i.test(lineUserId)) return null;
  const name = clean23(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS", 120);
  const url = new URL(`${AIRTABLE_API23}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(name)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{line_user_id}='${formulaValue(lineUserId)}'`);
  const payload = await airtableFetch6(env, url, { method: "GET" });
  const rows2 = payload?.records;
  if (payload?.offset || !Array.isArray(rows2) || rows2.length !== 1) return null;
  return /^rec[A-Za-z0-9]{14}$/.test(rows2[0]?.id || "") && clean23(rows2[0]?.fields?.line_user_id) === lineUserId ? rows2[0].id : null;
}
__name(clientForLine, "clientForLine");
var DOUBLE_MOMENT_POLICY = Object.freeze({
  package_code: PACKAGE_CODE,
  amount_thb: PAID_AMOUNT,
  paid_credit_thb: PAID_AMOUNT,
  bonus_1_thb: BONUS_AMOUNT,
  bonus_2_thb: BONUS_AMOUNT,
  total_credit_thb: PAID_AMOUNT + BONUS_AMOUNT * 2,
  minimum_service_thb: MINIMUM_SERVICE_AMOUNT,
  validity_days: VALID_DAYS,
  refundable: false,
  official_verification_required: true,
  entitlement_granted: false
});
function isDoubleMomentRequest(path, method) {
  const normalizedPath = normalizePath8(path);
  const upperMethod = String(method || "GET").toUpperCase();
  return normalizedPath === HEALTH_PATH && upperMethod === "GET" || [START_PATH, OFFER_PATH].includes(normalizedPath) && upperMethod === "POST";
}
__name(isDoubleMomentRequest, "isDoubleMomentRequest");
async function handleDoubleMomentRequest(request2, env, downstream) {
  const path = normalizePath8(new URL(request2.url).pathname);
  if (!isDoubleMomentRequest(path, request2.method)) return json16({ ok: false, error: "route_not_found" }, 404);
  if (path === HEALTH_PATH && request2.method.toUpperCase() === "GET") return json16({ ok: true, campaign_id: CAMPAIGN_ID, policy_version: POLICY_VERSION, purchase_amount_thb: PAID_AMOUNT, total_credit_thb: PAID_AMOUNT + BONUS_AMOUNT * 2, minimum_service_thb: MINIMUM_SERVICE_AMOUNT, validity_days: VALID_DAYS, authority: "payments-worker" });
  if (!trustedCaller(request2, env)) return json16({ ok: false, error: "service_auth_required" }, 401);
  try {
    const body = await request2.clone().json().catch(() => ({}));
    const clientRecordId = body.line_user_id ? await clientForLine(env, clean23(body.line_user_id, 160)) : clean23(body.client_record_id, 60);
    const memberId = clean23(body.member_id, 180);
    if (!/^rec[A-Za-z0-9]{14}$/.test(clientRecordId)) return json16({ ok: false, error: "canonical_client_required" }, 422);
    const existingCredit = await findIssuedCampaignCredit(env, clientRecordId);
    if (path === OFFER_PATH) return json16({ ok: true, ...DOUBLE_MOMENT_POLICY, status: existingCredit?.id ? "already_activated" : "ready", payment_available: !existingCredit?.id });
    if (existingCredit?.id) return json16({ ok: true, already_activated: true, campaign_id: CAMPAIGN_ID, client_record_id: clientRecordId, credit_record_id: existingCredit.id });
    const claimId = await stableClaimId(clientRecordId);
    let claim = await findClaim(env, claimId);
    if (!claim?.id) {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      claim = await createRecord2(env, table5(env, "claims"), { claim_id: claimId, campaign_id: CAMPAIGN_ID, matched_client_id: clientRecordId, matched_member_id: memberId, classification_reason: "Double Moment purchase intent: pay 20,000 THB, receive 27,000 THB credit.", payment_required: true, payment_status: "pending", claim_status: "pending_payment", created_at: now, updated_at: now });
    }
    const sessionId = `dm_${claimId}`;
    const intentRequest = requestWithJson2(request2, new URL("/v1/pay/verify", request2.url), { session_id: sessionId, payment_stage: "full", amount: PAID_AMOUNT, package_code: PACKAGE_CODE, notes: `MMD DOUBLE MOMENT \xB7 ${claimId}` });
    const response = await downstream(intentRequest);
    const payload = await response.clone().json().catch(() => null);
    if (!response.ok || !payload?.ok || !clean23(payload.payment_ref, 220)) return response;
    const paymentRef = clean23(payload.payment_ref, 220);
    const payment = await findPayment3(env, paymentRef);
    if (!payment?.id) return json16({ ok: false, error: "double_moment_payment_intent_not_persisted" }, 502);
    await patchRecord(env, table5(env, "payments"), payment.id, { campaign_code: CAMPAIGN_ID, promo_status: "pending_payment", campaign_claim_id: claimId, "Campaign Claim": [claim.id], promo_payload_json: JSON.stringify({ campaign_id: CAMPAIGN_ID, policy_version: POLICY_VERSION, purchase_amount_thb: PAID_AMOUNT, total_credit_thb: PAID_AMOUNT + BONUS_AMOUNT * 2, minimum_service_thb: MINIMUM_SERVICE_AMOUNT, validity_days: VALID_DAYS }) });
    await patchRecord(env, table5(env, "claims"), claim.id, { payment_reference: paymentRef, payment_status: "pending", updated_at: (/* @__PURE__ */ new Date()).toISOString() });
    return json16({ ...payload, campaign_id: CAMPAIGN_ID, claim_id: claimId, purchase_amount_thb: PAID_AMOUNT, total_credit_thb: PAID_AMOUNT + BONUS_AMOUNT * 2, paid_credit_thb: PAID_AMOUNT, bonus_1_thb: BONUS_AMOUNT, bonus_2_thb: BONUS_AMOUNT, minimum_service_thb: MINIMUM_SERVICE_AMOUNT, validity_days: VALID_DAYS, activation_state: "awaiting_official_payment_verification" }, response.status);
  } catch (error2) {
    return json16({ ok: false, error: clean23(error2?.message || error2 || "double_moment_start_failed", 300) }, Number(error2?.status || 500));
  }
}
__name(handleDoubleMomentRequest, "handleDoubleMomentRequest");
async function reconcileDoubleMomentReviewedProof(request2, response, env) {
  if (!response?.ok) return response;
  const responsePayload = await response.clone().json().catch(() => null);
  if (!responsePayload?.ok) return response;
  const body = await request2.clone().json().catch(() => null);
  const paymentRef = clean23(body?.payment_ref || body?.transaction_ref || responsePayload?.payment_ref, 220);
  if (!paymentRef) return response;
  try {
    const payment = await findPayment3(env, paymentRef);
    const fields2 = paymentFields2(payment);
    if (clean23(fields2.campaign_code, 120) !== CAMPAIGN_ID && normalized2(fields2["Package Code"] || fields2.package_code) !== PACKAGE_CODE) return response;
    const claimId = clean23(fields2.campaign_claim_id, 160);
    if (!claimId) return json16({ ok: false, error: "double_moment_claim_missing", payment_ref: paymentRef }, 409);
    const claim = await findClaim(env, claimId);
    if (!claim?.id) return json16({ ok: false, error: "double_moment_claim_not_found", payment_ref: paymentRef }, 409);
    const issued = await issueDoubleMomentCredits(env, { claim, payment, paymentRef });
    await patchRecord(env, table5(env, "payments"), payment.id, { promo_status: "activated", promo_checked_at: (/* @__PURE__ */ new Date()).toISOString() });
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store, private");
    headers.set("x-mmd-double-moment", "activated-v1");
    return new Response(JSON.stringify({ ...responsePayload, double_moment: { activated: true, campaign_id: CAMPAIGN_ID, claim_id: claimId, total_credit_thb: issued.total_credit_thb, expires_at: issued.expires_at, credits: issued.results } }), { status: response.status, statusText: response.statusText, headers });
  } catch (error2) {
    return json16({ ok: false, payment_ref: paymentRef, error: clean23(error2?.message || error2 || "double_moment_credit_issue_failed", 300), authority: "payments-worker" }, Number(error2?.status || 502));
  }
}
__name(reconcileDoubleMomentReviewedProof, "reconcileDoubleMomentReviewedProof");

// final-payment-flow.js
var AIRTABLE_API24 = "https://api.airtable.com/v0";
var FINAL_PAYMENT_ACTIVATE_PATH = "/v1/internal/payments/final/activate";
var FINAL_PAYMENT_STATUS_PATH = "/v1/internal/payments/final/status";
var PAYMENT_FIELDS5 = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  sessionId: "fld2wdhBvc8xrV6y5",
  amount: "fldvCSwrUW8OMAooS",
  paymentStatus: "fldEJ1hmm7KwWuI6q",
  paymentMethod: "fldsblzIn0wzan3c9",
  notes: "fldjsZIKoJPawlb2u",
  verificationStatus: "fldJ7a0Ube9F0bmRy",
  intentStatus: "fld04fr3bRJTohO6y",
  createdAt: "flduxcPpowBxEZSLu",
  paymentStage: "fldrr9g8ZZjqAbdKQ",
  paymentType: "fldydUWHhqVLMkNSC"
});
var FINAL_WAITING_STATES = /* @__PURE__ */ new Set(["arrived", "met_customer", "final_payment_pending"]);
function isFinalPaymentFlowRequest(path, method) {
  const normalized3 = normalizePath9(path);
  return String(method || "GET").toUpperCase() === "POST" && (normalized3 === FINAL_PAYMENT_ACTIVATE_PATH || normalized3 === FINAL_PAYMENT_STATUS_PATH);
}
__name(isFinalPaymentFlowRequest, "isFinalPaymentFlowRequest");
async function handleFinalPaymentFlow(request2, env = {}) {
  if (!await serviceAuthed4(request2, env)) {
    return json17({ ok: false, error: "service_auth_required", authority: "payments-worker" }, 401);
  }
  const path = normalizePath9(new URL(request2.url).pathname);
  const body = await request2.json().catch(() => null);
  const sessionId = clean24(body?.session_id, 220);
  if (!sessionId) return json17({ ok: false, error: "session_id_required", authority: "payments-worker" }, 400);
  try {
    if (path === FINAL_PAYMENT_ACTIVATE_PATH) {
      const intent = await ensureFinalPaymentIntent(env, sessionId);
      return json17({ ok: true, authority: "payments-worker", ...intent });
    }
    const snapshot2 = await finalPaymentSnapshot(env, sessionId);
    if (snapshot2.final_payment_confirmed) {
      await promoteFinalPaymentLifecycle(env, sessionId);
    }
    return json17({ ok: true, authority: "payments-worker", ...snapshot2 });
  } catch (error2) {
    return json17({
      ok: false,
      error: clean24(error2?.message || error2 || "final_payment_flow_failed", 300),
      authority: "payments-worker"
    }, Number(error2?.status || 500));
  }
}
__name(handleFinalPaymentFlow, "handleFinalPaymentFlow");
async function ensureFinalPaymentIntent(env, sessionId) {
  requireAirtable10(env);
  const session = await findSession5(env, sessionId, true);
  if (!session?.id) throw httpError(404, "session_not_found");
  const summary2 = await readVerifiedSessionBalance(env, session);
  const balance = summary2.remaining_amount_thb;
  if (balance > 0 && summary2.verified_deposit_thb <= 0) throw httpError(409, "verified_deposit_required");
  const paymentRef = await stablePaymentRef(sessionId, "final");
  const existing = await findPaymentByRef(env, paymentRef, true);
  if (existing?.id) {
    const snapshot2 = paymentSnapshot4(existing);
    if (["cancelled", "canceled", "void", "failed", "rejected"].includes(balancePayment(existing, env).status)) throw httpError(409, "final_payment_not_payable");
    if (snapshot2.session_id !== sessionId) throw httpError(409, "final_payment_session_mismatch");
    if (snapshot2.stage !== "final") throw httpError(409, "final_payment_stage_mismatch");
    if (paymentVerified(existing) && balance > 0) throw httpError(409, "balance_after_final_review_required");
    if (!paymentVerified(existing) && snapshot2.amount_thb && Math.abs(snapshot2.amount_thb - balance) > 9e-3) {
      throw httpError(409, "final_payment_amount_mismatch");
    }
    await syncDerivedBalance(env, session.id, summary2);
    return {
      schema: "final_payment_intent_v1",
      activated: true,
      idempotent: true,
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_stage: "final",
      amount_due_thb: balance,
      final_payment_confirmed: paymentVerified(existing)
    };
  }
  if (!(balance > 0)) throw httpError(409, "no_amount_due");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const created = await createRecord3(env, paymentsTable5(env), {
    [field6(env.AT_PAYMENTS__PAYMENT_REF, PAYMENT_FIELDS5.paymentRef)]: paymentRef,
    [PAYMENT_FIELDS5.sessionId]: sessionId,
    [field6(env.AT_PAYMENTS__AMOUNT, PAYMENT_FIELDS5.amount)]: balance,
    [field6(env.AT_PAYMENTS__PAYMENT_STATUS, PAYMENT_FIELDS5.paymentStatus)]: "Pending",
    [field6(env.AT_PAYMENTS__PAYMENT_METHOD, PAYMENT_FIELDS5.paymentMethod)]: "PromptPay",
    [field6(env.AT_PAYMENTS__NOTES, PAYMENT_FIELDS5.notes)]: "Final balance activated when Model marked arrived.",
    [field6(env.AT_PAYMENTS__VERIFICATION_STATUS, PAYMENT_FIELDS5.verificationStatus)]: "pending_review",
    [field6(env.AT_PAYMENTS__PAYMENT_INTENT_STATUS, PAYMENT_FIELDS5.intentStatus)]: "Pending Confirmation",
    [field6(env.AT_PAYMENTS__CREATED_AT, PAYMENT_FIELDS5.createdAt)]: now,
    [PAYMENT_FIELDS5.paymentStage]: "final",
    [PAYMENT_FIELDS5.paymentType]: "final"
  });
  await syncDerivedBalance(env, session.id, summary2);
  return {
    schema: "final_payment_intent_v1",
    activated: true,
    idempotent: false,
    session_id: sessionId,
    payment_ref: paymentRef,
    payment_stage: "final",
    amount_due_thb: balance,
    final_payment_confirmed: false,
    payment_record_id: created?.id || null
  };
}
__name(ensureFinalPaymentIntent, "ensureFinalPaymentIntent");
async function finalPaymentSnapshot(env, sessionId) {
  const paymentRef = await stablePaymentRef(sessionId, "final");
  const payment = await findPaymentByRef(env, paymentRef, true);
  if (!payment?.id) {
    return {
      schema: "final_payment_status_v1",
      session_id: sessionId,
      payment_ref: paymentRef,
      payment_stage: "final",
      intent_exists: false,
      final_payment_confirmed: false
    };
  }
  const snapshot2 = paymentSnapshot4(payment);
  if (snapshot2.session_id !== sessionId) throw httpError(409, "final_payment_session_mismatch");
  return {
    schema: "final_payment_status_v1",
    session_id: sessionId,
    payment_ref: paymentRef,
    payment_stage: "final",
    amount_due_thb: snapshot2.amount_thb,
    intent_exists: true,
    final_payment_confirmed: paymentVerified(payment),
    final_payment_status: paymentVerified(payment) ? "final_payment_confirmed" : "final_payment_pending"
  };
}
__name(finalPaymentSnapshot, "finalPaymentSnapshot");
async function reconcileReviewedFinalPayment(request2, response, env = {}) {
  if (!response?.ok) return response;
  const body = await request2.clone().json().catch(() => null);
  const decision = code11(body?.decision);
  const stage2 = code11(body?.payment_stage || body?.stage || body?.payment_type);
  const sessionId = clean24(body?.session_id, 220);
  if (!(/* @__PURE__ */ new Set(["approve", "approved"])).has(decision) || stage2 !== "final" || !sessionId) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok) return response;
  try {
    const lifecycle = await promoteFinalPaymentLifecycle(env, sessionId);
    return rebuildJson2(response, { ...payload, final_payment_lifecycle: lifecycle });
  } catch (error2) {
    return json17({
      ok: false,
      authority: "payments-worker",
      error: "final_payment_lifecycle_reconcile_failed",
      detail: clean24(error2?.message || error2, 300),
      payment_review_committed: true,
      session_id: sessionId
    }, 502);
  }
}
__name(reconcileReviewedFinalPayment, "reconcileReviewedFinalPayment");
async function promoteFinalPaymentLifecycle(env, sessionId) {
  const session = await findSession5(env, sessionId, false);
  if (!session?.id) throw httpError(404, "session_not_found");
  const sessionFields2 = session.fields || {};
  const lifecycleField = resolveLifecycleField(sessionFields2);
  const current = code11(sessionFields2[lifecycleField]);
  if (current && current !== "final_payment_confirmed" && !FINAL_WAITING_STATES.has(current)) {
    throw httpError(409, "final_payment_lifecycle_conflict");
  }
  if (current !== "final_payment_confirmed") {
    await patchRecord2(env, sessionsTable3(env), session.id, {
      [lifecycleField]: "final_payment_confirmed"
    });
  }
  let jobUpdated = false;
  const job = await findBySessionId(env, jobsTable(env), sessionId, false).catch(() => null);
  if (job?.id) {
    const jobState = code11(job.fields?.status);
    if (!jobState || FINAL_WAITING_STATES.has(jobState) || jobState === "final_payment_confirmed") {
      if (jobState !== "final_payment_confirmed") {
        await patchRecord2(env, jobsTable(env), job.id, {
          status: "final_payment_confirmed",
          last_update_at: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      jobUpdated = true;
    }
  }
  return {
    ok: true,
    session_id: sessionId,
    state: "final_payment_confirmed",
    session_updated: current !== "final_payment_confirmed",
    job_updated: jobUpdated
  };
}
__name(promoteFinalPaymentLifecycle, "promoteFinalPaymentLifecycle");
function paymentSnapshot4(record) {
  const fields2 = record?.fields || {};
  return {
    payment_ref: clean24(fields2[PAYMENT_FIELDS5.paymentRef] || fields2["Payment Reference"] || fields2.payment_ref, 220),
    session_id: clean24(fields2[PAYMENT_FIELDS5.sessionId] || fields2.session_id, 220),
    amount_thb: positive2(fields2[PAYMENT_FIELDS5.amount] ?? fields2.amount_thb ?? fields2.amount),
    stage: code11(fields2[PAYMENT_FIELDS5.paymentStage] || fields2.payment_stage || fields2.payment_type)
  };
}
__name(paymentSnapshot4, "paymentSnapshot");
function paymentVerified(record) {
  return balancePayment(record).verified;
}
__name(paymentVerified, "paymentVerified");
async function syncDerivedBalance(env, sessionRecordId, summary2) {
  if (env.SESSION_PAID_PROJECTION_COORDINATOR) {
    const projection = await requestSessionPaidProjection(env, { session_id: summary2.session_id, stage: "final" });
    if (projection.status === "skipped" && projection.reason === "excluded_lane") {
    } else if (["updated", "unchanged"].includes(projection.status)) return;
    else throw httpError(503, "session_paid_projection_pending");
  }
  await patchRecord2(env, sessionsTable3(env), sessionRecordId, {
    [BALANCE_FIELDS.paidSum]: summary2.verified_paid_thb,
    [BALANCE_FIELDS.customerDue]: summary2.remaining_amount_thb
  });
}
__name(syncDerivedBalance, "syncDerivedBalance");
function resolveLifecycleField(fields2 = {}) {
  for (const candidate of ["session_state", "state", "status"]) {
    if (Object.prototype.hasOwnProperty.call(fields2, candidate)) return candidate;
  }
  return "status";
}
__name(resolveLifecycleField, "resolveLifecycleField");
async function findSession5(env, sessionId, byFieldId) {
  return findBySessionId(env, sessionsTable3(env), sessionId, byFieldId);
}
__name(findSession5, "findSession");
async function findBySessionId(env, table7, sessionId, byFieldId) {
  const url = airtableUrl3(env, table7);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{session_id}='${formulaValue(sessionId)}'`);
  if (byFieldId) url.searchParams.set("returnFieldsByFieldId", "true");
  const payload = await airtableRequest7(env, url.toString(), { method: "GET" });
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (records.length > 1) throw httpError(409, "session_id_ambiguous");
  return records[0] || null;
}
__name(findBySessionId, "findBySessionId");
async function findPaymentByRef(env, paymentRef, byFieldId) {
  const url = airtableUrl3(env, paymentsTable5(env));
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{Payment Reference}='${formulaValue(paymentRef)}'`);
  if (byFieldId) url.searchParams.set("returnFieldsByFieldId", "true");
  const payload = await airtableRequest7(env, url.toString(), { method: "GET" });
  const records = Array.isArray(payload?.records) ? payload.records : [];
  if (records.length > 1) throw httpError(409, "final_payment_ref_ambiguous");
  return records[0] || null;
}
__name(findPaymentByRef, "findPaymentByRef");
async function createRecord3(env, table7, fields2) {
  const payload = await airtableRequest7(env, airtableUrl3(env, table7).toString(), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: fields2 }], typecast: false })
  });
  const record = payload?.records?.[0];
  if (!record?.id) throw httpError(502, "airtable_create_malformed");
  return record;
}
__name(createRecord3, "createRecord");
async function patchRecord2(env, table7, recordId3, fields2) {
  return airtableRequest7(env, `${airtableUrl3(env, table7).toString()}/${encodeURIComponent(recordId3)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: fields2, typecast: false })
  });
}
__name(patchRecord2, "patchRecord");
async function airtableRequest7(env, url, init = {}) {
  requireAirtable10(env);
  const request2 = new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean24(env.AIRTABLE_API_KEY, 5e3)}`,
      "Content-Type": "application/json",
      ...init.headers || {}
    }
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request2) : await fetch(request2);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response.status >= 500 ? 503 : response.status, `airtable_${response.status}`);
  return payload;
}
__name(airtableRequest7, "airtableRequest");
function airtableUrl3(env, table7) {
  return new URL(`${AIRTABLE_API24}/${encodeURIComponent(clean24(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table7)}`);
}
__name(airtableUrl3, "airtableUrl");
function sessionsTable3(env) {
  return clean24(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
}
__name(sessionsTable3, "sessionsTable");
function paymentsTable5(env) {
  return clean24(env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ");
}
__name(paymentsTable5, "paymentsTable");
function jobsTable(env) {
  return clean24(env.AIRTABLE_TABLE_JOBS || "tbl0jxIjN8QYwGABX");
}
__name(jobsTable, "jobsTable");
function requireAirtable10(env) {
  if (!clean24(env.AIRTABLE_BASE_ID) || !clean24(env.AIRTABLE_API_KEY)) throw httpError(503, "airtable_not_ready");
}
__name(requireAirtable10, "requireAirtable");
async function serviceAuthed4(request2, env) {
  const direct = clean24(request2.headers.get("X-Internal-Token"), 5e3);
  const bearer = clean24(request2.headers.get("Authorization"), 5e3).replace(/^Bearer\s+/i, "");
  const candidate = direct || bearer;
  const expected = [
    clean24(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS, 5e3),
    clean24(env.AUTH_SERVICE_IMMIGRATE_TO_PAYMENTS, 5e3)
  ].filter(Boolean);
  if (!candidate || !expected.length) return false;
  for (const secret of expected) {
    if (await constantTimeEqual3(candidate, secret)) return true;
  }
  return false;
}
__name(serviceAuthed4, "serviceAuthed");
async function constantTimeEqual3(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(left || ""))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(right || "")))
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
__name(constantTimeEqual3, "constantTimeEqual");
function inferResponseHeaders(response) {
  const headers = new Headers(response?.headers || {});
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return headers;
}
__name(inferResponseHeaders, "inferResponseHeaders");
function rebuildJson2(response, payload) {
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers: inferResponseHeaders(response)
  });
}
__name(rebuildJson2, "rebuildJson");
function normalizePath9(value3) {
  const path = clean24(value3 || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
__name(normalizePath9, "normalizePath");
function field6(configured, fallback) {
  return clean24(configured, 120) || fallback;
}
__name(field6, "field");
function positive2(value3) {
  if (value3 == null || clean24(value3) === "") return null;
  const number2 = Number(String(value3).replace(/,/g, ""));
  return Number.isFinite(number2) && number2 > 0 ? number2 : null;
}
__name(positive2, "positive");
function code11(value3) {
  return clean24(value3, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(code11, "code");
function clean24(value3, max = 5e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max);
}
__name(clean24, "clean");
function json17(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-payment-authority": "payments-worker"
    }
  });
}
__name(json17, "json");

// ../shared/mmd-shop-fulfillment.mjs
var MMD_SHOP_FULFILLMENT_SCHEMA = "mmd_shop_fulfillment_v1";
var MMD_SHOP_FULFILLMENT_PREFIX = MMD_SHOP_FULFILLMENT_SCHEMA + "=";
var STATES = /* @__PURE__ */ new Set([
  "awaiting_payment",
  "confirmed",
  "preparing",
  "ready",
  "shipped",
  "delivered",
  "delivery_failed",
  "completed",
  "return_requested",
  "return_received",
  "refund_pending",
  "refunded",
  "cancelled"
]);
var DELIVERY_METHODS = /* @__PURE__ */ new Set(["delivery", "pickup"]);
function createMmdShopFulfillment(input = {}) {
  const now = isoNow();
  const shipping = input.shipping && typeof input.shipping === "object" ? input.shipping : {};
  return sanitizeFulfillment({
    schema: MMD_SHOP_FULFILLMENT_SCHEMA,
    state: "awaiting_payment",
    ...shipping,
    courier: "",
    tracking_number: "",
    fulfillment_note: "",
    shipping_notification_status: "",
    shipping_notification_key: "",
    shipping_notified_at: "",
    refund_reference: "",
    refund_method: "",
    refund_amount_thb: null,
    return_note: "",
    created_at: now,
    updated_at: now,
    confirmed_at: "",
    preparing_at: "",
    ready_at: "",
    shipped_at: "",
    delivered_at: "",
    delivery_failed_at: "",
    completed_at: "",
    return_requested_at: "",
    return_received_at: "",
    refund_pending_at: "",
    refunded_at: "",
    cancelled_at: ""
  });
}
__name(createMmdShopFulfillment, "createMmdShopFulfillment");
function readMmdShopFulfillment(notes) {
  const lines = String(notes || "").split(/\r?\n/);
  const line = lines.find((value3) => value3.startsWith(MMD_SHOP_FULFILLMENT_PREFIX));
  if (!line) return null;
  const encoded = line.slice(MMD_SHOP_FULFILLMENT_PREFIX.length);
  if (!encoded) return null;
  try {
    const decoded = decodeURIComponent(encoded);
    const parsed = JSON.parse(decoded);
    return sanitizeFulfillment(parsed);
  } catch {
    return null;
  }
}
__name(readMmdShopFulfillment, "readMmdShopFulfillment");
function writeMmdShopFulfillment(notes, fulfillment) {
  const value3 = sanitizeFulfillment({
    ...fulfillment && typeof fulfillment === "object" ? fulfillment : {},
    schema: MMD_SHOP_FULFILLMENT_SCHEMA,
    updated_at: isoNow()
  });
  const encoded = encodeURIComponent(JSON.stringify(value3));
  const line = MMD_SHOP_FULFILLMENT_PREFIX + encoded;
  const source = String(notes || "");
  const lines = source.split(/\r?\n/).filter((entry) => !entry.startsWith(MMD_SHOP_FULFILLMENT_PREFIX));
  lines.push(line);
  return lines.filter(Boolean).join("\n").slice(0, 12e3);
}
__name(writeMmdShopFulfillment, "writeMmdShopFulfillment");
function transitionMmdShopFulfillment(current, patch = {}) {
  const now = isoNow();
  const base = sanitizeFulfillment(current || {});
  const state = code12(patch.state || base.state || "awaiting_payment");
  if (!STATES.has(state)) throw fulfillmentError(400, "invalid_fulfillment_state");
  const next = sanitizeFulfillment({
    ...base,
    ...pickFulfillmentPatch(patch),
    schema: MMD_SHOP_FULFILLMENT_SCHEMA,
    state,
    updated_at: now
  });
  if (state === "confirmed" && !next.confirmed_at) next.confirmed_at = now;
  if (state === "preparing" && !next.preparing_at) next.preparing_at = now;
  if (state === "ready" && !next.ready_at) next.ready_at = now;
  if (state === "shipped" && !next.shipped_at) next.shipped_at = now;
  if (state === "delivered" && !next.delivered_at) next.delivered_at = now;
  if (state === "delivery_failed" && !next.delivery_failed_at) next.delivery_failed_at = now;
  if (state === "completed" && !next.completed_at) next.completed_at = now;
  if (state === "return_requested" && !next.return_requested_at) next.return_requested_at = now;
  if (state === "return_received" && !next.return_received_at) next.return_received_at = now;
  if (state === "refund_pending" && !next.refund_pending_at) next.refund_pending_at = now;
  if (state === "refunded" && !next.refunded_at) next.refunded_at = now;
  if (state === "cancelled" && !next.cancelled_at) next.cancelled_at = now;
  return next;
}
__name(transitionMmdShopFulfillment, "transitionMmdShopFulfillment");
function publicMmdShopFulfillment(value3, options = {}) {
  const item = sanitizeFulfillment(value3 || {});
  const includeAddress = options.includeAddress === true;
  const maskPhoneValue = options.maskPhone !== false;
  return {
    schema: MMD_SHOP_FULFILLMENT_SCHEMA,
    state: item.state || "awaiting_payment",
    delivery_method: item.delivery_method || null,
    recipient_name: item.recipient_name || null,
    phone: item.phone ? maskPhoneValue ? maskPhone(item.phone) : item.phone : null,
    address: includeAddress && item.delivery_method === "delivery" ? {
      address_line1: item.address_line1 || null,
      address_line2: item.address_line2 || null,
      subdistrict: item.subdistrict || null,
      district: item.district || null,
      province: item.province || null,
      postal_code: item.postal_code || null
    } : null,
    delivery_note: includeAddress ? item.delivery_note || null : null,
    courier: item.courier || null,
    tracking_number: item.tracking_number || null,
    fulfillment_note: item.fulfillment_note || null,
    shipping_notification_status: item.shipping_notification_status || null,
    shipping_notified_at: item.shipping_notified_at || null,
    refund_method: item.refund_method || null,
    refund_amount_thb: Number.isFinite(item.refund_amount_thb) ? item.refund_amount_thb : null,
    updated_at: item.updated_at || null,
    confirmed_at: item.confirmed_at || null,
    preparing_at: item.preparing_at || null,
    ready_at: item.ready_at || null,
    shipped_at: item.shipped_at || null,
    delivered_at: item.delivered_at || null,
    delivery_failed_at: item.delivery_failed_at || null,
    completed_at: item.completed_at || null,
    return_requested_at: item.return_requested_at || null,
    return_received_at: item.return_received_at || null,
    refund_pending_at: item.refund_pending_at || null,
    refunded_at: item.refunded_at || null,
    cancelled_at: item.cancelled_at || null
  };
}
__name(publicMmdShopFulfillment, "publicMmdShopFulfillment");
function pickFulfillmentPatch(patch) {
  const out = {};
  for (const key of [
    "delivery_method",
    "recipient_name",
    "phone",
    "address_line1",
    "address_line2",
    "subdistrict",
    "district",
    "province",
    "postal_code",
    "delivery_note",
    "courier",
    "tracking_number",
    "fulfillment_note",
    "shipping_notification_status",
    "shipping_notification_key",
    "shipping_notified_at",
    "refund_reference",
    "refund_method",
    "refund_amount_thb",
    "return_note"
  ]) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) out[key] = patch[key];
  }
  return out;
}
__name(pickFulfillmentPatch, "pickFulfillmentPatch");
function sanitizeFulfillment(value3) {
  const state = code12(value3?.state);
  const deliveryMethod = code12(value3?.delivery_method);
  return {
    schema: MMD_SHOP_FULFILLMENT_SCHEMA,
    state: STATES.has(state) ? state : "awaiting_payment",
    delivery_method: DELIVERY_METHODS.has(deliveryMethod) ? deliveryMethod : "",
    recipient_name: clean25(value3?.recipient_name, 180),
    phone: normalizePhone(value3?.phone),
    address_line1: clean25(value3?.address_line1, 500),
    address_line2: clean25(value3?.address_line2, 300),
    subdistrict: clean25(value3?.subdistrict, 180),
    district: clean25(value3?.district, 180),
    province: clean25(value3?.province, 180),
    postal_code: clean25(value3?.postal_code, 20).replace(/[^0-9]/g, "").slice(0, 5),
    delivery_note: clean25(value3?.delivery_note, 800),
    courier: clean25(value3?.courier, 180),
    tracking_number: clean25(value3?.tracking_number, 220),
    fulfillment_note: clean25(value3?.fulfillment_note, 1200),
    shipping_notification_status: clean25(value3?.shipping_notification_status, 80),
    shipping_notification_key: clean25(value3?.shipping_notification_key, 500),
    shipping_notified_at: clean25(value3?.shipping_notified_at, 80),
    refund_reference: clean25(value3?.refund_reference, 220),
    refund_method: clean25(value3?.refund_method, 120),
    refund_amount_thb: moneyOrNull(value3?.refund_amount_thb),
    return_note: clean25(value3?.return_note, 1200),
    created_at: clean25(value3?.created_at, 80),
    updated_at: clean25(value3?.updated_at, 80),
    confirmed_at: clean25(value3?.confirmed_at, 80),
    preparing_at: clean25(value3?.preparing_at, 80),
    ready_at: clean25(value3?.ready_at, 80),
    shipped_at: clean25(value3?.shipped_at, 80),
    delivered_at: clean25(value3?.delivered_at, 80),
    delivery_failed_at: clean25(value3?.delivery_failed_at, 80),
    completed_at: clean25(value3?.completed_at, 80),
    return_requested_at: clean25(value3?.return_requested_at, 80),
    return_received_at: clean25(value3?.return_received_at, 80),
    refund_pending_at: clean25(value3?.refund_pending_at, 80),
    refunded_at: clean25(value3?.refunded_at, 80),
    cancelled_at: clean25(value3?.cancelled_at, 80)
  };
}
__name(sanitizeFulfillment, "sanitizeFulfillment");
function maskPhone(value3) {
  const phone = normalizePhone(value3);
  if (phone.length <= 4) return phone;
  return phone.slice(0, 3) + "\u2022\u2022\u2022" + phone.slice(-3);
}
__name(maskPhone, "maskPhone");
function normalizePhone(value3) {
  return String(value3 ?? "").replace(/[^0-9+]/g, "").replace(/^\+66/, "0").replace(/\+/g, "").slice(0, 20);
}
__name(normalizePhone, "normalizePhone");
function moneyOrNull(value3) {
  if (value3 === null || value3 === void 0 || value3 === "") return null;
  const n = Number(value3);
  return Number.isFinite(n) && n >= 0 ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}
__name(moneyOrNull, "moneyOrNull");
function code12(value3) {
  return clean25(value3, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(code12, "code");
function clean25(value3, max = 5e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}
__name(clean25, "clean");
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(isoNow, "isoNow");
function fulfillmentError(status, message) {
  const error2 = new Error(message);
  error2.status = status;
  return error2;
}
__name(fulfillmentError, "fulfillmentError");

// ../shared/mmd-shop-stock-reservation.mjs
var TABLES = Object.freeze({
  orders: "tblr8lbi2wMuRM1N4",
  orderItems: "tbl37Iprxz4OLL65P",
  inventory: "tblwFgl4et1TOgtNn",
  movements: "tblASifwHdArNKQP2"
});
var ORDER_FIELDS = Object.freeze({
  orderId: "flde515MCoEq08YzU",
  orderStatus: "fldnCO3H5CpJoYmWD",
  paymentStatus: "fldUpDeLdO6D9OUcd",
  notes: "fldWG0u77XQ5W0wpT"
});
var ITEM_FIELDS = Object.freeze({
  order: "fldSVk92UcASTOuOK",
  product: "fld40mHWKpBthoO9T",
  quantity: "fldJkKWMZiVQ3g1a6",
  status: "flddJVVBAjVoyqcpY"
});
var INVENTORY_FIELDS = Object.freeze({
  product: "fldVc73xUxjrfSjHY",
  supplier: "fldrrEXHJeTPKXs0l",
  receivedDate: "fldR9ELxn6t06P7Lb",
  remaining: "fldvjoRuM1mrR6ItQ",
  unitCost: "fldP5LaRWkq0qBJVQ",
  remainingValue: "fldmFhct2jQmIT3gL",
  low: "fldYtzXtBvK3HuqQa",
  status: "fldZW2m1Xq8q0ZH9Z"
});
var MOVEMENT_FIELDS = Object.freeze({
  name: "fldahJshKJkBP8Z7H",
  batch: "fldjF7wcc65dJIxt8",
  product: "fldCRBzBDOsNo3jLM",
  supplier: "fldzf4Hm1bQ9HGb7C",
  type: "fld95ubumrh0GQCgj",
  quantity: "fldRoDWshlUAg8aOy",
  unitCost: "fldqY9wq6NUqnfvFc",
  date: "flddnpCisCrCJhyHM",
  referenceType: "fld6bdKAAa1sOYw0Q",
  referenceId: "flddxY12JXrNsAUpE",
  note: "fldmnXBNlVcDdvkPh"
});
var MMD_SHOP_RESERVATION_SCHEMA = "mmd_shop_reservation_v1";
var MMD_SHOP_RESERVATION_PREFIX = MMD_SHOP_RESERVATION_SCHEMA + "=";
function readMmdShopReservation(notes) {
  const line = String(notes || "").split(/\r?\n/).find((entry) => entry.startsWith(MMD_SHOP_RESERVATION_PREFIX));
  if (!line) return null;
  try {
    return sanitizeReservation(JSON.parse(decodeURIComponent(line.slice(MMD_SHOP_RESERVATION_PREFIX.length))));
  } catch {
    return null;
  }
}
__name(readMmdShopReservation, "readMmdShopReservation");
function writeMmdShopReservation(notes, reservation) {
  const cleanReservation = sanitizeReservation(reservation || {});
  const line = MMD_SHOP_RESERVATION_PREFIX + encodeURIComponent(JSON.stringify(cleanReservation));
  const lines = String(notes || "").split(/\r?\n/).filter((entry) => !entry.startsWith(MMD_SHOP_RESERVATION_PREFIX));
  lines.push(line);
  return lines.filter(Boolean).join("\n").slice(0, 16e3);
}
__name(writeMmdShopReservation, "writeMmdShopReservation");
function publicMmdShopReservation(value3) {
  const r = sanitizeReservation(value3 || {});
  return {
    schema: MMD_SHOP_RESERVATION_SCHEMA,
    state: r.state,
    created_at: r.created_at || null,
    expires_at: r.expires_at || null,
    committed_at: r.committed_at || null,
    released_at: r.released_at || null,
    release_reason: r.release_reason || null
  };
}
__name(publicMmdShopReservation, "publicMmdShopReservation");
function sanitizeReservation(value3) {
  const state = ["reserved", "payment_review", "committed", "released", "expired"].includes(code13(value3?.state)) ? code13(value3.state) : "reserved";
  return {
    schema: MMD_SHOP_RESERVATION_SCHEMA,
    order_id: clean26(value3?.order_id, 180),
    state,
    created_at: clean26(value3?.created_at, 80),
    expires_at: clean26(value3?.expires_at, 80),
    committed_at: clean26(value3?.committed_at, 80),
    released_at: clean26(value3?.released_at, 80),
    release_reason: clean26(value3?.release_reason, 180),
    order_record_id: validRecordId(value3?.order_record_id),
    payment_review_started_at: clean26(value3?.payment_review_started_at, 80),
    payment_review_key: clean26(value3?.payment_review_key, 500),
    payment_expiry_synced_at: clean26(value3?.payment_expiry_synced_at, 80),
    allocations: Array.isArray(value3?.allocations) ? value3.allocations.map((item) => ({
      product_id: validRecordId(item?.product_id),
      batch_id: validRecordId(item?.batch_id),
      supplier_ids: linkedIds2(item?.supplier_ids),
      quantity: Math.max(0, integer(item?.quantity)),
      unit_cost_thb: Math.max(0, number(item?.unit_cost_thb))
    })).filter((item) => item.product_id && item.batch_id && item.quantity > 0) : []
  };
}
__name(sanitizeReservation, "sanitizeReservation");
function validRecordId(value3) {
  const id = clean26(value3, 80);
  return /^rec[A-Za-z0-9]{14}$/.test(id) ? id : "";
}
__name(validRecordId, "validRecordId");
function linkedIds2(value3) {
  if (!Array.isArray(value3)) return [];
  return value3.map((item) => clean26(typeof item === "string" ? item : item?.id, 80)).filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
}
__name(linkedIds2, "linkedIds");
function code13(value3) {
  return clean26(value3, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(code13, "code");
function integer(value3) {
  const n = Number(value3);
  return Number.isInteger(n) ? n : 0;
}
__name(integer, "integer");
function number(value3) {
  const n = Number(value3);
  return Number.isFinite(n) ? n : 0;
}
__name(number, "number");
function clean26(value3, max = 5e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}
__name(clean26, "clean");

// shop-payment-v1.js
var AIRTABLE_API25 = "https://api.airtable.com/v0";
var SHOP_INTENT_PATH = "/v1/pay/shop-intent";
var SHOP_EXPIRE_INTENT_PATH = "/v1/internal/shop/expire-intent";
var SHOP_REFUND_CONFIRM_PATH = "/v1/internal/shop/refund-confirm";
var SHOP_STAGE = "shop";
var TABLES2 = Object.freeze({
  orders: "tblr8lbi2wMuRM1N4",
  orderItems: "tbl37Iprxz4OLL65P",
  payments: "tblWGGJJOx5eBvBZJ"
});
var ORDER_FIELDS2 = Object.freeze({
  orderId: "flde515MCoEq08YzU",
  orderStatus: "fldnCO3H5CpJoYmWD",
  paymentStatus: "fldUpDeLdO6D9OUcd",
  total: "fldYIwMzRJdKdznkY",
  notes: "fldWG0u77XQ5W0wpT"
});
var ITEM_FIELDS2 = Object.freeze({
  name: "fldLR9aIu2m6DTr2e",
  order: "fldSVk92UcASTOuOK",
  quantity: "fldJkKWMZiVQ3g1a6",
  price: "fldm746RgAwIbXYL7",
  lineTotal: "fldr7KTPoSbnblo5I",
  status: "flddJVVBAjVoyqcpY"
});
var PAYMENT_FIELDS6 = Object.freeze({
  paymentRef: "fldOO6SY49iDw8VBZ",
  paymentDate: "fld3yAwxIu2dkw7fO",
  amount: "fldvCSwrUW8OMAooS",
  status: "fldEJ1hmm7KwWuI6q",
  method: "fldsblzIn0wzan3c9",
  notes: "fldjsZIKoJPawlb2u",
  verification: "fldJ7a0Ube9F0bmRy",
  intentStatus: "fld04fr3bRJTohO6y",
  createdAt: "flduxcPpowBxEZSLu",
  source: "flduqtlX4PuOAJbFC",
  sessionId: "fld2wdhBvc8xrV6y5"
});
function isShopIntentRequest(path, method) {
  return normalizePath10(path) === SHOP_INTENT_PATH && ["POST", "OPTIONS"].includes(String(method || "POST").toUpperCase());
}
__name(isShopIntentRequest, "isShopIntentRequest");
async function handleShopRefundConfirm(request2, env) {
  if (normalizePath10(new URL(request2.url).pathname) !== SHOP_REFUND_CONFIRM_PATH) return null;
  if (request2.method.toUpperCase() !== "POST") return json18({ ok: false, error: "method_not_allowed" }, 405, request2, env);
  const expected = text16(env.INTERNAL_TOKEN, 5e3);
  const supplied = text16(
    request2.headers.get("x-internal-token") || request2.headers.get("authorization") || "",
    5e3
  ).replace(/^Bearer\s+/i, "");
  if (!expected || supplied !== expected) return json18({ ok: false, error: "internal_auth_required" }, 401, request2, env);
  const body = await request2.json().catch(() => null);
  const orderId = text16(body?.order_id || body?.session_id, 180);
  const refundReference = text16(body?.refund_reference, 220);
  const refundMethod = text16(body?.refund_method, 120);
  const refundAmount = positive3(body?.refund_amount_thb ?? body?.amount_thb ?? body?.amount);
  if (!orderId) return json18({ ok: false, error: "order_id_required" }, 400, request2, env);
  if (!refundReference) return json18({ ok: false, error: "refund_reference_required" }, 400, request2, env);
  if (!refundMethod) return json18({ ok: false, error: "refund_method_required" }, 400, request2, env);
  if (refundAmount == null) return json18({ ok: false, error: "refund_amount_required" }, 400, request2, env);
  try {
    const order = await findOrderByOrderId(env, orderId);
    if (!order?.id) throw httpError(404, "shop_order_not_found");
    const shopBrand = resolvePersistedShopBrand(order);
    const orderFields = order.fields || {};
    const orderPaymentStatus = code14(orderFields[ORDER_FIELDS2.paymentStatus]);
    const orderTotal = positive3(orderFields[ORDER_FIELDS2.total]);
    if (orderTotal == null) throw httpError(409, "shop_order_total_missing");
    if (Math.abs(orderTotal - refundAmount) > 9e-3) throw httpError(409, "full_refund_amount_must_match_order_total");
    const payment = await findPaymentByOrderId(env, orderId);
    if (!payment?.id) throw httpError(404, "shop_payment_not_found");
    const paymentFields3 = payment.fields || {};
    const paymentStatus = code14(paymentFields3[PAYMENT_FIELDS6.status]);
    if (orderPaymentStatus === "refunded" || paymentStatus === "refunded") {
      return json18({
        ok: true,
        authority: "payments-worker",
        schema: "mmd_shop_refund_confirmation_v1",
        order_id: orderId,
        payment_status: "refunded",
        refund_reference: refundReference,
        refund_method: refundMethod,
        refund_amount_thb: refundAmount,
        idempotent: true
      }, 200, request2, env);
    }
    if (orderPaymentStatus !== "paid" || !["paid", "full_payment", "verified", "completed"].includes(paymentStatus)) {
      throw httpError(409, "shop_payment_not_refundable");
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const paymentNotes = appendNote(
      paymentFields3[PAYMENT_FIELDS6.notes],
      `shop_refund_confirmed_at=${now}; order_id=${orderId}; refund_reference=${refundReference}; refund_method=${refundMethod}; refund_amount_thb=${refundAmount}; authority=payments-worker`
    );
    await patchRecord3(env, table6(env, "payments"), payment.id, {
      [PAYMENT_FIELDS6.status]: "Refunded",
      [PAYMENT_FIELDS6.verification]: "verified",
      [PAYMENT_FIELDS6.intentStatus]: "Refunded",
      [PAYMENT_FIELDS6.notes]: paymentNotes
    });
    const orderNotes = appendNote(
      orderFields[ORDER_FIELDS2.notes],
      `refund_confirmed_at=${now}; refund_reference=${refundReference}; refund_method=${refundMethod}; refund_amount_thb=${refundAmount}; verified_by=payments-worker`
    );
    await patchRecord3(env, table6(env, "orders"), order.id, {
      [ORDER_FIELDS2.paymentStatus]: "refunded",
      [ORDER_FIELDS2.notes]: orderNotes
    });
    return json18({
      ok: true,
      authority: "payments-worker",
      schema: "mmd_shop_refund_confirmation_v1",
      order_id: orderId,
      payment_status: "refunded",
      refund_reference: refundReference,
      refund_method: refundMethod,
      refund_amount_thb: refundAmount,
      idempotent: false
    }, 200, request2, env);
  } catch (error2) {
    return json18({
      ok: false,
      authority: "payments-worker",
      error: text16(error2?.message || error2 || "shop_refund_confirmation_failed", 300)
    }, Number(error2?.status || 500), request2, env);
  }
}
__name(handleShopRefundConfirm, "handleShopRefundConfirm");
async function handleShopIntentExpiry(request2, env) {
  if (normalizePath10(new URL(request2.url).pathname) !== SHOP_EXPIRE_INTENT_PATH) return null;
  if (request2.method.toUpperCase() !== "POST") return json18({ ok: false, error: "method_not_allowed" }, 405, request2, env);
  const expected = text16(env.INTERNAL_TOKEN, 5e3);
  const supplied = text16(
    request2.headers.get("x-internal-token") || request2.headers.get("authorization") || "",
    5e3
  ).replace(/^Bearer\s+/i, "");
  if (!expected || supplied !== expected) return json18({ ok: false, error: "internal_auth_required" }, 401, request2, env);
  const body = await request2.json().catch(() => null);
  const orderId = text16(body?.order_id || body?.session_id, 180);
  if (!orderId) return json18({ ok: false, error: "order_id_required" }, 400, request2, env);
  try {
    const payment = await findPaymentByOrderId(env, orderId);
    if (!payment?.id) {
      await markOrderPaymentExpirySynced(env, orderId);
      return json18({ ok: true, authority: "payments-worker", order_id: orderId, expired: false, reason: "payment_not_found" }, 200, request2, env);
    }
    const fields2 = payment.fields || {};
    const paymentStatus = code14(fields2[PAYMENT_FIELDS6.status]);
    const intentStatus = code14(fields2[PAYMENT_FIELDS6.intentStatus]);
    if (paymentStatus === "paid" || intentStatus === "confirmed") {
      return json18({
        ok: false,
        authority: "payments-worker",
        order_id: orderId,
        error: "payment_already_paid_expiry_conflict",
        manual_review_required: true
      }, 409, request2, env);
    }
    if (intentStatus === "cancelled") {
      await markOrderPaymentExpirySynced(env, orderId);
      return json18({ ok: true, authority: "payments-worker", order_id: orderId, expired: true, idempotent: true }, 200, request2, env);
    }
    const notes = appendNote(
      fields2[PAYMENT_FIELDS6.notes],
      `shop_reservation_expired_at=${(/* @__PURE__ */ new Date()).toISOString()}; order_id=${orderId}; expired_by=payments-worker`
    );
    await patchRecord3(env, table6(env, "payments"), payment.id, {
      [PAYMENT_FIELDS6.intentStatus]: "Cancelled",
      [PAYMENT_FIELDS6.notes]: notes
    });
    await markOrderPaymentExpirySynced(env, orderId);
    return json18({
      ok: true,
      authority: "payments-worker",
      order_id: orderId,
      expired: true,
      intent_status: "cancelled"
    }, 200, request2, env);
  } catch (error2) {
    return json18({ ok: false, authority: "payments-worker", error: text16(error2?.message || error2, 300) }, Number(error2?.status || 500), request2, env);
  }
}
__name(handleShopIntentExpiry, "handleShopIntentExpiry");
async function handleShopIntent(request2, env) {
  if (request2.method.toUpperCase() === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders3(request2, env) });
  }
  if (request2.method.toUpperCase() !== "POST") return json18({ ok: false, error: "method_not_allowed" }, 405, request2, env);
  const body = await request2.json().catch(() => null);
  try {
    const orderId = text16(body?.order_id || body?.session_id, 180);
    const amount3 = positive3(body?.amount ?? body?.amount_thb);
    const email5 = text16(body?.member_email || body?.email, 320).toLowerCase();
    if (!orderId) throw httpError(400, "order_id_required");
    if (amount3 == null) throw httpError(400, "amount_required");
    const order = await findOrderByOrderId(env, orderId);
    if (!order?.id) throw httpError(404, "shop_order_not_found");
    const shopBrand = resolvePersistedShopBrand(order);
    const orderStatus = code14(order.fields?.[ORDER_FIELDS2.orderStatus]);
    const orderPaymentStatus = code14(order.fields?.[ORDER_FIELDS2.paymentStatus]);
    const reservation = readMmdShopReservation(order.fields?.[ORDER_FIELDS2.notes]);
    if (orderStatus === "cancelled") throw httpError(409, "shop_order_cancelled");
    if (reservation && ["expired", "released"].includes(reservation.state)) throw httpError(409, "shop_order_reservation_expired");
    if (reservation?.state === "reserved" && Date.parse(reservation.expires_at || "") <= Date.now() && orderPaymentStatus !== "paid") {
      throw httpError(409, "shop_order_reservation_expired");
    }
    const orderTotal = positive3(order.fields?.[ORDER_FIELDS2.total]);
    if (orderTotal == null || Math.abs(orderTotal - amount3) > 9e-3) throw httpError(409, "shop_order_amount_mismatch");
    const paymentRef = await stableShopPaymentRef(orderId);
    const existing = await findPaymentByRef2(env, paymentRef);
    if (!existing?.id) {
      await createPaymentRecord(env, {
        paymentRef,
        orderId,
        amount: amount3,
        email: email5,
        shopBrand
      });
    }
    const now = Math.floor(Date.now() / 1e3);
    const claims = {
      kind: "customer_confirm",
      role: "customer",
      session_id: orderId,
      payment_ref: paymentRef,
      payment_type: SHOP_STAGE,
      shop_brand: shopBrand.key,
      iat: now,
      exp: now + getConfirmTokenTtlSeconds(env)
    };
    const token4 = await signConfirmToken(claims, signingSecret2(env));
    await createConfirmTokenRecord(env, token4, claims);
    return json18({
      ok: true,
      authority: "payments-worker",
      schema: "mmd_shop_payment_intent_v1",
      shop_brand: shopBrand.key,
      shop_name: shopBrand.publicName,
      payment_stage: SHOP_STAGE,
      payment_ref: paymentRef,
      session_id: orderId,
      order_id: orderId,
      amount: amount3,
      status: "pending",
      verification_status: "pending",
      customer_t: token4,
      customer_payment_url: `https://mmdbkk.com/pay/checkout?t=${encodeURIComponent(token4)}`,
      payment_surface: "public",
      official_verification_required: true
    }, 200, request2, env);
  } catch (error2) {
    return json18({ ok: false, authority: "payments-worker", error: text16(error2?.message || error2, 300) }, Number(error2?.status || 500), request2, env);
  }
}
__name(handleShopIntent, "handleShopIntent");
async function maybeHandleShopConfirmationDetails(request2, env) {
  if (request2.method.toUpperCase() !== "POST") return null;
  const body = await request2.clone().json().catch(() => null);
  const token4 = text16(body?.t || body?.token, 12e3);
  if (!token4) return null;
  let claims;
  try {
    claims = await verifyConfirmToken(env, token4, { expectedRole: "customer" });
  } catch {
    return null;
  }
  if (text16(claims?.payment_type, 80).toLowerCase() !== SHOP_STAGE) return null;
  try {
    const [order, payment] = await Promise.all([
      findOrderByOrderId(env, claims.session_id),
      findPaymentByRef2(env, claims.payment_ref)
    ]);
    if (!order?.id) throw httpError(404, "shop_order_not_found");
    const shopBrand = resolvePersistedShopBrand(order);
    if (!payment?.id) throw httpError(404, "shop_payment_not_found");
    const total = positive3(order.fields?.[ORDER_FIELDS2.total]);
    const orderItems = await findOrderItems(env, order.id);
    const reservation = readMmdShopReservation(order.fields?.[ORDER_FIELDS2.notes]);
    const reservationExpired = Boolean(
      reservation && (["expired", "released"].includes(reservation.state) || reservation.state === "reserved" && Number.isFinite(Date.parse(reservation.expires_at || "")) && Date.parse(reservation.expires_at || "") <= Date.now())
    );
    const paymentFields3 = payment.fields || {};
    const paymentStatus = code14(paymentFields3[PAYMENT_FIELDS6.status]);
    const verificationStatus = code14(paymentFields3[PAYMENT_FIELDS6.verification]);
    const intentStatus = code14(paymentFields3[PAYMENT_FIELDS6.intentStatus]);
    const verified = ["paid", "full_payment", "verified", "completed"].includes(paymentStatus) || verificationStatus === "verified";
    const proofReceived = ["manual_slip_evidence_received", "pending_review", "submitted", "reviewing"].includes(intentStatus);
    return json18({
      ok: true,
      authority: "payments-worker",
      schema: "confirmation_details_v1",
      role: "customer",
      session_id: claims.session_id,
      payment_ref: claims.payment_ref,
      payment_type: SHOP_STAGE,
      session_status: reservationExpired ? "cancelled" : text16(order.fields?.[ORDER_FIELDS2.orderStatus], 80) || "draft",
      payment_status: text16(order.fields?.[ORDER_FIELDS2.paymentStatus], 80) || "pending",
      shop_brand: shopBrand.key,
      shop_name: shopBrand.publicName,
      client_name: `${shopBrand.publicName} Customer`,
      model_name: shopBrand.publicName,
      job_type: `${shopBrand.publicName} Order`,
      job_date: null,
      start_time: null,
      end_time: null,
      location_name: shopBrand.publicName,
      google_map_url: null,
      vip_detail: null,
      created_at: null,
      amount_thb: total,
      pricing: {
        full_price_thb: total,
        discount_mode: "none",
        discount_percent: null,
        discount_thb: 0,
        net_price_thb: total,
        deposit_basis_thb: total,
        deposit_percent: 100,
        deposit_due_thb: total,
        deposit_received_thb: verified ? total : 0,
        balance_thb: verified ? 0 : total
      },
      payment: {
        schema: "customer_payment_display_v1",
        stage: SHOP_STAGE,
        method: normalizeMethod(paymentFields3[PAYMENT_FIELDS6.method]),
        amount_due_thb: verified || reservationExpired ? 0 : total,
        qr_url: null,
        proof_status_available: true,
        proof_received: proofReceived,
        verified,
        accepting_payment: !verified && !reservationExpired
      },
      shop_order: {
        schema: "mmd_shop_order_payment_context_v1",
        shop_brand: shopBrand.key,
        shop_name: shopBrand.publicName,
        order_id: claims.session_id,
        order_record_id: order.id,
        items: orderItems.map(safeShopOrderItem),
        fulfillment: (() => {
          const value3 = readMmdShopFulfillment(order.fields?.[ORDER_FIELDS2.notes]);
          return value3 ? publicMmdShopFulfillment(value3) : null;
        })(),
        reservation: (() => {
          return reservation ? publicMmdShopReservation(reservation) : null;
        })()
      }
    }, 200, request2, env);
  } catch (error2) {
    return json18({ ok: false, authority: "payments-worker", error: text16(error2?.message || error2, 300) }, Number(error2?.status || 500), request2, env);
  }
}
__name(maybeHandleShopConfirmationDetails, "maybeHandleShopConfirmationDetails");
async function enrichShopConfirmVerify(request2, response, env) {
  if (!response?.ok) return response;
  const payload = await response.clone().json().catch(() => null);
  const claims = payload?.claims;
  const paymentType = code14(claims?.payment_type || claims?.payment_stage);
  if (!payload?.ok || paymentType !== SHOP_STAGE) return response;
  const body = await request2.clone().json().catch(() => null);
  const token4 = text16(body?.t || body?.token, 12e3);
  if (!token4) return response;
  const detailsRequest = new Request(new URL("/v1/confirm/details", request2.url), {
    method: "POST",
    headers: request2.headers,
    body: JSON.stringify({ t: token4, expected_role: "customer" })
  });
  const detailsResponse = await maybeHandleShopConfirmationDetails(detailsRequest, env);
  if (!detailsResponse) return response;
  const details = await detailsResponse.clone().json().catch(() => null);
  if (!detailsResponse.ok || !details?.ok) {
    return json18({
      ok: false,
      authority: "payments-worker",
      error: details?.error || "shop_confirmation_details_unavailable"
    }, detailsResponse.status || 409, request2, env);
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-shop-verify", "enriched");
  return new Response(JSON.stringify({
    ...payload,
    payment_status: details.payment_status,
    session_status: details.session_status,
    claims: {
      ...claims,
      payment_type: SHOP_STAGE,
      payment_status: details.payment_status,
      session_status: details.session_status,
      amount_thb: details.amount_thb,
      shop_brand: details.shop_brand,
      shop_name: details.shop_name,
      client_name: details.client_name,
      model_name: details.model_name,
      job_type: details.job_type,
      location_name: details.location_name,
      shop_order: details.shop_order,
      payment: details.payment
    }
  }), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(enrichShopConfirmVerify, "enrichShopConfirmVerify");
async function preflightReviewedShopPayment(request2, env) {
  const body = await request2.clone().json().catch(() => null);
  const stage2 = code14(body?.payment_stage || body?.stage || body?.payment_type);
  if (stage2 !== SHOP_STAGE) return null;
  const orderId = text16(body?.session_id || body?.order_id, 180);
  if (!orderId) return json18({ ok: false, authority: "payments-worker", error: "shop_order_id_required" }, 400, request2, env);
  try {
    const order = await findOrderByOrderId(env, orderId);
    if (!order?.id) throw httpError(404, "shop_order_not_found");
    const shopBrand = resolvePersistedShopBrand(order);
    const orderStatus = code14(order.fields?.[ORDER_FIELDS2.orderStatus]);
    const paymentStatus = code14(order.fields?.[ORDER_FIELDS2.paymentStatus]);
    const reservation = readMmdShopReservation(order.fields?.[ORDER_FIELDS2.notes]);
    if (paymentStatus === "paid") return null;
    if (orderStatus === "cancelled") throw httpError(409, "shop_order_cancelled");
    if (reservation && ["expired", "released"].includes(reservation.state)) {
      throw httpError(409, "shop_order_reservation_expired");
    }
    if (reservation?.state === "reserved") {
      const expires = Date.parse(reservation.expires_at || "");
      if (Number.isFinite(expires) && expires <= Date.now()) {
        throw httpError(409, "shop_order_reservation_expired");
      }
    }
    if (reservation && reservation.state !== "committed") {
      const reviewKey = paymentReviewKey(body, orderId);
      await mutateReservationThroughShopWorker(env, "claim-payment", reservation, reviewKey, "");
    }
    return null;
  } catch (error2) {
    return json18({
      ok: false,
      authority: "payments-worker",
      error: text16(error2?.message || error2 || "shop_payment_preflight_failed", 300),
      payment_committed: false
    }, Number(error2?.status || 409), request2, env);
  }
}
__name(preflightReviewedShopPayment, "preflightReviewedShopPayment");
async function reconcileReviewedShopPayment(request2, response, env) {
  const body = await request2.clone().json().catch(() => null);
  const stage2 = code14(body?.payment_stage || body?.stage || body?.payment_type);
  if (stage2 !== SHOP_STAGE) return response;
  const orderId = text16(body?.session_id || body?.order_id, 180);
  if (!orderId) return response;
  const reviewKey = paymentReviewKey(body, orderId);
  const payload = response ? await response.clone().json().catch(() => null) : null;
  if (!response?.ok || !payload?.ok) {
    try {
      const order = await findOrderByOrderId(env, orderId);
      const reservation = readMmdShopReservation(order?.fields?.[ORDER_FIELDS2.notes]);
      if (reservation?.state === "payment_review") {
        await mutateReservationThroughShopWorker(env, "abort-payment-claim", reservation, reviewKey, "review_not_committed");
      }
    } catch (error2) {
      console.error("MMD Shop payment claim abort failed:", error2);
    }
    return response;
  }
  try {
    const order = await findOrderByOrderId(env, orderId);
    if (!order?.id) throw httpError(404, "shop_order_not_found");
    const shopBrand = resolvePersistedShopBrand(order);
    const existingReservation = readMmdShopReservation(order.fields?.[ORDER_FIELDS2.notes]);
    let committedReservation = existingReservation;
    if (existingReservation && ["reserved", "payment_review"].includes(existingReservation.state)) {
      const committed = await commitReservationThroughShopWorker(env, existingReservation);
      committedReservation = committed.reservation;
    } else if (existingReservation && existingReservation.state !== "committed") {
      throw httpError(409, `shop_reservation_not_committable:${existingReservation.state}`);
    }
    const paymentAuditNote = appendNote(
      order.fields?.[ORDER_FIELDS2.notes],
      `payment_verified_at=${(/* @__PURE__ */ new Date()).toISOString()}; payment_ref=${text16(body?.payment_ref || body?.transaction_ref, 220)}; verified_by=payments-worker`
    );
    const existingFulfillment = readMmdShopFulfillment(order.fields?.[ORDER_FIELDS2.notes]) || createMmdShopFulfillment();
    const confirmedFulfillment = transitionMmdShopFulfillment(existingFulfillment, { state: "confirmed" });
    const fulfillmentNotes = writeMmdShopFulfillment(paymentAuditNote, confirmedFulfillment);
    const orderNotes = committedReservation ? writeMmdShopReservation(fulfillmentNotes, committedReservation) : fulfillmentNotes;
    await patchRecord3(env, table6(env, "orders"), order.id, {
      [ORDER_FIELDS2.orderStatus]: "confirmed",
      [ORDER_FIELDS2.paymentStatus]: "paid",
      [ORDER_FIELDS2.notes]: orderNotes
    });
    const items = await findOrderItems(env, order.id);
    await Promise.all(items.map(
      (item) => patchRecord3(env, table6(env, "orderItems"), item.id, { [ITEM_FIELDS2.status]: "confirmed" })
    ));
    const shopNotification = await notifyShopPayment(env, {
      order,
      orderId,
      paymentRef: text16(body?.payment_ref || body?.transaction_ref, 220),
      amount: positive3(body?.amount_thb ?? body?.amount) || positive3(order.fields?.[ORDER_FIELDS2.total]) || 0
    }).catch(() => ({ ok: false, reason: "shop_payment_notification_failed" }));
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("x-mmd-shop-payment", "confirmed");
    return new Response(JSON.stringify({
      ...payload,
      shop_order_settlement: {
        ok: true,
        order_id: orderId,
        order_record_id: order.id,
        order_status: "confirmed",
        payment_status: "paid",
        items_confirmed: items.length,
        shop_brand: shopBrand.key,
        notification: shopNotification,
        fulfillment: publicMmdShopFulfillment(confirmedFulfillment),
        reservation: committedReservation ? publicMmdShopReservation(committedReservation) : null,
        inventory_out_committed: committedReservation ? committedReservation.state === "committed" : null
      }
    }), { status: response.status, headers });
  } catch (error2) {
    return json18({
      ok: false,
      authority: "payments-worker",
      error: text16(error2?.message || error2 || "shop_settlement_failed", 300),
      payment_committed: true,
      shop_order_reconcile_required: true
    }, Number(error2?.status || 502), request2, env);
  }
}
__name(reconcileReviewedShopPayment, "reconcileReviewedShopPayment");
function paymentReviewKey(body, orderId) {
  return text16(body?.payment_ref || body?.transaction_ref || orderId, 500) || orderId;
}
__name(paymentReviewKey, "paymentReviewKey");
async function mutateReservationThroughShopWorker(env, action, reservation, reviewKey = "", reason = "") {
  if (!env.MMD_SHOP_WORKER?.fetch) throw httpError(503, "mmd_shop_worker_binding_missing");
  const token4 = text16(env.INTERNAL_TOKEN, 5e3);
  if (!token4) throw httpError(503, "internal_token_not_configured");
  const allowed = /* @__PURE__ */ new Set(["claim-payment", "abort-payment-claim", "commit"]);
  if (!allowed.has(action)) throw httpError(500, "invalid_reservation_mutation_action");
  const response = await env.MMD_SHOP_WORKER.fetch(
    `https://himai-chat-worker.internal/mmd-shop/internal/reservation/${action}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": token4
      },
      body: JSON.stringify({
        reservation,
        review_key: reviewKey || void 0,
        reason: reason || void 0
      })
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true || !data.reservation) {
    throw httpError(response.status || 502, data.error || `reservation_${action}_failed`);
  }
  return data;
}
__name(mutateReservationThroughShopWorker, "mutateReservationThroughShopWorker");
async function commitReservationThroughShopWorker(env, reservation) {
  return mutateReservationThroughShopWorker(env, "commit", reservation);
}
__name(commitReservationThroughShopWorker, "commitReservationThroughShopWorker");
async function createPaymentRecord(env, input) {
  return createRecord4(env, table6(env, "payments"), {
    [PAYMENT_FIELDS6.paymentRef]: input.paymentRef,
    [PAYMENT_FIELDS6.paymentDate]: bangkokDate(),
    [PAYMENT_FIELDS6.amount]: input.amount,
    [PAYMENT_FIELDS6.status]: "Pending",
    [PAYMENT_FIELDS6.method]: "PromptPay",
    [PAYMENT_FIELDS6.notes]: `schema=mmd_shop_payment_v1; order_id=${input.orderId}; shop_brand=${input.shopBrand?.key || "mmd-shop"}; payment_stage=shop; official_verification_required=true${input.email ? `; customer_email=${input.email}` : ""}`,
    [PAYMENT_FIELDS6.verification]: "pending_review",
    [PAYMENT_FIELDS6.intentStatus]: "Pending Confirmation",
    [PAYMENT_FIELDS6.createdAt]: (/* @__PURE__ */ new Date()).toISOString(),
    [PAYMENT_FIELDS6.source]: "web_pay",
    [PAYMENT_FIELDS6.sessionId]: input.orderId
  });
}
__name(createPaymentRecord, "createPaymentRecord");
async function findOrderByOrderId(env, orderId) {
  return findFirst3(env, table6(env, "orders"), `{Order ID}='${formulaValue(orderId)}'`);
}
__name(findOrderByOrderId, "findOrderByOrderId");
async function markOrderPaymentExpirySynced(env, orderId) {
  const order = await findOrderByOrderId(env, orderId);
  if (!order?.id) return false;
  const reservation = readMmdShopReservation(order.fields?.[ORDER_FIELDS2.notes]);
  if (!reservation || reservation.state !== "expired") return false;
  if (reservation.payment_expiry_synced_at) return true;
  const next = {
    ...reservation,
    payment_expiry_synced_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  await patchRecord3(env, table6(env, "orders"), order.id, {
    [ORDER_FIELDS2.notes]: writeMmdShopReservation(order.fields?.[ORDER_FIELDS2.notes], next)
  });
  return true;
}
__name(markOrderPaymentExpirySynced, "markOrderPaymentExpirySynced");
async function findPaymentByOrderId(env, orderId) {
  const baseId2 = text16(env.AIRTABLE_BASE_ID, 100);
  const apiKey = airtableToken2(env);
  const tableId = table6(env, "payments");
  let offset = "";
  let pages = 0;
  do {
    const url = new URL(`${AIRTABLE_API25}/${baseId2}/${encodeURIComponent(tableId)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const fieldId of [
      PAYMENT_FIELDS6.sessionId,
      PAYMENT_FIELDS6.status,
      PAYMENT_FIELDS6.intentStatus,
      PAYMENT_FIELDS6.notes,
      PAYMENT_FIELDS6.paymentRef
    ]) url.searchParams.append("fields[]", fieldId);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${apiKey}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(502, "shop_payment_lookup_failed");
    const found = (Array.isArray(data.records) ? data.records : []).find(
      (record) => text16(record.fields?.[PAYMENT_FIELDS6.sessionId], 180) === orderId
    );
    if (found) return found;
    offset = text16(data.offset, 300);
    pages += 1;
  } while (offset && pages < 20);
  return null;
}
__name(findPaymentByOrderId, "findPaymentByOrderId");
async function findPaymentByRef2(env, paymentRef) {
  return findFirst3(env, table6(env, "payments"), `{Payment Reference}='${formulaValue(paymentRef)}'`);
}
__name(findPaymentByRef2, "findPaymentByRef");
async function findOrderItems(env, orderRecordId) {
  const baseId2 = text16(env.AIRTABLE_BASE_ID, 100);
  const apiKey = airtableToken2(env);
  const tableId = table6(env, "orderItems");
  const matches2 = [];
  let offset = "";
  let pages = 0;
  do {
    const url = new URL(`${AIRTABLE_API25}/${baseId2}/${encodeURIComponent(tableId)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const fieldId of Object.values(ITEM_FIELDS2)) url.searchParams.append("fields[]", fieldId);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${apiKey}` } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw httpError(502, "shop_order_items_lookup_failed");
    for (const record of Array.isArray(data.records) ? data.records : []) {
      const linked = Array.isArray(record.fields?.[ITEM_FIELDS2.order]) ? record.fields[ITEM_FIELDS2.order] : [];
      if (linked.includes(orderRecordId)) matches2.push(record);
    }
    offset = text16(data.offset, 300);
    pages += 1;
  } while (offset && pages < 20);
  return matches2;
}
__name(findOrderItems, "findOrderItems");
function safeShopOrderItem(record) {
  const fields2 = record?.fields || {};
  const quantity = numberOrNull3(fields2[ITEM_FIELDS2.quantity]) || 0;
  const unitPrice = numberOrNull3(fields2[ITEM_FIELDS2.price]);
  const lineTotal = numberOrNull3(fields2[ITEM_FIELDS2.lineTotal]);
  return {
    item_name: text16(fields2[ITEM_FIELDS2.name], 240) || "MMD Shop Item",
    quantity,
    unit_price_thb: unitPrice,
    line_total_thb: lineTotal,
    status: code14(fields2[ITEM_FIELDS2.status]) || "draft"
  };
}
__name(safeShopOrderItem, "safeShopOrderItem");
function numberOrNull3(value3) {
  if (value3 === null || value3 === void 0 || value3 === "") return null;
  const n = Number(value3);
  return Number.isFinite(n) ? n : null;
}
__name(numberOrNull3, "numberOrNull");
async function findFirst3(env, tableId, formula5) {
  const baseId2 = text16(env.AIRTABLE_BASE_ID, 100);
  const apiKey = airtableToken2(env);
  const url = new URL(`${AIRTABLE_API25}/${baseId2}/${encodeURIComponent(tableId)}`);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", formula5);
  url.searchParams.set("returnFieldsByFieldId", "true");
  const response = await fetch(url.toString(), { headers: { authorization: `Bearer ${apiKey}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(502, "airtable_lookup_failed");
  return data.records?.[0] || null;
}
__name(findFirst3, "findFirst");
async function createRecord4(env, tableId, fields2) {
  const data = await airtableWrite(env, tableId, "", "POST", { records: [{ fields: fields2 }], typecast: true });
  return data.records?.[0] || null;
}
__name(createRecord4, "createRecord");
async function patchRecord3(env, tableId, recordId3, fields2) {
  return airtableWrite(env, tableId, recordId3, "PATCH", { fields: fields2, typecast: true });
}
__name(patchRecord3, "patchRecord");
async function airtableWrite(env, tableId, recordId3, method, body) {
  const baseId2 = text16(env.AIRTABLE_BASE_ID, 100);
  const apiKey = airtableToken2(env);
  const suffix = recordId3 ? `/${encodeURIComponent(recordId3)}` : "";
  const response = await fetch(`${AIRTABLE_API25}/${baseId2}/${encodeURIComponent(tableId)}${suffix}`, {
    method,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(502, `airtable_write_${response.status}`);
  return data;
}
__name(airtableWrite, "airtableWrite");
async function stableShopPaymentRef(orderId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mmd-shop:${orderId}`));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `shop_${hex.slice(0, 24)}`;
}
__name(stableShopPaymentRef, "stableShopPaymentRef");
async function notifyShopPayment(env, input) {
  const shopBrand = resolvePersistedShopBrand(input.order || { order_id: input.orderId });
  const service = env.TELEGRAM_WORKER;
  const token4 = text16(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM, 5e3);
  if (!service || typeof service.fetch !== "function") return { ok: false, skipped: true, reason: "telegram_router_binding_missing" };
  if (!token4) return { ok: false, skipped: true, reason: "telegram_router_auth_missing" };
  const response = await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token4}`
    },
    body: JSON.stringify({
      flow: shopBrand.paymentFlow,
      parse_mode: "HTML",
      text: [
        `<b>${shopBrand.title} \xB7 PAYMENT VERIFIED</b>`,
        `Order: <code>${escapeHtml4(input.orderId)}</code>`,
        `Ref: <code>${escapeHtml4(input.paymentRef)}</code>`,
        `Amount: <b>${Number(input.amount || 0).toLocaleString("en-US")} THB</b>`,
        "Order status: <b>confirmed</b>"
      ].join("\n")
    })
  }));
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok && data?.ok === true && data?.telegram?.ok === true, status: response.status, routed: true, flow: shopBrand.paymentFlow };
}
__name(notifyShopPayment, "notifyShopPayment");
function signingSecret2(env) {
  const value3 = text16(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5e3);
  if (!value3) throw httpError(503, "missing_payment_confirmation_signing_secret");
  return value3;
}
__name(signingSecret2, "signingSecret");
function airtableToken2(env) {
  const token4 = text16(env.AIRTABLE_API_KEY, 5e3);
  if (!token4 || !text16(env.AIRTABLE_BASE_ID, 100)) throw httpError(503, "airtable_not_ready");
  return token4;
}
__name(airtableToken2, "airtableToken");
function table6(env, kind) {
  const values = {
    orders: env.MMD_SHOP_ORDERS_TABLE_ID || TABLES2.orders,
    orderItems: env.MMD_SHOP_ORDER_ITEMS_TABLE_ID || TABLES2.orderItems,
    payments: env.AIRTABLE_TABLE_PAYMENTS || TABLES2.payments
  };
  return text16(values[kind], 120);
}
__name(table6, "table");
function normalizeMethod(value3) {
  const raw = code14(value3);
  if (raw === "promptpay") return "promptpay";
  if (raw === "bank_transfer") return "bank_transfer";
  if (raw === "credit_card" || raw === "paypal") return "paypal";
  return raw || "promptpay";
}
__name(normalizeMethod, "normalizeMethod");
function appendNote(current, extra) {
  return [text16(current, 12e3), text16(extra, 2e3)].filter(Boolean).join("\n");
}
__name(appendNote, "appendNote");
function bangkokDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(/* @__PURE__ */ new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
__name(bangkokDate, "bangkokDate");
function positive3(value3) {
  const n = Number(String(value3 ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}
__name(positive3, "positive");
function normalizePath10(value3) {
  const path = text16(value3 || "/", 300).replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
__name(normalizePath10, "normalizePath");
function code14(value3) {
  return text16(value3, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
__name(code14, "code");
function text16(value3, max = 5e3) {
  return String(value3 == null ? "" : value3).trim().slice(0, max).replace(/[\u0000-\u001F\u007F]/g, " ");
}
__name(text16, "text");
function escapeHtml4(value3) {
  return text16(value3, 1e3).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(escapeHtml4, "escapeHtml");
function allowedOrigins4(env) {
  return text16(env.ALLOWED_ORIGINS, 5e3).replace(/^[\"']|[\"']$/g, "").split(",").map((value3) => value3.trim().replace(/^[\"']|[\"']$/g, "")).filter(Boolean);
}
__name(allowedOrigins4, "allowedOrigins");
function corsHeaders3(request2, env) {
  const headers = new Headers({
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin"
  });
  const origin = text16(request2.headers.get("origin"), 500);
  if (origin && allowedOrigins4(env).includes(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}
__name(corsHeaders3, "corsHeaders");
function json18(payload, status = 200, request2 = null, env = {}) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-mmd-payment-authority": "payments-worker" });
  if (request2) corsHeaders3(request2, env).forEach((value3, key) => headers.set(key, value3));
  return new Response(JSON.stringify(payload), { status, headers });
}
__name(json18, "json");

// index.review-wrapper.js
var NOTIFY_PATH2 = "/v1/payments/notify";
function canonicalTelegramEnv(env = {}) {
  const membership = String(env.TG_THREAD_PAYMENTS_MEMBERSHIP || env.TG_THREAD_MEMBERSHIP || "20").trim() || "20";
  const confirm = String(env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || "22").trim() || "22";
  return {
    ...env,
    TG_THREAD_PAYMENTS_MEMBERSHIP: membership,
    TG_THREAD_MEMBERSHIP: membership,
    TG_THREAD_PAYMENTS_CONFIRM: confirm,
    TG_THREAD_PAYMENT: confirm,
    TG_THREAD_CONFIRM: confirm
  };
}
__name(canonicalTelegramEnv, "canonicalTelegramEnv");
var index_review_wrapper_default = {
  async scheduled(event, env, ctx) {
    await drainWebProofNotifications(canonicalTelegramEnv(env));
    if (typeof index_phase1_default.scheduled === "function") await index_phase1_default.scheduled(event, env, ctx);
  },
  async fetch(request2, env, ctx) {
    const kbankResponse = await handleKbankSandbox(request2, env);
    if (kbankResponse) return kbankResponse;
    env = canonicalTelegramEnv(env);
    const url = new URL(request2.url);
    const path = normalizePath11(url.pathname);
    const method = request2.method.toUpperCase();
    if (isPublicSessionExtensionPaymentPath(url)) {
      return handlePublicSessionExtensionPayment(request2, env);
    }
    if (method === "GET" && (path === "/health" || path === "/ping")) {
      const response = await index_phase1_default.fetch(request2, env, ctx);
      if (!response?.ok) return response;
      const payload = await response.clone().json().catch(() => null);
      if (!payload || typeof payload !== "object") return response;
      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      headers.set("cache-control", "no-store");
      return new Response(JSON.stringify({
        ...payload,
        analytics: authorityRuntimeHealth(env, "payments-worker", ctx)
      }), { status: response.status, headers });
    }
    if (method === "GET" && path === "/v1/pay/slip/evidence/health") {
      const airtableReady2 = Boolean(String(env.AIRTABLE_BASE_ID || "").trim() && String(env.AIRTABLE_API_KEY || "").trim() && String(env.AIRTABLE_TABLE_PAYMENT_PROOFS || "").trim());
      const r2Ready = Boolean(env.PAYMENT_SLIP_EVIDENCE && typeof env.PAYMENT_SLIP_EVIDENCE.put === "function");
      const telegramReady = Boolean(env.TELEGRAM_WORKER && typeof env.TELEGRAM_WORKER.fetch === "function" && String(env.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM || "").trim());
      const tokenReady = Boolean(String(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY || "").trim() && env.PAY_SESSIONS_KV);
      const telegramThreadId = Number(env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || 22) || 22;
      return json19({
        ok: true,
        authority: "payments-worker",
        schema: "mmd_web_payment_proof_v1",
        version: "sigil_pay_proof_intake_v3",
        signed_token_required: true,
        canonical_proof_status: "pending",
        telegram_thread_id: telegramThreadId,
        bindings: {
          airtable: airtableReady2,
          r2: r2Ready,
          telegram: telegramReady,
          confirmation_token: tokenReady
        },
        analytics: authorityRuntimeHealth(env, "payments-worker", ctx),
        ready: airtableReady2 && r2Ready && telegramReady && tokenReady && telegramThreadId === 22
      }, 200);
    }
    const shopExpiryResponse = await handleShopIntentExpiry(request2.clone(), env);
    if (shopExpiryResponse) return shopExpiryResponse;
    const shopRefundResponse = await handleShopRefundConfirm(request2.clone(), env);
    if (shopRefundResponse) return shopRefundResponse;
    if (isShopIntentRequest(path, method)) {
      return handleShopIntent(request2, env);
    }
    if (isFinalPaymentFlowRequest(path, method)) {
      return handleFinalPaymentFlow(request2, env);
    }
    if (isDoubleMomentRequest(path, method)) {
      return handleDoubleMomentRequest(
        request2,
        env,
        (nextRequest) => handleUnifiedPaymentIntent(nextRequest, env, (paymentRequest) => index_phase1_default.fetch(paymentRequest, env, ctx))
      );
    }
    if (isPaymentInstructionsRequest(path, method)) {
      return handlePaymentInstructions(request2, env, async (detailsRequest) => {
        const shopDetails = await maybeHandleShopConfirmationDetails(detailsRequest, env);
        if (shopDetails) return shopDetails;
        return handleCustomerSessionDetails(detailsRequest, env, (nextRequest) => index_phase1_default.fetch(nextRequest, env, ctx));
      });
    }
    if (isCustomerSessionDetailsRequest(path, method)) {
      const shopDetails = await maybeHandleShopConfirmationDetails(request2.clone(), env);
      if (shopDetails) return shopDetails;
      return handleCustomerSessionDetails(request2, env, (nextRequest) => index_phase1_default.fetch(nextRequest, env, ctx));
    }
    if (isCanonicalConfirmLinkRequest(path, method)) {
      const canonicalRequest = await canonicalizeConfirmLinkRequest(request2);
      const response = await handleCanonicalConfirmLink(canonicalRequest, env, ctx);
      return reconcileSigilConfirmLinkMoneyTruth(canonicalRequest, response, env);
    }
    if (isConfirmationReissueRequest(path, method)) {
      return handleConfirmationReissue(request2, env);
    }
    if (isModelConfirmationReissueRequest(path, method)) {
      return handleModelConfirmationReissue(request2, env);
    }
    if (isPartnerModelLinkRequest(path, method)) {
      return handlePartnerModelLink(request2, env);
    }
    if (isUnifiedPaymentIntentRequest(path, method)) {
      return handleUnifiedPaymentIntent(request2, env, (nextRequest) => index_phase1_default.fetch(nextRequest, env, ctx));
    }
    if (isUnifiedSlipEvidenceRequest(path, method)) {
      const settlementRequest = request2.clone();
      const slipResponse = await handleUnifiedSlipEvidence(request2, env, (nextRequest) => index_phase1_default.fetch(nextRequest, env, ctx));
      const settlementResponse = await reconcileCanonicalWebRenewalProof(settlementRequest, slipResponse, env);
      return preserveCanonicalWebRenewalPaymentSuccess(settlementResponse);
    }
    if (isUnifiedConfirmVerifyRequest(path, method)) {
      const shopVerifyRequest = request2.clone();
      const verifiedResponse = await enrichUnifiedConfirmVerify(
        request2,
        env,
        (nextRequest) => index_phase1_default.fetch(nextRequest, env, ctx)
      );
      return enrichShopConfirmVerify(shopVerifyRequest, verifiedResponse, env);
    }
    if (isReviewedProofRequest(path, method)) {
      const analyticsRequest = request2.clone();
      const reconcileRequest = request2.clone();
      const shopRequest = request2.clone();
      const doubleMomentRequest = request2.clone();
      const finalPaymentRequest = request2.clone();
      const shopPreflight = await preflightReviewedShopPayment(shopRequest.clone(), env);
      if (shopPreflight) return shopPreflight;
      const reviewResponse = await handleReviewedProof(request2, env, ctx, async (body) => {
        if (!String(env.INTERNAL_TOKEN || "").trim()) {
          return json19({ ok: false, error: "payments_internal_token_not_ready", authority: "payments-worker" }, 503);
        }
        if (isEmailLessLineRenewalMoneyTruth(body)) {
          return commitEmailLessLineRenewalMoneyTruth(env, body);
        }
        let components = null;
        try {
          components = await resolveSigilCombinedPaymentComponents(
            env,
            body.payment_ref || body.transaction_ref,
            body.amount_thb ?? body.amount
          );
        } catch (error2) {
          return json19({
            ok: false,
            authority: "payments-worker",
            error: String(error2?.message || error2 || "sigil_payment_component_resolution_failed")
          }, Number(error2?.status || 409));
        }
        if (components) {
          return runSigilCombinedReviewedNotify(request2, env, ctx, body, components);
        }
        const headers = internalNotifyHeaders(env);
        return index_phase1_default.fetch(new Request(new URL(NOTIFY_PATH2, request2.url), {
          method: "POST",
          headers,
          body: JSON.stringify(body)
        }), env, ctx);
      });
      const shopResponse = await reconcileReviewedShopPayment(shopRequest.clone(), reviewResponse, env);
      const termResponse = await reconcilePremiumReviewedMembershipTerm(reconcileRequest.clone(), shopResponse, env);
      const entitlementResponse = await reconcileReviewedMembershipEntitlement(reconcileRequest, termResponse, env);
      const doubleMomentResponse = await reconcileDoubleMomentReviewedProof(doubleMomentRequest, entitlementResponse, env);
      const finalResponse = await reconcileReviewedFinalPayment(finalPaymentRequest, doubleMomentResponse, env);
      queueReviewedPaymentAuthorityEvents(ctx, env, analyticsRequest, finalResponse);
      return finalResponse;
    }
    return index_phase1_default.fetch(request2, env, ctx);
  }
};
function queueReviewedPaymentAuthorityEvents(ctx, env, request2, response) {
  if (!response?.ok) return;
  const task = Promise.all([
    request2.clone().json().catch(() => null),
    response.clone().json().catch(() => null)
  ]).then(([body, payload]) => {
    if (!body || !payload?.ok) return;
    const decision = String(body.decision || "").trim().toLowerCase();
    if (decision !== "approved") return;
    const paymentRef = String(body.payment_ref || body.transaction_ref || "").trim();
    if (!paymentRef) return;
    const paymentStage = String(body.payment_stage || body.stage || body.payment_type || "").trim().toLowerCase();
    const paymentFlow = paymentStage === "membership" ? "membership_payment" : paymentStage === "shop" ? "shop_payment" : paymentStage === "mms" ? "mms_payment" : "booking_payment";
    const paymentWorld = paymentStage === "shop" ? "shop" : paymentStage === "mms" ? "mms" : paymentStage === "membership" ? "member" : "private";
    const amount3 = Number(body.amount_thb ?? body.amount);
    queueAuthorityEvent(ctx, env, {
      event: "payment_verified",
      authority: "payments-worker",
      scope: "payment",
      distinctValue: paymentRef,
      insertValue: `${paymentRef}:${paymentStage || "unknown"}`,
      properties: {
        surface: "payment",
        flow: paymentFlow,
        world: paymentWorld,
        payment_stage: paymentStage || "unknown",
        amount_thb: Number.isFinite(amount3) ? amount3 : void 0,
        currency: "THB",
        verification: "official",
        decision: "approved",
        status: "verified",
        duplicate: payload.duplicate === true
      }
    });
    const materialized = payload.entitlement_materialized === true || payload.membership_write_through?.status === "materialized";
    if (paymentStage === "membership" && materialized) {
      const memberCorrelation = String(body.member_id || body.member_record_id || paymentRef).trim();
      queueAuthorityEvent(ctx, env, {
        event: "membership_activated",
        authority: "payments-worker",
        scope: "membership",
        distinctValue: memberCorrelation,
        insertValue: `${paymentRef}:membership_activated`,
        properties: {
          surface: "membership",
          flow: "membership_activation",
          world: "member",
          payment_stage: "membership",
          package_code: String(body.package_code || body.package || payload.membership_write_through?.package_code || "").trim(),
          status: "active",
          materialized: true,
          duplicate: payload.duplicate === true
        }
      });
    }
  }).catch(() => null);
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(task);
  else void task;
}
__name(queueReviewedPaymentAuthorityEvents, "queueReviewedPaymentAuthorityEvents");
async function runSigilCombinedReviewedNotify(request2, env, ctx, body, components) {
  const notifyRequest = new Request(new URL(NOTIFY_PATH2, request2.url), {
    method: "POST",
    headers: internalNotifyHeaders(env),
    body: JSON.stringify(body)
  });
  const baseEnv = { ...env, POINTS_RATE: "9007199254740991" };
  const response = await index_with_slip_evidence_default.fetch(notifyRequest, baseEnv, ctx);
  if (!response.ok) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok) return response;
  try {
    await enforceSigilSessionServiceAmount(env, body.session_id, components);
  } catch (error2) {
    return json19({
      ok: false,
      authority: "payments-worker",
      error: String(error2?.message || error2 || "sigil_session_service_amount_reconcile_failed")
    }, Number(error2?.status || 502));
  }
  const pointsLedger = await awardBasePointsPhase1(env, {
    payment_ref: body.payment_ref || body.transaction_ref,
    stage: body.stage || body.payment_stage || body.payment_type || "deposit",
    session_id: body.session_id,
    amount_thb: components.points_eligible_amount_thb,
    member_id: body.member_id,
    member_email: body.member_email || body.email
  }).catch((error2) => ({
    ok: false,
    awarded: false,
    error: String(error2?.message || error2 || "points_phase1_failed")
  }));
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-payment-components", "membership_action_v1");
  return new Response(JSON.stringify({
    ...payload,
    pricing_breakdown: components,
    points_ledger: pointsLedger
  }), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
__name(runSigilCombinedReviewedNotify, "runSigilCombinedReviewedNotify");
function internalNotifyHeaders(env) {
  const token4 = String(env.INTERNAL_TOKEN || "").trim();
  return new Headers({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token4}`,
    "X-Internal-Token": token4
  });
}
__name(internalNotifyHeaders, "internalNotifyHeaders");
function normalizePath11(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
__name(normalizePath11, "normalizePath");
function json19(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-MMD-Payment-Authority": "payments-worker"
    }
  });
}
__name(json19, "json");

// session-paid-projection-coordinator.js
import { DurableObject } from "cloudflare:workers";
var SessionPaidProjectionCoordinator = class extends DurableObject {
  static {
    __name(this, "SessionPaidProjectionCoordinator");
  }
  constructor(ctx, env) {
    super(ctx, env);
    this.projection = new SessionPaidProjectionState(ctx, env);
  }
  fetch(request2) {
    return this.projection.fetch(request2);
  }
  alarm() {
    return this.projection.alarm();
  }
};
export {
  KbankSandboxCoordinator,
  PointsPhase1Coordinator,
  SessionPaidProjectionCoordinator,
  index_review_wrapper_default as default
};


var __mmdOwnerRevision2736 = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // shared/confirmation-revision.mjs
  var confirmation_revision_exports = {};
  __export(confirmation_revision_exports, {
    confirmationRevision: () => confirmationRevision
  });
  var fields = ["fldpnqoIsUMfN7y3c", "fldBeG0FkWwa8kgnp", "fldiDSz0wW9Ct9I3P", "fldIiRpaxoafjTkFt", "fldoUDQ8sH93idPx0", "fldmwuvOaiCFdzzRa", "fldrXQAyOMPCvbOaY", "fld6P6if0vDZCeV0C"];
  var fail = (code) => {
    throw Object.assign(new Error(code), { status: 503 });
  };
  async function confirmationRevision(env, session, sessionId) {
    const source = session.fields || {}, linked = source.fld1NL4YdaEQHO2dC || [];
    if (!Array.isArray(linked) || linked.length > 100) fail("confirmation_changes_unavailable");
    const editNote = String(source.fldEcDkF7CH9VixWM || source.fldwl9Gs5tYlXG5ls || "");
    const ownerAmended = /^\s*\[MMD JOB EDIT v1\]/m.test(editNote);
    let required = ownerAmended, blocked = false, versions = [];
    if (linked.length) {
      const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_TABLE_CUSTOMER_CHANGE_REQUESTS || "tblhQGfJc4GgiteZr")}`);
      url.searchParams.set("filterByFormula", `{session_id}='${String(sessionId).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`);
      url.searchParams.set("returnFieldsByFieldId", "true");
      url.searchParams.set("pageSize", "100");
      for (const f of ["fldbL2Ya44l6xEYe1", "fldMD3Fhu0ibDmjk0", "fldxg0WIVCmxtdRCF", "fldcBkBS70bWBgI8A", "fldnnAWYmA0U1q8nX"]) url.searchParams.append("fields[]", f);
      const req = new Request(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
      const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(req) : await fetch(req);
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.records) || data.offset) fail("confirmation_changes_unavailable");
      const seen = /* @__PURE__ */ new Set();
      for (const r of data.records) {
        const f = r.fields || {};
        if (seen.has(r.id) || !linked.includes(r.id) || f.fldMD3Fhu0ibDmjk0 !== sessionId || JSON.stringify(f.fldbL2Ya44l6xEYe1) !== JSON.stringify([session.id])) fail("confirmation_changes_ambiguous");
        seen.add(r.id);
        const status = f.fldcBkBS70bWBgI8A;
        if (!["pending_review", "approved", "applied", "rejected", "withdrawn"].includes(status)) fail("confirmation_changes_ambiguous");
        if (f.fldxg0WIVCmxtdRCF !== "remark" && ["approved", "applied"].includes(status)) {
          if (!Number.isFinite(Date.parse(f.fldnnAWYmA0U1q8nX))) fail("confirmation_changes_ambiguous");
          required = true;
          blocked ||= status === "approved";
          versions.push([r.id, status, f.fldnnAWYmA0U1q8nX]);
        }
      }
      if (seen.size !== linked.length) fail("confirmation_changes_incomplete");
    }
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([session.id, fields.map((f) => source[f] ?? null), versions.sort((a, b) => a[0].localeCompare(b[0])), ...ownerAmended ? [source.fldhwC79ndbnEXSZz ?? null, source.fldlTO5aNfqUmlNWm ?? null, source.fld703jI4zQ0CYMHh ?? null, source.fldqYkGm9Vd3P366W ?? null, editNote] : []])));
    return { confirmation_revision: [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join(""), confirmation_revision_required: required, confirmation_change_pending: blocked };
  }
  return __toCommonJS(confirmation_revision_exports);
})();
