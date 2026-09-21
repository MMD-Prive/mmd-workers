import assert from "node:assert/strict";
import test from "node:test";
import { boundedBody, checkoutFingerprint, digest, durableCheckoutAttempt, forwardCheckoutAttempt } from "../src/shop-checkout-attempt.mjs";

export function stateFixture(records = new Map()) {
  let gate = Promise.resolve();
  return {
    records,
    storage: { async get(k) { return structuredClone(records.get(k)); }, async put(k,v) { records.set(k, structuredClone(v)); } },
    blockConcurrencyWhile(fn) { const task = gate.then(fn); gate = task.catch(() => {}); return task; },
    waitUntil() {},
  };
}
const requestId = "a".repeat(64);
const payload = { checkout_request_id: requestId, customer: { name: "Test", phone: "0800000000" }, shipping: { delivery_method: "pickup" }, items: [{ product_id: "rec12345678901234", quantity: 1 }], quote: { currency: "THB", items: [], total_thb: 100 } };
const envelope = async (extra = {}) => ({ shop: "shop", key_hash: await digest(requestId), subject_hash: await digest("guest"), request_body: structuredClone(payload), ...extra });
const recover = async (extra = {}) => envelope({ request_body: { checkout_request_id: requestId, recover: true }, ...extra });
function successful(request, env, ctx, options) { return Response.json({ ok: true, shop: "shop", order_id: options.orderId, payment_url: "https://mmdbkk.com/pay/checkout?t=fixture%2Btoken", payment_status: "pending" }); }

