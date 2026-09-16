/* MMD Privé / SIGIL renewal — canonical payments-worker renderer. */
export const RENEWAL_PAGE_MARKER = "mmd-renewal-single";
export const RENEWAL_PAGE_NAME = "sigil-pay-renewal";
export const RENEWAL_ROUTE_SOURCE = "member-dashboard-chat-worker:single-renewal-renderer";

const WORKER_NAME = "member-dashboard-chat-worker";
const RENEWAL_PATHS = new Set(["/pay/renewal", "/sigil/pay/renewal"]);
const PLANS = new Set(["trial", "standard", "premium"]);
const PAYMENT_INSTRUCTIONS_URL = "https://sigil.mmdbkk.com/v1/confirm/payment-instructions";
const PAYMENT_PROOF_URL = "https://sigil.mmdbkk.com/v1/pay/slip/evidence";

export function normalizePath(pathname) {
  let clean = String(pathname || "/").split("?")[0].split("#")[0];
  if (clean.length > 1 && clean.endsWith("/")) clean = clean.slice(0, -1);
  return clean || "/";
}

export function isRenewalRoute(pathname) {
  return RENEWAL_PATHS.has(normalizePath(pathname));
}

export function renewalHeaders(extra = {}) {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-content-type-options": "nosniff",
    "x-mmd-worker": WORKER_NAME,
    "x-mmd-page": RENEWAL_PAGE_NAME,
    "x-mmd-route-source": RENEWAL_ROUTE_SOURCE,
    "x-mmd-upstream-source": "local-renderer",
    ...extra,
  };
}

export function renderRenewalResponse(request, env = {}) {
  if (!request || !["GET", "HEAD"].includes(request.method)) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: renewalHeaders({ allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" }),
    });
  }
  const html = renderRenewalHtml({ state: getInitialState(new URL(request.url)), env });
  return new Response(request.method === "HEAD" ? null : html, { status: 200, headers: renewalHeaders() });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizePlan(value) {
  const plan = String(value || "").trim().toLowerCase();
  return PLANS.has(plan) ? plan : "premium";
}

function safePath(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("//")) return fallback;
  try {
    const url = new URL(raw, "https://mmdbkk.com");
    return url.origin === "https://mmdbkk.com" ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}

function safeHttpsUrl(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw, "https://sigil.mmdbkk.com");
    return url.protocol === "https:" ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function getInitialState(url) {
  return {
    token: String(url.searchParams.get("t") || "").trim(),
    sessionId: String(url.searchParams.get("session_id") || url.searchParams.get("sid") || "").trim(),
    paymentRef: String(url.searchParams.get("payment_ref") || url.searchParams.get("ref") || "").trim(),
    plan: normalizePlan(url.searchParams.get("package") || url.searchParams.get("plan") || "premium"),
  };
}

function contextQuery(state) {
  const query = new URLSearchParams();
  if (state.token) query.set("t", state.token);
  if (state.sessionId) query.set("session_id", state.sessionId);
  if (state.paymentRef) query.set("payment_ref", state.paymentRef);
  query.set("package", state.plan);
  return `?${query.toString()}`;
}

