const STATUS_PATH = "/v1/model/direct-job-gate/status";
const ACK_PATH = "/v1/model/direct-job-gate/ack";
const COOKIE_NAME = "mmd_model_session_v1";
const ACK_TABLE_DEFAULT = "MMD — Model Job Day Rules Acks";
const RULES_VERSION = "job-day-v2";
const RULES_URL = "https://mmdbkk.com/rules/model/private/job-day";
const SOURCE = "direct_first_job";
const AIRTABLE_API = "https://api.airtable.com/v0";

const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  jobId: "fldHw5HdDDdkHXMhG",
  modelWorkLane: "fldzYGziqLqTQaoaK",
  canonicalModel: "fldrXQAyOMPCvbOaY",
  partnerIdSnapshot: "fld0jkscGAtyX7i2J",
  partnerReferralSnapshot: "fldorSqZ8baZEs4NL",
  partnerSnapshotJson: "fldxyZ7S3tjF8chGR",
});

export const MODEL_DIRECT_JOB_GATE_STATUS_PATH = STATUS_PATH;
export const MODEL_DIRECT_JOB_GATE_ACK_PATH = ACK_PATH;
export const MODEL_DIRECT_JOB_GATE_RULES_VERSION = RULES_VERSION;
export const MODEL_DIRECT_JOB_GATE_RULES_URL = RULES_URL;

export function isModelDirectFirstJobGateRequest(path = "", method = "") {
  const normalized = normalizePath(path);
  const verb = String(method || "").toUpperCase();
  if (![STATUS_PATH, ACK_PATH].includes(normalized)) return false;
  return verb === "POST" || verb === "OPTIONS";
}

export async function handleModelDirectFirstJobGate(request, env = {}) {
  const path = normalizePath(new URL(request.url).pathname);
  const method = String(request.method || "GET").toUpperCase();
  if (!isModelDirectFirstJobGateRequest(path, method)) return null;

  if (method === "OPTIONS") {
    if (!isAllowedOrigin(request, env)) return json({ ok:false, error:"origin_not_allowed" }, 403, request, env);
    return withCors(request, env, new Response(null, { status:204 }));
  }
  if (method !== "POST") return json({ ok:false, error:"method_not_allowed" }, 405, request, env);
  if (!isAllowedOrigin(request, env)) return json({ ok:false, error:"origin_not_allowed" }, 403, request, env);

  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok:false, error:auth.error }, auth.status, request, env);

  const body = await request.json().catch(() => null);
  const token = clean(body?.t || body?.token, 12000);
  if (!token) return json({ ok:false, error:"confirmation_token_required" }, 400, request, env);

  const confirmation = await readModelConfirmation(request, env, token);
  if (!confirmation.ok) return json({ ok:false, error:confirmation.error }, confirmation.status, request, env);

  const session = await findSession(env, confirmation.session_id);
  if (!session.ok) return json({ ok:false, error:session.error }, session.status, request, env);

  const fields = session.record.fields || {};
  const canonicalModels = fields[SESSION_FIELDS.canonicalModel];
  if (!Array.isArray(canonicalModels) || canonicalModels.length !== 1) {
    return json({ ok:false, error:"job_model_identity_unresolved" }, 409, request, env);
  }
  if (canonicalModels[0] !== auth.payload.model_record_id) {
    return json({ ok:false, error:"job_model_identity_mismatch" }, 403, request, env);
  }

  const lane = clean(fields[SESSION_FIELDS.modelWorkLane], 80).toLowerCase();
  if (!lane) return json({ ok:false, error:"job_lane_unresolved" }, 409, request, env);

  const partnerManaged = hasText(fields[SESSION_FIELDS.partnerIdSnapshot])
    || hasText(fields[SESSION_FIELDS.partnerReferralSnapshot])
    || hasPartnerSnapshot(fields[SESSION_FIELDS.partnerSnapshotJson]);

  if (lane !== "private_model" || partnerManaged) {
    return gateResponse(request, env, {
      applies:false,
      required:false,
      jobId:clean(fields[SESSION_FIELDS.jobId], 160) || null,
      acknowledgedAt:null,
      reason:lane !== "private_model" ? "not_private_model" : "partner_managed_private_job",
    });
  }

  const jobId = clean(fields[SESSION_FIELDS.jobId], 160);
  if (!jobId) return json({ ok:false, error:"job_id_unresolved" }, 409, request, env);

  const modelId = clean(auth.payload.model_record_id, 80);
  const key = idempotencyKey(modelId);
  const existing = await findAck(env, key);
  if (!existing.ok) return json({ ok:false, error:existing.error }, existing.status, request, env);

  if (path === STATUS_PATH) {
    return gateResponse(request, env, {
      applies:true,
      required:!existing.record,
      jobId,
      acknowledgedAt:existing.record?.fields?.acknowledged_at || null,
      reason:existing.record ? "already_acknowledged_current_version" : "first_direct_private_job_ack_required",
    });
  }

  if (body?.completed !== true) {
    return json({ ok:false, error:"job_day_rules_completion_required" }, 400, request, env);
  }
  if (body?.rules_version !== undefined && clean(body.rules_version, 120) !== RULES_VERSION) {
    return json({ ok:false, error:"job_day_rules_version_mismatch", expected_rules_version:RULES_VERSION }, 409, request, env);
  }

  if (existing.record) {
    return gateResponse(request, env, {
      applies:true,
      required:false,
      jobId,
      acknowledgedAt:existing.record.fields?.acknowledged_at || null,
      reason:"already_acknowledged_current_version",
    });
  }

  const acknowledgedAt = new Date().toISOString();
  const ackId = await stableAckId(modelId);
  const created = await createAck(env, {
    ack_id: ackId,
    model_record_id: modelId,
    Model: [modelId],
    job_id: jobId,
    session_id: confirmation.session_id,
    source: SOURCE,
    rules_url: RULES_URL,
    rules_version: RULES_VERSION,
    acknowledged_at: acknowledgedAt,
    idempotency_key: key,
  });
  if (!created.ok) return json({ ok:false, error:created.error }, created.status, request, env);

  return gateResponse(request, env, {
    applies:true,
    required:false,
    jobId,
    acknowledgedAt:created.record?.fields?.acknowledged_at || acknowledgedAt,
    reason:"acknowledged",
  });
}

