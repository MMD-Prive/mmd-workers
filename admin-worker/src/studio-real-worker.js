import modelLiffWorker from "./model-liff-worker.js";
import { isAuthed as isCoreAuthed } from "./index.js";
import { handleCareBackRequest, isCareBackPath } from "./care-back-worker.js";
import { handleStudioCards } from "./model-card-automation.js";
import { readStudioModelContext, searchStudioModels } from "./studio-flow-model-context.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const STUDIO_API_PREFIX = "/studio/api";
const INTAKE_VALIDATE_PATH = `${STUDIO_API_PREFIX}/intake/validate`;
const INTAKE_COMMIT_PATH = `${STUDIO_API_PREFIX}/intake/commit`;
const INTAKE_READ_PATH = `${STUDIO_API_PREFIX}/intake/read`;
const REVIEW_VALIDATE_PATH = `${STUDIO_API_PREFIX}/review/validate`;
const REVIEW_COMMIT_PATH = `${STUDIO_API_PREFIX}/review/commit`;
const REVIEW_READ_PATH = `${STUDIO_API_PREFIX}/review/read`;
const PREVIEW_PLAN_PATH = `${STUDIO_API_PREFIX}/model-preview/publish-plan`;
const PREVIEW_COMMIT_PATH = `${STUDIO_API_PREFIX}/model-preview/commit`;
const UPLOAD_PATH = `${STUDIO_API_PREFIX}/upload`;
const ASSET_READ_PATH = `${STUDIO_API_PREFIX}/assets/read`;
const MY_CARD_REQUEST_LIST_PATH = `${STUDIO_API_PREFIX}/compcard-requests/list`;
const MY_CARD_REQUEST_IMPORT_PATH = `${STUDIO_API_PREFIX}/compcard-requests/import`;
const MY_CARD_REQUEST_MEDIA_PATH = `${STUDIO_API_PREFIX}/compcard-requests/media`;
const MY_CARD_SOURCE = "mmd_model_my_card";
const MY_CARD_INTAKE_TABLE_DEFAULT = "Studio_Intake";
const MODEL_MEDIA_TABLE_DEFAULT = "tblrpQXhHnbTU9RhW";
const MY_CARD_TEMPLATE_LABELS = Object.freeze({
  "sigil-ems-aureate": "Aureate Vault",
  "sigil-gws-nightwave": "Nightwave Dossier",
  "sigil-straight-bronze": "Bronze Study",
  "sigil-gay-plum": "Plum Study",
  "sigil-foreigner-emerald": "Emerald Study",
  "mmd-prive-travel": "MMD Privé Travel",
  "mmd-prive-extreme": "MMD Privé Extreme",
});
const MY_CARD_TEMPLATE_ALIASES = Object.freeze({
  "sigil-travel-prive": "mmd-prive-travel",
  "sigil-extreme-prive": "mmd-prive-extreme",
});
const MY_CARD_TEMPLATE_IDS = new Set(Object.keys(MY_CARD_TEMPLATE_LABELS));
const LEDGER_COMMIT_CONFIRMATION = "COMMIT_LEDGER_ONLY";
const STUDIO_ASSET_PREFIX = "studio-staging/assets/";
const STUDIO_UPLOAD_SOURCE = "mmd_studio_upload";
const DEFAULT_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;

const FIELD_SET = new Set(["ST", "GY", "FR", "EN", "EX", "GWs", "EMs"]);
const GRADE_FIELDS = new Set(["GWs", "EMs"]);
const LAYER_SET = new Set([
  "Private / SIGIL",
  "Public / MMD Prive",
  "Public / MMD Privé",
  "Exclusive / Black Card Review",
]);
const NORMAL_LAYER = new Map([
  ["Private / SIGIL", "Private / SIGIL"],
  ["Public / MMD Prive", "Public / MMD Privé"],
  ["Public / MMD Privé", "Public / MMD Privé"],
  ["Exclusive / Black Card Review", "Exclusive / Black Card Review"],
]);
const DECISION_SET = new Set(["Needs Review", "Approved Direction", "Revise Source", "Reject"]);
const STUDIO_RECORD_ID = /^rec[A-Za-z0-9]{14,24}$/;
const STUDIO_REVIEW_CHECKS = ["identity", "photo", "safe"];
const STUDIO_FAMILY_BY_FIELD = Object.freeze({ ST: "A", GY: "B", FR: "E", EN: "C", EX: "D", GWs: "GWs", EMs: "EMs" });

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePathname(url.pathname);
    const method = request.method.toUpperCase();

    if (path.startsWith(STUDIO_API_PREFIX)) {
      const cors = corsHeaders(request, env);
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      return withCors(await handleStudioRequest(request, env, path, method), cors);
    }

    return modelLiffWorker.fetch(request, env, ctx);
  },
};

export async function handleStudioRequest(request, env, path = normalizePathname(new URL(request.url).pathname), method = request.method.toUpperCase()) {
  if (!isAllowedOrigin(request, env)) return json({ ok: false, error: "origin_not_allowed" }, 403);
  if (!(await isStudioAuthed(request, env))) return json({ ok: false, error: "unauthorized" }, 401);

  // Care Back shares Studio auth but supports safe GET/PATCH/PUT contracts.
  if (isCareBackPath(path)) return handleCareBackRequest(request, env, path, method);

  if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    if (path === UPLOAD_PATH) return await handleStudioUpload(request, env);

    const body = await safeJson(request);
    if (containsBrowserLineUserId(body)) return json({ ok: false, error: "line_user_id_not_allowed" }, 400);
    const forbidden = findForbiddenStudioInput(body);
    if (forbidden) return json({ ok: false, error: "raw_storage_field_not_allowed", field: forbidden }, 400);

    if (path.startsWith("/studio/api/model-cards/")) return await handleStudioCards(env, path, body);

    if (path === MY_CARD_REQUEST_LIST_PATH) return await handleMyCardRequestList(env);
    if (path === MY_CARD_REQUEST_IMPORT_PATH) return await handleMyCardRequestImport(env, body);
    if (path === MY_CARD_REQUEST_MEDIA_PATH) return await handleMyCardRequestMedia(env, body);
    if (path === ASSET_READ_PATH) return await readStudioAsset(env, body);
    if (path === INTAKE_READ_PATH) {
      const record = await readStudioFlowRequest(env, "intake", body);
      return json({ ok: true, intake: safeStudioIntake(record.normalized, record.record.id) });
    }
    if (path === REVIEW_READ_PATH) {
      const record = await readStudioFlowRequest(env, "review", body);
      const review = safeStudioReview(record.normalized, record.record.id);
      return json({ ok: true, review, ...await studioPreviewReadiness(env, review) });
    }
    if (path === `${STUDIO_API_PREFIX}/model-context`) return json(await readStudioModelContext(env, body.model_record_id));
    if (path === `${STUDIO_API_PREFIX}/models/search`) return json(await searchStudioModels(env, body.q));

    if (path === INTAKE_VALIDATE_PATH) {
      const normalized = normalizeStudioIntake(body);
      if (normalized.flow_version === 2) await verifyStudioIntakeV2(env, normalized);
      return json({ ok: true, safe_preview_only: true, normalized, warnings: buildIntakeWarnings(normalized) });
    }

    if (path === INTAKE_COMMIT_PATH) {
      if (body.flow_version === 2) return json({ ok: true, status: "committed", ...await commitStudioFlowV2(env, "intake", body) });
      const normalized = normalizeStudioIntake(body);
      const result = await commitStudioIntake(env, normalized, body);
      return json({ ok: true, status: "committed", ...result });
    }

    if (path === REVIEW_VALIDATE_PATH) {
      const normalized = body.flow_version === 2 ? await normalizeStudioReviewV2(env, body) : normalizeStudioReview(body);
      return json({ ok: true, safe_preview_only: true, normalized, warnings: [] });
    }

    if (path === REVIEW_COMMIT_PATH) {
      if (body.flow_version === 2) return json({ ok: true, status: "committed", published: false, ...await commitStudioFlowV2(env, "review", body) });
      const normalized = normalizeStudioReview(body);
      const result = await commitStudioReview(env, normalized, body);
      return json({ ok: true, status: "committed", published: false, ...result });
    }

    if (path === PREVIEW_PLAN_PATH) {
      const normalized = normalizeStudioPreview(body);
      return json(buildPublishPlan(normalized));
    }

    if (path === PREVIEW_COMMIT_PATH) {
      if (!isSecondConfirmed(body)) return json({ ok: false, error: "ledger_confirmation_required" }, 403);
      const normalized = normalizeStudioPreview(body);
      const plan = buildPublishPlan(normalized);
      if (!plan.can_commit) return json({ ok: false, error: "publish_blocked", blockers: plan.blockers, plan: plan.plan }, 400);
      const r2 = await verifyStudioAssets(env, normalized.asset_ids);
      if (!r2.ok) return json({ ok: false, error: "r2_verification_failed", missing_asset_ids: r2.missing_asset_ids }, 409);
      const result = await commitStudioPublish(env, normalized, body, plan.plan);
      return json({ ok: true, status: "committed", ...result });
    }
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 400;
    return json({ ok: false, error: String(error?.message || error || "studio_request_failed") }, status);
  }

  return json({ ok: false, error: "not_found" }, 404);
}

