import liffFoundation from "./liff-identity-foundation.js";
import { getLiffGatewayStore } from "./liff-gateway-airtable.js";

const PAYMENT_INTENT_PATHS = new Set([
  "/member/api/liff/payment-intent",
  "/member/api/liff/payment-intent/",
]);
const SESSION_COOKIE = "__Host-mmd_liff_session";
const PAYMENT_TIMEOUT_MS = 8000;
const LIFF_SESSION_TTL_SECONDS = 15 * 60;
const PAYMENTS_INTENT_URL = "https://payments.internal/v1/pay/verify";
const CANONICAL_STATUS_ROUTE = "/member/payments";
const CONTRACT_UNAVAILABLE = "PAYMENT_TOKEN_CONTRACT_UNAVAILABLE";

export default {
  async fetch(request, env = {}, ctx) {
    if (!isLiffPaymentIntentRequest(request)) return liffFoundation.fetch(request, env, ctx);

    // Keep the foundation as the authorization and package-policy gate. Only a
    // request that passed its same-origin, LIFF-session, member, package and
    // stale-selection checks can reach the explicit contract-unavailable state.
    const replay = request.clone();
    const guardedResponse = await liffFoundation.fetch(request, env, ctx);
    return completeValidatedLiffPaymentIntent(replay, guardedResponse, env);
  },
};

