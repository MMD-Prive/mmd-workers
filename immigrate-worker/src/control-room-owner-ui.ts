import { renderOwnerControlRoomPage as renderLegacyOwnerControlRoomPage } from "./control-room-owner-ui-legacy";
import { MMD_OPERATIONS_FLOW, MMD_OPERATIONS_STYLE } from "./control-room-mmd-flow";

const encoder = new TextEncoder();
const AI_OPS_SCRIPT = '<script src="/v1/admin/ai-ops/client.js?v=3" defer data-mmd-ai-ops-script="v3"></script>';
const SAFETY_LOCATION_UI_COMMIT = "7e00a7696c9c8bd6bbd28408c9cb8617961fd78d";
const SAFETY_LOCATION_UI_SCRIPT = `<script src="https://cdn.jsdelivr.net/gh/MMD-Prive/mmd-workers@${SAFETY_LOCATION_UI_COMMIT}/webflow/internal/admin/control-room/safety-location-control-v1.js" defer data-mmd-control-room-safety-location="v1"></script>`;
const CONTROL_ROOM_V2_STYLE = `<style data-mmd-control-room-v2-style>
[data-mmd-control-room-v2]{margin:0 0 14px;padding:14px;border:1px solid rgba(217,184,108,.22);border-radius:16px;background:linear-gradient(145deg,rgba(217,184,108,.07),rgba(255,255,255,.025));box-shadow:0 18px 52px rgba(0,0,0,.18)}
[data-mmd-control-room-v2] .v2h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
[data-mmd-control-room-v2] .v2k{color:#d9b86c;font-size:8px;font-weight:900;letter-spacing:.12em}
[data-mmd-control-room-v2] h2{margin:5px 0 0;font-size:22px;letter-spacing:-.03em}
[data-mmd-control-room-v2] .v2overall{padding:6px 9px;border:1px solid #3b3429;border-radius:999px;color:#d9d2c5;font-size:8px;font-weight:900}
[data-mmd-control-room-v2] .v2overall[data-status="ok"]{border-color:#29533b;color:#aee2bf}
[data-mmd-control-room-v2] .v2overall[data-status="degraded"]{border-color:#645126;color:#f1d18b}
[data-mmd-control-room-v2] .v2overall[data-status="action_needed"]{border-color:#6a3333;color:#ffb4b4}
[data-mmd-control-room-v2] .v2grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:11px}
[data-mmd-control-room-v2] .v2card{min-height:92px;padding:10px;border:1px solid #2d2a25;border-radius:12px;background:#0f0e0c;color:#eee;text-decoration:none}
[data-mmd-control-room-v2] .v2top{display:flex;justify-content:space-between;gap:8px;align-items:center}
[data-mmd-control-room-v2] .v2name{font-size:10px;font-weight:850}
[data-mmd-control-room-v2] .v2state{font-size:7px;font-weight:900;letter-spacing:.06em;color:#b5b0a6}
[data-mmd-control-room-v2] .v2card[data-status="ok"] .v2state{color:#9fddb3}
[data-mmd-control-room-v2] .v2card[data-status="degraded"] .v2state{color:#e7c677}
[data-mmd-control-room-v2] .v2card[data-status="action_needed"] .v2state{color:#ff9f9f}
[data-mmd-control-room-v2] .v2evidence{display:inline-block;margin-top:7px;padding:3px 5px;border-radius:999px;background:#191714;color:#8f887b;font-size:6px;font-weight:900;letter-spacing:.07em}
[data-mmd-control-room-v2] .v2detail{margin-top:6px;color:#8f8b83;font-size:8px;line-height:1.45}
[data-mmd-control-room-v2] .v2watch{margin-top:8px;padding:9px 10px;border:1px dashed #40372a;border-radius:11px;display:flex;justify-content:space-between;gap:10px;align-items:center}
[data-mmd-control-room-v2] .v2watch b{font-size:9px}.v2watch span{display:block;margin-top:2px;color:#8f887b;font-size:7px}.v2watch button{border:1px solid #594823;border-radius:999px;background:#171309;color:#dfc27d;padding:7px 9px;font:800 7px/1 inherit;cursor:pointer}
@media(min-width:760px){[data-mmd-control-room-v2] .v2grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
</style>`;

