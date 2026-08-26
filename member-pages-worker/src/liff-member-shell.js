const LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const LIFF_INTENTS = new Set(["signup", "renew", "status", "promo", "hall", "continue_payment", "unknown"]);
const LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

export function isLiffMemberShellPath(url) {
  return LIFF_SHELL_PATHS.has(url.pathname.toLowerCase());
}

export function handleLiffMemberShell(request, env = {}) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: shellHeaders({ allow: "GET, HEAD" }),
    });
  }

  const url = new URL(request.url);
  const config = {
    liffId: publicLiffId(env),
    intent: normalizeIntent(url.searchParams.get("intent") || url.searchParams.get("liff_intent")),
    campaign: normalizeCampaign(url.searchParams.get("campaign")),
    view: normalizeView(url.searchParams.get("view")),
    language: normalizeLanguage(url.searchParams.get("lang") || url.searchParams.get("locale")),
    promoCode: normalizePromoCode(url.searchParams.get("promo_code") || url.searchParams.get("code")),
    startEndpoint: "/member/api/liff/start",
    profileEndpoint: "/member/api/liff/profile",
    careBackEndpoint: "/member/api/liff/care-back/claim",
    careBackStateEndpoint: "/member/api/liff/care-back/state",
    careBackWishEndpoint: "/member/api/liff/care-back/wish",
    stagingScenario: stagingScenario(env, url),
  };
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = renderShell(config, nonce);
  const headers = shellHeaders({
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": `default-src 'self'; script-src 'self' https://static.line-scdn.net 'nonce-${nonce}'; connect-src 'self' https://api.line.me https://access.line.me; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'; object-src 'none'`,
  });
  return new Response(method === "HEAD" ? null : html, { status: 200, headers });
}

