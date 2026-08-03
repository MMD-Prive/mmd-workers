import { handlePromotionClaim } from "./promotion-claim.js";
import { handleMemberDashboardReadback } from "./member-dashboard-readback.js";

const WORKER = "member-pages-worker";
const VERSION = "20260701-disable-auto-renewal-routing";

// ROUTE LOCK
// /sigil/pay/membership and /pay/membership are membership payment routes.
// They must not be automatically routed to /sigil/pay/renewal by LIFF,
// member status, page script, or route recovery logic.
// Renewal can exist only as a manual legacy evidence page.

const PAGE_PATHS = new Set([
  "/sigil/membership", "/sigil/membership/",
  "/sigil/pay/membership", "/sigil/pay/membership/",
  "/sigil/pay/renewal", "/sigil/pay/renewal/",
  "/member/membership", "/member/membership/",
  "/pay/membership", "/pay/membership/",
  "/pay/pending-verification", "/pay/pending-verification/",
  "/member/profile", "/member/profile/",
]);

const LIFF_IDENTIFY_PATHS = new Set([
  "/member/api/liff/identify",
  "/member/api/liff/identify/",
]);
const PROMOTION_CLAIM_PATHS = new Set(["/member/api/liff/promotion-claim", "/member/api/liff/promotion-claim/"]);
const MEMBER_DASHBOARD_API_PATHS = new Set(["/member/api/liff/dashboard", "/member/api/liff/dashboard/"]);

const PACKAGES = [
  { key: "7days", aliases: ["7day", "7_days", "guest", "guestpass", "trial"], title: "7 Days Guest Pass", eyebrow: "TEMPORARY ACCESS", price: 1499, duration: "7 days", tier: "guest-pass", copy: "Temporary membership access for a short review window. Official verification is still required." },
  { key: "standard", aliases: ["lite", "std"], title: "Standard Package", eyebrow: "STANDARD ACCESS", price: 1199, duration: "365 days", tier: "standard", copy: "Standard member access after official verification." },
  { key: "premium", aliases: ["prem"], title: "Premium Package", eyebrow: "PREMIUM ACCESS", price: 2999, duration: "365 days", tier: "premium", copy: "Broader member access after official verification." },
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
    if (MEMBER_DASHBOARD_API_PATHS.has(url.pathname.toLowerCase())) return handleMemberDashboardReadback(request, env);
    if (PROMOTION_CLAIM_PATHS.has(url.pathname.toLowerCase())) return handlePromotionClaim(request, env);
    if (isLiffIdentifyPath(url)) return handleLiffIdentify(request, env);
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: headers("text/plain") });
    if (method !== "GET" && method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: headers("text/plain; charset=utf-8") });
    if (!isMemberPagePath(url)) return new Response("Not Found", { status: 404, headers: headers("text/plain; charset=utf-8") });

    const p = cleanPath(url.pathname);
    if (p === "/sigil/membership") return renderSigilMembership(request);
    if (p === "/sigil/pay/membership") return renderSigilPayMembershipSafety(request);
    if (p === "/sigil/pay/renewal") return renderRenewalLegacySafety(request);
    if (p === "/pay/membership") return renderPay(request, env);
    if (p === "/pay/pending-verification") return renderPending(request);
    if (p === "/member/profile") return renderProfile(request);
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
        public_membership: appendSafeQuery("/member/membership", safeQuery),
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
  if (entryRoute === "dashboard") return appendSafeQuery("/member/membership", safeQuery);
  if (entryRoute === "pay_membership") return appendSafeQuery("/pay/membership", safeQuery);
  if (entryRoute === "member_status") return routeForMemberStatus(membership, safeQuery);
  if (entryRoute === "membership_review") return appendSafeQuery("/member/membership", safeQuery);
  if (entryRoute === "booking_request") return routeForBooking(membership, safeQuery);
  return appendSafeQuery("/member/membership", safeQuery);
}