const CONTROL_ROOM_V2_PANEL = `<section data-mmd-control-room-v2="system-health-v1" aria-label="MMD system health">
  <div class="v2h"><div><div class="v2k">SYSTEM HEALTH · V2</div><h2>Production truth at a glance</h2></div><span class="v2overall" data-v2-overall data-status="degraded">CHECKING</span></div>
  <div class="v2grid" data-v2-systems><div class="v2card" data-status="degraded"><div class="v2top"><span class="v2name">Loading</span><span class="v2state">CHECKING</span></div><div class="v2detail">กำลังอ่าน authenticated dashboard truth…</div></div></div>
  <div class="v2watch"><div><b>HYPE / STUCK / SLA</b><span data-v2-watch>อ่านผ่าน AI Ops on demand · ไม่เพิ่ม Airtable reads ตอนเปิดหน้า</span></div><button type="button" data-v2-open-ai>OPEN AI OPS</button></div>
</section>`;

const CONTROL_ROOM_V2_SCRIPT = `<script data-mmd-control-room-v2-script="system-health-v1">(function(){'use strict';var root=document.querySelector('[data-mmd-control-room-v2]');if(!root)return;var q=function(s){return root.querySelector(s)},esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]})};function label(s){return s==='ok'?'OK':s==='action_needed'?'ACTION NEEDED':'DEGRADED'}function evidence(v){return v==='live'?'LIVE':v==='production_acceptance'?'PROD ACCEPTED':String(v||'OBSERVED').replace(/_/g,' ').toUpperCase()}function render(d){var v=d&&d.control_room_v2;if(!v)return;var overall=q('[data-v2-overall]');if(overall){overall.dataset.status=v.overall_status||'degraded';overall.textContent=label(v.overall_status)}var grid=q('[data-v2-systems]');if(grid&&Array.isArray(v.systems)){grid.innerHTML=v.systems.map(function(x){var tag=x.href?'a':'div',href=x.href?' href="'+esc(x.href)+'"':'';return'<'+tag+' class="v2card" data-status="'+esc(x.status||'degraded')+'"'+href+'><div class="v2top"><span class="v2name">'+esc(x.label||x.key)+'</span><span class="v2state">'+label(x.status)+'</span></div><span class="v2evidence">'+evidence(x.evidence_type)+'</span><div class="v2detail">'+esc(x.detail||x.source||'')+'</div></'+tag+'>'}).join('')}var watch=q('[data-v2-watch]');if(watch&&v.operational_watch)watch.textContent=v.operational_watch.detail||'AI Ops on demand'}document.documentElement.dataset.mmdControlRoomV2='system-health-v1'}document.addEventListener('mmd:control-room:dashboard',function(e){render(e.detail)});if(window.__mmdControlRoomDashboard)render(window.__mmdControlRoomDashboard);var open=q('[data-v2-open-ai]');if(open)open.onclick=function(){var b=document.querySelector('.mmd-aiops-btn');if(b)b.click()}})();</script>`;
const OWNER_ANALYTICS_STYLE = `<style data-mmd-owner-analytics-style="v1">
[data-mmd-owner-analytics]{margin:0 0 14px;padding:14px;border:1px solid rgba(112,168,217,.22);border-radius:16px;background:linear-gradient(145deg,rgba(71,124,170,.075),rgba(255,255,255,.02));box-shadow:0 18px 52px rgba(0,0,0,.16)}
[data-mmd-owner-analytics] .oah{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
[data-mmd-owner-analytics] .oak{color:#8fc6ef;font-size:8px;font-weight:900;letter-spacing:.12em}
[data-mmd-owner-analytics] h2{margin:5px 0 2px;font-size:21px;letter-spacing:-.03em}
[data-mmd-owner-analytics] .oasub{color:#8d9297;font-size:8px;line-height:1.45;max-width:720px}
[data-mmd-owner-analytics] .oastate{padding:6px 9px;border:1px solid #3b4146;border-radius:999px;color:#c8d0d7;font-size:7px;font-weight:900;letter-spacing:.06em}
[data-mmd-owner-analytics] .oastate[data-state="connected"]{border-color:#29533b;color:#aee2bf}
[data-mmd-owner-analytics] .oastate[data-state="partial"]{border-color:#645126;color:#f1d18b}
[data-mmd-owner-analytics] .oagrid{display:grid;grid-template-columns:1fr;gap:8px;margin-top:11px}
[data-mmd-owner-analytics] .oasection{padding:11px;border:1px solid #292d30;border-radius:13px;background:#0d0f10}
[data-mmd-owner-analytics] .oasection h3{margin:0 0 3px;font-size:10px;color:#f1f3f5}.oasection .oameta{font-size:7px;color:#747c82;line-height:1.4}
[data-mmd-owner-analytics] .oametrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:9px}
[data-mmd-owner-analytics] .oametric{padding:8px;border:1px solid #252a2d;border-radius:10px;background:#111416}
[data-mmd-owner-analytics] .oametric small{display:block;color:#7c858c;font-size:6px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
[data-mmd-owner-analytics] .oametric b{display:block;margin-top:3px;color:#f4f6f7;font-size:15px}.oametric span{display:block;margin-top:2px;color:#697178;font-size:6px}
[data-mmd-owner-analytics] .oahealth{display:flex;align-items:baseline;gap:7px;margin-top:8px}.oahealth b{font-size:24px;color:#aee2bf}.oahealth span{font-size:8px;color:#7e878e}
[data-mmd-owner-analytics] .oafoot{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-top:9px;color:#6e777e;font-size:7px;line-height:1.4}
[data-mmd-owner-analytics] .oafoot a{color:#9bcdf0;text-decoration:none;font-weight:850}
@media(min-width:760px){[data-mmd-owner-analytics] .oagrid{grid-template-columns:1fr 1.35fr .7fr}[data-mmd-owner-analytics] .oametrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>`;

