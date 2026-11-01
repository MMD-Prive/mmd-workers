import { privateRenewalTiming } from "../../shared/membership-promotion-policy.mjs";
// Read-only guard around the existing renewal offer/purchase owner.
// It never writes membership, Points, payment verification or historic evidence.
export const RENEWAL_PRICE_POLICY = "renewal_90_days_20261027";
const RULES = Object.freeze({
  standard: Object.freeze({ amount: 1000 }),
  premium: Object.freeze({ amount: 2500 }),
});
const token = value => String(value || "").trim().toLowerCase();
const isPackage = value => Object.hasOwn(RULES, value);
const json = (data, status = 200) => Response.json(data, {
  status, headers: { "cache-control": "no-store", "x-mmd-renewal-policy": RENEWAL_PRICE_POLICY },
});

export function evaluateRenewalEligibility(session, spend, requestedPackage = "", now = new Date()) {
  const current = token(session?.memberProfile?.tier);
  const selected = token(requestedPackage) || current;
  if (session?.memberExists !== true || !isPackage(current)) return { state: "defer" };
  if (!isPackage(selected)) return { state: "invalid" };
  const base = { package_code: selected, current_package_code: current,
    current_expires_at: session.memberProfile?.membership_expires_at || null,
    pricing_policy: RENEWAL_PRICE_POLICY };
  if (["blocked", "suspended", "revoked", "pending_review", "under_review"].includes(token(session.memberProfile?.membership_status))) {
    return { ...base, state: "review", reason: "membership_review" };
  }
  // Switching an active tier requires reviewed settlement semantics, not merely
  // replacing the current member tier in the quote. Do not downgrade benefits.
  if (selected !== current) return { ...base, state: "review", reason: "package_change_review" };
  // Existing active members may prepay from their verified future expiry even
  // when their service spend is below a spend-based renewal threshold.
  // The existing offer owner still resolves the term, promotion and settlement.
  const timing = privateRenewalTiming(session.memberProfile?.membership_expires_at, now);
  if (timing?.active && token(session.memberProfile?.membership_status) === "active") {
    return { ...base, state: "eligible", amount_thb: RULES[selected].amount,
      price_rule: `active_advance_${selected}`, renewal_starts_at: timing.start_at,
      history_status: "not_required_for_advance", discount_verified: true };
  }
  if (timing?.expired_within_90_days) return { ...base, state: "eligible", amount_thb: RULES[selected].amount,
    price_rule: `expired_within_90_days_${selected}`, renewal_starts_at: timing.start_at,
    history_status: "not_required_for_90_day_renewal", discount_verified: true };
  return { ...base, state: "review", reason: timing?.expiry_known
    ? "renewal_expired_over_90_days_review_required" : "canonical_expiry_required" };
}

function reviewResponse(context, method) {
  const { state, ...safe } = context;
  if (method === "POST") return json({ ok: false, error: { code: "LIFF_RENEWAL_REVIEW_REQUIRED" },
    reason: safe.reason, payment_available: false, entitlement_granted: false }, 409);
  return json({ ok: true, schema: "mmd_liff_renewal_offer_v1", ...safe,
    status: "contact_owner", payment_available: false, amount_thb: null,
    entitlement_granted: false, official_verification_required: true });
}

export async function withLiffRenewalEligibility(request, env, next, { readSession, readSpend }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  const offer = path === "/member/api/liff/renewal/offer" && request.method === "GET";
  const purchase = path === "/member/api/liff/renewal/purchase" && request.method === "POST";
  if ((!offer && !purchase) || token(env?.LIFF_RENEWAL_CARD_ENABLED) !== "true") return next();
  let selected = "";
  if (purchase) {
    // Preserve the existing owner's validation/error contract before doing reads.
    const body = await request.clone().json().catch(() => null);
    const origin = request.headers.get("origin");
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some(key => key !== "package_code")
      || request.headers.get("sec-fetch-site") === "cross-site"
      || (origin && !["https://mmdbkk.com", "https://www.mmdbkk.com", "https://mmdprive.webflow.io"].includes(origin))) return next();
    selected = token(body.package_code);
    if (!isPackage(selected)) return next();
  } else {
    if (url.searchParams.getAll("package_code").length > 1) return json({ ok: false, error: { code: "INVALID_PACKAGE" } }, 400);
    selected = token(url.searchParams.get("package_code"));
    if (selected && !isPackage(selected)) return json({ ok: false, error: { code: "INVALID_PACKAGE" } }, 400);
  }
  let session;
  try { session = await readSession(request, env); } catch {
    return json({ ok: false, error: { code: "LINE_SESSION_REQUIRED" }, auth_required: true }, 401);
  }
  if (!/^U[0-9a-f]{32}$/i.test(session?.lineUserId || "")) return json({ ok: false, error: { code: "LINE_SESSION_REQUIRED" }, auth_required: true }, 401);
  if (session.readGraceOnly) return json({ ok: false, error: { code: "LINE_SESSION_REFRESH_REQUIRED" }, auth_required: true }, 401);
  const now = new Date();
  let context = evaluateRenewalEligibility(session, null, selected, now);
  if (context.state === "defer") return next();
  if (context.state === "review") return reviewResponse(context, request.method);
  if (context.state !== "eligible") return json({ ok: false, error: { code: "INVALID_PACKAGE" } }, 400);

  // The existing handler re-resolves identity, term and price; it alone creates
  // the pending payment reference. No grant is made by this guard.
  const response = await next(session);
  if (!offer || !response.ok || !String(response.headers.get("content-type") || "").includes("application/json")) return response;
  const payload = await response.clone().json().catch(() => null);
  if (payload?.ok !== true || payload.status !== "ready") return response;
  if (payload.package_code !== context.package_code || payload.amount_thb !== context.amount_thb) {
    return reviewResponse({ ...context, state: "review", reason: "price_policy_review" }, "GET");
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length"); headers.delete("etag");
  headers.set("cache-control", "no-store"); headers.set("x-mmd-renewal-policy", RENEWAL_PRICE_POLICY);
  const { state, ...safe } = context;
  return new Response(JSON.stringify({ ...payload, ...safe }), { status: response.status, headers });
}