test("duplicate concurrent requests execute only once and recovery returns the exact original receipt", async () => {
  const state = stateFixture(); let calls = 0, release;
  const hold = new Promise((r) => { release = r; });
  const execute = async (...args) => { calls++; await hold; return successful(...args); };
  const env = await envelope(); const first = durableCheckoutAttempt(state, {}, env, execute);
  while (!calls) await new Promise((r) => setTimeout(r, 1));
  const parallel = await durableCheckoutAttempt(state, {}, env, execute);
  assert.equal(parallel.status, 202); assert.equal((await parallel.json()).safe_new_attempt, false);
  release(); const original = await (await first).json();
  const replay = await (await durableCheckoutAttempt(stateFixture(state.records), {}, await recover(), execute)).json();
  assert.equal(calls, 1); assert.equal(replay.order_id, original.order_id); assert.equal(replay.payment_url, original.payment_url); assert.equal(replay.checkout_replayed, true);
});
test("a key reused with a different cart is a conflict, not a new checkout", async () => {
  const state = stateFixture(); await durableCheckoutAttempt(state, {}, await envelope(), successful);
  const changed = await envelope(); changed.request_body.items[0].quantity = 2;
  const response = await durableCheckoutAttempt(state, {}, changed, () => { throw new Error("must not execute"); });
  assert.equal(response.status, 409); assert.equal((await response.json()).error, "checkout_request_conflict");
});
test("brand or server identity mismatch cannot replay another receipt", async () => {
  const state = stateFixture(); await durableCheckoutAttempt(state, {}, await envelope(), successful);
  for (const changed of [{ shop: "mmd-shop" }, { subject_hash: await digest("another member") }]) {
    const response = await durableCheckoutAttempt(state, {}, await recover(changed), successful);
    const data = await response.json(); assert.equal(response.status, 409); assert.equal(data.payment_url, undefined); assert.equal(data.order_id, undefined);
  }
});
test("worker restart after an ambiguous failure never takes over and duplicates writes", async () => {
  let calls = 0; const state = stateFixture(), epoch = Date.now();
  const failure = async () => { calls++; throw new Error("write acknowledged only by upstream"); };
  assert.equal((await durableCheckoutAttempt(state, {}, await envelope(), failure, () => epoch)).status, 503);
  const resumed = await durableCheckoutAttempt(stateFixture(state.records), {}, await recover(), failure, () => epoch + 120001);
  assert.equal((await resumed.json()).error, "checkout_recovery_required"); assert.equal(calls, 1);
});
test("a failed completion journal stays held even when the checkout succeeded upstream", async () => {
  const state = stateFixture(); let puts = 0, calls = 0;
  const put = state.storage.put; state.storage.put = async (...args) => { if (++puts > 1) throw new Error("storage failed"); return put(...args); };
  const response = await durableCheckoutAttempt(state, {}, await envelope(), async (...args) => { calls++; return successful(...args); });
  assert.equal(response.status, 503);
  await durableCheckoutAttempt(stateFixture(state.records), {}, await recover(), async () => { calls++; });
  assert.equal(calls, 1);
});
test("expired response becomes a tombstone and can never execute again", async () => {
  const state = stateFixture(); let calls = 0; const epoch = Date.now();
  const execute = async (...args) => { calls++; return successful(...args); };
  await durableCheckoutAttempt(state, {}, await envelope(), execute, () => epoch);
  const next = await durableCheckoutAttempt(state, {}, await envelope(), execute, () => epoch + 25 * 3600000);
  assert.equal(next.status, 409); assert.equal((await next.json()).error, "checkout_attempt_expired");
  assert.equal(state.records.get("checkout_attempt_v1").response, null); assert.equal(calls, 1);
});
test("recovery for an undelivered original request does not create anything", async () => {
  const state = stateFixture(); const response = await durableCheckoutAttempt(state, {}, await recover(), () => { throw new Error("no execution"); });
  assert.equal(response.status, 404); assert.equal(state.records.size, 0);
});
test("terminal preflight rejection is replayed with no second execution", async () => {
  const state = stateFixture(); let calls = 0;
  const execute = async () => { calls++; return Response.json({ ok: false, error: "checkout_price_changed", safe_new_attempt: true }, { status: 409 }); };
  await durableCheckoutAttempt(state, {}, await envelope(), execute);
  const response = await durableCheckoutAttempt(state, {}, await recover(), execute);
  assert.equal(response.status, 409); assert.equal((await response.json()).safe_new_attempt, true); assert.equal(calls, 1);
});
test("expired reservation is not replayed as a fresh payable order", async () => {
  const state = stateFixture(); const epoch = Date.now();
  await durableCheckoutAttempt(state, {}, await envelope(), async (...args) => {
    const body = await successful(...args).json(); body.reservation = { expires_at: new Date(epoch + 10).toISOString() }; return Response.json(body);
  }, () => epoch);
  const response = await durableCheckoutAttempt(state, {}, await recover(), successful, () => epoch + 100);
  assert.equal(response.status, 409); assert.equal((await response.json()).payment_url, undefined);
});
test("missing client key fails before the durable object or business writes", async () => {
  const request = new Request("https://mmdbkk.com/shop/api/checkout", { method: "POST", body: "{}" });
  const response = await forwardCheckoutAttempt(request, {});
  assert.equal(response.status, 428); assert.equal((await response.json()).safe_new_attempt, true);
});
test("missing DO binding fails closed rather than using an in-memory fallback", async () => {
  const response = await forwardCheckoutAttempt(new Request("https://mmdbkk.com/shop/api/checkout", { method: "POST", body: JSON.stringify(payload) }), {});
  assert.equal(response.status, 503); assert.equal((await response.json()).safe_new_attempt, false);
});
test("client shop labels never select the attempt namespace", async () => {
  let name, sent;
  const env = { MMD_SHOP_STOCK_COORDINATOR: { idFromName(value) { name = value; return value; }, get() { return { async fetch(url, init) { sent = JSON.parse(init.body); return Response.json({ ok: false, error: "fixture" }); } }; } } };
  await forwardCheckoutAttempt(new Request("https://mmdbkk.com/shop/api/checkout", { method: "POST", body: JSON.stringify({ ...payload, shop: "mmd-shop", member_id: "spoof" }) }), env);
  assert.match(name, /^checkout-v1:shop:/); assert.equal(sent.shop, "shop"); assert.equal(sent.member_context, null);
});
test("fingerprint ignores non-authoritative shop and monetary overrides", async () => {
  assert.equal(await checkoutFingerprint(payload, "shop"), await checkoutFingerprint({ ...payload, shop: "mmd-shop", total_thb: 1, member_id: "spoof" }, "shop"));
});
test("oversized and malformed JSON are rejected before storage", async () => {
  await assert.rejects(boundedBody(new Request("https://test", { method: "POST", body: "{" })), /invalid_json_body/);
  await assert.rejects(boundedBody(new Request("https://test", { method: "POST", body: "x".repeat(32769) })), /checkout_body_too_large/);
});

test('alarm removes a cached payment URL without allowing the attempt to run again', async () => {
  const { expireCheckoutAttempt } = await import('../src/shop-checkout-attempt.mjs');
  const map = new Map([['checkout_attempt_v1', { started_at: 0, state:'completed', order_id:'MMD-fixture', response:{body:{payment_url:'https://mmdbkk.com/pay/checkout?t=fixture-secret'}} }]]);
  const state = { storage:{ async get(k){return map.get(k);},async put(k,v){map.set(k,v);} } };
  await expireCheckoutAttempt(state,()=>86400001);
  assert.equal(map.get('checkout_attempt_v1').response,null);
  assert.equal(map.get('checkout_attempt_v1').state,'expired');
  assert.equal(map.get('checkout_attempt_v1').order_id,'MMD-fixture');
});
