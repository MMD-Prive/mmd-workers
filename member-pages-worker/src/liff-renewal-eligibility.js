// Read-only guard around the existing renewal offer/purchase owner.
// It never writes membership, Points, payment verification or historic evidence.
export const RENEWAL_PRICE_POLICY = "renewal_spend_365_20261025";
const RULES = Object.freeze({
  standard: Object.freeze({ amount: 1000, threshold: 10000 }),
  premium: Object.freeze({ amount: 2500, threshold: 20000 }),
});
const token = value => String(value || "").trim().toLowerCase();
const isPackage = value => Object.hasOwn(RULES, value);
const json = (data, status = 200) => Response.json(data, {
  status, headers: { "cache-control": "no-store", "x-mmd-renewal-policy": RENEWAL_PRICE_POLICY },
});

export function evaluateRenewalEligibility(session, spend, requestedPackage = "") {
  const current = token(session?.memberProfile?.tier);
  const selected = token(requestedPackage) || current;
  if (session?.memberExists !== true || !isPackage(current)) return { state: "defer" };
  if (!isPackage(selected)) return { state: "invalid" };
  const base = { package_code: selected, current_package_code: current,
    current_expires_at: session.memberProfile?.membership_expires_at || null,
    threshold_thb: RULES[selected].threshold, pricing_policy: RENEWAL_PRICE_POLICY };
  if (["blocked", "suspended", "revoked", "pending_review", "under_review"].includes(token(session.memberProfile?.membership_status))) {
    return { ...base, state: "review", reason: "membership_review" };
  }
  // Switching an active tier requires reviewed settlement semantics, not merely
  // replacing the current member tier in the quote. Do not downgrade benefits.
  if (selected !== current) return { ...base, state: "review", reason: "package_change_review" };
  const recovery = token(spend?.recoveryState);
  if (spend?.state !== "resolved" || spend?.sourceVerified !== true || spend?.serviceSpendVerified !== true
      || spend?.pointsRecoveryPending === true || (spend?.recordsCount === 0 && spend?.serviceSpendCoverageVerified !== true) || ["checking", "in_progress", "review_required", "blocked"].includes(recovery)
      || typeof spend?.serviceSpend365Thb !== "number" || !Number.isFinite(spend.serviceSpend365Thb)
      || spend.serviceSpend365Thb < 0) {
    return { ...base, state: "review", reason: "history_pending", service_spend_365_thb: null, history_status: "checking" };
  }
  const verified = { ...base, service_spend_365_thb: spend.serviceSpend365Thb, history_status: "verified" };
  if (spend.serviceSpend365Thb < RULES[selected].threshold) {
    // A known zero is not evidence that someone has never been a paid member.
    // The owner has not approved a below-threshold renewal price or exception.
    return { ...verified, state: "review", reason: "below_threshold_price_review" };
  }
  return { ...verified, state: "eligible", amount_thb: RULES[selected].amount, discount_verified: true };
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
  const path = url.pathname.replace(/\/+$/, "");
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
  try { session = await readSession(request, env); } catch { return next(); }
  if (!/^U[0-9a-f]{32}$/i.test(session?.lineUserId || "")) return next();
  let context = evaluateRenewalEligibility(session, null, selected);
  if (context.state === "defer") return next();
  if (!["package_change_review", "membership_review"].includes(context.reason)) {
    let spend = null;
    try { spend = await readSpend(env, { ...session, strictIdentity: true }); } catch { /* unknown is never zero */ }
    context = evaluateRenewalEligibility(session, spend, selected);
  }
  if (context.state === "review") return reviewResponse(context, request.method);
  if (context.state !== "eligible") return json({ ok: false, error: { code: "INVALID_PACKAGE" } }, 400);

  // The existing handler re-resolves identity, term and price; it alone creates
  // the pending payment reference. No grant is made by this guard.
  const response = await next();
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
