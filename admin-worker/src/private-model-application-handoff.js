import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { issueModelActivation } from "./model-first-time-activation.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const APPLICATIONS_TABLE_ID = "tblwUa8ySWln8OfaJ";
const MODELS_TABLE_ID = "tblI4B0bI446vp9GX";
const APPLICATION_ID_RE = /^pma_[A-Za-z0-9_-]{8,120}$/;
const RECORD_ID_RE = /^rec[A-Za-z0-9]{14,24}$/;
const DECISION_RE = /^\/v1\/admin\/model-applications\/(pma_[A-Za-z0-9_-]{8,120})\/decision$/;
const MODEL_ACTIVATE_PATH = "/v1/model/liff/activate";
const PRIVATE_MODEL_TYPE = "private_model";
const SAFE_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);

export const PRIVATE_MODEL_HANDOFF_FIELDS = Object.freeze({
  applicationId: "fldE5jq01JlYtvSP7",
  applicationType: "fld3KMefCywUTNIoQ",
  status: "fldj2yV7EPyRn2Nu9",
  reviewStatus: "fldInXMklAz53CiCq",
  intakeStatus: "fldHk2h9Rf6g5UlZw",
  handler: "fldEimjniWxflPnLz",
  notes: "fld0C1aLDZO43i7fw",
  handoffStatus: "fldGin601ANWXG5Ro",
  canonicalModel: "fldBPLNmVfbfjsNeN",
});

const DECISIONS = Object.freeze({
  approve: { status: "Approved", reviewStatus: "accepted", intakeStatus: "approved" },
  screening: { status: "In Review", reviewStatus: "screening", intakeStatus: "private_review_pending" },
  reject: { status: "Rejected", reviewStatus: "rejected", intakeStatus: "rejected" },
});

export function isPrivateModelDecisionRequest(request) {
  if (!request || String(request.method || "").toUpperCase() !== "POST") return false;
  try {
    return DECISION_RE.test(normalizePath(new URL(request.url).pathname));
  } catch {
    return false;
  }
}

export function selectCanonicalModelId(existingLinks, requested) {
  const existing = Array.isArray(existingLinks) ? existingLinks.filter((value) => RECORD_ID_RE.test(clean(value, 40))) : [];
  const requestedId = RECORD_ID_RE.test(clean(requested, 40)) ? clean(requested, 40) : "";
  if (existing.length > 1) return { ok: false, error: "canonical_model_ambiguous" };
  if (requestedId && existing.length === 1 && existing[0] !== requestedId) {
    return { ok: false, error: "canonical_model_conflict" };
  }
  const modelRecordId = requestedId || existing[0] || "";
  if (!modelRecordId) return { ok: false, error: "canonical_model_required" };
  return { ok: true, model_record_id: modelRecordId };
}

