const WORKER = "member-pages-worker";
const VERSION = "20260801-sigil-member-membership-v3";
const CANONICAL_MEMBERSHIP_PATH = "/sigil/member/membership";
const LEGACY_MEMBERSHIP_PATH = "/member/membership";

// ROUTE LOCK
// /sigil/pay/membership and /pay/membership are membership payment routes.
// They must not be automatically routed to /sigil/pay/renewal by LIFF,
// member status, page script, or route recovery logic.
// Renewal can exist only as a manual legacy evidence page.

const PAGE_PATHS = new Set([
  CANONICAL_MEMBERSHIP_PATH, `${CANONICAL_MEMBERSHIP_PATH}/`,
  "/sigil/membership", "/sigil/membership/",
  "/sigil/pay/membership", "/sigil/pay/membership/",
  "/sigil/pay/renewal", "/sigil/pay/renewal/",
  "/member/membership", "/member/membership/",
  "/pay/membership", "/pay/membership/",
  "/pay/pending-verification", "/pay/pending-verification/",
  "/member/profile", "/member/profile/",
  "/member/dashboard", "/member/dashboard/",
]);

const LIFF_IDENTIFY_PATHS = new Set([
  "/member/api/liff/identify",
  "/member/api/liff/identify/",
]);

const PACKAGES = [
  { key: "7days", aliases: ["7day", "7_days", "guest", "guestpass", "trial"], title: "Trial · 7 Days Guest Pass", eyebrow: "TRIAL ACCESS", price: 1499, duration: "7-day access · 3-month booking window", tier: "guest-pass", copy: "เริ่มทดลองใช้สิทธิ์สมาชิก 7 วัน และเลือกนายแบบได้ถึงระดับ Premium หลังผ่านการตรวจสอบ" },
  { key: "standard", aliases: ["lite", "std"], title: "Standard Membership", eyebrow: "STANDARD ACCESS", price: 1199, duration: "365 days", tier: "standard", copy: "สิทธิ์สมาชิกสำหรับเริ่มต้นใช้งาน MMD อย่างต่อเนื่อง หลังผ่านการตรวจสอบอย่างเป็นทางการ" },
  { key: "premium", aliases: ["prem"], title: "Premium Membership", eyebrow: "PREMIUM ACCESS", price: 2999, duration: "365 days", tier: "premium", copy: "สิทธิ์ที่กว้างขึ้นสำหรับการคัดเลือกและการดูแลที่ละเอียดกว่า หลังผ่านการตรวจสอบอย่างเป็นทางการ" },
];

export function isMemberPagePath(url) {
  return PAGE_PATHS.has(url.pathname.toLowerCase());
}

export function isMembershipPath(url) {
  const p = url.pathname.toLowerCase();
  return p === CANONICAL_MEMBERSHIP_PATH || p === `${CANONICAL_MEMBERSHIP_PATH}/`;
}

function isLegacyMembershipPath(url) {
  const p = url.pathname.toLowerCase();
  return p === LEGACY_MEMBERSHIP_PATH || p === `${LEGACY_MEMBERSHIP_PATH}/`;
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
    if (isLegacyMembershipPath(url)) return redirectToCanonicalMembership(request);

    const p = cleanPath(url.pathname);
    if (p === "/sigil/membership") return renderSigilMembership(request);
    if (p === "/sigil/pay/membership") return renderSigilPayMembershipSafety(request);
    if (p === "/sigil/pay/renewal") return renderRenewalLegacySafety(request);
    if (p === "/pay/membership") return renderPay(request, env);
    if (p === "/pay/pending-verification") return renderPending(request);
    if (p === "/member/profile") return renderProfile(request);
    if (p === "/member/dashboard") return renderMemberDashboard(request);
    return renderMembership(request);
  },
};

export async function handleLiffIdentify(request, env = {}) {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") return new Response(null, { status: 204, headers: apiHeaders() });
  if (method !== "POST") return liffJson({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, 405);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return liffJson({ ok: false, error: { code: "INVALID_INPUT", message: "valid JSON object required" } }, 400);
  }

  const lineUserId = clean(body.line_user_id || body.lineUserId || body.sub);
  if (!lineUserId) return liffJson({ ok: false, error: { code: "LINE_USER_ID_REQUIRED", message: "line_user_id is required" } }, 400);

  const entryRoute = normalizeEntryRoute(body.entry_route || body.entryRoute || body.intent);
  const safeQuery = pickSafeQuery(body, new URL(request.url).searchParams);
  const membership = await resolveMembershipState({ env, lineUserId, entryRoute, safeQuery });
  const status = identityStatusFor(entryRoute, safeQuery);
  const dashboardUnlock = dashboardUnlockFor(membership, entryRoute, safeQuery);
  const nextRoute = buildNextRoute(entryRoute, safeQuery, dashboardUnlock, membership);

  return liffJson({
    ok: true,
    data: {
      intent: entryRoute,
      identity_status: status,
      membership_state: membership.membership_state,
      package_state: membership.package_state,
      rich_menu_target: richMenuTargetFor(membership),
      next_route: nextRoute,
      dashboard_unlock: dashboardUnlock,
      review_required: status !== "linked",
      auto_renewal_route_disabled: true,
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
        public_membership: appendSafeQuery(CANONICAL_MEMBERSHIP_PATH, safeQuery),
        sigil_membership: appendSafeQuery("/sigil/membership", safeQuery),
        dashboard: dashboardUnlock.unlocked ? appendSafeQuery("/member/dashboard", safeQuery) : null,
        payment: appendSafeQuery("/pay/membership", safeQuery),
        sigil_payment: appendSafeQuery("/sigil/pay/membership", safeQuery),
        renewal: null,
        booking: canUsePrivateRoute(membership) ? appendSafeQuery("/sigil/booking", safeQuery) : null,
        pending_verification: appendSafeQuery("/pay/pending-verification", safeQuery),
      },
    },
  });
}