function gateResponse(request, env, { applies, required, jobId, acknowledgedAt, reason }) {
  return json({
    ok:true,
    schema:"model_job_day_rules_ack_v1",
    authority:"MMD — Model Job Day Rules Acks",
    applies:Boolean(applies),
    required:Boolean(required),
    source:SOURCE,
    rules_url:RULES_URL,
    rules_version:RULES_VERSION,
    job_id:jobId || null,
    acknowledged_at:acknowledgedAt || null,
    reason:reason || null,
    job_state_changed:false,
  }, 200, request, env);
}

async function readModelConfirmation(request, env, token) {
  if (!env.PAYMENTS_WORKER?.fetch) return { ok:false, status:503, error:"payments_binding_unavailable" };
  const origin = canonicalOrigin(request);
  const response = await env.PAYMENTS_WORKER.fetch(new Request("https://sigil.mmdbkk.com/v1/confirm/details", {
    method:"POST",
    headers:{ "content-type":"application/json", accept:"application/json", origin },
    body:JSON.stringify({ t:token, expected_role:"model" }),
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    return {
      ok:false,
      status:[400,401,403,404,409,410].includes(response.status) ? response.status : 503,
      error:clean(data?.error || "confirmation_validation_failed", 180),
    };
  }
  const sessionId = clean(data.session_id, 200);
  if (!sessionId) return { ok:false, status:409, error:"confirmation_session_unresolved" };
  return { ok:true, status:200, session_id:sessionId };
}

async function findSession(env, sessionId) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const table = clean(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 100);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !table || !apiKey) return { ok:false, status:503, error:"airtable_not_ready" };

  const query = new URLSearchParams({
    maxRecords:"2",
    filterByFormula:`{session_id}='${formulaValue(sessionId)}'`,
    returnFieldsByFieldId:"true",
  });
  const response = await airtableFetch(env, new Request(
    `${AIRTABLE_API}/${baseId}/${encodeURIComponent(table)}?${query.toString()}`,
    { headers:{ authorization:`Bearer ${apiKey}` } },
  ));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok:false, status:503, error:"session_lookup_unavailable" };
  const rows = Array.isArray(data.records) ? data.records : [];
  if (rows.length !== 1) return { ok:false, status:rows.length ? 409 : 404, error:rows.length ? "session_id_ambiguous" : "session_not_found" };
  return { ok:true, status:200, record:rows[0] };
}

async function findAck(env, key) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const table = clean(env.AIRTABLE_TABLE_MODEL_JOB_DAY_RULES_ACKS || ACK_TABLE_DEFAULT, 180);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !table || !apiKey) return { ok:false, status:503, error:"ack_store_not_ready" };
  const query = new URLSearchParams({
    maxRecords:"2",
    filterByFormula:`{idempotency_key}='${formulaValue(key)}'`,
  });
  const response = await airtableFetch(env, new Request(
    `${AIRTABLE_API}/${baseId}/${encodeURIComponent(table)}?${query.toString()}`,
    { headers:{ authorization:`Bearer ${apiKey}` } },
  ));
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok:false, status:503, error:"ack_lookup_unavailable" };
  const rows = Array.isArray(data.records) ? data.records : [];
  if (rows.length > 1) return { ok:false, status:409, error:"ack_state_ambiguous" };
  return { ok:true, status:200, record:rows[0] || null };
}

