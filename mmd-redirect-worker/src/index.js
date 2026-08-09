/**
 * MMD Permanent Redirect Guard
 * Front gate for public routes, membership pages, and worker route ownership.
 */

export const CANONICAL_HOST = "mmdbkk.com";
export const CANONICAL_PROTOCOL = "https:";
export const MEMBER_DASHBOARD_UPSTREAM = "https://immigrate-worker.malemodel-bkk.workers.dev";
export const MEMBER_PAGES_UPSTREAM = "https://member-pages-worker.malemodel-bkk.workers.dev";
export const ADMIN_WORKER_UPSTREAM = "https://admin-worker.malemodel-bkk.workers.dev";
export const SIGIL_WORKER_UPSTREAM = "https://sigil.mmdbkk.com";
export const DEFAULT_WEBFLOW_ORIGIN_HOST = "mmdprive.webflow.io";
export const FRONT_GATE = "mmd-redirect-worker";
export const FRONT_VERSION = "20260803-studio-route-polish";
export const CANONICAL_MEMBERSHIP_PATH = "/sigil/member/membership";
export const PUBLIC_BLACKCARD_PAGE = "public-blackcard";
export const SIGIL_APPLY_ROUTE_OWNER = "sigil-worker";
export const KENJI_KNOWLEDGE_ADMIN_PATHS = new Set(["/internal/admin/kenji-knowledge", "/internal/admin/kenji-knowledge/"]);
export const STUDIO_WEBFLOW_ROUTE_REWRITES = new Map([
  ["/studio/upload", { path: "/internal/admin/studio/upload", page: "studio-upload" }],
  ["/studio/review", { path: "/internal/admin/studio/review", page: "studio-review" }],
  ["/studio/model-preview", { path: "/internal/admin/studio/model-preview", page: "studio-model-preview" }],
]);

export const REDIRECT_HOSTS = new Set(["www.mmdbkk.com", "mmdbkk.com", "mmdprive.com", "www.mmdprive.com", "malemodel-bkk.workers.dev"]);
export const NEVER_TOUCH_HOSTS = new Set(["sigil.mmdbkk.com"]);
export const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);
export const PUBLIC_BLACKCARD_PATHS = new Set(["/blackcard", "/blackcard/", "/blackcard/black-card", "/blackcard/black-card/"]);
export const WEBFLOW_MEMBER_PAGE_PATHS = new Set([CANONICAL_MEMBERSHIP_PATH, `${CANONICAL_MEMBERSHIP_PATH}/`, "/member/promotion", "/member/promotion/", "/member/apply", "/member/apply/"]);
export const WEBFLOW_PAY_MEMBERSHIP_PATHS = new Set(["/pay/membership", "/pay/membership/"]);
export const MEMBER_PAGE_PATHS = new Set(["/member/profile", "/member/profile/", "/pay/pending-verification", "/pay/pending-verification/", "/sigil/pay/renewal", "/sigil/pay/renewal/"]);
export const MEMBER_API_PATHS = new Set([
  "/member/api/liff/identify",
  "/member/api/liff/identify/",
  "/member/api/liff/start",
  "/member/api/liff/start/",
  "/member/api/liff/intent",
  "/member/api/liff/intent/",
  "/member/api/liff/audience",
  "/member/api/liff/audience/",
  "/member/api/liff/package",
  "/member/api/liff/package/",
  "/member/api/liff/payment-intent",
  "/member/api/liff/payment-intent/",
  "/member/api/liff/status",
  "/member/api/liff/status/",
  "/member/api/liff/hall-token",
  "/member/api/liff/hall-token/",
]);
export const NEVER_TOUCH_PREFIXES = ["/api/", "/webhook/", "/webhooks/", "/payments/", "/payment/", "/payment-webhook/", "/admin/", "/sigil/", "/cdn-cgi/", "/assets/", "/static/", "/uploads/"];
export const NEVER_REDIRECT_EXACT_PATHS = new Set(["/member/promotion", "/member/promotion/", "/member/apply", "/member/apply/", "/member/dashboard", "/member/dashboard/", CANONICAL_MEMBERSHIP_PATH, `${CANONICAL_MEMBERSHIP_PATH}/`, "/member/profile", "/member/profile/", "/member/payments", "/member/payments/", "/pay/pending-verification", "/pay/pending-verification/", "/sigil/pay/membership", "/sigil/pay/membership/", "/sigil/pay/renewal", "/sigil/pay/renewal/", "/hall", "/hall/", "/model/console", "/model/console/", "/blackcard", "/blackcard/", "/blackcard/black-card", "/blackcard/black-card/"]);
export const EXACT_PATH_REDIRECTS = { "/trust/inme": "/sigil/start", "/inme": "/sigil/start", "/login": "/sigil/start", "/member": "/member/dashboard", "/member/membership": CANONICAL_MEMBERSHIP_PATH, "/member/membership/benefits": CANONICAL_MEMBERSHIP_PATH, "/members": "/sigil/start", "/membership": CANONICAL_MEMBERSHIP_PATH, "/membership/benefits": CANONICAL_MEMBERSHIP_PATH, "/renew": "/sigil/membership", "/renewal": "/sigil/membership", "/trust": "/sigil/start" };
export const FOLDER_REDIRECTS = [{ from: "/old-academy/", to: "/academy/" }, { from: "/old-trust/", to: "/trust/" }];

