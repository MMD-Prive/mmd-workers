export const MMD_APP_DIGITAL_CSS = `
:root{color-scheme:dark;--mmd-bg:#080907;--mmd-surface:#151712;--mmd-surface-2:#202019;--mmd-line:#404032;--mmd-gold:#e7cc89;--mmd-cream:#f6f1e3;--mmd-muted:#a7a899;--mmd-green:#b4d8b5;--mmd-danger:#e3a4a4}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:var(--mmd-bg);color:var(--mmd-cream);font-family:system-ui,-apple-system,"LINE Seed Sans TH","Noto Sans Thai",sans-serif}
body{min-height:100svh;background:radial-gradient(ellipse 90% 34% at 50% 6%,rgba(80,64,34,.42),transparent 78%),linear-gradient(155deg,#11120e,#080907 62%)}
button,input,select,textarea{font:inherit}
button,a{touch-action:manipulation}
button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--mmd-gold);outline-offset:3px}
.mmd-digital-app{position:relative;isolation:isolate;min-height:100svh;width:min(100%,520px);margin:0 auto;overflow:hidden}
.mmd-digital-app:before{content:"";position:absolute;z-index:-1;inset:0;opacity:.22;background:linear-gradient(90deg,transparent 49.8%,rgba(148,132,87,.16) 50%,transparent 50.2%),linear-gradient(rgba(148,132,87,.12) 1px,transparent 1px);background-size:100% 100%,100% 42px;mask-image:linear-gradient(#000,transparent 82%)}
.mmd-digital-shell{padding:calc(16px + env(safe-area-inset-top)) 18px calc(28px + env(safe-area-inset-bottom))}
.mmd-digital-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.mmd-digital-brand{min-width:0;font-size:12px;font-weight:850;letter-spacing:.18em;color:var(--mmd-cream)}
.mmd-digital-brand small{display:block;margin-top:3px;color:var(--mmd-gold);font-size:8.5px;letter-spacing:.2em}
.mmd-digital-pill{flex:none;border:1px solid rgba(231,204,137,.38);border-radius:999px;padding:7px 10px;background:#1a1a14;color:var(--mmd-gold);font-size:9.5px;font-weight:750;letter-spacing:.04em}
.mmd-digital-kicker{margin:22px 0 7px;color:var(--mmd-gold);font-size:10px;font-weight:800;letter-spacing:.16em}
.mmd-digital-title{margin:0;color:var(--mmd-cream);font-size:clamp(25px,7vw,32px);line-height:1.13;letter-spacing:-.04em}
.mmd-digital-sub{margin:7px 0 0;color:var(--mmd-muted);font-size:12px;line-height:1.55}
.mmd-digital-card{margin-top:16px;border:1px solid rgba(231,204,137,.28);border-radius:18px;background:linear-gradient(145deg,rgba(39,37,28,.96),rgba(21,23,17,.98) 82%);box-shadow:0 18px 50px rgba(0,0,0,.24);overflow:hidden}
.mmd-digital-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:center;padding:14px}
.mmd-digital-orb{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;border:1px solid rgba(231,204,137,.5);background:radial-gradient(circle at 34% 30%,#fff5cf,#e5bd6e 34%,#4d3618 70%);box-shadow:0 0 0 7px rgba(231,204,137,.05),0 0 28px rgba(223,185,102,.22)}
.mmd-digital-row strong{display:block;font-size:14px;line-height:1.35}
.mmd-digital-row p{margin:3px 0 0;color:var(--mmd-muted);font-size:11px;line-height:1.55}
.mmd-digital-meter{height:3px;background:#313126;overflow:hidden}
.mmd-digital-meter>span{display:block;height:100%;width:38%;background:linear-gradient(90deg,#9e8246,var(--mmd-gold));animation:mmdPulse 1.45s ease-in-out infinite alternate}
.mmd-digital-action{display:flex;align-items:center;justify-content:center;min-height:48px;margin-top:15px;border:1px solid #806b3d;border-radius:14px;background:#d8bb7f;color:#17130c;text-decoration:none;font-size:12px;font-weight:850;letter-spacing:.04em}
.mmd-digital-detail{margin-top:11px;color:#74766b;font-size:9.5px;line-height:1.45;word-break:break-word;text-align:center}
@keyframes mmdPulse{from{transform:translateX(-20%);opacity:.65}to{transform:translateX(155%);opacity:1}}
@media(max-width:359px){.mmd-digital-shell{padding-left:15px;padding-right:15px}.mmd-digital-title{font-size:25px}}
@media(prefers-reduced-motion:reduce){.mmd-digital-meter>span{animation:none;width:62%}}
`;

