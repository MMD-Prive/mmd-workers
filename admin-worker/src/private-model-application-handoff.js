import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { issueModelActivation } from "./model-first-time-activation.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const APPLICATIONS_TABLE_ID = "tblwUa8ySWln8OfaJ";
const ASSETS_TABLE_ID = "tblEhg3dsFzPERpNQ";
const MODELS_TABLE_ID = "tblI4B0bI446vp9GX";
const PAGE_PATH = "/internal/admin/model-applications";
const API_PREFIX = "/v1/admin/model-applications";
const APPLICATION_ID_RE = /^pma_[A-Za-z0-9_-]{8,120}$/;
const ASSET_ID_RE = /^pmua_[A-Za-z0-9_-]{8,120}$/;
const RECORD_ID_RE = /^rec[A-Za-z0-9]{14,24}$/;
const DETAIL_RE = /^\/v1\/admin\/model-applications\/(pma_[A-Za-z0-9_-]{8,120})$/;
const DECISION_RE = /^\/v1\/admin\/model-applications\/(pma_[A-Za-z0-9_-]{8,120})\/decision$/;
const MODEL_ACTIVATE_PATH = "/v1/model/liff/activate";
const PRIVATE_MODEL_TYPE = "private_model";
const SAFE_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const REVIEWABLE_ASSET_UPLOAD_STATES = new Set(["attached", "uploaded"]);

export const PRIVATE_MODEL_HANDOFF_FIELDS = Object.freeze({
  applicationId: "fldE5jq01JlYtvSP7",
  applicationType: "fld3KMefCywUTNIoQ",
  nickname: "fldUIqNSM6Z9dK8Tj",
  age: "fldSRAY0jIsd7Plq9",
  height: "fldGbBKCkWXwdAtFV",
  weight: "fldMcoQsTEGRl1eYa",
  occupation: "fldn14ahMblpFMdjQ",
  phone: "fldKt4hogB4x1R51b",
  lineId: "fldYi4U0m5j9IZbPT",
  instagram: "fldM9Gdb3dNpyzsdR",
  location: "fldz32ZjP0ptkHfRZ",
  intro: "fldLnSyhwpMVq6wPl",
  experience: "fldfBKS7TEZNV9yOT",
  skills: "fldfoZLHO0ni5UO9o",
  strengths: "fldozBHoFYeWqt555",
  payloadJson: "fldJ9ldETtMF2Qbqf",
  status: "fldj2yV7EPyRn2Nu9",
  reviewStatus: "fldInXMklAz53CiCq",
  intakeStatus: "fldHk2h9Rf6g5UlZw",
  handler: "fldEimjniWxflPnLz",
  notes: "fld0C1aLDZO43i7fw",
  submittedAt: "fldRs4JdlxOdtlqp9",
  handoffStatus: "fldGin601ANWXG5Ro",
  canonicalModel: "fldBPLNmVfbfjsNeN",
});

export const PRIVATE_MODEL_ASSET_FIELDS = Object.freeze({
  assetId: "fldSKeoWClypsbPNF",
  applicationId: "fldPCr17XtTGH52BZ",
  kind: "fldGmoadvfKK2NHJn",
  role: "fldHQSKvqJ7Vk7QQA",
  fileName: "fldMmJU6py2iMGCBC",
  contentType: "fldE0qlrPfZXzTjnp",
  fileSize: "fldBpa9ZuQV2QXxPS",
  objectKey: "fldGTJmeQkiSD4NEP",
  uploadStatus: "fldDhx8xsUUFB8D8N",
  reviewStatus: "fldJIwNkFsNKuhgp1",
  uploadedAt: "fldTbBcPuxCuL3PBH",
});

