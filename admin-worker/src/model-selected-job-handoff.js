import {
  bindCanonicalModelLineFromTrustedSelection,
  normalizeActivationEnvironment,
} from "./model-first-time-activation.js";

export const MODEL_SELECTED_JOB_HANDOFF_PATH = "/v1/model/selected-job/handoff";

const AIRTABLE_API = "https://api.airtable.com/v0";
const SESSIONS_TABLE_DEFAULT = "tblC98mKWbzmPuNzX";
const CANONICAL_MODEL_FIELD = "fldrXQAyOMPCvbOaY";
const SESSION_RE = /^sess_[A-Za-z0-9._-]{8,180}$/;
const MODEL_RECORD_RE = /^rec[A-Za-z0-9]{14,24}$/;
const ALLOWED_BODY_KEYS = new Set(["session_id", "idToken", "id_token", "environment"]);

function clean(value, max = 4096) {
  return String(value ?? "").trim().slice(0, max);
}

function json(value, status = 200, extraHeaders = null) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, private",
    "x-mmd-model-selected-job-handoff": "v2",
    "x-robots-tag": "noindex, nofollow",
  });
  if (extraHeaders) {
    for (const [key, headerValue] of Object.entries(extraHeaders)) {
      if (headerValue) headers.append(key, headerValue);
    }
  }
  return new Response(JSON.stringify(value), { status, headers });
}

function formula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function forwardedProfileRequest(request) {
  const url = new URL("/v1/model/profile", request.url);
  const headers = new Headers({ accept: "application/json" });
  for (const name of ["cookie", "origin", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Request(url.toString(), { method: "GET", headers });
}

function forwardedExchangeRequest(request, { idToken, environment }) {
  const url = new URL("/v1/model/liff/exchange", request.url);
  const headers = new Headers({
    accept: "application/json",
    "content-type": "application/json",
  });
  for (const name of ["origin", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Request(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify({ idToken, environment }),
  });
}

async function readSession(env, sessionId) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 160);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  const table = clean(env.AIRTABLE_TABLE_SESSIONS || SESSIONS_TABLE_DEFAULT, 160);
  if (!baseId || !apiKey || !table) return { ok:false, status:503, error:"session_lookup_not_ready" };

  const params = new URLSearchParams({
    maxRecords: "2",
    filterByFormula: `{session_id}="${formula(sessionId)}"`,
    returnFieldsByFieldId: "true",
  });
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok:false, status:response.status >= 500 ? 503 : 500, error:"session_lookup_failed" };
  const rows = Array.isArray(data.records) ? data.records : [];
  if (rows.length !== 1) return { ok:false, status:rows.length ? 409 : 404, error:rows.length ? "session_ambiguous" : "session_not_found" };
  return { ok:true, record:rows[0] };
}

function canonicalModelIds(record) {
  const raw = record?.fields?.[CANONICAL_MODEL_FIELD];
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => typeof item === "string" ? item : clean(item?.id, 160)).filter(Boolean);
}

function safeModelConfirmationUrl(value) {
  const raw = clean(value, 12000);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.origin !== "https://mmdbkk.com") return "";
    if (url.pathname !== "/sigil/confirm/job-model") return "";
    const keys = [...url.searchParams.keys()];
    const token = clean(url.searchParams.get("t"), 9000);
    if (keys.length !== 1 || keys[0] !== "t" || !token || !/^[A-Za-z0-9._~-]+$/.test(token)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function selectedBindingJti(sessionId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(sessionId || "")));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `selected_job_${hex.slice(0, 32)}`;
}

async function resolveModelFromExistingSession(request, coreFetch) {
  const profileResponse = await coreFetch(forwardedProfileRequest(request));
  const profile = await profileResponse.clone().json().catch(() => null);
  if (!profileResponse.ok || profile?.ok !== true) {
    const status = profileResponse.status === 401 || profileResponse.status === 403 ? profileResponse.status : 503;
    return {
      ok: false,
      status,
      error: clean(profile?.error, 120) || "model_session_required",
    };
  }
  const modelRecordId = clean(profile?.model?.id || profile?.profile?.id, 160);
  if (!MODEL_RECORD_RE.test(modelRecordId)) {
    return { ok:false, status:403, error:"model_identity_not_ready" };
  }
  return { ok:true, status:200, model_record_id:modelRecordId, set_cookie:"" };
}