const OWNER_ANALYTICS_PANEL = `<section data-mmd-owner-analytics="v1" aria-label="MMD owner analytics">
  <div class="oah"><div><div class="oak">ANALYTICS · OWNER</div><h2>Intent ≠ Business Truth</h2><div class="oasub">Intent ใช้ client identity · Business Truth ใช้ server authority · ไม่คำนวณ conversion ข้าม identity โดยเดาเอง</div></div><span class="oastate" data-oa-state data-state="partial">CHECKING</span></div>
  <div class="oagrid">
    <article class="oasection"><h3>Intent</h3><div class="oameta">Client-side · 30 วัน · person funnel เฉพาะ event ที่ join กันได้</div><div class="oametrics"><div class="oametric"><small>Profile viewed</small><b data-oa-intent-profile>—</b><span>30d</span></div><div class="oametric"><small>Booking started</small><b data-oa-intent-booking>—</b><span>30d</span></div><div class="oametric"><small>Payment started</small><b data-oa-intent-payment>—</b><span>global intent</span></div><div class="oametric"><small>MY MMD login</small><b data-oa-intent-login>—</b><span>client start</span></div></div></article>
    <article class="oasection"><h3>Business Truth</h3><div class="oameta">Server authority · ไม่ใช้ browser event เป็น completion</div><div class="oametrics"><div class="oametric"><small>Booking received</small><b data-oa-truth-booking>—</b><span>30d</span></div><div class="oametric"><small>Payment verified</small><b data-oa-truth-payment>—</b><span>30d</span></div><div class="oametric"><small>Verified revenue</small><b data-oa-truth-revenue>—</b><span>THB · 30d</span></div><div class="oametric"><small>Membership active</small><b data-oa-truth-membership>—</b><span>30d</span></div><div class="oametric"><small>MY MMD session</small><b data-oa-truth-session>—</b><span>30d</span></div><div class="oametric"><small>MMS prebooking</small><b data-oa-truth-mms>—</b><span>30d</span></div><div class="oametric"><small>Shop order</small><b data-oa-truth-shop>—</b><span>30d</span></div><div class="oametric"><small>Partner accepted</small><b data-oa-truth-partner>—</b><span>30d</span></div></div></article>
    <article class="oasection"><h3>Authority Health</h3><div class="oameta">Operational only · ไม่ใช่ conversion</div><div class="oahealth"><b data-oa-health>—</b><span>authorities healthy / 6</span></div><div class="oameta" data-oa-health-note>กำลังอ่าน PostHog authority health…</div></article>
  </div>
  <div class="oafoot"><span data-oa-note>Unobserved event = — · ไม่ตีความเป็น 0</span><a href="https://us.posthog.com/project/621022/insights" target="_blank" rel="noopener">POSTHOG ↗</a></div>
</section>`;

