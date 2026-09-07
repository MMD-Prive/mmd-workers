export const ADMIN_LOGIN_SESSION_PATH = "/internal/admin/login/session";
export const APPROVED_ADMIN_LOGIN_PAGE_ID = "admin-login-approved-hero";
export const APPROVED_ADMIN_LOGIN_HERO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a9c4646a60519ef8733bf67_SIGIL-Boss-Desktop.png";
export const APPROVED_ADMIN_LOGIN_PRIVACY_BG =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a99809b35879b57714758cd_Privacy%20AI%20Stewardship.webp";
export const APPROVED_ADMIN_LOGIN_WALL_BG =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a08f5600edcaaa6514e25f6_SigilWall.webp";
export const APPROVED_ADMIN_LOGIN_LOGO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0f2cbc7e26b6735aee4cb2_SIGIL%20LOGO%20Transp.webp";
export const APPROVED_ADMIN_LOGIN_FAVICON =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0ea3f9421cae9dd223f50b_SIGIL%20only%20logo.webp";
export const APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69e34c91250ec9f6ee29d319_MMD%20SIGIL%20Logo.png";
export const ADMIN_CANONICAL_ORIGIN = "https://mmdbkk.com";

const MMD_PRIVE_LOGO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6c4486e7585ba74ab2eeb1_MMD_Prive%CC%81_logo_signature_transparent%20Final.webp";
const MMS_LOGO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a9a49e5183c68d9d386030a_MMS%20Login%20Button.webp";
const ASSISTANT_LOGIN_IMAGE =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69faf05c4e40765c0f922f55_Assistant%20login.webp";

const LINE_SEED_THAI_REGULAR =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd598baf067153fd1cc_LINESeedSansTH_W_Rg.woff2";
const LINE_SEED_THAI_BOLD =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd4dc8d84b48cc84959_LINESeedSansTH_W_Bd.woff2";
const LINE_SEED_THAI_EXTRABOLD =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd5cdf166a1e9e45b98_LINESeedSansTH_W_XBd.woff2";

