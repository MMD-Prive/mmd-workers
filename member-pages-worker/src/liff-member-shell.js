import { CARE_BACK_COPY } from "./care-back-i18n.js";

const LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const LIFF_INTENTS = new Set(["signup", "renew", "status", "promo", "hall", "continue_payment", "mms_booking", "unknown"]);
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
    promoCode: normalizePromoCode(url.searchParams.get("promo_code") || url.searchParams.get("code")),
    startEndpoint: "/member/api/liff/start",
    profileEndpoint: "/member/api/liff/profile",
    careBackEndpoint: "/member/api/liff/care-back/claim",
    careBackStateEndpoint: "/member/api/liff/care-back/state",
    careBackWishEndpoint: "/member/api/liff/care-back/wish",
    stagingScenario: stagingScenario(env, url),
    careBackCopy: CARE_BACK_COPY,
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
    .profile{display:grid;gap:12px;margin-top:22px}.tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.tab{text-align:center;padding:10px}.tab[aria-selected="true"]{border-color:#d8bc83;background:#2a2114;color:#f0d892}.tab-panel{display:grid;gap:12px}.summary,.member-details{display:grid;grid-template-columns:1.2fr .8fr;gap:12px}.card{border:1px solid rgba(216,189,137,.18);border-radius:20px;padding:17px;background:rgba(8,8,8,.72)}.label{color:#948c82;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.value{display:block;margin-top:6px;font-size:22px;line-height:1.15}.points{font-size:34px;color:#e6cb91}.history{display:grid;gap:9px;margin-top:12px}.event{display:grid;grid-template-columns:72px 1fr auto;gap:10px;align-items:center;padding:11px 0;border-top:1px solid rgba(255,255,255,.07);font-size:13px}.event:first-child{border-top:0}.event-date,.event-status{color:#8f8880}.event-delta{color:#d9bd82}.care{border-color:rgba(225,193,126,.38);background:linear-gradient(145deg,rgba(45,35,19,.78),rgba(10,10,10,.86))}.care h2{margin:8px 0;font-size:21px}.care p{margin:0;color:#b7afa4;font-size:13px;line-height:1.6}.care-code{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:14px 0;padding:13px 14px;border-radius:14px;background:#080807}.care-code strong{font-size:24px;letter-spacing:.15em;color:#ecd18f}.care button{margin-top:14px;text-align:center;background:linear-gradient(135deg,#f0d892,#b98b35);color:#181207;font-weight:700}
    .status{margin-top:22px;color:#7f7972;font-size:12px;line-height:1.5}.hidden{display:none!important}@media(max-width:390px){main{padding:24px 16px}.summary{grid-template-columns:1fr}.event{grid-template-columns:66px 1fr}.event-status{grid-column:2}}
  </style>
</head>
<body>
<main>
  <div class="mark">MMD Privé · Member Access</div>
  <h1 class="title">Private Member Gateway</h1>
  <p class="sub">LINE identity is checked securely before member information is shown.</p>
  <div id="message" role="status" aria-live="polite">กำลังเปิดการเชื่อมต่อกับ MMD ครับ</div>
  <div id="actions" class="actions" aria-label="ตัวเลือก"></div>
  <section id="profile" class="profile hidden" aria-label="Member profile">
    <div class="tabs" role="tablist" aria-label="Member dashboard views">
      <button class="tab" type="button" role="tab" data-view-tab="profile" aria-selected="false">สมาชิก</button>
      <button class="tab" type="button" role="tab" data-view-tab="points" aria-selected="false">คะแนน</button>
      <button class="tab" type="button" role="tab" data-view-tab="care_back" aria-selected="false">CARE BACK</button>
    </div>
    <section class="tab-panel" data-view-panel="profile">
      <div class="card"><span class="label">Member</span><strong id="profile-name" class="value">สมาชิก MMD</strong><span id="profile-status" class="sub"></span></div>
      <div id="member-details" class="member-details">
        <div id="expiry-card" class="card hidden"><span class="label">Membership valid until</span><strong id="profile-expiry" class="value">—</strong></div>
        <div id="payment-card" class="card"><span class="label">Payment status</span><strong id="profile-payment" class="value">Unavailable</strong></div>
      </div>
    </section>
    <section class="tab-panel" data-view-panel="points" hidden>
      <div class="summary">
      <div class="card"><span class="label">Tier</span><strong id="profile-tier" class="value">Member</strong></div>
      <div id="points-card" class="card"><span class="label">Active Points</span><strong id="profile-points" class="value points">0</strong></div>
      </div>
      <div class="card"><span class="label">History · Last 1 Year</span><div id="history" class="history"></div></div>
    </section>
    <section class="tab-panel" data-view-panel="care_back" hidden>
    <div id="care" class="card care">
      <span class="label">6 Years · Care Back</span><h2>Personal Care-Back Privilege</h2>
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
  </section>
  <div id="status" class="status">Secure same-site session · mmdbkk.com</div>
</main>
<script src="${LIFF_SDK_URL}"></script>
<script nonce="${nonce}">
(() => {
  "use strict";
  const CONFIG = ${safeConfig};
  const locale = String(navigator.language || "th").toLowerCase().startsWith("zh") ? "zh" : String(navigator.language || "th").toLowerCase().startsWith("en") ? "en" : "th";
  const COPY = CONFIG.careBackCopy[locale] || CONFIG.careBackCopy.th;
  const message = document.getElementById("message");
  const actions = document.getElementById("actions");
  const profile = document.getElementById("profile");
  const careButton = document.getElementById("care-button");
  const wishPanel = document.getElementById("wish");
  const wishText = document.getElementById("wish-text");
  const wishSubmit = document.getElementById("wish-submit");
  const wishResult = document.getElementById("wish-result");
  const allowedIntentIds = new Set(["signup", "renew", "status"]);
  let busy = false;

  function activateView(value, updateUrl = false) {
    const view = ["profile", "points", "care_back"].includes(value) ? value : "profile";
    for (const tab of document.querySelectorAll("[data-view-tab]")) tab.setAttribute("aria-selected", String(tab.dataset.viewTab === view));
    for (const panel of document.querySelectorAll("[data-view-panel]")) panel.hidden = panel.dataset.viewPanel !== view;
    if (updateUrl) { const url = new URL(location.href); url.searchParams.set("view", view); window.history.replaceState(null, "", url); }
  }

  function localizeCareBack() {
    const tabs = document.querySelectorAll("[data-view-tab]");
    tabs[0].textContent = COPY.tab_profile; tabs[1].textContent = COPY.tab_points; tabs[2].textContent = COPY.tab_care_back;
    document.querySelector("#care .label").textContent = COPY.label;
    document.querySelector("#care h2").textContent = COPY.title;
    document.getElementById("care-message").textContent = COPY.intro;
    careButton.textContent = COPY.check; document.querySelector('label[for="wish-text"]').textContent = COPY.wish_label;
    wishText.placeholder = COPY.wish_placeholder; wishSubmit.textContent = COPY.wish_submit;
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
    if (CONFIG.intent === "mms_booking") {
      window.location.replace("/member/mms-booking");
      return payload.data || {};
    }
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
      document.getElementById("care-message").textContent = COPY.wish_required;
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
      wishResult.textContent = String(locale === "th" && data.final_display && data.final_display.message || COPY.wish_received);
      wishResult.classList.remove("hidden");
      return;
    }
    if (state === "write_pending") {
      careButton.classList.add("hidden");
      wishPanel.classList.remove("hidden");
      wishText.classList.add("hidden");
      wishSubmit.classList.add("hidden");
      wishResult.textContent = COPY.write_pending;
      wishResult.classList.remove("hidden");
      return;
    }
    if (state === "reconciliation_required" || state === "manual_review" || state === "not_eligible") {
      careButton.classList.add("hidden");
      wishPanel.classList.remove("hidden");
      wishText.classList.add("hidden");
      wishSubmit.classList.add("hidden");
      wishResult.textContent = COPY.manual_review;
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
    document.getElementById("expiry-card").classList.toggle("hidden", !expiry);
    if (expiry) document.getElementById("profile-expiry").textContent = shortDate(expiry);
    document.getElementById("profile-payment").textContent = paymentStatus(data.payment_status);
    const history = document.getElementById("history");
    history.replaceChildren();
    const items = Array.isArray(data.history) ? data.history : [];
    if (!items.length) {
      const empty = document.createElement("p"); empty.className = "sub"; empty.textContent = "ยังไม่มีรายการ customer-safe ในช่วง 1 ปีล่าสุดครับ"; history.append(empty);
    }
    for (const item of items) {
      const row = document.createElement("div"); row.className = "event";
      const date = document.createElement("span"); date.className = "event-date"; date.textContent = shortDate(item.date);
      const title = document.createElement("strong"); title.textContent = String(item.title || "MMD activity");
      const state = document.createElement("span"); state.className = item.type === "points" ? "event-delta" : "event-status";
      state.textContent = item.type === "points" ? signedPoints(item.points_delta) : safeStatus(item.status);
      row.append(date, title, state); history.append(row);
    }
    show("ข้อมูลสมาชิกของคุณพร้อมแล้วครับ");
    activateView(CONFIG.intent === "promo" ? "care_back" : CONFIG.view);
  }

  function membershipStatus(value) { return ({ active:"Active member",grace:"Grace period",expired:"Expired",under_review:"Under review" })[value] || "Under review"; }
  function paymentStatus(value) { return ({ verified:"Verified",pending_review:"Pending review",unavailable:"Unavailable" })[String(value || "")] || "Unavailable"; }
  function safeDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : ""; }
  function safeStatus(value) { return ({completed:"Completed",active:"Active",expired:"Expired",posted:"Posted"})[value] || "Recorded"; }
  function signedPoints(value) { const number = Number(value || 0); return (number >= 0 ? "+" : "") + new Intl.NumberFormat("th-TH").format(number) + " pts"; }
  function shortDate(value) { const date = new Date(String(value || "") + "T00:00:00+07:00"); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short",year:"2-digit"}).format(date); }

  async function claimCareBack() {
    if (busy) return;
    setBusy(true); careButton.disabled = true; careButton.textContent = COPY.checking;
    try {
      const response = await fetch(CONFIG.careBackEndpoint, { method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","accept":"application/json"},body:"{}" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok !== true) throw new Error("care_back_unavailable");
      renderCareBackClaim(payload.data || {});
      await readCareBackState();
    } catch {
      document.getElementById("care-message").textContent = COPY.claim_error;
      careButton.disabled = false; careButton.textContent = COPY.retry;
    } finally { setBusy(false); }
  }

  async function submitBirthdayWish() {
    if (busy) return;
    const text = String(wishText.value || "").trim();
    if (!text) { wishResult.textContent = COPY.wish_empty; wishResult.classList.remove("hidden"); return; }
    setBusy(true); wishSubmit.disabled = true; wishSubmit.textContent = COPY.wish_saving;
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
      wishResult.textContent = COPY.wish_error;
      wishResult.classList.remove("hidden");
      wishSubmit.disabled = false; wishSubmit.textContent = COPY.wish_retry;
    } finally { setBusy(false); }
  }

  function renderCareBackClaim(data) {
    const code = String(data.personal_code || "");
    const codeWrap = document.getElementById("care-code");
    const couponState = String(data.coupon_state || "");
    document.getElementById("care-code-value").textContent = code;
    codeWrap.classList.toggle("hidden", !code);
    document.getElementById("care-message").textContent = String(data.coupon_message || data.message || "MMD จะอัปเดตสิทธิ์ตามสถานะสมาชิกและการยืนยันที่เกี่ยวข้องครับ");
    careButton.textContent = data.resumed ? COPY.checked_updated : COPY.checked;
    if (couponState === "wish_required") careButton.textContent = COPY.wish_to_coupon;
  }

  function render(data) {
    const screen = data && typeof data.screen === "object" ? data.screen : {};
    if (CONFIG.intent === "promo" && CONFIG.campaign === "care_back") {
      show(COPY.safe_check);
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
        if (!window.liff.isInClient()) {
          show("กรุณาเปิดหน้านี้จาก LINE Mini App ของ MMD เพื่อยืนยันตัวตนครับ");
          return;
        }
        window.liff.login();
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

  localizeCareBack();
  activateView(CONFIG.intent === "promo" ? "care_back" : CONFIG.view);
  for (const tab of document.querySelectorAll("[data-view-tab]")) tab.addEventListener("click", () => activateView(tab.dataset.viewTab, true));
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
