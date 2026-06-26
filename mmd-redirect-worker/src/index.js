/**
 * MMD Permanent Redirect Guard
 * Purpose:
 * - Canonicalize host/protocol
 * - Preserve every path and query string, including ?t=
 * - Redirect legacy paths permanently
 * - Avoid redirect loops
 * - Do NOT touch API/webhook/admin endpoints
 */

export const CANONICAL_HOST = "mmdbkk.com";
export const CANONICAL_PROTOCOL = "https:";
export const CONFIRM_PAYMENT_PATH = "/confirm/payment-confirmation";
export const MEMBER_DASHBOARD_UPSTREAM = "https://immigrate-worker.malemodel-bkk.workers.dev";
export const MEMBER_PAGES_UPSTREAM = "https://member-pages-worker.malemodel-bkk.workers.dev";
export const ADMIN_WORKER_UPSTREAM = "https://admin-worker.malemodel-bkk.workers.dev";
export const SIGIL_WORKER_UPSTREAM = "https://sigil.mmdbkk.com";
export const FRONT_GATE = "mmd-redirect-worker";
export const FRONT_VERSION = "20260622T071500Z";
export const SIGIL_APPLY_PAGE = "sigil-private-model-setup";
export const SIGIL_PRIVATE_MODEL_APPLY_API_PAGE = "sigil-private-model-apply-api";
export const SIGIL_APPLY_ROUTE_OWNER = "sigil-worker";
export const PUBLIC_BLACKCARD_PAGE = "public-blackcard";

export const REDIRECT_HOSTS = new Set(["www.mmdbkk.com", "mmdbkk.com", "mmdprive.com", "www.mmdprive.com", "malemodel-bkk.workers.dev"]);
export const NEVER_TOUCH_HOSTS = new Set(["sigil.mmdbkk.com"]);
export const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);
export const PUBLIC_BLACKCARD_PATHS = new Set(["/blackcard", "/blackcard/", "/blackcard/black-card", "/blackcard/black-card/"]);
export const MEMBER_PAGE_PATHS = new Set(["/member/membership", "/member/membership/", "/member/profile", "/member/profile/", "/pay/membership", "/pay/membership/", "/pay/pending-verification", "/pay/pending-verification/"]);

export const NEVER_TOUCH_PREFIXES = ["/api/", "/webhook/", "/webhooks/", "/pay/", "/payments/", "/payment/", "/payment-webhook/", "/admin/", "/sigil/", "/cdn-cgi/", "/assets/", "/static/", "/uploads/"];
export const NEVER_REDIRECT_EXACT_PATHS = new Set(["/member/dashboard", "/member/dashboard/", "/member/membership", "/member/membership/", "/member/profile", "/member/profile/", "/member/payments", "/member/payments/", "/pay/membership", "/pay/membership/", "/pay/pending-verification", "/pay/pending-verification/", "/hall", "/hall/", "/model/console", "/model/console/", "/blackcard", "/blackcard/", "/blackcard/black-card", "/blackcard/black-card/"]);
export const EXACT_PATH_REDIRECTS = { "/trust/inme": "/sigil/start", "/inme": "/sigil/start", "/login": "/sigil/start", "/member": "/member/dashboard", "/member/membership/benefits": "/member/membership", "/members": "/sigil/start", "/membership": "/member/membership", "/membership/benefits": "/member/membership", "/renew": "/sigil/membership", "/renewal": "/sigil/membership", "/trust": "/sigil/start" };
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

export function buildTargetUrl(originalUrl, nextPathname) {
  const target = new URL(originalUrl.toString());
  target.protocol = CANONICAL_PROTOCOL;
  target.hostname = CANONICAL_HOST;
  target.pathname = nextPathname;
  return target;
}

function withFrontGateHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("x-mmd-front-gate", FRONT_GATE);
  headers.set("x-mmd-front-version", FRONT_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withRouteOwnerHeaders(response, { owner, page, origin }) {
  const frontGateResponse = withFrontGateHeaders(response);
  frontGateResponse.headers.set("x-mmd-route-owner", owner);
  frontGateResponse.headers.set("x-mmd-page", page);
  frontGateResponse.headers.set("x-mmd-origin", origin);
  return frontGateResponse;
}

function isConfirmPaymentPage(url) {
  return url.pathname === CONFIRM_PAYMENT_PATH || url.pathname === `${CONFIRM_PAYMENT_PATH}/`;
}

function confirmPaymentDashboardBridgeScript() {
  return `<script id="mmd-confirm-dashboard-bridge">(function(){if(window.__MMD_CONFIRM_DASHBOARD_BRIDGE__)return;window.__MMD_CONFIRM_DASHBOARD_BRIDGE__=true;var originalFetch=window.fetch;if(typeof originalFetch!=="function")return;function getDashboardUrl(payload){var fromPayload=payload&&(payload.dashboard_url||payload.dashboard_access&&payload.dashboard_access.dashboard_url)||"";if(fromPayload)return fromPayload;var params=new URLSearchParams(window.location.search||"");var token=params.get("t")||"";if(token)return "/member/dashboard?t="+encodeURIComponent(token);var root=document.getElementById("mmd-payment-confirmation");return root&&root.getAttribute("data-dashboard-url")||"/member/dashboard"}window.fetch=function(input,init){var requestUrl="";try{requestUrl=typeof input==="string"?input:input&&input.url||""}catch(_){}var result=originalFetch.apply(this,arguments);if(!/(\/v1\/payments\/notify(?:\?|$)|\/sigil\/api\/payments\/manual-intake(?:\?|$))/.test(requestUrl))return result;return result.then(function(response){try{response.clone().json().then(function(payload){var dashboardUrl=getDashboardUrl(payload);if(!dashboardUrl)return;try{sessionStorage.setItem("mmd_pay_membership_confirm_state_v2026_04",JSON.stringify({status:payload&&payload.status||"pending_verification",dashboard_url:dashboardUrl,updated_at:new Date().toISOString()}))}catch(_){}var link=document.getElementById("mmdrenew-dashboard-link");if(link)link.href=dashboardUrl;if(payload&&payload.status==="pending_verification")return;window.setTimeout(function(){window.location.href=dashboardUrl},900)}).catch(function(){})}catch(_){}return response})}})();</script>`;
}

async function maybeInjectConfirmPaymentBridge(request, response, url) {
  if (request.method.toUpperCase() === "HEAD") return response;
  if (!isConfirmPaymentPage(url)) return response;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return response;
  const html = await response.text();
  if (html.includes("mmd-confirm-dashboard-bridge")) return new Response(html, response);
  const rewritten = html.includes("</body>") ? html.replace("</body>", `${confirmPaymentDashboardBridgeScript()}</body>`) : `${html}${confirmPaymentDashboardBridgeScript()}`;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(rewritten, { status: response.status, statusText: response.statusText, headers });
}

async function fetchPassThrough(request) {
  const url = new URL(request.url);
  const response = await fetch(new Request(request, { redirect: "follow" }));
  return withFrontGateHeaders(await maybeInjectConfirmPaymentBridge(request, response, url));
}

function isLineWebhookPath(url) { return LINE_WEBHOOK_PATHS.has(url.pathname.toLowerCase()); }
function isBlackcardPublicPath(url) { return PUBLIC_BLACKCARD_PATHS.has(url.pathname.toLowerCase()); }
function isSigilApplyPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/apply" || p === "/sigil/apply/"; }
function isSigilMembershipPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/membership" || p === "/sigil/membership/"; }
function isSigilPrivateModelApplyApiPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/api/private-model/apply" || p === "/sigil/api/private-model/apply/"; }
function isMemberDashboardPath(url) { const p = url.pathname.toLowerCase(); return p === "/member/dashboard" || p === "/member/dashboard/"; }
function isMemberPagePath(url) { return MEMBER_PAGE_PATHS.has(url.pathname.toLowerCase()); }
function isMemberPaymentsPath(url) { const p = url.pathname.toLowerCase(); return p === "/member/payments" || p === "/member/payments/"; }
function isHallPath(url) { const p = url.pathname.toLowerCase(); return p === "/hall" || p === "/hall/"; }
function isModelConsolePath(url) { const p = url.pathname.toLowerCase(); return p === "/model/console" || p === "/model/console/"; }
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

async function fetchSigilApplyPage(request, env, url) {
  return fetchSigilWorkerRoute(request, env, url, SIGIL_APPLY_PAGE);
}

async function fetchSigilPrivateModelApplyApi(request, env, url) {
  return fetchSigilWorkerRoute(request, env, url, SIGIL_PRIVATE_MODEL_APPLY_API_PAGE);
}

async function fetchSigilWorkerRoute(request, env, url, page) {
  if (env?.SIGIL_WORKER?.fetch) {
    return withRouteOwnerHeaders(await env.SIGIL_WORKER.fetch(request), {
      owner: SIGIL_APPLY_ROUTE_OWNER,
      page,
      origin: "service-binding:sigil-worker",
    });
  }

  const target = new URL(SIGIL_WORKER_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withRouteOwnerHeaders(await fetch(new Request(target.toString(), request)), {
    owner: SIGIL_APPLY_ROUTE_OWNER,
    page,
    origin: SIGIL_WORKER_UPSTREAM,
  });
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

function renderRouteRecoveryShell(request, page, title, heading, copy, links = []) {
  const query = new URL(request.url).search || "";
  const renderedLinks = links.map((link, i) => `<a${i === 0 ? " class=\"primary\"" : ""} href="${link.href}${query}">${link.label}</a>`).join("");
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:22px;background:radial-gradient(circle at top left,#241907 0,#090705 36%,#050403 100%);color:#fff7e8;font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}main{width:min(780px,100%);margin:0 auto;padding:28px 0 40px}.brand{margin:0 0 14px;color:#ffd784;font-size:13px;font-weight:900;text-transform:uppercase}h1{margin:0 0 16px;font-size:clamp(38px,12vw,76px);line-height:1}p{margin:0 0 16px;color:#fff1d5;font-size:17px;line-height:1.65}a{min-height:46px;display:inline-flex;align-items:center;justify-content:center;margin:8px 8px 0 0;padding:0 16px;border:1px solid #d8ad5a;border-radius:999px;color:#fff7e8;background:#17110a;text-decoration:none;font-weight:850}a.primary{color:#130d05;background:#ffd784;border-color:#ffd784}</style></head><body><main data-mmd-page-shell="${page}"><p class="brand">MMD Privé</p><h1>${heading}</h1><p>${copy}</p><p>${renderedLinks}</p></main></body></html>`;
  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate, max-age=0", "x-mmd-worker": "mmd-redirect-worker", "x-mmd-front-gate": FRONT_GATE, "x-mmd-front-version": FRONT_VERSION, "x-mmd-page": page, "x-mmd-temporary-route": "true" } });
}

function renderPublicBlackcardPage(request) {
  const url = new URL(request.url);
  const query = url.search || "";
  const requestHref = `/member/membership${query}`;
  const paymentHref = `/pay/membership${query ? `${query}&` : "?"}plan=blackcard_review`;
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD Privé | Black Card</title><style>${blackcardStyles()}</style></head><body><main data-mmd-page="${PUBLIC_BLACKCARD_PAGE}"><nav><a class="brand" href="/blackcard${query}">MMD Privé <span>Black Card</span></a><span><a href="/member/membership${query}">Membership</a><a href="/member/dashboard${query}">Dashboard</a></span></nav><section class="hero"><div class="panel intro"><p class="eyebrow">PUBLIC BLACK CARD READING PAGE</p><h1>Black Card</h1><p class="lead">Black Card คือ private review status สำหรับลูกค้าที่ต้องการ access ที่ลึกขึ้น เป็นส่วนตัวขึ้น และต้องผ่าน founder-level verification ก่อนเปิดสิทธิ์</p><p>หน้านี้เปิดให้อ่านแบบ public ไม่ต้องเป็นสมาชิกและไม่อยู่ใต้ /sigil เพื่อให้คนใหม่เข้าใจเงื่อนไขก่อนเข้าสู่พื้นที่ private layer</p><p class="actions"><a class="btn" href="${requestHref}">Request Black Card Review</a><a class="btn ghost" href="${paymentHref}">Continue via verified path</a></p></div><aside class="card" aria-label="Black Card visual"><div class="chip"></div><p>MMD PRIVÉ</p><strong>BLACK CARD</strong><small>Private review only</small></aside></section><section class="grid"><article class="panel"><p class="eyebrow">Not instant purchase</p><h2>จ่ายเงินไม่ได้แปลว่าเปิดสิทธิ์ทันที</h2><p>การชำระเงินหรือส่งสลิปเป็นเพียง evidence สำหรับตรวจสอบ สถานะ Black Card จะเกิดขึ้นหลังข้อมูล ยอดชำระ และความเหมาะสมผ่าน official verification แล้วเท่านั้น</p></article><article class="panel"><p class="eyebrow">Public first</p><h2>/blackcard คือประตูอ่าน</h2><p>เส้นทางนี้ต้องไม่ redirect ไป /sigil/member/membership และต้องไม่ fall back ไป Webflow/origin เพราะเป็นหน้าอธิบายสำหรับคนที่ยังไม่ได้เป็นสมาชิก</p></article><article class="panel"><p class="eyebrow">Private later</p><h2>/sigil/blackcard คือประตูเข้า</h2><p>หลังผ่านการพิจารณาแล้ว จึงค่อยเข้าสู่ private holder layer หรือ Secret Room ตามสถานะจริงของระบบ</p></article></section><section class="panel rule"><p class="eyebrow">Access condition</p><h2>Founder review, verified funds, system recognition.</h2><p>Black Card ไม่ใช่ package selection ปกติและไม่ใช่ automatic approval. ระบบต้องรักษา query เช่น t, code, promo, payment_ref และ session_id โดยไม่เปลี่ยนชื่อ parameter.</p></section></main></body></html>`;
  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate, max-age=0", "x-mmd-worker": "mmd-redirect-worker", "x-mmd-front-gate": FRONT_GATE, "x-mmd-front-version": FRONT_VERSION, "x-mmd-page": PUBLIC_BLACKCARD_PAGE, "x-mmd-route-owner": "mmd-redirect-worker", "x-mmd-origin": "front-gate:public-blackcard" } });
}

function blackcardStyles() {
  return `:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 18% 0%,rgba(255,215,132,.19),transparent 32%),radial-gradient(circle at 86% 12%,rgba(88,67,35,.38),transparent 36%),linear-gradient(145deg,#030303,#100c08 48%,#020202);color:#fff7e8;font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}main{width:min(1160px,calc(100% - 32px));margin:auto;padding:28px 0 46px}nav{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:32px}.brand,nav a{color:#ffd98d;text-decoration:none;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.brand span{color:#fff}nav span{display:flex;gap:12px;flex-wrap:wrap}.hero{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(280px,.92fr);gap:22px;align-items:stretch}.panel{border:1px solid rgba(255,216,151,.2);border-radius:30px;background:rgba(8,7,6,.78);box-shadow:0 30px 90px rgba(0,0,0,.36);padding:clamp(24px,4vw,50px);backdrop-filter:blur(18px)}.intro{background:linear-gradient(145deg,rgba(20,16,11,.92),rgba(7,6,5,.84))}.eyebrow{margin:0 0 12px;color:#ffd98d;font-size:12px;font-weight:950;letter-spacing:.19em;text-transform:uppercase}h1{margin:0 0 16px;font-size:clamp(58px,10vw,124px);line-height:.88;letter-spacing:-.075em}h2{margin:0 0 12px;font-size:clamp(26px,4vw,42px);line-height:1.04}p{color:#ffe9bc;line-height:1.72}.lead{max-width:760px;color:#fff5dc;font-size:clamp(18px,2vw,24px)}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;border-radius:999px;padding:0 18px;background:#ffd98d;color:#130d05;text-decoration:none;font-weight:950}.ghost{background:rgba(255,255,255,.065);color:#fff3d8;border:1px solid rgba(255,216,151,.25)}.card{min-height:420px;border:1px solid rgba(255,216,151,.26);border-radius:34px;padding:32px;background:linear-gradient(135deg,#090909,#1c1710 54%,#050505);box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 40px 100px rgba(0,0,0,.48);display:flex;flex-direction:column;justify-content:space-between}.chip{width:58px;height:42px;border-radius:10px;background:linear-gradient(135deg,#e3c26f,#755117);box-shadow:0 0 32px rgba(255,217,141,.22)}.card p{margin:0;color:#ffe0a3;font-weight:950;letter-spacing:.18em}.card strong{font-size:clamp(38px,6vw,70px);line-height:.9;letter-spacing:-.05em}.card small{color:#dac291;font-weight:900;text-transform:uppercase;letter-spacing:.16em}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:16px}.rule{margin-top:16px}@media(max-width:860px){nav,.hero{display:block}.hero{display:grid;grid-template-columns:1fr}.grid{grid-template-columns:1fr}.btn{width:100%}nav span{margin-top:12px}.card{min-height:300px}}`;
}

function formatMemberPageHeading(pathname) {
  const slug = normalizePath(pathname).split("/").filter(Boolean).at(-1) || "";
  const words = slug.replace(/[^a-z0-9-]+/gi, "-").split("-").filter(Boolean).slice(0, 6);
  return words.length ? words.map((word) => /^\d+$/.test(word) || word.length <= 2 ? word.toUpperCase() : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`).join(" ") : "Member Page";
}

function renderMemberStaticRecovery(request) { return renderRouteRecoveryShell(request, "member-static", "MMD Privé | Member", formatMemberPageHeading(new URL(request.url).pathname), "หน้านี้อยู่ในพื้นที่สมาชิกของ MMD Privé และพร้อมเชื่อมต่อกับเนื้อหาหลักในขั้นต่อไป", [{ label: "Enter Member Area", href: "/member/dashboard" }, { label: "Membership", href: "/member/membership" }]); }
function renderHallRecovery(request) { return renderRouteRecoveryShell(request, "hall", "MMD Privé | Hall", "MMD Hall", "พื้นที่กลางสำหรับเข้าสู่ระบบสมาชิก ตรวจสถานะ และไปต่อยังเส้นทางที่เกี่ยวข้องของ MMD Privé", [{ label: "Enter Member Area", href: "/member/dashboard" }, { label: "Member Payments", href: "/member/payments" }]); }
function renderModelConsoleRecovery(request) { return renderRouteRecoveryShell(request, "model-console", "MMD Privé | Model Console", "Model Console", "พื้นที่สำหรับผู้ให้บริการตรวจสถานะงานและไปต่อยังขั้นตอนที่เกี่ยวข้องของ MMD Privé", [{ label: "Continue", href: "/v1/model/session/dashboard" }, { label: "Member Area", href: "/member/dashboard" }]); }

export function findMappedPath(pathname) {
  const normalized = normalizePath(pathname);
  const key = normalized.toLowerCase();
  if (EXACT_PATH_REDIRECTS[key]) return EXACT_PATH_REDIRECTS[key];
  for (const rule of FOLDER_REDIRECTS) {
    if (key.startsWith(rule.from.toLowerCase())) return `${rule.to}${normalized.slice(rule.from.length)}`.replace(/\/{2,}/g, "/");
  }
  return normalized;
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (isLineWebhookPath(url)) return fetchLineWebhook(request, env, url);
    if (isSigilPrivateModelApplyApiPath(url)) return fetchSigilPrivateModelApplyApi(request, env, url);
    if (!isSafePageRequest(request)) return withFrontGateHeaders(await fetch(request));
    if (isBlackcardPublicPath(url)) return renderPublicBlackcardPage(request);
    if (isSigilApplyPath(url)) return fetchSigilApplyPage(request, env, url);
    if (isSigilMembershipPath(url)) return fetchMemberPage(request, env, url);
    if (isMemberDashboardPath(url)) return fetchMemberFrontend(request, env, url);
    if (isMemberPagePath(url)) return fetchMemberPage(request, env, url);
    if (isMemberPaymentsPath(url)) return fetchAdminMemberPage(request, env, url);
    if (isHallPath(url)) return renderHallRecovery(request);
    if (isModelConsolePath(url)) return renderModelConsoleRecovery(request);
    if (isMemberPath(url) && !isKnownLegacyMemberRedirect(url)) return renderMemberStaticRecovery(request);
    if (shouldNeverTouch(url)) return fetchPassThrough(request);
    if (!REDIRECT_HOSTS.has(url.hostname)) return fetchPassThrough(request);
    const mappedPath = findMappedPath(url.pathname);
    const target = buildTargetUrl(url, mappedPath);
    const needsRedirect = url.protocol !== CANONICAL_PROTOCOL || url.hostname !== CANONICAL_HOST || url.pathname !== mappedPath;
    if (!needsRedirect || target.toString() === url.toString()) return fetchPassThrough(request);
    return withFrontGateHeaders(Response.redirect(target.toString(), 301));
  },
};