function routeForMemberStatus(membership, safeQuery) {
  if (canUsePrivateRoute(membership)) return appendSafeQuery("/member/profile", safeQuery, { status: "active" });
  return appendSafeQuery("/member/membership", safeQuery);
}

function routeForBooking(membership, safeQuery) {
  if (canUsePrivateRoute(membership)) return appendSafeQuery("/sigil/booking", safeQuery);
  return appendSafeQuery("/member/membership", safeQuery);
}

function renderMembership(request) {
  const url = new URL(request.url);
  const selected = normalizePlan(url.searchParams.get("plan") || url.searchParams.get("package"));
  const packageCards = PACKAGES.map((pkg) => membershipPackageCard(pkg, selected, url.search)).join("");
  return page(request, "member-membership", `${nav(url.search)}<section class="hero membership-hero"><div class="panel hero-panel"><p class="eyebrow">Member Package Selection</p><h1>Choose Your Access</h1><p class="lead">เลือกแพ็กเกจสมาชิกก่อน แล้วไปหน้า payment เฉพาะแพ็กเกจที่ซื้อได้จริง สถานะจะเริ่มหลัง official verification เท่านั้น</p><div class="steps"><span>Choose package</span><span>Transfer / proof</span><span>Official verification</span></div><p class="fine">สลิปเป็น supporting evidence เท่านั้น ไม่ใช่การเปิดสถานะสมาชิกอัตโนมัติ</p></div><aside class="panel side-card"><p class="eyebrow">Black Card Review</p><h2>ไม่ใช่แพ็กเกจที่ซื้อได้ทันที</h2><p>Black Card เป็น private review status สำหรับเคสที่ผ่าน owner/founder approval เท่านั้น</p><p class="actions"><a class="btn ghost" href="${attr(appendQuery("/blackcard", url.search))}">Read Black Card</a><a class="btn ghost" href="${attr(appendQuery("/member/dashboard", url.search))}">Member Login</a></p></aside></section><section class="package-grid">${packageCards}</section><section class="panel rule-panel"><p class="eyebrow">Route rule</p><h2>Membership routes stay membership routes</h2><p>/pay/membership และ /sigil/pay/membership จะไม่ถูกส่งไป renewal อัตโนมัติอีก</p></section>`);
}

function renderSigilMembership(request) {
  const url = new URL(request.url);
  return page(request, "sigil-membership", `${nav(url.search)}<section class="hero"><div class="panel hero-panel"><p class="eyebrow">SIGIL ACCESS CONDITIONS</p><h1>Membership Access</h1><p class="lead">หน้านี้คือเงื่อนไขการเข้าถึง ไม่ใช่ public checkout และไม่ใช่การยืนยันสถานะสมาชิกทันที</p><p>สถานะจริงอ้างอิงจาก ledger และ official verification เท่านั้น</p><p class="actions"><a class="btn" href="${attr(appendQuery("/member/membership", url.search))}">ดูแพ็กเกจสมาชิก</a><a class="btn ghost" href="${attr(appendQuery("/sigil/pay/membership", url.search))}">ไปหน้าชำระสมาชิก</a></p></div><aside class="panel side-card"><p class="eyebrow">Private layer</p><h2>Black Card holder layer</h2><p>/sigil/blackcard เป็นชั้น private หลัง approval ไม่ใช่ public sales page</p></aside></section>`);
}

function renderSigilPayMembershipSafety(request) {
  const url = new URL(request.url);
  return page(request, "sigil-pay-membership-safety", `${nav(url.search)}<section class="hero payment-hero"><div class="panel hero-panel"><p class="eyebrow">SIGIL PAYMENT ROUTE LOCK</p><h1>Membership Payment</h1><p class="lead">เส้นทางนี้ถูกล็อกเป็น membership payment route และจะไม่ถูกส่งไป renewal อัตโนมัติ</p><p>ถ้าหน้า Webflow ถูกผูกไว้ที่ /sigil/pay/membership ให้ Cloudflare route หลัก pass-through ไป Webflow ได้โดยไม่ใช้ renewal logic</p><p class="actions"><a class="btn" href="${attr(appendQuery("/pay/membership", url.search))}">Fallback Payment Page</a><a class="btn ghost" href="${attr(appendQuery("/member/membership", url.search))}">Package Selection</a></p></div><aside class="panel side-card"><p class="eyebrow">Guarded</p><h2>No auto renewal redirect.</h2><p>ระบบ identity / status จะไม่ส่งหน้านี้ไป /sigil/pay/renewal อีก</p></aside></section>`);
}