function normalizeEntryRoute(value) {
  const route = clean(value).toLowerCase().replace(/[^a-z0-9_/-]+/g, "_");
  if (route === "member_status" || route.includes("status")) return "member_status";
  if (route === "renewal" || route === "renew" || route.includes("renewal")) return "membership_review";
  if (route === "booking_request" || route.includes("booking")) return "booking_request";
  if (route === "public_membership" || route.includes("public_membership")) return "public_membership";
  if (route === "sigil_membership" || route.includes("sigil")) return "sigil_membership";
  if (route.includes("dashboard")) return "dashboard";
  if (route.includes("pay") || route.includes("payment")) return "pay_membership";
  return "public_membership";
}

function buildNextRoute(entryRoute, safeQuery, dashboardUnlock = { unlocked: false }, membership = defaultMembershipState()) {
  if (entryRoute === "sigil_membership") return appendSafeQuery("/sigil/membership", safeQuery);
  if (entryRoute === "dashboard" && dashboardUnlock.unlocked) return appendSafeQuery("/member/dashboard", safeQuery);
  if (entryRoute === "dashboard") return appendSafeQuery(CANONICAL_MEMBERSHIP_PATH, safeQuery);
  if (entryRoute === "pay_membership") return appendSafeQuery("/pay/membership", safeQuery);
  if (entryRoute === "member_status") return routeForMemberStatus(membership, safeQuery);
  if (entryRoute === "membership_review") return appendSafeQuery(CANONICAL_MEMBERSHIP_PATH, safeQuery);
  if (entryRoute === "booking_request") return routeForBooking(membership, safeQuery);
  return appendSafeQuery(CANONICAL_MEMBERSHIP_PATH, safeQuery);
}

function routeForMemberStatus(membership, safeQuery) {
  if (canUsePrivateRoute(membership)) return appendSafeQuery("/member/profile", safeQuery, { status: "active" });
  return appendSafeQuery(CANONICAL_MEMBERSHIP_PATH, safeQuery);
}

function routeForBooking(membership, safeQuery) {
  if (canUsePrivateRoute(membership)) return appendSafeQuery("/sigil/booking", safeQuery);
  return appendSafeQuery(CANONICAL_MEMBERSHIP_PATH, safeQuery);
}

function redirectToCanonicalMembership(request) {
  const source = new URL(request.url);
  const target = new URL(source.toString());
  target.pathname = CANONICAL_MEMBERSHIP_PATH;
  const response = Response.redirect(target.toString(), 301);
  if (request.method.toUpperCase() !== "HEAD") return response;
  return new Response(null, { status: response.status, headers: response.headers });
}

function renderMembership(request) {
  const url = new URL(request.url);
  const selected = normalizePlan(url.searchParams.get("plan") || url.searchParams.get("package"));
  const packageCards = PACKAGES.map((pkg) => membershipPackageCard(pkg, selected, url.search)).join("");
  return page(request, "member-membership", `${nav(url.search)}
    <section class="hero membership-hero">
      <div class="panel hero-panel membership-intro">
        <p class="eyebrow">MMD PRIVÉ MEMBERSHIP</p>
        <h1>Choose your<br>Privé Access</h1>
        <p class="lead">เลือกสิทธิ์ที่เหมาะกับคุณ แล้วส่งหลักฐานเพื่อให้ MMD ตรวจสอบ สถานะสมาชิกจะเริ่มเมื่อได้รับการยืนยันอย่างเป็นทางการเท่านั้น</p>
        <div class="steps" aria-label="Membership verification steps">
          <span><b>01</b>Choose package</span>
          <span><b>02</b>Transfer &amp; proof</span>
          <span><b>03</b>Official verification</span>
        </div>
        <p class="fine proof-note">สลิปเป็นหลักฐานประกอบการตรวจสอบ ไม่ได้เปิดสถานะสมาชิกโดยอัตโนมัติ</p>
      </div>
      <aside class="panel side-card blackcard-note">
        <p class="eyebrow">BLACK CARD NOTE</p>
        <h2>ไม่ใช่แพ็กเกจที่กดซื้อได้ทันที</h2>
        <p>Black Card เป็นสถานะ private review สำหรับสมาชิกที่ผ่านการพิจารณาและอนุมัติโดย Founder เท่านั้น</p>
        <div class="actions stacked-actions">
          <a class="btn ghost" href="${attr(appendQuery("/blackcard/black-card", url.search))}">อ่านรายละเอียด Black Card</a>
          <a class="text-link" href="${attr(appendQuery("/member/dashboard", url.search))}">เข้าสู่ Member Dashboard <span aria-hidden="true">↗</span></a>
        </div>
      </aside>
    </section>
    <section class="packages-section" aria-labelledby="membership-packages-title">
      <div class="section-heading">
        <div><p class="eyebrow">MEMBERSHIP OPTIONS</p><h2 id="membership-packages-title">เริ่มจากสิทธิ์ที่พอดีกับคุณ</h2></div>
        <p>Trial, Standard และ Premium เป็นแพ็กเกจที่สมัครได้จริง โดยทุกแพ็กเกจต้องผ่าน official verification</p>
      </div>
      <div class="package-grid">${packageCards}</div>
    </section>
    <section class="assurance-strip" aria-label="Membership safeguards">
      <span>Private by design</span><span>Official verification</span><span>Member ledger protected</span>
    </section>`);
}

