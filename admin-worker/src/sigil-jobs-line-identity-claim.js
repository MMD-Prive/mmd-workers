import modelLiffWorker, { resolveLineChannelId } from "./model-liff-worker-pre-manual-review.js";
import { reconcileHeldSigilJob } from "./sigil-jobs-held-release.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENTS_TABLE_DEFAULT = "tblVv58TCbwh5j1fS";
const SESSIONS_TABLE_DEFAULT = "tblC98mKWbzmPuNzX";
const CUSTOMER_LIFF_ID = "2010862595-yT4DCEMc";
const CUSTOMER_LINE_CHANNEL_ID = "2010862595";
const MODEL_LIFF_ID = "2010864854-N34SgCqq";
const CLAIM_KIND = "mmd_job_identity_claim_v1";
const CLAIM_MODE = "identity_claim";
const DEFAULT_TTL_SECONDS = 72 * 60 * 60;
const LINE_VERIFY_URL = "https://api.line.me/oauth2/v2.1/verify";
const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/i;
const IDENTITY_CAPTURE_MARKER = "[MMD_LINE_IDENTITY_CAPTURE_V1]";
const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  notes: "fldwl9Gs5tYlXG5ls",
});

function clean(value, max = 4096) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}

function token(value) {
  return clean(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-sigil-identity-claim": "v1",
    },
  });
}

function ttlSeconds(env = {}) {
  const value = Number(env.SIGIL_JOB_CLAIM_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(value)) return DEFAULT_TTL_SECONDS;
  return Math.min(7 * 24 * 60 * 60, Math.max(15 * 60, Math.floor(value)));
}

function claimSecret(env = {}) {
  return clean(env.SIGIL_JOB_CLAIM_SECRET || env.ADMIN_SESSION_SECRET, 8192);
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64url(value) {
  const normalized = clean(value, 20000).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(env = {}) {
  const secret = claimSecret(env);
  if (!secret) return null;
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`mmd:sigil-job-line-claim:v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signClaim(env, payload) {
  const key = await hmacKey(env);
  if (!key) return "";
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const body = base64url(encoded);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return `${body}.${base64url(signature)}`;
}

async function verifyClaim(env, value) {
  const raw = clean(value, 20000);
  const [body, signature, extra] = raw.split(".");
  if (!body || !signature || extra) return { ok: false, error: "identity_claim_token_invalid" };
  const key = await hmacKey(env);
  if (!key) return { ok: false, error: "identity_claim_signing_not_ready", status: 503 };
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64url(signature),
      new TextEncoder().encode(body),
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: "identity_claim_token_invalid" };
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(decodeBase64url(body)));
  } catch {
    return { ok: false, error: "identity_claim_token_invalid" };
  }
  if (payload?.kind !== CLAIM_KIND) return { ok: false, error: "identity_claim_token_invalid" };
  if (!clean(payload?.session_id, 240)) return { ok: false, error: "identity_claim_token_invalid" };
  if (!new Set(["customer", "model"]).has(payload?.role)) return { ok: false, error: "identity_claim_token_invalid" };
  if (!Number.isFinite(Number(payload?.exp)) || Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "identity_claim_token_expired", status: 410 };
  }
  return { ok: true, payload };
}

function customerClaimUrl(tokenValue) {
  const url = new URL(`https://miniapp.line.me/${CUSTOMER_LIFF_ID}/`);
  url.searchParams.set("intent", "status");
  url.searchParams.set("view", "jobs");
  url.searchParams.set("job_claim", tokenValue);
  return url.toString();
}

function modelClaimUrl(tokenValue) {
  const url = new URL(`https://miniapp.line.me/${MODEL_LIFF_ID}`);
  url.searchParams.set("job_claim", tokenValue);
  return url.toString();
}

export function isJobIdentityClaimRequest(body = {}) {
  return token(body.operational_create_mode || body.mode) === CLAIM_MODE;
}

export async function issueHeldIdentityClaimLinks(env, {
  sessionId,
  pendingClient,
  pendingModel,
  collectCustomer = false,
  collectModel = false,
} = {}) {
  const canonicalSessionId = clean(sessionId, 240);
  if (!canonicalSessionId) return { ok: false, error: "session_id_required" };
  const issueCustomer = Boolean(pendingClient || collectCustomer);
  const issueModel = Boolean(pendingModel || collectModel);
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds(env);
  const base = { kind: CLAIM_KIND, session_id: canonicalSessionId, exp };
  const customerToken = issueCustomer
    ? await signClaim(env, { ...base, role: "customer", jti: crypto.randomUUID() })
    : "";
  const modelToken = issueModel
    ? await signClaim(env, { ...base, role: "model", jti: crypto.randomUUID() })
    : "";
  if ((issueCustomer && !customerToken) || (issueModel && !modelToken)) {
    return { ok: false, error: "identity_claim_signing_not_ready" };
  }
  return {
    ok: true,
    expires_at: new Date(exp * 1000).toISOString(),
    customer_identity_url: customerToken ? customerClaimUrl(customerToken) : null,
    model_identity_url: modelToken ? modelClaimUrl(modelToken) : null,
  };
}

async function verifyLineIdToken(idToken, channelId) {
  const form = new URLSearchParams({ id_token: idToken, client_id: channelId });
  let response;
  try {
    response = await fetch(LINE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(7000),
    });
  } catch {
    return { ok: false, status: 503, error: "line_verify_unavailable" };
  }
  const data = await response.json().catch(() => ({}));
  const lineUserId = clean(data?.sub, 80);
  if (!response.ok || clean(data?.aud, 120) !== channelId || !LINE_USER_ID_RE.test(lineUserId)) {
    return { ok: false, status: 401, error: "invalid_line_id_token" };
  }
  return { ok: true, lineUserId, profile: data };
}

function escapeFormula(value) {
  return clean(value, 500).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function airtableList(env, table, formula, maxRecords = 3) {
  const apiKey = clean(env.AIRTABLE_API_KEY, 8192);
  const baseId = clean(env.AIRTABLE_BASE_ID, 160);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503, records: [] };
  const params = new URLSearchParams({ maxRecords: String(maxRecords), filterByFormula: formula });
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = JSON.stringify(data || {});
    return {
      ok: false,
      status: response.status,
      schemaError: response.status === 422 || /unknown field|invalid.*field/i.test(raw),
      records: [],
    };
  }
  return { ok: true, status: 200, records: Array.isArray(data?.records) ? data.records : [] };
}

