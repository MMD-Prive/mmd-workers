import { SYSTEM_LIGHT } from "../../webflow/global/sigil-brand-v1.mjs";
import { ADMIN_CONSOLE_STYLES } from "./admin-console-style.js";
import { adminConsoleClient } from "./admin-console-client.js";

export const ADMIN_CONSOLE_PATH = "/internal/admin/console";

// Bundled Thai fallback for the authenticated Worker page. The same stable keys
// are mirrored in MMD-Prive/mmd-i18n; this page does not install another engine.
export const ADMIN_CONSOLE_COPY = Object.freeze({
  "admin.console.title": "Console",
  "admin.console.eyebrow": "พื้นที่ทำงานของเปอร์",
  "admin.console.description": "ดูงานวันนี้ ค้นหารายการ แล้วเปิดงานที่ต้องจัดการต่อ",
  "admin.console.skip": "ข้ามไปยังรายการงาน",
  "admin.console.workspace": "พื้นที่ทำงาน",
  "admin.console.navigation": "เมนูหลักของ Console",
  "admin.console.createJob": "สร้างงาน",
  "admin.console.allJobs": "งานทั้งหมด",
  "admin.console.payments": "ตรวจสลิปและการชำระ",
  "admin.console.customers": "ข้อมูลลูกค้า",
  "admin.console.membership": "ข้อมูลสมาชิก",
  "admin.console.recovery": "ติดตามงานค้าง",
  "admin.console.modelLink": "เชื่อมบัญชีนายแบบ",
  "admin.console.controlRoom": "Control Room",
  "admin.console.tools": "เครื่องมือทำงาน",
  "admin.console.ownerOnly": "พื้นที่ผู้ดูแล",
  "admin.console.refresh": "โหลดใหม่",
  "admin.console.overview": "ภาพรวมทุกวัน",
  "admin.console.globalScope": "จำนวนงานทั้งระบบ · ไม่เปลี่ยนตามตัวกรอง",
  "admin.console.countToday": "งานวันนี้",
  "admin.console.countUpcoming": "งานถัดไป",
  "admin.console.countUndated": "ยังไม่ระบุวัน",
  "admin.console.countAll": "งานทั้งหมด",
  "admin.console.jobsTitle": "รายการงาน",
  "admin.console.dateLabel": "วันนัดหมาย",
  "admin.console.today": "วันนี้",
  "admin.console.allDates": "ทุกวัน",
  "admin.console.searchLabel": "ค้นหางาน",
  "admin.console.searchPlaceholder": "ชื่อลูกค้า นายแบบ หรือเลขงาน",
  "admin.console.search": "ค้นหา",
  "admin.console.searchHint": "ค้นหาจากชื่อที่บันทึกไว้ในงาน",
  "admin.console.clearFilters": "ล้างตัวกรอง",
  "admin.console.clearScope": "ออกจากรายการที่เลือก",
  "admin.console.scopeJob": "เลขงาน",
  "admin.console.scopeSession": "Session",
  "admin.console.scopeClient": "ลูกค้า",
  "admin.console.scopeCaption": "ดูเฉพาะรายการที่เลือก",
  "admin.console.loading": "กำลังโหลดรายการงาน…",
  "admin.console.loadingHelp": "กำลังอ่านข้อมูลล่าสุด กรุณารอสักครู่",
  "admin.console.loaded": "โหลดแล้ว {count} รายการ",
  "admin.console.updated": "อัปเดต {time}",
  "admin.console.notUpdated": "ยังไม่ได้อัปเดตข้อมูล",
  "admin.console.results": "{total} รายการ · แสดง {start}–{end}",
  "admin.console.zeroResults": "0 รายการ",
  "admin.console.page": "หน้า {page} จาก {pages}",
  "admin.console.previous": "ก่อนหน้า",
  "admin.console.next": "ถัดไป",
  "admin.console.pagination": "เปลี่ยนหน้ารายการงาน",
  "admin.console.noJobsToday": "ยังไม่มีงานในวันนี้",
  "admin.console.noJobsDate": "ยังไม่มีงานในวันที่เลือก",
  "admin.console.noJobsSearch": "ไม่พบงานที่ตรงกับตัวกรอง",
  "admin.console.noJobsAll": "ยังไม่มีรายการงาน",
  "admin.console.noJobsDescription": "เลือกดูทุกวัน หรือสร้างงานใหม่ได้จากหน้านี้",
  "admin.console.noJobsFilteredDescription": "ลองเปลี่ยนชื่อ เลขงาน หรือวันที่นัดหมาย แล้วค้นหาอีกครั้ง",
  "admin.console.showAllDates": "ดูงานทุกวัน",
  "admin.console.errorTitle": "ยังโหลดรายการงานไม่ได้",
  "admin.console.errorBody": "ข้อมูลยังไม่พร้อมแสดง กรุณาลองโหลดใหม่อีกครั้ง",
  "admin.console.timeoutTitle": "การโหลดใช้เวลานานกว่าปกติ",
  "admin.console.timeoutBody": "ยังไม่ได้รับข้อมูลครบ กรุณาลองโหลดใหม่",
  "admin.console.expiredTitle": "กรุณาเข้าสู่ระบบอีกครั้ง",
  "admin.console.expiredBody": "การเข้าสู่ระบบหมดอายุแล้ว เมื่อลงชื่อเข้าใช้จะกลับมาที่ตัวกรองเดิม",
  "admin.console.forbiddenTitle": "บัญชีนี้ยังเปิด Console ไม่ได้",
  "admin.console.forbiddenBody": "กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแลเพื่อดูรายการงาน",
  "admin.console.invalidTitle": "ตัวกรองไม่ถูกต้อง",
  "admin.console.invalidBody": "ล้างตัวกรอง แล้วเลือกวันที่หรือค้นหางานใหม่อีกครั้ง",
  "admin.console.retry": "ลองใหม่",
  "admin.console.signIn": "เข้าสู่ระบบ",
  "admin.console.openJob": "เปิดงาน",
  "admin.console.cannotOpenJob": "ยังเปิดงานไม่ได้",
  "admin.console.customerLabel": "ลูกค้า",
  "admin.console.modelLabel": "นายแบบ",
  "admin.console.scheduleLabel": "วันและเวลา",
  "admin.console.jobStatusLabel": "สถานะงาน",
  "admin.console.amountLabel": "ยอดงาน",
  "admin.console.payoutLabel": "ค่าตัวนายแบบ",
  "admin.console.noName": "ยังไม่ระบุชื่อ",
  "admin.console.noDate": "ยังไม่ระบุวัน",
  "admin.console.noTime": "ยังไม่ระบุเวลา",
  "admin.console.noStatus": "ยังไม่มีข้อมูลสถานะ",
  "admin.console.details": "รายละเอียดงาน",
  "admin.console.jobId": "เลขงาน",
  "admin.console.sessionId": "Session",
  "admin.console.clientId": "รหัสลูกค้า",
  "admin.console.paymentRef": "เลขอ้างอิงการชำระ",
  "admin.console.rawStatus": "สถานะต้นทาง",
  "admin.console.customerAck": "ลูกค้ารับทราบรายละเอียด",
  "admin.console.modelAck": "นายแบบรับทราบรายละเอียด",
  "admin.console.unknownAck": "ยังไม่มีข้อมูลการรับทราบ",
  "admin.console.depositDue": "มัดจำที่ระบุ",
  "admin.console.depositReceived": "มัดจำที่บันทึกรับ",
  "admin.console.balance": "ยอดคงเหลือตามรายการ",
  "admin.console.openCustomer": "เปิดข้อมูลลูกค้า",
  "admin.console.reviewPayment": "เปิดตรวจการชำระ",
  "admin.console.financeNote": "ยอดและสถานะตามรายการงาน · ตรวจหลักฐานการชำระในหน้าตรวจสลิป",
  "admin.console.paymentPrefix": "การชำระ: {status}",
  "admin.console.unknownPayment": "ยังไม่มีข้อมูลการชำระ",
  "admin.console.toolsTitle": "เปิดทำงานต่อ",
  "admin.console.paymentsDescription": "ตรวจหลักฐานและรายละเอียดการชำระ",
  "admin.console.customersDescription": "ค้นหาลูกค้าและดูข้อมูลที่เกี่ยวข้อง",
  "admin.console.recoveryDescription": "ตรวจรายการติดขัดและดำเนินการต่อ",
  "admin.console.moreTools": "เครื่องมือเพิ่มเติม",
  "admin.console.controlRoomDescription": "ดูทางเข้าระบบและเครื่องมือทั้งหมด",
  "admin.console.footer": "SĪGIL System · พื้นที่ทำงานภายใน",
  "admin.console.noJs": "เปิด JavaScript เพื่อโหลดรายการงานใน Console หรือใช้ลิงก์ด้านล่างเพื่อเปิดงานทั้งหมด",
  "admin.console.jobNew": "งานใหม่",
  "admin.console.jobDraft": "แบบร่าง",
  "admin.console.jobPending": "รอดำเนินการ",
  "admin.console.jobReview": "รอตรวจ",
  "admin.console.jobConfirmed": "ยืนยันงานแล้ว",
  "admin.console.jobReady": "พร้อมดำเนินการ",
  "admin.console.jobActive": "กำลังดำเนินการ",
  "admin.console.jobTravel": "กำลังเดินทาง",
  "admin.console.jobArrived": "ถึงจุดนัดแล้ว",
  "admin.console.jobWorking": "กำลังทำงาน",
  "admin.console.jobFinished": "งานสิ้นสุด",
  "admin.console.jobCancelled": "ยกเลิกงาน",
  "admin.console.jobHold": "พักงาน",
  "admin.console.jobDeclined": "ปฏิเสธงาน",
  "admin.console.jobExpired": "หมดอายุ",
  "admin.console.jobInactive": "ไม่ใช้งาน",
  "admin.console.jobPayment": "รอการชำระ",
  "admin.console.paymentPaid": "บันทึกว่าชำระแล้ว",
  "admin.console.paymentVerified": "บันทึกว่าตรวจแล้ว",
  "admin.console.paymentPending": "รอดำเนินการ",
  "admin.console.paymentReview": "รอตรวจหลักฐาน",
  "admin.console.paymentUnpaid": "ยังไม่ชำระ",
  "admin.console.paymentPartial": "บันทึกชำระบางส่วน",
  "admin.console.paymentDeposit": "บันทึกมัดจำแล้ว",
  "admin.console.paymentRefunded": "บันทึกว่าคืนเงินแล้ว",
  "admin.console.paymentRejected": "ไม่รับหลักฐาน",
});

