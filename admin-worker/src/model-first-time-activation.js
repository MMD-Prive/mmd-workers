const AIRTABLE_API = "https://api.airtable.com/v0";
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const ACTIVATION_KIND = "model_activation_v1";
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const MAX_TTL_SECONDS = 72 * 60 * 60;

export const MODEL_ACTIVATION_ADMIN_PATH = "/v1/admin/model/activation/issue";
export const MODEL_ACTIVATION_LIFF_PATH = "/v1/model/liff/activate";

const LIFF_IDS = {
  developing: "2010864852-MuzunIKU",
  review: "2010864853-7SqCQVxy",
  published: "2010864854-N34SgCqq",
};

function clean(value, max = 1000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeActivationEnvironment(value = "") {
  const normalized = clean(value, 40).toLowerCase();
  if (["developing", "development", "dev"].includes(normalized)) return "developing";
  if (normalized === "review") return "review";
  return "published";
}

export function normalizeActivationTtlSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_TTL_SECONDS;
  return Math.min(Math.max(Math.round(numeric), 60 * 60), MAX_TTL_SECONDS);
}

export function isCanonicalLineUserId(value = "") {
  return /^U[0-9a-f]{32}$/i.test(clean(value, 80));
}

export function validateActivationPayload(payload = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, error: "activation_token_invalid" };
  if (payload.kind !== ACTIVATION_KIND || Number(payload.version) !== 1) return { ok: false, error: "activation_token_invalid" };
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(clean(payload.model_record_id, 40))) return { ok: false, error: "activation_token_invalid" };
  if (!clean(payload.jti, 120)) return { ok: false, error: "activation_token_invalid" };
  const iat = Number(payload.iat);
  const exp = Number(payload.exp);
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || iat > nowSeconds + 60 || exp <= nowSeconds) {
    return { ok: false, error: exp <= nowSeconds ? "activation_token_expired" : "activation_token_invalid" };
  }
  if (exp - iat > MAX_TTL_SECONDS + 60) return { ok: false, error: "activation_token_invalid" };
  return { ok: true, payload: { ...payload, environment: normalizeActivationEnvironment(payload.environment) } };
}

export function activationLiffUrl(token, environment = "published", env = {}) {
  const normalized = normalizeActivationEnvironment(environment);
  const id = clean(
    normalized === "developing"
      ? env.MODEL_LIFF_DEV_ID
      : normalized === "review"
        ? env.MODEL_LIFF_REVIEW_ID
        : env.MODEL_LIFF_PUBLISHED_ID,
    120,
  ) || LIFF_IDS[normalized];
  const url = new URL(`https://miniapp.line.me/${id}`);
  url.searchParams.set("activation", token);
  return url.toString();
}

export async function issueModelActivation(request, env = {}) {
  if (request.method.toUpperCase() !== "POST") return json(request, env, { ok: false, error: "method_not_allowed" }, 405);
  if (!isAllowedOrigin(request, env)) return json(request, env, { ok: false, error: "origin_not_allowed" }, 403);

  const body = await request.json().catch(() => null);
  const modelRecordId = clean(body?.model_record_id || body?.model_id, 40);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(modelRecordId)) {
    return json(request, env, { ok: false, error: "model_record_id_invalid" }, 400);
  }

  const model = await airtableGetModel(env, modelRecordId);
  if (!model.ok) return json(request, env, { ok: false, error: model.status === 404 ? "model_not_found" : "model_lookup_unavailable" }, model.status);

  const lineField = lineUserIdField(env);
  const existingLineUserId = clean(model.record?.fields?.[lineField], 80);
  if (existingLineUserId) {
    return json(request, env, {
      ok: false,
      error: "model_already_linked",
      model: safeModelSummary(model.record),
    }, 409);
  }

  const environment = normalizeActivationEnvironment(body?.environment);
  const ttlSeconds = normalizeActivationTtlSeconds(Number(body?.ttl_hours) * 60 * 60 || body?.ttl_seconds);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    version: 1,
    kind: ACTIVATION_KIND,
    model_record_id: modelRecordId,
    jti: crypto.randomUUID(),
    environment,
    iat: now,
    exp: now + ttlSeconds,
  };
  const token = await signActivationPayload(payload, env);
  if (!token) return json(request, env, { ok: false, error: "activation_signing_not_ready" }, 503);

  return json(request, env, {
    ok: true,
    activation_url: activationLiffUrl(token, environment, env),
    expires_at: new Date(payload.exp * 1000).toISOString(),
    environment,
    model: safeModelSummary(model.record),
  });
}