const MMS_PARTNER_PATH = "/internal/admin/mms";
const CSP = [
  "default-src 'self'",
  "script-src 'unsafe-inline' 'self'",
  "style-src 'unsafe-inline' 'self'",
  "font-src https://cdn.prod.website-files.com",
  "img-src https://cdn.prod.website-files.com data:",
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function renderApprovedAdminLogin(
  request,
  { status = 200, error = "", next = "/internal/admin/control-room" } = {},
) {
  const headers = loginHeaders();
  if (String(request?.method || "GET").toUpperCase() === "HEAD") {
    return new Response(null, { status, headers });
  }
  const partnerFirst = next === MMS_PARTNER_PATH;
  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" content="#050403">
  <script>(()=>{if(location.protocol==='https:'&&location.hostname==='www.mmdbkk.com'){const path=(location.pathname.replace(/\\/+$/,'')||'/');if(path==='/internal/admin/login'){const canonical=new URL(location.href);canonical.hostname='mmdbkk.com';location.replace(canonical.toString());}}})();</script>
  <title>MMD Privé · Internal Login</title>
  <link rel="canonical" href="${ADMIN_CANONICAL_ORIGIN}/internal/admin/login">
  <link rel="icon" type="image/webp" href="${APPROVED_ADMIN_LOGIN_FAVICON}">
  <link rel="apple-touch-icon" href="${APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON}">
  <style>
    @font-face{font-family:"LINE Seed Sans TH";src:url("${LINE_SEED_THAI_REGULAR}") format("woff2");font-style:normal;font-weight:400;font-display:swap}
    @font-face{font-family:"LINE Seed Sans TH";src:url("${LINE_SEED_THAI_BOLD}") format("woff2");font-style:normal;font-weight:700;font-display:swap}
    @font-face{font-family:"LINE Seed Sans TH";src:url("${LINE_SEED_THAI_EXTRABOLD}") format("woff2");font-style:normal;font-weight:800;font-display:swap}
    :root{color-scheme:dark;--bg:#050403;--panel:rgba(10,8,6,.84);--panel2:rgba(19,15,11,.76);--line:rgba(239,204,132,.30);--line-strong:rgba(239,204,132,.68);--gold:#dda94a;--gold2:#f5d18b;--green:#003704;--green2:#002b03;--green3:#001e02;--green-bright:#26d07c;--green-soft:#bfdcc6;--text:#fff9f1;--muted:rgba(255,249,241,.72);--soft:rgba(255,249,241,.48);--danger:#ffb7bd;--ok:#b9ddc3;--ink:#120c05}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg)}body{min-height:100svh;color:var(--text);font-family:"LINE Seed Sans TH","Noto Sans Thai","Noto Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-synthesis:none;-webkit-font-smoothing:antialiased}
    button,input{font:inherit}.mmd-login{min-height:100svh;position:relative;isolation:isolate;overflow:hidden;background:#050403}.mmd-login:before{content:"";position:fixed;inset:0;z-index:-5;background:linear-gradient(90deg,rgba(5,4,3,.96) 0%,rgba(5,4,3,.88) 31%,rgba(5,4,3,.22) 58%,rgba(5,4,3,.28) 100%),url("${APPROVED_ADMIN_LOGIN_HERO}") 67% 45%/cover no-repeat;filter:saturate(.92) contrast(1.06) brightness(.84)}.mmd-login:after{content:"";position:fixed;inset:0;z-index:-4;background:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.38)),url("${APPROVED_ADMIN_LOGIN_WALL_BG}") center/cover no-repeat;opacity:.32;mix-blend-mode:screen}
    .assistant-layer{position:fixed;z-index:-3;right:-3vw;bottom:-8vh;width:min(31vw,480px);height:82vh;object-fit:cover;object-position:center top;opacity:.52;filter:sepia(.18) saturate(.76) contrast(1.06) brightness(.70);mix-blend-mode:screen;mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.38) 24%,#000 48%,#000 100%);-webkit-mask-image:linear-gradient(90deg,transparent 0%,rgba(0,0,0,.38) 24%,#000 48%,#000 100%);pointer-events:none}
    .visual{display:none}.visual:before{content:"";background:url("${APPROVED_ADMIN_LOGIN_HERO}") center/cover no-repeat;}.visual-logo{display:block;object-fit:contain;}
    .shell{min-height:100svh;display:grid;grid-template-columns:minmax(430px,620px) minmax(0,1fr);gap:clamp(28px,5vw,72px);align-items:center;padding:clamp(26px,5vw,64px) clamp(24px,6vw,104px)}
    .card{position:relative;width:100%;max-width:590px;min-height:min(820px,calc(100svh - 72px));display:flex;flex-direction:column;justify-content:center;border:1px solid var(--line-strong);border-radius:19px;padding:clamp(28px,3.7vw,48px);background:linear-gradient(180deg,rgba(18,14,10,.86),rgba(7,6,5,.90));box-shadow:0 28px 90px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.025);backdrop-filter:blur(18px)}
    .kicker{margin:0 0 18px;color:var(--gold2);font-size:11px;font-weight:800;letter-spacing:.34em;text-transform:uppercase}.title{margin:0;color:#fffdfa;font-family:Georgia,"Times New Roman",serif;font-size:clamp(43px,4.2vw,66px);font-weight:400;line-height:1.02;letter-spacing:-.035em}.lead{margin:12px 0 22px;color:var(--muted);font-size:16px;line-height:1.55}.divider{height:1px;background:linear-gradient(90deg,var(--line-strong),rgba(239,204,132,.08));margin:0 0 18px}.section-label{margin:0 0 11px;color:rgba(255,255,255,.78);font-size:10px;font-weight:800;letter-spacing:.36em;text-transform:uppercase}
    .lanes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:11px}.lane{position:relative;min-height:146px;border:1px solid rgba(239,204,132,.34);border-radius:9px;background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(0,0,0,.12));color:var(--text);cursor:pointer;padding:17px 16px 14px;text-align:left;transition:border-color .2s ease,background .2s ease,transform .2s ease}.lane:hover{transform:translateY(-1px);border-color:rgba(239,204,132,.62)}.lane:before{content:"";position:absolute;right:14px;top:14px;width:18px;height:18px;border:1px solid rgba(255,255,255,.42);border-radius:50%;box-shadow:inset 0 0 0 4px rgba(0,0,0,.55)}.lane.is-active:before{border-color:var(--gold2);background:var(--gold2);box-shadow:inset 0 0 0 5px #111}.lane[data-lane="partner"].is-active{border-color:rgba(38,208,124,.82);background:linear-gradient(145deg,rgba(0,55,4,.78),rgba(0,30,2,.52))}.lane[data-lane="partner"].is-active:before{border-color:#21f2a1;background:#21f2a1;box-shadow:inset 0 0 0 5px #06301d}.lane-logo{display:flex;align-items:center;min-height:72px;margin-bottom:8px}.lane-logo img{display:block;max-width:155px;max-height:74px;object-fit:contain;object-position:left center}.lane[data-lane="partner"] .lane-logo img{max-width:92px;max-height:74px;filter:saturate(.94) contrast(1.03)}.lane b{display:block;font-size:17px;font-weight:700}.lane small{display:block;margin-top:2px;color:var(--soft);font-size:11px;font-weight:700}.accounts-help{margin:0 0 20px;color:rgba(255,255,255,.70);font-size:11px;line-height:1.55}
    .panel[hidden]{display:none}.panel{animation:fade-panel .18s ease-out}@keyframes fade-panel{from{opacity:.4;transform:translateY(3px)}to{opacity:1;transform:none}}.panel-head{display:none}.scope{display:none}form{display:grid;gap:13px}label{display:grid;gap:7px;color:rgba(255,255,255,.82);font-size:10px;font-weight:800;letter-spacing:.28em;text-transform:uppercase}.field{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;min-height:54px;border:1px solid rgba(255,255,255,.26);border-radius:8px;overflow:hidden;background:rgba(255,255,255,.035);transition:border-color .18s ease,box-shadow .18s ease}.field:focus-within{border-color:rgba(239,204,132,.58);box-shadow:0 0 0 2px rgba(221,169,74,.10)}.partner-panel .field:focus-within{border-color:rgba(38,208,124,.58);box-shadow:0 0 0 2px rgba(38,208,124,.09)}.field-icon{display:grid;place-items:center;color:rgba(255,255,255,.78)}.field-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}input{width:100%;min-height:52px;border:0;background:transparent;color:var(--text);padding:0 8px;outline:0;font:700 14px/1.4 inherit}.toggle{min-width:70px;align-self:stretch;border:0;border-left:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.02);color:rgba(255,255,255,.86);font:800 10px/1.4 inherit;cursor:pointer}.go{position:relative;min-height:58px;margin-top:4px;border:1px solid rgba(255,225,166,.78);border-radius:8px;background:linear-gradient(110deg,#b67a32 0%,#f0c579 48%,#bd7f35 100%);color:#100a04;font:800 13px/1.4 inherit;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;box-shadow:0 14px 34px rgba(0,0,0,.28)}.go:after{content:"→";position:absolute;right:24px;font-size:24px;font-weight:400;top:50%;transform:translateY(-54%)}.go:disabled,.toggle:disabled{opacity:.55;cursor:wait}.message{min-height:18px;margin:-2px 0 0;color:var(--soft);font-size:11px;line-height:1.5}.message.is-error{color:var(--danger)}.message.is-ok{color:var(--ok)}.privacy{margin:0;color:var(--soft);font-size:9px;line-height:1.55}.links{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px}.linkbtn{padding:0;border:0;background:transparent;color:rgba(255,255,255,.66);font:800 11px/1.4 inherit;text-decoration:underline;text-underline-offset:4px;cursor:pointer}.subpanel{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.12)}.recovery{display:none;margin-top:12px;border:1px solid rgba(38,208,124,.26);border-radius:12px;background:rgba(0,55,4,.23);padding:12px}.recovery.is-visible{display:block}.recovery b{font-size:11px;font-weight:800}.recovery code{display:block;margin-top:7px;padding:10px;border-radius:8px;background:rgba(0,0,0,.34);word-break:break-all;color:#effff2;font-size:12px}.recovery p{margin:7px 0 0;color:var(--muted);font-size:10px;line-height:1.5}
    .credit{margin-top:24px;padding-top:2px;color:rgba(255,255,255,.40);font-size:10px;line-height:1.6}.credit b{color:rgba(255,255,255,.58);font-weight:700}
    .hero-side{position:relative;min-height:min(860px,calc(100svh - 54px));pointer-events:none}.hero-mark{position:absolute;right:0;top:0;width:58px;height:58px;object-fit:contain;opacity:.86}.hero-mantra{position:absolute;right:0;bottom:15%;display:grid;gap:7px;color:rgba(221,169,74,.65);font-family:Georgia,"Times New Roman",serif;font-size:10px;letter-spacing:.36em;line-height:1.7;text-transform:uppercase}.hero-mantra:after{content:"";width:38px;height:1px;margin-top:10px;background:var(--gold)}.hero-secure{position:absolute;right:0;bottom:0;color:rgba(221,169,74,.88);font-size:9px;font-weight:800;letter-spacing:.30em;text-transform:uppercase}.hero-caption{position:absolute;left:4%;bottom:2%;max-width:350px;color:rgba(255,255,255,.34);font-size:9px;letter-spacing:.10em}
    @media(max-width:980px){.shell{grid-template-columns:minmax(0,580px) minmax(180px,1fr);padding:24px}.assistant-layer{width:36vw}.card{min-height:auto}.hero-mantra{display:none}}
    @media(max-width:760px){.mmd-login:before{background:linear-gradient(180deg,rgba(5,4,3,.36),rgba(5,4,3,.92) 35%,#050403 72%),url("${APPROVED_ADMIN_LOGIN_HERO}") 62% top/auto 48vh no-repeat}.mmd-login:after{opacity:.20}.assistant-layer{display:none}.shell{display:flex;flex-direction:column-reverse;gap:0;padding:0;min-height:100svh}.hero-side{width:100%;min-height:225px}.hero-mark{top:18px;right:18px;width:46px;height:46px}.hero-secure{right:18px;bottom:18px;font-size:8px}.hero-caption{display:none}.card{width:calc(100% - 20px);margin:-28px 10px 10px;z-index:2;border-radius:18px;padding:25px 20px 22px;min-height:auto;backdrop-filter:blur(22px)}.kicker{font-size:9px;margin-bottom:13px}.title{font-size:43px;line-height:1.02}.lead{font-size:14px;margin:10px 0 18px}.lanes{gap:9px}.lane{min-height:126px;padding:14px 12px}.lane-logo{min-height:62px}.lane-logo img{max-width:124px;max-height:61px}.lane[data-lane="partner"] .lane-logo img{max-width:78px}.lane b{font-size:15px}.accounts-help{font-size:10px;margin-bottom:17px}.credit{font-size:9px;margin-top:20px}}
    @media(max-width:390px){.title{font-size:38px}.lane{min-height:118px}.lane-logo img{max-width:108px}.field{grid-template-columns:36px minmax(0,1fr) auto}.go{letter-spacing:.12em}}
  </style>
</head>
<body data-initial-lane="${partnerFirst ? "partner" : "owner"}" data-active-lane="${partnerFirst ? "partner" : "owner"}">
<section class="mmd-login" data-mmd-login data-mmd-page="${APPROVED_ADMIN_LOGIN_PAGE_ID}">
  <div class="visual" aria-hidden="true"><img class="visual-logo" src="${APPROVED_ADMIN_LOGIN_LOGO}" alt="MMD SIGIL Internal Admin"></div>
  <img class="assistant-layer" src="${ASSISTANT_LOGIN_IMAGE}" alt="" aria-hidden="true" decoding="async">
  <main class="shell">
    <article class="card">
      <p class="kicker">BACK OFFICE ACCESS</p>
      <h1 class="title">Enter your Back Office</h1>
      <p class="lead">กรุณาเลือกบัญชีที่ท่านต้องการเข้าถึง</p>
      <div class="divider" aria-hidden="true"></div>
      <p class="section-label">MANAGED ACCOUNTS</p>
      <div class="lanes" role="tablist" aria-label="Business access">
        <button class="lane" type="button" data-lane="owner" role="tab">
          <span class="lane-logo"><img src="${MMD_PRIVE_LOGO}" alt="MMD Privé" width="155" height="74"></span>
          <b>MMD Privé</b><small>SIGIL Systems</small>
        </button>
        <button class="lane" type="button" data-lane="partner" role="tab">
          <span class="lane-logo"><img src="${MMS_LOGO}" alt="MMS Male Massage" width="92" height="74"></span>
          <b>MMS</b><small>Male Massage</small>
        </button>
      </div>
      <p class="accounts-help">คุณสามารถดูแลหลายบัญชีได้ พร้อมกันสูงสุด 2 accounts ที่อยู่ภายใต้การดูแลของระบบนี้</p>

      <section class="panel" data-panel="owner">
        <form method="post" action="${ADMIN_LOGIN_SESSION_PATH}" id="ownerLoginForm" autocomplete="off">
          <input id="adminNext" type="hidden" name="next" value="${escapeAttribute(next)}">
          <label for="adminCredential">Access Code
            <span class="field"><span class="field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg></span><input id="adminCredential" type="text" required readonly autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text" data-mask="true" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other"><button class="toggle" type="button" data-toggle="adminCredential" aria-pressed="false">SHOW</button></span>
          </label>
          <p class="message${error ? " is-error" : ""}" id="ownerMessage" role="${error ? "alert" : "status"}">${error ? escapeHtml(error) : `Next: ${escapeHtml(next)}`}</p>
          <button class="go" type="submit">Enter Back Office</button>
          <p class="privacy">MMD Privé ใช้ SIGIL Systems · Secure HttpOnly session · Owner / Internal Admin only</p>
        </form>
      </section>

      <section class="panel partner-panel" data-panel="partner">
        <form id="partnerLoginForm" autocomplete="on">
          <input type="hidden" name="action" value="partner_login">
          <label for="partnerUsername">Username<span class="field"><span class="field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"></circle><path d="M4.5 20a7.5 7.5 0 0 1 15 0"></path></svg></span><input id="partnerUsername" name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></span></label>
          <label for="partnerPassword">Password<span class="field"><span class="field-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg></span><input id="partnerPassword" name="password" type="password" required minlength="12" maxlength="128" autocomplete="current-password"><button class="toggle" type="button" data-toggle="partnerPassword" aria-pressed="false">SHOW</button></span></label>
          <p class="message" id="partnerMessage" role="status">สำหรับ MMS Partner ใช้เข้าสู่ระบบควบคุมการทำงานหลังบ้านของ Male Massage เท่านั้น</p>
          <button class="go" type="submit">Enter Back Office</button>
        </form>
        <div class="links"><button class="linkbtn" type="button" data-open="signup">สร้างบัญชี Partner</button><button class="linkbtn" type="button" data-open="recover">ลืมรหัสผ่าน?</button></div>

        <section class="subpanel" data-subpanel="signup" hidden>
          <form id="partnerSignupForm" autocomplete="off">
            <input type="hidden" name="action" value="partner_signup">
            <label>Username<span class="field"><span class="field-icon" aria-hidden="true">@</span><input name="username" required autocomplete="off" autocapitalize="none" spellcheck="false"></span></label>
            <label>Password<span class="field"><span class="field-icon" aria-hidden="true">•</span><input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></span></label>
            <label>Invite Code<span class="field"><span class="field-icon" aria-hidden="true">+</span><input name="invite_code" type="password" required autocomplete="off"></span></label>
            <p class="message" id="signupMessage" role="status">Invite-only activation · ใช้รหัสเชิญที่ได้รับอนุมัติ</p>
            <button class="go" type="submit">Create Partner Account</button>
          </form>
        </section>

        <section class="subpanel" data-subpanel="recover" hidden>
          <form id="partnerRecoverForm" autocomplete="off">
            <input type="hidden" name="action" value="partner_recover">
            <label>Username<span class="field"><span class="field-icon" aria-hidden="true">@</span><input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></span></label>
            <label>Recovery Code<span class="field"><span class="field-icon" aria-hidden="true">#</span><input name="recovery_code" type="password" required autocomplete="off"></span></label>
            <label>New Password<span class="field"><span class="field-icon" aria-hidden="true">•</span><input name="new_password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></span></label>
            <p class="message" id="recoverMessage" role="status">Recovery จะเปลี่ยนรหัสผ่านและออก Recovery Code ชุดใหม่</p>
            <button class="go" type="submit">Reset Password</button>
          </form>
        </section>
        <div class="recovery" id="recoveryBox"><b>Recovery Code ใหม่ — เก็บไว้ในที่ปลอดภัย</b><code id="recoveryCode"></code><p>รหัสนี้แสดงหลัง activation/reset เท่านั้น ระบบเก็บเฉพาะ hash</p></div>
        <p class="privacy" style="margin-top:10px">Partner session ถูกจำกัดไว้ที่ /internal/admin/mms และ /v1/admin/mms* เท่านั้น</p>
      </section>

      <footer class="credit"><b>SIGIL Systems</b><br>Design and Architecture by Per 2025–2026 (อีดอก กูเองค่ะมึง)</footer>
    </article>

    <aside class="hero-side" aria-label="SIGIL private administration environment">
      <img class="hero-mark" src="${APPROVED_ADMIN_LOGIN_FAVICON}" alt="SIGIL" width="58" height="58" fetchpriority="high">
      <div class="hero-mantra"><span>People</span><span>Systems</span><span>A Quieter</span><span>Tomorrow</span></div>
      <div class="hero-secure">SECURE · PRIVATE · INTERNAL</div>
      <div class="hero-caption">MMD Privé · SIGIL Systems · MMS Male Massage</div>
    </aside>
  </main>
</section>
<script>(()=>{
  const sessionPath='${ADMIN_LOGIN_SESSION_PATH}';
  const initial=document.body.dataset.initialLane==='partner'?'partner':'owner';
  const lanes=[...document.querySelectorAll('[data-lane]')];
  const panels=[...document.querySelectorAll('[data-panel]')];
  function setLane(name){document.body.dataset.activeLane=name;lanes.forEach(b=>{const on=b.dataset.lane===name;b.classList.toggle('is-active',on);b.setAttribute('aria-selected',String(on));});panels.forEach(p=>p.hidden=p.dataset.panel!==name);}
  lanes.forEach(b=>b.addEventListener('click',()=>setLane(b.dataset.lane)));setLane(initial);
  document.querySelectorAll('[data-toggle]').forEach(button=>button.addEventListener('click',()=>{const input=document.getElementById(button.dataset.toggle);if(!input)return;const owner=input.id==='adminCredential';const showing=button.getAttribute('aria-pressed')==='true';button.setAttribute('aria-pressed',String(!showing));button.textContent=showing?'SHOW':'HIDE';if(owner){if(showing)input.setAttribute('data-mask','true');else input.removeAttribute('data-mask');}else input.type=showing?'password':'text';input.focus();}));
  const ownerInput=document.getElementById('adminCredential');if(ownerInput){ownerInput.value='';ownerInput.readOnly=false;}
  document.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>{const name=button.dataset.open;document.querySelectorAll('[data-subpanel]').forEach(p=>p.hidden=p.dataset.subpanel!==name);document.getElementById('recoveryBox').classList.remove('is-visible');}));
  async function postForm(form){const body=new URLSearchParams(new FormData(form));const response=await fetch(sessionPath,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','X-MMD-Login-Fetch':'1'},credentials:'same-origin',redirect:'follow',cache:'no-store',body:body.toString()});let payload={};try{payload=await response.clone().json();}catch{}return {response,payload};}
  function setMessage(el,text,type=''){el.classList.remove('is-error','is-ok');if(type)el.classList.add(type);el.setAttribute('role',type==='is-error'?'alert':'status');el.textContent=text;}
  function genericError(status){if(status===429)return 'ลองใหม่อีกครั้งในภายหลัง';if(status>=500)return 'พื้นที่หลังบ้านยังไม่พร้อม ลองใหม่อีกครั้ง';return 'ข้อมูลเข้าสู่ระบบไม่ถูกต้อง หรือยังไม่ได้รับอนุมัติ';}
  const ownerForm=document.getElementById('ownerLoginForm');ownerForm?.addEventListener('submit',async e=>{e.preventDefault();const message=document.getElementById('ownerMessage');const submit=ownerForm.querySelector('.go');const input=ownerInput;const credential=input.value.trim();if(!credential){ownerInput.focus();return;}submit.disabled=true;setMessage(message,'Checking access…');try{const body=new URLSearchParams();body.set('action','owner_login');body.set('credential',credential);body.set('next',document.getElementById('adminNext').value||'/internal/admin/control-room');const response=await fetch(sessionPath,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','X-MMD-Login-Fetch':'1'},credentials:'same-origin',redirect:'follow',cache:'no-store',body:body.toString()});let payload={};try{payload=await response.clone().json();}catch{}if(response.ok&&response.redirected){location.assign(response.url);return;}if(response.ok&&payload.ok){location.assign(payload.next||'/internal/admin/control-room');return;}setMessage(message,genericError(response.status),'is-error');}catch{setMessage(message,'ติดต่อระบบไม่ได้ ลอง refresh แล้วกดใหม่อีกครั้ง','is-error');}finally{submit.disabled=false;ownerInput.focus();}});
  const partnerForm=document.getElementById('partnerLoginForm');partnerForm?.addEventListener('submit',async e=>{e.preventDefault();const message=document.getElementById('partnerMessage');const submit=partnerForm.querySelector('.go');submit.disabled=true;setMessage(message,'Checking access…');try{const {response,payload}=await postForm(partnerForm);if(response.ok&&payload.ok){location.assign(payload.next||'${MMS_PARTNER_PATH}');return;}setMessage(message,genericError(response.status),'is-error');}catch{setMessage(message,'ติดต่อระบบไม่ได้ ลองใหม่อีกครั้ง','is-error');}finally{submit.disabled=false;}});
  function showRecovery(code){const box=document.getElementById('recoveryBox');document.getElementById('recoveryCode').textContent=code||'';box.classList.toggle('is-visible',Boolean(code));}
  const signupForm=document.getElementById('partnerSignupForm');signupForm?.addEventListener('submit',async e=>{e.preventDefault();const message=document.getElementById('signupMessage');const submit=signupForm.querySelector('.go');submit.disabled=true;showRecovery('');setMessage(message,'Creating account…');try{const {response,payload}=await postForm(signupForm);if(response.ok&&payload.ok){setMessage(message,'สร้างบัญชี Partner แล้ว ใช้ Username และ Password นี้เข้าสู่ระบบได้เลย','is-ok');showRecovery(payload.recovery_code);return;}setMessage(message,response.status===409?'บัญชีนี้เปิดใช้งานแล้ว หรือไม่สามารถเปิดซ้ำได้':genericError(response.status),'is-error');}catch{setMessage(message,'ติดต่อระบบไม่ได้ ลองใหม่อีกครั้ง','is-error');}finally{submit.disabled=false;}});
  const recoverForm=document.getElementById('partnerRecoverForm');recoverForm?.addEventListener('submit',async e=>{e.preventDefault();const message=document.getElementById('recoverMessage');const submit=recoverForm.querySelector('.go');submit.disabled=true;showRecovery('');setMessage(message,'Resetting password…');try{const {response,payload}=await postForm(recoverForm);if(response.ok&&payload.ok){setMessage(message,'เปลี่ยน Password แล้ว ใช้รหัสใหม่เข้าสู่ระบบได้เลย','is-ok');showRecovery(payload.recovery_code);return;}setMessage(message,genericError(response.status),'is-error');}catch{setMessage(message,'ติดต่อระบบไม่ได้ ลองใหม่อีกครั้ง','is-error');}finally{submit.disabled=false;}});
})();</script>
</body></html>`;
  return new Response(html, { status, headers });
}

function loginHeaders() {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, private, max-age=0",
    "x-mmd-admin-origin": ADMIN_CANONICAL_ORIGIN,
    "content-security-policy": CSP,
    "x-mmd-admin-login": APPROVED_ADMIN_LOGIN_PAGE_ID,
    "x-mmd-login-ui": "browser-fetch-v5",
    "x-mmd-page": APPROVED_ADMIN_LOGIN_PAGE_ID,
    "x-mmd-route-owner": "admin-worker",
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }
