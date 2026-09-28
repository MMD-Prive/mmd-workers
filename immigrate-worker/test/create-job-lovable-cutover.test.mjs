import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const tmp = await mkdtemp(join(tmpdir(), "create-job-lovable-cutover-"));
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

  const { serveLovableCreateJobPage } = await import(pathToFileURL(outfile).href);

  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    fetchCalls += 1;
    assert.equal(String(url), "https://mmd-os.lovable.app/internal/admin/jobs/create-job?x=1");
    assert.equal(init.method, "GET");
    return new Response('<html><head><link href="/assets/app.css"></head><body><main>Create Job Lovable</main></body></html>', {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "set-cookie": "must-not-forward=1",
      },
    });
  };

  try {
    const cutover = await serveLovableCreateJobPage(
      new Request("https://mmdbkk.com/internal/admin/jobs/create-job?x=1", { headers: { accept: "text/html" } }),
      new Response("<html><body>legacy session id page</body></html>", { headers: { "content-type": "text/html; charset=utf-8" } }),
      { INTERNAL_LOVABLE_ORIGIN: "https://mmd-os.lovable.app" },
    );
    const html = await cutover.text();
    assert.equal(fetchCalls, 1);
    assert.equal(cutover.status, 200);
    assert.equal(cutover.headers.get("set-cookie"), null);
    assert.equal(cutover.headers.get("x-mmd-presentation-source"), "lovable");
    assert.equal(cutover.headers.get("x-mmd-presentation-version"), "internal-lovable-v1");
    assert.equal(cutover.headers.get("x-mmd-page"), "create-job");
    assert.match(html, /Create Job Lovable/);
    assert.match(html, /https:\/\/mmd-os\.lovable\.app\/assets\/app\.css/);

    const denied = await serveLovableCreateJobPage(
      new Request("https://mmdbkk.com/internal/admin/jobs/create-job"),
      Response.redirect("https://mmdbkk.com/internal/admin/login?next=%2Finternal%2Fadmin%2Fjobs%2Fcreate-job", 302),
      { INTERNAL_LOVABLE_ORIGIN: "https://mmd-os.lovable.app" },
    );
    assert.equal(denied.status, 302);
    assert.equal(fetchCalls, 1, "unauthenticated requests must not fetch Lovable");

    globalThis.fetch = async () => new Response("missing", { status: 404 });
    const fallback = await serveLovableCreateJobPage(
      new Request("https://mmdbkk.com/internal/admin/jobs/create-job"),
      new Response("legacy fallback", { headers: { "content-type": "text/html" } }),
      { INTERNAL_LOVABLE_ORIGIN: "https://mmd-os.lovable.app" },
    );
    assert.equal(await fallback.text(), "legacy fallback");
  } finally {
    globalThis.fetch = originalFetch;
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}
