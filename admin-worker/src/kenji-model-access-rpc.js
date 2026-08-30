export const KENJI_MODEL_ACCESS_POLICY_VERSION = "KENJI_MODEL_ACCESS_V1";
export const KENJI_MODEL_ACCESS_RPC_PATH = "/v1/internal/kenji/model-access";

const AIRTABLE_API = "https://api.airtable.com/v0";
const CANONICAL_PRIVATE_FOLDERS = new Set(["standard", "premium", "vip", "exclusive"]);
const BLOCKED_MODEL_STATUS = new Set(["inactive", "blocked", "suspended", "archived", "disabled", "banned", "off", "retired"]);
const MEMBER_LINE_FIELDS = ["line_user_id", "LINE User ID", "line_id", "LINE ID"];
const MEMBER_EMAIL_FIELDS = ["Contact Email", "member_email", "email", "Gmail", "Google Drive Email"];
const PACKAGE_MEMBER_EMAIL_FIELDS = ["member_email", "Member Email", "email", "Contact Email"];
const PACKAGE_MEMBER_ID_FIELDS = ["member_id", "Member ID"];
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

export function classifyKenjiModelPackage(value) {
  const valueToken = token(value);
  if (["guest", "guest_pass", "trial", "trial_7d", "7_days_guest_pass"].includes(valueToken)) {
    return { cohort: "guest_trial", mode: "website_only", folders: [] };
  }
  if (["membership", "red_card"].includes(valueToken)) {
    return { cohort: valueToken, mode: "public_models", folders: [] };
  }
  if (["standard", "standard_package"].includes(valueToken)) {
    return { cohort: "standard", mode: "package", folders: ["standard"] };
  }
  if (["premium", "premium_package"].includes(valueToken)) {
    return { cohort: "premium", mode: "package", folders: ["standard", "premium"] };
  }
  if (["gws", "ems"].includes(valueToken)) {
    return { cohort: valueToken, mode: "signal", folders: [] };
  }
  if (valueToken === "vip") {
    return { cohort: "vip", mode: "curated", folders: [] };
  }
  if (["svip", "s_vip", "super_vip"].includes(valueToken)) {
    return { cohort: "svip", mode: "curated", folders: [] };
  }
  if (valueToken === "black_card") {
    return { cohort: "black_card", mode: "package", folders: ["standard", "premium", "vip", "exclusive"] };
  }
  return { cohort: "unknown", mode: "blocked", folders: [] };
}

export function projectKenjiSafeModel(record = {}) {
  const fields = record.fields || {};
  const modelCode = fieldValue(fields, MODEL_CODE_FIELDS);
  const workingName = fieldValue(fields, MODEL_WORKING_NAME_FIELDS);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(modelCode) || !isCustomerSafeText(workingName, 120)) return null;

  const projected = {
    model_code: modelCode,
    working_name: workingName,
  };
  const summary = fieldValue(fields, ["customer_safe_summary", "approved_profile_summary", "public_safe_summary"]);
  const imageUrl = safeHttpsUrl(fieldValue(fields, ["customer_safe_image_url", "approved_image_url"]));
  if (isCustomerSafeText(summary, 500)) projected.summary = summary;
  if (imageUrl) projected.image_url = imageUrl;
  return projected;
}

