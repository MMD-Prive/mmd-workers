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

  assert.equal(CREATE_SESSION_SIMPLE_START_MODE, "kenji-airtable-v4");
  assert.match(body, /data-simple-start-style="kenji-airtable-v4"/);
  assert.match(body, /data-simple-start-script="kenji-airtable-v4"/);
  assert.match(body, /query\.setAttribute\("placeholder", "LINE \/ โทร \/ Email \/ Member ID \/ Client ID"\)/);
  assert.match(body, /search\.textContent = "ค้นหา Client"/);
  assert.match(body, /recent\.textContent = "ลูกค้าล่าสุด"/);
  assert.match(body, /\/internal\/admin\/kenji-client-intake/);
  assert.match(body, /KENJI CLIENT INTAKE → AIRTABLE/);
  assert.match(body, /Client ต้องอยู่ใน Airtable ก่อนเปิด Session/);
  assert.match(body, /Airtable Client only/);
  assert.match(body, /Kenji%20know4\.webp/);
  assert.match(body, /Member%20Account\.webp/);
  assert.match(body, /Wall%20a%20Long\.webp/);
  assert.match(body, /Pay%20Renewal%20Desk\.webp/);
  assert.match(body, /Pay%20Renewal%20Mob\.webp/);
  assert.match(body, /data-client-source/);
  assert.match(body, /hideManualFallbackCards\(\)/);
  assert.match(body, /manual_name_pending_reconcile/);
  assert.match(body, /identity_pending_reconcile/);
  assert.match(body, /guest_public_only/);
  assert.match(body, /ยังไม่มี canonical Client สำหรับ/);
  assert.match(body, /ข้อมูลที่กรอกในช่องสมาชิก \/ tier ด้านล่างยังไม่ใช่ Client identity/);
  assert.match(body, /function buildIntakeHref\(value\)/);
  assert.match(body, /params\.set\("display_name", name\)/);
  assert.match(body, /params\.set\("return_to", CREATE_SESSION_PATH\)/);
  assert.match(body, /เพิ่ม \/ ผูก/);
  assert.match(body, /link\.href = buildIntakeHref\(requestedName\)/);
  assert.match(body, /\.mmd-cs-v14:not\(\.is-simple-has-client\) \.mmd-cs-v14__advanced/);
  assert.match(body, /recent\.click\(\)/);
  assert.match(body, /data-op-work-type/);
  assert.match(body, /is-simple-has-client/);
  assert.match(body, /data-simple-hidden/);
  assert.match(body, /data-simple-current-step/);
  assert.match(body, /hideUntil\(reviewPanel, hasModel\)/);
  assert.match(body, /hideUntil\(dock, hasModel\)/);

  assert.match(body, /function hasSelectedClient\(value\)/);
  assert.match(body, /!content\.startsWith\("no client"\)/);
  assert.match(body, /var canonicalClientName = root\.querySelector\("\[data-op-client-name\]"\)/);
  assert.match(body, /function hasCanonicalClient\(\)/);
  assert.match(body, /canonicalClientName\.value/);
  assert.match(body, /var hasClient = hasCanonicalClient\(\)/);
  assert.match(body, /var hasWork = hasClient && Boolean\(selectedWork\)/);
  assert.match(body, /var hasLane = hasWork && isChosen\(folderStat && folderStat\.textContent\)/);
  assert.match(body, /var hasModel = hasLane && isChosen\(modelStat && modelStat\.textContent\)/);
  assert.match(body, /if \(!hasCanonicalClient\(\) && recent\) recent\.click\(\)/);

  assert.doesNotMatch(body, /Public Ready/);
  assert.doesNotMatch(body, /Ready for Public/);

  const twice = applyCreateSessionSimpleStart(body);
  assert.equal(twice, body, "Kenji Airtable injection must be idempotent");
} finally {
  await rm(tmp, { recursive: true, force: true });
}
