const CURRENT_PATH = "/v1/model/session/current";
const MODE = "year6_wish";
const COOKIE_NAME = "mmd_model_session_v1";
const CAMPAIGN_ID = "mmd_year_6_model_wish";
const TABLE_DEFAULT = "tblvMJjYXy29mgDLb";
const MAX_WISH = 280;
const ELIGIBLE_STATES = new Set(["separated", "under_review", "payout_pending", "closed"]);
const BODY_KEYS = new Set(["wish_text", "language"]);

export const MODEL_YEAR6_WISH_PATH = `${CURRENT_PATH}?mode=${MODE}`;
export const MODEL_YEAR6_WISH_CAMPAIGN_ID = CAMPAIGN_ID;
export const MODEL_YEAR6_WISH_MAX_LENGTH = MAX_WISH;

// The active wrapper already owns /v1/model/session/current*. Intercept that
// pathname once, then delegate normal current-session requests straight back to
// core unless mode=year6_wish is present. This avoids claiming a new route.
export function isModelYear6WishRequest(path = "") {
  return normalizePath(path) === CURRENT_PATH;
}

export function isModelYear6WishEligibleState(state = "") {
  return ELIGIBLE_STATES.has(clean(state).toLowerCase());
}

export async function handleModelYear6WishRequest(request, env = {}, coreWorker) {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (path !== CURRENT_PATH) return null;

  // Preserve the canonical current-session contract for every non-Wish request.
  if (clean(url.searchParams.get("mode")).toLowerCase() !== MODE) {
    if (!coreWorker || typeof coreWorker.fetch !== "function") {
      return json({ ok: false, error: "session_authority_unavailable" }, 503, request, env);
    }
    return coreWorker.fetch(request, env);
  }

  if (method === "OPTIONS") {
    if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (method !== "GET" && method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, request, env, { Allow: "GET, POST, OPTIONS" });
  }
  if (!isAllowedOrigin(request, env)) {
    return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
  }

  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);
  if (!coreWorker || typeof coreWorker.fetch !== "function") {
    return json({ ok: false, error: "session_authority_unavailable" }, 503, request, env);
  }

  const current = await readCanonicalSession(request, env, coreWorker);
  if (!current.ok) return json({ ok: false, error: current.error }, current.status, request, env);

  const sessionId = clean(current.session?.session_id);
  const state = clean(current.session?.normalized_state || current.session?.state).toLowerCase();
  const eligible = Boolean(sessionId && isModelYear6WishEligibleState(state));

  if (!eligible) {
    return json({
      ok: true,
      eligible: false,
      submitted: false,
      required: false,
      skip_allowed: true,
      payout_gate: false,
      session_state: state || null,
      reason: "available_after_separation",
    }, 200, request, env);
  }

  const key = `modelwish:${sessionId}`;
  const existing = await findWish(env, key);
  if (!existing.ok) return json({ ok: false, error: existing.error }, existing.status, request, env);

  if (method === "GET") {
    return json({
      ok: true,
      eligible: true,
      submitted: Boolean(existing.record),
      required: false,
      skip_allowed: true,
      payout_gate: false,
      max_length: MAX_WISH,
      session_state: state,
      wish: existing.record ? safeWish(existing.record) : null,
    }, 200, request, env);
  }

  if (existing.record) {
    return json({
      ok: true,
      state: "completed",
      eligible: true,
      submitted: true,
      idempotent: true,
      required: false,
      skip_allowed: true,
      payout_gate: false,
      wish: safeWish(existing.record),
    }, 200, request, env);
  }

  const parsed = await readInput(request);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, parsed.status, request, env);
  const now = new Date().toISOString();
  const wishText = clean(parsed.body.wish_text);
  const requestedLanguage = normalizeRequestedLanguage(parsed.body.language);
  const storedLanguage = requestedLanguage === "th" || requestedLanguage === "en" ? requestedLanguage : "";
  if (!wishText || wishText.length > MAX_WISH || /[<>]/.test(wishText)) {
    return json({ ok: false, error: "model_wish_invalid" }, 400, request, env);
  }

  const fields = {
    wish_id: `model_wish_${crypto.randomUUID().replace(/-/g, "")}`,
    campaign_id: CAMPAIGN_ID,
    wish_text: wishText,
    wish_option: "post_job_model",
    wish_status: "completed",
    idempotency_key: key,
    submitted_at: now,
    completed_at: now,
    public_display_text: "MMD received a Model Wish.",
    // Airtable source is a controlled single-select. Keep the exact app origin in
    // source_path/payload_json while preserving typecast:false writes.
    source: "member_page",
    source_path: "mmdmodel.lovable.app",
    language: storedLanguage,
    display_version: "model_year6_wish_v1",
    payload_json: JSON.stringify({
      schema_version: 1,
      wish_kind: "model_post_job",
      campaign_id: CAMPAIGN_ID,
      model_record_id: auth.payload.model_record_id,
      session_id: sessionId,
      session_state: state,
      requested_language: requestedLanguage,
      source: "my_mmd_model_wrap_up",
      payout_gate: false,
      required: false,
    }),
    created_at: now,
    updated_at: now,
  };

  const created = await createWish(env, fields);
  if (!created.ok) return json({ ok: false, error: created.error }, created.status, request, env);
  return json({
    ok: true,
    state: "completed",
    eligible: true,
    submitted: true,
    idempotent: false,
    required: false,
    skip_allowed: true,
    payout_gate: false,
    wish: safeWish(created.record),
  }, 200, request, env);
}

