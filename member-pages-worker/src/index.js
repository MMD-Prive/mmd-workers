const WORKER = "member-pages-worker";
const VERSION = "20260626-membership-payment-v3";

const PAGE_PATHS = new Set([
  "/sigil/membership", "/sigil/membership/",
  "/member/membership", "/member/membership/",
  "/pay/membership", "/pay/membership/",
  "/pay/pending-verification", "/pay/pending-verification/",
  "/member/profile", "/member/profile/",
]);

const LIFF_IDENTIFY_PATHS = new Set([
  "/member/api/liff/identify",
  "/member/api/liff/identify/",
]);

const PACKAGES = [
  { key: "7days", aliases: ["7day", "7_days", "guest", "guestpass", "trial"], title: "7 Days Guest Pass", eyebrow: "TEMPORARY PREMIUM ACCESS", price: 1499, duration: "7 days", tier: "guest-pass", copy: "Temporary Premium Telegram access and public preview for a short review window. No Drive access." },
  { key: "standard", aliases: ["lite", "std"], title: "Standard Package", eyebrow: "STANDARD ACCESS", price: 1199, duration: "365 days", tier: "standard", copy: "Standard models, Standard Drive, Standard Telegram, and verified member status for one year." },
  { key: "premium", aliases: ["prem"], title: "Premium Package", eyebrow: "PREMIUM ACCESS", price: 2999, duration: "365 days", tier: "premium", copy: "Standard + Premium model visibility, Premium Telegram, and broader access after official verification." },
];

export function isMemberPagePath(url) {
  return PAGE_PATHS.has(url.pathname.toLowerCase());
}

export function isMembershipPath(url) {
  const p = url.pathname.toLowerCase();
  return p === "/member/membership" || p === "/member/membership/";
}

export function isLiffIdentifyPath(url) {
  return LIFF_IDENTIFY_PATHS.has(url.pathname.toLowerCase());
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (isLiffIdentifyPath(url)) return handleLiffIdentify(request, env);
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: headers("text/plain") });
    if (method !== "GET" && method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: headers("text/plain; charset=utf-8") });
    if (!isMemberPagePath(url)) return new Response("Not Found", { status: 404, headers: headers("text/plain; charset=utf-8") });

    const p = cleanPath(url.pathname);
    if (p === "/sigil/membership") return renderSigilMembership(request);
    if (p === "/pay/membership") return renderPay(request, env);
    if (p === "/pay/pending-verification") return renderPending(request);
    if (p === "/member/profile") return renderProfile(request);
    return renderMembership(request);
  },
};

export async function handleLiffIdentify(request, env = {}) {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: apiHeaders() });
  if (method !== "POST") {
    return liffJson({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, 405);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return liffJson({ ok: false, error: { code: "INVALID_INPUT", message: "valid JSON object required" } }, 400);
  }

  const lineUserId = clean(body.line_user_id || body.lineUserId || body.sub);
  if (!lineUserId) {
    return liffJson({ ok: false, error: { code: "LINE_USER_ID_REQUIRED", message: "line_user_id is required" } }, 400);
  }

  const entryRoute = normalizeEntryRoute(body.entry_route || body.entryRoute);
  const safeQuery = pickSafeQuery(body, new URL(request.url).searchParams);
  const status = identityStatusFor(entryRoute, safeQuery);
  const dashboardUnlock = dashboardUnlockFor(body, entryRoute, safeQuery);
  const nextRoute = buildNextRoute(entryRoute, safeQuery, dashboardUnlock);

  return liffJson({
    ok: true,
    data: {
      identity_status: status,
      next_route: nextRoute,
      dashboard_unlock: dashboardUnlock,
      review_required: status !== "linked",
      customer_safe_summary: {
        line_display_name: clean(body.line_display_name || body.lineDisplayName),
        line_picture_url: clean(body.line_picture_url || body.linePictureUrl),
        entry_route: entryRoute,
        identity_only: true,
      },
      materialization: {
        membership_active: false,
        points_awarded: false,
        payments_verified: false,
        entitlements_materialized: false,
        reason: "liff_identity_linking_only",
      },
      safe_next: {
        public_membership: appendSafeQuery("/member/membership", safeQuery),
        sigil_membership: appendSafeQuery("/sigil/membership", safeQuery),
        dashboard: dashboardUnlock.unlocked ? appendSafeQuery("/member/dashboard", safeQuery) : null,
        payment: appendSafeQuery("/pay/membership", safeQuery),
      },
    },
  });
}

