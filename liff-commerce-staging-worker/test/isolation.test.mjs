import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createMockCommerceStagingWorker, MOCK_STAGING_HOST } from "../src/handler.js";

const html = await readFile(new URL("../../docs/previews/liff-commerce.html", import.meta.url), "utf8");
const qr = await readFile(new URL("../../docs/previews/MOCK-STAGING-LIFF-commerce-QR.svg", import.meta.url), "utf8");
const worker = createMockCommerceStagingWorker(html, qr);
const request = (path = "/", method = "GET") => new Request("https://" + MOCK_STAGING_HOST + path, { method });

test("staging configuration has no production routes, credentials, bindings, storage, cron or observability", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.name, "mmd-liff-commerce-mock-staging");
  assert.deepEqual(config.routes, []);
  assert.equal(config.workers_dev, true);
  assert.equal(config.preview_urls, false);
  assert.equal(config.observability.enabled, false);
  for (const key of ["vars", "services", "kv_namespaces", "r2_buckets", "d1_databases", "durable_objects", "queues", "triggers", "unsafe"]) assert.equal(config[key], undefined, key);
});

test("only the staging host serves the byte-identical offline fixture, with network/form submission disabled", async () => {
  const response = await worker.fetch(request());
  assert.equal(response.status, 200);
  assert.equal(await response.text(), html);
  assert.match(response.headers.get("content-security-policy"), /connect-src 'none'; form-action 'none'/);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("x-mmd-preview-mode"), "mock-only-no-payments");
  assert.equal((await worker.fetch(new Request("https://mmdbkk.com/"))).status, 404);
  assert.equal(await (await worker.fetch(request("/", "HEAD"))).text(), "");
});

test("all mutation methods and real member/payment API routes are unavailable", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    for (const path of ["/", "/member/api/liff/renewal/purchase", "/member/api/liff/promotions/double-moment/purchase"]) assert.equal((await worker.fetch(request(path, method))).status, 405);
  }
  assert.equal((await worker.fetch(request("/member/api/liff/profile"))).status, 404);
});

test("health proves mock mode and exact fixture hash without outbound access", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("outbound_access_forbidden"); };
  try {
    const health = await (await worker.fetch(request("/healthz"))).json();
    assert.deepEqual(health, { ok: true, mode: "mock_only", writes_enabled: false, payment_intents_enabled: false, live_liff_auth: false, bindings: [], fixture_sha256: createHash("sha256").update(html).digest("hex") });
    assert.equal(await (await worker.fetch(request("/qr.svg"))).text(), qr);
  } finally { globalThis.fetch = original; }
});
