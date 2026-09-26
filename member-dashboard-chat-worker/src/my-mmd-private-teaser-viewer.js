
import { MY_MMD_BANGKOK_BOARD_URL, MY_MMD_BRAND_LOGO_URL } from "./my-mmd-visual-assets.js";

const LANDING_PATH = "/my-mmd/private-preview";
const VIEW_PATH = `${LANDING_PATH}/view`;

export function isMyMmdPrivateTeaserViewerPath(input) {
  const url = input instanceof URL ? input : new URL(input instanceof Request ? input.url : String(input));
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return path === LANDING_PATH || path === VIEW_PATH;
}

// This is a MY MMD-owned surface.  Lovable is intentionally not in this
// request path: it must never receive a member session, preview grant or media.
export function myMmdPrivateTeaserViewerPage(request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== LANDING_PATH && path !== VIEW_PATH) return new Response("Not Found", { status:404 });
  if (!["GET", "HEAD"].includes(request.method)) return new Response("Method Not Allowed", { status:405, headers:{ allow:"GET, HEAD", "cache-control":"no-store" } });
  const response = path === VIEW_PATH ? previewPlayerPage() : availabilityPage(safeSlug(url.searchParams.get("model")));
  if (request.method === "HEAD") return new Response(null, { status:response.status, headers:response.headers });
  return response;
}

