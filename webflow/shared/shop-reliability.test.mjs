import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { installShopReliability, SHOP_RELIABILITY_SOURCE } from "./shop-reliability-runtime.mjs";

function storage() { const map = new Map(); return { map, getItem(k) { return map.has(k) ? map.get(k) : null; }, setItem(k,v) { map.set(k,String(v)); }, removeItem(k) { map.delete(k); } }; }
const id = "rec12345678901234";
function product(extra = {}) { return { id, product_name: "Fixture Item", sku: "FIXTURE", status: "active", selling_price_thb: 100, available: 5, stock_status: "tracked", checkout_eligible: true, ...extra }; }
function row(extra = {}) { return { product_id: id, name: "Fixture Item", sku: "FIXTURE", unit_price_thb: 100, qty: 1, ...extra }; }
function fixture(shop, fetchImpl, existing = {}) {
  const global = { localStorage: storage(), sessionStorage: storage(), crypto: globalThis.crypto, AbortController, setTimeout, clearTimeout, location: { origin: "https://www.mmdbkk.com" }, ...existing };
  global.fetch = fetchImpl; installShopReliability(global);
  const cartKey = shop === "shop" ? "himai_shop_cart_v2" : "mmd_shop_cart";
  const api = global.MMDShopReliability.create({ shop, cartKey, fetchImpl });
  return { global, api, cartKey };
}
function catalog(shop, products = [product()]) { return { ok: true, shop, pricing_source: shop === "shop" ? "Himai Selling Price THB" : "MMD Shop Selling Price THB", products }; }
function success(shop) { return { ok: true, shop, order_id: shop === "shop" ? "HIMAI-TEST" : "MMD-TEST", payment_url: "https://mmdbkk.com/pay/checkout?t=fixture%2Btoken%2Fvalue" }; }
const form = { customer: { name: "Test", phone: "0800000000" }, shipping: { delivery_method: "pickup" } };

