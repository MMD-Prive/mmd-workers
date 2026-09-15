import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { issueHeldIdentityClaimLinks } from "./sigil-jobs-line-identity-claim.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE = "tblC98mKWbzmPuNzX";
const ISSUE_MODE = "issue_identity_links";
const HOLD_MARKER = "[MMD_JOB_HOLD_V1]";
const IDENTITY_MARKER = "[MMD_PENDING_IDENTITY_V1]";
const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  note: "fldEcDkF7CH9VixWM",
  notes: "fldwl9Gs5tYlXG5ls",
  customerConfirmationUrl: "fldi9ZdoiUXzSv1rI",
  modelConfirmationUrl: "fld0mFma9J9yfEaKb",
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
      "x-mmd-sigil-identity-links": "refresh-v1",
    },
  });
}

function formulaText(value) {
  return `"${clean(value, 300).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function firstLinked(value) {
  return Array.isArray(value) && value.length ? clean(value[0], 160) : "";
}

function noteText(record) {
  return [record?.fields?.[SESSION_FIELDS.note], record?.fields?.[SESSION_FIELDS.notes]]
    .map((value) => clean(value, 10000))
    .filter(Boolean)
    .join("\n");
}

async function readSession(env, sessionId) {
  const apiKey = clean(env.AIRTABLE_API_KEY, 8192);
  const baseId = clean(env.AIRTABLE_BASE_ID, 160);
  const table = clean(env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE, 160);
  if (!apiKey || !baseId || !table) return { ok: false, status: 503, error: "held_session_storage_not_ready" };

  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{session_id}=${formulaText(sessionId)}`,
    returnFieldsByFieldId: "true",
  });
  for (const fieldId of Object.values(SESSION_FIELDS)) params.append("fields[]", fieldId);
  const headers = { authorization: `Bearer ${apiKey}` };
  let response;
  try {
    response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}?${params.toString()}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, status: 503, error: "held_session_lookup_unavailable" };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: 502, error: `held_session_lookup_http_${response.status}` };
  const record = data?.records?.[0];
  if (!record?.id) return { ok: false, status: 404, error: "held_session_not_found" };

  let detailResponse;
  try {
    detailResponse = await fetch(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}/${encodeURIComponent(record.id)}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, status: 503, error: "held_session_detail_unavailable" };
  }
  const detail = await detailResponse.json().catch(() => ({}));
  if (!detailResponse.ok) return { ok: false, status: 502, error: `held_session_detail_http_${detailResponse.status}` };
  return { ok: true, record, detail };
}

export function isHeldIdentityLinkRefreshRequest(request, body = {}) {
  let path = "";
  try {
    path = new URL(request.url).pathname.replace(/\/+$/g, "") || "/";
  } catch {
    return false;
  }
  return request.method.toUpperCase() === "POST"
    && path === "/v1/admin/job/create"
    && token(body.operational_create_mode || body.mode) === ISSUE_MODE;
}

export async function maybeHandleHeldIdentityLinkRefresh(request, env) {
  const body = await request.clone().json().catch(() => ({}));
  if (!isHeldIdentityLinkRefreshRequest(request, body)) return null;

  const url = new URL(request.url);
  if (!["mmdbkk.com", "www.mmdbkk.com"].includes(url.hostname)) {
    return json({ ok: false, error: "sigil_jobs_host_not_allowed" }, 403);
  }
  const origin = clean(request.headers.get("origin"), 500);
  if (origin && origin !== url.origin) return json({ ok: false, error: "sigil_jobs_origin_not_allowed" }, 403);

  const actor = await readCredentialBoundAdminActor(request, env);
  const role = token(actor?.role);
  if (!actor || !new Set(["owner", "admin", "super_admin", "superadmin"]).has(role)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const sessionId = clean(body.session_id, 240);
  if (!sessionId) return json({ ok: false, error: "session_id_required" }, 400);
  const session = await readSession(env, sessionId);
  if (!session.ok) return json({ ok: false, error: session.error }, session.status);

  const fields = session.record?.fields || {};
  const finalCustomer = clean(fields[SESSION_FIELDS.customerConfirmationUrl], 3000);
  const finalModel = clean(fields[SESSION_FIELDS.modelConfirmationUrl], 3000);
  if (finalCustomer && finalModel) {
    return json({
      ok: true,
      session_id: sessionId,
      operational_status: "linked",
      pending_client: false,
      pending_model: false,
      customer_confirmation_url: finalCustomer,
      model_confirmation_url: finalModel,
      customer_identity_url: null,
      model_identity_url: null,
    });
  }

  const notes = noteText(session.record);
  if (!notes.includes(HOLD_MARKER) && !notes.includes(IDENTITY_MARKER)) {
    return json({ ok: false, error: "session_is_not_identity_held" }, 409);
  }

  const detailFields = session.detail?.fields || {};
  const clientId = firstLinked(detailFields.Client);
  const modelId = firstLinked(detailFields["Canonical Model"]);
  const pendingClient = !clientId;
  const pendingModel = !modelId;
  if (!pendingClient && !pendingModel) {
    return json({
      ok: true,
      session_id: sessionId,
      operational_status: "linked_pending_release",
      pending_client: false,
      pending_model: false,
      customer_identity_url: null,
      model_identity_url: null,
      message: "canonical_identities_linked_release_pending",
    });
  }

  const claims = await issueHeldIdentityClaimLinks(env, { sessionId, pendingClient, pendingModel });
  if (!claims.ok) return json({ ok: false, error: claims.error || "identity_claim_signing_not_ready" }, 503);
  return json({
    ok: true,
    session_id: sessionId,
    operational_status: pendingClient && pendingModel ? "pending_identity_link" : pendingClient ? "pending_client_link" : "pending_model_link",
    pending_client: pendingClient,
    pending_model: pendingModel,
    identity_claim_state: "ready",
    identity_claim_expires_at: claims.expires_at,
    customer_identity_url: claims.customer_identity_url,
    model_identity_url: claims.model_identity_url,
    customer_confirmation_url: finalCustomer || null,
    model_confirmation_url: finalModel || null,
  });
}
