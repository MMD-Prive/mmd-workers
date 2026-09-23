import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HIMAI_ORIGINS, verifyHimaiShopRoutes } from "../scripts/verify-himai-shop-routes.mjs";

const html = '<main id="himai-shop-v3" data-catalog="/shop/api/products" data-checkout="/shop/api/checkout"></main>';
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
function fixture(url) {
  const path = new URL(url).pathname;
  if (path.endsWith("/api/products")) return json({ ok: true, shop: "shop", pricing_source: "Himai Selling Price THB", products: [] });
  if (path.endsWith("/api/checkout")) return json({ ok: false, error: "method_not_allowed" }, 405);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
function probe(fetchImpl) {
  return verifyHimaiShopRoutes({ fetchImpl, attempts: 1, pause: async () => {} });
}

test("deploy sync covers every wrangler route, including Himai API on both hostnames", async () => {
  const workflow = await readFile(new URL("../../.github/workflows/deploy-himai-chat-worker.yml", import.meta.url), "utf8");
  const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  const desired = workflow.match(/const desired = \[([\s\S]*?)\];/)?.[1] || "";
  const syncRoutes = [...desired.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const configRoutes = [...wrangler.matchAll(/\[\[routes\]\]\s*pattern\s*=\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.equal(syncRoutes.length, new Set(syncRoutes).size);
  assert.deepEqual([...syncRoutes].sort(), [...configRoutes].sort());
  for (const host of ["mmdbkk.com", "www.mmdbkk.com"]) {
    assert.ok(syncRoutes.includes(`${host}/shop/api/*`));
    assert.ok(!syncRoutes.includes(`${host}/shop*`));
    assert.ok(!syncRoutes.includes(`${host}/shop/*`));
  }
  assert.match(workflow, /run: node scripts\/verify-himai-shop-routes\.mjs/);
  assert.match(workflow, /if \(conflict\) throw new Error/);
  assert.doesNotMatch(workflow, /method: "DELETE"/);
});

test("both hosts pass using GET only, without customer data or business writes", async () => {
  const calls = [];
  const receipt = await probe(async (url, options) => {
    calls.push(url);
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "omit");
    assert.equal(options.body, undefined);
    return fixture(url);
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.mutations, 0);
  assert.equal(receipt.read_only, true);
  assert.equal(calls.length, 6);
  assert.deepEqual(receipt.checks.map((x) => x.origin), HIMAI_ORIGINS);
});

test("rejects MMD catalog under the Himai route", async () => {
  await assert.rejects(probe(async (url) => url.endsWith("/products")
    ? json({ ok: true, shop: "mmd-shop", pricing_source: "Himai Selling Price THB", products: [] })
    : fixture(url)), /brand_mismatch/);
});

test("rejects MMD pricing under the Himai route", async () => {
  await assert.rejects(probe(async (url) => url.endsWith("/products")
    ? json({ ok: true, shop: "shop", pricing_source: "MMD Shop Selling Price THB", products: [] })
    : fixture(url)), /pricing_source_mismatch/);
});

test("rejects HTML fallback instead of a mounted checkout API", async () => {
  await assert.rejects(probe(async (url) => url.endsWith("/checkout")
    ? new Response("<html>Not found</html>", { status: 404 }) : fixture(url)), /checkout_http_404/);
});

test("rejects incorrect checkout method guard", async () => {
  await assert.rejects(probe(async (url) => url.endsWith("/checkout")
    ? json({ ok: false, error: "unknown_shop" }, 405) : fixture(url)), /route_not_mounted/);
});

test("rejects JSON signup surface at the public storefront", async () => {
  await assert.rejects(probe(async (url) => url.endsWith("/shop/")
    ? json({ purpose: "shop_signup" }) : fixture(url)), /storefront_not_html/);
});

test("rejects a stale storefront without the connected commerce embed", async () => {
  await assert.rejects(probe(async (url) => url.endsWith("/shop/")
    ? new Response('<main id="old-shop"></main>', { headers: { "content-type": "text/html" } })
    : fixture(url)), /storefront_v3_not_published/);
});

test("rejects wrong-store checkout URLs in the storefront", async () => {
  await assert.rejects(probe(async (url) => url.endsWith("/shop/")
    ? new Response(html.replace('data-checkout="/shop/', 'data-checkout="/mmd-shop/'), { headers: { "content-type": "text/html" } })
    : fixture(url)), /storefront_checkout_mismatch/);
});

test("allows same-path www canonicalization but rejects redirecting to MMD Shop", async () => {
  await probe(async (url) => {
    const response = fixture(url);
    Object.defineProperty(response, "url", { value: url.replace("https://mmdbkk.com", "https://www.mmdbkk.com") });
    return response;
  });
  await assert.rejects(probe(async (url) => {
    const response = fixture(url);
    Object.defineProperty(response, "url", { value: "https://www.mmdbkk.com/mmd-shop" });
    return response;
  }), /unexpected_route_redirect/);
});

test("rejects an accidentally opened restricted-product checkout", async () => {
  await assert.rejects(probe(async (url) => url.endsWith("/products")
    ? json({ ok: true, shop: "shop", pricing_source: "Himai Selling Price THB", products: [{ sku: "PPP25-TEST", checkout_eligible: true }] })
    : fixture(url)), /restricted_checkout_must_stay_closed/);
});

test("transient route propagation retries remain read-only and bounded", async () => {
  let calls = 0;
  const receipt = await verifyHimaiShopRoutes({ origins: [HIMAI_ORIGINS[0]], attempts: 2, pause: async () => {}, fetchImpl: async (url, options) => {
    assert.equal(options.method, "GET");
    calls += 1;
    return calls === 1 ? new Response("unavailable", { status: 503 }) : fixture(url);
  } });
  assert.equal(receipt.ok, true);
  assert.equal(calls, 4);
});
