import { CareBackStoreError, getCareBackStore } from "./care-back-claim-store.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const APPROVAL_PATH = "/__internal/care-back/approve-booking";
const MEMBER_PROFILE_PATH = "/__internal/member-profile/read";
const SERVICE_HEADER = "x-mmd-sigil-booking-secret";
const MEMBER_RESOLVER_HEADER = "x-mmd-member-resolver-secret";
const LINE_ID_RE = /^U[0-9a-f]{32}$/i;
const RECORD_ID_RE = /^rec[A-Za-z0-9]{14}$/;

export function isTrustedCareBackBookingApproval(request) {
  const url = request instanceof Request ? new URL(request.url) : new URL(String(request));
  return normalizePath(url.pathname) === APPROVAL_PATH;
}

export async function handleTrustedCareBackBookingApproval(request, env = {}) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "POST" });
  if (!authorized(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return json({ ok: false, error: "airtable_not_configured" }, 503);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_json" }, 400);
  if (Object.prototype.hasOwnProperty.call(body, "approved_discount_percent") || Object.prototype.hasOwnProperty.call(body, "discount_percent")) {
    return json({ ok: false, error: "caller_discount_authority_rejected" }, 400);
  }

  const lineUserId = clean(body.line_user_id);
  const jobFormat = normalizeJobFormat(body.job_format);
  const modelLookup = clean(body.model_record_id || body.selected_model_id || body.resolved_model_key || body.selected_model_name);
  if (!LINE_ID_RE.test(lineUserId)) return json({ ok: false, status: "review_required", error: "care_back_line_identity_unresolved" }, 409);
  if (!jobFormat) return json({ ok: false, status: "review_required", error: "care_back_job_format_unresolved" }, 409);
  if (!modelLookup) return json({ ok: false, status: "review_required", error: "care_back_model_unresolved" }, 409);

  const member = await resolveMember(env, lineUserId);
  if (!member?.member_exists || !member.member_id || !member.profile) {
    return json({ ok: false, status: "not_applicable", error: "care_back_member_not_resolved" }, 409);
  }

  const model = await resolveCanonicalModel(env, modelLookup);
  if (!model?.id) return json({ ok: false, status: "review_required", error: "care_back_model_not_resolved" }, 409);

  const modelLevel = canonicalModelLevel(model.fields || {});
  if (!modelLevel) return json({ ok: false, status: "review_required", error: "care_back_model_level_unresolved" }, 409);
  if (!modelSupportsJobFormat(model.fields || {}, jobFormat)) {
    return json({ ok: false, status: "review_required", error: "care_back_job_format_not_allowed_for_model" }, 409);
  }

  const publicModelPercent = modelLevel === "Public Models" ? canonicalPublicPercent(model.fields || {}) : null;
  if (modelLevel === "Public Models" && !publicModelPercent) {
    return json({ ok: false, status: "review_required", error: "care_back_public_rate_unresolved" }, 409);
  }

  const store = getCareBackStore(env);
  if (!store?.approveCouponDiscount) return json({ ok: false, error: "care_back_store_not_configured" }, 503);

  try {
    const identityHash = await keyedDigest(env, `identity:${lineUserId}`);
    const approved = await store.approveCouponDiscount({
      identityHash,
      memberId: member.member_id,
      memberProfile: member.profile,
      modelLevel,
      jobFormat,
      publicModelPercent,
    });
    return json({
      ok: true,
      status: "approved",
      booking_ref: clean(body.booking_ref) || null,
      session_id: clean(body.session_id) || null,
      model_record_id: model.id,
      model_level: approved.model_level,
      job_format: approved.job_format,
      approved_discount_percent: approved.approved_discount_percent,
      activated_at: approved.activated_at,
      expires_at: approved.expires_at,
      single_use: approved.single_use === true,
      authority: "care_back_backend_verified_booking_v1",
    });
  } catch (error) {
    const code = error instanceof CareBackStoreError ? error.code : "CARE_BACK_APPROVAL_UNAVAILABLE";
    const notApplicable = ["CARE_BACK_CLAIM_REQUIRED", "CARE_BACK_COUPON_REQUIRED"].includes(code);
    const reviewRequired = !notApplicable && [
      "CARE_BACK_WISH_REQUIRED",
      "CARE_BACK_ELIGIBILITY_UNRESOLVED",
      "CARE_BACK_DISCOUNT_CONTEXT_UNRESOLVED",
      "CARE_BACK_COUPON_VERIFICATION_REQUIRED",
      "CARE_BACK_COUPON_RENEWAL_REQUIRED",
    ].includes(code);
    return json({
      ok: false,
      status: notApplicable ? "not_applicable" : reviewRequired ? "review_required" : "unavailable",
      error: code,
    }, notApplicable || reviewRequired ? 409 : 503);
  }
}

async function resolveMember(env, lineUserId) {
  const upstream = env.MEMBER_STATUS_RESOLVER;
  const secret = clean(env.MEMBER_STATUS_RESOLVER_SECRET);
  if (!upstream?.fetch || secret.length < 32) return null;
  const response = await upstream.fetch(new Request(`https://mmd-auth-worker.internal${MEMBER_PROFILE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", [MEMBER_RESOLVER_HEADER]: secret },
    body: JSON.stringify({ line_user_id: lineUserId, purpose: "liff_member_profile_read" }),
  }));
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) return null;
  return payload.data || null;
}

async function resolveCanonicalModel(env, lookup) {
  const table = clean(env.AIRTABLE_TABLE_MODELS_ID || env.AIRTABLE_TABLE_MODELS || "tblI4B0bI446vp9GX");
  if (RECORD_ID_RE.test(lookup)) {
    const response = await airtable(env, `/${encodeURIComponent(table)}/${encodeURIComponent(lookup)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`airtable_${response.status}`);
    return response.json();
  }

  const formula = `OR({unique_key}=${formulaText(lookup)},{working_name}=${formulaText(lookup)},{nickname}=${formulaText(lookup)})`;
  const qs = new URLSearchParams({ maxRecords: "2", pageSize: "2", filterByFormula: formula });
  const response = await airtable(env, `/${encodeURIComponent(table)}?${qs.toString()}`);
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  const data = await response.json().catch(() => ({}));
  const rows = Array.isArray(data.records) ? data.records : [];
  return rows.length === 1 ? rows[0] : null;
}

function canonicalModelLevel(fields) {
  const explicit = clean(fields.care_back_model_level || fields["CARE BACK Model Level"]);
  const source = token(explicit || fields.model_tier || fields.sales_layer || fields.service_layer);
  if (source.includes("public")) return "Public Models";
  if (source === "standard" || source.includes("standard_model")) return "Standard Models";
  if (source === "premium" || source.includes("premium_model")) return "Premium";
  if (source === "ems" || source === "em" || source.includes("exclusive_model")) return "EMs";
  if (source === "gws" || source === "gw" || source.includes("gorgeous_world")) return "GWs";
  return "";
}

function canonicalPublicPercent(fields) {
  const raw = fields.care_back_public_discount_percent ?? fields["CARE BACK Public Discount %"];
  if (raw === undefined || raw === null || raw === "") return 5;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 3 && value <= 5 ? value : 0;
}

function modelSupportsJobFormat(fields, jobFormat) {
  const raw = fields.job_types ?? fields["Job Types"];
  if (raw === undefined || raw === null || raw === "") return true;
  const values = Array.isArray(raw) ? raw : String(raw).split(/[;,|/]+/);
  return values.map((value) => normalizeJobFormat(value)).filter(Boolean).includes(jobFormat);
}

function normalizeJobFormat(value) {
  const key = clean(value).toUpperCase();
  return key === "PN" || key === "VIP" ? key : "";
}

async function keyedDigest(env, value) {
  const secret = clean(env.LIFF_SESSION_SECRET);
  if (secret.length < 32) throw new CareBackStoreError("LIFF_SESSION_SECRET_MISSING");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function airtable(env, suffix) {
  return fetch(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}${suffix}`, {
    headers: { authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`, accept: "application/json" },
  });
}

function authorized(request, env) {
  const expected = clean(env.AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES);
  const actual = clean(request.headers.get(SERVICE_HEADER));
  return expected.length >= 32 && actual.length === expected.length && timingSafeEqual(expected, actual);
}

function timingSafeEqual(a, b) {
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

function formulaText(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function token(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
function clean(value) { return String(value ?? "").trim(); }
function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders },
  });
}
