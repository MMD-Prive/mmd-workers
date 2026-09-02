export const KENJI_MODEL_ADMIN_BASE_PATH = "/v1/admin/kenji/models";
export const KENJI_MODEL_ADMIN_DRAFT_PATH = `${KENJI_MODEL_ADMIN_BASE_PATH}/draft`;

const AIRTABLE_API = "https://api.airtable.com/v0";
const MAX_LIST_SCAN = 500;
const ALLOWED_TIERS = new Set(["public", "standard", "premium", "vip", "exclusive", "curated"]);
const ALLOWED_VISIBILITY = new Set(["public", "standard", "premium", "curated", "hidden", "internal"]);
const ALLOWED_CUSTOMER_SCOPE = new Set(["standard", "premium"]);
const ALLOWED_RESTRICTED_SCOPE = new Set(["potential", "review", "no_detail"]);

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizeToken(value) {
  return clean(value, 80).toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function firstField(fields = {}, names = []) {
  for (const name of names) {
    const value = fields?.[name];
    if (Array.isArray(value) && value.length) return value;
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return "";
}

function uniqueList(value, maxItems = 20, maxLen = 80) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return [...new Set(raw.map((item) => clean(item, maxLen)).filter(Boolean))].slice(0, maxItems);
}

function booleanValue(value) {
  if (value === true || value === false) return value;
  return ["1", "true", "yes", "y"].includes(clean(value, 20).toLowerCase());
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function envName(env, key, fallback) {
  return clean(env?.[key], 160) || fallback;
}

function airtableConfig(env = {}) {
  return {
    apiKey: clean(env.AIRTABLE_API_KEY, 1200),
    baseId: clean(env.AIRTABLE_BASE_ID, 200),
    modelsTable: envName(env, "AIRTABLE_TABLE_MODELS", "models"),
    reviewTable: envName(env, "AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS", "MMD — Model Review Requests"),
  };
}

function reviewFields(env = {}) {
  return {
    requestId: envName(env, "AT_REVIEW_REQUESTS__REQUEST_ID", "request_id"),
    model: envName(env, "AT_REVIEW_REQUESTS__MODEL", "Model"),
    requestType: envName(env, "AT_REVIEW_REQUESTS__REQUEST_TYPE", "request_type"),
    requestStatus: envName(env, "AT_REVIEW_REQUESTS__REQUEST_STATUS", "request_status"),
    requestedBy: envName(env, "AT_REVIEW_REQUESTS__REQUESTED_BY", "requested_by"),
    requestedAt: envName(env, "AT_REVIEW_REQUESTS__REQUESTED_AT", "requested_at"),
    requestedVisibility: envName(env, "AT_REVIEW_REQUESTS__REQUESTED_VISIBILITY", "requested_visibility"),
    decisionNote: envName(env, "AT_REVIEW_REQUESTS__DECISION_NOTE", "decision_note"),
    payloadJson: envName(env, "AT_REVIEW_REQUESTS__PAYLOAD_JSON", "payload_json"),
  };
}

async function airtableFetch(env, table, init = {}, query = null, fetchImpl = fetch) {
  const config = airtableConfig(env);
  if (!config.apiKey || !config.baseId) {
    return { ok: false, status: 503, error: "missing_airtable_env" };
  }
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(table)}`);
  if (query) {
    for (const [key, value] of query.entries()) url.searchParams.append(key, value);
  }
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      ...init,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        accept: "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (_) {
    return { ok: false, status: 503, error: "airtable_unreachable" };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, status: response.status, error: "airtable_request_failed", detail: data };
  return { ok: true, status: response.status, data };
}

export function projectKenjiAdminModelRecord(record = {}) {
  const fields = record.fields || {};
  const aliases = uniqueList(firstField(fields, ["aliases", "alias", "search_aliases"]));
  return {
    model_id: clean(record.id, 80),
    model_key: clean(firstField(fields, ["unique_key", "model_code", "model_lookup_key"]), 80),
    working_name: clean(firstField(fields, ["working_name", "Working Name", "display_name", "Display Name", "name", "Name"]), 120),
    search_aliases: aliases,
    customer_safe_info: clean(firstField(fields, ["customer_safe_summary", "approved_profile_summary", "public_safe_summary"]), 800),
    customer_safe_remark: clean(firstField(fields, ["customer_safe_remark", "public_safe_remark"]), 500),
    model_tier: clean(firstField(fields, ["model_tier", "tier"]), 40),
    status: clean(firstField(fields, ["status", "model_status"]), 40),
    booking_visibility: clean(firstField(fields, ["booking_visibility", "visibility", "approved_client_visibility"]), 40),
    access_folder: clean(firstField(fields, ["access_folder", "model_access_folder", "model_folder"]), 40),
    requires_per_approval: booleanValue(firstField(fields, ["requires_per_approval"])),
    private_review_status: clean(firstField(fields, ["private_review_status", "visibility_review_status"]), 60),
  };
}

function searchableText(model = {}) {
  return [model.model_key, model.working_name, ...(model.search_aliases || [])].join(" ").toLowerCase();
}

function rankModel(model, query) {
  const q = query.toLowerCase();
  if (!q) return 10;
  if (String(model.model_key || "").toLowerCase() === q) return 0;
  if (String(model.working_name || "").toLowerCase() === q) return 1;
  if ((model.search_aliases || []).some((alias) => String(alias).toLowerCase() === q)) return 2;
  if (String(model.model_key || "").toLowerCase().includes(q)) return 3;
  if (String(model.working_name || "").toLowerCase().includes(q)) return 4;
  return 5;
}

async function listModels(request, env, fetchImpl) {
  const url = new URL(request.url);
  const q = clean(url.searchParams.get("q"), 120).toLowerCase();
  const requestedLimit = Number(url.searchParams.get("limit") || 60);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(120, Math.floor(requestedLimit))) : 60;
  const config = airtableConfig(env);
  const rows = [];
  let offset = "";

  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (offset) params.set("offset", offset);
    const result = await airtableFetch(env, config.modelsTable, { method: "GET" }, params, fetchImpl);
    if (!result.ok) return json({ ok: false, error: "model_source_unavailable" }, result.status === 401 || result.status === 403 ? 502 : 503);
    const records = Array.isArray(result.data?.records) ? result.data.records : [];
    rows.push(...records.map(projectKenjiAdminModelRecord).filter((item) => item.model_key || item.working_name));
    offset = clean(result.data?.offset, 200);
  } while (offset && rows.length < MAX_LIST_SCAN);

  const items = rows
    .filter((item) => !q || searchableText(item).includes(q))
    .sort((left, right) => rankModel(left, q) - rankModel(right, q) || left.working_name.localeCompare(right.working_name))
    .slice(0, limit);

  return json({
    ok: true,
    source: "airtable_models",
    policy_version: "KENJI_MODEL_ACCESS_V1",
    legacy_source: "/kenji-model-keyword-copy",
    canonical_surface: "/internal/admin/kenji#models",
    items,
    count: items.length,
  });
}

function isCustomerSafeText(value, max) {
  const text = clean(value, max + 1);
  if (!text || text.length > max) return false;
  return !(
    /(?:\b0\d{8,9}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|line\s*(?:id|oa)|telegram|เบอร์(?:โทร)?|อีเมล|ไลน์ส่วนตัว)/i.test(text) ||
    /(?:availability|available|schedule|ตาราง(?:งาน|คิว)|ว่าง(?:วันนี้|คืนนี้|พรุ่งนี้|ไหม)?|เช็กคิว|ราคา|ค่าตัว|เรท|\brate\b|\bprice\b)/i.test(text) ||
    /(?:airtable|record[_\s-]?id|admin[_\s-]?note|internal[_\s-]?token|secret|authorization|bearer|r2[_\s-]?(?:key|url))/i.test(text)
  );
}

function normalizeEnum(value, allowed, fallback = "") {
  const normalized = normalizeToken(value);
  return allowed.has(normalized) ? normalized : fallback;
}

function parseDraft(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  const modelId = clean(body.model_id, 80);
  const modelKey = clean(body.model_key, 64);
  const workingName = clean(body.working_name, 120);
  const aliases = uniqueList(body.search_aliases || body.aliases);
  const customerSafeInfo = clean(body.customer_safe_info, 800);
  const customerSafeRemark = clean(body.customer_safe_remark, 500);
  const tier = normalizeEnum(body.model_tier, ALLOWED_TIERS, "public");
  const proposedVisibility = normalizeEnum(body.proposed_visibility || body.booking_visibility, ALLOWED_VISIBILITY, tier === "public" ? "public" : tier);
  const allowedCustomerScope = uniqueList(body.allowed_customer_scope, 4, 30).map(normalizeToken).filter((item) => ALLOWED_CUSTOMER_SCOPE.has(item));
  const restrictedScope = uniqueList(body.restricted_scope, 6, 30).map(normalizeToken).filter((item) => ALLOWED_RESTRICTED_SCOPE.has(item));

  if (modelId && !/^rec[A-Za-z0-9]{14,}$/.test(modelId)) return { ok: false, error: "invalid_model_id" };
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(modelKey)) return { ok: false, error: "invalid_model_key" };
  if (!workingName) return { ok: false, error: "working_name_required" };
  if (customerSafeInfo && !isCustomerSafeText(customerSafeInfo, 800)) return { ok: false, error: "customer_safe_info_failed_guard" };
  if (customerSafeRemark && !isCustomerSafeText(customerSafeRemark, 500)) return { ok: false, error: "customer_safe_remark_failed_guard" };

  return {
    ok: true,
    draft: {
      model_id: modelId || null,
      model_key: modelKey,
      working_name: workingName,
      search_aliases: aliases,
      customer_safe_info: customerSafeInfo,
      customer_safe_remark: customerSafeRemark,
      model_tier: tier,
      current_status: clean(body.status, 40),
      proposed_visibility: proposedVisibility,
      allowed_customer_scope: allowedCustomerScope,
      restricted_scope: restrictedScope,
      requires_per_approval: true,
      source: "kenji_admin_models_v1",
      legacy_source: "/kenji-model-keyword-copy",
    },
  };
}

function escapeFormulaValue(value) {
  return clean(value, 200).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function hashIdempotencyKey(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function findReviewByRequestId(env, requestId, fetchImpl) {
  const config = airtableConfig(env);
  const fields = reviewFields(env);
  const params = new URLSearchParams();
  params.set("pageSize", "1");
  params.set("filterByFormula", `{${fields.requestId}}="${escapeFormulaValue(requestId)}"`);
  const result = await airtableFetch(env, config.reviewTable, { method: "GET" }, params, fetchImpl);
  if (!result.ok) return result;
  return { ok: true, record: result.data?.records?.[0] || null };
}

async function createDraft(request, env, options, fetchImpl) {
  const idempotencyKey = clean(request.headers.get("Idempotency-Key"), 180);
  if (!idempotencyKey || idempotencyKey.length < 8) return json({ ok: false, error: "idempotency_key_required" }, 400);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const parsed = parseDraft(body);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  const config = airtableConfig(env);
  if (!config.apiKey || !config.baseId) return json({ ok: false, error: "missing_airtable_env" }, 503);
  const fields = reviewFields(env);
  const digest = await hashIdempotencyKey(idempotencyKey);
  const requestId = `kenji_model_profile_req_${digest.slice(0, 24)}`;
  const existing = await findReviewByRequestId(env, requestId, fetchImpl);
  if (!existing.ok) return json({ ok: false, error: "review_source_unavailable" }, 503);
  if (existing.record) {
    return json({ ok: true, status: "pending_review", idempotent: true, request_id: requestId, record_id: existing.record.id || "" });
  }

  const actor = clean(options?.actor?.id || options?.actor || "admin", 100) || "admin";
  const now = new Date().toISOString();
  const draft = parsed.draft;
  const recordFields = {
    [fields.requestId]: requestId,
    [fields.requestType]: "kenji_model_profile",
    [fields.requestStatus]: "pending_review",
    [fields.requestedBy]: actor,
    [fields.requestedAt]: now,
    [fields.requestedVisibility]: draft.proposed_visibility,
    [fields.decisionNote]: "Kenji Admin Models tab · draft only; no rate or availability mutation",
    [fields.payloadJson]: JSON.stringify(draft),
  };
  if (draft.model_id) recordFields[fields.model] = [draft.model_id];

  const result = await airtableFetch(env, config.reviewTable, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields: recordFields }], typecast: true }),
  }, null, fetchImpl);
  if (!result.ok) {
    const status = result.status === 422 ? 503 : 502;
    return json({ ok: false, error: result.status === 422 ? "model_review_schema_not_ready" : "model_review_write_failed" }, status);
  }
  const record = result.data?.records?.[0] || {};
  return json({
    ok: true,
    status: "pending_review",
    request_id: requestId,
    record_id: record.id || "",
    model_id: draft.model_id,
    model_key: draft.model_key,
    production_mutated: false,
  }, 201);
}

export function isKenjiModelAdminRequest(path, method = "GET") {
  const verb = clean(method, 10).toUpperCase();
  return (
    (path === KENJI_MODEL_ADMIN_BASE_PATH && verb === "GET") ||
    (path === KENJI_MODEL_ADMIN_DRAFT_PATH && verb === "POST")
  );
}

export async function handleKenjiModelAdminRequest(request, env = {}, options = {}) {
  const path = new URL(request.url).pathname.replace(/\/+$/g, "") || "/";
  const method = request.method.toUpperCase();
  if (!isKenjiModelAdminRequest(path, method)) return json({ ok: false, error: "not_found" }, 404);
  const fetchImpl = options.fetchImpl || fetch;
  if (path === KENJI_MODEL_ADMIN_BASE_PATH) return listModels(request, env, fetchImpl);
  return createDraft(request, env, options, fetchImpl);
}
