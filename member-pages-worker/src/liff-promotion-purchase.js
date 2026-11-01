import { readMemberAppSession, rememberMemberPaymentSnapshot } from "./member-app-api.js";
import { LIFF_RENEWAL_CARD_INTERNALS } from "./liff-renewal-card.js";

const ROOT = "/member/api/liff/promotions/double-moment";
const ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const clean = (value) => String(value || "").trim();
const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store, private" } });
export function isLiffPromotionPurchasePath(input) {
  const path = (input instanceof URL ? input : new URL(input)).pathname.replace(/\/+$/, "");
  return path === ROOT + "/offer" || path === ROOT + "/purchase";
}

// Only this server bridge holds the service credential. No client-selected
// identity, prices, credit amounts, campaign ids or redirect URLs are accepted.
export async function handleLiffPromotionPurchase(request, env = {}) {
  if (!isLiffPromotionPurchasePath(request.url)) return json({ ok: false }, 404);
  if (env.LIFF_PROMOTION_PURCHASE_ENABLED !== "true") return json({ ok: false, error: { code: "PROMOTION_PURCHASE_DISABLED" } }, 404);
  const purchase = new URL(request.url).pathname.replace(/\/+$/, "").endsWith("/purchase");
  if (request.method !== (purchase ? "POST" : "GET")) return json({ ok: false }, 405);
  if (purchase) {
    const origin = request.headers.get("origin");
    if ((origin && !ORIGINS.has(origin)) || request.headers.get("sec-fetch-site") === "cross-site") return json({ ok: false }, 403);
    const body = await request.json().catch(() => null);
    if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || body.package_code !== "double_moment_20000") return json({ ok: false, error: { code: "BROWSER_PAYMENT_AUTHORITY_REJECTED" } }, 400);
  }
  const session = await readMemberAppSession(request, env);
  if (!session?.lineUserId) return json({ ok: false, auth_required: true }, 401);
  const token = clean(env.AUTH_SERVICE_MEMBER_TO_PAYMENTS);
  if (!token || !env.PAYMENTS_WORKER?.fetch) return json({ ok: false, error: { code: "PROMOTION_UNAVAILABLE" } }, 503);
  try {
    const upstream = await env.PAYMENTS_WORKER.fetch(new Request("https://payments.internal/v1/confirm/double-moment/" + (purchase ? "start" : "offer"), {
      method: "POST", headers: { "content-type": "application/json", "x-internal-token": token },
      body: JSON.stringify({ line_user_id: session.lineUserId, member_id: session.memberId || "" }),
      signal: AbortSignal.timeout(8000),
    }));
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || payload?.ok !== true) return json({ ok: false, error: { code: upstream.status === 422 ? "CANONICAL_CLIENT_REQUIRED" : "PROMOTION_UNAVAILABLE" } }, upstream.status === 422 ? 409 : 503);
    if (payload.already_activated === true || payload.status === "already_activated") return json({ ok: true, status: "already_activated", payment_available: false, entitlement_granted: false });
    if (!purchase) {
      const fields = ["amount_thb", "paid_credit_thb", "bonus_1_thb", "bonus_2_thb", "total_credit_thb", "minimum_service_thb", "validity_days"];
      if (payload.status !== "ready" || payload.payment_available !== true || payload.package_code !== "double_moment_20000" || fields.some(key => !Number.isInteger(payload[key]) || payload[key] <= 0)) throw new Error("invalid_offer");
      return json({ ok: true, status: "ready", payment_available: true, package_code: payload.package_code, ...Object.fromEntries(fields.map(key => [key, payload[key]])), refundable: false, official_verification_required: true, entitlement_granted: false });
    }
    const checkout = LIFF_RENEWAL_CARD_INTERNALS.canonicalCheckoutUrl(payload.customer_payment_url);
    if (!checkout || !clean(payload.payment_ref) || !clean(payload.session_id) || payload.unified_payment_flow !== "v1" || payload.activation_state !== "awaiting_official_payment_verification" || payload.purchase_amount_thb !== 20000) throw new Error("invalid_payment");
    const remembered = await rememberMemberPaymentSnapshot(request, env, { payment_ref: payload.payment_ref, session_id: payload.session_id, payment_stage: "full", package_code: "double_moment_20000", amount_thb: payload.purchase_amount_thb, customer_payment_url: checkout });
    if (!remembered) throw new Error("state_not_saved");
    return json({ ok: true, status: "awaiting_official_payment_verification", payment_ref: payload.payment_ref, customer_payment_url: checkout, official_verification_required: true, entitlement_granted: false });
  } catch { return json({ ok: false, error: { code: "PROMOTION_UNAVAILABLE" } }, 503); }
}
