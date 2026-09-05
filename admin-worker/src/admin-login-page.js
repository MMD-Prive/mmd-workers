export const ADMIN_LOGIN_SESSION_PATH = "/internal/admin/login/session";
export const APPROVED_ADMIN_LOGIN_PAGE_ID = "admin-login-approved-hero";
export const APPROVED_ADMIN_LOGIN_HERO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69e34c91250ec9f6ee29d319_MMD%20SIGIL%20Logo.png";
export const APPROVED_ADMIN_LOGIN_LOGO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0f2cbc7e26b6735aee4cb2_SIGIL%20LOGO%20Transp.webp";
export const APPROVED_ADMIN_LOGIN_FAVICON =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0ea3f9421cae9dd223f50b_SIGIL%20only%20logo.webp";
export const APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69e34c91250ec9f6ee29d319_MMD%20SIGIL%20Logo.png";
export const ADMIN_CANONICAL_ORIGIN = "https://mmdbkk.com";

// This is the only renderer for /internal/admin/login. Both the production
// entrypoint and the core worker import it so an entrypoint rollback cannot
// silently restore an older login shell.
export function renderApprovedAdminLogin(
  request,
  { status = 200, error = "", next = "/internal/admin/control-room" } = {}
) {
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
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%;background:#050403}
    body{min-height:100svh;color:#fff8ef;font-family:"Noto Sans Thai",Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
    .mmd-login21,.mmd-login21 *{box-sizing:border-box}
    .mmd-login21{min-height:100svh;padding:18px;color:#fff8ef;background:radial-gradient(circle at 12% 5%,rgba(216,173,92,.18),transparent 30%),linear-gradient(135deg,#050403,#130d08 60%,#040303)}
    .mmd-login21__shell{width:min(1120px,100%);margin:0 auto;display:grid;gap:14px}
    .mmd-login21__top,.mmd-login21__card,.mmd-login21__visual{border:1px solid rgba(255,229,170,.14);border-radius:28px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.012)),rgba(18,14,11,.82);box-shadow:0 24px 70px rgba(0,0,0,.42);backdrop-filter:blur(16px)}
    .mmd-login21__top{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:74px;padding:12px 16px}
    .mmd-login21__brand{display:flex;align-items:center;gap:12px;color:inherit;text-decoration:none}
    .mmd-login21__brand img{width:40px;height:40px;object-fit:contain}
    .mmd-login21__brand b{display:block;font-size:14px}
    .mmd-login21__brand span{display:block;color:rgba(255,248,239,.62);font-size:12px}
    .mmd-login21__pill{border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:9px 12px;color:#ffe4a3;font-size:11px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}
    .mmd-login21__grid{display:grid;gap:14px;align-items:stretch}
    .mmd-login21__card{padding:clamp(24px,5vw,48px);display:grid;align-content:center}
    .mmd-login21__kicker{color:#d8ad5c;font-size:11px;font-weight:950;letter-spacing:.16em;text-transform:uppercase}
    .mmd-login21 h1{margin:12px 0;font-size:clamp(44px,8vw,76px);line-height:.9;letter-spacing:-.065em}
    .mmd-login21 p{margin:0;color:rgba(255,248,239,.68);line-height:1.62}
    .mmd-login21__chips{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
    .mmd-login21__chips span{border:1px solid rgba(255,229,170,.2);border-radius:999px;padding:8px 10px;color:#ffe4a3;font-size:11px;font-weight:800}
    .mmd-login21 form{display:grid;gap:12px;margin-top:4px}
    .mmd-login21 label{display:grid;gap:8px;margin-top:10px;color:#d8ad5c;font-size:11px;font-weight:950;letter-spacing:.14em;text-transform:uppercase}
    .mmd-login21__input{display:grid;grid-template-columns:1fr auto;border:1px solid rgba(255,229,170,.18);border-radius:18px;overflow:hidden;background:rgba(0,0,0,.42)}
    .mmd-login21 input{width:100%;min-height:58px;border:0;background:transparent;color:#fff8ef;padding:0 16px;outline:0;font:inherit}
    .mmd-login21 input[data-mask="true"]{-webkit-text-security:disc}
    .mmd-login21 button{border:0;background:#d8ad5c;color:#140f08;font-weight:950;padding:0 18px;cursor:pointer}
    .mmd-login21 button:disabled{opacity:.55;cursor:wait}
    .mmd-login21__toggle{border-left:1px solid rgba(255,229,170,.18)!important;background:transparent!important;color:#ffe4a3!important;font-size:11px}
    .mmd-login21__message{min-height:22px;color:rgba(255,248,239,.64)!important;font-size:13px}
    .mmd-login21__message.is-error{color:#ffb2b7!important}
    .mmd-login21__go{min-height:54px;border:1px solid rgba(255,229,170,.3)!important;border-radius:16px;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
    .mmd-login21__privacy{font-size:10px}
    .mmd-login21__visual{position:relative;min-height:520px;overflow:hidden;background:radial-gradient(circle at 50% 36%,rgba(216,173,92,.22),transparent 28%),radial-gradient(circle at 78% 18%,rgba(255,231,179,.06),transparent 22%),linear-gradient(145deg,#17100a,#080605 55%,#030303)}
    .mmd-login21__visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;filter:brightness(.78) contrast(1.05)}
    .mmd-login21__visual .mmd-login21__sigil{inset:43% auto auto 50%;width:min(48%,230px);height:auto;transform:translate(-50%,-50%);object-fit:contain;filter:drop-shadow(0 22px 60px rgba(0,0,0,.7));opacity:.92}
    .mmd-login21__visual:before{content:"";position:absolute;inset:8%;border:1px solid rgba(216,173,92,.12);border-radius:50%;box-shadow:0 0 80px rgba(216,173,92,.07) inset}
    .mmd-login21__visual:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.02) 35%,rgba(0,0,0,.72))}
    .mmd-login21__note{position:absolute;z-index:1;left:18px;right:18px;bottom:18px;border:1px solid rgba(255,229,170,.16);border-radius:20px;background:rgba(0,0,0,.48);backdrop-filter:blur(12px);padding:16px}
    .mmd-login21__note b{display:block;font-size:22px}
    .mmd-login21__note p{margin-top:6px}
    @media(min-width:860px){.mmd-login21__grid{grid-template-columns:minmax(0,.88fr) minmax(430px,1fr)}}
    @media(max-width:760px){.mmd-login21{padding:10px}.mmd-login21__top{align-items:flex-start;flex-direction:column}.mmd-login21__visual{min-height:330px}.mmd-login21 h1{font-size:46px}}
  </style>
</head>
<body>
  <section class="mmd-login21" data-mmd-login21 data-mmd-page="${APPROVED_ADMIN_LOGIN_PAGE_ID}">
    <main class="mmd-login21__shell">
      <header class="mmd-login21__top">
        <a class="mmd-login21__brand" href="/internal/admin/login" aria-label="SIGIL Internal Admin Login">
          <img src="${APPROVED_ADMIN_LOGIN_LOGO}" alt="SIGIL" width="40" height="40">
          <span><b>Internal Admin</b><span>Private operator gate</span></span>
        </a>
        <div class="mmd-login21__pill">SIGIL · INTERNAL</div>
      </header>
      <section class="mmd-login21__grid">
        <article class="mmd-login21__card">
          <span class="mmd-login21__kicker">ADMIN ACCESS</span>
          <h1>Enter the<br>control room.</h1>
          <p>ใส่รหัสที่ได้รับอนุมัติ ระบบจะพาไปหน้าที่ตั้งไว้ต่อทันที ไม่ใช่หน้า setup account แล้วครับ</p>
          <div class="mmd-login21__chips"><span>Approved access</span><span>Secure session</span><span>Admin route</span></div>
          <form method="post" action="${ADMIN_LOGIN_SESSION_PATH}" id="adminLoginForm" autocomplete="off">
            <input id="adminNext" type="hidden" name="next" value="${escapeAttribute(next)}">
            <label for="adminCredential">Access Code
              <span class="mmd-login21__input"><input id="adminCredential" type="text" required readonly autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text" aria-autocomplete="none" data-mask="true" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other"><button class="mmd-login21__toggle" type="button" aria-controls="adminCredential" aria-pressed="false">SHOW</button></span>
            </label>
            <p class="mmd-login21__message${error ? " is-error" : ""}" role="${error ? "alert" : "status"}">${error ? escapeHtml(error) : `Next: ${escapeHtml(next)}`}</p>
            <button class="mmd-login21__go" type="submit">Enter Admin</button>
            <p class="mmd-login21__privacy">ระบบจะไม่เก็บรหัสไว้ในหน้าเว็บ และ session ที่อนุมัติจะถูกออกเป็น Secure HttpOnly cookie เท่านั้น</p>
          </form>
        </article>
        <aside class="mmd-login21__visual" aria-label="SIGIL internal administration environment">
          <img class="mmd-login21__sigil" src="${APPROVED_ADMIN_LOGIN_HERO}" alt="MMD SIGIL Internal Admin" aria-hidden="true" width="512" height="512" fetchpriority="high">
          <div class="mmd-login21__note"><b>Private access. Quiet control.</b><p>เข้าสู่พื้นที่ทำงานภายใน แล้วไปต่อยัง Control Room ตาม route ที่กำหนด</p></div>
        </aside>
      </section>
    </main>
  </section>
  <script>(()=>{const form=document.getElementById('adminLoginForm');const input=document.getElementById('adminCredential');const nextInput=document.getElementById('adminNext');const toggle=document.querySelector('.mmd-login21__toggle');const message=document.querySelector('.mmd-login21__message');const submit=document.querySelector('.mmd-login21__go');if(!form||!input||!nextInput||!toggle||!message||!submit)return;const unlock=()=>{input.readOnly=false;};input.value='';input.addEventListener('pointerdown',unlock,{once:true});input.addEventListener('focus',unlock,{once:true});input.addEventListener('keydown',unlock,{once:true});window.addEventListener('pageshow',()=>{if(input.readOnly)input.value='';});toggle.addEventListener('click',function(){const show=this.getAttribute('aria-pressed')!=='true';if(show)input.removeAttribute('data-mask');else input.setAttribute('data-mask','true');this.textContent=show?'HIDE':'SHOW';this.setAttribute('aria-pressed',String(show));});form.addEventListener('submit',async(event)=>{event.preventDefault();const credential=input.value;if(!credential){input.readOnly=false;input.focus();return;}input.readOnly=true;toggle.disabled=true;submit.disabled=true;message.classList.remove('is-error');message.setAttribute('role','status');message.textContent='Checking access…';try{const body=new URLSearchParams();body.set('credential',credential);body.set('next',nextInput.value||'/internal/admin/control-room');const response=await fetch('${ADMIN_LOGIN_SESSION_PATH}',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},credentials:'same-origin',redirect:'follow',cache:'no-store',body:body.toString()});if(response.ok&&response.redirected){location.assign(response.url);return;}let payload=null;try{payload=await response.clone().json();}catch{}if(response.ok&&payload&&payload.ok){location.assign(payload.next||nextInput.value||'/internal/admin/control-room');return;}const code=response.status;const err=payload&&payload.error?payload.error:'';const legacyKey='access'+'_code';const invalidKey='invalid_'+legacyKey;const missingKey='missing_'+legacyKey;let detail='Login failed (HTTP '+code+')';if(err===invalidKey||code===401)detail='Access Code ไม่ตรงกับ Production secret ครับ (HTTP 401)';else if(err==='forbidden_origin')detail='Origin/Host ของหน้า login ไม่อยู่ใน allowlist ครับ (HTTP 403)';else if(err===missingKey)detail='ยังไม่ได้ส่ง Access Code ครับ (HTTP 400)';else if(err==='admin_login_credential_missing'||code===503)detail='Worker รับ request แล้ว แต่ Admin credential/session config ยังไม่พร้อม (HTTP 503)';else if(code===400)detail='Browser POST ถึง Worker แล้ว แต่รูปแบบ request ไม่ถูกต้อง (HTTP 400)';message.classList.add('is-error');message.setAttribute('role','alert');message.textContent=detail;}catch{message.classList.add('is-error');message.setAttribute('role','alert');message.textContent='Browser ติดต่อ Admin Worker ไม่สำเร็จ กรุณารีเฟรชแล้วลองอีกครั้ง';}finally{input.readOnly=false;toggle.disabled=false;submit.disabled=false;}});})();</script>
</body>
</html>`;

  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, {
    status,
    headers: {
      "cache-control": "no-store, private, max-age=0",
      "content-security-policy": "default-src 'none'; img-src https://cdn.prod.website-files.com; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-mmd-login-ui": "browser-fetch-v5",
      "x-mmd-admin-origin": ADMIN_CANONICAL_ORIGIN,
      "x-mmd-page": APPROVED_ADMIN_LOGIN_PAGE_ID,
      "x-mmd-route-owner": "admin-worker",
    },
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
}

function escapeAttribute(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