export function isLiffPaymentIntentRequest(request) {
  if (!(request instanceof Request) || request.method !== "POST") return false;
  let path;
  try { path = new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/"); } catch { return false; }
  return PAYMENT_INTENT_PATHS.has(path);
}

export async function completeValidatedLiffPaymentIntent(request, guardedResponse, env = {}) {
  if (!isLiffPaymentIntentRequest(request) || !(guardedResponse instanceof Response)) return guardedResponse;

  const guardedPayload = await guardedResponse.clone().json().catch(() => null);
  if (guardedResponse.status !== 503 || guardedPayload?.error?.code !== CONTRACT_UNAVAILABLE) return guardedResponse;
  if (!isNoGrantEnvelope(guardedPayload?.data?.grants)) return failClosed(guardedResponse, "LIFF_PAYMENT_GUARD_INVALID", "Payment setup could not be verified safely.", 503);
  if (!env.PAYMENTS_WORKER?.fetch) return failClosed(guardedResponse, "PAYMENTS_WORKER_BINDING_UNAVAILABLE", "Payment setup is temporarily unavailable.", 503);
  if (!env.LIFF_IDENTITY_KV || !String(env.LIFF_SESSION_SECRET || "").trim()) {
    return failClosed(guardedResponse, "LIFF_PAYMENT_SESSION_UNAVAILABLE", "Payment setup is temporarily unavailable.", 503);
  }

  const browserBody = await request.clone().json().catch(() => null);
  const requestedPackage = normalizePackageCode(browserBody?.package_code);
  const requestedStage = normalizeRequestedStage(browserBody?.payment_stage);
  if (!requestedPackage || !requestedStage) {
    return failClosed(guardedResponse, "LIFF_PAYMENT_REQUEST_INVALID", "Payment setup could not be verified safely.", 400);
  }

  const rotatedToken = responseCookieValue(guardedResponse, SESSION_COOKIE);
  if (!rotatedToken) return failClosed(guardedResponse, "LIFF_PAYMENT_SESSION_UNAVAILABLE", "Payment setup is temporarily unavailable.", 503);

  const sessionKey = `liff:session:${await keyedDigest(env.LIFF_SESSION_SECRET, `session:${rotatedToken}`)}`;
  const session = await env.LIFF_IDENTITY_KV.get(sessionKey, "json").catch(() => null);
  if (!validRotatedSession(session)) return failClosed(guardedResponse, "LIFF_PAYMENT_SESSION_UNAVAILABLE", "Payment setup is temporarily unavailable.", 503);

  const selected = session.selected_package;
  const amountThb = Number(selected?.amount_thb);
  if (!selected
    || normalizePackageCode(selected.package_code) !== requestedPackage
    || selected.requires_manual_review === true
    || !Number.isFinite(amountThb)
    || amountThb <= 0
    || !String(session.session_id || "").trim()) {
    return failClosed(guardedResponse, "LIFF_PAYMENT_SELECTION_INVALID", "Select an eligible package first.", 409);
  }

  const canonicalStage = "membership";
  const upstream = await callPaymentsWorker(env, {
    session_id: String(session.session_id).trim(),
    payment_stage: canonicalStage,
    amount: amountThb,
    package_code: requestedPackage,
    payment_method: "promptpay",
    notes: paymentIntentNote(session, requestedStage),
  });
  if (!upstream.ok) {
    return failClosed(guardedResponse, upstream.code, "Payment setup is temporarily unavailable.", upstream.status);
  }

  const payment = validateCanonicalPayment(upstream.payload, session.session_id);
  if (!payment.ok) {
    return failClosed(guardedResponse, "PAYMENTS_WORKER_CONTRACT_INVALID", "Payment setup is temporarily unavailable.", 502);
  }

  const gatewayStore = getLiffGatewayStore(env);
  if (!gatewayStore || !String(session.gateway_record_id || "").trim()) {
    return failClosed(guardedResponse, "LIFF_GATEWAY_STORAGE_NOT_CONFIGURED", "Payment setup is temporarily unavailable.", 503);
  }

  try {
    // Airtable stores the canonical payments-worker session bridge only. The
    // signed /sigil/pay URL stays in the LIFF response and is not persisted in
    // the gateway table, avoiding a second payment/proof authority surface.
    await gatewayStore.upsertSession({
      session_id: session.session_id,
      payment_intent_session_id: payment.session_id,
    }, session.gateway_record_id);

    session.payment_intent_session_id = payment.session_id;
    session.payment_binding_status = "canonical_pending";
    session.payment_ref = payment.payment_ref;
    session.payment_stage = canonicalStage;
    session.route_after_liff = CANONICAL_STATUS_ROUTE;
    session.next_screen_key = "payment_start";

    const remainingSeconds = Math.ceil((Number(session.expires_at || 0) - Date.now()) / 1000);
    const ttl = Math.min(LIFF_SESSION_TTL_SECONDS, Math.max(60, remainingSeconds));
    await env.LIFF_IDENTITY_KV.put(sessionKey, JSON.stringify(session), { expirationTtl: ttl });
  } catch {
    // The payment_ref is deterministic for this LIFF session/stage in
    // payments-worker. A retry therefore resumes the same canonical intent
    // rather than creating a second payment.
    return failClosed(guardedResponse, "LIFF_PAYMENT_STATE_PERSIST_FAILED", "Payment setup is temporarily unavailable.", 503);
  }

  return successFromGuard(guardedResponse, guardedPayload, {
    payment_ref: payment.payment_ref,
    session_id: payment.session_id,
    payment_stage: canonicalStage,
    package_code: requestedPackage,
    amount_thb: amountThb,
    payment_status: "pending",
    verification_status: "pending",
    customer_payment_url: payment.customer_payment_url,
    redirect_to: payment.customer_payment_url,
    unified_payment_flow: "v1",
  });
}

async function callPaymentsWorker(env, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAYMENT_TIMEOUT_MS);
  try {
    const response = await env.PAYMENTS_WORKER.fetch(new Request(PAYMENTS_INTENT_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-mmd-source": "member-pages-worker",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }));
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) {
      return {
        ok: false,
        status: response.status >= 500 ? 503 : 502,
        code: response.status >= 500 ? "PAYMENTS_WORKER_UNAVAILABLE" : "PAYMENTS_WORKER_INTENT_REJECTED",
      };
    }
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: error?.name === "AbortError" ? "PAYMENTS_WORKER_TIMEOUT" : "PAYMENTS_WORKER_UNAVAILABLE",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function validateCanonicalPayment(payload, expectedSessionId) {
  const paymentRef = safeToken(payload?.payment_ref, 220);
  const sessionId = String(payload?.session_id || "").trim();
  const customerPaymentUrl = canonicalSigilPayUrl(payload?.customer_payment_url);
  if (payload?.unified_payment_flow !== "v1"
    || !paymentRef
    || !sessionId
    || sessionId !== String(expectedSessionId || "").trim()
    || !customerPaymentUrl) {
    return { ok: false };
  }
  return {
    ok: true,
    payment_ref: paymentRef,
    session_id: sessionId,
    customer_payment_url: customerPaymentUrl,
  };
}

function canonicalSigilPayUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:"
      || url.hostname !== "mmdbkk.com"
      || url.port
      || url.username
      || url.password
      || url.pathname !== "/sigil/pay"
      || url.hash
      || [...url.searchParams.keys()].some((key) => key !== "t")
      || !safeToken(url.searchParams.get("t"), 8192)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function paymentIntentNote(session, requestedStage) {
  const intent = String(session?.liff_intent || "unknown").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40) || "unknown";
  return `source=line_liff;intent=${intent};requested_stage=${requestedStage}`;
}

function normalizeRequestedStage(value) {
  const stage = String(value || "").trim().toLowerCase();
  return stage === "membership" || stage === "renewal" ? stage : "";
}

function normalizePackageCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,62}$/.test(code) ? code : "";
}

