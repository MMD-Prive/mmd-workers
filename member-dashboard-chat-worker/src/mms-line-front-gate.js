import canonicalMemberWorker from "./my-mmd-bounded-status-front-gate.js";
import runtimeWorker from "./mms-line-front-gate-runtime.js";
export * from "./mms-line-front-gate-runtime.js";

const SESSION_COOKIE = "__Host-mmd_liff_session";
const STATUS_PATHS = new Set(["/member/api/liff/status", "/member/api/liff/status/", "/member/api/liff/profile", "/member/api/liff/profile/"]);
const LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const LIFF_API_PREFIX = "/member/api/liff/";
const CARE_BACK_LINK_ENDPOINT = "/member/api/care-back/link-wish";
const DEFAULT_STATUS_RETURN_TARGET = "/my-mmd/";
const COUPON_STATUS_RETURN_TARGET = "/coupon";

function cookieValue(request, name) {
  for (const part of String(request.headers.get("cookie") || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return "";
}

function responseCookies(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const raw = response.headers.get("set-cookie");
  return raw ? [raw] : [];
}

function isSessionClear(cookie) {
  const value = String(cookie || "");
  return value.startsWith(`${SESSION_COOKIE}=`) && /(?:max-age=0|expires=thu,\s*01 jan 1970)/i.test(value);
}

function isCanonicalLiffRequest(request) {
  try {
    const path = new URL(request.url).pathname.toLowerCase();
    return LIFF_SHELL_PATHS.has(path) || STATUS_PATHS.has(path) || path.startsWith(LIFF_API_PREFIX);
  } catch {
    return false;
  }
}

function liffStateSearchParams(url) {
  const raw = String(url.searchParams.get("liff.state") || url.searchParams.get("liff_state") || "").trim();
  if (!raw) return new URLSearchParams();
  let state = raw;
  try { state = decodeURIComponent(raw); } catch {}
  const queryIndex = state.indexOf("?");
  if (queryIndex >= 0) return new URLSearchParams(state.slice(queryIndex + 1));
  if (state.startsWith("intent=") || state.startsWith("liff_intent=")) return new URLSearchParams(state);
  return new URLSearchParams();
}

export function statusReturnTarget(request) {
  let url;
  try { url = new URL(request.url); } catch { return DEFAULT_STATUS_RETURN_TARGET; }
  const stateParams = liffStateSearchParams(url);
  const returnTo = String(url.searchParams.get("return_to") || stateParams.get("return_to") || "").trim().toLowerCase();
  return returnTo === "coupon" ? COUPON_STATUS_RETURN_TARGET : DEFAULT_STATUS_RETURN_TARGET;
}

export function isStatusLiffShellRequest(request) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  if (!LIFF_SHELL_PATHS.has(url.pathname.toLowerCase())) return false;

  const stateParams = liffStateSearchParams(url);
  const intent = String(
    url.searchParams.get("intent")
      || url.searchParams.get("liff_intent")
      || stateParams.get("intent")
      || stateParams.get("liff_intent")
      || "",
  ).trim().toLowerCase();
  const campaign = String(url.searchParams.get("campaign") || stateParams.get("campaign") || "").trim().toLowerCase();

  if (campaign) return false;
  if (!intent || intent === "unknown") return true;
  return intent === "status";
}

export function guardAnonymousSessionClear(request, response) {
  if (!(request instanceof Request) || !(response instanceof Response) || response.status !== 401) return response;
  let url;
  try { url = new URL(request.url); } catch { return response; }
  if (!STATUS_PATHS.has(url.pathname.toLowerCase()) || cookieValue(request, SESSION_COOKIE)) return response;
  const cookies = responseCookies(response);
  if (!cookies.some(isSessionClear)) return response;
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  for (const cookie of cookies.filter((item) => !isSessionClear(item))) headers.append("set-cookie", cookie);
  headers.set("x-mmd-liff-cookie-race-guard", "ignored-anonymous-stale-clear-v2");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function safeNonce(html) {
  const match = String(html || "").match(/<script\s+nonce="([A-Za-z0-9+/_=-]{8,160})"/i);
  return match ? match[1] : "";
}

export function stabilizeStatusShell(html, request) {
  if (!isStatusLiffShellRequest(request)) return String(html || "");
  const targetJson = JSON.stringify(statusReturnTarget(request));
  let output = String(html || "");
  output = output.replace(
    /(^|\n)[ \t]*const existingProfile = await readProfile\(\);[ \t]*\n[ \t]*if \(existingProfile\) return;/m,
    "$1      // Status is an auth-only bridge. Do not rotate the new session with profile/wallet reads here.\n      const existingProfile = null;",
  );
  output = output.replace(
    /(^|\n)[ \t]*if \(started && started\.member_resolved\) await readProfile\(\);/gm,
    `$1      if (started) { show("ยืนยัน LINE สำเร็จแล้วครับ กำลังเปิด My MMD"); window.location.replace(${targetJson}); return; }`,
  );
  output = output.replace(
    /const target = ["']\/my-mmd\/["'];/g,
    `const target = ${targetJson};`,
  );
  return output;
}

function addMemberReadyEvent(html) {
  const needle = "    if (CONFIG.intent === \"promo\" && CONFIG.campaign === \"care_back\") await readCareBackState();\n    return payload.data || {};";
  if (!String(html || "").includes(needle)) return String(html || "");
  return String(html).replace(
    needle,
    "    if (CONFIG.intent === \"promo\" && CONFIG.campaign === \"care_back\") await readCareBackState();\n    document.dispatchEvent(new CustomEvent(\"mmd:liff:member-ready\"));\n    return payload.data || {};",
  );
}

function validWishToken(value) {
  const token = String(value || "").trim();
  return /^pw_[A-Za-z0-9_-]{20,200}$/.test(token) ? token : "";
}

export function injectCareBackWishBridge(html, request) {
  let url;
  try { url = new URL(request.url); } catch { return String(html || ""); }
  if (!LIFF_SHELL_PATHS.has(url.pathname.toLowerCase())) return String(html || "");
  if (String(url.searchParams.get("intent") || "").toLowerCase() !== "promo" || String(url.searchParams.get("campaign") || "").toLowerCase() !== "care_back") return String(html || "");
  const token = validWishToken(url.searchParams.get("wish_link_token"));
  if (!token) return String(html || "");
  let output = addMemberReadyEvent(String(html || ""));
  if (output.includes("id=\"mmd-care-back-wish-liff-bridge\"")) return output;
  const nonce = safeNonce(output);
  if (!nonce || !output.includes("</head>")) return output;
  const tokenJson = JSON.stringify(token).replace(/</g, "\\u003c");
  const script = `<script nonce="${nonce}" id="mmd-care-back-wish-liff-bridge">(() => {\n  \"use strict\";\n  const token = ${tokenJson};\n  let running = false;\n  async function linkWish() {\n    if (running) return; running = true;\n    try {\n      const response = await fetch(\"${CARE_BACK_LINK_ENDPOINT}\", { method:\"POST\", credentials:\"same-origin\", headers:{\"accept\":\"application/json\",\"content-type\":\"application/json\"}, body:JSON.stringify({wish_link_token:token}) });\n      const payload = await response.json().catch(() => null);\n      if (response.ok && payload && payload.ok === true && payload.linked === true) { window.location.replace(\"/coupon?care_back=linked\"); return; }\n      if (response.status === 401) running = false;\n      else document.dispatchEvent(new CustomEvent(\"mmd:care-back:link-failed\", { detail:{ code:String(payload && payload.error && payload.error.code || \"CARE_BACK_LINK_FAILED\") } }));\n    } catch { running = false; }\n  }\n  document.addEventListener(\"mmd:liff:member-ready\", linkWish);\n})();</script>`;
  output = output.replace("</head>", `${script}</head>`);
  return output;
}

async function rewriteLiffHtml(request, response) {
  if (!(response instanceof Response) || !response.ok || request.method === "HEAD") return response;
  let url;
  try { url = new URL(request.url); } catch { return response; }
  if (!LIFF_SHELL_PATHS.has(url.pathname.toLowerCase())) return response;
  if (!String(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) return response;
  let html = await response.text();
  html = stabilizeStatusShell(html, request);
  html = injectCareBackWishBridge(html, request);
  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-liff-stability", "real-line-v1");
  if (isStatusLiffShellRequest(request)) headers.set("x-mmd-liff-return-target", statusReturnTarget(request));
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export const MMD_LIFF_STABILITY_INTERNALS = Object.freeze({
  validWishToken,
  stabilizeStatusShell,
  injectCareBackWishBridge,
  guardAnonymousSessionClear,
  isCanonicalLiffRequest,
  isStatusLiffShellRequest,
  statusReturnTarget,
});

export default {
  ...runtimeWorker,
  async fetch(request, env = {}, ctx) {
    const owner = isCanonicalLiffRequest(request) ? canonicalMemberWorker : runtimeWorker;
    let response = await owner.fetch(request, env, ctx);
    response = guardAnonymousSessionClear(request, response);
    return rewriteLiffHtml(request, response);
  },
};