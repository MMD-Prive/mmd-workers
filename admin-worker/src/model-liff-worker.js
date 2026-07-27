import dashboardWorker from "./dashboard-worker.js";

const EXCHANGE_PATH = "/v1/model/liff/exchange";
const CURRENT_PATH = "/v1/model/session/current";
const ACTION_PATH = "/v1/model/session/action";
const COOKIE_NAME = "mmd_model_session_v1";
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const ACTIVE_SESSION_STATES = new Set([
  "confirmed",
  "accepted",
  "en_route",
  "traveling",
  "arrived",
  "met_customer",
  "work_started",
  "work_finished",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS" && isModelLiffPath(path)) {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (path === EXCHANGE_PATH) {
      if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, request, env);
      return handleExchange(request, env);
    }

    if (path === CURRENT_PATH || path === ACTION_PATH) {
      const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
      if (token && !url.searchParams.get("t")) {
        url.searchParams.set("t", token);
        request = new Request(url.toString(), request);
      }
    }

    return dashboardWorker.fetch(request, env, ctx);
  },
};

export function resolveLineChannelId(env = {}, environment = "") {
  const value = String(environment || "").trim().toLowerCase();
  if (value === "developing" || value === "development" || value === "dev") {
    return String(env.LINE_MINIAPP_DEV_CHANNEL_ID || "2010864852").trim();
  }
  if (value === "review") {
    return String(env.LINE_MINIAPP_REVIEW_CHANNEL_ID || "2010864853").trim();
  }
  return String(env.LINE_MINIAPP_PUBLISHED_CHANNEL_ID || "2010864854").trim();
}

export function normalizeLineEnvironment(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (["developing", "development", "dev"].includes(normalized)) return "developing";
  if (normalized === "review") return "review";
  return "published";
}

export function parseCookieHeader(header = "") {
  const result = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function isModelLiffPath(path) {
  return path === EXCHANGE_PATH || path === CURRENT_PATH || path === ACTION_PATH;
}

async function handleExchange(request, env) {
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403, request, env);

  const body = await request.json().catch(() => ({}));
  const idToken = String(body?.idToken || body?.id_token || "").trim();
  const environment = normalizeLineEnvironment(body?.environment);
  if (!idToken) return json({ ok: false, error: "id_token_required" }, 400, request, env);

  const channelId = resolveLineChannelId(env, environment);
  const lineIdentity = await verifyLineIdToken(idToken, channelId);
  if (!lineIdentity.ok) return json({ ok: false, error: lineIdentity.error }, lineIdentity.status, request, env);

  const model = await findModelByLineUserId(env, lineIdentity.profile.sub);
  if (!model.ok) return json({ ok: false, error: model.error }, model.status, request, env);

  const session = await findActiveSessionForModel(env, model.record);
  if (!session.ok) return json({ ok: false, error: session.error }, session.status, request, env);

  const ttlSeconds = clampInt(env.MODEL_LIFF_SESSION_TTL_SECONDS, 300, 28800, 3600);
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = {
    kind: "model_session",
    role: "model",
    session_id: session.sessionId,
    payment_ref: session.paymentRef || undefined,
    model_record_id: model.record.id,
    model_name: model.displayName,
    line_user_id: lineIdentity.profile.sub,
    line_environment: environment,
    exp: expiresAtSeconds,
  };
  const token = await signPayload(payload, env);
  if (!token) return json({ ok: false, error: "signing_not_ready" }, 503, request, env);

  const response = json({
    ok: true,
    environment,
    expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
    model: {
      id: model.record.id,
      code: model.code,
      display_name: model.displayName,
    },
    session: {
      session_id: session.sessionId,
      state: session.state,
    },
  }, 200, request, env);
  response.headers.append("set-cookie", serializeSessionCookie(token, ttlSeconds));
  return response;
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
  } catch {
    return { ok: false, status: 503, error: "line_verify_unavailable" };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.sub || String(data?.aud || "") !== channelId) {
    return { ok: false, status: 401, error: "invalid_line_id_token" };
  }
  return { ok: true, profile: data };
}