export async function activateModelLine(request, env = {}, baseWorker) {
  if (request.method.toUpperCase() === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (request.method.toUpperCase() !== "POST") return json(request, env, { ok: false, error: "method_not_allowed" }, 405);
  if (!isAllowedOrigin(request, env)) return json(request, env, { ok: false, error: "origin_not_allowed" }, 403);

  const body = await request.json().catch(() => null);
  const activationToken = clean(body?.activation_token || body?.activation, 5000);
  const idToken = clean(body?.idToken || body?.id_token, 5000);
  const environment = normalizeActivationEnvironment(body?.environment);
  if (!activationToken) return json(request, env, { ok: false, error: "activation_token_required" }, 400);
  if (!idToken) return json(request, env, { ok: false, error: "id_token_required" }, 400);

  const activation = await verifyActivationToken(activationToken, env);
  if (!activation.ok) return json(request, env, { ok: false, error: activation.error }, activation.status || 401);
  if (activation.payload.environment !== environment) {
    return json(request, env, { ok: false, error: "activation_environment_mismatch" }, 409);
  }

  const lineIdentity = await verifyLineIdToken(idToken, resolveLineChannelId(env, environment));
  if (!lineIdentity.ok) return json(request, env, { ok: false, error: lineIdentity.error }, lineIdentity.status);
  const lineUserId = clean(lineIdentity.profile?.sub, 80);
  if (!isCanonicalLineUserId(lineUserId)) return json(request, env, { ok: false, error: "line_identity_invalid" }, 401);

  const binding = await bindLineUserId(env, {
    model_record_id: activation.payload.model_record_id,
    line_user_id: lineUserId,
    jti: activation.payload.jti,
    exp: activation.payload.exp,
  });
  if (!binding.ok) return json(request, env, { ok: false, error: binding.error }, binding.status || 409);

  if (!baseWorker || typeof baseWorker.fetch !== "function") {
    return json(request, env, { ok: false, error: "model_session_exchange_unavailable" }, 503);
  }

  const exchangeUrl = new URL("/v1/model/liff/exchange", request.url);
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  const exchangeRequest = new Request(exchangeUrl.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ idToken, environment }),
  });
  const response = await baseWorker.fetch(exchangeRequest, env);
  if (!response.ok) return response;

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("x-mmd-model-activation", binding.idempotent ? "already-linked-same-line" : "linked");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}

async function bindLineUserId(env, input) {
  const namespace = env.MODEL_ACTIVATION_COORDINATOR;
  if (!namespace || typeof namespace.idFromName !== "function") {
    return { ok: false, status: 503, error: "activation_coordinator_not_ready" };
  }
  const id = namespace.idFromName(input.model_record_id);
  const stub = namespace.get(id);
  const response = await stub.fetch("https://model-activation.internal/bind", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, status: response.status };
}

