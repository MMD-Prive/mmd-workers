import test from "node:test";
import assert from "node:assert/strict";
import worker, { injectBridge, isBridgeRequest, normalizePath, RUNTIME_VERSION, WORKER_NAME } from "../src/index.js";
import { SHOP_EDGE_RUNTIME } from "../src/runtime.js";

test("normalizes only exact storefront roots", () => {
  assert.equal(normalizePath("//shop//"), "/shop");
  assert.equal(isBridgeRequest(new Request("https://mmdbkk.com/shop?lang=th")), true);
  assert.equal(isBridgeRequest(new Request("https://www.mmdbkk.com/mmd-shop/")), true);
  assert.equal(isBridgeRequest(new Request("https://mmdbkk.com/shop/api/products")), false);
  assert.equal(isBridgeRequest(new Request("https://mmdbkk.com/mmd-shop/product/x")), false);
  assert.equal(isBridgeRequest(new Request("https://mmdbkk.com/shop", { method: "POST" })), false);
});

test("bridge runtime enforces Phase 1 retry protocol without declaring payment truth", () => {
  assert.match(SHOP_EDGE_RUNTIME, /idempotency-key/);
  assert.match(SHOP_EDGE_RUNTIME, /expected_unit_price_thb/);
  assert.match(SHOP_EDGE_RUNTIME, /sessionStorage/);
  assert.match(SHOP_EDGE_RUNTIME, /crypto\.getRandomValues/);
  assert.match(SHOP_EDGE_RUNTIME, /checkout_previous_attempt_pending/);
  assert.doesNotMatch(SHOP_EDGE_RUNTIME, /payment_status\s*=\s*["']paid/);
});

test("injects once before head closes", () => {
  const html = "<!doctype html><html><head><title>x</title></head><body><main id=\"himai-shop-v3\"></main></body></html>";
  const once = injectBridge(html, "/shop");
  assert.match(once, /mmd-shop-phase1-edge-bridge/);
  assert.match(once, new RegExp(RUNTIME_VERSION));
  assert.equal(injectBridge(once, "/shop"), once);
});

test("proxies Webflow source, preserves query, and marks exact route owner", async () => {
  const old = globalThis.fetch;
  let seen = "";
  globalThis.fetch = async request => {
    seen = request.url;
    return new Response("<!doctype html><html><head></head><body><main id=\"mmdshop-final\"></main></body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
  try {
    const response = await worker.fetch(new Request("https://mmdbkk.com/mmd-shop?lang=en"));
    assert.equal(response.status, 200);
    assert.equal(seen, "https://mmdprive.webflow.io/mmd-shop?lang=en");
    assert.equal(response.headers.get("x-mmd-route-owner"), WORKER_NAME);
    assert.equal(response.headers.get("x-mmd-shop-phase1-edge"), "compatibility-v1");
    assert.match(await response.text(), /mmd-shop-phase1-edge-bridge/);
  } finally { globalThis.fetch = old; }
});

test("never swallows API or nested shop routes", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/shop/api/products"));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, error: "NOT_FOUND" });
});
