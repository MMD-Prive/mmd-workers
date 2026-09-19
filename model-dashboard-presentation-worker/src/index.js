const WORKER_NAME = "model-dashboard-presentation-worker";
const UI_PREFIX = "/sigil/model/dashboard";
const ASSET_PREFIX = "/sigil/model/dashboard-assets/";
const ROOT_RUNTIME_PREFIXES = ["/_build/", "/_serverFn/", "/assets/"];
const PRESENTATION_ORIGIN = "https://mmdmodel.lovable.app";
const UI_SOURCE = "lovable-presentation-proxy";
const APP_MARKER = "lovable-model-dashboard";
const APP_ROUTE_SUFFIXES = ["profile", "availability", "photos", "support"];
const MODEL_SESSION_COOKIE = "mmd_model_session_v1";
const LIFF_PRIMARY_BOOTSTRAP_COOKIE = "mmd_liff_boot";
const LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";
const MODEL_LIFF_IDS = Object.freeze({
  developing: "2010864852-MuzunIKU",
  review: "2010864853-7SqCQVxy",
  published: "2010864854-N34SgCqq",
});
const MODEL_LIFF_ID = MODEL_LIFF_IDS.published;
const MODEL_LIFF_URL = `https://miniapp.line.me/${MODEL_LIFF_ID}`;
const WISH_STATUS_JS_PATH = `${ASSET_PREFIX}wish-status-v1.js`;
const WISH_STATUS_CSS_PATH = `${ASSET_PREFIX}wish-status-v1.css`;

function miniAppPermanentLink(liffId, params = new URLSearchParams()) {
  const base = `https://miniapp.line.me/${liffId}`;
  const query = params.toString();
  return query ? `${base}/?${query}` : base;
}

const WISH_STATUS_JS = `(() => {
  "use strict";
  const ID = "mmd-wish-pending-v1";
  const ENDPOINT = "/v1/model/session/current?mode=year6_direct_wish";
  if (document.getElementById(ID)) return;

  function renderPending() {
    if (document.getElementById(ID)) return;
    const node = document.createElement("aside");
    node.id = ID;
    node.className = "mmd-wish-pending-v1";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.innerHTML = '<span class="mmd-wish-pending-v1__dot" aria-hidden="true"></span>' +
      '<div class="mmd-wish-pending-v1__copy"><small>MODEL WISH</small><strong>รอยืนยัน</strong>' +
      '<span>MMD ได้รับคำอวยพรแล้ว · พี่เปอร์กำลังตรวจให้ครับ สถานะนี้ไม่กระทบการเข้า Dashboard หรือการรับงาน</span></div>' +
      '<a class="mmd-wish-pending-v1__link" href="/sigil/model/wish">ดูคำอวยพร</a>';
    document.body.prepend(node);
  }

  fetch(ENDPOINT, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { accept: "application/json" },
  }).then((response) => response.ok ? response.json() : null)
    .then((payload) => {
      if (payload && payload.ok === true && payload.submitted === true && payload.state === "manual_review") {
        renderPending();
      }
    }).catch(() => {});
})();`;

