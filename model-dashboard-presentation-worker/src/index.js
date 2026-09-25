import { MODEL_HISTORY_JS, MODEL_HISTORY_CSS } from "./model-history-presentation.js";

const WORKER_NAME = "model-dashboard-presentation-worker";
const UI_PREFIX = "/sigil/model/dashboard";
const WISH_PATH = "/sigil/model/wish";
const ASSET_PREFIX = "/sigil/model/dashboard-assets/";
const ROOT_RUNTIME_PREFIXES = ["/_build/", "/_serverFn/", "/assets/"];
const PRESENTATION_ORIGIN = "https://mmdmodel.lovable.app";
const WISH_PRESENTATION_ORIGIN = "https://mmdprive.webflow.io";
const UI_SOURCE = "lovable-presentation-proxy";
const APP_MARKER = "lovable-model-dashboard";
const APP_ROUTE_SUFFIXES = ["profile", "availability", "photos", "support"];
const MODEL_PWA_ASSET_PATHS = new Set([
  `${UI_PREFIX}/manifest.webmanifest`,
  `${UI_PREFIX}/mmd-app-icon.svg`,
  `${UI_PREFIX}/sw.js`,
]);
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
const TELEGRAM_CONNECT_JS_PATH = `${ASSET_PREFIX}telegram-connect-v1.js`;
const TELEGRAM_CONNECT_CSS_PATH = `${ASSET_PREFIX}telegram-connect-v1.css`;
const MODEL_HISTORY_JS_PATH = `${ASSET_PREFIX}model-history-v1.js`;
const MODEL_HISTORY_CSS_PATH = `${ASSET_PREFIX}model-history-v1.css`;
const MODEL_PWA_MANIFEST_PATH = `${UI_PREFIX}/manifest.webmanifest`;
const MODEL_PWA_ICON_URL = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6aa586601bf3d46fb15c5699_05-tiny-mark-512px.webp";

export function modelPwaManifest() {
  return {
    id: UI_PREFIX,
    name: "MMD APP",
    short_name: "MMD APP",
    description: "MMD Privé onboarding, dashboard, Wish and model-side services",
    lang: "th",
    start_url: `${UI_PREFIX}?launch=pwa`,
    scope: UI_PREFIX,
    display: "standalone",
    background_color: "#090909",
    theme_color: "#090909",
    icons: [
      {
        src: MODEL_PWA_ICON_URL,
        sizes: "512x512",
        type: "image/webp",
        purpose: "any",
      },
    ],
  };
}

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

