const CURRENT_PATH = "/v1/model/session/current";
const MODE = "year6_direct_wish";
const COOKIE_NAME = "mmd_model_session_v1";
const CAMPAIGN_ID = "mmd_year_6_model_direct_wish";
const WISH_OPTION = "model_direct_wish";
const WISH_TABLE_DEFAULT = "tblvMJjYXy29mgDLb";
const MODELS_TABLE_DEFAULT = "tblI4B0bI446vp9GX";
const MAX_BIRTHDAY = 700;
const MAX_MMD_MESSAGE = 1000;
const MAX_PRIVATE_NOTE = 1000;
const BODY_KEYS = new Set([
  "message",
  "birthday_wish",
  "mmd_message",
  "private_note_per",
  "private_note_scope",
  "telegram_consent",
  "past_clients_consent",
  "photo_media_ids",
  "photo_count",
  "consent_version",
  "source",
]);
const ADMIN_REVIEW_QUEUE_PATH = "/v1/admin/model-wishes/review-queue";
const ADMIN_REVIEW_PATH = "/v1/admin/model-wishes/review";

export const MODEL_DIRECT_WISH_CAMPAIGN_ID = CAMPAIGN_ID;
export const MODEL_DIRECT_WISH_MODE = MODE;

export function isModelDirectWishRequest(request) {
  try {
    const url = request instanceof Request ? new URL(request.url) : new URL(String(request));
    return normalizePath(url.pathname) === CURRENT_PATH && clean(url.searchParams.get("mode")).toLowerCase() === MODE;
  } catch {
    return false;
  }
}

export function isModelDirectWishAdminQueueRequest(path = "", method = "GET") {
  return String(method || "GET").toUpperCase() === "GET" && normalizePath(path) === ADMIN_REVIEW_QUEUE_PATH;
}

export function isModelDirectWishAdminReviewRequest(path = "", method = "POST") {
  return String(method || "POST").toUpperCase() === "POST" && normalizePath(path) === ADMIN_REVIEW_PATH;
}

export function normalizeModelWishTier(value = "") {
  const key = clean(value).toLowerCase().replace(/[\s_-]+/g, " ");
  if (key === "standard" || key === "standard model" || key === "standard models") return "standard";
  if (key === "premium" || key === "premium model" || key === "premium models") return "premium";
  if (key === "exclusive" || key === "exclusive model" || key === "exclusive models") return "exclusive";
  return "unknown";
}

export function modelWishTelegramTargets(tier = "", env = {}) {
  const normalized = normalizeModelWishTier(tier);
  const standardId = clean(env.TELEGRAM_STANDARD_GROUP_ID || "-1002073919780");
  const premiumId = clean(env.TELEGRAM_PREMIUM_GROUP_ID || "-1001668261779");
  if (normalized === "standard") {
    return [
      standardId ? { audience: "standard_group", chat_id: standardId } : null,
      premiumId ? { audience: "premium_group", chat_id: premiumId } : null,
    ].filter(Boolean);
  }
  if (normalized === "premium" || normalized === "exclusive") {
    return premiumId ? [{ audience: "premium_group", chat_id: premiumId }] : [];
  }
  return [];
}