function renderSigilMembership(request) {
  const url = new URL(request.url);
  return page(request, "sigil-membership", `${nav(url.search)}
    <section class="hero sigil-membership-hero">
      <div class="panel hero-panel membership-intro">
        <p class="eyebrow">SIGIL MEMBERSHIP REVIEW</p>
        <h1>Renewal / Access Conditions</h1>
        <p class="lead">หน้านี้ใช้ทบทวนเงื่อนไขสมาชิกและการต่ออายุ ไม่ใช่หน้า checkout และไม่ยืนยันสถานะจากหลักฐานเพียงอย่างเดียว</p>
        <p>Trial, Standard และ Premium จะเริ่มหรือกลับมาใช้งานได้หลัง official verification จากข้อมูลสมาชิกจริงเท่านั้น</p>
        <div class="actions"><a class="btn" href="${attr(appendQuery(CANONICAL_MEMBERSHIP_PATH, url.search))}">ดูแพ็กเกจสมาชิก</a><a class="btn ghost" href="${attr(appendQuery("/member/dashboard", url.search))}">Member Dashboard</a></div>
      </div>
      <aside class="panel side-card blackcard-note">
        <p class="eyebrow">PRIVATE CONSIDERATION</p>
        <h2>Black Card remains invitation-led.</h2>
        <p>Black Card อยู่ในขั้น private consideration/review หลังการอนุมัติ ไม่ใช่แพ็กเกจสำหรับชำระตรง</p>
      </aside>
    </section>`);
}

function renderSigilPayMembershipSafety(request) {
  const url = new URL(request.url);
  return page(request, "sigil-pay-membership-safety", `${nav(url.search)}<section class="hero payment-hero"><div class="panel hero-panel"><p class="eyebrow">SIGIL PAYMENT ROUTE LOCK</p><h1>Membership Payment</h1><p class="lead">เส้นทางนี้ถูกล็อกเป็น membership payment route และจะไม่ถูกส่งไป renewal อัตโนมัติ</p><p>ถ้าหน้า Webflow ถูกผูกไว้ที่ /sigil/pay/membership ให้ Cloudflare route หลัก pass-through ไป Webflow ได้โดยไม่ใช้ renewal logic</p><p class="actions"><a class="btn" href="${attr(appendQuery("/pay/membership", url.search))}">Fallback Payment Page</a><a class="btn ghost" href="${attr(appendQuery(CANONICAL_MEMBERSHIP_PATH, url.search))}">Package Selection</a></p></div><aside class="panel side-card"><p class="eyebrow">Guarded</p><h2>No auto renewal redirect.</h2><p>ระบบ identity / status จะไม่ส่งหน้านี้ไป /sigil/pay/renewal อีก</p></aside></section>`);
}

function renderRenewalLegacySafety(request) {
  const url = new URL(request.url);
  return page(request, "sigil-pay-renewal-manual-only", `${nav(url.search)}<section class="hero payment-hero"><div class="panel hero-panel"><p class="eyebrow">Manual Legacy Route</p><h1>Renewal route is manual only</h1><p class="lead">หน้านี้ไม่ใช่ fallback อัตโนมัติของ payment membership แล้ว ถ้าลูกค้าเข้ามาผิดทางให้กลับไปหน้าเลือกแพ็กเกจหรือ payment membership</p><p class="actions"><a class="btn" href="${attr(appendQuery("/sigil/pay/membership", url.search))}">ไป Membership Payment</a><a class="btn ghost" href="${attr(appendQuery(CANONICAL_MEMBERSHIP_PATH, url.search))}">เลือกแพ็กเกจ</a></p></div><aside class="panel side-card"><p class="eyebrow">Guarded</p><h2>ไม่เปิดสิทธิ์อัตโนมัติ</h2><p>Renewal evidence ต้องเกิดจากเจตนาชัดเจนเท่านั้น ไม่ใช่ default redirect</p></aside></section>`);
}