export const PRIVATE_MODEL_CANONICAL_MODEL_FIELDS = Object.freeze({
  workingName: "fldShiT60bmCxFxRu",
  modelRecordId: "fldVWbT0gsSe0hn7Q",
  lineUserId: "fld2ywTFI6MZhX6PV",
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

export function isPrivateModelAdminRequest(request) {
  if (!request) return false;
  try {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    return path === PAGE_PATH || path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
  } catch {
    return false;
  }
}

export function deterministicPrivateModelKey(applicationId) {
  if (!APPLICATION_ID_RE.test(clean(applicationId, 140))) return "";
  return `mdl_pri_app_${clean(applicationId, 140).replace(/^pma_/i, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "_")}`.slice(0, 110);
}

export function selectCanonicalModelId(existingLinks, requested = "") {
  const existing = Array.isArray(existingLinks) ? existingLinks.filter((value) => RECORD_ID_RE.test(clean(value, 40))) : [];
  const requestedId = RECORD_ID_RE.test(clean(requested, 40)) ? clean(requested, 40) : "";
  if (existing.length > 1) return { ok: false, error: "canonical_model_ambiguous" };
  if (requestedId && existing.length === 1 && existing[0] !== requestedId) {
    return { ok: false, error: "canonical_model_conflict" };
  }
  const modelRecordId = existing[0] || requestedId || "";
  if (!modelRecordId) return { ok: false, error: "canonical_model_required" };
  return { ok: true, model_record_id: modelRecordId };
}

export async function maybeHandlePrivateModelAdminRequest(request, env = {}, priorResponse) {
  if (!isPrivateModelAdminRequest(request)) return priorResponse;

  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = String(request.method || "GET").toUpperCase();
  const wantsPrivate = normalizeToken(url.searchParams.get("application_type") || url.searchParams.get("type") || url.searchParams.get("lane")) === PRIVATE_MODEL_TYPE;

  if (path === PAGE_PATH && (method === "GET" || method === "HEAD") && wantsPrivate) {
    const actor = await readAllowedActor(request, env);
    if (!actor) return priorResponse;
    const response = html(renderPrivateReviewPage());
    return method === "HEAD" ? new Response(null, { status: 200, headers: response.headers }) : response;
  }

  if (path === API_PREFIX && method === "GET" && wantsPrivate) {
    const actor = await readAllowedActor(request, env);
    if (!actor) return priorResponse;
    const limit = clampInt(url.searchParams.get("limit"), 1, 50, 30);
    const records = await listPrivateApplications(env, limit);
    return json({ ok: true, application_type: PRIVATE_MODEL_TYPE, applications: records.map((record) => normalizeApplication(record, [])) });
  }

  const detail = path.match(DETAIL_RE);
  if (detail && method === "GET" && (await priorSaysNotPublic(priorResponse))) {
    const actor = await readAllowedActor(request, env);
    if (!actor) return priorResponse;
    const application = await findApplicationById(env, detail[1]);
    if (!application || clean(application.fields?.[PRIVATE_MODEL_HANDOFF_FIELDS.applicationType], 80) !== PRIVATE_MODEL_TYPE) return priorResponse;
    const assets = await listAssetsForApplication(env, detail[1]);
    const canonical = await safeCanonicalModelSummary(env, application.fields?.[PRIVATE_MODEL_HANDOFF_FIELDS.canonicalModel]);
    return json({ ok: true, application: normalizeApplication(application, assets, canonical) });
  }

  if (isPrivateModelDecisionRequest(request) && (await priorSaysNotPublic(priorResponse))) {
    return handlePrivateModelDecision(request, env, priorResponse);
  }

  return priorResponse;
}

export async function maybeHandlePrivateModelDecision(request, env = {}, priorResponse) {
  return maybeHandlePrivateModelAdminRequest(request, env, priorResponse);
}

async function handlePrivateModelDecision(request, env, priorResponse) {
  const origin = request.headers.get("Origin") || "";
  const requestOrigin = new URL(request.url).origin;
  if (!SAFE_ORIGINS.has(requestOrigin) || origin !== requestOrigin) {
    return json({ ok: false, error: "forbidden_origin" }, 403);
  }

  const actor = await readAllowedActor(request, env);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);

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
  if (clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.applicationType], 80) !== PRIVATE_MODEL_TYPE) return priorResponse;

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

  // Canonical Model is a backend-owned field. Never accept a raw Airtable Model
  // record id from applicant/admin browser payload. Reuse the already-linked
  // canonical record or create exactly one deterministic provisional MMD MODEL.
  const resolved = await resolveOrCreateCanonicalModel(env, application);
  if (!resolved.ok) {
    return json({
      ok: false,
      error: resolved.error,
      application_id: match[1],
      next_step: "review_canonical_model",
    }, resolved.status || 409);
  }

  patch[PRIVATE_MODEL_HANDOFF_FIELDS.canonicalModel] = [resolved.model_record_id];
  patch[PRIVATE_MODEL_HANDOFF_FIELDS.handoffStatus] = resolved.line_user_id ? "linked" : "ready";
  patch[PRIVATE_MODEL_HANDOFF_FIELDS.notes] = appendNote(
    fields[PRIVATE_MODEL_HANDOFF_FIELDS.notes],
    `Private Model review: approve by ${actorId}; canonical MMD MODEL ${resolved.created ? "created" : "reused"}${resolved.line_user_id ? "; verified LINE identity already linked" : "; published LINE activation prepared"}${note ? ` — ${note}` : ""}`,
  );
  await patchApplication(env, application.id, patch);

  if (resolved.line_user_id) {
    return json({
      ok: true,
      decision: "approve",
      application_id: match[1],
      handoff_status: "linked",
      environment: "published",
      model: safeModelSummary(resolved.model),
      next_step: "model_ready",
    });
  }

  const activationRequest = new Request(new URL("/v1/admin/model/activation/issue", request.url).toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: requestOrigin,
      "x-mmd-admin-actor": actorId,
      "x-mmd-private-model-application": match[1],
    },
    body: JSON.stringify({
      model_record_id: resolved.model_record_id,
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
    model: activation.model || safeModelSummary(resolved.model),
    model_created: resolved.created,
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

async function resolveOrCreateCanonicalModel(env, application) {
  const fields = application?.fields || {};
  const existing = Array.isArray(fields[PRIVATE_MODEL_HANDOFF_FIELDS.canonicalModel])
    ? fields[PRIVATE_MODEL_HANDOFF_FIELDS.canonicalModel].filter((value) => RECORD_ID_RE.test(clean(value, 40)))
    : [];
  if (existing.length > 1) return { ok: false, status: 409, error: "canonical_model_ambiguous" };

  if (existing.length === 1) {
    const model = await airtableGetRecord(env, modelsTable(env), existing[0]);
    if (!model) return { ok: false, status: 409, error: "canonical_model_not_found" };
    return {
      ok: true,
      created: false,
      model,
      model_record_id: model.id,
      line_user_id: clean(model.fields?.[PRIVATE_MODEL_CANONICAL_MODEL_FIELDS.lineUserId], 100),
    };
  }

  const applicationId = clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.applicationId], 140);
  const modelKey = deterministicPrivateModelKey(applicationId);
  if (!modelKey) return { ok: false, status: 409, error: "application_id_invalid" };

  const existingByKey = await findModelsByModelKey(env, modelKey);
  if (existingByKey.length > 1) return { ok: false, status: 409, error: "canonical_model_key_collision" };
  if (existingByKey.length === 1) {
    const model = existingByKey[0];
    return {
      ok: true,
      created: false,
      model,
      model_record_id: model.id,
      line_user_id: clean(model.fields?.[PRIVATE_MODEL_CANONICAL_MODEL_FIELDS.lineUserId], 100),
    };
  }

  const workingName = clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.nickname], 120);
  if (!workingName) return { ok: false, status: 409, error: "application_nickname_required" };

  const created = await createCanonicalModel(env, {
    [PRIVATE_MODEL_CANONICAL_MODEL_FIELDS.workingName]: workingName,
    [PRIVATE_MODEL_CANONICAL_MODEL_FIELDS.modelRecordId]: modelKey,
  });
  if (!created || !RECORD_ID_RE.test(created.id)) return { ok: false, status: 502, error: "canonical_model_create_failed" };
  return {
    ok: true,
    created: true,
    model: created,
    model_record_id: created.id,
    line_user_id: "",
  };
}

