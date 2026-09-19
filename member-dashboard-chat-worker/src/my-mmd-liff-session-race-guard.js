import currentWorker from "./mms-line-front-gate.js";
export { KenjiModelIdempotency } from "./mms-line-front-gate.js";

const SESSION_COOKIE = "__Host-mmd_liff_session";
const AUTH_PROBE_PATHS = new Set([
  "/member/api/liff/status",
  "/member/api/liff/status/",
  "/member/api/liff/profile",
  "/member/api/liff/profile/",
]);
const STATUS_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const RECOVERY_TIMEOUT_FROM_MS = 12_000;
const RECOVERY_TIMEOUT_TO_MS = 18_000;

function pathOf(request) {
  try { return new URL(request.url).pathname.toLowerCase().replace(/\/{2,}/g, "/"); }
  catch { return ""; }
}

function requestHadLiffSession(request) {
  const cookie = String(request.headers.get("cookie") || "");
  return cookie.split(";").some((part) => part.trim().startsWith(`${SESSION_COOKIE}=`));
}

function isAnonymousAuthProbe(request) {
  return request.method === "GET"
    && AUTH_PROBE_PATHS.has(pathOf(request))
    && !requestHadLiffSession(request);
}

function isLiffSessionClearCookie(value) {
  const text = String(value || "");
  return text.includes(`${SESSION_COOKIE}=`) && /Max-Age=0(?:;|$)/i.test(text);
}

function guardAnonymousProbeClearCookie(request, response) {
  if (!isAnonymousAuthProbe(request) || response.status !== 401) return response;
  const setCookie = response.headers.get("set-cookie") || "";
  if (!isLiffSessionClearCookie(setCookie)) return response;

  // An anonymous probe that did not present a LIFF session must not clear a
  // newer session established concurrently by POST /member/api/liff/start.
  // Requests that did present a session still retain the normal fail-closed
  // invalid/expired-session clear behavior from member-pages-worker.
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  headers.set("x-mmd-liff-cookie-race-guard", "ignored-anonymous-stale-clear-v1");
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isStatusShell(request) {
  if (request.method !== "GET" || !STATUS_SHELL_PATHS.has(pathOf(request))) return false;
  try {
    const url = new URL(request.url);
    return String(url.searchParams.get("intent") || url.searchParams.get("liff_intent") || "").trim().toLowerCase() === "status";
  } catch { return false; }
}

async function extendStatusRecoveryWindow(request, response) {
  if (!isStatusShell(request) || !response.ok) return response;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) return response;

  const original = await response.text();
  const from = `const HARD_TIMEOUT_MS = ${RECOVERY_TIMEOUT_FROM_MS};`;
  const to = `const HARD_TIMEOUT_MS = ${RECOVERY_TIMEOUT_TO_MS};`;
  const html = original.includes(from) ? original.replaceAll(from, to) : original;
  const headers = new Headers(response.headers);
  for (const name of ["content-length", "content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-liff-hard-timeout-ms", String(RECOVERY_TIMEOUT_TO_MS));
  headers.set("x-mmd-liff-session-race-hotfix", "v1");
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env = {}, ctx) {
    let response = await currentWorker.fetch(request, env, ctx);
    response = guardAnonymousProbeClearCookie(request, response);
    response = await extendStatusRecoveryWindow(request, response);
    return response;
  },
};