function renderPay(request, env = {}) {
  const url = new URL(request.url);
  const rawPlan = String(url.searchParams.get("plan") || url.searchParams.get("package") || "").toLowerCase();
  if (rawPlan.includes("black") || rawPlan.includes("review")) return renderBlackCardPaymentBlocked(request);
  const plan = normalizePlan(rawPlan) || "standard";
  const pkg = getPackage(plan);
  const amount = positive(url.searchParams.get("amount")) || pkg.price;
  const apiBase = String(env.PAYMENTS_API_BASE || "https://payments-worker.malemodel-bkk.workers.dev").replace(/\/+$/, "");
  return page(request, "pay-membership", `${nav(url.search)}<section class="hero payment-hero"><div class="panel hero-panel"><p class="eyebrow">Payment Evidence</p><h1>Membership Payment</h1><p class="lead">โอนเงินตามแพ็กเกจที่เลือก แล้วส่งหลักฐานให้ทีมตรวจสอบ สถานะจะไม่ active จนกว่า official verification จะสำเร็จ</p><div class="summary"><b>Package</b><span>${html(pkg.title)}</span><b>Amount</b><span>${money(amount)} THB</span><b>Verification</b><span>Official review required</span></div></div><aside class="panel side-card"><p class="eyebrow">Safe payment route</p><h2>Proof is not activation.</h2><p>เส้นทางนี้สร้าง payment intent เท่านั้น ไม่เปิด membership, points, package, access, or dashboard จากสลิปเพียงอย่างเดียว</p></aside></section><section class="panel form-panel"><p class="eyebrow">Submit payment proof</p><h2>ส่งหลักฐานสมัครสมาชิก</h2><form id="payform" data-api="${attr(apiBase)}" data-plan="${attr(plan)}" data-amount="${attr(amount)}"><label>Member Email หรือ username<input name="member_email" value="${attr(url.searchParams.get("email") || "")}" autocomplete="email" /></label><label>Payment Reference<input name="session_id" value="${attr(url.searchParams.get("session_id") || url.searchParams.get("sid") || "")}" placeholder="เว้นว่างได้ ระบบจะสร้าง evidence id" /></label><label>Slip URL / proof URL<input name="receipt_url" required placeholder="วางลิงก์รูปสลิปหรือหลักฐานการโอน" /></label><label>Note<textarea name="notes" rows="3" placeholder="รายละเอียดเพิ่มเติม"></textarea></label><button class="btn" type="submit">Submit Payment Evidence</button></form><div id="payresult" class="notice" hidden></div></section><script>${paymentScript("membership")}</script>`);
}

function renderPending(request) {
  const url = new URL(request.url);
  return page(request, "pay-pending-verification", `${nav(url.search)}<section class="hero"><div class="panel hero-panel"><p class="eyebrow">Pending Verification</p><h1>รอตรวจสอบหลักฐาน</h1><p class="lead">ทีมได้รับรายการแล้ว การเปิดสิทธิ์จะเกิดหลัง official verification เท่านั้น</p><div class="summary"><b>Package</b><span>${html(url.searchParams.get("plan") || url.searchParams.get("package") || "membership")}</span><b>Amount</b><span>${html(url.searchParams.get("amount") || "")}</span><b>Status</b><span>pending verification</span></div></div></section>`);
}


