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
export const FRONT_GATE = "mmd-redirect-worker";
export const FRONT_VERSION = "20260626-blackcard-review-safe";
export const PUBLIC_BLACKCARD_PAGE = "public-blackcard";
export const SIGIL_APPLY_ROUTE_OWNER = "sigil-worker";

export const REDIRECT_HOSTS = new Set(["www.mmdbkk.com", "mmdbkk.com", "mmdprive.com", "www.mmdprive.com", "malemodel-bkk.workers.dev"]);
export const NEVER_TOUCH_HOSTS = new Set(["sigil.mmdbkk.com"]);
export const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);
export const PUBLIC_BLACKCARD_PATHS = new Set(["/blackcard", "/blackcard/", "/blackcard/black-card", "/blackcard/black-card/"]);
export const MEMBER_PAGE_PATHS = new Set(["/member/membership", "/member/membership/", "/member/profile", "/member/profile/", "/pay/membership", "/pay/membership/", "/pay/pending-verification", "/pay/pending-verification/"]);
export const NEVER_TOUCH_PREFIXES = ["/api/", "/webhook/", "/webhooks/", "/payments/", "/payment/", "/payment-webhook/", "/admin/", "/sigil/", "/cdn-cgi/", "/assets/", "/static/", "/uploads/"];
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

export function findMappedPath(pathname) {
  const normalized = normalizePath(pathname);
  const key = normalized.toLowerCase();
  if (EXACT_PATH_REDIRECTS[key]) return EXACT_PATH_REDIRECTS[key];
  for (const rule of FOLDER_REDIRECTS) {
    if (key.startsWith(rule.from.toLowerCase())) return `${rule.to}${normalized.slice(rule.from.length)}`.replace(/\/{2,}/g, "/");
  }
  return normalized;
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

function appendQuery(base, query, extra = {}) {
  const params = new URLSearchParams(query || "");
  Object.entries(extra).forEach(([k, v]) => { if (v != null && String(v).trim()) params.set(k, String(v)); });
  const rendered = params.toString();
  return rendered ? `${base}?${rendered}` : base;
}

async function fetchPassThrough(request) {
  return withFrontGateHeaders(await fetch(new Request(request, { redirect: "follow" })));
}

function isLineWebhookPath(url) { return LINE_WEBHOOK_PATHS.has(url.pathname.toLowerCase()); }
function isBlackcardPublicPath(url) { return PUBLIC_BLACKCARD_PATHS.has(url.pathname.toLowerCase()); }
function isSigilApplyPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/apply" || p === "/sigil/apply/"; }
function isSigilPrivateModelApplyApiPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/api/private-model/apply" || p === "/sigil/api/private-model/apply/"; }
function isSigilMembershipPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/membership" || p === "/sigil/membership/"; }
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
  if (env?.SIGIL_WORKER?.fetch) {
    return withRouteOwnerHeaders(await env.SIGIL_WORKER.fetch(request), { owner: SIGIL_APPLY_ROUTE_OWNER, page, origin: "service-binding:sigil-worker" });
  }
  const target = new URL(SIGIL_WORKER_UPSTREAM);
  target.pathname = url.pathname;
  target.search = url.search;
  return withRouteOwnerHeaders(await fetch(new Request(target.toString(), request)), { owner: SIGIL_APPLY_ROUTE_OWNER, page, origin: SIGIL_WORKER_UPSTREAM });
}