export async function maybeHandlePrivateModelDecision(request, env = {}, priorResponse) {
  if (!isPrivateModelDecisionRequest(request)) return priorResponse;
  if (!(priorResponse instanceof Response) || priorResponse.status !== 409) return priorResponse;

  const prior = await priorResponse.clone().json().catch(() => null);
  if (prior?.error !== "not_public_model_application") return priorResponse;

  const origin = request.headers.get("Origin") || "";
  const requestOrigin = new URL(request.url).origin;
  if (!SAFE_ORIGINS.has(requestOrigin) || origin !== requestOrigin) {
    return json({ ok: false, error: "forbidden_origin" }, 403);
  }

  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  if (String(actor.role || "").toLowerCase() === "mms_partner") {
    return json({ ok: false, error: "mms_partner_scope_forbidden" }, 403);
  }

  const path = normalizePath(new URL(request.url).pathname);
  const match = path.match(DECISION_RE);
  if (!match || !APPLICATION_ID_RE.test(match[1])) return priorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const decision = clean(body?.decision, 40).toLowerCase();
  const policy = DECISIONS[decision];
  if (!policy) return json({ ok: false, error: "invalid_decision" }, 400);

  const application = await findApplicationById(env, match[1]);
  if (!application) return json({ ok: false, error: "application_not_found" }, 404);
  const fields = application.fields || {};
  if (clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.applicationType], 80) !== PRIVATE_MODEL_TYPE) {
    return priorResponse;
  }

  const actorId = clean(actor.id || "per", 80) || "per";
  const note = clean(body?.note, 1500);
  const patch = {
    [PRIVATE_MODEL_HANDOFF_FIELDS.status]: policy.status,
    [PRIVATE_MODEL_HANDOFF_FIELDS.reviewStatus]: policy.reviewStatus,
    [PRIVATE_MODEL_HANDOFF_FIELDS.intakeStatus]: policy.intakeStatus,
    [PRIVATE_MODEL_HANDOFF_FIELDS.handler]: actorId,
  };

  if (decision !== "approve") {
    patch[PRIVATE_MODEL_HANDOFF_FIELDS.handoffStatus] = "not_started";
    patch[PRIVATE_MODEL_HANDOFF_FIELDS.notes] = appendNote(
      fields[PRIVATE_MODEL_HANDOFF_FIELDS.notes],
      `Private Model review: ${decision} by ${actorId}${note ? ` — ${note}` : ""}`,
    );
    await patchApplication(env, application.id, patch);
    return json({
      ok: true,
      decision,
      application_id: match[1],
      handoff_status: "not_started",
      publishes_model: false,
      next_step: null,
    });
  }

  const selected = selectCanonicalModelId(
    fields[PRIVATE_MODEL_HANDOFF_FIELDS.canonicalModel],
    body?.canonical_model_record_id || body?.model_record_id || body?.canonical_model,
  );
  if (!selected.ok) {
    return json({
      ok: false,
      error: selected.error,
      application_id: match[1],
      next_step: "select_canonical_model",
    }, 409);
  }

  const model = await airtableGetRecord(env, modelsTable(env), selected.model_record_id);
  if (!model) return json({ ok: false, error: "canonical_model_not_found" }, 404);

  patch[PRIVATE_MODEL_HANDOFF_FIELDS.canonicalModel] = [selected.model_record_id];
  patch[PRIVATE_MODEL_HANDOFF_FIELDS.handoffStatus] = "ready";
  patch[PRIVATE_MODEL_HANDOFF_FIELDS.notes] = appendNote(
    fields[PRIVATE_MODEL_HANDOFF_FIELDS.notes],
    `Private Model review: approve by ${actorId}; canonical MMD MODEL linked and activation prepared${note ? ` — ${note}` : ""}`,
  );
  await patchApplication(env, application.id, patch);

  const activationRequest = new Request(new URL("/v1/admin/model/activation/issue", request.url).toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: requestOrigin,
      "x-mmd-admin-actor": actorId,
      "x-mmd-private-model-application": match[1],
    },
    body: JSON.stringify({
      model_record_id: selected.model_record_id,
      environment: "published",
      ttl_hours: body?.activation_ttl_hours || 24,
    }),
  });
  const activationResponse = await issueModelActivation(activationRequest, env);
  const activation = await activationResponse.clone().json().catch(() => ({}));
  if (!activationResponse.ok) {
    await appendApplicationNote(env, application.id, `MMD MODEL activation issue failed: ${clean(activation?.error, 120) || activationResponse.status}`);
    return json({
      ok: false,
      error: "activation_issue_failed",
      reason: clean(activation?.error, 120) || "activation_unavailable",
      application_id: match[1],
      handoff_status: "ready",
      next_step: "retry_activation_issue",
    }, activationResponse.status >= 400 && activationResponse.status < 600 ? activationResponse.status : 502);
  }

  return json({
    ok: true,
    decision: "approve",
    application_id: match[1],
    handoff_status: "ready",
    environment: "published",
    activation_url: activation.activation_url,
    expires_at: activation.expires_at,
    model: activation.model || null,
    next_step: "send_activation_link",
  });
}

