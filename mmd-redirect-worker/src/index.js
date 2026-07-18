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
export const FRONT_VERSION = "20260718-public-model-tart-worker-logo";
export const PUBLIC_BLACKCARD_PAGE = "public-blackcard";
export const PUBLIC_MODEL_APPLY_PAGE = "public-model-apply-tart";
export const SIGIL_APPLY_ROUTE_OWNER = "sigil-worker";
export const KENJI_KNOWLEDGE_ADMIN_PATHS = new Set(["/internal/admin/kenji-knowledge", "/internal/admin/kenji-knowledge/"]);

export const REDIRECT_HOSTS = new Set(["www.mmdbkk.com", "mmdbkk.com", "mmdprive.com", "www.mmdprive.com", "malemodel-bkk.workers.dev"]);
export const NEVER_TOUCH_HOSTS = new Set(["sigil.mmdbkk.com"]);
export const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);
export const PUBLIC_BLACKCARD_PATHS = new Set(["/blackcard", "/blackcard/", "/blackcard/black-card", "/blackcard/black-card/"]);
export const PUBLIC_MODEL_APPLY_PATHS = new Set(["/apply/public-model", "/apply/public-model/"]);
export const WEBFLOW_MEMBER_PAGE_PATHS = new Set(["/member/promotion", "/member/promotion/", "/member/apply", "/member/apply/"]);
export const MEMBER_PAGE_PATHS = new Set(["/member/membership", "/member/membership/", "/member/profile", "/member/profile/", "/pay/membership", "/pay/membership/", "/pay/pending-verification", "/pay/pending-verification/", "/sigil/pay/renewal", "/sigil/pay/renewal/"]);
export const MEMBER_API_PATHS = new Set(["/member/api/liff/identify", "/member/api/liff/identify/"]);
export const NEVER_TOUCH_PREFIXES = ["/api/", "/webhook/", "/webhooks/", "/payments/", "/payment/", "/payment-webhook/", "/admin/", "/sigil/", "/cdn-cgi/", "/assets/", "/static/", "/uploads/"];
export const NEVER_REDIRECT_EXACT_PATHS = new Set(["/member/promotion", "/member/promotion/", "/member/apply", "/member/apply/", "/member/dashboard", "/member/dashboard/", "/member/membership", "/member/membership/", "/member/profile", "/member/profile/", "/member/payments", "/member/payments/", "/pay/membership", "/pay/membership/", "/pay/pending-verification", "/pay/pending-verification/", "/sigil/pay/membership", "/sigil/pay/membership/", "/sigil/pay/renewal", "/sigil/pay/renewal/", "/hall", "/hall/", "/model/console", "/model/console/", "/blackcard", "/blackcard/", "/blackcard/black-card", "/blackcard/black-card/", "/apply/public-model", "/apply/public-model/"]);
export const EXACT_PATH_REDIRECTS = { "/trust/inme": "/sigil/start", "/inme": "/sigil/start", "/login": "/sigil/start", "/member": "/member/dashboard", "/member/membership/benefits": "/member/membership", "/members": "/sigil/start", "/membership": "/member/membership", "/membership/benefits": "/member/membership", "/renew": "/sigil/membership", "/renewal": "/sigil/membership", "/trust": "/sigil/start" };
export const FOLDER_REDIRECTS = [{ from: "/old-academy/", to: "/academy/" }, { from: "/old-trust/", to: "/trust/" }];