async function createAck(env, fields) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const table = clean(env.AIRTABLE_TABLE_MODEL_JOB_DAY_RULES_ACKS || ACK_TABLE_DEFAULT, 180);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !table || !apiKey) return { ok:false, status:503, error:"ack_store_not_ready" };
  const response = await airtableFetch(env, new Request(
    `${AIRTABLE_API}/${baseId}/${encodeURIComponent(table)}`,
    {
      method:"POST",
      headers:{ authorization:`Bearer ${apiKey}`, "content-type":"application/json" },
      body:JSON.stringify({ records:[{ fields }], typecast:true }),
    },
  ));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.records?.[0]) return { ok:false, status:503, error:"ack_write_failed" };
  return { ok:true, status:200, record:data.records[0] };
}

async function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}

async function requireModelSession(request, env) {
  const token = readCookie(request.headers.get("cookie"), COOKIE_NAME);
  if (!token) return { ok:false, status:401, error:"model_session_required" };
  const value = clean(token, 12000);
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return { ok:false, status:401, error:"model_session_invalid" };
  const encoded = value.slice(0, dot);
  const supplied = value.slice(dot + 1);
  const secret = clean(env.MODEL_SESSION_SIGNING_SECRET || env.CONFIRM_KEY || env.INTERNAL_TOKEN, 5000);
  if (!secret) return { ok:false, status:503, error:"signing_not_ready" };
  const expected = await hmacHex(encoded, secret);
  if (!constantTimeEqual(expected, supplied)) return { ok:false, status:401, error:"model_session_invalid" };
  let payload;
  try { payload = JSON.parse(base64UrlDecode(encoded)); } catch { return { ok:false, status:401, error:"model_session_invalid" }; }
  if (payload?.kind !== "model_session" || payload?.role !== "model" || !/^rec[A-Za-z0-9]{14}$/.test(clean(payload?.model_record_id, 80))) {
    return { ok:false, status:403, error:"model_session_invalid" };
  }
  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now()/1000)) return { ok:false, status:401, error:"model_session_expired" };
  return { ok:true, status:200, payload };
}

function idempotencyKey(modelId) {
  return `${clean(modelId,80)}|${RULES_VERSION}`;
}

async function stableAckId(modelId) {
  const bytes = new TextEncoder().encode(idempotencyKey(modelId));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2,"0")).join("");
  return `mjdack_${hex.slice(0,24)}`;
}

function hasPartnerSnapshot(value) {
  const raw = clean(value, 8000);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.partner_relationship || parsed?.partner_attribution || parsed?.partner_id || parsed?.partner_referral_id);
  } catch {
    return /partner_relationship|partner_attribution|modeling_partner|included_in_rate|partner_managed/i.test(raw);
  }
}

function hasText(value) {
  if (Array.isArray(value)) return value.some(hasText);
  return Boolean(clean(value, 500));
}

function isAllowedOrigin(request, env) {
  const origin = clean(request.headers.get("origin"), 500);
  if (!origin) return true;
  const allowed = new Set([
    "https://mmdbkk.com",
    "https://www.mmdbkk.com",
    ...String(env.ALLOWED_ORIGINS || "").split(",").map(v => clean(v,500)).filter(Boolean),
  ]);
  return allowed.has(origin);
}

function canonicalOrigin(request) {
  const origin = clean(request.headers.get("origin"), 500);
  return new Set(["https://mmdbkk.com","https://www.mmdbkk.com"]).has(origin) ? origin : "https://mmdbkk.com";
}

function corsHeaders(request, env) {
  const origin = clean(request.headers.get("origin"), 500);
  const headers = new Headers({
    "access-control-allow-methods":"POST, OPTIONS",
    "access-control-allow-headers":"Content-Type",
    "access-control-allow-credentials":"true",
    "cache-control":"no-store, private",
    vary:"Origin",
  });
  if (origin && isAllowedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function withCors(request, env, response) {
  const headers = new Headers(response.headers);
  corsHeaders(request, env).forEach((value,key) => headers.set(key,value));
  return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
}

function json(payload, status, request, env) {
  const response = new Response(JSON.stringify(payload), {
    status,
    headers:{ "content-type":"application/json; charset=utf-8", "x-mmd-direct-job-gate":RULES_VERSION },
  });
  return withCors(request, env, response);
}

function readCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const key = part.slice(0,i).trim();
    if (key !== name) continue;
    const raw = part.slice(i+1).trim();
    try { return decodeURIComponent(raw); } catch { return raw; }
  }
  return "";
}

async function hmacHex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2,"0")).join("");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g,"+").replace(/_/g,"/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

function constantTimeEqual(a,b) {
  const left = clean(a,1000), right = clean(b,1000);
  if (left.length !== right.length) return false;
  let diff=0;
  for (let i=0;i<left.length;i+=1) diff |= left.charCodeAt(i)^right.charCodeAt(i);
  return diff===0;
}

function normalizePath(pathname) {
  const path = String(pathname || "/").replace(/\/{2,}/g,"/");
  return path.length>1 ? path.replace(/\/+$/g,"") : path;
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g,"\\\\").replace(/'/g,"\\'");
}

function clean(value, max=5000) {
  return String(value ?? "").trim().slice(0,max);
}