const TELEGRAM_CONNECT_JS = `(() => {
  "use strict";
  const ID = "mmd-model-telegram-connect-v1";
  const PROFILE = "/v1/model/profile";
  const BIND = "/v1/model/telegram/bind";
  if (document.getElementById(ID)) return;

  let busy = false;

  function profileModel(payload) {
    return payload?.model || payload?.profile || payload || {};
  }

  function safeConnectUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && url.hostname === "t.me" ? url.toString() : "";
    } catch (_) {
      return "";
    }
  }

  function ensureCard() {
    let node = document.getElementById(ID);
    if (node) return node;
    node = document.createElement("aside");
    node.id = ID;
    node.className = "mmd-model-telegram-connect-v1 is-loading";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.innerHTML =
      '<span class="mmd-model-telegram-connect-v1__icon" aria-hidden="true">↗</span>' +
      '<div class="mmd-model-telegram-connect-v1__copy">' +
        '<small>JOB NOTIFICATIONS</small>' +
        '<strong data-mmd-tg-title>กำลังตรวจ Telegram…</strong>' +
        '<span data-mmd-tg-copy>LINE ยังเป็นบัญชีหลักของ MMD APP</span>' +
      '</div>' +
      '<div class="mmd-model-telegram-connect-v1__actions">' +
        '<button type="button" data-mmd-tg-connect hidden>เชื่อม Telegram</button>' +
        '<button type="button" data-mmd-tg-refresh hidden>ตรวจสถานะ</button>' +
      '</div>';
    document.body.prepend(node);

    node.querySelector("[data-mmd-tg-connect]")?.addEventListener("click", connect);
    node.querySelector("[data-mmd-tg-refresh]")?.addEventListener("click", load);
    return node;
  }

  function render(model) {
    const node = ensureCard();
    const title = node.querySelector("[data-mmd-tg-title]");
    const copy = node.querySelector("[data-mmd-tg-copy]");
    const connectButton = node.querySelector("[data-mmd-tg-connect]");
    const refreshButton = node.querySelector("[data-mmd-tg-refresh]");
    const connected = model?.telegram_connected === true || String(model?.telegram_verification_status || "").toLowerCase() === "verified";
    const username = String(model?.telegram_username || "").replace(/^@/, "").trim();

    node.classList.remove("is-loading", "is-connected", "is-needed", "is-error");
    if (connected) {
      node.classList.add("is-connected");
      if (title) title.textContent = username ? "Telegram Connected · @" + username : "Telegram Connected";
      if (copy) copy.textContent = "พร้อมรับลิงก์ยืนยันงานและข้อความสำคัญจาก MMD โดยตรง";
      if (connectButton) connectButton.hidden = true;
      if (refreshButton) refreshButton.hidden = true;
      return;
    }

    node.classList.add("is-needed");
    if (title) title.textContent = "เชื่อม Telegram สำหรับแจ้งงาน";
    if (copy) copy.textContent = "ใช้รับลิงก์ยืนยันงานและข้อความสำคัญจาก MMD · LINE ยังเป็นบัญชีหลัก และการเข้า Dashboard ยังใช้ได้ตามปกติ";
    if (connectButton) connectButton.hidden = false;
    if (refreshButton) refreshButton.hidden = false;
  }

  function renderError(message) {
    const node = ensureCard();
    node.classList.remove("is-loading", "is-connected", "is-needed");
    node.classList.add("is-error");
    const title = node.querySelector("[data-mmd-tg-title]");
    const copy = node.querySelector("[data-mmd-tg-copy]");
    const connectButton = node.querySelector("[data-mmd-tg-connect]");
    const refreshButton = node.querySelector("[data-mmd-tg-refresh]");
    if (title) title.textContent = "ยังตรวจ Telegram ไม่สำเร็จ";
    if (copy) copy.textContent = message || "ลองตรวจสถานะอีกครั้งได้ครับ";
    if (connectButton) connectButton.hidden = true;
    if (refreshButton) refreshButton.hidden = false;
  }

  async function load() {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch(PROFILE, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (response.status === 401 || response.status === 403) return;
      if (!response.ok) throw new Error("profile_unavailable");
      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== "object") throw new Error("profile_invalid");
      render(profileModel(payload));
    } catch (_) {
      renderError("ยังตรวจสถานะ Telegram ไม่สำเร็จ · ลองอีกครั้งได้ครับ");
    } finally {
      busy = false;
    }
  }

  async function connect() {
    if (busy) return;
    busy = true;
    const node = ensureCard();
    const connectButton = node.querySelector("[data-mmd-tg-connect]");
    const refreshButton = node.querySelector("[data-mmd-tg-refresh]");
    if (connectButton) {
      connectButton.disabled = true;
      connectButton.textContent = "กำลังเปิด Telegram…";
    }
    if (refreshButton) refreshButton.disabled = true;
    try {
      const response = await fetch(BIND, {
        method: "POST",
        credentials: "include",
        headers: { accept: "application/json" },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) throw new Error(payload?.error || "telegram_bind_failed");
      const connectUrl = safeConnectUrl(payload.connect_url);
      if (!connectUrl) throw new Error("telegram_connect_url_invalid");
      location.assign(connectUrl);
    } catch (_) {
      renderError("เปิด Telegram ยังไม่สำเร็จครับ · กดตรวจสถานะแล้วลองเชื่อมอีกครั้งได้");
    } finally {
      busy = false;
      if (connectButton) {
        connectButton.disabled = false;
        connectButton.textContent = "เชื่อม Telegram";
      }
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  ensureCard();
  load();
  window.addEventListener("focus", () => setTimeout(load, 250));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") setTimeout(load, 250);
  });
})();`;