for (const shop of ["shop", "mmd-shop"]) {
  test(`${shop}: opening cart before catalog readiness keeps saved items`, () => {
    const f = fixture(shop, async () => {}); f.api.write([row()]); assert.equal(f.api.reconcile(), false); assert.deepEqual(f.api.read(), [row()]);
  });
  test(`${shop}: only price changed refreshes saved unit price and total`, () => {
    const f = fixture(shop, async () => {}); f.api.write([row()]); f.api.setCatalog(catalog(shop, [product({ selling_price_thb: 120 })]));
    assert.equal(f.api.reconcile(), true); assert.equal(f.api.read()[0].unit_price_thb, 120); assert.equal(f.api.reconcile(), false);
  });
  test(`${shop}: current eligibility and stock cap govern old cart rows`, () => {
    const f = fixture(shop, async () => {}); f.api.write([row({ qty: 10 })]); f.api.setCatalog(catalog(shop, [product({ available: 2 })])); f.api.reconcile(); assert.equal(f.api.read()[0].qty, 2);
    f.api.setCatalog(catalog(shop, [product({ checkout_eligible: false })])); f.api.reconcile(); assert.deepEqual(f.api.read(), []);
  });
  test(`${shop}: network/catalog failures leave cart untouched`, async () => {
    const f = fixture(shop, async () => new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } }));
    f.api.write([row()]); await assert.rejects(f.api.refresh()); f.api.reconcile(); assert.deepEqual(f.api.read(), [row()]);
  });
  test(`${shop}: price change during checkout stops POST until customer checks the new total`, async () => {
    let posts = 0; const f = fixture(shop, async (url, init) => { if (init.method === "POST") posts++; return Response.json(catalog(shop, [product({ selling_price_thb: 120 })])); });
    f.api.write([row()]); await assert.rejects(f.api.checkout(form), /cart_updated/); assert.equal(posts, 0); assert.equal(f.api.read()[0].unit_price_thb, 120);
  });
  test(`${shop}: lost checkout response recovers the same key without another creation`, async () => {
    const calls = []; let original;
    const fetchImpl = async (url, init) => {
      if (init.method === "GET") return Response.json(catalog(shop));
      const body = JSON.parse(init.body); calls.push(body);
      if (!body.recover) { original = body; throw new Error("connection lost after server commit"); }
      assert.equal(body.checkout_request_id, original.checkout_request_id); return Response.json(success(shop));
    };
    const f = fixture(shop, fetchImpl); f.api.write([row()]);
    await assert.rejects(f.api.checkout(form), /response_uncertain/); assert.equal(f.api.hasPending(), true);
    // Simulate a page reload; only tab-scoped attempt state is reused. No token is stored client-side.
    const restarted = fixture(shop, fetchImpl, { localStorage: f.global.localStorage, sessionStorage: f.global.sessionStorage });
    const result = await restarted.api.checkout(null);
    assert.equal(calls.length, 2); assert.equal(calls.filter((x) => !x.recover).length, 1);
    assert.equal(result.payment_url, success(shop).payment_url); assert.deepEqual(restarted.api.read(), []);
    assert.equal(original.quote.total_thb, 100); assert.equal(original.source_path, shop === "shop" ? "/shop" : "/mmd-shop");
  });
  test(`${shop}: never-received request retries its original body and key`, async () => {
    const calls = []; let count = 0;
    const f = fixture(shop, async (url, init) => {
      if (init.method === "GET") return Response.json(catalog(shop));
      const body = JSON.parse(init.body); calls.push(body);
      if (++count === 1) throw new Error("offline before submission");
      if (body.recover) return Response.json({ ok: false, error: "checkout_attempt_not_received" }, { status: 404 });
      return Response.json(success(shop));
    });
    f.api.write([row()]); await assert.rejects(f.api.checkout(form)); await f.api.checkout(null);
    assert.equal(calls.length, 3); assert.deepEqual(calls[0], calls[2]);
  });
  test(`${shop}: rapid repeated clicks cause a single outgoing POST`, async () => {
    let release, posts = 0; const pending = new Promise((r) => { release = r; });
    const f = fixture(shop, async (url, init) => { if (init.method === "GET") return Response.json(catalog(shop)); posts++; await pending; return Response.json(success(shop)); });
    f.api.write([row()]); const first = f.api.checkout(form); await assert.rejects(f.api.checkout(form), /checkout_in_progress/); release(); await first; assert.equal(posts, 1);
  });
  test(`${shop}: newly added units remain after the original order succeeds`, async () => {
    let release, started; const start = new Promise((r) => { started = r; }), hold = new Promise((r) => { release = r; });
    const f = fixture(shop, async (url, init) => { if (init.method === "GET") return Response.json(catalog(shop)); started(); await hold; return Response.json(success(shop)); });
    f.api.write([row()]); const task = f.api.checkout(form); await start; f.api.write([row({ qty: 3 })]); release(); await task; assert.equal(f.api.read()[0].qty, 2);
  });
  test(`${shop}: uncertain failures hold the request rather than creating a new key`, async () => {
    const bodies = []; const f = fixture(shop, async (url, init) => { if (init.method === "GET") return Response.json(catalog(shop)); bodies.push(JSON.parse(init.body)); return Response.json({ ok: false, error: "checkout_recovery_required", order_id: "REFERENCE", safe_new_attempt: false }, { status: 503 }); });
    f.api.write([row()]); await assert.rejects(f.api.checkout(form)); await assert.rejects(f.api.checkout(form)); assert.equal(bodies[0].checkout_request_id, bodies[1].checkout_request_id); assert.equal(bodies[1].recover, true);
  });
  test(`${shop}: a proven pre-mutation rejection permits a corrected new attempt`, async () => {
    const ids = []; const f = fixture(shop, async (url, init) => { if (init.method === "GET") return Response.json(catalog(shop)); ids.push(JSON.parse(init.body).checkout_request_id); return Response.json({ ok: false, error: "checkout_price_changed", safe_new_attempt: true }, { status: 409 }); });
    f.api.write([row()]); await assert.rejects(f.api.checkout(form)); assert.equal(f.api.hasPending(), false); await assert.rejects(f.api.checkout(form)); assert.notEqual(ids[0], ids[1]);
  });
  test(`${shop}: missing browser storage blocks order creation but preserves in-memory cart`, async () => {
    let network = 0; const blocked = { getItem() { throw new Error("disabled"); }, setItem() { throw new Error("disabled"); }, removeItem() { throw new Error("disabled"); } };
    const f = fixture(shop, async () => { network++; }, { localStorage: blocked, sessionStorage: null });
    f.api.write([row()]); assert.deepEqual(f.api.read(), [row()]); await assert.rejects(f.api.checkout(form), /checkout_storage_required/); assert.equal(network, 0);
  });
  test(`${shop}: wrong-brand or non-HTTPS payment redirects are held`, async () => {
    const f = fixture(shop, async (url, init) => init.method === "GET" ? Response.json(catalog(shop)) : Response.json({ ...success(shop), payment_url: "https://evil.example/pay/checkout?t=secret" }));
    f.api.write([row()]); await assert.rejects(f.api.checkout(form), /response_uncertain/); assert.equal(f.api.hasPending(), true); assert.equal(f.api.read().length, 1);
  });
}
test("restricted items remain closed even if an inconsistent payload sets checkout_eligible", () => {
  const f = fixture("shop", async () => {}); f.api.write([row()]);
  f.api.setCatalog(catalog("shop", [product({ sku: "PPP25-TEST", online_checkout_status: "available" })])); f.api.reconcile(); assert.deepEqual(f.api.read(), []);
});
test("wrong brand or wrong price field catalog is rejected", () => {
  const f = fixture("shop", async () => {}); f.api.write([row()]);
  assert.throws(() => f.api.setCatalog(catalog("mmd-shop")), /catalog_invalid/); assert.equal(f.api.isReady(), false); assert.equal(f.api.read().length, 1);
});
test("duplicate basket rows and malformed quantities normalize to the backend limit", () => {
  const f = fixture("shop", async () => {}); f.api.write([row({ qty: 15 }), row({ qty: 15 })]); f.api.setCatalog(catalog("shop", [product({ available: 100 })])); f.api.reconcile(); assert.equal(f.api.read().length, 1); assert.equal(f.api.read()[0].qty, 20);
});
test("browser script is standalone, initializes once and exposes all three locales", () => {
  const sandbox = { globalThis: {} }; vm.runInNewContext(SHOP_RELIABILITY_SOURCE, sandbox); const api = sandbox.globalThis.MMDShopReliability;
  vm.runInNewContext(SHOP_RELIABILITY_SOURCE, sandbox); assert.equal(api, sandbox.globalThis.MMDShopReliability);
  for (const lang of ["th", "en", "zh"]) assert.ok(api.message(lang, "resume"));
});
