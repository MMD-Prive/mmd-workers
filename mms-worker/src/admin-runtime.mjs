const AIRTABLE_API = "https://api.airtable.com/v0";
const INTERNAL_HOST = "mms.internal";

const APPLICATION_STATUSES = new Set(["Draft", "Submitted", "Under Review", "Approved", "Rejected", "Withdrawn"]);
const THERAPIST_STATUSES = new Set(["Review", "Active", "Inactive", "Rejected"]);
const AVAILABILITY_STATUSES = new Set(["Available", "Limited", "Unavailable", "Paused"]);
const PREBOOKING_STATUSES = new Set([
  "Draft",
  "Submitted",
  "Matching",
  "Options Ready",
  "Pending Coordination",
  "Confirmed",
  "Expired",
  "Cancelled",
]);

const CUSTOMER_GENDER_SCOPES = new Set(["ผู้ชาย", "ผู้หญิง", "ได้ทั้งคู่"]);
const SKILLS = new Set([
  "Aroma Therapy Oil Massage",
  "Thai Massage",
  "Sport Massage",
  "Office Syndrome",
  "Health and Fitness Advisor",
  "Thai herbal compress massage",
  "Partner-Present Massage Session",
  "Women Massage",
]);
const ZONES = new Set([
  "Sukhumvit",
  "Sathorn / Silom",
  "Rama 9 / Ratchada",
  "Ari / Chatuchak",
  "Lat Phrao / Ram Inthra",
  "On Nut / Bang Na",
  "Riverside / Old Town",
  "Thonburi",
  "Don Mueang / Lak Si",
  "Other Bangkok",
]);

export function isMmsAdminRuntimeRequest(pathname = "") {
  const path = normalizePath(pathname);
  return path === "/internal/mms/admin/snapshot" ||
    path === "/internal/mms/admin/file" ||
    /^\/internal\/mms\/admin\/applications\/mmsapp_[a-f0-9]{24}$/.test(path) ||
    /^\/internal\/mms\/admin\/therapists\/[A-Za-z0-9_-]{4,80}$/.test(path) ||
    /^\/internal\/mms\/admin\/prebookings\/mmspre_[a-f0-9]{24}$/.test(path);
}