const OWNER_ANALYTICS_SCRIPT = `<script data-mmd-owner-analytics-script="v1">(function(){'use strict';var root=document.querySelector('[data-mmd-owner-analytics]');if(!root)return;var q=function(s){return root.querySelector(s)},num=function(v){var n=Number(v);return Number.isFinite(n)&&n>=0?n:null},fmt=function(v){var n=num(v);return n===null?'—':n.toLocaleString('en-US')},money=function(v){var n=num(v);return n===null?'—':'฿'+Math.round(n).toLocaleString('en-US')},set=function(s,v){var e=q(s);if(e)e.textContent=v},metric=function(d,k){return d&&d.business_truth&&d.business_truth.metrics?d.business_truth.metrics[k]:null};function eventCount(x){return x&&x.observed===true?x.events_30d:null}function render(d){var state=q('[data-oa-state]'),st=String(d&&d.state||'query_unavailable');if(state){state.dataset.state=st;state.textContent=st==='connected'?'LIVE':st==='partial'?'PARTIAL':st==='read_scope_missing'?'READ SCOPE NEEDED':'UNAVAILABLE'}var intent=d&&d.intent||{},pub=intent.funnels&&intent.funnels.public_profile_to_booking_start,steps=pub&&Array.isArray(pub.steps)?pub.steps:[],stand=intent.standalone||{},login=intent.funnels&&intent.funnels.my_mmd_login_intent,loginSteps=login&&Array.isArray(login.steps)?login.steps:[];set('[data-oa-intent-profile]',fmt(eventCount(steps[0])));set('[data-oa-intent-booking]',fmt(eventCount(steps[1])));set('[data-oa-intent-payment]',fmt(eventCount(stand.payment_started)));set('[data-oa-intent-login]',fmt(eventCount(loginSteps[1])));set('[data-oa-truth-booking]',fmt(eventCount(metric(d,'booking_received'))));set('[data-oa-truth-payment]',fmt(eventCount(metric(d,'payment_verified'))));var rev=metric(d,'payment_verified_thb');set('[data-oa-truth-revenue]',money(rev&&rev.observed===true?rev.amount_30d:null));set('[data-oa-truth-membership]',fmt(eventCount(metric(d,'membership_activated'))));set('[data-oa-truth-session]',fmt(eventCount(metric(d,'my_mmd_session_started'))));set('[data-oa-truth-mms]',fmt(eventCount(metric(d,'mms_prebooking_received'))));set('[data-oa-truth-shop]',fmt(eventCount(metric(d,'shop_order_created'))));set('[data-oa-truth-partner]',fmt(eventCount(metric(d,'partner_terms_accepted'))));var h=d&&d.operational_health;set('[data-oa-health]',h&&h.state==='connected'?fmt(h.healthy)+'/'+fmt(h.required):'—');set('[data-oa-health-note]',h&&h.state==='connected'?(h.status==='ok'?'ครบทุก authority':'มี authority ขาด health event'):(st==='read_scope_missing'?'รอ PostHog read scope · runtime ไม่ใช้ ingest token อ่านข้อมูล':'PostHog aggregate read unavailable'));var note=q('[data-oa-note]');if(note)note.textContent=st==='read_scope_missing'?'Dashboard contract พร้อม · รอ read scope เพื่อเติม aggregate จริง':'Unobserved event = — · ไม่ตีความเป็น 0';document.documentElement.dataset.mmdOwnerAnalytics='v1'}async function load(){try{var r=await fetch('/v1/admin/dashboard/analytics',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});if(r.status===401||r.status===403)return;var d=await r.json();if(r.ok&&d&&d.ok!==false)render(d)}catch(_){}}load();})();</script>`;