function modelFolder(record = {}) {
  const fields = record.fields || {};
  const folder = token(fieldValue(fields, ["access_folder", "model_access_folder", "model_folder"]));
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

function parseActivePackageRecords(records = [], now = Date.now()) {
  return records.flatMap((record) => {
    const fields = record.fields || {};
    if (token(fieldValue(fields, ["status", "membership_status"])) !== "active") return [];
    const expiresAt = Date.parse(fieldValue(fields, ["end_date", "end_at", "expire_at", "expires_at", "Expiry"]));
    if (!Number.isFinite(expiresAt) || expiresAt < now) return [];
    const packageCode = fieldValue(fields, ["package_code", "Package Code", "tier", "package"]);
    const policy = classifyKenjiModelPackage(packageCode);
    return [{ record, expiresAt, packageCode, policy }];
  });
}

async function airtableQueryExact(env, tableName, field, value, fetchImpl = fetch, limit = 5) {
  const apiKey = clean(env.AIRTABLE_API_KEY, 1000);
  const baseId = clean(env.AIRTABLE_BASE_ID, 200);
  if (!apiKey || !baseId || !tableName || !value) throw new KenjiModelAccessSourceError();

  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`);
  url.searchParams.set("pageSize", String(Math.max(1, Math.min(10, limit))));
  url.searchParams.set("filterByFormula", `LOWER({${field}}&"")=${formulaString(clean(value).toLowerCase())}`);

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    });
  } catch (_) {
    throw new KenjiModelAccessSourceError();
  }

  // Airtable returns 422 when a legacy deployment does not have one of the
  // known compatibility fields. Continue to the next fixed field name only.
  if (response.status === 422) return [];
  if (!response.ok) throw new KenjiModelAccessSourceError();
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.records) ? payload.records : [];
}

async function queryAcrossFields(env, tableName, fields, value, fetchImpl, limit = 5) {
  const records = [];
  for (const field of fields) {
    records.push(...await airtableQueryExact(env, tableName, field, value, fetchImpl, limit));
  }
  return uniqueRecords(records);
}

async function resolveLineMember(env, lineUserId, verificationEmail, fetchImpl) {
  const table = clean(env.AIRTABLE_TABLE_MEMBERS || env.AIRTABLE_TABLE_MEMBERS_ID || "members");
  const matches = await queryAcrossFields(env, table, MEMBER_LINE_FIELDS, lineUserId, fetchImpl, 3);
  if (matches.length === 1) return { status: "resolved", record: matches[0] };
  if (matches.length > 1) return { status: "ambiguous" };
  if (!verificationEmail) return { status: "verification_required" };
  const emailMatches = await queryAcrossFields(env, table, MEMBER_EMAIL_FIELDS, verificationEmail.toLowerCase(), fetchImpl, 3);
  if (emailMatches.length !== 1) return { status: emailMatches.length ? "ambiguous" : "unresolved" };
  return { status: "resolved", record: emailMatches[0] };
}

async function resolveMemberPackages(env, memberRecord, lineUserId, fetchImpl) {
  const table = clean(env.AIRTABLE_TABLE_MEMBER_PACKAGES || "member_packages");
  const memberFields = memberRecord.fields || {};
  const memberEmail = fieldValue(memberFields, ["Contact Email", "member_email", "email"]).toLowerCase();
  const memberId = fieldValue(memberFields, ["member_id", "Member ID"]);
  const records = [];
  if (memberEmail) records.push(...await queryAcrossFields(env, table, PACKAGE_MEMBER_EMAIL_FIELDS, memberEmail, fetchImpl, 10));
  if (memberId) records.push(...await queryAcrossFields(env, table, PACKAGE_MEMBER_ID_FIELDS, memberId, fetchImpl, 10));
  const active = parseActivePackageRecords(uniqueRecords(records));
  if (!active.length) return { status: records.length ? "renewal" : "blocked", allowPublic: false, folders: [] };

  const entitlements = active.filter((item) => item.policy.mode !== "signal");
  if (!entitlements.length) return { status: "blocked", allowPublic: false, folders: [] };

  const cohorts = [...new Set(entitlements.map((item) => item.policy.cohort))];
  if (cohorts.length !== 1 || cohorts[0] === "unknown") return { status: "conflict", folders: [] };
  const selected = entitlements.sort((left, right) => right.expiresAt - left.expiresAt)[0];
  if (selected.policy.mode === "package") {
    return { status: "allowed", cohort: selected.policy.cohort, allowPublic: true, folders: selected.policy.folders.slice() };
  }
  if (selected.policy.mode === "public_models") {
    return { status: "allowed", cohort: selected.policy.cohort, allowPublic: true, folders: [] };
  }
  if (selected.policy.mode !== "curated") return { status: "blocked", cohort: selected.policy.cohort, folders: [] };

  const approval = await resolveCuratedApproval(env, {
    memberRecord,
    memberEmail,
    memberId,
    lineUserId,
    cohort: selected.policy.cohort,
  }, fetchImpl);
  return approval.status === "allowed" ? { ...approval, allowPublic: true } : { status: "blocked", cohort: selected.policy.cohort, allowPublic: false, folders: [] };
}

async function resolveCuratedApproval(env, identity, fetchImpl) {
  const table = clean(env.AIRTABLE_TABLE_KENJI_MODEL_ACCESS_APPROVALS);
  if (!table) return { status: "blocked", folders: [] };
  const values = {
    member_record_id: clean(identity.memberRecord?.id),
    member_id: clean(identity.memberId),
    member_email: clean(identity.memberEmail).toLowerCase(),
    line_user_id: clean(identity.lineUserId),
  };
  const records = [];
  for (const field of APPROVAL_MEMBER_FIELDS) {
    if (values[field]) records.push(...await airtableQueryExact(env, table, field, values[field], fetchImpl, 5));
  }
  const valid = uniqueRecords(records).filter((record) => {
    const fields = record.fields || {};
    if (token(fields.status) !== "approved") return false;
    if (clean(fields.policy_version) !== KENJI_MODEL_ACCESS_POLICY_VERSION) return false;
    if (token(fields.cohort) !== identity.cohort) return false;
    const expiresAt = Date.parse(fieldValue(fields, ["expires_at", "end_at", "end_date"]));
    return Number.isFinite(expiresAt) && expiresAt >= Date.now() && parseFolderList(fields.allowed_folders).length > 0;
  });
  if (valid.length !== 1) return { status: "blocked", folders: [] };
  return { status: "allowed", cohort: identity.cohort, folders: parseFolderList(valid[0].fields?.allowed_folders) };
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
  const verificationEmail = clean(input.verification_email, 254).toLowerCase();
  const fetchImpl = options.fetchImpl || fetch;
  if (!/^U[A-Za-z0-9_-]{16,64}$/.test(lineUserId) || !query || (verificationEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(verificationEmail))) return { status: "silent" };

  const member = await resolveLineMember(env, lineUserId, verificationEmail, fetchImpl);
  if (member.status === "verification_required") return { status: "verification_required" };
  if (member.status !== "resolved") return { status: "silent" };
  const access = await resolveMemberPackages(env, member.record, lineUserId, fetchImpl);
  if (access.status === "renewal") return { status: "renewal" };
  if (access.status !== "allowed" || (!access.allowPublic && !access.folders.length)) return { status: "silent" };

  const model = await resolveExactModel(env, query, fetchImpl);
  if (model.status !== "resolved") return { status: "silent" };
  const authorized = model.records.flatMap((record) => {
    const modelAccess = modelAccessClass(record);
    if (!modelAccess.active) return [];
    if (modelAccess.visibility === "public" && !access.allowPublic) return [];
    if (modelAccess.visibility === "private" && !access.folders.includes(modelAccess.folder)) return [];
    const safeModel = projectKenjiSafeModel(record);
    return safeModel ? [{ record, safeModel }] : [];
  });
  if (authorized.length > 1) return { status: "clarification" };
  return authorized.length === 1 ? { status: "match", model: authorized[0].safeModel } : { status: "silent" };
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
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private" },
  });
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
    if (result.status === "verification_required") return json({ ok: true, status: "verification_required", policy_version: KENJI_MODEL_ACCESS_POLICY_VERSION });
    if (result.status === "renewal") return json({ ok: true, status: "renewal", policy_version: KENJI_MODEL_ACCESS_POLICY_VERSION });
    return json({ ok: true, status: "silent", policy_version: KENJI_MODEL_ACCESS_POLICY_VERSION });
  } catch (error) {
    if (error instanceof KenjiModelAccessSourceError) return json({ ok: false, error: "model_access_unavailable" }, 503);
    return json({ ok: false, error: "model_access_failed" }, 500);
  }
}