async function findModelsByModelKey(env, modelKey) {
  const url = airtableUrl(env, modelsTable(env));
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("pageSize", "2");
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", `{model_record_id}='${escapeFormula(modelKey)}'`);
  const data = await airtableRequest(env, url.toString(), { method: "GET" });
  return Array.isArray(data.records) ? data.records : [];
}

async function createCanonicalModel(env, fields) {
  const url = airtableUrl(env, modelsTable(env));
  url.searchParams.set("returnFieldsByFieldId", "true");
  const data = await airtableRequest(env, url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });
  return Array.isArray(data.records) ? data.records[0] || null : null;
}

async function readAllowedActor(request, env) {
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) return null;
  if (String(actor.role || "").toLowerCase() === "mms_partner") return null;
  return actor;
}

async function priorSaysNotPublic(priorResponse) {
  if (!(priorResponse instanceof Response) || priorResponse.status !== 409) return false;
  const prior = await priorResponse.clone().json().catch(() => null);
  return prior?.error === "not_public_model_application";
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

async function listPrivateApplications(env, limit) {
  const url = airtableUrl(env, APPLICATIONS_TABLE_ID);
  url.searchParams.set("maxRecords", String(limit));
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", "{application_type}='private_model'");
  url.searchParams.set("sort[0][field]", "submitted_at");
  url.searchParams.set("sort[0][direction]", "desc");
  const data = await airtableRequest(env, url.toString(), { method: "GET" });
  return Array.isArray(data.records) ? data.records : [];
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

async function listAssetsForApplication(env, applicationId) {
  const url = airtableUrl(env, ASSETS_TABLE_ID);
  url.searchParams.set("maxRecords", "50");
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", `{application_id}='${escapeFormula(applicationId)}'`);
  url.searchParams.set("sort[0][field]", "uploaded_at");
  url.searchParams.set("sort[0][direction]", "asc");
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

async function safeCanonicalModelSummary(env, links) {
  const selection = selectCanonicalModelId(links, "");
  if (!selection.ok) return null;
  const model = await airtableGetRecord(env, modelsTable(env), selection.model_record_id);
  return model ? safeModelSummary(model) : null;
}

function normalizeApplication(record, assets = [], canonicalModel = null) {
  const fields = record?.fields || {};
  const payload = parseObject(fields[PRIVATE_MODEL_HANDOFF_FIELDS.payloadJson]);
  const applicationId = clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.applicationId]);
  return {
    application_id: applicationId,
    application_type: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.applicationType]),
    nickname: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.nickname] || payload.nickname),
    age: numberValue(fields[PRIVATE_MODEL_HANDOFF_FIELDS.age] ?? payload.age),
    height_cm: numberValue(fields[PRIVATE_MODEL_HANDOFF_FIELDS.height] ?? payload.height_cm ?? payload.height),
    weight_kg: numberValue(fields[PRIVATE_MODEL_HANDOFF_FIELDS.weight] ?? payload.weight_kg ?? payload.weight),
    occupation: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.occupation] || payload.occupation_detail || payload.occupation),
    location: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.location] || payload.location),
    phone: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.phone] || payload.phone),
    line_id: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.lineId] || payload.line_id || payload.line),
    instagram: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.instagram] || payload.instagram),
    intro: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.intro] || payload.intro || payload.story),
    experience: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.experience] || payload.experience),
    skills: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.skills] || payload.skills),
    strengths: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.strengths] || payload.strengths),
    status: selectName(fields[PRIVATE_MODEL_HANDOFF_FIELDS.status]),
    review_status: selectName(fields[PRIVATE_MODEL_HANDOFF_FIELDS.reviewStatus]),
    intake_status: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.intakeStatus]),
    handoff_status: selectName(fields[PRIVATE_MODEL_HANDOFF_FIELDS.handoffStatus]) || "not_started",
    submitted_at: clean(fields[PRIVATE_MODEL_HANDOFF_FIELDS.submittedAt]),
    canonical_model: canonicalModel,
    assets: assets.map((asset) => normalizeAsset(applicationId, asset)).filter(Boolean),
  };
}