const OWNER_ACTIONS_STYLE = `<style data-mmd-owner-actions-style="v1">
[data-mmd-owner-actions]{margin:0 0 14px;padding:14px;border:1px solid rgba(217,184,108,.24);border-radius:16px;background:linear-gradient(145deg,rgba(217,184,108,.07),rgba(255,255,255,.02));box-shadow:0 18px 52px rgba(0,0,0,.16)}
[data-mmd-owner-actions] .oaqh{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
[data-mmd-owner-actions] .oaqk{color:#d9b86c;font-size:8px;font-weight:900;letter-spacing:.12em}
[data-mmd-owner-actions] h2{margin:5px 0 2px;font-size:21px;letter-spacing:-.03em}
[data-mmd-owner-actions] .oaqsub{color:#999085;font-size:8px;line-height:1.45;max-width:720px}
[data-mmd-owner-actions] .oaqstate{padding:6px 9px;border:1px solid #4c4030;border-radius:999px;color:#dec990;font-size:7px;font-weight:900;letter-spacing:.06em}
[data-mmd-owner-actions] .oaqstate[data-state="ready"]{border-color:#29533b;color:#aee2bf}
[data-mmd-owner-actions] .oaqstate[data-state="restricted"]{border-color:#645126;color:#f1d18b}
[data-mmd-owner-actions] .oaqgrid{display:grid;grid-template-columns:1fr;gap:8px;margin-top:11px}
[data-mmd-owner-actions] .oaqlist,[data-mmd-owner-actions] .oaqdetail{padding:10px;border:1px solid #302a21;border-radius:13px;background:#0d0c0a}
[data-mmd-owner-actions] .oaqrow{width:100%;display:flex;justify-content:space-between;gap:9px;align-items:center;padding:10px;border:1px solid #2e291f;border-radius:10px;background:#14120e;color:#f4eee2;text-align:left;font:inherit;cursor:pointer}
[data-mmd-owner-actions] .oaqrow+.oaqrow{margin-top:6px}
[data-mmd-owner-actions] .oaqrow:hover,[data-mmd-owner-actions] .oaqrow.is-active{border-color:#866c36;background:#1b170f}
[data-mmd-owner-actions] .oaqrow strong{display:block;font-size:10px}.oaqrow small{display:block;margin-top:3px;color:#938a7d;font-size:7px;line-height:1.4}
[data-mmd-owner-actions] .oaqcount{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:#d9b86c;color:#171108;font-size:10px;font-weight:950}
[data-mmd-owner-actions] .oaqlabel{color:#d9b86c;font-size:7px;font-weight:900;letter-spacing:.08em}
[data-mmd-owner-actions] .oaqdetail h3{margin:5px 0 5px;font-size:14px;color:#fff8e9}.oaqdetail p{margin:0;color:#aaa194;font-size:8px;line-height:1.55}
[data-mmd-owner-actions] .oaqfacts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:9px}.oaqfact{padding:7px;border:1px solid #2b271f;border-radius:9px;background:#12100d}.oaqfact small{display:block;color:#887d6d;font-size:6px;font-weight:900;letter-spacing:.07em}.oaqfact b{display:block;margin-top:3px;color:#eee5d6;font-size:8px;line-height:1.35}
[data-mmd-owner-actions] .oaqsource{display:inline-flex;margin-top:10px;padding:7px 9px;border:1px solid #705b2e;border-radius:999px;color:#e4c982;text-decoration:none;font-size:7px;font-weight:900}
[data-mmd-owner-actions] .oaqempty{color:#91887c;font-size:8px;line-height:1.55;padding:4px}
[data-mmd-owner-actions] .oaqfoot{margin-top:9px;color:#80776c;font-size:7px;line-height:1.45}
@media(min-width:760px){[data-mmd-owner-actions] .oaqgrid{grid-template-columns:minmax(220px,.9fr) minmax(280px,1.25fr)}}
</style>`;

