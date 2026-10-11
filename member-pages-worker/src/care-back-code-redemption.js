import { CareBackStoreError, getCareBackStore } from "./care-back-claim-store.js";
import {
  canonicalModelLevel,
  canonicalPublicPercent,
  modelSupportsJobFormat,
  normalizeJobFormat,
  resolveCanonicalModel,
} from "./care-back-trusted-booking-approval.js";

const REDEEM_PATH = "/__internal/care-back/redeem-code";
const SERVICE_HEADER = "x-mmd-payments-secret";

export function isTrustedCareBackCodeRedemption(request) {
  const url = request instanceof Request ? new URL(request.url) : new URL(String(request));
  return normalizePath(url.pathname) === REDEEM_PATH;
}

// Service-to-service only (payments-worker -> member-pages-worker). The caller
// supplies the entered code and the confirming session context; it can never
// supply a discount percent. The percent comes from Model level x job format.
export async function handleTrustedCareBackCodeRedemption(request, env = {}) {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "POST" });
  if (!authorized(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return json({ ok: false, error: "airtable_not_configured" }, 503);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_json" }, 400);
  for (const key of ["approved_discount_percent", "discount_percent", "percent"]) {
    if (Object.prototype.hasOwnProperty.call(body, key)) return json({ ok: false, error: "caller_discount_authority_rejected" }, 400);
  }

  const jobFormat = normalizeJobFormat(body.job_format);
  const modelLookup = clean(body.model_record_id || body.selected_model_id || body.selected_model_name);
  const sessionId = clean(body.session_id);
  if (!sessionId) return json({ ok: false, status: "review_required", error: "care_back_session_unresolved" }, 409);
  if (!jobFormat) return json({ ok: false, status: "review_required", error: "care_back_job_format_unresolved" }, 409);
  if (!modelLookup) return json({ ok: false, status: "review_required", error: "care_back_model_unresolved" }, 409);

  let model = null;
  try {
    model = await resolveCanonicalModel(env, modelLookup);
  } catch {
    return json({ ok: false, status: "unavailable", error: "care_back_model_lookup_unavailable" }, 503);
  }
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
  if (!store?.redeemCouponByCode) return json({ ok: false, error: "care_back_store_not_configured" }, 503);

  try {
    const redeemed = await store.redeemCouponByCode({
      code: body.code,
      sessionId,
      modelLevel,
      jobFormat,
      publicModelPercent,
    });
    return json({
      ok: true,
      status: "approved",
      session_id: sessionId,
      model_level: redeemed.model_level,
      job_format: redeemed.job_format,
      approved_discount_percent: redeemed.approved_discount_percent,
      expires_at: redeemed.expires_at,
      single_use: true,
      replayed: redeemed.replayed === true,
      authority: "care_back_backend_verified_code_redemption_v1",
    });
  } catch (error) {
    const code = error instanceof CareBackStoreError ? error.code : "CARE_BACK_REDEMPTION_UNAVAILABLE";
    const rejected = [
      "CARE_BACK_CODE_INVALID", "CARE_BACK_CODE_NOT_FOUND", "CARE_BACK_COUPON_USED",
      "CARE_BACK_COUPON_EXPIRED", "CARE_BACK_COUPON_UNAVAILABLE", "CARE_BACK_COUPON_NOT_READY",
      "CARE_BACK_WISH_REQUIRED",
    ].includes(code);
    const review = !rejected && ["CARE_BACK_CODE_CONFLICT", "CARE_BACK_DISCOUNT_CONTEXT_UNRESOLVED", "CARE_BACK_SESSION_INVALID"].includes(code);
    return json({
      ok: false,
      status: rejected ? "rejected" : review ? "review_required" : "unavailable",
      error: code,
    }, rejected || review ? 409 : 503);
  }
}

function authorized(request, env) {
  const expected = clean(env.AUTH_SERVICE_PAYMENTS_TO_MEMBER_PAGES);
  const actual = clean(request.headers.get(SERVICE_HEADER));
  return expected.length >= 32 && actual.length === expected.length && timingSafeEqual(expected, actual);
}
function timingSafeEqual(a, b) {
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}
function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function clean(value) { return String(value ?? "").trim(); }
function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders },
  });
}
