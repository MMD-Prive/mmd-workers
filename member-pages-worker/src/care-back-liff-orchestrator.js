import liffFoundation from "./liff-payment-binding.js";
import { getCareBackStore } from "./care-back-claim-store.js";
import { handleLinkWish, handlePublicWish } from "./public-care-back-wish.js";
import { PUBLIC_JSON_BODY_MAX_BYTES, readBoundedJsonObject } from "./bounded-json.js";

const ORCHESTRATOR_PATHS = new Set(["/member/liff", "/member/liff/"]);
const LINK_WISH_PATHS = new Set([
  "/member/api/care-back/link-wish",
  "/member/api/care-back/link-wish/",
]);
const PUBLIC_WISH_PATH = "/member/api/care-back/public-wish";
const CLAIM_PATH = "/member/api/liff/care-back/claim";
const SESSION_COOKIE = "__Host-mmd_liff_session";
const PENDING_WISH_COOKIE = "mmd_care_back_wish_link";
const CARE_BACK_COOKIE_DOMAIN = "mmdbkk.com";
const WISH_BODY_KEYS = new Set(["wish_text", "wish_option", "request_id", "language", "public_display_consent"]);
const LINK_BODY_KEYS = new Set(["wish_link_token"]);
const BROWSER_AUTHORITY_KEYS = new Set([
  "line_user_id", "lineUserId", "line_id", "sub", "profile", "user",
  "member_id", "member_ref", "mmd_member_id", "tier", "points", "status",
  "membership_status", "payment_status", "campaign_claim_id", "claim_id",
  "approved_discount_percent", "discount_percent", "benefit_value",
]);

export function isCareBackLiffOrchestratorRequest(request) {
  return isPostPath(request, ORCHESTRATOR_PATHS);
}

export function isCanonicalCareBackLinkWishRequest(request) {
  return isPostPath(request, LINK_WISH_PATHS);
}

export async function handleCareBackLiffOrchestrator(request, env = {}, ctx, deps = {}) {
  if (!isCareBackLiffOrchestratorRequest(request)) {
    return jsonError("METHOD_NOT_ALLOWED", "POST /member/liff required.", 405, { allow: "POST" });
  }

  const parsed = await readBoundedJsonObject(request.clone(), PUBLIC_JSON_BODY_MAX_BYTES);
  if (!parsed.ok) return jsonError(parsed.code, parsed.message, parsed.status);
  if (hasUnexpectedKeys(parsed.value, WISH_BODY_KEYS) || hasBrowserAuthority(parsed.value)) {
    return browserAuthorityRejected();
  }

  // Step 1: save the Wish first. This owner is already idempotent by request_id.
  const publicWishHandler = deps.publicWishHandler || handlePublicWish;
  const publicRequest = remapJsonRequest(request, PUBLIC_WISH_PATH, parsed.value);
  const publicResponse = await publicWishHandler(publicRequest, env);
  const publicPayload = await publicResponse.clone().json().catch(() => null);
  if (!publicResponse.ok || publicPayload?.ok !== true || !validWishLinkToken(publicPayload?.wish_link_token)) {
    return taggedResponse(publicResponse, "wish_save");
  }

  // Step 2-5 are owned by the canonical link wrapper below: create/resume Claim,
  // link Wish <-> Claim, re-evaluate member eligibility/status, then read the
  // coupon produced by the canonical idempotent CARE BACK store.
  const canonicalLinkHandler = deps.canonicalLinkHandler || handleCanonicalCareBackLinkWish;
  const linkRequest = remapJsonRequest(request, "/member/api/care-back/link-wish", {
    wish_link_token: publicPayload.wish_link_token,
  });
  const linkedResponse = await canonicalLinkHandler(linkRequest, env, ctx, deps);
  const linkedPayload = await linkedResponse.clone().json().catch(() => null);

  if (!linkedResponse.ok || linkedPayload?.ok !== true || linkedPayload?.linked !== true) {
    // Preserve the already-saved Wish recovery token if a later verified step
    // fails, while also preserving any rotated LIFF session from that step.
    return mergeCookies(
      taggedResponse(linkedResponse, "claim_link_coupon"),
      publicResponse,
      { sharePendingWish: true },
    );
  }

  const headers = mergedHeaders(linkedResponse, publicResponse, { preferPrimaryCookies: true });
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-care-back-orchestrator", "v1");
  headers.set("x-mmd-my-mmd-surface", "coupons");

  return new Response(JSON.stringify({
    ok: true,
    state: "completed",
    campaign: "care_back",
    wish: linkedPayload.wish || publicPayload.wish || null,
    claim: linkedPayload.claim || null,
    coupon: linkedPayload.coupon || null,
    benefits: linkedPayload.benefits || null,
    my_mmd: {
      surfaced: true,
      coupons_endpoint: "/api/member/app/coupons",
      care_endpoint: "/api/member/app/care",
    },
    idempotency: {
      wish: "request_id",
      claim: "verified_line_identity",
      coupon: "verified_line_identity",
    },
  }), { status: 200, headers });
}