const OWNER_ACTIONS_PANEL = `<section data-mmd-owner-actions="v1" aria-label="Owner actions">
  <div class="oaqh"><div><div class="oaqk">OWNER ACTIONS · READ ONLY</div><h2>วันนี้ควรเคลียร์อะไร</h2><div class="oaqsub">AI สรุปสิ่งที่ต้องดู · เปอร์ตัดสินใจในหน้าต้นทาง · หน้านี้ไม่เปลี่ยนสถานะใด</div></div><span class="oaqstate" data-oaq-state data-state="loading">CHECKING</span></div>
  <div class="oaqgrid"><div class="oaqlist" data-oaq-list><div class="oaqempty">กำลังอ่าน Owner Actions…</div></div><article class="oaqdetail" data-oaq-detail><div class="oaqlabel">DETAIL</div><h3>เลือกรายการเพื่อดูบริบท</h3><p>รายละเอียดจะบอกเหตุผล authority และขอบเขตการตัดสินใจ โดยไม่แสดงข้อมูลรายบุคคล</p></article></div>
  <div class="oaqfoot">Read-only · ไม่มีการส่งข้อความ · ไม่มีการอนุมัติหรือเปลี่ยน Business Truth</div>
</section>`;

const OWNER_ACTIONS_SCRIPT = `<script data-mmd-owner-actions-script="v1">(function(){'use strict';var root=document.querySelector('[data-mmd-owner-actions]');if(!root)return;var q=function(s){return root.querySelector(s)},esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[ch]})},safeHref=function(v){v=String(v||'');return v.indexOf('/internal/')===0?v:'/internal/admin/control-room'},state=q('[data-oaq-state]'),list=q('[data-oaq-list]'),detail=q('[data-oaq-detail]');function setState(label,kind){if(state){state.textContent=label;state.dataset.state=kind||'loading'}}function renderDetail(d){var a=d&&d.action,x=d&&d.drilldown;if(!a||!x)return;detail.innerHTML='<div class="oaqlabel">'+esc(x.urgency||'attention').toUpperCase()+' · '+esc(x.authority||'owner')+'</div><h3>'+esc(a.title||'Owner action')+'</h3><p>'+esc(x.reason||a.summary||'')+'</p><div class="oaqfacts"><div class="oaqfact"><small>ต้องดู</small><b>'+esc(x.observed_count) +' รายการ</b></div><div class="oaqfact"><small>AUTHORITY</small><b>'+esc(x.authority||'—')+'</b></div></div><div class="oaqlabel" style="margin-top:10px">ขอบเขตการตัดสินใจ</div><p>'+esc(x.decision_boundary||'เปิดหน้าต้นทางเพื่อตรวจต่อ')+'</p><a class="oaqsource" href="'+esc(safeHref(x.source_surface))+'">เปิดหน้าต้นทาง ↗</a>'}async function open(action,button){if(!action||!action.detail_href)return;Array.prototype.forEach.call(root.querySelectorAll('.oaqrow'),function(x){x.classList.toggle('is-active',x===button)});detail.innerHTML='<div class="oaqempty">กำลังอ่านรายละเอียด…</div>';try{var r=await fetch(action.detail_href,{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});if(r.status===401||r.status===403){setState('OWNER ONLY','restricted');detail.innerHTML='<div class="oaqempty">รายละเอียดนี้เปิดได้เฉพาะ Owner session</div>';return}var d=await r.json().catch(function(){return null});if(!r.ok||!d||d.ok!==true)throw new Error('detail_unavailable');renderDetail(d)}catch(_){detail.innerHTML='<div class="oaqempty">ยังอ่านรายละเอียดไม่ได้ · ลองโหลดใหม่อีกครั้ง</div>'}}function render(d){var actions=Array.isArray(d&&d.actions)?d.actions:[];setState(actions.length?'READY':'CLEAR', 'ready');if(!actions.length){list.innerHTML='<div class="oaqempty">ตอนนี้ยังไม่มีรายการที่ต้องดู</div>';return}list.innerHTML=actions.map(function(a){return'<button type="button" class="oaqrow" data-key="'+esc(a.action_key)+'"><span><strong>'+esc(a.title||'รายการที่ต้องดู')+'</strong><small>'+esc(a.summary||'')+'</small></span><span class="oaqcount">'+esc(a.count)+'</span></button>'}).join('');Array.prototype.forEach.call(list.querySelectorAll('.oaqrow'),function(b){b.onclick=function(){var key=b.getAttribute('data-key');open(actions.filter(function(a){return a.action_key===key})[0],b)}})}async function load(){try{var r=await fetch('/v1/admin/dashboard/owner-actions',{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});if(r.status===401||r.status===403){setState('OWNER ONLY','restricted');list.innerHTML='<div class="oaqempty">Owner Actions เปิดได้เฉพาะ Owner session</div>';return}var d=await r.json().catch(function(){return null});if(!r.ok||!d||d.ok!==true)throw new Error('queue_unavailable');render(d)}catch(_){setState('UNAVAILABLE','restricted');list.innerHTML='<div class="oaqempty">ยังอ่าน Owner Actions ไม่ได้ · ไม่แสดงข้อมูลเดาแทน</div>'}}load()})();</script>`;