const TELEGRAM_CONNECT_CSS = `
#mmd-model-telegram-connect-v1.mmd-model-telegram-connect-v1{
  position:relative;z-index:2147480001;width:min(calc(100% - 24px),1180px);margin:12px auto 0;
  display:grid;grid-template-columns:auto minmax(0,1fr);gap:11px;align-items:center;
  padding:13px 14px;border:1px solid rgba(106,170,255,.28);border-radius:18px;
  background:linear-gradient(180deg,rgba(19,28,42,.97),rgba(13,18,27,.97));
  box-shadow:0 14px 42px rgba(0,0,0,.24);color:#eef5ff;
  font-family:"IBM Plex Sans Thai","Noto Sans Thai",system-ui,sans-serif;
}
#mmd-model-telegram-connect-v1 .mmd-model-telegram-connect-v1__icon{
  width:28px;height:28px;border-radius:999px;display:grid;place-items:center;
  border:1px solid rgba(121,184,255,.35);background:rgba(79,145,229,.12);color:#9dcbff;font-size:14px;
}
#mmd-model-telegram-connect-v1 .mmd-model-telegram-connect-v1__copy{min-width:0;display:grid;gap:2px}
#mmd-model-telegram-connect-v1 .mmd-model-telegram-connect-v1__copy small{
  color:#9dcbff;font-size:9px;line-height:1.2;font-weight:800;letter-spacing:.14em;
}
#mmd-model-telegram-connect-v1 .mmd-model-telegram-connect-v1__copy strong{
  color:#f4f8ff;font-size:14px;line-height:1.4;font-weight:800;
}
#mmd-model-telegram-connect-v1 .mmd-model-telegram-connect-v1__copy span{
  color:rgba(238,245,255,.7);font-size:11.5px;line-height:1.5;
}
#mmd-model-telegram-connect-v1 .mmd-model-telegram-connect-v1__actions{
  grid-column:2;display:flex;gap:7px;align-items:center;flex-wrap:wrap;
}
#mmd-model-telegram-connect-v1 button{
  appearance:none;border:1px solid rgba(157,203,255,.34);border-radius:999px;
  min-height:34px;padding:0 12px;background:rgba(157,203,255,.1);color:#dcebff;
  font:700 11px/1.2 inherit;cursor:pointer;
}
#mmd-model-telegram-connect-v1 button[data-mmd-tg-connect]{background:#dbeaff;color:#132238;border-color:#dbeaff}
#mmd-model-telegram-connect-v1 button:focus-visible{outline:2px solid #9dcbff;outline-offset:2px}
#mmd-model-telegram-connect-v1 button:disabled{opacity:.55;cursor:wait}
#mmd-model-telegram-connect-v1.is-connected{
  border-color:rgba(92,205,143,.28);background:linear-gradient(180deg,rgba(16,42,31,.97),rgba(12,27,22,.97));
}
#mmd-model-telegram-connect-v1.is-connected .mmd-model-telegram-connect-v1__icon{
  border-color:rgba(92,205,143,.34);background:rgba(92,205,143,.11);color:#80ddb0;
}
#mmd-model-telegram-connect-v1.is-connected .mmd-model-telegram-connect-v1__copy small{color:#80ddb0}
#mmd-model-telegram-connect-v1.is-error{border-color:rgba(245,186,90,.3);background:linear-gradient(180deg,rgba(52,39,18,.97),rgba(31,25,15,.97))}
@media(min-width:640px){
  #mmd-model-telegram-connect-v1.mmd-model-telegram-connect-v1{grid-template-columns:auto minmax(0,1fr) auto;padding:14px 16px}
  #mmd-model-telegram-connect-v1 .mmd-model-telegram-connect-v1__actions{grid-column:3;grid-row:1;justify-self:end}
}
@media(prefers-reduced-motion:reduce){
  #mmd-model-telegram-connect-v1 *{scroll-behavior:auto!important;transition:none!important}
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

export function isModelWishPath(pathname = "") {
  const path = normalizePath(pathname);
  return path === WISH_PATH || path === `${WISH_PATH}/`;
}

export function isPresentationAssetPath(pathname = "") {
  return normalizePath(pathname).startsWith(ASSET_PREFIX);
}

export function isPresentationRootRuntimePath(pathname = "") {
  const path = normalizePath(pathname);
  return ROOT_RUNTIME_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function isModelPwaAssetPath(pathname = "") {
  return MODEL_PWA_ASSET_PATHS.has(normalizePath(pathname));
}

export function isWishStatusAssetPath(pathname = "") {
  const path = normalizePath(pathname);
  return path === WISH_STATUS_JS_PATH || path === WISH_STATUS_CSS_PATH;
}

export function isTelegramConnectAssetPath(pathname = "") {
  const path = normalizePath(pathname);
  return path === TELEGRAM_CONNECT_JS_PATH || path === TELEGRAM_CONNECT_CSS_PATH;
}

export function isModelHistoryAssetPath(pathname = "") {
  const path = normalizePath(pathname);
  return path === MODEL_HISTORY_JS_PATH || path === MODEL_HISTORY_CSS_PATH;
}

export function isModelPwaManifestPath(pathname = "") {
  return normalizePath(pathname) === MODEL_PWA_MANIFEST_PATH;
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
  if (!isPresentationUiPath(url.pathname) || isModelPwaAssetPath(url.pathname)) return false;
  if (!hasLineRedirectContext(request)) return false;
  if (hasLiffPrimaryBootstrapCookie(request)) return false;
  return true;
}

export function isPwaLaunchRequest(request) {
  const url = new URL(request.url);
  return isPresentationUiPath(url.pathname) && url.searchParams.get("launch") === "pwa";
}

export function shouldServePwaLiffBootstrap(request) {
  const method = String(request.method || "GET").toUpperCase();
  if (!new Set(["GET", "HEAD"]).has(method)) return false;
  if (!isPwaLaunchRequest(request)) return false;
  if (hasModelSessionCookie(request)) return false;
  if (hasLineRedirectContext(request)) return false;
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
<title>MMD APP · LINE</title>
<style>
html,body{margin:0;min-height:100%;background:#0e0d0c;color:#f7f1e7;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}
section{max-width:420px;text-align:center}b{display:block;font-size:18px;margin-bottom:8px}p{opacity:.72;line-height:1.6}
a{display:none;margin-top:18px;color:#f2cf7a;text-decoration:none}small{display:block;margin-top:12px;opacity:.5;word-break:break-word}
</style>
<script src=${safeSdk}></script>
</head>
<body>
<main><section><b>กำลังยืนยัน LINE สำหรับ MMD APP</b><p id="status">กำลังเปิดเซสชันที่ปลอดภัย…</p><a id="fallback" href=${safeFallback}>เปิด MMD APP ผ่าน LINE</a><small id="detail"></small></section></main>
<script>
(async function(){
  var status=document.getElementById("status");
  var fallback=document.getElementById("fallback");
  var detail=document.getElementById("detail");
  try{
    if(!window.liff||typeof window.liff.init!=="function") throw new Error("line_sdk_unavailable");
    await window.liff.init({liffId:${safeId}});
    status.textContent="ยืนยัน LINE แล้ว · LINE กำลังเปิด MMD APP…";
  }catch(error){
    status.textContent="ยังเปิด MMD APP ผ่าน LINE ไม่สำเร็จ";
    fallback.style.display="inline-block";
    detail.textContent=String((error&&error.code)||"")+(error&&error.message?" · "+String(error.message):"");
  }
})();
</script>
</body>
</html>`;
}