export async function handleCanonicalCareBackLinkWish(request, env = {}, ctx, deps = {}) {
  if (!isCanonicalCareBackLinkWishRequest(request)) {
    return jsonError("METHOD_NOT_ALLOWED", "POST link-wish required.", 405, { allow: "POST" });
  }

  const parsed = await readBoundedJsonObject(request.clone(), PUBLIC_JSON_BODY_MAX_BYTES);
  if (!parsed.ok) return jsonError(parsed.code, parsed.message, parsed.status);
  if (hasUnexpectedKeys(parsed.value, LINK_BODY_KEYS) || hasBrowserAuthority(parsed.value)) {
    return browserAuthorityRejected();
  }
  if (!validWishLinkToken(parsed.value.wish_link_token)) {
    return jsonError("PUBLIC_WISH_LINK_TOKEN_INVALID", "A valid wish link token is required.", 400);
  }

  const session = await readVerifiedMemberSession(request, env);
  if (!session.ok) return session.response;

  // A verified customer without a Member row can link a saved Wish for the
  // customer wall. Coupon approval still requires the canonical member flow.
  if (!session.memberId) {
    return (deps.linkWishHandler || handleLinkWish)(request, {
      ...env,
      VERIFIED_WISH_COUPON_STORE: {
        issueOrResume: async () => ({ state: "verification_required", code: "", approved_discount_percent: null }),
      },
    });
  }

  const careBackStore = getCareBackStore(env);
  if (!careBackStore || typeof careBackStore.readCouponWallet !== "function") {
    return jsonError("CARE_BACK_STORAGE_NOT_CONFIGURED", "CARE BACK is temporarily unavailable.", 503);
  }

  // Create/resume the server-owned Campaign Claim before linking the saved Wish.
  // The canonical claim endpoint also persists Claim ids into the LIFF session
  // and rotates the __Host session cookie safely.
  const liffDelegate = deps.liffDelegate || liffFoundation;
  const claimStage = await invokeLiffStage({
    request,
    env,
    ctx,
    delegate: liffDelegate,
    path: CLAIM_PATH,
    method: "POST",
    body: {},
  });
  if (!claimStage.response.ok) return taggedResponse(claimStage.response, "claim");
  if (claimStage.payload?.ok !== true || !claimStage.payload?.data?.claim_reference) {
    return mergeCookies(
      jsonError("CARE_BACK_CLAIM_RESPONSE_INVALID", "CARE BACK claim could not be verified safely.", 502),
      claimStage.response,
    );
  }

  const rotatedCookie = rotatedCookieHeader(String(request.headers.get("cookie") || ""), claimStage.response);
  const linkedRequest = remapJsonRequest(request, "/member/api/care-back/link-wish", parsed.value, rotatedCookie);

  // Existing public-Wish linking remains the single Airtable Wish owner. Replace
  // only its legacy verified-identity coupon adapter with a read from the
  // canonical CARE BACK store. Its own openOrResume(...wishSubmitted:true) runs
  // before this adapter, so eligibility/status gates and idempotent issuance have
  // already been reconciled when the wallet is read.
  const linkHandler = deps.linkWishHandler || handleLinkWish;
  const runtimeEnv = {
    ...env,
    VERIFIED_WISH_COUPON_STORE: {
      async issueOrResume({ identityHash }) {
        const wallet = await careBackStore.readCouponWallet({
          identityHash,
          memberId: session.memberId,
        });
        return couponFromWallet(wallet);
      },
    },
  };

  const linkResponse = await linkHandler(linkedRequest, runtimeEnv);
  const headers = mergedHeaders(linkResponse, claimStage.response, { preferPrimaryCookies: true });
  headers.set("x-mmd-care-back-link-authority", "canonical-member-eligibility-v1");
  headers.set("x-mmd-care-back-orchestration-stage", linkResponse.ok ? "completed" : "link_wish");
  return new Response(linkResponse.body, {
    status: linkResponse.status,
    statusText: linkResponse.statusText,
    headers,
  });
}

