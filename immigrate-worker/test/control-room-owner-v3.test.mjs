import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

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
  assert.equal(response.headers.get("x-mmd-control-room-cta-audit"), "operator-triggered-head-check");
  assert.equal(response.headers.get("x-mmd-control-room-telegram-status"), "partial-worker-alerts-no-unified-router");

  assert.match(body, /data-control-room-v3/);
  assert.match(body, /OWNER CONTROL · V4/);
  assert.match(body, /MMD PRIVÉ · OWNER CONTROL ROOM · 05 SEP 2026/);
  assert.match(body, /Boss%20Per%20input%20Kenji%20AI\.webp/);
  assert.match(body, /Working%20Room\.webp/);
  assert.match(body, /Kenji%20Know02\.webp/);
  assert.match(body, /Wall%20a%20Long\.webp/);

  assert.match(body, /\/internal\/admin\/jobs\/create-session/);
  assert.match(body, /\/internal\/admin\/jobs\/create-job/);
  assert.match(body, /\/internal\/admin\/payments/);
  assert.match(body, /\/internal\/admin\/payments\/historical-backfill/);
  assert.match(body, /\/internal\/admin\/kenji/);
  assert.match(body, /\/internal\/admin\/membership-access/);
  assert.match(body, /\/internal\/admin\/mms/);
  assert.match(body, /\/internal\/admin\/studio/);
  assert.match(body, /\/internal\/ceo\/dashboard/);
  assert.match(body, /\/sigil\/model\/console/);
  assert.match(body, /\/shop\/admin\/stock/);
  assert.match(body, /\/internal\/admin\/control-room\/protocol/);

  assert.match(body, /MMS Therapist App/);
  assert.match(body, /https:\/\/miniapp\.line\.me\/2011425652-YqK1F6y8/);
  assert.doesNotMatch(body, /href="\/male-massage\/therapists\/me"/);
  assert.match(body, /payments-worker · Money Truth/);
  assert.match(body, /my_mmd_entitlement_resolver_v1/);
  assert.match(body, /Telegram alerts · Partial \/ Drive observed/);
  assert.match(body, /Partial Alerts/);
  assert.match(body, /data-audit-cta/);
  assert.match(body, /\/v1\/admin\/auth\/me/);

  assert.doesNotMatch(body, /href="\/male-massage\/therapists\/login"/);
  assert.doesNotMatch(body, /WORKER-RENDERED INTERNAL PAGES/);
  assert.doesNotMatch(body, /owner-desktop-v2-restored/);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
