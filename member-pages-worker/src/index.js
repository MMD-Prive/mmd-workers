const WORKER = "member-pages-worker";
const VERSION = "20260622-payment-first-profile-flow";

const PAGE_PATHS = new Set([
  "/sigil/membership", "/sigil/membership/",
  "/member/membership", "/member/membership/",
  "/pay/membership", "/pay/membership/",
  "/pay/pending-verification", "/pay/pending-verification/",
  "/member/profile", "/member/profile/",
]);

const PACKAGES = [
  { key: "trial", title: "Trial", eyebrow: "GUEST PASS", price: "เริ่มจาก ฿5,000", amount: 5000, copy: "Guest Pass สำหรับเริ่มใช้งานแบบมีกรอบเวลา" },
  { key: "standard", title: "Standard", eyebrow: "STANDARD PACKAGE", price: "เริ่มจาก ฿15,000", amount: 15000, copy: "แพ็กเกจหลักสำหรับเริ่มใช้ MMD Privé อย่างเป็นระบบ" },
  { key: "premium", title: "Premium", eyebrow: "PREMIUM PACKAGE", price: "เริ่มจาก ฿25,000", amount: 25000, copy: "แพ็กเกจสำหรับความต้องการและ companion preference ที่ละเอียดขึ้น" },
];

export function isMemberPagePath(url) {
  return PAGE_PATHS.has(url.pathname.toLowerCase());
}

export function isMembershipPath(url) {
  const p = url.pathname.toLowerCase();
  return p === "/member/membership" || p === "/member/membership/";
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: headers("text/plain") });
    if (method !== "GET" && method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: headers("text/plain; charset=utf-8") });
    if (!isMemberPagePath(url)) return new Response("Not Found", { status: 404, headers: headers("text/plain; charset=utf-8") });
    const p = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    if (p === "/sigil/membership") return renderSigilMembership(request);
    if (p === "/pay/membership") return renderPay(request, env);
    if (p === "/pay/pending-verification") return renderPending(request);
    if (p === "/member/profile") return renderProfile(request);
    return renderMembership(request);
  },
};

export function renderMembership(request) {
  const url = new URL(request.url);
  const plan = normalizePlan(url.searchParams.get("plan") || url.searchParams.get("package"));
  const cards = PACKAGES.map((pkg) => packageCard(pkg, plan, url.search)).join("");
  return page(request, "member-membership", `
    ${nav(url.search)}
    <section class="membership-hero" aria-labelledby="membership-title">
      <div class="panel membership-intro">
        <p class="eyebrow">Member Package Selection</p>
        <h1 id="membership-title">Membership</h1>
        <p class="lead">เลือกแพ็กเกจที่ตรงกับจังหวะของคุณ แล้วไปต่อที่หน้าโอนเงินเฉพาะเมื่อพร้อมสร้าง payment intent เท่านั้น</p>
        <div class="membership-points" aria-label="Membership process">
          <span>Choose package</span>
          <span>Submit proof</span>
          <span>Official verification</span>
        </div>
        <p class="fine">สถานะสมาชิกและ points จะเริ่มหลังยอดจริงผ่าน official verification แล้วเท่านั้น สลิปหรือหลักฐานเป็นข้อมูลรอตรวจสอบ ไม่ใช่การยืนยันสมาชิกทันที</p>
        <p class="actions"><a class="btn" href="${attr(appendQuery("/pay/membership", url.search, plan ? { plan } : {}))}">Continue to Payment</a><a class="btn ghost" href="${attr(appendQuery("/member/dashboard", url.search))}">Member Dashboard</a></p>
      </div>
      <aside class="panel membership-rule" aria-label="Verification rule">
        <p class="eyebrow">Verification first</p>
        <h2>จ่ายแล้วรอตรวจสอบก่อนเปิดสิทธิ์</h2>
        <ul class="checklist">
          <li>proof is not payment truth</li>
          <li>verified funds are payment truth</li>
          <li>points follow verified funds only</li>
        </ul>
      </aside>
    </section>
    <section class="package-grid" aria-label="Available membership packages">${cards}</section>
    <section class="panel black membership-note"><p class="eyebrow">BLACK CARD NOTE</p><h2>ไม่ใช่แพ็กเกจที่กดซื้อ</h2><p>350 points คือ Black Card review eligible เท่านั้น ไม่ใช่ auto approved และไม่ใช่ทางลัดจากการส่งสลิป</p></section>
  `);
}