export function renderMembership(request) {
  const url = new URL(request.url);
  const selected = normalizePlan(url.searchParams.get("plan") || url.searchParams.get("package"));
  const packageCards = PACKAGES.map((pkg) => membershipPackageCard(pkg, selected, url.search)).join("");
  return page(request, "member-membership", `
    ${nav(url.search)}
    <section class="hero membership-hero" aria-labelledby="membership-title">
      <div class="panel hero-panel">
        <p class="eyebrow">Member Package Selection</p>
        <h1 id="membership-title">Choose Your Access</h1>
        <p class="lead">เลือกแพ็กเกจสมาชิกก่อน แล้วค่อยไปหน้า payment เฉพาะแพ็กเกจที่ซื้อได้จริง สถานะจะเริ่มหลัง official verification เท่านั้น</p>
        <div class="steps"><span>Choose package</span><span>Transfer / proof</span><span>Official verification</span></div>
        <p class="fine">สลิปเป็น supporting evidence เท่านั้น ไม่ใช่การเปิดสถานะสมาชิกอัตโนมัติ และ points จะตามยอดที่ตรวจสอบแล้วเท่านั้น</p>
      </div>
      <aside class="panel side-card" id="blackcard-review">
        <p class="eyebrow">Black Card Review</p>
        <h2>ไม่ใช่แพ็กเกจที่ซื้อได้ทันที</h2>
        <p>Black Card เป็น private review status สำหรับเคสที่ผ่าน owner/founder approval เท่านั้น ไม่ควรถูกส่งเข้า payment ตรงจาก public page</p>
        <p class="actions"><a class="btn ghost" href="${attr(appendQuery("/blackcard", url.search))}">Read Black Card</a><a class="btn ghost" href="${attr(appendQuery("/member/dashboard", url.search))}">Member Login</a></p>
      </aside>
    </section>
    <section class="package-grid" aria-label="Available packages">${packageCards}</section>
    <section class="panel rule-panel"><p class="eyebrow">Route rule</p><h2>/member/membership = package selection</h2><p>/pay/membership = payment evidence page เฉพาะแพ็กเกจที่เลือกได้จริง ส่วน Black Card ต้องเริ่มจาก review ไม่ใช่ปุ่มจ่ายเงินตรง</p></section>
  `);
}

function renderSigilMembership(request) {
  const url = new URL(request.url);
  return page(request, "sigil-membership", `
    ${nav(url.search)}
    <section class="hero">
      <div class="panel hero-panel"><p class="eyebrow">SIGIL ACCESS CONDITIONS</p><h1>Renewal / Access</h1><p class="lead">หน้านี้คือเงื่อนไขการต่ออายุและการเข้าถึง ไม่ใช่ public checkout และไม่ใช่การยืนยันสถานะสมาชิกทันที</p><p>สถานะจริงอ้างอิงจาก ledger และ official verification เท่านั้น</p><p class="actions"><a class="btn" href="${attr(appendQuery("/member/membership", url.search))}">ดูแพ็กเกจสมาชิก</a><a class="btn ghost" href="${attr(appendQuery("/member/dashboard", url.search))}">Member Dashboard</a></p></div>
      <aside class="panel side-card"><p class="eyebrow">Private layer</p><h2>Black Card holder layer</h2><p>/sigil/blackcard เป็นชั้น private หลัง approval ไม่ใช่ public sales page</p></aside>
    </section>
  `);
}

function renderPay(request, env = {}) {
  const url = new URL(request.url);
  const rawPlan = String(url.searchParams.get("plan") || url.searchParams.get("package") || "").toLowerCase();
  if (rawPlan.includes("black") || rawPlan.includes("review")) return renderBlackCardPaymentBlocked(request);

  const plan = normalizePlan(rawPlan) || "standard";
  const pkg = getPackage(plan);
  const amount = positive(url.searchParams.get("amount")) || pkg.price;
  const apiBase = String(env.PAYMENTS_API_BASE || "https://payments-worker.malemodel-bkk.workers.dev").replace(/\/+$/, "");

  return page(request, "pay-membership", `
    ${nav(url.search)}
    <section class="hero payment-hero">
      <div class="panel hero-panel">
        <p class="eyebrow">Payment Evidence</p>
        <h1>Membership Payment</h1>
        <p class="lead">โอนเงินตามแพ็กเกจที่เลือก แล้วส่งหลักฐานเพื่อให้ทีมตรวจสอบอย่างเป็นทางการ</p>
        <div class="summary"><b>Package</b><span>${html(pkg.title)}</span><b>Amount</b><span>฿${money(amount)}</span><b>Duration</b><span>${html(pkg.duration)}</span><b>Status</b><span>Awaiting proof</span></div>
      </div>
      <aside class="panel side-card"><p class="eyebrow">Verification first</p><h2>Payment ≠ Activation</h2><p>การส่งสลิปยังไม่ใช่ paid truth. Access, Drive, Telegram, and points start only after official verification.</p></aside>
    </section>
    <section class="panel form-panel">
      <p class="eyebrow">Submit proof</p>
      <h2>ส่งหลักฐานการโอน</h2>
      <p>กรอก email/username และวางลิงก์สลิปหรือหลักฐาน ระบบจะสร้าง evidence record เป็น pending verification</p>
      <form id="payform" data-api="${attr(apiBase)}" data-plan="${attr(plan)}" data-amount="${attr(String(amount))}">
        <label>Member Email หรือ username<input name="member_email" value="${attr(url.searchParams.get("email") || "")}" autocomplete="email" /></label>
        <label>Session ID<input name="session_id" value="${attr(url.searchParams.get("session_id") || url.searchParams.get("sid") || "")}" placeholder="เว้นว่างได้ ระบบจะสร้างให้" /></label>
        <label>Slip URL / proof URL<input name="receipt_url" required placeholder="วางลิงก์รูปสลิปหรือหลักฐานการโอน" /></label>
        <label>Note<textarea name="notes" rows="3" placeholder="รายละเอียดเพิ่มเติม"></textarea></label>
        <button class="btn" type="submit">Submit for Verification</button>
      </form>
      <div id="payresult" class="notice" hidden></div>
    </section>
    <script>${paymentScript()}</script>
  `);
}

function renderBlackCardPaymentBlocked(request) {
  const url = new URL(request.url);
  return page(request, "blackcard-review-not-payment", `
    ${nav(url.search)}
    <section class="panel center hero-panel">
      <p class="eyebrow">Black Card Review</p>
      <h1>Not a direct payment route.</h1>
      <p class="lead">Black Card ไม่ใช่แพ็กเกจที่กดจ่ายแล้วเปิดสิทธิ์ทันที เส้นทางนี้ถูกกันไว้เพื่อป้องกันการชำระผิด flow</p>
      <p>กรุณาอ่าน public Black Card page และเริ่มจาก review ก่อน การชำระเงินหรือหลักฐานใด ๆ จะถูกใช้เป็น evidence หลังผ่านขั้นตอนที่ถูกต้องเท่านั้น</p>
      <p class="actions"><a class="btn" href="${attr(appendQuery("/blackcard", url.search))}">Back to Black Card</a><a class="btn ghost" href="${attr(appendQuery("/member/membership", url.search))}#blackcard-review">Review context</a></p>
    </section>
  `);
}

function renderPending(request) {
  const url = new URL(request.url);
  const ref = url.searchParams.get("payment_ref") || url.searchParams.get("transaction_ref") || "";
  const profile = appendQuery("/member/profile", url.search, { status: "pending_verification", payment_ref: ref });
  return page(request, "pay-pending-verification", `${nav(url.search)}<section class="panel center hero-panel"><p class="eyebrow">Pending Verification</p><h1>Evidence Received</h1><p class="lead">ระบบรับหลักฐานแล้ว แต่ยังไม่ถือว่า paid และยังไม่เปิด membership หรือ points จนกว่า official verification จะครบชุด</p><div class="summary"><b>Payment Ref</b><span>${html(ref || "Pending")}</span><b>Status</b><span>pending_verification</span><b>Rule</b><span>verified funds only</span></div><p class="actions"><a class="btn" href="${attr(profile)}">Continue to Profile</a><a class="btn ghost" href="${attr(appendQuery("/member/dashboard", url.search))}">Member Dashboard</a></p></section>`);
}