async function handleMyCardRequestList(env) {
  const result = await airtableList(env, resolveMyCardIntakeTable(env), {
    filterByFormula: `{source}="${MY_CARD_SOURCE}"`,
    maxRecords: 50,
  });
  if (!result.ok) throw serverError("my_card_request_lookup_unavailable");
  const requests = result.records
    .map((record) => safeStudioMyCardRequest(record))
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.submitted_at) - Date.parse(left.submitted_at));
  return json({ ok: true, requests });
}

async function handleMyCardRequestImport(env, body) {
  const requestId = clean(body.compcard_request_id || body.request_id || body.my_card_request_id);
  assertRecordId(requestId, "invalid_compcard_request_id");
  const lookup = await lookupMyCardRequest(env, requestId);
  if (!lookup.ok) return json({ ok: false, error: lookup.error || "my_card_request_not_found" }, lookup.status || 404);
  const status = clean(lookup.record.fields?.status) || "model_request_pending";
  if (["studio_approved", "studio_preview_ready", "studio_rejected"].includes(status)) {
    return json({ ok: false, error: "my_card_request_closed" }, 409);
  }

  const payload = lookup.payload;
  payload.studio = {
    ...(payload.studio && typeof payload.studio === "object" ? payload.studio : {}),
    imported_at: new Date().toISOString(),
  };
  const updated = await airtableUpdate(env, resolveMyCardIntakeTable(env), requestId, {
    status: "studio_in_progress",
    payload_json: JSON.stringify(payload),
  });
  if (!updated.ok) throw serverError("my_card_request_import_failed");

  const request = safeStudioMyCardRequest(updated.record);
  return json({
    ok: true,
    request,
    draft: {
      compcard_request_id: request.request_id,
      model_name: request.model_name,
      source_owner: `model:${payload.model_record_id}`,
      category_path: "MMD MODEL / My Card",
      model_template_id: request.template_id,
      model_template_label: request.template_label,
      direction: request.template_id
        ? `Source and template selected by the model (${request.template_label || request.template_id}). Studio owns field, RUN NUMBER, and final design.`
        : "Source selected and submitted by the model. Studio owns field, RUN NUMBER, template, and final design.",
      source_media_id: request.media_id,
      source_media_type: request.media_type,
      height_cm: request.height_cm,
      weight_kg: request.weight_kg,
    },
  });
}

async function handleMyCardRequestMedia(env, body) {
  const requestId = clean(body.compcard_request_id || body.request_id || body.my_card_request_id);
  assertRecordId(requestId, "invalid_compcard_request_id");
  const lookup = await lookupMyCardRequest(env, requestId);
  if (!lookup.ok) return json({ ok: false, error: lookup.error || "my_card_request_not_found" }, lookup.status || 404);

  const media = await lookupStudioMyCardMedia(env, lookup.payload);
  if (!media.ok) return json({ ok: false, error: media.error || "my_card_media_unavailable" }, media.status || 409);
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.get !== "function") {
    return json({ ok: false, error: "my_card_media_storage_unavailable" }, 503);
  }

  const object = await env.MMD_MODEL_ASSETS.get(media.object_key).catch(() => null);
  if (!object?.body) return json({ ok: false, error: "my_card_media_not_found" }, 404);
  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": media.file_type || "application/octet-stream",
      "cache-control": "private, no-store",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    },
  });
}

function resolveMyCardIntakeTable(env) {
  return clean(env.AIRTABLE_TABLE_STUDIO_INTAKE || env.AIRTABLE_TABLE_STUDIO_INTAKE_ID || MY_CARD_INTAKE_TABLE_DEFAULT);
}

async function lookupMyCardRequest(env, requestId) {
  const result = await airtableGet(env, resolveMyCardIntakeTable(env), requestId);
  if (!result.ok) return { ok: false, status: result.status || 503, error: result.status === 404 ? "my_card_request_not_found" : "my_card_request_lookup_unavailable" };
  if (clean(result.record?.fields?.source) !== MY_CARD_SOURCE) {
    return { ok: false, status: 404, error: "my_card_request_not_found" };
  }
  const payload = parseMyCardPayload(result.record.fields?.payload_json);
  if (!clean(payload.model_record_id) || !clean(payload.selected_media?.media_id) || !clean(payload.selected_media?.object_key)) {
    return { ok: false, status: 409, error: "my_card_request_payload_invalid" };
  }
  return { ok: true, record: result.record, payload };
}

function safeStudioMyCardRequest(record) {
  if (clean(record?.fields?.source) !== MY_CARD_SOURCE) return null;
  const fields = record?.fields || {};
  const payload = parseMyCardPayload(fields.payload_json);
  const model = payload.model || {};
  const media = payload.selected_media || {};
  const modelTemplate = payload.model_template || {};
  const templateId = normalizeMyCardTemplateId(modelTemplate.id || fields.template_hint);
  const requestId = clean(record?.id);
  if (!requestId || !clean(payload.model_record_id) || !clean(media.media_id)) return null;
  return {
    request_id: requestId,
    model_record_id: STUDIO_RECORD_ID.test(clean(payload.model_record_id)) ? clean(payload.model_record_id) : "",
    status: clean(fields.status) || "model_request_pending",
    submitted_at: clean(fields.created_at) || clean(payload.requested_at),
    model_name: clean(model.working_name) || clean(fields.model_name),
    height_cm: finiteNumberOrNull(model.height_cm),
    weight_kg: finiteNumberOrNull(model.weight_kg),
    media_id: clean(media.media_id),
    media_type: clean(media.media_type),
    template_id: templateId,
    template_label: clean(modelTemplate.label) || myCardTemplateLabel(templateId),
  };
}

function myCardTemplateLabel(templateId) {
  return MY_CARD_TEMPLATE_LABELS[normalizeMyCardTemplateId(templateId)] || "";
}

function normalizeMyCardTemplateId(templateId) {
  const normalized = clean(templateId);
  return MY_CARD_TEMPLATE_ALIASES[normalized] || normalized;
}

function parseMyCardPayload(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function lookupStudioMyCardMedia(env, payload) {
  const modelRecordId = clean(payload.model_record_id);
  const selected = payload.selected_media && typeof payload.selected_media === "object" ? payload.selected_media : {};
  const mediaId = clean(selected.media_id);
  const mediaType = clean(selected.media_type).toLowerCase();
  const objectKey = clean(selected.object_key);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(modelRecordId) || !/^media_[A-Za-z0-9-]{8,160}$/.test(mediaId)) {
    return { ok: false, status: 409, error: "my_card_media_invalid" };
  }
  if (!["profile_photo", "public_gallery"].includes(mediaType)) {
    return { ok: false, status: 409, error: "my_card_media_not_public" };
  }

  const result = await airtableList(env, resolveModelMediaTable(env), {
    filterByFormula: `{media_id}="${escapeFormula(mediaId)}"`,
    maxRecords: 2,
  });
  if (!result.ok) return { ok: false, status: 503, error: "my_card_media_lookup_unavailable" };
  if (result.records.length !== 1) return { ok: false, status: result.records.length ? 409 : 404, error: "my_card_media_not_found" };

  const fields = result.records[0].fields || {};
  const linkedModels = Array.isArray(fields.Model) ? fields.Model.map((value) => clean(typeof value === "string" ? value : value?.id)).filter(Boolean) : [];
  const currentStatus = clean(fields.review_status || "active").toLowerCase();
  const currentType = clean(fields.media_type).toLowerCase();
  const currentObjectKey = clean(fields.private_original_key);
  const allowedPrefix = `models/${modelRecordId}/${mediaType}/${mediaId}.`;
  if (
    linkedModels.length !== 1 ||
    linkedModels[0] !== modelRecordId ||
    fields.public_safe !== true ||
    !["active", "approved", "published"].includes(currentStatus) ||
    currentType !== mediaType ||
    currentObjectKey !== objectKey ||
    !objectKey.startsWith(allowedPrefix)
  ) {
    return { ok: false, status: 409, error: "my_card_media_not_public" };
  }
  const mime = clean(fields.file_type).toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    return { ok: false, status: 409, error: "my_card_media_type_invalid" };
  }
  return { ok: true, object_key: objectKey, file_type: mime };
}

async function syncMyCardReviewDecision(env, requestId, review, expectedModelRecordId = "") {
  const lookup = await lookupMyCardRequest(env, requestId);
  if (!lookup.ok) return { ok: false, error: lookup.error || "my_card_request_not_found" };
  if (expectedModelRecordId && clean(lookup.payload.model_record_id) !== expectedModelRecordId) return { ok: false, error: "my_card_model_mismatch" };
  const payload = lookup.payload;
  const statusByDecision = {
    "Approved Direction": "studio_approved",
    "Revise Source": "studio_revision_requested",
    Reject: "studio_rejected",
    "Needs Review": "studio_in_progress",
  };
  const nextStatus = statusByDecision[review.decision] || "studio_in_progress";
  payload.studio = {
    ...(payload.studio && typeof payload.studio === "object" ? payload.studio : {}),
    review: {
      studio_review_id: clean(review.studio_review_id),
      decision: clean(review.decision),
      field: clean(review.field),
      run_number: clean(review.run_number),
      layer: clean(review.layer),
      reviewed_at: clean(review.reviewed_at) || new Date().toISOString(),
    },
  };
  const updated = await airtableUpdate(env, resolveMyCardIntakeTable(env), requestId, {
    status: nextStatus,
    payload_json: JSON.stringify(payload),
  });
  if (!updated.ok) return { ok: false, error: "my_card_request_status_sync_failed" };
  return { ok: true, status: nextStatus, request: safeStudioMyCardRequest(updated.record) };
}

