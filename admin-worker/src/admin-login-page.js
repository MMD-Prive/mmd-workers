export const ADMIN_LOGIN_SESSION_PATH = "/internal/admin/login/session";
export const APPROVED_ADMIN_LOGIN_PAGE_ID = "admin-login-approved-hero";
export const APPROVED_ADMIN_LOGIN_HERO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6e0fdcffc6750baeb8b2bf_Internal%20Admin%20Chang%20Ewvon.webp";
export const APPROVED_ADMIN_LOGIN_LOGO =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0f2cbc7e26b6735aee4cb2_SIGIL%20LOGO%20Transp.webp";
export const APPROVED_ADMIN_LOGIN_FAVICON =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69e34d70142723ec97768bc2_Only%20logo.png";
export const APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON =
  "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69e34c91250ec9f6ee29d319_MMD%20SIGIL%20Logo.png";

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
  <title>MMD Privé · Internal Login</title>
  <link rel="icon" type="image/png" sizes="32x32" href="${APPROVED_ADMIN_LOGIN_FAVICON}">
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
    .mmd-login21 button{border:0;background:#d8ad5c;color:#140f08;font-weight:950;padding:0 18px;cursor:pointer}
    .mmd-login21__toggle{border-left:1px solid rgba(255,229,170,.18)!important;background:transparent!important;color:#ffe4a3!important;font-size:11px}
    .mmd-login21__message{min-height:22px;color:rgba(255,248,239,.64)!important;font-size:13px}
    .mmd-login21__message.is-error{color:#ffb2b7!important}
    .mmd-login21__go{min-height:54px;border:1px solid rgba(255,229,170,.3)!important;border-radius:16px;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
    .mmd-login21__privacy{font-size:10px}
    .mmd-login21__visual{position:relative;min-height:520px;overflow:hidden}
    .mmd-login21__visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;filter:brightness(.78) contrast(1.05)}
    .mmd-login21__visual:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(0,0,0,.72))}
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
          <p>ใส่ access code ที่ได้รับอนุมัติ ระบบจะพาไปหน้าที่ตั้งไว้ต่อทันที ไม่ใช่หน้า setup account แล้วครับ</p>
          <div class="mmd-login21__chips"><span>Approved access</span><span>Secure session</span><span>Admin route</span></div>
          <form method="post" action="${ADMIN_LOGIN_SESSION_PATH}" id="adminLoginForm" autocomplete="off">
            <input type="hidden" name="next" value="${escapeAttribute(next)}">
            <label for="adminCredential">Access Code
              <span class="mmd-login21__input"><input id="adminCredential" name="credential" type="password" required autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text" autofocus><button class="mmd-login21__toggle" type="button" aria-controls="adminCredential" aria-pressed="false">SHOW</button></span>
            </label>
            <p class="mmd-login21__message${error ? " is-error" : ""}" role="${error ? "alert" : "status"}">${error ? escapeHtml(error) : `Next: ${escapeHtml(next)}`}</p>
            <button class="mmd-login21__go" type="submit">Enter Admin</button>
            <p class="mmd-login21__privacy">ระบบจะไม่เก็บรหัสไว้ในหน้าเว็บ และ session ที่อนุมัติจะถูกออกเป็น Secure HttpOnly cookie เท่านั้น</p>
          </form>
        </article>
        <aside class="mmd-login21__visual" aria-label="Chang and Ewvon in the MMD internal administration environment">
          <img src="${APPROVED_ADMIN_LOGIN_HERO}" alt="Internal Admin Chang Ewvon" width="1600" height="1200" fetchpriority="high">
          <div class="mmd-login21__note"><b>Access first. Work after.</b><p>เข้าให้ได้ก่อน แล้วค่อยไป Create Session / Create Job ตาม route ที่ส่งมา</p></div>
        </aside>
      </section>
    </main>
  </section>
  <script>(()=>{const form=document.getElementById('adminLoginForm');const input=document.getElementById('adminCredential');const toggle=document.querySelector('.mmd-login21__toggle');if(!form||!input||!toggle)return;form.addEventListener('submit',(event)=>{if(!input.value){event.preventDefault();input.focus();return;}input.readOnly=true;});toggle.addEventListener('click',function(){const show=this.getAttribute('aria-pressed')!=='true';input.type=show?'text':'password';this.textContent=show?'HIDE':'SHOW';this.setAttribute('aria-pressed',String(show));});})();</script>
</body>
</html>`;

  return new Response(request.method.toUpperCase() === "HEAD" ? null : html, {
    status,
    headers: {
      "cache-control": "no-store, private, max-age=0",
      "content-security-policy": "default-src 'none'; img-src https://cdn.prod.website-files.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
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