const FAVICON = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0ea3f9421cae9dd223f50b_SIGIL%20only%20logo.webp";
// Canonical copy companion: MMD-Prive/mmd-i18n#54. Each immutable CDN asset
// was byte-compared with this commit before pinning; keep its SRI with the URL.
const I18N_BASE = "https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-i18n@9bca16e2bcd82eb9ba2f39001fdf8b3197f8edd7/assets/i18n/";
const I18N_ASSETS = Object.freeze([
  ["i18n.dict.js", "sha384-jYwgXdutZzM4Jic9qzc+a15DnqqT/H69c/3CgGaTwCgf0Ve5/iWgRjqHkgFFloXq"],
  ["pages/admin-console.js", "sha384-qmaEqPHRNGwnqkQ4SiPaJl1AlYC6+QzM0Ik0UB/pGq1vmyvD1teYSxsjZQna6pgS"],
  ["i18n.core.v21.js", "sha384-p2hpdJIaY4Eh19jbIxI3ZUNHuwF7H6Y6GX2PUYeGPNZraD04EfLuefqtvw8HtZzg"],
]);
const text = key => ADMIN_CONSOLE_COPY[`admin.console.${key}`];
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const translated = (key, tag = "span", attributes = "") => `<${tag} data-i18n-text="admin.console.${key}"${attributes ? ` ${attributes}` : ""}>${escapeHtml(text(key))}</${tag}>`;