function resolveModelMediaTable(env) {
  return clean(env.AIRTABLE_TABLE_MODEL_MEDIA || MODEL_MEDIA_TABLE_DEFAULT);
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeStudioIntake(body = {}) {
  assertStudioFlowVersion(body);
  const compcardRequestId = clean(body.compcard_request_id || body.my_card_request_id);
  const field = normalizeField(body.field || body.field_code);
  const layer = normalizeLayer(body.layer);
  const runNumber = clean(body.run_number || body.runNumber);
  const modelName = clean(body.model_name || body.modelName || body.name);
  const templateHint = clean(body.template_hint || body.template || body.template_title || body.template_id);
  const modelTemplateId = normalizeMyCardTemplateId(
    body.model_template_id || body.model_template || body.model_template_preference,
  );
  const sourceOwner = clean(body.source_owner || body.sourceOwner);
  const categoryPath = clean(body.category_path || body.categoryPath);

  if (compcardRequestId) assertRecordId(compcardRequestId, "invalid_compcard_request_id");
  if (!modelName) throw badRequest("model_name_required");
  if (!field) throw badRequest("invalid_field");
  if (!layer) throw badRequest("invalid_layer");
  if (!templateHint) throw badRequest("template_hint_required");
  if (modelTemplateId && !MY_CARD_TEMPLATE_IDS.has(modelTemplateId)) throw badRequest("invalid_model_template_id");
  assertSafePathText(sourceOwner, "invalid_source_owner", false);
  assertSafePathText(categoryPath, "invalid_category_path", false);
  if (body.flow_version === 2) {
    if (GRADE_FIELDS.has(field) && runNumber && !(new RegExp(`^${field}\\d{1,6}$`)).test(runNumber)) throw badRequest("invalid_run_number");
  } else requireGradeRunNumber(field, runNumber);

  const normalized = {
    studio_intake_id: clean(body.studio_intake_id || body.intake_id),
    compcard_request_id: compcardRequestId,
    idempotency_key: clean(body.idempotency_key || body.idempotencyKey),
    model_name: modelName,
    internal_code: clean(body.internal_code || body.internalCode || body.code),
    source_owner: sourceOwner,
    category_path: categoryPath,
    field,
    run_number: runNumber,
    layer,
    template_hint: templateHint,
    model_template_id: modelTemplateId,
    direction: clean(body.direction || body.per_direction || body.note),
    checklist: normalizeChecklist(body.checklist),
    files: normalizeFileList(body.files),
    created_at: clean(body.created_at) || new Date().toISOString(),
  };
  return body.flow_version === 2 ? normalizeStudioIntakeV2(body, normalized) : normalized;
}

export function normalizeStudioReview(body = {}) {
  assertStudioFlowVersion(body);
  const seed = body.seed && typeof body.seed === "object" ? body.seed : {};
  const compcardRequestId = clean(body.compcard_request_id || body.my_card_request_id || seed.compcard_request_id || seed.my_card_request_id);
  const field = normalizeField(body.field || seed.field);
  const layer = normalizeLayer(body.layer || seed.layer);
  const runNumber = clean(body.run_number || body.runNumber || seed.run_number);
  const modelName = clean(body.model_name || body.modelName || seed.model_name || body.model);
  const decision = clean(body.decision || body.status || "Needs Review");

  if (body.studio_intake_id) assertRecordId(body.studio_intake_id, "invalid_studio_intake_id");
  if (compcardRequestId) assertRecordId(compcardRequestId, "invalid_compcard_request_id");
  if (!modelName) throw badRequest("model_name_required");
  if (!field) throw badRequest("invalid_field");
  if (!layer) throw badRequest("invalid_layer");
  if (!DECISION_SET.has(decision)) throw badRequest("invalid_decision");
  if (decision === "Approved Direction") requireGradeRunNumber(field, runNumber);

  return {
    studio_review_id: clean(body.studio_review_id || body.review_id),
    studio_intake_id: clean(body.studio_intake_id || seed.studio_intake_id),
    compcard_request_id: compcardRequestId,
    model_name: modelName,
    field,
    run_number: runNumber,
    layer,
    decision,
    checklist_score: clampInt(body.checklist_score ?? body.score, 0, 20, 0),
    ewvon_note: clean(body.ewvon_note || body.ewvon || body.review_note),
    final_note: clean(body.final_note || body.output || body.note || body.prompt || seed.prompt),
    created_at: clean(body.created_at) || new Date().toISOString(),
  };
}

function assertStudioFlowVersion(body) {
  if (body.flow_version !== undefined && body.flow_version !== 1 && body.flow_version !== 2) throw badRequest("invalid_flow_version");
}

function studioText(value, max, error, { required = false, multiline = false } = {}) {
  if (value !== undefined && value !== null && typeof value !== "string") throw badRequest(error);
  const text = clean(value);
  if ((required && !text) || text.length > max || (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(text)) throw badRequest(error);
  return text;
}

function studioChoice(value, choices, error) {
  const text = studioText(value, 120, error);
  if (text && !choices.includes(text)) throw badRequest(error);
  return text;
}

function studioChoices(value, choices, error, required = false) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.length > choices.length || value.some((item) => typeof item !== "string" || !choices.includes(item))) throw badRequest(error);
  const unique = [...new Set(value)];
  if ((required && !unique.length) || unique.length !== value.length) throw badRequest(error);
  return unique;
}

function studioMetric(value, min, max, error) {
  if (value === undefined || value === null || value === "") return null;
  if (!["number", "string"].includes(typeof value)) throw badRequest(error);
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw badRequest(error);
  return number;
}

function studioReviewChecklist(value) {
  if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value))) throw badRequest("invalid_checklist");
  const source = value || {};
  if (Object.keys(source).some((key) => !STUDIO_REVIEW_CHECKS.includes(key))) throw badRequest("invalid_checklist");
  const checklist = {};
  for (const key of STUDIO_REVIEW_CHECKS) {
    if (source[key] !== undefined && typeof source[key] !== "boolean") throw badRequest("invalid_checklist");
    checklist[key] = source[key] === true;
  }
  return checklist;
}

function assertNoStudioAuthorityInput(body) {
  for (const key of ["intake_snapshot", "approved_review_snapshot", "model_context", "canonical_context", "model_asset_policy", "ready", "published"]) {
    if (Object.hasOwn(body, key)) throw badRequest("server_owned_field_not_allowed");
  }
}

function normalizeStudioIntakeV2(body, normalized) {
  assertNoStudioAuthorityInput(body);
  if (!Array.isArray(body.files) || !body.files.length || body.files.length > 10) throw badRequest("one_to_ten_photos_required");
  const files = body.files.map((file) => {
    if (!file || typeof file !== "object" || Array.isArray(file) || !isStudioAssetId(file.asset_id)) throw badRequest("invalid_asset_id");
    const size = Number(file.size);
    const type = clean(file.type).toLowerCase();
    if (!Number.isSafeInteger(size) || size <= 0 || !isAllowedImageMime(type)) throw badRequest("invalid_photo_metadata");
    return { name: studioText(file.name, 240, "invalid_photo_name"), size, type, asset_id: file.asset_id };
  });
  const assetIds = files.map((file) => file.asset_id);
  if (new Set(assetIds).size !== assetIds.length) throw badRequest("duplicate_photo");
  if (body.asset_ids !== undefined && (!Array.isArray(body.asset_ids) || JSON.stringify(body.asset_ids) !== JSON.stringify(assetIds))) throw badRequest("asset_list_mismatch");
  const mainAssetId = body.main_asset_id === undefined ? assetIds[0] : clean(body.main_asset_id);
  if (!assetIds.includes(mainAssetId)) throw badRequest("invalid_main_asset_id");
  if (body.consent !== true) throw badRequest("consent_required");
  const modelRecordId = studioText(body.model_record_id, 27, "invalid_model_record_id");
  if (modelRecordId && !STUDIO_RECORD_ID.test(modelRecordId)) throw badRequest("invalid_model_record_id");
  const family = clean(body.compcard_family) || STUDIO_FAMILY_BY_FIELD[normalized.field];
  if (family !== STUDIO_FAMILY_BY_FIELD[normalized.field]) throw badRequest("compcard_family_mismatch");
  const variant = body.visual_variant_number === undefined || body.visual_variant_number === null || body.visual_variant_number === "" ? null : Number(body.visual_variant_number);
  if (variant !== null && (!Number.isInteger(variant) || variant < 1 || variant > 7)) throw badRequest("invalid_visual_variant_number");
  return {
    ...normalized,
    flow_version: 2,
    // V2 never accepts an external record identifier or timestamp as its receipt.
    studio_intake_id: "",
    created_at: new Date().toISOString(),
    model_name: studioText(normalized.model_name, 80, "invalid_model_name", { required: true }),
    template_hint: studioText(normalized.template_hint, 160, "invalid_template_hint", { required: true }),
    direction: studioText(body.direction || body.note, 1000, "invalid_direction", { multiline: true }),
    checklist: studioReviewChecklist(body.checklist),
    files,
    asset_ids: assetIds,
    main_asset_id: mainAssetId,
    model_record_id: modelRecordId,
    model_mode: modelRecordId ? "existing" : "new",
    category: studioChoice(body.category, ["Standard", "Premium", "Exclusive", "Travel", "Extreme"], "invalid_category"),
    audiences: studioChoices(body.audiences, ["public", "private"], "audience_required", true),
    gender: studioChoice(body.gender, ["male", "gay"], "invalid_gender"),
    client_types: studioChoice(body.client_types, ["gay", "women", "both"], "invalid_client_types"),
    drive_folder: studioText(body.drive_folder, 2048, "invalid_drive_folder"),
    promotion_albums: studioChoices(body.promotion_albums, ["new-coming", "hot-sha", "mmd-recommend"], "invalid_promotion_albums"),
    note: studioText(body.note, 1000, "invalid_note", { multiline: true }),
    consent: true,
    height_cm: studioMetric(body.height_cm, 130, 230, "invalid_height_cm"),
    weight_kg: studioMetric(body.weight_kg, 35, 200, "invalid_weight_kg"),
    compcard_family: family,
    visual_variant_number: variant,
    title: studioText(body.title, 120, "invalid_title", { multiline: true }),
  };
}

