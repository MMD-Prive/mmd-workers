import { renderOwnerControlRoomPage as renderLegacyOwnerControlRoomPage } from "./control-room-owner-ui-legacy";

const encoder = new TextEncoder();
const AI_OPS_SCRIPT = '<script src="/v1/admin/ai-ops/client.js?v=2" defer data-mmd-ai-ops-script="v2"></script>';
const CONTROL_ROOM_CANON_SCRIPT = `<script data-mmd-control-room-canon-v2>(function(){var r=document.getElementById('mmd-os-v1');if(!r)return;var tabs=Array.from(r.querySelectorAll('[data-tab]'));tabs.forEach(function(b){var n=b.getAttribute('data-tab');if(n==='ai'){b.remove();return}if(n==='queues')b.textContent='Operations';if(n==='systems')b.textContent='Pages'});var ai=r.querySelector('[data-view="ai"]');if(ai)ai.remove();var ops=r.querySelector('[data-view="queues"]');if(ops){var k=ops.querySelector('.k'),h=ops.querySelector('h1'),p=ops.querySelector('.heading p:last-child');if(k)k.textContent='OPERATIONS';if(h)h.textContent='หน้าที่ต้องทำต่อ';if(p)p.textContent='รวมเฉพาะ operational pages ที่ยังเป็น canonical และมี owner ชัดเจน'}var pages=r.querySelector('[data-view="systems"]');if(pages){var k2=pages.querySelector('.k'),h2=pages.querySelector('h1'),p2=pages.querySelector('.heading p:last-child');if(k2)k2.textContent='CANONICAL PAGES';if(h2)h2.textContent='หน้าหลังบ้านที่เหลือ';if(p2)p2.textContent='ดูเฉพาะหน้าที่ใช้งานจริง; AI Ops เป็น shared layer ไม่แยกเป็น worker tab แล้ว'}r.querySelectorAll('a[href="/internal/ceo/dashboard"]').forEach(function(a){a.href='/internal/ceo'});})();</script>`;

function canonicalizeOwnerControlRoom(html: string): string {
  return html
    .replaceAll("/internal/admin/jobs/create-session", "/internal/admin/jobs/create-job")
    .replaceAll("Create Session", "Create Job")
    .replaceAll("<span>SESSION</span>", "<span>JOB</span>")
    .replaceAll("เริ่ม session จาก canonical client", "เริ่ม Job จาก canonical client")
    .replaceAll("MMD PRIVÉ · OWNER CONTROL ROOM · 05 SEP 2026", "MMD PRIVÉ · OWNER CONTROL ROOM · 07 SEP 2026")
    .replace("</body>", `${CONTROL_ROOM_CANON_SCRIPT}${AI_OPS_SCRIPT}</body>`);
}

export function renderOwnerControlRoomPage(): Response {
  const legacy = renderLegacyOwnerControlRoomPage();
  const headers = new Headers(legacy.headers);
  headers.delete("content-length");
  headers.set("x-mmd-control-room-operator-object", "job");
  headers.set("x-mmd-control-room-create-route", "/internal/admin/jobs/create-job");
  headers.set("x-mmd-control-room-canon", "remaining-pages-v2");
  headers.set("x-mmd-ai-ops-layer", "v2");

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