const ICONS = Object.freeze({
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  jobs: '<rect x="4" y="6" width="16" height="15" rx="2"/><path d="M8 6V3h8v3M8 11h8M8 16h5"/>',
  payment: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5.65"/>',
  membership: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M5 16c0-3 6-3 6 0M14 9h4M14 13h3"/>',
  recovery: '<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/>',
  link: '<path d="m10 13 4-4M8 16l-2 2a4.25 4.25 0 0 1-6-6l4-4a4.25 4.25 0 0 1 6 0M16 8l2-2a4.25 4.25 0 0 1 6 6l-4 4a4.25 4.25 0 0 1-6 0" transform="translate(2 0) scale(.83)"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/>',
});

function icon(name, className = "") {
  return `<svg class="ac-icon${className ? ` ${className}` : ""}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.grid}</svg>`;
}

const NAVIGATION = Object.freeze([
  ["title", ADMIN_CONSOLE_PATH, "grid"],
  ["allJobs", "/internal/admin/jobs/all", "jobs"],
  ["payments", "/internal/admin/payments", "payment"],
  ["customers", "/internal/admin/customer-data", "people"],
  ["membership", "/internal/admin/member-intelligence", "membership"],
  ["recovery", "/internal/admin/recovery", "recovery"],
  ["modelLink", "/internal/admin/model-link", "link"],
]);