function validRotatedSession(session) {
  return Boolean(session
    && typeof session === "object"
    && Number(session.expires_at || 0) > Date.now()
    && String(session.session_id || "").trim());
}

function isNoGrantEnvelope(grants) {
  if (!grants || typeof grants !== "object") return false;
  return grants.membership === false
    && grants.points === false
    && grants.payment_status === false
    && grants.private_access === false;
}

function responseCookieValue(response, name) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  for (const cookie of cookies) {
    const first = String(cookie || "").split(";", 1)[0];
    const index = first.indexOf("=");
    if (index <= 0 || first.slice(0, index) !== name) continue;
    return safeToken(first.slice(index + 1), 8192);
  }
  return "";
}

function safeToken(value, max) {
  const token = String(value || "").trim();
  return token && token.length <= max && /^[A-Za-z0-9._~-]+$/.test(token) ? token : "";
}

async function keyedDigest(secret, value) {
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

function successFromGuard(guardedResponse, guardedPayload, payment) {
  const headers = new Headers(guardedResponse.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  const baseData = guardedPayload?.data && typeof guardedPayload.data === "object" ? guardedPayload.data : {};
  const grants = isNoGrantEnvelope(baseData.grants)
    ? baseData.grants
    : { membership: false, points: false, payment_status: false, private_access: false };
  const data = {
    ...baseData,
    next_screen_key: "payment_start",
    route_after_liff: CANONICAL_STATUS_ROUTE,
    payment_binding_status: "canonical_pending",
    redirect_to: payment.redirect_to,
    customer_payment_url: payment.customer_payment_url,
    payment_ref: payment.payment_ref,
    payment_summary: {
      package_code: payment.package_code,
      amount_thb: payment.amount_thb,
      payment_stage: payment.payment_stage,
      payment_status: payment.payment_status,
      verification_status: payment.verification_status,
    },
    unified_payment_flow: payment.unified_payment_flow,
    grants,
  };
  return new Response(JSON.stringify({ ok: true, data }), { status: 200, headers });
}

function failClosed(guardedResponse, code, message, status = 503) {
  const headers = new Headers(guardedResponse.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  return new Response(JSON.stringify({
    ok: false,
    error: { code, message },
    grants: { membership: false, points: false, payment_status: false, private_access: false },
  }), { status, headers });
}