export async function handleModelDirectWishRequest(request, env = {}) {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") {
    if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, request, env, { Allow: "POST, OPTIONS" });
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);

  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status, request, env);
  if (!storageReady(env)) return json({ ok: false, error: "model_wish_storage_not_configured" }, 503, request, env);

  const parsed = await readInput(request);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, parsed.status, request, env);
  const input = normalizeInput(parsed.body);
  if (!input.ok) return json({ ok: false, error: input.error }, input.status, request, env);

  const modelRecordId = clean(auth.payload.model_record_id);
  const model = await readModel(env, modelRecordId);
  if (!model.ok) return json({ ok: false, error: model.error }, model.status, request, env);

  const key = `modeldirectwish:${modelRecordId}`;
  const existing = await findWish(env, key);
  if (!existing.ok) return json({ ok: false, error: existing.error }, existing.status, request, env);
  if (existing.record) {
    return json({
      ok: true,
      state: clean(existing.record.fields?.wish_status) || "manual_review",
      submitted: true,
      idempotent: true,
      review_required: true,
      wish_id: clean(existing.record.fields?.wish_id) || null,
    }, 200, request, env);
  }

  const now = new Date().toISOString();
  const reviewText = [
    input.birthdayWish ? `อวยพร 6 ปี MMD: ${input.birthdayWish}` : "",
    input.mmdMessage ? `ถึง MMD: ${input.mmdMessage}` : "",
  ].filter(Boolean).join("\n\n");
  const payload = {
    schema_version: 1,
    wish_kind: "model_direct_wish",
    campaign_id: CAMPAIGN_ID,
    model_record_id: modelRecordId,
    model_display_name: model.displayName,
    model_tier: model.tier,
    birthday_wish: input.birthdayWish,
    mmd_message: input.mmdMessage,
    private_note_per: input.privateNotePer,
    private_note_scope: "per_only",
    telegram_consent: input.telegramConsent,
    past_clients_consent: input.pastClientsConsent,
    photo_media_ids: input.photoMediaIds,
    photo_count: input.photoMediaIds.length,
    consent_version: input.consentVersion,
    source: "/sigil/model/wish",
    delivery: { telegram: { state: "pending_review" }, past_clients: { state: "pending_review" } },
  };
  const fields = {
    wish_id: `model_direct_wish_${crypto.randomUUID().replace(/-/g, "")}`,
    campaign_id: CAMPAIGN_ID,
    wish_text: reviewText,
    wish_option: WISH_OPTION,
    wish_status: "manual_review",
    idempotency_key: key,
    submitted_at: now,
    completed_at: now,
    public_display_text: "",
    source: "member_page",
    source_path: "/sigil/model/wish",
    language: "th",
    display_version: "model_direct_wish_v1",
    payload_json: JSON.stringify(payload),
    created_at: now,
    updated_at: now,
  };
  const created = await createWish(env, fields);
  if (!created.ok) return json({ ok: false, error: created.error }, created.status, request, env);
  return json({
    ok: true,
    state: "manual_review",
    submitted: true,
    idempotent: false,
    review_required: true,
    wish_id: clean(created.record?.fields?.wish_id) || fields.wish_id,
    delivery: { telegram: input.telegramConsent, past_clients: input.pastClientsConsent },
  }, 200, request, env);
}

// Extend the existing credential-bound admin review queue without changing its
// post-job campaign. This runs only after core has already returned a successful
// authorized queue response.
export async function augmentModelDirectWishReviewQueue(request, response, env = {}) {
  if (!(response instanceof Response) || !response.ok) return response;
  if (!isModelDirectWishAdminQueueRequest(new URL(request.url).pathname, request.method)) return response;
  const contentType = clean(response.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("application/json")) return response;
  const core = await response.clone().json().catch(() => null);
  if (!core || core.ok !== true || !Array.isArray(core.wishes)) return response;
  const direct = await listDirectReviewQueue(env);
  if (!direct.ok) return response;
  const merged = [...core.wishes, ...direct.wishes].sort((a, b) => clean(b.submitted_at).localeCompare(clean(a.submitted_at)));
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-model-direct-wish", "review-queue-v1");
  return new Response(JSON.stringify({ ...core, wishes: merged }), { status: response.status, statusText: response.statusText, headers });
}