function renderMemberDashboard(request) {
  const html = \`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>MMD Privé | Member Dashboard</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#080807;color:#fff8e9;font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}.mmd-dashboard{min-height:100vh;padding:24px;background:radial-gradient(circle at 85% 0,#34240d 0,transparent 38%),#080807}.mmd-dashboard__inner{width:min(960px,100%);margin:auto}.eyebrow{color:#f3d889;font-size:12px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.mmd-dashboard h1{margin:10px 0 8px;font-size:clamp(42px,9vw,82px);line-height:.95;letter-spacing:-.05em}.muted{color:#cfc6b5;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:26px}.panel{padding:20px;border:1px solid rgba(241,211,137,.23);border-radius:22px;background:rgba(255,255,255,.06);box-shadow:0 18px 50px rgba(0,0,0,.2)}.label{color:#bcb3a2;font-size:12px}.value{margin-top:7px;color:#fff8e9;font-size:clamp(24px,5vw,42px);font-weight:850}.badge{display:inline-flex;margin-top:7px;padding:8px 12px;border-radius:999px;color:#120d05;background:#f3d889;font-weight:850}.state{color:#f3d889}.history{margin-top:12px;padding-left:18px;color:#ddd3c1;line-height:1.8}#error{display:none;color:#ffcfb0}.skeleton{opacity:.7}@media(max-width:680px){.mmd-dashboard{padding:18px}.grid{grid-template-columns:1fr 1fr}.panel:last-child{grid-column:1/-1}}</style></head><body><main class="mmd-dashboard"><div class="mmd-dashboard__inner"><p class="eyebrow">MMD PRIVÉ · MEMBER STATUS</p><h1>My MMD</h1><p id="hello" class="muted skeleton">กำลังตรวจสอบสถานะสมาชิกจากระบบ MMD…</p><p id="error"></p><section class="grid" aria-live="polite"><article class="panel"><div class="label">Points</div><div id="points" class="value">—</div><p class="muted">คะแนนที่ระบบยืนยันแล้ว</p></article><article class="panel"><div class="label">Membership</div><div id="tier" class="badge">กำลังตรวจสอบ</div><p id="membership-status" class="muted">สถานะกำลังตรวจสอบ</p></article><article class="panel"><div class="label">Recent activity</div><ul id="history" class="history"><li>กำลังโหลดข้อมูล</li></ul></article></section></div></main><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>(async function(){var id="2010298002-mbx9kqQn";var set=function(id,text){var e=document.getElementById(id);if(e)e.textContent=text};var showError=function(text){set("error",text);var e=document.getElementById("error");if(e)e.style.display="block"};try{await liff.init({liffId:id});if(!liff.isLoggedIn()){liff.login({redirectUri:window.location.href});return}var token=liff.getIDToken();if(!token)throw new Error("LINE identity token unavailable");var start=await fetch("/member/api/liff/start",{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({id_token:token,intent:"status",liff_intent:"status"})});if(!start.ok)throw new Error("เริ่มตรวจสอบสมาชิกไม่สำเร็จ");var profile=await fetch("/member/api/liff/profile",{credentials:"include"});var payload=await profile.json();if(!profile.ok||!payload.ok)throw new Error(payload&&payload.error&&payload.error.message||"ยังไม่พบข้อมูลสมาชิกที่ยืนยันแล้ว");var data=payload.data||{};set("hello",(data.profile&&data.profile.display_name||"สมาชิก MMD")+" · ข้อมูลล่าสุดจากระบบที่ยืนยันแล้ว");set("points",String(data.profile&&data.profile.points||0)+" pts");set("tier",data.profile&&data.profile.tier||"Member");var status=data.profile&&data.profile.membership_status||"under_review";set("membership-status",status==="active"?"สถานะใช้งานอยู่":status==="grace"?"อยู่ในช่วงผ่อนผัน":status==="expired"?"สมาชิกหมดอายุ":"อยู่ระหว่างตรวจสอบ");var list=document.getElementById("history");if(list){list.innerHTML="";(data.profile&&data.profile.history||[]).slice(0,5).forEach(function(item){var li=document.createElement("li");li.textContent=item.date+" · "+item.title+(item.type==="points"&&item.points_delta!=null?" · "+(item.points_delta>0?"+":"")+item.points_delta+" pts":"");list.appendChild(li)});if(!list.children.length){var li=document.createElement("li");li.textContent="ยังไม่มีรายการล่าสุด";list.appendChild(li)}}}catch(error){showError(error&&error.message||"ระบบตรวจสอบสมาชิกยังไม่พร้อม กรุณาลองใหม่อีกครั้ง");set("hello","ยังไม่สามารถยืนยันสถานะได้");}})();</script></body></html>\`;
  return htmlResponse(request, "member-dashboard", html);
}

function renderProfile(request) {
  const url = new URL(request.url);
  return page(request, "member-profile", `${nav(url.search)}<section class="hero"><div class="panel hero-panel"><p class="eyebrow">Member Profile</p><h1>Member Status</h1><p class="lead">หน้านี้แสดงสถานะสมาชิกหลังตรวจสอบจาก ledger และระบบจริง</p><p class="actions"><a class="btn" href="${attr(appendQuery("/member/dashboard", url.search))}">Dashboard</a><a class="btn ghost" href="${attr(appendQuery(CANONICAL_MEMBERSHIP_PATH, url.search))}">Membership</a></p></div></section>`);
}

function renderBlackCardPaymentBlocked(request) {
  const url = new URL(request.url);
  return page(request, "blackcard-payment-blocked", `${nav(url.search)}<section class="hero"><div class="panel hero-panel"><p class="eyebrow">Black Card Review</p><h1>Payment blocked</h1><p class="lead">Black Card ต้องผ่าน owner/founder approval ก่อน ไม่ใช่การกดจ่ายตรง</p><p class="actions"><a class="btn" href="${attr(appendQuery("/blackcard", url.search))}">Read Black Card</a><a class="btn ghost" href="${attr(appendQuery(CANONICAL_MEMBERSHIP_PATH, url.search))}">Back to Membership</a></p></div></section>`);
}

function membershipPackageCard(pkg, selected, query) {
  const isSelected = selected === pkg.key;
  const payUrl = appendQuery("/pay/membership", query, { plan: pkg.key, amount: pkg.price });
  return `<article class="panel package membership-card${isSelected ? " selected" : ""}"${isSelected ? ' aria-current="true"' : ""}><div><p class="eyebrow">${html(pkg.eyebrow)}</p><h3>${html(pkg.title)}</h3><p>${html(pkg.copy)}</p></div><div class="package-footer"><p class="price"><span>${money(pkg.price)}</span> THB</p><p class="fine">${html(pkg.duration)}</p><p class="actions"><a class="btn" href="${attr(payUrl)}">เลือกแพ็กเกจนี้ <span aria-hidden="true">→</span></a></p></div></article>`;
}

function nav(query = "") {
  return `<nav><a class="brand" href="${attr(appendQuery(CANONICAL_MEMBERSHIP_PATH, query))}">MMD PRIVÉ</a><span><a href="${attr(appendQuery("/blackcard", query))}">Black Card</a><a href="${attr(appendQuery(CANONICAL_MEMBERSHIP_PATH, query))}">Membership</a><a href="${attr(appendQuery("/member/dashboard", query))}">Dashboard</a></span></nav>`;
}

function page(request, slug, body) {
  const output = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>MMD Privé | ${html(slug)}</title><style>${styles()}</style></head><body><main data-mmd-page="${attr(slug)}" data-mmd-version="${VERSION}">${body}<footer>Payment proof is evidence only. Verification opens access. Member ledger is the source of truth. Auto renewal routing is disabled.</footer></main></body></html>`;
  return new Response(request.method.toUpperCase() === "HEAD" ? null : output, { status: 200, headers: { ...headers("text/html; charset=utf-8"), "x-mmd-page": slug, "x-mmd-version": VERSION, "x-mmd-auto-renewal-route": "disabled", "cache-control": "no-store, no-cache, must-revalidate, max-age=0" } });
}