const PUBLIC_MODEL_LOGO = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a45df60af505d2e03878512_Prive%20Trans.webp";
const PUBLIC_MODEL_HERO_DESKTOP = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a5bb3bb1bc958a523198c50_ChatGPT%20Image%20Jul%2018%2C%202026%2C%2011_24_55%20PM.webp";
const PUBLIC_MODEL_HERO_MOBILE = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a5bb3bb7752640f03b0efe8_ChatGPT%20Image%20Jul%2018%2C%202026%2C%2011_27_59%20PM.webp";
const PUBLIC_MODEL_REVIEW_IMAGE = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a5bb3bbbbf4d4b2a16cb5b8_ChatGPT%20Image%20Jul%2018%2C%202026%2C%2011_31_18%20PM.webp";
const PUBLIC_MODEL_APPLY_API = "https://sigil.mmdbkk.com/v1/public-model/apply";

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
function isPublicModelApplyPath(url) { return PUBLIC_MODEL_APPLY_PATHS.has(url.pathname.toLowerCase()); }
function isWebflowMemberPagePath(url) { return WEBFLOW_MEMBER_PAGE_PATHS.has(url.pathname.toLowerCase()); }
function isSigilApplyPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/apply" || p === "/sigil/apply/"; }
function isSigilPrivateModelApplyApiPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/api/private-model/apply" || p === "/sigil/api/private-model/apply/"; }
function isSigilMembershipPath(url) { const p = url.pathname.toLowerCase(); return p === "/sigil/membership" || p === "/sigil/membership/"; }
function isMemberDashboardPath(url) { const p = url.pathname.toLowerCase(); return p === "/member/dashboard" || p === "/member/dashboard/"; }
function isMemberPagePath(url) { return MEMBER_PAGE_PATHS.has(url.pathname.toLowerCase()); }
function isMemberApiPath(url) { return MEMBER_API_PATHS.has(url.pathname.toLowerCase()); }
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
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>MMD Privé | Black Card</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#050404;color:#fff6df;font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}.hero{min-height:100vh;display:grid;place-items:end start;padding:28px;background:linear-gradient(90deg,rgba(5,4,4,.86),rgba(5,4,4,.24)),url(https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a2e89da3f9feeabc206fa8c_SIGIL_Wall.webp) center/cover}.panel{width:min(760px,100%);padding:clamp(24px,5vw,54px);border:1px solid rgba(216,177,95,.25);border-radius:32px;background:rgba(8,7,6,.72);backdrop-filter:blur(18px);box-shadow:0 28px 90px rgba(0,0,0,.36)}.mark{width:54px;height:54px;object-fit:contain;margin-bottom:28px;filter:drop-shadow(0 10px 24px rgba(216,177,95,.22))}.kicker{color:#f4dd95;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}h1{margin:10px 0 16px;font-size:clamp(46px,11vw,92px);line-height:.94;letter-spacing:-.05em}p{margin:0 0 14px;color:rgba(255,246,223,.78);font-size:17px;line-height:1.75}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}a{min-height:48px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;border-radius:999px;text-decoration:none;font-weight:850}.primary{color:#150f07;background:linear-gradient(135deg,#f7e6a8,#bd8730)}.ghost{color:#fff6df;border:1px solid rgba(216,177,95,.28);background:rgba(255,255,255,.06)}</style></head><body><main class="hero"><section class="panel"><img class="mark" src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a3f71e229504b27874227cd_MMD%20Logo%20Only.webp" alt="MMD"><p class="kicker">BLACK CARD PRIVILEGES</p><h1>สิทธิ์ที่ดีที่สุด<br>ของสมาชิก MMD</h1><p>Black Card คือระดับการดูแลที่เปิดให้สมาชิกเข้าถึงตัวเลือกมากกว่า เร็วกว่า และละเอียดกว่าการเป็นสมาชิกปกติ</p><p>สถานะจริงยังอ้างอิงจาก owner review, ledger และ official verification เท่านั้น หน้านี้ไม่มีการเปิดสิทธิ์อัตโนมัติ</p><div class="actions"><a class="primary" href="/member/membership${query}">ดูแพ็กเกจสมาชิก</a><a class="ghost" href="/member/dashboard${query}">Member Dashboard</a></div></section></main></body></html>`;
  return htmlResponse(request, html, PUBLIC_BLACKCARD_PAGE, { "x-mmd-route-owner": FRONT_GATE, "x-mmd-origin": "front-gate:public-blackcard-safe" });
}

