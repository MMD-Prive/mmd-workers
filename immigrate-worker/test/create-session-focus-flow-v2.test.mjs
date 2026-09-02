import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "create-session-focus-flow-v2-"));
const outfile = join(tmp, "focus-flow-v2.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [join(workerRoot, "src/create-session-focus-flow-v2.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  conditions: ["worker", "browser"],
  target: "es2022",
});

const { renderCreateSessionFocusFlowV2 } = await import(pathToFileURL(outfile).href);

try {
  const response = renderCreateSessionFocusFlowV2();
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-create-session-ui"), "focus-flow-v2-latest");
  assert.equal(response.headers.get("x-mmd-create-session-authority"), "canonical-backend");
  assert.match(html, /Create Session · Focus Flow v2/);
  assert.match(html, /data-focus-flow-v2/);
  assert.match(html, /Client[\s\S]*Work[\s\S]*Model[\s\S]*Details[\s\S]*Review/);
  assert.match(html, /data-focus-section="client"/);
  assert.match(html, /data-focus-section="work"/);
  assert.match(html, /data-focus-section="model"/);
  assert.match(html, /data-focus-section="details"/);
  assert.match(html, /data-focus-section="review"/);
  assert.match(html, /data-op-client-query/);
  assert.match(html, /data-op-work-type="public"/);
  assert.match(html, /data-op-work-type="private"/);
  assert.match(html, /data-op-folder-grid/);
  assert.match(html, /data-op-model-select/);
  assert.match(html, /data-op-line-user-id/);
  assert.match(html, /data-op-customer-telegram-status/);
  assert.match(html, /data-op-date/);
  assert.match(html, /data-op-amount/);
  assert.match(html, /data-op-create/);
  assert.match(html, /data-op-output/);
  assert.match(html, /\/a\/create-session\.js\?v=focus-flow-v2-core/);
  assert.match(html, /\/a\/create-session-focus-flow-v2\.js\?v=2/);
  assert.doesNotMatch(html, /Find client\. Verify lineage\. Create session\./);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
