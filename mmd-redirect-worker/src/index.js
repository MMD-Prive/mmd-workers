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
  const statusHref = `${url.pathname}${query}#blackcard-status`;
  const reviewHref = `${url.pathname}${query}#review-request`;
  const profileHref = appendQuery("/sigil/member/profile", query);
  const aliasHref = appendQuery("/blackcard/black-card", query);
  const assets = {
    logo: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a3f71e229504b27874227cd_MMD%20Logo%20Only.webp",
    hero: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a3ee7791033ad757a013624_Hero%20Blackcard.webp",
    review: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a3ee66fc6eae04d54df2899_Yuki%20Review%2001.webp",
    card: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a3ee927846ba557ac2819c9_04%20Black.webp",
    pay: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a3ee9e123c4cb86a00fd941_SIGILPAY01.webp",
    profile: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a3eea14f51f624bfd1e2a90_Memship05.webp",
    network: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a3ee967872acc872ddce194_MMD%20Prive%20Network%20Casing.webp"
  };

  const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="description" content="MMD Privé Black Card public reading page. Private review status, founder approval only.">
<title>MMD Privé | Black Card</title>
<style>${blackcardStyles()}</style>
</head>
<body>
<main id="mmd-blackcard" class="mbc" data-mmd-page="${PUBLIC_BLACKCARD_PAGE}" data-status-api="/api/blackcard/status" data-profile-url="/sigil/member/profile">
  <section class="mbc-hero" aria-label="Black Card private review">
    <img class="mbc-hero-img" src="${assets.hero}" alt="Black Card private review">
    <div class="mbc-shade" aria-hidden="true"></div>
    <div class="mbc-shell mbc-hero-shell">
      <nav class="mbc-top" aria-label="Black Card navigation">
        <a class="mbc-mark" href="/blackcard${query}" aria-label="MMD Black Card"><img src="${assets.logo}" alt="MMD"></a>
        <div class="mbc-brand"><span>MMD PRIVÉ</span><strong>Black Card</strong></div>
        <div class="mbc-pills"><span>Public reading</span><span>Private review</span><span>Founder approval only</span></div>
      </nav>
      <div class="mbc-hero-grid">
        <div class="mbc-copy">
          <p class="mbc-kicker">BLACK CARD</p>
          <h1>Reviewed.<br><span>Not sold.</span></h1>
          <p class="mbc-lead">Black Card is not purchased into existence. It is reviewed, verified, and quietly approved.</p>
          <p>Black Card คือสถานะสำหรับสมาชิกที่ MMD ตรวจประวัติ ความน่าเชื่อถือ และความเหมาะสมแล้วเท่านั้น หน้านี้เป็นหน้าอ่านข้อมูลแบบ public ไม่มีการจ่ายเงิน ไม่มีการเปิดสิทธิ์ทันที และไม่ต้อง login เพื่ออ่าน</p>
          <div class="mbc-actions"><a class="mbc-btn primary" href="${reviewHref}">ขอพิจารณา Black Card</a><a class="mbc-btn ghost" href="${statusHref}">ตรวจสถานะ</a></div>
        </div>
        <aside class="mbc-hero-panel"><span>Important</span><strong>สลิปไม่ใช่การอนุมัติ</strong><p>หลักฐานการโอนใช้เป็นข้อมูลประกอบเท่านั้น สถานะ paid, points, membership และ Black Card ต้องผ่านการตรวจยอดจริงและการอนุมัติจาก Boss Per ก่อน</p></aside>
      </div>
    </div>
  </section>

  <section id="blackcard-status" class="mbc-shell mbc-status">
    <article class="mbc-panel"><p class="mbc-kicker">PRIVATE STATUS</p><h2>ตรวจสถานะ</h2><p>กรอก access code, email, LINE ID หรือ token ที่ได้รับจาก MMD เพื่อดูสถานะล่าสุดแบบ read-only หน้านี้ไม่เพิ่ม points ไม่เปลี่ยนสมาชิก และไม่อนุมัติ Black Card เอง</p><form id="mbcStatusForm" class="mbc-form" autocomplete="off"><label for="mbcStatusInput">Access / Email / LINE ID</label><div><input id="mbcStatusInput" name="q" type="text" placeholder="code, email, LINE ID หรือ token"><button class="mbc-btn primary" type="submit">Check</button></div></form><div id="mbcStatusResult" class="mbc-result" aria-live="polite"><span>Ready</span><strong>ยังไม่ได้ตรวจสถานะ</strong><p>ผลลัพธ์จะแสดงจาก record ที่ตรวจแล้วผ่าน Worker หรือ Admin เท่านั้น</p></div></article>
    <div class="mbc-signal-grid"><article><span>01</span><strong>ประวัติที่ตรวจแล้ว</strong><p>ดูจาก membership history และ payment record ที่ยืนยันแล้วเท่านั้น</p></article><article><span>02</span><strong>ความน่าเชื่อถือ</strong><p>ดูความต่อเนื่องของการใช้งาน ความชัดเจน และพฤติกรรมโดยรวม</p></article><article><span>03</span><strong>อนุมัติด้วยคนจริง</strong><p>การตัดสินใจขั้นสุดท้ายเป็น manual approval โดย Boss Per</p></article></div>
  </section>

  <section class="mbc-shell mbc-split" id="review-request">
    <div class="mbc-text"><p class="mbc-kicker">PRIVATE REVIEW</p><h2>การพิจารณาเกิดขึ้นแบบเงียบ ๆ</h2><p>Black Card ไม่ได้ดูจากยอดโอนครั้งเดียว แต่ดูจากภาพรวมของสมาชิก ทั้งประวัติการเป็นสมาชิก ยอดที่ยืนยันแล้ว points, notes และความเหมาะสมของ access level</p><div class="mbc-stack"><div><span>Not instant</span><strong>ไม่อนุมัติอัตโนมัติ</strong></div><div><span>Not checkout</span><strong>ไม่ใช่หน้าจ่ายเงิน public</strong></div><div><span>Not by slip</span><strong>สลิปเป็นหลักฐานประกอบเท่านั้น</strong></div></div></div>
    <figure class="mbc-image"><img src="${assets.review}" alt="Private review desk"><figcaption><span>Review desk</span><strong>ข้อมูลถูกอ่านก่อน access ถูกเปิด</strong></figcaption></figure>
  </section>

  <section class="mbc-shell mbc-split reverse">
    <figure class="mbc-image tall"><img src="${assets.card}" alt="Black Card identity"></figure>
    <div class="mbc-text"><p class="mbc-kicker">THE CARD</p><h2>สถานะที่มีน้ำหนัก</h2><p>Black Card คือ private access layer สำหรับสมาชิกที่เหมาะกับการดูแลในระดับสูงกว่าเดิม ทั้ง privacy, priority, profile visibility และความต่อเนื่องของประวัติสมาชิก</p><div class="mbc-stack"><div><span>Priority</span><strong>ได้รับการพิจารณาก่อนเมื่อสถานะเหมาะสม</strong></div><div><span>Privacy</span><strong>ข้อมูลและ access ถูกคุมด้วย gate</strong></div><div><span>Continuity</span><strong>history และ points ถูกเก็บเป็น record</strong></div></div></div>
  </section>

  <section class="mbc-shell mbc-split">
    <div class="mbc-text"><p class="mbc-kicker">PAYMENT TRUTH</p><h2>ยอดจริงสำคัญกว่าสลิป</h2><p>สลิปหรือหลักฐานการโอนเป็นเพียง evidence การนับ points, membership state และ Black Card review จะเกิดขึ้นได้หลังจาก MMD ตรวจยอดจริงและ match กับ record แล้วเท่านั้น</p><div class="mbc-doctrine"><article><span>Evidence</span><strong>รับสลิปไว้ตรวจ</strong><p>ใช้เป็นข้อมูลประกอบ ไม่ใช่คำยืนยันสุดท้าย</p></article><article><span>Truth</span><strong>Verified funds only</strong><p>อ้างอิงยอดจริงในบัญชีหรือ payment dashboard</p></article><article><span>Decision</span><strong>Boss Per approval</strong><p>approval ไม่เปิดเองจากยอดหรือ points</p></article></div></div>
    <figure class="mbc-image"><img src="${assets.pay}" alt="SIGIL payment verification"></figure>
  </section>

  <section class="mbc-shell mbc-split reverse">
    <figure class="mbc-image"><img src="${assets.profile}" alt="Member profile and membership history"></figure>
    <div class="mbc-text"><p class="mbc-kicker">MEMBER PROFILE</p><h2>ทุกสถานะมีร่องรอย</h2><p>เมื่อข้อมูลถูกตรวจแล้ว สมาชิกสามารถดู profile, membership history, points และ Black Card review state ได้จาก member profile ของตัวเอง ข้อมูลที่ยังไม่ verified จะไม่ถูกนับเป็น points หรือสิทธิ์ใช้งานจริง</p><div class="mbc-profile-panel"><div><span>Status</span><strong id="mbcDemoStatus">Pending review</strong></div><div><span>Points</span><strong id="mbcDemoPoints">Verified only</strong></div><div><span>Approval</span><strong id="mbcDemoApproval">Boss Per only</strong></div></div><div class="mbc-actions"><a id="mbcProfileBtn" class="mbc-btn primary" href="${profileHref}">Open Member Profile</a><button id="mbcCopyProfileBtn" class="mbc-btn ghost" type="button">Copy Profile Link</button></div></div>
  </section>

  <section class="mbc-shell mbc-network">
    <img src="${assets.network}" alt="MMD Privé private network">
    <div><p class="mbc-kicker">MMD PRIVÉ NETWORK</p><h2>Access มีหลายชั้น</h2><p>Black Card อยู่ในระบบ access ที่ต้องอ่านข้อมูลหลายฝั่งพร้อมกัน ทั้งตัวตนสมาชิก payment verification, points, member profile และ private review state</p><div class="mbc-network-grid"><article><span>01</span><strong>Member identity</strong><p>ยืนยันตัวตนและช่องทางติดต่อ</p></article><article><span>02</span><strong>Verified payment</strong><p>ตรวจยอดจริงก่อนนับ points</p></article><article><span>03</span><strong>Review state</strong><p>Pending, Under Review, Approved หรือ Not Eligible</p></article><article><span>04</span><strong>Private access</strong><p>เปิดสิทธิ์หลัง approval เท่านั้น</p></article></div></div>
  </section>

  <section class="mbc-shell mbc-process"><p class="mbc-kicker">PROCESS</p><h2>เส้นทางการพิจารณา</h2><div class="mbc-process-grid"><article><span>1</span><strong>Request review</strong><p>สมาชิกส่งคำขอ หรือ MMD เปิด draft review จากข้อมูลที่มีอยู่</p></article><article><span>2</span><strong>Verify records</strong><p>ตรวจ membership history, payment record, points และ notes</p></article><article><span>3</span><strong>Hold decision</strong><p>ข้อมูลไม่ครบจะค้าง pending หรือ under review</p></article><article><span>4</span><strong>Approve manually</strong><p>อนุมัติเฉพาะเมื่อ Boss Per ตัดสินใจ</p></article></div></section>

  <section class="mbc-shell mbc-final"><div><p class="mbc-kicker">PUBLIC READING PAGE</p><h2>Reviewed. Verified. Quietly recognized.</h2><p>/blackcard เป็นหน้าอ่าน public เท่านั้น ไม่ redirect ไป login ไม่ redirect ไป payment และไม่เปิดสิทธิ์จากสลิป</p></div><div class="mbc-actions"><a class="mbc-btn primary" href="${statusHref}">ตรวจสถานะ</a><a class="mbc-btn ghost" href="${aliasHref}">Open Alias</a></div></section>
  <footer class="mbc-shell mbc-footer"><strong>MMD BLACK CARD</strong><span>© 2026 MMD Privé. Private review only.</span></footer>