export class ModelActivationCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/bind" || request.method.toUpperCase() !== "POST") {
      return internalJson({ ok: false, error: "not_found" }, 404);
    }

    const input = await request.json().catch(() => null);
    const modelRecordId = clean(input?.model_record_id, 40);
    const lineUserId = clean(input?.line_user_id, 80);
    const jti = clean(input?.jti, 120);
    const exp = Number(input?.exp);
    if (!/^rec[A-Za-z0-9]{14,24}$/.test(modelRecordId) || !isCanonicalLineUserId(lineUserId) || !jti || !Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) {
      return internalJson({ ok: false, error: "activation_binding_invalid" }, 400);
    }

    const prior = await this.state.storage.get("binding");
    if (prior?.jti === jti) {
      if (prior.model_record_id === modelRecordId && prior.line_user_id === lineUserId) {
        return internalJson({ ok: true, idempotent: true, model_record_id: modelRecordId }, 200);
      }
      return internalJson({ ok: false, error: "activation_token_already_used" }, 409);
    }

    const model = await airtableGetModel(this.env, modelRecordId);
    if (!model.ok) return internalJson({ ok: false, error: model.status === 404 ? "model_not_found" : "model_lookup_unavailable" }, model.status);

    const field = lineUserIdField(this.env);
    const existing = clean(model.record?.fields?.[field], 80);
    if (existing) {
      if (existing === lineUserId) {
        await this.state.storage.put("binding", { jti, model_record_id: modelRecordId, line_user_id: lineUserId, bound_at: new Date().toISOString() });
        return internalJson({ ok: true, idempotent: true, model_record_id: modelRecordId }, 200);
      }
      return internalJson({ ok: false, error: "model_line_identity_conflict" }, 409);
    }

    const collision = await findModelWithLineUserId(this.env, lineUserId);
    if (!collision.ok) return internalJson({ ok: false, error: collision.error }, collision.status);
    if (collision.record && collision.record.id !== modelRecordId) {
      return internalJson({ ok: false, error: "line_identity_already_linked" }, 409);
    }

    const updated = await airtableUpdateModel(this.env, modelRecordId, { [field]: lineUserId });
    if (!updated.ok) return internalJson({ ok: false, error: "model_line_binding_failed" }, updated.status);

    await this.state.storage.put("binding", {
      jti,
      model_record_id: modelRecordId,
      line_user_id: lineUserId,
      bound_at: new Date().toISOString(),
    });
    return internalJson({ ok: true, idempotent: false, model_record_id: modelRecordId }, 200);
  }
}

