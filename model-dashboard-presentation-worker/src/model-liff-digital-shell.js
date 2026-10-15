export const MMD_APP_DIGITAL_CSS = `
@font-face{font-family:"MY MODEL Thai";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd598baf067153fd1cc_LINESeedSansTH_W_Rg.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"MY MODEL Thai";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd4dc8d84b48cc84959_LINESeedSansTH_W_Bd.woff2") format("woff2");font-weight:700;font-style:normal;font-display:swap}
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
.mmd-digital-action[hidden]{display:none}
.mmd-digital-detail{margin-top:11px;color:#74766b;font-size:9.5px;line-height:1.45;word-break:break-word;text-align:center}
@keyframes mmdPulse{from{transform:translateX(-20%);opacity:.65}to{transform:translateX(155%);opacity:1}}
@media(max-width:359px){.mmd-digital-shell{padding-left:15px;padding-right:15px}.mmd-digital-title{font-size:25px}}
@media(prefers-reduced-motion:reduce){.mmd-digital-meter>span{animation:none;width:62%}}
/* Compact mobile welcome: scoped so shared page typography cannot enlarge this shell. */
body .mmd-digital-app{width:min(100%,480px)}
body .mmd-digital-shell{padding:calc(24px + env(safe-area-inset-top)) 24px calc(36px + env(safe-area-inset-bottom))}
body .mmd-digital-top{align-items:flex-start;gap:16px}
body .mmd-digital-brand{font-size:14px;letter-spacing:.08em;font-weight:700}
body .mmd-digital-brand small{font-size:9px;line-height:1.5;letter-spacing:.1em;max-width:150px}
body .mmd-digital-pill{font-size:10px;font-weight:500;padding:7px 10px;max-width:46%;white-space:normal;text-align:center;background:transparent}
body .mmd-digital-kicker{margin:40px 0 12px;font-size:10px;font-weight:600;letter-spacing:.12em}
body .mmd-digital-title{font-size:26px;line-height:1.5;letter-spacing:0;font-weight:600;text-wrap:balance}
body .mmd-digital-sub{margin:16px 0 0;font-size:14px;line-height:1.85;color:#c0c0b5}
body .mmd-digital-card{margin-top:28px;border-radius:14px;background:rgba(255,255,255,.035);border-color:rgba(231,204,137,.18);box-shadow:none}
body .mmd-digital-row{display:block;padding:20px}
body .mmd-digital-orb{display:none}
body .mmd-digital-row strong{font-size:15px;font-weight:600;line-height:1.65}
body .mmd-digital-row p{margin:8px 0 0;font-size:13px;line-height:1.85;color:#c0c0b5}
body .mmd-digital-action{min-height:52px;margin-top:24px;padding:14px 20px;border-radius:12px;font-size:14px;font-weight:600;line-height:1.65;letter-spacing:0;text-align:center;text-wrap:balance}
body .mmd-digital-detail{display:block;margin-top:18px;font-size:12px;line-height:1.85;color:#aaa99c;text-align:left}
body .mmd-digital-detail a{color:var(--mmd-gold);text-underline-offset:3px}
body .mmd-digital-meter{height:2px}
body .mmd-digital-app:before{display:none}
@media(max-width:359px){body .mmd-digital-shell{padding-left:20px;padding-right:20px}body .mmd-digital-title{font-size:24px}}

body .mmd-welcome-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:0;margin:28px 0 0;list-style:none}
body .mmd-welcome-steps li{display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px 6px;border:1px solid rgba(231,204,137,.16);border-radius:12px;background:rgba(255,255,255,.025);color:var(--mmd-muted);font-size:12px;line-height:1.5}
body .mmd-welcome-steps svg{width:26px;height:26px;fill:none;stroke:var(--mmd-gold);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}

/* Applicant landing stays compact; allow scroll for short screens / enlarged text. */
body .mmd-applicant-compact .mmd-digital-shell{padding:calc(16px + env(safe-area-inset-top)) 20px calc(20px + env(safe-area-inset-bottom))}
body .mmd-applicant-compact .mmd-digital-brand small{display:none}
body .mmd-applicant-compact .mmd-digital-kicker{display:none}
body .mmd-applicant-compact .mmd-digital-title{font-size:24px;line-height:1.5;margin-top:18px}
body .mmd-applicant-compact .mmd-digital-sub{font-size:14px;line-height:1.7;margin-top:6px}
body .mmd-welcome-art{height:112px;position:relative;overflow:hidden;border-radius:16px;margin-top:20px;background:#23251e}
body .mmd-welcome-art img{width:100%;height:100%;object-fit:cover;object-position:center 40%;opacity:.72}
body .mmd-welcome-art:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(8,9,7,.7),transparent)}
body .mmd-welcome-art span{position:absolute;z-index:1;left:18px;bottom:16px;color:#fff5dc;font-size:12px;letter-spacing:.18em}
body .mmd-applicant-compact .mmd-welcome-steps{margin-top:18px;gap:8px}
body .mmd-applicant-compact .mmd-welcome-steps li{padding:10px 4px;gap:6px;font-size:11px}
body .mmd-applicant-compact .mmd-welcome-steps svg{width:22px;height:22px}
body .mmd-applicant-compact .mmd-digital-card{margin-top:16px}
body .mmd-applicant-compact .mmd-digital-row{padding:14px 16px}
body .mmd-applicant-compact .mmd-digital-row strong{font-size:14px}
body .mmd-applicant-compact .mmd-digital-row p{font-size:12px;line-height:1.6;margin-top:4px}
body .mmd-applicant-compact .mmd-digital-meter{display:none}
body .mmd-applicant-compact .mmd-digital-action{margin-top:16px;min-height:50px;background:linear-gradient(135deg,#edd69a,#c5a36b);box-shadow:0 6px 18px rgba(196,158,92,.16)}
body .mmd-applicant-compact .mmd-digital-detail{margin-top:12px;font-size:12px;line-height:1.6;text-align:center}
@media(max-height:620px){body .mmd-welcome-art{height:76px;margin-top:12px}body .mmd-applicant-compact .mmd-digital-title{margin-top:12px}}

/* Load a consistent Thai face; use real regular/bold weights and natural Thai spacing. */
body .mmd-digital-app{font-family:"MY MODEL Thai","LINE Seed Sans TH","Noto Sans Thai",system-ui,sans-serif;font-weight:400;letter-spacing:0}
body .mmd-digital-app button,body .mmd-digital-app input,body .mmd-digital-app select,body .mmd-digital-app textarea{font-family:inherit}
body .mmd-digital-brand,body .mmd-welcome-art span{font-family:system-ui,-apple-system,sans-serif}
body .mmd-digital-title,body .mmd-digital-row strong,body .mmd-digital-action{font-weight:700}
body .mmd-digital-pill{font-size:12px;line-height:1.5;letter-spacing:0;font-weight:400}
body .mmd-applicant-compact .mmd-digital-title{font-size:24px;line-height:1.45}
body .mmd-applicant-compact .mmd-digital-sub{font-size:15px;line-height:1.65}
body .mmd-applicant-compact .mmd-welcome-steps li{font-size:13px;line-height:1.5}
body .mmd-applicant-compact .mmd-digital-row strong{font-size:15px;line-height:1.6}
body .mmd-applicant-compact .mmd-digital-row p,body .mmd-applicant-compact .mmd-digital-detail{font-size:13px;line-height:1.65}
body .mmd-applicant-compact .mmd-digital-action{font-size:16px;line-height:1.5}

`;