export async function syncPrivateModelHandoffAfterActivation(request, response, env = {}) {
  if (!(response instanceof Response) || !response.ok) return response;
  if (String(request?.method || "").toUpperCase() !== "POST") return response;
  let path;
  try {
    path = normalizePath(new URL(request.url).pathname);
  } catch {
    return response;
  }
  if (path !== MODEL_ACTIVATE_PATH) return response;

  const payload = await response.clone().json().catch(() => null);
  const modelRecordId = clean(payload?.model?.id, 40);
  if (!RECORD_ID_RE.test(modelRecordId)) return response;

  try {
    const applications = await listAcceptedPrivateApplications(env, 50);
    const matches = applications.filter((record) => {
      const links = record?.fields?.[PRIVATE_MODEL_HANDOFF_FIELDS.canonicalModel];
      return Array.isArray(links) && links.length === 1 && links[0] === modelRecordId;
    });
    if (matches.length !== 1) {
      if (matches.length > 1) {
        console.error(JSON.stringify({ event: "private_model_handoff_ambiguous_after_activation", model_record_id: modelRecordId, matches: matches.length }));
      }
      return response;
    }

    const record = matches[0];
    await patchApplication(env, record.id, {
      [PRIVATE_MODEL_HANDOFF_FIELDS.handoffStatus]: "linked",
      [PRIVATE_MODEL_HANDOFF_FIELDS.notes]: appendNote(
        record.fields?.[PRIVATE_MODEL_HANDOFF_FIELDS.notes],
        "MMD MODEL LINE activation completed in published environment; model session established.",
      ),
    });

    const headers = new Headers(response.headers);
    headers.set("x-mmd-private-model-handoff", "linked");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "private_model_handoff_sync_failed", model_record_id: modelRecordId, error: clean(error?.message || error, 500) }));
    return response;
  }
}

async function findApplicationById(env, applicationId) {
  const url = airtableUrl(env, APPLICATIONS_TABLE_ID);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", `{application_id}='${escapeFormula(applicationId)}'`);
  const data = await airtableRequest(env, url.toString(), { method: "GET" });
  return Array.isArray(data.records) ? data.records[0] || null : null;
}

async function listAcceptedPrivateApplications(env, limit) {
  const url = airtableUrl(env, APPLICATIONS_TABLE_ID);
  url.searchParams.set("maxRecords", String(limit));
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", "AND({application_type}='private_model',{review_status}='accepted')");
  const data = await airtableRequest(env, url.toString(), { method: "GET" });
  return Array.isArray(data.records) ? data.records : [];
}

async function patchApplication(env, recordId, fields) {
  const url = airtableUrl(env, `${APPLICATIONS_TABLE_ID}/${encodeURIComponent(recordId)}`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  return airtableRequest(env, url.toString(), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  });
}

async function appendApplicationNote(env, recordId, note) {
  const current = await airtableGetRecord(env, APPLICATIONS_TABLE_ID, recordId);
  if (!current) return;
  await patchApplication(env, recordId, {
    [PRIVATE_MODEL_HANDOFF_FIELDS.notes]: appendNote(current.fields?.[PRIVATE_MODEL_HANDOFF_FIELDS.notes], note),
  });
}

async function airtableGetRecord(env, tableId, recordId) {
  if (!RECORD_ID_RE.test(recordId)) return null;
  const url = airtableUrl(env, `${tableId}/${encodeURIComponent(recordId)}`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  const response = await airtableRequest(env, url.toString(), { method: "GET" }, { allow404: true });
  return response || null;
}

function modelsTable(env) {
  return clean(env.AT_MODELS_TABLE_ID || env.AIRTABLE_MODELS_TABLE_ID || MODELS_TABLE_ID, 120) || MODELS_TABLE_ID;
}

function airtableUrl(env, path) {
  return new URL(`${AIRTABLE_API}/${clean(env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID, 120)}/${path}`);
}

async function airtableRequest(env, url, init = {}, options = {}) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_API_TOKEN || env.AIRTABLE_PAT, 5000);
  if (!token) throw new Error("private_model_handoff_airtable_not_configured");
  const headers = new Headers(init.headers || {});
  headers.set("authorization", `Bearer ${token}`);
  const fetcher = typeof env.AIRTABLE_FETCH === "function" ? env.AIRTABLE_FETCH : fetch;
  const response = await fetcher(url, { ...init, headers });
  if (options.allow404 && response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`private_model_handoff_airtable_${response.status}:${clean(data?.error?.message || data?.error || "request_failed", 300)}`);
  }
  return data;
}

function appendNote(previous, note) {
  const line = `[${new Date().toISOString()}] ${clean(note, 1800)}`;
  return [clean(previous, 8000), line].filter(Boolean).join("\n").slice(-9000);
}

function escapeFormula(value) {
  return clean(value, 200).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function clean(value, max = 1000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizePath(value = "") {
  const path = clean(value || "/", 500).replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-private-model-handoff": "v1",
    },
  });
}
