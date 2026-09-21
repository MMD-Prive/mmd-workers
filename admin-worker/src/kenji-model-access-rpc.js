import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";
import { resolveModelSalesOffer } from "../../shared/model-sales-control-v1.mjs";

export const KENJI_MODEL_ACCESS_POLICY_VERSION = "KENJI_MODEL_ACCESS_V1";
export const KENJI_MODEL_ACCESS_RPC_PATH = "/v1/internal/kenji/model-access";

const AIRTABLE_API = "https://api.airtable.com/v0";
const ENTITLEMENT_TABLE_FALLBACK = "MMD — Member Entitlements";
const ENTITLEMENT_LINE_FIELD_FALLBACK = "line_user_id";
const MODEL_OFFER_RULES_TABLE_FALLBACK = "MMD — Model Offer Rules";
const CANONICAL_PRIVATE_FOLDERS = new Set(["standard", "premium", "vip", "exclusive"]);
const PRIVATE_CAPABILITIES = new Set(["private_standard", "private_premium", "vip", "svip", "black_card"]);
const PROTECTED_ENVELOPES = new Set(["vip", "svip", "black_card"]);
const RENEWAL_DUE_LIFECYCLES = new Set(["grace", "expired"]);
const BLOCKED_MODEL_STATUS = new Set(["inactive", "blocked", "suspended", "archived", "disabled", "banned", "off", "retired"]);
const MODEL_CODE_FIELDS = ["model_code", "model_lookup_key", "unique_key"];
const MODEL_WORKING_NAME_FIELDS = ["working_name", "Working Name", "display_name", "Display Name"];
const APPROVAL_MEMBER_FIELDS = ["member_record_id", "member_id", "member_email", "line_user_id"];

class KenjiModelAccessSourceError extends Error {
  constructor(message = "model_access_source_unavailable") {
    super(message);
    this.name = "KenjiModelAccessSourceError";
  }
}