export function renderSigilMembership(request) {
  const url = new URL(request.url);
  const packages = PACKAGES.map((pkg) => `<article class="pkg"><p class="eyebrow">${html(pkg.eyebrow)}</p><h2>${html(pkg.title)}</h2><p>${html(pkg.copy)}</p></article>`).join("");
  return page(request, "sigil-membership", `
    ${nav(url.search)}
    <section class="hero"><div class="panel"><p class="eyebrow">SIGIL ACCESS CONDITIONS</p><h1>Renewal / Access Conditions</h1><p>หน้านี้คือเงื่อนไขการต่ออายุและการเข้าถึง ไม่ใช่หน้า checkout และไม่ใช่การยืนยันสถานะสมาชิกทันที</p><p>หากมีการชำระเงินหรือส่งหลักฐาน ระบบจะถือเป็นข้อมูลรอตรวจสอบเท่านั้น การยืนยันสมาชิกเกิดขึ้นหลัง official verification ครบถ้วนเท่านั้น</p><p class="actions"><a class="btn" href="${attr(appendQuery("/member/membership", url.search))}">ดูแพ็กเกจสมาชิก</a><a class="btn ghost" href="${attr(appendQuery("/member/dashboard", url.search))}">Member Dashboard</a></p></div><aside class="panel side"><h2>Access rule</h2><p>สถานะจริงอ้างอิงจากข้อมูลที่ตรวจสอบแล้วเท่านั้น ไม่ใช่จากสลิป ข้อความ หรือการกรอกฟอร์มเพียงอย่างเดียว</p><p>Black Card เป็น private consideration/review ไม่ใช่ automatic approval และไม่ใช่แพ็กเกจที่กดซื้อเอง</p></aside></section>
    <section class="grid">${packages}</section>
  `);
}

export function renderPay(request, env = {}) {
  const url = new URL(request.url);
  const plan = normalizePlan(url.searchParams.get("plan") || url.searchParams.get("package")) || "standard";
  const pkg = getPackage(plan);
  const amount = positive(url.searchParams.get("amount")) || pkg.amount;
  const apiBase = String(env.PAYMENTS_API_BASE || "https://payments-worker.malemodel-bkk.workers.dev").replace(/\/+$/, "");
  return page(request, "pay-membership", `
    ${nav(url.search)}
    <section class="hero"><div class="panel"><p class="eyebrow">Payment First Membership</p><h1>Transfer First</h1><p>กรุณาโอนเงินตามยอดแพ็กเกจที่เลือก แล้วส่งหลักฐานเพื่อให้ระบบตรวจสอบ สลิปเป็น evidence เท่านั้น สถานะสมาชิกและ points จะเริ่มหลัง official verification complete</p><div class="summary"><b>Package</b><span>${html(pkg.title)}</span><b>Amount</b><span>฿${money(amount)}</span><b>Status</b><span>Awaiting proof</span></div></div>${doctrine()}</section>
    <section class="panel"><p class="eyebrow">TRANSFER DETAILS</p><h2>โอนเงินก่อน แล้วส่งหลักฐาน</h2><p>หลังโอนแล้วให้ใส่ลิงก์สลิปหรือหลักฐานการโอน เพื่อสร้าง payment evidence record เป็นสถานะ pending verification</p><form id="payform" data-api="${attr(apiBase)}" data-plan="${attr(plan)}" data-amount="${attr(String(amount))}"><label>Member Email หรือ username<input name="member_email" value="${attr(url.searchParams.get("email") || "")}" /></label><label>Session ID<input name="session_id" value="${attr(url.searchParams.get("session_id") || url.searchParams.get("sid") || "")}" placeholder="ระบบจะสร้างให้ถ้าเว้นว่าง" /></label><label>Slip URL / proof URL<input name="receipt_url" required placeholder="วางลิงก์รูปสลิป หรือหลักฐานการโอน" /></label><label>Note<textarea name="notes" rows="3" placeholder="รายละเอียดเพิ่มเติม"></textarea></label><button class="btn" type="submit">Submit for Verification</button></form><div id="payresult" class="notice" hidden></div></section>
    <script>${paymentScript()}</script>
  `);
}