async function readVerifiedMemberSession(request, env) {
  if (!env.LIFF_IDENTITY_KV?.get || String(env.LIFF_SESSION_SECRET || "").length < 32) {
    return { ok: false, response: jsonError("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED", "Member verification is temporarily unavailable.", 503) };
  }
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return { ok: false, response: jsonError("LIFF_SESSION_REQUIRED", "Authenticated LIFF session required.", 401) };

  const hash = await keyedDigest(env.LIFF_SESSION_SECRET, `session:${token}`);
  const data = await env.LIFF_IDENTITY_KV.get(`liff:session:${hash}`, "json").catch(() => null);
  if (!data || Number(data.expires_at || 0) <= Date.now()) {
    return { ok: false, response: jsonError("LIFF_SESSION_INVALID", "LIFF session is invalid or expired.", 401) };
  }
  if (!data.identity_key) {
    return { ok: false, response: jsonError("CARE_BACK_MEMBER_REQUIRED", "An eligible verified MMD member is required before a CARE BACK coupon can be issued.", 409) };
  }
  return {
    ok: true,
    memberId: data.member_exists === true ? String(data.member_id || "").trim().slice(0, 160) : "",
    identityHash: String(data.identity_key).trim().toLowerCase(),
  };
}

function couponFromWallet(wallet = {}) {
  const state = safeCouponState(wallet.status || wallet.state);
  return {
    state,
    status: state === "ready" ? "active" : state,
    code: safeToken(wallet.code, 64),
    max_discount_percent: 10,
    approved_discount_percent: safeApprovedDiscount(wallet.approved_discount_percent),
    activated_at: safeTimestamp(wallet.activated_at),
    expires_at: safeTimestamp(wallet.expires_at),
    single_use: true,
  };
}

async function invokeLiffStage({ request, env, ctx, delegate, path, method, body }) {
  const staged = remapJsonRequest(request, path, body, String(request.headers.get("cookie") || ""), method);
  const response = await delegate.fetch(staged, env, ctx);
  const payload = await response.clone().json().catch(() => null);
  return { response, payload };
}

function remapJsonRequest(request, path, body, cookie = null, method = "POST") {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";
  url.hash = "";
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  if (cookie !== null) {
    if (cookie) headers.set("cookie", cookie);
    else headers.delete("cookie");
  }
  if (method === "GET" || method === "HEAD") headers.delete("content-type");
  else headers.set("content-type", "application/json");
  return new Request(url, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body || {}),
  });
}

function rotatedCookieHeader(current, response) {
  const token = responseCookieValue(response, SESSION_COOKIE);
  if (!token) return current;
  const parts = String(current || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.split("=", 1)[0] !== SESSION_COOKIE);
  parts.push(`${SESSION_COOKIE}=${token}`);
  return parts.join("; ");
}