async function resolveModelFromLineSelection(request, env, coreFetch, {
  sessionId,
  expectedModelId,
  idToken,
  environment,
}) {
  const binding = await bindCanonicalModelLineFromTrustedSelection(env, {
    model_record_id: expectedModelId,
    idToken,
    environment,
    jti: await selectedBindingJti(sessionId),
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
  });
  if (!binding.ok) {
    const status = binding.status === 400 ? 409 : (binding.status || 409);
    return { ok:false, status, error:binding.error || "selected_model_line_binding_failed" };
  }

  const exchange = await coreFetch(forwardedExchangeRequest(request, { idToken, environment }));
  const exchangeBody = await exchange.clone().json().catch(() => null);
  if (!exchange.ok || exchangeBody?.ok !== true) {
    const status = exchange.status === 401 || exchange.status === 403 || exchange.status === 409
      ? exchange.status
      : 503;
    return {
      ok:false,
      status,
      error:clean(exchangeBody?.error, 120) || "model_session_exchange_failed",
    };
  }

  const modelRecordId = clean(exchangeBody?.model?.id || exchangeBody?.profile?.id, 160);
  if (!MODEL_RECORD_RE.test(modelRecordId)) {
    return { ok:false, status:403, error:"model_identity_not_ready" };
  }

  return {
    ok:true,
    status:200,
    model_record_id:modelRecordId,
    set_cookie:clean(exchange.headers.get("set-cookie"), 12000),
  };
}

export function isModelSelectedJobHandoffRequest(path, method) {
  return String(path || "").replace(/\/+$/g, "") === MODEL_SELECTED_JOB_HANDOFF_PATH
    && String(method || "").toUpperCase() === "POST";
}

export async function handleModelSelectedJobHandoff(request, env = {}, coreFetch) {
  const body = await request.json().catch(() => null);
  const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
  const sessionId = clean(body?.session_id, 220);
  if (
    !SESSION_RE.test(sessionId)
    || !body
    || Array.isArray(body)
    || keys.some((key) => !ALLOWED_BODY_KEYS.has(key))
  ) {
    return json({ ok:false, error:"session_id_invalid" }, 400);
  }
  if (typeof coreFetch !== "function") {
    return json({ ok:false, error:"model_runtime_unavailable" }, 503);
  }

  const session = await readSession(env, sessionId);
  if (!session.ok) return json({ ok:false, error:session.error }, session.status);

  const canonicalIds = canonicalModelIds(session.record);
  if (canonicalIds.length !== 1 || !MODEL_RECORD_RE.test(canonicalIds[0])) {
    return json({ ok:false, error:"selected_job_model_unresolved" }, 409);
  }
  const expectedModelId = canonicalIds[0];

  const idToken = clean(body?.idToken || body?.id_token, 8000);
  const environment = normalizeActivationEnvironment(body?.environment);
  const identity = idToken
    ? await resolveModelFromLineSelection(request, env, coreFetch, {
        sessionId,
        expectedModelId,
        idToken,
        environment,
      })
    : await resolveModelFromExistingSession(request, coreFetch);

  if (!identity.ok) return json({ ok:false, error:identity.error }, identity.status);
  if (identity.model_record_id !== expectedModelId) {
    return json({ ok:false, error:"selected_job_forbidden" }, 403);
  }

  const internalToken = clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS, 5000);
  if (!internalToken || typeof env.PAYMENTS_WORKER?.fetch !== "function") {
    return json({ ok:false, error:"confirmation_reissue_not_ready" }, 503);
  }

  const reissue = await env.PAYMENTS_WORKER.fetch(new Request("https://payments-worker.internal/v1/internal/confirm/reissue-model", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-token": internalToken,
    },
    body: JSON.stringify({ session_id: sessionId }),
  }));
  const result = await reissue.json().catch(() => null);
  if (!reissue.ok || result?.ok !== true) {
    return json({ ok:false, error:clean(result?.error, 120) || "confirmation_reissue_failed" }, reissue.status >= 400 ? reissue.status : 503);
  }

  const redirectUrl = safeModelConfirmationUrl(result.model_confirmation_url);
  if (!redirectUrl) return json({ ok:false, error:"model_confirmation_url_invalid" }, 503);

  return json({
    ok:true,
    session_id:sessionId,
    redirect_url:redirectUrl,
    expires_at:result.expires_at || null,
  }, 200, identity.set_cookie ? { "set-cookie": identity.set_cookie } : null);
}