export async function handleMmsAdminRuntime(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  await requireInternalRequest(request, env);

  if (path === "/internal/mms/admin/snapshot" && method === "GET") {
    return json(await snapshot(env));
  }

  if (path === "/internal/mms/admin/file" && method === "GET") {
    return privateFile(request, env);
  }

  const applicationMatch = path.match(/^\/internal\/mms\/admin\/applications\/(mmsapp_[a-f0-9]{24})$/);
  if (applicationMatch && method === "PATCH") {
    return json(await patchApplication(request, env, applicationMatch[1]));
  }

  const therapistMatch = path.match(/^\/internal\/mms\/admin\/therapists\/([A-Za-z0-9_-]{4,80})$/);
  if (therapistMatch && method === "PATCH") {
    return json(await patchTherapist(request, env, therapistMatch[1]));
  }

  const prebookingMatch = path.match(/^\/internal\/mms\/admin\/prebookings\/(mmspre_[a-f0-9]{24})$/);
  if (prebookingMatch && method === "PATCH") {
    return json(await patchPrebooking(request, env, prebookingMatch[1]));
  }

  return json({ ok: false, error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
}

async function snapshot(env) {
  const [applications, therapists, prebookings] = await Promise.all([
    airtableListAll(env, tableId(env, "APPLICATIONS"), { maxPages: 5 }),
    airtableListAll(env, tableId(env, "THERAPISTS"), { maxPages: 5 }),
    airtableListAll(env, tableId(env, "PREBOOKINGS"), { maxPages: 5 }),
  ]);

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    counts: {
      applications: applications.length,
      therapists: therapists.length,
      prebookings: prebookings.length,
    },
    applications: applications.map(publicApplicationRecord),
    therapists: therapists.map(publicTherapistRecord),
    prebookings: prebookings.map(publicPrebookingRecord),
  };
}

async function patchApplication(request, env, applicationId) {
  const body = await readJson(request);
  rejectKeys(body, new Set(["status", "internal_notes", "approve_to_therapist"]));

  const application = await findAirtableRecord(env, tableId(env, "APPLICATIONS"), "Application ID", applicationId);
  if (!application) throw httpError(404, "APPLICATION_NOT_FOUND", "Application not found");

  const fields = {};
  if (body.status !== undefined) {
    const status = clean(body.status, 40);
    if (!APPLICATION_STATUSES.has(status)) throw httpError(400, "STATUS_INVALID", "Application status is invalid");
    fields["Application Status"] = status;
  }
  if (body.internal_notes !== undefined) fields["Internal Notes"] = clean(body.internal_notes, 4000);

  const shouldApprove = body.approve_to_therapist === true || fields["Application Status"] === "Approved";
  if (shouldApprove) fields["Application Status"] = "Approved";
  if (Object.keys(fields).length) await airtableUpdate(env, tableId(env, "APPLICATIONS"), application.id, fields);

  let therapist = null;
  if (shouldApprove) therapist = await promoteApplicationToTherapist(env, application, clean(body.internal_notes, 4000));

  const refreshed = await findAirtableRecord(env, tableId(env, "APPLICATIONS"), "Application ID", applicationId);
  return {
    ok: true,
    application: publicApplicationRecord(refreshed),
    therapist: therapist ? publicTherapistRecord(therapist) : null,
  };
}

async function promoteApplicationToTherapist(env, application, adminNote = "") {
  const source = application.fields || {};
  const therapistId = await therapistIdFor(String(source["Application ID"] || ""));
  const existing = await findAirtableRecord(env, tableId(env, "THERAPISTS"), "Therapist ID", therapistId);

  const fields = compact({
    "Therapist ID": therapistId,
    "Application Ref": [application.id],
    "Display Name": clean(source.Nickname || source["Applicant Name"], 120),
    "Gender Identity": clean(source["Gender Identity"], 40),
    "Customer Gender Scope": CUSTOMER_GENDER_SCOPES.has(source["Customer Gender Scope"]) ? source["Customer Gender Scope"] : undefined,
    "Verified Skills": cleanSupportedArray(source["Skills Claimed"], SKILLS),
    "Base Zone": ZONES.has(source["Base Zone"]) ? source["Base Zone"] : undefined,
    "Coverage Zones": cleanSupportedArray(source["Coverage Zones"], ZONES),
    "Availability Status": existing?.fields?.["Availability Status"] || "Available",
    "Matching Enabled": existing?.fields?.["Matching Enabled"] ?? true,
    "Manual Review Only": existing?.fields?.["Manual Review Only"] ?? false,
    "Profile Photo R2 Key": clean(source["Profile Photo R2 Key"], 500),
    Status: "Active",
    "Verified At": new Date().toISOString(),
    "Internal Notes": adminNote || clean(existing?.fields?.["Internal Notes"], 4000),
  });

  return existing
    ? airtableUpdate(env, tableId(env, "THERAPISTS"), existing.id, fields)
    : airtableCreate(env, tableId(env, "THERAPISTS"), fields);
}

async function patchTherapist(request, env, therapistId) {
  const body = await readJson(request);
  rejectKeys(body, new Set([
    "display_name",
    "customer_gender_scope",
    "verified_skills",
    "base_zone",
    "coverage_zones",
    "availability_status",
    "matching_enabled",
    "manual_review_only",
    "public_photo_url",
    "status",
    "internal_notes",
  ]));

  const record = await findAirtableRecord(env, tableId(env, "THERAPISTS"), "Therapist ID", therapistId);
  if (!record) throw httpError(404, "THERAPIST_NOT_FOUND", "Therapist not found");

  const fields = {};
  if (body.display_name !== undefined) fields["Display Name"] = clean(body.display_name, 120);
  if (body.customer_gender_scope !== undefined) {
    if (!CUSTOMER_GENDER_SCOPES.has(body.customer_gender_scope)) throw httpError(400, "GENDER_SCOPE_INVALID", "Customer gender scope is invalid");
    fields["Customer Gender Scope"] = body.customer_gender_scope;
  }
  if (body.verified_skills !== undefined) fields["Verified Skills"] = cleanRequiredSupportedArray(body.verified_skills, SKILLS, "verified_skills");
  if (body.base_zone !== undefined) {
    if (!ZONES.has(body.base_zone)) throw httpError(400, "ZONE_INVALID", "Base zone is invalid");
    fields["Base Zone"] = body.base_zone;
  }
  if (body.coverage_zones !== undefined) fields["Coverage Zones"] = cleanRequiredSupportedArray(body.coverage_zones, ZONES, "coverage_zones");
  if (body.availability_status !== undefined) {
    if (!AVAILABILITY_STATUSES.has(body.availability_status)) throw httpError(400, "AVAILABILITY_INVALID", "Availability status is invalid");
    fields["Availability Status"] = body.availability_status;
  }
  if (body.matching_enabled !== undefined) fields["Matching Enabled"] = Boolean(body.matching_enabled);
  if (body.manual_review_only !== undefined) fields["Manual Review Only"] = Boolean(body.manual_review_only);
  if (body.public_photo_url !== undefined) fields["Public Photo URL"] = safeHttpUrl(body.public_photo_url);
  if (body.status !== undefined) {
    if (!THERAPIST_STATUSES.has(body.status)) throw httpError(400, "THERAPIST_STATUS_INVALID", "Therapist status is invalid");
    fields.Status = body.status;
  }
  if (body.internal_notes !== undefined) fields["Internal Notes"] = clean(body.internal_notes, 4000);

  const updated = Object.keys(fields).length
    ? await airtableUpdate(env, tableId(env, "THERAPISTS"), record.id, fields)
    : record;
  return { ok: true, therapist: publicTherapistRecord(updated) };
}

async function patchPrebooking(request, env, prebookingId) {
  const body = await readJson(request);
  rejectKeys(body, new Set(["status", "matched_therapist_ids", "internal_notes"]));

  const record = await findAirtableRecord(env, tableId(env, "PREBOOKINGS"), "Prebooking ID", prebookingId);
  if (!record) throw httpError(404, "PREBOOKING_NOT_FOUND", "Prebooking not found");

  const fields = { "Updated At": new Date().toISOString() };
  if (body.status !== undefined) {
    if (!PREBOOKING_STATUSES.has(body.status)) throw httpError(400, "PREBOOKING_STATUS_INVALID", "Prebooking status is invalid");
    fields.Status = body.status;
  }
  if (body.matched_therapist_ids !== undefined) {
    const ids = uniqueStrings(body.matched_therapist_ids, 10, 80);
    fields["Matched Therapist IDs"] = JSON.stringify(ids);
  }
  if (body.internal_notes !== undefined) fields["Internal Notes"] = clean(body.internal_notes, 4000);

  const updated = await airtableUpdate(env, tableId(env, "PREBOOKINGS"), record.id, fields);
  return { ok: true, prebooking: publicPrebookingRecord(updated) };
}

async function privateFile(request, env) {
  if (!env.MMS_PRIVATE_UPLOADS) throw httpError(503, "UPLOAD_STORAGE_UNAVAILABLE", "Private upload storage is unavailable");
  const key = String(new URL(request.url).searchParams.get("key") || "").trim();
  if (!/^mms\/applications\/mmsapp_[a-f0-9]{24}\/(profile_photo|certificate)\//.test(key)) {
    throw httpError(400, "FILE_KEY_INVALID", "File key is invalid");
  }
  const object = await env.MMS_PRIVATE_UPLOADS.get(key);
  if (!object) throw httpError(404, "FILE_NOT_FOUND", "File not found");
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
    "X-Content-Type-Options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { status: 200, headers });
}

function publicApplicationRecord(record) {
  const fields = record?.fields || {};
  return {
    record_id: record?.id || "",
    application_id: clean(fields["Application ID"], 80),
    applicant_name: clean(fields["Applicant Name"], 160),
    nickname: clean(fields.Nickname, 80),
    phone: clean(fields.Phone, 40),
    line_id: clean(fields["LINE ID"], 100),
    gender_identity: clean(fields["Gender Identity"], 40),
    customer_gender_scope: clean(fields["Customer Gender Scope"], 40),
    skills: arrayOfStrings(fields["Skills Claimed"]),
    experience_years: numberOrZero(fields["Experience Years"]),
    experience_months: numberOrZero(fields["Experience Months"]),
    strengths: clean(fields.Strengths, 3000),
    worked_at_spa_before: Boolean(fields["Worked at Spa Before"]),
    spa_name: clean(fields["Spa Name"], 160),
    worked_independently_before: Boolean(fields["Worked Independently Before"]),
    independent_social: clean(fields["Independent Social"], 240),
    base_zone: clean(fields["Base Zone"], 80),
    coverage_zones: arrayOfStrings(fields["Coverage Zones"]),
    profile_photo_r2_key: clean(fields["Profile Photo R2 Key"], 500),
    certificate_r2_keys: parseJsonArray(fields["Certificate R2 Keys"]),
    status: clean(fields["Application Status"], 40),
    submitted_at: clean(fields["Submitted At"], 80),
    internal_notes: clean(fields["Internal Notes"], 4000),
  };
}

function publicTherapistRecord(record) {
  const fields = record?.fields || {};
  return {
    record_id: record?.id || "",
    therapist_id: clean(fields["Therapist ID"], 80),
    display_name: clean(fields["Display Name"], 120),
    gender_identity: clean(fields["Gender Identity"], 40),
    customer_gender_scope: clean(fields["Customer Gender Scope"], 40),
    verified_skills: arrayOfStrings(fields["Verified Skills"]),
    base_zone: clean(fields["Base Zone"], 80),
    coverage_zones: arrayOfStrings(fields["Coverage Zones"]),
    availability_status: clean(fields["Availability Status"], 40),
    matching_enabled: Boolean(fields["Matching Enabled"]),
    manual_review_only: Boolean(fields["Manual Review Only"]),
    public_photo_url: clean(fields["Public Photo URL"], 1000),
    profile_photo_r2_key: clean(fields["Profile Photo R2 Key"], 500),
    certificate_review_status: clean(fields["Certificate Review Status"], 80),
    status: clean(fields.Status, 40),
    verified_at: clean(fields["Verified At"], 80),
    internal_notes: clean(fields["Internal Notes"], 4000),
  };
}

function publicPrebookingRecord(record) {
  const fields = record?.fields || {};
  return {
    record_id: record?.id || "",
    prebooking_id: clean(fields["Prebooking ID"], 80),
    member_ref: clean(fields["Member Ref"], 120),
    recipient_gender: clean(fields["Recipient Gender"], 80),
    zone: clean(fields.Zone, 80),
    service_date: clean(fields["Service Date"], 20),
    service_time: clean(fields["Service Time"], 20),
    duration_minutes: numberOrZero(fields["Duration Minutes"]),
    selected_skills: arrayOfStrings(fields["Selected Skills"]),
    requested_therapist_ids: parseJsonArray(fields["Requested Therapist IDs"]),
    matched_therapist_ids: parseJsonArray(fields["Matched Therapist IDs"]),
    status: clean(fields.Status, 60),
    created_at: clean(fields["Created At"], 80),
    updated_at: clean(fields["Updated At"], 80),
    internal_notes: clean(fields["Internal Notes"], 4000),
  };
}

async function requireInternalRequest(request, env) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (hostname === String(env.MMS_INTERNAL_HOST || INTERNAL_HOST).toLowerCase()) return;
  throw httpError(404, "NOT_FOUND", "Route not found");
}