function renderShell(config, nonce) {
  const safeConfig = jsonForInlineScript(config);
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>MMD Privé</title>
  <style>
    :root{color-scheme:dark;font-family:LINESeedSansTH,"Noto Sans Thai",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090909;color:#f5f2eb}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 50% -10%,#2b241d 0,#111 35%,#070707 72%);padding:20px 16px 40px}
    main{width:min(100%,560px);margin:0 auto;padding:28px 20px;border:1px solid rgba(212,181,123,.22);border-radius:28px;background:rgba(16,16,16,.91);box-shadow:0 28px 80px rgba(0,0,0,.45)}
    .mark{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#d7bd8a}.title{margin:10px 0 8px;font-size:30px;line-height:1.08;font-weight:650}.sub{margin:0;color:#aaa29a;font-size:14px;line-height:1.55}
    #message{white-space:pre-line;margin:30px 0 0;font-size:18px;line-height:1.65}.actions{display:grid;gap:10px;margin-top:24px}.actions:empty{display:none}
    button,textarea{width:100%;border:1px solid rgba(216,189,137,.28);border-radius:16px;padding:14px 16px;background:#171511;color:#f7f3eb;font:inherit;text-align:left}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}textarea{min-height:124px;resize:vertical;line-height:1.55}.wish{display:grid;gap:12px;margin-top:16px}.wish-result{white-space:pre-line;color:#e7d5ad;line-height:1.65}
    .profile{display:grid;gap:12px;margin-top:22px}.summary{display:grid;grid-template-columns:1.2fr .8fr;gap:12px}.card{border:1px solid rgba(216,189,137,.18);border-radius:20px;padding:17px;background:rgba(8,8,8,.72)}.label{color:#948c82;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.value{display:block;margin-top:6px;font-size:22px;line-height:1.15}.points{font-size:34px;color:#e6cb91}.history{display:grid;gap:9px;margin-top:12px}.event{display:grid;grid-template-columns:72px 1fr auto;gap:10px;align-items:center;padding:11px 0;border-top:1px solid rgba(255,255,255,.07);font-size:13px}.event:first-child{border-top:0}.event-date,.event-status{color:#8f8880}.event-delta{color:#d9bd82}.care{margin-top:14px;border-color:rgba(225,193,126,.38);background:linear-gradient(145deg,rgba(45,35,19,.78),rgba(10,10,10,.86))}.care h2{margin:8px 0;font-size:21px}.care p{margin:0;color:#b7afa4;font-size:13px;line-height:1.6}.care-code{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:14px 0;padding:13px 14px;border-radius:14px;background:#080807}.care-code strong{font-size:24px;letter-spacing:.15em;color:#ecd18f}.care button{margin-top:14px;text-align:center;background:linear-gradient(135deg,#f0d892,#b98b35);color:#181207;font-weight:700}
    .member-nav{display:flex;gap:8px;margin:22px 0 0;padding:4px;border:1px solid rgba(216,189,137,.18);border-radius:999px;background:rgba(0,0,0,.22)}.member-nav button{border:0;border-radius:999px;padding:10px 12px;background:transparent;color:#aaa29a;font-size:12px;text-align:center}.member-nav button[aria-current="true"]{background:#f0d892;color:#181207;font-weight:800}.status{margin-top:22px;color:#7f7972;font-size:12px;line-height:1.5}.hidden{display:none!important}@media(max-width:390px){main{padding:24px 16px}.summary{grid-template-columns:1fr}.event{grid-template-columns:66px 1fr}.event-status{grid-column:2}}
    .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.detail-grid .value{font-size:17px}.payment-status{color:#e6cb91}
  </style>
</head>
<body>
<main>
  <div class="mark" data-copy="mark">MMD Privé · Member Access</div>
  <h1 class="title" data-copy="title">My MMD</h1>
  <p class="sub" data-copy="subtitle">ดูสถานะสมาชิก คะแนน และสิทธิ์ของคุณได้ใน LINE ที่เดียว</p>
  <div id="message" role="status" aria-live="polite">กำลังเปิดการเชื่อมต่อกับ MMD ครับ</div>
  <div id="actions" class="actions" aria-label="ตัวเลือก"></div>
  <nav class="member-nav" aria-label="Member sections">
    <button type="button" data-view="profile" aria-current="true" data-copy="navProfile">ภาพรวม</button>
    <button type="button" data-view="points" aria-current="false" data-copy="navPoints">Points</button>
    <button type="button" data-view="care_back" aria-current="false" data-copy="navCare">CARE BACK</button>
  </nav>
  <section id="profile" class="profile hidden" aria-label="Member profile">
    <div class="card"><span class="label" data-copy="memberLabel">Member</span><strong id="profile-name" class="value">สมาชิก MMD</strong><span id="profile-status" class="sub"></span></div>
    <div class="summary">
      <div class="card"><span class="label" data-copy="tierLabel">Tier</span><strong id="profile-tier" class="value">Member</strong></div>
      <div id="points-card" class="card"><span class="label" data-copy="pointsLabel">Active Points</span><strong id="profile-points" class="value points">0</strong></div>
    </div>
    <div id="member-details" class="detail-grid hidden">
      <div id="expiry-card" class="card hidden"><span class="label" data-copy="expiryLabel">Membership valid until</span><strong id="profile-expiry" class="value">—</strong></div>
      <div id="payment-card" class="card hidden"><span class="label" data-copy="paymentLabel">Payment status</span><strong id="profile-payment" class="value payment-status">—</strong></div>
    </div>
    <div class="card"><span class="label" data-copy="historyLabel">History · Last 1 Year</span><div id="history" class="history"></div></div>
    <div id="care" class="card care">
      <span class="label" data-copy="careLabel">6 Years · Care Back</span><h2 data-copy="careTitle">Personal Care-Back Privilege</h2>
      <p id="care-message">ตรวจสอบผ่าน LINE เพื่อเปิดสิทธิ์ CARE BACK ก่อน คูปองส่วนตัวจะเปิดหลังส่งคำอวยพรถึง MMD สำเร็จครับ</p>
      <div id="care-code" class="care-code hidden"><span class="label">Personal Code</span><strong id="care-code-value"></strong></div>
      <button id="care-button" type="button">ตรวจสิทธิ์ CARE BACK</button>
      <div id="wish" class="wish hidden">
        <label for="wish-text" class="label">Birthday Wish</label>
        <textarea id="wish-text" maxlength="600" placeholder="ฝากคำอวยพรวันเกิดให้ MMD ได้ที่นี่ครับ"></textarea>
        <button id="wish-submit" type="button">ส่งคำอวยพรให้ MMD</button>
        <div id="wish-result" class="wish-result hidden" role="status" aria-live="polite"></div>
      </div>
    </div>
  </section>
  <div id="status" class="status">Secure same-site session · mmdbkk.com</div>
</main>
<script src="${LIFF_SDK_URL}"></script>
<script nonce="${nonce}">
(() => {
  "use strict";
  const CONFIG = ${safeConfig};
  const message = document.getElementById("message");
  const actions = document.getElementById("actions");
  const profile = document.getElementById("profile");
  const careButton = document.getElementById("care-button");
  const wishPanel = document.getElementById("wish");
  const wishText = document.getElementById("wish-text");
  const wishSubmit = document.getElementById("wish-submit");
  const wishResult = document.getElementById("wish-result");
  const locale = CONFIG.language || "th";
  const copy = {
    th: { mark:"MMD Privé · Member Access", title:"My MMD", subtitle:"ดูสถานะสมาชิก คะแนน และสิทธิ์ของคุณได้ใน LINE ที่เดียว", navProfile:"ภาพรวม", navPoints:"Points", navCare:"CARE BACK", memberLabel:"Member", tierLabel:"Tier", pointsLabel:"Active Points", expiryLabel:"สมาชิกใช้ได้ถึง", paymentLabel:"สถานะการชำระ", historyLabel:"History · Last 1 Year", careLabel:"6 Years · Care Back", careTitle:"Personal Care-Back Privilege", careIntro:"ตรวจสอบผ่าน LINE เพื่อเปิดสิทธิ์ CARE BACK ก่อน คูปองส่วนตัวจะเปิดหลังส่งคำอวยพรถึง MMD สำเร็จครับ", careButton:"ตรวจสิทธิ์ CARE BACK", wishPlaceholder:"ฝากคำอวยพรวันเกิดให้ MMD ได้ที่นี่ครับ", wishSubmit:"ส่งคำอวยพรให้ MMD", ready:"ข้อมูลสมาชิกของคุณพร้อมแล้วครับ", empty:"ยังไม่มีรายการในช่วง 1 ปีล่าสุดครับ", careLoading:"กำลังตรวจสอบสิทธิ์", careRetry:"ลองตรวจสอบอีกครั้ง", wishEmpty:"กรุณาเขียนคำอวยพรก่อนส่งครับ", wishSaving:"กำลังเก็บคำอวยพร", wishError:"ตอนนี้ยังเก็บคำอวยพรไม่ได้ครับ กรุณาลองใหม่อีกครั้ง", wishRetry:"ลองส่งอีกครั้ง", careChecked:"สิทธิ์ CARE BACK ของคุณถูกตรวจแล้ว ส่งคำอวยพรถึง MMD สำเร็จเพื่อเปิดคูปองส่วนตัว 10% ครับ", wishDone:"MMD ได้รับคำอวยพรของคุณแล้วครับ", wishPending:"ระบบกำลังยืนยันการบันทึกคำอวยพรเดิมอย่างปลอดภัย กรุณากลับมาตรวจสอบอีกครั้งครับ", wishReview:"ข้อมูลนี้ยังต้องตรวจสอบก่อนครับ ระบบจะเก็บเส้นทางของคุณไว้อย่างปลอดภัย", couponReady:"ส่งคำอวยพรเพื่อเปิดคูปอง", claimMessage:"MMD จะอัปเดตสิทธิ์ตามสถานะสมาชิกและการยืนยันที่เกี่ยวข้องครับ", careCheckedButton:"ตรวจสิทธิ์ CARE BACK แล้ว", careResumedButton:"อัปเดตสิทธิ์ CARE BACK แล้ว", promoLoading:"กำลังตรวจสอบสิทธิ์ CARE BACK อย่างปลอดภัยครับ" },
    en: { mark:"MMD Privé · Member Access", title:"My MMD", subtitle:"Your membership, points and privileges — all in LINE.", navProfile:"Overview", navPoints:"Points", navCare:"CARE BACK", memberLabel:"Member", tierLabel:"Tier", pointsLabel:"Active Points", expiryLabel:"Membership valid until", paymentLabel:"Payment status", historyLabel:"History · Last 1 Year", careLabel:"6 Years · Care Back", careTitle:"Personal Care-Back Privilege", careIntro:"Verify through LINE to open CARE BACK. Your personal coupon becomes available after your wish is submitted successfully.", careButton:"Check CARE BACK", wishPlaceholder:"Leave a birthday wish for MMD here.", wishSubmit:"Send wish to MMD", ready:"Your member information is ready.", empty:"No activity in the last year.", careLoading:"Checking eligibility", careRetry:"Try checking again", wishEmpty:"Please write a wish before sending.", wishSaving:"Saving your wish", wishError:"Your wish could not be saved. Please try again.", wishRetry:"Try sending again", careChecked:"Your CARE BACK eligibility is checked. Submit a wish to unlock your personal 10% coupon.", wishDone:"MMD has received your wish.", wishPending:"We are securely confirming your previous wish. Please check again later.", wishReview:"This request needs further review. We have kept your route secure.", couponReady:"Send a wish to unlock the coupon", claimMessage:"MMD will update your privilege after the required membership and verification checks.", careCheckedButton:"CARE BACK checked", careResumedButton:"CARE BACK updated", promoLoading:"Checking your CARE BACK eligibility securely" },
    zh: { mark:"MMD Privé · Member Access", title:"我的 MMD", subtitle:"在 LINE 内查看会员状态、积分与专属权益。", navProfile:"概览", navPoints:"积分", navCare:"CARE BACK", memberLabel:"会员", tierLabel:"等级", pointsLabel:"当前积分", expiryLabel:"会员有效期至", paymentLabel:"付款状态", historyLabel:"最近一年记录", careLabel:"6 Years · Care Back", careTitle:"专属 Care Back 礼遇", careIntro:"请通过 LINE 验证 CARE BACK。成功提交祝福后，您的专属优惠券将会开启。", careButton:"检查 CARE BACK", wishPlaceholder:"在这里留下给 MMD 的生日祝福。", wishSubmit:"向 MMD 发送祝福", ready:"会员信息已准备好。", empty:"最近一年暂无记录。", careLoading:"正在检查资格", careRetry:"再次检查", wishEmpty:"请先写下祝福再发送。", wishSaving:"正在保存祝福", wishError:"祝福暂时无法保存，请稍后再试。", wishRetry:"再次发送", careChecked:"您的 CARE BACK 资格已检查。成功提交祝福后即可开启专属 10% 优惠券。", wishDone:"MMD 已收到您的祝福。", wishPending:"系统正在安全确认您之前提交的祝福，请稍后再查看。", wishReview:"此请求仍需进一步审核，我们已安全保留您的流程。", couponReady:"发送祝福以开启优惠券", claimMessage:"MMD 将在完成会员与验证检查后更新您的礼遇。", careCheckedButton:"CARE BACK 已检查", careResumedButton:"CARE BACK 已更新", promoLoading:"正在安全检查 CARE BACK 资格" },
  }[locale] || {};
  const allowedIntentIds = new Set(["signup", "renew", "status"]);
  let busy = false;

  document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
  for (const element of document.querySelectorAll("[data-copy]")) {
    const key = element.getAttribute("data-copy");
    if (copy[key]) element.textContent = copy[key];
  }
  document.getElementById("care-message").textContent = copy.careIntro || document.getElementById("care-message").textContent;
  careButton.textContent = copy.careButton || careButton.textContent;
  wishText.placeholder = copy.wishPlaceholder || wishText.placeholder;
  wishSubmit.textContent = copy.wishSubmit || wishSubmit.textContent;
  const initialView = CONFIG.view === "points" ? "points" : (CONFIG.view === "care_back" || CONFIG.intent === "promo" ? "care_back" : "profile");
  for (const item of document.querySelectorAll("[data-view]")) item.setAttribute("aria-current", String(item.getAttribute("data-view") === initialView));
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => {
      const view = button.getAttribute("data-view");
      for (const item of document.querySelectorAll("[data-view]")) item.setAttribute("aria-current", String(item === button));
      const target = view === "points" ? document.getElementById("points-card") : view === "care_back" ? document.getElementById("care") : document.getElementById("profile");
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function show(text) {
    message.textContent = String(text || "ไม่สามารถดำเนินการต่อได้ครับ กรุณากลับมาเปิดผ่าน LINE ของ MMD อีกครั้ง");
  }

  function setBusy(value) {
    busy = Boolean(value);
    for (const button of actions.querySelectorAll("button")) button.disabled = busy;
  }

  async function call(endpoint, body) {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") throw new Error("invalid_response");
    if (!response.ok || payload.ok !== true) {
      if (payload.data) render(payload.data);
      else show("ตอนนี้ระบบตรวจสอบข้อมูลชั่วคราวยังไม่พร้อมครับ กรุณาลองใหม่อีกครั้ง");
      return null;
    }
    render(payload.data || {});
    return payload.data || {};
  }

  async function readProfile() {
    const response = await fetch(CONFIG.profileEndpoint, { method: "GET", credentials: "same-origin", headers: { "accept": "application/json" } });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) return null;
    renderProfile(payload.data || {});
    if (CONFIG.intent === "promo" && CONFIG.campaign === "care_back") await readCareBackState();
    return payload.data || {};
  }

  async function readCareBackState() {
    const response = await fetch(CONFIG.careBackStateEndpoint, { method:"GET",credentials:"same-origin",headers:{"accept":"application/json"} });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) return null;
    renderCareBackState(payload);
    return payload;
  }

  function renderCareBackState(data) {
    const state = String(data && data.state || "");
    if (state === "claim_required") {
      wishPanel.classList.add("hidden");
      careButton.classList.remove("hidden");
      return;
    }
    if (state === "wish_available") {
      careButton.classList.add("hidden");
      wishPanel.classList.remove("hidden");
      document.getElementById("care-message").textContent = copy.careChecked || "สิทธิ์ CARE BACK ของคุณถูกตรวจแล้ว ส่งคำอวยพรถึง MMD สำเร็จเพื่อเปิดคูปองส่วนตัว 10% ครับ";
      wishText.classList.remove("hidden");
      wishSubmit.classList.remove("hidden");
      wishResult.classList.add("hidden");
      return;
    }
    if (state === "submitted" || state === "completed") {
      careButton.classList.add("hidden");
      wishPanel.classList.remove("hidden");
      wishText.classList.add("hidden");
      wishSubmit.classList.add("hidden");
      wishResult.textContent = String(data.final_display && data.final_display.message || copy.wishDone || "MMD ได้รับคำอวยพรของคุณแล้วครับ");
      wishResult.classList.remove("hidden");
      return;
    }
    if (state === "write_pending") {
      careButton.classList.add("hidden");
      wishPanel.classList.remove("hidden");
      wishText.classList.add("hidden");
      wishSubmit.classList.add("hidden");
      wishResult.textContent = copy.wishPending || "ระบบกำลังยืนยันการบันทึกคำอวยพรเดิมอย่างปลอดภัย กรุณากลับมาตรวจสอบอีกครั้งครับ";
      wishResult.classList.remove("hidden");
      return;
    }
    if (state === "reconciliation_required" || state === "manual_review" || state === "not_eligible") {
      careButton.classList.add("hidden");
      wishPanel.classList.remove("hidden");
      wishText.classList.add("hidden");
      wishSubmit.classList.add("hidden");
      wishResult.textContent = copy.wishReview || "ข้อมูลนี้ยังต้องตรวจสอบก่อนครับ ระบบจะเก็บเส้นทางของคุณไว้อย่างปลอดภัย";
      wishResult.classList.remove("hidden");
    }
  }

  function renderProfile(data) {
    profile.classList.remove("hidden");
    document.getElementById("profile-name").textContent = String(data.display_name || "สมาชิก MMD");
    document.getElementById("profile-tier").textContent = String(data.tier || "Member");
    document.getElementById("profile-points").textContent = new Intl.NumberFormat("th-TH").format(Number(data.points || 0));
    document.getElementById("profile-status").textContent = membershipStatus(data.membership_status);
    const expiry = safeDate(data.membership_expires_at);
    const payment = safePaymentStatus(data.payment_status);
    document.getElementById("member-details").classList.toggle("hidden", !expiry && !payment);
    document.getElementById("expiry-card").classList.toggle("hidden", !expiry);
    document.getElementById("payment-card").classList.toggle("hidden", !payment);
    if (expiry) document.getElementById("profile-expiry").textContent = shortDate(expiry);
    if (payment) document.getElementById("profile-payment").textContent = paymentStatus(payment);
    const history = document.getElementById("history");
    history.replaceChildren();
    const items = Array.isArray(data.history) ? data.history : [];
    if (!items.length) {
      const empty = document.createElement("p"); empty.className = "sub"; empty.textContent = copy.empty || "ยังไม่มีรายการในช่วง 1 ปีล่าสุดครับ"; history.append(empty);
    }
    for (const item of items) {
      const row = document.createElement("div"); row.className = "event";
      const date = document.createElement("span"); date.className = "event-date"; date.textContent = shortDate(item.date);
      const title = document.createElement("strong"); title.textContent = String(item.title || "MMD activity");
      const state = document.createElement("span"); state.className = item.type === "points" ? "event-delta" : "event-status";
      state.textContent = item.type === "points" ? signedPoints(item.points_delta) : safeStatus(item.status);
      row.append(date, title, state); history.append(row);
    }
    show(copy.ready || "ข้อมูลสมาชิกของคุณพร้อมแล้วครับ");
    if (CONFIG.view === "points") document.getElementById("points-card").scrollIntoView({ behavior: "smooth", block: "center" });
    if (CONFIG.view === "care_back" || CONFIG.intent === "promo") document.getElementById("care").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function membershipStatus(value) { const labels = { th:{active:"สมาชิกใช้งานอยู่",grace:"อยู่ในช่วงผ่อนผัน",expired:"สมาชิกหมดอายุ",under_review:"อยู่ระหว่างตรวจสอบ"}, en:{active:"Active member",grace:"Grace period",expired:"Expired",under_review:"Under review"}, zh:{active:"会员有效",grace:"宽限期",expired:"会员已过期",under_review:"审核中"} }; return (labels[locale] || labels.th)[value] || (labels[locale] || labels.th).under_review; }
  function safeStatus(value) { const labels = { th:{completed:"เสร็จสิ้น",active:"ใช้งานอยู่",expired:"หมดอายุ",posted:"บันทึกแล้ว"}, en:{completed:"Completed",active:"Active",expired:"Expired",posted:"Posted"}, zh:{completed:"已完成",active:"有效",expired:"已过期",posted:"已记录"} }; return (labels[locale] || labels.th)[value] || "Recorded"; }
  function signedPoints(value) { const number = Number(value || 0); return (number >= 0 ? "+" : "") + new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "th-TH").format(number) + " pts"; }
  function shortDate(value) { const date = new Date(String(value || "") + "T00:00:00+07:00"); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-GB" : "th-TH",{day:"numeric",month:"short",year:"2-digit"}).format(date); }
  function safeDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : ""; }
  function safePaymentStatus(value) { return ["verified","pending_review","failed","not_found"].includes(String(value || "")) ? String(value) : ""; }
  function paymentStatus(value) { const labels = { th:{verified:"ตรวจสอบแล้ว",pending_review:"รอตรวจสอบ",failed:"ไม่ผ่านการตรวจสอบ",not_found:"ยังไม่พบรายการชำระ"}, en:{verified:"Verified",pending_review:"Pending review",failed:"Not verified",not_found:"No payment record found"}, zh:{verified:"已验证",pending_review:"待审核",failed:"未通过验证",not_found:"未找到付款记录"} }; return (labels[locale] || labels.th)[value] || "—"; }

  async function claimCareBack() {
    if (busy) return;
    setBusy(true); careButton.disabled = true; careButton.textContent = copy.careLoading || "กำลังตรวจสอบสิทธิ์";
    try {
      const response = await fetch(CONFIG.careBackEndpoint, { method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","accept":"application/json"},body:"{}" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) throw new Error("care_back_unavailable");
      renderCareBackClaim(payload.data || {});
      await readCareBackState();
    } catch {
      document.getElementById("care-message").textContent = copy.claimMessage || "ตอนนี้ยังออกโค้ดไม่ได้ครับ กรุณาลองใหม่อีกครั้งหรือติดต่อ HYPE";
      careButton.disabled = false; careButton.textContent = copy.careRetry || "ลองตรวจสอบอีกครั้ง";
    } finally { setBusy(false); }
  }

  async function submitBirthdayWish() {
    if (busy) return;
    const text = String(wishText.value || "").trim();
    if (!text) { wishResult.textContent = copy.wishEmpty || "กรุณาเขียนคำอวยพรก่อนส่งครับ"; wishResult.classList.remove("hidden"); return; }
    setBusy(true); wishSubmit.disabled = true; wishSubmit.textContent = copy.wishSaving || "กำลังเก็บคำอวยพร";
    try {
      const response = await fetch(CONFIG.careBackWishEndpoint, {
        method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","accept":"application/json"},
        body:JSON.stringify({wish_text:text,request_id:crypto.randomUUID()}),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) throw new Error("wish_unavailable");
      if (payload.claim) renderCareBackClaim(payload.claim);
      renderCareBackState(payload);
    } catch {
      wishResult.textContent = copy.wishError || "ตอนนี้ยังเก็บคำอวยพรไม่ได้ครับ กรุณาลองใหม่อีกครั้ง";
      wishResult.classList.remove("hidden");
      wishSubmit.disabled = false; wishSubmit.textContent = copy.wishRetry || "ลองส่งอีกครั้ง";
    } finally { setBusy(false); }
  }

  function renderCareBackClaim(data) {
    const code = String(data.personal_code || "");
    const codeWrap = document.getElementById("care-code");
    const couponState = String(data.coupon_state || "");
    document.getElementById("care-code-value").textContent = code;
    codeWrap.classList.toggle("hidden", !code);
    document.getElementById("care-message").textContent = String(data.coupon_message || data.message || copy.claimMessage || "MMD จะอัปเดตสิทธิ์ตามสถานะสมาชิกและการยืนยันที่เกี่ยวข้องครับ");
    careButton.textContent = data.resumed ? (copy.careResumedButton || "อัปเดตสิทธิ์ CARE BACK แล้ว") : (copy.careCheckedButton || "ตรวจสิทธิ์ CARE BACK แล้ว");
    if (couponState === "wish_required") careButton.textContent = copy.couponReady || "ส่งคำอวยพรเพื่อเปิดคูปอง";
  }

  function render(data) {
    const screen = data && typeof data.screen === "object" ? data.screen : {};
    if (CONFIG.intent === "promo" && CONFIG.campaign === "care_back") {
      show(copy.promoLoading || "กำลังตรวจสอบสิทธิ์ CARE BACK อย่างปลอดภัยครับ");
      actions.replaceChildren();
      return;
    }
    show(screen.copy || "กำลังตรวจสอบข้อมูลให้ครับ");
    actions.replaceChildren();
    const serverActions = Array.isArray(screen.actions) ? screen.actions : [];
    for (const action of serverActions) {
      const id = String(action && action.id || "");
      const endpoint = String(action && action.endpoint || "");
      const label = String(action && action.label || "");
      if (!label || endpoint !== "/member/api/liff/intent" || !allowedIntentIds.has(id)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", async () => {
        if (busy) return;
        setBusy(true);
        try { await call(endpoint, { liff_intent: id }); }
        catch { show("ตอนนี้ระบบตรวจสอบข้อมูลชั่วคราวยังไม่พร้อมครับ กรุณาลองใหม่อีกครั้ง"); }
        finally { setBusy(false); }
      });
      actions.append(button);
    }
  }

  async function boot() {
    if (CONFIG.stagingScenario) {
      try {
        show("STAGING · กำลังทดสอบสถานะ " + CONFIG.stagingScenario + " โดยไม่ใช้ข้อมูลสมาชิกจริงครับ");
        const body = {
          id_token: "care-back-staging-" + CONFIG.stagingScenario,
          liff_intent: CONFIG.intent,
        };
        if (CONFIG.promoCode) body.promo_code = CONFIG.promoCode;
        if (CONFIG.campaign) body.campaign = CONFIG.campaign;
        const started = await call(CONFIG.startEndpoint, body);
        if (started && started.member_resolved) await readProfile();
      } catch {
        show("STAGING · ระบบจำลองยังไม่พร้อมครับ");
      }
      return;
    }
    try {
      const existingProfile = await readProfile();
      if (existingProfile) return;
    } catch {
      // No valid same-site session yet. Fall through to the one-time LIFF handshake.
    }
    if (!CONFIG.liffId || !window.liff) {
      show("ช่องทางนี้ยังไม่พร้อมใช้งานครับ กรุณากลับมาเปิดผ่าน LINE ของ MMD อีกครั้ง");
      return;
    }
    try {
      await window.liff.init({ liffId: CONFIG.liffId });
      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        return;
      }
      const idToken = window.liff.getIDToken();
      if (!idToken) {
        show("ไม่สามารถยืนยัน LINE ได้ในตอนนี้ครับ กรุณาเปิดใหม่ผ่าน LINE ของ MMD");
        return;
      }
      const body = { id_token: idToken, liff_intent: CONFIG.intent };
      if (CONFIG.promoCode) body.promo_code = CONFIG.promoCode;
      if (CONFIG.campaign) body.campaign = CONFIG.campaign;
      const started = await call(CONFIG.startEndpoint, body);
      if (started && started.member_resolved) await readProfile();
    } catch {
      show("ตอนนี้ระบบตรวจสอบข้อมูลชั่วคราวยังไม่พร้อมครับ กรุณาลองใหม่อีกครั้ง");
    }
  }

  careButton.addEventListener("click", claimCareBack);
  wishSubmit.addEventListener("click", submitBirthdayWish);
  boot();
})();
</script>
</body>
</html>`;
}

function stagingScenario(env, url) {
  if (String(env.CARE_BACK_STAGING_MODE || "") !== "synthetic") return "";
  if (!url.hostname.endsWith(".workers.dev")) return "";
  const scenario = String(url.searchParams.get("scenario") || "").trim().toLowerCase();
  return new Set(["current", "returning", "new"]).has(scenario) ? scenario : "";
}

function publicLiffId(env) {
  const value = String(env.LINE_LIFF_ID || env.LIFF_ID || "").trim();
  return value.length <= 160 && /^[A-Za-z0-9_-]+$/.test(value) ? value : "";
}

function normalizeIntent(value) {
  const intent = String(value || "unknown").trim().toLowerCase();
  return LIFF_INTENTS.has(intent) ? intent : "unknown";
}

function normalizePromoCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,62}$/.test(code) ? code : "";
}

function normalizeCampaign(value) {
  return String(value || "").trim().toLowerCase() === "care_back" ? "care_back" : "";
}

function normalizeView(value) {
  const view = String(value || "profile").trim().toLowerCase();
  return new Set(["profile", "points", "care_back"]).has(view) ? view : "profile";
}

function normalizeLanguage(value) {
  const language = String(value || "th").trim().toLowerCase().split(/[-_]/)[0];
  return new Set(["th", "en", "zh"]).has(language) ? language : "th";
}

function jsonForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function shellHeaders(extra = {}) {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "SAMEORIGIN",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    ...extra,
  };
}
