// LIFF renewal card (owner decision 2026-10-12): customers renew inside My MMD,
// then continue to the same public /pay/checkout page the signup flow uses.
//
// Safety model (same as public-membership-payment.js):
// - Amount, dates and promotion are computed on the server from the canonical
//   renewal policy; the browser may only send `package_code`.
// - Creating the payment intent never grants anything (entitlement_granted:false).
// - Off by default: both routes answer 404 unless LIFF_RENEWAL_CARD_ENABLED="true".
import { addBangkokCalendarYears, applyMembershipPromotion } from "../../shared/membership-promotion-policy.mjs";
import { readMemberAppSession, rememberMemberPaymentSnapshot } from "./member-app-api.js";
import { resolveCanonicalRenewalOffer } from "./renewal-offer.js";

const ROOT = "/member/api/liff/renewal";
const OFFER_PATH = ROOT + "/offer";
const PURCHASE_PATH = ROOT + "/purchase";
const ALLOWED_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com", "https://mmdprive.webflow.io"]);
const PACKAGE_LABELS = Object.freeze({ standard: "Standard", premium: "Premium" });

const clean = (value, max = 300) => String(value == null ? "" : value).trim().slice(0, max);
const enabled = (env) => clean(env?.LIFF_RENEWAL_CARD_ENABLED, 12).toLowerCase() === "true";

function normalizePath(value) {
  const path = clean(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store", "x-mmd-liff-renewal-card": "v1" } });
}

function sameOrigin(request) {
  const origin = clean(request.headers.get("origin"), 240);
  return !origin || ALLOWED_ORIGINS.has(origin);
}

export function isLiffRenewalCardPath(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  const path = normalizePath(url.pathname);
  return path === OFFER_PATH || path === PURCHASE_PATH;
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret || "")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// New session id once the expiry moves (after a completed renewal), the same
// one while the same renewal is pending, so retries resume the same intent.
async function renewalSessionId(env, lineUserId, packageCode, expiry) {
  const secret = clean(env.LIFF_SESSION_SECRET, 5000);
  if (secret.length < 32) throw new Error("liff_renewal_session_secret_unavailable");
  const digest = await hmacHex(secret, `liff-renewal:${lineUserId}:${packageCode}:${expiry}`);
  return `liffrenew_${packageCode}_${digest.slice(0, 24)}`;
}

function sessionForOffer(session) {
  return {
    liff_intent: "renew",
    member_exists: session.memberExists === true,
    line_user_id: session.lineUserId,
    member_profile: session.memberProfile || {},
  };
}

function expiryAfter(offer) {
  const start = new Date(offer.membership_start_at);
  if (!Number.isFinite(start.getTime())) return null;
  const base = addBangkokCalendarYears(new Date(start), Number(offer.membership_years));
  const withPromo = offer.promotion ? applyMembershipPromotion(new Date(base), offer.promotion, { start_at: offer.membership_start_at }) : null;
  const result = withPromo || base;
  return Number.isFinite(result.getTime()) ? result.toISOString() : null;
}

function promoLabel(promotion) {
  if (!promotion) return "";
  const years = Number(promotion.bonus_years || 0);
  const days = Number(promotion.bonus_days || 0);
  if (years > 0) return `โปรต่ออายุ: เพิ่ม ${years} ปี`;
  if (days > 0) return `โปรต่ออายุ: เพิ่ม ${days} วัน`;
  return "";
}

async function resolveOffer(request, env) {
  const session = await readMemberAppSession(request, env);
  if (!session?.lineUserId) return { error: json({ ok: false, error: { code: "LINE_SESSION_REQUIRED" }, auth_required: true }, 401) };
  let offer;
  try { offer = await resolveCanonicalRenewalOffer(env, sessionForOffer(session)); }
  catch { offer = { status: "review_required", reason: "renewal_offer_resolution_failed" }; }
  return { session, offer };
}

async function handleOffer(request, env) {
  if (request.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  const { session, offer, error } = await resolveOffer(request, env);
  if (error) return error;
  if (offer.status !== "ready") {
    // new_signup => send to signup; anything else => talk to the owner. Never a payment button.
    return json({
      ok: true,
      schema: "mmd_liff_renewal_offer_v1",
      status: offer.classification === "new_signup" ? "signup_instead" : "contact_owner",
      payment_available: false,
    });
  }
  const profileExpiry = clean(session.memberProfile?.membership_expires_at, 40);
  return json({
    ok: true,
    schema: "mmd_liff_renewal_offer_v1",
    status: "ready",
    payment_available: true,
    package_code: offer.package_code,
    package_label: PACKAGE_LABELS[offer.package_code] || offer.package_code,
    amount_thb: offer.amount_thb,
    current_expires_at: Number.isFinite(Date.parse(profileExpiry)) ? new Date(profileExpiry).toISOString() : null,
    renewal_starts_at: offer.membership_start_at,
    new_expires_at: expiryAfter(offer),
    promotion_label: promoLabel(offer.promotion),
    price_rule: offer.price_rule,
    entitlement_granted: false,
    official_verification_required: true,
  });
}

function canonicalCheckoutUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const keys = [...url.searchParams.keys()];
    if (url.protocol !== "https:" || url.hostname !== "mmdbkk.com" || url.pathname !== "/pay/checkout" || url.hash) return "";
    if (keys.length !== 1 || keys[0] !== "t" || !url.searchParams.get("t")) return "";
    return url.toString();
  } catch { return ""; }
}