const CONTROL_ROOM_CANON_SCRIPT = `<script data-mmd-control-room-canon-v3>(function(){var r=document.getElementById('mmd-os-v1');if(!r)return;document.documentElement.dataset.mmdSingleOwner='per-v1';document.documentElement.dataset.mmdCommandCenter='p0';r.dataset.mmdCommandCenter='p0';var brandSmall=r.querySelector('.brand small');if(brandSmall)brandSmall.textContent='PER · COMMAND CENTER';var tabs=Array.from(r.querySelectorAll('[data-tab]'));tabs.forEach(function(b){var n=b.getAttribute('data-tab');if(n==='ai'){b.remove();return}if(n==='queues')b.textContent='Do';if(n==='systems')b.textContent='Pages'});var ai=r.querySelector('[data-view="ai"]');if(ai)ai.remove();var ops=r.querySelector('[data-view="queues"]');if(ops){var k=ops.querySelector('.k'),h=ops.querySelector('h1'),p=ops.querySelector('.heading p:last-child');if(k)k.textContent='DO NEXT';if(h)h.textContent='งานที่เปอร์ต้องทำต่อ';if(p)p.textContent='AI ช่วยคัดสิ่งที่ค้างและเตรียม Action Card เปอร์กดยืนยันเฉพาะจุดสำคัญ'}var pages=r.querySelector('[data-view="systems"]');if(pages){var k2=pages.querySelector('.k'),h2=pages.querySelector('h1'),p2=pages.querySelector('.heading p:last-child');if(k2)k2.textContent='PAGES';if(h2)h2.textContent='หน้าที่เปอร์ใช้จริง';if(p2)p2.textContent='รวม canonical pages ที่ยังใช้งานจริง; หน้าประวัติหรือ technical อยู่ Advanced เมื่อจำเป็น'}var today=r.querySelector('[data-view="today"]');if(today){var k3=today.querySelector('.k'),h3=today.querySelector('h1'),p3=today.querySelector('.heading p');if(k3)k3.textContent='PER · COMMAND CENTER';if(h3)h3.textContent='วันนี้เปอร์ต้องทำอะไรบ้าง';if(p3)p3.textContent='Ask Per AI → Needs Per → Prepared → Watching แล้วพาไปทำต่อโดยไม่ต้องจำ route เอง'}var top=r.querySelector('.top');if(top&&!r.querySelector('[data-per-owner-strip]')){var strip=document.createElement('div');strip.setAttribute('data-per-owner-strip','v1');strip.innerHTML='<b>PER · OWNER MODE</b><span>AI อ่าน / สรุป / เช็ก / เตรียมให้ · เปอร์ยืนยันเอง · ไม่มี reviewer คนที่สอง</span>';top.insertAdjacentElement('afterend',strip);var s=document.createElement('style');s.textContent='[data-per-owner-strip]{margin:10px 0 0;padding:9px 11px;border:1px solid rgba(217,184,108,.2);border-radius:10px;background:rgba(217,184,108,.045);display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:#9b9387;font-size:8px;line-height:1.45}[data-per-owner-strip] b{color:#d9b86c;font-size:8px;letter-spacing:.08em}[data-per-owner-strip] span{color:#938b80}';document.head.appendChild(s)}var ceo=Array.from(r.querySelectorAll('a')).find(function(a){return a.getAttribute('href')==='/internal/ceo'&&/CEO/.test(a.textContent||'')});if(ceo)ceo.textContent='CEO ↗';Array.from(r.querySelectorAll('strong,h3')).forEach(function(n){if(n.textContent.trim()==='Admin Dashboard')n.textContent='Dashboard'});})();</script>`;

