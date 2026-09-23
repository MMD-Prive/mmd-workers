import { getPublicMembershipPackage, PUBLIC_MEMBERSHIP_CATALOG } from "../../shared/payment-intelligence.mjs";
import { readMemberAppSession, rememberMemberPaymentSnapshot } from "./member-app-api.js";

const ROOT = "/member/api/liff/public-membership";
const CATALOG_PATH = ROOT + "/catalog";
const PURCHASE_PATH = ROOT + "/purchase";
const ALLOWED_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com", "https://mmdprive.webflow.io"]);

function clean(value, max = 300) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizePath(value) {
  const path = clean(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-mmd-public-membership-payment": "v1",
    },
  });
}

function sameOrigin(request) {
  const origin = clean(request.headers.get("origin"), 240);
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function purchaseSessionId(env, lineUserId, packageCode) {
  const secret = clean(env.LIFF_SESSION_SECRET, 5000);
  if (secret.length < 32) throw new Error("public_membership_session_secret_unavailable");
  const digest = await hmacHex(secret, "public-membership:" + lineUserId + ":" + packageCode);
  return "publicmem_" + packageCode + "_" + digest.slice(0, 24);
}

function publicCatalog() {
  return Object.values(PUBLIC_MEMBERSHIP_CATALOG).map((item) => ({
    package_code: item.package_code,
    label: item.label,
    amount_thb: item.amount_thb,
    duration_days: item.duration_days,
    entitlement_level: item.entitlement_level,
  }));
}

function canonicalPublicPaymentUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const keys = [...url.searchParams.keys()];
    if (url.protocol !== "https:" || url.hostname !== "mmdbkk.com" || url.pathname !== "/pay/checkout" || url.hash) return "";
    if (keys.length !== 1 || keys[0] !== "t" || !url.searchParams.get("t")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function createPaymentIntent(env, { sessionId, packageItem }) {
  if (!env.PAYMENTS_WORKER?.fetch) throw new Error("payments_worker_not_configured");
  const request = new Request("https://payments.internal/v1/pay/verify", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-mmd-source": "member-pages-worker",
    },
    body: JSON.stringify({
      session_id: sessionId,
      payment_stage: "membership",
      amount: packageItem.amount_thb,
      package_code: packageItem.package_code,
      payment_method: "promptpay",
      notes: "source=public_membership;official_verify_required=true",
    }),
  });
  const response = await env.PAYMENTS_WORKER.fetch(request);
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    const error = new Error(clean(payload?.error || "public_membership_payment_intent_failed"));
    error.status = response.status || 502;
    throw error;
  }
  const redirect = canonicalPublicPaymentUrl(payload.customer_payment_url);
  if (!redirect || payload.unified_payment_flow !== "v1") {
    const error = new Error("payments_worker_public_surface_contract_invalid");
    error.status = 502;
    throw error;
  }
  return {
    payment_ref: clean(payload.payment_ref, 220),
    session_id: clean(payload.session_id || sessionId, 220),
    redirect_to: redirect,
    customer_payment_url: redirect,
    payment_surface: "public",
  };
}

async function handlePurchase(request, env) {
  if (request.method !== "POST") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  if (!sameOrigin(request)) return json({ ok: false, error: { code: "SAME_ORIGIN_REQUIRED" } }, 403);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: { code: "INVALID_JSON" } }, 400);
  }
  if (Object.keys(body).some((key) => key !== "package_code")) {
    return json({ ok: false, error: { code: "BROWSER_PAYMENT_AUTHORITY_REJECTED" } }, 400);
  }

  const packageItem = getPublicMembershipPackage(body.package_code);
  if (!packageItem) return json({ ok: false, error: { code: "PUBLIC_PACKAGE_NOT_FOUND" } }, 404);

  const session = await readMemberAppSession(request, env);
  if (!session?.lineUserId) {
    return json({
      ok: false,
      error: { code: "LINE_SESSION_REQUIRED" },
      auth_required: true,
    }, 401);
  }

  try {
    const sessionId = await purchaseSessionId(env, session.lineUserId, packageItem.package_code);
    const payment = await createPaymentIntent(env, { sessionId, packageItem });
    const remembered = await rememberMemberPaymentSnapshot(request, env, {
      payment_ref: payment.payment_ref,
      session_id: payment.session_id,
      payment_stage: "membership",
      package_code: packageItem.package_code,
      amount_thb: packageItem.amount_thb,
      customer_payment_url: payment.customer_payment_url,
    });
    if (!remembered) {
      const error = new Error("PUBLIC_MEMBERSHIP_PAYMENT_STATE_PERSIST_FAILED");
      error.status = 503;
      throw error;
    }
    return json({
      ok: true,
      schema: "mmd_public_membership_purchase_v1",
      package: {
        package_code: packageItem.package_code,
        label: packageItem.label,
        amount_thb: packageItem.amount_thb,
        duration_days: packageItem.duration_days,
      },
      ...payment,
      evidence_only_until_verified: true,
      official_verification_required: true,
      entitlement_granted: false,
    });
  } catch (error) {
    return json({
      ok: false,
      error: { code: clean(error?.message || "PUBLIC_MEMBERSHIP_PAYMENT_UNAVAILABLE", 220) },
    }, Number(error?.status || 503));
  }
}

export function isPublicMembershipPaymentPath(input) {
  const url = input instanceof URL ? input : new URL(String(input));
  const path = normalizePath(url.pathname);
  return path === CATALOG_PATH || path === PURCHASE_PATH;
}

export async function handlePublicMembershipPayment(request, env = {}) {
  const path = normalizePath(new URL(request.url).pathname);
  if (path === CATALOG_PATH) {
    if (request.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, 405);
    return json({
      ok: true,
      schema: "mmd_public_membership_catalog_v1",
      packages: publicCatalog(),
      payment_surface: "/pay/checkout",
      official_verification_required: true,
    });
  }
  if (path === PURCHASE_PATH) return handlePurchase(request, env);
  return json({ ok: false, error: { code: "PUBLIC_MEMBERSHIP_ROUTE_NOT_FOUND" } }, 404);
}

export const PUBLIC_MEMBERSHIP_PAYMENT_INTERNALS = Object.freeze({
  publicCatalog,
  canonicalPublicPaymentUrl,
  purchaseSessionId,
});
