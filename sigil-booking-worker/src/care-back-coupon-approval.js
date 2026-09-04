const AIRTABLE_API = "https://api.airtable.com/v0";
const CAMPAIGN_ID = "6-years-care-back";
const MEMBER_PAGES_APPROVAL_PATH = "/__internal/care-back/coupon/approve-booking";
const ENTITLEMENT_AUTHORITY = "my_mmd_entitlement_resolver_v1";

export class CareBackBookingContextError extends Error {
  constructor(code, status = 409) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function isCareBackCouponRequested(body = {}) {
  return body.care_back_coupon === true
    || clean(body.campaign_code).toLowerCase() === CAMPAIGN_ID
    || Boolean(clean(body.coupon_code));
}

export async function approveCareBackCouponForConfirmedBooking({
  env,
  body = {},
  bookingFields = {},
  canonical = {},
  bookingAccess = {},
  paymentVerified = false,
}) {
  if (!isCareBackCouponRequested(body)) {
    return { requested: false, state: "not_requested" };
  }
  requireAirtable(env);
  if (!env.MEMBER_PAGES_WORKER?.fetch) {
    throw new CareBackBookingContextError("CARE_BACK_APPROVAL_OWNER_UNAVAILABLE", 503);
  }

  const snapshot = canonical?.snapshot;
  const access = canonical?.response || {};
  if (snapshot?.schema_version !== ENTITLEMENT_AUTHORITY
    || snapshot?.member_blocked === true
    || bookingAccess?.allowed !== true
    || paymentVerified !== true
    || !["active", "grace"].includes(clean(access.member_status).toLowerCase())) {
    throw new CareBackBookingContextError("CARE_BACK_CUSTOMER_ELIGIBILITY_UNRESOLVED");
  }

  const jobFormat = normalizeTrustedJobFormat(body.job_format);
  if (!jobFormat) {
    throw new CareBackBookingContextError("CARE_BACK_JOB_FORMAT_REQUIRED");
  }

  const member = await resolveCanonicalMember(env, bookingFields);
  const claim = await resolveCareBackClaim(env, member.member_id);
  const model = await resolveCanonicalModel(env, bookingFields);
  const modelLevel = detectCareBackModelLevel(model.fields || {});
  if (!modelLevel) {
    throw new CareBackBookingContextError("CARE_BACK_MODEL_LEVEL_UNRESOLVED");
  }

  let publicModelPercent = null;
  if (modelLevel === "Public Models") {
    publicModelPercent = trustedPublicModelPercent(body.public_model_percent);
    if (publicModelPercent === null) {
      throw new CareBackBookingContextError("CARE_BACK_PUBLIC_MODEL_PERCENT_REQUIRED");
    }
  }

  const bookingRef = clean(bookingFields.booking_ref || bookingFields["Request ID"] || body.booking_ref || body.request_id);
  const requestPayload = {
    identity_hash: claim.line_user_id_hash,
    member_id: member.member_id,
    member_profile: {
      membership_status: clean(access.member_status).toLowerCase(),
      tier: careBackProfileTier(access.membership_tier),
    },
    model_level: modelLevel,
    job_format: jobFormat,
    public_model_percent: publicModelPercent,
    booking_ref: bookingRef,
    coupon_code: clean(body.coupon_code).toUpperCase() || undefined,
    eligibility: {
      authority: ENTITLEMENT_AUTHORITY,
      member_blocked: false,
      booking_allowed: true,
      payment_verified: true,
    },
  };

  const response = await env.MEMBER_PAGES_WORKER.fetch(new Request(`https://member-pages.internal${MEMBER_PAGES_APPROVAL_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-service-caller": "sigil-booking-worker",
    },
    body: JSON.stringify(requestPayload),
  }));
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || !payload?.data) {
    const code = clean(payload?.error) || `CARE_BACK_APPROVAL_OWNER_HTTP_${response.status}`;
    throw new CareBackBookingContextError(code, response.status >= 400 && response.status <= 599 ? response.status : 502);
  }

  const approved = payload.data;
  const percent = Number(approved.approved_discount_percent);
  if (!Number.isFinite(percent) || percent <= 0 || percent > 10) {
    throw new CareBackBookingContextError("CARE_BACK_APPROVED_PERCENT_INVALID", 502);
  }

  return {
    requested: true,
    state: "approved",
    authority: clean(approved.authority) || "care_back_coupon_v2_2",
    model_level: clean(approved.model_level),
    job_format: clean(approved.job_format),
    approved_discount_percent: percent,
    activated_at: safeTimestamp(approved.activated_at),
    expires_at: safeTimestamp(approved.expires_at),
    single_use: approved.single_use === true,
  };
}

export function normalizeTrustedJobFormat(value) {
  const format = clean(value).toUpperCase();
  return format === "PN" || format === "VIP" ? format : "";
}

export function trustedPublicModelPercent(value) {
  if (value === undefined || value === null || value === "") return null;
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 3 && percent <= 5 ? percent : null;
}

export function detectCareBackModelLevel(fields = {}) {
  const explicit = [
    fields.care_back_model_level,
    fields["CARE BACK Model Level"],
    fields.model_level,
    fields["Model Level"],
  ];
  for (const value of explicit) {
    const level = normalizeModelLevel(value);
    if (level) return level;
  }

  const text = token([
    fields.internal_code,
    fields.unique_key,
    fields.model_key,
    fields.model_record_id,
    fields.category,
    fields.category_path,
    fields.folder_name,
    fields.folder_scope_key,
    fields.r2_prefix,
    fields.private_tier,
    fields.tier,
    fields.package_code,
    fields.package,
    fields.sales_layer,
    fields.visibility,
    fields.private_work_format,
    fields.exclusive_group,
    fields.catalog_group,
  ].map(clean).filter(Boolean).join(" "));

  if (/(^|_)gws\d*(_|$)/.test(text) || text.includes("_gws_")) return "GWs";
  if (/(^|_)ems\d*(_|$)/.test(text) || text.includes("_ems_")) return "EMs";
  if (text.includes("premium") || /(^|_)pri_(prm|prem)(_|$)/.test(text) || text.includes("private_models_premium_package")) return "Premium";
  if (text.includes("standard") || /(^|_)pri_(std|str)(_|$)/.test(text) || text.includes("private_models_standard_package")) return "Standard Models";
  if (text.includes("public_models") || text.includes("sales_layer_public") || text.includes("visibility_public") || text.includes("travel") || text.includes("extreme")) return "Public Models";
  return "";
}

async function resolveCanonicalMember(env, bookingFields) {
  const table = env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || "Members";
  const contact = clean(bookingFields.client_contact || bookingFields["Contact Value"]);
  const email = contact.includes("@") ? contact.toLowerCase() : "";
  const lineOrMember = clean(bookingFields.line_or_member_id);
  const formulas = [];
  if (email) {
    formulas.push(`LOWER({email})=${formulaText(email)}`);
    formulas.push(`LOWER({Contact Email})=${formulaText(email)}`);
  }
  if (lineOrMember) {
    formulas.push(`{line_user_id}=${formulaText(lineOrMember)}`);
    formulas.push(`{line_id}=${formulaText(lineOrMember)}`);
    formulas.push(`{member_id}=${formulaText(lineOrMember)}`);
    formulas.push(`{memberstack_id}=${formulaText(lineOrMember)}`);
  }
  if (!formulas.length) throw new CareBackBookingContextError("CARE_BACK_MEMBER_CONTEXT_UNRESOLVED");

  const records = await collectUniqueRecords(env, table, formulas);
  if (!records.length) throw new CareBackBookingContextError("CARE_BACK_MEMBER_CONTEXT_UNRESOLVED");
  if (records.length !== 1) throw new CareBackBookingContextError("CARE_BACK_MEMBER_CONTEXT_CONFLICT");
  const memberId = clean(records[0].fields?.member_id);
  if (!memberId) throw new CareBackBookingContextError("CARE_BACK_MEMBER_CONTEXT_UNRESOLVED");
  return { member_id: memberId };
}

async function resolveCareBackClaim(env, memberId) {
  const table = env.AIRTABLE_TABLE_CARE_BACK_CLAIMS || "MMD — Campaign Claims";
  const formula = `AND({campaign_id}=${formulaText(CAMPAIGN_ID)},{matched_member_id}=${formulaText(memberId)})`;
  const records = await airtableList(env, table, formula, 2);
  if (!records.length) throw new CareBackBookingContextError("CARE_BACK_CLAIM_REQUIRED");
  if (records.length !== 1) throw new CareBackBookingContextError("CARE_BACK_CLAIM_CONFLICT");
  const fields = records[0].fields || {};
  const identityHash = clean(fields.line_user_id_hash).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(identityHash)) throw new CareBackBookingContextError("CARE_BACK_IDENTITY_CONTEXT_INVALID");
  return { claim_id: clean(fields.claim_id), line_user_id_hash: identityHash };
}

async function resolveCanonicalModel(env, bookingFields) {
  const table = env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || "Models";
  const selected = clean(bookingFields["Selected Model ID"] || bookingFields.resolved_model_key || bookingFields.model_search_query);
  if (!selected) throw new CareBackBookingContextError("CARE_BACK_MODEL_CONTEXT_UNRESOLVED");

  if (/^rec[A-Za-z0-9]{14}$/.test(selected)) {
    const record = await airtableRecord(env, table, selected);
    if (!record?.id) throw new CareBackBookingContextError("CARE_BACK_MODEL_CONTEXT_UNRESOLVED");
    return record;
  }

  const formulas = [
    `{unique_key}=${formulaText(selected)}`,
    `{canonical_slug}=${formulaText(selected)}`,
    `{model_key}=${formulaText(selected)}`,
    `{model_record_id}=${formulaText(selected)}`,
    `LOWER({working_name})=${formulaText(selected.toLowerCase())}`,
    `LOWER({nickname})=${formulaText(selected.toLowerCase())}`,
  ];
  const records = await collectUniqueRecords(env, table, formulas);
  if (!records.length) throw new CareBackBookingContextError("CARE_BACK_MODEL_CONTEXT_UNRESOLVED");
  if (records.length !== 1) throw new CareBackBookingContextError("CARE_BACK_MODEL_CONTEXT_CONFLICT");
  return records[0];
}

async function collectUniqueRecords(env, table, formulas) {
  const records = new Map();
  for (const formula of formulas) {
    let rows = [];
    try { rows = await airtableList(env, table, formula, 2); } catch { continue; }
    for (const row of rows) {
      if (row?.id) records.set(row.id, row);
      if (records.size > 1) return [...records.values()];
    }
  }
  return [...records.values()];
}

async function airtableRecord(env, table, recordId) {
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new CareBackBookingContextError("CARE_BACK_AIRTABLE_UNAVAILABLE", 503);
  return response.json();
}

async function airtableList(env, table, formula, maxRecords) {
  const qs = new URLSearchParams({ maxRecords: String(maxRecords), pageSize: String(Math.min(maxRecords, 100)) });
  if (formula) qs.set("filterByFormula", formula);
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  if (!response.ok) throw new CareBackBookingContextError("CARE_BACK_AIRTABLE_UNAVAILABLE", 503);
  const data = await response.json().catch(() => ({}));
  return Array.isArray(data.records) ? data.records : [];
}

function normalizeModelLevel(value) {
  const key = clean(value).toLowerCase().replace(/[\s_-]+/g, " ");
  if (["public", "public model", "public models"].includes(key)) return "Public Models";
  if (["standard", "standard model", "standard models"].includes(key)) return "Standard Models";
  if (["premium", "premium model", "premium models"].includes(key)) return "Premium";
  if (["em", "ems", "exclusive model", "exclusive models"].includes(key)) return "EMs";
  if (["gw", "gws", "gorgeous world", "gorgeous worlds"].includes(key)) return "GWs";
  return "";
}

function careBackProfileTier(value) {
  const tier = clean(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (tier === "black_card" || tier === "blackcard") return "Black Card";
  if (["premium", "vip", "svip"].includes(tier)) return "Premium";
  if (tier === "standard") return "Standard";
  return "Member";
}

function requireAirtable(env) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    throw new CareBackBookingContextError("CARE_BACK_AIRTABLE_UNAVAILABLE", 503);
  }
}
function formulaText(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function safeTimestamp(value) {
  const raw = clean(value);
  const parsed = Date.parse(raw);
  return raw && Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function clean(value) { return String(value ?? "").trim(); }
function token(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