export function modelLiffDigitalBootstrapHtml({
  liffId,
  fallback,
  sdk,
  returnTo = "",
  jobBoard = null,
  environment = "published",
  mode = "primary",
} = {}) {
  const safeId = JSON.stringify(String(liffId || ""));
  const safeFallback = JSON.stringify(String(fallback || ""));
  const safeSdk = JSON.stringify(String(sdk || ""));
  const safeReturnTo = JSON.stringify(String(returnTo || ""));
  const safeEnvironment = JSON.stringify(String(environment || "published"));
  const safeJobBoard = jobBoard && typeof jobBoard === "object"
    ? {
        job_id: String(jobBoard.job_id || ""),
        next: String(jobBoard.next || ""),
        model_alias: String(jobBoard.model_alias || ""),
        model_record_id: String(jobBoard.model_record_id || ""),
      }
    : null;
  const jobBoardScript = safeJobBoard ? `
    var idToken=typeof window.liff.getIDToken==="function"?window.liff.getIDToken():"";
    if(!idToken)throw new Error("id_token_missing");
    status.textContent="ยืนยัน LINE แล้ว · กำลังเปิดงาน…";
    var exchange=await fetch("/v1/model/liff/exchange",{method:"POST",credentials:"include",cache:"no-store",headers:{accept:"application/json","content-type":"application/json"},body:JSON.stringify({idToken:idToken,environment:${safeEnvironment}})});
    var exchangeBody=await exchange.json().catch(function(){return null});
    if(!exchange.ok||!exchangeBody||exchangeBody.ok!==true)throw new Error(exchangeBody&&exchangeBody.error||"model_session_exchange_failed");
    var handoffParams=new URLSearchParams();
    ${safeJobBoard.job_id ? `handoffParams.set("job_id",${JSON.stringify(safeJobBoard.job_id)});` : ""}
    ${safeJobBoard.next ? `handoffParams.set("next",${JSON.stringify(safeJobBoard.next)});` : ""}
    ${safeJobBoard.model_alias ? `handoffParams.set("model_alias",${JSON.stringify(safeJobBoard.model_alias)});` : ""}
    ${safeJobBoard.model_record_id ? `handoffParams.set("model_record_id",${JSON.stringify(safeJobBoard.model_record_id)});` : ""}
    var handoff=await fetch("/v1/model/job-board/handoff?"+handoffParams.toString(),{method:"GET",credentials:"include",cache:"no-store",headers:{accept:"application/json"}});
    var handoffBody=await handoff.json().catch(function(){return null});
    if(!handoff.ok||!handoffBody||handoffBody.ok!==true||!handoffBody.redirect_url)throw new Error(handoffBody&&handoffBody.error||"job_board_handoff_failed");
    var destination=new URL(String(handoffBody.redirect_url));
    if(destination.origin!=="https://sigil.mmdbkk.com"||!destination.pathname.startsWith("/public/api/jobs"))throw new Error("job_board_redirect_invalid");
    window.location.replace(destination.toString());return;` : "";
  const returnScript = returnTo ? `
    var idToken=typeof window.liff.getIDToken==="function"?window.liff.getIDToken():"";
    if(!idToken)throw new Error("id_token_missing");
    status.textContent="ยืนยัน LINE แล้ว · กำลังเชื่อมตัวตนงาน…";
    var exchange=await fetch("/v1/model/liff/exchange",{method:"POST",credentials:"include",cache:"no-store",headers:{accept:"application/json","content-type":"application/json"},body:JSON.stringify({idToken:idToken,environment:${safeEnvironment}})});
    var exchangeBody=await exchange.json().catch(function(){return null});
    if(!exchange.ok||!exchangeBody||exchangeBody.ok!==true)throw new Error(exchangeBody&&exchangeBody.error||"model_session_exchange_failed");
    window.location.replace(${safeReturnTo});return;` : "";
  const primary = mode === "primary";
  const jobBoardMode = Boolean(safeJobBoard);
  const ownerAlias = safeJobBoard && safeJobBoard.model_alias ? safeJobBoard.model_alias : "";
  const title = jobBoardMode ? (ownerAlias ? "ยืนยันตัวตนสำหรับงาน " + ownerAlias : "กำลังเปิดงาน MMD") : (primary ? "ยืนยัน LINE สำหรับ MMD APP" : "เปิด MMD APP");
  const copy = jobBoardMode ? "ยืนยัน LINE ครั้งเดียว แล้วเปิดรายละเอียดงานนี้ต่อทันที" : (primary ? "กำลังสร้างเซสชันโมเดลที่ปลอดภัย" : "กำลังยืนยัน LINE และเตรียมพื้นที่ทำงาน");
  const success = jobBoardMode ? (ownerAlias ? "ยืนยัน LINE แล้ว · กำลังเปิดงาน " + ownerAlias + "…" : "ยืนยัน LINE แล้ว · กำลังเปิดงาน…") : (primary ? "ยืนยัน LINE แล้ว · กำลังเปิด MMD APP…" : "ยืนยัน LINE แล้ว · กำลังเปิดพื้นที่ทำงาน…");
  const fail = jobBoardMode ? "ยังเปิดงานผ่าน LINE ไม่สำเร็จ" : (primary ? "ยังเปิด MMD APP ผ่าน LINE ไม่สำเร็จ" : "ยังเปิด MMD APP ไม่สำเร็จ");
  const cta = jobBoardMode ? "เปิดงานผ่าน LINE อีกครั้ง" : (primary ? "เปิด MMD APP ผ่าน LINE" : "เปิดผ่าน LINE");
  const initOptions = primary ? `{liffId:${safeId}}` : `{liffId:${safeId},withLoginOnExternalBrowser:true}`;

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#080907">
<title>MMD APP · LINE</title>
<style>${MMD_APP_DIGITAL_CSS}</style>
<script src=${safeSdk}></script>
</head>
<body>
<div class="mmd-digital-app" data-mmd-app-digital="v1">
  <main class="mmd-digital-shell">
    <header class="mmd-digital-top">
      <div class="mmd-digital-brand">MMD APP<small>DIGITAL MODEL WORKSPACE</small></div>
      <span class="mmd-digital-pill" id="session-pill">LINE · CHECKING</span>
    </header>
    <p class="mmd-digital-kicker">SECURE ENTRY</p>
    <h1 class="mmd-digital-title">${title}</h1>
    <p class="mmd-digital-sub">${copy}</p>
    <section class="mmd-digital-card" aria-live="polite">
      <div class="mmd-digital-row">
        <span class="mmd-digital-orb" aria-hidden="true"></span>
        <div>
          <strong id="status">กำลังตรวจสอบตัวตน</strong>
          <p>ข้อมูลสิทธิ์ งาน และโปรไฟล์จะอ่านจากระบบ MMD หลังยืนยันตัวตนเท่านั้น</p>
        </div>
      </div>
      <div class="mmd-digital-meter" aria-hidden="true"><span></span></div>
    </section>
    <a class="mmd-digital-action" id="fallback" href=${safeFallback} hidden>${cta}</a>
    <small class="mmd-digital-detail" id="detail"></small>
  </main>
</div>
<script>
(async function(){
  var status=document.getElementById("status");
  var pill=document.getElementById("session-pill");
  var fallback=document.getElementById("fallback");
  var detail=document.getElementById("detail");
  try{
    if(!window.liff||typeof window.liff.init!=="function") throw new Error("line_sdk_unavailable");
    await window.liff.init(${initOptions});
    pill.textContent="LINE · VERIFIED";
    status.textContent=${JSON.stringify(success)};
    ${jobBoardScript}
    ${returnScript}
  }catch(error){
    pill.textContent="LINE · RETRY";
    status.textContent=${JSON.stringify(fail)};
    fallback.hidden=false;
    detail.textContent=String((error&&error.code)||"")+(error&&error.message?" · "+String(error.message):"");
  }
})();
</script>
</body>
</html>`;
}
