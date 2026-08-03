import modelLiffWorker from "./model-liff-worker.js";
import { isAuthed as isCoreAuthed } from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const STUDIO_API_PREFIX = "/studio/api";
const INTAKE_VALIDATE_PATH = `${STUDIO_API_PREFIX}/intake/validate`;
const INTAKE_COMMIT_PATH = `${STUDIO_API_PREFIX}/intake/commit`;
const REVIEW_VALIDATE_PATH = `${STUDIO_API_PREFIX}/review/validate`;
const REVIEW_COMMIT_PATH = `${STUDIO_API_PREFIX}/review/commit`;
const PREVIEW_PLAN_PATH = `${STUDIO_API_PREFIX}/model-preview/publish-plan`;
const PREVIEW_COMMIT_PATH = `${STUDIO_API_PREFIX}/model-preview/commit`;

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

  const body = await safeJson(request);
  if (containsBrowserLineUserId(body)) return json({ ok: false, error: "line_user_id_not_allowed" }, 400);

  try {
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
      if (!isSecondConfirmed(request, env, body)) return json({ ok: false, error: "confirm_key_required" }, 403);
      const normalized = normalizeStudioPreview(body);
      const plan = buildPublishPlan(normalized);
      if (!plan.can_commit) return json({ ok: false, error: "publish_blocked", blockers: plan.blockers, plan: plan.plan }, 400);
      const r2 = await verifyR2Keys(env, normalized.r2_required_keys);
      if (!r2.ok) return json({ ok: false, error: "r2_verification_failed", missing_keys: r2.missing_keys }, 409);
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
    r2_required_keys: normalizeStringArray(body.r2_required_keys || body.r2_keys || body.required_r2_keys),
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
      r2_required_keys: normalized.r2_required_keys,
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

async function commitStudioIntake(env, normalized, rawBody) {
  const idempotencyKey = normalized.idempotency_key || clean(rawBody.idempotency_key) || crypto.randomUUID();
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
  const idempotencyKey = clean(rawBody.idempotency_key) || crypto.randomUUID();
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
  const idempotencyKey = clean(rawBody.idempotency_key) || crypto.randomUUID();
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
    status: "committed",
    created_at: new Date().toISOString(),
    idempotency_key: idempotencyKey,
  });
  const rec = await airtableCreate(env, table.name, fields);
  return {
    publish_id: rec?.id || null,
    record_id: rec?.id || null,
    idempotency_key: idempotencyKey,
    table_mode: table.mode,
    next_actions: ["review_airtable_record", "run_manual_r2_publish_if_needed", "publish_webflow_only_after_per_approval"],
  };
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

function buildIntakeWarnings(normalized) {
  const warnings = [];
  if (!normalized.files.length) warnings.push("no_files_attached");
  if (!normalized.source_owner) warnings.push("source_owner_empty");
  return warnings;
}

async function isStudioAuthed(request, env) {
  if (await isCoreAuthed(request, env)) return true;
  const url = new URL(request.url);
  const bearer = clean(request.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  const supplied = [
    url.searchParams.get("t"),
    bearer,
    request.headers.get("X-Internal-Token"),
    request.headers.get("X-Confirm-Key"),
  ].map(clean).filter(Boolean);
  if (!supplied.length) return false;
  const allowed = [
    env.ADMIN_BEARER,
    env.INTERNAL_TOKEN,
    env.INTERNAL_API_TOKEN,
    env.STUDIO_ADMIN_TOKEN,
    env.CONFIRM_KEY,
    env.STUDIO_CONFIRM_KEY,
  ].map(clean).filter(Boolean);
  return supplied.some((value) => allowed.includes(value));
}

function isSecondConfirmed(request, env, body) {
  const header = clean(request.headers.get("X-Confirm-Key"));
  const bodyKey = clean(body.confirm_key || body.confirmKey);
  const expected = clean(env.CONFIRM_KEY || env.STUDIO_CONFIRM_KEY);
  return Boolean(expected && (header === expected || bodyKey === expected));
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
    r2_key: clean(file?.r2_key || file?.key).slice(0, 600),
  }));
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).slice(0, 100);
  const text = clean(value);
  return text ? text.split(",").map(clean).filter(Boolean).slice(0, 100) : [];
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

async function safeJson(request) {
  try {
    const data = await request.json();
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch (_) {
    throw badRequest("invalid_json");
  }
}

function isAllowedOrigin(request, env) {
  const origin = clean(request.headers.get("origin"));
  if (!origin) return true;
  const allowed = new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(clean).filter(Boolean));
  return allowed.size === 0 || allowed.has(origin);
}

function corsHeaders(request, env) {
  const origin = clean(request.headers.get("origin"));
  const headers = new Headers({
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-Confirm-Key, X-Internal-Token, Idempotency-Key",
    "access-control-allow-credentials": "true",
    "access-control-max-age": "86400",
    vary: "Origin",
  });
  if (origin && isAllowedOrigin(request, env)) headers.set("access-control-allow-origin", origin);
  return headers;
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