function navigation() {
  return NAVIGATION.map(([key, href, glyph]) => `<a class="ac-nav-link" href="${href}"${href === ADMIN_CONSOLE_PATH ? ' aria-current="page"' : ""}>${icon(glyph)}${translated(key)}</a>`).join("\n");
}

function toolLink(key, description, href, glyph) {
  return `<a class="ac-tool-link" href="${href}"><span class="ac-tool-icon">${icon(glyph)}</span><span class="ac-tool-copy">${translated(key, "strong")}${translated(description, "span")}</span>${icon("arrow", "ac-tool-arrow")}</a>`;
}

export function renderAdminConsolePage(request) {
  const method = String(request?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response(null, { status: 405, headers: { allow: "GET, HEAD", "cache-control": "no-store, private" } });
  }
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const headers = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, private",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "x-mmd-admin-console": "rebuild-v1",
    "x-sigil-internal-theme": "silver-orange-v1",
    "content-security-policy": [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "font-src https://cdn.prod.website-files.com",
      "img-src 'self' data: https://cdn.prod.website-files.com",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "object-src 'none'",
    ].join("; "),
  };
  if (method === "HEAD") return new Response(null, { headers });

  const serializedCopy = JSON.stringify(ADMIN_CONSOLE_COPY).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  // Wrangler/esbuild may retain function names with __name; keep its helper in
  // the browser closure so the serialized function remains independently valid.
  const clientScript = `(()=>{const __name=(target,value)=>{Object.defineProperty(target,"name",{value,configurable:true});return target;};(${adminConsoleClient.toString()})(${serializedCopy});})();`;
  const html = `<!doctype html>
<html lang="th" data-sigil-internal-theme="silver-orange-v1">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" content="#ffffff">
  <title>Console · SĪGIL System</title>
  <link rel="icon" type="image/webp" href="${FAVICON}">
  <link rel="preconnect" href="https://cdn.prod.website-files.com" crossorigin>
  <style id="sigil-internal-silver-v1" nonce="${nonce}">${ADMIN_CONSOLE_STYLES}</style>
  ${I18N_ASSETS.map(([path, integrity]) => `<script defer nonce="${nonce}" src="${I18N_BASE}${path}" integrity="${integrity}" crossorigin="anonymous" data-admin-console-i18n></script>`).join("\n  ")}
</head>
<body class="ac-page">
  ${translated("skip", "a", 'class="ac-skip" href="#ac-main"')}
  <div id="admin-console" class="ac-shell" data-admin-console="rebuild-v1">
    <aside class="ac-sidebar" aria-label="${text("navigation")}">
      <a class="ac-brand" href="${ADMIN_CONSOLE_PATH}" aria-label="SĪGIL System · Console">${SYSTEM_LIGHT}</a>
      <p class="ac-sidebar-caption">OWNER WORKSPACE</p>
      <nav class="ac-nav" aria-label="${text("navigation")}">${navigation()}</nav>
      <a class="ac-room-link" href="/internal/admin/control-room">${icon("grid")}${translated("controlRoom")}${icon("arrow")}</a>
      <div class="ac-sidebar-bottom">${icon("lock")}<span>${translated("ownerOnly", "strong")}${translated("eyebrow", "small")}</span></div>
    </aside>
    <div class="ac-workspace">
      <header class="ac-header">
        <a class="ac-mobile-brand" href="${ADMIN_CONSOLE_PATH}" aria-label="SĪGIL System · Console">${SYSTEM_LIGHT}</a>
        <nav class="ac-breadcrumb" aria-label="${text("workspace")}">${translated("workspace", "a", 'href="/internal/admin/console"')}<span aria-hidden="true">/</span>${translated("title", "span", 'aria-current="page"')}</nav>
        <div class="ac-header-actions"><span class="ac-owner-note">${icon("lock")}${translated("ownerOnly")}</span><button id="ac-refresh" class="ac-button ac-button-quiet" type="button">${icon("refresh")}${translated("refresh")}</button><details class="ac-mobile-tools"><summary aria-label="${text("tools")}">${icon("menu")}${translated("tools", "span", 'class="ac-sr-only"')}</summary><nav aria-label="${text("navigation")}">${navigation()}<a class="ac-nav-link" href="/internal/admin/control-room">${icon("grid")}${translated("controlRoom")}</a></nav></details></div>
      </header>
      <main id="ac-main" class="ac-main" tabindex="-1">
        <section class="ac-heading" aria-labelledby="ac-title">
          <div class="ac-heading-copy"><p class="ac-eyebrow"><time id="ac-today-label"></time><span class="ac-timezone">BANGKOK</span></p>${translated("title", "h1", 'id="ac-title"')}</div>
          <a class="ac-button ac-button-primary ac-create" href="/internal/admin/jobs/create-job">${icon("plus")}${translated("createJob")}</a>
          ${translated("description", "p", 'class="ac-description"')}
        </section>
        <section class="ac-overview" aria-labelledby="ac-overview-title">
          <div class="ac-section-caption">${translated("overview", "h2", 'id="ac-overview-title"')}${translated("globalScope", "p")}</div>
          <dl class="ac-metrics">
            <div class="ac-metric"><dt data-i18n-text="admin.console.countToday">${text("countToday")}</dt><dd data-count="today">—</dd></div>
            <div class="ac-metric"><dt data-i18n-text="admin.console.countUpcoming">${text("countUpcoming")}</dt><dd data-count="upcoming">—</dd></div>
            <div class="ac-metric"><dt data-i18n-text="admin.console.countUndated">${text("countUndated")}</dt><dd data-count="undated">—</dd></div>
            <div class="ac-metric"><dt data-i18n-text="admin.console.countAll">${text("countAll")}</dt><dd data-count="all">—</dd></div>
          </dl>
        </section>
        <div class="ac-content-grid">
          <section id="ac-board" class="ac-board" aria-labelledby="ac-jobs-title" aria-busy="true">
            <div class="ac-board-heading">${translated("jobsTitle", "h2", 'id="ac-jobs-title"')}<span id="ac-period-label" class="ac-period-label"></span></div>
            <form id="ac-filters" class="ac-filters" role="search" aria-label="${text("searchLabel")}">
              <div class="ac-date-field">${translated("dateLabel", "label", 'for="ac-date"')}<div class="ac-date-controls"><input id="ac-date" name="date" type="date" aria-describedby="ac-period-label"><div class="ac-date-options"><button class="ac-choice" id="ac-today" type="button" aria-pressed="false" data-period="today">${translated("today")}</button><button class="ac-choice" id="ac-all-dates" type="button" aria-pressed="false" data-period="all">${translated("allDates")}</button></div></div></div>
              <div class="ac-search-field">${translated("searchLabel", "label", 'for="ac-query"')}<div class="ac-search-controls"><span class="ac-search-input">${icon("search")}<input id="ac-query" name="q" type="search" maxlength="160" autocomplete="off" spellcheck="false" placeholder="${text("searchPlaceholder")}" data-i18n-placeholder="admin.console.searchPlaceholder" aria-describedby="ac-search-hint"></span><button id="ac-search-button" class="ac-button ac-button-primary" type="submit">${translated("search")}</button></div>${translated("searchHint", "small", 'id="ac-search-hint" class="ac-search-hint"')}</div>
            </form>
            <div id="ac-scope" class="ac-scope" hidden><div><strong data-i18n-text="admin.console.scopeCaption">${text("scopeCaption")}</strong><span id="ac-scope-text"></span></div><button id="ac-clear-scope" class="ac-text-button" type="button">${translated("clearScope")}</button></div>
            <div class="ac-results-meta"><p id="ac-results-summary">${text("loading")}</p><button id="ac-clear-filters" class="ac-text-button" type="button" hidden>${translated("clearFilters")}</button></div>
            <progress id="ac-progress" class="ac-progress" max="100" aria-label="${text("loading")}"></progress>
            <div id="ac-loading" class="ac-loading"><span class="ac-loading-mark" aria-hidden="true"></span>${translated("loadingHelp", "p")}</div>
            <p id="ac-status" class="ac-sr-only" role="status" aria-live="polite" aria-atomic="true">${text("loading")}</p>
            <div id="ac-error" class="ac-notice" role="alert" hidden>${icon("alert")}<div><h3 id="ac-error-title"></h3><p id="ac-error-body"></p><div class="ac-notice-actions"><button id="ac-retry" class="ac-button ac-button-quiet" type="button">${translated("retry")}</button><a id="ac-sign-in" class="ac-button ac-button-primary" href="/internal/admin/login?next=%2Finternal%2Fadmin%2Fconsole" hidden>${translated("signIn")}</a></div></div></div>
            <ul id="ac-jobs" class="ac-jobs" aria-label="${text("jobsTitle")}"></ul>
            <div id="ac-empty" class="ac-empty" hidden><span class="ac-empty-icon">${icon("jobs")}</span><h3 id="ac-empty-title"></h3><p id="ac-empty-body"></p><button id="ac-empty-all" class="ac-button ac-button-quiet" type="button">${translated("showAllDates")}</button></div>
            <nav id="ac-pagination" class="ac-pagination" aria-label="${text("pagination")}" hidden><button id="ac-previous" class="ac-button ac-button-quiet" type="button" disabled>${translated("previous")}</button><span id="ac-page-label"></span><button id="ac-next" class="ac-button ac-button-quiet" type="button" disabled>${translated("next")}</button></nav>
            ${translated("financeNote", "p", 'class="ac-board-note"')}
          </section>
          <aside class="ac-tools-panel" aria-labelledby="ac-tools-title">
            ${translated("toolsTitle", "h2", 'id="ac-tools-title"')}
            <div class="ac-tool-links">
              ${toolLink("payments", "paymentsDescription", "/internal/admin/payments", "payment")}
              ${toolLink("customers", "customersDescription", "/internal/admin/customer-data", "people")}
              ${toolLink("recovery", "recoveryDescription", "/internal/admin/recovery", "recovery")}
            </div>
            <details class="ac-more-tools"><summary>${translated("moreTools")}${icon("chevron", "ac-disclosure-icon")}</summary><nav>${translated("membership", "a", 'href="/internal/admin/member-intelligence"')}${translated("modelLink", "a", 'href="/internal/admin/model-link"')}${translated("allJobs", "a", 'href="/internal/admin/jobs/all"')}</nav></details>
            <a class="ac-system-link" href="/internal/admin/control-room"><span>${translated("controlRoom", "strong")}${translated("controlRoomDescription", "span")}</span>${icon("arrow")}</a>
          </aside>
        </div>
        <noscript><div class="ac-notice"><div><p>${text("noJs")}</p><a class="ac-button ac-button-primary" href="/internal/admin/jobs/all">${text("allJobs")}</a></div></div><style nonce="${nonce}">#ac-loading,#ac-progress,#ac-filters,#ac-results-summary{display:none}</style></noscript>
        <footer class="ac-footer">${translated("footer")}<span id="ac-updated">${text("notUpdated")}</span></footer>
      </main>
    </div>
  </div>
  <script nonce="${nonce}" data-admin-console-client>${clientScript}</script>
</body>
</html>`;
  return new Response(html, { headers });
}