function renderPublicModelApplyPage(request) {
  const url = new URL(request.url);
  const query = url.search || "";
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="index,follow"><title>MMD Privé | Public Model Application</title><style>:root{color-scheme:light;--cream:#fff8ef;--ink:#251812;--muted:rgba(37,24,18,.66);--line:rgba(85,50,34,.14);--gold:#c89b57;--red:#6f2436;--dark:#160f0c;--shadow:0 28px 80px rgba(71,45,28,.18)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(180deg,#fff8ef,#f4e5d3 58%,#17100c);color:var(--ink);font-family:Inter,"Noto Sans Thai","Segoe UI",Arial,sans-serif}.shell{width:min(1160px,100%);margin:0 auto;padding:0 clamp(16px,4vw,34px)}.hero{position:relative;min-height:820px;display:flex;align-items:flex-end;overflow:hidden;background:#1a0f0d;padding:92px 0 42px}.hero picture{position:absolute;inset:0;z-index:0}.hero img{width:100%;height:100%;object-fit:cover;object-position:center top;display:block}.shade{position:absolute;inset:0;z-index:1;background:linear-gradient(180deg,rgba(255,248,239,.08),rgba(255,248,239,.25) 28%,rgba(27,14,12,.62) 76%,rgba(22,15,12,.95)),radial-gradient(circle at 20% 72%,rgba(255,248,239,.54),transparent 40%)}.top{position:absolute;z-index:5;top:18px;left:clamp(16px,4vw,34px);right:clamp(16px,4vw,34px);display:flex;align-items:center;justify-content:space-between;gap:14px}.logo{display:inline-flex;align-items:center;text-decoration:none}.logo img{width:clamp(118px,30vw,182px);height:auto;object-fit:contain;filter:drop-shadow(0 18px 34px rgba(255,255,255,.30))}.top a:last-child{min-height:38px;display:inline-flex;align-items:center;padding:0 14px;border:1px solid rgba(37,24,18,.12);border-radius:999px;background:rgba(255,255,255,.58);text-decoration:none;color:rgba(37,24,18,.72);font-size:10px;font-weight:950;letter-spacing:.15em;text-transform:uppercase;backdrop-filter:blur(18px)}.hero-copy{position:relative;z-index:2;width:min(660px,100%);padding:22px;border:1px solid var(--line);border-radius:30px;background:linear-gradient(180deg,rgba(255,255,255,.80),rgba(255,255,255,.50));box-shadow:var(--shadow);backdrop-filter:blur(20px)}.kicker{margin:0;color:var(--red);font-size:10px;line-height:1;letter-spacing:.18em;text-transform:uppercase;font-weight:950}h1,h2,h3{font-family:Georgia,"Noto Serif Thai",serif;letter-spacing:-.045em;font-weight:560}h1{margin:12px 0 0;font-size:clamp(46px,13vw,96px);line-height:.92}h2{margin:12px 0 0;font-size:clamp(32px,9vw,68px);line-height:1}.lead{margin:20px 0 0;color:rgba(37,24,18,.78);font-size:16px;line-height:1.78;font-weight:750}.body{margin:12px 0 0;color:rgba(37,24,18,.68);font-size:14.5px;line-height:1.82}.actions{display:grid;gap:10px;margin-top:22px}.btn{min-height:50px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;border:1px solid transparent;border-radius:999px;font:inherit;font-size:13px;font-weight:950;text-decoration:none;cursor:pointer}.gold{color:#20140e;background:linear-gradient(135deg,#f8dea3,#c89b57 54%,#9b6a2c);box-shadow:0 18px 42px rgba(200,155,87,.26)}.ghost,.muted{color:rgba(37,24,18,.78);border-color:rgba(37,24,18,.12);background:rgba(255,255,255,.54)}.quote,.panel,.card,.form-card,.success{border:1px solid var(--line);border-radius:30px;background:rgba(255,255,255,.78);box-shadow:var(--shadow);backdrop-filter:blur(20px)}.quote{margin-top:16px;padding:14px;border-radius:20px;background:rgba(255,255,255,.42)}.quote span{display:block;color:var(--red);font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:950}.quote p,.panel p,.card p,.form-card p,.step em,.success p{margin:8px 0 0;color:var(--muted);font-size:13.5px;line-height:1.74}.main{padding:0 0 96px}.panel{margin-top:-24px;padding:22px}.grid{display:grid;gap:10px;margin-top:18px}.card{padding:16px;border-radius:22px}.card span{color:var(--red);font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:950}.card strong{display:block;margin-top:9px;font-size:16px}.feature{display:grid;overflow:hidden;margin-top:24px;padding:0}.feature-img{min-height:340px;background:var(--dark)}.feature-img img{width:100%;height:100%;object-fit:cover;object-position:center top}.feature-copy{padding:22px}.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.chips span{min-height:34px;display:inline-flex;align-items:center;padding:0 12px;border:1px solid rgba(37,24,18,.10);border-radius:999px;background:rgba(255,255,255,.56);color:var(--red);font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:950}.form-zone{display:grid;gap:16px;margin-top:24px}.side{display:grid;gap:14px}.side ul{display:grid;gap:10px;margin:18px 0 0;padding:0;list-style:none}.side li{position:relative;padding-left:22px;color:var(--muted);font-size:13.5px;line-height:1.7}.side li:before{content:"";position:absolute;left:0;top:.62em;width:8px;height:8px;border-radius:50%;background:var(--gold)}.form-card{padding:18px}.progress{height:8px;overflow:hidden;border-radius:999px;background:rgba(37,24,18,.10);margin:16px 0}.progress b{display:block;width:33.333%;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--red),var(--gold));transition:width .24s ease}.step{display:none;margin:0;padding:0;border:0}.step.active{display:block}.step legend{display:grid;gap:8px;margin-bottom:16px}.step span{color:var(--red);font-size:10px;letter-spacing:.16em;text-transform:uppercase;font-weight:950}.step strong{font-size:30px;line-height:1.08;font-family:Georgia,"Noto Serif Thai",serif;font-weight:560}.step em{font-style:normal}.fields{display:grid;gap:12px}.field{display:grid;gap:8px}.field span{font-size:13px;font-weight:900;color:rgba(37,24,18,.78)}input,select,textarea{width:100%;min-height:50px;border:1px solid rgba(37,24,18,.13);border-radius:18px;background:rgba(255,255,255,.78);color:var(--ink);font:inherit;font-size:14px;line-height:1.5;outline:none;padding:13px 14px}textarea{resize:vertical;min-height:126px}.invalid{border-color:rgba(170,34,54,.72)!important;box-shadow:0 0 0 4px rgba(170,34,54,.11)!important}.note,.checks,.review,.consent,.error{border:1px solid rgba(37,24,18,.10);border-radius:24px;background:rgba(255,255,255,.52);padding:16px;margin-bottom:14px}.checks-grid{display:grid;gap:8px;margin-top:14px}.checks-grid label,.consent{display:grid;grid-template-columns:18px 1fr;gap:10px;align-items:start;cursor:pointer}.checks-grid label{padding:12px;border:1px solid rgba(37,24,18,.10);border-radius:18px;background:rgba(255,255,255,.58)}input[type=checkbox]{width:18px;height:18px;min-height:18px;margin:1px 0 0;accent-color:var(--red)}.nav{display:grid;gap:10px;margin-top:18px}.nav-right{display:grid;gap:10px}.error{display:none;color:#7a1e2e;border-color:rgba(122,30,46,.20);background:rgba(122,30,46,.08);font-size:13px;line-height:1.6;font-weight:800}.error.show,.success.show{display:block}.success{display:none;margin-top:18px;padding:22px}.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}.review-row{display:grid;gap:4px;padding:12px;border-radius:16px;background:rgba(255,255,255,.50);margin-bottom:10px}.review-row span{color:rgba(37,24,18,.48);font-size:11px;letter-spacing:.10em;text-transform:uppercase;font-weight:900}.review-row strong{font-size:14px;line-height:1.55;white-space:pre-wrap}@media(min-width:768px){.hero{min-height:840px;align-items:center;padding:112px 0 72px}.hero picture img{object-position:center center}.shade{background:linear-gradient(90deg,rgba(255,248,239,.92),rgba(255,248,239,.68) 42%,rgba(255,248,239,.14)),linear-gradient(180deg,rgba(255,248,239,.12),rgba(255,248,239,.20) 58%,rgba(22,15,12,.86))}.hero-copy{padding:34px}.actions{display:flex;flex-wrap:wrap}.btn{min-width:178px}.panel{margin-top:-54px;padding:30px}.grid{grid-template-columns:repeat(4,1fr)}.feature{grid-template-columns:.92fr 1.08fr}.feature-img{min-height:460px}.feature-copy{display:flex;flex-direction:column;justify-content:center;padding:clamp(30px,5vw,58px)}.form-zone{grid-template-columns:340px minmax(0,1fr);align-items:start}.side{position:sticky;top:22px}.form-card{padding:28px}.fields.two{grid-template-columns:repeat(2,minmax(0,1fr))}.full{grid-column:1/-1}.checks-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.nav{grid-template-columns:auto 1fr;align-items:center}.nav-right{display:flex;justify-content:flex-end;flex-wrap:wrap}}</style></head><body><section id="apply" data-api="${PUBLIC_MODEL_APPLY_API}"><header class="hero"><picture><source media="(min-width:768px)" srcset="${PUBLIC_MODEL_HERO_DESKTOP}"><img src="${PUBLIC_MODEL_HERO_MOBILE}" alt=""></picture><div class="shade"></div><nav class="top"><a class="logo" href="/"><img src="${PUBLIC_MODEL_LOGO}" alt="MMD Privé"></a><a href="/sigil/apply${query}">Private Model</a></nav><div class="shell"><div class="hero-copy"><p class="kicker">TART DESK / PUBLIC MODEL APPLICATION</p><h1>ส่งโปรไฟล์ให้ผมอ่านครับ</h1><p class="lead">สำหรับน้อง ๆ ผู้ชายที่มีบุคลิกดี รูปร่างหน้าตาดี มีใจให้บริการ และรู้สึกว่าอยากลองร่วมงานกับ MMD</p><p class="body">คุณไม่จำเป็นต้องมาจากสายงานบันเทิงเท่านั้นครับ ถ้าคุณมีเสน่ห์ในการอยู่กับคน วางตัวดี คุยเป็น ดูแลบรรยากาศได้ หรือมีความสามารถเฉพาะตัวที่ทำให้คุณน่าสนใจกว่าการเป็นแค่รูปหนึ่งใบ ผมอยากอ่านโปรไฟล์ของคุณ</p><p class="body">Public Model ของ MMD ครอบคลุมงานหลายแบบ ทั้งงานให้ความบันเทิง งานเพื่อนเดินทาง งานเพื่อนกินข้าว งานออกงาน งานภาพลักษณ์ และงานที่ใช้ทักษะเฉพาะตัว</p><div class="actions"><a class="btn gold" href="#form">เริ่มส่งโปรไฟล์</a><a class="btn ghost" href="#before">อ่านก่อนสมัคร</a></div><div class="quote"><span>TarT note</span><p>ส่งข้อมูลตามจริงได้เลยครับ ผมจะดูว่าคุณเหมาะกับงานแบบไหน ลูกค้ากลุ่มไหนควรเห็นคุณ และ MMD ควรวางคุณไว้ในแฟ้มไหน</p></div></div></div></header><main class="main"><section class="shell panel" id="before"><p class="kicker">BEFORE YOU APPLY</p><h2>เล่าให้ผมเห็นสิ่งที่รูปถ่ายเล่าไม่หมด</h2><p>Public Model ไม่ได้มีแค่คนที่ถ่ายรูปขึ้นครับ บางคนน่าสนใจเพราะคุยเก่ง บางคนเพราะวางตัวดี บางคนเพราะเล่นกีฬาเก่ง ขับรถดี หรือมีประสบการณ์ที่ทำให้ลูกค้าอยู่ด้วยแล้วสบายใจ</p><div class="grid"><article class="card"><span>01</span><strong>ตัวตน</strong><p>ผมอยากรู้ว่าคุณเป็นคนแบบไหน ไม่ใช่แค่คุณสูงเท่าไหร่</p></article><article class="card"><span>02</span><strong>ความสามารถ</strong><p>กีฬา งานอดิเรก รสนิยม หรือเรื่องที่คุณคุยได้ดี อาจกลายเป็นจุดขายของคุณได้</p></article><article class="card"><span>03</span><strong>ขอบเขต</strong><p>รับอะไรได้ ไม่รับอะไร อยากคุยก่อนกับลูกค้ากลุ่มไหน บอกตรง ๆ ได้เลยครับ</p></article><article class="card"><span>04</span><strong>การพิจารณา</strong><p>ส่งแล้ว MMD จะอ่านและจัดกลุ่มก่อน ยังไม่ใช่การอนุมัติหรือเผยแพร่โปรไฟล์ทันที</p></article></div></section><section class="shell feature"><div class="feature-img"><img src="${PUBLIC_MODEL_REVIEW_IMAGE}" alt="" loading="lazy" decoding="async"></div><div class="feature-copy"><p class="kicker">HOW I READ YOUR PROFILE</p><h2>ผมไม่ได้อ่านแค่รูปครับ</h2><p>ผมจะดูว่าคุณอยู่กับคนอื่นแล้วให้บรรยากาศแบบไหน มีอะไรที่ลูกค้าจำได้ และมีขอบเขตอะไรที่ MMD ควรรู้ก่อนส่งงานให้ดู</p><div class="chips"><span>บุคลิก</span><span>รูปร่างหน้าตา</span><span>ใจบริการ</span><span>วิธีสื่อสาร</span><span>งานอดิเรก</span><span>ความสามารถเฉพาะตัว</span></div></div></section><section class="shell form-zone" id="form"><aside class="side"><div class="side-card card"><p class="kicker">PUBLIC WORK ONLY</p><h3>นี่คือแฟ้ม Public Model ครับ</h3><p>หน้านี้สำหรับงาน Public Work เท่านั้น ถ้าคุณตั้งใจสมัครงานฝั่ง Private Model ให้ไปอีกเส้นทางหนึ่ง เพราะวิธีคัด รายละเอียด และการดูแลไม่เหมือนกัน</p><ul><li>กรอกตามจริง ไม่ต้องทำให้ดูพร้อมเกินไป</li><li>ใส่สิ่งที่คุณทำได้ดี แม้จะไม่ใช่งานบันเทิง</li><li>บอกขอบเขตที่ไม่สะดวกได้ตรง ๆ</li><li>ส่งแล้วรอ MMD อ่านและจัดกลุ่มก่อน</li></ul></div><div class="card"><span>Draft</span><strong id="draft">ยังไม่มี draft</strong><p><button class="btn muted" type="button" id="clear">ล้าง draft</button></p></div></aside><section class="form-card"><p class="kicker">APPLICATION FORM</p><h2>กรอกใบสมัครให้ผมอ่าน</h2><p>ใช้เวลาประมาณ 5–8 นาทีครับ ยิ่งเล่าจริง ผมยิ่งเห็นชัดว่าคุณควรถูกวางไว้ในแฟ้มไหน</p><div class="progress"><b id="bar"></b></div><form id="appForm" novalidate><input class="hp" id="company" autocomplete="off" tabindex="-1"><fieldset class="step active" data-step="1"><legend><span>Step 1</span><strong>ข้อมูลพื้นฐาน</strong><em>ผมอยากรู้ว่าควรเรียกคุณว่าอะไร ติดต่อกลับทางไหน และคุณอยู่ในพื้นที่ที่รับงานได้จริงหรือเปล่า</em></legend><div class="fields two"><label class="field"><span>ชื่อเล่น / Working name</span><input id="nickname" required maxlength="80"></label><label class="field"><span>อายุ</span><input id="age" type="number" min="18" max="70" required></label><label class="field"><span>ส่วนสูง</span><input id="height" type="number" placeholder="cm"></label><label class="field"><span>จังหวัด / พื้นที่สะดวก</span><input id="location" required maxlength="160"></label><label class="field"><span>อาชีพ / ตอนนี้ทำอะไรอยู่</span><input id="occupation" required maxlength="160"></label><label class="field"><span>เบอร์ติดต่อ</span><input id="phone" type="tel" required maxlength="30"></label><label class="field"><span>LINE ID</span><input id="lineId" maxlength="80"></label><label class="field"><span>Telegram</span><input id="telegram" maxlength="80" placeholder="@username"></label><label class="field full"><span>Instagram / TikTok / Portfolio</span><input id="social" type="url" maxlength="500"></label></div></fieldset><fieldset class="step" data-step="2"><legend><span>Step 2</span><strong>สิ่งที่รูปถ่ายเล่าไม่หมด</strong><em>ตรงนี้สำคัญที่สุดครับ เล่าให้ผมเห็นว่าคุณเป็นคนที่ลูกค้าอยากใช้เวลาด้วยเพราะอะไร</em></legend><div class="note"><strong>ไม่ต้องเขียนให้ดูสมบูรณ์แบบครับ</strong><p>ผมอยากอ่านภาพจริงของคุณมากกว่า เช่น คุยเรื่องอะไรได้ดี วางตัวแบบไหน เคยทำงานบริการไหม ชอบอะไร หรือมีเรื่องไหนที่คนมักจำคุณได้</p></div><div class="fields"><label class="field"><span>เล่าเกี่ยวกับตัวเอง</span><textarea id="story" rows="6" maxlength="5000"></textarea></label><label class="field"><span>ประสบการณ์การทำงานหรือการพบลูกค้า</span><textarea id="experience" rows="4" maxlength="3500"></textarea></label><label class="field"><span>กีฬา งานอดิเรก ความสามารถพิเศษ</span><textarea id="skills" rows="4" maxlength="3000"></textarea></label><label class="field"><span>รสนิยม / Lifestyle / เรื่องที่คุยได้ดี</span><textarea id="taste" rows="4" maxlength="3000"></textarea></label></div></fieldset><fieldset class="step" data-step="3"><legend><span>Step 3</span><strong>งานที่รับได้และขอบเขตของคุณ</strong><em>หลังส่งแล้ว ผมจะใช้ข้อมูลนี้อ่านความเหมาะสมเบื้องต้น ยังไม่ใช่การอนุมัติหรือขึ้นโปรไฟล์ทันทีครับ</em></legend><div class="fields two"><label class="field"><span>ประเภทงานที่สนใจ</span><select id="workType" required><option value="">เลือกคำตอบ</option><option value="travel_model">Travel Model / เพื่อนเดินทาง / กินเที่ยว</option><option value="visual_model">Visual / Photo / Content</option><option value="event_social">Event / Social Appearance</option><option value="entertainment">Entertainment / ดูแลบรรยากาศ</option><option value="skill_based">Skill-based / ใช้ความสามารถเฉพาะตัว</option><option value="discuss_first">ให้ MMD ช่วยดู</option></select></label><label class="field"><span>Public category</span><select id="category" required><option value="">เลือกคำตอบ</option><option value="travel">Travel Models</option><option value="extreme">Extreme Models</option><option value="both">Travel + Extreme</option><option value="review">ให้ MMD พิจารณา</option></select></label><label class="field"><span>Orientation สำหรับแฟ้ม R2</span><select id="orientation" required><option value="">เลือกคำตอบ</option><option value="straight">Straight</option><option value="gay">Gay</option><option value="discuss_first">ขอคุยกับ MMD ก่อน</option></select></label><label class="field"><span>ระดับการเปิดเผย</span><select id="publicLevel" required><option value="">เลือกคำตอบ</option><option value="public_ok">ออกสื่อได้</option><option value="semi_public">Semi-public / เลือกงาน</option><option value="approval_before_use">ขออนุมัติก่อนใช้รูป</option><option value="discuss_first">ขอคุยก่อนทุกครั้ง</option></select></label></div><div class="checks"><strong>กลุ่มลูกค้าที่คุณรับงานได้</strong><p>เลือกตามจริงครับ ข้อมูลนี้ช่วยไม่ให้ MMD ส่งงานผิดขอบเขตของคุณ</p><div class="checks-grid"><label><input type="checkbox" name="groups" value="women"><span>ลูกค้าผู้หญิง</span></label><label><input type="checkbox" name="groups" value="men"><span>ลูกค้าผู้ชาย</span></label><label><input type="checkbox" name="groups" value="lgbtq"><span>LGBTQ+</span></label><label><input type="checkbox" name="groups" value="couple"><span>คู่ / Couple</span></label><label><input type="checkbox" name="groups" value="discuss_first"><span>ขอคุยก่อนเป็นกรณี</span></label></div></div><div class="fields"><label class="field"><span>ขอบเขต / สิ่งที่อยากคุยก่อน</span><textarea id="boundaries" rows="5" maxlength="3500"></textarea></label><label class="consent"><input id="consent" type="checkbox"><span>ผมยืนยันว่าข้อมูลที่ส่งเป็นข้อมูลจริงในระดับที่ MMD สามารถใช้พิจารณาเบื้องต้นได้ และเข้าใจว่าการส่งใบสมัครยังไม่ใช่การอนุมัติ ไม่ใช่การเผยแพร่โปรไฟล์ และไม่ใช่การรับงานทันที</span></label><div class="review" id="review"></div></div></fieldset><div class="error" id="error"></div><div class="nav"><button class="btn muted" type="button" id="prev" disabled>ย้อนกลับ</button><div class="nav-right"><a class="btn muted" href="https://t.me/mmdapply" target="_blank" rel="noopener">Telegram</a><button class="btn gold" type="button" id="next">ถัดไป</button><button class="btn gold" type="submit" id="submit" style="display:none">ส่งใบสมัครให้ TarT</button></div></div></form><div class="success" id="success"><span>APPLICATION RECEIVED</span><h3>ผมได้รับใบสมัครแล้วครับ</h3><p>ขอบคุณที่เล่าให้เห็นภาพจริงนะครับ ผมจะใช้ข้อมูลนี้อ่านว่าคุณเหมาะกับงาน Public Model แบบไหน และควรถูกวางไว้ในแฟ้มไหนของ MMD</p></div></section></section></main></section><script>(function(){var root=document.getElementById('apply');var form=document.getElementById('appForm');if(!root||!form)return;var api=root.getAttribute('data-api');var step=1,total=3,key='mmd_public_apply_tart_worker_draft';var bar=document.getElementById('bar'),prev=document.getElementById('prev'),next=document.getElementById('next'),submit=document.getElementById('submit'),err=document.getElementById('error'),success=document.getElementById('success'),draft=document.getElementById('draft');function q(s){return document.querySelector(s)}function qa(s){return Array.prototype.slice.call(document.querySelectorAll(s))}function clean(v){return String(v||'').replace(/\s+/g,' ').trim()}function val(id){var el=document.getElementById(id);return el?el.value:''}function groups(){return qa('input[name="groups"]:checked').map(function(i){return i.value})}function show(m){err.textContent=m;err.classList.add('show');err.scrollIntoView({behavior:'smooth',block:'center'})}function hide(){err.textContent='';err.classList.remove('show')}function setStep(n){step=n;qa('.step').forEach(function(x){x.classList.toggle('active',Number(x.getAttribute('data-step'))===step)});bar.style.width=(step/total*100)+'%';prev.disabled=step===1;next.style.display=step===total?'none':'inline-flex';submit.style.display=step===total?'inline-flex':'none';if(step===total)renderReview()}function activeFields(){var s=q('.step[data-step="'+step+'"]');return s?qa('.step[data-step="'+step+'"] input,.step[data-step="'+step+'"] select,.step[data-step="'+step+'"] textarea'):[]}function validate(){var ok=true;activeFields().forEach(function(el){if(el.type==='checkbox')return;var bad=el.hasAttribute('required')&&!clean(el.value);el.classList.toggle('invalid',bad);if(bad)ok=false});if(!ok){show('ผมยังอ่านใบสมัครต่อไม่ได้ครับ ขอเติมข้อมูลที่จำเป็นให้ครบก่อน');return false}if(step===3&&!groups().length){show('ขอเลือกกลุ่มลูกค้าที่คุณรับงานได้อย่างน้อย 1 ข้อ หรือเลือกว่าขอคุยก่อนเป็นกรณีครับ');return false}if(step===3&&!document.getElementById('consent').checked){show('ก่อนส่ง ขอให้ยืนยันความเข้าใจเรื่องการใช้ข้อมูลเพื่อคัดกรองก่อนครับ');return false}hide();return true}function payload(){return{source:'mmd_apply_public_model',source_path:'/apply/public-model',brand:'MMD PRIVÉ',application_type:'public_model',form_version:'public-model-tart-worker-v1',handler:'TarT',handler_voice:'TarT Voice',submitted_at:new Date().toISOString(),page_url:location.href,nickname:clean(val('nickname')),age:clean(val('age')),height_cm:clean(val('height')),occupation:clean(val('occupation')),location:clean(val('location')),phone:clean(val('phone')).replace(/[^\d+]/g,''),line_id:clean(val('lineId')),telegram_username:clean(val('telegram')),social_profile:clean(val('social')),self_story:val('story').trim(),experience:val('experience').trim(),skills:val('skills').trim(),taste_lifestyle:val('taste').trim(),public_work_type:clean(val('workType')),public_category:clean(val('category')),orientation_label:clean(val('orientation')),public_level:clean(val('publicLevel')),accepted_customer_groups:groups(),boundaries:val('boundaries').trim(),honeypot:clean(val('company')),consent:document.getElementById('consent').checked,user_agent:navigator.userAgent||'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'',language:navigator.language||''}}function renderReview(){var p=payload();var rows=[['ชื่อเล่น',p.nickname||'-'],['อายุ',p.age||'-'],['พื้นที่',p.location||'-'],['งานที่สนใจ',p.public_work_type||'-'],['Category',p.public_category||'-'],['Orientation',p.orientation_label||'-'],['กลุ่มลูกค้าที่รับได้',p.accepted_customer_groups.join(', ')||'-']];document.getElementById('review').innerHTML=rows.map(function(r){return'<div class="review-row"><span>'+r[0]+'</span><strong>'+String(r[1]).replace(/[&<>\"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]})+'</strong></div>'}).join('')}function save(){try{localStorage.setItem(key,JSON.stringify(payload()));draft.textContent='บันทึกล่าสุด '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}catch(e){}}function load(){try{var data=JSON.parse(localStorage.getItem(key)||'{}');Object.keys(data).forEach(function(k){var el=document.getElementById(k);if(el&&typeof data[k]==='string')el.value=data[k]});if(Array.isArray(data.accepted_customer_groups)){data.accepted_customer_groups.forEach(function(g){var el=q('input[name="groups"][value="'+g+'"]');if(el)el.checked=true})}}catch(e){}}next.onclick=function(){if(validate()){save();setStep(Math.min(total,step+1));document.getElementById('form').scrollIntoView({behavior:'smooth'})}};prev.onclick=function(){hide();setStep(Math.max(1,step-1));document.getElementById('form').scrollIntoView({behavior:'smooth'})};document.getElementById('clear').onclick=function(){localStorage.removeItem(key);draft.textContent='ล้าง draft แล้ว'};form.addEventListener('input',function(){clearTimeout(form._t);form._t=setTimeout(save,250)});form.onsubmit=function(e){e.preventDefault();if(!validate())return;var p=payload();if(p.honeypot)return show('ผมยังรับใบสมัครนี้ไม่ได้ครับ');submit.disabled=true;submit.textContent='กำลังส่งใบสมัครให้ TarT...';fetch(api,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(p)}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok||j.ok===false)throw new Error(j.message||j.error||'ผมยังรับใบสมัครนี้ไม่สำเร็จครับ');localStorage.removeItem(key);form.style.display='none';success.classList.add('show');success.scrollIntoView({behavior:'smooth'})})}).catch(function(ex){show(ex.message||'ผมยังรับใบสมัครนี้ไม่สำเร็จครับ')}).finally(function(){submit.disabled=false;submit.textContent='ส่งใบสมัครให้ TarT'})};load();setStep(1)})();</script></body></html>`;
  return htmlResponse(request, html, PUBLIC_MODEL_APPLY_PAGE, { "x-mmd-route-owner": FRONT_GATE, "x-mmd-origin": "front-gate:public-model-apply-worker", "x-mmd-public-model-api": PUBLIC_MODEL_APPLY_API });
}

function renderHallRecovery(request) { return renderRouteRecoveryShell(request, "hall", "MMD Privé | Hall", "MMD Hall", "พื้นที่กลางสำหรับเข้าสู่ระบบสมาชิก ตรวจสถานะ และไปต่อยังเส้นทางที่เกี่ยวข้องของ MMD Privé", [{ label: "Enter Member Area", href: "/member/dashboard" }, { label: "Member Payments", href: "/member/payments" }]); }
function renderModelConsoleRecovery(request) { return renderRouteRecoveryShell(request, "model-console", "MMD Privé | Model Console", "Model Console", "พื้นที่สำหรับผู้ให้บริการตรวจสถานะงานและไปต่อยังขั้นตอนที่เกี่ยวข้องของ MMD Privé", [{ label: "Continue", href: "/v1/model/session/dashboard" }, { label: "Member Area", href: "/member/dashboard" }]); }
function renderMemberStaticRecovery(request) { return renderRouteRecoveryShell(request, "member-static", "MMD Privé | Member", "Member Page", "หน้านี้อยู่ในพื้นที่สมาชิกของ MMD Privé และพร้อมเชื่อมต่อกับเนื้อหาหลักในขั้นต่อไป", [{ label: "Enter Member Area", href: "/member/dashboard" }, { label: "Membership", href: "/member/membership" }]); }
function renderKenjiKnowledgeAdminShell(request) {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Kenji Knowledge Admin</title><link rel="stylesheet" href="https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-board-bridge.css"></head><body><div id="mmdKenjiKnowledgeV9"></div><script defer src="https://models.mmdbkk.com/webflow/internal/admin/kenji-knowledge/kenji-knowledge-v9-1-webflow-loader.js"></script></body></html>`;
  return htmlResponse(request, html, "kenji-knowledge-admin", { "x-mmd-route-owner": FRONT_GATE, "x-mmd-origin": "front-gate:kenji-knowledge-r2-loader-shell" });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (isLineWebhookPath(url)) return fetchLineWebhook(request, env, url);
    if (isSigilPrivateModelApplyApiPath(url)) return fetchSigilWorkerRoute(request, env, url, "sigil-private-model-apply-api");
    if (isMemberApiPath(url)) return fetchMemberPage(request, env, url);
    if (!isSafePageRequest(request)) return withFrontGateHeaders(await fetch(request));
    if (isBlackcardPublicPath(url)) return renderPublicBlackcardPage(request);
    if (isPublicModelApplyPath(url)) return renderPublicModelApplyPage(request);
    if (isSigilApplyPath(url)) return fetchSigilWorkerRoute(request, env, url, "sigil-private-model-setup");
    if (isSigilMembershipPath(url)) return fetchMemberPage(request, env, url);
    if (isMemberDashboardPath(url)) return fetchMemberFrontend(request, env, url);
    if (isWebflowMemberPagePath(url)) return fetchPassThrough(request);
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