async function findModelByLineUserId(env, lineUserId) {
  const table = String(env.AIRTABLE_TABLE_MODELS || "models").trim();
  const lineFields = unique([
    env.AT_MODELS__LINE_USER_ID,
    "LINE User ID",
    "line_user_id",
    "line_id",
    "LINE ID",
  ].map(clean).filter(Boolean));

  for (const field of lineFields) {
    const result = await airtableList(env, table, `{${field}}="${escapeFormula(lineUserId)}"`, 1);
    if (result.schemaError) continue;
    if (!result.ok) return { ok: false, status: 503, error: "model_lookup_unavailable" };
    const record = result.records[0];
    if (!record) continue;
    if (!isActiveModel(record.fields || {}, env)) return { ok: false, status: 403, error: "model_not_active" };
    return {
      ok: true,
      record,
      code: firstText(record.fields, [env.AT_MODELS__MODEL_CODE, "model_code", "Model Code", "unique_key"]),
      displayName: firstText(record.fields, [env.AT_MODELS__DISPLAY_NAME, "display_name", "Display Name", "nickname", "Nickname", "name", "Name"]) || "Model",
    };
  }
  return { ok: false, status: 403, error: "model_not_linked" };
}

function isActiveModel(fields, env) {
  const status = firstText(fields, [env.AT_MODELS__STATUS, "status", "Status", "model_status", "Model Status"]);
  if (!status) return true;
  return !/inactive|disabled|suspended|blocked|archived|rejected|offboard/i.test(status);
}

async function findActiveSessionForModel(env, modelRecord) {
  const table = String(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX").trim();
  const assignedField = String(env.AT_SESSIONS__MODEL_RECORD_ID || "Assigned Model").trim();
  const formula = `FIND("${escapeFormula(modelRecord.id)}", ARRAYJOIN({${assignedField}}))`;
  const result = await airtableList(env, table, formula, 20);
  if (!result.ok) return { ok: false, status: 503, error: "session_lookup_unavailable" };

  const sessionIdField = String(env.AT_SESSIONS__SESSION_ID || "session_id");
  const stateFields = unique([env.AT_SESSIONS__STATE, env.AT_SESSIONS__STATUS, "session_state", "status"].map(clean).filter(Boolean));
  const paymentField = String(env.AT_SESSIONS__PAYMENT_REF || "payment_ref");

  for (const record of result.records) {
    const state = firstText(record.fields || {}, stateFields).toLowerCase();
    if (state && !ACTIVE_SESSION_STATES.has(state)) continue;
    const sessionId = firstText(record.fields || {}, [sessionIdField]);
    if (!sessionId) continue;
    return {
      ok: true,
      record,
      sessionId,
      paymentRef: firstText(record.fields || {}, [paymentField]),
      state: state || "confirmed",
    };
  }
  return { ok: false, status: 404, error: "active_session_not_found" };
}

async function airtableList(env, table, formula, pageSize) {
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const baseId = clean(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !table) return { ok: false, records: [] };
  const params = new URLSearchParams();
  params.set("pageSize", String(pageSize || 10));
  if (formula) params.set("filterByFormula", formula);
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = JSON.stringify(data || {});
    return { ok: false, schemaError: response.status === 422 || /unknown field|invalid.*field/i.test(message), records: [] };
  }
  return { ok: true, records: Array.isArray(data.records) ? data.records : [] };
}

async function signPayload(payload, env) {
  const secret = clean(env.CONFIRM_KEY || env.INTERNAL_TOKEN);
  if (!secret) return "";
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacHex(encoded, secret);
  return `${encoded}.${signature}`;
}

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function serializeSessionCookie(token, maxAge) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/v1/model; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(header, name) {
  return parseCookieHeader(header)[name] || "";
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function firstText(fields, names) {
  for (const name of names) {
    if (!name) continue;
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) return clean(value[0]);
    if (value !== undefined && value !== null && clean(value)) return clean(value);
  }
  return "";
}

function clean(value) {
  return String(value ?? "").trim();
}

function unique(values) {
  return [...new Set(values)];
}

function escapeFormula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function isAllowedOrigin(request, env) {
  const origin = clean(request.headers.get("origin"));
  if (!origin) return true;
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(clean).filter(Boolean));
  return allowed.has(origin);
}

function corsHeaders(request, env) {
  const origin = clean(request.headers.get("origin"));
  const headers = new Headers({
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-allow-credentials": "true",
    vary: "Origin",
  });
  if (origin && isAllowedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(payload, status, request, env) {
  const headers = corsHeaders(request, env);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers });
}