function normalizeAsset(applicationId, asset) {
  const fields = asset?.fields || {};
  const assetId = clean(fields[PRIVATE_MODEL_ASSET_FIELDS.assetId]);
  if (!ASSET_ID_RE.test(assetId)) return null;
  const uploadStatus = selectName(fields[PRIVATE_MODEL_ASSET_FIELDS.uploadStatus]);
  return {
    asset_id: assetId,
    kind: selectName(fields[PRIVATE_MODEL_ASSET_FIELDS.kind]) || clean(fields[PRIVATE_MODEL_ASSET_FIELDS.kind]),
    role: selectName(fields[PRIVATE_MODEL_ASSET_FIELDS.role]) || clean(fields[PRIVATE_MODEL_ASSET_FIELDS.role]),
    file_name: clean(fields[PRIVATE_MODEL_ASSET_FIELDS.fileName]),
    content_type: clean(fields[PRIVATE_MODEL_ASSET_FIELDS.contentType]),
    file_size: numberValue(fields[PRIVATE_MODEL_ASSET_FIELDS.fileSize]),
    upload_status: uploadStatus,
    review_status: selectName(fields[PRIVATE_MODEL_ASSET_FIELDS.reviewStatus]),
    uploaded_at: clean(fields[PRIVATE_MODEL_ASSET_FIELDS.uploadedAt]),
    reviewable: REVIEWABLE_ASSET_UPLOAD_STATES.has(uploadStatus.toLowerCase()),
    url: `${API_PREFIX}/${encodeURIComponent(applicationId)}/assets/${encodeURIComponent(assetId)}`,
  };
}

