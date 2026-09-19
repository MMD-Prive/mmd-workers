const MARKER = "<!-- mms-admin-mobile-bundle:v1 -->";
const INTERNAL_SIGIL_FAVICON = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0ea3f9421cae9dd223f50b_SIGIL%20only%20logo.webp";

const MB_STYLE = `<style id="mmsAdminMbV1Style">
.mms-mb-topbar,.mms-mb-rail,.mms-mb-swipe-hint{display:none}
@media(max-width:767px){
  html{scroll-padding-top:74px}
  body{overscroll-behavior-y:none}
  body[data-mms-admin-mb="v1"] .mms-admin{padding-top:calc(54px + env(safe-area-inset-top));padding-bottom:118px}
  body[data-mms-admin-mb="v1"] .shell{padding-left:12px;padding-right:12px}
  body[data-mms-admin-mb="v1"] .mast{padding-top:8px;padding-bottom:12px}
  body[data-mms-admin-mb="v1"] .brand-row{margin-bottom:10px}
  body[data-mms-admin-mb="v1"] .brand{width:138px}
  body[data-mms-admin-mb="v1"] .runtime{min-height:32px;padding:7px 10px;font-size:11.5px}
  body[data-mms-admin-mb="v1"] .hero{border-radius:22px}
  body[data-mms-admin-mb="v1"] .hero-copy{padding:20px 17px 18px}
  body[data-mms-admin-mb="v1"] .hero h1{font-size:clamp(34px,11vw,48px)}
  body[data-mms-admin-mb="v1"] .hero-lead{margin-top:13px;font-size:15px;line-height:1.75}
  body[data-mms-admin-mb="v1"] .hero-note{margin-top:14px;padding:12px 13px}
  body[data-mms-admin-mb="v1"] .hero-media{min-height:170px}
  body[data-mms-admin-mb="v1"] .stats{scroll-padding-inline:12px;margin-left:-12px;margin-right:-12px;padding-left:12px;padding-right:12px;overscroll-behavior-x:contain}
  body[data-mms-admin-mb="v1"] .stat{flex-basis:82vw;min-height:106px;padding:15px}
  body[data-mms-admin-mb="v1"] .stat b{font-size:31px}
  body[data-mms-admin-mb="v1"] .panel{padding-top:10px;animation:mmsMbPanelIn .32s cubic-bezier(.22,1,.36,1)}
  body[data-mms-admin-mb="v1"] .section-head{align-items:flex-start;margin-top:9px}
  body[data-mms-admin-mb="v1"] .section-head h2{font-size:27px}
  body[data-mms-admin-mb="v1"] .filter-bar{position:sticky;top:calc(58px + env(safe-area-inset-top));z-index:34;margin-left:-4px;margin-right:-4px;border-radius:18px;background:rgba(255,255,255,.92);box-shadow:0 10px 26px rgba(20,35,27,.09);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
  body[data-mms-admin-mb="v1"] input,body[data-mms-admin-mb="v1"] select,body[data-mms-admin-mb="v1"] textarea{font-size:16px}
  body[data-mms-admin-mb="v1"] .record-card{border-radius:20px;box-shadow:0 8px 24px rgba(25,46,34,.055);transition:transform .32s cubic-bezier(.22,1,.36,1),box-shadow .32s ease}
  body[data-mms-admin-mb="v1"] .record-card:active{transform:scale(.994)}
  body[data-mms-admin-mb="v1"] .record-edit[open] .editor{animation:mmsMbAccordionIn .28s cubic-bezier(.22,1,.36,1)}
  body[data-mms-admin-mb="v1"] .actions{display:grid;grid-template-columns:1fr;gap:8px}
  body[data-mms-admin-mb="v1"] .actions .btn{width:100%;min-height:48px}
  body[data-mms-admin-mb="v1"] .check-chip{min-height:48px}
  body[data-mms-admin-mb="v1"] .mobile-branch{left:8px;right:8px;bottom:max(8px,env(safe-area-inset-bottom));border-radius:19px}
  body[data-mms-admin-mb="v1"] .branch-next{min-width:82px}
  body[data-mms-admin-mb="v1"] .mms-diag-dock{right:10px;bottom:102px;min-height:44px;padding:10px 13px;font-size:11px}
  .mms-mb-topbar{position:fixed;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:10px;left:0;right:0;top:0;z-index:88;min-height:calc(54px + env(safe-area-inset-top));padding:calc(7px + env(safe-area-inset-top)) 12px 7px;background:rgba(243,243,236,.9);border-bottom:1px solid rgba(20,35,27,.1);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
  .mms-mb-title{min-width:0;display:grid;gap:1px}
  .mms-mb-title small{font-size:9.5px;font-weight:800;letter-spacing:.12em;color:#4f6356;text-transform:uppercase}
  .mms-mb-title strong{font-size:13.5px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#14231b}
  .mms-mb-actions{display:flex;gap:6px}
  .mms-mb-icon{display:grid;place-items:center;width:38px;height:38px;border:1px solid rgba(20,35,27,.12);border-radius:13px;background:#fff;color:#14231b;font-size:16px;font-weight:900;box-shadow:0 8px 18px rgba(20,35,27,.05)}
  .mms-mb-icon.health{background:#14231b;color:#fff;border-color:#14231b}
  .mms-mb-rail{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;margin:12px -12px 2px;padding:0 12px 5px;overscroll-behavior-x:contain}
  .mms-mb-rail::-webkit-scrollbar{display:none}
  .mms-mb-lane{flex:0 0 68vw;scroll-snap-align:start;display:grid;grid-template-columns:1fr auto;align-items:end;gap:10px;min-height:78px;border:1px solid rgba(20,35,27,.12);border-radius:18px;background:#fff;color:#14231b;padding:13px 14px;text-align:left;box-shadow:0 8px 24px rgba(25,46,34,.05)}
  .mms-mb-lane small{display:block;color:#596a61;font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
  .mms-mb-lane strong{display:block;margin-top:5px;font-size:14px;line-height:1.45}
  .mms-mb-lane b{font-size:27px;line-height:1;letter-spacing:-.04em}
  .mms-mb-lane.is-alert b{color:#8d3e38}
  .mms-mb-swipe-hint{display:block;margin:5px 2px 11px;color:#637169;font-size:11px;line-height:1.55}
  @keyframes mmsMbPanelIn{from{opacity:.55;transform:translateX(8px)}to{opacity:1;transform:none}}
  @keyframes mmsMbAccordionIn{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
}
/* Readability lock: keep Thai and mixed TH/EN operational text comfortably legible. */
body[data-mms-admin-mb="v1"] .mms-admin{font-family:"LINE Seed Sans TH","Line Seed Sans TH","Noto Sans Thai","Noto Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:1.65;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased}
body[data-mms-admin-mb="v1"] .mms-admin .runtime{font-size:11.5px;line-height:1.35}
body[data-mms-admin-mb="v1"] .mms-admin .eyebrow{font-size:10.5px}
body[data-mms-admin-mb="v1"] .mms-admin .hero-lead{font-size:15px;line-height:1.75;color:rgba(255,253,248,.88)}
body[data-mms-admin-mb="v1"] .mms-admin .hero-note{font-size:13.5px;line-height:1.72;color:rgba(255,253,248,.92)}
body[data-mms-admin-mb="v1"] .mms-admin .stat span{font-size:12.5px;font-weight:600;color:#53645a}
body[data-mms-admin-mb="v1"] .mms-admin .stat small{font-size:11.5px;color:#637169}
body[data-mms-admin-mb="v1"] .mms-admin .section-head p{font-size:13.5px;line-height:1.7;color:#53645a}
body[data-mms-admin-mb="v1"] .mms-admin .section-kicker{font-size:10px}
body[data-mms-admin-mb="v1"] .mms-admin .action-card p{font-size:13.5px;line-height:1.7;color:#53645a}
body[data-mms-admin-mb="v1"] .mms-admin .ops-note{font-size:14px;line-height:1.8}
body[data-mms-admin-mb="v1"] .mms-admin .attention-row{font-size:13px}
body[data-mms-admin-mb="v1"] .mms-admin .field label,body[data-mms-admin-mb="v1"] .mms-admin .field-label{font-size:12.5px;font-weight:700;color:#53645a}
body[data-mms-admin-mb="v1"] .mms-admin .field-help{font-size:11.5px;line-height:1.6;color:#647269}
body[data-mms-admin-mb="v1"] .mms-admin .check-chip,body[data-mms-admin-mb="v1"] .mms-admin .notice{font-size:13px;line-height:1.6}
body[data-mms-admin-mb="v1"] .mms-admin .btn{font-size:13px}
body[data-mms-admin-mb="v1"] .mms-admin .filter-bar input,body[data-mms-admin-mb="v1"] .mms-admin .filter-bar select{font-size:13px}
body[data-mms-admin-mb="v1"] .mms-admin .record-main h3{font-size:18px;line-height:1.45}
body[data-mms-admin-mb="v1"] .mms-admin .record-main p{font-size:13px;line-height:1.65;color:#53645a}
body[data-mms-admin-mb="v1"] .mms-admin .status-pill{font-size:10.5px}
body[data-mms-admin-mb="v1"] .mms-admin .tag{font-size:10.5px}
body[data-mms-admin-mb="v1"] .mms-admin .record-edit summary{font-size:13px}
body[data-mms-admin-mb="v1"] .mms-admin .editor .field label{font-size:12px}
body[data-mms-admin-mb="v1"] .mms-admin .editor .field input,body[data-mms-admin-mb="v1"] .mms-admin .editor .field select,body[data-mms-admin-mb="v1"] .mms-admin .editor .field textarea{font-size:13px}
body[data-mms-admin-mb="v1"] .mms-admin .detail{font-size:12px;line-height:1.65;color:#596a61}
body[data-mms-admin-mb="v1"] .mms-admin .certs a{font-size:11.5px}
body[data-mms-admin-mb="v1"] .mms-admin .empty{font-size:13px}
body[data-mms-admin-mb="v1"] .mms-admin .branch-open span{font-size:9.5px}
body[data-mms-admin-mb="v1"] .mms-admin .branch-open strong{font-size:13px}
body[data-mms-admin-mb="v1"] .mms-admin .branch-open small{font-size:9px}
body[data-mms-admin-mb="v1"] .mms-admin .branch-next{font-size:12px}
body[data-mms-admin-mb="v1"] .mms-admin .sheet-head small{font-size:9.5px}
body[data-mms-admin-mb="v1"] .mms-admin .sheet-link span{font-size:10px}
body[data-mms-admin-mb="v1"] .mms-admin .sheet-link b{font-size:15px}
body[data-mms-admin-mb="v1"] .mms-admin .desktop-tab{font-size:12.5px}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-kicker{font-size:10px}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-head p{font-size:13px;line-height:1.65;color:rgba(255,253,248,.82)}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-refresh{font-size:12px}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-lane-head span{font-size:9.5px;color:#596a61}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-lane-head h4{font-size:18px;line-height:1.35}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-count{font-size:13px}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-item strong{font-size:14px;line-height:1.5}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-item p{font-size:12px;line-height:1.65;color:#53645a}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-item small{font-size:10.5px;line-height:1.5;color:#6a776f}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-pill{font-size:10px}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-empty{font-size:12.5px;line-height:1.65}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-lane-foot small{font-size:10px;color:#68766e}
body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-go{font-size:11.5px}
@media(min-width:768px){
  body[data-mms-admin-mb="v1"] .mms-admin .hero-lead{font-size:16px}
  body[data-mms-admin-mb="v1"] .mms-admin .hero-note{font-size:14px}
  body[data-mms-admin-mb="v1"] .mms-admin .section-head p{font-size:14px}
  body[data-mms-admin-mb="v1"] .mms-admin .record-main h3{font-size:19px}
  body[data-mms-admin-mb="v1"] .mms-admin .record-main p{font-size:13.5px}
  body[data-mms-admin-mb="v1"] .mms-admin .mms-ops-head h3{font-size:28px}
}
@media(prefers-reduced-motion:reduce){
  body[data-mms-admin-mb="v1"] .panel,body[data-mms-admin-mb="v1"] .record-edit[open] .editor{animation:none}
  body[data-mms-admin-mb="v1"] .record-card{transition:none}
}
</style>`;