const WISH_STATUS_CSS = `
#mmd-wish-pending-v1.mmd-wish-pending-v1{
  position:relative;z-index:2147480000;width:min(calc(100% - 24px),1180px);margin:12px auto 0;
  display:grid;grid-template-columns:auto minmax(0,1fr);gap:11px;align-items:center;
  padding:13px 14px;border:1px solid rgba(232,196,119,.44);border-radius:18px;
  background:linear-gradient(180deg,rgba(61,49,19,.96),rgba(35,29,14,.96));
  box-shadow:0 14px 42px rgba(0,0,0,.24);color:#fff8ec;
  font-family:"IBM Plex Sans Thai","Noto Sans Thai",system-ui,sans-serif;
}
#mmd-wish-pending-v1 .mmd-wish-pending-v1__dot{
  width:10px;height:10px;border-radius:50%;background:#f1c75b;
  box-shadow:0 0 0 5px rgba(241,199,91,.12);
}
#mmd-wish-pending-v1 .mmd-wish-pending-v1__copy{min-width:0;display:grid;gap:2px}
#mmd-wish-pending-v1 .mmd-wish-pending-v1__copy small{
  color:#f6d783;font-size:9px;line-height:1.2;font-weight:800;letter-spacing:.14em;
}
#mmd-wish-pending-v1 .mmd-wish-pending-v1__copy strong{
  color:#ffe29a;font-size:15px;line-height:1.35;font-weight:800;
}
#mmd-wish-pending-v1 .mmd-wish-pending-v1__copy span{
  color:rgba(255,248,236,.78);font-size:11.5px;line-height:1.5;
}
#mmd-wish-pending-v1 .mmd-wish-pending-v1__link{
  grid-column:2;justify-self:start;color:#ffe29a;text-decoration:none;font-size:11px;font-weight:700;
  border-bottom:1px solid rgba(255,226,154,.45);
}
@media(min-width:640px){
  #mmd-wish-pending-v1.mmd-wish-pending-v1{grid-template-columns:auto minmax(0,1fr) auto;padding:14px 16px}
  #mmd-wish-pending-v1 .mmd-wish-pending-v1__link{grid-column:3;grid-row:1;justify-self:end;align-self:center}
}
`;

function normalizePath(pathname = "") {
  const value = String(pathname || "/").replace(/\/{2,}/g, "/");
  return value || "/";
}

export function isPresentationUiPath(pathname = "") {
  const path = normalizePath(pathname);
  return path === UI_PREFIX || path === `${UI_PREFIX}/` || path.startsWith(`${UI_PREFIX}/`);
}

export function isPresentationAssetPath(pathname = "") {
  return normalizePath(pathname).startsWith(ASSET_PREFIX);
}

