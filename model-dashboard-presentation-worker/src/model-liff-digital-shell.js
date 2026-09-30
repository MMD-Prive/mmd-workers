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
  const directAssignedModel = Boolean(safeJobBoard && safeJobBoard.model_record_id);
  const directConfirmedJob = Boolean(returnTo);
  const publicJobApplicant = Boolean(safeJobBoard && !directAssignedModel);
  const selectedJobMode = directAssignedModel || directConfirmedJob;
  const jobBoardScript = safeJobBoard ? `
    var idToken=typeof window.liff.getIDToken==="function"?window.liff.getIDToken():"";
    if(!idToken)throw new Error("id_token_missing");
    status.textContent="กำลังเปิดรายละเอียดงาน…";
    var exchange=await fetch("/v1/model/liff/exchange",{method:"POST",credentials:"include",cache:"no-store",headers:{accept:"application/json","content-type":"application/json"},body:JSON.stringify({idToken:idToken,environment:${safeEnvironment}})});
    var exchangeBody=await exchange.json().catch(function(){return null});
    if(!exchange.ok||!exchangeBody||exchangeBody.ok!==true){
      if(${JSON.stringify(publicJobApplicant)}&&exchange.status===202&&exchangeBody&&exchangeBody.state==="identity_review_required"){
        var intake=new URL("/apply/public-model","https://mmdbkk.com");
        intake.searchParams.set("source","job_board");
        ${safeJobBoard.job_id ? `intake.searchParams.set("job_id",${JSON.stringify(safeJobBoard.job_id)});` : ""}
        window.location.replace(intake.toString());return;
      }
      throw new Error(exchangeBody&&exchangeBody.error||"model_session_exchange_failed");
    }
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
    status.textContent="กำลังเปิดรายละเอียดงาน…";
    var exchange=await fetch("/v1/model/liff/exchange",{method:"POST",credentials:"include",cache:"no-store",headers:{accept:"application/json","content-type":"application/json"},body:JSON.stringify({idToken:idToken,environment:${safeEnvironment}})});
    var exchangeBody=await exchange.json().catch(function(){return null});
    if(!exchange.ok||!exchangeBody||exchangeBody.ok!==true)throw new Error(exchangeBody&&exchangeBody.error||"model_session_exchange_failed");
    window.location.replace(${safeReturnTo});return;` : "";
  const primary = mode === "primary";
  const jobBoardMode = Boolean(safeJobBoard);
  const ownerAlias = safeJobBoard && safeJobBoard.model_alias ? safeJobBoard.model_alias : "";
  const title = selectedJobMode
    ? "ลูกค้าเลือกคุณสำหรับงานนี้"
    : publicJobApplicant
      ? "ที่นี่พี่เปอร์ดูแลงานให้ครับ"
      : "เปิด MMD APP";
  const copy = selectedJobMode
    ? (ownerAlias ? "งานนี้ส่งตรงถึง " + ownerAlias + " · เปิดรายละเอียดและตอบรับงานใน MMD APP" : "งานนี้ส่งตรงถึงคุณ · เปิดรายละเอียดและตอบรับงานใน MMD APP")
    : publicJobApplicant
      ? "มีทั้งงาน Public และ Private ครับ ก่อนเริ่มพี่ขอข้อมูลกับรูปปัจจุบันไว้ดูคร่าว ๆ ก่อน ถ้าผ่านแล้วครั้งต่อไปเข้ามาดูงานได้เลย ไม่ต้องกรอกใหม่"
      : "กำลังเปิดพื้นที่ทำงานของคุณ";
  const success = selectedJobMode
    ? "กำลังเปิดรายละเอียดงานที่เลือกคุณไว้…"
    : publicJobApplicant
      ? "กำลังเปิดงานที่คุณสนใจ…"
      : "กำลังเปิด MMD APP…";
  const fail = selectedJobMode
    ? "ยังเปิดงานที่เลือกคุณไว้ไม่สำเร็จ"
    : publicJobApplicant
      ? "ยังเปิดหน้าส่งข้อมูลไม่สำเร็จ"
      : "ยังเปิด MMD APP ไม่สำเร็จ";
  const cta = selectedJobMode
    ? "เปิดรายละเอียดงานนี้"
    : publicJobApplicant
      ? "ส่งรูปและข้อมูลเพิ่มเติมให้พี่เปอร์ดูหน่อยน้า →"
      : "เปิด MMD APP";
  const initialPill = selectedJobMode ? "MMD APP · SELECTED JOB" : publicJobApplicant ? "พี่เปอร์ · WELCOME" : "MMD APP";
  const readyPill = selectedJobMode ? "SELECTED JOB · READY" : publicJobApplicant ? "พร้อมเริ่ม" : "MMD APP · READY";
  const kicker = selectedJobMode ? "SELECTED JOB" : publicJobApplicant ? "WELCOME" : "MMD APP";
  const statusLead = selectedJobMode ? "กำลังเปิดงานของคุณ" : publicJobApplicant ? "งานที่คุณกดมาถูกเก็บไว้แล้ว" : "กำลังเปิดพื้นที่ทำงาน";
  const statusHelp = selectedJobMode
    ? "นี่คืองานที่ลูกค้าเลือกคุณแล้ว · ไม่ใช่หน้าสมัครงาน และไม่ต้องสมัครเป็นโมเดลใหม่"
    : publicJobApplicant
      ? "ยังไม่สะดวกส่งรูปตอนนี้ก็ไม่เป็นไร ฝาก LINE หรือเบอร์โทรไว้ก่อนได้ เดี๋ยวพี่เปอร์คุยต่อให้เอง"
      : "กำลังเตรียมงานและโปรไฟล์ของคุณ";
  const pageTitle = selectedJobMode ? "MMD APP · งานที่เลือกคุณ" : publicJobApplicant ? "MMD APP · พี่เปอร์ดูแลงานให้" : "MMD APP";
  const initOptions = primary ? `{liffId:${safeId}}` : `{liffId:${safeId},withLoginOnExternalBrowser:true}`;

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#080907">
<title>${pageTitle}</title>
<style>${MMD_APP_DIGITAL_CSS}</style>
<script src=${safeSdk}></script>
</head>
<body>
<div class="mmd-digital-app" data-mmd-app-digital="v1">
  <main class="mmd-digital-shell">
    <header class="mmd-digital-top">
      <div class="mmd-digital-brand">MMD APP<small>DIGITAL MODEL WORKSPACE</small></div>
      <span class="mmd-digital-pill" id="session-pill">${initialPill}</span>
    </header>
    <p class="mmd-digital-kicker">${kicker}</p>
    <h1 class="mmd-digital-title">${title}</h1>
    <p class="mmd-digital-sub">${copy}</p>
    <section class="mmd-digital-card" aria-live="polite">
      <div class="mmd-digital-row">
        <span class="mmd-digital-orb" aria-hidden="true"></span>
        <div>
          <strong id="status">${statusLead}</strong>\n          <p>${statusHelp}</p>
        </div>
      </div>
      <div class="mmd-digital-meter" aria-hidden="true"><span></span></div>
    </section>
    <a class="mmd-digital-action" id="fallback" href=${safeFallback} ${publicJobApplicant ? "" : "hidden"}>${cta}</a>
    ${publicJobApplicant ? '<small class="mmd-digital-detail">สำหรับคนที่ต้องการความเป็นส่วนตัวเป็นพิเศษ / Confidential · ติดต่อพี่เปอร์โดยตรงที่ <a href="https://t.me/per_mmd" rel="noreferrer">t.me/per_mmd</a> · ไม่จำเป็นต้องส่งรายละเอียดหรือรูปผ่านหน้านี้ครับ</small>' : ""}
    <small class="mmd-digital-detail" id="detail"></small>
  </main>
