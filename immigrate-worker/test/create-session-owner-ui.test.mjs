import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "create-session-owner-ui-"));
const outfile = join(tmp, "owner-ui.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [join(workerRoot, "src/create-session-owner-ui.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  conditions: ["worker", "browser"],
  target: "es2022",
});

const { renderOwnerCreateSessionPage } = await import(pathToFileURL(outfile).href);
const htmlAsset = await readFile(join(workerRoot, "public/a/create-sessions-owner-v14.html"), "utf8");
const cssAsset = await readFile(join(workerRoot, "public/a/create-sessions-owner-v14.css"), "utf8");

const ASSETS = {
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/a/create-sessions-owner-v14.html") {
      return new Response(htmlAsset, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (pathname === "/a/create-sessions-owner-v14.css") {
      return new Response(cssAsset, { status: 200, headers: { "content-type": "text/css" } });
    }
    return new Response("not found", { status: 404 });
  },
};

try {
  const response = await renderOwnerCreateSessionPage(
    new Request("https://mmdbkk.com/internal/admin/jobs/create-session?mock=1"),
    { ASSETS },
  );
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-create-session-ui"), "owner-v14-vnext2-restored");
  assert.equal(response.headers.get("x-mmd-create-session-runtime"), "current-entitlement-aware");
  assert.match(body, /class="mmd-cs-v14"/);
  assert.match(body, /data-mmd-create-session-pro/);
  assert.match(body, />Create Sessions</);
  assert.match(body, /Admin%20CS%201\.webp/);
  assert.match(body, /data-op-client-query/);
  assert.match(body, /data-op-client-results/);
  assert.match(body, /data-op-work-type="public"/);
  assert.match(body, /data-op-work-type="private"/);
  assert.match(body, /data-op-folder-grid/);
  assert.match(body, /data-op-model-select/);
  assert.match(body, /data-op-line-user-id/);
  assert.match(body, /data-op-create/);
  assert.match(body, /data-op-out-customer-url/);
  assert.match(body, /MMD_CREATE_SESSION_CONFIG=\{adminBase:location\.origin\}/);
  assert.match(body, /\/a\/create-session\.js\?v=owner-v14-vnext2/);
  assert.doesNotMatch(body, /Find client\. Verify lineage\. Create session\./);
  assert.doesNotMatch(body, /create-sessions\.js/);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