export function isPresentationRootRuntimePath(pathname = "") {
  const path = normalizePath(pathname);
  return ROOT_RUNTIME_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function isWishStatusAssetPath(pathname = "") {
  const path = normalizePath(pathname);
  return path === WISH_STATUS_JS_PATH || path === WISH_STATUS_CSS_PATH;
}

function hasCookie(request, name) {
  const raw = String(request.headers.get("cookie") || "");
  return raw.split(";").some((part) => {
    const index = part.indexOf("=");
    if (index < 0) return false;
    return part.slice(0, index).trim() === name && part.slice(index + 1).trim().length > 0;
  });
}

export function hasModelSessionCookie(request) {
  return hasCookie(request, MODEL_SESSION_COOKIE);
}

export function hasLineRedirectContext(request) {
  const url = new URL(request.url);
  const p = url.searchParams;
  return p.has("liff.state")
    || p.has("liff_state")
    || p.has("liffClientId")
    || p.has("liffRedirectUri")
    || p.has("access_token")
    || (p.has("code") && p.has("state"));
}

function nestedLiffStateParams(url) {
  const raw = String(url.searchParams.get("liff.state") || url.searchParams.get("liff_state") || "");
  if (!raw) return new URLSearchParams();
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : raw.replace(/^[?#]/, "");
  return new URLSearchParams(query.split("#", 1)[0]);
}

function boundedParam(url, name) {
  const direct = String(url.searchParams.get(name) || "");
  if (direct) return direct;
  return String(nestedLiffStateParams(url).get(name) || "");
}

export function resolveLiffEnvironmentFromRequest(request) {
  const url = new URL(request.url);
  const value = boundedParam(url, "liff_env");
  return value === "developing" || value === "review" ? value : "published";
}

export function hasLiffPrimaryBootstrapCookie(request) {
  return hasCookie(request, LIFF_PRIMARY_BOOTSTRAP_COOKIE);
}

export function shouldServeLiffPrimaryBootstrap(request) {
  const method = String(request.method || "GET").toUpperCase();
  if (!new Set(["GET", "HEAD"]).has(method)) return false;
  const url = new URL(request.url);
  if (!isPresentationUiPath(url.pathname)) return false;
  if (!hasLineRedirectContext(request)) return false;
  if (hasLiffPrimaryBootstrapCookie(request)) return false;
  return true;
}

function safeMiniAppUrlForBootstrap(request) {
  const source = new URL(request.url);
  const environment = resolveLiffEnvironmentFromRequest(request);
  const params = new URLSearchParams();
  if (environment !== "published") params.set("liff_env", environment);

  const lang = boundedParam(source, "lang");
  if (lang === "th" || lang === "en" || lang === "zh") params.set("lang", lang);
  if (boundedParam(source, "flow") === "verify") params.set("flow", "verify");
  if (boundedParam(source, "handoff") === "job-confirmed") params.set("handoff", "job-confirmed");
  const activation = boundedParam(source, "activation");
  if (activation && activation.length <= 4096) params.set("activation", activation);
  return miniAppPermanentLink(MODEL_LIFF_IDS[environment], params);
}

export function liffPrimaryBootstrapHtml(request) {
  const environment = resolveLiffEnvironmentFromRequest(request);
  const liffId = MODEL_LIFF_IDS[environment];
  const fallback = safeMiniAppUrlForBootstrap(request);
  const safeId = JSON.stringify(liffId);
  const safeFallback = JSON.stringify(fallback);
  const safeSdk = JSON.stringify(LIFF_SDK_URL);
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<title>MMD MODEL · LINE</title>
<style>
html,body{margin:0;min-height:100%;background:#0e0d0c;color:#f7f1e7;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}
section{max-width:420px;text-align:center}b{display:block;font-size:18px;margin-bottom:8px}p{opacity:.72;line-height:1.6}
a{display:none;margin-top:18px;color:#f2cf7a;text-decoration:none}small{display:block;margin-top:12px;opacity:.5;word-break:break-word}
</style>
<script src=${safeSdk}></script>
</head>
<body>
<main><section><b>กำลังยืนยัน LINE สำหรับ MMD MODEL</b><p id="status">กำลังเปิดเซสชันที่ปลอดภัย…</p><a id="fallback" href=${safeFallback}>เปิด MMD MODEL ผ่าน LINE</a><small id="detail"></small></section></main>
<script>
(async function(){
  var status=document.getElementById("status");
  var fallback=document.getElementById("fallback");
  var detail=document.getElementById("detail");
  try{
    if(!window.liff||typeof window.liff.init!=="function") throw new Error("line_sdk_unavailable");
    await window.liff.init({liffId:${safeId}});
    status.textContent="ยืนยัน LINE แล้ว · LINE กำลังเปิด MMD MODEL…";
  }catch(error){
    status.textContent="ยังเปิด MMD MODEL ผ่าน LINE ไม่สำเร็จ";
    fallback.style.display="inline-block";
    detail.textContent=String((error&&error.code)||"")+(error&&error.message?" · "+String(error.message):"");
  }
})();
</script>
</body>
</html>`;
}

function liffPrimaryBootstrapResponse(request) {
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "set-cookie": `${LIFF_PRIMARY_BOOTSTRAP_COOKIE}=1; Path=/; Max-Age=120; Secure; SameSite=Lax`,
    "x-mmd-worker": WORKER_NAME,
    "x-mmd-route-owner": WORKER_NAME,
    "x-mmd-model-entry": "liff-primary-preboot-v1",
    "x-robots-tag": "noindex, nofollow",
  });
  return new Response(request.method.toUpperCase() === "HEAD" ? null : liffPrimaryBootstrapHtml(request), {
    status: 200,
    headers,
  });
}

export function modelMiniAppHandoffUrl(request) {
  const source = new URL(request.url);
  const params = new URLSearchParams();

  const env = source.searchParams.get("liff_env");
  if (env === "developing" || env === "review") params.set("liff_env", env);

  const lang = source.searchParams.get("lang");
  if (lang === "th" || lang === "en" || lang === "zh") params.set("lang", lang);

  if (source.searchParams.get("flow") === "verify") params.set("flow", "verify");
  if (source.searchParams.get("handoff") === "job-confirmed") {
    params.set("handoff", "job-confirmed");
  }

  const activation = String(source.searchParams.get("activation") || "");
  if (activation && activation.length <= 4096) params.set("activation", activation);

  return miniAppPermanentLink(MODEL_LIFF_ID, params);
}

export function shouldHandoffToMiniApp(request) {
  const method = String(request.method || "GET").toUpperCase();
  if (!new Set(["GET", "HEAD"]).has(method)) return false;
  if (!isPresentationUiPath(new URL(request.url).pathname)) return false;
  if (hasModelSessionCookie(request)) return false;
  if (hasLiffPrimaryBootstrapCookie(request)) return false;
  if (hasLineRedirectContext(request)) return false;
  return true;
}

function miniAppHandoff(request) {
  return new Response(null, {
    status: 302,
    headers: {
      location: modelMiniAppHandoffUrl(request),
      "cache-control": "no-store",
      "x-mmd-worker": WORKER_NAME,
      "x-mmd-route-owner": WORKER_NAME,
      "x-mmd-model-entry": "line-miniapp-handoff-v1",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function presentationRequestHeaders(request, { runtime = false } = {}) {
  const headers = new Headers();
  const allowed = runtime
    ? ["accept", "accept-language", "content-type", "if-none-match", "if-modified-since", "range", "user-agent"]
    : ["accept", "accept-language", "if-none-match", "if-modified-since", "range", "user-agent"];
  for (const name of allowed) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export function presentationUrlForPage(request) {
  const source = new URL(request.url);
  const path = normalizePath(source.pathname);
  const suffix = path.slice(UI_PREFIX.length);
  const upstream = new URL(PRESENTATION_ORIGIN);
  upstream.pathname = suffix || "/";
  upstream.search = source.search;
  return upstream;
}

export function presentationUrlForAsset(request) {
  const source = new URL(request.url);
  const path = normalizePath(source.pathname);
  const upstream = new URL(PRESENTATION_ORIGIN);

  if (isPresentationAssetPath(path)) {
    const suffix = path.slice(ASSET_PREFIX.length);
    upstream.pathname = suffix ? `/${suffix}` : "/";
  } else if (isPresentationRootRuntimePath(path)) {
    // Compatibility alias for TanStack/Lovable lazy runtime chunks that still
    // resolve to root-absolute paths after hydration. Keeping these requests
    // on the MMD host prevents apex -> www redirects from becoming CORS errors.
    upstream.pathname = path;
  } else {
    upstream.pathname = path;
  }

  upstream.search = source.search;
  return upstream;
}

function stripLovableChrome(html) {
  return String(html || "")
    .replace(/<aside\b[^>]*id=["']lovable-badge["'][\s\S]*?<\/aside>/gi, "")
    .replace(/<script\b[^>]*src=["']\/~flock\.js["'][\s\S]*?<\/script>/gi, "");
}

function rewriteRuntimePaths(source) {
  return String(source || "")
    .replaceAll("/_build/", `${ASSET_PREFIX}_build/`)
    .replaceAll("/_serverFn/", `${ASSET_PREFIX}_serverFn/`)
    .replaceAll("/assets/", `${ASSET_PREFIX}assets/`)
    .replaceAll("/favicon.ico", `${ASSET_PREFIX}favicon.ico`);
}

export function rewritePresentationHtml(html) {
  let output = rewriteRuntimePaths(stripLovableChrome(html));

  // Lovable SSR renders root-based app links. Keep the first paint and
  // no-JS fallback on the canonical MMD path before the client router hydrates.
  output = output.replace(/href=["']\/["']/g, `href="${UI_PREFIX}"`);
  for (const suffix of APP_ROUTE_SUFFIXES) {
    output = output.replace(
      new RegExp(`href=["']\\/${suffix}(?:\\/)?["']`, "g"),
      `href="${UI_PREFIX}/${suffix}"`,
    );
  }
  if (!output.includes('data-mmd-wish-status-assets="v1"')) {
    output = output.replace(
      /<\/head\s*>/i,
      `<link rel="stylesheet" href="${WISH_STATUS_CSS_PATH}" data-mmd-wish-status-assets="v1"></head>`,
    );
    output = output.replace(
      /<\/body\s*>/i,
      `<script src="${WISH_STATUS_JS_PATH}" defer data-mmd-wish-status-runtime="v1"></script></body>`,
    );
  }
  return output;
}

export function rewritePresentationText(source) {
  return rewriteRuntimePaths(source);
}

function responseHeaders(upstreamHeaders, { html = false, rewritten = false } = {}) {
  const headers = new Headers(upstreamHeaders);
  for (const name of ["content-length", "set-cookie", "reporting-endpoints", "report-to", "nel"]) {
    headers.delete(name);
  }
  if (rewritten) {
    for (const name of ["content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  }
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-ui-source", UI_SOURCE);
  headers.set("x-mmd-ui-app", APP_MARKER);
  headers.set("x-robots-tag", "noindex, nofollow");
  if (html) headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  return headers;
}

async function fetchUpstream(request, upstreamUrl, { runtime = false } = {}) {
  const method = request.method.toUpperCase();
  const init = {
    method,
    headers: presentationRequestHeaders(request, { runtime }),
    redirect: "follow",
  };
  if (runtime && !new Set(["GET", "HEAD"]).has(method)) init.body = request.body;
  return globalThis.fetch(new Request(upstreamUrl, init));
}

async function proxyPage(request) {
  if (!new Set(["GET", "HEAD"]).has(request.method.toUpperCase())) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD", "cache-control": "no-store", "x-mmd-worker": WORKER_NAME },
    });
  }

  let upstream;
  try {
    upstream = await fetchUpstream(request, presentationUrlForPage(request));
  } catch (_) {
    return unavailable();
  }

  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const isHtml = contentType.includes("text/html");
  const headers = responseHeaders(upstream.headers, { html: isHtml, rewritten: isHtml });
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  }
  if (!isHtml) return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });

  const html = rewritePresentationHtml(await upstream.text());
  return new Response(html, { status: upstream.status, statusText: upstream.statusText, headers });
}

async function proxyRuntime(request) {
  let upstream;
  try {
    upstream = await fetchUpstream(request, presentationUrlForAsset(request), { runtime: true });
  } catch (_) {
    return unavailable();
  }

  const upstreamUrl = presentationUrlForAsset(request);
  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const isTextRuntime =
    contentType.includes("javascript") ||
    contentType.includes("text/css") ||
    contentType.includes("application/json") ||
    upstreamUrl.pathname.endsWith(".js") ||
    upstreamUrl.pathname.endsWith(".mjs") ||
    upstreamUrl.pathname.endsWith(".css");
  const headers = responseHeaders(upstream.headers, { rewritten: isTextRuntime });

  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  }
  if (!isTextRuntime) {
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  }

  return new Response(rewritePresentationText(await upstream.text()), {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function wishStatusAssetResponse(pathname, method = "GET") {
  const path = normalizePath(pathname);
  const isHead = String(method || "GET").toUpperCase() === "HEAD";
  if (!["GET", "HEAD"].includes(String(method || "GET").toUpperCase())) {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD", "cache-control": "public, max-age=300" } });
  }
  if (path === WISH_STATUS_JS_PATH) {
    return new Response(isHead ? null : WISH_STATUS_JS, {
      status: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-mmd-dashboard-addon": "wish-status-v1",
      },
    });
  }
  if (path === WISH_STATUS_CSS_PATH) {
    return new Response(isHead ? null : WISH_STATUS_CSS, {
      status: 200,
      headers: {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-mmd-dashboard-addon": "wish-status-v1",
      },
    });
  }
  return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
}

function unavailable() {
  return new Response("MMD Model Dashboard is temporarily unavailable.", {
    status: 502,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-worker": WORKER_NAME,
      "x-mmd-route-owner": WORKER_NAME,
      "x-mmd-ui-source": UI_SOURCE,
    },
  });
}

export default {
  async fetch(request) {
    const path = normalizePath(new URL(request.url).pathname);
    if (isWishStatusAssetPath(path)) return wishStatusAssetResponse(path, request.method);
    if (isPresentationAssetPath(path) || isPresentationRootRuntimePath(path)) return proxyRuntime(request);
    if (isPresentationUiPath(path)) {
      if (shouldServeLiffPrimaryBootstrap(request)) return liffPrimaryBootstrapResponse(request);
      if (shouldHandoffToMiniApp(request)) return miniAppHandoff(request);
      return proxyPage(request);
    }
    return new Response("Not Found", {
      status: 404,
      headers: { "cache-control": "no-store", "x-mmd-worker": WORKER_NAME },
    });
  },
};
