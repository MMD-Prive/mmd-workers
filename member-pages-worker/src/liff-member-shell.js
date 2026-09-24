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
    publicCatalogEndpoint: "/member/api/liff/public-membership/catalog",
    publicPurchaseEndpoint: "/member/api/liff/public-membership/purchase",
    careBackEndpoint: "/member/api/liff/care-back/claim",
    careBackStateEndpoint: "/member/api/liff/care-back/state",
    couponWalletEndpoint: "/member/api/liff/care-back/wallet",
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
    :root{color-scheme:dark;font-family:"LINE Seed Sans TH","LINE","Noto Sans Thai","Noto",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090909;color:#f5f2eb}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:#090909;padding:20px 16px 40px}
    main{width:min(100%,760px);margin:0 auto;padding:24px 16px;border:1px solid rgba(212,181,123,.22);border-radius:8px;background:#101011;box-shadow:0 28px 80px rgba(0,0,0,.45)}
    .mark{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#d7bd8a}.title{margin:10px 0 8px;font-size:30px;line-height:1.08;font-weight:650}.sub{margin:0;color:#aaa29a;font-size:14px;line-height:1.55}
    #message{white-space:pre-line;margin:30px 0 0;font-size:18px;line-height:1.65}.actions{display:grid;gap:10px;margin-top:24px}.actions:empty{display:none}
    button,textarea{width:100%;border:1px solid rgba(216,189,137,.28);border-radius:16px;padding:14px 16px;background:#171511;color:#f7f3eb;font:inherit;text-align:left}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}textarea{min-height:124px;resize:vertical;line-height:1.55}.wish{display:grid;gap:12px;margin-top:16px}.wish-result{white-space:pre-line;color:#e7d5ad;line-height:1.65}
    .signup{display:grid;gap:12px;margin-top:24px}.signup h2{margin:0;color:#f0d892;font-size:22px}.signup .card{display:grid;gap:8px}.signup .card strong{font-size:18px}.signup .card button{margin-top:4px;text-align:center;background:#f0d892;color:#181207;font-weight:700}.signup .card button:disabled{opacity:.5}.signup .private-link{display:block;border:1px solid rgba(216,189,137,.28);border-radius:16px;padding:14px 16px;color:#f0d892;text-align:center;text-decoration:none}.signup-note{color:#b7afa4;font-size:13px;line-height:1.6}.profile{display:block;margin-top:14px}.section-rail{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;overscroll-behavior-x:contain;padding:0 2px 12px;scrollbar-width:none}.section-rail::-webkit-scrollbar{display:none}.panel{display:flex;flex:0 0 100%;min-height:430px;flex-direction:column;gap:12px;scroll-snap-align:start;scroll-snap-stop:always}.summary{display:grid;grid-template-columns:1.2fr .8fr;gap:12px}.card{border:1px solid rgba(216,189,137,.18);border-radius:8px;padding:17px;background:#080809}.label{color:#948c82;font-size:11px;letter-spacing:.12em;text-transform:uppercase}.value{display:block;margin-top:6px;font-size:22px;line-height:1.15}.points{font-size:34px;color:#e6cb91}.history,.stack{display:grid;gap:9px;margin-top:12px}.event{display:grid;grid-template-columns:72px 1fr auto;gap:10px;align-items:center;padding:11px 0;border-top:1px solid rgba(255,255,255,.07);font-size:13px}.event:first-child{border-top:0}.event-date,.event-status{color:#8f8880}.event-delta{color:#d9bd82}.care{border-color:rgba(225,193,126,.38);background:#15120f}.care h2{margin:8px 0;font-size:21px}.care p{margin:0;color:#b7afa4;font-size:13px;line-height:1.6}.care-code{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:14px 0;padding:13px 14px;border-radius:8px;background:#080807}.care-code strong{font-size:24px;letter-spacing:.15em;color:#ecd18f}.care button{margin-top:14px;text-align:center;background:#f0d892;color:#181207;font-weight:700}.details{border-top:1px solid rgba(255,255,255,.08);padding-top:12px}.details summary{cursor:pointer;color:#e7e2d8;font-size:14px}.details[open] summary{margin-bottom:10px}.group-title{margin:4px 0;font-size:14px;color:#e7e2d8}.empty{margin:0;color:#aaa29a;font-size:14px;line-height:1.55}
    .member-nav{display:flex;gap:8px;overflow-x:auto;margin:22px 0 0;padding:4px;border:1px solid rgba(216,189,137,.18);border-radius:8px;background:rgba(0,0,0,.22);scrollbar-width:none}.member-nav::-webkit-scrollbar{display:none}.member-nav button{width:auto;white-space:nowrap;border:0;border-radius:999px;padding:10px 12px;background:transparent;color:#aaa29a;font-size:12px;text-align:center}.member-nav button[aria-current="true"]{background:#f0d892;color:#181207;font-weight:800}.status{margin-top:22px;color:#7f7972;font-size:12px;line-height:1.5}.hidden{display:none!important}@media(max-width:390px){main{padding:24px 16px}.summary,.detail-grid{grid-template-columns:1fr}.event{grid-template-columns:66px 1fr}.event-status{grid-column:2}}@media(min-width:700px){.panel{flex-basis:calc(50% - 6px)}.section-rail{flex-wrap:wrap;overflow:visible;scroll-snap-type:none}}@media(prefers-reduced-motion:reduce){.section-rail{scroll-behavior:auto}*{animation:none!important;transition:none!important}}

    body.signup-mode{padding:0 0 max(24px,env(safe-area-inset-bottom));background:radial-gradient(circle at 50% -8%,#473026 0,transparent 38%),#080809}
    body.signup-mode main{width:min(100%,560px);min-height:100vh;padding:26px 18px 34px;border:0;border-radius:0;background:linear-gradient(160deg,#241d1c,#101012 55%,#09090b);box-shadow:none}
    body.signup-mode .mark{font-size:10px;letter-spacing:.25em}body.signup-mode .title{margin:12px 0 6px;color:#fff7ed;font-size:32px}body.signup-mode .sub{color:#c6bdb3}
    body.signup-mode #message{margin:16px 0 0;padding:11px 13px;border-left:2px solid #d9ae77;border-radius:0 8px 8px 0;background:#dfb58014;color:#e5d0b2;font-size:13px;line-height:1.55}
    body.signup-mode .member-nav,body.signup-mode #profile{display:none!important}body.signup-mode .signup{margin-top:18px;gap:15px}
    .signup-hero{position:relative;display:flex;align-items:center;min-height:150px;overflow:hidden;padding:22px;border:1px solid #e7bb8159;border-radius:18px;background:radial-gradient(circle at 85% 12%,#b6824f55,transparent 42%),linear-gradient(130deg,#292321,#131315 70%);box-shadow:0 18px 44px #0004}
    .signup-hero::before,.signup-hero::after{content:"";position:absolute;right:-43px;top:-78px;width:230px;height:230px;border:1px solid #f1cd9c45;border-radius:50%;pointer-events:none}.signup-hero::after{right:-14px;top:-49px;width:172px;height:172px;border-color:#f1cd9c30}
    .signup-crest{position:relative;z-index:1;display:grid;place-content:center;flex:0 0 94px;height:94px;margin-right:18px;border:1px solid #ffdeae94;border-radius:50%;box-shadow:inset 0 0 0 6px #e7b97c14,0 0 24px #e0a36120;color:#f9e4c1;font:26px Georgia,serif;letter-spacing:.09em;text-align:center}.signup-crest small{font:9px Georgia,serif;letter-spacing:.3em}
    .signup-hero-copy{position:relative;z-index:1}.signup-hero-copy span{color:#d2b894;font-size:10px;letter-spacing:.17em}.signup-hero-copy strong{display:block;margin-top:8px;color:#fff6e7;font-size:18px;line-height:1.35}.signup-hero-copy p{margin:6px 0 0;color:#bdb4ad;font-size:12px}
    .signup-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0;padding:0;list-style:none}.signup-steps li{display:grid;gap:4px;padding:11px 8px;border:1px solid #e6c29224;border-radius:10px;background:#ffffff06;color:#c8c0b9;font-size:11px;text-align:center}.signup-steps b{color:#edc895;font-size:11px;letter-spacing:.12em}
    .signup-section-heading{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-top:5px}.signup-section-heading h2{font-size:19px;color:#fff1dc}.signup-section-heading span{color:#a9a09a;font-size:11px}
    .signup-loading{margin:0;padding:22px;border:1px dashed #e6c29240;border-radius:14px;color:#d0c6bb;font-size:13px;text-align:center}
    body.signup-mode .signup-package{position:relative;gap:10px;padding:18px;border-radius:16px;border-color:#f1d0a438;background:linear-gradient(140deg,#24201d,#141315 72%)}.signup-package::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;border-radius:16px 0 0 16px;background:#c9ac82}
    .signup-package-elite{background:linear-gradient(135deg,#352023,#171315 72%)!important}.signup-package-elite::before{background:#d28086}.signup-package-red_card{background:linear-gradient(135deg,#411b24,#191316 72%)!important}.signup-package-red_card::before{background:#d55d72}
    .signup-package-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.signup-package-top strong{color:#fff6ec}.signup-package-top span{padding:4px 8px;border:1px solid #e9c8a133;border-radius:100px;color:#d7b58a;font-size:10px;letter-spacing:.11em}
    .signup-price{display:flex;align-items:baseline;gap:6px}.signup-price .value{margin:0;color:#fff7ea;font-size:30px;font-weight:700;letter-spacing:-.04em}.signup-price small{color:#b9a894;font-size:12px}.signup-period{margin:0;color:#c4b5a9;font-size:12px}
    body.signup-mode .signup-package button{margin-top:6px;border:0;border-radius:11px;background:linear-gradient(100deg,#f1d8aa,#dfb879);box-shadow:0 8px 22px #dca56021;color:#1e160f;font-size:14px;text-align:center}
    body.signup-mode .signup-private{padding:18px;border-color:#d6be953d;border-radius:16px;background:linear-gradient(125deg,#171718,#101011)}.signup-private strong{color:#f2d7a9}.signup-private .signup-note{margin:0}
    .signup-footer{margin:1px 0 0;padding:13px 2px 0;border-top:1px solid #ecc69129;color:#a99f94;font-size:11px;line-height:1.6}body.signup-mode .status{margin-top:18px;text-align:center}
    @media(max-width:370px){.signup-hero{padding:16px;min-height:136px}.signup-crest{flex-basis:74px;height:74px;margin-right:12px;font-size:21px}.signup-hero-copy strong{font-size:16px}.signup-steps li{font-size:10px}}
    @media(min-width:600px){body.signup-mode{padding:24px}body.signup-mode main{min-height:calc(100vh - 48px);border:1px solid #d8bd8938;border-radius:20px;padding:32px}}
    .detail-grid,.benefit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.detail-grid .value{font-size:17px}.payment-status{color:#e6cb91}.benefit-grid{margin:14px 0}.benefit-card{padding:14px;border:1px solid rgba(216,189,137,.18);border-radius:14px;background:rgba(255,255,255,.025)}.benefit-card strong{display:block;margin-top:6px;color:#f0d892;font-size:20px}.wallet-code{letter-spacing:.16em}.wallet-state{color:#d9c18d}
  </style>
</head>
<body class="${config.intent === "signup" ? "signup-mode" : ""}">
<main>
  <div class="mark" data-copy="mark">MMD Privé · Member Access</div>
  <h1 class="title" data-copy="title">My MMD</h1>
  <p class="sub" data-copy="subtitle">ดูสถานะสมาชิก คะแนน และสิทธิ์ของคุณได้ใน LINE ที่เดียว</p>
  <div id="message" role="status" aria-live="polite">กำลังเปิดการเชื่อมต่อกับ MMD ครับ</div>
  <div id="actions" class="actions" aria-label="ตัวเลือก"></div>
  <section id="signup" class="signup${config.intent === "signup" ? "" : " hidden"}" aria-label="สมัครสมาชิกใน LINE">
    <div class="signup-hero">
      <div class="signup-crest" aria-hidden="true">MMD<small>PRIVÉ</small></div>
      <div class="signup-hero-copy"><span>MEMBER ACCESS · LINE</span><strong>โลกของ MMD<br>เริ่มจากตรงนี้</strong><p>เลือกเส้นทางสมาชิกที่เป็นคุณ</p></div>
    </div>
    <ol class="signup-steps" aria-label="ขั้นตอนสมัคร"><li><b>01</b>ยืนยัน LINE</li><li><b>02</b>เลือกแพ็กเกจ</li><li><b>03</b>ชำระและรอตรวจ</li></ol>
    <div class="signup-section-heading"><h2 id="signup-heading">Public Membership</h2><span>เลือกสิทธิ์ของคุณ</span></div>
    <p id="signup-note" class="signup-note">ราคาจากระบบ MMD เลือกแพ็กเกจเพื่อไปหน้าชำระเงิน</p>
    <div id="signup-packages" class="stack" aria-live="polite"><p class="signup-loading">ยืนยัน LINE เพื่อดูแพ็กเกจที่สมัครได้</p></div>
    <div class="card signup-private"><strong>Private Access / Black Card</strong><p class="signup-note">สนใจเส้นทาง Private? ดูรายละเอียดและส่งคำขอผ่านระบบสมาชิก</p><a class="private-link" href="/sigil/member/membership?source=line&amp;intent=signup">ดู Private Membership</a></div>
    <p class="signup-footer">สิทธิสมาชิกเริ่มหลังระบบตรวจสอบการชำระเงินอย่างเป็นทางการ · ติดตามสถานะได้ที่ MY MMD</p>
  </section>
  <nav class="member-nav" aria-label="Member sections">
    <button type="button" data-view="home" aria-current="true" data-copy="navHome">👤 HOME</button>
    <button type="button" data-view="points" aria-current="false" data-copy="navPoints">Points</button>
    <button type="button" data-view="package" aria-current="false" data-copy="navPackage">📦 PACKAGE</button>
    <button type="button" data-view="jobs" aria-current="false" data-copy="navJobs">💼 JOBS</button>
    <button type="button" data-view="history" aria-current="false" data-copy="navHistory">🧾 HISTORY</button>
    <button type="button" data-view="care" aria-current="false" data-copy="navCare">🎁 CARE</button>
    <button type="button" data-view="coupons" aria-current="false" data-copy="navCoupons">🎟 COUPONS</button>
  </nav>
  <section id="profile" class="profile hidden" aria-label="Member profile">
    <div class="section-rail">
    <section id="home" class="panel" aria-label="Home">
    <div class="card"><span class="label" data-copy="memberLabel">Member</span><strong id="profile-name" class="value">สมาชิก MMD</strong><span id="profile-status" class="sub"></span></div>
    <div class="card"><span class="label" data-copy="contactLabel">Contact</span><div class="detail-grid"><div><span class="label" data-copy="emailLabel">Email</span><strong id="profile-email" class="value">—</strong></div><div><span class="label" data-copy="phoneLabel">Phone</span><strong id="profile-phone" class="value">—</strong></div></div></div>
    <div class="summary">
      <div class="card"><span class="label" data-copy="tierLabel">Tier</span><strong id="profile-tier" class="value">Member</strong></div>
      <div id="points-card" class="card"><span class="label" data-copy="pointsLabel">Active Points</span><strong id="profile-points" class="value points">0</strong></div>
    </div>
    <div id="member-details" class="detail-grid hidden">
      <div id="expiry-card" class="card hidden"><span class="label" data-copy="expiryLabel">Membership valid until</span><strong id="profile-expiry" class="value">—</strong></div>
      <div id="payment-card" class="card hidden"><span class="label" data-copy="paymentLabel">Payment status</span><strong id="profile-payment" class="value payment-status">—</strong></div>
    </div>
    <div class="card"><span class="label" data-copy="packageTitle">Current package</span><strong id="home-package" class="value">—</strong><p id="home-package-note" class="sub"></p></div>
    <div class="card"><span class="label" data-copy="jobsTitle">Next job</span><div id="next-job" class="history"></div></div>
    <div class="card"><span class="label" data-copy="historyLabel">History · Last 1 Year</span><div id="history" class="history"></div></div>
    </section>
    <section id="points" class="panel" aria-label="Points">
      <div class="card"><h2 data-copy="pointsTitle">⭐ Points</h2><strong id="points-total" class="value points">—</strong><p id="points-rate" class="sub"></p><p id="points-expiry" class="sub"></p></div>
      <div class="card"><span id="service-spend-label" class="label">Service spend</span><div class="detail-grid"><div><span id="lifetime-spend-label" class="label">Lifetime</span><strong id="points-lifetime-spend" class="value">—</strong></div><div><span id="spend-365-label" class="label">Last 365 days</span><strong id="points-365-spend" class="value">—</strong></div></div></div>
      <div class="card"><span class="label" data-copy="pointsHistoryLabel">Points history</span><div id="points-history" class="history"></div></div>
    </section>
    <section id="package" class="panel" aria-label="Package">
      <div class="card"><h2 data-copy="packageTitle">📦 Package</h2><div id="current-package" class="stack"></div></div>
      <details class="card details"><summary data-copy="packageHistoryLabel">Package history</summary><div id="package-history" class="stack"></div></details>
    </section>
    <section id="jobs" class="panel" aria-label="Jobs">
      <div class="card"><h2 data-copy="jobsTitle">💼 Jobs</h2><div id="jobs-groups" class="stack"></div></div>
      <details class="card details"><summary data-copy="requestsLabel">Recent requests</summary><div id="requests" class="stack"></div></details>
      <details class="card details"><summary data-copy="mmsLabel">MMS prebookings</summary><div id="mms" class="stack"></div></details>
    </section>
    <section id="history-panel" class="panel" aria-label="History">
      <div class="card"><h2 data-copy="historyTitle">🧾 History</h2><p id="history-window" class="sub"></p><div id="v2-history" class="history"></div></div>
      <details class="card details"><summary data-copy="paymentHistoryLabel">Payment history</summary><div id="payment-history" class="stack"></div></details>
    </section>
    <section id="care" class="panel" aria-label="Care"><div class="card care">
      <span class="label" data-copy="careLabel">6 Years · Care Back</span><h2 data-copy="careTitle">Personal Care-Back Privilege</h2>
      <p id="care-message">ตรวจสอบผ่าน LINE เพื่อเปิดสิทธิ์ CARE BACK ก่อน คูปองส่วนตัวจะเปิดหลังส่งคำอวยพรถึง MMD สำเร็จครับ</p>
      <div id="care-benefits" class="benefit-grid hidden" aria-label="Personalized benefits"></div>
      <div id="care-code" class="care-code hidden"><span class="label">Personal Code</span><strong id="care-code-value"></strong></div>
      <button id="care-button" type="button">ตรวจสิทธิ์ CARE BACK</button>
      <div id="wish" class="wish hidden">
        <label for="wish-text" class="label">Birthday Wish</label>
        <textarea id="wish-text" maxlength="600" placeholder="ฝากคำอวยพรวันเกิดให้ MMD ได้ที่นี่ครับ"></textarea>
        <button id="wish-submit" type="button">ส่งคำอวยพรให้ MMD</button>
        <div id="wish-result" class="wish-result hidden" role="status" aria-live="polite"></div>
      </div>
    </div></section>
    <section id="coupons" class="panel" aria-label="Coupon Wallet"><div class="card">
      <span class="label" data-copy="couponWalletLabel">Member LIFF</span><h2 data-copy="couponWalletTitle">🎟 คูปองของฉัน</h2>
      <div id="coupon-wallet" class="stack"><p class="empty" data-copy="couponWalletEmpty">ยังไม่มีคูปองที่ออกให้กับบัญชีนี้ครับ</p></div>
    </div></section>
    </div>
  </section>
  <div id="status" class="status">MMD Privé</div>
</main>
<script src="${LIFF_SDK_URL}"></script>
<script nonce="${nonce}">
(() => {
  "use strict";
  const CONFIG = ${safeConfig};
  const message = document.getElementById("message");
  const actions = document.getElementById("actions");
  const profile = document.getElementById("profile");
  const signup = document.getElementById("signup");
  const signupPackages = document.getElementById("signup-packages");
  const careButton = document.getElementById("care-button");
  const wishPanel = document.getElementById("wish");
  const wishText = document.getElementById("wish-text");
  const wishSubmit = document.getElementById("wish-submit");
  const wishResult = document.getElementById("wish-result");
  const locale = CONFIG.language || "th";
  const copy = {
    th: { mark:"MMD Privé · Member Dashboard", title:"My MMD", subtitle:"ผมเตรียมข้อมูลสมาชิกของคุณไว้ใน LINE อย่างเรียบง่ายและเป็นส่วนตัวครับ", navProfile:"ภาพรวม", navHome:"👤 HOME", navPoints:"⭐ POINTS", navPackage:"📦 PACKAGE", navJobs:"💼 JOBS", navHistory:"🧾 HISTORY", navCare:"🎁 CARE", memberLabel:"สวัสดีครับ", contactLabel:"ข้อมูลติดต่อ", emailLabel:"อีเมล", phoneLabel:"เบอร์โทร", tierLabel:"ระดับสมาชิก", pointsLabel:"คะแนนที่ใช้งานได้", expiryLabel:"สมาชิกใช้ได้ถึง", paymentLabel:"สถานะการชำระ", historyLabel:"History · Last 1 Year", pointsTitle:"⭐ Points", pointsHistoryLabel:"รายการคะแนน", packageTitle:"📦 Package", packageHistoryLabel:"ประวัติแพ็กเกจ", jobsTitle:"💼 Jobs", requestsLabel:"คำขอล่าสุด", mmsLabel:"MMS prebookings", historyTitle:"🧾 History", paymentHistoryLabel:"ประวัติการชำระ", careLabel:"6 Years · Care Back", careTitle:"Personal Care-Back Privilege", careIntro:"ผมจะช่วยตรวจสอบสิทธิ์ CARE BACK ให้ก่อนครับ คูปองส่วนตัวจะเปิดหลังส่งคำอวยพรถึง MMD สำเร็จ", careButton:"ตรวจสิทธิ์ CARE BACK", wishPlaceholder:"ฝากคำอวยพรวันเกิดให้ MMD ได้ที่นี่ครับ", wishSubmit:"ส่งคำอวยพรให้ MMD", ready:"ผมเตรียมข้อมูลที่ยืนยันได้ของคุณไว้แล้วครับ", checking:"ผมกำลังตรวจสอบข้อมูลของคุณครับ", checkingPoints:"กำลังตรวจสอบคะแนนของคุณครับ", pointsRate:"ทุก 100 บาท = 1 คะแนน", expiring:"คะแนนใกล้หมดอายุ", empty:"ยังไม่มีรายการที่ยืนยันได้ในช่วงนี้ครับ", careLoading:"กำลังตรวจสอบสิทธิ์", careRetry:"ลองตรวจสอบอีกครั้ง", wishEmpty:"กรุณาเขียนคำอวยพรก่อนส่งครับ", wishSaving:"กำลังเก็บคำอวยพร", wishError:"ตอนนี้ยังเก็บคำอวยพรไม่ได้ครับ กรุณาลองใหม่อีกครั้ง", wishRetry:"ลองส่งอีกครั้ง", careChecked:"สิทธิ์ CARE BACK ของคุณถูกตรวจแล้ว ส่งคำอวยพรถึง MMD สำเร็จเพื่อเปิดคูปองส่วนตัว 10% ครับ", wishDone:"MMD ได้รับคำอวยพรของคุณแล้วครับ", wishPending:"ระบบกำลังยืนยันการบันทึกคำอวยพรเดิมอย่างปลอดภัย กรุณากลับมาตรวจสอบอีกครั้งครับ", wishReview:"ข้อมูลนี้ยังต้องตรวจสอบก่อนครับ ผมจะเก็บเส้นทางของคุณไว้อย่างปลอดภัย", couponReady:"ส่งคำอวยพรเพื่อเปิดคูปอง", claimMessage:"ผมจะอัปเดตสิทธิ์ตามสถานะสมาชิกและการยืนยันที่เกี่ยวข้องครับ", careCheckedButton:"ตรวจสิทธิ์ CARE BACK แล้ว", careResumedButton:"อัปเดตสิทธิ์ CARE BACK แล้ว", promoLoading:"กำลังตรวจสอบสิทธิ์ CARE BACK อย่างปลอดภัยครับ" },
    en: { mark:"MMD Privé · Member Dashboard", title:"My MMD", subtitle:"Your member information in LINE, simply and privately.", navProfile:"Overview", navHome:"👤 HOME", navPoints:"⭐ POINTS", navPackage:"📦 PACKAGE", navJobs:"💼 JOBS", navHistory:"🧾 HISTORY", navCare:"🎁 CARE", memberLabel:"Member", contactLabel:"Contact", emailLabel:"Email", phoneLabel:"Phone", tierLabel:"Member tier", pointsLabel:"Active points", expiryLabel:"Membership valid until", paymentLabel:"Payment status", historyLabel:"History · Last 1 Year", pointsTitle:"⭐ Points", pointsHistoryLabel:"Points history", packageTitle:"📦 Package", packageHistoryLabel:"Package history", jobsTitle:"💼 Jobs", requestsLabel:"Recent requests", mmsLabel:"MMS prebookings", historyTitle:"🧾 History", paymentHistoryLabel:"Payment history", careLabel:"6 Years · Care Back", careTitle:"Personal Care-Back Privilege", careIntro:"We will check CARE BACK first. Your personal coupon becomes available after your wish is submitted successfully.", careButton:"Check CARE BACK", wishPlaceholder:"Leave a birthday wish for MMD here.", wishSubmit:"Send wish to MMD", ready:"Your confirmed information is ready.", checking:"We are checking your information.", checkingPoints:"Your points are being checked.", pointsRate:"Every THB 100 = 1 point", expiring:"Points expiring soon", empty:"No confirmed activity is available here yet.", careLoading:"Checking eligibility", careRetry:"Try checking again", wishEmpty:"Please write a wish before sending.", wishSaving:"Saving your wish", wishError:"Your wish could not be saved. Please try again.", wishRetry:"Try sending again", careChecked:"Your CARE BACK eligibility is checked. Submit a wish to unlock your personal 10% coupon.", wishDone:"MMD has received your wish.", wishPending:"We are securely confirming your previous wish. Please check again later.", wishReview:"This request needs further review. We have kept your route secure.", couponReady:"Send a wish to unlock the coupon", claimMessage:"MMD will update your privilege after the required membership and verification checks.", careCheckedButton:"CARE BACK checked", careResumedButton:"CARE BACK updated", promoLoading:"Checking your CARE BACK eligibility securely" },
    zh: { mark:"MMD Privé · Member Dashboard", title:"我的 MMD", subtitle:"在 LINE 内简单、私密地查看您的会员信息。", navProfile:"概览", navHome:"👤 HOME", navPoints:"⭐ POINTS", navPackage:"📦 PACKAGE", navJobs:"💼 JOBS", navHistory:"🧾 HISTORY", navCare:"🎁 CARE", memberLabel:"会员", contactLabel:"联系方式", emailLabel:"邮箱", phoneLabel:"电话", tierLabel:"会员等级", pointsLabel:"可用积分", expiryLabel:"会员有效期至", paymentLabel:"付款状态", historyLabel:"最近一年记录", pointsTitle:"⭐ 积分", pointsHistoryLabel:"积分记录", packageTitle:"📦 套餐", packageHistoryLabel:"套餐历史", jobsTitle:"💼 服务", requestsLabel:"最近请求", mmsLabel:"MMS 预订", historyTitle:"🧾 记录", paymentHistoryLabel:"付款记录", careLabel:"6 Years · Care Back", careTitle:"专属 Care Back 礼遇", careIntro:"请先检查 CARE BACK。成功提交祝福后，您的专属优惠券将会开启。", careButton:"检查 CARE BACK", wishPlaceholder:"在这里留下给 MMD 的生日祝福。", wishSubmit:"向 MMD 发送祝福", ready:"您的已确认信息已准备好。", checking:"正在检查您的信息。", checkingPoints:"正在检查您的积分。", pointsRate:"每 THB 100 = 1 积分", expiring:"即将到期的积分", empty:"目前没有可显示的已确认记录。", careLoading:"正在检查资格", careRetry:"再次检查", wishEmpty:"请先写下祝福再发送。", wishSaving:"正在保存祝福", wishError:"祝福暂时无法保存，请稍后再试。", wishRetry:"再次发送", careChecked:"您的 CARE BACK 资格已检查。成功提交祝福后即可开启专属 10% 优惠券。", wishDone:"MMD 已收到您的祝福。", wishPending:"系统正在安全确认您之前提交的祝福，请稍后再查看。", wishReview:"此请求仍需进一步审核，我们已安全保留您的流程。", couponReady:"发送祝福以开启优惠券", claimMessage:"MMD 将在完成会员与验证检查后更新您的礼遇。", careCheckedButton:"CARE BACK 已检查", careResumedButton:"CARE BACK 已更新", promoLoading:"正在安全检查 CARE BACK 资格" },
  }[locale] || {};
  Object.assign(copy, ({
    th:{navCoupons:"🎟 COUPONS",couponWalletLabel:"Member LIFF",couponWalletTitle:"🎟 คูปองของฉัน",couponWalletEmpty:"ยังไม่มีคูปองที่ออกให้กับบัญชีนี้ครับ",pointsLabel:"คะแนนสะสมทั้งหมด",pointsNoExpiry:"Points สะสมตลอดอายุ · ยังไม่ตัด 365 วัน",serviceSpendLabel:"ยอดใช้บริการที่ยืนยันแล้ว",lifetimeSpendLabel:"ยอดสะสมทั้งหมด",spend365Label:"ย้อนหลัง 365 วัน"},
    en:{navCoupons:"🎟 COUPONS",couponWalletLabel:"Member LIFF",couponWalletTitle:"🎟 My coupons",couponWalletEmpty:"No coupon has been issued to this account yet.",pointsLabel:"Lifetime points",pointsNoExpiry:"Lifetime Points · no 365-day expiry",serviceSpendLabel:"Verified service spend",lifetimeSpendLabel:"Lifetime",spend365Label:"Last 365 days"},
    zh:{navCoupons:"🎟 COUPONS",couponWalletLabel:"Member LIFF",couponWalletTitle:"🎟 我的优惠券",couponWalletEmpty:"此账户暂未获发优惠券。",pointsLabel:"累计积分",pointsNoExpiry:"累计积分 · 暂不按 365 天到期",serviceSpendLabel:"已确认服务消费",lifetimeSpendLabel:"累计",spend365Label:"最近 365 天"},
  })[locale] || {});
  if (CONFIG.intent === "signup") {
    document.querySelector(".mark").textContent = "MMD PRIVÉ · LINE MEMBERSHIP";
    document.querySelector(".title").textContent = locale === "en" ? "Join MMD" : locale === "zh" ? "加入 MMD" : "สมัครสมาชิก MMD";
    document.querySelector(".sub").textContent = locale === "en" ? "Choose your membership inside LINE." : locale === "zh" ? "在 LINE 中选择您的会员方案。" : "เลือกแพ็กเกจที่เหมาะกับคุณได้ใน LINE";
  }
  const allowedIntentIds = new Set(["signup", "renew", "status"]);
  let busy = false;

  document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
  for (const element of document.querySelectorAll("[data-copy]")) {
    const key = element.getAttribute("data-copy");
    if (copy[key]) element.textContent = copy[key];
  }
  document.getElementById("care-message").textContent = copy.careIntro || document.getElementById("care-message").textContent;
  document.getElementById("service-spend-label").textContent = copy.serviceSpendLabel || "Service spend";
  document.getElementById("lifetime-spend-label").textContent = copy.lifetimeSpendLabel || "Lifetime";
  document.getElementById("spend-365-label").textContent = copy.spend365Label || "Last 365 days";
  careButton.textContent = copy.careButton || careButton.textContent;
  wishText.placeholder = copy.wishPlaceholder || wishText.placeholder;
  wishSubmit.textContent = copy.wishSubmit || wishSubmit.textContent;
  const initialView = CONFIG.view === "care" || CONFIG.intent === "promo" ? "care" : (CONFIG.view || "home");
  for (const item of document.querySelectorAll("[data-view]")) item.setAttribute("aria-current", String(item.getAttribute("data-view") === initialView));
  for (const button of document.querySelectorAll("[data-view]")) {
    button.addEventListener("click", () => {
      const view = button.getAttribute("data-view");
      for (const item of document.querySelectorAll("[data-view]")) item.setAttribute("aria-current", String(item === button));
      const target = document.getElementById(view === "history" ? "history-panel" : view);
      target?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    });
  }

  function show(text) {
    message.textContent = String(text || "ไม่สามารถดำเนินการต่อได้ครับ กรุณากลับมาเปิดผ่าน LINE ของ MMD อีกครั้ง");
  }

  function setBusy(value) {
    busy = Boolean(value);
    for (const button of actions.querySelectorAll("button")) button.disabled = busy;
    for (const button of signupPackages.querySelectorAll("button")) button.disabled = busy;
  }

  function verifiedCheckoutUrl(value) {
    try {
      const url = new URL(String(value || ""));
      const keys = [...url.searchParams.keys()];
      return url.protocol === "https:" && url.hostname === "mmdbkk.com" && url.pathname === "/pay/checkout"
        && !url.hash && keys.length === 1 && keys[0] === "t" && Boolean(url.searchParams.get("t")) ? url.href : "";
    } catch { return ""; }
  }

  async function purchasePublicMembership(packageCode) {
    if (busy) return;
    setBusy(true);
    show("กำลังเตรียมหน้าชำระเงินใน LINE ครับ");
    try {
      const response = await fetch(CONFIG.publicPurchaseEndpoint, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify({ package_code: packageCode }),
      });
      const payload = await response.json().catch(() => null);
      if (response.status === 401) { show("กรุณาเปิดหน้าสมัครผ่าน Rich Menu ใน LINE อีกครั้งเพื่อยืนยันตัวตนครับ"); return; }
      const url = response.ok && payload?.ok === true && payload?.official_verification_required === true
        && payload?.entitlement_granted === false ? verifiedCheckoutUrl(payload.customer_payment_url) : "";
      if (!url) { show("ตอนนี้ยังเปิดหน้าชำระเงินไม่ได้ครับ กรุณาลองอีกครั้ง"); return; }
      window.location.assign(url);
    } catch { show("ตอนนี้ยังเปิดหน้าชำระเงินไม่ได้ครับ กรุณาลองอีกครั้ง"); }
    finally { setBusy(false); }
  }

  async function readSignupCatalog() {
    if (CONFIG.intent !== "signup") return;
    signup.classList.remove("hidden");
    signupPackages.replaceChildren();
    try {
      const response = await fetch(CONFIG.publicCatalogEndpoint, { method:"GET", credentials:"same-origin", headers:{"accept":"application/json"} });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true || !Array.isArray(payload.packages)) throw new Error("catalog_unavailable");
      const packages = payload.packages.filter((item) =>
        ["mmd_member", "elite", "red_card"].includes(item?.package_code)
        && Number.isInteger(item.amount_thb) && item.amount_thb > 0
        && Number.isInteger(item.duration_days) && item.duration_days > 0
      );
      if (packages.length !== 3) throw new Error("catalog_incomplete");
      for (const item of packages) {
        const card = document.createElement("div"); card.className = "card signup-package signup-package-" + item.package_code;
        const top = document.createElement("div"); top.className = "signup-package-top";
        const title = document.createElement("strong"); title.textContent = String(item.label || item.package_code);
        const tag = document.createElement("span"); tag.textContent = item.package_code === "mmd_member" ? "MEMBER" : item.package_code === "elite" ? "ELITE" : "RED CARD";
        top.append(title, tag);
        const price = document.createElement("div"); price.className = "signup-price";
        const amount = document.createElement("span"); amount.className = "value"; amount.textContent = new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US").format(item.amount_thb);
        const currency = document.createElement("small"); currency.textContent = "THB"; price.append(amount, currency);
        const period = document.createElement("p"); period.className = "signup-period";
        const term = item.duration_days === 365 ? 1 : item.duration_days === 730 ? 2 : null;
        period.textContent = term ? (locale === "th" ? "ระยะสมาชิก " + term + " ปี" : term + (term === 1 ? " year" : " years")) : (locale === "th" ? "ระยะเวลา " + item.duration_days + " วัน" : item.duration_days + " days");
        const button = document.createElement("button"); button.type = "button"; button.textContent = locale === "th" ? "เลือกแพ็กเกจนี้  →" : "Choose this package  →";
        button.addEventListener("click", () => purchasePublicMembership(item.package_code));
        card.append(top, price, period, button); signupPackages.append(card);
      }
      show(locale === "th" ? "เลือกแพ็กเกจและสมัครสมาชิกด้วยบัญชี LINE นี้ได้เลยครับ" : "Choose a package to continue with this LINE account.");
    } catch { show("ตอนนี้ยังแสดงแพ็กเกจไม่ได้ครับ กรุณาลองเปิดใหม่อีกครั้ง"); }
  }

  function isDiagnosticMode() {
    try { return new URLSearchParams(window.location.search).get("debug") === "1"; }
    catch { return false; }
  }

  function safeDiagnosticCode(value) {
    const code = String(value || "UNKNOWN_ERROR").trim().toUpperCase();
    return /^[A-Z0-9_]{2,80}$/.test(code) ? code : "UNKNOWN_ERROR";
  }

  function showTemporaryError(ref) {
    let message = "ตอนนี้ระบบตรวจสอบข้อมูลชั่วคราวยังไม่พร้อมครับ กรุณาลองใหม่อีกครั้ง";
    if (isDiagnosticMode() && ref) message += "\\nRef: " + ref;
    show(message);
  }

  async function call(endpoint, body) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify(body || {}),
      });
    } catch {
      showTemporaryError("CLIENT_FETCH_FAILED");
      return null;
    }
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      showTemporaryError("HTTP " + response.status + " · INVALID_RESPONSE");
      return null;
    }
    if (!response.ok || payload.ok !== true) {
      if (payload.data) render(payload.data);
      else showTemporaryError("HTTP " + response.status + " · " + safeDiagnosticCode(payload?.error?.code));
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
    await readCouponWallet();
    if (CONFIG.intent === "promo" && CONFIG.campaign === "care_back") await readCareBackState();
    return payload.data || {};
  }

  async function readCouponWallet() {
    const response = await fetch(CONFIG.couponWalletEndpoint, { method:"GET",credentials:"same-origin",headers:{"accept":"application/json"} });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) return null;
    renderCouponWallet(payload.wallet || {});
    return payload.wallet || {};
  }

  async function readCareBackState() {
    const response = await fetch(CONFIG.careBackStateEndpoint, { method:"GET",credentials:"same-origin",headers:{"accept":"application/json"} });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.ok !== true) return null;
    renderCareBackState(payload);
    return payload;
  }

  function renderCareBackState(data) {
    if (data && data.claim) renderCareBackClaim(data.claim);
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
    const view = data && typeof data.customer_360 === "object" ? data.customer_360 : legacyCustomerView(data);
    const member = view.member || {};
    const points = view.points || {};
    const packages = view.packages || {};
    const jobs = view.jobs || {};
    const payments = view.payments || {};
    const historyView = view.history || {};
    profile.classList.remove("hidden");
    document.getElementById("profile-name").textContent = String(member.display_name || data.display_name || "สมาชิก MMD");
    document.getElementById("profile-tier").textContent = String(member.tier || data.tier || "Member");
    const contact = data.contactProfile || data.contact_profile || {};
    document.getElementById("profile-email").textContent = String(contact.email || "—");
    document.getElementById("profile-phone").textContent = String(contact.phone || "—");
    document.getElementById("profile-points").textContent = points.status === "verified" && Number.isInteger(points.active_points) ? new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "th-TH").format(points.active_points) : "—";
    document.getElementById("profile-status").textContent = membershipStatus(member.membership_status || data.membership_status);
    const expiry = safeDate(member.membership_expires_at || data.membership_expires_at);
    const payment = safePaymentStatus(payments.status || data.payment_status);
    document.getElementById("member-details").classList.toggle("hidden", !expiry && !payment);
    document.getElementById("expiry-card").classList.toggle("hidden", !expiry);
    document.getElementById("payment-card").classList.toggle("hidden", !payment);
    if (expiry) document.getElementById("profile-expiry").textContent = shortDate(expiry);
    if (payment) document.getElementById("profile-payment").textContent = paymentStatus(payment);
    renderHome(packages, jobs, historyView);
    renderPoints(points);
    renderPackages(packages);
    renderJobs(jobs, view.requests || {}, view.mms || {});
    renderHistory(historyView, payments);
    show(copy.ready || "ผมเตรียมข้อมูลที่ยืนยันได้ของคุณไว้แล้วครับ");
    if (CONFIG.view && CONFIG.view !== "home") document.getElementById(CONFIG.view === "history" ? "history-panel" : CONFIG.view)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    if (CONFIG.intent === "promo") document.getElementById("care")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
  }

  function legacyCustomerView(data) {
    return {
      member: { display_name:data.display_name, tier:data.tier, membership_status:data.membership_status, membership_expires_at:data.membership_expires_at },
      points: { status:Number.isInteger(data.points_records_count) ? "verified" : "checking", active_points:data.points, lifetime_service_spend_thb:data.lifetime_service_spend_thb, service_spend_365d_thb:data.service_spend_365d_thb, completed_service_count:data.completed_service_count, history:[] },
      packages: { status:"checking", current_package:null, package_history:[] },
      jobs: { status:"checking", upcoming_jobs:[], active_jobs:[], completed_jobs:[], cancelled_jobs:[] },
      payments: { status:data.payment_status, historical_verified:data.payment_history },
      history: { status:"verified", from:data.history_window?.from, to:data.history_window?.to, events:data.history },
      requests: { status:"checking", items:[] }, mms: { status:"not_available", prebookings:[] },
    };
  }

  function renderHome(packages, jobs, historyView) {
    const current = packages.status === "verified" ? packages.current_package : null;
    document.getElementById("home-package").textContent = current?.customer_safe_name || (packages.status === "checking" ? (copy.checking || "กำลังตรวจสอบ") : "—");
    document.getElementById("home-package-note").textContent = current ? [current.tier, current.end_date ? shortDate(current.end_date) : ""].filter(Boolean).join(" · ") : "";
    const next = document.getElementById("next-job"); next.replaceChildren();
    if (jobs.status !== "verified") appendEmpty(next, copy.checking || "กำลังตรวจสอบข้อมูลของคุณครับ");
    else {
      const job = safeList(jobs.upcoming_jobs)[0] || safeList(jobs.active_jobs)[0];
      if (!job) appendEmpty(next, copy.empty || "ยังไม่มีรายการที่ยืนยันได้ในช่วงนี้ครับ");
      else next.append(eventRow(job.date, job.service_title, job.status, [job.job_number ? "#" + job.job_number : "", job.model_display_name, job.start_time].filter(Boolean).join(" · ")));
    }
    const history = document.getElementById("history"); history.replaceChildren();
    const items = safeList(historyView.events).slice(0, 3);
    if (!items.length) appendEmpty(history, historyView.status === "checking" ? copy.checking : copy.empty);
    for (const item of items) history.append(eventRow(item.date, item.title, item.status, item.type === "points" ? signedPoints(item.points_delta) : item.type));
  }

  function renderPoints(points) {
    const verified = points.status === "verified";
    document.getElementById("points-total").textContent = verified && Number.isInteger(points.active_points) ? signedPoints(points.active_points).replace(/^\\+/, "") : "—";
    document.getElementById("points-rate").textContent = verified ? (copy.pointsRate || "") : (copy.checkingPoints || copy.checking || "");
    document.getElementById("points-expiry").textContent = verified ? (copy.pointsNoExpiry || "") : "";
    document.getElementById("points-lifetime-spend").textContent = verified ? formatThb(points.lifetime_service_spend_thb) : "—";
    document.getElementById("points-365-spend").textContent = verified ? formatThb(points.service_spend_365d_thb) : "—";
    const history = document.getElementById("points-history"); history.replaceChildren();
    if (points.status !== "verified") return appendEmpty(history, copy.checkingPoints || copy.checking);
    const items = safeList(points.history); if (!items.length) return appendEmpty(history, copy.empty);
    for (const item of items) history.append(eventRow(item.date, item.title, item.status, signedPoints(item.points_delta)));
  }

  function renderPackages(packages) {
    const current = document.getElementById("current-package"); current.replaceChildren();
    if (packages.status !== "verified") appendEmpty(current, copy.checking || "");
    else if (!packages.current_package) appendEmpty(current, copy.empty || "");
    else { const item = packages.current_package; current.append(eventRow(item.start_date || item.end_date, item.customer_safe_name, item.status, [item.tier, item.end_date ? shortDate(item.end_date) : ""].filter(Boolean).join(" · "))); }
    const history = document.getElementById("package-history"); history.replaceChildren();
    const items = packages.status === "verified" ? safeList(packages.package_history) : [];
    if (!items.length) return appendEmpty(history, packages.status === "checking" ? copy.checking : copy.empty);
    for (const item of items) history.append(eventRow(item.start_date || item.end_date, item.customer_safe_name, item.status, [item.tier, item.end_date ? shortDate(item.end_date) : ""].filter(Boolean).join(" · ")));
  }

  function renderJobs(jobs, requests, mms) {
    const groups = document.getElementById("jobs-groups"); groups.replaceChildren();
    if (jobs.status !== "verified") appendEmpty(groups, copy.checking || "");
    else {
      let rendered = false;
      for (const [key, state] of [["upcoming_jobs","upcoming"],["active_jobs","active"],["completed_jobs","completed"],["cancelled_jobs","cancelled"]]) {
        const items = safeList(jobs[key]); if (!items.length) continue; rendered = true;
        const heading = document.createElement("h3"); heading.className = "group-title"; heading.textContent = safeStatus(state); groups.append(heading);
        for (const job of items) groups.append(jobDetails(job));
      }
      if (!rendered) appendEmpty(groups, copy.empty || "");
    }
    renderBoundedRows("requests", requests.status === "verified" ? requests.items : [], requests.status === "checking" ? copy.checking : copy.empty, (item) => eventRow(item.preferred_date, item.requested_model_display_name || "MMD", item.status, [item.request_number ? "#" + item.request_number : "", item.preferred_time].filter(Boolean).join(" · ")));
    renderBoundedRows("mms", mms.status === "verified" ? mms.prebookings : [], mms.status === "checking" ? copy.checking : copy.empty, (item) => eventRow(item.date, item.service, item.status, [item.prebooking_number ? "#" + item.prebooking_number : "", item.therapist_display_name, item.time].filter(Boolean).join(" · ")));
  }

  function renderHistory(historyView, payments) {
    document.getElementById("history-window").textContent = safeDate(historyView.from) && safeDate(historyView.to) ? shortDate(historyView.from) + " - " + shortDate(historyView.to) : (historyView.status === "checking" ? (copy.checking || "") : "");
    renderBoundedRows("v2-history", historyView.status === "verified" ? historyView.events : [], historyView.status === "checking" ? copy.checking : copy.empty, (item) => eventRow(item.date, item.title, item.status, item.type === "points" ? signedPoints(item.points_delta) : item.type));
    renderBoundedRows("payment-history", payments.historical_verified, copy.empty, (item) => eventRow(item.date, item.title, item.status, Number.isInteger(item.amount) ? item.amount + " THB" : ""));
  }

  function renderBoundedRows(id, items, emptyCopy, renderItem) { const container = document.getElementById(id); container.replaceChildren(); const safe = safeList(items); if (!safe.length) return appendEmpty(container, emptyCopy); for (const item of safe) container.append(renderItem(item)); }
  function jobDetails(job) { const details = document.createElement("details"); details.className = "details"; const summary = document.createElement("summary"); summary.textContent = [job.job_number ? "#" + job.job_number : "", job.service_title].filter(Boolean).join(" · ") || "MMD"; details.append(summary); const content = document.createElement("div"); content.className = "history"; content.append(eventRow(job.date, job.model_display_name || job.service_title, job.status, [job.start_time, job.end_time, job.duration ? job.duration + " min" : ""].filter(Boolean).join(" · "))); if (job.location_customer_safe) { const place = document.createElement("p"); place.className = "sub"; place.textContent = job.location_customer_safe; content.append(place); } if (job.customer_safe_note) { const note = document.createElement("p"); note.className = "sub"; note.textContent = job.customer_safe_note; content.append(note); } details.append(content); return details; }
  function eventRow(dateValue, titleValue, stateValue, detail) { const row = document.createElement("div"); row.className = "event"; const date = document.createElement("span"); date.className = "event-date"; date.textContent = shortDate(dateValue); const title = document.createElement("strong"); title.textContent = String(titleValue || "MMD"); const state = document.createElement("span"); state.className = "event-status"; state.textContent = detail || safeStatus(stateValue); row.append(date, title, state); return row; }
  function appendEmpty(container, text) { const empty = document.createElement("p"); empty.className = "empty"; empty.textContent = String(text || copy.empty || ""); container.append(empty); }
  function safeList(value) { return Array.isArray(value) ? value : []; }

  function membershipStatus(value) { const labels = { th:{active:"สมาชิกใช้งานอยู่",grace:"อยู่ในช่วงผ่อนผัน",expired:"สมาชิกหมดอายุ",under_review:"อยู่ระหว่างตรวจสอบ",checking:"กำลังตรวจสอบ"}, en:{active:"Active member",grace:"Grace period",expired:"Expired",under_review:"Under review",checking:"Checking"}, zh:{active:"会员有效",grace:"宽限期",expired:"会员已过期",under_review:"审核中",checking:"检查中"} }; return (labels[locale] || labels.th)[value] || (labels[locale] || labels.th).checking; }
  function safeStatus(value) { const labels = { th:{completed:"เสร็จสิ้น",active:"ใช้งานอยู่",upcoming:"นัดหมายล่วงหน้า",cancelled:"ยกเลิก",expired:"หมดอายุ",posted:"บันทึกแล้ว",verified:"ตรวจสอบแล้ว",pending_review:"รอตรวจสอบ",checking:"กำลังตรวจสอบ"}, en:{completed:"Completed",active:"Active",upcoming:"Upcoming",cancelled:"Cancelled",expired:"Expired",posted:"Posted",verified:"Verified",pending_review:"Pending review",checking:"Checking"}, zh:{completed:"已完成",active:"有效",upcoming:"即将开始",cancelled:"已取消",expired:"已过期",posted:"已记录",verified:"已验证",pending_review:"待审核",checking:"检查中"} }; return (labels[locale] || labels.th)[value] || (labels[locale] || labels.th).checking; }
  function signedPoints(value) { const number = Number(value || 0); return (number >= 0 ? "+" : "") + new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "th-TH").format(number) + " pts"; }
  function formatThb(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? new Intl.NumberFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "th-TH",{style:"currency",currency:"THB",maximumFractionDigits:2}).format(number) : "—"; }
  function shortDate(value) { const date = new Date(String(value || "") + "T00:00:00+07:00"); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale === "en" ? "en-GB" : "th-TH",{day:"numeric",month:"short",year:"2-digit"}).format(date); }
  function safeDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : ""; }
  function safePaymentStatus(value) { return ["verified","pending_review","unavailable"].includes(String(value || "")) ? String(value) : ""; }
  function paymentStatus(value) { const labels = { th:{verified:"ตรวจสอบแล้ว",pending_review:"รอตรวจสอบ",unavailable:"ยังไม่พร้อมยืนยัน"}, en:{verified:"Verified",pending_review:"Pending review",unavailable:"Unavailable"}, zh:{verified:"已验证",pending_review:"待审核",unavailable:"暂不可确认"} }; return (labels[locale] || labels.th)[value] || "Unavailable"; }

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
    renderPersonalizedBenefits(data.personalized_benefits);
    renderCouponWallet(data.coupon_wallet);
    careButton.textContent = data.resumed ? (copy.careResumedButton || "อัปเดตสิทธิ์ CARE BACK แล้ว") : (copy.careCheckedButton || "ตรวจสิทธิ์ CARE BACK แล้ว");
    if (couponState === "wish_required") careButton.textContent = copy.couponReady || "ส่งคำอวยพรเพื่อเปิดคูปอง";
  }

  function renderPersonalizedBenefits(items) {
    const container = document.getElementById("care-benefits");
    container.replaceChildren();
    const benefits = safeList(items).slice(0, 4);
    container.classList.toggle("hidden", benefits.length === 0);
    for (const benefit of benefits) {
      const type = String(benefit && benefit.type || "");
      const value = Number(benefit && benefit.value);
      if (!Number.isInteger(value) || value <= 0) continue;
      const card = document.createElement("div"); card.className = "benefit-card";
      const label = document.createElement("span"); label.className = "label"; label.textContent = benefitLabel(type);
      const amount = document.createElement("strong"); amount.textContent = benefitValue(type, value);
      const state = document.createElement("span"); state.className = "sub"; state.textContent = benefitState(benefit.state);
      card.append(label, amount, state); container.append(card);
    }
    container.classList.toggle("hidden", container.childElementCount === 0);
  }

  function renderCouponWallet(wallet) {
    const container = document.getElementById("coupon-wallet");
    container.replaceChildren();
    const code = String(wallet && wallet.code || "");
    const status = String(wallet && wallet.status || "verification_required");
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return appendEmpty(container, couponStateLabel(status));
    const card = document.createElement("div"); card.className = "benefit-card";
    const label = document.createElement("span"); label.className = "label"; label.textContent = "CARE BACK · 10%";
    const value = document.createElement("strong"); value.className = "wallet-code"; value.textContent = code;
    const state = document.createElement("span"); state.className = "wallet-state"; state.textContent = couponStateLabel(status);
    card.append(label, value, state);
    if (wallet.expires_at) { const expiry = document.createElement("span"); expiry.className = "sub"; expiry.textContent = String(wallet.expires_at).slice(0, 10); card.append(expiry); }
    container.append(card);
  }

  function benefitLabel(type) { const labels = {th:{membership_extension:"ขยายเวลาสมาชิก",points_bonus:"คะแนนพิเศษ",personal_coupon:"คูปองส่วนตัว"},en:{membership_extension:"Membership extension",points_bonus:"Bonus points",personal_coupon:"Personal coupon"},zh:{membership_extension:"会员延期",points_bonus:"奖励积分",personal_coupon:"专属优惠券"}}; return (labels[locale] || labels.th)[type] || "CARE BACK"; }
  function benefitValue(type, value) { if (type === "membership_extension") return value + (locale === "en" ? " days" : locale === "zh" ? " 天" : " วัน"); if (type === "points_bonus") return "+" + value + " Points"; return value + "%"; }
  function benefitState(value) { const state = String(value || "pending"); const labels = {th:{ready:"พร้อมใช้",wish_required:"รอคำอวยพร",renewal_required:"รอต่ออายุ",payment_required:"รอยืนยันการชำระเงิน",verification_required:"รอตรวจสอบ",pending_application:"กำลังดำเนินการ",applied:"ได้รับแล้ว",used:"ใช้แล้ว",expired:"หมดอายุ"},en:{ready:"Ready",wish_required:"Wish required",renewal_required:"Renewal required",payment_required:"Payment verification required",verification_required:"Verification required",pending_application:"Processing",applied:"Applied",used:"Used",expired:"Expired"},zh:{ready:"可使用",wish_required:"等待祝福",renewal_required:"等待续费",payment_required:"等待付款验证",verification_required:"等待验证",pending_application:"处理中",applied:"已获得",used:"已使用",expired:"已过期"}}; return (labels[locale] || labels.th)[state] || (locale === "en" ? "Pending" : locale === "zh" ? "处理中" : "กำลังตรวจสอบ"); }
  function couponStateLabel(value) { return benefitState(value); }

  function render(data) {
    const screen = data && typeof data.screen === "object" ? data.screen : {};
    if (CONFIG.intent === "promo" && CONFIG.campaign === "care_back") {
      show(copy.promoLoading || "กำลังตรวจสอบสิทธิ์ CARE BACK อย่างปลอดภัยครับ");
      actions.replaceChildren();
      return;
    }
    if (CONFIG.intent === "signup") {
      actions.replaceChildren();
      show("กำลังเตรียมแพ็กเกจสมัครสมาชิกใน LINE ครับ");
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
      if (existingProfile) { await readSignupCatalog(); return; }
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
      if (started) {
        if (started.member_resolved) await readProfile();
        await readSignupCatalog();
      }
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
  const view = String(value || "home").trim().toLowerCase();
  if (view === "profile") return "home";
  if (view === "care_back") return "care";
  return new Set(["home", "points", "package", "jobs", "history", "care", "coupons", "signup"]).has(view) ? view : "home";
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