export function renderPending(request) {
  const url = new URL(request.url);
  const ref = url.searchParams.get("payment_ref") || url.searchParams.get("transaction_ref") || "";
  const profile = appendQuery("/member/profile", url.search, { status: "pending_verification", payment_ref: ref });
  return page(request, "pay-pending-verification", `${nav(url.search)}<section class="panel center"><p class="eyebrow">PENDING VERIFICATION</p><h1>Evidence Received</h1><p>ระบบรับหลักฐานแล้ว แต่ยังไม่ถือว่า paid และยังไม่เปิด membership หรือ points จนกว่า official verification จะครบชุด</p><div class="summary"><b>Payment Ref</b><span>${html(ref || "Pending")}</span><b>Status</b><span>pending_verification</span><b>Rule</b><span>verified funds only</span></div><p class="actions"><a class="btn" href="${attr(profile)}">Continue to Member Profile</a><a class="btn ghost" href="${attr(appendQuery("/member/dashboard", url.search))}">Member Dashboard</a></p></section>`);
}

export function renderProfile(request) {
  const url = new URL(request.url);
  const plan = normalizePlan(url.searchParams.get("plan") || url.searchParams.get("package")) || "standard";
  const pkg = getPackage(plan);
  return page(request, "member-profile", `${nav(url.search)}<section class="panel center"><p class="eyebrow">MEMBER PROFILE</p><h1>Pending Profile</h1><p>Member Profile แสดง verified truth จาก official verification เท่านั้น URL query, payment_ref, amount, status, proof หรือ slip เป็นข้อมูลประกอบ ไม่ใช่ payment truth และไม่ใช่การยืนยันสมาชิก</p><div class="profile"><span>Membership Status</span><b>Pending Verification</b><span>Requested Package</span><b>${html(pkg.title)}</b><span>Payment Status</span><b>Evidence Received</b><span>Payment Ref</span><b>Waiting official verification</b><span>Points Status</span><b>points pending official verification</b><span>Black Card</span><b>review unavailable until official verification</b></div><div class="notice">proof is not payment truth · verified funds only · points follow verified funds only</div><p class="actions"><a class="btn" href="${attr(appendQuery("/member/dashboard", url.search))}">Member Dashboard</a><a class="btn ghost" href="${attr(appendQuery("/pay/membership", url.search, { plan }))}">Continue Payment</a></p></section>`);
}

function packageCard(pkg, selected, query) {
  const href = appendQuery("/pay/membership", query, { plan: pkg.key, amount: pkg.amount });
  return `<article class="pkg membership-card ${selected === pkg.key ? "on" : ""}"><div><p class="eyebrow">${html(pkg.eyebrow)}</p><h2>${html(pkg.title)}</h2><p>${html(pkg.copy)}</p></div><div class="package-action"><p class="price">${html(pkg.price)}</p><a class="btn" href="${attr(href)}">เลือก ${html(pkg.title)}</a></div></article>`;
}

function nav(query) {
  return `<nav><a class="brand" href="${attr(appendQuery("/member/membership", query))}">MMD Privé</a><span><a href="${attr(appendQuery("/member/dashboard", query))}">Dashboard</a><a href="${attr(appendQuery("/member/profile", query))}">Profile</a></span></nav>`;
}

function doctrine() {
  return `<aside class="panel side"><h2>Verification first</h2><p>proof is not payment truth<br>verified funds are payment truth<br>points follow verified funds only</p><p>Black Card is review/approval only</p></aside>`;
}