function safeStudioModelContext(value, modelRecordId = "") {
  const context = value?.context && typeof value.context === "object" ? value.context : {};
  return {
    ok: true,
    ready: value?.ready === true,
    model_record_id: clean(modelRecordId),
    context: {
      display_name: clean(context.display_name).slice(0, 80),
      field: normalizeField(context.field),
      world: ["public", "private"].includes(context.world) ? context.world : "",
      layer: normalizeLayer(context.layer),
      run_number: clean(context.run_number).slice(0, 12),
      height_cm: context.height_cm == null ? null : finiteNumberOrNull(context.height_cm),
      weight_kg: context.weight_kg == null ? null : finiteNumberOrNull(context.weight_kg),
      model_asset_policy: ["real_photo", "ai_generated"].includes(context.model_asset_policy) ? context.model_asset_policy : "",
      province: clean(context.province).slice(0, 120),
    },
    blockers: Array.isArray(value?.blockers) ? value.blockers.filter((item) => typeof item === "string").map((item) => item.slice(0, 160)).slice(0, 20) : [],
  };
}

function assertStudioCanonicalIdentity(intake, modelContext) {
  const context = modelContext.context;
  if (intake.model_record_id !== modelContext.model_record_id || intake.model_name !== context.display_name ||
      intake.field !== context.field || intake.layer !== context.layer || intake.run_number !== context.run_number ||
      intake.height_cm !== context.height_cm || intake.weight_kg !== context.weight_kg) throw conflict("model_context_mismatch");
}

async function verifyStudioIntakeV2(env, normalized) {
  await verifyStudioFilesV2(env, normalized.files);
  const context = normalized.model_record_id
    ? await readStudioModelContext(env, normalized.model_record_id)
    : { ready: false, context: {}, blockers: ["model_record_required"] };
  normalized.model_context = safeStudioModelContext(context, normalized.model_record_id);
  if (normalized.model_context.ready) assertStudioCanonicalIdentity(normalized, normalized.model_context);
  await assertStudioMyCardModel(env, normalized);
  return normalized;
}

async function assertStudioMyCardModel(env, intake) {
  if (!intake.compcard_request_id) return;
  let lookup;
  try { lookup = await lookupMyCardRequest(env, intake.compcard_request_id); }
  catch { throw studioError("my_card_request_lookup_unavailable", 503); }
  if (!lookup.ok) throw studioError(lookup.error || "my_card_request_lookup_unavailable", lookup.status === 404 ? 404 : 503);
  if (!intake.model_record_id || clean(lookup.payload.model_record_id) !== intake.model_record_id) throw conflict("my_card_model_mismatch");
}

function assertStudioPresentation(intake) {
  const special = GRADE_FIELDS.has(intake.field);
  const variant = intake.visual_variant_number;
  if (special ? variant !== (intake.field === "EMs" ? 6 : 7) : ![1, 2, 3, 4, 5].includes(variant)) throw conflict("studio_frame_required");
  if (!Number.isFinite(intake.height_cm) || intake.height_cm < 130 || intake.height_cm > 230 ||
      !Number.isFinite(intake.weight_kg) || intake.weight_kg < 35 || intake.weight_kg > 200) throw conflict("studio_metrics_required");
  if (!intake.model_name || intake.model_name.length > 80 || /[\x00-\x1f\x7f]/.test(intake.model_name)) throw conflict("studio_name_required");
  if (special) {
    const title = clean(intake.title).replace(/\r\n/g, "\n");
    if (!title || Array.from(title).length > 120 || title.split("\n").length > 2 || /[\x00-\x09\x0b-\x1f\x7f]/.test(title)) throw conflict("studio_title_required");
    if (!(new RegExp(`^${intake.field}\\d{1,6}$`)).test(intake.run_number)) throw conflict("studio_assigned_run_required");
  }
  const photo = intake.files.find((file) => file.asset_id === intake.main_asset_id);
  if (!photo || !isAllowedImageMime(photo.type) || !Number.isSafeInteger(photo.size) || photo.size < 1 || photo.size > DEFAULT_UPLOAD_MAX_BYTES) throw conflict("studio_photo_required");
}

async function normalizeStudioReviewV2(env, body) {
  assertNoStudioAuthorityInput(body);
  const saved = await readStudioFlowRecord(env, "intake", body.studio_intake_id);
  if (saved.normalized.flow_version !== 2) throw conflict("intake_version_not_supported");
  const intake = safeStudioIntake(saved.normalized, saved.record.id);
  await assertStudioMyCardModel(env, intake);
  const decision = studioChoice(body.decision || "Needs Review", [...DECISION_SET], "invalid_decision");
  const checklist = studioReviewChecklist(body.checklist);
  if (decision === "Approved Direction") {
    if (!STUDIO_REVIEW_CHECKS.every((key) => checklist[key])) throw badRequest("review_checklist_required");
    assertStudioPresentation(intake);
    if (!intake.model_record_id) throw conflict("model_record_required");
    const current = safeStudioModelContext(await readStudioModelContext(env, intake.model_record_id), intake.model_record_id);
    if (!current.ready) throw conflict("model_context_not_ready");
    assertStudioCanonicalIdentity(intake, current);
    if (current.context.model_asset_policy !== "real_photo") throw conflict("generated_media_required");
    if (intake.model_context.ready !== true || intake.model_context.context.model_asset_policy !== current.context.model_asset_policy) throw conflict("model_context_mismatch");
    await verifyStudioFilesV2(env, intake.files);
  }
  return {
    flow_version: 2,
    studio_review_id: "",
    studio_intake_id: intake.studio_intake_id,
    compcard_request_id: intake.compcard_request_id,
    model_name: intake.model_name,
    field: intake.field,
    run_number: intake.run_number,
    layer: intake.layer,
    decision,
    checklist,
    checklist_score: STUDIO_REVIEW_CHECKS.filter((key) => checklist[key]).length,
    ewvon_note: studioText(body.ewvon_note, 1000, "invalid_review_note", { multiline: true }),
    final_note: studioText(body.final_note, 2000, "invalid_final_note", { multiline: true }),
    created_at: new Date().toISOString(),
    intake_snapshot: intake,
  };
}

async function verifyStudioFilesV2(env, files) {
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.head !== "function") throw studioError("asset_storage_unavailable", 503);
  for (const file of files) {
    let object;
    try { object = await env.MMD_MODEL_ASSETS.head(studioAssetKey(file.asset_id)); }
    catch { throw studioError("asset_storage_unavailable", 503); }
    if (!isVerifiedStudioAssetObject(object, file.asset_id, env) || Number(object.size) !== file.size || object.customMetadata.content_type !== file.type) throw conflict("asset_verification_failed");
  }
}

function isVerifiedStudioAssetObject(object, assetId, env) {
  if (!isValidStudioAssetObject(object, assetId)) return false;
  const meta = object.customMetadata;
  const checksum = object.checksums?.sha256;
  return object.key === studioAssetKey(assetId) && Number.isSafeInteger(object.size) && object.size > 0 &&
    object.size <= uploadMaxBytes(env) && String(object.size) === meta.size &&
    object.httpMetadata?.contentType === meta.content_type &&
    meta.staging_prefix === STUDIO_ASSET_PREFIX.replace(/\/$/, "") &&
    checksum instanceof ArrayBuffer && checksum.byteLength === 32 && arrayBufferToHex(checksum) === meta.sha256;
}