</main>
<script>${blackcardScript()}</script>
</body>
</html>`;

  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-mmd-worker": FRONT_GATE,
      "x-mmd-front-gate": FRONT_GATE,
      "x-mmd-front-version": FRONT_VERSION,
      "x-mmd-page": PUBLIC_BLACKCARD_PAGE,
      "x-mmd-route-owner": FRONT_GATE,
      "x-mmd-origin": "front-gate:public-blackcard-review-safe"
    }
  });
}

function blackcardStyles() {
  return `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800;900&family=Noto+Sans+Thai:wght@400;500;600;700;800;900&display=swap');:root{color-scheme:dark}*{box-sizing:border-box}html{background:#050404;scroll-behavior:smooth}body{margin:0;min-height:100vh;background:#050404;color:#faf2df;font-family:"Noto Sans Thai",Inter,"Segoe UI",Arial,sans-serif;text-rendering:geometricPrecision;-webkit-font-smoothing:antialiased}.mbc{--gold:#d8b15f;--gold2:#f4dd95;--text:#faf2df;--muted:rgba(250,242,223,.72);--dim:rgba(250,242,223,.48);--line:rgba(216,177,95,.26);--soft:rgba(255,255,255,.13);--panel:rgba(12,11,9,.78);overflow:hidden;background:radial-gradient(circle at 14% 0%,rgba(216,177,95,.18),transparent 28rem),radial-gradient(circle at 92% 14%,rgba(111,75,22,.24),transparent 28rem),#050404}.mbc-shell{width:min(100% - 22px,1180px);margin:auto}.mbc-hero{position:relative;min-height:740px;display:flex;isolation:isolate;overflow:hidden}.mbc-hero-img{position:absolute;inset:0;z-index:-3;width:100%;height:100%;object-fit:cover;object-position:center top;filter:saturate(1.08) contrast(1.04) brightness(1.1)}.mbc-shade{position:absolute;inset:0;z-index:-2;background:linear-gradient(180deg,rgba(5,4,4,.08) 0%,rgba(5,4,4,.42) 42%,rgba(5,4,4,.96) 100%),linear-gradient(90deg,rgba(5,4,4,.78) 0%,rgba(5,4,4,.2) 100%)}.mbc-hero-shell{display:flex;flex-direction:column;justify-content:space-between;padding:18px 0 34px}.mbc-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.mbc-mark{width:48px;height:48px;display:grid;place-items:center;border:1px solid var(--line);border-radius:16px;color:#171006;background:linear-gradient(145deg,rgba(246,227,158,.94),rgba(185,135,49,.92));text-decoration:none;box-shadow:0 14px 38px rgba(216,177,95,.22);overflow:hidden}.mbc-mark img{width:72%;height:72%;object-fit:contain;filter:drop-shadow(0 5px 12px rgba(0,0,0,.24))}.mbc-brand{display:grid;gap:2px}.mbc-brand span,.mbc-kicker{margin:0;color:var(--gold2);font-family:Inter,"Noto Sans Thai",sans-serif;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;font-weight:850}.mbc-brand strong{font-family:Inter,"Noto Sans Thai",sans-serif;font-size:1.1rem;line-height:1.05;letter-spacing:-.02em}.mbc-pills{width:100%;display:flex;gap:7px;flex-wrap:wrap}.mbc-pills span{min-height:28px;display:inline-flex;align-items:center;justify-content:center;padding:7px 10px;border:1px solid var(--soft);border-radius:999px;color:var(--muted);background:rgba(10,9,8,.58);backdrop-filter:blur(16px);font-family:Inter,"Noto Sans Thai",sans-serif;font-size:.66rem;letter-spacing:.08em;text-transform:uppercase;font-weight:800}.mbc-hero-grid{display:grid;grid-template-columns:1fr;gap:16px;align-items:end;padding-top:250px}.mbc h1{margin:10px 0 12px;font-family:Inter,"Noto Sans Thai",sans-serif;font-size:clamp(3.05rem,15vw,4.85rem);line-height:.86;letter-spacing:-.075em;font-weight:900}.mbc h1 span{color:var(--gold2)}.mbc h2{margin:8px 0 12px;font-size:clamp(2rem,9vw,4.25rem);line-height:1;letter-spacing:-.055em;font-weight:850}.mbc p{margin:0;color:var(--muted);font-size:.98rem;line-height:1.72;font-weight:500}.mbc-lead{color:rgba(250,242,223,.9)!important;font-family:Inter,"Noto Sans Thai",sans-serif;font-size:clamp(1.05rem,3.8vw,1.36rem)!important;line-height:1.42!important}.mbc-hero-panel,.mbc-panel,.mbc-signal-grid article,.mbc-stack div,.mbc-doctrine article,.mbc-profile-panel div,.mbc-network-grid article,.mbc-process-grid article,.mbc-final,.mbc-image,.mbc-result{border:1px solid var(--line);background:linear-gradient(145deg,rgba(255,255,255,.075),rgba(255,255,255,.014)),var(--panel);box-shadow:0 24px 70px rgba(0,0,0,.3);backdrop-filter:blur(18px)}.mbc-hero-panel{display:grid;gap:8px;padding:16px;border-radius:24px}.mbc-hero-panel span,.mbc-result span,.mbc-stack span,.mbc-doctrine span,.mbc-profile-panel span,.mbc-network-grid span,.mbc-signal-grid span,.mbc-process-grid span,.mbc-image figcaption span{color:var(--dim);font-family:Inter,"Noto Sans Thai",sans-serif;font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;font-weight:800}.mbc-hero-panel span{color:var(--gold2)}.mbc-hero-panel strong{font-size:1.28rem;line-height:1.22}.mbc-actions{display:grid;grid-template-columns:1fr;gap:9px;margin-top:18px}.mbc-btn{min-height:48px;width:100%;display:inline-flex;align-items:center;justify-content:center;text-align:center;padding:13px 18px;border-radius:999px;border:1px solid var(--line);text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:Inter,"Noto Sans Thai",sans-serif;font-size:.88rem;font-weight:900;letter-spacing:.01em;line-height:1.05}.mbc-btn.primary{color:#171006;background:linear-gradient(135deg,#f7e6a8,#bd8730);box-shadow:0 16px 42px rgba(216,177,95,.24)}.mbc-btn.ghost{color:var(--text);background:rgba(255,255,255,.06)}.mbc-btn:active{transform:scale(.985)}.mbc-status,.mbc-split,.mbc-process{display:grid;gap:16px}.mbc-status,.mbc-split,.mbc-process,.mbc-final{margin-top:16px}.mbc-panel,.mbc-final{border-radius:30px;padding:18px;display:grid;gap:16px}.mbc-status h2{font-size:clamp(2.15rem,9vw,3.95rem);letter-spacing:-.045em}.mbc-form{display:grid;gap:8px}.mbc-form label{color:var(--dim);font-family:Inter,"Noto Sans Thai",sans-serif;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;font-weight:800}.mbc-form div{display:grid;grid-template-columns:1fr;gap:8px}.mbc-form input{width:100%;min-height:50px;padding:0 15px;color:var(--text);border:1px solid var(--soft);border-radius:999px;outline:none;background:rgba(255,255,255,.07);font-size:1rem}.mbc-form input::placeholder{color:rgba(250,242,223,.42)}.mbc-result{border-radius:18px;padding:14px;display:grid;gap:6px}.mbc-result.is-approved{border-color:rgba(244,221,149,.72);background:linear-gradient(145deg,rgba(216,177,95,.18),rgba(255,255,255,.02)),var(--panel)}.mbc-result strong,.mbc-stack strong,.mbc-doctrine strong,.mbc-profile-panel strong,.mbc-network-grid strong,.mbc-signal-grid strong,.mbc-process-grid strong{font-size:1rem;line-height:1.35}.mbc-signal-grid,.mbc-stack,.mbc-doctrine,.mbc-profile-panel,.mbc-network-grid,.mbc-process-grid{display:grid;grid-template-columns:1fr;gap:10px}.mbc-signal-grid article,.mbc-stack div,.mbc-doctrine article,.mbc-profile-panel div,.mbc-network-grid article,.mbc-process-grid article{border-radius:18px;padding:15px;display:grid;gap:6px}.mbc-text{display:flex;flex-direction:column;justify-content:center;min-width:0}.mbc-image{margin:0;overflow:hidden;border-radius:30px;min-height:320px;position:relative}.mbc-image img{width:100%;height:100%;min-height:320px;object-fit:cover;filter:saturate(1.06) contrast(1.04)}.mbc-image.tall img{min-height:440px}.mbc-image figcaption{position:absolute;left:14px;right:14px;bottom:14px;display:grid;gap:4px;padding:12px;border:1px solid var(--line);border-radius:16px;background:rgba(5,4,4,.7);backdrop-filter:blur(16px)}.mbc-network{position:relative;overflow:hidden;min-height:620px;border-radius:30px;border:1px solid var(--line);display:flex;align-items:end;isolation:isolate;margin-top:16px}.mbc-network>img{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover;object-position:center;filter:saturate(1.05) contrast(1.03) brightness(.92)}.mbc-network:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(5,4,4,.16) 0%,rgba(5,4,4,.9) 78%),linear-gradient(90deg,rgba(5,4,4,.82),rgba(5,4,4,.18))}.mbc-network>div{width:100%;padding:18px}.mbc-footer{display:flex;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-top:28px;padding:24px 0 40px;border-top:1px solid rgba(255,255,255,.1);color:rgba(250,242,223,.45)}.mbc-footer strong{color:var(--text)}@media(min-width:700px){.mbc-shell{width:min(100% - 32px,1180px)}.mbc-hero{min-height:780px}.mbc-hero-img{object-position:center;filter:saturate(1.1) contrast(1.04) brightness(1.13)}.mbc-shade{background:linear-gradient(90deg,rgba(5,4,4,.84) 0%,rgba(5,4,4,.5) 48%,rgba(5,4,4,.1) 100%),linear-gradient(180deg,rgba(5,4,4,.06) 0%,rgba(5,4,4,.84) 100%)}.mbc-hero-shell{padding:28px 0 48px}.mbc-top{flex-wrap:nowrap}.mbc-pills{width:auto;margin-left:auto;justify-content:flex-end}.mbc-hero-grid{grid-template-columns:minmax(0,1fr) minmax(260px,340px);gap:28px;padding-top:260px}.mbc h1{font-size:clamp(4.6rem,10vw,8.3rem)}.mbc-actions,.mbc-form div{display:flex;flex-wrap:wrap}.mbc-btn{width:auto;min-width:164px}.mbc-form input{flex:1 1 260px}.mbc-signal-grid,.mbc-doctrine,.mbc-profile-panel{grid-template-columns:repeat(3,minmax(0,1fr))}.mbc-network-grid,.mbc-process-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mbc-panel,.mbc-final,.mbc-network>div{padding:24px}}@media(min-width:980px){.mbc-status,.mbc-split{grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;align-items:stretch}.mbc-status{grid-template-columns:minmax(0,1.25fr) minmax(300px,.75fr)}.mbc-signal-grid{grid-template-columns:1fr}.mbc-split.reverse .mbc-image{order:0}.mbc-network{min-height:680px}.mbc-network>div{width:min(720px,100%);padding:34px}.mbc-process-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.mbc-final{grid-template-columns:minmax(0,1fr) auto;align-items:center}}`;
}