async function verifyLineIdToken(idToken, channelId) {
  const form = new URLSearchParams();
  form.set("id_token", idToken);
  form.set("client_id", channelId);
  let response;
  try {
    response = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch (_) {
    return { ok: false, status: 503, error: "line_verify_unavailable" };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: 401, error: "line_id_token_invalid" };
  if (clean(data.aud, 80) !== clean(channelId, 80)) return { ok: false, status: 401, error: "line_audience_mismatch" };
  if (!isCanonicalLineUserId(data.sub)) return { ok: false, status: 401, error: "line_identity_invalid" };
  return { ok: true, status: 200, profile: data };
}

function resolveLineChannelId(env, environment) {
  const normalized = normalizeActivationEnvironment(environment);
  if (normalized === "developing") return clean(env.LINE_MINIAPP_DEV_CHANNEL_ID, 80) || "2010864852";
  if (normalized === "review") return clean(env.LINE_MINIAPP_REVIEW_CHANNEL_ID, 80) || "2010864853";
  return clean(env.LINE_MINIAPP_PUBLISHED_CHANNEL_ID, 80) || "2010864854";
}

async function signActivationPayload(payload, env) {
  const secret = activationSigningSecret(env);
  if (!secret) return "";
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(payloadPart, secret);
  return signature ? `${payloadPart}.${signature}` : "";
}

async function verifyActivationToken(token, env) {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { ok: false, status: 401, error: "activation_token_invalid" };
  const payloadPart = token.slice(0, dot);
  const suppliedSignature = token.slice(dot + 1);
  const secret = activationSigningSecret(env);
  if (!secret) return { ok: false, status: 503, error: "activation_signing_not_ready" };
  const expected = await hmac(payloadPart, secret);
  if (!expected || !(await constantTimeEqual(expected, suppliedSignature))) {
    return { ok: false, status: 401, error: "activation_token_invalid" };
  }
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch (_) {
    return { ok: false, status: 401, error: "activation_token_invalid" };
  }
  const valid = validateActivationPayload(payload);
  return valid.ok ? { ok: true, status: 200, payload: valid.payload } : { ok: false, status: valid.error === "activation_token_expired" ? 410 : 401, error: valid.error };
}

function activationSigningSecret(env = {}) {
  return clean(env.LINK_SIGNING_SECRET || env.MODEL_SESSION_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN, 5000);
}

async function hmac(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  let normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  normalized += "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function airtableConfig(env = {}) {
  return {
    apiKey: clean(env.AIRTABLE_API_KEY, 2000),
    baseId: clean(env.AIRTABLE_BASE_ID, 200),
    table: clean(env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS, 200) || "Models",
  };
}

function lineUserIdField(env = {}) {
  return clean(env.AT_MODELS__LINE_USER_ID, 120) || "line_user_id";
}

async function airtableGetModel(env, recordId) {
  const config = airtableConfig(env);
  if (!config.apiKey || !config.baseId) return { ok: false, status: 503, error: "missing_airtable_env" };
  const url = `${AIRTABLE_API}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.table)}/${encodeURIComponent(recordId)}`;
  let response;
  try {
    response = await fetch(url, { headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json" } });
  } catch (_) {
    return { ok: false, status: 503, error: "airtable_unreachable" };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, error: "airtable_request_failed" };
  return { ok: true, status: 200, record: data };
}

async function airtableUpdateModel(env, recordId, fields) {
  const config = airtableConfig(env);
  if (!config.apiKey || !config.baseId) return { ok: false, status: 503, error: "missing_airtable_env" };
  const url = `${AIRTABLE_API}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.table)}/${encodeURIComponent(recordId)}`;
  let response;
  try {
    response = await fetch(url, {
      method: "PATCH",
      headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ fields, typecast: false }),
    });
  } catch (_) {
    return { ok: false, status: 503, error: "airtable_unreachable" };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, error: "airtable_request_failed" };
  return { ok: true, status: 200, record: data };
}

async function findModelWithLineUserId(env, lineUserId) {
  const config = airtableConfig(env);
  if (!config.apiKey || !config.baseId) return { ok: false, status: 503, error: "missing_airtable_env" };
  const field = lineUserIdField(env);
  const formula = `{${field}}='${escapeFormula(lineUserId)}'`;
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.table)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", formula);
  let response;
  try {
    response = await fetch(url.toString(), { headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json" } });
  } catch (_) {
    return { ok: false, status: 503, error: "airtable_unreachable" };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: 503, error: "line_identity_lookup_unavailable" };
  return { ok: true, status: 200, record: Array.isArray(data.records) ? data.records[0] || null : null };
}

function escapeFormula(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function safeModelSummary(record = {}) {
  const fields = record.fields || {};
  const workingName = clean(fields.working_name || fields["Working Name"] || fields.display_name || fields.name, 120);
  return { id: clean(record.id, 40), working_name: workingName || "Model" };
}

function allowedOrigins(env = {}) {
  return new Set(String(env.ALLOWED_ORIGINS || "https://mmdbkk.com,https://www.mmdbkk.com,https://mmdprive.webflow.io")
    .split(",").map((value) => value.trim()).filter(Boolean));
}

function isAllowedOrigin(request, env) {
  const origin = clean(request.headers.get("Origin"), 300);
  if (!origin) return true;
  return allowedOrigins(env).has(origin);
}

function corsHeaders(request, env) {
  const headers = new Headers({
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  });
  const origin = clean(request.headers.get("Origin"), 300);
  if (origin && allowedOrigins(env).has(origin)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(request, env, data, status = 200) {
  const headers = corsHeaders(request, env);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return new Response(JSON.stringify(data), { status, headers });
}

function internalJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