async function readStudioAsset(env, body) {
  const assetId = clean(body.asset_id);
  if (!isStudioAssetId(assetId)) throw badRequest("invalid_asset_id");
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.get !== "function") throw studioError("asset_storage_unavailable", 503);
  let object;
  try { object = await env.MMD_MODEL_ASSETS.get(studioAssetKey(assetId)); }
  catch { throw studioError("asset_storage_unavailable", 503); }
  if (!object) throw studioError("asset_not_found", 404);
  if (!object.body || !isVerifiedStudioAssetObject(object, assetId, env)) {
    if (object.body?.cancel) await object.body.cancel().catch(() => {});
    throw conflict("asset_verification_failed");
  }
  return new Response(object.body, { headers: {
    "content-type": object.customMetadata.content_type,
    "content-length": String(object.size),
    "cache-control": "private, no-store",
    "content-disposition": "inline",
    "x-content-type-options": "nosniff",
  } });
}

const STUDIO_INTAKE_PUBLIC_FIELDS = [
  "compcard_request_id", "model_name", "internal_code", "source_owner", "category_path", "field", "run_number", "layer",
  "template_hint", "model_template_id", "direction", "model_record_id", "model_mode", "category", "gender", "client_types",
  "drive_folder", "note", "compcard_family", "title",
];

function safeStudioIntake(normalized, recordId) {
  const result = { flow_version: normalized.flow_version === 2 ? 2 : 1, studio_intake_id: recordId };
  for (const field of STUDIO_INTAKE_PUBLIC_FIELDS) result[field] = clean(normalized[field]).slice(0, field === "drive_folder" ? 2048 : 1000);
  result.created_at = clean(normalized.created_at).slice(0, 40);
  result.field = normalizeField(result.field);
  result.layer = normalizeLayer(result.layer);
  result.height_cm = normalized.height_cm == null ? null : finiteNumberOrNull(normalized.height_cm);
  result.weight_kg = normalized.weight_kg == null ? null : finiteNumberOrNull(normalized.weight_kg);
  result.visual_variant_number = Number.isInteger(normalized.visual_variant_number) && normalized.visual_variant_number >= 1 && normalized.visual_variant_number <= 7 ? normalized.visual_variant_number : null;
  result.audiences = Array.isArray(normalized.audiences) ? normalized.audiences.filter((value) => ["public", "private"].includes(value)).slice(0, 2) : [];
  result.promotion_albums = Array.isArray(normalized.promotion_albums) ? normalized.promotion_albums.filter((value) => ["new-coming", "hot-sha", "mmd-recommend"].includes(value)).slice(0, 3) : [];
  result.consent = normalized.consent === true;
  result.checklist = Object.fromEntries(STUDIO_REVIEW_CHECKS.map((key) => [key, normalized.checklist?.[key] === true]));
  result.files = normalizeFileList(normalized.files).filter((file) => isStudioAssetId(file.asset_id) && isAllowedImageMime(file.type) && Number.isSafeInteger(file.size) && file.size > 0).slice(0, 10);
  result.asset_ids = result.files.map((file) => file.asset_id);
  result.main_asset_id = result.asset_ids.includes(normalized.main_asset_id) ? normalized.main_asset_id : (result.flow_version === 1 ? result.asset_ids[0] || "" : "");
  result.model_context = safeStudioModelContext(normalized.model_context, result.model_record_id);
  if (result.flow_version === 2 && (!result.field || !result.layer || !result.model_name || !result.consent ||
      !result.files.length || result.files.length !== normalized.files?.length || new Set(result.asset_ids).size !== result.asset_ids.length ||
      JSON.stringify(result.asset_ids) !== JSON.stringify(normalized.asset_ids) || !result.main_asset_id)) throw conflict("intake_record_invalid");
  return result;
}

function safeStudioReview(normalized, recordId) {
  const result = {
    flow_version: normalized.flow_version === 2 ? 2 : 1,
    studio_review_id: recordId,
    studio_intake_id: clean(normalized.studio_intake_id),
    compcard_request_id: clean(normalized.compcard_request_id),
    model_name: clean(normalized.model_name).slice(0, 80),
    field: normalizeField(normalized.field),
    layer: normalizeLayer(normalized.layer),
    run_number: clean(normalized.run_number).slice(0, 12),
    decision: DECISION_SET.has(normalized.decision) ? normalized.decision : "Needs Review",
    checklist: Object.fromEntries(STUDIO_REVIEW_CHECKS.map((key) => [key, normalized.checklist?.[key] === true])),
    checklist_score: clampInt(normalized.checklist_score, 0, 20, 0),
    ewvon_note: clean(normalized.ewvon_note).slice(0, 1000),
    final_note: clean(normalized.final_note).slice(0, 2000),
    created_at: clean(normalized.created_at).slice(0, 40),
    intake_snapshot: null,
  };
  if (result.flow_version === 2) {
    const snapshot = normalized.intake_snapshot;
    if (!snapshot || snapshot.flow_version !== 2 || !STUDIO_RECORD_ID.test(result.studio_intake_id) || snapshot.studio_intake_id !== result.studio_intake_id) throw conflict("review_snapshot_invalid");
    result.intake_snapshot = safeStudioIntake(snapshot, result.studio_intake_id);
    for (const key of ["model_name", "field", "layer", "run_number", "compcard_request_id"]) {
      if (result[key] !== result.intake_snapshot[key]) throw conflict("review_snapshot_invalid");
    }
  }
  return result;
}

async function studioPreviewReadiness(env, review) {
  if (review.flow_version !== 2 || !review.intake_snapshot) return { preview_ready: false, blockers: ["review_version_not_supported"] };
  if (review.decision !== "Approved Direction") return { preview_ready: false, blockers: ["review_not_approved"] };
  if (!STUDIO_REVIEW_CHECKS.every((key) => review.checklist[key] === true)) return { preview_ready: false, blockers: ["review_checklist_required"] };
  const intake = review.intake_snapshot;
  try {
    assertStudioPresentation(intake);
    await assertStudioMyCardModel(env, intake);
    if (!intake.model_record_id) throw conflict("model_record_required");
    const current = safeStudioModelContext(await readStudioModelContext(env, intake.model_record_id), intake.model_record_id);
    if (!current.ready) throw conflict("model_context_not_ready");
    assertStudioCanonicalIdentity(intake, current);
    if (current.context.model_asset_policy !== "real_photo") throw conflict("generated_media_required");
    if (intake.model_context.ready !== true || intake.model_context.context.model_asset_policy !== current.context.model_asset_policy) throw conflict("model_context_mismatch");
    await verifyStudioFilesV2(env, intake.files);
    return { preview_ready: true, blockers: [] };
  } catch (error) {
    const allowed = new Set(["model_record_required", "model_not_found", "model_context_not_ready", "model_context_mismatch", "generated_media_required", "asset_verification_failed", "asset_storage_unavailable", "studio_frame_required", "studio_metrics_required", "studio_name_required", "studio_title_required", "studio_assigned_run_required", "studio_photo_required", "my_card_model_mismatch", "my_card_request_not_found", "my_card_request_lookup_unavailable"]);
    return { preview_ready: false, blockers: [allowed.has(error?.message) ? error.message : "model_context_unavailable"] };
  }
}

function parseStudioFlowRecord(record, kind, requireV2 = false) {
  const fields = record?.fields || {};
  if (!STUDIO_RECORD_ID.test(record?.id || "") || fields.source !== `mmd_studio_${kind}` || fields.intent !== `studio_${kind}_commit` || fields.status !== `${kind}_committed`) throw studioError(`${kind}_not_found`, 404);
  const payload = parseMyCardPayload(fields.payload_json);
  const normalized = payload.normalized;
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized) || (requireV2 && normalized.flow_version !== 2)) throw conflict(`${kind}_record_invalid`);
  return { record, payload, normalized };
}

async function readStudioFlowRecord(env, kind, recordId) {
  const id = clean(recordId);
  if (!STUDIO_RECORD_ID.test(id)) throw badRequest(`invalid_studio_${kind}_id`);
  let result;
  try { result = await airtableGet(env, resolveStudioTable(env, kind).name, id); }
  catch { throw studioError(`${kind}_lookup_unavailable`, 503); }
  if (!result.ok) throw studioError(result.status === 404 ? `${kind}_not_found` : `${kind}_lookup_unavailable`, result.status === 404 ? 404 : 503);
  if (result.record?.id !== id) throw studioError(`${kind}_lookup_unavailable`, 503);
  return parseStudioFlowRecord(result.record, kind);
}

async function findStudioV2Duplicate(env, table, idempotencyKey) {
  const field = table.mode === "console_inbox_fallback" ? "inbox_id" : "idempotency_key";
  let result;
  try { result = await airtableList(env, table.name, { filterByFormula: `{${field}}="${escapeFormula(idempotencyKey)}"`, maxRecords: 2 }); }
  catch { throw studioError("idempotency_lookup_unavailable", 503); }
  // Airtable lookup then create is serial retry protection, not a cross-request CAS.
  // A failed or ambiguous lookup must never fall through to another create.
  if (!result.ok) throw studioError("idempotency_lookup_unavailable", 503);
  if (result.records.length > 1) throw conflict("idempotency_record_ambiguous");
  if (result.records[0] && result.records[0].fields?.[field] !== idempotencyKey) throw studioError("idempotency_lookup_unavailable", 503);
  return result.records[0] || null;
}

