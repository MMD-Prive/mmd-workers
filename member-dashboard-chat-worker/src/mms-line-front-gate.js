import canonicalMemberWorker from "./my-mmd-bounded-status-front-gate.js";
import runtimeWorker from "./mms-line-front-gate-runtime.js";
export * from "./mms-line-front-gate-runtime.js";

const SESSION_COOKIE = "__Host-mmd_liff_session";
const STATUS_PATHS = new Set(["/member/api/liff/status", "/member/api/liff/status/", "/member/api/liff/profile", "/member/api/liff/profile/"]);
const LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const LIFF_API_PREFIX = "/member/api/liff/";
const CARE_BACK_LINK_ENDPOINT = "/member/api/care-back/link-wish";
const DEFAULT_STATUS_RETURN_TARGET = "";
const COUPON_STATUS_RETURN_TARGET = "/my-mmd/coupons";
const RETURN_TARGET_BASE = "https://www.mmdbkk.com";
const TMIB_ACT_PATH = /^\/tmib\/act-\d{3}$/;
const TMIB_EPISODE = /^act-\d{3}$/;

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

const RICH_MENU_RETURN_TARGETS = Object.freeze({
  "/profiles": new Set(["rich_menu_guest_models", "rich_menu_public_models"]),
  "/booking": new Set(["rich_menu_guest_booking", "rich_menu_public_booking"]),
  "/services/companion": new Set(["rich_menu_guest_services"]),
  "/tmib": new Set(["rich_menu_guest_stories"]),
  "/member/private": new Set(["rich_menu_model_cards", "rich_menu_prive_update"]),
  "/find": new Set(["rich_menu_private_booking"]),
  // Transitional allowlist for already-issued v4.9 links only.
  "/tmib/stories": new Set(["rich_menu_guest_stories"]),
  "/sigil/member/membership": new Set(["rich_menu_prive_access"]),
  "/sigil/booking": new Set(["rich_menu_model_cards", "rich_menu_private_booking"]),
});

function safeStatusReturnTarget(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.length > 9000 || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return "";

  let target;
  try { target = new URL(raw, RETURN_TARGET_BASE); } catch { return ""; }
  if (target.origin !== RETURN_TARGET_BASE) return "";

  const path = target.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  if (path === "/sigil/confirm/job-confirmation" || path === "/confirm/job-confirmation") {
    const keys = [...target.searchParams.keys()];
    const tokenValue = String(target.searchParams.get("t") || "").trim();
    if (keys.length !== 1 || keys[0] !== "t" || !tokenValue || tokenValue.length > 8000 || !/^[A-Za-z0-9._~-]+$/.test(tokenValue)) return "";
    return `${path}?t=${encodeURIComponent(tokenValue)}`;
  }
  if (raw.length > 600) return "";
  if (TMIB_ACT_PATH.test(path)) {
    if ([...target.searchParams.keys()].length) return "";
    return `${path}${target.hash || ""}`;
  }

  if (path === "/pay/tmib") {
    const keys = [...target.searchParams.keys()];
    if (keys.some((key) => key !== "episode")) return "";
    const episode = String(target.searchParams.get("episode") || "act-001").trim().toLowerCase();
    if (!TMIB_EPISODE.test(episode)) return "";
    return `/pay/tmib?episode=${encodeURIComponent(episode)}${target.hash || ""}`;
  }

  const allowedEntries = RICH_MENU_RETURN_TARGETS[path];
  if (!allowedEntries) return "";
  const keys = [...target.searchParams.keys()];
  const entryRoute = String(target.searchParams.get("entry_route") || "").trim();
  if (!allowedEntries.has(entryRoute) || target.searchParams.get("source") !== "line") return "";

  if (path === "/sigil/member/membership") {
    if (keys.some((key) => !["intent", "source", "entry_route"].includes(key))) return "";
    if (target.searchParams.get("intent") !== "signup") return "";
  } else if (path === "/sigil/booking") {
    if (keys.some((key) => !["mode", "scope", "source", "entry_route"].includes(key))) return "";
    if (target.searchParams.get("scope") !== "private") return "";
    const mode = target.searchParams.get("mode");
    if (entryRoute === "rich_menu_model_cards" && mode !== "search") return "";
    if (entryRoute === "rich_menu_private_booking" && mode !== "booking") return "";
  } else {
    if (keys.some((key) => key !== "source" && key !== "entry_route")) return "";
  }

  const allowedHash = path === "/member/private"
    ? new Set(["", "#detail-model", "#access"])
    : new Set([""]);
  if (!allowedHash.has(target.hash || "")) return "";

  return `${path}?${target.searchParams.toString()}${target.hash || ""}`;
}

export function statusReturnTarget(request) {
  let url;
  try { url = new URL(request.url); } catch { return DEFAULT_STATUS_RETURN_TARGET; }
  const stateParams = liffStateSearchParams(url);
  const returnTo = String(url.searchParams.get("return_to") || stateParams.get("return_to") || "").trim();
  if (!returnTo) return DEFAULT_STATUS_RETURN_TARGET;
  if (returnTo.toLowerCase() === "coupon") return COUPON_STATUS_RETURN_TARGET;
  return safeStatusReturnTarget(returnTo) || DEFAULT_STATUS_RETURN_TARGET;
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
  const target = statusReturnTarget(request);
  if (!target) return String(html || "");
  const targetJson = JSON.stringify(target);
  let output = String(html || "");
  output = output.replace(
    /(^|\n)[ \t]*const existingProfile = await readProfile\(\);[ \t]*\n[ \t]*if \(existingProfile\) return;/m,
    "$1      // Explicit return_to uses LIFF as an auth-only bridge. Direct status stays in the LIFF dashboard.\n      const existingProfile = null;",
  );
  output = output.replace(
    /(^|\n)[ \t]*if \(started && started\.member_resolved\) await readProfile\(\);/gm,
    `$1      if (started) { show("ยืนยัน LINE สำเร็จแล้วครับ กำลังกลับไปหน้าที่เปิดไว้"); window.location.replace(${targetJson}); return; }`,
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
  const script = `<script nonce="${nonce}" id="mmd-care-back-wish-liff-bridge">(() => {\n  \"use strict\";\n  const token = ${tokenJson};\n  let running = false;\n  async function linkWish() {\n    if (running) return; running = true;\n    try {\n      const response = await fetch(\"${CARE_BACK_LINK_ENDPOINT}\", { method:\"POST\", credentials:\"same-origin\", headers:{\"accept\":\"application/json\",\"content-type\":\"application/json\"}, body:JSON.stringify({wish_link_token:token}) });\n      const payload = await response.json().catch(() => null);\n      if (response.ok && payload && payload.ok === true && payload.linked === true) { window.location.replace(\"/my-mmd/coupons?care_back=linked\"); return; }\n      if (response.status === 401) running = false;\n      else document.dispatchEvent(new CustomEvent(\"mmd:care-back:link-failed\", { detail:{ code:String(payload && payload.error && payload.error.code || \"CARE_BACK_LINK_FAILED\") } }));\n    } catch { running = false; }\n  }\n  document.addEventListener(\"mmd:liff:member-ready\", linkWish);\n})();</script>`;
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