async function captureVerifiedLineIdentity(env, { sessionId, role, lineUserId, state }) {
  const apiKey = clean(env.AIRTABLE_API_KEY, 8192);
  const baseId = clean(env.AIRTABLE_BASE_ID, 160);
  const table = clean(env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || SESSIONS_TABLE_DEFAULT, 160);
  if (!apiKey || !baseId || !table || !LINE_USER_ID_RE.test(clean(lineUserId, 80))) {
    return { ok: false, error: "identity_capture_storage_not_ready" };
  }
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{session_id}="${escapeFormula(sessionId)}"`,
    returnFieldsByFieldId: "true",
  });
  params.append("fields[]", SESSION_FIELDS.notes);
  let lookup;
  try {
    lookup = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, error: "identity_capture_lookup_unavailable" };
  }
  const data = await lookup.json().catch(() => ({}));
  if (!lookup.ok) return { ok: false, error: `identity_capture_lookup_http_${lookup.status}` };
  const record = data?.records?.[0];
  if (!record?.id) return { ok: false, error: "identity_capture_session_not_found" };

  const current = clean(record?.fields?.[SESSION_FIELDS.notes], 12000);
  const roleToken = token(role);
  if (current.includes(IDENTITY_CAPTURE_MARKER) && current.includes(`"role":"${roleToken}"`) && current.includes(clean(lineUserId, 80))) {
    return { ok: true, record_id: record.id, idempotent: true };
  }
  const marker = `${IDENTITY_CAPTURE_MARKER} ${JSON.stringify({
    role: roleToken,
    line_user_id: clean(lineUserId, 80),
    state: clean(state, 120) || "verified",
    captured_at: new Date().toISOString(),
  })}`;
  const nextNotes = [marker, current].filter(Boolean).join("\n").slice(0, 4000);
  let write;
  try {
    write = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(record.id)}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ fields: { [SESSION_FIELDS.notes]: nextNotes }, typecast: false }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, error: "identity_capture_write_unavailable" };
  }
  if (!write.ok) return { ok: false, error: `identity_capture_write_http_${write.status}` };
  return { ok: true, record_id: record.id, idempotent: false };
}

async function findClientByLineUserId(env, lineUserId) {
  const table = clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || CLIENTS_TABLE_DEFAULT, 160);
  const fields = [...new Set([
    clean(env.AT_CLIENTS__LINE_USER_ID, 160),
    "line_user_id",
    "LINE User ID",
  ].filter(Boolean))];
  const records = new Map();
  for (const field of fields) {
    const result = await airtableList(env, table, `{${field}}="${escapeFormula(lineUserId)}"`, 3);
    if (result.schemaError) continue;
    if (!result.ok) return { ok: false, status: 503, error: "client_lookup_unavailable", records: [] };
    for (const record of result.records) records.set(record.id, record);
  }
  return { ok: true, status: 200, records: [...records.values()] };
}

async function resolveCustomer(request, env, idToken) {
  const channelId = clean(env.LINE_DASHBOARD_CHANNEL_ID || CUSTOMER_LINE_CHANNEL_ID, 120);
  const verified = await verifyLineIdToken(idToken, channelId);
  if (!verified.ok) return verified;
  const found = await findClientByLineUserId(env, verified.lineUserId);
  if (!found.ok) return { ...found, lineUserId: verified.lineUserId };
  if (found.records.length > 1) {
    return { ok: false, status: 409, error: "client_line_binding_conflict", review: true, lineUserId: verified.lineUserId };
  }
  if (found.records.length !== 1) {
    return { ok: false, status: 202, error: "identity_review_required", review: true, lineUserId: verified.lineUserId };
  }
  return { ok: true, recordId: found.records[0].id, lineUserId: verified.lineUserId };
}

async function resolveModel(request, env, idToken) {
  const environment = "published";
  const channelId = clean(resolveLineChannelId(env, environment), 120);
  const verified = await verifyLineIdToken(idToken, channelId);
  if (!verified.ok) return verified;

  const url = new URL(request.url);
  url.pathname = "/v1/model/liff/exchange";
  url.search = "";
  const response = await modelLiffWorker.fetch(new Request(url.toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: url.origin,
    },
    body: JSON.stringify({ id_token: idToken, environment }),
  }), env);
  const data = await response.clone().json().catch(() => ({}));
  if (response.status === 202 || data?.state === "identity_review_required") {
    return { ok: false, status: 202, error: "identity_review_required", review: true, lineUserId: verified.lineUserId };
  }
  if (!response.ok || data?.ok === false) {
    return { ok: false, status: response.status || 503, error: clean(data?.error || "model_identity_unavailable", 160), lineUserId: verified.lineUserId };
  }
  const recordId = clean(data?.model?.id, 160);
  if (!/^rec[A-Za-z0-9]{14,}$/.test(recordId)) {
    return { ok: false, status: 202, error: "identity_review_required", review: true, lineUserId: verified.lineUserId };
  }
  return { ok: true, recordId, lineUserId: verified.lineUserId };
}

function safeClaimResponse(data, role) {
  const released = data?.released_from_hold === true || data?.operational_status === "linked";
  const nextUrl = role === "customer" ? clean(data?.customer_confirmation_url, 3000) : clean(data?.model_confirmation_url, 3000);
  return {
    ok: true,
    identity_linked: true,
    role,
    released,
    operational_status: clean(data?.operational_status, 120) || (released ? "linked" : "pending_identity_link"),
    next_url: released && nextUrl ? nextUrl : null,
    message: released
      ? "ยืนยัน LINE สำเร็จ งานพร้อมขั้นตอนยืนยันต่อแล้ว"
      : "ยืนยัน LINE สำเร็จแล้ว งานจะเปิดลิงก์ยืนยันเมื่ออีกฝ่ายยืนยันครบ",
  };
}

export async function handleJobIdentityClaim(request, env, ctx, downstream, body = {}) {
  const verifiedClaim = await verifyClaim(env, body.claim_token || body.job_claim || body.t);
  if (!verifiedClaim.ok) return json({ ok: false, error: verifiedClaim.error }, verifiedClaim.status || 401);
  const idToken = clean(body.id_token || body.idToken, 16000);
  if (!idToken) return json({ ok: false, error: "line_id_token_required" }, 400);

  const { role, session_id: sessionId } = verifiedClaim.payload;
  const identity = role === "customer"
    ? await resolveCustomer(request, env, idToken)
    : await resolveModel(request, env, idToken);

  const capture = identity.lineUserId
    ? await captureVerifiedLineIdentity(env, {
      sessionId,
      role,
      lineUserId: identity.lineUserId,
      state: identity.ok ? "canonical_match" : identity.review ? "review_required" : "verified",
    }).catch(() => ({ ok: false, error: "identity_capture_unavailable" }))
    : { ok: false, error: "line_identity_unavailable" };

  if (!identity.ok) {
    if (identity.review) {
      if (!capture.ok) {
        return json({ ok: false, error: capture.error || "identity_capture_unavailable", role }, 503);
      }
      return json({
        ok: false,
        state: "identity_review_required",
        error: identity.error,
        role,
        identity_captured: true,
        message: role === "customer"
          ? "ยืนยัน LINE สำเร็จแล้ว ระบบเก็บ LINE ไว้กับงานนี้ให้ MMD ตรวจเชื่อมครับ"
          : "ยืนยัน LINE สำเร็จแล้ว ระบบเก็บ LINE ไว้กับงานนี้ให้ MMD ตรวจเชื่อมครับ",
      }, identity.status || 202);
    }
    return json({ ok: false, error: identity.error || "identity_resolution_unavailable" }, identity.status || 503);
  }

  const reconcileBody = {
    operational_create_mode: "reconcile_held",
    source: "sigil_jobs_line_identity_claim_v1",
    page: "/sigil/jobs",
    session_id: sessionId,
    ...(role === "customer"
      ? { client_record_id: identity.recordId, client_lineage: { client_id: identity.recordId, lineage_source: "verified_line_identity_claim" } }
      : { model_record_id: identity.recordId, model: { model_id: identity.recordId, source: "verified_line_identity_claim" } }),
  };
  const url = new URL(request.url);
  url.pathname = "/v1/admin/job/create";
  url.search = "";
  const reconcileRequest = new Request(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json", origin: url.origin },
    body: JSON.stringify(reconcileBody),
  });
  const response = await reconcileHeldSigilJob(reconcileRequest, env, ctx, downstream);
  const data = await response.clone().json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    return json({ ok: false, error: clean(data?.error || `held_reconcile_http_${response.status}`, 180) }, response.status || 503);
  }
  return json({ ...safeClaimResponse(data, role), identity_captured: capture.ok === true });
}