export function isSafePageRequest(request) {
  const method = request.method.toUpperCase();
  return method === "GET" || method === "HEAD";
}

export function normalizePath(pathname) {
  let path = pathname || "/";
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/g, "");
  return path || "/";
}

export function shouldNeverTouch(url) {
  if (NEVER_TOUCH_HOSTS.has(url.hostname)) return true;
  const pathname = url.pathname.toLowerCase();
  if (NEVER_REDIRECT_EXACT_PATHS.has(pathname)) return true;
  return NEVER_TOUCH_PREFIXES.some((prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix));
}

export function findMappedPath(pathname) {
  const normalized = normalizePath(pathname);
  const key = normalized.toLowerCase();
  if (EXACT_PATH_REDIRECTS[key]) return EXACT_PATH_REDIRECTS[key];
  for (const rule of FOLDER_REDIRECTS) {
    if (key.startsWith(rule.from.toLowerCase())) return `${rule.to}${normalized.slice(rule.from.length)}`.replace(/\/{2,}/g, "/");
  }
  return normalized;
}

export function findStudioWebflowRoute(pathname) {
  return STUDIO_WEBFLOW_ROUTE_REWRITES.get(normalizePath(pathname).toLowerCase()) || null;
}

function withFrontGateHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("x-mmd-front-gate", FRONT_GATE);
  headers.set("x-mmd-front-version", FRONT_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withWebflowOriginHeaders(response) {
  const frontGateResponse = withFrontGateHeaders(response);
  frontGateResponse.headers.set("x-mmd-origin-pass-through", "webflow-origin");
  return frontGateResponse;
}

function withRouteOwnerHeaders(response, { owner, page, origin }) {
  const frontGateResponse = withFrontGateHeaders(response);
  frontGateResponse.headers.set("x-mmd-route-owner", owner);
  frontGateResponse.headers.set("x-mmd-page", page);
  frontGateResponse.headers.set("x-mmd-origin", origin);
  return frontGateResponse;
}

function appendQuery(base, query, extra = {}) {
  const params = new URLSearchParams(query || "");
  Object.entries(extra).forEach(([k, v]) => { if (v != null && String(v).trim()) params.set(k, String(v)); });
  const rendered = params.toString();
  return rendered ? `${base}?${rendered}` : base;
}

async function fetchPassThrough(request) {
  return withFrontGateHeaders(await fetch(new Request(request, { redirect: "follow" })));
}

async function fetchWebflowOriginPage(request, env = {}, url = new URL(request.url)) {
  const host = String(env?.WEBFLOW_ORIGIN_HOST || DEFAULT_WEBFLOW_ORIGIN_HOST).trim() || DEFAULT_WEBFLOW_ORIGIN_HOST;
  const target = new URL(request.url);
  target.protocol = "https:";
  target.hostname = host;
  target.pathname = url.pathname;
  target.search = url.search;
  return withWebflowOriginHeaders(await fetch(new Request(target.toString(), request)));
}

function isLineWebhookPath(url) { return LINE_WEBHOOK_PATHS.has(url.pathname.toLowerCase()); }
function isBlackcardPublicPath(url) { return PUBLIC_BLACKCARD_PATHS.has(url.pathname.toLowerCase()); }
function isWebflowMemberPagePath(url) { return WEBFLOW_MEMBER_PAGE_PATHS.has(url.pathname.toLowerCase()); }
function isWebflowPayMembershipPath(url) { return WEBFLOW_PAY_MEMBERSHIP_PATHS.has(url.pathname.toLowerCase()); }
function isSigilApplyPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/apply" || p === "/sigil/apply/"; }
function isSigilPrivateModelApplyApiPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/api/private-model/apply" || p === "/sigil/api/private-model/apply/"; }
function isSigilMembershipPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/membership" || p === "/sigil/membership/"; }
function isMemberDashboardPath(url) { const p = url.pathname.toLowerCase(); return p === "/member/dashboard" || p === "/member/dashboard/"; }
function isMemberPagePath(url) { return MEMBER_PAGE_PATHS.has(url.pathname.toLowerCase()); }
function isMemberApiPath(url) { return MEMBER_API_PATHS.has(url.pathname.toLowerCase()); }
function isLiffApiPath(url) { const p = url.pathname.toLowerCase(); return p === "/member/api/liff" || p.startsWith("/member/api/liff/"); }
function isMemberPaymentsPath(url) { const p = url.pathname.toLowerCase(); return p === "/member/payments" || p === "/member/payments/"; }
function isHallPath(url) { const p = url.pathname.toLowerCase(); return p === "/hall" || p === "/hall/"; }
function isModelConsolePath(url) { const p = url.pathname.toLowerCase(); return p === "/model/console" || p === "/model/console/"; }
function isKenjiKnowledgeAdminPath(url) { return KENJI_KNOWLEDGE_ADMIN_PATHS.has(url.pathname.toLowerCase()); }
function isMemberPath(url) { const p = url.pathname.toLowerCase(); return p === "/member" || p === "/member/" || p.startsWith("/member/"); }
function isKnownLegacyMemberRedirect(url) { return Boolean(EXACT_PATH_REDIRECTS[normalizePath(url.pathname).toLowerCase()]); }

async function fetchLineWebhook(request, env = {}, url) {
  const upstream = String(env?.LINE_WEBHOOK_UPSTREAM_URL || "").trim();
  if (!upstream) return fetchPassThrough(request);
  const target = new URL(upstream);
  target.search = url.search;
  return withFrontGateHeaders(await fetch(new Request(target.toString(), request)));
}

async function fetchMemberFrontend(request, env, url) {
  if (env?.IMMIGRATE_WORKER?.fetch) return withFrontGateHeaders(await env.IMMIGRATE_WORKER.fetch(request));
  const target = new URL(MEMBER_DASHBOARD_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withFrontGateHeaders(await fetch(new Request(target.toString(), request)));
}

async function fetchMemberPage(request, env, url) {
  if (env?.MEMBER_PAGES_WORKER?.fetch) return withFrontGateHeaders(await env.MEMBER_PAGES_WORKER.fetch(request));
  const target = new URL(MEMBER_PAGES_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withFrontGateHeaders(await fetch(new Request(target.toString(), request)));
}

async function fetchAdminMemberPage(request, env, url) {
  if (env?.ADMIN_WORKER?.fetch) return withFrontGateHeaders(await env.ADMIN_WORKER.fetch(request));
  const target = new URL(ADMIN_WORKER_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withFrontGateHeaders(await fetch(new Request(target.toString(), request)));
}

async function fetchSigilWorkerRoute(request, env, url, page) {
  if (env?.SIGIL_WORKER?.fetch) return withRouteOwnerHeaders(await env.SIGIL_WORKER.fetch(request), { owner: SIGIL_APPLY_ROUTE_OWNER, page, origin: "service-binding:sigil-worker" });
  const target = new URL(SIGIL_WORKER_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withRouteOwnerHeaders(await fetch(new Request(target.toString(), request)), { owner: SIGIL_APPLY_ROUTE_OWNER, page, origin: SIGIL_WORKER_UPSTREAM });
}

async function fetchStudioWebflowRoute(request, url, route) {
  const target = new URL(url.toString());
  target.protocol = CANONICAL_PROTOCOL;
  target.hostname = CANONICAL_HOST;
  target.pathname = route.path;
  const response = await fetch(new Request(target.toString(), request));
  return withRouteOwnerHeaders(response, { owner: FRONT_GATE, page: route.page, origin: `webflow-rewrite:${route.path}` });
}

function htmlResponse(request, html, page, extraHeaders = {}) {
  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-mmd-worker": FRONT_GATE,
      "x-mmd-front-gate": FRONT_GATE,
      "x-mmd-front-version": FRONT_VERSION,
      "x-mmd-page": page,
      ...extraHeaders,
    },
  });
}

function renderRouteRecoveryShell(request, page, title, heading, copy, links = []) {
  const query = new URL(request.url).search || "";
  const renderedLinks = links.map((link, i) => `<a${i === 0 ? " class=\"primary\"" : ""} href="${link.href}${query}">${link.label}</a>`).join("");
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:22px;background:radial-gradient(circle at top left,#241907 0,#090705 36%,#050403 100%);color:#fff7e8;font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}main{width:min(780px,100%);margin:0 auto;padding:28px 0 40px}.brand{margin:0 0 14px;color:#ffd784;font-size:13px;font-weight:900;text-transform:uppercase}h1{margin:0 0 16px;font-size:clamp(38px,12vw,76px);line-height:1}p{margin:0 0 16px;color:#fff1d5;font-size:17px;line-height:1.65}a{min-height:46px;display:inline-flex;align-items:center;justify-content:center;margin:8px 8px 0 0;padding:0 16px;border:1px solid #d8ad5a;border-radius:999px;color:#fff7e8;background:#17110a;text-decoration:none;font-weight:850}a.primary{color:#130d05;background:#ffd784;border-color:#ffd784}</style></head><body><main data-mmd-page-shell="${page}"><p class="brand">MMD Privé</p><h1>${heading}</h1><p>${copy}</p><p>${renderedLinks}</p></main></body></html>`;
  return htmlResponse(request, html, page, { "x-mmd-temporary-route": "true" });
}

function renderPublicBlackcardPage(request) {
  const query = new URL(request.url).search || "";
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>MMD Privé | Black Card</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#050404;color:#fff6df;font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}.hero{min-height:100vh;display:grid;place-items:end start;padding:28px;background:linear-gradient(90deg,rgba(5,4,4,.86),rgba(5,4,4,.24)),url(https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a2e89da3f9feeabc206fa8c_SIGIL_Wall.webp) center/cover}.panel{width:min(760px,100%);padding:clamp(24px,5vw,54px);border:1px solid rgba(216,177,95,.25);border-radius:32px;background:rgba(8,7,6,.72);backdrop-filter:blur(18px);box-shadow:0 28px 90px rgba(0,0,0,.36)}.mark{width:54px;height:54px;object-fit:contain;margin-bottom:28px;filter:drop-shadow(0 10px 24px rgba(216,177,95,.22))}.kicker{color:#f4dd95;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}h1{margin:10px 0 16px;font-size:clamp(46px,11vw,92px);line-height:.94;letter-spacing:-.05em}p{margin:0 0 14px;color:rgba(255,246,223,.78);font-size:17px;line-height:1.75}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}a{min-height:48px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;border-radius:999px;text-decoration:none;font-weight:850}.primary{color:#150f07;background:linear-gradient(135deg,#f7e6a8,#bd8730)}.ghost{color:#fff6df;border:1px solid rgba(216,177,95,.28);background:rgba(255,255,255,.06)}</style></head><body><main class="hero"><section class="panel"><img class="mark" src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a3f71e229504b27874227cd_MMD%20Logo%20Only.webp" alt="MMD"><p class="kicker">BLACK CARD PRIVILEGES</p><h1>สิทธิ์ที่ดีที่สุด<br>ของสมาชิก MMD</h1><p>Black Card คือระดับการดูแลที่เปิดให้สมาชิกเข้าถึงตัวเลือกมากกว่า เร็วกว่า และละเอียดกว่าการเป็นสมาชิกปกติ</p><p>สถานะจริงยังอ้างอิงจาก owner review, ledger และ official verification เท่านั้น หน้านี้ไม่มีการเปิดสิทธิ์อัตโนมัติ</p><div class="actions"><a class="primary" href="${CANONICAL_MEMBERSHIP_PATH}${query}">ดูแพ็กเกจสมาชิก</a><a class="ghost" href="/member/dashboard${query}">Member Dashboard</a></div></section></main></body></html>`;
  return htmlResponse(request, html, PUBLIC_BLACKCARD_PAGE, { "x-mmd-route-owner": FRONT_GATE, "x-mmd-origin": "front-gate:public-blackcard-safe" });
}

function renderHallRecovery(request) { return renderRouteRecoveryShell(request, "hall", "MMD Privé | Hall", "MMD Hall", "พื้นที่กลางสำหรับเข้าสู่ระบบสมาชิก ตรวจสถานะ และไปต่อยังเส้นทางที่เกี่ยวข้องของ MMD Privé", [{ label: "Enter Member Area", href: "/member/dashboard" }, { label: "Member Payments", href: "/member/payments" }]); }
function renderModelConsoleRecovery(request) { return renderRouteRecoveryShell(request, "model-console", "MMD Privé | Model Console", "Model Console", "พื้นที่สำหรับผู้ให้บริการตรวจสถานะงานและไปต่อยังขั้นตอนที่เกี่ยวข้องของ MMD Privé", [{ label: "Continue", href: "/v1/model/session/dashboard" }, { label: "Member Area", href: "/member/dashboard" }]); }
function renderMemberStaticRecovery(request) { return renderRouteRecoveryShell(request, "member-static", "MMD Privé | Member", "Member Page", "หน้านี้อยู่ในพื้นที่สมาชิกของ MMD Privé และพร้อมเชื่อมต่อกับเนื้อหาหลักในขั้นต่อไป", [{ label: "Enter Member Area", href: "/member/dashboard" }, { label: "Membership", href: CANONICAL_MEMBERSHIP_PATH }]); }
function renderKenjiKnowledgeAdminShell(request) {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Kenji Knowledge Admin</title><link rel="stylesheet" href="https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-board-bridge.css"></head><body><div id="mmdKenjiKnowledgeV9"></div><script defer src="https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-1-webflow-loader.js"></script></body></html>`;
  return htmlResponse(request, html, "kenji-knowledge-admin", { "x-mmd-route-owner": FRONT_GATE, "x-mmd-origin": "front-gate:kenji-knowledge-r2-loader-shell" });
}

function liffRouteNotFound() {
  return withFrontGateHeaders(new Response(JSON.stringify({
    ok: false,
    error: { code: "LIFF_ROUTE_NOT_FOUND", message: "Unknown LIFF identity route." },
  }), {
    status: 404,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-content-type-options": "nosniff",
    },
  }));
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (isLineWebhookPath(url)) return fetchLineWebhook(request, env, url);
    if (isSigilPrivateModelApplyApiPath(url)) return fetchSigilWorkerRoute(request, env, url, "sigil-private-model-apply-api");
    if (isLiffApiPath(url)) return isMemberApiPath(url)
      ? fetchMemberPage(request, env, url)
      : liffRouteNotFound();
    if (!isSafePageRequest(request)) return withFrontGateHeaders(await fetch(request));
    const studioRoute = findStudioWebflowRoute(url.pathname);
    if (studioRoute) return fetchStudioWebflowRoute(request, url, studioRoute);
    if (isBlackcardPublicPath(url)) return renderPublicBlackcardPage(request);
    if (isSigilApplyPath(url)) return fetchSigilWorkerRoute(request, env, url, "sigil-private-model-setup");
    if (isSigilMembershipPath(url)) return fetchMemberPage(request, env, url);
    if (isMemberDashboardPath(url)) return fetchMemberFrontend(request, env, url);
    if (isWebflowMemberPagePath(url)) return fetchPassThrough(request);
    if (isWebflowPayMembershipPath(url)) return fetchWebflowOriginPage(request, env, url);
    if (isMemberPagePath(url)) return fetchMemberPage(request, env, url);
    if (isMemberPaymentsPath(url)) return fetchAdminMemberPage(request, env, url);
    if (isKenjiKnowledgeAdminPath(url)) return renderKenjiKnowledgeAdminShell(request);
    if (isHallPath(url)) return renderHallRecovery(request);
    if (isModelConsolePath(url)) return renderModelConsoleRecovery(request);
    if (isMemberPath(url) && !isKnownLegacyMemberRedirect(url)) return renderMemberStaticRecovery(request);
    if (shouldNeverTouch(url)) return fetchPassThrough(request);
    if (!REDIRECT_HOSTS.has(url.hostname)) return fetchPassThrough(request);

    const mappedPath = findMappedPath(url.pathname);
    const target = new URL(url.toString());
    target.protocol = CANONICAL_PROTOCOL;
    target.hostname = CANONICAL_HOST;
    target.pathname = mappedPath;
    const needsRedirect = url.protocol !== CANONICAL_PROTOCOL || url.hostname !== CANONICAL_HOST || url.pathname !== mappedPath;
    if (!needsRedirect || target.toString() === url.toString()) return fetchPassThrough(request);
    return withFrontGateHeaders(Response.redirect(target.toString(), 301));
  },
};
