import { renderOwnerControlRoomPage as renderLegacyOwnerControlRoomPage } from "./control-room-owner-ui-legacy";

const encoder = new TextEncoder();
const AI_OPS_SCRIPT = '<script src="/v1/admin/ai-ops/client.js?v=3" defer data-mmd-ai-ops-script="v3"></script>';
const CONTROL_ROOM_CANON_SCRIPT = `<script data-mmd-control-room-canon-v3>(function(){var r=document.getElementById('mmd-os-v1');if(!r)return;document.documentElement.dataset.mmdSingleOwner='per-v1';var tabs=Array.from(r.querySelectorAll('[data-tab]'));tabs.forEach(function(b){var n=b.getAttribute('data-tab');if(n==='ai'){b.remove();return}if(n==='queues')b.textContent='Do';if(n==='systems')b.textContent='Pages'});var ai=r.querySelector('[data-view="ai"]');if(ai)ai.remove();var ops=r.querySelector('[data-view="queues"]');if(ops){var k=ops.querySelector('.k'),h=ops.querySelector('h1'),p=ops.querySelector('.heading p:last-child');if(k)k.textContent='DO NEXT';if(h)h.textContent='งานที่เปอร์ต้องทำต่อ';if(p)p.textContent='AI ช่วยคัดสิ่งที่ค้างและบอกทางไปต่อ เปอร์กดยืนยันเฉพาะจุดสำคัญ'}var pages=r.querySelector('[data-view="systems"]');if(pages){var k2=pages.querySelector('.k'),h2=pages.querySelector('h1'),p2=pages.querySelector('.heading p:last-child');if(k2)k2.textContent='PAGES';if(h2)h2.textContent='หน้าที่เปอร์ใช้จริง';if(p2)p2.textContent='รวม canonical pages ที่ยังใช้งานจริง; หน้าประวัติหรือ technical อยู่ Advanced เมื่อจำเป็น'}r.querySelectorAll('a[href="/internal/ceo/dashboard"]').forEach(function(a){a.href='/internal/ceo'});var today=r.querySelector('[data-view="today"]');if(today){var k3=today.querySelector('.k'),h3=today.querySelector('h1'),p3=today.querySelector('.heading p');if(k3&&k3.textContent.indexOf('TODAY')===0)k3.textContent='TODAY · PER';if(h3)h3.textContent='วันนี้เปอร์ต้องทำอะไรบ้าง';if(p3)p3.textContent='ดูเฉพาะเรื่องที่ควรรู้ สิ่งที่ต้องตัดสินใจ และทางไปทำต่อ โดยไม่ต้องจำ route เอง'}var top=r.querySelector('.top');if(top&&!r.querySelector('[data-per-owner-strip]')){var strip=document.createElement('div');strip.setAttribute('data-per-owner-strip','v1');strip.innerHTML='<b>PER · OWNER MODE</b><span>AI อ่าน / สรุป / เช็กให้ · เปอร์ยืนยันเอง · ไม่มี reviewer คนที่สอง</span>';top.insertAdjacentElement('afterend',strip);var s=document.createElement('style');s.textContent='[data-per-owner-strip]{margin:10px 0 0;padding:9px 11px;border:1px solid rgba(217,184,108,.2);border-radius:10px;background:rgba(217,184,108,.045);display:flex;gap:10px;align-items:center;flex-wrap:wrap;color:#9b9387;font-size:8px;line-height:1.45}[data-per-owner-strip] b{color:#d9b86c;font-size:8px;letter-spacing:.08em}[data-per-owner-strip] span{color:#938b80}';document.head.appendChild(s)}var ceo=Array.from(r.querySelectorAll('a')).find(function(a){return a.getAttribute('href')==='/internal/ceo'&&/CEO/.test(a.textContent||'')});if(ceo)ceo.textContent='CEO ↗';Array.from(r.querySelectorAll('strong,h3')).forEach(function(n){if(n.textContent.trim()==='Admin Dashboard')n.textContent='Dashboard'});})();</script>`;

function canonicalizeOwnerControlRoom(html: string): string {
  return html
    .replaceAll("/internal/admin/jobs/create-session", "/internal/admin/jobs/create-job")
    .replaceAll("Create Session", "Create Job")
    .replaceAll("<span>SESSION</span>", "<span>JOB</span>")
    .replaceAll("เริ่ม session จาก canonical client", "เริ่ม Job จาก canonical client")
    .replaceAll("/internal/ceo/dashboard", "/internal/ceo")
    .replaceAll("MMD PRIVÉ · OWNER CONTROL ROOM · 05 SEP 2026", "MMD PRIVÉ · OWNER CONTROL ROOM · 07 SEP 2026")
    .replace("</body>", `${CONTROL_ROOM_CANON_SCRIPT}${AI_OPS_SCRIPT}</body>`);
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
  headers.set("x-mmd-ai-ops-layer", "v3");

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