function mergedHeaders(primary, secondary, { preferPrimaryCookies = false } = {}) {
  const headers = new Headers(primary.headers);
  const primaryCookies = responseCookies(primary);
  const secondaryCookies = responseCookies(secondary);
  if (primaryCookies.length || secondaryCookies.length) {
    headers.delete("set-cookie");
    const cookies = preferPrimaryCookies ? [...secondaryCookies, ...primaryCookies] : [...primaryCookies, ...secondaryCookies];
    for (const cookie of dedupeCookies(cookies)) headers.append("set-cookie", cookie);
  }
  return headers;
}

function mergeCookies(primary, secondary, options = {}) {
  const headers = mergedHeaders(primary, secondary, options);
  if (options.sharePendingWish) {
    const cookies = responseCookies(secondary);
    if (cookies.length) {
      headers.delete("set-cookie");
      const primaryCookies = responseCookies(primary);
      for (const cookie of dedupeCookies([
        ...primaryCookies,
        ...cookies.map(scopePendingWishCookie),
      ])) headers.append("set-cookie", cookie);
    }
  }
  return new Response(primary.body, {
    status: primary.status,
    statusText: primary.statusText,
    headers,
  });
}

function scopePendingWishCookie(cookie) {
  const value = String(cookie || "").trim();
  if (!value.toLowerCase().startsWith(`${PENDING_WISH_COOKIE.toLowerCase()}=`)) return value;
  if (/;\s*domain=/i.test(value)) return value;
  return `${value}; Domain=${CARE_BACK_COOKIE_DOMAIN}`;
}

function dedupeCookies(cookies) {
  const seen = new Set();
  const output = [];
  for (const cookie of cookies) {
    const value = String(cookie || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

function responseCookies(response) {
  if (!(response instanceof Response)) return [];
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const raw = response.headers.get("set-cookie");
  return raw ? [raw] : [];
}

function responseCookieValue(response, name) {
  for (const cookie of responseCookies(response)) {
    const first = String(cookie || "").split(";", 1)[0];
    const index = first.indexOf("=");
    if (index <= 0 || first.slice(0, index) !== name) continue;
    const value = first.slice(index + 1).trim();
    if (value) return value;
  }
  return "";
}

function cookieValue(request, name) {
  for (const part of String(request.headers.get("cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
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

function isPostPath(request, paths) {
  if (!(request instanceof Request) || request.method !== "POST") return false;
  try {
    const path = new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
    return paths.has(path);
  } catch {
    return false;
  }
}

function hasUnexpectedKeys(body, allowed) {
  return Object.keys(body || {}).some((key) => !allowed.has(key));
}

function hasBrowserAuthority(body) {
  return Object.keys(body || {}).some((key) => BROWSER_AUTHORITY_KEYS.has(key));
}

function validWishLinkToken(value) {
  return /^pw_[A-Za-z0-9_-]{20,200}$/.test(String(value || ""));
}

function safeCouponState(value) {
  const state = String(value || "").trim();
  return ["ready", "wish_required", "renewal_required", "verification_required", "used", "expired", "revoked", "invalid"].includes(state)
    ? state
    : "verification_required";
}

function safeApprovedDiscount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 10 ? number : null;
}

function safeTimestamp(value) {
  const raw = String(value || "").trim();
  return raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
}

function safeToken(value, max) {
  const token = String(value || "").trim();
  return token && token.length <= max && /^[A-Za-z0-9._~-]+$/.test(token) ? token : "";
}

function browserAuthorityRejected() {
  return jsonError(
    "BROWSER_AUTHORITY_REJECTED",
    "Member, claim, eligibility and coupon authority must come from verified server state.",
    400,
  );
}

function taggedResponse(response, stage) {
  const headers = new Headers(response.headers);
  headers.set("x-mmd-care-back-orchestration-stage", stage);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonError(code, message, status, extraHeaders = {}) {
  return Response.json({ ok: false, error: { code, message } }, {
    status,
    headers: { "cache-control": "no-store", ...extraHeaders },
  });
}
