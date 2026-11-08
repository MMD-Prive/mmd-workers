import { MMS_GRAPHICS_CSS, MMS_GRAPHICS_LOGO, mmsGraphicIcon } from "./mms-graphics-v2.mjs";
import { mmsGraphicRuntime } from "./mms-graphic-progress.mjs";
import { MMS_LOGO_SHA256, mmsLogoResponse } from "../../admin-worker/src/mms-internal-logo-asset.mjs";

const PREFIX = "/male-massage/therapists";
const PAGES = new Set([`${PREFIX}/login`, `${PREFIX}/me`, `${PREFIX}/app`]);
export const THERAPIST_AI_LOGO_PATH = `${PREFIX}/assets/male-massage-ai.${MMS_LOGO_SHA256.slice(0, 12)}.png`;

export async function maybeHandleTherapistWorkspace(request, env = {}) {
  // A single behavior contract remains in mms-worker when presentation changes.
  if (env.MMS_THERAPIST_UI_SOURCE !== "native") return null;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  if (path === THERAPIST_AI_LOGO_PATH) {
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
    const asset = mmsLogoResponse(request.method);
    const headers = new Headers(asset.headers);
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("x-mmd-route-owner", "member-dashboard-chat-worker");
    return new Response(asset.body, { status: 200, headers });
  }
  // LINE first opens the registered LIFF endpoint, sometimes without query parameters.
  const liffEndpoint = path === PREFIX;
  if (!PAGES.has(path) && !liffEndpoint && path !== `${PREFIX}/app/chat`) return null;
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  const login = liffEndpoint || path === `${PREFIX}/login`;
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store",
    "x-mmd-route-owner": "member-dashboard-chat-worker", "x-mmd-ui-source": "mms-native-workspace-v1",
    "x-mmd-behavior-owner": "mms-worker", "x-robots-tag": "noindex, nofollow, noarchive",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
    "content-security-policy": `default-src 'none'; script-src 'unsafe-inline' https://static.line-scdn.net; style-src 'unsafe-inline'; ${login ? "font-src data: https://cdn.prod.website-files.com; img-src 'self' data: https://cdn.prod.website-files.com;" : "font-src data:; img-src 'self' data:;"} connect-src 'self' https://*.line.me https://*.line-scdn.net; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  });
  let status = 200;
  if (path === `${PREFIX}/app` || path === `${PREFIX}/app/chat`) {
    if (!env.MMS_WORKER?.fetch) status = 503;
    else {
      try {
        const url = new URL(request.url); url.pathname = `${PREFIX}/api/app/access`; url.search = "";
        const gate = await env.MMS_WORKER.fetch(new Request(url, { headers: { cookie: request.headers.get("cookie") || "", accept: "application/json" } }));
        if (gate.status === 401) { headers.set("location", new URL(`${PREFIX}/login`, request.url).href); return new Response(null, { status: 302, headers }); }
        const body = await gate.json().catch(() => null);
        status = gate.status === 403 || (gate.ok && body?.data?.can_open === false) ? 403 : gate.ok && body?.ok === true && body?.data?.access === "approved" && body?.data?.can_open === true ? 200 : 503;
      } catch (_) { status = 503; }
    }
  }
  return new Response(request.method === "HEAD" ? null : path === `${PREFIX}/app/chat` ? (await import('./mms-direct-chat-page.mjs')).renderMmsDirectChatPage('therapist') : renderTherapistWorkspace(login), { status, headers });
}

export function renderTherapistWorkspace(login = false) {
  // Wrangler may retain __name calls inside therapistClient.toString(); the inline script needs its own helper.
  const loginStyles = login ? `
  @font-face{font-family:"LINE Seed Sans TH";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd598baf067153fd1cc_LINESeedSansTH_W_Rg.woff2") format("woff2");font-weight:400;font-display:swap}
  @font-face{font-family:"LINE Seed Sans TH";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd4dc8d84b48cc84959_LINESeedSansTH_W_Bd.woff2") format("woff2");font-weight:700;font-display:swap}
  @font-face{font-family:"LINE Seed Sans TH";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a619dd5cdf166a1e9e45b98_LINESeedSansTH_W_XBd.woff2") format("woff2");font-weight:800;font-display:swap}
  body.auth-page{background:#071a13;color:#f4f8ee;font-family:"LINE Seed Sans TH","Noto Sans Thai",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
  .auth-shell{position:relative;isolation:isolate;display:flex;flex-direction:column;max-width:none;min-height:100vh;min-height:100svh;overflow:hidden;padding:max(22px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) max(22px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));background:radial-gradient(ellipse 55% 45% at 97% 8%,rgba(169,240,116,.22),transparent 72%),radial-gradient(ellipse 42% 51% at 71% 86%,rgba(44,180,150,.18),transparent 75%),radial-gradient(ellipse 68% 60% at -13% 67%,rgba(27,91,74,.35),transparent 73%),linear-gradient(145deg,#071b19,#061c17 55%,#071510)}
  .auth-shell:before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.48;background-image:linear-gradient(rgba(162,241,208,.065) 1px,transparent 1px),linear-gradient(90deg,rgba(162,241,208,.065) 1px,transparent 1px),radial-gradient(circle,rgba(197,248,165,.45) 1px,transparent 2px);background-size:54px 54px,54px 54px,216px 216px;background-position:center center,center center,26px 26px;mask-image:linear-gradient(125deg,transparent 2%,#000 42%,transparent 94%)}
  .auth-shell:after{content:"";position:absolute;z-index:0;pointer-events:none;width:720px;height:720px;border:1px solid rgba(193,249,180,.22);border-radius:50%;right:-370px;top:-195px;transform:rotate(-18deg) scaleY(.72);box-shadow:0 0 0 79px rgba(77,183,157,.065),0 0 0 160px rgba(187,244,159,.025),inset 0 0 56px rgba(80,224,168,.08);background:conic-gradient(from 250deg,transparent 0 58%,rgba(198,247,137,.08) 69%,transparent 80%)}
  .auth-shell>*{position:relative;z-index:1}.auth-header,.auth-content,.auth-footer{width:min(1120px,100%);margin-inline:auto}
  .auth-header{min-height:56px}.auth-brand{display:inline-flex;align-items:center;min-height:48px}.auth-brand img{display:block;width:132px;height:auto;max-height:42px;object-fit:contain}.auth-ai-logo{display:inline-flex;align-items:center;justify-content:flex-end;flex:none;width:128px;min-height:48px}.auth-ai-logo img{display:block;width:128px;height:auto;max-height:52px;object-fit:contain;filter:drop-shadow(0 0 16px rgba(197,231,101,.16))}
  .auth-content{display:grid;gap:28px;align-content:center;flex:1;padding:42px 0 28px}.auth-eyebrow{display:flex;align-items:center;gap:10px;margin:0 0 20px;color:#c7e765;font-size:11px;font-weight:800;letter-spacing:.14em}.auth-eyebrow:before{content:"";width:22px;height:1px;background:#c7e765}
  .auth-hero h1{margin:0;color:#f8f9ef;font-size:clamp(39px,11vw,64px);font-weight:800;line-height:1.13;letter-spacing:-.045em;text-wrap:balance}.auth-hero h1 em{font-style:normal;color:#c7e765}.auth-lead{max-width:500px;margin:19px 0 0;color:#d4e1d5;font-size:16px;line-height:1.7}.auth-features{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 0}.auth-features span{padding:8px 12px;border:1px solid rgba(221,244,207,.17);border-radius:999px;background:rgba(239,255,228,.055);color:#eaf2e6;font-size:12px;font-weight:700}
  .auth-card{padding:25px;border:1px solid rgba(255,255,255,.52);border-radius:24px;background:#f9faf5;color:#10291b;box-shadow:0 28px 80px rgba(0,0,0,.19)}.auth-card-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.auth-step{color:#4f6e57;font-size:11px;font-weight:800;letter-spacing:.12em}.auth-lock{display:inline-flex;align-items:center;gap:6px;color:#356547;font-size:11px;font-weight:700}.auth-lock:before{content:"";width:7px;height:7px;border-radius:50%;background:#88aa61;box-shadow:0 0 0 4px #e3efda}
  .auth-card h2{margin:0;font-size:26px;font-weight:800;line-height:1.25;letter-spacing:-.035em}.auth-card-copy{margin:10px 0 20px;color:#4b6252;font-size:14px;line-height:1.7}.auth-primary{display:flex;width:100%;min-height:56px;justify-content:space-between;gap:14px;padding:12px 18px;border-radius:14px;background:#c7e765;color:#142611;font-weight:800;box-shadow:0 8px 20px rgba(56,102,32,.15);transition:transform .35s cubic-bezier(.22,1,.36,1),background .25s ease,box-shadow .35s ease}.auth-primary:hover{background:#d5ef8a;transform:translateY(-2px);box-shadow:0 12px 26px rgba(56,102,32,.2)}.auth-primary:disabled{opacity:1;background:#dce7c9;color:#38503d;cursor:wait;box-shadow:none;transform:none}.auth-primary span:last-child{font-size:21px;line-height:1}
  .auth-card #notice{min-height:0;margin:15px 0 0;padding:11px 12px;border-radius:10px;background:#edf3e9;color:#355b40;font-size:12px;line-height:1.55}.auth-card #notice.error{background:#271612;color:#ffe0d2;border:1px solid #936150}.auth-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-top:13px}.auth-actions a{color:#245c39;font-size:12px;font-weight:800;text-underline-offset:3px}.auth-actions #retry{min-height:38px;padding:7px 11px;font-size:12px}.auth-help{margin:22px 0 0;padding-top:17px;border-top:1px solid #dfe7da;color:#526757;font-size:12px;line-height:1.6}
  .auth-footer{padding-top:18px;border-top:1px solid rgba(231,245,222,.13);color:#a8bca9;font-size:11px;letter-spacing:.03em}.auth-footer span{color:#d8e5d6}
  .auth-shell button:focus-visible,.auth-shell a:focus-visible{outline:3px solid #c7e765;outline-offset:4px}
  @media(max-width:819px){.auth-content{gap:19px;padding:25px 0 19px}.auth-eyebrow{margin-bottom:12px}.auth-lead{margin-top:12px;font-size:14px;line-height:1.6}.auth-features{margin-top:16px}.auth-card{padding:20px}.auth-card-top{margin-bottom:11px}.auth-card-copy{margin:8px 0 16px}.auth-primary{min-height:52px}.auth-card #notice{margin-top:12px;padding:9px 11px}.auth-actions{margin-top:10px}.auth-help{margin-top:16px;padding-top:12px}}
  @media(min-width:820px){.auth-shell{padding:30px 42px 24px}.auth-content{grid-template-columns:minmax(0,1fr) minmax(360px,430px);align-items:center;gap:clamp(40px,8vw,110px);padding:45px 0}.auth-hero h1{font-size:clamp(50px,5.7vw,76px)}.auth-card{padding:32px}.auth-features{margin-top:29px}}
  @media(max-width:380px){.auth-shell{padding-inline:16px}.auth-brand img{width:116px}.auth-ai-logo,.auth-ai-logo img{width:105px}.auth-content{padding-top:30px}.auth-card{padding:20px}.auth-hero h1{font-size:38px}}
  @media(prefers-reduced-motion:reduce){.auth-primary{transition:none}.auth-primary:hover{transform:none}}
  ` : "";
  const loginHeader = login ? `<header class="auth-header"><a class="auth-brand" href="/male-massage/home" aria-label="MMS Male Massage"><img src="${MMS_GRAPHICS_LOGO}" width="132" height="42" alt="MMS Male Massage"></a><span class="auth-ai-logo"><img src="${THERAPIST_AI_LOGO_PATH}" width="128" height="52" alt="Male Massage AI"></span></header><div class="auth-content"><section class="auth-hero" aria-labelledby="auth-title"><p class="auth-eyebrow">MY THERAPIST · MMS</p><h1 id="auth-title">งานใกล้คุณ<br><em>เริ่มเมื่อคุณพร้อม</em></h1><p class="auth-lead">Online เมื่อพร้อม Offline เมื่ออยากพัก ดูงานที่ตรงกับเขตของคุณได้ในที่เดียวครับ</p><div class="auth-features" aria-label="สิ่งที่ทำได้"><span>Online / Offline</span><span>เลือกเขตบริการ</span><span>ดูงานใกล้คุณ</span></div></section>` : `<header class="mms-work-header"><div><img class="mms-brand" src="${MMS_GRAPHICS_LOGO}" alt="MMS Male Massage" width="108" height="32"><h1>MY THERAPIST</h1><p class="muted">พร้อมเมื่อคุณเปิดรับงาน · เขตบริการที่คุณเลือก</p></div>${mmsGraphicIcon('area-outline')}</header><p id="notice" role="status" aria-live="polite">กำลังตรวจสอบบัญชีครับ</p><button id="retry" class="alt" type="button">ลองตรวจอีกครั้ง</button>`;
  const loginEntry = login ? `<section id="entry" class="auth-card" aria-labelledby="auth-card-title"><div class="auth-card-top"><span class="auth-step">01 / เข้า MY THERAPIST</span><span class="auth-lock">เฉพาะบัญชีที่เชื่อมแล้ว</span></div><h2 id="auth-card-title">ยืนยันผ่าน LINE</h2><p class="auth-card-copy">ใช้ LINE ที่เชื่อมกับโปรไฟล์ MMS ของคุณ เพื่อเข้าพื้นที่ทำงานครับ</p><button id="line-login" class="auth-primary" type="button"><span>ยืนยันผ่าน LINE</span><span aria-hidden="true">↗</span></button><p id="notice" role="status" aria-live="polite">กำลังเชื่อมต่อ LINE ครับ</p><div class="auth-actions"><button id="retry" class="alt" type="button" hidden>ลองอีกครั้ง</button><a href="https://liff.line.me/2011425652-YqK1F6y8">เปิดใน LINE Mini App ↗</a></div><p class="auth-help">ยังไม่ได้เชื่อมบัญชี? ใช้ลิงก์เปิดสิทธิ์ที่ได้รับก่อนครับ</p></section></div><footer class="auth-footer"><span>MMS · MALE MASSAGE</span> / พื้นที่สำหรับ Therapist ที่ได้รับสิทธิ์</footer>` : `<section id="entry" class="card" hidden><h2>เข้าพื้นที่ Therapist</h2><p>ใช้ LINE ที่เชื่อมกับโปรไฟล์ MMS ของคุณครับ</p><button id="line-login" type="button">ยืนยันผ่าน LINE</button><p><a href="https://liff.line.me/2011425652-YqK1F6y8">เปิดใน LINE Mini App ↗</a></p><p class="muted">หากยังไม่ได้เชื่อมบัญชี ให้ใช้ลิงก์เปิดสิทธิ์จากพี่เปอร์</p></section>`;
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>MY THERAPIST · MMS</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f4f5ef;color:#20392b;font:16px/1.6 system-ui,-apple-system,sans-serif}main{max-width:760px;margin:auto;padding:20px 18px calc(28px + env(safe-area-inset-bottom))}header{display:flex;align-items:center;justify-content:space-between;gap:16px}h1{font-size:25px;margin:6px 0}h2{font-size:20px;margin:0 0 12px}h3{font-size:17px;margin:0}p{margin:8px 0}.muted{color:#5c6d60;font-size:14px}.card{background:#fff;border:1px solid #dce2d6;border-radius:18px;padding:18px;margin:14px 0}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}button,.button{border:0;border-radius:12px;min-height:48px;padding:10px 16px;font:inherit;cursor:pointer;background:#24563c;color:#fff;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}button.alt,.button.alt{background:#e9eee4;color:#24563c}button:disabled{opacity:.5;cursor:wait}input,textarea,select{width:100%;font:inherit;border:1px solid #c8d3c4;border-radius:10px;padding:10px;margin:4px 0 12px;background:white;color:#20392b}label{display:block;font-size:14px}nav{display:flex;gap:8px;margin:20px 0;overflow:auto}nav button{white-space:nowrap;background:#e9eee4;color:#24563c}nav button[aria-selected=true]{background:#24563c;color:white}#notice{min-height:26px}#notice.error{color:#8f2f20}.badge{font-size:13px;padding:4px 10px;border-radius:30px;background:#e9eee4}a{color:#24563c}img{width:100px;height:120px;object-fit:cover;border-radius:10px}section[hidden],[hidden]{display:none!important}.course{border-top:1px solid #ddd;padding-top:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}#detail{white-space:normal}.address{white-space:pre-line}#coverage-zones{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 14px}.zone-choice{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #dce2d6;border-radius:10px;background:#fbfcf9}.zone-choice input{width:20px;height:20px;margin:0;flex:none}.area-note{padding:12px;border-radius:12px;background:#f1f5eb}@media(max-width:480px){#coverage-zones{grid-template-columns:1fr}}button:focus-visible,a:focus-visible{outline:3px solid #ad8544;outline-offset:3px}@media(max-width:480px){main{padding:16px 14px 28px}.grid{grid-template-columns:1fr}}
  ${loginStyles}
  .profile-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.profile-eyebrow{color:#3c6048;font-size:12px;letter-spacing:.12em;margin:0;font-weight:700}.profile-heading h2{margin:3px 0}.profile-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;overflow:visible;margin:16px 0}.profile-nav button{min-width:0;white-space:normal;padding:10px 5px;font-size:15px;line-height:1.4;min-height:54px}.course-shortcut{display:flex;width:100%;justify-content:space-between;margin-top:16px;background:linear-gradient(110deg,#173f2b,#2c6849);font-weight:700}fieldset{border:0;min-width:0;margin:0;padding:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.profile-save{margin-top:24px;padding-top:18px;border-top:1px solid #dce2d6}.profile-save>button{width:100%;font-weight:700}.photo-section{border-top:1px solid #dce2d6;margin-top:24px;padding-top:18px}.course{padding:16px 0;margin-top:12px}.course-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.course-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.zone-conflict{margin-top:14px;padding:14px;border:1px solid #a15132;border-radius:12px;background:#fff7ed;color:#763d27}#zone-editor{margin-top:16px}#zone-summary{font-size:17px;font-weight:700;margin:0 0 12px}#profile-state[data-state="error"]{padding:12px;border-radius:12px;background:#fff0eb;color:#87381e}#courses-state{color:#354d3d}.zone-choice{min-height:48px;font-size:15px}.zone-choice span{min-width:0;overflow-wrap:anywhere}.zone-choice input{accent-color:#24563c}#photos label{display:flex;flex-direction:column;align-items:flex-start;gap:6px;max-width:150px}#photos input{width:24px;height:24px;margin:0}.course-head button{min-height:44px;font-size:14px}#profile-form{scroll-margin-top:16px}#profile-fields:disabled{opacity:.7}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #9c7636;outline-offset:3px}@media(max-width:380px){.profile-nav button{font-size:14px}.course-fields{grid-template-columns:1fr}.profile-heading button{font-size:14px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation:none!important;transition:none!important}}
${MMS_GRAPHICS_CSS}</style></head><body data-mms-graphics="therapist-v2" class="${login ? "auth-page" : ""}"><main class="${login ? "auth-shell" : ""}" data-mms-shell="native-workspace-v1" data-login="${login}">${loginHeader}${loginEntry}<div id="graphic-progress" hidden></div>
  <div id="workspace" hidden><section class="card">${mmsGraphicIcon("online")}<h2 id="greeting"></h2><p id="readiness"></p><label>สถานะรับงาน<select id="availability"><option value="Available">Online · รับงานที่ตรงพื้นที่</option><option value="Unavailable">Offline · งดรับงาน</option><option value="Paused">พักรับงานชั่วคราว</option></select></label><p class="muted">เมื่อ Online คุณจะเห็นงานที่ตรงกับเขตบริการและคอร์สที่ยืนยันแล้ว เลือกดูรายละเอียดก่อนตอบรับได้ครับ</p><button id="save-availability">บันทึกสถานะ</button><button class="alt" id="refresh">รีเฟรช</button><button id="open-courses" class="course-shortcut" type="button">คอร์สและราคา <span aria-hidden="true">↗</span></button></section>
  <nav aria-label="พื้นที่ทำงาน"><button data-tab="offers" aria-selected="true">${mmsGraphicIcon("offers")}งานเสนอให้คุณ</button><button data-tab="jobs" aria-selected="false">${mmsGraphicIcon("booking")}งานของฉัน</button><button data-tab="profile" aria-selected="false">${mmsGraphicIcon("profile")}โปรไฟล์และคอร์ส</button><a class="button alt" href="/male-massage/therapists/app/chat">แชตกับลูกค้า</a></nav>
  <section id="offers"><div id="offer-list"></div></section><section id="jobs" hidden><div id="job-list"></div></section>
  <section id="profile" hidden aria-label="จัดการโปรไฟล์"><div class="profile-heading"><div><p class="profile-eyebrow">YOUR PROFILE</p><h2>จัดการโปรไฟล์</h2></div><button id="profile-retry" class="alt" type="button">ตรวจข้อมูลอีกครั้ง</button></div><p id="profile-state" role="status" aria-live="polite">กำลังตรวจข้อมูลโปรไฟล์ครับ</p>
  <nav class="profile-nav" role="tablist" aria-label="ส่วนของโปรไฟล์"><button type="button" role="tab" id="profile-tab-info" data-profile-section="info" aria-selected="true" aria-controls="profile-info">ข้อมูลและรูป</button><button type="button" role="tab" id="profile-tab-courses" data-profile-section="courses" aria-selected="false" aria-controls="profile-courses">คอร์สและราคา</button><button type="button" role="tab" id="profile-tab-zones" data-profile-section="zones" aria-selected="false" aria-controls="profile-zones">เขตบริการ</button></nav>
  <form id="profile-form" class="card" hidden novalidate><fieldset id="profile-fields"><legend class="sr-only">ข้อมูลโปรไฟล์ Therapist</legend>
  <section id="profile-info" role="tabpanel" aria-labelledby="profile-tab-info"><h3>ข้อมูลและรูป</h3><label>ชื่อที่แสดง<input id="display-name" required maxlength="120" autocomplete="nickname"></label><label>แนะนำตัว<textarea id="intro" maxlength="600" rows="3"></textarea></label><label>การแสดงโปรไฟล์<select id="visibility"><option value="hidden">เก็บไว้ส่วนตัว</option><option value="public">แสดงโปรไฟล์</option></select></label><div class="photo-section"><h3>รูปโปรไฟล์</h3><p class="muted">เลือกแสดงได้ไม่เกิน 6 รูป เก็บได้ไม่เกิน 12 รูป</p><div id="photos" class="row"></div><label>เพิ่มรูป JPEG / PNG / WebP ไม่เกิน 10 MB<input id="upload" type="file" accept="image/jpeg,image/png,image/webp"></label><button id="retry-upload" class="alt" type="button">ลองเพิ่มรูปที่เลือกอีกครั้ง</button><button id="save-photos" class="alt" type="button">บันทึกรูปที่แสดง</button></div></section>
  <section id="profile-courses" role="tabpanel" aria-labelledby="profile-tab-courses" hidden><h3>คอร์สและราคา</h3><div class="area-note"><p id="verified-services"></p><p class="muted">บริการที่ยืนยันแล้วคือสิทธิ์รับงานจาก MMS ส่วนคอร์สด้านล่างคือชื่อ ระยะเวลา และราคาที่แสดงในโปรไฟล์ การเพิ่มคอร์สไม่เพิ่มบริการที่ยืนยันหรือเปิดรับงานเองครับ</p></div><p class="muted">ราคาคอร์สยังไม่รวมค่าเดินทาง มัดจำและยอดงานจริงต้องได้รับการยืนยันอีกครั้ง</p><p id="courses-state" role="status"></p><div id="courses"></div><button type="button" class="alt" id="add-course">＋ เพิ่มคอร์ส</button></section>
  <section id="profile-zones" role="tabpanel" aria-labelledby="profile-tab-zones" hidden><h3>เขตบริการ</h3><div class="area-note"><p id="zone-summary"></p><p class="muted">เลือกเขตบริการจากรายการ ไม่ต้องระบุที่อยู่บ้านหรือเปิด GPS ครับ</p><button id="zone-toggle" type="button" class="alt" aria-expanded="false" aria-controls="zone-editor">เลือกหรือแก้ไขเขต</button></div><div id="zone-conflict" class="zone-conflict" role="alert" hidden><p id="zone-conflict-copy"></p><label class="zone-choice"><input id="zone-conflict-confirm" type="checkbox"><span>ฉันตรวจเขตที่เลือกแล้ว และยืนยันใช้รายการนี้แทนเขตเดิมที่มีปัญหา</span></label></div><div id="zone-editor" hidden><label>เขตหลัก<select id="base-zone"><option value="">ยังไม่เลือกเขตหลัก</option></select></label><label>ค้นหาเขตบริการ<input id="zone-search" type="search" placeholder="พิมพ์ชื่อเขตหรือจังหวัด" maxlength="120"></label><div id="coverage-zones" aria-label="เขตที่รับงานได้"></div><p id="zone-search-state" class="muted" role="status"></p></div><p id="zone-status" class="muted" role="status">กำลังตรวจเขตบริการครับ</p><button id="zone-retry" type="button" class="alt" hidden>ตรวจข้อมูลเขตอีกครั้ง</button></section>
  <div class="profile-save"><button type="submit" id="profile-submit">บันทึกโปรไฟล์</button><p class="muted">บันทึกข้อมูลโปรไฟล์ ไม่เปลี่ยนสถานะรับงานหรือการจับคู่งานครับ</p></div></fieldset></form></section>
  <section id="detail" class="card" hidden></section><div class="row"><button id="logout" class="alt">ออกจากบัญชี</button></div></div></main>
  ${login ? '<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>' : ''}<script>const __name = (target, value) => Object.defineProperty(target, "name", { value, configurable: true });(${mmsGraphicRuntime.toString()})();(${therapistClient.toString()})();</script></body></html>`;
}

export function therapistClient() {
  const P = "/male-massage/therapists";
  const A = P + "/api/app";
  const $ = (id) => document.getElementById(id);
  let access = null, profile = null, tab = "offers", refreshing = false, profileSaving = false, profileSection = "info";
  let pendingUpload = null;
  const profileOperations = new Map();
  const actionKeys = new Map();
  const controllers = new Set(); let accountEpoch = 0;
  function clearPrivate() {
    for(const id of ['greeting','readiness']) $(id).textContent='';
    $('availability').value='Unavailable'; $('base-zone').replaceChildren();
    if($('profile-submit'))$('profile-submit').disabled=true;
    accountEpoch += 1; window.MmsGraphics?.cancel(); for (const controller of controllers) controller.abort();
    for (const id of ["offer-list", "job-list", "detail", "courses", "photos", "coverage-zones"]) $(id).replaceChildren();
    for (const id of ["display-name", "intro", "upload"]) $(id).value = "";
    $("detail").hidden = true; $("workspace").hidden = true; profile = null; access = null; pendingUpload = null; actionKeys.clear(); profileOperations.clear();
    $("base-zone").value = ""; $("base-zone").dataset.ready = "false"; $("visibility").value = "hidden";
    for (const id of ["zone-summary", "zone-status", "courses-state", "verified-services", "profile-state"]) if ($(id)) $(id).textContent = "";
    if ($("zone-search")) $("zone-search").value = ""; if ($("zone-conflict-confirm")) $("zone-conflict-confirm").checked = false;
    if ($("zone-conflict")) $("zone-conflict").hidden = true; if ($("zone-editor")) $("zone-editor").hidden = true;
    if ($("profile-form")) $("profile-form").hidden = true; if ($("profile-fields")) $("profile-fields").disabled = false;
    profileSection = "info"; showProfileSection("info");
  }
  const messages = {
    LIFF_INIT_FAILED: "LINE Mini App ยังยืนยันตัวตนไม่ได้ครับ ลองเปิด Mini App ใหม่อีกครั้ง",
    LINE_VERIFY_UNAVAILABLE: "ระบบตรวจบัญชี LINE ยังไม่พร้อมครับ กรุณาลองอีกครั้ง โดยไม่ต้องผูกบัญชีใหม่",
    THERAPIST_AUTH_UNAVAILABLE: "ระบบบัญชี Therapist ยังไม่พร้อมครับ กรุณาลองอีกครั้ง",
    THERAPIST_AUTH_NOT_CONFIGURED: "ระบบยืนยันบัญชียังตั้งค่าไม่ครบครับ ติดต่อพี่เปอร์เพื่อตรวจระบบ",
    THERAPIST_AUTH_NOT_ENABLED: "ระบบยืนยันบัญชี Therapist ยังไม่เปิดใช้งานครับ",
    THERAPIST_IDENTITY_CONFLICT: "ยังยืนยันเจ้าของบัญชีไม่ได้ครับ ติดต่อพี่เปอร์เพื่อตรวจบัญชี",
    AUTH_REQUEST_TIMEOUT: "การยืนยันบัญชีใช้เวลานานเกินไปครับ กดลองอีกครั้ง",
    AUTH_NETWORK_UNAVAILABLE: "เชื่อมต่อระบบยืนยันบัญชีไม่ได้ครับ ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง",
    AUTH_INVALID_RESPONSE: "ระบบยืนยันบัญชีตอบข้อมูลไม่ครบครับ กรุณาลองอีกครั้ง",
    PROFILE_ACCOUNT_CHANGED: "บัญชีเปลี่ยนแล้ว กรุณายืนยันบัญชีและโหลดโปรไฟล์ใหม่ก่อนบันทึกครับ",
    PROFILE_VERSION_CONFLICT: "ข้อมูลถูกเปลี่ยนจากอีกหน้าต่าง กรุณาโหลดข้อมูลล่าสุดก่อนแก้ไขอีกครั้งครับ",
    PROFILE_PARTIALLY_SAVED: "ข้อมูลบางส่วนบันทึกแล้ว แต่ยังบันทึกไม่ครบ กรุณารีเฟรชตรวจผลก่อนลองใหม่ครับ",
    PROFILE_SAVE_UNCONFIRMED: "ยังยืนยันผลบันทึกไม่ได้ กรุณารีเฟรชตรวจข้อมูลก่อนลองใหม่ครับ",
    SERVICE_ZONE_REVIEW_REQUIRED: "มีเขตเดิมที่ระบบยังยืนยันไม่ได้ กรุณาให้พี่เปอร์ตรวจเขตก่อนเปลี่ยนครับ",
    PROFILE_INVALID_RESPONSE: "ข้อมูลโปรไฟล์ยังไม่ครบ กรุณาลองโหลดใหม่ครับ",
    LIFF_UNAVAILABLE: "ยังเปิด LINE Login ไม่ได้ครับ ลองเปิดผ่าน LINE Mini App ด้านล่าง",
    LIFF_INIT_TIMEOUT: "LINE ยังไม่ตอบกลับครับ ลองเปิดผ่าน LINE Mini App ด้านล่าง",
    THERAPIST_SESSION_REQUIRED: "กรุณายืนยันผ่าน LINE อีกครั้งครับ",
    THERAPIST_SESSION_INVALID: "บัญชีหมดเวลาแล้ว กรุณายืนยันผ่าน LINE อีกครั้งครับ",
    THERAPIST_LINK_REQUIRED: "LINE นี้ยังไม่เชื่อมกับ Therapist ครับ ใช้ลิงก์เปิดสิทธิ์จากพี่เปอร์ก่อน",
    THERAPIST_ACCESS_DENIED: "บัญชี Therapist ยังไม่พร้อมใช้งานครับ ติดต่อพี่เปอร์เพื่อตรวจสถานะ",
    MY_MMS_ACCESS_REQUIRED: "กำลังรออนุมัติสิทธิ์แอปจากพี่เปอร์ครับ",
    PROFILE_COORDINATOR_REQUIRED: "ยังเปิดการบันทึกแบบประสานงานไม่ได้ครับ กรุณาติดต่อพี่เปอร์",
    PROFILE_REVISION_CONFLICT: "ข้อมูลเปลี่ยนจากอีกหน้าจอครับ ฉบับที่แก้ยังอยู่ กรุณาตรวจข้อมูลล่าสุดก่อนบันทึกใหม่",
    PROFILE_OPERATION_SUPERSEDED: "มีข้อมูลใหม่กว่ารายการนี้ครับ ฉบับที่แก้ยังอยู่ กรุณาตรวจข้อมูลล่าสุด",
    PROFILE_OPERATION_PENDING: "มีรายการที่ยังตรวจผลไม่ครบครับ ฉบับที่แก้ยังอยู่ กรุณาตรวจรายการเดิมก่อน",
    PROFILE_OPERATION_UNCERTAIN: "ยังยืนยันผลบันทึกไม่ได้ครับ ระบบหยุดการเขียนต่อไว้ กรุณาให้พี่เปอร์ตรวจรายการเดิม",
    PROFILE_JOURNAL_INVALID: "ยังตรวจสอบรายการบันทึกเดิมไม่ได้ครับ ข้อมูลที่แก้ยังอยู่ กรุณาให้พี่เปอร์ตรวจสอบก่อนบันทึกต่อ",
    PROFILE_REVISION_EXHAUSTED: "ยังบันทึกต่อไม่ได้ครับ ข้อมูลที่แก้ยังอยู่ กรุณาให้พี่เปอร์ตรวจสอบ",
    PROFILE_STORAGE_CONFLICT: "ข้อมูลในพื้นที่จัดเก็บเปลี่ยนระหว่างบันทึกครับ กรุณาให้พี่เปอร์ตรวจรายการเดิม",
    PHOTO_UPLOAD_DELETED: "รูปจากรายการอัปโหลดนี้ถูกลบแล้วครับ กรุณาเลือกรูปใหม่หากต้องการเพิ่มอีกครั้ง",
    PROFILE_SAVE_INCOMPLETE: "บันทึกข้อมูลได้ไม่ครบครับ ข้อมูลที่แก้ยังอยู่ กดบันทึกซ้ำเพื่อตรวจและทำส่วนที่เหลือให้ครบ",
    PROFILE_STORAGE_UNAVAILABLE: "ยังอ่านหรือบันทึกโปรไฟล์ไม่ได้ครับ ข้อมูลที่แก้ยังอยู่ ลองอีกครั้งได้",
    PROFILE_DATA_INVALID: "ข้อมูลโปรไฟล์ยังตรวจสอบไม่ได้ครับ กรุณาตรวจข้อมูลอีกครั้งก่อนแก้ไข",
    PROFILE_ACCOUNT_MISMATCH: "บัญชีเปลี่ยนแล้วครับ กรุณาตรวจบัญชีอีกครั้งก่อนแก้ไข",
    SERVICE_ZONES_TOO_MANY: "เลือกเขตเกินจำนวนที่รองรับครับ กรุณาลดจำนวนก่อนบันทึก",
    SERVICE_ZONE_DUPLICATE: "มีเขตซ้ำครับ กรุณาตรวจรายการก่อนบันทึก",
    SERVICE_ZONE_NOT_ACTIVE: "มีเขตที่ปิดใช้งานหรือยังยืนยันไม่ได้ครับ กรุณาตรวจเขตบริการอีกครั้ง",
    SERVICE_ZONES_INVALID: "เลือกเขตหลักให้อยู่ในเขตบริการด้วยครับ",
    EXPIRED: "งานหมดเวลารับแล้วครับ", TAKEN: "งานนี้มีคนรับแล้วครับ",
    INVALID_JOB_TRANSITION: "สถานะงานเปลี่ยนไปแล้วครับ กดรีเฟรชเพื่อตรวจอีกครั้ง",
  };
  function notice(text, error = false) { $("notice").textContent = text; $("notice").className = error ? "error" : ""; if (document.querySelector("main").dataset.login === "true") $("retry").hidden = !error; }
  function node(tag, text, className) { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; }
  function button(text, callback, alt = false) { const el = node("button", text, alt ? "alt" : ""); el.type = "button"; el.addEventListener("click", () => busy(el, callback)); return el; }
  async function busy(el, fn) { if (el.disabled) return; el.disabled = true; try { await fn(); } catch (e) { if (e.code === "STALE_RESPONSE") return; window.MmsGraphics?.failCurrent(messages[e.code] || "ยังทำรายการไม่สำเร็จครับ"); notice(messages[e.code] || "ยังทำรายการไม่สำเร็จครับ ลองอีกครั้งได้ ข้อมูลเดิมยังอยู่", true); } finally { el.disabled = false; } }
  async function api(path, options = {}) {
    const epoch = accountEpoch; const progress = window.MmsGraphics; const step = progress?.begin();
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000); controllers.add(controller);
    try {
      const mutation=path.startsWith(P+'/api/auth/profile')&&!['GET','HEAD'].includes(options.method||'GET');
      if(mutation){
        if(!profile?.therapist_id||profile.therapist_id!==access?.therapist_id)throw Object.assign(new Error('PROFILE_ACCOUNT_CHANGED'),{code:'PROFILE_ACCOUNT_CHANGED'});
        options={...options,headers:{...options.headers,'X-MMS-Therapist-Context':profile.therapist_id}};
      }
      const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options, signal: controller.signal });
      if (epoch !== accountEpoch) throw Object.assign(new Error("STALE_RESPONSE"), { code: "STALE_RESPONSE" });
      progress?.received(step);
      if (response.status === 204) { progress?.ready(step); return null; }
      const denied = response.status === 401 || response.status === 403;
      let body; try { body = await response.json(); } catch (_) { if(path===P+"/api/auth/line")throw Object.assign(new Error("AUTH_INVALID_RESPONSE"),{code:"AUTH_INVALID_RESPONSE"}); if (!denied) throw Object.assign(new Error("PROFILE_DATA_INVALID"), { code: "PROFILE_DATA_INVALID" }); }
      if (epoch !== accountEpoch) throw Object.assign(new Error("STALE_RESPONSE"), { code: "STALE_RESPONSE" });
      if (denied) {
        clearPrivate(); $("workspace").hidden = true; $("entry").hidden = false; $("line-login").onclick = () => location.assign(P + "/login");
        const code = body?.error?.code || (response.status === 401 ? "THERAPIST_SESSION_REQUIRED" : "THERAPIST_ACCESS_DENIED");
        throw Object.assign(new Error(code), { code, status: response.status });
      }
      if(path===P+"/api/auth/line"&&(!body||typeof body!=="object"||Array.isArray(body)))throw Object.assign(new Error("AUTH_INVALID_RESPONSE"),{code:"AUTH_INVALID_RESPONSE"});
      if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("PROFILE_DATA_INVALID"), { code: "PROFILE_DATA_INVALID" });
      if (!response.ok || body.ok !== true) {
        const e = new Error(body?.error?.code || "UNAVAILABLE"); e.code = body?.error?.code; e.status = response.status; e.retryable = body.retryable; e.saveState = body.save_state;
        if(e.code==="PROFILE_ACCOUNT_CHANGED"){clearPrivate();$("workspace").hidden=true;$("entry").hidden=false;}
        throw e;
      }
      if(body.data===undefined||body.data===null)throw Object.assign(new Error('PROFILE_INVALID_RESPONSE'),{code:'PROFILE_INVALID_RESPONSE'});
      if(path===A+'/service-zones'&&(!Array.isArray(body.data.zones)||body.data.zones.length===0))throw Object.assign(new Error('SERVICE_ZONE_CATALOG_INVALID'),{code:'SERVICE_ZONE_CATALOG_INVALID'});
      if(path===P+'/api/auth/line'&&(!body.data||typeof body.data.therapist_id!=='string'||!body.data.therapist_id))throw Object.assign(new Error('AUTH_INVALID_RESPONSE'),{code:'AUTH_INVALID_RESPONSE'});
      if(path===P+'/api/auth/profile'&&!validProfile(body.data)){
        if(body.data?.therapist_id&&body.data.therapist_id!==access?.therapist_id){clearPrivate();throw Object.assign(new Error('PROFILE_ACCOUNT_MISMATCH'),{code:'PROFILE_ACCOUNT_MISMATCH'});}
        throw Object.assign(new Error('PROFILE_DATA_INVALID'),{code:'PROFILE_DATA_INVALID'});
      }
      progress?.ready(step); return body.data;
    } catch (error) {
      if (epoch !== accountEpoch && error.status !== 401 && error.status !== 403 && !["PROFILE_ACCOUNT_MISMATCH","PROFILE_ACCOUNT_CHANGED"].includes(error.code)) throw Object.assign(new Error("STALE_RESPONSE"), { code: "STALE_RESPONSE" });
      if (epoch === accountEpoch) progress?.fail(step, controller.signal.aborted ? "คำขอใช้เวลานานเกินไปครับ ลองตรวจข้อมูลอีกครั้ง" : "ระบบยังไม่ได้ยืนยันผลครับ ลองตรวจข้อมูลอีกครั้ง");
      if(path===P+'/api/auth/line'&&(!error.code||error.name==='AbortError'))throw Object.assign(new Error(controller.signal.aborted||error.name==='AbortError'?'AUTH_REQUEST_TIMEOUT':'AUTH_NETWORK_UNAVAILABLE'),{code:controller.signal.aborted||error.name==='AbortError'?'AUTH_REQUEST_TIMEOUT':'AUTH_NETWORK_UNAVAILABLE'});
      throw error;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  async function profileApi(path, options) {
    const uploadId = options.headers?.["X-Upload-Id"];
    const key = JSON.stringify([access?.therapist_id, path, options.method, uploadId || options.body || null]);
    if (!profileOperations.has(key)) profileOperations.set(key, crypto.randomUUID());
    const revision = profile?.profile_revision;
    const headers = { ...options.headers };
    // Legacy backends keep their existing contract. A new backend rejects an
    // unversioned writer; it never guesses a base revision for old clients.
    if (Number.isSafeInteger(revision)) { headers["X-Profile-Revision"] = String(revision); headers["X-Profile-Operation-Id"] = profileOperations.get(key); }
    try { const data = await api(path, { ...options, headers }); profileOperations.delete(key); return data; }
    catch (error) { if ((error.status >= 400 && error.status < 500 && error.code !== "PROFILE_OPERATION_PENDING") || error.saveState?.airtable === "rejected") profileOperations.delete(key); throw error; }
  }
  const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  function setAccess(data) {
    if (access?.therapist_id && data.therapist_id !== access.therapist_id) clearPrivate();
    access = data;
    $("greeting").textContent = data.display_name || "Therapist";
    $("availability").value = data.availability_status || "Unavailable";
    $("save-availability").disabled = data.can_open !== true;
    $("readiness").dataset.state = data.can_open === true && data.matching_enabled === true && Array.isArray(data.verified_skills) && data.verified_skills.length > 0 && data.availability_status === "Available" ? "ready" : "checking";
    $("readiness").textContent = !data.can_open ? "กำลังรออนุมัติสิทธิ์แอปจากพี่เปอร์ครับ" : !data.matching_enabled ? "เข้าแอปได้แล้ว · พี่เปอร์ยังไม่ได้เปิดการจับคู่งานให้บัญชีนี้" : !data.verified_skills?.length ? "เข้าแอปได้แล้ว · รอยืนยันคอร์สที่รับงานได้" : data.availability_status === "Paused" ? "คุณพักรับงานอยู่ครับ" : data.availability_status !== "Available" ? "คุณอยู่สถานะ Offline · เปลี่ยนเป็น Online เมื่อพร้อมรับงานครับ" : "คุณ Online · งานที่ตรงเขตและคอร์สจะแสดงให้ตรวจดูก่อนตอบรับครับ";
  }
  async function refresh() {
    if (refreshing) return; refreshing = true; $("workspace").hidden = true;
    try {
      setAccess(await api(A + "/access"));
      $("entry").hidden = true; $("workspace").hidden = false;
      await loadTab(); notice("ข้อมูลล่าสุดพร้อมแล้วครับ");
    } finally { refreshing = false; }
  }
  async function loadTab() {
    $("detail").hidden = true;
    if (tab === "profile") { if (!profile) await loadProfile(); return; }
    const list = $(tab === "offers" ? "offer-list" : "job-list"); list.replaceChildren();
    if (!access?.can_open) { list.append(node("p", "เปิดดูงานได้หลังพี่เปอร์อนุมัติสิทธิ์แอปครับ")); return; }
    if (tab === "offers" && (access.matching_enabled !== true || !Array.isArray(access.verified_skills) || !access.verified_skills.length)) { list.append(node("p", "ยังเสนอรับงานไม่ได้ครับ ต้องเปิดการจับคู่และยืนยันคอร์สก่อน", "card")); return; }
    const data = await api(A + "/" + tab);
    if (!Array.isArray(data)) throw new Error("INVALID_DATA");
    if (!data.length) { list.append(node("p", tab === "offers" ? "ยังไม่มีงานเสนอให้คุณครับ" : "ยังไม่มีงานที่คุณรับครับ", "card")); return; }
    for (const item of data) {
      const card = node("article", null, "card"); card.append(node("h3", item.serviceLabel), node("p", [item.scheduledLabel, item.durationLabel, item.areaLabel].filter(Boolean).join(" · ")), node("p", item.bookingState?.label || stateLabel(item.state), "badge"), node("p", item.payoutLabel ? "ส่วนแบ่งของคุณ: " + item.payoutLabel : "ส่วนแบ่ง: รอพี่เปอร์สรุป"));
      card.append(button("ดูรายละเอียด", () => detail(item.jobId, tab))); list.append(card);
    }
  }
  function stateLabel(state) { return ({ OFFERED: "รอตอบรับ", ACCEPTED: "รับงานแล้ว", IN_PROGRESS: "กำลังให้บริการ", COMPLETED: "จบงานแล้ว", CANCELLED: "ยกเลิกแล้ว", EXPIRED: "หมดเวลารับ", TAKEN: "มีคนรับแล้ว", DECLINED: "ปฏิเสธแล้ว" })[state] || "กำลังตรวจสอบ"; }
  async function detail(id, lane) {
    if (!/^mmsjob_[a-f0-9]{24}$/.test(id)) throw new Error("INVALID_JOB_ID");
    const item = await api(A + "/" + lane + "/" + id);
    const panel = $("detail"); panel.replaceChildren(); panel.hidden = false;
    panel.append(node("h2", item.serviceLabel), node("p", item.bookingState?.label || stateLabel(item.state)), node("p", [item.scheduledLabel, item.durationLabel, item.areaLabel].filter(Boolean).join(" · ")));
    if (item.pricing) {
      const q = item.pricing;
      const money = (v) => Number(v).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      panel.append(node("p", "ค่าคอร์ส " + money(q.course_amount_thb) + " + ค่าเดินทาง " + money(q.travel_amount_thb) + " = ยอดเต็ม " + money(q.full_amount_thb) + " บาท"), node("p", "MMS 30%: " + money(q.mms_share_thb) + " · ส่วนของคุณ 70%: " + money(q.therapist_share_thb) + " บาท"), node("p", "ยอดส่วนแบ่งตามงาน ยังไม่ใช่การยืนยันว่าจ่ายแล้วครับ", "muted"));
    }
    for (const [label, value] of [["ส่วนแบ่งของคุณ", item.payoutLabel || "รอพี่เปอร์สรุป"], ["การเดินทาง", item.travelLabel], ["หมายเหตุ", item.noteLabel || item.payoutNote]]) if (value) panel.append(node("p", label + ": " + value, "address"));
    if (item.disclosure?.locationUnlocked) {
      panel.append(node("p", item.disclosure.addressLabel, "address"));
      for (const value of [item.disclosure.customerDisplayLabel, item.disclosure.contactLabel]) if (value) panel.append(node("p", value));
      const map = item.disclosure.mapUrl; if (map && /^https:\/\//.test(map)) { const link = node("a", "เปิดแผนที่"); link.href = map; link.target = "_blank"; link.rel = "noreferrer noopener"; panel.append(link); }
    }
    if (lane === "offers" && item.state === "OFFERED") {
      const expiry = Date.parse(item.expiresAt);
      const inTime = Number.isFinite(expiry) && expiry > Date.now();
      const canAccept = inTime && Boolean(item.payoutLabel) && access?.can_open === true && access?.matching_enabled === true && Array.isArray(access?.verified_skills) && access.verified_skills.length > 0;
      panel.append(node("p", !inTime ? "งานหมดเวลารับ หรือยังตรวจเวลาไม่ได้ครับ" : !item.payoutLabel ? "รอพี่เปอร์สรุปส่วนแบ่งก่อนตอบรับครับ" : "ตอบรับก่อน " + new Date(expiry).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })));
      const accept = button("รับงานนี้", () => act(id, "accept", "offers", "ACCEPTED")); accept.disabled = !canAccept; panel.append(accept);
      const decline = button("ไม่สะดวก", () => act(id, "decline", "offers", "DECLINED"), true); decline.disabled = !inTime; panel.append(decline);
    }
    if (lane === "jobs" && item.state === "ACCEPTED") panel.append(button("เริ่มให้บริการ", () => act(id, "start", "jobs", "IN_PROGRESS")));
    if (lane === "jobs" && item.state === "IN_PROGRESS") panel.append(button("ยืนยันจบงาน", async () => { if (window.confirm("ให้บริการเสร็จแล้ว ยืนยันจบงานนี้ครับ?")) await act(id, "complete", "jobs", "COMPLETED"); }));
    if (item.state === "COMPLETED") panel.append(node("p", "จบงานแล้ว · สถานะการจ่ายส่วนแบ่งยังต้องตรวจจาก MMS ครับ", "muted"));
    panel.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }
  async function act(id, action, lane, expected) {
    const key = id + ":" + action;
    if (!actionKeys.has(key)) actionKeys.set(key, crypto.randomUUID());
    const data = await api(A + "/" + lane + "/" + id + "/" + action, json("POST", { requestKey: actionKeys.get(key) }));
    if (data.state !== expected) { const e = new Error("STATE_CHANGED"); e.code = "INVALID_JOB_TRANSITION"; throw e; }
    actionKeys.delete(key); await refresh(); notice(stateLabel(data.state) + "ครับ");
  }
  function showProfileSection(name, focus = false) {
    if (!["info", "courses", "zones"].includes(name)) return;
    profileSection = name;
    for (const item of document.querySelectorAll("[data-profile-section]")) { const selected = item.dataset.profileSection === name; item.setAttribute("aria-selected", String(selected)); item.tabIndex = selected ? 0 : -1; }
    for (const section of ["info", "courses", "zones"]) if ($("profile-" + section)) $("profile-" + section).hidden = section !== name;
    if (focus) $("profile-tab-" + name)?.focus?.();
  }
  function courseState() { if ($("courses-state")) $("courses-state").textContent = $("courses").children.length ? "คอร์สในโปรไฟล์ " + $("courses").children.length + " คอร์ส" : "ยังไม่มีคอร์สและราคา เพิ่มคอร์สที่ต้องการแสดงได้ด้านล่างครับ"; }
  function courseRow(course = {}) {
    const row = node("div", null, "course"), head = node("div", null, "course-head");
    head.append(node("h3", "คอร์สบริการ"), button("ลบคอร์ส", () => { row.remove(); courseState(); }, true)); row.append(head);
    const values = [["name", "ชื่อคอร์ส", "text", course.name || ""], ["duration_minutes", "ระยะเวลา (นาที)", "number", course.duration_minutes ?? 60], ["price_thb", "ราคาคอร์ส (บาท)", "number", course.price_thb ?? 0]];
    const pair = node("div", null, "course-fields");
    for (const [field, label, type, value] of values) {
      const title = node("label", label), input = node("input"); input.type = type; input.dataset.field = field; input.value = value; input.required = true;
      if (field === "duration_minutes") { input.min = 30; input.max = 360; input.step = 30; } if (field === "price_thb") { input.min = 0; input.max = 99999; input.step = 1; } if (field === "name") input.maxLength = 80;
      title.append(input); if (field === "name") row.append(title); else pair.append(title);
    }
    row.append(pair); $("courses").append(row); courseState();
  }
  function chosenZones() { return Array.from($("coverage-zones").querySelectorAll("[data-service-zone]")).filter(check => check.checked).map(check => check.dataset.serviceZone); }
  function zoneSummary() {
    const base = $("base-zone"), selected = chosenZones(), option = Array.from(base.children).find(item => item.value === base.value);
    if ($("zone-summary")) $("zone-summary").textContent = "เขตหลัก: " + (base.value ? option?.textContent || base.value : "ยังไม่เลือก") + " · เลือก " + selected.length + " เขต";
    if (base.dataset.ready === "true") $("zone-status").textContent = "เลือกได้สูงสุด " + profile.limits.coverage_service_zones + " เขต · เขตหลักต้องอยู่ในรายการที่เลือกครับ";
  }
  function filterZones() {
    const query = ($("zone-search")?.value || "").trim().toLocaleLowerCase("th"); let count = 0;
    for (const label of $("coverage-zones").children) { label.hidden = Boolean(query && !label.textContent.toLocaleLowerCase("th").includes(query)); if (!label.hidden) count++; }
    if ($("zone-search-state")) $("zone-search-state").textContent = count ? "พบ " + count + " เขต" : "ไม่พบเขตที่ค้นหาครับ";
  }
  function zoneSnapshotKnown(data) {
    const z = data?.service_zones, c = data?.service_zone_conflicts;
    return z && typeof z.base_service_zone_code === "string" && Array.isArray(z.coverage_service_zone_codes)
      && z.coverage_service_zone_codes.every(code => typeof code === "string" && code.length > 0)
      && new Set(z.coverage_service_zone_codes).size === z.coverage_service_zone_codes.length
      && c && Number.isInteger(c.unresolved_base_count) && c.unresolved_base_count >= 0
      && Number.isInteger(c.unresolved_coverage_count) && c.unresolved_coverage_count >= 0 && typeof c.base_not_in_coverage === "boolean";
  }
  function zoneContractReady(data) {
    if(data?.service_zone_review_required)return false; return zoneSnapshotKnown(data) && Number.isInteger(data?.limits?.coverage_service_zones) && data.limits.coverage_service_zones > 0; }
  async function loadServiceZones(savedProfile, epoch) {
    const base = $("base-zone"), coverage = $("coverage-zones"), status = $("zone-status");
    base.replaceChildren(node("option", "ยังไม่เลือกเขตหลัก")); base.children[0].value = ""; coverage.replaceChildren(); base.dataset.ready = "false";
    base.disabled = true; if ($("zone-toggle")) $("zone-toggle").disabled = true;
    if ($("zone-editor")) $("zone-editor").hidden = true;
    $("zone-toggle")?.setAttribute("aria-expanded", "false");
    if ($("zone-retry")) $("zone-retry").hidden = false;
    if ($("zone-conflict")) $("zone-conflict").hidden = true;
    if ($("zone-conflict-confirm")) $("zone-conflict-confirm").checked = false;
    if (!zoneContractReady(savedProfile)) {
      status.textContent = "ยังตรวจข้อมูลเขตเดิมหรือขีดจำกัดไม่ได้ครับ เขตเดิมจะถูกเก็บไว้ ยังบันทึกชื่อและคอร์สได้";
      if ($("zone-summary")) $("zone-summary").textContent = "รอตรวจข้อมูลเขตที่บันทึกไว้";
      return;
    }
    try {
      const catalog = await api(A + "/service-zones");
      if (epoch !== accountEpoch || profile !== savedProfile) throw Object.assign(new Error("STALE_RESPONSE"), { code: "STALE_RESPONSE" });
      const zones = catalog?.zones;
      if (!Array.isArray(zones) || !zones.length || zones.some(zone => !zone || typeof zone.code !== "string" || typeof zone.label_th !== "string") || new Set(zones.map(zone => zone.code)).size !== zones.length) throw new Error("SERVICE_ZONE_CATALOG_INVALID");
      const catalogCodes = new Set(zones.map(zone => zone.code)), saved = savedProfile.service_zones;
      if ([saved.base_service_zone_code, ...saved.coverage_service_zone_codes].filter(Boolean).some(code => !catalogCodes.has(code))) throw new Error("SERVICE_ZONE_SNAPSHOT_CHANGED");
      for (const zone of zones) {
        const labelText = zone.label_th + (zone.province_label_th ? " · " + zone.province_label_th : ""), option = node("option", labelText); option.value = zone.code; base.append(option);
        const label = node("label", null, "zone-choice"), check = node("input"); check.type = "checkbox"; check.dataset.serviceZone = zone.code; label.append(check, node("span", labelText)); coverage.append(label);
      }
      base.value = saved.base_service_zone_code || ""; const selected = new Set(saved.coverage_service_zone_codes || []);
      for (const label of coverage.children) label.children[0].checked = selected.has(label.children[0].dataset.serviceZone);
      base.dataset.ready = "true"; base.disabled = false;
      if ($("zone-toggle")) $("zone-toggle").disabled = false;
      if ($("zone-retry")) $("zone-retry").hidden = true;
      zoneSummary(); filterZones();
      const conflicts = savedProfile.service_zone_conflicts;
      const hasConflicts = conflicts && (conflicts.unresolved_base_count || conflicts.unresolved_coverage_count || conflicts.base_not_in_coverage);
      if ($("zone-conflict")) $("zone-conflict").hidden = !hasConflicts;
      if ($("zone-conflict-copy")) $("zone-conflict-copy").textContent = "เขตเดิมบางรายการปิดใช้งานหรือยังยืนยันไม่ได้ (เขตหลัก " + (conflicts?.unresolved_base_count || 0) + " / เขตบริการ " + (conflicts?.unresolved_coverage_count || 0) + ") กรุณาเลือกเขตหลักและตรวจรายการใหม่ก่อนยืนยันแทนที่ การแก้ชื่อหรือคอร์สจะเก็บเขตเดิมไว้ครับ";
    } catch (error) {
      if (error.code === "STALE_RESPONSE" || error.status === 401 || error.status === 403) throw error;
      status.textContent = "ตอนนี้โหลดรายชื่อเขตไม่ได้ เขตเดิมจะถูกเก็บไว้ ยังบันทึกชื่อและคอร์สได้ครับ";
      if ($("zone-summary")) $("zone-summary").textContent = "เขตเดิม " + (savedProfile.service_zones?.coverage_service_zone_codes?.length || 0) + " เขต · รอตรวจรายชื่อ";
    }
  }
  function validProfile(data) {
    return data && typeof data === "object" && !Array.isArray(data) && typeof data.therapist_id === "string" && data.therapist_id === access?.therapist_id && typeof data.display_name === "string" && Array.isArray(data.courses) && Array.isArray(data.photos) && data.courses.every(c => c && typeof c.name === "string" && c.name.trim().length > 0 && c.name.length <= 80 && Number.isInteger(c.duration_minutes) && c.duration_minutes >= 30 && c.duration_minutes <= 360 && c.duration_minutes % 30 === 0 && Number.isInteger(c.price_thb) && c.price_thb >= 0 && c.price_thb <= 99999) && data.photos.every(p => p && typeof p.id === "string" && typeof p.preview_url === "string");
  }
  async function applyProfile(data, epoch) {
    if (epoch !== accountEpoch) throw Object.assign(new Error("STALE_RESPONSE"), { code: "STALE_RESPONSE" });
    if (!validProfile(data)) {
      if (data?.therapist_id && data.therapist_id !== access?.therapist_id) { clearPrivate(); throw Object.assign(new Error("PROFILE_ACCOUNT_MISMATCH"), { code: "PROFILE_ACCOUNT_MISMATCH" }); }
      throw Object.assign(new Error("PROFILE_DATA_INVALID"), { code: "PROFILE_DATA_INVALID" });
    }
    profile = data; if($("profile-submit"))$("profile-submit").disabled=false; $("display-name").value = data.display_name; $("intro").value = data.intro || ""; $("visibility").value = data.profile_visibility || "hidden";
    $("courses").replaceChildren(); for (const course of data.courses) courseRow(course); courseState();
    if ($("verified-services")) $("verified-services").textContent = "บริการที่ MMS ยืนยันแล้ว: " + (access.verified_skills?.length ? access.verified_skills.join(" · ") : "ยังไม่มีรายการยืนยัน");
    $("photos").replaceChildren(); for (const photo of data.photos) {
      const wrap = node("label"), image = node("img"); image.alt = photo.file_name || "รูปโปรไฟล์"; image.src = photo.preview_url;
      const check = node("input"); check.type = "checkbox"; check.dataset.photo = photo.id; check.checked = photo.selected_public === true;
      wrap.append(image, check, node("span", "แสดงรูปนี้"), button("ลบรูป", async () => { if (window.confirm("ลบรูปนี้ครับ?")) await profileWrite(async () => { await profileApi(P + "/api/auth/profile/photos/" + photo.id, { method: "DELETE" }); await reloadPhotosPreservingDraft(); }); }, true)); $("photos").append(wrap);
    }
    if ($("zone-conflict-confirm")) $("zone-conflict-confirm").checked = false;
    await loadServiceZones(data, epoch);
    if (epoch !== accountEpoch || profile !== data) throw Object.assign(new Error("STALE_RESPONSE"), { code: "STALE_RESPONSE" });
    $("profile-form").hidden = false; if ($("profile-state")) { $("profile-state").textContent = "ข้อมูลพร้อมแก้ไขครับ"; $("profile-state").dataset.state = "ready"; }
    showProfileSection(profileSection);
  }
  async function retryServiceZones() {
    if (profileSaving || !profile) return;
    const epoch = accountEpoch, savedProfile = profile;
    const fresh = await api(P + "/api/auth/profile");
    if (epoch !== accountEpoch || profile !== savedProfile) throw Object.assign(new Error("STALE_RESPONSE"), { code: "STALE_RESPONSE" });
    if (!validProfile(fresh)) throw Object.assign(new Error("PROFILE_DATA_INVALID"), { code: "PROFILE_DATA_INVALID" });
    // Refresh only the zone baseline. Unsaved profile fields and photo choices stay intact.
    profile = { ...savedProfile, service_zones: fresh.service_zones, service_zone_conflicts: fresh.service_zone_conflicts, limits: { ...savedProfile.limits, coverage_service_zones: fresh.limits?.coverage_service_zones } };
    await loadServiceZones(profile, epoch);
  }
  function draftSnapshot() { return { name: $("display-name").value, intro: $("intro").value, visibility: $("visibility").value, courses: Array.from($("courses").children).map(row => Object.fromEntries(Array.from(row.querySelectorAll("[data-field]")).map(el => [el.dataset.field, el.value]))), base: $("base-zone").value, zones: chosenZones() }; }
  async function reloadPhotosPreservingDraft() {
    const epoch = accountEpoch, draft = draftSnapshot(), previousRevision = profile?.profile_revision; await loadProfile();
    // This action changes only photos. A concurrent profile edit after our own
    // commit must not silently rebase the preserved name/course/zone draft.
    if (Number.isSafeInteger(previousRevision) && Number.isSafeInteger(profile?.profile_revision)) profile.profile_revision = Math.min(profile.profile_revision, previousRevision + 1);
    if (epoch !== accountEpoch) return;
    $("display-name").value = draft.name; $("intro").value = draft.intro; $("visibility").value = draft.visibility;
    $("courses").replaceChildren(); for (const course of draft.courses) courseRow(course); courseState();
    $("base-zone").value = draft.base; for (const el of $("coverage-zones").querySelectorAll("[data-service-zone]")) el.checked = draft.zones.includes(el.dataset.serviceZone); zoneSummary();
  }
  async function loadProfile() {
    const epoch = accountEpoch;
    if ($("profile-state")) { $("profile-state").textContent = "กำลังตรวจข้อมูลโปรไฟล์ครับ"; $("profile-state").dataset.state = "loading"; }
    try { await applyProfile(await api(P + "/api/auth/profile"), epoch); }
    catch (error) { if (epoch === accountEpoch && $("profile-state")) { $("profile-state").textContent = "ยังตรวจโปรไฟล์ไม่ได้ครับ กดตรวจข้อมูลอีกครั้ง ข้อมูลที่แก้จะไม่ถูกล้าง"; $("profile-state").dataset.state = "error"; } throw error; }
  }
  async function profileWrite(fn) {
    if (profileSaving) return; profileSaving = true; if ($("profile-fields")) $("profile-fields").disabled = true;
    try { await fn(); } finally { profileSaving = false; if ($("profile-fields")) $("profile-fields").disabled = false; }
  }
  for (const el of document.querySelectorAll("[data-tab]")) el.onclick = () => busy(el, async () => {
    tab = el.dataset.tab; for (const name of ["offers", "jobs", "profile"]) $(name).hidden = name !== tab;
    for (const other of document.querySelectorAll("[data-tab]")) other.setAttribute("aria-selected", String(other === el)); await loadTab();
  });
  $("save-availability").onclick = () => busy($("save-availability"), async () => { setAccess(await api(A + "/availability", json("PUT", { availability_status: $("availability").value }))); notice("บันทึกสถานะรับงานแล้วครับ"); });
  $("refresh").onclick = () => busy($("refresh"), refresh);
  $("retry").onclick = () => busy($("retry"), async () => { if (document.querySelector("main").dataset.login === "true") await login(); else await refresh(); });
  for (const item of document.querySelectorAll("[data-profile-section]")) {
    item.onclick = () => showProfileSection(item.dataset.profileSection);
    item.addEventListener("keydown", event => { const names = ["info", "courses", "zones"], index = names.indexOf(item.dataset.profileSection); if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3; showProfileSection(names[next], true); } });
  }
  if ($("open-courses")) $("open-courses").onclick = () => busy($("open-courses"), async () => {
    tab = "profile"; for (const name of ["offers", "jobs", "profile"]) $(name).hidden = name !== tab;
    for (const other of document.querySelectorAll("[data-tab]")) other.setAttribute("aria-selected", String(other.dataset.tab === tab)); showProfileSection("courses"); await loadTab(); $("profile-tab-courses")?.focus?.();
  });
  if ($("profile-retry")) $("profile-retry").onclick = () => busy($("profile-retry"), async () => { if (profile && !window.confirm("โหลดข้อมูลล่าสุดแทนที่ฉบับที่กำลังแก้ครับ?")) return; await loadProfile(); });
  if ($("zone-retry")) $("zone-retry").onclick = () => busy($("zone-retry"), retryServiceZones);
  if ($("zone-toggle")) $("zone-toggle").onclick = () => { const editor = $("zone-editor"); editor.hidden = !editor.hidden; $("zone-toggle").setAttribute("aria-expanded", String(!editor.hidden)); };
  if ($("zone-search")) $("zone-search").oninput = filterZones;
  $("base-zone").onchange = zoneSummary; $("coverage-zones").addEventListener("change", zoneSummary);
  $("add-course").onclick = () => { if ($("courses").children.length < (profile?.limits?.courses || 8)) courseRow(); else notice("เพิ่มคอร์สได้ไม่เกิน " + (profile?.limits?.courses || 8) + " คอร์สครับ", true); };
  $("profile-form").onsubmit = event => { event.preventDefault(); if (profileSaving || !profile) return;
    const submit = $("profile-form").querySelector('[type="submit"]'); busy(submit, async () => {
      const invalid = Array.from($("profile-form").querySelectorAll("input,textarea,select")).find(input => input.checkValidity && !input.checkValidity());
      if (invalid) { showProfileSection(invalid.closest("[role=tabpanel]")?.id.replace("profile-", "") || "info"); invalid.reportValidity(); return; }
      const courses = Array.from($("courses").children).map(row => Object.fromEntries(Array.from(row.querySelectorAll("[data-field]")).map(input => [input.dataset.field, input.type === "number" ? Number(input.value) : input.value])));
      const payload = { display_name: $("display-name").value, intro: $("intro").value, profile_visibility: $("visibility").value, courses };
      if ($("base-zone").dataset.ready === "true" && zoneContractReady(profile)) {
        const base = $("base-zone").value, selected = chosenZones(), saved = profile.service_zones || {}, old = saved.coverage_service_zone_codes || [];
        const changed = base !== (saved.base_service_zone_code || "") || JSON.stringify(selected.slice().sort()) !== JSON.stringify(old.slice().sort()) || $("zone-conflict-confirm")?.checked;
        if (changed) {
          const c = profile.service_zone_conflicts, conflict = c && (c.unresolved_base_count || c.unresolved_coverage_count || c.base_not_in_coverage);
          if (conflict && !$("zone-conflict-confirm")?.checked) { showProfileSection("zones"); notice("กรุณาตรวจเขตที่มีปัญหาและยืนยันใช้รายการใหม่ก่อนครับ", true); return; }
          if (selected.length > profile.limits.coverage_service_zones) { showProfileSection("zones"); notice(messages.SERVICE_ZONES_TOO_MANY, true); return; }
          if ((base && !selected.includes(base)) || (!base && selected.length)) { showProfileSection("zones"); notice(messages.SERVICE_ZONES_INVALID, true); return; }
          payload.base_service_zone_code = base; payload.coverage_service_zone_codes = selected;
        }
      }
      const epoch = accountEpoch;
      await profileWrite(async () => { const data = await profileApi(P + "/api/auth/profile", json("PUT", payload)); await applyProfile(data, epoch); });
      notice("บันทึกโปรไฟล์แล้วครับ");
    });
  };
  $("upload").onchange = () => busy($("upload"), async () => profileWrite(async () => {
    const file = $("upload").files?.[0]; if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) { notice("เลือก JPEG / PNG / WebP ไม่เกิน 10 MB ครับ", true); return; }
    if (!pendingUpload || pendingUpload.file !== file) pendingUpload = { file, id: crypto.randomUUID() };
    await profileApi(P + "/api/auth/profile/photos", { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name), "X-Upload-Id": pendingUpload.id }, body: file }); pendingUpload = null; $("upload").value = ""; await reloadPhotosPreservingDraft(); notice("เพิ่มรูปแล้วครับ");
  }));
  if ($("retry-upload")) $("retry-upload").onclick = () => { if (!$("upload").files?.[0]) notice("เลือกรูปก่อนครับ", true); else $("upload").onchange(); };
  $("save-photos").onclick = () => busy($("save-photos"), async () => profileWrite(async () => {
    const ids = Array.from(document.querySelectorAll("[data-photo]")).filter(el => el.checked).map(el => el.dataset.photo);
    if (ids.length > 6) { notice("เลือกรูปแสดงได้ไม่เกิน 6 รูปครับ", true); return; }
    await profileApi(P + "/api/auth/profile/photos/public", json("PUT", { photo_ids: ids })); await reloadPhotosPreservingDraft(); notice("บันทึกรูปที่แสดงแล้วครับ");
  }));
  $("logout").onclick = () => busy($("logout"), async () => { clearPrivate(); await api(P + "/api/auth/logout", { method: "POST" }); location.assign(P + "/login?logout=1"); });
  $("line-login").onclick = () => location.assign(P + "/login");
  async function login() {
    $("entry").hidden = false;
    const storageKey = "mms-therapist-invite-v1";
    const recoveryKey = "mms-therapist-line-recovery-v1";
    const url = new URL(location.href);
    let explicitLogout = url.searchParams.get("logout") === "1";
    const hash = new URLSearchParams(url.hash.slice(1));
    const nested = url.searchParams.get("liff.state") || url.searchParams.get("liff_state") || "";
    const primary = url.pathname.replace(/\/$/, "") === P || ["code", "liff.state", "liff_state"].some(key => url.searchParams.has(key));
    const state = new URL(nested || P + "/login", url.origin);
    let invite = url.searchParams.get("invite") || hash.get("invite") || state.searchParams.get("invite") || new URLSearchParams(state.hash.slice(1)).get("invite") || "";
    const storage = {
      get(key) { try { return window.sessionStorage.getItem(key); } catch (_) { return null; } },
      set(key, value) { try { window.sessionStorage.setItem(key, value); } catch (_) {} },
      remove(key) { try { window.sessionStorage.removeItem(key); } catch (_) {} },
    };
    if (invite) storage.set(storageKey, JSON.stringify({ token: invite, until: Date.now() + 30 * 60 * 1000 }));
    else {
      try { const saved = JSON.parse(storage.get(storageKey)); if (saved?.until > Date.now()) invite = saved.token || ""; else storage.remove(storageKey); } catch (_) { storage.remove(storageKey); }
    }
    if (!explicitLogout && !invite && !primary) { try { await api(P + "/api/auth/me"); location.replace(P + "/app"); return; } catch (_) {} }
    // Keep the invitation in the redirect too if browser storage is unavailable.
    const redirect = new URL(P + "/login", url.origin);
    if (invite) redirect.hash = new URLSearchParams({ invite }).toString();
    function recoverLine() {
      if (storage.get(recoveryKey) || url.searchParams.get("line_recovery") === "1") { notice("LINE ยังยืนยันบัญชีไม่ได้ครับ ติดต่อพี่เปอร์เพื่อตรวจ LINE Login", true); return; }
      storage.set(recoveryKey, "1");
      redirect.searchParams.set("line_recovery", "1");
      window.liff.logout();
      window.liff.login({ redirectUri: redirect.href });
    }
    notice("ยืนยันผ่าน LINE เพื่อเข้าพื้นที่ Therapist ครับ");
    async function authenticate() {
      const progress = window.MmsGraphics; const step = progress?.begin("กำลังยืนยันผ่าน LINE ครับ");
      if (!window.liff) { const e = new Error("LIFF_UNAVAILABLE"); e.code = "LIFF_UNAVAILABLE"; throw e; }
      let timeout;
      try {
        await Promise.race([
          window.liff.init({ liffId: "2011425652-YqK1F6y8" }),
          new Promise((_, reject) => { timeout = setTimeout(() => { const e = new Error("LIFF_INIT_TIMEOUT"); e.code = "LIFF_INIT_TIMEOUT"; reject(e); }, 12000); }),
        ]);
      } catch(error) {
        if(error.code==='LIFF_INIT_TIMEOUT')throw error;
        throw Object.assign(new Error('LIFF_INIT_FAILED'),{code:'LIFF_INIT_FAILED'});
      } finally { clearTimeout(timeout); }
      progress?.received(step);
      if (explicitLogout) {
        window.liff.logout();
        explicitLogout = false; invite = ""; redirect.hash = "";
        storage.remove(storageKey); storage.remove(recoveryKey);
        history.replaceState(null, "", P + "/login");
        notice("ออกจากบัญชีแล้วครับ กดยืนยันผ่าน LINE เพื่อเลือกบัญชีอีกครั้ง");
        return;
      }
      if (!window.liff.isLoggedIn()) { notice("กำลังเปิด LINE เพื่อยืนยันบัญชีครับ"); window.liff.login({ redirectUri: redirect.href }); return; }
      const token = window.liff.getIDToken();
      if (!token) { recoverLine(); return; }
      try {
        await api(P + "/api/auth/line", json("POST", { id_token: token, ...(invite ? { invite_token: invite } : {}) }));
      } catch (e) {
        // api() normally changes this handler on 401; preserve the auth retry.
        $("line-login").onclick = () => busy($("line-login"), authenticate);
        if (e.code === "LINE_ID_TOKEN_INVALID") { recoverLine(); return; }
        throw e;
      }
      storage.remove(storageKey); storage.remove(recoveryKey);
      history.replaceState(null, "", P + "/login"); location.replace(P + "/app");
    }
    $("line-login").onclick = () => busy($("line-login"), authenticate);
    await busy($("line-login"), authenticate);
  }
  let leftPage = false;
  document.addEventListener?.("visibilitychange", () => {
    if (document.hidden) leftPage = true;
    else if (leftPage && document.querySelector("main").dataset.login !== "true") {
      leftPage = false;
      if (document.activeElement?.id === "upload" || controllers.size) return;
      refresh().catch(() => notice("ยังตรวจสอบบัญชีไม่ได้ครับ กดลองอีกครั้ง", true));
    }
  });
  if (document.querySelector("main").dataset.login === "true") login().catch(() => notice("กรุณาลองยืนยันผ่าน LINE อีกครั้งครับ", true));
  else refresh().catch((e) => { notice(messages[e.code] || "ยังตรวจสอบบัญชีไม่ได้ครับ กดรีเฟรชหรือติดต่อพี่เปอร์", true); if (e.status === 403) { $("entry").hidden = false; } });
}