async function readStudioFlowRequest(env, kind, body) {
  const recordId = clean(body[`studio_${kind}_id`]);
  if (recordId) {
    if (body.idempotency_key) throw badRequest("one_reference_required");
    return readStudioFlowRecord(env, kind, recordId);
  }
  const key = requireIdempotencyKey(body, "idempotency_key_required");
  const record = await findStudioV2Duplicate(env, resolveStudioTable(env, kind), key);
  if (!record) throw studioError(`${kind}_not_found`, 404);
  return parseStudioFlowRecord(record, kind, true);
}

function canonicalStudioJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalStudioJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStudioJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function studioFlowReceipt(kind, record, normalized, idempotencyKey, table, replayed) {
  return {
    flow_version: 2,
    [`studio_${kind}_id`]: record.id,
    ...(kind === "review" ? { studio_intake_id: normalized.studio_intake_id } : {}),
    record_id: record.id,
    compcard_request_id: normalized.compcard_request_id || null,
    idempotency_key: idempotencyKey,
    table_mode: table.mode,
    replayed,
  };
}

async function commitStudioFlowV2(env, kind, body) {
  assertNoStudioAuthorityInput(body);
  const idempotencyKey = requireIdempotencyKey(body, "idempotency_key_required");
  const table = resolveStudioTable(env, kind);
  const fingerprint = await sha256Hex(new TextEncoder().encode(canonicalStudioJson(body)));
  const duplicate = await findStudioV2Duplicate(env, table, idempotencyKey);
  if (duplicate) {
    let saved;
    try { saved = parseStudioFlowRecord(duplicate, kind, true); }
    catch { throw conflict("idempotency_conflict"); }
    if (saved.payload.request_fingerprint !== fingerprint) throw conflict("idempotency_conflict");
    return studioFlowReceipt(kind, saved.record, saved.normalized, idempotencyKey, table, true);
  }
  const normalized = kind === "intake"
    ? await verifyStudioIntakeV2(env, normalizeStudioIntake(body))
    : await normalizeStudioReviewV2(env, body);
  const fields = fieldsForTable(table, {
    [`studio_${kind}_id`]: crypto.randomUUID(),
    ...(kind === "review" ? { studio_intake_id: normalized.studio_intake_id } : {}),
    source: `mmd_studio_${kind}`,
    intent: `studio_${kind}_commit`,
    model_name: normalized.model_name,
    field: normalized.field,
    run_number: normalized.run_number,
    layer: normalized.layer,
    ...(kind === "intake" ? {
      internal_code: normalized.internal_code,
      source_owner: normalized.source_owner,
      category_path: normalized.category_path,
      template_hint: normalized.template_hint,
      direction: normalized.direction,
      checklist_json: JSON.stringify(normalized.checklist),
      created_by: "assistant",
    } : {
      decision: normalized.decision,
      checklist_score: normalized.checklist_score,
      ewvon_note: normalized.ewvon_note,
      final_note: normalized.final_note,
    }),
    // Only validated fields and server-owned context are persisted in the V2 payload.
    payload_json: JSON.stringify({ normalized, request_fingerprint: fingerprint }),
    status: `${kind}_committed`,
    created_at: normalized.created_at,
    idempotency_key: idempotencyKey,
  });
  let record;
  try { record = await airtableCreate(env, table.name, fields); }
  catch { throw studioError(`${kind}_save_unconfirmed`, 503); }
  if (!STUDIO_RECORD_ID.test(record?.id || "")) throw studioError(`${kind}_save_unconfirmed`, 503);
  if (kind === "review" && normalized.compcard_request_id) {
    // Preserve the inbox update once on create; a receipt replay never mutates it.
    await syncMyCardReviewDecision(env, normalized.compcard_request_id, {
      ...normalized, studio_review_id: record.id, reviewed_at: normalized.created_at,
    }, normalized.intake_snapshot.model_record_id).catch(() => null);
  }
  return studioFlowReceipt(kind, record, normalized, idempotencyKey, table, false);
}

export function normalizeStudioPreview(body = {}) {
  const field = normalizeField(body.field || body.field_code);
  const layer = normalizeLayer(body.layer);
  const runNumber = clean(body.run_number || body.runNumber);
  if (!field) throw badRequest("invalid_field");
  if (!layer) throw badRequest("invalid_layer");
  requireGradeRunNumber(field, runNumber);

  const checklist = normalizeChecklist(body.checklist);
  return {
    studio_review_id: clean(body.studio_review_id || body.review_id),
    approved_review_snapshot: body.approved_review_snapshot && typeof body.approved_review_snapshot === "object" ? body.approved_review_snapshot : null,
    model_name: clean(body.model_name || body.modelName || body.model),
    internal_code: clean(body.internal_code || body.internalCode || body.code),
    field,
    run_number: runNumber,
    layer,
    template: clean(body.template || body.template_title || body.template_id),
    publish_target: clean(body.publish_target || body.target || "Internal Preview"),
    public_route_target: clean(body.public_route_target || body.route_target || ""),
    asset_ids: normalizeAssetIdList(body.asset_ids || body.assetIds || body.asset_id || body.assetId),
    image_url: clean(body.image_url || body.imageUrl),
    review_note: clean(body.review_note || body.final_note || body.note),
    checklist,
    payload: body,
  };
}

export function buildPublishPlan(normalized) {
  const blockers = [];
  const hasApprovedSnapshot = normalized.approved_review_snapshot && /approved/i.test(clean(normalized.approved_review_snapshot.decision || normalized.approved_review_snapshot.status));
  if (!normalized.studio_review_id && !normalized.review_note && !hasApprovedSnapshot) blockers.push("review_required");
  if (GRADE_FIELDS.has(normalized.field)) {
    try { requireGradeRunNumber(normalized.field, normalized.run_number); } catch (error) { blockers.push(error.message); }
  }
  if (normalized.checklist.safe === false || normalized.checklist.safe === undefined) blockers.push("safe_check_required");
  if (!normalized.asset_ids.length) blockers.push("asset_required");

  return {
    ok: true,
    status: "plan_only",
    can_commit: blockers.length === 0,
    blockers,
    plan: {
      airtable_record_changes: {
        model_name: normalized.model_name,
        internal_code: normalized.internal_code,
        field: normalized.field,
        run_number: normalized.run_number,
        layer: normalized.layer,
        template: normalized.template,
        publish_target: normalized.publish_target,
        status: "studio_preview_ready",
      },
      asset_ids: normalized.asset_ids,
      public_route_target: normalized.public_route_target || null,
      preview_summary: compactJoin([
        normalized.model_name || "Model",
        normalized.field,
        normalized.run_number,
        normalized.layer,
        normalized.template,
      ], " · "),
    },
  };
}

async function handleStudioUpload(request, env) {
  const idempotencyKey = requireHeaderIdempotencyKey(request, "idempotency_key_required");
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.put !== "function") throw serverError("missing_r2_binding");
  requireAssetSigningSecret(env);

  const contentType = clean(request.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("multipart/form-data")) throw badRequest("multipart_required");
  const maxBytes = uploadMaxBytes(env);
  assertDeclaredContentLength(request, maxBytes);

  const form = await request.formData().catch(() => {
    throw badRequest("invalid_multipart");
  });
  const files = [];
  for (const value of form.values()) {
    if (isFormFile(value)) files.push(value);
  }
  if (files.length !== 1) throw badRequest(files.length > 1 ? "one_file_only" : "file_required");

  const file = files[0];
  if (!Number.isFinite(file.size) || file.size <= 0) throw badRequest("empty_file");
  if (file.size > maxBytes) throw badRequest("file_too_large");

  const mime = clean(file.type).toLowerCase();
  const bytes = await file.arrayBuffer();
  const detected = detectImageMime(new Uint8Array(bytes));
  if (!isAllowedImageMime(mime)) throw badRequest("unsupported_file_type");
  if (detected !== mime) throw badRequest("image_magic_mismatch");

  const sha256 = await sha256Hex(bytes);
  const assetId = await studioAssetId(env, idempotencyKey);
  const key = studioAssetKey(assetId);
  const expected = {
    asset_id: assetId,
    sha256,
    size: String(file.size),
    content_type: mime,
    source: STUDIO_UPLOAD_SOURCE,
  };
  const putResult = await env.MMD_MODEL_ASSETS.put(key, bytes, {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    httpMetadata: { contentType: mime },
    customMetadata: {
      ...expected,
      created_at: new Date().toISOString(),
      staging_prefix: STUDIO_ASSET_PREFIX.replace(/\/$/, ""),
    },
    sha256: hexToArrayBuffer(sha256),
  });
  if (!putResult) {
    const replay = await resolveUploadReplay(env, key, expected);
    if (replay.ok) return uploadResponse(assetId, mime, file.size, true);
    if (replay.conflict) throw conflict("idempotency_conflict");
    throw serverError("upload_replay_verification_failed");
  }

  return uploadResponse(assetId, mime, file.size, false);
}

