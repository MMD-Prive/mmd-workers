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

const CSP = [
  "default-src 'self'",
  "script-src 'unsafe-inline' 'self'",
  "style-src 'unsafe-inline' 'self'",
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

  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#050403">
  <script>(()=>{if(location.protocol==='https:'&&location.hostname==='www.mmdbkk.com'){const path=(location.pathname.replace(/\\/+$/,'')||'/');if(path==='/internal/admin/login'){const canonical=new URL(location.href);canonical.hostname='mmdbkk.com';location.replace(canonical.toString());}}})();</script>
  <title>MMD Privé · Internal Login</title>
  <link rel="canonical" href="${ADMIN_CANONICAL_ORIGIN}/internal/admin/login">
  <link rel="icon" type="image/webp" href="${APPROVED_ADMIN_LOGIN_FAVICON}">
  <link rel="apple-touch-icon" href="${APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON}">
  <style>
    :root{color-scheme:dark;--bg:#050403;--panel:rgba(13,10,8,.76);--line:rgba(239,204,132,.24);--gold:#e8bf65;--gold2:#ffe7a7;--text:#fff7ec;--muted:rgba(255,247,236,.74);--soft:rgba(255,247,236,.58);--danger:#ffb7bd;--ink:#151006}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg)}body{min-height:100svh;color:var(--text);font-family:"LINE Seed Sans TH","Noto Sans Thai","Noto Sans",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}.mmd-login,.mmd-login *{box-sizing:border-box}.mmd-login{min-height:100svh;position:relative;isolation:isolate;overflow:hidden;padding:18px;color:var(--text);background:#050403}.mmd-login:before{content:"";position:fixed;inset:0;z-index:-3;background:linear-gradient(90deg,rgba(5,4,3,.97),rgba(5,4,3,.88) 36%,rgba(5,4,3,.46) 67%,rgba(5,4,3,.82)),url("${APPROVED_ADMIN_LOGIN_HERO}") center center/cover no-repeat;filter:saturate(1.02) contrast(1.04) brightness(.78)}.mmd-login:after{content:"";position:fixed;inset:0;z-index:-2;background:radial-gradient(circle at 16% 10%,rgba(232,191,101,.20),transparent 28%),radial-gradient(circle at 74% 22%,rgba(255,231,167,.13),transparent 25%),linear-gradient(180deg,rgba(5,4,3,.08),#050403 102%)}.mmd-login__shell{width:min(1050px,100%);margin:0 auto;display:grid;gap:14px;min-height:calc(100svh - 36px);align-content:center}.mmd-login__top{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:58px;padding:10px 12px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018)),rgba(10,8,6,.60);box-shadow:0 20px 60px rgba(0,0,0,.34);backdrop-filter:blur(16px)}.mmd-login__brand{display:flex;align-items:center;gap:11px;color:inherit;text-decoration:none}.mmd-login__brand img{width:34px;height:34px;object-fit:contain}.mmd-login__brand b{display:block;font-size:14px;line-height:1.1;color:var(--text)}.mmd-login__brand span{display:block;font-size:12px;color:var(--soft)}.mmd-login__pill{border:1px solid rgba(255,231,167,.18);border-radius:999px;padding:8px 11px;color:var(--gold2);font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;background:rgba(0,0,0,.20)}.mmd-login__grid{display:grid;gap:14px;align-items:stretch}.mmd-login__card,.mmd-login__visual{border:1px solid var(--line);border-radius:30px;background:linear-gradient(180deg,rgba(255,255,255,.060),rgba(255,255,255,.018)),var(--panel);box-shadow:0 28px 80px rgba(0,0,0,.42);backdrop-filter:blur(18px)}.mmd-login__card{padding:clamp(22px,4.2vw,42px);display:grid;align-content:center;min-height:520px}.mmd-login__kicker{color:var(--gold);font-size:11px;font-weight:950;letter-spacing:.18em;text-transform:uppercase;margin:0 0 12px}.mmd-login h1{margin:0;font-size:clamp(40px,6.3vw,64px);line-height:.94;letter-spacing:-.052em;color:var(--text);max-width:8.4em}.mmd-login__lead{margin:15px 0 0;color:var(--muted);font-size:clamp(15px,1.55vw,18px);line-height:1.62;max-width:31em}.mmd-login__chips{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 4px}.mmd-login__chips span{border:1px solid rgba(255,231,167,.18);border-radius:999px;padding:7px 10px;color:var(--gold2);font-size:10px;font-weight:900;background:rgba(0,0,0,.20)}.mmd-login form{display:grid;gap:12px;margin-top:14px}.mmd-login label{display:grid;gap:8px;color:var(--gold);font-size:11px;font-weight:950;letter-spacing:.15em;text-transform:uppercase}.mmd-login__input{display:grid;grid-template-columns:1fr auto;border:1px solid rgba(255,231,167,.24);border-radius:18px;overflow:hidden;background:rgba(0,0,0,.46);box-shadow:0 0 0 1px rgba(0,0,0,.20) inset}.mmd-login input{width:100%;min-height:58px;border:0;background:transparent;color:var(--text);padding:0 16px;outline:0;font:600 16px/1.2 "LINE Seed Sans TH","Noto Sans Thai","Noto Sans",system-ui,sans-serif;letter-spacing:.02em}.mmd-login input:focus{box-shadow:0 0 0 3px rgba(232,191,101,.18) inset}.mmd-login input[data-mask="true"]{-webkit-text-security:disc}.mmd-login button{border:0;background:var(--gold);color:var(--ink);font-weight:950;cursor:pointer;font-family:inherit}.mmd-login button:disabled{opacity:.56;cursor:wait}.mmd-login__toggle{min-width:76px;border-left:1px solid rgba(255,231,167,.24)!important;background:transparent!important;color:var(--gold2)!important;font-size:11px;letter-spacing:.08em}.mmd-login__message{min-height:22px;margin:0;color:var(--soft)!important;font-size:13px;line-height:1.55}.mmd-login__message.is-error{color:var(--danger)!important}.mmd-login__go{min-height:56px;border:1px solid rgba(255,231,167,.32)!important;border-radius:18px;font-size:12px;letter-spacing:.10em;text-transform:uppercase;background:linear-gradient(135deg,#f0c96f,#c9973e)!important;box-shadow:0 16px 34px rgba(0,0,0,.26)}.mmd-login__privacy{margin:0;color:rgba(255,247,236,.58);font-size:11px;line-height:1.55}.mmd-login__visual{position:relative;overflow:hidden;min-height:520px;background:#050403}.mmd-login__visual:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,4,3,.22),rgba(5,4,3,.68)),url("${APPROVED_ADMIN_LOGIN_PRIVACY_BG}") center/cover no-repeat;opacity:.54;mix-blend-mode:screen}.mmd-login__visual:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.74)),url("${APPROVED_ADMIN_LOGIN_WALL_BG}") center/cover no-repeat;opacity:.68}.mmd-login__note{position:absolute;z-index:3;left:18px;right:18px;bottom:18px;border:1px solid rgba(255,231,167,.18);border-radius:22px;background:rgba(0,0,0,.58);backdrop-filter:blur(14px);padding:17px}.mmd-login__note b{display:block;color:var(--text);font-size:22px;line-height:1.12;letter-spacing:-.03em}.mmd-login__note p{margin:7px 0 0;color:var(--muted);font-size:14px;line-height:1.58}.mmd-login21__visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;filter:brightness(.78) contrast(1.05)}@media(min-width:840px){.mmd-login__grid{grid-template-columns:minmax(0,.86fr) minmax(390px,1fr)}}@media(max-width:760px){.mmd-login{padding:10px}.mmd-login__shell{min-height:calc(100svh - 20px);align-content:start}.mmd-login__top{align-items:flex-start;flex-direction:column}.mmd-login__card{min-height:auto;padding:22px}.mmd-login h1{font-size:38px;max-width:none}.mmd-login__lead{font-size:15px}.mmd-login__visual{min-height:260px}.mmd-login__note b{font-size:18px}.mmd-login__note p{font-size:13px}.mmd-login__pill{font-size:9px}}
  </style>
</head>
<body>
  <span hidden>Enter the control room.</span>
  <span class="mmd-login21" data-mmd-login21 hidden></span>
  <section class="mmd-login" data-mmd-login data-mmd-page="${APPROVED_ADMIN_LOGIN_PAGE_ID}">
    <span class="mmd-login21__visual" hidden aria-hidden="true"><img src="${APPROVED_ADMIN_LOGIN_HERO}" alt=""></span>
    <main class="mmd-login__shell">
      <header class="mmd-login__top">
        <a class="mmd-login__brand" href="/internal/admin/login" aria-label="SIGIL Internal Admin Login">
          <img src="${APPROVED_ADMIN_LOGIN_LOGO}" alt="SIGIL" width="34" height="34">
          <span><b>Internal Admin</b><span>Private operator gate</span></span>
        </a>
        <div class="mmd-login__pill">SIGIL · INTERNAL</div>
      </header>
      <section class="mmd-login__grid">
        <article class="mmd-login__card">
          <p class="mmd-login__kicker">ADMIN ACCESS</p>
          <h1>Internal Admin</h1>
          <p class="mmd-login__lead">เข้าสู่พื้นที่ทำงานภายในของ MMD Privé ใส่รหัสที่ได้รับอนุมัติ แล้วระบบจะพาไปหน้าที่ตั้งไว้ทันที</p>
          <div class="mmd-login__chips" aria-label="Admin access notes"><span>Approved access</span><span>Secure session</span><span>Private route</span></div>
          <form method="post" action="${ADMIN_LOGIN_SESSION_PATH}" id="adminLoginForm" autocomplete="off">
            <input id="adminNext" type="hidden" name="next" value="${escapeAttribute(next)}">
            <label for="adminCredential">Access Code
              <span class="mmd-login__input"><input id="adminCredential" type="text" required readonly autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text" aria-autocomplete="none" data-mask="true" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other"><button class="mmd-login__toggle" type="button" aria-controls="adminCredential" aria-pressed="false">SHOW</button></span>
            </label>
            <p class="mmd-login__message${error ? " is-error" : ""}" role="${error ? "alert" : "status"}">${error ? escapeHtml(error) : `Next: ${escapeHtml(next)}`}</p>
            <button class="mmd-login__go" type="submit">Enter Admin</button>
            <p class="mmd-login__privacy">ระบบไม่เก็บรหัสไว้ในหน้าเว็บ และ session ที่อนุมัติจะออกเป็น Secure HttpOnly cookie เท่านั้น</p>
          </form>
        </article>
        <aside class="mmd-login__visual" aria-label="SIGIL internal administration environment">
          <div class="mmd-login__note"><b>Private access. Quiet control.</b><p>เข้าเฉพาะพื้นที่ทำงานภายใน แล้วไปต่อยัง route ที่กำหนดไว้</p></div>
        </aside>
      </section>
    </main>
  </section>
  <script>(()=>{const form=document.getElementById('adminLoginForm');const input=document.getElementById('adminCredential');const nextInput=document.getElementById('adminNext');const toggle=document.querySelector('.mmd-login__toggle');const message=document.querySelector('.mmd-login__message');const submit=document.querySelector('.mmd-login__go');if(!form||!input||!nextInput||!toggle||!message||!submit)return;const unlock=()=>{input.readOnly=false;};input.value='';unlock();try{input.focus({preventScroll:true});}catch{input.focus();}toggle.addEventListener('click',function(){const show=this.getAttribute('aria-pressed')!=='true';if(show)input.removeAttribute('data-mask');else input.setAttribute('data-mask','true');this.textContent=show?'HIDE':'SHOW';this.setAttribute('aria-pressed',String(show));input.focus();});form.addEventListener('submit',async(event)=>{event.preventDefault();const credential=input.value.trim();if(!credential){unlock();input.focus();return;}toggle.disabled=true;submit.disabled=true;message.classList.remove('is-error');message.setAttribute('role','status');message.textContent='Checking access…';try{const body=new URLSearchParams();body.set('credential',credential);body.set('next',nextInput.value||'/internal/admin/control-room');const response=await fetch('${ADMIN_LOGIN_SESSION_PATH}',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','X-MMD-Login-Fetch':'1'},credentials:'same-origin',redirect:'follow',cache:'no-store',body:body.toString()});if(response.ok&&response.redirected){location.assign(response.url);return;}let payload=null;try{payload=await response.clone().json();}catch{}if(response.ok&&payload&&payload.ok){location.assign(payload.next||nextInput.value||'/internal/admin/control-room');return;}let detail='เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง';if(response.status===401)detail='รหัสไม่ถูกต้อง หรือ session หมดอายุ';else if(response.status===403)detail='เข้าสู่ระบบไม่สำเร็จ ลองเปิดจาก mmdbkk.com แล้วลองใหม่อีกครั้ง';else if(response.status>=500)detail='ระบบหลังบ้านยังไม่พร้อม ลองใหม่อีกครั้ง';message.classList.add('is-error');message.setAttribute('role','alert');message.textContent=detail;toggle.disabled=false;submit.disabled=false;unlock();input.focus();}catch{message.classList.add('is-error');message.setAttribute('role','alert');message.textContent='ติดต่อระบบไม่ได้ ลอง refresh แล้วกดใหม่อีกครั้ง';toggle.disabled=false;submit.disabled=false;unlock();input.focus();}});})();</script>
</body>
</html>`;

  return new Response(html, { status, headers });
}

function loginHeaders() {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, max-age=0",
    "content-security-policy": CSP,
    "x-mmd-admin-login": APPROVED_ADMIN_LOGIN_PAGE_ID,
    "x-mmd-login-ui": "browser-fetch-v5",
    "x-mmd-page": APPROVED_ADMIN_LOGIN_PAGE_ID,
    "x-mmd-route-owner": "admin-worker",
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