function tableId(env, suffix) {
  const value = String(env[`AIRTABLE_${suffix}_TABLE_ID`] || "").trim();
  if (!/^tbl[A-Za-z0-9]{14}$/.test(value)) throw httpError(503, "AIRTABLE_TABLE_INVALID", `Airtable ${suffix.toLowerCase()} table is not configured`);
  return value;
}

async function airtableCreate(env, table, fields) {
  return airtableFetch(env, table, { method: "POST", body: JSON.stringify({ fields, typecast: false }) });
}

async function airtableUpdate(env, table, recordId, fields) {
  return airtableFetch(env, `${table}/${recordId}`, { method: "PATCH", body: JSON.stringify({ fields, typecast: false }) });
}

async function findAirtableRecord(env, table, field, value) {
  const query = new URLSearchParams({ maxRecords: "1", filterByFormula: `{${field}}='${airtableEscape(value)}'` });
  const data = await airtableFetch(env, `${table}?${query}`);
  return Array.isArray(data.records) ? data.records[0] || null : null;
}

async function airtableListAll(env, table, { maxPages = 5 } = {}) {
  if (!env.AIRTABLE_API_TOKEN) throw httpError(503, "AIRTABLE_NOT_CONFIGURED", "Airtable is not configured");
  const records = [];
  let offset = "";
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({ pageSize: "100" });
    if (offset) query.set("offset", offset);
    const data = await airtableFetch(env, `${table}?${query}`);
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = String(data.offset || "");
    if (!offset) break;
  }
  return records;
}