</div>
<script>
(async function(){
  var status=document.getElementById("status");
  var pill=document.getElementById("session-pill");
  var fallback=document.getElementById("fallback");
  var detail=document.getElementById("detail");

  async function continueIntoApp(){
    try{
      fallback.hidden=true;
      if(!window.liff||typeof window.liff.init!=="function") throw new Error("line_sdk_unavailable");
      await window.liff.init(${initOptions});
      pill.textContent=${JSON.stringify(readyPill)};
      status.textContent=${JSON.stringify(success)};
      ${jobBoardScript}
      ${returnScript}
    }catch(error){
      pill.textContent=${JSON.stringify(selectedJobMode ? "SELECTED JOB · RETRY" : publicJobApplicant ? "ลองอีกครั้ง" : "MMD APP · RETRY")};
      status.textContent=${JSON.stringify(fail)};
      fallback.hidden=false;
      detail.textContent=String((error&&error.code)||"")+(error&&error.message?" · "+String(error.message):"");
    }
  }

  if(${JSON.stringify(publicJobApplicant)}){
    fallback.hidden=false;
    fallback.addEventListener("click",function(event){
      event.preventDefault();
      continueIntoApp();
    },{once:true});
    return;
  }
  await continueIntoApp();
})();
</script>
</body>
</html>`;
}