async function readCanonicalSession(request, env, coreWorker) {
  const url = new URL(request.url);
  url.pathname = CURRENT_PATH;
  url.search = "";
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("content-type");
  const response = await coreWorker.fetch(new Request(url.toString(), { method: "GET", headers }), env);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object") {
    return { ok: false, status: response.status || 503, error: String(body?.error || "session_lookup_failed") };
  }
  const session = body.session || body.data?.session || null;
  if (!session || !clean(session.session_id)) {
    return { ok: false, status: 404, error: "session_not_found" };
  }
  return { ok: true, status: 200, session };
}

async function readInput(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > 4096) return { ok: false, status: 413, error: "payload_too_large" };
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: "invalid_json" };
  if (Object.keys(body).some((key) => !BODY_KEYS.has(key))) return { ok: false, status: 400, error: "unexpected_field" };
  return { ok: true, body };
}

async function findWish(env, idempotencyKey) {
  if (!storageReady(env)) return { ok: false, status: 503, error: "model_wish_storage_not_configured" };
  const table = wishTable(env);
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", `AND({campaign_id}=${formulaString(CAMPAIGN_ID)},{idempotency_key}=${formulaString(idempotencyKey)})`);
  url.searchParams.set("maxRecords", "2");
  const response = await fetch(url, { headers: { authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}` } });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || !Array.isArray(body.records)) return { ok: false, status: 503, error: "model_wish_storage_unavailable" };
  if (body.records.length > 1) return { ok: false, status: 409, error: "model_wish_conflict" };
  return { ok: true, status: 200, record: body.records[0] || null };
}

async function createWish(env, fields) {
  if (!storageReady(env)) return { ok: false, status: 503, error: "model_wish_storage_not_configured" };
  const url = `https://api.airtable.com/v0/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(wishTable(env))}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, "content-type": "application/json" },
    body: JSON.stringify({ fields: compact(fields), typecast: false }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object") return { ok: false, status: 503, error: "model_wish_write_failed" };
  return { ok: true, status: 200, record: body };
}

function safeWish(record) {
  const fields = record?.fields || {};
  return {
    wish_text: clean(fields.wish_text).slice(0, MAX_WISH),
    submitted_at: clean(fields.submitted_at) || null,
  };
}

async function requireModelSession(request, env) {
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!token) return { ok: false, status: 401, error: "model_session_required" };
  const verified = await verifySessionToken(token, env);
  if (!verified.ok) return verified;
  if (verified.payload.kind !== "model_session" || verified.payload.role !== "model" || !clean(verified.payload.model_record_id)) {
    return { ok: false, status: 403, error: "model_session_invalid" };
  }
  return verified;
}

async function verifySessionToken(token, env) {
  const value = clean(token);
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return { ok: false, status: 401, error: "model_session_invalid" };
  const encoded = value.slice(0, dot);
  const supplied = value.slice(dot + 1);
  const secret = clean(env.MODEL_SESSION_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!secret) return { ok: false, status: 503, error: "signing_not_ready" };
  const expected = await hmacHex(encoded, secret);
  if (!constantTimeEqual(expected, supplied)) return { ok: false, status: 401, error: "model_session_invalid" };
  let payload;
  try { payload = JSON.parse(base64UrlDecode(encoded)); } catch { return { ok: false, status: 401, error: "model_session_invalid" }; }
  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return { ok: false, status: 401, error: "model_session_expired" };
  return { ok: true, status: 200, payload };
}

function storageReady(env) { return Boolean(clean(env.AIRTABLE_API_KEY) && clean(env.AIRTABLE_BASE_ID)); }
function wishTable(env) { return clean(env.AIRTABLE_TABLE_CARE_BACK_BIRTHDAY_WISHES || TABLE_DEFAULT); }
function normalizeRequestedLanguage(value) {
  const v = clean(value).toLowerCase();
  if (v === "en" || v === "english") return "en";
  if (v === "zh" || v === "chinese") return "zh";
  return "th";
}
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== "")); }
function formulaString(value) { return `'${clean(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; }
function normalizePath(pathname) { const path = String(pathname || "/").replace(/\/{2,}/g, "/"); return path.length > 1 ? path.replace(/\/+$/g, "") : path; }
function clean(value) { return String(value ?? "").trim(); }

function isAllowedOrigin(request, env) {
  const origin = clean(request.headers.get("origin"));
  if (!origin) return true;
  const allowed = new Set([
    "https://mmdbkk.com",
    "https://www.mmdbkk.com",
    "https://mmdmodel.lovable.app",
    ...String(env.ALLOWED_ORIGINS || "").split(",").map(clean).filter(Boolean),
  ]);
  return allowed.has(origin);
}

function corsHeaders(request, env) {
  const origin = clean(request.headers.get("origin"));
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-allow-credentials": "true",
    "cache-control": "no-store, private",
    vary: "Origin",
  });
  if (origin && isAllowedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(payload, status, request, env, extra = {}) {
  const headers = corsHeaders(request, env);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("x-mmd-model-wish", "year6-v1");
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(JSON.stringify(payload), { status, headers });
}

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try { return decodeURIComponent(value); } catch { return value; }
  }
  return "";
}

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function base64UrlDecode(value) { const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4); const binary = atob(padded); return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))); }
function constantTimeEqual(a, b) { const left = clean(a), right = clean(b); if (left.length !== right.length) return false; let diff = 0; for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i); return diff === 0; }