const MB_UI = `<div class="mms-mb-topbar" id="mmsMbTopbar" aria-label="MMS mobile operations">
  <div class="mms-mb-title"><small>MMS · PARTNER OPERATIONS</small><strong id="mmsMbCurrent">ภาพรวม</strong></div>
  <div class="mms-mb-actions">
    <button class="mms-mb-icon" id="mmsMbRefresh" type="button" aria-label="รีเฟรชข้อมูล">↻</button>
    <button class="mms-mb-icon health" id="mmsMbHealth" type="button" aria-label="ตรวจระบบ MMS">✓</button>
  </div>
</div>`;

const MB_SCRIPT = `<script>(function(){
'use strict';
if(window.__MMS_ADMIN_MB_V1__)return;window.__MMS_ADMIN_MB_V1__=true;
var order=['overview','intake','applications','therapists','prebookings'];
var labels={overview:'ภาพรวม',intake:'รับข้อมูลใหม่',applications:'MMS Therapist Applications',therapists:'MMS Therapists',prebookings:'MMS Pre-booking'};
var current=document.getElementById('mmsMbCurrent');
var refreshButton=document.getElementById('mmsMbRefresh');
var healthButton=document.getElementById('mmsMbHealth');
function activeTab(){var active=document.querySelector('[data-branch-tab][aria-current="true"]');return active&&active.dataset?active.dataset.branchTab:'overview'}
function updateCurrent(){var id=activeTab();if(current&&current.textContent!==(labels[id]||id))current.textContent=labels[id]||id;var rail=document.getElementById('mmsMbRail');if(rail){rail.querySelectorAll('[data-mb-jump]').forEach(function(b){var next=b.dataset.mbJump===id?'true':'false';if(b.getAttribute('aria-current')!==next)b.setAttribute('aria-current',next)})}}
function jump(id){var target=document.querySelector('[data-branch-tab="'+id+'"]');if(target)target.click()}
function count(id){var el=document.getElementById(id),n=parseInt(el&&el.textContent||'0',10);return Number.isFinite(n)?n:0}
function lane(id,kicker,title,countId,alert){return '<button class="mms-mb-lane'+(alert?' is-alert':'')+'" type="button" data-mb-jump="'+id+'"><span><small>'+kicker+'</small><strong>'+title+'</strong></span><b data-mb-count="'+countId+'">'+count(countId)+'</b></button>'}
function installRail(){if(document.getElementById('mmsMbRail'))return;var anchor=document.querySelector('.stats');if(!anchor)return;var wrap=document.createElement('div');wrap.innerHTML='<div class="mms-mb-rail" id="mmsMbRail" aria-label="ทางลัดงาน MMS">'+lane('applications','REVIEW QUEUE','ใบสมัครที่ต้องตรวจ','pendingApps',count('pendingApps')>0)+lane('therapists','THERAPISTS','Therapist ทั้งหมด','therCount',false)+lane('prebookings','COORDINATION','Pre-booking ที่ยังเปิด','openPrebookings',count('openPrebookings')>0)+'</div><div class="mms-mb-swipe-hint">ปัดซ้าย–ขวาเพื่อดูงานแต่ละชั้น · แตะการ์ดเพื่อเปิดส่วนนั้น</div>';var rail=wrap.firstElementChild,hint=wrap.lastElementChild;anchor.insertAdjacentElement('afterend',hint);anchor.insertAdjacentElement('afterend',rail);rail.querySelectorAll('[data-mb-jump]').forEach(function(b){b.addEventListener('click',function(){jump(b.dataset.mbJump)})});updateCurrent()}
function updateCounts(){document.querySelectorAll('[data-mb-count]').forEach(function(el){var next=String(count(el.dataset.mbCount));if(el.textContent!==next)el.textContent=next;var laneEl=el.closest('.mms-mb-lane');if(laneEl&&(el.dataset.mbCount==='pendingApps'||el.dataset.mbCount==='openPrebookings'))laneEl.classList.toggle('is-alert',Number(next)>0)})}
function move(delta){var id=activeTab(),i=order.indexOf(id);if(i<0)i=0;var next=order[(i+delta+order.length)%order.length];jump(next)}
function interactive(target){return !!(target&&target.closest&&target.closest('button,a,input,select,textarea,summary,details,.stats,.mms-mb-rail,.filter-bar,.branch-sheet,.mms-diag-sheet'))}
var touch=null;
document.addEventListener('touchstart',function(e){if(window.innerWidth>=768||e.touches.length!==1||interactive(e.target)){touch=null;return}touch={x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});
document.addEventListener('touchend',function(e){if(!touch||window.innerWidth>=768||!e.changedTouches.length)return;var dx=e.changedTouches[0].clientX-touch.x,dy=e.changedTouches[0].clientY-touch.y;touch=null;if(Math.abs(dx)<82||Math.abs(dx)<Math.abs(dy)*1.35)return;move(dx<0?1:-1)},{passive:true});
if(refreshButton)refreshButton.addEventListener('click',function(){refreshButton.disabled=true;refreshButton.textContent='…';window.location.reload()});
if(healthButton)healthButton.addEventListener('click',function(){var dock=document.getElementById('mmsDiagDock');if(dock)dock.click()});
document.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('[data-branch-tab],.desktop-tab,[data-go],#branchNext,#branchPrev,#branchSheetNext'))setTimeout(updateCurrent,0)});
var countObserver=new MutationObserver(function(){updateCounts()});
['pendingApps','therCount','openPrebookings'].forEach(function(id){var source=document.getElementById(id);if(source)countObserver.observe(source,{subtree:true,childList:true,characterData:true})});
var tabObserver=new MutationObserver(function(){updateCurrent()});
document.querySelectorAll('[data-branch-tab]').forEach(function(source){tabObserver.observe(source,{attributes:true,attributeFilter:['aria-current']})});
installRail();updateCounts();updateCurrent();
})();</script>`;

