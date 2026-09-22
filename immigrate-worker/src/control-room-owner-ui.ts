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
const CONTROL_ROOM_CANON_SCRIPT = `<script data-mmd-control-room-canon-v3>(function(){var r=document.getElementById('mmd-os-v1');if(!r)return;document.documentElement.dataset.mmdSingleOwner='per-v1';document.documentElement.dataset.mmdCommandCenter='p0';r.dataset.mmdCommandCenter='p0';var brandSmall=r.querySelector('.brand small');if(brandSmall)brandSmall.textContent='PER · COMMAND CENTER';var tabs=Array.from(r.querySelectorAll('[data-tab]'));tabs.forEach(function(b){var n=b.getAttribute('data-tab');if(n==='ai'){b.remove();return}if(n==='queues')b.textContent='Do';if(n==='systems')b.textContent='Pages'});var ai=r.querySelector('[data-view="ai"]');if(ai)ai.remove();var ops=r.querySelector('[data-view="queues"]');if(ops){var k=ops.querySelector('.k'),h=ops.querySelector('h1'),p=ops.querySelector('.heading p:last-child');if(k)k.textContent='DO NEXT';if(h)h.textContent='งานที่เปอร์ต้องทำต่อ';if(p)p.textContent='AI ช่วยคัดสิ่งที่ค้างและเตรียม Action Card เปอร์กดยืนยันเฉพาะจุดสำคัญ'}var pages=r.querySelector('[data-view="systems"]');if(pages){var k2=pages.querySelector('.k'),h2=pages.querySelector('h1'),p2=pages.querySelector('.heading p:last-child');if(k2)k2.textContent='PAGES';if(h2)h2.textContent='หน้าที่เปอร์ใช้จริง';if(p2)p2.textContent='รวม canonical pages ที่ยังใช้งานจริง; หน้าประวัติหรือ technical อยู่ Advanced เมื่อจำเป็น'}var today=r.querySelector('[data-view="today"]');if(today){var k3=today.querySelector('.k'),h3=today.querySelector('h1'),p3=today.querySelector('.heading p');if(k3)k3.textContent='PER · COMMAND CENTER';if(h3)h3.textContent='วันนี้เปอร์ต้องทำอะไรบ้าง';if(p3)p3.textContent='Ask Per AI → Needs Per → Prepared → Watching แล้วพาไปทำต่อโดยไม่ต้องจำ route เอง'}var top=r.querySelector('.top');if(top&&!r.querySelector('[data-per-owner-strip]')){var strip=document.createElement('div');strip.setAttribute('data-per-owner-strip','v1');strip.innerHTML='<b>PER · OWNER MODE</b><span>AI อ่าน / สรุป / เช็ก / เตรียมให้ · เปอร์ยืนยันเอง · ไม่มี reviewer คนที่สอง</span>';top.insertAdjacentElement('afterend',strip);var s=document.createElement('style');s.textContent='[data-per-owner-strip]{margin:10px 0 0;padding:9px 11px;border:1px solid rgba(217,184,108,.2);border-radius:10px;background:rgba(217,184,108,.045);display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:#9b9387;font-size:8px;line-height:1.45}[data-per-owner-strip] b{color:#d9b86c;font-size:8px;letter-spacing:.08em}[data-per-owner-strip] span{color:#938b80}';document.head.appendChild(s)}var ceo=Array.from(r.querySelectorAll('a')).find(function(a){return a.getAttribute('href')==='/internal/ceo'&&/CEO/.test(a.textContent||'')});if(ceo)ceo.textContent='CEO ↗';Array.from(r.querySelectorAll('strong,h3')).forEach(function(n){if(n.textContent.trim()==='Admin Dashboard')n.textContent='Dashboard'});})();</script>`;

function canonicalizeOwnerControlRoom(html: string): string {
  return html
    .replace('<div class="g4">', `${MMD_OPERATIONS_FLOW}<div class="g4">`)
    .replace('</head>', `${MMD_OPERATIONS_STYLE}${CONTROL_ROOM_V2_STYLE}</head>`)
    .replace('<section class="view" data-view="today">', `<section class="view" data-view="today">${CONTROL_ROOM_V2_PANEL}`)
    .replaceAll("/internal/admin/jobs/create-session", "/internal/admin/jobs/create-job")
    .replaceAll("Create Session", "Create Job")
    .replaceAll("<span>SESSION</span>", "<span>JOB</span>")
    .replaceAll("เริ่ม session จาก canonical client", "เริ่ม Job จาก canonical client")
    .replaceAll("/internal/ceo/dashboard", "/internal/ceo")
    .replaceAll("MMD PRIVÉ · OWNER CONTROL ROOM · 05 SEP 2026", "MMD PRIVÉ · OWNER CONTROL ROOM · 07 SEP 2026")
    .replace("</body>", `${CONTROL_ROOM_CANON_SCRIPT}${CONTROL_ROOM_V2_SCRIPT}${AI_OPS_SCRIPT}${SAFETY_LOCATION_UI_SCRIPT}</body>`);
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