function canonicalizeOwnerControlRoom(html: string): string {
  return html
    .replace('<div class="g4">', `${MMD_OPERATIONS_FLOW}<div class="g4">`)
    .replace('</head>', `${MMD_OPERATIONS_STYLE}${CONTROL_ROOM_V2_STYLE}${OWNER_ANALYTICS_STYLE}${OWNER_ACTIONS_STYLE}</head>`)
    .replace('<section class="view" data-view="today">', `<section class="view" data-view="today">${CONTROL_ROOM_V2_PANEL}${OWNER_ANALYTICS_PANEL}${OWNER_ACTIONS_PANEL}`)
    .replaceAll("/internal/admin/jobs/create-session", "/internal/admin/jobs/create-job")
    .replaceAll("Create Session", "Create Job")
    .replaceAll("<span>SESSION</span>", "<span>JOB</span>")
    .replaceAll("เริ่ม session จาก canonical client", "เริ่ม Job จาก canonical client")
    .replaceAll("/internal/ceo/dashboard", "/internal/ceo")
    .replaceAll("MMD PRIVÉ · OWNER CONTROL ROOM · 05 SEP 2026", "MMD PRIVÉ · OWNER CONTROL ROOM · 07 SEP 2026")
    .replace("</body>", `${CONTROL_ROOM_CANON_SCRIPT}${CONTROL_ROOM_V2_SCRIPT}${OWNER_ANALYTICS_SCRIPT}${OWNER_ACTIONS_SCRIPT}${AI_OPS_SCRIPT}${SAFETY_LOCATION_UI_SCRIPT}</body>`);
}

export function renderOwnerControlRoomPage(): Response {
  const legacy = renderLegacyOwnerControlRoomPage();
  const headers = new Headers(legacy.headers);
  headers.delete("content-length");
  headers.set("x-mmd-control-room-operator-object", "job");
  headers.set("x-mmd-control-room-create-route", "/internal/admin/jobs/create-job");
  headers.set("x-mmd-control-room-canon", "single-owner-v1");
  headers.set("x-mmd-control-room-human-operator", "per");
  headers.set("x-mmd-control-room-review-model", "ai-checks-per-confirms");
  headers.set("x-mmd-command-center", "p0");
  headers.set("x-mmd-command-center-flow", "ask-needs-per-prepared-watching");
  headers.set("x-mmd-ai-ops-layer", "v3");
  headers.set("x-mmd-control-room-safety-location", "v1");
  headers.set("x-mmd-control-room-mmd-flow", "20260922");
  headers.set("x-mmd-control-room-v2", "system-health-v1");
  headers.set("x-mmd-owner-analytics", "intent-truth-v1");
  headers.set("x-mmd-owner-actions", "queue-detail-read-only-v1");
  headers.set("x-mmd-control-room-phase1", "closed");

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const html = await legacy.text();
        controller.enqueue(encoder.encode(canonicalizeOwnerControlRoom(html)));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(body, {
    status: legacy.status,
    statusText: legacy.statusText,
    headers,
  });
}