function clean(value, max = 240) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function token(value) {
  return clean(value).toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function uniqueRecords(records = []) {
  const seen = new Set();
  return records.filter((record) => {
    const id = clean(record?.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function fieldValue(fields = {}, names = []) {
  for (const name of names) {
    const value = clean(fields?.[name]);
    if (value) return value;
  }
  return "";
}

function formulaString(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseFolderList(value) {
  const raw = Array.isArray(value) ? value : clean(value).split(/[\n,]/);
  return [...new Set(raw.map(token).filter((item) => CANONICAL_PRIVATE_FOLDERS.has(item)))];
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(clean(value, 1200));
    return url.protocol === "https:" ? url.toString() : "";
  } catch (_) {
    return "";
  }
}

function isCustomerSafeText(value, max = 500) {
  const text = clean(value, max + 1);
  if (!text || text.length > max) return false;
  return !(
    /(?:\b0\d{8,9}\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/|line\s*(?:id|oa)|telegram|เบอร์(?:โทร)?|อีเมล|ไลน์ส่วนตัว)/i.test(text) ||
    /(?:availability|available|schedule|ตาราง(?:งาน|คิว)|ว่าง(?:วันนี้|คืนนี้|พรุ่งนี้|ไหม)?|เช็กคิว)/i.test(text) ||
    /(?:airtable|record[_\s-]?id|admin[_\s-]?note|internal|secret|token|authorization|bearer)/i.test(text)
  );
}

// Compatibility classifier only. Authorization below never uses package/tier labels.
export function classifyKenjiModelPackage(value) {
  const valueToken = token(value);
  if (["guest", "guest_pass", "trial", "trial_7d", "7_days_guest_pass"].includes(valueToken)) return { cohort: "guest_trial", mode: "website_only", folders: [] };
  if (["membership", "red_card"].includes(valueToken)) return { cohort: valueToken, mode: "public_models", folders: [] };
  if (["standard", "standard_package"].includes(valueToken)) return { cohort: "standard", mode: "package", folders: ["standard"] };
  if (["premium", "premium_package"].includes(valueToken)) return { cohort: "premium", mode: "package", folders: ["standard", "premium"] };
  if (["gws", "ems"].includes(valueToken)) return { cohort: valueToken, mode: "signal", folders: [] };
  if (valueToken === "vip") return { cohort: "vip", mode: "curated", folders: [] };
  if (["svip", "s_vip", "super_vip"].includes(valueToken)) return { cohort: "svip", mode: "curated", folders: [] };
  if (valueToken === "black_card") return { cohort: "black_card", mode: "package", folders: ["standard", "premium", "vip", "exclusive"] };
  return { cohort: "unknown", mode: "blocked", folders: [] };
}

export function projectKenjiSafeModel(record = {}) {
  const fields = record.fields || {};
  const modelCode = fieldValue(fields, MODEL_CODE_FIELDS);
  const workingName = fieldValue(fields, MODEL_WORKING_NAME_FIELDS);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(modelCode) || !isCustomerSafeText(workingName, 120)) return null;
  const projected = { model_code: modelCode, working_name: workingName };
  const summary = fieldValue(fields, ["customer_safe_summary", "approved_profile_summary", "public_safe_summary"]);
  const imageUrl = safeHttpsUrl(fieldValue(fields, ["customer_safe_image_url", "approved_image_url"]));
  if (isCustomerSafeText(summary, 500)) projected.summary = summary;
  if (imageUrl) projected.image_url = imageUrl;
  return projected;
}

function modelFolder(record = {}) {
  const folder = token(fieldValue(record.fields || {}, ["access_folder", "model_access_folder", "model_folder"]));
  return CANONICAL_PRIVATE_FOLDERS.has(folder) ? folder : "";
}

function modelAccessClass(record = {}) {
  const fields = record.fields || {};
  const visibility = token(fieldValue(fields, ["booking_visibility", "visibility"]));
  const status = token(fieldValue(fields, ["status", "model_status"]));
  if (BLOCKED_MODEL_STATUS.has(status) || status !== "active") return { active: false, visibility: "", folder: "" };
  if (visibility === "public") return { active: true, visibility: "public", folder: "" };
  const folder = modelFolder(record);
  if (visibility === "private" && folder) return { active: true, visibility: "private", folder };
  return { active: false, visibility: "", folder: "" };
}

function canonicalEntitlementTable(env = {}) {
  return clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || ENTITLEMENT_TABLE_FALLBACK);
}

function canonicalEntitlementLineField(env = {}) {
  return clean(env.AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD || ENTITLEMENT_LINE_FIELD_FALLBACK);
}

async function airtableQueryExact(env, tableName, field, value, fetchImpl = fetch, limit = 5) {
  const apiKey = clean(env.AIRTABLE_API_KEY, 1000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 200);
  if (!apiKey || !baseId || !tableName || !field || !value) throw new KenjiModelAccessSourceError();
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`);
  url.searchParams.set("pageSize", String(Math.max(1, Math.min(100, limit))));
  url.searchParams.set("maxRecords", String(Math.max(1, Math.min(100, limit))));
  url.searchParams.set("filterByFormula", `LOWER({${field}}&"")=${formulaString(clean(value).toLowerCase())}`);
  let response;
  try {
    response = await fetchImpl(url.toString(), { method: "GET", headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } });
  } catch (_) {
    throw new KenjiModelAccessSourceError();
  }
  if (response.status === 422 && tableName !== canonicalEntitlementTable(env)) return [];
  if (!response.ok) throw new KenjiModelAccessSourceError();
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.records) ? payload.records : [];
}

async function queryAcrossFields(env, tableName, fields, value, fetchImpl, limit = 5) {
  const records = [];
  for (const field of fields) records.push(...await airtableQueryExact(env, tableName, field, value, fetchImpl, limit));
  return uniqueRecords(records);
}

async function airtableListRecords(env, tableName, fetchImpl = fetch, maxRecords = 500) {
  const apiKey = clean(env.AIRTABLE_API_KEY, 1000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 200);
  if (!apiKey || !baseId || !tableName) throw new KenjiModelAccessSourceError();
  const records = [];
  let offset = "";
  do {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    let response;
    try {
      response = await fetchImpl(url.toString(), { method: "GET", headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } });
    } catch (_) {
      throw new KenjiModelAccessSourceError();
    }
    if (!response.ok) throw new KenjiModelAccessSourceError();
    const payload = await response.json().catch(() => ({}));
    records.push(...(Array.isArray(payload?.records) ? payload.records : []));
    offset = clean(payload?.offset, 200);
  } while (offset && records.length < maxRecords);
  return records.slice(0, maxRecords);
}

function currentlyValidCapabilities(snapshot = {}) {
  return new Set(Array.isArray(snapshot?.capability_state?.active) ? snapshot.capability_state.active.map(token) : []);
}

function privateRenewalDue(snapshot = {}) {
  if (snapshot?.member_blocked === true) return false;
  const rows = Array.isArray(snapshot?.entitlements) ? snapshot.entitlements : [];
  return rows.some((item) => PRIVATE_CAPABILITIES.has(token(item?.capability)) && RENEWAL_DUE_LIFECYCLES.has(token(item?.lifecycle)));
}

function canonicalPrivateFolders(envelope) {
  const value = token(envelope);
  if (value === "standard") return ["standard"];
  if (value === "premium") return ["standard", "premium"];
  return [];
}

function uniqueCanonicalField(records, names, transform = (value) => value) {
  const values = [...new Set(records.map((record) => transform(fieldValue(record?.fields || {}, names))).filter(Boolean))];
  return values.length === 1 ? values[0] : "";
}

function canonicalApprovalIdentity(records, lineUserId) {
  return {
    member_record_id: uniqueCanonicalField(records, ["member_record_id", "Member Record ID"]),
    member_id: uniqueCanonicalField(records, ["member_id", "Member ID"]),
    member_email: uniqueCanonicalField(records, ["member_email", "Member Email", "email", "Contact Email"], (value) => clean(value).toLowerCase()),
    line_user_id: lineUserId,
  };
}

async function resolveCuratedApproval(env, identity, cohort, fetchImpl) {
  const table = clean(env.AIRTABLE_TABLE_KENJI_MODEL_ACCESS_APPROVALS);
  if (!table) return { status: "blocked", folders: [] };
  const records = [];
  for (const field of APPROVAL_MEMBER_FIELDS) {
    const value = clean(identity?.[field]);
    if (value) records.push(...await airtableQueryExact(env, table, field, value, fetchImpl, 10));
  }
  const valid = uniqueRecords(records).filter((record) => {
    const fields = record.fields || {};
    if (token(fields.status) !== "approved") return false;
    if (clean(fields.policy_version) !== KENJI_MODEL_ACCESS_POLICY_VERSION) return false;
    if (token(fields.cohort) !== token(cohort)) return false;
    const expiresAt = Date.parse(fieldValue(fields, ["expires_at", "end_at", "end_date"]));
    return Number.isFinite(expiresAt) && expiresAt >= Date.now() && parseFolderList(fields.allowed_folders).length > 0;
  });
  if (valid.length !== 1) return { status: "blocked", folders: [] };
  return { status: "allowed", cohort: token(cohort), folders: parseFolderList(valid[0].fields?.allowed_folders) };
}

async function resolveCanonicalMemberAccess(env, lineUserId, fetchImpl) {
  const records = await airtableQueryExact(env, canonicalEntitlementTable(env), canonicalEntitlementLineField(env), lineUserId, fetchImpl, 100);
  const snapshot = resolveMemberEntitlements(records);
  if (snapshot?.schema_version !== "my_mmd_entitlement_resolver_v1" || snapshot?.fail_closed !== true) throw new KenjiModelAccessSourceError();
  if (snapshot.member_blocked === true) return { status: "silent", allowPublic: false, folders: [], renewalDue: false, snapshot };

  const valid = currentlyValidCapabilities(snapshot);
  const hasNonGuestPublicAuthority = [...valid].some((capability) => capability === "public_member" || PRIVATE_CAPABILITIES.has(capability));
  const allowPublic = snapshot.access?.public_service_access === true && hasNonGuestPublicAuthority;
  const envelope = token(snapshot.access?.private_visibility_envelope || "none");
  const renewalDue = privateRenewalDue(snapshot);

  if (envelope === "none" || snapshot.access?.new_model_reveals_allowed !== true) {
    return { status: allowPublic ? "allowed" : "silent", allowPublic, folders: [], renewalDue, snapshot };
  }

  if (PROTECTED_ENVELOPES.has(envelope)) {
    const approval = await resolveCuratedApproval(env, canonicalApprovalIdentity(records, lineUserId), envelope, fetchImpl);
    return {
      status: allowPublic || approval.status === "allowed" ? "allowed" : "silent",
      allowPublic,
      folders: approval.status === "allowed" ? approval.folders : [],
      renewalDue,
      snapshot,
    };
  }

  const folders = canonicalPrivateFolders(envelope);
  return { status: allowPublic || folders.length ? "allowed" : "silent", allowPublic, folders, renewalDue, snapshot };
}

async function resolveExactModel(env, query, fetchImpl) {
  const table = clean(env.AIRTABLE_TABLE_MODELS || "models");
  const codeMatches = await queryAcrossFields(env, table, MODEL_CODE_FIELDS, query, fetchImpl, 5);
  if (codeMatches.length) return { status: "resolved", records: codeMatches };
  const nameMatches = await queryAcrossFields(env, table, MODEL_WORKING_NAME_FIELDS, query, fetchImpl, 5);
  return { status: nameMatches.length ? "resolved" : "not_found", records: nameMatches };
}

export async function resolveKenjiModelAccess(env = {}, input = {}, options = {}) {
  const lineUserId = clean(input.line_user_id, 80);
  const query = clean(input.query, 80);
  const fetchImpl = options.fetchImpl || fetch;
  if (!/^U[A-Za-z0-9_-]{16,64}$/.test(lineUserId) || !query) return { status: "silent" };

  // My MMD Entitlement Resolver is the only membership/access authority here.
  // verification_email is intentionally ignored: an email must never widen model access.
  const access = await resolveCanonicalMemberAccess(env, lineUserId, fetchImpl);
  const model = await resolveExactModel(env, query, fetchImpl);
  if (model.status !== "resolved") return { status: "silent" };

  const authorized = model.records.flatMap((record) => {
    const cls = modelAccessClass(record);
    if (!cls.active) return [];
    if (cls.visibility === "public" && !access.allowPublic) return [];
    if (cls.visibility === "private" && !access.folders.includes(cls.folder)) return [];
    const safeModel = projectKenjiSafeModel(record);
    return safeModel ? [{ cls, safeModel, record }] : [];
  });
  if (authorized.length > 1) return { status: "clarification" };
  if (authorized.length === 1) {
    const authorizedRecord = authorized[0];
    const offerRulesTable = clean(env.AIRTABLE_TABLE_MODEL_OFFER_RULES || env.AIRTABLE_TABLE_MODEL_OFFER_RULES_ID || MODEL_OFFER_RULES_TABLE_FALLBACK);
    const rules = await airtableListRecords(env, offerRulesTable, fetchImpl, 500);
    const modelId = authorizedRecord.record?.id || "";
    const modelKey = clean(authorizedRecord.safeModel?.model_code, 160).toLowerCase();
    const relevantRules = rules.filter((record) => {
      const fields = record?.fields || {};
      const linked = Array.isArray(fields.Model) ? fields.Model.map((value) => clean(value?.id || value, 100)) : [];
      const key = clean(fields.model_key, 160).toLowerCase();
      return Boolean((modelId && linked.includes(modelId)) || (modelKey && key && key === modelKey));
    });
    if (!relevantRules.length) {
      return { status: "match", model: authorizedRecord.safeModel };
    }
    const salesOffer = resolveModelSalesOffer({
      model_id: modelId,
      model_key: modelKey,
      requested_at: input.requested_at || input.requestedAt || new Date().toISOString(),
      work_lane: input.work_lane || input.workLane || "",
      entitlement_snapshot: access.snapshot,
      rules: relevantRules,
    });
    return {
      status: "match",
      model: {
        ...authorizedRecord.safeModel,
        sales: {
          sellable: salesOffer.sellable === true,
          visibility: salesOffer.visibility || "off",
          customer_rate_thb: Number.isFinite(salesOffer.customer_rate_thb) ? salesOffer.customer_rate_thb : null,
          price_visible: salesOffer.price_visible === true,
          requires_per_approval: salesOffer.requires_per_approval === true,
          reason_code: clean(salesOffer.reason_code, 120),
          term_summary: clean(salesOffer.term_summary, 240),
          matched_rule_key: clean(salesOffer.matched_rule_key, 180) || null,
          rule_version: salesOffer.rule_version ?? null,
        },
      },
    };
  }

  const requestedPrivate = model.records.some((record) => {
    const cls = modelAccessClass(record);
    return cls.active && cls.visibility === "private";
  });
  if (requestedPrivate && access.renewalDue) return { status: "renewal" };
  return { status: "silent" };
}

function bearerToken(request) {
  const match = clean(request.headers.get("authorization"), 2000).match(/^Bearer\s+(.+)$/i);
  return clean(match?.[1], 1000);
}

function isAuthorizedServiceRequest(request, env) {
  let hostname = "";
  try { hostname = new URL(request.url).hostname; } catch (_) { return false; }
  return Boolean(
    hostname === "admin-worker.local" &&
    clean(request.headers.get("x-mmd-internal-call")).toLowerCase() === "true" &&
    clean(request.headers.get("x-mmd-service-binding")) === "member-dashboard-chat-worker" &&
    clean(env.INTERNAL_TOKEN, 1000) &&
    bearerToken(request) === clean(env.INTERNAL_TOKEN, 1000)
  );
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private" } });
}

export function isKenjiModelAccessRpcRequest(path, method = "") {
  return path === KENJI_MODEL_ACCESS_RPC_PATH && ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(String(method).toUpperCase());
}

export async function handleKenjiModelAccessRpc(request, env = {}, options = {}) {
  if (!isAuthorizedServiceRequest(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);
  if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const contentType = clean(request.headers.get("content-type")).split(";", 1)[0].toLowerCase();
  if (contentType !== "application/json") return json({ ok: false, error: "invalid_content_type" }, 415);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_json" }, 400);

  try {
    const result = await resolveKenjiModelAccess(env, body, options);
    if (result.status === "match") return json({ ok: true, status: "match", policy_version: KENJI_MODEL_ACCESS_POLICY_VERSION, model: result.model });
    if (result.status === "clarification") return json({ ok: true, status: "clarification", policy_version: KENJI_MODEL_ACCESS_POLICY_VERSION });
    if (result.status === "renewal") return json({ ok: true, status: "renewal", policy_version: KENJI_MODEL_ACCESS_POLICY_VERSION });
    return json({ ok: true, status: "silent", policy_version: KENJI_MODEL_ACCESS_POLICY_VERSION });
  } catch (error) {
    if (error instanceof KenjiModelAccessSourceError) return json({ ok: false, error: "model_access_unavailable" }, 503);
    return json({ ok: false, error: "model_access_failed" }, 500);
  }
}
