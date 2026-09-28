import {
  handleKenjiModelWorkflowRequest,
  isKenjiModelWorkflowRequest,
} from "./kenji-model-workflow.js";
import { resolveModelSalesOffer } from "../../shared/model-sales-control-v1.mjs";

export const KENJI_MODEL_ADMIN_BASE_PATH = "/v1/admin/kenji/models";
export const KENJI_MODEL_ADMIN_DRAFT_PATH = `${KENJI_MODEL_ADMIN_BASE_PATH}/draft`;
export const KENJI_MODEL_SALES_RESOLVE_PATH = `${KENJI_MODEL_ADMIN_BASE_PATH}/sales/resolve`;
export const KENJI_MODEL_SALES_RULES_PATH = `${KENJI_MODEL_ADMIN_BASE_PATH}/sales/rules`;

const AIRTABLE_API = "https://api.airtable.com/v0";
const MAX_LIST_SCAN = 500;
const ALLOWED_VISIBILITY = new Set(["public", "standard", "premium", "curated", "hidden", "internal"]);

const PROFILE_TIER_CHOICES = new Map([
  ["public", "Public"],
  ["gws", "GWs"],
  ["ems", "EMs"],
  ["private", "Private"],
]);
const CUSTOMER_SCOPE_CHOICES = new Map([
  ["all_active_members", "All Active Members"],
  ["vip", "VIP"],
  ["svip", "SVIP"],
  ["black_card", "Black Card"],
  ["potential", "#Potential"],
  ["per_review", "Per Review"],
  ["premium_active", "Premium Active"],
]);
const PHOTO_VISIBILITY_CHOICES = new Map([
  ["active_eligible_only", "Active eligible only"],
  ["vip_svip_black_card_only", "VIP/SVIP/Black Card only"],
  ["no_photo", "No photo"],
  ["per_review", "Per review"],
]);
const DEPOSIT_GATE_CHOICES = new Map([
  ["none", "None"],
  ["verified_deposit_per_approval", "Verified deposit + Per approval"],
  ["per_approval", "Per approval"],
]);
const PROFILE_STATUS_CHOICES = new Map([
  ["draft", "Draft"],
  ["review", "Review"],
  ["active", "Active"],
  ["archived", "Archived"],
]);

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizeToken(value) {
  return clean(value, 120)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
  return [...new Set(raw.map((item) => clean(item?.name || item, maxLen)).filter(Boolean))].slice(0, maxItems);
}

function booleanValue(value) {
  if (value === true || value === false) return value;
  return ["1", "true", "yes", "y"].includes(clean(value, 20).toLowerCase());
}

function numberValue(value, fallback = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1 ? Math.floor(numeric) : fallback;
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

function envName(env, keys, fallback) {
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const value = clean(env?.[key], 200);
    if (value) return value;
  }
  return fallback;
}