function renderRenewalLegacySafety(request) {
  const url = new URL(request.url);
  return page(request, "sigil-pay-renewal-manual-only", `${nav(url.search)}<section class="hero payment-hero"><div class="panel hero-panel"><p class="eyebrow">Manual Legacy Route</p><h1>Renewal route is manual only</h1><p class="lead">หน้านี้ไม่ใช่ fallback อัตโนมัติของ payment membership แล้ว ถ้าลูกค้าเข้ามาผิดทางให้กลับไปหน้าเลือกแพ็กเกจหรือ payment membership</p><p class="actions"><a class="btn" href="${attr(appendQuery("/sigil/pay/membership", url.search))}">ไป Membership Payment</a><a class="btn ghost" href="${attr(appendQuery("/member/membership", url.search))}">เลือกแพ็กเกจ</a></p></div><aside class="panel side-card"><p class="eyebrow">Guarded</p><h2>ไม่เปิดสิทธิ์อัตโนมัติ</h2><p>Renewal evidence ต้องเกิดจากเจตนาชัดเจนเท่านั้น ไม่ใช่ default redirect</p></aside></section>`);
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

function renderProfile(request) {
  const url = new URL(request.url);
  return page(request, "member-profile", `${nav(url.search)}<section class="hero"><div class="panel hero-panel"><p class="eyebrow">Member Profile</p><h1>Member Status</h1><p class="lead">หน้านี้แสดงสถานะสมาชิกหลังตรวจสอบจาก ledger และระบบจริง</p><p class="actions"><a class="btn" href="${attr(appendQuery("/member/dashboard", url.search))}">Dashboard</a><a class="btn ghost" href="${attr(appendQuery("/member/membership", url.search))}">Membership</a></p></div></section>`);
}

function renderBlackCardPaymentBlocked(request) {
  const url = new URL(request.url);
  return page(request, "blackcard-payment-blocked", `${nav(url.search)}<section class="hero"><div class="panel hero-panel"><p class="eyebrow">Black Card Review</p><h1>Payment blocked</h1><p class="lead">Black Card ต้องผ่าน owner/founder approval ก่อน ไม่ใช่การกดจ่ายตรง</p><p class="actions"><a class="btn" href="${attr(appendQuery("/blackcard", url.search))}">Read Black Card</a><a class="btn ghost" href="${attr(appendQuery("/member/membership", url.search))}">Back to Membership</a></p></div></section>`);
}

function membershipPackageCard(pkg, selected, query) {
  const isSelected = selected === pkg.key;
  const payUrl = appendQuery("/pay/membership", query, { plan: pkg.key, amount: pkg.price });
  return `<article class="panel package${isSelected ? " selected" : ""}"><p class="eyebrow">${html(pkg.eyebrow)}</p><h2>${html(pkg.title)}</h2><p>${html(pkg.copy)}</p><p class="price">${money(pkg.price)} THB</p><p class="fine">${html(pkg.duration)}</p><p class="actions"><a class="btn" href="${attr(payUrl)}">เลือกแพ็กเกจนี้</a></p></article>`;
}

function nav(query = "") {
  return `<nav><a class="brand" href="${attr(appendQuery("/member/membership", query))}">MMD PRIVÉ</a><span><a href="${attr(appendQuery("/blackcard", query))}">Black Card</a><a href="${attr(appendQuery("/member/membership", query))}">Membership</a><a href="${attr(appendQuery("/member/dashboard", query))}">Dashboard</a></span></nav>`;
}

function page(request, slug, body) {
  const output = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD Privé | ${html(slug)}</title><style>${styles()}</style></head><body><main data-mmd-page="${attr(slug)}" data-mmd-version="${VERSION}">${body}<footer>Payment proof is evidence only. Verification opens access. Member ledger is the source of truth. Auto renewal routing is disabled.</footer></main></body></html>`;
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
function dashboardUnlockFor(membership, entryRoute, safeQuery) { const liveStatuses = new Set(["confirmed", "en_route", "arrived", "met", "work_started", "completed"]); const sessionStatus = clean(membership.first_session_status || membership.session_status || membership.job_status).toLowerCase(); const unlocked = Boolean(membership.trusted && truthy(membership.has_first_job) && liveStatuses.has(sessionStatus)); const holdingRoute = appendSafeQuery(entryRoute === "sigil_membership" ? "/sigil/membership" : "/member/membership", safeQuery); return { unlocked, holding_route: unlocked ? null : holdingRoute, reason: unlocked ? "first_real_job_or_session_exists" : "waiting_for_first_real_job_or_session" }; }
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
function styles() { return `:root{color-scheme:dark;--bg:#030201;--ink:#fff7e8;--muted:rgba(255,247,232,.64);--gold:#ffd98d;--gold2:#b98632;--line:rgba(255,216,151,.2);--panel:rgba(12,8,5,.76)}*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;min-height:100vh;background:radial-gradient(circle at top left,#2b1b07 0,#080604 42%,#030201 100%);color:var(--ink);font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}main{width:min(1120px,calc(100% - 28px));margin:0 auto;padding:16px 0 42px}nav{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:10px 0 18px}nav a{color:var(--ink);text-decoration:none;font-weight:800}.brand{color:var(--gold);letter-spacing:.12em}nav span{display:flex;gap:12px;flex-wrap:wrap}.hero{display:grid;gap:14px;margin:0 0 16px}.panel{border:1px solid var(--line);border-radius:26px;background:var(--panel);box-shadow:0 24px 78px rgba(0,0,0,.36);backdrop-filter:blur(14px);padding:clamp(18px,4vw,34px)}.hero-panel h1{margin:0 0 12px;font-size:clamp(42px,10vw,88px);line-height:.95;letter-spacing:-.055em}.eyebrow{margin:0 0 10px;color:var(--gold);font-size:12px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.lead{font-size:17px;line-height:1.68;color:rgba(255,247,232,.82)}p{line-height:1.7;color:var(--muted)}.steps,.summary{display:grid;gap:8px;margin-top:18px}.steps span,.summary span,.summary b{padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.045)}.summary b{color:var(--gold)}.package-grid{display:grid;gap:12px}.package.selected{border-color:rgba(255,217,141,.58)}.price{font-size:28px;font-weight:900;color:#fff}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.btn,button.btn{min-height:48px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--gold2);border-radius:999px;padding:0 18px;color:#150e06;background:linear-gradient(135deg,#ffe7aa,#b98632);font-weight:900;text-decoration:none;cursor:pointer}.btn.ghost{color:var(--ink);background:rgba(255,255,255,.06)}label{display:grid;gap:7px;margin:12px 0;color:rgba(255,247,232,.86);font-weight:800}input,textarea{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(0,0,0,.28);color:#fff7e8;padding:13px 14px;outline:none}.notice{margin-top:14px;padding:12px;border:1px solid var(--line);border-radius:16px;color:var(--gold)}footer{padding:24px 0;color:rgba(255,247,232,.46);font-size:12px;text-align:center}@media(min-width:760px){.hero{grid-template-columns:1.45fr .75fr;align-items:stretch}.package-grid{grid-template-columns:repeat(3,1fr)}.steps,.summary{grid-template-columns:repeat(3,1fr)}}`; }