async function commitStudioIntake(env, normalized, rawBody) {
  const idempotencyKey = requireIdempotencyKey(rawBody, "idempotency_key_required");
  const table = resolveStudioTable(env, "intake");
  const duplicate = await findDuplicate(env, table, idempotencyKey);
  if (duplicate) throw conflict("duplicate_intake_commit");

  const fields = fieldsForTable(table, {
    studio_intake_id: normalized.studio_intake_id || crypto.randomUUID(),
    source: "mmd_studio_intake",
    intent: "studio_intake_commit",
    model_name: normalized.model_name,
    internal_code: normalized.internal_code,
    source_owner: normalized.source_owner,
    category_path: normalized.category_path,
    field: normalized.field,
    run_number: normalized.run_number,
    layer: normalized.layer,
    template_hint: normalized.template_hint,
    direction: normalized.direction,
    checklist_json: JSON.stringify(normalized.checklist || {}),
    payload_json: JSON.stringify({ normalized, raw: rawBody }),
    status: "intake_committed",
    created_by: "assistant",
    created_at: normalized.created_at,
    idempotency_key: idempotencyKey,
  });
  const rec = await airtableCreate(env, table.name, fields);
  return {
    studio_intake_id: rec?.id || null,
    record_id: rec?.id || null,
    compcard_request_id: normalized.compcard_request_id || null,
    idempotency_key: idempotencyKey,
    table_mode: table.mode,
  };
}

async function commitStudioReview(env, normalized, rawBody) {
  const idempotencyKey = requireIdempotencyKey(rawBody, "idempotency_key_required");
  const table = resolveStudioTable(env, "review");
  const duplicate = await findDuplicate(env, table, idempotencyKey);
  if (duplicate) throw conflict("duplicate_review_commit");

  const fields = fieldsForTable(table, {
    studio_review_id: normalized.studio_review_id || crypto.randomUUID(),
    studio_intake_id: normalized.studio_intake_id,
    source: "mmd_studio_review",
    intent: "studio_review_commit",
    model_name: normalized.model_name,
    field: normalized.field,
    run_number: normalized.run_number,
    layer: normalized.layer,
    decision: normalized.decision,
    checklist_score: normalized.checklist_score,
    ewvon_note: normalized.ewvon_note,
    final_note: normalized.final_note,
    payload_json: JSON.stringify({ normalized, raw: rawBody }),
    status: "review_committed",
    created_at: normalized.created_at,
    idempotency_key: idempotencyKey,
  });
  const rec = await airtableCreate(env, table.name, fields);
  let myCardRequestSync = null;
  if (normalized.compcard_request_id) {
    myCardRequestSync = await syncMyCardReviewDecision(env, normalized.compcard_request_id, {
      studio_review_id: rec?.id || null,
      decision: normalized.decision,
      field: normalized.field,
      run_number: normalized.run_number,
      layer: normalized.layer,
      reviewed_at: normalized.created_at,
    });
  }
  return {
    studio_review_id: rec?.id || null,
    record_id: rec?.id || null,
    compcard_request_id: normalized.compcard_request_id || null,
    my_card_request_sync: myCardRequestSync,
    idempotency_key: idempotencyKey,
    table_mode: table.mode,
  };
}

async function commitStudioPublish(env, normalized, rawBody, plan) {
  const idempotencyKey = requireIdempotencyKey(rawBody, "idempotency_key_required");
  const table = resolveStudioTable(env, "publish");
  const duplicate = await findDuplicate(env, table, idempotencyKey);
  if (duplicate) throw conflict("duplicate_publish_commit");

  const fields = fieldsForTable(table, {
    publish_id: crypto.randomUUID(),
    studio_review_id: normalized.studio_review_id,
    source: "mmd_studio_publish",
    intent: "studio_publish_commit",
    model_name: normalized.model_name,
    internal_code: normalized.internal_code,
    field: normalized.field,
    run_number: normalized.run_number,
    layer: normalized.layer,
    publish_target: normalized.publish_target,
    public_route_target: normalized.public_route_target,
    plan_json: JSON.stringify(plan),
    payload_json: JSON.stringify({ normalized, raw: rawBody }),
    status: "ledger_committed",
    created_at: new Date().toISOString(),
    idempotency_key: idempotencyKey,
  });
  const rec = await airtableCreate(env, table.name, fields);
  return {
    publish_id: rec?.id || null,
    record_id: rec?.id || null,
    idempotency_key: idempotencyKey,
    table_mode: table.mode,
    published: false,
    next_actions: ["review_airtable_record", "run_manual_r2_publish_if_needed", "publish_webflow_only_after_per_approval"],
  };
}

function requireIdempotencyKey(rawBody, error) {
  const key = clean(rawBody.idempotency_key || rawBody.idempotencyKey);
  if (!key || !/^[A-Za-z0-9._:-]{8,160}$/.test(key)) throw badRequest(error);
  return key;
}

function requireHeaderIdempotencyKey(request, error) {
  const key = clean(request.headers.get("Idempotency-Key"));
  if (!key || !/^[A-Za-z0-9._:-]{8,160}$/.test(key)) throw badRequest(error);
  return key;
}

function resolveStudioTable(env, kind) {
  const explicit = clean(env[`AIRTABLE_TABLE_STUDIO_${kind.toUpperCase()}`]);
  if (explicit) return { name: explicit, mode: "studio_table" };
  const fallback = clean(env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || env.AIRTABLE_TABLE_CONSOLE_INBOX || "");
  if (fallback) return { name: fallback, mode: "console_inbox_fallback" };
  return { name: `Studio_${capitalize(kind)}`, mode: "studio_table" };
}

function fieldsForTable(table, fields) {
  if (table.mode !== "console_inbox_fallback") return fields;
  return {
    inbox_id: clean(fields.idempotency_key || fields.studio_intake_id || fields.studio_review_id || fields.publish_id || crypto.randomUUID()),
    source: fields.source,
    intent: fields.intent,
    member_name: clean(fields.model_name || ""),
    admin_note: clean(fields.final_note || fields.direction || fields.ewvon_note || fields.intent || ""),
    payload_json: fields.payload_json || JSON.stringify(fields),
    status: fields.status || "new",
    error_message: "",
  };
}

async function findDuplicate(env, table, idempotencyKey) {
  if (!idempotencyKey || !env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return null;
  const field = table.mode === "console_inbox_fallback" ? "inbox_id" : "idempotency_key";
  const formula = `{${field}}="${escapeFormula(idempotencyKey)}"`;
  const result = await airtableList(env, table.name, { filterByFormula: formula, maxRecords: 1 });
  if (result.schemaError) return null;
  if (!result.ok) throw new Error(result.error || "idempotency_lookup_failed");
  return result.records[0] || null;
}

async function airtableCreate(env, tableName, fields) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw serverError("missing_airtable_env");
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw serverError(`airtable_create_${response.status}:${compactError(data)}`);
  return data;
}

async function airtableGet(env, tableName, recordId) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !tableName) {
    return { ok: false, status: 503, record: null, error: "missing_airtable_env" };
  }
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`, {
    headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, record: null, error: compactError(data) };
  return { ok: true, status: 200, record: data };
}

async function airtableUpdate(env, tableName, recordId, fields) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !tableName) {
    return { ok: false, status: 503, record: null, error: "missing_airtable_env" };
  }
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, record: null, error: compactError(data) };
  return { ok: true, status: 200, record: data };
}

async function airtableList(env, tableName, { filterByFormula = "", maxRecords = 1 } = {}) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !tableName) return { ok: false, records: [], error: "missing_airtable_env" };
  const params = new URLSearchParams({ maxRecords: String(maxRecords) });
  if (filterByFormula) params.set("filterByFormula", filterByFormula);
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}?${params}`, {
    headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = compactError(data);
    return { ok: false, schemaError: response.status === 422 || /unknown field|invalid.*field/i.test(message), records: [], error: message };
  }
  return { ok: true, records: Array.isArray(data.records) ? data.records : [] };
}

async function verifyR2Keys(env, keys) {
  const uniqueKeys = [...new Set(keys.map(clean).filter(Boolean))];
  if (!uniqueKeys.length) return { ok: true, missing_keys: [] };
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.head !== "function") return { ok: false, missing_keys: uniqueKeys };
  const missing = [];
  for (const key of uniqueKeys) {
    const meta = await env.MMD_MODEL_ASSETS.head(key).catch(() => null);
    if (!meta) missing.push(key);
  }
  return { ok: missing.length === 0, missing_keys: missing };
}

async function verifyStudioAssets(env, assetIds) {
  const uniqueAssetIds = [...new Set(assetIds.map(clean).filter(Boolean))];
  if (!uniqueAssetIds.length) return { ok: false, missing_asset_ids: [] };
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.head !== "function") return { ok: false, missing_asset_ids: uniqueAssetIds };
  const missing = [];
  for (const assetId of uniqueAssetIds) {
    if (!isStudioAssetId(assetId)) {
      missing.push(assetId);
      continue;
    }
    const meta = await env.MMD_MODEL_ASSETS.head(studioAssetKey(assetId)).catch(() => null);
    if (!isValidStudioAssetObject(meta, assetId)) missing.push(assetId);
  }
  return { ok: missing.length === 0, missing_asset_ids: missing };
}

