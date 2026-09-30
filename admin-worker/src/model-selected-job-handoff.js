import { normalizeActivationEnvironment } from "./model-first-time-activation.js";
import { captureVerifiedModelLineClaimForOwnerReview } from "./model-liff-manual-review-worker.js";

export const MODEL_SELECTED_JOB_HANDOFF_PATH = "/v1/model/selected-job/handoff";

const AIRTABLE_API = "https://api.airtable.com/v0";
const SESSIONS_TABLE_DEFAULT = "tblC98mKWbzmPuNzX";
const CANONICAL_MODEL_FIELD = "fldrXQAyOMPCvbOaY";
const SESSION_NOTES_FIELD = "fldwl9Gs5tYlXG5ls";
const SELECTED_HOLD_MARKER = "[MMD_SELECTED_MODEL_HOLD_V1]";
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
    "x-mmd-model-selected-job-handoff": "v3-owner-confirm",
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
  return { ok:true, record:rows[0], table, baseId, apiKey };
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

function parseSelectedHold(notes = "") {
  const lines = String(notes || "").split(/\r?\n/);
  const line = lines.find((item) => item.startsWith(SELECTED_HOLD_MARKER));
  if (!line) return null;
  try {
    const parsed = JSON.parse(line.slice(SELECTED_HOLD_MARKER.length).trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeSelectedHold(env, session, payload) {
  const record = session?.record;
  if (!record?.id) return { ok:false, status:503, error:"selected_job_hold_session_missing" };
  const current = clean(record?.fields?.[SESSION_NOTES_FIELD], 12000);
  const markerPayload = {
    version: 1,
    session_id: clean(payload.session_id, 220),
    claim_id: clean(payload.claim_id, 120),
    line_ref: clean(payload.line_ref, 20),
    expected_model_id: MODEL_RECORD_RE.test(clean(payload.expected_model_id, 60)) ? clean(payload.expected_model_id, 60) : null,
    observed_model_id: MODEL_RECORD_RE.test(clean(payload.observed_model_id, 60)) ? clean(payload.observed_model_id, 60) : null,
    state: "owner_confirmation_required",
    captured_at: new Date().toISOString(),
  };
  const marker = `${SELECTED_HOLD_MARKER} ${JSON.stringify(markerPayload)}`;
  const kept = current
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith(SELECTED_HOLD_MARKER));
  const next = [marker, ...kept].join("\n").slice(0, 4000);

  const response = await fetch(
    `${AIRTABLE_API}/${encodeURIComponent(session.baseId)}/${encodeURIComponent(session.table)}/${encodeURIComponent(record.id)}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${session.apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ fields: { [SESSION_NOTES_FIELD]: next }, typecast: false }),
    },
  );
  if (!response.ok) return { ok:false, status:503, error:"selected_job_hold_write_failed" };
  return { ok:true, marker:markerPayload };
}

async function selectedOwnerHold(env, session, {
  sessionId,
  idToken,
  environment,
  expectedModelId = "",
  observedModelId = "",
} = {}) {
  const safeNote = `${SELECTED_HOLD_MARKER} ${JSON.stringify({
    version: 1,
    session_id: sessionId,
    expected_model_id: MODEL_RECORD_RE.test(expectedModelId) ? expectedModelId : null,
    observed_model_id: MODEL_RECORD_RE.test(observedModelId) ? observedModelId : null,
    state: "owner_confirmation_required",
  })}`;

  const claim = await captureVerifiedModelLineClaimForOwnerReview(env, {
    idToken,
    environment,
    safe_note: safeNote,
  });
  if (!claim.ok) {
    return { ok:false, status:claim.status || 503, error:claim.error || "selected_job_identity_capture_failed" };
  }

  const hold = await writeSelectedHold(env, session, {
    session_id: sessionId,
    claim_id: claim.claim_id,
    line_ref: claim.line_ref,
    expected_model_id: expectedModelId,
    observed_model_id: observedModelId,
  });
  if (!hold.ok) return hold;

  return {
    ok:true,
    claim_id:claim.claim_id,
    line_ref:claim.line_ref,
    claim_status:claim.claim_status,
    matching_model_ids:claim.matching_model_ids || [],
  };
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

async function resolveLineExchange(request, coreFetch, { idToken, environment }) {
  const exchange = await coreFetch(forwardedExchangeRequest(request, { idToken, environment }));
  const body = await exchange.clone().json().catch(() => null);
  const modelRecordId = clean(body?.model?.id || body?.profile?.id, 160);
  return {
    ok: exchange.ok && body?.ok === true && MODEL_RECORD_RE.test(modelRecordId),
    status: exchange.status,
    error: clean(body?.error, 120) || "",
    state: clean(body?.state, 120) || "",
    claim_id: clean(body?.claim_id, 120) || "",
    model_record_id: MODEL_RECORD_RE.test(modelRecordId) ? modelRecordId : "",
    set_cookie: clean(exchange.headers.get("set-cookie"), 12000),
  };
}

async function reissueModelConfirmation(env, sessionId) {
  const internalToken = clean(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS, 5000);
  if (!internalToken || typeof env.PAYMENTS_WORKER?.fetch !== "function") {
    return { ok:false, status:503, error:"confirmation_reissue_not_ready" };
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
    return {
      ok:false,
      status:reissue.status >= 400 ? reissue.status : 503,
      error:clean(result?.error, 120) || "confirmation_reissue_failed",
    };
  }

  const redirectUrl = safeModelConfirmationUrl(result.model_confirmation_url);
  if (!redirectUrl) return { ok:false, status:503, error:"model_confirmation_url_invalid" };
  return {
    ok:true,
    redirect_url:redirectUrl,
    expires_at:result.expires_at || null,
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
  const canonicalResolved = canonicalIds.length === 1 && MODEL_RECORD_RE.test(canonicalIds[0]);
  const expectedModelId = canonicalResolved ? canonicalIds[0] : "";

  const idToken = clean(body?.idToken || body?.id_token, 8000);
  const environment = normalizeActivationEnvironment(body?.environment);

  let identity;
  if (idToken) {
    const exchange = await resolveLineExchange(request, coreFetch, { idToken, environment });

    if (canonicalResolved && exchange.ok && exchange.model_record_id === expectedModelId) {
      identity = {
        ok:true,
        model_record_id:exchange.model_record_id,
        set_cookie:exchange.set_cookie,
      };
    } else {
      const hold = await selectedOwnerHold(env, session, {
        sessionId,
        idToken,
        environment,
        expectedModelId,
        observedModelId:exchange.model_record_id,
      });
      if (!hold.ok) {
        if (exchange.status === 401 || exchange.error === "invalid_line_id_token" || exchange.error === "line_id_token_invalid") {
          return json({ ok:false, error:exchange.error || hold.error }, exchange.status || hold.status || 401);
        }
        return json({ ok:false, error:hold.error }, hold.status || 503);
      }

      return json({
        ok:false,
        state:"owner_confirmation_required",
        error:"selected_model_owner_confirmation_required",
        session_id:sessionId,
        claim_id:hold.claim_id,
        message:"ส่งให้พี่เปอร์แล้ว เดี๋ยวเปิดงานให้ครับ",
        retryable:true,
      }, 202);
    }
  } else {
    if (!canonicalResolved) {
      return json({
        ok:false,
        state:"owner_confirmation_required",
        error:"selected_model_owner_confirmation_required",
        session_id:sessionId,
        reopen_in_line:true,
      }, 409);
    }
    identity = await resolveModelFromExistingSession(request, coreFetch);
    if (!identity.ok) return json({ ok:false, error:identity.error }, identity.status);
    if (identity.model_record_id !== expectedModelId) {
      return json({
        ok:false,
        state:"owner_confirmation_required",
        error:"selected_model_owner_confirmation_required",
        session_id:sessionId,
        reopen_in_line:true,
      }, 409);
    }
  }

  const confirmation = await reissueModelConfirmation(env, sessionId);
  if (!confirmation.ok) return json({ ok:false, error:confirmation.error }, confirmation.status);

  return json({
    ok:true,
    session_id:sessionId,
    redirect_url:confirmation.redirect_url,
    expires_at:confirmation.expires_at,
  }, 200, identity.set_cookie ? { "set-cookie": identity.set_cookie } : null);
}

export function selectedModelHoldFromSession(record = {}) {
  return parseSelectedHold(record?.fields?.[SESSION_NOTES_FIELD]);
}
