import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "control-room-v3-"));
const outfile = join(tmp, "control-room-v3.mjs");
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
  assert.equal(response.headers.get("x-mmd-control-room-authority"), "canonical-backend");
  assert.match(body, /data-control-room-v3/);
  assert.match(body, /MMD PRIVÉ · OWNER CONTROL ROOM V3/);
  assert.match(body, /\/internal\/admin\/jobs\/create-session/);
  assert.match(body, /\/internal\/admin\/kenji/);
  assert.match(body, /(?:\/internal\/admin\/mms|\/male-massage\/therapists\/login)/);
  assert.match(body, /My MMD Entitlement Resolver/);
  assert.match(body, /Telegram \/ Google Drive/);
  assert.match(body, /Pre-#498 worker-rendered baseline/);
  assert.match(body, /\/v1\/admin\/auth\/me/);
  assert.doesNotMatch(body, /WORKER-RENDERED INTERNAL PAGES/);
  assert.doesNotMatch(body, /owner-desktop-v2-restored/);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