function renderRouteRecoveryShell(request, page, title, heading, copy, links = []) {
  const query = new URL(request.url).search || "";
  const renderedLinks = links.map((link, i) => `<a${i === 0 ? " class=\"primary\"" : ""} href="${link.href}${query}">${link.label}</a>`).join("");
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;padding:22px;background:radial-gradient(circle at top left,#241907 0,#090705 36%,#050403 100%);color:#fff7e8;font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}main{width:min(780px,100%);margin:0 auto;padding:28px 0 40px}.brand{margin:0 0 14px;color:#ffd784;font-size:13px;font-weight:900;text-transform:uppercase}h1{margin:0 0 16px;font-size:clamp(38px,12vw,76px);line-height:1}p{margin:0 0 16px;color:#fff1d5;font-size:17px;line-height:1.65}a{min-height:46px;display:inline-flex;align-items:center;justify-content:center;margin:8px 8px 0 0;padding:0 16px;border:1px solid #d8ad5a;border-radius:999px;color:#fff7e8;background:#17110a;text-decoration:none;font-weight:850}a.primary{color:#130d05;background:#ffd784;border-color:#ffd784}</style></head><body><main data-mmd-page-shell="${page}"><p class="brand">MMD Privé</p><h1>${heading}</h1><p>${copy}</p><p>${renderedLinks}</p></main></body></html>`;
  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate, max-age=0", "x-mmd-worker": FRONT_GATE, "x-mmd-front-gate": FRONT_GATE, "x-mmd-front-version": FRONT_VERSION, "x-mmd-page": page, "x-mmd-temporary-route": "true" } });
}

function renderPublicBlackcardPage(request) {
  const url = new URL(request.url);
  const query = url.search || "";
  const reviewHref = `${appendQuery("/member/membership", query, { source: "blackcard_review" })}#blackcard-review`;
  const dashboardHref = appendQuery("/member/dashboard", query);
  const aliasHref = appendQuery("/blackcard/black-card", query);

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD Privé | Black Card</title><style>${blackcardStyles()}</style></head><body><main class="bc" data-mmd-page="${PUBLIC_BLACKCARD_PAGE}"><nav><a class="brand" href="/blackcard${query}"><b>MMD</b><span>BLACK CARD</span></a><div><a href="#privileges">Privileges</a><a href="#conditions">Conditions</a><a href="${dashboardHref}">Member Login</a></div></nav><section class="hero"><div><p class="eyebrow">Invitation Only</p><h1>Beyond<span>Limits.</span></h1><p class="lead">Black Card คือ private review status สำหรับลูกค้าที่ต้องการ access ที่ลึกขึ้น เป็นส่วนตัวขึ้น และผ่านการดูแลในระดับ founder authority.</p><p>หน้านี้คือ public reading page อ่านได้โดยไม่ต้องเข้าสู่ SIGIL layer. Black Card ไม่ใช่แพ็กเกจที่กดจ่ายแล้วเปิดสิทธิ์ทันที และไม่มี CTA ไป payment โดยตรง.</p><p class="actions"><a class="btn" href="${reviewHref}">Request Black Card Review</a><a class="btn ghost" href="#conditions">Read conditions</a></p><div class="route-note"><span>Public route</span><b>/blackcard</b><small>No redirect. No fallback. No direct payment.</small></div></div><aside class="card-stage"><div class="card"><i></i><p>PRIVATE REVIEW</p><strong>MMD<br>BLACK<br>CARD</strong><small>Founder approval only</small></div></aside></section><section id="privileges" class="section"><p class="eyebrow center">Privileges</p><h2 class="center">Designed for people who should not wait in the normal line.</h2><div class="grid"><article><b>⚡</b><h3>First Priority</h3><p>First consideration for limited access and member-only privileges.</p></article><article><b>🔔</b><h3>Insider Updates</h3><p>Important releases before public announcement.</p></article><article><b>👤</b><h3>Direct Care</h3><p>Owner-level attention. No unnecessary handoff.</p></article><article><b>🛡️</b><h3>Privacy First</h3><p>Discretion protects access, preference, and identity.</p></article><article><b>✈️</b><h3>Private Access Layer</h3><p>Approved holders can move into private channels.</p></article><article><b>🔒</b><h3>Secret Folder</h3><p>Curated private visibility after approval only.</p></article></div></section><section class="quote"><p>“Here, access is not just paid. It is recognized, verified, and quietly handled.”</p><span>— MMD Privé</span></section><section id="conditions" class="section conditions"><div class="panel"><p class="eyebrow">Conditions</p><h2>Payment does not equal activation.</h2><p>การชำระเงินหรือส่งสลิปเป็นเพียง evidence สำหรับตรวจสอบเท่านั้น Black Card จะเปิดใช้งานหลังข้อมูล ยอดชำระ ความเหมาะสม และ owner approval ครบถ้วนแล้วเท่านั้น.</p></div><div class="list"><article><span>01</span><h3>Public Reading</h3><p>/blackcard คือประตูอ่านสำหรับคนใหม่ ไม่ต้อง login และไม่อยู่ใต้ SIGIL.</p></article><article><span>02</span><h3>Private Review</h3><p>ทุกเคสเข้าสู่การพิจารณา ไม่ใช่ package ที่กดซื้อแล้วเปิดทันที.</p></article><article><span>03</span><h3>Holder Layer</h3><p>/sigil/blackcard คือชั้นหลัง approval สำหรับ holder หรือ Secret Room access เท่านั้น.</p></article></div></section><section class="final"><p class="eyebrow">MMD Privé Black Card</p><h2>Reserved. Verified. Quietly recognized.</h2><p>Black Card is not a public package. It is a private access status for selected clients who match the rhythm, trust, and discretion of MMD Privé.</p><p class="actions center"><a class="btn" href="${reviewHref}">Request Review</a><a class="btn ghost" href="${aliasHref}">Open alias</a></p></section><footer>MMD<span> BLACK CARD</span><small>© 2026 MMD Privé. Invitation Only.</small></footer></main></body></html>`;

  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate, max-age=0", "x-mmd-worker": FRONT_GATE, "x-mmd-front-gate": FRONT_GATE, "x-mmd-front-version": FRONT_VERSION, "x-mmd-page": PUBLIC_BLACKCARD_PAGE, "x-mmd-route-owner": FRONT_GATE, "x-mmd-origin": "front-gate:public-blackcard-review-safe" } });
}

function blackcardStyles() {
  return `:root{color-scheme:dark;--bg:#030303;--ink:#fff7e8;--muted:rgba(255,247,232,.64);--gold:#ffd98d;--line:rgba(255,216,151,.18);--panel:rgba(12,9,6,.76)}*{box-sizing:border-box}html{background:var(--bg);scroll-behavior:smooth}body{margin:0;min-height:100vh;background:radial-gradient(circle at 16% 0%,rgba(255,217,141,.18),transparent 34%),radial-gradient(circle at 85% 12%,rgba(111,78,31,.24),transparent 30%),linear-gradient(145deg,#020202 0%,#100c08 48%,#020202 100%);color:var(--ink);font-family:Inter,"Avenir Next","Segoe UI","Noto Sans Thai",Arial,sans-serif}.bc{width:min(1240px,calc(100% - 32px));margin:auto;padding:26px 0 46px}nav{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;gap:18px;align-items:center;min-height:68px;background:linear-gradient(to bottom,rgba(3,3,3,.92),rgba(3,3,3,.54),transparent);backdrop-filter:blur(14px)}nav a{color:rgba(255,255,255,.68);text-decoration:none;font-weight:850}nav div{display:flex;gap:18px;flex-wrap:wrap}.brand{display:flex;gap:8px;align-items:baseline;letter-spacing:-.04em}.brand b{color:#fff;font-size:26px}.brand span,footer span{color:rgba(255,255,255,.34);font-size:22px;font-weight:950}.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(320px,.95fr);gap:clamp(28px,5vw,72px);align-items:center;min-height:calc(100vh - 108px);padding:clamp(42px,7vw,86px) 0}.eyebrow{margin:0 0 16px;color:var(--gold);font-size:12px;font-weight:950;letter-spacing:.3em;text-transform:uppercase}h1{margin:0 0 24px;font-size:clamp(64px,12vw,138px);line-height:.82;letter-spacing:-.09em}h1 span{display:block;color:transparent;background:linear-gradient(90deg,#fff,rgba(255,255,255,.55),rgba(255,255,255,.02));-webkit-background-clip:text;background-clip:text}.lead{color:rgba(255,247,232,.82);font-size:clamp(19px,2.2vw,26px);line-height:1.62}p{color:var(--muted);line-height:1.82}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.btn{min-height:52px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:0 22px;color:#120d06;background:linear-gradient(135deg,#fff0c7,var(--gold) 48%,#b98632);text-decoration:none;font-weight:950}.ghost{color:#fff2d8;border:1px solid rgba(255,216,151,.24);background:rgba(255,255,255,.055)}.route-note{width:min(560px,100%);display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin-top:24px;padding:16px 18px;border:1px solid rgba(255,216,151,.16);border-radius:22px;background:rgba(255,255,255,.045)}.route-note span,.route-note small{color:rgba(255,247,232,.52)}.route-note b{color:#fff}.route-note small{grid-column:1/-1}.card-stage{display:flex;justify-content:center;perspective:1200px}.card{width:min(470px,100%);aspect-ratio:1.58;position:relative;overflow:hidden;border:1px solid rgba(255,216,151,.26);border-radius:28px;padding:30px;background:radial-gradient(circle at 18% 10%,rgba(255,255,255,.13),transparent 18%),radial-gradient(circle at 82% 74%,rgba(255,217,141,.14),transparent 28%),linear-gradient(135deg,#090909,#1a1712 48%,#050505);box-shadow:0 42px 100px rgba(0,0,0,.62);transform:rotateY(-14deg) rotateX(8deg);animation:float 6.5s ease-in-out infinite}.card:after{content:"";position:absolute;inset:-40%;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.14),transparent 62%);animation:shine 5.5s ease-in-out infinite}.card i{display:block;width:58px;height:42px;border-radius:12px;background:linear-gradient(135deg,#f6dda1,#bd8833 52%,#694511);box-shadow:0 0 34px rgba(255,217,141,.24)}.card p,.card small{color:rgba(255,236,190,.72);font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.card strong{position:relative;z-index:1;display:block;margin-top:44px;color:#fff;font-size:clamp(42px,5.2vw,72px);line-height:.82;letter-spacing:-.06em}.section{padding:clamp(72px,9vw,120px) 0}.center{text-align:center;justify-content:center}.section h2,.final h2{max-width:820px;margin:0 auto 18px;color:#fff;font-size:clamp(34px,5vw,66px);line-height:.96;letter-spacing:-.055em}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.grid article,.panel,.list article,.final{border:1px solid rgba(255,255,255,.07);border-radius:28px;background:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.025));backdrop-filter:blur(16px);padding:30px}.grid b{display:grid;place-items:center;width:52px;height:52px;margin-bottom:22px;border-radius:999px;background:rgba(255,255,255,.06)}.grid h3,.list h3{margin:0 0 10px;color:#fff;font-size:22px}.quote{margin:20px calc(50% - 50vw);padding:110px 20px;text-align:center;background:#000}.quote p{max-width:980px;margin:0 auto 24px;color:#fff;font-family:Georgia,"Times New Roman",serif;font-size:clamp(32px,5vw,62px);font-style:italic;line-height:1.12}.quote span{color:rgba(255,255,255,.55);font-size:12px;font-weight:900;letter-spacing:.24em;text-transform:uppercase}.conditions{display:grid;grid-template-columns:minmax(0,.95fr) minmax(320px,1.05fr);gap:22px}.list{display:grid;gap:14px}.list span{color:var(--gold);font-size:12px;font-weight:950;letter-spacing:.18em}.final{text-align:center;margin-top:20px;background:radial-gradient(circle at 50% 0%,rgba(255,217,141,.16),transparent 34%),var(--panel)}.final p{max-width:760px;margin:0 auto}footer{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap;margin-top:46px;padding-top:28px;border-top:1px solid rgba(255,255,255,.1);font-size:22px;font-weight:950}footer small{color:rgba(255,255,255,.38);font-size:13px;font-weight:400}@keyframes float{0%,100%{transform:translateY(0) rotateY(-14deg) rotateX(8deg)}50%{transform:translateY(-22px) rotateY(-10deg) rotateX(6deg)}}@keyframes shine{0%,35%{transform:translateX(-58%) rotate(12deg)}58%,100%{transform:translateX(68%) rotate(12deg)}}@media(max-width:900px){.hero,.conditions{grid-template-columns:1fr}.card-stage{order:-1}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:720px){.bc{width:min(100% - 24px,1240px)}nav{position:relative;display:grid}.hero{min-height:auto;padding-top:28px}.actions{display:grid}.btn{width:100%}.grid{grid-template-columns:1fr}.conditions{grid-template-columns:1fr}footer{display:grid}}`;
}

function renderHallRecovery(request) { return renderRouteRecoveryShell(request, "hall", "MMD Privé | Hall", "MMD Hall", "พื้นที่กลางสำหรับเข้าสู่ระบบสมาชิก ตรวจสถานะ และไปต่อยังเส้นทางที่เกี่ยวข้องของ MMD Privé", [{ label: "Enter Member Area", href: "/member/dashboard" }, { label: "Member Payments", href: "/member/payments" }]); }
function renderModelConsoleRecovery(request) { return renderRouteRecoveryShell(request, "model-console", "MMD Privé | Model Console", "Model Console", "พื้นที่สำหรับผู้ให้บริการตรวจสถานะงานและไปต่อยังขั้นตอนที่เกี่ยวข้องของ MMD Privé", [{ label: "Continue", href: "/v1/model/session/dashboard" }, { label: "Member Area", href: "/member/dashboard" }]); }
function renderMemberStaticRecovery(request) { return renderRouteRecoveryShell(request, "member-static", "MMD Privé | Member", "Member Page", "หน้านี้อยู่ในพื้นที่สมาชิกของ MMD Privé และพร้อมเชื่อมต่อกับเนื้อหาหลักในขั้นต่อไป", [{ label: "Enter Member Area", href: "/member/dashboard" }, { label: "Membership", href: "/member/membership" }]); }

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (isLineWebhookPath(url)) return fetchLineWebhook(request, env, url);
    if (isSigilPrivateModelApplyApiPath(url)) return fetchSigilWorkerRoute(request, env, url, "sigil-private-model-apply-api");
    if (!isSafePageRequest(request)) return withFrontGateHeaders(await fetch(request));
    if (isBlackcardPublicPath(url)) return renderPublicBlackcardPage(request);
    if (isSigilApplyPath(url)) return fetchSigilWorkerRoute(request, env, url, "sigil-private-model-setup");
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
    const target = new URL(url.toString());
    target.protocol = CANONICAL_PROTOCOL;
    target.hostname = CANONICAL_HOST;
    target.pathname = mappedPath;
    const needsRedirect = url.protocol !== CANONICAL_PROTOCOL || url.hostname !== CANONICAL_HOST || url.pathname !== mappedPath;
    if (!needsRedirect || target.toString() === url.toString()) return fetchPassThrough(request);
    return withFrontGateHeaders(Response.redirect(target.toString(), 301));
  },
};