export function liffPwaBootstrapHtml(request) {
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
<meta name="theme-color" content="#090909">
<title>MMD APP</title>
<style>
html,body{margin:0;min-height:100%;background:#090909;color:#f7f1e7;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}section{max-width:420px;text-align:center}
b{display:block;font-size:18px;margin-bottom:8px}p{opacity:.72;line-height:1.6}a{display:none;margin-top:18px;color:#f2cf7a;text-decoration:none}small{display:block;margin-top:12px;opacity:.5;word-break:break-word}
</style>
<script src=${safeSdk}></script>
</head>
<body>
<main><section><b>กำลังเปิด MMD APP</b><p id="status">กำลังยืนยัน LINE อย่างปลอดภัย…</p><a id="fallback" href=${safeFallback}>เปิดผ่าน LINE</a><small id="detail"></small></section></main>
<script>
(async function(){
  var status=document.getElementById("status");
  var fallback=document.getElementById("fallback");
  var detail=document.getElementById("detail");
  try{
    if(!window.liff||typeof window.liff.init!=="function") throw new Error("line_sdk_unavailable");
    await window.liff.init({liffId:${safeId},withLoginOnExternalBrowser:true});
    status.textContent="ยืนยัน LINE แล้ว · กำลังเปิด Dashboard…";
  }catch(error){
    status.textContent="ยังเปิด MMD APP ไม่สำเร็จ";
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

function liffPwaBootstrapResponse(request) {
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "x-mmd-worker": WORKER_NAME,
    "x-mmd-route-owner": WORKER_NAME,
    "x-mmd-model-entry": "pwa-liff-bootstrap-v1",
    "x-robots-tag": "noindex, nofollow",
  });
  return new Response(request.method.toUpperCase() === "HEAD" ? null : liffPwaBootstrapHtml(request), {
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
  if (isPwaLaunchRequest(request)) return false;
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

export function modelWishPresentationUrl(request) {
  const source = new URL(request.url);
  const upstream = new URL(WISH_PRESENTATION_ORIGIN);
  upstream.pathname = WISH_PATH;
  upstream.search = source.search;
  return upstream;
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

function injectModelPwaShell(html) {
  const output = String(html || "");
  if (output.includes('data-mmd-model-pwa="v1"')) return output;
  const pwa = `<link rel="manifest" href="${MODEL_PWA_MANIFEST_PATH}" data-mmd-model-pwa="v1">` +
    `<meta name="theme-color" content="#090909" data-mmd-model-pwa="v1">` +
    `<meta name="mobile-web-app-capable" content="yes" data-mmd-model-pwa="v1">` +
    `<meta name="apple-mobile-web-app-capable" content="yes" data-mmd-model-pwa="v1">` +
    `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" data-mmd-model-pwa="v1">` +
    `<meta name="apple-mobile-web-app-title" content="MMD APP" data-mmd-model-pwa="v1">` +
    `<link rel="apple-touch-icon" href="${MODEL_PWA_ICON_URL}" data-mmd-model-pwa="v1">`;
  return output.replace(/<\/head\s*>/i, `${pwa}</head>`);
}

export function rewritePresentationHtml(html) {
  let output = injectModelPwaShell(rewriteRuntimePaths(stripLovableChrome(html)));

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
  if (!output.includes('data-mmd-telegram-connect-assets="v1"')) {
    output = output.replace(
      /<\/head\s*>/i,
      `<link rel="stylesheet" href="${TELEGRAM_CONNECT_CSS_PATH}" data-mmd-telegram-connect-assets="v1"></head>`,
    );
    output = output.replace(
      /<\/body\s*>/i,
      `<script src="${TELEGRAM_CONNECT_JS_PATH}" defer data-mmd-telegram-connect-runtime="v1"></script></body>`,
    );
  }
  if (!output.includes('data-mmd-model-history-assets="v1"')) {
    output = output.replace(
      /<\/head\s*>/i,
      `<link rel="stylesheet" href="${MODEL_HISTORY_CSS_PATH}" data-mmd-model-history-assets="v1"></head>`,
    );
    output = output.replace(
      /<\/body\s*>/i,
      `<script src="${MODEL_HISTORY_JS_PATH}" defer data-mmd-model-history-runtime="v1"></script></body>`,
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

function modelWishResponseHeaders(upstreamHeaders) {
  const headers = new Headers(upstreamHeaders);
  for (const name of [
    "content-length",
    "set-cookie",
    "reporting-endpoints",
    "report-to",
    "nel",
  ]) {
    headers.delete(name);
  }
  headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-ui-source", "webflow-apex-proxy");
  headers.set("x-mmd-page", "model-wish");
  headers.set("x-mmd-page-source", `${WISH_PRESENTATION_ORIGIN}${WISH_PATH}`);
  headers.set("x-robots-tag", "noindex, nofollow");
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
  if (isModelPwaAssetPath(new URL(request.url).pathname)) headers.set("cache-control", "no-cache");
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  }
  if (!isHtml) return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });

  const html = rewritePresentationHtml(await upstream.text());
  return new Response(html, { status: upstream.status, statusText: upstream.statusText, headers });
}

async function proxyModelWishPage(request) {
  const method = request.method.toUpperCase();
  if (!new Set(["GET", "HEAD"]).has(method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        allow: "GET, HEAD",
        "cache-control": "no-store",
        "x-mmd-worker": WORKER_NAME,
        "x-mmd-route-owner": WORKER_NAME,
        "x-mmd-page": "model-wish",
      },
    });
  }

  let upstream;
  try {
    upstream = await fetchUpstream(request, modelWishPresentationUrl(request));
  } catch (_) {
    return new Response("MMD APP Wish is temporarily unavailable.", {
      status: 502,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-mmd-worker": WORKER_NAME,
        "x-mmd-route-owner": WORKER_NAME,
        "x-mmd-page": "model-wish",
      },
    });
  }

  const headers = modelWishResponseHeaders(upstream.headers);
  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
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

function telegramConnectAssetResponse(pathname, method = "GET") {
  const path = normalizePath(pathname);
  const isHead = String(method || "GET").toUpperCase() === "HEAD";
  if (!["GET", "HEAD"].includes(String(method || "GET").toUpperCase())) {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD", "cache-control": "public, max-age=300" } });
  }
  if (path === TELEGRAM_CONNECT_JS_PATH) {
    return new Response(isHead ? null : TELEGRAM_CONNECT_JS, {
      status: 200,
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-mmd-dashboard-addon": "telegram-connect-v1",
      },
    });
  }
  if (path === TELEGRAM_CONNECT_CSS_PATH) {
    return new Response(isHead ? null : TELEGRAM_CONNECT_CSS, {
      status: 200,
      headers: {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-mmd-dashboard-addon": "telegram-connect-v1",
      },
    });
  }
  return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
}

function modelHistoryAssetResponse(pathname, method = "GET") {
  const path = normalizePath(pathname);
  const isHead = String(method || "GET").toUpperCase() === "HEAD";
  if (!["GET", "HEAD"].includes(String(method || "GET").toUpperCase())) {
    return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD", "cache-control": "public, max-age=300" } });
  }
  if (path === MODEL_HISTORY_JS_PATH) return new Response(isHead ? null : MODEL_HISTORY_JS, { status: 200, headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300", "x-mmd-dashboard-addon": "model-history-v1" } });
  if (path === MODEL_HISTORY_CSS_PATH) return new Response(isHead ? null : MODEL_HISTORY_CSS, { status: 200, headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=300", "x-mmd-dashboard-addon": "model-history-v1" } });
  return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
}

function modelPwaManifestResponse(method = "GET") {
  const normalizedMethod = String(method || "GET").toUpperCase();
  if (!["GET", "HEAD"].includes(normalizedMethod)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD", "cache-control": "no-store" },
    });
  }

  return new Response(normalizedMethod === "HEAD" ? null : JSON.stringify(modelPwaManifest()), {
    status: 200,
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-mmd-dashboard-addon": "pwa-manifest-v1",
      "x-content-type-options": "nosniff",
    },
  });
}

function unavailable() {
  return new Response("MMD APP Dashboard is temporarily unavailable.", {
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
    if (isModelWishPath(path)) return proxyModelWishPage(request);
    if (isModelPwaManifestPath(path)) return modelPwaManifestResponse(request.method);
    if (isWishStatusAssetPath(path)) return wishStatusAssetResponse(path, request.method);
    if (isTelegramConnectAssetPath(path)) return telegramConnectAssetResponse(path, request.method);
    if (isModelHistoryAssetPath(path)) return modelHistoryAssetResponse(path, request.method);
    if (isPresentationAssetPath(path) || isPresentationRootRuntimePath(path)) return proxyRuntime(request);
    if (isPresentationUiPath(path)) {
      if (shouldServeLiffPrimaryBootstrap(request)) return liffPrimaryBootstrapResponse(request);
      if (shouldServePwaLiffBootstrap(request)) return liffPwaBootstrapResponse(request);
      if (shouldHandoffToMiniApp(request)) return miniAppHandoff(request);
      return proxyPage(request);
    }
    return new Response("Not Found", {
      status: 404,
      headers: { "cache-control": "no-store", "x-mmd-worker": WORKER_NAME },
    });
  },
};