function availabilityPage(modelSlug) {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const model = JSON.stringify(modelSlug).replace(/</g, "\\u003c");
  return html(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>MY MMD · Private Preview</title>${skin(nonce)}</head><body><main class="shell"><a class="back" href="/my-mmd/">← MY MMD</a><section class="card" aria-live="polite"><p class="eyebrow">MMD PRIVÉ · PRIVATE PREVIEW</p><h1 id="title">Private<br>Preview</h1><p id="copy">ยืนยัน LINE เพื่อให้ MMD ตรวจสิทธิ์การรับชมสำหรับคุณ</p><div class="rule"></div><p id="notice" class="notice">กำลังตรวจสิทธิ์ของคุณ</p><div class="actions"><button id="verify" class="wide" type="button" hidden>ยืนยันผ่าน LINE</button><button id="picture" type="button" hidden>ดูรูป 3 วินาที</button><button id="clip" type="button" hidden>ดูคลิป 1 ครั้ง</button><a id="profiles" class="secondary wide" href="/profiles">กลับไปดูโปรไฟล์</a></div><p class="fine">เมื่อเปิดแล้ว ระบบจะเริ่มใช้สิทธิ์รับชมทันที</p></section></main><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script nonce="${nonce}">
(() => {
  const modelSlug=${model}, lane='companion';
  const $=id=>document.getElementById(id), title=$('title'), copy=$('copy'), notice=$('notice'), verify=$('verify'), picture=$('picture'), clip=$('clip');
  const show=(node,yes)=>node.hidden=!yes, busy=yes=>[verify,picture,clip].forEach(x=>x.disabled=yes);
  const unavailable=text=>{ title.textContent='Private Preview'; copy.textContent='สิทธิ์นี้เปิดตามข้อมูลที่ MMD ยืนยันเท่านั้น'; notice.textContent=text; show(verify,false);show(picture,false);show(clip,false); };
  async function responseJson(response){ return { response, body:await response.json().catch(()=>({})) }; }
  async function availability(){
    if(!modelSlug) return unavailable('กรุณาเปิด Private Preview จากโปรไฟล์ Model ที่ต้องการ');
    notice.textContent='กำลังตรวจสิทธิ์ของคุณ';
    const q=new URLSearchParams({model_slug:modelSlug,work_lane:lane});
    const {response,body}=await responseJson(await fetch('/api/member/app/private-teaser/availability?'+q,{credentials:'same-origin',cache:'no-store'}));
    if(response.status===401){notice.textContent='ยืนยัน LINE เพื่อดูสิทธิ์สำหรับครั้งนี้';show(verify,true);return;}
    if(!response.ok||body.ok!==true||body.availability?.eligible!==true)return unavailable('MMD ยังเปิดสิทธิ์รับชมสำหรับรายการนี้ไม่ได้ในขณะนี้');
    title.textContent='Private Preview\\nพร้อมดู';copy.textContent='รายละเอียดพิเศษจากโปรไฟล์นี้พร้อมสำหรับคุณ';notice.textContent='เลือกรายการที่ต้องการดู';
    show(verify,false);show(picture,body.availability.pic_count>0);show(clip,body.availability.clip_count>0);
  }
  async function verifyLine(){
    try{busy(true);notice.textContent='กำลังยืนยันตัวตนผ่าน LINE';await liff.init({liffId:'2010862595-yT4DCEMc'});if(!liff.isLoggedIn()){liff.login({redirectUri:location.href});return;}const idToken=liff.getIDToken();if(!idToken)throw Error('identity');const started=await fetch('/member/api/liff/start',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({id_token:idToken,intent:'private_teaser',source:'my_mmd_private_preview'})});if(!started.ok)throw Error('start');await availability();}catch(_){unavailable('ยังยืนยัน LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');}finally{busy(false);}
  }
  async function grant(kind){
    try{busy(true);notice.textContent='กำลังเปิด Private Preview';const {response,body}=await responseJson(await fetch('/api/member/app/private-teaser/grant',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({model_slug:modelSlug,work_lane:lane,preview_kind:kind})}));if(!response.ok||body.ok!==true||!body.grant?.viewer_url)throw Error('grant');location.assign(body.grant.viewer_url);}catch(_){unavailable('สิทธิ์รับชมยังเปิดไม่ได้ กรุณากลับมาตรวจใหม่ภายหลัง');}finally{busy(false);}
  }
  verify.addEventListener('click',verifyLine);picture.addEventListener('click',()=>grant('private_pic'));clip.addEventListener('click',()=>grant('private_clip'));availability();
})();
</script></body></html>`, nonce);
}

function previewPlayerPage() {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  return html(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>MY MMD · Private Preview</title>${skin(nonce)}</head><body><main class="shell"><section class="card" aria-live="polite"><p class="eyebrow">MMD PRIVÉ · PRIVATE PREVIEW</p><h1>Private<br>Preview</h1><p id="message">กำลังตรวจสิทธิ์ของคุณ</p><div class="rule"></div><button id="open" class="wide" type="button" hidden>เข้าใจและเปิดดู</button><a id="login" class="wide" href="/my-mmd/" hidden>ยืนยันผ่าน LINE</a><div id="stage" aria-live="off"></div><p class="fine" id="fine">สื่อนี้เปิดตามสิทธิ์เฉพาะครั้ง</p></section></main><script nonce="${nonce}">
(() => {
  const params=new URLSearchParams(location.hash.slice(1));let token=params.get('t')||'';history.replaceState(null,'',location.pathname);
  const message=document.getElementById('message'),button=document.getElementById('open'),stage=document.getElementById('stage'),fine=document.getElementById('fine');let policy=null,objectUrl='',timer=0,used=false,closed=false;const controller=new AbortController();
  const close=text=>{closed=true;clearTimeout(timer);controller.abort();const video=stage.querySelector('video');if(video){video.pause();video.removeAttribute('src');video.load();}stage.replaceChildren();if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl='';token='';button.hidden=true;message.textContent=text;fine.textContent='MMD ไม่เก็บสื่อนี้ไว้ในอุปกรณ์ของคุณ';};
  const conceal=()=>{if(used)close('สิ้นสุดการรับชมแล้ว สิทธิ์นี้ใช้ได้ครั้งเดียว');};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)conceal();});window.addEventListener('pagehide',conceal);stage.addEventListener('contextmenu',event=>event.preventDefault());stage.addEventListener('dragstart',event=>event.preventDefault());
  async function init(){if(!token)return close('ไม่พบลิงก์รับชม กรุณาเปิด Private Preview ใหม่อีกครั้ง');try{const response=await fetch('/api/member/app/private-preview/status?t='+encodeURIComponent(token),{credentials:'same-origin',cache:'no-store',signal:controller.signal});const body=await response.json().catch(()=>({}));if(response.status===401){document.getElementById('login').hidden=false;return close('เข้าสู่ MY MMD แล้วเปิด Private Preview ใหม่อีกครั้ง');}if(!response.ok||body.ok!==true||!['private_pic','private_clip'].includes(body.preview?.kind)||body.preview.viewLimit!==1)return close('สิทธิ์นี้ยังไม่พร้อม หมดอายุ หรือใช้ไปแล้ว');policy=body.preview;button.hidden=false;message.textContent=policy.kind==='private_pic'?'รูปเปิดได้ 3 วินาที และดูได้ 1 ครั้ง':'คลิปเปิดดูได้ 1 ครั้ง โดยไม่มี replay';button.textContent=policy.kind==='private_pic'?'เข้าใจและเปิดดู 3 วินาที':'เข้าใจและเริ่มดู';}catch(_){if(!closed)close('ยังตรวจสิทธิ์ไม่ได้ กรุณาลองใหม่ภายหลัง');}}
  button.addEventListener('click',async()=>{if(used||!policy||closed)return;used=true;button.disabled=true;message.textContent='กำลังเปิด Private Preview';try{const response=await fetch('/api/member/app/private-preview/consume',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({t:token}),signal:controller.signal});token='';const mime=response.headers.get('content-type')||'';if(!response.ok||response.headers.get('x-mmd-preview-consumed')!=='true'||!(policy.kind==='private_pic'?/^image\\/(jpeg|png|webp)$/.test(mime):mime==='video/mp4'))return close('เปิดสื่อไม่ได้ กรุณาติดต่อ MMD');const blob=await response.blob();if(closed||document.hidden)return conceal();objectUrl=URL.createObjectURL(blob);const media=document.createElement(policy.kind==='private_pic'?'img':'video');media.addEventListener('error',()=>close('เปิดสื่อไม่ได้ กรุณาติดต่อ MMD'));if(policy.kind==='private_pic'){media.alt='Private Pic';media.draggable=false;media.addEventListener('load',()=>{if(!closed)timer=setTimeout(conceal,3000);});}else{media.playsInline=true;media.controls=false;media.loop=false;media.disablePictureInPicture=true;media.setAttribute('controlslist','nodownload noremoteplayback');media.addEventListener('ended',conceal);media.addEventListener('seeking',conceal);}const mark=document.createElement('span');mark.className='watermark';mark.textContent=policy.watermark||'MMD PRIVÉ';media.src=objectUrl;stage.replaceChildren(media,mark);button.hidden=true;message.textContent='สิทธิ์รับชมครั้งเดียว';fine.textContent='การซ่อนหน้าจอหรือออกจากหน้านี้จะสิ้นสุดการรับชม';if(policy.kind==='private_clip')await media.play();}catch(_){if(!closed)close('การรับชมสิ้นสุดแล้ว หากเปิดไม่สำเร็จ กรุณาติดต่อ MMD');}});init();
})();
</script></body></html>`, nonce);
}

