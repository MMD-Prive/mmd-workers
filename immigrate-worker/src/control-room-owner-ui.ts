import { renderOwnerControlRoomPage as renderLegacyOwnerControlRoomPage } from "./control-room-owner-ui-legacy";

const encoder = new TextEncoder();
const AI_OPS_SCRIPT = '<script src="/v1/admin/ai-ops/client.js?v=1" defer data-mmd-ai-ops="v1"></script>';
const CONTROL_ROOM_CANON_SCRIPT = `<script data-mmd-control-room-canon-v2>
(function(){
  var root=document.getElementById('mmd-os-v1');if(!root)return;
  var tabs=root.querySelector('.tabs'),main=root.querySelector('.main');if(!tabs||!main)return;
  tabs.innerHTML='<button class="is-active" type="button" data-tab="today">Today</button><button type="button" data-tab="operations">Operations</button><button type="button" data-tab="studio">Studio</button><button type="button" data-tab="ceo">CEO</button>';
  main.innerHTML=''
    +'<section class="view" data-view="today"><div class="heading"><div><p class="k">TODAY · OPERATOR VIEW</p><h1>วันนี้ต้องทำอะไรบ้าง</h1><p>เห็นเฉพาะคิวหลักและทางไปต่อของหน้าที่ใช้งานจริง ไม่แสดง legacy route หรือ AI แยกเป็นหน้าอีกแล้ว</p></div><a class="primary" href="/internal/ceo">CEO Dashboard ↗</a></div><div class="g4">'
      +'<a class="card queue" href="/internal/admin/customer-data"><span>CUSTOMER · HOLD</span><strong data-count="customer">—</strong><h3>Customer 360</h3><p>อ้างอิง identity / context; action runtime ยัง hold</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/payments"><span>MONEY</span><strong data-count="payment">—</strong><h3>Money Control</h3><p>payment proof / unmatched / review queue</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/ceo/models"><span>MODEL</span><strong data-count="model">—</strong><h3>Model Supply</h3><p>readiness / category gaps / supply</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/membership-access"><span>ACCESS</span><strong data-count="access">—</strong><h3>Access Intelligence</h3><p>Expected vs observed mismatch</p><b>Open ↗</b></a>'
    +'</div><div class="g2"><article class="card"><div class="head"><div><p class="k">OPS BRIEF</p><h2>สิ่งที่ควรเห็นตอนนี้</h2></div><span class="pill" data-brief-state>WAITING DATA</span></div><div class="brief" data-brief><article><strong>รอ authenticated dashboard brief</strong><p>ไม่มีข้อมูลจริงจะไม่สร้าง incident หรือจำนวนจำลอง</p></article></div></article><article class="card"><div class="head"><div><p class="k">FAST ROUTES</p><h2>งานที่ใช้บ่อย</h2></div></div><div class="mini-grid">'
      +'<a class="mini" href="/internal/admin/jobs/create-job"><span>JOB</span><h3>Create Job</h3><p>Client → Job Type → Model → Details → Review</p><b>Open ↗</b></a>'
      +'<a class="mini" href="/internal/admin/studio"><span>STUDIO</span><h3>Studio</h3><p>Upload → Review → Preview</p><b>Open ↗</b></a>'
      +'<a class="mini" href="/internal/admin/mms"><span>MMS</span><h3>MMS Admin</h3><p>Therapist readiness / operations</p><b>Open ↗</b></a>'
      +'<a class="mini" href="/internal/ceo"><span>CEO</span><h3>CEO Dashboard</h3><p>Decision / intelligence / exceptions</p><b>Open ↗</b></a>'
    +'</div></article></div></section>'
    +'<section class="view" data-view="operations" hidden><div class="heading"><div><p class="k">OPERATIONS</p><h1>หน้าหลังบ้านที่ยังใช้งาน</h1><p>ตัด Create Session, legacy console และ route map เก่าออกจากเมนูหลัก เหลือเฉพาะ canonical workspaces ปัจจุบัน</p></div></div><div class="g3">'
      +'<a class="card queue" href="/internal/admin/jobs/create-job"><span>JOB</span><h3>Create Job</h3><p>สร้างงานจาก canonical Client และ Model</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/dashboard"><span>OPS</span><h3>Admin Dashboard</h3><p>priority queues และ day-to-day execution</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/payments"><span>MONEY</span><h3>Payments</h3><p>canonical payment evidence review</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/payments/historical-backfill"><span>EVIDENCE</span><h3>Historical Backfill</h3><p>historical slip staging → review</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/membership-access"><span>ACCESS</span><h3>Membership Access</h3><p>expected entitlement vs observed access</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/member-intelligence"><span>MEMBER</span><h3>Member Intelligence</h3><p>member signals / history / next context</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/customer-data"><span>CUSTOMER · HOLD</span><h3>Customer 360</h3><p>reference only until runtime actions are ready</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/kenji"><span>KENJI</span><h3>Kenji Admin</h3><p>knowledge / QA / publish / audit</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/mms"><span>MMS</span><h3>MMS Admin</h3><p>therapist and service operations</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/access/invite"><span>ADMIN ACCESS</span><h3>Access Invite</h3><p>owner/admin access lane</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/owner/setup"><span>OWNER</span><h3>Owner Setup</h3><p>owner settings and operating state</p><b>Open ↗</b></a>'
    +'</div></section>'
    +'<section class="view" data-view="studio" hidden><div class="heading"><div><p class="k">STUDIO</p><h1>Studio pages ที่เหลือ</h1><p>Source → Upload → Review → Preview; campaign operator page แยกไว้ชัดเจน</p></div></div><div class="g3">'
      +'<a class="card queue" href="/internal/admin/studio"><span>STUDIO</span><h3>Studio Home</h3><p>creative operations home</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/studio/upload"><span>INTAKE</span><h3>Upload New Model</h3><p>source photos / field / layer / run</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/studio/review"><span>REVIEW</span><h3>Studio Review</h3><p>source checks / template / approval notes</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/studio/model-preview"><span>PREVIEW</span><h3>Model Preview</h3><p>final internal preview before publish handoff</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/admin/studio/care-back"><span>CAMPAIGN</span><h3>CARE BACK</h3><p>6 Years campaign operator surface</p><b>Open ↗</b></a>'
    +'</div></section>'
    +'<section class="view" data-view="ceo" hidden><div class="heading"><div><p class="k">CEO</p><h1>Decision & Intelligence</h1><p>เหลือเฉพาะหน้า CEO ที่ใช้ตัดสินใจและดู intelligence จริง ไม่แสดง LINE/Telegram legacy tools ใน hub นี้</p></div><a class="primary" href="/internal/ceo">Open CEO ↗</a></div><div class="g3">'
      +'<a class="card queue" href="/internal/ceo"><span>CEO HOME</span><h3>CEO Dashboard</h3><p>executive brief และ decision queue</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/ceo/audience"><span>DEMAND</span><h3>Audience Intelligence</h3><p>demand / retention / campaign signals</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/ceo/models"><span>SUPPLY</span><h3>Model Supply</h3><p>readiness / capability / supply gaps</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/ceo/payment-slip-inbox"><span>PAYMENT EXCEPTION</span><h3>Payment Slip Inbox</h3><p>CEO-side evidence exception review</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/ceo/relink-review"><span>IDENTITY</span><h3>Relink Review</h3><p>changed-LINE evidence and Client matching</p><b>Open ↗</b></a>'
      +'<a class="card queue" href="/internal/ceo/kenji-control"><span>DECISION SUPPORT</span><h3>Kenji Control</h3><p>evidence / options / recommendation / escalation</p><b>Open ↗</b></a>'
    +'</div><div class="authority"><span>AI Ops = shared advisory layer</span><span>Payments worker = money truth</span><span>Resolver = access truth</span><span>Boss Per = final authority</span></div></section>';
  Array.prototype.slice.call(root.querySelectorAll('[data-tab]')).forEach(function(b){b.addEventListener('click',function(){var n=b.getAttribute('data-tab');Array.prototype.slice.call(root.querySelectorAll('[data-tab]')).forEach(function(x){x.classList.toggle('is-active',x===b)});Array.prototype.slice.call(root.querySelectorAll('[data-view]')).forEach(function(v){v.hidden=v.getAttribute('data-view')!==n})})});
})();
</script>`;

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
  headers.set("x-mmd-ai-ops-layer", "v1");

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