// Core owns credential validation for /v1/admin/model-wishes/review. A direct
// campaign intentionally causes core's campaign guard to return 409; only then
// do we handle this separate private-distribution campaign. Unauthorized calls
// therefore never reach this fallback.
export async function maybeHandleModelDirectWishReview(request, coreResponse, env = {}) {
  if (!(coreResponse instanceof Response)) return coreResponse;
  if (!isModelDirectWishAdminReviewRequest(new URL(request.url).pathname, request.method)) return coreResponse;
  if (coreResponse.status !== 409) return coreResponse;

  const body = await request.clone().json().catch(() => null);
  const recordId = clean(body?.record_id);
  const decision = clean(body?.decision).toLowerCase();
  if (!/^rec[a-zA-Z0-9]{14}$/.test(recordId) || !["approve", "reject"].includes(decision)) return coreResponse;
  const current = await readWishRecord(env, recordId);
  if (!current.ok) return coreResponse;
  const fields = current.record?.fields || {};
  if (clean(fields.campaign_id) !== CAMPAIGN_ID || clean(fields.wish_status) !== "manual_review") return coreResponse;

  let payload = safeJsonObject(fields.payload_json);
  if (payload.wish_kind !== "model_direct_wish") return coreResponse;
  const now = new Date().toISOString();
  const reviewer = clean(request.headers.get("X-MMD-Operator") || "admin").slice(0, 120);
  payload.review = { decision, reviewed_at: now, reviewed_by: reviewer };

  let telegramDelivery = { state: "not_requested", targets: [] };
  if (decision === "approve" && payload.telegram_consent === true) {
    telegramDelivery = await deliverApprovedWishToTelegram(env, payload);
  }
  const pastState = decision === "approve" && payload.past_clients_consent === true ? "available_in_my_mmd" : "not_requested";
  payload.delivery = {
    telegram: telegramDelivery,
    past_clients: { state: pastState, activated_at: decision === "approve" && payload.past_clients_consent === true ? now : null },
  };

  const patched = await patchWish(env, recordId, {
    wish_status: decision === "approve" ? "completed" : "revoked",
    // This campaign is never projected to the public Wish wall. Customer access
    // is dynamically matched in MY MMD from completed canonical Sessions only.
    public_display_text: "",
    payload_json: JSON.stringify(payload),
    updated_at: now,
  });
  if (!patched.ok) return json({ ok: false, error: patched.error }, patched.status, request, env);

  return json({
    ok: true,
    record_id: recordId,
    decision,
    wish_status: decision === "approve" ? "completed" : "revoked",
    delivery: payload.delivery,
  }, 200, request, env, { "X-MMD-Model-Direct-Wish": "review-v1" });
}

async function deliverApprovedWishToTelegram(env, payload) {
  const model = await readModel(env, clean(payload.model_record_id));
  const tier = model.ok && model.tier !== "unknown" ? model.tier : normalizeModelWishTier(payload.model_tier);
  const displayName = clean(model.ok ? model.displayName : payload.model_display_name).slice(0, 120) || "MMD Model";
  const targets = modelWishTelegramTargets(tier, env);
  if (!targets.length) return { state: "failed_closed", reason: "model_tier_or_target_unresolved", tier, targets: [] };
  const endpoint = clean(env.TELEGRAM_INTERNAL_SEND_URL || "https://telegram-worker.malemodel-bkk.workers.dev/telegram/internal/send");
  const token = clean(env.AUTH_SERVICE_STUDIO_TO_TELEGRAM || env.AUTH_SERVICE_ADMIN_TO_TELEGRAM);
  if (!endpoint || !token) return { state: "failed_closed", reason: "telegram_service_auth_missing", tier, targets: [] };

  const birthday = clean(payload.birthday_wish).slice(0, MAX_BIRTHDAY);
  const mmdMessage = clean(payload.mmd_message).slice(0, MAX_MMD_MESSAGE);
  const text = [
    "6 YEARS · FROM OUR MODEL",
    displayName,
    birthday,
    mmdMessage ? `ถึง MMD · ${mmdMessage}` : "",
    "MMD YEAR 6 · MODEL WISH",
  ].filter(Boolean).join("\n\n");
  if (!birthday && !mmdMessage) return { state: "failed_closed", reason: "approved_shareable_text_missing", tier, targets: [] };

  const results = [];
  for (const target of targets) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-token": token },
        body: JSON.stringify({ flow: "model_year6_wish", chat_id: target.chat_id, text }),
      });
      const body = await response.json().catch(() => null);
      results.push({ audience: target.audience, ok: response.ok && body?.ok !== false, status: response.status });
    } catch {
      results.push({ audience: target.audience, ok: false, status: 0 });
    }
  }
  return {
    state: results.every((item) => item.ok) ? "sent" : results.some((item) => item.ok) ? "partial" : "failed",
    tier,
    // Exclusive is deliberately text-only here. Customer-facing real photos are
    // never emitted from this flow, preserving the AI-image-only Exclusive rule.
    presentation: "text_only",
    targets: results,
  };
}