function buildIntakeWarnings(normalized) {
  const warnings = [];
  if (!normalized.files.length) warnings.push("no_files_attached");
  if (!normalized.source_owner) warnings.push("source_owner_empty");
  return warnings;
}

async function isStudioAuthed(request, env) {
  const url = new URL(request.url);
  const authUrl = new URL("/v1/admin/auth/me", url.origin);
  const response = await modelLiffWorker.fetch(new Request(authUrl.toString(), {
    method: "GET",
    headers: {
      cookie: request.headers.get("cookie") || "",
      origin: request.headers.get("origin") || url.origin,
      accept: "application/json",
    },
  }), env, {});
  if (!response.ok) return false;
  const data = await response.json().catch(() => ({}));
  return data?.ok === true && (data?.authenticated === true || data?.data?.authenticated === true);
}

function isSecondConfirmed(body) {
  return body?.ledger_commit_confirmed === true && clean(body?.ledger_confirmation_phrase) === LEDGER_COMMIT_CONFIRMATION;
}

function requireGradeRunNumber(field, runNumber) {
  if (!GRADE_FIELDS.has(field)) return;
  const pattern = field === "GWs" ? /^GWs\d{3}$/ : /^EMs\d{3}$/;
  if (!runNumber) throw badRequest("run_number_required");
  if (!pattern.test(runNumber)) throw badRequest("invalid_run_number");
}

function normalizeField(value) {
  const field = clean(value);
  return FIELD_SET.has(field) ? field : "";
}

function normalizeLayer(value) {
  const layer = clean(value);
  if (!LAYER_SET.has(layer)) return "";
  return NORMAL_LAYER.get(layer) || layer;
}

function normalizeChecklist(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) out[clean(key)] = Boolean(raw);
  return out;
}

function normalizeFileList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((file) => ({
    name: clean(file?.name).slice(0, 240),
    size: Number.isFinite(Number(file?.size)) ? Number(file.size) : 0,
    type: clean(file?.type).slice(0, 120),
    asset_id: clean(file?.asset_id || file?.assetId).slice(0, 80),
  }));
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).slice(0, 100);
  const text = clean(value);
  return text ? text.split(",").map(clean).filter(Boolean).slice(0, 100) : [];
}

function normalizeAssetIdList(value) {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) return clean(item.asset_id || item.assetId || item.id);
    return clean(item);
  }).filter(Boolean).slice(0, 100);
}

function isFormFile(value) {
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.size === "number" && "name" in value;
}

function uploadMaxBytes(env) {
  const configured = Number.parseInt(env.STUDIO_UPLOAD_MAX_BYTES, 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_UPLOAD_MAX_BYTES;
}

function assertDeclaredContentLength(request, maxBytes) {
  const raw = clean(request.headers.get("content-length"));
  if (!raw) return;
  const declared = Number.parseInt(raw, 10);
  if (!Number.isFinite(declared) || declared < 0) throw badRequest("invalid_content_length");
  if (declared > maxBytes) throw badRequest("file_too_large");
}

function isAllowedImageMime(mime) {
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp";
}

function detectImageMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return "image/png";
  if (
    bytes.length >= 16 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50 &&
    isWebpChunk(bytes.slice(12, 16))
  ) return "image/webp";
  return "";
}

async function studioAssetId(env, idempotencyKey) {
  const secret = requireAssetSigningSecret(env);
  return `studio_${await hmacHex(secret, `studio-upload:${idempotencyKey}`)}`;
}

function requireAssetSigningSecret(env) {
  const secret = clean(env.STUDIO_ASSET_SIGNING_SECRET);
  if (!secret) throw serverError("missing_asset_signing_secret");
  return secret;
}

function isWebpChunk(bytes) {
  const chunk = String.fromCharCode(...bytes);
  return chunk === "VP8 " || chunk === "VP8L" || chunk === "VP8X";
}

function isStudioAssetId(value) {
  return /^studio_[a-f0-9]{64}$/.test(clean(value));
}

function studioAssetKey(assetId) {
  if (!isStudioAssetId(assetId)) throw badRequest("invalid_asset_id");
  return `${STUDIO_ASSET_PREFIX}${assetId}`;
}

async function hmacHex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return arrayBufferToHex(signature);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return arrayBufferToHex(digest);
}

function arrayBufferToHex(value) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToArrayBuffer(value) {
  const text = clean(value);
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return bytes.buffer;
}

function assertRecordId(value, error) {
  const text = clean(value);
  if (!text || !/^[A-Za-z0-9_-]{3,128}$/.test(text)) throw badRequest(error);
}

function assertSafePathText(value, error, required) {
  const text = clean(value);
  if (!text && !required) return;
  if (!text || text.includes("..") || /[<>\\]/.test(text) || text.length > 600) throw badRequest(error);
}

function containsBrowserLineUserId(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsBrowserLineUserId);
  for (const [key, child] of Object.entries(value)) {
    if (/^line[_-]?user[_-]?id$/i.test(key)) return true;
    if (containsBrowserLineUserId(child)) return true;
  }
  return false;
}

function findForbiddenStudioInput(value) {
  const forbidden = new Set(["r2_key", "key", "storage_key", "bucket_name", "public_url", "r2_required_keys", "r2_keys", "required_r2_keys"]);
  return findForbiddenObjectKey(value, forbidden);
}

function findForbiddenObjectKey(value, forbidden) {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findForbiddenObjectKey(child, forbidden);
      if (found) return found;
    }
    return "";
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = clean(key);
    if (forbidden.has(normalizedKey)) return normalizedKey;
    const found = findForbiddenObjectKey(child, forbidden);
    if (found) return found;
  }
  return "";
}

async function safeJson(request) {
  try {
    const data = await request.json();
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (_) {
    throw badRequest("invalid_json");
  }
}

function isAllowedOrigin(request, env) {
  const origin = parseOrigin(request.headers.get("origin"));
  if (!origin) return false;
  if (origin !== new URL(request.url).origin) return false;
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(clean).filter(Boolean));
  return allowed.size > 0 && allowed.has(origin);
}

function corsHeaders(request, env) {
  const headers = new Headers({
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Idempotency-Key",
    "access-control-allow-credentials": "true",
    "access-control-max-age": "86400",
    vary: "Origin",
  });
  const origin = parseOrigin(request.headers.get("origin"));
  if (origin && isAllowedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  return headers;
}

function parseOrigin(value) {
  const origin = clean(value);
  if (!origin) return "";
  try {
    const url = new URL(origin);
    return url.origin === origin.replace(/\/$/, "") ? url.origin : "";
  } catch (_) {
    return "";
  }
}

async function resolveUploadReplay(env, key, expected) {
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.head !== "function") return { ok: false };
  const existing = await env.MMD_MODEL_ASSETS.head(key).catch(() => null);
  if (!existing || !existing.customMetadata) return { ok: false };
  const actual = existing.customMetadata || {};
  if (!hasCompleteStudioUploadMetadata(actual)) return { ok: false };
  const matches = actual.asset_id === expected.asset_id &&
    actual.sha256 === expected.sha256 &&
    actual.size === expected.size &&
    actual.content_type === expected.content_type &&
    actual.source === expected.source;
  return matches ? { ok: true } : { ok: false, conflict: true };
}

function uploadResponse(assetId, contentType, size, replayed) {
  return json({
    ok: true,
    asset_id: assetId,
    content_type: contentType,
    size,
    replayed: Boolean(replayed),
  });
}

function isValidStudioAssetObject(object, assetId) {
  if (!object || !object.customMetadata) return false;
  const meta = object.customMetadata;
  return hasCompleteStudioUploadMetadata(meta) &&
    meta.asset_id === assetId &&
    meta.source === STUDIO_UPLOAD_SOURCE &&
    isAllowedImageMime(clean(meta.content_type).toLowerCase()) &&
    /^[a-f0-9]{64}$/.test(clean(meta.sha256)) &&
    /^[1-9]\d*$/.test(clean(meta.size));
}

function hasCompleteStudioUploadMetadata(meta) {
  return Boolean(
    meta &&
    clean(meta.asset_id) &&
    clean(meta.sha256) &&
    clean(meta.size) &&
    clean(meta.content_type) &&
    clean(meta.source)
  );
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function serverError(message) {
  const error = new Error(message);
  error.status = 500;
  return error;
}

function studioError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function clean(value) {
  return String(value ?? "").trim();
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function compactJoin(values, separator) {
  return values.map(clean).filter(Boolean).join(separator);
}

function compactError(data) {
  if (!data) return "unknown_error";
  if (typeof data === "string") return data.slice(0, 500);
  return clean(data.error?.message || data.error || data.message || JSON.stringify(data)).slice(0, 500);
}

function escapeFormula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizePathname(pathname = "") {
  const normalized = String(pathname || "/").replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/g, "") : normalized || "/";
}

function capitalize(value) {
  const text = clean(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
