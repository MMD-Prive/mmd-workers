import liffFoundation from "./liff-payment-binding.js";
import { PUBLIC_JSON_BODY_MAX_BYTES, readBoundedJsonObject } from "./bounded-json.js";

const ORCHESTRATOR_PATHS = new Set(["/member/liff", "/member/liff/"]);
const SESSION_COOKIE = "__Host-mmd_liff_session";
const CLAIM_PATH = "/member/api/liff/care-back/claim";
const WISH_PATH = "/member/api/liff/care-back/wish";
const WALLET_PATH = "/member/api/liff/care-back/wallet";
const WISH_BODY_KEYS = new Set(["wish_text", "wish_option", "request_id"]);
const BROWSER_AUTHORITY_KEYS = new Set([
  "line_user_id",
  "lineUserId",
  "line_id",
  "sub",
  "profile",
  "user",
  "member_id",
  "member_ref",
  "mmd_member_id",
  "tier",
  "points",
  "status",
  "membership_status",
  "payment_status",
  "campaign_claim_id",
  "claim_id",
  "approved_discount_percent",
  "discount_percent",
  "benefit_value",
]);

export function isCareBackLiffOrchestratorRequest(request) {
  if (!(request instanceof Request) || request.method !== "POST") return false;
  let path;
  try {
    path = new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
  } catch {
    return false;
  }
  return ORCHESTRATOR_PATHS.has(path);
}

export async function handleCareBackLiffOrchestrator(
  request,
  env = {},
  ctx,
  delegate = liffFoundation,
) {
  if (!isCareBackLiffOrchestratorRequest(request)) {
    return jsonError("METHOD_NOT_ALLOWED", "POST /member/liff required.", 405, { allow: "POST" });
  }

  const parsed = await readBoundedJsonObject(request.clone(), PUBLIC_JSON_BODY_MAX_BYTES);
  if (!parsed.ok) return jsonError(parsed.code, parsed.message, parsed.status);
  if (hasUnexpectedKeys(parsed.value) || hasBrowserAuthority(parsed.value)) {
    return jsonError(
      "BROWSER_AUTHORITY_REJECTED",
      "Member, claim, eligibility and coupon authority must come from verified server state.",
      400,
    );
  }

  // Claim is deliberately opened before the Wish write. The canonical Wish
  // owner requires a server-owned Claim id/record id so the Wish can be linked
  // to the Claim in the same write instead of creating an orphan record.
  let cookie = String(request.headers.get("cookie") || "");
  const claim = await invokeStage({
    request,
    env,
    ctx,
    delegate,
    path: CLAIM_PATH,
    method: "POST",
    body: {},
    cookie,
  });
  if (!claim.response.ok) return stageFailure(claim.response, "claim");
  if (!claim.payload?.ok || !claim.payload?.data) {
    return jsonError("CARE_BACK_CLAIM_RESPONSE_INVALID", "CARE BACK claim could not be verified safely.", 502);
  }

  cookie = rotatedCookieHeader(cookie, claim.response);
  const wish = await invokeStage({
    request,
    env,
    ctx,
    delegate,
    path: WISH_PATH,
    method: "POST",
    body: parsed.value,
    cookie,
  });
  if (!wish.response.ok) return stageFailure(wish.response, "wish");
  if (!wish.payload?.ok || !wish.payload?.wish) {
    return jsonError("CARE_BACK_WISH_RESPONSE_INVALID", "CARE BACK Wish could not be verified safely.", 502);
  }

  cookie = rotatedCookieHeader(cookie, wish.response);
  const wallet = await invokeStage({
    request,
    env,
    ctx,
    delegate,
    path: WALLET_PATH,
    method: "GET",
    cookie,
  });
  if (!wallet.response.ok) return stageFailure(wallet.response, "wallet");
  if (!wallet.payload?.ok || !wallet.payload?.wallet) {
    return jsonError("CARE_BACK_WALLET_RESPONSE_INVALID", "CARE BACK coupon wallet could not be verified safely.", 502);
  }

  const headers = new Headers(wallet.response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-care-back-orchestrator", "v1");
  headers.set("x-mmd-my-mmd-surface", "coupons");

  const canonicalClaim = wish.payload.claim || claim.payload.data;
  return new Response(JSON.stringify({
    ok: true,
    state: "completed",
    campaign: "care_back",
    wish: wish.payload.wish,
    claim: canonicalClaim,
    coupon: wallet.payload.wallet,
    my_mmd: {
      surfaced: true,
      coupons_endpoint: "/api/member/app/coupons",
      care_endpoint: "/api/member/app/care",
    },
    idempotency: {
      claim: "verified_identity",
      wish: "request_id",
      coupon: "verified_identity",
    },
  }), { status: 200, headers });
}

async function invokeStage({ request, env, ctx, delegate, path, method, body, cookie }) {
  const url = new URL(request.url);
  url.pathname = path;
  url.search = "";
  url.hash = "";

  const headers = new Headers(request.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  if (cookie) headers.set("cookie", cookie);
  else headers.delete("cookie");

  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(body || {});
  } else {
    headers.delete("content-type");
  }

  const response = await delegate.fetch(new Request(url, init), env, ctx);
  const payload = await response.clone().json().catch(() => null);
  return { response, payload };
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

function responseCookieValue(response, name) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  for (const cookie of cookies) {
    const first = String(cookie || "").split(";", 1)[0];
    const index = first.indexOf("=");
    if (index <= 0 || first.slice(0, index) !== name) continue;
    const value = first.slice(index + 1).trim();
    if (value) return value;
  }
  return "";
}

function hasUnexpectedKeys(body) {
  return Object.keys(body || {}).some((key) => !WISH_BODY_KEYS.has(key));
}

function hasBrowserAuthority(body) {
  return Object.keys(body || {}).some((key) => BROWSER_AUTHORITY_KEYS.has(key));
}

function stageFailure(response, stage) {
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
    headers: {
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}
