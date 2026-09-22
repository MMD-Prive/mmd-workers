import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";

const tmp = await mkdtemp(join(tmpdir(), "control-room-v4-"));
const outfile = join(tmp, "control-room-v4.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

try {
  await build({
    entryPoints: [join(workerRoot, "src/control-room-owner-ui.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });

  const { renderOwnerControlRoomPage } = await import(pathToFileURL(outfile).href);
  const response = renderOwnerControlRoomPage();
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-control-room-ui"), "owner-desktop-v3-latest");
  assert.equal(response.headers.get("x-mmd-control-room-release"), "owner-v4");
  assert.equal(response.headers.get("x-mmd-control-room-authority"), "canonical-backend");
  assert.equal(response.headers.get("x-mmd-control-room-mms-route"), "/internal/admin/mms");
  assert.equal(response.headers.get("x-mmd-control-room-mms-therapist-app"), "https://miniapp.line.me/2011425652-YqK1F6y8");
  assert.equal(response.headers.get("x-mmd-control-room-slip-backfill-route"), "/internal/admin/payments/historical-backfill");
  assert.equal(response.headers.get("x-mmd-control-room-customer-data-route"), "/internal/admin/customer-data");
  assert.equal(response.headers.get("x-mmd-control-room-cta-audit"), "operator-triggered-head-check");
  assert.equal(response.headers.get("x-mmd-control-room-telegram-status"), "unified-router-health-v1-read-only");
  assert.equal(response.headers.get("x-mmd-control-room-typography"), "sf-first-local");
  assert.equal(response.headers.get("x-mmd-control-room-operator-object"), "job");
  assert.equal(response.headers.get("x-mmd-control-room-create-route"), "/internal/admin/jobs/create-job");
  assert.equal(response.headers.get("x-mmd-control-room-canon"), "single-owner-v1");
  assert.equal(response.headers.get("x-mmd-control-room-human-operator"), "per");
  assert.equal(response.headers.get("x-mmd-control-room-review-model"), "ai-checks-per-confirms");
  assert.equal(response.headers.get("x-mmd-command-center"), "p0");
  assert.equal(response.headers.get("x-mmd-command-center-flow"), "ask-needs-per-prepared-watching");
  assert.equal(response.headers.get("x-mmd-ai-ops-layer"), "v3");
  assert.equal(response.headers.get("x-mmd-control-room-safety-location"), "v1");

  // Visible owner surface remains compact and task-first.
  assert.match(body, /MMD PRIVÉ/);
  assert.match(body, /OPERATING SYSTEM/);
  assert.match(body, /วันนี้ต้องทำอะไรบ้าง/);
  assert.match(body, /Customer 360/);
  assert.match(body, /Money Control/);
  assert.match(body, /Model Supply/);
  assert.match(body, /Access Intelligence/);
  assert.match(body, /AI Workers/);
  assert.match(body, /\/v1\/admin\/dashboard/);
  assert.match(body, /BACKEND WAITING/);

  // Runtime overlay makes Per's Command Center and single-owner model explicit.
  assert.match(body, /data-mmd-control-room-canon-v3/);
  assert.match(body, /dataset\.mmdCommandCenter='p0'/);
  assert.match(body, /PER · COMMAND CENTER/);
  assert.match(body, /Ask Per AI → Needs Per → Prepared → Watching/);
  assert.match(body, /PER · OWNER MODE/);
  assert.match(body, /ไม่มี reviewer คนที่สอง/);
  assert.match(body, /data-per-owner-strip/);
  assert.match(body, /งานที่เปอร์ต้องทำต่อ/);
  assert.match(body, /Action Card/);
  assert.match(body, /หน้าที่เปอร์ใช้จริง/);
  assert.match(body, /\/v1\/admin\/ai-ops\/client\.js\?v=3/);

  // Safety Location is a pinned additive owner control; backend remains authority.
  assert.match(body, /data-mmd-control-room-safety-location="v1"/);
  assert.match(body, /7e00a7696c9c8bd6bbd28408c9cb8617961fd78d/);
  assert.match(body, /webflow\/internal\/admin\/control-room\/safety-location-control-v1\.js/);

  // Compatibility markers remain, but owner creation is Job-first.
  assert.match(body, /data-control-room-v3/);
  assert.match(body, /OWNER CONTROL · V4/);
  assert.match(body, /MMD PRIVÉ · OWNER CONTROL ROOM · 07 SEP 2026/);
  assert.match(body, /Boss%20Per%20input%20Kenji%20AI\.webp/);
  assert.match(body, /Working%20Room\.webp/);
  assert.match(body, /Kenji%20Know02\.webp/);
  assert.match(body, /Wall%20a%20Long\.webp/);

  assert.doesNotMatch(body, /\/internal\/admin\/jobs\/create-session/);
  assert.doesNotMatch(body, /Create Session/);
  assert.match(body, /\/internal\/admin\/jobs\/create-job/);
  assert.match(body, /Create Job/);
  assert.match(body, /<span>JOB<\/span>/);
  assert.match(body, /\/internal\/admin\/payments/);
  assert.match(body, /\/internal\/admin\/payments\/historical-backfill/);
  assert.match(body, /\/internal\/admin\/kenji/);
  assert.match(body, /\/internal\/admin\/membership-access/);
  assert.match(body, /\/internal\/admin\/mms/);
  assert.match(body, /\/internal\/admin\/studio/);
  assert.match(body, /\/internal\/ceo/);
  assert.doesNotMatch(body, /\/internal\/ceo\/dashboard/);
  assert.match(body, /\/sigil\/model\/console/);
  assert.match(body, /\/shop\/admin\/stock/);
  assert.match(body, /\/internal\/admin\/control-room\/protocol/);

  assert.match(body, /MMS Therapist App/);
  assert.match(body, /https:\/\/miniapp\.line\.me\/2011425652-YqK1F6y8/);
  assert.doesNotMatch(body, /href="\/male-massage\/therapists\/me"/);
  assert.match(body, /payments-worker · Money Truth/);
  assert.match(body, /my_mmd_entitlement_resolver_v1/);
  assert.match(body, /Telegram alerts · Unified Router Health V1 \/ Drive observed/);
  assert.match(body, /Telegram \/ Google Drive · Router Health Read-only/);
  assert.match(body, /data-audit-cta/);
  assert.match(body, /\/v1\/admin\/auth\/me/);

  assert.equal(response.headers.get('x-mmd-control-room-mmd-flow'), '20260922');
  assert.equal(response.headers.get('x-mmd-control-room-v2'), 'system-health-v1');
  assert.equal(response.headers.get('x-mmd-control-room-phase1'), 'closed');
  assert.match(body, /data-mmd-control-room-v2="system-health-v1"/);
  assert.match(body, /SYSTEM HEALTH · V2/);
  assert.match(body, /Production truth at a glance/);
  assert.match(body, /HYPE \/ STUCK \/ SLA/);
  assert.match(body, /mmd:control-room:dashboard/);
  assert.match(body, /window\.__mmdControlRoomDashboard/);
  assert.match(body, /data-v2-open-ai/);
  assert.match(body, /data-mmd-workflow="20260922"/);
  assert.match(body, /MMD Memory ช่วยจำคนและประวัติ/);
  assert.match(body, /หาจากงานล่าสุด/);
  assert.match(body, /Slip Intake/);
  // Owner actions remain route handoffs, never generic customer confirmation links.
  const flow = body.match(/<section class="mmd-workflow"[\s\S]*?<\/section>/)[0];
  assert.equal((flow.match(/<li>/g) || []).length, 5);
  assert.doesNotMatch(flow, /<form|<script|href="\/sigil\/(?:pay|confirm)/);
  for (const route of [...flow.matchAll(/href="([^"]+)"/g)].map(m => m[1])) {
    assert.ok(['/internal/admin/jobs/all', '/internal/admin/customer-data',
      '/internal/ceo/payment-slip-inbox', '/internal/admin/payments',
      '/internal/admin/jobs/create-job'].includes(route), route);
  }

  // Exercise the actual dashboard consumer: unknown counts must not become zero.
  const dashboardScript = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(s => s.includes("fetch('/v1/admin/dashboard'"));
  for (const value of [undefined, null, '', ' ', false, {}, [], -1, 1.5, 0, '0', 12]) {
    const values = Object.fromEntries(['customer', 'payment', 'model', 'access'].map(k => [k, { textContent: '—' }]));
    const status = { textContent: '' };
    const root = {
      querySelectorAll(selector) {
        const match = selector.match(/^\[data-count="([^"]+)"\]$/);
        return match ? [values[match[1]]] : [];
      },
      querySelector() { return { classList: { add() {}, remove() {} }, querySelector() { return status; } }; },
    };
    runInNewContext(dashboardScript, {
      document: { getElementById() { return root; } },
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ queues: { payments: value } }) }),
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(values.payment.textContent, value === 0 || value === '0' ? '0' : value === 12 ? '12' : '—');
    assert.equal(values.customer.textContent, '—');
  }

  assert.doesNotMatch(body, /href="\/male-massage\/therapists\/login"/);
  assert.doesNotMatch(body, /WORKER-RENDERED INTERNAL PAGES/);
  assert.doesNotMatch(body, /owner-desktop-v2-restored/);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
