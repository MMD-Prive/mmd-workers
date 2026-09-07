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

const MMD_BRAND_LOGO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6c4486e7585ba74ab2eeb1_MMD_Prive%CC%81_logo_signature_transparent%20Final.webp";
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
  <title>MMD Privé · Back Office Access</title>
  <link rel="canonical" href="${ADMIN_CANONICAL_ORIGIN}/internal/admin/login">
  <link rel="icon" type="image/webp" href="${APPROVED_ADMIN_LOGIN_FAVICON}">
  <link rel="apple-touch-icon" href="${APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON}">
  <style>
    @font-face{font-family:"LINE Seed Sans TH";src:url("${LINE_SEED_THAI_REGULAR}") format("woff2");font-style:normal;font-weight:400;font-display:swap}
    @font-face{font-family:"LINE Seed Sans TH";src:url("${LINE_SEED_THAI_BOLD}") format("woff2");font-style:normal;font-weight:700;font-display:swap}
    @font-face{font-family:"LINE Seed Sans TH";src:url("${LINE_SEED_THAI_EXTRABOLD}") format("woff2");font-style:normal;font-weight:800;font-display:swap}
    :root{color-scheme:dark;--bg:#050403;--panel:rgba(13,10,8,.78);--panel2:rgba(8,7,6,.88);--line:rgba(232,191,101,.48);--line-soft:rgba(232,191,101,.22);--gold:#e8bf65;--gold2:#f9d98d;--gold3:#a86f2c;--green:#003704;--green2:#002b03;--green3:#001e02;--green-hi:#2e9a58;--green-soft:#c5e5cd;--text:#fff8ee;--muted:rgba(255,248,238,.74);--soft:rgba(255,248,238,.48);--danger:#ffb8bd;--ok:#bfe4c8;--ink:#171006}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg)}body{min-height:100svh;color:var(--text);font-family:"LINE Seed Sans TH","Noto Sans Thai","Noto Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-synthesis:none;-webkit-font-smoothing:antialiased}
    button,input{font:inherit}.mmd-login{min-height:100svh;position:relative;isolation:isolate;overflow:hidden;background:#050403}
    .mmd-login:before{content:"";position:fixed;inset:0;z-index:-4;background:linear-gradient(90deg,rgba(4,3,2,.92) 0%,rgba(4,3,2,.61) 37%,rgba(4,3,2,.17) 63%,rgba(4,3,2,.34) 100%),url("${APPROVED_ADMIN_LOGIN_HERO}") 66% center/cover no-repeat;filter:saturate(.93) contrast(1.07) brightness(.86)}
    .mmd-login:after{content:"";position:fixed;inset:0;z-index:-3;background:radial-gradient(circle at 17% 18%,rgba(230,175,83,.14),transparent 26%),radial-gradient(circle at 86% 32%,rgba(0,55,4,.08),transparent 28%),linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.2) 65%,rgba(0,0,0,.5))}
    .wall{position:fixed;inset:0;z-index:-2;pointer-events:none;background:url("${APPROVED_ADMIN_LOGIN_WALL_BG}") 82% 48%/cover no-repeat;mix-blend-mode:screen;opacity:.18;filter:contrast(1.12) brightness(.64)}
    .visual{display:none}.visual:before{content:"";display:block;background:url("${APPROVED_ADMIN_LOGIN_PRIVACY_BG}") center/cover no-repeat;}.visual-logo{object-fit:contain;}
    .stage{width:min(100%,1600px);min-height:100svh;margin:0 auto;position:relative;display:flex;align-items:center;padding:clamp(28px,4.6vw,72px) clamp(22px,6.2vw,104px)}
    .access-card{width:min(586px,46vw);min-width:500px;border:1px solid rgba(238,200,127,.66);border-radius:19px;background:linear-gradient(145deg,rgba(17,14,11,.86),rgba(7,6,5,.78));box-shadow:0 26px 86px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.045);backdrop-filter:blur(20px);padding:clamp(28px,3vw,48px);position:relative;overflow:hidden}
    .access-card:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(112deg,rgba(236,186,101,.055),transparent 36%,transparent 68%,rgba(255,255,255,.025));opacity:.85}
    .access-card>*{position:relative;z-index:1}.kicker{margin:0 0 16px;color:var(--gold2);font:800 11px/1.3 "LINE Seed Sans TH",sans-serif;letter-spacing:.34em;text-transform:uppercase}
    .title{margin:0;color:#fff;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:clamp(42px,4vw,61px);font-weight:400;line-height:.98;letter-spacing:-.035em;text-wrap:balance}
    .lead{margin:14px 0 21px;color:rgba(255,255,255,.82);font-size:17px;line-height:1.55}.rule{height:1px;margin:0 0 18px;background:linear-gradient(90deg,rgba(255,228,170,.58),rgba(255,228,170,.12))}
    .managed-label{margin:0 0 10px;color:rgba(255,255,255,.83);font-size:11px;font-weight:800;letter-spacing:.34em;text-transform:uppercase}
    .lanes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 10px}.lane{position:relative;min-height:142px;border:1px solid rgba(240,205,133,.36);border-radius:8px;background:linear-gradient(145deg,rgba(23,18,13,.76),rgba(7,7,6,.86));color:var(--text);cursor:pointer;padding:18px 20px;text-align:left;transition:border-color .18s ease,background .18s ease,transform .18s ease}.lane:hover{transform:translateY(-1px);border-color:rgba(240,205,133,.62)}.lane:focus-visible{outline:2px solid var(--gold2);outline-offset:3px}.lane-status{position:absolute;top:15px;right:15px;width:20px;height:20px;border:2px solid rgba(255,255,255,.38);border-radius:50%}.lane.is-active .lane-status:after{content:"";position:absolute;inset:4px;border-radius:50%;background:var(--gold)}.lane[data-lane="partner"].is-active{border-color:rgba(31,190,104,.76);background:linear-gradient(145deg,rgba(0,55,4,.73),rgba(2,28,13,.78));box-shadow:inset 0 0 0 1px rgba(31,190,104,.08)}.lane[data-lane="partner"].is-active .lane-status{border-color:#22e68c}.lane[data-lane="partner"].is-active .lane-status:after{background:#22e68c}.lane-brand{height:72px;display:flex;align-items:center}.lane-brand img{display:block;max-width:145px;max-height:62px;object-fit:contain;object-position:left center}.mms-mark{width:72px;height:72px;border-radius:50%;display:grid;place-items:center;position:relative;background:radial-gradient(circle at 30% 20%,#91aa5d 0%,#587847 42%,#194a2d 100%);box-shadow:inset 0 -8px 22px rgba(0,0,0,.2),0 8px 24px rgba(0,0,0,.2)}.mms-mark:after{content:"";position:absolute;left:11px;bottom:-9px;width:22px;height:23px;background:#214e30;clip-path:polygon(0 0,100% 0,14% 100%)}.mms-mark span{position:relative;z-index:1;color:#fff;font:800 48px/.8 "LINE Seed Sans TH",sans-serif;transform:translateY(-2px)}.lane b{display:block;margin-top:6px;color:#fff;font-size:17px;font-weight:700;letter-spacing:-.01em}.lane small{display:block;margin-top:2px;color:var(--soft);font-size:12px;font-weight:700}.lane[data-lane="partner"] small{color:rgba(222,244,227,.62)}
    .account-note{margin:10px 0 20px;color:rgba(255,255,255,.68);font-size:12px;line-height:1.6}.panel[hidden]{display:none}.panel-head{margin:0 0 13px}.panel-head strong{font-size:14px;font-weight:800;letter-spacing:.02em}.panel-head span{display:inline-block;margin-top:3px;color:var(--soft);font-size:11px;line-height:1.45}.scope{display:none}
    form{display:grid;gap:15px}label{display:grid;gap:7px;color:rgba(255,255,255,.83);font-size:10px;font-weight:800;letter-spacing:.31em;text-transform:uppercase}.field{display:grid;grid-template-columns:1fr auto;border:1px solid rgba(255,255,255,.28);border-radius:7px;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(0,0,0,.14));transition:border-color .18s ease,box-shadow .18s ease}.field:focus-within{border-color:rgba(238,200,127,.7);box-shadow:0 0 0 3px rgba(232,191,101,.08)}.partner-panel .field:focus-within{border-color:rgba(55,163,92,.72);box-shadow:0 0 0 3px rgba(0,55,4,.16)}input{width:100%;min-height:52px;border:0;background:transparent;color:#fff;padding:0 16px;outline:0;font:700 14px/1.4 "LINE Seed Sans TH",sans-serif}.toggle{min-width:72px;border:0;border-left:1px solid rgba(255,255,255,.17);background:rgba(255,255,255,.02);color:#fff;font:800 10px/1.4 "LINE Seed Sans TH",sans-serif;cursor:pointer}.go{min-height:61px;margin-top:4px;border:1px solid rgba(255,221,155,.62);border-radius:7px;background:linear-gradient(110deg,#b97932 0%,#f1c370 35%,#f9d993 60%,#b87a31 100%);color:#151006;-webkit-text-fill-color:#151006;font:800 14px/1.4 "LINE Seed Sans TH",sans-serif;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;box-shadow:0 14px 30px rgba(0,0,0,.24);transition:transform .18s ease,filter .18s ease}.go:hover{transform:translateY(-1px);filter:brightness(1.04)}.go:disabled,.toggle:disabled{opacity:.54;cursor:wait;transform:none}.message{min-height:18px;margin:-2px 0 0;color:var(--soft);font-size:11px;line-height:1.5}.message.is-error{color:var(--danger)}.message.is-ok{color:var(--ok)}.privacy{margin:0;color:rgba(255,255,255,.38);font-size:10px;line-height:1.55}.links{display:flex;gap:14px;flex-wrap:wrap;margin-top:1px}.linkbtn{padding:0;border:0;background:transparent;color:rgba(213,233,219,.78);font:700 11px/1.4 "LINE Seed Sans TH",sans-serif;text-decoration:underline;text-underline-offset:3px;cursor:pointer}.subpanel{margin-top:13px;padding-top:13px;border-top:1px solid rgba(255,255,255,.12)}.recovery{display:none;margin-top:10px;border:1px solid rgba(72,155,97,.36);border-radius:12px;background:rgba(0,55,4,.22);padding:12px}.recovery.is-visible{display:block}.recovery b{font-size:12px;font-weight:800}.recovery code{display:block;margin-top:7px;padding:10px;border-radius:8px;background:rgba(0,0,0,.35);word-break:break-all;color:#effff2;font-size:12px}.recovery p{margin:7px 0 0;color:var(--muted);font-size:11px;line-height:1.5}
    .credit{margin-top:26px;padding-top:18px;border-top:1px solid rgba(255,255,255,.06);color:rgba(255,255,255,.38);font-size:10px;line-height:1.55}.credit b{color:rgba(255,232,188,.62);font-weight:700}.credit .thai-credit{display:block;margin-top:2px;color:rgba(255,255,255,.3)}
    .sigil-corner{position:fixed;z-index:2;top:28px;right:35px;width:48px;height:48px;object-fit:contain;opacity:.88;filter:sepia(.4) saturate(1.2)}.side-mantra{position:fixed;z-index:2;right:39px;bottom:150px;display:grid;gap:10px;color:rgba(232,191,101,.68);font-size:9px;font-weight:800;letter-spacing:.37em;text-transform:uppercase;writing-mode:horizontal-tb;text-align:right}.secure{position:fixed;z-index:2;right:35px;bottom:28px;color:rgba(232,191,101,.82);font-size:9px;font-weight:800;letter-spacing:.31em;text-transform:uppercase}
    @media(max-width:1120px){.stage{padding-left:36px;padding-right:36px}.access-card{width:min(560px,58vw);min-width:470px}.sigil-corner{right:24px}.secure{right:24px}.side-mantra{display:none}}
    @media(max-width:820px){.mmd-login{overflow:auto}.mmd-login:before{background:linear-gradient(180deg,rgba(4,3,2,.38) 0%,rgba(4,3,2,.84) 44%,rgba(4,3,2,.98) 100%),url("${APPROVED_ADMIN_LOGIN_HERO}") 63% top/auto 62vh no-repeat;background-color:#050403;filter:saturate(.9) contrast(1.05) brightness(.78)}.wall{opacity:.1;background-position:center top}.stage{display:block;min-height:100svh;padding:34vh 12px 28px}.access-card{width:100%;min-width:0;max-width:620px;margin:0 auto;border-radius:17px;padding:24px 20px;background:linear-gradient(145deg,rgba(14,11,9,.93),rgba(6,5,4,.96))}.title{font-size:43px;line-height:1.01}.lead{font-size:15px;margin-top:12px}.lanes{gap:8px}.lane{min-height:118px;padding:14px}.lane-brand{height:56px}.lane-brand img{max-width:116px;max-height:48px}.mms-mark{width:56px;height:56px}.mms-mark:after{left:9px;bottom:-7px;width:17px;height:17px}.mms-mark span{font-size:39px}.lane b{font-size:15px}.sigil-corner{top:18px;right:18px;width:38px;height:38px}.secure{position:relative;right:auto;bottom:auto;margin:17px auto 0;text-align:center;font-size:8px}.credit{margin-top:22px}}
    @media(max-width:460px){.stage{padding-left:9px;padding-right:9px}.access-card{padding:22px 16px}.title{font-size:38px}.kicker,.managed-label{letter-spacing:.25em}.lanes{grid-template-columns:1fr 1fr}.lane{min-height:112px;padding:12px}.lane-brand{height:52px}.mms-mark{width:52px;height:52px}.mms-mark span{font-size:36px}.lane b{font-size:14px}.lane small{font-size:10px}.account-note{font-size:11px}.go{min-height:56px;font-size:12px}}
    @media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important}}
  </style>
</head>
<body data-initial-lane="${partnerFirst ? "partner" : "owner"}">
<section class="mmd-login" data-mmd-login data-mmd-page="${APPROVED_ADMIN_LOGIN_PAGE_ID}" data-layout="image-a-cinematic">
  <div class="wall" aria-hidden="true"></div>
  <aside class="visual" aria-hidden="true"><img class="visual-logo" src="${APPROVED_ADMIN_LOGIN_LOGO}" alt="MMD SIGIL Internal Admin"></aside>
  <img class="sigil-corner" src="${APPROVED_ADMIN_LOGIN_FAVICON}" alt="" width="48" height="48" aria-hidden="true">
  <div class="side-mantra" aria-hidden="true"><span>PEOPLE</span><span>SYSTEMS</span><span>A QUIETER</span><span>TOMORROW</span></div>
  <main class="stage">
    <article class="access-card">
      <p class="kicker">BACK OFFICE ACCESS</p>
      <h1 class="title">Enter your Back Office</h1>
      <p class="lead">กรุณาเลือกบัญชีที่ท่านต้องการเข้าถึง</p>
      <div class="rule" aria-hidden="true"></div>
      <p class="managed-label">MANAGED ACCOUNTS</p>
      <div class="lanes" role="tablist" aria-label="Business access">
        <button class="lane" type="button" data-lane="owner" role="tab">
          <span class="lane-status" aria-hidden="true"></span>
          <span class="lane-brand"><img src="${MMD_BRAND_LOGO}" alt="MMD Privé" width="145" height="62"></span>
          <b>MMD Privé</b><small>SIGIL System</small>
        </button>
        <button class="lane" type="button" data-lane="partner" role="tab">
          <span class="lane-status" aria-hidden="true"></span>
          <span class="lane-brand"><span class="mms-mark" aria-hidden="true"><span>m</span></span></span>
          <b>MMS</b><small>Male Massage</small>
        </button>
      </div>
      <p class="account-note">คุณสามารถดูแลหลายบัญชีได้ พร้อมกันสูงสุด 2 accounts ที่อยู่ภายใต้การดูแลของระบบนี้</p>

      <section class="panel" data-panel="owner">
        <div class="panel-head"><strong>MMD Privé · SIGIL System</strong><br><span>Owner / Internal Admin access</span></div>
        <div class="scope"><span>Approved access</span><span>Secure session</span><span>Private route</span></div>
        <form method="post" action="${ADMIN_LOGIN_SESSION_PATH}" id="ownerLoginForm" autocomplete="off">
          <input id="adminNext" type="hidden" name="next" value="${escapeAttribute(next)}">
          <label for="adminCredential">Access Code
            <span class="field"><input id="adminCredential" type="text" required readonly autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text" data-mask="true" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other"><button class="toggle" type="button" data-toggle="adminCredential" aria-pressed="false">SHOW</button></span>
          </label>
          <p class="message${error ? " is-error" : ""}" id="ownerMessage" role="${error ? "alert" : "status"}">${error ? escapeHtml(error) : `Next: ${escapeHtml(next)}`}</p>
          <button class="go" type="submit">Enter Back Office</button>
          <p class="privacy">Secure HttpOnly session · SIGIL System internal route</p>
        </form>
      </section>

      <section class="panel partner-panel" data-panel="partner">
        <div class="panel-head"><strong>MMS Partner · Male Massage</strong><br><span>สำหรับ MMS Partner ใช้เข้าสู่ระบบควบคุมการทำงานหลังบ้านของ Male Massage เท่านั้น</span></div>
        <div class="scope partner"><span>Applications</span><span>Therapists</span><span>Matching</span><span>MMS only</span></div>
        <form id="partnerLoginForm" autocomplete="on">
          <input type="hidden" name="action" value="partner_login">
          <label for="partnerUsername">Username<span class="field"><input id="partnerUsername" name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></span></label>
          <label for="partnerPassword">Password<span class="field"><input id="partnerPassword" name="password" type="password" required minlength="12" maxlength="128" autocomplete="current-password"><button class="toggle" type="button" data-toggle="partnerPassword" aria-pressed="false">SHOW</button></span></label>
          <p class="message" id="partnerMessage" role="status">MMS Partner Operations · Male Massage Back Office</p>
          <button class="go" type="submit">Enter Back Office</button>
        </form>
        <div class="links"><button class="linkbtn" type="button" data-open="signup">สร้างบัญชี Partner</button><button class="linkbtn" type="button" data-open="recover">ลืมรหัสผ่าน?</button></div>

        <section class="subpanel" data-subpanel="signup" hidden>
          <form id="partnerSignupForm" autocomplete="off">
            <input type="hidden" name="action" value="partner_signup">
            <label>Username<span class="field"><input name="username" required autocomplete="off" autocapitalize="none" spellcheck="false"></span></label>
            <label>Password<span class="field"><input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></span></label>
            <label>Invite Code<span class="field"><input name="invite_code" type="password" required autocomplete="off"></span></label>
            <p class="message" id="signupMessage" role="status">Invite-only activation · ใช้รหัสเชิญที่ได้รับอนุมัติ</p>
            <button class="go" type="submit">Create Partner Account</button>
          </form>
        </section>

        <section class="subpanel" data-subpanel="recover" hidden>
          <form id="partnerRecoverForm" autocomplete="off">
            <input type="hidden" name="action" value="partner_recover">
            <label>Username<span class="field"><input name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></span></label>
            <label>Recovery Code<span class="field"><input name="recovery_code" type="password" required autocomplete="off"></span></label>
            <label>New Password<span class="field"><input name="new_password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></span></label>
            <p class="message" id="recoverMessage" role="status">Recovery จะเปลี่ยนรหัสผ่านและออก Recovery Code ชุดใหม่</p>
            <button class="go" type="submit">Reset Password</button>
          </form>
        </section>
        <div class="recovery" id="recoveryBox"><b>Recovery Code ใหม่ — เก็บไว้ในที่ปลอดภัย</b><code id="recoveryCode"></code><p>รหัสนี้แสดงหลัง activation/reset เท่านั้น ระบบเก็บเฉพาะ hash</p></div>
        <p class="privacy" style="margin-top:12px">Partner session จำกัดไว้ที่ /internal/admin/mms และ /v1/admin/mms* เท่านั้น</p>
      </section>

      <footer class="credit"><b>SIGIL Systems</b><br>Design and Architecture by Per 2025–2026<span class="thai-credit">(อีดอก กูเองค่ะมึง)</span></footer>
    </article>
  </main>
  <div class="secure">SECURE · PRIVATE · INTERNAL</div>
</section>
<script>(()=>{
  const sessionPath='${ADMIN_LOGIN_SESSION_PATH}';
  const initial=document.body.dataset.initialLane==='partner'?'partner':'owner';
  const lanes=[...document.querySelectorAll('[data-lane]')];
  const panels=[...document.querySelectorAll('[data-panel]')];
  function setLane(name){lanes.forEach(b=>{const on=b.dataset.lane===name;b.classList.toggle('is-active',on);b.setAttribute('aria-selected',String(on));});panels.forEach(p=>p.hidden=p.dataset.panel!==name);}
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