function headers(type) {
  return { "content-type": type, "x-mmd-worker": WORKER, "x-mmd-version": VERSION };
}

function apiHeaders() {
  return { ...headers("application/json; charset=utf-8"), "cache-control": "no-store, no-cache, must-revalidate, max-age=0", "access-control-allow-origin": "*", "access-control-allow-methods": "POST,OPTIONS", "access-control-allow-headers": "content-type, authorization", "x-mmd-page": "liff-identity-bridge", "x-mmd-auto-renewal-route": "disabled" };
}

function liffJson(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: apiHeaders() }); }
function clean(value) { return String(value || "").trim().slice(0, 300); }
function pickSafeQuery(body, searchParams = new URLSearchParams()) { const safe = {}; for (const key of ["t", "code", "promo"]) { const value = clean(body[key] || searchParams.get(key)); if (value) safe[key] = value; } return safe; }
function identityStatusFor(entryRoute, safeQuery) { if (entryRoute === "sigil_membership") return "review_required"; if (safeQuery.t || safeQuery.code) return "possible_match"; return "new_public_member"; }
function dashboardUnlockFor(membership, entryRoute, safeQuery) { const liveStatuses = new Set(["confirmed", "en_route", "arrived", "met", "work_started", "completed"]); const sessionStatus = clean(membership.first_session_status || membership.session_status || membership.job_status).toLowerCase(); const unlocked = Boolean(membership.trusted && truthy(membership.has_first_job) && liveStatuses.has(sessionStatus)); const holdingRoute = appendSafeQuery(CANONICAL_MEMBERSHIP_PATH, safeQuery); return { unlocked, holding_route: unlocked ? null : holdingRoute, reason: unlocked ? "first_real_job_or_session_exists" : "waiting_for_first_real_job_or_session" }; }
async function resolveMembershipState({ env, lineUserId, entryRoute, safeQuery }) { const fallback = defaultMembershipState(); const resolver = env?.MEMBER_STATUS_RESOLVER; if (!resolver?.fetch) return fallback; try { const response = await resolver.fetch(new Request("https://member-status-resolver.local/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ line_user_id: lineUserId, intent: entryRoute, safe_query: safeQuery }) })); const payload = await response.json().catch(() => ({})); if (!response.ok || payload?.ok === false) return { ...fallback, membership_state: "review_required" }; const data = payload?.data && typeof payload.data === "object" ? payload.data : payload; return { trusted: true, membership_state: normalizeMembershipState(data.membership_state || data.membershipStatus || data.member_status), package_state: normalizePackageState(data.package_state || data.packageStatus), has_first_job: truthy(data.has_first_job || data.hasFirstJob || data.first_real_job_exists || data.firstRealJobExists), first_session_status: clean(data.first_session_status || data.firstSessionStatus || data.session_status || data.job_status).toLowerCase() }; } catch { return { ...fallback, membership_state: "review_required" }; } }
function defaultMembershipState() { return { trusted: false, membership_state: "unknown", package_state: "unknown", rich_menu_target: "public_member", has_first_job: false, first_session_status: "" }; }
function normalizeMembershipState(value) { const state = clean(value).toLowerCase(); if (state === "active" || state === "current") return "active"; if (state === "expired") return "expired"; if (state === "no_paid_package" || state === "none" || state === "no_package") return "no_paid_package"; if (state === "review_required") return "review_required"; return "unknown"; }
function normalizePackageState(value) { const state = clean(value).toLowerCase(); if (state === "active" || state === "current") return "current"; if (state === "expired") return "expired"; if (state === "none" || state === "no_paid_package" || state === "no_package") return "none"; return "unknown"; }
function canUsePrivateRoute(membership) { return membership.trusted && membership.membership_state === "active" && membership.package_state === "current"; }
function isRenewalRequired(membership) { return membership.trusted && (membership.membership_state === "expired" || membership.package_state === "expired"); }
function richMenuTargetFor(membership) { if (canUsePrivateRoute(membership)) return "private_member"; if (isRenewalRequired(membership)) return "public_member"; return "public_member"; }
function truthy(value) { return value === true || value === 1 || String(value || "").toLowerCase() === "true" || String(value || "").toLowerCase() === "yes"; }
function appendSafeQuery(base, safeQuery = {}, extra = {}) { const params = new URLSearchParams(); for (const key of ["t", "code", "promo"]) { if (safeQuery[key]) params.set(key, safeQuery[key]); } Object.entries(extra).forEach(([key, value]) => { if (value != null && String(value).trim()) params.set(key, String(value)); }); const rendered = params.toString(); return rendered ? `${base}?${rendered}` : base; }
function appendQuery(base, query, extra = {}) { const params = new URLSearchParams(query || ""); Object.entries(extra).forEach(([k, v]) => { if (v != null && String(v).trim()) params.set(k, String(v)); }); const rendered = params.toString(); return rendered ? `${base}?${rendered}` : base; }
function normalizePlan(value) { const plan = String(value || "").toLowerCase().trim().replace(/[^a-z0-9_/-]/g, "").replace(/\//g, ""); for (const pkg of PACKAGES) { if (pkg.key === plan || pkg.aliases.includes(plan)) return pkg.key; } return ""; }
function getPackage(plan) { return PACKAGES.find((pkg) => pkg.key === plan) || PACKAGES[1]; }
function cleanPath(pathname) { return (pathname.toLowerCase().replace(/\/+$/, "") || "/"); }
function positive(value) { const n = Number(String(value || "").replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; }
function money(value) { return new Intl.NumberFormat("th-TH").format(Number(value || 0)); }
function html(value) { return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function attr(value) { return html(value).replace(/"/g, "&quot;"); }
function paymentScript(stage = "membership") { return `(function(){var f=document.getElementById("payform"),r=document.getElementById("payresult");if(!f||!r)return;function out(t){r.hidden=false;r.textContent=t;}function sid(){return "mem_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,10);}f.addEventListener("submit",function(e){e.preventDefault();var d=new FormData(f),api=f.getAttribute("data-api"),plan=f.getAttribute("data-plan"),amount=Number(f.getAttribute("data-amount")||0),sessionId=String(d.get("session_id")||"").trim()||sid();var payload={session_id:sessionId,payment_stage:${JSON.stringify(stage)},payment_type:${JSON.stringify(stage)},package_code:plan,amount:amount,member_email:String(d.get("member_email")||"").trim(),receipt_url:String(d.get("receipt_url")||"").trim(),notes:String(d.get("notes")||"").trim(),payment_method:"promptpay"};out("กำลังส่งหลักฐานเข้าระบบตรวจสอบ...");fetch(api+"/v1/pay/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).then(function(x){return x.json().catch(function(){return{}}).then(function(j){return{ok:x.ok,json:j}})}).then(function(o){if(!o.ok||!o.json||o.json.ok===false)throw new Error(o.json&&(o.json.error||o.json.message)||"payment_submit_failed");var ref=o.json.payment_ref||o.json.transaction_ref||"";var next=new URL("/pay/pending-verification",location.origin);new URLSearchParams(location.search||"").forEach(function(v,k){next.searchParams.set(k,v)});next.searchParams.set("status","pending_verification");next.searchParams.set("plan",plan);next.searchParams.set("amount",String(amount));next.searchParams.set("session_id",sessionId);if(ref)next.searchParams.set("payment_ref",ref);location.href=next.toString();}).catch(function(err){out("ส่งหลักฐานไม่สำเร็จ: "+(err&&err.message||err));});});})();`; }
function styles() { return `:root{color-scheme:dark;--bg:#050403;--ink:#fffaf0;--muted:#c9c1b5;--soft:#a69d90;--gold:#f3d47d;--gold2:#b9852d;--line:rgba(243,212,125,.22);--panel:rgba(13,10,7,.88)}*{box-sizing:border-box}html{background:var(--bg);scroll-behavior:smooth}body{margin:0;min-height:100vh;background:radial-gradient(circle at 8% 0,rgba(137,82,18,.26),transparent 34rem),radial-gradient(circle at 90% 18%,rgba(107,28,46,.12),transparent 28rem),linear-gradient(135deg,#090704 0,#050403 52%,#020201 100%);color:var(--ink);font-family:"LINE Seed Sans TH","Noto Sans Thai","Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased}main{width:min(1240px,calc(100% - 32px));margin:0 auto;padding:18px 0 max(84px,env(safe-area-inset-bottom))}nav{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:8px 0 24px}nav a{color:var(--ink);text-decoration:none;font-size:14px;font-weight:750}nav a:hover{color:var(--gold)}.brand{color:var(--gold);letter-spacing:.14em}nav span{display:flex;gap:18px;flex-wrap:wrap}.hero{display:grid;gap:16px;margin:0 0 18px}.panel{border:1px solid var(--line);border-radius:28px;background:linear-gradient(145deg,rgba(19,14,10,.94),rgba(8,6,5,.88));box-shadow:0 24px 80px rgba(0,0,0,.34);backdrop-filter:blur(18px);padding:clamp(22px,4vw,44px)}.hero-panel h1{max-width:850px;margin:0 0 20px;font-size:clamp(48px,9vw,100px);line-height:.91;letter-spacing:-.058em}.hero-panel h1 br{display:block}.eyebrow{margin:0 0 13px;color:var(--gold);font-size:12px;font-weight:850;letter-spacing:.17em;text-transform:uppercase}.lead{max-width:760px;margin:0;color:#e8e0d4;font-size:clamp(17px,2vw,20px);line-height:1.72}p{line-height:1.72;color:var(--muted)}.steps,.summary{display:grid;gap:9px;margin-top:24px}.steps span,.summary span,.summary b{min-width:0;padding:12px 14px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.045)}.steps span{display:flex;gap:10px;align-items:center;color:#f5eee3}.steps b{color:var(--gold);font-size:11px;letter-spacing:.08em}.summary b{color:var(--gold)}.proof-note{margin:18px 0 0;color:#b9b0a4}.side-card{display:flex;flex-direction:column;justify-content:center}.side-card h2{margin:4px 0 14px;font-size:clamp(28px,3.2vw,42px);line-height:1.16;letter-spacing:-.03em}.blackcard-note{background:radial-gradient(circle at 100% 0,rgba(199,151,62,.13),transparent 50%),linear-gradient(145deg,rgba(19,14,10,.95),rgba(7,5,4,.93))}.stacked-actions{align-items:flex-start;flex-direction:column}.text-link{color:#f3e4b3;text-decoration:none;font-weight:750}.text-link:hover{color:#fff}.packages-section{padding:clamp(40px,7vw,76px) 0 18px}.section-heading{display:grid;gap:12px;align-items:end;margin-bottom:22px}.section-heading h2{margin:0;font-size:clamp(32px,5vw,58px);line-height:1.08;letter-spacing:-.04em}.section-heading>p{max-width:520px;margin:0}.package-grid{display:grid;gap:14px}.membership-card{min-height:390px;display:flex;flex-direction:column;justify-content:space-between;transition:transform .22s ease,border-color .22s ease,background .22s ease}.membership-card:hover{transform:translateY(-4px);border-color:rgba(243,212,125,.48);background:linear-gradient(145deg,rgba(25,18,11,.98),rgba(9,7,5,.92))}.membership-card.selected{border-color:rgba(243,212,125,.72);box-shadow:0 24px 80px rgba(108,69,13,.24)}.membership-card h3{margin:4px 0 16px;color:#fffaf0;font-size:clamp(27px,3vw,36px);line-height:1.12;letter-spacing:-.035em}.membership-card p{margin-top:0}.package-footer{padding-top:26px}.price{margin:0;color:#fff;font-size:14px;font-weight:750;letter-spacing:.04em}.price span{font-size:34px;letter-spacing:-.035em}.fine{color:var(--soft);font-size:13px}.assurance-strip{display:grid;gap:1px;margin-top:16px;overflow:hidden;border:1px solid rgba(255,255,255,.08);border-radius:20px;background:rgba(255,255,255,.08)}.assurance-strip span{padding:16px 18px;background:#0c0907;color:#d9d0c3;font-size:13px;font-weight:750;text-align:center}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.btn,button.btn{min-height:50px;display:inline-flex;align-items:center;justify-content:center;gap:14px;border:1px solid var(--gold2);border-radius:999px;padding:0 20px;color:#171005;background:linear-gradient(135deg,#ffe9a8,#bd8630);font-weight:850;text-decoration:none;cursor:pointer}.btn:hover{filter:brightness(1.06)}.btn.ghost{color:var(--ink);background:rgba(255,255,255,.055)}label{display:grid;gap:7px;margin:12px 0;color:#e6ddd0;font-weight:750}input,textarea{width:100%;border:1px solid rgba(255,255,255,.13);border-radius:16px;background:rgba(0,0,0,.3);color:#fffaf0;padding:13px 14px;outline:none}.notice{margin-top:14px;padding:12px;border:1px solid var(--line);border-radius:16px;color:var(--gold)}footer{padding:34px 0 0;color:#8e8579;font-size:12px;text-align:center}@media(max-width:639px){main{width:min(100% - 22px,1240px);padding-top:10px}nav{align-items:flex-start;padding-bottom:16px}nav span{justify-content:flex-end;gap:10px}nav span a:nth-child(2){display:none}.panel{border-radius:23px}.hero-panel h1{font-size:clamp(48px,16vw,70px)}.membership-card{min-height:0}.btn{width:100%}.stacked-actions{align-items:stretch}.text-link{padding:8px 2px}.assurance-strip{grid-template-columns:1fr}}@media(min-width:640px){.assurance-strip{grid-template-columns:repeat(3,1fr)}}@media(min-width:760px){.hero{grid-template-columns:minmax(0,1.48fr) minmax(300px,.72fr);align-items:stretch}.package-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.steps,.summary{grid-template-columns:repeat(3,minmax(0,1fr))}.section-heading{grid-template-columns:minmax(0,1fr) minmax(280px,.65fr)}}`; }
