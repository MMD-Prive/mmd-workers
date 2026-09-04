import { CareBackStoreError, getCareBackStore } from "./care-back-claim-store.js";

export const CARE_BACK_BOOKING_APPROVAL_PATH = "/__internal/care-back/coupon/approve-booking";
const AUTHORITY = "care_back_coupon_v2_2";
const ENTITLEMENT_AUTHORITY = "my_mmd_entitlement_resolver_v1";
const TRUSTED_CALLER = "sigil-booking-worker";

export function isCareBackBookingApprovalPath(pathname = "") {
  return normalizePath(pathname) === CARE_BACK_BOOKING_APPROVAL_PATH;
}

export async function handleCareBackBookingApproval(request, env = {}) {
  if (String(env.CARE_BACK_STAGING_MODE || "").trim().toLowerCase() === "synthetic") {
    return json({ ok: false, error: "not_found", authority: AUTHORITY }, 404);
  }
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed", authority: AUTHORITY }, 405);
  if (clean(request.headers.get("x-mmd-service-caller")) !== TRUSTED_CALLER) {
    return json({ ok: false, error: "trusted_service_required", authority: AUTHORITY }, 401);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_request", authority: AUTHORITY }, 400);
  }

  const identityHash = clean(body.identity_hash).toLowerCase();
  const memberId = clean(body.member_id);
  const bookingRef = safeText(body.booking_ref, 180);
  const couponCode = clean(body.coupon_code).toUpperCase();
  const memberProfile = body.member_profile && typeof body.member_profile === "object" && !Array.isArray(body.member_profile)
    ? body.member_profile
    : {};
  const eligibility = body.eligibility && typeof body.eligibility === "object" && !Array.isArray(body.eligibility)
    ? body.eligibility
    : {};

  if (!/^[a-f0-9]{64}$/.test(identityHash)) {
    return json({ ok: false, error: "identity_hash_required", authority: AUTHORITY }, 400);
  }
  if (!memberId || memberId.length > 160 || /[\u0000-\u001f\u007f]/.test(memberId)) {
    return json({ ok: false, error: "member_id_required", authority: AUTHORITY }, 400);
  }
  if (couponCode && !/^[A-HJ-NP-Z2-9]{6}$/.test(couponCode)) {
    return json({ ok: false, error: "coupon_code_invalid", authority: AUTHORITY }, 400);
  }

  const customerEligibilityValid = eligibility.authority === ENTITLEMENT_AUTHORITY
    && eligibility.member_blocked === false
    && eligibility.booking_allowed === true
    && eligibility.payment_verified === true;
  const membershipStatus = clean(memberProfile.membership_status).toLowerCase();
  if (!customerEligibilityValid || !["active", "grace"].includes(membershipStatus)) {
    return json({ ok: false, error: "care_back_customer_eligibility_unresolved", authority: AUTHORITY }, 409);
  }

  const jobFormat = normalizeJobFormat(body.job_format);
  const modelServiceLevel = normalizeModelServiceLevel(eligibility.model_service_level);
  const modelJobEligible = eligibility.model_job_eligible === true
    && Boolean(jobFormat)
    && (modelServiceLevel === "VIP" || (modelServiceLevel === "PN" && jobFormat === "PN"));
  if (!modelJobEligible) {
    return json({ ok: false, error: "care_back_model_job_format_not_eligible", authority: AUTHORITY }, 409);
  }

  const store = getCareBackStore(env);
  if (!store || typeof store.approveCouponDiscount !== "function") {
    return json({ ok: false, error: "care_back_store_unavailable", authority: AUTHORITY }, 503);
  }

  try {
    const approved = await store.approveCouponDiscount({
      identityHash,
      memberId,
      memberProfile,
      modelLevel: body.model_level,
      jobFormat,
      publicModelPercent: body.public_model_percent ?? null,
      now: new Date(),
    });

    if (couponCode && approved.code !== couponCode) {
      return json({ ok: false, error: "care_back_coupon_mismatch", authority: AUTHORITY }, 409);
    }

    return json({
      ok: true,
      data: {
        authority: AUTHORITY,
        booking_ref: bookingRef || null,
        model_level: approved.model_level,
        model_service_level: modelServiceLevel,
        job_format: approved.job_format,
        approved_discount_percent: approved.approved_discount_percent,
        activated_at: approved.activated_at,
        expires_at: approved.expires_at,
        status: approved.status,
        single_use: approved.single_use === true,
      },
    }, 200);
  } catch (error) {
    const code = error instanceof CareBackStoreError ? error.code : "CARE_BACK_APPROVAL_UNAVAILABLE";
    return json({ ok: false, error: code, authority: AUTHORITY }, careBackErrorStatus(code));
  }
}

function normalizeJobFormat(value) {
  const format = clean(value).toUpperCase();
  return format === "PN" || format === "VIP" ? format : "";
}
function normalizeModelServiceLevel(value) {
  const level = clean(value).toLowerCase().replace(/[\s_-]+/g, " ");
  if (["vip", "both", "pn vip", "vip pn"].includes(level)) return "VIP";
  if (level === "pn") return "PN";
  return "";
}
function careBackErrorStatus(code) {
  if (["CARE_BACK_IDENTITY_INVALID", "CARE_BACK_MEMBER_INVALID", "CARE_BACK_CLOCK_INVALID"].includes(code)) return 400;
  if (code === "CARE_BACK_CODE_SECRET_MISSING" || code === "CARE_BACK_STORAGE_UNAVAILABLE" || code === "CARE_BACK_APPROVAL_UNAVAILABLE") return 503;
  return 409;
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function clean(value) { return String(value ?? "").trim(); }
function safeText(value, maxLength) {
  return clean(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, maxLength);
}
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