export function modelLiffDigitalBootstrapHtml({
  liffId,
  fallback,
  sdk,
  returnTo = "",
  selectedSessionId = "",
  jobBoard = null,
  environment = "published",
  mode = "primary",
} = {}) {
  const safeId = JSON.stringify(String(liffId || ""));
  const safeFallback = JSON.stringify(String(fallback || ""));
  const safeSdk = JSON.stringify(String(sdk || ""));
  const safeReturnTo = JSON.stringify(String(returnTo || ""));
  const selectedSessionRaw = String(selectedSessionId || "").trim();
  const selectedSession = /^sess_[A-Za-z0-9._-]{8,180}$/.test(selectedSessionRaw) ? selectedSessionRaw : "";
  const safeSelectedSession = JSON.stringify(selectedSession);
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
  const directConfirmedJob = Boolean(returnTo || selectedSession);
  const publicJobApplicant = Boolean(safeJobBoard && !directAssignedModel);
  const selectedJobMode = directAssignedModel || directConfirmedJob;
  const jobBoardScript = safeJobBoard ? `
    var idToken=typeof window.liff.getIDToken==="function"?window.liff.getIDToken():"";
    if(!idToken)throw new Error("id_token_missing");
    status.textContent="กำลังเปิดรายละเอียดงาน…";
    var exchange=await fetch("/v1/model/liff/exchange",{method:"POST",credentials:"include",cache:"no-store",headers:{accept:"application/json","content-type":"application/json"},body:JSON.stringify({idToken:idToken,environment:${safeEnvironment},intent:"job_board",job_id:${JSON.stringify(safeJobBoard.job_id || "")}})});
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
  const selectedSessionScript = selectedSession ? `
    var idToken=typeof window.liff.getIDToken==="function"?window.liff.getIDToken():"";
    if(!idToken)throw new Error("id_token_missing");
    status.textContent="กำลังเปิดงานนี้…";
    for(var selectedAttempt=0;selectedAttempt<60;selectedAttempt+=1){
      var selected=await fetch("/v1/model/selected-job/handoff",{method:"POST",credentials:"include",cache:"no-store",headers:{accept:"application/json","content-type":"application/json"},body:JSON.stringify({session_id:${safeSelectedSession},idToken:idToken,environment:${safeEnvironment}})});
      var selectedBody=await selected.json().catch(function(){return null});
      if(selected.status===202&&selectedBody&&selectedBody.state==="owner_confirmation_required"){
        pill.textContent="รอพี่เปอร์";
        status.textContent=selectedBody.message||"ส่งให้พี่เปอร์แล้ว เดี๋ยวเปิดงานให้ครับ";
        detail.textContent="หน้านี้เปิดค้างไว้ได้ครับ พอยืนยันแล้วระบบจะพาเข้าไปที่งานนี้ให้เอง";
        await new Promise(function(resolve){setTimeout(resolve,5000)});
        continue;
      }
      if(!selected.ok||!selectedBody||selectedBody.ok!==true||!selectedBody.redirect_url)throw new Error(selectedBody&&selectedBody.error||"selected_job_handoff_failed");
      var destination=new URL(String(selectedBody.redirect_url),"https://mmdbkk.com");
      if(destination.origin!=="https://mmdbkk.com"||destination.pathname!=="/sigil/confirm/job-model"||!destination.searchParams.get("t"))throw new Error("selected_job_redirect_invalid");
      window.location.replace(destination.pathname+destination.search);return;
    }
    throw new Error("selected_job_owner_confirmation_timeout");` : "";
  const primary = mode === "primary";
  const jobBoardMode = Boolean(safeJobBoard);
  const ownerAlias = safeJobBoard && safeJobBoard.model_alias ? safeJobBoard.model_alias : "";
  const title = selectedJobMode
    ? "ลูกค้าเลือกคุณสำหรับงานนี้"
    : publicJobApplicant
      ? "ส่งข้อมูลส่วนตัว"
      : "เปิด MY MODEL";
  const copy = selectedJobMode
    ? (ownerAlias ? "งานนี้ส่งตรงถึง " + ownerAlias + " · เปิดรายละเอียดและตอบรับงานใน MY MODEL" : "งานนี้ส่งตรงถึงคุณ · เปิดรายละเอียดและตอบรับงานใน MY MODEL")
    : publicJobApplicant
      ? "รบกวนอัปโหลดรูปปัจจุบันที่ชัดเจน"
      : "กำลังเปิดพื้นที่ทำงานของคุณ";
  const success = selectedJobMode
    ? "กำลังเปิดรายละเอียดงานที่เลือกคุณไว้…"
    : publicJobApplicant
      ? "กำลังเปิดงานที่คุณสนใจ…"
      : "กำลังเปิด MY MODEL…";
  const fail = selectedJobMode
    ? "ยังเปิดงานที่เลือกคุณไว้ไม่สำเร็จ"
    : publicJobApplicant
      ? "ยังเปิดหน้าส่งข้อมูลไม่สำเร็จ"
      : "ยังเปิด MY MODEL ไม่สำเร็จ";
  const cta = selectedJobMode
    ? "เปิดรายละเอียดงานนี้"
    : publicJobApplicant
      ? "เริ่มส่งข้อมูล →"
      : "เปิด MY MODEL";
  const initialPill = selectedJobMode ? "MY MODEL · SELECTED JOB" : publicJobApplicant ? "เริ่มต้น" : "MY MODEL";
  const readyPill = selectedJobMode ? "SELECTED JOB · READY" : publicJobApplicant ? "พร้อมเริ่ม" : "MY MODEL · READY";
  const kicker = selectedJobMode ? "SELECTED JOB" : publicJobApplicant ? "ยินดีต้อนรับ" : "MY MODEL";
  const statusLead = selectedJobMode ? "กำลังเปิดงานของคุณ" : publicJobApplicant ? "ประกาศที่คุณเปิดมา" : "กำลังเปิดพื้นที่ทำงาน";
  const statusHelp = selectedJobMode
    ? "นี่คืองานที่ลูกค้าเลือกคุณแล้ว · ไม่ใช่หน้าสมัครงาน และไม่ต้องสมัครเป็นโมเดลใหม่"
    : publicJobApplicant
      ? "ต้องการแก้ไขหรือลบข้อมูล ติดต่อเปอร์"
      : "กำลังเตรียมงานและโปรไฟล์ของคุณ";
  const pageTitle = selectedJobMode ? "MY MODEL · งานที่เลือกคุณ" : publicJobApplicant ? "MY MODEL · พี่เปอร์ดูแลงานให้" : "MY MODEL";
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
</head>
<body>
<div class="mmd-digital-app ${publicJobApplicant ? "mmd-applicant-compact" : ""}" data-mmd-app-digital="v1">
  <main class="mmd-digital-shell">
    <header class="mmd-digital-top">
      <div class="mmd-digital-brand"><img class="mmd-brand-mark" src="https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6aa58901dd74f803af616444_05-tiny-mark-256px.webp" alt="MMD" width="24" height="24" decoding="async"><span>MY MODEL<small>DIGITAL MODEL WORKSPACE</small></span></div>
      <span class="mmd-digital-pill" id="session-pill">${initialPill}</span>
    </header>
    ${publicJobApplicant ? '<div class="mmd-welcome-art"><img src="https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6abe018f9cd0657b75e96242_Bangkok%2027-p-800.webp" alt="" width="500" height="281" decoding="async"/><span>MY MODEL</span></div>' : ""}
    <p class="mmd-digital-kicker">${kicker}</p>
    <h1 class="mmd-digital-title">${title}</h1>
    <p class="mmd-digital-sub">${copy}</p>
    ${publicJobApplicant ? '<ol class="mmd-welcome-steps" aria-label="ขั้นตอนเริ่มต้น"><li><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h3"/></svg><span>ส่งข้อมูล</span></li><li><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg><span>เปอร์ตรวจ</span></li><li><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M3 12h18M10 12v3h4v-3"/></svg><span>ดูงาน</span></li></ol>' : ''}
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
    ${publicJobApplicant ? '<small class="mmd-digital-detail">ต้องการสอบถามเป็นการส่วนตัว <a href="https://t.me/per_mmd" rel="noreferrer">ติดต่อเปอร์</a></small>' : ""}
    <small class="mmd-digital-detail" id="detail"></small>
  </main>
</div>
<script>
(async function(){
  var status=document.getElementById("status");
  var pill=document.getElementById("session-pill");
  var fallback=document.getElementById("fallback");
  var detail=document.getElementById("detail");
  function showFailure(code){
    pill.textContent=${JSON.stringify(selectedJobMode ? "SELECTED JOB · RETRY" : publicJobApplicant ? "ลองอีกครั้ง" : "MY MODEL · RETRY")};
    status.textContent=${JSON.stringify(fail)};
    fallback.hidden=false;
    detail.textContent=code;
  }
  function loadSdk(){
    if(window.liff&&typeof window.liff.init==="function")return Promise.resolve();
    return new Promise(function(resolve,reject){
      var script=document.createElement("script");
      var timer=setTimeout(function(){finish(new Error("line_sdk_timeout"));},12000);
      function finish(error){
        clearTimeout(timer);
        script.onload=script.onerror=null;
        if(error){script.remove();reject(error);}else{resolve();}
      }
      script.async=true;
      script.src=${safeSdk};
      script.onload=function(){finish(window.liff&&typeof window.liff.init==="function"?null:new Error("line_sdk_unavailable"));};
      script.onerror=function(){finish(new Error("line_sdk_unavailable"));};
      document.head.appendChild(script);
    });
  }
  async function initializeLine(){
    await loadSdk();
    var timer;
    try{
      await Promise.race([
        window.liff.init(${initOptions}),
        new Promise(function(_,reject){timer=setTimeout(function(){reject(new Error("line_init_timeout"));},12000);})
      ]);
    }finally{clearTimeout(timer);}
  }

  async function continueIntoApp(){
    try{
      fallback.hidden=true;
      await initializeLine();
      pill.textContent=${JSON.stringify(readyPill)};
      status.textContent=${JSON.stringify(success)};
      ${jobBoardScript}
      ${selectedSessionScript || returnScript}
      ${!jobBoardScript && !selectedSessionScript && !returnScript ? 'setTimeout(function(){showFailure("line_redirect_timeout");},12000);' : ""}
    }catch(error){
      // Never echo SDK errors: they can include credential-bearing URLs.
      var code=String(error&&error.message||"");
      showFailure(/^line_(sdk_timeout|sdk_unavailable|init_timeout)$/.test(code)?code:"line_connection_failed");
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