async function airtableFetch(env, path, init = {}) {
  if (!env.AIRTABLE_API_TOKEN) throw httpError(503, "AIRTABLE_NOT_CONFIGURED", "Airtable is not configured");
  const baseId = String(env.AIRTABLE_BASE_ID || "").trim();
  if (!/^app[A-Za-z0-9]{14}$/.test(baseId)) throw httpError(503, "AIRTABLE_BASE_INVALID", "Airtable base is not configured");
  const response = await fetch(`${AIRTABLE_API}/${baseId}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = httpError(502, "AIRTABLE_REQUEST_FAILED", "Airtable request failed");
    error.airtable_status = response.status;
    throw error;
  }
  return data;
}

async function therapistIdFor(applicationId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mms-therapist:${applicationId}`));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `mmst_${hex.slice(0, 24)}`;
}

async function readJson(request) {
  const type = String(request.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("application/json")) throw httpError(415, "JSON_REQUIRED", "application/json is required");
  const text = await request.text();
  if (text.length > 64 * 1024) throw httpError(413, "JSON_TOO_LARGE", "JSON body is too large");
  try {
    const value = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value;
  } catch {
    throw httpError(400, "INVALID_JSON", "A valid JSON object is required");
  }
}

function rejectKeys(body, allowed) {
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) throw httpError(400, "UNKNOWN_FIELD", `Unsupported field: ${key}`);
  }
}

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function compact(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== ""));
}

