import test from "node:test";
import assert from "node:assert/strict";
import { handleMmdShopCheckout, executeMmdShopCheckout, validateCheckoutQuote } from "../src/mmd-shop-checkout.js";
import { durableCheckoutAttempt } from "../src/shop-checkout-attempt.mjs";
import { createReservationMetadata } from "../../shared/mmd-shop-stock-reservation.mjs";

const tables = { products: "tblzsmNLfP6J0kQ90", customers: "tbllkfCySeL9fSfZw", orders: "tblr8lbi2wMuRM1N4", items: "tbl37Iprxz4OLL65P", inventory: "tblwFgl4et1TOgtNn" };
const productId = "recProduct0000001";
const ids = { customer: "recCustomer000001", order: "recOrder000000001", item: "recItem0000000001" };
function state() {
  const values = new Map(); let lock = Promise.resolve();
  return { storage: { async get(k) { return structuredClone(values.get(k)); }, async put(k,v) { values.set(k,structuredClone(v)); } },
    blockConcurrencyWhile(fn) { const result = lock.then(fn); lock = result.catch(() => {}); return result; }, waitUntil() {} };
}
function fixture({ paymentFails = false, stock = 5, brands = ["Himai Shop", "MMD Shop"] } = {}) {
  const states = new Map(), calls = { orders: 0, reserves: 0, releases: 0, paymentIntents: 0, notifications: [], writes: [] };
  let order;
  const product = { id: productId, fields: { fld0oKjoZrb1IqntV: "Fixture Accessory", fldhJE7UEE4VYHjR6: "FIXTURE", fldve5nrQmymoZgiX: brands,
    fldxYkkvmK9izvACA: "active", fldJCZ7YzsUjIItKf: ["recSupplier000001"], fldD6Q5yido7pTlU0: 100, fldo4N9GRq6rHPiCh: 80 } };
  const env = {
    AIRTABLE_TOKEN: "fixture-not-a-secret", AIRTABLE_BASE_ID: "appFixture",
    AUTH_SERVICE_HIMAI_TO_TELEGRAM: "fixture-not-a-secret",
    PAYMENTS_WORKER: { async fetch(request) {
      calls.paymentIntents++; const body = await request.json();
      if (paymentFails) throw new Error("simulated ambiguous payment response");
      return Response.json({ ok: true, payment_ref: `fixture-${body.order_id}`, customer_payment_url: "https://mmdbkk.com/pay/checkout?t=fixture-token" });
    } },
    TELEGRAM_WORKER: { async fetch(request) { calls.notifications.push(await request.json()); return Response.json({ ok: true, telegram: { ok: true } }); } },
  };
  env.MMD_SHOP_STOCK_COORDINATOR = {
    idFromName(name) { return name; },
    get(name) { return { async fetch(url, options) {
      const body = JSON.parse(options.body), path = new URL(url).pathname;
      if (name.startsWith("checkout-v1:")) {
        if (!states.has(name)) states.set(name, state());
        return durableCheckoutAttempt(states.get(name), env, body, executeMmdShopCheckout);
      }
      if (path === "/reserve") { calls.reserves++; return Response.json({ ok: true, reservation: { ...createReservationMetadata(body.order_id, []), order_record_id: order.id } }); }
      if (path === "/release") { calls.releases++; return Response.json({ ok: true, reservation: { ...body.reservation, state: "released" } }); }
      throw new Error("Unexpected coordinator route " + path);
    } }; }
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); assert.equal(url.hostname, "api.airtable.com");
    const [, , table, recordId] = url.pathname.split("/").filter(Boolean), method = options.method || "GET";
    if (method === "GET" && table === tables.products && recordId === productId) return Response.json(product);
    if (method === "GET" && table === tables.inventory) return Response.json({ records: [{ id: "recBatch00000001", fields: { fldVc73xUxjrfSjHY: [productId], fldvjoRuM1mrR6ItQ: stock, fldZW2m1Xq8q0ZH9Z: "active" } }] });
    if (method === "GET" && table === tables.customers) return Response.json({ records: [] });
    if (method === "POST") {
      const body = JSON.parse(options.body); calls.writes.push(table);
      const records = body.records.map((r) => ({ ...r, id: table === tables.orders ? ids.order : table === tables.customers ? ids.customer : ids.item }));
      if (table === tables.orders) { calls.orders++; order = records[0]; }
      return Response.json({ records });
    }
    if (method === "PATCH" && table === tables.orders) { Object.assign(order.fields, JSON.parse(options.body).fields); calls.writes.push(table); return Response.json(order); }
    throw new Error(`Unexpected fixture network ${method} ${url.pathname}`);
  };
  return { env, calls, product, getOrder: () => order, restore: () => { globalThis.fetch = originalFetch; } };
}
function body(shop, price = shop === "shop" ? 80 : 100) {
  return { checkout_request_id: "c".repeat(64), customer: { name: "Fixture Customer", phone: "0800000000", email: "" },
    shipping: { delivery_method: "pickup", recipient_name: "Fixture Customer", phone: "0800000000" },
    source_path: "/forged; shop_brand=wrong", shop: shop === "shop" ? "mmd-shop" : "shop", total_thb: 1,
    items: [{ product_id: productId, quantity: 1 }], quote: { currency: "THB", total_thb: price, items: [{ product_id: productId, unit_price_thb: price }] } };
}
function request(shop, payload) { return new Request(`https://www.mmdbkk.com/${shop}/api/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
for (const shop of ["shop", "mmd-shop"]) {
  test(`${shop}: full mocked creation and replay use its own price, order prefix and notification lane`, { concurrency: false }, async () => {
    const f = fixture();
    try {
      const input = body(shop), firstResponse = await handleMmdShopCheckout(request(shop, input), f.env), first = await firstResponse.json();
      assert.equal(firstResponse.status, 200, JSON.stringify(first)); assert.equal(first.ok, true);
      assert.equal(first.total_thb, shop === "shop" ? 80 : 100); assert.ok(first.order_id.startsWith(shop === "shop" ? "HIMAI-" : "MMD-"));
      assert.equal(first.payment_status, "pending"); assert.equal(first.official_payment_verification_required, true);
      const replay = await (await handleMmdShopCheckout(request(shop, { checkout_request_id: input.checkout_request_id, recover: true }), f.env)).json();
      assert.equal(replay.order_id, first.order_id); assert.equal(replay.idempotent, true);
      assert.equal(f.calls.orders, 1); assert.equal(f.calls.reserves, 1); assert.equal(f.calls.paymentIntents, 1); assert.equal(f.calls.notifications.length, 1);
      assert.equal(f.calls.notifications[0].flow, shop === "shop" ? "himai_orders" : "mmd_shop_orders");
      assert.equal(f.getOrder().fields.fld97aHqq3IbPam84, shop === "shop" ? "Himai Shop" : "MMD Shop");
      assert.ok(f.getOrder().fields.fldWG0u77XQ5W0wpT.includes(`source_path=/${shop}`));
      assert.ok(!f.getOrder().fields.fldWG0u77XQ5W0wpT.includes("shop_brand=wrong"));
    } finally { f.restore(); }
  });
  test(`${shop}: a tampered quote cannot change price or create any record`, { concurrency: false }, async () => {
    const f = fixture(); try {
      const response = await handleMmdShopCheckout(request(shop, body(shop, 1)), f.env), data = await response.json();
      assert.equal(response.status, 409); assert.equal(data.error, "checkout_price_changed"); assert.equal(data.safe_new_attempt, true);
      assert.equal(f.calls.writes.length, 0); assert.equal(f.calls.reserves, 0); assert.equal(f.calls.notifications.length, 0);
    } finally { f.restore(); }
  });
  test(`${shop}: payment initialization failure stays on one held attempt and never sends a misleading new-order message`, { concurrency: false }, async () => {
    const f = fixture({ paymentFails: true }); try {
      const input = body(shop); const first = await (await handleMmdShopCheckout(request(shop, input), f.env)).json();
      assert.equal(first.ok, false); assert.equal(first.safe_new_attempt, false);
      const second = await (await handleMmdShopCheckout(request(shop, input), f.env)).json();
      assert.equal(second.order_id, first.order_id); assert.equal(f.calls.orders, 1); assert.equal(f.calls.reserves, 1);
      assert.equal(f.calls.releases, 1); assert.equal(f.calls.notifications.length, 0);
    } finally { f.restore(); }
  });
}
test("out-of-stock and restricted products cannot create orders", { concurrency: false }, async () => {
  for (const restricted of [false, true]) {
    const f = fixture({ stock: restricted ? 5 : 0 });
    if (restricted) f.product.fields.fldhJE7UEE4VYHjR6 = "PPP25-TEST";
    try { const data = await (await handleMmdShopCheckout(request("shop", body("shop")), f.env)).json(); assert.equal(data.ok, false); assert.equal(f.calls.orders, 0); assert.equal(f.calls.reserves, 0); }
    finally { f.restore(); }
  }
});
test("missing or duplicate quote rows fail before any amount override", () => {
  const cart = [{ product_id: productId, unit_price_thb: 100, line_total_thb: 100 }];
  assert.throws(() => validateCheckoutQuote(null, cart), /checkout_price_quote_required/);
  assert.throws(() => validateCheckoutQuote({ currency: "THB", total_thb: 100, items: [{ product_id: productId, unit_price_thb: 100 }, { product_id: productId, unit_price_thb: 100 }] }, cart), /invalid_checkout_quote/);
});