function renderProfile(request) {
  const url = new URL(request.url);
  const status = String(url.searchParams.get("status") || "pending_verification").toLowerCase();
  const verified = status === "verified" || status === "active";
  const plan = normalizePlan(url.searchParams.get("plan") || url.searchParams.get("package")) || "standard";
  const pkg = getPackage(plan);
  const amount = positive(url.searchParams.get("amount")) || pkg.price;
  const points = verified ? Math.floor(amount / 100) : 0;
  return page(request, "member-profile", `${nav(url.search)}<section class="panel center hero-panel"><p class="eyebrow">Member Profile</p><h1>${verified ? "Active Profile" : "Pending Profile"}</h1><p class="lead">Profile แสดง verified truth เท่านั้น หากเพิ่งส่งหลักฐาน โปรไฟล์จะอยู่ใน pending verification และยังไม่เพิ่ม points</p><div class="profile"><span>Membership Status</span><b>${verified ? "Active" : "Pending Verification"}</b><span>Package</span><b>${html(pkg.title)}</b><span>Payment Status</span><b>${verified ? "Verified" : "Evidence Received"}</b><span>Verified Points</span><b>${points} points</b><span>VIP Review</span><b>${points >= 120 ? "Eligible" : "Not yet"}</b><span>Black Card Consideration</span><b>${points >= 250 ? "Alert" : "Not yet"}</b></div><p class="actions"><a class="btn" href="${attr(appendQuery("/member/dashboard", url.search))}">Member Dashboard</a><a class="btn ghost" href="${attr(appendQuery("/member/membership", url.search, { plan }))}">Membership</a></p></section>`);
}

function membershipPackageCard(pkg, selected, query) {
  const href = appendQuery("/pay/membership", query, { plan: pkg.key, amount: pkg.price });
  return `<article class="pkg ${selected === pkg.key ? "on" : ""}"><div><p class="eyebrow">${html(pkg.eyebrow)}</p><h2>${html(pkg.title)}</h2><p>${html(pkg.copy)}</p><div class="mini"><span>${html(pkg.duration)}</span><span>${html(pkg.tier)}</span></div></div><div><p class="price">฿${money(pkg.price)}</p><a class="btn" href="${attr(href)}">เลือก ${html(pkg.title)}</a></div></article>`;
}

function nav(query) {
  return `<nav><a class="brand" href="${attr(appendQuery("/member/membership", query))}">MMD PRIVÉ</a><span><a href="${attr(appendQuery("/blackcard", query))}">Black Card</a><a href="${attr(appendQuery("/member/membership", query))}">Membership</a><a href="${attr(appendQuery("/member/dashboard", query))}">Dashboard</a></span></nav>`;
}

