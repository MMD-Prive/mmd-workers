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

const MMS_PARTNER_PATH = "/internal/admin/mms";
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
  const partnerFirst = next === MMS_PARTNER_PATH;
  const html = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="theme-color" content="#050403">
  <script>(()=>{if(location.protocol==='https:'&&location.hostname==='www.mmdbkk.com'){const path=(location.pathname.replace(/\\/+$/,'')||'/');if(path==='/internal/admin/login'){const canonical=new URL(location.href);canonical.hostname='mmdbkk.com';location.replace(canonical.toString());}}})();</script>
  <title>MMD Privé · Internal Login</title>
  <link rel="canonical" href="${ADMIN_CANONICAL_ORIGIN}/internal/admin/login">
  <link rel="icon" type="image/webp" href="${APPROVED_ADMIN_LOGIN_FAVICON}">
  <link rel="apple-touch-icon" href="${APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON}">
  <style>
    :root{color-scheme:dark;--bg:#050403;--panel:rgba(13,10,8,.78);--line:rgba(239,204,132,.22);--gold:#e8bf65;--gold2:#ffe7a7;--green:#456b55;--green2:#6e9279;--text:#fff7ec;--muted:rgba(255,247,236,.72);--soft:rgba(255,247,236,.54);--danger:#ffb7bd;--ok:#b9ddc3;--ink:#151006}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg)}body{min-height:100svh;color:var(--text);font-family:"LINE Seed Sans TH","Noto Sans Thai","Noto Sans",system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.mmd-login{min-height:100svh;position:relative;isolation:isolate;overflow:hidden;padding:18px;background:#050403}.mmd-login:before{content:"";position:fixed;inset:0;z-index:-3;background:linear-gradient(90deg,rgba(5,4,3,.97),rgba(5,4,3,.88) 38%,rgba(5,4,3,.47) 70%,rgba(5,4,3,.82)),url("${APPROVED_ADMIN_LOGIN_HERO}") center/cover no-repeat;filter:saturate(1.02) contrast(1.04) brightness(.77)}.mmd-login:after{content:"";position:fixed;inset:0;z-index:-2;background:radial-gradient(circle at 15% 8%,rgba(232,191,101,.18),transparent 27%),radial-gradient(circle at 82% 24%,rgba(72,111,88,.22),transparent 30%),linear-gradient(180deg,transparent,#050403 105%)}
    .shell{width:min(1080px,100%);margin:auto;display:grid;gap:14px;min-height:calc(100svh - 36px);align-content:center}.top,.card,.visual{border:1px solid var(--line);background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018)),rgba(10,8,6,.68);box-shadow:0 24px 70px rgba(0,0,0,.4);backdrop-filter:blur(18px)}.top{border-radius:24px;padding:11px 13px;display:flex;justify-content:space-between;align-items:center;gap:12px}.brand{display:flex;align-items:center;gap:11px;color:inherit;text-decoration:none}.brand img{width:34px;height:34px;object-fit:contain}.brand b{display:block;font-size:14px}.brand small{display:block;color:var(--soft);font-size:12px}.pill{border:1px solid rgba(255,231,167,.16);border-radius:999px;padding:8px 11px;color:var(--gold2);font-size:10px;font-weight:900;letter-spacing:.12em}.grid{display:grid;gap:14px}.card{border-radius:30px;padding:clamp(22px,4vw,40px);min-height:560px;display:grid;align-content:center}.visual{border-radius:30px;position:relative;overflow:hidden;min-height:560px}.visual:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,4,3,.18),rgba(5,4,3,.72)),url("${APPROVED_ADMIN_LOGIN_PRIVACY_BG}") center/cover no-repeat;opacity:.58}.visual:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent,rgba(0,0,0,.75)),url("${APPROVED_ADMIN_LOGIN_WALL_BG}") center/cover no-repeat;opacity:.55}.visual-logo{position:absolute;z-index:2;top:28px;right:28px;width:112px;height:112px;object-fit:contain;opacity:.88}.note{position:absolute;z-index:3;left:18px;right:18px;bottom:18px;border:1px solid rgba(255,231,167,.16);border-radius:22px;background:rgba(0,0,0,.58);backdrop-filter:blur(14px);padding:17px}.note b{display:block;font-size:21px}.note p{margin:7px 0 0;color:var(--muted);font-size:14px;line-height:1.58}
    .kicker{color:var(--gold);font-size:11px;font-weight:950;letter-spacing:.17em;margin:0 0 10px}.title{margin:0;font-size:clamp(38px,5.7vw,58px);line-height:.96;letter-spacing:-.045em}.lead{margin:14px 0 18px;color:var(--muted);font-size:15px;line-height:1.64;max-width:38em}.lanes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:4px 0 18px}.lane{min-height:54px;border:1px solid rgba(255,231,167,.17);border-radius:17px;background:rgba(0,0,0,.24);color:var(--muted);font:800 13px/1.25 inherit;cursor:pointer;padding:10px 12px;text-align:left}.lane b{display:block;color:var(--text);font-size:13px}.lane small{display:block;margin-top:3px;color:var(--soft);font-weight:600}.lane.is-active{border-color:rgba(232,191,101,.48);background:linear-gradient(135deg,rgba(232,191,101,.15),rgba(232,191,101,.045))}.lane[data-lane="partner"].is-active{border-color:rgba(110,146,121,.6);background:linear-gradient(135deg,rgba(69,107,85,.34),rgba(69,107,85,.10))}.panel[hidden]{display:none}.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}.panel-head strong{font-size:20px}.panel-head span{color:var(--soft);font-size:12px}.scope{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 14px}.scope span{border:1px solid rgba(255,255,255,.10);border-radius:999px;padding:6px 9px;color:var(--soft);font-size:10px;background:rgba(0,0,0,.18)}.scope.partner span{border-color:rgba(110,146,121,.24);color:#c9dfcf}
    form{display:grid;gap:11px}label{display:grid;gap:7px;color:var(--gold);font-size:10px;font-weight:950;letter-spacing:.12em;text-transform:uppercase}.partner-panel label{color:#b9d6c1}.field{display:grid;grid-template-columns:1fr auto;border:1px solid rgba(255,231,167,.22);border-radius:17px;overflow:hidden;background:rgba(0,0,0,.44)}.partner-panel .field{border-color:rgba(110,146,121,.32)}input{width:100%;min-height:54px;border:0;background:transparent;color:var(--text);padding:0 15px;outline:0;font:600 15px/1.2 inherit}input:focus{box-shadow:0 0 0 3px rgba(232,191,101,.14) inset}.partner-panel input:focus{box-shadow:0 0 0 3px rgba(69,107,85,.22) inset}.toggle{min-width:72px;border:0;border-left:1px solid rgba(255,255,255,.12);background:transparent;color:var(--gold2);font:900 10px/1 inherit;cursor:pointer}.go{min-height:54px;border:0;border-radius:17px;background:linear-gradient(135deg,#f0c96f,#c9973e);color:var(--ink);font:950 12px/1 inherit;letter-spacing:.09em;text-transform:uppercase;cursor:pointer;box-shadow:0 14px 30px rgba(0,0,0,.24)}.partner-panel .go{background:linear-gradient(135deg,#71937a,#405f4c);color:#f7fff8}.go:disabled,.toggle:disabled{opacity:.55;cursor:wait}.message{min-height:20px;margin:0;color:var(--soft);font-size:12px;line-height:1.55}.message.is-error{color:var(--danger)}.message.is-ok{color:var(--ok)}.privacy{margin:0;color:var(--soft);font-size:10px;line-height:1.55}.links{display:flex;gap:12px;flex-wrap:wrap;margin-top:4px}.linkbtn{padding:0;border:0;background:transparent;color:#c9dfcf;font:800 12px/1.3 inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}.subpanel{margin-top:13px;padding-top:13px;border-top:1px solid rgba(110,146,121,.20)}.recovery{display:none;margin-top:10px;border:1px solid rgba(110,146,121,.28);border-radius:16px;background:rgba(69,107,85,.15);padding:12px}.recovery.is-visible{display:block}.recovery b{font-size:12px}.recovery code{display:block;margin-top:7px;padding:10px;border-radius:10px;background:rgba(0,0,0,.34);word-break:break-all;color:#e9fff0;font-size:12px}.recovery p{margin:7px 0 0;color:var(--muted);font-size:11px;line-height:1.5}
    @media(min-width:860px){.grid{grid-template-columns:minmax(0,.92fr) minmax(390px,1fr)}}@media(max-width:760px){.mmd-login{padding:10px}.shell{min-height:calc(100svh - 20px);align-content:start}.top{align-items:flex-start;flex-direction:column}.card{min-height:auto;padding:21px}.title{font-size:36px}.visual{min-height:245px}.lanes{grid-template-columns:1fr}.visual-logo{width:86px;height:86px;top:18px;right:18px}}
  </style>
</head>
<body data-initial-lane="${partnerFirst ? "partner" : "owner"}">
  <span hidden>Enter the control room.</span>
<section class="mmd-login" data-mmd-login data-mmd-page="${APPROVED_ADMIN_LOGIN_PAGE_ID}">
  <main class="shell">
    <header class="top">
      <a class="brand" href="/internal/admin/login" aria-label="MMD Internal Access"><img src="${APPROVED_ADMIN_LOGIN_LOGO}" alt="SIGIL" width="34" height="34"><span><b>Internal Access</b><small>MMD Privé · MMS Partner Operations</small></span></a>
      <div class="pill">INVITE ONLY · SECURE SESSION</div>
    </header>
    <section class="grid">
      <article class="card">
        <p class="kicker">PRIVATE ACCESS</p>
        <h1 class="title">เข้าพื้นที่ทำงานของคุณ</h1>
        <p class="lead">เลือกพื้นที่ให้ตรงกับหน้าที่ของคุณ Owner ใช้ช่องทางเดิม ส่วน MMS Partner เข้าเฉพาะงาน Male Massage ที่ได้รับอนุมัติ</p>
        <div class="lanes" role="tablist" aria-label="Access type">
          <button class="lane" type="button" data-lane="owner" role="tab"><b>Owner / Internal Admin</b><small>MMD Privé core administration</small></button>
          <button class="lane" type="button" data-lane="partner" role="tab"><b>MMS Partner</b><small>Male Massage operations only</small></button>
        </div>

        <section class="panel" data-panel="owner">
          <div class="panel-head"><div><strong>Internal Admin</strong><br><span>สำหรับ Per และ Internal Admin</span></div></div>
          <div class="scope"><span>Approved access</span><span>Secure session</span><span>Private route</span></div>
          <form method="post" action="${ADMIN_LOGIN_SESSION_PATH}" id="ownerLoginForm" autocomplete="off">
            <input id="adminNext" type="hidden" name="next" value="${escapeAttribute(next)}">
            <label for="adminCredential">Access Code
              <span class="field"><input id="adminCredential" type="text" required readonly autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text" data-mask="true" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other"><button class="toggle" type="button" data-toggle="adminCredential" aria-pressed="false">SHOW</button></span>
            </label>
            <p class="message${error ? " is-error" : ""}" id="ownerMessage" role="${error ? "alert" : "status"}">${error ? escapeHtml(error) : `Next: ${escapeHtml(next)}`}</p>
            <button class="go" type="submit">Enter Admin</button>
            <p class="privacy">Owner flow เดิมยังคงใช้ Access Code และออก Secure HttpOnly session เหมือนเดิม</p>
          </form>
        </section>

        <section class="panel partner-panel" data-panel="partner">
          <div class="panel-head"><div><strong>MMS Partner</strong><br><span>สำหรับ Partner ที่ดูแลงาน Male Massage เท่านั้น</span></div></div>
          <div class="scope partner"><span>Applications</span><span>Therapists</span><span>Matching</span><span>MMS only</span></div>
          <form id="partnerLoginForm" autocomplete="on">
            <input type="hidden" name="action" value="partner_login">
            <label for="partnerUsername">Username<span class="field"><input id="partnerUsername" name="username" required autocomplete="username" autocapitalize="none" spellcheck="false"></span></label>
            <label for="partnerPassword">Password<span class="field"><input id="partnerPassword" name="password" type="password" required minlength="12" maxlength="128" autocomplete="current-password"><button class="toggle" type="button" data-toggle="partnerPassword" aria-pressed="false">SHOW</button></span></label>
            <p class="message" id="partnerMessage" role="status">เข้าแล้วจะไปที่ MMS Partner Operations เท่านั้น</p>
            <button class="go" type="submit">Enter MMS Operations</button>
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
          <p class="privacy" style="margin-top:12px">Partner session ถูกจำกัดไว้ที่ /internal/admin/mms และ /v1/admin/mms* เท่านั้น</p>
        </section>
      </article>
      <aside class="visual" aria-label="MMD private administration environment">
        <img class="visual-logo" src="${APPROVED_ADMIN_LOGIN_LOGO}" alt="MMD SIGIL" width="112" height="112" fetchpriority="high">
        <div class="note"><b>Private access. Clear boundaries.</b><p>Owner ดูแลระบบหลัก ส่วน MMS Partner ดูแลงาน Male Massage ในขอบเขตของตัวเอง ไม่แชร์สิทธิ์ข้ามกัน</p></div>
      </aside>
    </section>
  </main>
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
