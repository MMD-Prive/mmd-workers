import modelLiffWorker from "./model-liff-worker.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const STUDIO_API_PREFIX = "/studio/api";
const INTAKE_VALIDATE_PATH = `${STUDIO_API_PREFIX}/intake/validate`;
const INTAKE_COMMIT_PATH = `${STUDIO_API_PREFIX}/intake/commit`;
const REVIEW_VALIDATE_PATH = `${STUDIO_API_PREFIX}/review/validate`;
const REVIEW_COMMIT_PATH = `${STUDIO_API_PREFIX}/review/commit`;
const PREVIEW_PLAN_PATH = `${STUDIO_API_PREFIX}/model-preview/publish-plan`;
const PREVIEW_COMMIT_PATH = `${STUDIO_API_PREFIX}/model-preview/commit`;
const UPLOAD_PATH = `${STUDIO_API_PREFIX}/upload`;
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
  if (method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!(await isStudioAuthed(request, env))) return json({ ok: false, error: "unauthorized" }, 401);

  try {
    if (path === UPLOAD_PATH) return await handleStudioUpload(request, env);

    const body = await safeJson(request);
    if (containsBrowserLineUserId(body)) return json({ ok: false, error: "line_user_id_not_allowed" }, 400);
    const forbidden = findForbiddenStudioInput(body);
    if (forbidden) return json({ ok: false, error: "raw_storage_field_not_allowed", field: forbidden }, 400);

    if (path === INTAKE_VALIDATE_PATH) {
      const normalized = normalizeStudioIntake(body);
      return json({ ok: true, safe_preview_only: true, normalized, warnings: buildIntakeWarnings(normalized) });
    }

    if (path === INTAKE_COMMIT_PATH) {
      const normalized = normalizeStudioIntake(body);
      const result = await commitStudioIntake(env, normalized, body);
      return json({ ok: true, status: "committed", ...result });
    }

    if (path === REVIEW_VALIDATE_PATH) {
      const normalized = normalizeStudioReview(body);
      return json({ ok: true, safe_preview_only: true, normalized, warnings: [] });
    }

    if (path === REVIEW_COMMIT_PATH) {
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

export function normalizeStudioIntake(body = {}) {
  const field = normalizeField(body.field || body.field_code);
  const layer = normalizeLayer(body.layer);
  const runNumber = clean(body.run_number || body.runNumber);
  const modelName = clean(body.model_name || body.modelName || body.name);
  const templateHint = clean(body.template_hint || body.template || body.template_title || body.template_id);
  const sourceOwner = clean(body.source_owner || body.sourceOwner);
  const categoryPath = clean(body.category_path || body.categoryPath);

  if (!modelName) throw badRequest("model_name_required");
  if (!field) throw badRequest("invalid_field");
  if (!layer) throw badRequest("invalid_layer");
  if (!templateHint) throw badRequest("template_hint_required");
  assertSafePathText(sourceOwner, "invalid_source_owner", false);
  assertSafePathText(categoryPath, "invalid_category_path", false);
  requireGradeRunNumber(field, runNumber);

  return {
    studio_intake_id: clean(body.studio_intake_id || body.intake_id),
    idempotency_key: clean(body.idempotency_key || body.idempotencyKey),
    model_name: modelName,
    internal_code: clean(body.internal_code || body.internalCode || body.code),
    source_owner: sourceOwner,
    category_path: categoryPath,
    field,
    run_number: runNumber,
    layer,
    template_hint: templateHint,
    direction: clean(body.direction || body.per_direction || body.note),
    checklist: normalizeChecklist(body.checklist),
    files: normalizeFileList(body.files),
    created_at: clean(body.created_at) || new Date().toISOString(),
  };
}

export function normalizeStudioReview(body = {}) {
  const seed = body.seed && typeof body.seed === "object" ? body.seed : {};
  const field = normalizeField(body.field || seed.field);
  const layer = normalizeLayer(body.layer || seed.layer);
  const runNumber = clean(body.run_number || body.runNumber || seed.run_number);
  const modelName = clean(body.model_name || body.modelName || seed.model_name || body.model);
  const decision = clean(body.decision || body.status || "Needs Review");

  if (body.studio_intake_id) assertRecordId(body.studio_intake_id, "invalid_studio_intake_id");
  if (!modelName) throw badRequest("model_name_required");
  if (!field) throw badRequest("invalid_field");
  if (!layer) throw badRequest("invalid_layer");
  if (!DECISION_SET.has(decision)) throw badRequest("invalid_decision");
  if (decision === "Approved Direction") requireGradeRunNumber(field, runNumber);

  return {
    studio_review_id: clean(body.studio_review_id || body.review_id),
    studio_intake_id: clean(body.studio_intake_id || seed.studio_intake_id),
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
  return { studio_intake_id: rec?.id || null, record_id: rec?.id || null, idempotency_key: idempotencyKey, table_mode: table.mode };
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
  return { studio_review_id: rec?.id || null, record_id: rec?.id || null, idempotency_key: idempotencyKey, table_mode: table.mode };
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
      "cache-control": "no-store",
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