function cleanSupportedArray(value, allowed) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => clean(item, 160)).filter((item) => allowed.has(item)))];
}

function cleanRequiredSupportedArray(value, allowed, field) {
  if (!Array.isArray(value)) throw httpError(400, "ARRAY_REQUIRED", `${field} must be an array`);
  const values = cleanSupportedArray(value, allowed);
  if (!values.length || values.length !== new Set(value.map((item) => clean(item, 160))).size) {
    throw httpError(400, "ARRAY_INVALID", `${field} contains unsupported values`);
  }
  return values;
}

function uniqueStrings(value, maxItems, maxLength) {
  if (!Array.isArray(value)) throw httpError(400, "ARRAY_REQUIRED", "Expected an array");
  const values = [...new Set(value.map((item) => clean(item, maxLength)).filter(Boolean))];
  if (values.length > maxItems) throw httpError(400, "ARRAY_TOO_LONG", "Too many items");
  return values;
}

function safeHttpUrl(value) {
  const raw = clean(value, 1000);
  if (!raw) return "";
  let url;
  try { url = new URL(raw); } catch { throw httpError(400, "URL_INVALID", "URL is invalid"); }
  if (!/^https?:$/.test(url.protocol)) throw httpError(400, "URL_INVALID", "Only http(s) URLs are allowed");
  return url.toString();
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function airtableEscape(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function adminRuntimeErrorResponse(error) {
  const status = Number(error?.status) || 500;
  const code = error?.code || "INTERNAL_ERROR";
  return json({ ok: false, error: { code, message: status >= 500 ? "Internal MMS admin error" : String(error?.message || code) } }, status);
}