function safeModelSummary(model) {
  if (!model) return null;
  return {
    working_name: clean(model.fields?.[PRIVATE_MODEL_CANONICAL_MODEL_FIELDS.workingName]),
    model_record_id: clean(model.fields?.[PRIVATE_MODEL_CANONICAL_MODEL_FIELDS.modelRecordId]),
    line_linked: Boolean(clean(model.fields?.[PRIVATE_MODEL_CANONICAL_MODEL_FIELDS.lineUserId], 100)),
  };
}

function renderPrivateReviewPage() {
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private Model Review | MMD</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b0d0f;color:#f5f1e8}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top,#1a1d1f 0,#0b0d0f 48%);min-height:100vh}.shell{max-width:1280px;margin:auto;padding:28px 18px 70px}.eyebrow{font-size:12px;letter-spacing:.18em;color:#b9a98b}.top{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:22px}.top h1{font-size:clamp(28px,4vw,44px);margin:6px 0}.top p{margin:0;color:#aaa49a;max-width:650px}.grid{display:grid;grid-template-columns:minmax(280px,400px) 1fr;gap:16px}.panel{border:1px solid #2d2e2c;background:#111315;border-radius:18px;overflow:hidden}.list{max-height:76vh;overflow:auto}.row{display:block;width:100%;text-align:left;padding:16px;border:0;border-bottom:1px solid #272826;background:transparent;color:inherit;cursor:pointer}.row:hover,.row.active{background:#191b1d}.row strong{display:block;font-size:16px}.meta{font-size:12px;color:#9c968c;margin-top:5px}.chip{display:inline-flex;padding:4px 8px;border:1px solid #47423b;border-radius:999px;font-size:11px;margin:7px 6px 0 0;color:#d9c8a5}.detail{padding:22px;min-height:460px}.detail h2{margin:0 0 8px;font-size:28px}.detail h3{font-size:13px;letter-spacing:.12em;color:#b9a98b;margin:26px 0 10px}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.fact{padding:12px;border:1px solid #2b2c2a;border-radius:12px}.fact b{display:block;font-size:11px;color:#918b82;margin-bottom:5px}.copy{white-space:pre-wrap;line-height:1.55;color:#d7d1c7}.assets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.asset{display:block;padding:10px;border:1px solid #2d2e2c;border-radius:12px;color:#e9dfcb;text-decoration:none;overflow:hidden}.actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:22px}.actions button,.copybtn{border:1px solid #4b4438;background:#1c1b18;color:#f7ebd4;border-radius:10px;padding:11px 14px;cursor:pointer}.actions button.primary{background:#d9c29a;color:#17130d;border-color:#d9c29a;font-weight:700}.actions button.danger{border-color:#6a3a3a}.note{width:100%;min-height:78px;background:#0b0d0f;color:#f5f1e8;border:1px solid #343532;border-radius:10px;padding:10px;margin-top:10px}.result{margin-top:16px;padding:14px;border:1px solid #3e3a31;border-radius:12px;background:#171713;word-break:break-word}.empty{color:#8f8a82;padding:24px}.small{font-size:12px;color:#a49d92}@media(max-width:820px){.grid{grid-template-columns:1fr}.list{max-height:320px}.facts,.assets{grid-template-columns:1fr}.top{display:block}}
</style></head><body><main class="shell"><div class="top"><div><div class="eyebrow">MMD OWNER REVIEW · SIGIL</div><h1>Private Model Applications</h1><p>อนุมัติแล้วระบบจะสร้างหรือ reuse canonical MMD MODEL ทาง backend เท่านั้น จากนั้นออก LINE Published activation link เพื่อยืนยันตัวตนจริง</p></div><a href="/internal/admin/model-applications" style="color:#c9b997">Public Model ↗</a></div><div class="grid"><section class="panel list" id="list"><div class="empty">กำลังโหลด…</div></section><section class="panel detail" id="detail"><div class="empty">เลือกใบสมัครเพื่อดูรายละเอียด</div></section></div></main>
<script>
(function(){
  var list=document.getElementById('list'),detail=document.getElementById('detail'),selected='';
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function fetchJson(url,opts){return fetch(url,Object.assign({credentials:'same-origin',headers:{'accept':'application/json'}},opts||{})).then(async function(r){var d=await r.json().catch(function(){return {}});if(!r.ok)throw new Error(d.error||('HTTP '+r.status));return d})}
  function chip(v){return v?'<span class="chip">'+esc(v)+'</span>':''}
  function load(){fetchJson('/v1/admin/model-applications?application_type=private_model&limit=50').then(function(d){var items=d.applications||[];if(!items.length){list.innerHTML='<div class="empty">ยังไม่มี Private Model application ใน queue</div>';return}list.innerHTML=items.map(function(a){return '<button class="row" data-id="'+esc(a.application_id)+'"><strong>'+esc(a.nickname||a.application_id)+'</strong><div class="meta">'+esc(a.submitted_at||'')+'</div>'+chip(a.review_status)+chip(a.handoff_status)+'</button>'}).join('');Array.prototype.forEach.call(list.querySelectorAll('[data-id]'),function(btn){btn.onclick=function(){select(btn.getAttribute('data-id'),btn)}})}).catch(function(e){list.innerHTML='<div class="empty">'+esc(e.message)+'</div>'})}
  function select(id,btn){selected=id;Array.prototype.forEach.call(list.querySelectorAll('.row'),function(x){x.classList.remove('active')});if(btn)btn.classList.add('active');detail.innerHTML='<div class="empty">กำลังโหลด…</div>';fetchJson('/v1/admin/model-applications/'+encodeURIComponent(id)).then(render).catch(function(e){detail.innerHTML='<div class="empty">'+esc(e.message)+'</div>'})}
  function field(label,value){return '<div class="fact"><b>'+esc(label)+'</b><span>'+esc(value||'—')+'</span></div>'}
  function render(d){var a=d.application||{};var model=a.canonical_model||null;var assets=(a.assets||[]).filter(function(x){return x.reviewable});detail.innerHTML='<div class="eyebrow">'+esc(a.application_id)+'</div><h2>'+esc(a.nickname||'Private Model')+'</h2><div>'+chip(a.status)+chip(a.review_status)+chip(a.handoff_status)+'</div><h3>APPLICATION</h3><div class="facts">'+field('Age',a.age)+field('Height / Weight',(a.height_cm||'—')+' / '+(a.weight_kg||'—'))+field('Occupation',a.occupation)+field('Location',a.location)+field('Phone',a.phone)+field('LINE',a.line_id)+field('Instagram',a.instagram)+field('MMD MODEL',model?(model.working_name+(model.line_linked?' · LINE linked':' · waiting LINE')):'จะสร้างเมื่อ Approve')+'</div><h3>PROFILE</h3><div class="copy">'+esc([a.intro,a.experience,a.skills,a.strengths].filter(Boolean).join('\n\n')||'—')+'</div><h3>FILES</h3><div class="assets">'+(assets.length?assets.map(function(x){return '<a class="asset" target="_blank" rel="noopener" href="'+esc(x.url)+'"><b>'+esc(x.role||x.kind||'file')+'</b><div class="small">'+esc(x.file_name||'open')+'</div></a>'}).join(''):'<div class="small">ไม่มีไฟล์ที่พร้อม review</div>')+'</div><h3>OWNER DECISION</h3><textarea class="note" id="note" placeholder="Internal note (optional)"></textarea><div class="actions"><button class="primary" data-decision="approve">Approve → MMD MODEL + LINE Published</button><button data-decision="screening">Keep in screening</button><button class="danger" data-decision="reject">Reject</button></div><div id="result"></div>';Array.prototype.forEach.call(detail.querySelectorAll('[data-decision]'),function(b){b.onclick=function(){decide(b.getAttribute('data-decision'),b)}})}
  function decide(decision,btn){if(!selected)return;var note=document.getElementById('note');var result=document.getElementById('result');btn.disabled=true;result.innerHTML='<div class="result">กำลังดำเนินการ…</div>';fetchJson('/v1/admin/model-applications/'+encodeURIComponent(selected)+'/decision',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({decision:decision,note:note?note.value:''})}).then(function(d){var html='<div class="result"><b>'+esc(d.decision||'done')+'</b><div class="small">handoff: '+esc(d.handoff_status||'—')+' · next: '+esc(d.next_step||'—')+'</div>';if(d.activation_url){html+='<p><a id="activation" href="'+esc(d.activation_url)+'" target="_blank" rel="noopener" style="color:#d9c29a">LINE Published activation link ↗</a></p><button class="copybtn" id="copy">Copy activation link</button><div class="small">expires '+esc(d.expires_at||'')+'</div>'}html+='</div>';result.innerHTML=html;var copy=document.getElementById('copy');if(copy){copy.onclick=function(){navigator.clipboard.writeText(d.activation_url).then(function(){copy.textContent='Copied'})}}load()}).catch(function(e){result.innerHTML='<div class="result">'+esc(e.message)+'</div>'}).finally(function(){btn.disabled=false})}
  load();
})();
</script></body></html>`;
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

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(clean(value, 60000));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function selectName(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return clean(value.name || value.value);
  return clean(value);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeToken(value) {
  return clean(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clean(value, max = 1000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizePath(value = "") {
  const path = clean(value || "/", 500).replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-admin-surface": "private-model-application-review-v2",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-private-model-handoff": "v2",
    },
  });
}