export function wireMmsAdminMobileBundle(page = "") {
  let html = String(page || "");
  if (!html || html.includes(MARKER)) return html;
  if (!html.includes("MMS · Internal Operations")) return html;

  html = html.replace("<title>MMS · Internal Operations</title>", "<title>MMS Partner Operations</title>");
  html = html.replace("MMS · INTERNAL OPERATIONS", "MMS · PARTNER OPERATIONS");
  html = html.replace("<small>MMS · INTERNAL</small>", "<small>MMS · PARTNER OPS</small>");

  if (html.includes("<body>")) html = html.replace("<body>", '<body data-mms-admin-mb="v1">');
  else html = html.replace(/<body\b/, '<body data-mms-admin-mb="v1"');

  html = html.replace(/<link\b[^>]*\bdata-mms-admin-favicon\b[^>]*>/gi, "");
  html = html.replace(/<link\b[^>]*\brel=["'](?:shortcut\s+)?icon["'][^>]*>/gi, "");
  const headAddon = '<link data-mms-admin-favicon rel="icon" type="image/webp" href="' + INTERNAL_SIGIL_FAVICON + '">' + '<meta name="theme-color" content="#f3f3ec">' + MB_STYLE;
  if (html.includes("</head>")) html = html.replace("</head>", headAddon + "</head>");
  else html = headAddon + html;

  const bodyAddon = MB_UI + MB_SCRIPT + MARKER;
  if (html.includes("</body>")) html = html.replace("</body>", bodyAddon + "</body>");
  else html += bodyAddon;
  return html;
}

export const MMS_ADMIN_MB_MARKER = MARKER;