function blackcardScript() {
  return `(function(){const root=document.getElementById("mmd-blackcard");if(!root)return;const $=id=>root.querySelector("#"+id);const qs=new URLSearchParams(location.search);const access=String(qs.get("t")||qs.get("code")||qs.get("access")||"").trim();const statusApi=root.dataset.statusApi||"/api/blackcard/status";const profileUrl=root.dataset.profileUrl||"/sigil/member/profile";function esc(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;")}function link(t){const clean=String(t||"").trim();if(!clean)return profileUrl;return profileUrl+(profileUrl.includes("?")?"&":"?")+"t="+encodeURIComponent(clean)}function result(mode,title,body,label){const el=$("mbcStatusResult");if(!el)return;el.classList.remove("is-approved","is-pending");if(mode)el.classList.add(mode);el.innerHTML="<span>"+esc(label||"Status")+"</span><strong>"+esc(title)+"</strong><p>"+esc(body)+"</p>"}function demo(s,p,a){const se=$("mbcDemoStatus"),pe=$("mbcDemoPoints"),ae=$("mbcDemoApproval");if(se)se.textContent=s;if(pe)pe.textContent=p;if(ae)ae.textContent=a}function setProfile(t){const b=$("mbcProfileBtn");if(b)b.href=link(t)}async function check(q){q=String(q||"").trim();if(!q){result("is-pending","กรอกข้อมูลก่อนตรวจสถานะ","ใส่ access code, email, LINE ID หรือ token ที่ได้รับจาก MMD ก่อนครับ","Waiting");return}result("is-pending","กำลังตรวจสถานะ","กำลังส่งข้อมูลไปยัง Worker gate แบบ read-only หน้านี้ไม่เปลี่ยนสถานะใด ๆ","Checking");try{const u=new URL(statusApi,location.origin);u.searchParams.set("q",q);const r=await fetch(u.toString(),{headers:{accept:"application/json"}});if(!r.ok)throw new Error("not_ready");const d=await r.json();const st=String(d.status||d.review_status||"under_review").toLowerCase();const pts=d.points||d.verified_points||"Verified only";if(st==="approved"){result("is-approved","Black Card approved","สถานะผ่านการอนุมัติแล้ว เปิด Member Profile เพื่อดู points, history และ access ล่าสุด","Approved");demo("Approved",String(pts).includes("point")?String(pts):String(pts)+" points","Boss Per approved");setProfile(q);return}result("is-pending",st==="pending"||st==="under_review"?"Under review":"Manual review required","ยังไม่พบ approval ที่พร้อมใช้งาน ต้องให้ MMD ตรวจ record และ Boss Per ตัดสินใจขั้นสุดท้าย","Safe review");demo("Under review",String(pts),"Boss Per only");setProfile(q)}catch(e){result("is-pending","Manual review required","Worker ยังไม่ตอบหรือยังไม่มี record ที่ verified หน้านี้ไม่อนุมัติ Black Card เอง ให้ใช้ Airtable/Admin Console เป็น source of truth","Safe fallback");demo("Pending review","Verified only","Boss Per only");setProfile(q)}}function init(){const form=$("mbcStatusForm"),input=$("mbcStatusInput"),copy=$("mbcCopyProfileBtn");if(input&&access)input.value=access;if(access)setProfile(access);if(form&&input)form.addEventListener("submit",e=>{e.preventDefault();check(input.value)});if(copy)copy.addEventListener("click",async()=>{const token=input&&input.value?input.value:access;const value=new URL(link(token),location.origin).toString();try{await navigator.clipboard.writeText(value);copy.textContent="Copied";setTimeout(()=>copy.textContent="Copy Profile Link",1500)}catch(e){result("is-pending","Profile link ready",value,"Copy fallback")}});if(access)result("is-pending","Access token attached","กด Check เพื่อให้ Worker gate ตรวจสถานะล่าสุด โดยไม่เปลี่ยนสถานะใด ๆ จากหน้าเว็บ","Ready")}init()})();`;
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