async function listDirectReviewQueue(env) {
  if (!storageReady(env)) return { ok: false, wishes: [] };
  const params = new URLSearchParams({
    maxRecords: "100",
    filterByFormula: `AND({campaign_id}=${formulaString(CAMPAIGN_ID)},{wish_status}='manual_review')`,
  });
  params.set("sort[0][field]", "submitted_at");
  params.set("sort[0][direction]", "desc");
  const result = await airtableRequest(env, wishTable(env), `?${params}`);
  if (!result.ok || !Array.isArray(result.data?.records)) return { ok: false, wishes: [] };
  return {
    ok: true,
    wishes: result.data.records.map((record) => {
      const fields = record.fields || {};
      const payload = safeJsonObject(fields.payload_json);
      return {
        record_id: record.id,
        wish_id: clean(fields.wish_id),
        wish_text: clean(fields.wish_text).slice(0, 280),
        submitted_at: clean(fields.submitted_at),
        source_path: clean(fields.source_path),
        language: clean(fields.language),
        wish_option: clean(fields.wish_option),
        campaign_id: CAMPAIGN_ID,
        direct_model_wish: true,
        model_name: clean(payload.model_display_name).slice(0, 120) || null,
        model_tier: normalizeModelWishTier(payload.model_tier),
        telegram_consent: payload.telegram_consent === true,
        past_clients_consent: payload.past_clients_consent === true,
        private_note_per: clean(payload.private_note_per).slice(0, MAX_PRIVATE_NOTE) || null,
      };
    }),
  };
}

function normalizeInput(body) {
  const birthdayWish = clean(body.birthday_wish).slice(0, MAX_BIRTHDAY + 1);
  const mmdMessage = clean(body.mmd_message).slice(0, MAX_MMD_MESSAGE + 1);
  const privateNotePer = clean(body.private_note_per).slice(0, MAX_PRIVATE_NOTE + 1);
  if (!birthdayWish && !mmdMessage && !privateNotePer) return { ok: false, status: 400, error: "model_wish_empty" };
  if (birthdayWish.length > MAX_BIRTHDAY || mmdMessage.length > MAX_MMD_MESSAGE || privateNotePer.length > MAX_PRIVATE_NOTE) {
    return { ok: false, status: 400, error: "model_wish_too_long" };
  }
  if (/[<>]/.test(birthdayWish) || /[<>]/.test(mmdMessage) || /[<>]/.test(privateNotePer)) {
    return { ok: false, status: 400, error: "model_wish_invalid" };
  }
  if (clean(body.private_note_scope || "per_only") !== "per_only") return { ok: false, status: 400, error: "private_note_scope_invalid" };
  const photoMediaIds = Array.isArray(body.photo_media_ids) ? body.photo_media_ids.map((id) => clean(id).slice(0, 160)).filter(Boolean) : [];
  if (photoMediaIds.length !== 5 || new Set(photoMediaIds).size !== 5 || Number(body.photo_count) !== 5) {
    return { ok: false, status: 400, error: "five_profile_photos_required" };
  }
  if (photoMediaIds.some((id) => !/^media_[a-zA-Z0-9-]{8,}$/.test(id))) return { ok: false, status: 400, error: "photo_media_id_invalid" };
  return {
    ok: true,
    birthdayWish,
    mmdMessage,
    privateNotePer,
    telegramConsent: body.telegram_consent === true,
    pastClientsConsent: body.past_clients_consent === true,
    photoMediaIds,
    consentVersion: clean(body.consent_version || "model_wish_v3").slice(0, 80),
  };
}

async function readInput(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > 24_000) return { ok: false, status: 413, error: "payload_too_large" };
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: 400, error: "invalid_json" };
  if (Object.keys(body).some((key) => !BODY_KEYS.has(key))) return { ok: false, status: 400, error: "unexpected_field" };
  return { ok: true, body };
}

async function readModel(env, recordId) {
  if (!storageReady(env) || !/^rec[a-zA-Z0-9]{14}$/.test(recordId)) return { ok: false, status: 404, error: "model_not_found" };
  const result = await airtableRequest(env, modelTable(env), `/${encodeURIComponent(recordId)}`);
  if (!result.ok || !result.data?.id) return { ok: false, status: result.status === 404 ? 404 : 503, error: result.status === 404 ? "model_not_found" : "model_lookup_failed" };
  const fields = result.data.fields || {};
  const displayName = firstField(fields, ["working_name", "Per Name", "per_name", "display_name", "Model Name", "name"]) || "MMD Model";
  const tier = normalizeModelWishTier(firstField(fields, ["model_tier", "Model Tier", "model_class", "Model Class", "private_tier", "Private Tier"]));
  return { ok: true, status: 200, displayName: clean(displayName).slice(0, 120), tier, record: result.data };
}

