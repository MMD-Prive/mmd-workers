import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "customer-360-live-"));
const outfile = join(tmp, "entry.mjs");
const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));

try {
  await build({
    entryPoints: [join(workerRoot, "src/customer-360-live-ingress-wrapper.ts")],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  const { decorateCustomer360Page, redactCustomerQueueResponse } = await import(pathToFileURL(outfile).href);

  const page = await decorateCustomer360Page(new Response('<html><body><main class="c360"><button data-backfill>นำเข้าจาก LINE</button><strong data-client>Not linked</strong></main></body></html>', {
    headers: { "content-type": "text/html; charset=utf-8", "x-mmd-customer-data-ui": "readable-v2", "x-mmd-customer-data-authority": "identity-context-staging-only" },
  }));
  const html = await page.text();
  assert.equal(page.headers.get("x-mmd-customer-360"), "live-v1");
  assert.equal(page.headers.get("x-mmd-customer-intelligence"), "read-only-v1");
  assert.equal(page.headers.get("x-mmd-customer-identity-alignment"), "read-only-v1");
  assert.equal(page.headers.get("x-mmd-customer-data-ui"), "readable-v2");
  assert.match(html, /data-mmd-customer-360-live-client="v1"/);
  assert.match(html, /data-mmd-customer-identity-alignment-client="v1"/);
  assert.match(html, /MY MMD \/ LIFF/);
  assert.match(html, /VERIFIED MATCH/);
  assert.match(html, /\/v1\/admin\/customer-data\/backfill\/continue/);
  assert.match(html, /\/v1\/admin\/clients\/intelligence/);
  assert.match(html, /Pause/);
  assert.match(html, /Resume/);
  assert.match(html, /Create Job/);
  assert.match(html, /Member Intelligence/);
  assert.match(html, /credentials:'include'/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
  assert.doesNotMatch(html, /Authorization|X-Confirm-Key|CONFIRM_KEY/);

  const queue = await redactCustomerQueueResponse(Response.json({
    ok: true,
    records: [{ record_id: "rec1", display_name: "Test", summary: "raw private note", raw_note: "secret", raw_line_notes: "secret2" }],
  }));
  const data = await queue.json();
  assert.equal(queue.headers.get("x-mmd-customer-queue-redaction"), "raw-summary-removed-v1");
  assert.equal(data.records[0].display_name, "Test");
  assert.equal("summary" in data.records[0], false);
  assert.equal("raw_note" in data.records[0], false);
  assert.equal("raw_line_notes" in data.records[0], false);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