function page(request, slug, body) {
  const output = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD Privé | ${html(slug)}</title><style>${styles()}</style></head><body><main data-mmd-page="${attr(slug)}" data-mmd-version="${VERSION}">${body}<footer>Payment proof is evidence only. Verification opens access. Member ledger is the source of truth.</footer></main></body></html>`;
  return new Response(request.method.toUpperCase() === "HEAD" ? null : output, { status: 200, headers: { ...headers("text/html; charset=utf-8"), "x-mmd-page": slug, "cache-control": "no-store, no-cache, must-revalidate, max-age=0" } });
}

function headers(type) {
  return { "content-type": type, "x-mmd-worker": WORKER, "x-mmd-version": VERSION };
}

function apiHeaders() {
  return {
    ...headers("application/json; charset=utf-8"),
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "x-mmd-page": "liff-identity-bridge",
  };
}

function liffJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: apiHeaders() });
}

function clean(value) {
  return String(value || "").trim().slice(0, 300);
}

function normalizeEntryRoute(value) {
  const route = clean(value).toLowerCase().replace(/[^a-z0-9_/-]+/g, "_");
  if (route.includes("sigil")) return "sigil_membership";
  if (route.includes("dashboard")) return "dashboard";
  if (route.includes("pay") || route.includes("payment")) return "pay_membership";
  return "public_membership";
}

function pickSafeQuery(body, searchParams = new URLSearchParams()) {
  const safe = {};
  for (const key of ["t", "code", "promo"]) {
    const value = clean(body[key] || searchParams.get(key));
    if (value) safe[key] = value;
  }
  return safe;
}

function identityStatusFor(entryRoute, safeQuery) {
  if (entryRoute === "sigil_membership") return "review_required";
  if (safeQuery.t || safeQuery.code) return "possible_match";
  return "new_public_member";
}

function buildNextRoute(entryRoute, safeQuery, dashboardUnlock = { unlocked: false }) {
  if (entryRoute === "sigil_membership") return appendSafeQuery("/sigil/membership", safeQuery);
  if (entryRoute === "dashboard" && dashboardUnlock.unlocked) return appendSafeQuery("/member/dashboard", safeQuery);
  if (entryRoute === "dashboard") return appendSafeQuery("/member/membership", safeQuery);
  if (entryRoute === "pay_membership") return appendSafeQuery("/pay/membership", safeQuery);
  return appendSafeQuery("/member/membership", safeQuery);
}

function dashboardUnlockFor(body, entryRoute, safeQuery) {
  const sessionId = clean(body.session_id || body.sessionId || body.confirmed_session_id || body.confirmedSessionId);
  const jobId = clean(body.job_id || body.jobId || body.confirmed_job_id || body.confirmedJobId);
  const hasRealSession = truthy(body.first_real_session_exists || body.has_real_session || body.hasRealSession || body.confirmed_session_exists || body.confirmedSessionExists);
  const hasRealJob = truthy(body.first_real_job_exists || body.has_real_job || body.hasRealJob || body.confirmed_job_exists || body.confirmedJobExists);
  const status = clean(body.session_status || body.sessionStatus || body.job_status || body.jobStatus).toLowerCase();
  const deniedStatus = ["", "draft", "pending", "pending_verification", "membership", "identity_only", "lead", "review_required", "proof_received"];
  const evidenceId = sessionId || jobId;
  const unlocked = Boolean(evidenceId && (hasRealSession || hasRealJob) && !deniedStatus.includes(status));
  const holdingRoute = appendSafeQuery(entryRoute === "sigil_membership" ? "/sigil/membership" : "/member/membership", safeQuery);

  return {
    unlocked,
    holding_route: unlocked ? null : holdingRoute,
    reason: unlocked ? "first_real_job_or_session_exists" : "waiting_for_first_real_job_or_session",
  };
}

function truthy(value) {
  return value === true || value === 1 || String(value || "").toLowerCase() === "true" || String(value || "").toLowerCase() === "yes";
}

function appendSafeQuery(base, safeQuery = {}) {
  const params = new URLSearchParams();
  for (const key of ["t", "code", "promo"]) {
    if (safeQuery[key]) params.set(key, safeQuery[key]);
  }
  const rendered = params.toString();
  return rendered ? `${base}?${rendered}` : base;
}

function appendQuery(base, query, extra = {}) {
  const params = new URLSearchParams(query || "");
  Object.entries(extra).forEach(([k, v]) => { if (v != null && String(v).trim()) params.set(k, String(v)); });
  const rendered = params.toString();
  return rendered ? `${base}?${rendered}` : base;
}

function normalizePlan(value) {
  const plan = String(value || "").toLowerCase().trim().replace(/[^a-z0-9_/-]/g, "").replace(/\//g, "");
  for (const pkg of PACKAGES) {
    if (pkg.key === plan || pkg.aliases.includes(plan)) return pkg.key;
  }
  return "";
}

function getPackage(plan) {
  return PACKAGES.find((pkg) => pkg.key === plan) || PACKAGES[1];
}

function cleanPath(pathname) {
  return (pathname.toLowerCase().replace(/\/+$/, "") || "/");
}

function positive(value) {
  const n = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function money(value) {
  return new Intl.NumberFormat("th-TH").format(Number(value || 0));
}

function html(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function attr(value) {
  return html(value).replace(/"/g, "&quot;");
}

function paymentScript() {
  return `(function(){var f=document.getElementById("payform"),r=document.getElementById("payresult");if(!f||!r)return;function out(t){r.hidden=false;r.textContent=t;}function sid(){return "mem_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);}f.addEventListener("submit",function(e){e.preventDefault();var d=new FormData(f),api=f.getAttribute("data-api"),plan=f.getAttribute("data-plan"),amount=Number(f.getAttribute("data-amount")||0),sessionId=String(d.get("session_id")||"").trim()||sid();var payload={session_id:sessionId,payment_stage:"membership",payment_type:"membership",package_code:plan,amount:amount,member_email:String(d.get("member_email")||"").trim(),receipt_url:String(d.get("receipt_url")||"").trim(),notes:String(d.get("notes")||"").trim(),payment_method:"promptpay"};out("กำลังส่งหลักฐานเข้าระบบตรวจสอบ...");fetch(api+"/v1/pay/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).then(function(x){return x.json().catch(function(){return{}}).then(function(j){return{ok:x.ok,json:j}})}).then(function(o){if(!o.ok||!o.json||o.json.ok===false)throw new Error(o.json&&(o.json.error||o.json.message)||"payment_submit_failed");var ref=o.json.payment_ref||o.json.transaction_ref||"";var next=new URL("/pay/pending-verification",location.origin);new URLSearchParams(location.search||"").forEach(function(v,k){next.searchParams.set(k,v)});next.searchParams.set("status","pending_verification");next.searchParams.set("plan",plan);next.searchParams.set("amount",String(amount));next.searchParams.set("session_id",sessionId);if(ref)next.searchParams.set("payment_ref",ref);location.href=next.toString();}).catch(function(err){out("ส่งหลักฐานไม่สำเร็จ: "+(err&&err.message||err));});});})();`;
}

function styles() {
  return `:root{color-scheme:dark;--bg:#030201;--ink:#fff7e8;--muted:rgba(255,247,232,.64);--gold:#ffd98d;--gold2:#b98632;--line:rgba(255,216,151,.2);--panel:rgba(12,8,5,.76)}*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;min-height:100vh;background:radial-gradient(circle at 18% 0%,rgba(255,217,141,.22),transparent 34%),radial-gradient(circle at 88% 10%,rgba(185,134,50,.16),transparent 32%),linear-gradient(145deg,#030201,#130d08 52%,#040302);color:var(--ink);font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}main{width:min(1180px,calc(100% - 32px));margin:auto;padding:28px 0 46px}nav{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:26px}nav span{display:flex;gap:14px;flex-wrap:wrap}.brand,nav a{color:var(--gold);text-decoration:none;font-weight:950;letter-spacing:.04em}.hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);gap:18px;margin-bottom:18px}.panel,.pkg{border:1px solid var(--line);border-radius:30px;background:var(--panel);box-shadow:0 28px 90px rgba(0,0,0,.36);backdrop-filter:blur(16px);padding:clamp(24px,4vw,48px)}.hero-panel{background:radial-gradient(circle at 12% 0%,rgba(255,217,141,.13),transparent 32%),var(--panel)}.side-card{padding:30px}.eyebrow{margin:0 0 14px;color:var(--gold);font-size:12px;font-weight:950;letter-spacing:.22em;text-transform:uppercase}h1{margin:0 0 16px;font-size:clamp(46px,8vw,92px);line-height:.9;letter-spacing:-.065em}h2{margin:0 0 12px;font-size:clamp(28px,4vw,48px);line-height:.98;letter-spacing:-.035em}p{color:var(--muted);line-height:1.78}.lead{max-width:760px;color:#fff1cf;font-size:clamp(18px,2vw,24px)}.fine{color:#e4cba2}.steps,.summary,.profile,.mini{display:grid;gap:10px}.steps{grid-template-columns:repeat(3,minmax(0,1fr));margin:22px 0}.steps span,.summary>*,.profile>*,.mini span{border:1px solid rgba(255,216,151,.16);border-radius:17px;background:rgba(255,255,255,.055);padding:12px 14px;color:#fff2d4;font-weight:850}.package-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.pkg{min-height:360px;display:flex;flex-direction:column;justify-content:space-between}.pkg.on{border-color:var(--gold)}.price{margin:20px 0 12px;color:#fff;font-size:30px;font-weight:950}.mini{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:18px}.btn{min-height:46px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:0 18px;color:#140d05;background:linear-gradient(135deg,#fff0c7,var(--gold) 50%,var(--gold2));text-decoration:none;font-weight:950;border:0;cursor:pointer}.ghost{color:#fff3d8;background:rgba(255,255,255,.06);border:1px solid rgba(255,216,151,.26)}.actions{display:flex;gap:10px;flex-wrap:wrap}.summary{grid-template-columns:repeat(4,minmax(0,1fr));margin:20px 0}.profile{grid-template-columns:repeat(2,minmax(0,1fr));margin:20px 0}.form-panel{margin-top:18px}form{display:grid;gap:14px;max-width:760px}label{display:grid;gap:8px;color:#ffe7b7;font-weight:850}input,textarea{width:100%;border:1px solid rgba(255,216,151,.24);border-radius:16px;padding:14px 16px;color:#fff7e8;background:rgba(255,255,255,.065);font:inherit}.notice{margin-top:14px;padding:14px;border-radius:16px;background:rgba(255,255,255,.07)}.center{max-width:920px;margin:auto}.rule-panel{margin-top:16px}footer{margin-top:24px;color:#d9c39e;font-size:12px;line-height:1.7}@media(max-width:860px){main{width:min(100% - 24px,1180px)}nav{align-items:flex-start;flex-direction:column}.hero,.package-grid,.steps,.summary,.profile{grid-template-columns:1fr}.pkg{min-height:0}.btn{width:100%}}`;
}