async function findWish(env, idempotencyKey) {
  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `AND({campaign_id}=${formulaString(CAMPAIGN_ID)},{idempotency_key}=${formulaString(idempotencyKey)})`,
  });
  const result = await airtableRequest(env, wishTable(env), `?${params}`);
  if (!result.ok || !Array.isArray(result.data?.records)) return { ok: false, status: 503, error: "model_wish_storage_unavailable" };
  if (result.data.records.length > 1) return { ok: false, status: 409, error: "model_wish_conflict" };
  return { ok: true, status: 200, record: result.data.records[0] || null };
}

async function createWish(env, fields) {
  const result = await airtableRequest(env, wishTable(env), "", {
    method: "POST",
    body: JSON.stringify({ fields: compact(fields), typecast: false }),
  });
  if (!result.ok || !result.data?.id) return { ok: false, status: 503, error: "model_wish_write_failed" };
  return { ok: true, status: 200, record: result.data };
}

async function readWishRecord(env, recordId) {
  const result = await airtableRequest(env, wishTable(env), `/${encodeURIComponent(recordId)}`);
  if (!result.ok || !result.data?.id) return { ok: false, status: result.status || 503, error: "model_wish_read_failed" };
  return { ok: true, record: result.data };
}

async function patchWish(env, recordId, fields) {
  const result = await airtableRequest(env, wishTable(env), `/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: compact(fields), typecast: false }),
  });
  if (!result.ok || !result.data?.id) return { ok: false, status: 503, error: "model_wish_review_write_failed" };
  return { ok: true, record: result.data };
}

async function airtableRequest(env, table, suffix = "", init = {}) {
  if (!storageReady(env)) return { ok: false, status: 503, data: null };
  const url = `https://api.airtable.com/v0/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}${suffix}`;
  try {
    const response = await fetch(url, {
      method: init.method || "GET",
      headers: { authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
      body: init.body,
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 503, data: null };
  }
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

function firstField(fields, candidates) {
  const entries = Object.entries(fields || {});
  for (const wanted of candidates) {
    const target = wanted.toLowerCase().replace(/[\s_-]+/g, "");
    const match = entries.find(([key]) => key.toLowerCase().replace(/[\s_-]+/g, "") === target);
    if (!match) continue;
    const value = match[1];
    if (Array.isArray(value)) {
      const first = value[0];
      if (first && typeof first === "object") return first.name || first.value || "";
      return first || "";
    }
    if (value && typeof value === "object") return value.name || value.value || "";
    if (clean(value)) return value;
  }
  return "";
}

function safeJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(clean(value) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function storageReady(env) { return Boolean(clean(env.AIRTABLE_API_KEY) && clean(env.AIRTABLE_BASE_ID)); }
function wishTable(env) { return clean(env.AIRTABLE_TABLE_CARE_BACK_BIRTHDAY_WISHES || WISH_TABLE_DEFAULT); }
function modelTable(env) { return clean(env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || MODELS_TABLE_DEFAULT); }
function compact(value) { return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")); }
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
    "https://mmdprive.webflow.io",
    ...String(env.ALLOWED_ORIGINS || "").split(",").map(clean).filter(Boolean),
  ]);
  return allowed.has(origin);
}

function corsHeaders(request, env) {
  const origin = clean(request.headers.get("origin"));
  const headers = new Headers({
    "access-control-allow-methods": "POST, OPTIONS",
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
  headers.set("x-mmd-model-wish", "direct-v1");
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
function base64UrlDecode(value) { const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4); return decodeURIComponent(escape(atob(padded))); }
function constantTimeEqual(a, b) { const left = clean(a).toLowerCase(); const right = clean(b).toLowerCase(); if (left.length !== right.length || !left) return false; let diff = 0; for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i); return diff === 0; }