function skin(nonce) {
  return `<style nonce="${nonce}">:root{color-scheme:dark;--ink:#fff8e9;--muted:#cfc6b5;--gold:#f3d889;--line:rgba(241,211,137,.24)}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(180deg,rgba(8,7,7,.76),rgba(8,7,7,.94)),url("${MY_MMD_BANGKOK_BOARD_URL}") center top/cover fixed no-repeat;color:var(--ink);font:16px "LINE Seed Sans TH","Noto Sans Thai",Inter,Arial,sans-serif;overflow-x:hidden}.shell{width:min(620px,calc(100% - 32px));margin:auto;padding:22px 0 max(48px,env(safe-area-inset-bottom))}.brand{display:block;width:auto;height:42px;max-width:150px;object-fit:contain;margin:0 0 20px}.back{display:inline-block;margin:0 0 22px;color:var(--muted);font-size:13px;text-decoration:none}.card{padding:clamp(24px,7vw,42px);border:1px solid var(--line);border-radius:28px;background:linear-gradient(145deg,rgba(30,22,12,.94),rgba(8,7,5,.92));box-shadow:0 24px 72px rgba(0,0,0,.32)}.eyebrow{margin:0 0 13px;color:var(--gold);font-size:12px;font-weight:900;letter-spacing:.16em}h1{margin:0 0 16px;font-size:clamp(38px,11vw,62px);line-height:.94;letter-spacing:-.055em}p{margin:0;color:var(--muted);line-height:1.7}.rule{height:1px;margin:24px 0;background:var(--line)}.notice{min-height:52px;margin-top:18px;color:#f4e7c7}.actions{display:grid;gap:10px;margin-top:22px}button,a{min-height:52px;display:flex;align-items:center;justify-content:center;border:1px solid #c99b42;border-radius:999px;padding:0 18px;background:linear-gradient(135deg,#ffe9a8,#bd8630);color:#1b1206;font:inherit;font-weight:850;text-decoration:none;cursor:pointer}button[hidden],a[hidden]{display:none}button:disabled{opacity:.55;cursor:wait}.secondary{border-color:rgba(255,255,255,.16);background:rgba(255,255,255,.055);color:var(--ink)}.wide{width:100%;margin-top:18px}.fine{margin-top:20px;color:#a99f91;font-size:13px}#stage{position:relative;margin-top:22px;overflow:hidden;border-radius:16px}#stage img,#stage video{display:block;width:100%;max-height:70svh;object-fit:contain;pointer-events:none;user-select:none}.watermark{position:absolute;left:0;right:0;top:46%;color:#fff9;text-align:center;text-shadow:0 1px 4px #000;pointer-events:none;font-size:14px;font-weight:800;letter-spacing:.14em}@media(min-width:640px){.actions{grid-template-columns:1fr 1fr}.actions .wide{grid-column:1/-1}}</style>`;
}

function html(body, nonce) {
  const brandedBody = body
    .replace('<main class="shell">', `<main class="shell"><img class="brand" src="${MY_MMD_BRAND_LOGO_URL}" alt="MMD Privé">`)
    .replace('</head>', `<style nonce="${nonce}">.brand{height:60px;max-width:60px}.back{min-height:44px;padding:0 16px;background:rgba(8,7,7,.88);border-color:rgba(255,255,255,.3);color:#fff8e9}</style></head>`);
  return new Response(brandedBody, { status:200, headers:{
    "content-type":"text/html; charset=utf-8", "cache-control":"private, no-store, max-age=0", pragma:"no-cache", "referrer-policy":"no-referrer", "x-frame-options":"DENY", "x-content-type-options":"nosniff",
    "permissions-policy":"camera=(), microphone=(), display-capture=()", "x-mmd-ui-source":"my-mmd-private-teaser-viewer-v1", "x-mmd-presentation-owner":"mmd-workers",
    "content-security-policy":`default-src 'none'; script-src 'nonce-${nonce}' https://static.line-scdn.net; style-src 'nonce-${nonce}'; connect-src 'self'; img-src blob: https://cdn.prod.website-files.com https://s3.amazonaws.com; media-src blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  }});
}

function safeSlug(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,100); }