function airtableConfig(env = {}) {
  return {
    apiKey: clean(env.AIRTABLE_API_KEY, 1200),
    baseId: clean(env.AIRTABLE_BASE_ID, 200),
    modelsTable: envName(env, ["AIRTABLE_TABLE_MODELS_ID", "AIRTABLE_TABLE_MODELS"], "Models"),
    keywordProfilesTable: envName(
      env,
      ["AIRTABLE_TABLE_MODEL_KEYWORD_PROFILES_ID", "AIRTABLE_TABLE_MODEL_KEYWORD_PROFILES"],
      "MMD — Model Keyword Profiles"
    ),
    reviewTable: envName(
      env,
      ["AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS_ID", "AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS"],
      "MMD — Model Review Requests"
    ),
    offerRulesTable: envName(
      env,
      ["AIRTABLE_TABLE_MODEL_OFFER_RULES_ID", "AIRTABLE_TABLE_MODEL_OFFER_RULES"],
      "MMD — Model Offer Rules"
    ),
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
  if (!config.apiKey || !config.baseId) return { ok: false, status: 503, error: "missing_airtable_env" };
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(table)}`);
  if (query) for (const [key, value] of query.entries()) url.searchParams.append(key, value);
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

async function fetchAllRecords(env, table, fetchImpl) {
  const records = [];
  let offset = "";
  do {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (offset) params.set("offset", offset);
    const result = await airtableFetch(env, table, { method: "GET" }, params, fetchImpl);
    if (!result.ok) return result;
    records.push(...(Array.isArray(result.data?.records) ? result.data.records : []));
    offset = clean(result.data?.offset, 200);
  } while (offset && records.length < MAX_LIST_SCAN);
  return { ok: true, records: records.slice(0, MAX_LIST_SCAN) };
}

export function projectKenjiAdminModelRecord(record = {}) {
  const fields = record.fields || {};
  const modelId = clean(record.id, 80);
  const hasAdminPreview = Boolean(clean(firstField(fields, ["primary_image_key"]), 500));
  return {
    model_id: modelId,
    model_key: clean(firstField(fields, ["unique_key", "model_code", "model_lookup_key"]), 80),
    working_name: clean(firstField(fields, ["working_name", "Working Name", "display_name", "Display Name", "name", "Name"]), 120),
    identity_tier: clean(firstField(fields, ["model_tier", "tier"]), 40),
    model_status: clean(firstField(fields, ["status", "model_status"]), 40),
    booking_visibility: clean(firstField(fields, ["approved_client_visibility", "visibility", "client_visibility_status"]), 40),
    folder_name: clean(firstField(fields, ["folder_name", "access_folder", "model_folder"]), 120),
    has_admin_preview: hasAdminPreview,
    admin_preview_url: hasAdminPreview && modelId
      ? `${KENJI_MODEL_ADMIN_BASE_PATH}?preview_model_id=${encodeURIComponent(modelId)}`
      : "",
    requires_per_approval: booleanValue(firstField(fields, ["requires_per_approval"])),
    private_review_status: clean(firstField(fields, ["visibility_review_status", "private_review_status"]), 60),
  };
}

export function projectKenjiKeywordProfileRecord(record = {}) {
  const fields = record.fields || {};
  return {
    keyword_profile_id: clean(record.id, 80),
    linked_model_ids: uniqueList(firstField(fields, ["Model"]), 5, 80),
    model_key: clean(firstField(fields, ["model_key"]), 80),
    folder_name: clean(firstField(fields, ["folder_name"]), 120),
    working_name: clean(firstField(fields, ["working_name"]), 120),
    search_aliases: uniqueList(firstField(fields, ["search_aliases"]), 30, 80),
    customer_safe_info: clean(firstField(fields, ["customer_safe_info"]), 800),
    positive_sensitive_description: clean(firstField(fields, ["positive_sensitive_description"]), 800),
    customer_safe_remark: clean(firstField(fields, ["customer_safe_remark"]), 500),
    model_tier: clean(firstField(fields, ["model_tier"]), 40),
    allowed_customer_scope: uniqueList(firstField(fields, ["allowed_customer_scope"]), 8, 60),
    photo_visibility_policy: clean(firstField(fields, ["photo_visibility_policy"]), 80),
    deposit_preview_gate: clean(firstField(fields, ["deposit_preview_gate"]), 80),
    profile_status: clean(firstField(fields, ["status"]), 40),
    include_in_public_kenji: booleanValue(firstField(fields, ["include_in_public_kenji"])),
    source_ref: clean(firstField(fields, ["source_ref"]), 240),
    profile_version: numberValue(firstField(fields, ["version"]), 1),
    reviewed_at: clean(firstField(fields, ["reviewed_at"]), 80),
  };
}

function defaultProfileTier(identity = {}) {
  const identityTier = normalizeToken(identity.identity_tier);
  const visibility = normalizeToken(identity.booking_visibility);
  if (identityTier === "public" || visibility === "public") return "Public";
  return "Private";
}

function mergeIdentityAndProfile(identity = {}, profile = null) {
  const linkedModelId = profile?.linked_model_ids?.[0] || "";
  const modelId = identity.model_id || linkedModelId;
  return {
    model_id: modelId,
    keyword_profile_id: profile?.keyword_profile_id || "",
    profile_version: profile?.profile_version || 1,
    model_key: profile?.model_key || identity.model_key || "",
    working_name: profile?.working_name || identity.working_name || "",
    search_aliases: profile?.search_aliases || [],
    customer_safe_info: profile?.customer_safe_info || "",
    positive_sensitive_description: profile?.positive_sensitive_description || "",
    customer_safe_remark: profile?.customer_safe_remark || "",
    model_tier: profile?.model_tier || defaultProfileTier(identity),
    identity_tier: identity.identity_tier || "",
    model_status: identity.model_status || "",
    status: identity.model_status || "",
    profile_status: profile?.profile_status || "missing_profile",
    booking_visibility: identity.booking_visibility || "",
    folder_name: profile?.folder_name || identity.folder_name || "",
    access_folder: profile?.folder_name || identity.folder_name || "",
    has_admin_preview: Boolean(identity.has_admin_preview),
    admin_preview_url: identity.admin_preview_url || "",
    allowed_customer_scope: profile?.allowed_customer_scope || [],
    photo_visibility_policy: profile?.photo_visibility_policy || "Per review",
    deposit_preview_gate: profile?.deposit_preview_gate || "Per approval",
    include_in_public_kenji: Boolean(profile?.include_in_public_kenji),
    source_ref: profile?.source_ref || "",
    requires_per_approval: Boolean(identity.requires_per_approval),
    private_review_status: identity.private_review_status || "",
    reviewed_at: profile?.reviewed_at || "",
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

function primaryImageContentType(key, object) {
  const metadataType = clean(object?.httpMetadata?.contentType, 100).toLowerCase();
  if (/^image\/(?:jpeg|png|webp|gif|avif)$/.test(metadataType)) return metadataType;
  const lower = clean(key, 500).toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".avif")) return "image/avif";
  return "";
}

async function streamAdminPrimaryMedia(request, env, fetchImpl) {
  const url = new URL(request.url);
  const modelId = clean(url.searchParams.get("preview_model_id"), 80);
  if (!/^rec[A-Za-z0-9]{14,}$/.test(modelId)) return json({ ok: false, error: "invalid_preview_model_id" }, 400);
  if (!env.MMD_MODEL_ASSETS || typeof env.MMD_MODEL_ASSETS.get !== "function") {
    return json({ ok: false, error: "model_asset_store_unavailable" }, 503);
  }
  const config = airtableConfig(env);
  const modelsResult = await fetchAllRecords(env, config.modelsTable, fetchImpl);
  if (!modelsResult.ok) return json({ ok: false, error: "model_source_unavailable" }, 503);
  const record = modelsResult.records.find((item) => clean(item?.id, 80) === modelId);
  if (!record) return json({ ok: false, error: "model_not_found" }, 404);
  const key = clean(firstField(record.fields || {}, ["primary_image_key"]), 500);
  if (!key) return json({ ok: false, error: "primary_media_not_configured" }, 404);
  let object;
  try { object = await env.MMD_MODEL_ASSETS.get(key); }
  catch (_) { return json({ ok: false, error: "model_asset_store_unavailable" }, 503); }
  if (!object) return json({ ok: false, error: "primary_media_not_found" }, 404);
  const contentType = primaryImageContentType(key, object);
  if (!contentType) return json({ ok: false, error: "primary_media_type_not_allowed" }, 415);
  return new Response(object.body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, private",
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "X-MMD-Media-Scope": "admin-only",
    },
  });
}

async function listModels(request, env, fetchImpl) {
  const url = new URL(request.url);
  if (url.searchParams.get("preview_model_id")) return streamAdminPrimaryMedia(request, env, fetchImpl);
  const q = clean(url.searchParams.get("q"), 120).toLowerCase();
  const requestedLimit = Number(url.searchParams.get("limit") || 60);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(120, Math.floor(requestedLimit))) : 60;
  const config = airtableConfig(env);
  const modelsResult = await fetchAllRecords(env, config.modelsTable, fetchImpl);
  if (!modelsResult.ok) return json({ ok: false, error: "model_source_unavailable" }, modelsResult.status === 401 || modelsResult.status === 403 ? 502 : 503);
  const profilesResult = await fetchAllRecords(env, config.keywordProfilesTable, fetchImpl);
  if (!profilesResult.ok) return json({ ok: false, error: "keyword_profile_source_unavailable" }, profilesResult.status === 401 || profilesResult.status === 403 ? 502 : 503);

  const identities = modelsResult.records.map(projectKenjiAdminModelRecord).filter((item) => item.model_id && (item.model_key || item.working_name));
  const profiles = profilesResult.records.map(projectKenjiKeywordProfileRecord).filter((item) => item.keyword_profile_id && (item.model_key || item.working_name || item.linked_model_ids.length));
  const profileByModelId = new Map();
  const profileByKey = new Map();
  for (const profile of profiles) {
    for (const modelId of profile.linked_model_ids) if (!profileByModelId.has(modelId)) profileByModelId.set(modelId, profile);
    const key = profile.model_key.toLowerCase();
    if (key && !profileByKey.has(key)) profileByKey.set(key, profile);
  }
  const usedProfiles = new Set();
  const rows = identities.map((identity) => {
    const profile = profileByModelId.get(identity.model_id) || profileByKey.get(identity.model_key.toLowerCase()) || null;
    if (profile) usedProfiles.add(profile.keyword_profile_id);
    return mergeIdentityAndProfile(identity, profile);
  });
  for (const profile of profiles) {
    if (usedProfiles.has(profile.keyword_profile_id)) continue;
    const linkedIdentity = identities.find((item) => profile.linked_model_ids.includes(item.model_id));
    rows.push(mergeIdentityAndProfile(linkedIdentity || {}, profile));
  }
  const items = rows
    .filter((item) => !q || searchableText(item).includes(q))
    .sort((left, right) => rankModel(left, q) - rankModel(right, q) || left.working_name.localeCompare(right.working_name))
    .slice(0, limit);
  return json({
    ok: true,
    source: { identity: "airtable_models", keyword_content: "airtable_model_keyword_profiles" },
    policy_version: "KENJI_MODEL_ACCESS_V1",
    legacy_source: "/kenji-model-keyword-copy",
    canonical_surface: "/internal/admin/kenji#models",
    items,
    count: items.length,
  });
}

function stripNegatedPolicyPhrases(value) {
  return clean(value, 1600)
    .replace(/(?:ห้าม|ไม่ให้|อย่า|ไม่ควร)\s*(?:เปิดเผย|บอก|แจ้ง|ส่ง)?\s*(?:ราคา|ค่าตัว|เรท|คิว|เบอร์(?:โทร)?|ไลน์|line|telegram|อีเมล|email)/gi, "")
    .replace(/(?:never|do\s+not|don't)\s*(?:show|share|tell|send)?\s*(?:price|rate|availability|schedule|phone|line|telegram|email)/gi, "")
    .trim();
}

function containsForbiddenOperationalText(value) {
  const text = stripNegatedPolicyPhrases(value);
  if (!text) return false;
  return Boolean(
    /(?:\b0\d{8,9}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|line\s*(?:id|oa)|telegram|เบอร์(?:โทร)?|อีเมล|ไลน์ส่วนตัว)/i.test(text) ||
    /(?:\b(?:THB|บาท)\s*\d|\d[\d,]*(?:\.\d+)?\s*(?:THB|บาท)|(?:ราคา|ค่าตัว|เรท|\brate\b|\bprice\b)\s*[:=]?\s*\d)/i.test(text) ||
    /(?:availability|available\s+(?:today|tonight|tomorrow)|schedule|ตาราง(?:งาน|คิว)|ว่าง(?:วันนี้|คืนนี้|พรุ่งนี้)|(?:วันนี้|คืนนี้|พรุ่งนี้)[^.\n]{0,30}ว่าง|เช็กคิว\s*[:=]?\s*\w+)/i.test(text) ||
    /(?:airtable|record[_\s-]?id|admin[_\s-]?note|internal[_\s-]?token|secret|authorization|bearer|r2[_\s-]?(?:key|url))/i.test(text)
  );
}

function isCustomerSafeText(value, max) {
  const text = clean(value, max + 1);
  return Boolean(text) && text.length <= max && !containsForbiddenOperationalText(text);
}

function canonicalChoice(value, choices, fallback, error) {
  const token = normalizeToken(value);
  if (!token) return { ok: true, value: fallback };
  const canonical = choices.get(token);
  return canonical ? { ok: true, value: canonical } : { ok: false, error };
}

function parseVisibility(value, profileTier) {
  const token = normalizeToken(value);
  if (!token) return { ok: true, value: profileTier === "Public" ? "public" : "curated" };
  return ALLOWED_VISIBILITY.has(token) ? { ok: true, value: token } : { ok: false, error: "invalid_proposed_visibility" };
}

function canonicalCustomerScopes(value) {
  const raw = uniqueList(value, 8, 60);
  const output = [];
  for (const item of raw) {
    const canonical = CUSTOMER_SCOPE_CHOICES.get(normalizeToken(item));
    if (!canonical) return { ok: false, error: "invalid_allowed_customer_scope" };
    if (!output.includes(canonical)) output.push(canonical);
  }
  return { ok: true, value: output };
}

function parseDraft(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  const modelId = clean(body.model_id, 80);
  const keywordProfileId = clean(body.keyword_profile_id, 80);
  const modelKey = clean(body.model_key, 64);
  const workingName = clean(body.working_name, 120);
  const aliases = uniqueList(body.search_aliases || body.aliases, 30, 80);
  const customerSafeInfo = clean(body.customer_safe_info, 800);
  const positiveSensitiveDescription = clean(body.positive_sensitive_description, 800);
  const customerSafeRemark = clean(body.customer_safe_remark, 500);
  const folderName = clean(body.folder_name || body.access_folder, 120);
  const sourceRef = clean(body.source_ref, 240);
  const currentProfileStatus = clean(body.profile_status, 40);
  const expectedProfileVersion = body.expected_profile_version == null || body.expected_profile_version === ""
    ? null
    : numberValue(body.expected_profile_version, 0);

  if (modelId && !/^rec[A-Za-z0-9]{14,}$/.test(modelId)) return { ok: false, error: "invalid_model_id" };
  if (keywordProfileId && !/^rec[A-Za-z0-9]{14,}$/.test(keywordProfileId)) return { ok: false, error: "invalid_keyword_profile_id" };
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(modelKey)) return { ok: false, error: "invalid_model_key" };
  if (!workingName) return { ok: false, error: "working_name_required" };
  if (body.expected_profile_version != null && body.expected_profile_version !== "" && expectedProfileVersion < 1) return { ok: false, error: "invalid_expected_profile_version" };

  const tierResult = canonicalChoice(body.model_tier, PROFILE_TIER_CHOICES, "Private", "invalid_model_tier");
  if (!tierResult.ok) return tierResult;
  const visibilityResult = parseVisibility(body.proposed_visibility || body.booking_visibility, tierResult.value);
  if (!visibilityResult.ok) return visibilityResult;
  const scopeResult = canonicalCustomerScopes(body.allowed_customer_scope);
  if (!scopeResult.ok) return scopeResult;
  const photoResult = canonicalChoice(body.photo_visibility_policy, PHOTO_VISIBILITY_CHOICES, "Per review", "invalid_photo_visibility_policy");
  if (!photoResult.ok) return photoResult;
  const depositResult = canonicalChoice(body.deposit_preview_gate, DEPOSIT_GATE_CHOICES, "Per approval", "invalid_deposit_preview_gate");
  if (!depositResult.ok) return depositResult;
  const currentStatusResult = currentProfileStatus
    ? canonicalChoice(currentProfileStatus, PROFILE_STATUS_CHOICES, "Draft", "invalid_profile_status")
    : { ok: true, value: "Draft" };
  if (!currentStatusResult.ok) return currentStatusResult;

  if (customerSafeInfo && !isCustomerSafeText(customerSafeInfo, 800)) return { ok: false, error: "customer_safe_info_failed_guard" };
  if (customerSafeRemark && !isCustomerSafeText(customerSafeRemark, 500)) return { ok: false, error: "customer_safe_remark_failed_guard" };
  if (positiveSensitiveDescription && containsForbiddenOperationalText(positiveSensitiveDescription)) return { ok: false, error: "positive_sensitive_description_failed_guard" };
  if (sourceRef && /https?:\/\/|authorization|bearer|secret|token/i.test(sourceRef)) return { ok: false, error: "source_ref_failed_guard" };

  return {
    ok: true,
    draft: {
      target: "model_keyword_profile",
      model_id: modelId || null,
      keyword_profile_id: keywordProfileId || null,
      expected_profile_version: expectedProfileVersion,
      model_key: modelKey,
      folder_name: folderName,
      working_name: workingName,
      search_aliases: aliases,
      customer_safe_info: customerSafeInfo,
      positive_sensitive_description: positiveSensitiveDescription,
      customer_safe_remark: customerSafeRemark,
      model_tier: tierResult.value,
      proposed_visibility: visibilityResult.value,
      allowed_customer_scope: scopeResult.value,
      photo_visibility_policy: photoResult.value,
      deposit_preview_gate: depositResult.value,
      current_profile_status: currentStatusResult.value,
      proposed_profile_status: "Review",
      include_in_public_kenji: booleanValue(body.include_in_public_kenji),
      source_ref: sourceRef,
      requires_per_approval: true,
      source: "kenji_admin_models_v2",
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
  try { body = await request.json(); }
  catch (_) { return json({ ok: false, error: "invalid_json" }, 400); }
  const parsed = parseDraft(body);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  const config = airtableConfig(env);
  if (!config.apiKey || !config.baseId) return json({ ok: false, error: "missing_airtable_env" }, 503);
  const fields = reviewFields(env);
  const digest = await hashIdempotencyKey(idempotencyKey);
  const requestId = `kenji_model_keyword_req_${digest.slice(0, 24)}`;
  const existing = await findReviewByRequestId(env, requestId, fetchImpl);
  if (!existing.ok) return json({ ok: false, error: "review_source_unavailable" }, 503);
  if (existing.record) {
    return json({ ok: true, status: "pending_review", idempotent: true, request_id: requestId, record_id: existing.record.id || "" });
  }

  const actor = clean(options?.actor?.id || options?.actor || request.headers.get("x-mmd-admin-actor") || "admin", 100) || "admin";
  const now = new Date().toISOString();
  const draft = parsed.draft;
  const recordFields = {
    [fields.requestId]: requestId,
    [fields.requestType]: "kenji_model_keyword_profile",
    [fields.requestStatus]: "pending_review",
    [fields.requestedBy]: actor,
    [fields.requestedAt]: now,
    [fields.requestedVisibility]: draft.proposed_visibility,
    [fields.decisionNote]: "Kenji Admin Models tab · target existing Model Keyword Profiles; draft only; no rate or availability mutation",
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
    keyword_profile_id: draft.keyword_profile_id,
    model_key: draft.model_key,
    production_mutated: false,
  }, 201);
}


const OWNER_SALES_AUDIENCES = new Set(["Public Member", "Elite", "Red Card", "Standard", "Premium", "VIP / Black Card", "SVIP", "Per Review", "Exact Client"]);
const OWNER_SALES_SCHEDULES = new Set(["Always", "Date range", "Date + time range", "Weekly recurring"]);
const OWNER_SALES_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

function selectText(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return clean(value.name || value.value, 120);
  return clean(value, 120);
}

function multiText(value) {
  const raw = Array.isArray(value) ? value : [];
  return raw.map((item) => selectText(item)).filter(Boolean);
}

function projectOwnerSalesRule(record = {}) {
  const fields = record.fields || {};
  return {
    rule_id: clean(record.id, 80),
    offer_rule_key: clean(fields.offer_rule_key, 180),
    model_ids: Array.isArray(fields.Model) ? fields.Model.map((value) => clean(value?.id || value, 80)).filter(Boolean) : [],
    model_key: clean(fields.model_key, 160),
    client_identity_key: clean(fields.client_identity_key, 180),
    offer_type: selectText(fields.offer_type),
    audience_scope: multiText(fields.audience_scope),
    partner_source_rate_thb: Number.isFinite(Number(fields.partner_source_rate_thb)) ? Number(fields.partner_source_rate_thb) : null,
    customer_sell_rate_thb: Number.isFinite(Number(fields.customer_sell_rate_thb)) ? Number(fields.customer_sell_rate_thb) : null,
    sales_visibility: selectText(fields.sales_visibility) || "off",
    price_visibility: selectText(fields.price_visibility) || "Per approval only",
    schedule_type: selectText(fields.schedule_type) || "Always",
    effective_from_at: clean(fields.effective_from_at || fields.effective_from, 100) || null,
    effective_until_at: clean(fields.effective_until_at || fields.effective_until, 100) || null,
    days_of_week: multiText(fields.days_of_week),
    start_time_local: clean(fields.start_time_local, 20) || null,
    end_time_local: clean(fields.end_time_local, 20) || null,
    priority: Number.isFinite(Number(fields.priority)) ? Number(fields.priority) : 0,
    requires_per_approval: normalizeToken(selectText(fields.requires_per_approval)) === "yes",
    status: selectText(fields.status) || "Draft",
    source_actor_type: selectText(fields.source_actor_type),
    source_partner_ref: clean(fields.source_partner_ref, 100) || null,
    change_reason: clean(fields.change_reason, 1200),
    updated_by: clean(fields.updated_by || fields.reviewed_by, 120),
    updated_at: clean(fields.updated_at || fields.reviewed_at, 100) || record.createdTime || null,
    version: Math.max(1, Number(fields.version) || 1),
  };
}

async function listOwnerSalesRules(request, env, fetchImpl) {
  const url = new URL(request.url);
  const modelId = clean(url.searchParams.get("model_id"), 80);
  const modelKey = clean(url.searchParams.get("model_key"), 160).toLowerCase();
  if (!modelId && !modelKey) return json({ ok: false, error: "model_identity_required" }, 400);
  const config = airtableConfig(env);
  const result = await fetchAllRecords(env, config.offerRulesTable, fetchImpl);
  if (!result.ok) return json({ ok: false, error: "model_offer_rules_unavailable" }, 503);
  const items = result.records
    .map(projectOwnerSalesRule)
    .filter((rule) => (modelId && rule.model_ids.includes(modelId)) || (modelKey && rule.model_key.toLowerCase() === modelKey))
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")) || b.version - a.version);
  return json({ ok: true, authority: "model_sales_control_v1", items, count: items.length });
}

function ownerSalesBody(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  const modelId = clean(body.model_id, 80);
  const modelKey = clean(body.model_key, 160);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(modelId) || !modelKey) return { ok: false, error: "model_identity_required" };

  const audiences = uniqueList(body.audience_scope, 12, 80);
  if (!audiences.length || audiences.some((value) => !OWNER_SALES_AUDIENCES.has(value))) return { ok: false, error: "invalid_audience_scope" };
  const scheduleType = clean(body.schedule_type || "Always", 80);
  if (!OWNER_SALES_SCHEDULES.has(scheduleType)) return { ok: false, error: "invalid_schedule_type" };
  const days = uniqueList(body.days_of_week, 7, 10);
  if (days.some((value) => !OWNER_SALES_DAYS.has(value))) return { ok: false, error: "invalid_days_of_week" };
  if (scheduleType === "Weekly recurring" && !days.length) return { ok: false, error: "days_of_week_required" };

  const visibility = normalizeToken(body.sales_visibility || "off");
  if (!["on", "off"].includes(visibility)) return { ok: false, error: "invalid_sales_visibility" };
  const priceMode = normalizeToken(body.price_visibility || "per_approval_only");
  const priceVisibility = priceMode === "visible" ? "visible" : "Per approval only";

  const customerRate = Number(body.customer_sell_rate_thb);
  if (!Number.isFinite(customerRate) || customerRate < 0 || customerRate > 1000000) return { ok: false, error: "invalid_customer_sell_rate" };
  const sourceRate = body.partner_source_rate_thb == null || body.partner_source_rate_thb === "" ? null : Number(body.partner_source_rate_thb);
  if (sourceRate != null && (!Number.isFinite(sourceRate) || sourceRate < 0 || sourceRate > 1000000)) return { ok: false, error: "invalid_partner_source_rate" };

  const startTime = clean(body.start_time_local, 20);
  const endTime = clean(body.end_time_local, 20);
  if ((startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) || (endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime))) {
    return { ok: false, error: "invalid_local_time" };
  }
  const effectiveFrom = clean(body.effective_from_at, 100);
  const effectiveUntil = clean(body.effective_until_at, 100);
  if (effectiveFrom && !Number.isFinite(Date.parse(effectiveFrom))) return { ok: false, error: "invalid_effective_from" };
  if (effectiveUntil && !Number.isFinite(Date.parse(effectiveUntil))) return { ok: false, error: "invalid_effective_until" };
  if (effectiveFrom && effectiveUntil && Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)) return { ok: false, error: "invalid_schedule_window" };

  return {
    ok: true,
    value: {
      model_id: modelId,
      model_key: modelKey,
      offer_type: clean(body.offer_type || "Default", 80),
      audience_scope: audiences,
      partner_source_rate_thb: sourceRate,
      customer_sell_rate_thb: customerRate,
      sales_visibility: visibility,
      price_visibility: priceVisibility,
      schedule_type: scheduleType,
      effective_from_at: effectiveFrom || null,
      effective_until_at: effectiveUntil || null,
      days_of_week: days,
      start_time_local: startTime || null,
      end_time_local: endTime || null,
      priority: Math.max(0, Math.min(1000, Math.trunc(Number(body.priority) || 0))),
      requires_per_approval: body.requires_per_approval === true,
      activate: body.activate === true,
      change_reason: clean(body.change_reason, 1200),
    },
  };
}

async function createOwnerSalesRule(request, env, options, fetchImpl) {
  const key = clean(request.headers.get("Idempotency-Key"), 180);
  if (key.length < 8) return json({ ok: false, error: "idempotency_key_required" }, 400);
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: "invalid_json" }, 400); }
  const parsed = ownerSalesBody(body);
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400);

  const config = airtableConfig(env);
  if (!config.apiKey || !config.baseId) return json({ ok: false, error: "missing_airtable_env" }, 503);
  const digest = await hashIdempotencyKey(`owner-sales:${key}`);
  const ruleKey = `owner-sales-${digest.slice(0, 24)}`;
  const params = new URLSearchParams();
  params.set("pageSize", "2");
  params.set("filterByFormula", `{offer_rule_key}="${escapeFormulaValue(ruleKey)}"`);
  const existing = await airtableFetch(env, config.offerRulesTable, { method: "GET" }, params, fetchImpl);
  if (!existing.ok) return json({ ok: false, error: "model_offer_rules_unavailable" }, 503);
  if ((existing.data?.records || []).length === 1) {
    return json({ ok: true, idempotent: true, rule: projectOwnerSalesRule(existing.data.records[0]) });
  }
  if ((existing.data?.records || []).length > 1) return json({ ok: false, error: "sales_rule_idempotency_conflict" }, 409);

  const actor = clean(options?.actor?.id || request.headers.get("x-mmd-admin-actor") || "admin", 100);
  const now = new Date().toISOString();
  const v = parsed.value;
  const fields = {
    offer_rule_key: ruleKey,
    Model: [v.model_id],
    model_key: v.model_key,
    offer_type: v.offer_type,
    audience_scope: v.audience_scope,
    partner_source_rate_thb: v.partner_source_rate_thb,
    customer_sell_rate_thb: v.customer_sell_rate_thb,
    sales_visibility: v.sales_visibility,
    price_visibility: v.price_visibility,
    schedule_type: v.schedule_type,
    effective_from_at: v.effective_from_at,
    effective_until_at: v.effective_until_at,
    days_of_week: v.days_of_week,
    start_time_local: v.start_time_local,
    end_time_local: v.end_time_local,
    priority: v.priority,
    requires_per_approval: v.requires_per_approval ? "Yes" : "No",
    status: v.activate ? "Active" : "Review",
    internal_only: "Yes",
    source_actor_type: "owner",
    change_reason: v.change_reason || (v.activate ? "Owner activated Model Sales Control rule." : "Owner submitted Model Sales Control review."),
    reviewed_by: v.activate ? actor : null,
    reviewed_at: v.activate ? now : null,
    updated_by: actor,
    updated_at: now,
    notify_status: "pending",
    version: 1,
  };
  Object.keys(fields).forEach((name) => { if (fields[name] == null || fields[name] === "") delete fields[name]; });

  const result = await airtableFetch(env, config.offerRulesTable, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  }, null, fetchImpl);
  if (!result.ok) return json({ ok: false, error: "sales_rule_write_failed" }, result.status === 422 ? 503 : 502);
  const record = result.data?.records?.[0];
  if (!record) return json({ ok: false, error: "sales_rule_write_failed" }, 502);
  return json({
    ok: true,
    status: v.activate ? "Active" : "Review",
    sellability_mutated: v.activate,
    rule: projectOwnerSalesRule(record),
  }, 201);
}

async function resolveSalesOffer(request, env, fetchImpl) {
  let body;
  try { body = await request.json(); }
  catch (_) { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_body" }, 400);
  }
  const modelId = clean(body.model_id, 80);
  const modelKey = clean(body.model_key, 160);
  if (!modelId && !modelKey) return json({ ok: false, error: "model_identity_required" }, 400);
  if (!clean(body.requested_at, 100)) return json({ ok: false, error: "requested_at_required" }, 400);

  const config = airtableConfig(env);
  const rulesResult = await fetchAllRecords(env, config.offerRulesTable, fetchImpl);
  if (!rulesResult.ok) {
    return json({ ok: false, error: "model_offer_rules_unavailable" }, rulesResult.status === 401 || rulesResult.status === 403 ? 502 : 503);
  }

  const resolved = resolveModelSalesOffer({
    ...body,
    rules: rulesResult.records,
  });
  return json({
    ...resolved,
    source: "airtable_model_offer_rules",
    authority: "model_sales_control_v1",
    production_mutated: false,
  });
}

export function isKenjiModelAdminRequest(path, method = "GET") {
  const normalized = (clean(path, 500).replace(/\/+$/g, "") || "/");
  const verb = clean(method, 10).toUpperCase();
  if (isKenjiModelWorkflowRequest(normalized, verb)) return true;
  return (
    (normalized === KENJI_MODEL_ADMIN_BASE_PATH && verb === "GET") ||
    (normalized === KENJI_MODEL_ADMIN_DRAFT_PATH && verb === "POST") ||
    (normalized === KENJI_MODEL_SALES_RESOLVE_PATH && verb === "POST") ||
    (normalized === KENJI_MODEL_SALES_RULES_PATH && (verb === "GET" || verb === "POST"))
  );
}

export async function handleKenjiModelAdminRequest(request, env = {}, options = {}) {
  const path = new URL(request.url).pathname.replace(/\/+$/g, "") || "/";
  const method = request.method.toUpperCase();
  if (!isKenjiModelAdminRequest(path, method)) return json({ ok: false, error: "not_found" }, 404);
  if (isKenjiModelWorkflowRequest(path, method)) return handleKenjiModelWorkflowRequest(request, env, options);
  const fetchImpl = options.fetchImpl || fetch;
  if (path === KENJI_MODEL_ADMIN_BASE_PATH) return listModels(request, env, fetchImpl);
  if (path === KENJI_MODEL_SALES_RESOLVE_PATH) return resolveSalesOffer(request, env, fetchImpl);
  if (path === KENJI_MODEL_SALES_RULES_PATH) {
    return method === "GET"
      ? listOwnerSalesRules(request, env, fetchImpl)
      : createOwnerSalesRule(request, env, options, fetchImpl);
  }
  return createDraft(request, env, options, fetchImpl);
}