export function renderRenewalHtml({ state, env = {} }) {
  const context = contextQuery(state);
  const instructionsUrl = safeHttpsUrl(env.PAYMENT_INSTRUCTIONS_URL, PAYMENT_INSTRUCTIONS_URL);
  const proofUrl = safeHttpsUrl(env.PAYMENT_PROOF_URL, PAYMENT_PROOF_URL);
  const supportUrl = safePath(env.SUPPORT_URL || "/contact", "/contact");
  const paymentsUrl = `/member/payments${context}`;
  const dashboardUrl = `/member/dashboard${context}`;
  const membershipUrl = `/sigil/member/membership?intent=renewal`;
  const initialRef = state.paymentRef || state.sessionId || "";
  const planLabel = { trial: "Trial", standard: "Standard", premium: "Premium" }[state.plan];

  return `<!doctype html>
<html lang="th"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#080705">
<title>MMD Privé — ต่ออายุสมาชิก</title>
<style>
:root{color-scheme:dark;--bg:#080705;--ink:#fff8ed;--soft:rgba(255,248,237,.75);--muted:rgba(255,248,237,.50);--faint:rgba(255,248,237,.32);--gold:#d8af61;--gold2:#f4d594;--blue:#b5d8f7;--line:rgba(236,200,130,.20);--line2:rgba(236,200,130,.44);--good:#a8dfbf;--danger:#ffb3aa;--r:28px;--shadow:0 28px 80px rgba(0,0,0,.46)}
*{box-sizing:border-box}html{background:var(--bg);scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",Inter,"IBM Plex Sans Thai",system-ui,sans-serif;overflow-x:hidden}button,input,textarea{font:inherit}button,a{-webkit-tap-highlight-color:transparent}a{color:inherit;text-decoration:none}button{color:inherit}[hidden]{display:none!important}h1,h2,h3,p{margin:0}p{color:var(--soft);font-size:14px;line-height:1.72}
.mmd-renewal-single{min-height:100svh;position:relative;isolation:isolate;overflow:clip;background:linear-gradient(180deg,#080705,#050504 56%,#090704)}.ambient{position:fixed;z-index:-2;inset:0;pointer-events:none;overflow:hidden}.ambient:before{content:"";position:absolute;width:100vw;height:100vw;top:-28vw;right:-46vw;border-radius:50%;background:radial-gradient(circle,rgba(216,175,97,.23),transparent 68%)}.ambient:after{content:"";position:absolute;inset:0;opacity:.14;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(circle at 70% 24%,#000,transparent 72%)}
.shell{width:min(1100px,calc(100% - 24px));margin-inline:auto}.topbar{position:fixed;z-index:50;top:max(10px,env(safe-area-inset-top));left:50%;width:min(1100px,calc(100% - 20px));min-height:58px;transform:translateX(-50%);display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 9px 8px 15px;border:1px solid var(--line);border-radius:999px;background:rgba(12,10,8,.80);backdrop-filter:blur(24px) saturate(150%);box-shadow:0 16px 54px rgba(0,0,0,.36)}.brand{display:flex;align-items:baseline;gap:9px;min-width:0}.brand strong{color:var(--gold2);font-size:12px;font-weight:850;letter-spacing:.14em}.brand span{display:none;color:var(--muted);font-size:11px}.top-actions{display:flex;gap:6px}.top-actions a{min-height:38px;display:inline-flex;align-items:center;justify-content:center;padding:0 13px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.035);color:var(--soft);font-size:10px;font-weight:780}
.hero{min-height:78svh;display:grid;align-content:center;gap:20px;padding:104px 0 42px}.hero-copy{display:grid;gap:14px}.eyebrow,.kicker{display:inline-flex;align-items:center;gap:10px;color:var(--gold2);font-size:10px;font-weight:820;letter-spacing:.15em;text-transform:uppercase}.eyebrow:before{content:"";width:34px;height:1px;background:var(--line2)}h1{max-width:820px;color:#fff9f1;font-size:clamp(52px,15vw,92px);font-weight:660;line-height:.90;letter-spacing:-.067em}h2{color:#fff9f1;font-size:clamp(32px,9vw,54px);font-weight:690;line-height:.98;letter-spacing:-.05em}h3{color:#fff9f1;font-size:clamp(22px,7vw,34px);font-weight:680;line-height:1.05;letter-spacing:-.038em}.glass{border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.025)),rgba(20,17,13,.88);box-shadow:var(--shadow),inset 0 1px rgba(255,255,255,.03);backdrop-filter:blur(22px) saturate(135%)}
.owner-card,.status-card,.section{border-radius:var(--r)}.owner-card{display:grid;gap:9px;padding:20px}.owner-card strong{color:var(--ink);font-size:22px;font-weight:680;line-height:1.35}.per-line{display:grid;grid-template-columns:10px 1fr;gap:11px;padding:12px 14px;border:1px solid var(--line);border-radius:20px;background:rgba(0,0,0,.24);color:var(--soft);font-size:12px;line-height:1.55}.per-line i,.pulse{width:8px;height:8px;margin-top:5px;border-radius:50%;background:var(--gold2);box-shadow:0 0 20px rgba(244,213,148,.78)}
.status-card{overflow:hidden}.status-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:19px;border-bottom:1px solid var(--line)}.micro{display:block;color:var(--faint);font-size:9px;font-weight:810;letter-spacing:.14em;text-transform:uppercase}.status-head strong{display:block;margin-top:7px;color:var(--ink);font-size:25px;font-weight:690}.status-pill{min-height:34px;display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid var(--line);border-radius:999px;color:var(--gold2);font-size:9px;font-weight:820}.status-pill .pulse{margin:0;width:7px;height:7px}.status-message{padding:15px 19px;border-bottom:1px solid var(--line);color:var(--soft);font-size:13px;line-height:1.65}.summary{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:14px 16px 18px}.summary div{min-width:0;padding:13px;border:1px solid rgba(236,200,130,.13);border-radius:17px;background:rgba(255,255,255,.026)}.summary div:last-child{grid-column:1/-1}.summary span{display:block;margin-bottom:6px;color:var(--faint);font-size:9px;font-weight:800;letter-spacing:.12em}.summary strong{display:block;overflow:hidden;color:var(--ink);font-size:14px;font-weight:670;text-overflow:ellipsis;white-space:nowrap}
.section{margin-bottom:18px;padding:18px;scroll-margin-top:84px}.section-head{display:grid;gap:8px;margin-bottom:17px}.instruction-state{display:grid;gap:8px;padding:16px;border:1px solid var(--line);border-radius:20px;background:rgba(0,0,0,.20)}.instruction-state strong{color:var(--ink);font-size:15px}.instruction-state.is-error{border-color:rgba(255,179,170,.30)}.method-grid{display:grid;gap:12px;margin-top:12px}.method-card{padding:15px;border:1px solid rgba(236,200,130,.15);border-radius:20px;background:rgba(0,0,0,.20)}.method-card .micro{margin-bottom:8px}.amount-line{font-size:clamp(34px,10vw,58px);font-weight:720;letter-spacing:-.05em;color:var(--gold2)}.qr-frame{display:grid;place-items:center;margin-top:12px;padding:14px;border-radius:18px;background:#f7f2e9}.qr-frame img{width:min(260px,100%);aspect-ratio:1;object-fit:contain}.bank-list{display:grid;gap:8px;margin-top:12px}.bank-row{display:grid;gap:4px;padding:12px;border:1px solid rgba(236,200,130,.12);border-radius:15px;background:rgba(255,255,255,.022)}.bank-row span{color:var(--faint);font-size:9px;font-weight:810}.bank-row strong{font-size:14px;word-break:break-word}.copy-button,.soft-button,.submit{min-height:48px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line2);border-radius:16px;background:linear-gradient(180deg,rgba(216,175,97,.18),rgba(255,255,255,.035));color:var(--ink);font-size:11px;font-weight:820;text-align:center;cursor:pointer}.copy-button{width:100%;margin-top:10px}.soft-button{padding:0 16px}.submit{width:100%;margin-top:12px}.submit:disabled{opacity:.48;cursor:not-allowed}.proof-grid{display:grid;gap:12px}.mini{padding:15px;border:1px solid rgba(236,200,130,.14);border-radius:21px;background:rgba(255,255,255,.027)}.upload{position:relative;min-height:176px;display:grid;place-items:center;align-content:center;gap:7px;padding:20px;border:1px dashed var(--line2);border-radius:20px;background:rgba(0,0,0,.19);text-align:center;cursor:pointer}.upload input{position:absolute;width:1px;height:1px;opacity:0}.upload b{color:var(--ink);font-size:21px}.upload small{color:var(--muted);font-size:11px}.preview{overflow:hidden;margin-top:12px;border:1px solid rgba(236,200,130,.14);border-radius:17px;background:rgba(0,0,0,.20)}.preview img{width:100%;max-height:330px;display:block;object-fit:contain}.preview div{padding:13px;color:var(--soft);font-size:12px}.field{display:grid;gap:7px;margin-top:12px}.field span{color:var(--faint);font-size:9px;font-weight:810;letter-spacing:.12em}.field textarea{width:100%;min-height:104px;padding:13px 14px;border:1px solid rgba(236,200,130,.15);border-radius:17px;outline:0;background:rgba(0,0,0,.22);color:var(--ink);resize:vertical}.form-note{min-height:38px;margin-top:10px;color:var(--muted);font-size:11px;line-height:1.55}.form-note.is-error{color:var(--danger)}.form-note.is-success{color:var(--good)}.review-list{display:grid;gap:8px;margin-top:12px}.review-list div{display:grid;grid-template-columns:32px 1fr;align-items:center;gap:9px;padding:11px;border:1px solid rgba(236,200,130,.12);border-radius:15px;background:rgba(255,255,255,.022)}.review-list strong{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:rgba(181,216,247,.09);color:var(--blue);font-size:10px}.review-list p{font-size:12px;line-height:1.5}.help{display:grid;gap:14px;margin-bottom:48px}.help-actions{display:grid;gap:8px}
@media(min-width:560px){.brand span{display:inline}.summary{grid-template-columns:repeat(3,1fr)}.summary div:last-child{grid-column:auto}.method-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:820px){.hero{grid-template-columns:minmax(0,1fr) minmax(380px,.72fr);align-items:center;gap:clamp(34px,6vw,78px);padding-top:118px}.section{padding:24px}.proof-grid{grid-template-columns:minmax(0,1fr) minmax(320px,.72fr);gap:16px}.help{grid-template-columns:1fr minmax(300px,.46fr);align-items:center}.help-actions{align-content:center}}
</style></head><body>
<main class="mmd-renewal-single" data-page="mmd-renewal-single" data-brand="MMD / SIGIL" data-payment-instructions-url="${escapeHtml(instructionsUrl)}" data-proof-url="${escapeHtml(proofUrl)}" data-token="${escapeHtml(state.token)}" data-session-id="${escapeHtml(state.sessionId)}" data-payment-ref="${escapeHtml(state.paymentRef)}" data-initial-plan="${escapeHtml(state.plan)}" data-initial-ref="${escapeHtml(initialRef)}">
<div class="ambient" aria-hidden="true"></div>
<nav class="topbar" aria-label="Renewal navigation"><a class="brand" href="/sigil/membership"><strong>MMD PRIVÉ</strong><span>Renewal Payment Review</span></a><div class="top-actions"><a href="${escapeHtml(paymentsUrl)}">ดูสถานะ</a></div></nav>

<section class="hero shell"><div class="hero-copy"><span class="eyebrow">Membership Renewal</span><h1>ต่ออายุ<br>จากยอดจริง</h1><div class="owner-card glass"><strong>หน้านี้ไม่เดายอด และไม่สร้าง QR เองครับ</strong><p>ยอด บัญชี และ QR จะเปิดเมื่อรายการนี้ผ่าน signed payment session ของ MMD แล้วเท่านั้น ข้อมูลทั้งหมดมาจาก Payment Instructions v1 ของ payments-worker</p></div><div class="per-line"><i></i><span>ถ้าหน้านี้ยังไม่แสดงข้อมูลชำระ อย่าโอนจากข้อมูลเก่าหรือสกรีนช็อตเดิม ทักเปอร์ให้เปิดรายการใหม่ก่อนครับ</span></div></div>
<aside class="status-card glass" aria-live="polite"><header class="status-head"><div><span class="micro">สถานะรายการนี้</span><strong data-ui-status-title>กำลังตรวจรายการ</strong></div><div class="status-pill"><i class="pulse"></i><b data-ui-pill>กำลังเช็ก</b></div></header><div class="status-message" data-ui-message>กำลังโหลดข้อมูลชำระที่ยืนยันจาก payments-worker</div><div class="summary"><div><span>PACKAGE CONTEXT</span><strong>${escapeHtml(planLabel)}</strong></div><div><span>AMOUNT DUE</span><strong data-ui-amount>—</strong></div><div><span>REFERENCE</span><strong data-ui-ref>${initialRef ? escapeHtml(initialRef) : "—"}</strong></div></div></aside></section>

<section class="section shell glass" id="payment-section"><div class="section-head"><span class="kicker">01 · PAYMENT INSTRUCTIONS</span><h2>ใช้ข้อมูลที่ยืนยันแล้วเท่านั้น</h2><p>ยอดและปลายทางชำระในส่วนนี้มาจาก payments-worker โดยตรง Browser ไม่มีสิทธิ์คำนวณยอดหรือสร้าง PromptPay QR เอง</p></div>
<div class="instruction-state" data-instruction-state><strong>กำลังเปิดข้อมูลชำระ</strong><p>กำลังตรวจ signed token และสถานะรายการครับ</p></div>
<div class="method-grid" data-method-grid hidden>
  <article class="method-card" data-promptpay-card hidden><span class="micro">PROMPTPAY</span><div class="amount-line" data-canonical-amount>—</div><p data-promptpay-ref></p><div class="qr-frame" data-qr-wrap hidden><img data-qr alt="PromptPay QR จาก payments-worker"></div></article>
  <article class="method-card" data-bank-card hidden><span class="micro">BANK TRANSFER</span><div class="bank-list"><div class="bank-row"><span>BANK</span><strong data-bank-name>—</strong></div><div class="bank-row"><span>ACCOUNT NAME</span><strong data-bank-account-name>—</strong></div><div class="bank-row"><span>ACCOUNT NUMBER</span><strong data-bank-number>—</strong></div></div><button type="button" class="copy-button" data-copy-bank disabled>คัดลอกเลขบัญชี</button></article>
  <article class="method-card" data-card-card hidden><span class="micro">CARD / PAYPAL</span><h3>เปิดหน้าชำระที่ MMD ยืนยัน</h3><p>ลิงก์นี้มาจาก Payment Instructions v1 เท่านั้น</p><a class="soft-button" data-card-link target="_blank" rel="noopener noreferrer" hidden>เปิดหน้าชำระ</a></article>
</div></section>

<section class="section shell glass" id="proof-section"><div class="section-head"><span class="kicker">02 · PAYMENT PROOF</span><h2>ส่งหลักฐานเข้ารายการเดิม</h2><p>หลักฐานจะผูกกับ canonical payment reference เดิม ยอดจริงถูกอ่านจาก payment record ฝั่ง server ไม่รับยอดจากฟอร์มนี้</p></div><div class="proof-grid"><form class="mini" data-proof-form novalidate><label class="upload"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" data-proof-file><b data-upload-title>แตะเพื่อเลือกสลิป</b><small>JPG · PNG · WEBP · PDF / ไม่เกิน 15 MB</small></label><div class="preview" data-preview hidden></div><label class="field"><span>หมายเหตุเพิ่มเติม (ถ้ามี)</span><textarea rows="4" maxlength="500" placeholder="เช่น โอนจากชื่อบัญชีอื่น" data-proof-note></textarea></label><button type="submit" class="submit" data-submit-proof disabled>ส่งหลักฐานให้ MMD ตรวจ</button><p class="form-note" data-form-note>ปุ่มจะเปิดเมื่อ Payment Instructions v1 ยืนยันรายการนี้แล้วครับ</p></form><aside class="mini"><span class="kicker">OFFICIAL REVIEW</span><h3>ส่งสลิป ≠ ยืนยันการชำระ</h3><p>หลังส่ง หลักฐานจะเข้าสู่ pending verification และต้องผ่าน Official Verify ก่อนสถานะสมาชิกเปลี่ยน</p><div class="review-list"><div><strong>1</strong><p>รับไฟล์และผูก payment reference</p></div><div><strong>2</strong><p>payments-worker บันทึก evidence</p></div><div><strong>3</strong><p>MMD ตรวจยอดจริงก่อนอัปเดตสิทธิ์</p></div></div><a class="soft-button" style="margin-top:12px" href="${escapeHtml(paymentsUrl)}">ดูสถานะการชำระ</a></aside></div></section>

<section class="section shell glass help"><div class="section-head" style="margin:0"><span class="kicker">NEED HELP?</span><h2>ข้อมูลไม่ขึ้น ให้หยุดก่อนโอนครับ</h2><p>ไม่ใช้เลขบัญชีหรือ QR จากข้อความเก่า หาก signed payment session ยังไม่พร้อม ให้กลับไปเริ่ม renewal จากหน้า Membership หรือทักเปอร์</p></div><div class="help-actions"><a class="soft-button" href="${escapeHtml(membershipUrl)}">กลับหน้า Membership</a><a class="soft-button" href="${escapeHtml(supportUrl)}">คุยกับเปอร์</a><a class="soft-button" href="${escapeHtml(dashboardUrl)}">กลับ Member Area</a></div></section>
</main>
<script>(function(){"use strict";
var AUTHORITY="payments-worker",SCHEMA="mmd_payment_instructions_v1",root=document.querySelector("[data-page='mmd-renewal-single']");if(!root)return;
var state={amount:null,paymentRef:root.dataset.paymentRef||"",sessionId:root.dataset.sessionId||"",ready:false,proofLocked:false,file:null,submitting:false,copyValue:""};
function one(s){return root.querySelector(s)}function all(s){return Array.prototype.slice.call(root.querySelectorAll(s))}function text(s,v){var n=one(s);if(n)n.textContent=v}function money(v){var n=Number(v);return Number.isFinite(n)&&n>0?new Intl.NumberFormat("th-TH",{style:"currency",currency:"THB",maximumFractionDigits:n%1===0?0:2}).format(n):"—"}function safeHttps(v){try{var u=new URL(String(v||""));return u.protocol==="https:"?u.toString():""}catch(_){return""}}
function status(title,pill,message){text("[data-ui-status-title]",title);text("[data-ui-pill]",pill);text("[data-ui-message]",message)}
function note(message,tone){var n=one("[data-form-note]");if(!n)return;n.textContent=message;n.classList.toggle("is-error",tone==="error");n.classList.toggle("is-success",tone==="success")}
function setInstructionState(title,message,error){var n=one("[data-instruction-state]");if(!n)return;n.hidden=false;n.classList.toggle("is-error",!!error);n.innerHTML="";var a=document.createElement("strong"),b=document.createElement("p");a.textContent=title;b.textContent=message;n.appendChild(a);n.appendChild(b)}
function lockPayment(message){state.ready=false;state.copyValue="";var grid=one("[data-method-grid]");if(grid)grid.hidden=true;all("[data-promptpay-card],[data-bank-card],[data-card-card]").forEach(function(n){n.hidden=true});var submit=one("[data-submit-proof]"),copy=one("[data-copy-bank]");if(submit)submit.disabled=true;if(copy)copy.disabled=true;if(message)setInstructionState("ยังไม่เปิดข้อมูลชำระ",message,true)}
function proofState(reason){if(reason==="payment_verified"){state.proofLocked=true;status("ชำระเงินยืนยันแล้ว","Verified","รายการนี้ยืนยันการชำระแล้วครับ");note("รายการยืนยันแล้ว ไม่ต้องส่งหลักฐานซ้ำ","success");setInstructionState("รายการยืนยันแล้ว","ไม่ต้องชำระหรือส่งสลิปซ้ำครับ",false);return true}if(reason==="proof_received_waiting_verification"){state.proofLocked=true;status("กำลังตรวจหลักฐาน","Pending review","MMD ได้รับหลักฐานแล้ว กำลังตรวจยอดจริงครับ");note("พบหลักฐานเดิมแล้ว ไม่ต้องส่งซ้ำ","success");setInstructionState("รับหลักฐานแล้ว","รอ Official Verify ก่อนสถานะสมาชิกเปลี่ยนครับ",false);return true}return false}
function renderInstructions(d){if(!d||d.ok!==true||d.authority!==AUTHORITY||d.schema!==SCHEMA)throw new Error("payment_instructions_contract_invalid");if(d.session_id)state.sessionId=String(d.session_id);if(d.payment_ref)state.paymentRef=String(d.payment_ref);text("[data-ui-ref]",state.paymentRef||state.sessionId||"—");if(proofState(String(d.reason||""))){lockPayment("");return}if(d.available!==true){lockPayment(String(d.reason||"Payment instructions are not available for this item."));status("ยังไม่พร้อมชำระ","Locked","ยังไม่มีข้อมูลชำระที่ยืนยันสำหรับรายการนี้ครับ");return}var amount=Number(d.amount_due_thb);if(!Number.isFinite(amount)||amount<=0)throw new Error("canonical_amount_missing");state.amount=amount;state.ready=true;state.proofLocked=false;text("[data-ui-amount]",money(amount));text("[data-canonical-amount]",money(amount));var i=d.instructions||{},pp=i.promptpay||{},bank=i.bank_transfer||{},card=i.paypal_card||{},grid=one("[data-method-grid]"),shown=0;if(grid)grid.hidden=false;
var ppCard=one("[data-promptpay-card]");if(ppCard&&pp.enabled===true){ppCard.hidden=false;shown++;text("[data-promptpay-ref]",pp.display_ref?"PromptPay: "+pp.display_ref:"PromptPay");var qr=safeHttps(pp.qr_url),wrap=one("[data-qr-wrap]"),img=one("[data-qr]");if(qr&&wrap&&img){img.src=qr;wrap.hidden=false}else if(wrap)wrap.hidden=true}else if(ppCard)ppCard.hidden=true;
var bankCard=one("[data-bank-card]");if(bankCard&&bank.enabled===true&&bank.account_number){bankCard.hidden=false;shown++;text("[data-bank-name]",bank.bank_name_th||bank.bank_name_en||bank.provider||"Bank Transfer");text("[data-bank-account-name]",bank.account_name_th||bank.account_name_en||"MMD Privé");text("[data-bank-number]",bank.account_number);state.copyValue=String(bank.account_number);var copy=one("[data-copy-bank]");if(copy)copy.disabled=false}else if(bankCard)bankCard.hidden=true;
var cardCard=one("[data-card-card]"),link=one("[data-card-link]"),cardUrl=safeHttps(card.url);if(cardCard&&link&&card.enabled===true&&cardUrl){cardCard.hidden=false;shown++;link.href=cardUrl;link.hidden=false}else if(cardCard)cardCard.hidden=true;
if(!shown)throw new Error("payment_destination_missing");var info=one("[data-instruction-state]");if(info)info.hidden=true;var submit=one("[data-submit-proof]");if(submit)submit.disabled=!state.file;status("พร้อมชำระ","Canonical","ยอดและปลายทางชำระยืนยันจาก payments-worker แล้วครับ");note("เลือกสลิปได้หลังชำระ ระบบจะผูกหลักฐานกับ payment reference เดิม","")}
function loadInstructions(){var token=String(root.dataset.token||"").trim();if(!token){lockPayment("ลิงก์นี้ไม่มี signed payment token กรุณาเริ่มรายการต่ออายุใหม่จากหน้า Membership");status("ต้องเปิดรายการใหม่","Signed token required","ไม่แสดงเลขบัญชีหรือ QR จากข้อมูลเก่าครับ");return Promise.resolve()}setInstructionState("กำลังตรวจ Payment Instructions v1","กำลังตรวจ signed token และสถานะรายการครับ",false);return fetch(root.dataset.paymentInstructionsUrl,{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify({t:token}),cache:"no-store"}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(!r.ok)throw new Error(d.error||"payment_instructions_failed");return d})}).then(renderInstructions).catch(function(){lockPayment("payments-worker ยังไม่ยืนยันข้อมูลชำระ กรุณาหยุดก่อนโอนและลองใหม่หรือติดต่อเปอร์");status("ข้อมูลชำระไม่พร้อม","Fail closed","ไม่แสดงบัญชีหรือ QR จนกว่าจะตรวจ contract ผ่านครับ")})}
function preview(file){var p=one("[data-preview]");if(!p)return;p.innerHTML="";if(!file){p.hidden=true;text("[data-upload-title]","แตะเพื่อเลือกสลิป");return}p.hidden=false;if(String(file.type||"").indexOf("image/")===0){var img=document.createElement("img");img.alt="ตัวอย่างสลิป";img.src=URL.createObjectURL(file);p.appendChild(img)}else{var d=document.createElement("div");d.textContent="เลือกไฟล์: "+file.name;p.appendChild(d)}text("[data-upload-title]",file.name)}
function bind(){var copy=one("[data-copy-bank]");if(copy)copy.addEventListener("click",function(){if(!state.copyValue||!navigator.clipboard)return;navigator.clipboard.writeText(state.copyValue).then(function(){copy.textContent="คัดลอกแล้ว";setTimeout(function(){copy.textContent="คัดลอกเลขบัญชี"},1300)})});var fi=one("[data-proof-file]");if(fi)fi.addEventListener("change",function(){var f=fi.files&&fi.files[0];if(!f){state.file=null;preview(null);var b=one("[data-submit-proof]");if(b)b.disabled=true;return}if(f.size>15*1024*1024){fi.value="";state.file=null;preview(null);note("ไฟล์ใหญ่เกิน 15 MB ครับ","error");return}state.file=f;preview(f);var b=one("[data-submit-proof]");if(b)b.disabled=!(state.ready&&!state.proofLocked);note(state.ready?"เลือกสลิปแล้วครับ ตรวจอีกครั้งก่อนส่ง":"เลือกไฟล์แล้ว แต่ยังส่งไม่ได้จนกว่า Payment Instructions v1 จะยืนยันรายการนี้",state.ready?"":"error")});var form=one("[data-proof-form]");if(form)form.addEventListener("submit",submit)}
function submit(e){e.preventDefault();if(state.submitting||state.proofLocked)return;if(!state.ready||!state.paymentRef){note("ยังไม่มี canonical payment reference จึงไม่ส่งหลักฐานจากหน้านี้ครับ","error");return}if(!state.file){note("เลือกสลิปก่อนส่งครับ","error");return}var btn=one("[data-submit-proof]"),memo=one("[data-proof-note]"),fd=new FormData();fd.append("payment_ref",state.paymentRef);if(state.sessionId)fd.append("session_id",state.sessionId);fd.append("payment_stage","membership");fd.append("source_page","sigil_pay");fd.append("file",state.file);if(memo&&memo.value.trim())fd.append("note",memo.value.trim());state.submitting=true;if(btn){btn.disabled=true;btn.textContent="กำลังส่งหลักฐาน..."}note("กำลังส่งหลักฐานเข้า payments-worker","");fetch(root.dataset.proofUrl,{method:"POST",body:fd,headers:{Accept:"application/json"}}).then(function(r){return r.json().catch(function(){return{}}).then(function(d){if(!r.ok||d.ok===false)throw new Error(d.error||d.message||"proof_submit_failed");return d})}).then(function(d){state.proofLocked=true;status("กำลังตรวจหลักฐาน","Pending review","รับหลักฐานแล้วครับ ต้องผ่าน Official Verify ก่อน");note(d.already_submitted?"พบหลักฐานเดิมแล้ว ไม่ต้องส่งซ้ำ":"ได้รับหลักฐานแล้วครับ รอตรวจยอดจริงต่อ","success");return loadInstructions()}).catch(function(){note("ส่งหลักฐานยังไม่สำเร็จครับ ลองอีกครั้งหรือติดต่อเปอร์","error");if(btn)btn.disabled=false}).finally(function(){state.submitting=false;if(btn)btn.textContent="ส่งหลักฐานให้ MMD ตรวจ"})}
bind();lockPayment("");loadInstructions();setInterval(loadInstructions,15000)})();</script>
</body></html>`;
}