async function createPaymentIntent(env, { sessionId, offer }) {
  if (!env.PAYMENTS_WORKER?.fetch) throw new Error("payments_worker_not_configured");
  const response = await env.PAYMENTS_WORKER.fetch(new Request("https://payments.internal/v1/pay/verify", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "x-mmd-source": "member-pages-worker" },
    body: JSON.stringify({
      session_id: sessionId,
      payment_stage: "membership",
      amount: offer.amount_thb,
      package_code: offer.package_code,
      payment_method: "promptpay",
      notes: `source=line_liff;intent=renew;requested_stage=renewal;renewal_price_rule=${clean(offer.price_rule, 80)};official_verify_required=true`,
    }),
  }));
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    const error = new Error(clean(payload?.error || "liff_renewal_payment_intent_failed"));
    error.status = response.status >= 500 ? 503 : 502;
    throw error;
  }
  const redirect = canonicalCheckoutUrl(payload.customer_payment_url);
  if (!redirect || payload.unified_payment_flow !== "v1") {
    const error = new Error("payments_worker_public_surface_contract_invalid");
    error.status = 502;
    throw error;
  }
  return { payment_ref: clean(payload.payment_ref, 220), session_id: clean(payload.session_id || sessionId, 220), customer_payment_url: redirect };
}

async function handlePurchase(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  if (!sameOrigin(request)) return json({ ok: false, error: { code: "SAME_ORIGIN_REQUIRED" } }, 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: { code: "INVALID_JSON" } }, 400);
  if (Object.keys(body).some((key) => key !== "package_code")) return json({ ok: false, error: { code: "BROWSER_PAYMENT_AUTHORITY_REJECTED" } }, 400);

  const { session, offer, error } = await resolveOffer(request, env);
  if (error) return error;
  if (offer.status !== "ready") return json({ ok: false, error: { code: "LIFF_RENEWAL_OFFER_UNAVAILABLE" } }, 409);
  if (clean(body.package_code, 40).toLowerCase() !== offer.package_code) {
    return json({ ok: false, error: { code: "LIFF_RENEWAL_PACKAGE_CHANGE_REQUIRES_MEMBERSHIP_FLOW" } }, 409);
  }
  try {
    const sessionId = await renewalSessionId(env, session.lineUserId, offer.package_code, clean(session.memberProfile?.membership_expires_at, 40));
    const payment = await createPaymentIntent(env, { sessionId, offer });
    const remembered = await rememberMemberPaymentSnapshot(request, env, {
      payment_ref: payment.payment_ref,
      session_id: payment.session_id,
      payment_stage: "membership",
      package_code: offer.package_code,
      amount_thb: offer.amount_thb,
      customer_payment_url: payment.customer_payment_url,
    });
    if (!remembered) {
      const failure = new Error("LIFF_RENEWAL_PAYMENT_STATE_PERSIST_FAILED");
      failure.status = 503;
      throw failure;
    }
    return json({
      ok: true,
      schema: "mmd_liff_renewal_purchase_v1",
      package: { package_code: offer.package_code, amount_thb: offer.amount_thb },
      payment_ref: payment.payment_ref,
      session_id: payment.session_id,
      customer_payment_url: payment.customer_payment_url,
      redirect_to: payment.customer_payment_url,
      evidence_only_until_verified: true,
      official_verification_required: true,
      entitlement_granted: false,
    });
  } catch (failure) {
    return json({ ok: false, error: { code: clean(failure?.message || "LIFF_RENEWAL_PAYMENT_UNAVAILABLE", 220) } }, Number(failure?.status || 503));
  }
}

export async function handleLiffRenewalCard(request, env = {}) {
  if (!enabled(env)) return json({ ok: false, error: { code: "LIFF_RENEWAL_CARD_DISABLED" } }, 404);
  const path = normalizePath(new URL(request.url).pathname);
  if (path === OFFER_PATH) return handleOffer(request, env);
  if (path === PURCHASE_PATH) return handlePurchase(request, env);
  return json({ ok: false, error: { code: "LIFF_RENEWAL_ROUTE_NOT_FOUND" } }, 404);
}

export const LIFF_RENEWAL_CARD_INTERNALS = Object.freeze({ expiryAfter, promoLabel, canonicalCheckoutUrl, renewalSessionId });
