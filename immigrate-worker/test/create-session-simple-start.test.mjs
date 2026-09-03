import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "create-session-simple-start-"));
const outfile = join(tmp, "simple-start.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [join(workerRoot, "src/create-session-simple-start.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});

const { applyCreateSessionSimpleStart, CREATE_SESSION_SIMPLE_START_MODE } = await import(pathToFileURL(outfile).href);
const ownerHtml = await readFile(join(workerRoot, "public/a/create-sessions-owner-v14.html"), "utf8");
const page = `<!doctype html><html><head></head><body>${ownerHtml}<script src="/a/create-session.js"></script></body></html>`;

try {
  const body = applyCreateSessionSimpleStart(page);

  assert.equal(CREATE_SESSION_SIMPLE_START_MODE, "simple-start-v2");
  assert.match(body, /data-simple-start-style="simple-start-v2"/);
  assert.match(body, /data-simple-start-script="simple-start-v2"/);
  assert.match(body, /พิมพ์ชื่อที่เปอร์จำ เช่น หนุ่ย/);
  assert.match(body, />ค้นหา<\/button>/);
  assert.match(body, />ล่าสุด<\/button>/);
  assert.match(body, /data-op-work-type/);
  assert.match(body, /is-simple-has-client/);
  assert.match(body, /data-simple-hidden/);
  assert.match(body, /value\.length < 2/);
  assert.match(body, /search\.click\(\)/);
  assert.match(body, /ชื่อที่เปอร์ Rename/);
  assert.match(body, /data-simple-current-step/);
  assert.match(body, /hideUntil\(reviewPanel, hasModel\)/);
  assert.match(body, /hideUntil\(dock, hasModel\)/);
  assert.match(body, /Private/);
  assert.match(body, /Public/);

  assert.match(body, /is-manual-client/);
  assert.match(body, /data-manual-card-polished/);
  assert.match(body, /ชื่อที่เปอร์จำ/);
  assert.match(body, /Public Ready/);
  assert.match(body, /รอผูกประวัติ/);
  assert.match(body, /ยังไม่ผูก Member \/ LINE — ใช้สร้าง Public Session ได้เลย/);
  assert.match(body, /Ready for Public/);
  assert.match(body, /รอผูก Member \/ LINE และประวัติภายหลัง/);
  assert.match(body, /manual_name_pending_reconcile/);
  assert.match(body, /identity_pending_reconcile/);
  assert.match(body, /polishManualClientCards\(\)/);
  assert.match(body, /polishManualSelection\(\)/);

  const twice = applyCreateSessionSimpleStart(body);
  assert.equal(twice, body, "simple start injection must be idempotent");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