function page(request, slug, body) {
  const output = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>MMD Privé | ${html(slug)}</title><style>${styles()}</style></head><body><main data-mmd-page="${attr(slug)}" data-mmd-version="${VERSION}">${body}<footer>Payment page accepts proof. Verification gate confirms money. Airtable records truth. Member Profile displays verified truth only.</footer></main></body></html>`;
  return new Response(request.method.toUpperCase() === "HEAD" ? null : output, { status: 200, headers: { ...headers("text/html; charset=utf-8"), "x-mmd-page": slug, "cache-control": "no-store, no-cache, must-revalidate, max-age=0" } });
}

function headers(type) {
  return { "content-type": type, "x-mmd-worker": WORKER, "x-mmd-version": VERSION };
}

function appendQuery(base, query, extra = {}) {
  const params = new URLSearchParams(query || "");
  Object.entries(extra).forEach(([k, v]) => { if (v != null && String(v).trim()) params.set(k, String(v)); });
  const rendered = params.toString();
  return rendered ? `${base}?${rendered}` : base;
}

function normalizePlan(value) {
  const plan = String(value || "").toLowerCase().trim();
  return PACKAGES.some((pkg) => pkg.key === plan) ? plan : "";
}

function getPackage(plan) {
  return PACKAGES.find((pkg) => pkg.key === plan) || PACKAGES[1];
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
  return `:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0%,rgba(245,190,92,.22),transparent 34%),linear-gradient(145deg,#070403,#120b06 52%,#050403);color:#fff7e8;font-family:Inter,"Segoe UI","Noto Sans Thai",Arial,sans-serif}main{width:min(1120px,calc(100% - 32px));margin:auto;padding:28px 0 44px}nav{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:28px}.brand,nav a{color:#ffd98d;text-decoration:none;font-weight:900}nav span{display:flex;gap:12px;flex-wrap:wrap}.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:20px;margin-bottom:20px}.panel,.pkg{border:1px solid rgba(255,216,151,.2);border-radius:28px;background:rgba(11,8,6,.75);box-shadow:0 24px 80px rgba(0,0,0,.34);padding:clamp(24px,4vw,46px)}.side{padding:28px}.eyebrow{margin:0 0 12px;color:#ffd98d;font-size:12px;font-weight:950;letter-spacing:.18em;text-transform:uppercase}h1{margin:0 0 16px;font-size:clamp(44px,8vw,88px);line-height:.94;letter-spacing:-.055em}h2{margin:0 0 12px;font-size:clamp(26px,4vw,44px);line-height:1}p{color:#ffe9bc;line-height:1.7}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.membership-hero{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(280px,.82fr);gap:18px;margin-bottom:18px}.membership-intro{background:linear-gradient(145deg,rgba(22,14,8,.92),rgba(10,7,5,.78));position:relative;overflow:hidden}.membership-intro:after{content:"";position:absolute;inset:auto -12% -36% 52%;height:220px;background:linear-gradient(130deg,rgba(255,217,141,.22),transparent 62%);transform:rotate(-8deg);pointer-events:none}.membership-intro>*{position:relative}.membership-intro h1{letter-spacing:0}.lead{max-width:680px;font-size:clamp(18px,2vw,23px);color:#fff3d7}.fine{max-width:760px;color:#e5cfaa}.membership-points{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:22px 0}.membership-points span,.checklist li{border:1px solid rgba(255,216,151,.18);border-radius:18px;background:rgba(255,255,255,.055);padding:12px 14px;color:#fff1cd;font-weight:850}.membership-rule{padding:30px}.checklist{display:grid;gap:10px;margin:18px 0 0;padding:0;list-style:none}.package-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.membership-card{display:flex;min-height:330px;flex-direction:column;justify-content:space-between}.membership-card h2{font-size:clamp(28px,3vw,42px)}.package-action{display:grid;gap:14px;margin-top:18px}.membership-note{display:grid;grid-template-columns:minmax(180px,.5fr) 1fr;gap:14px;align-items:center}.pkg.on{border-color:#ffd98d}.price{color:#fff;font-weight:950}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:999px;padding:0 16px;background:#ffd98d;color:#140d05;text-decoration:none;font-weight:950;border:0;cursor:pointer}.ghost{background:rgba(255,255,255,.06);color:#fff4dc;border:1px solid rgba(255,216,151,.25)}.actions{display:flex;gap:10px;flex-wrap:wrap}.summary,.profile{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:18px 0}.profile{grid-template-columns:repeat(2,minmax(0,1fr))}.summary>* ,.profile>*{padding:14px;border-radius:16px;background:rgba(255,255,255,.06);overflow-wrap:anywhere}form{display:grid;gap:12px;max-width:720px}label{display:grid;gap:8px;color:#ffe7b7;font-weight:850}input,textarea{width:100%;border:1px solid rgba(255,216,151,.24);border-radius:16px;padding:14px 16px;color:#fff7e8;background:rgba(255,255,255,.065);font:inherit}.notice{margin-top:14px;padding:14px;border-radius:16px;background:rgba(255,255,255,.07)}.center{max-width:880px;margin:auto}.black{margin-top:16px}footer{margin-top:22px;color:#d9c39e;font-size:12px;line-height:1.7}@media(max-width:860px){.hero,.grid,.membership-hero,.package-grid,.membership-points,.membership-note,.summary,.profile{grid-template-columns:1fr}nav{align-items:flex-start;flex-direction:column}.btn{width:100%}.membership-card{min-height:0}}`;
}
