import test from 'node:test';
import assert from 'node:assert/strict';
import { couponExpiry, couponTotals, GG_COUPON, issueGgCoupon, inspectGgCoupon, holdGgCoupon, settleGgCoupon, normalizeCouponCode } from '../src/mmd-shop-coupons.js';
import { handleShopCouponRoute } from '../src/shop-coupon-routes.js';
import { handleReplaySafeShopCheckout } from '../src/shop-checkout-idempotency.js';
import { MmdShopStockCoordinator } from '../src/mmd-shop-stock-coordinator.js';

function storage() {
  const rows = new Map(); let tail = Promise.resolve();
  const api = { get: async key => structuredClone(rows.get(key)), put: async (key, value) => { rows.set(key, structuredClone(value)); }, delete: async key => rows.delete(key), setAlarm: async () => {}, transaction(fn) { const p = tail.then(() => fn(api)); tail = p.catch(() => {}); return p; } };
  return api;
}
const NOW = Date.parse('2026-10-03T12:00:00.000Z');
const KEY = 'fixture-issuance-0001';
const ORDER = 'MMD-20261003-FIXTURE01';
const line = (qty = 1, overrides = {}) => ({ ...GG_COUPON, quantity: qty, unit_price_thb: 4500, line_total_thb: 4500 * qty, ...overrides });

test('two Bangkok calendar months: same time, year rollover, month end, and exact expiry boundary', async () => {
  assert.equal(couponExpiry(NOW), '2026-12-03T12:00:00.000Z');
  assert.equal(couponExpiry('2026-12-31T16:30:00Z'), '2027-02-28T16:30:00.000Z');
  // UTC Oct 30 at 18:00 is Bangkok Oct 31 at 01:00.
  assert.equal(couponExpiry('2026-10-30T18:00:00Z'), '2026-12-30T18:00:00.000Z');
  const s = storage(), issued = await issueGgCoupon(s, KEY, NOW), end = Date.parse(issued.coupon.expires_at);
  assert.equal((await inspectGgCoupon(s, issued.code, end - 1)).coupon.state, 'active');
  await assert.rejects(inspectGgCoupon(s, issued.code, end), /coupon_expired/);
});
test('concurrent issuance retry returns exactly one active code without extending expiry', async () => {
  const s = storage();
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => issueGgCoupon(s, KEY, NOW + i)));
  assert.equal(new Set(results.map(x => x.code)).size, 1);
  assert.equal(results.filter(x => !x.idempotent).length, 1);
  assert.equal((await issueGgCoupon(s, KEY, NOW + 86400000)).coupon.issued_at, results[0].coupon.issued_at);
  assert.equal(normalizeCouponCode(' ' + results[0].code.toLowerCase() + ' '), results[0].code);
  assert.throws(() => normalizeCouponCode({ code: 'forged' }), /coupon_invalid/);
});
test('500 discount is once per order and only the exact GG Water 50 ml record and SKU', () => {
  assert.deepEqual(couponTotals([line()]), { subtotal_thb: 4500, discount_thb: 500, total_thb: 4000 });
  assert.deepEqual(couponTotals([line(2)]), { subtotal_thb: 9000, discount_thb: 500, total_thb: 8500 });
  assert.equal(couponTotals([line(), line(1, { product_id: 'recAAAAAAAAAAAAAA', sku: 'OTHER', line_total_thb: 1000 })]).total_thb, 5000);
  for (const overrides of [{ sku: 'WGG-25' }, { product_id: 'recAAAAAAAAAAAAAA' }, { line_total_thb: 499 }]) assert.throws(() => couponTotals([line(1, overrides)]));
});
test('different orders racing one code: one hold, including after coordinator restart', async () => {
  const s = storage(), issued = await issueGgCoupon(s, KEY, NOW);
  const results = await Promise.allSettled([holdGgCoupon(s, issued.code, ORDER, NOW), holdGgCoupon(s, issued.code, ORDER + '2', NOW)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  await assert.rejects(inspectGgCoupon(s, issued.code, NOW), /coupon_in_use/);
  await assert.rejects(holdGgCoupon(s, issued.code, ORDER + '3', NOW), /coupon_in_use/);
  const winningOrder = results[0].status === 'fulfilled' ? ORDER : ORDER + '2';
  assert.equal((await holdGgCoupon(s, issued.code, winningOrder, NOW)).coupon.state, 'held');
});
test('commit is single use, cannot release or reuse a paid coupon; authenticated settlement may finish after expiry', async () => {
  const s = storage(), issued = await issueGgCoupon(s, KEY, NOW);
  await holdGgCoupon(s, issued.code, ORDER, NOW);
  await settleGgCoupon(s, ORDER, 'commit', Date.parse(issued.coupon.expires_at) + 1);
  assert.equal((await settleGgCoupon(s, ORDER, 'commit')).idempotent, true);
  await assert.rejects(inspectGgCoupon(s, issued.code, NOW), /coupon_used/);
  await assert.rejects(settleGgCoupon(s, ORDER, 'release'), /coupon_used/);
});
test('safe release keeps original expiry and permits one new order only', async () => {
  const s = storage(), issued = await issueGgCoupon(s, KEY, NOW);
  await holdGgCoupon(s, issued.code, ORDER, NOW);
  await settleGgCoupon(s, ORDER, 'release', NOW + 1);
  assert.equal((await inspectGgCoupon(s, issued.code, NOW + 2)).coupon.expires_at, issued.coupon.expires_at);
  await holdGgCoupon(s, issued.code, ORDER + '2', NOW + 3);
  await settleGgCoupon(s, ORDER, 'commit', NOW + 4); // Old released order cannot consume the new hold.
  await assert.rejects(inspectGgCoupon(s, issued.code, NOW + 4), /coupon_in_use/);
});

function fixture() {
  const original = globalThis.fetch, objects = new Map(), counts = { orders: 0, customers: 0, items: 0, payments: 0 }, orderRows = [], paymentBodies = [];
  const tables = { products: 'tblzsmNLfP6J0kQ90', stock: 'tblwFgl4et1TOgtNn', customers: 'tbllkfCySeL9fSfZw', orders: 'tblr8lbi2wMuRM1N4', items: 'tbl37Iprxz4OLL65P' };
  const product = { id: GG_COUPON.product_id, fields: { fld0oKjoZrb1IqntV: 'Water GG Plus 50ml', fldhJE7UEE4VYHjR6: GG_COUPON.sku, fldve5nrQmymoZgiX: ['both'], fldxYkkvmK9izvACA: 'active', fldJCZ7YzsUjIItKf: ['recSSSSSSSSSSSSSS'], fldD6Q5yido7pTlU0: 4500, fldo4N9GRq6rHPiCh: 4500 } };
  globalThis.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : new Request(input, init), url = new URL(req.url), [, , , table, id] = url.pathname.split('/');
    assert.equal(url.hostname, 'api.airtable.com');
    if (req.method === 'GET') {
      if (table === tables.products && id === product.id) return Response.json(product);
      if (table === tables.stock) return Response.json({ records: [{ id: 'recBBBBBBBBBBBBBB', fields: { fldVc73xUxjrfSjHY: [product.id], fldvjoRuM1mrR6ItQ: 20, fldZW2m1Xq8q0ZH9Z: 'active' } }] });
      if (table === tables.customers) return Response.json({ records: [] });
    }
    const body = await req.json();
    if (req.method === 'POST') {
      const name = Object.keys(tables).find(k => tables[k] === table); assert.ok(['orders', 'customers', 'items'].includes(name)); counts[name]++;
      const records = body.records.map(x => ({ id: 'rec' + name[0].toUpperCase().repeat(14), fields: x.fields }));
      if (name === 'orders') orderRows.push(...records);
      return Response.json({ records });
    }
    if (req.method === 'PATCH') return Response.json({ id, fields: body.fields });
    throw new Error('unexpected_fixture_io');
  };
  const env = { AIRTABLE_BASE_ID: 'appFixture', AIRTABLE_TOKEN: 'fixture-only', INTERNAL_TOKEN: 'fixture-only', PAYMENTS_WORKER: { fetch: async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init), body = await req.json();
    if (new URL(req.url).pathname.includes('expire-intent')) return Response.json({ ok: true, expired: env.expiryConfirmed === true, order_id: body.order_id });
    counts.payments++; paymentBodies.push(body);
    if (env.failPayment) throw new Error('fixture_payment_outcome_unknown');
    return Response.json({ ok: true, payment_ref: 'fixture_ref', customer_payment_url: 'https://mmdbkk.com/pay/checkout?t=fixture_signed' });
  } } };
  const globalStorage = storage(), coordinator = new MmdShopStockCoordinator({ storage: globalStorage }, env);
  env.MMD_SHOP_STOCK_COORDINATOR = { idFromName: x => x, get: id => {
    if (id === 'global') return { fetch: async (input, init) => {
      const req = input instanceof Request ? input : new Request(input, init), path = new URL(req.url).pathname, body = await req.clone().json();
      if (path === '/reserve') return Response.json({ ok: true, reservation: { schema: 'mmd_shop_stock_reservation_v1', state: 'reserved', order_id: body.order_id, expires_at: new Date(Date.now() + 2700000).toISOString(), items: [] } });
      if (path === '/release') return Response.json({ ok: true, reservation: { ...body.reservation, state: 'released' } });
      return coordinator.fetch(req);
    } };
    if (!objects.has(id)) objects.set(id, new MmdShopStockCoordinator({ storage: storage(), waitUntil() {} }, env));
    return objects.get(id);
  } };
  return { env, counts, orderRows, paymentBodies, product, globalStorage, coordinator, restore() { globalThis.fetch = original; } };
}
function checkoutRequest(code, key = 'a', shop = 'mmd-shop', changes = {}) {
  return new Request('https://mmdbkk.com/' + shop + '/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'sc1_' + key.repeat(32) }, body: JSON.stringify({ customer: { name: 'Fixture Therapist', phone: '0800000000' }, shipping: { delivery_method: 'pickup' }, items: [{ product_id: GG_COUPON.product_id, quantity: 1, expected_unit_price_thb: 4500 }], ...(code ? { coupon_code: code } : {}), ...changes }) });
}
function routeRequest(action, body, token = '') { return new Request('https://mmdbkk.com/mmd-shop/api/coupons/' + action, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-internal-token': token } : {}) }, body: JSON.stringify(body) }); }

test('anonymous quote is read only; only authenticated issuer can create a code', async () => {
  const x = fixture(); try {
    for (const token of ['', 'wrong']) assert.equal((await handleShopCouponRoute(routeRequest('issue', { issuance_key: KEY }, token), x.env)).status, 401);
    const issued = await (await handleShopCouponRoute(routeRequest('issue', { issuance_key: KEY }, 'fixture-only'), x.env)).json();
    const quote = await (await handleShopCouponRoute(routeRequest('quote', { coupon_code: issued.code, discount_thb: 4500, items: [{ product_id: GG_COUPON.product_id, quantity: 1, expected_unit_price_thb: 4500 }] }), x.env)).json();
    assert.equal(quote.total_thb, 4000); assert.equal(quote.discount_thb, 500);
    assert.equal((await inspectGgCoupon(x.globalStorage, issued.code)).coupon.state, 'active');
    assert.deepEqual(x.counts, { orders: 0, customers: 0, items: 0, payments: 0 });
    assert.equal((await handleShopCouponRoute(routeRequest('issue', { issuance_key: KEY }, 'fixture-only'), x.env)).headers.get('cache-control'), 'no-store, private');
  } finally { x.restore(); }
});
test('guest checkout: discounted amount reaches order and payment, replay creates no second order, code is fingerprinted', async () => {
  const x = fixture(); try {
    const issued = await issueGgCoupon(x.globalStorage, KEY);
    const result = await (await handleReplaySafeShopCheckout(checkoutRequest(issued.code), x.env)).json();
    assert.equal(result.ok, true); assert.equal(result.total_thb, 4000); assert.equal(result.discount_thb, 500);
    assert.equal(x.orderRows[0].fields.fldYIwMzRJdKdznkY, 4000); assert.equal(x.paymentBodies[0].amount, 4000);
    assert.match(x.orderRows[0].fields.fldWG0u77XQ5W0wpT, /mmd_shop_coupon_v1=/);
    assert.ok(!x.orderRows[0].fields.fldWG0u77XQ5W0wpT.includes(issued.code));
    const replay = await (await handleReplaySafeShopCheckout(checkoutRequest(issued.code), x.env)).json();
    assert.equal(replay.order_id, result.order_id); assert.equal(replay.idempotent, true);
    assert.deepEqual(x.counts, { orders: 1, customers: 1, items: 1, payments: 1 });
    assert.equal((await handleReplaySafeShopCheckout(checkoutRequest('MMD-GG-' + 'F'.repeat(32)), x.env)).status, 409);
    await assert.rejects(inspectGgCoupon(x.globalStorage, issued.code), /coupon_in_use/);
    const committed = await x.coordinator.fetch(new Request('https://mmd-shop-stock.internal/commit', { method: 'POST', body: JSON.stringify({ reservation: { ...result.reservation, order_id: result.order_id, state: 'committed' } }) }));
    assert.equal(committed.status, 200);
    await assert.rejects(inspectGgCoupon(x.globalStorage, issued.code), /coupon_used/);
  } finally { x.restore(); }
});
test('two different checkout keys race one coupon: exactly one discounted order and payment', async () => {
  const x = fixture(); try {
    const issued = await issueGgCoupon(x.globalStorage, KEY);
    const responses = await Promise.all([handleReplaySafeShopCheckout(checkoutRequest(issued.code, 'a'), x.env), handleReplaySafeShopCheckout(checkoutRequest(issued.code, 'b'), x.env)]);
    assert.deepEqual(responses.map(x => x.status).sort(), [200, 409]);
    assert.equal(x.counts.orders, 1); assert.equal(x.counts.payments, 1);
    const loser = await responses.find(x => x.status === 409).json(); assert.equal(loser.new_attempt_allowed, true);
  } finally { x.restore(); }
});
test('coupon is rejected on Himai and without the exact eligible SKU before any writes', async () => {
  const x = fixture(); try {
    const issued = await issueGgCoupon(x.globalStorage, KEY);
    assert.equal((await handleReplaySafeShopCheckout(checkoutRequest(issued.code, 'a', 'shop'), x.env)).status, 400);
    x.product.fields.fldhJE7UEE4VYHjR6 = 'WGG-25';
    assert.equal((await handleReplaySafeShopCheckout(checkoutRequest(issued.code, 'b'), x.env)).status, 409);
    assert.equal(x.counts.orders, 0); assert.equal(x.counts.customers, 0);
  } finally { x.restore(); }
});
test('uncertain payment keeps coupon held; only acknowledged cancellation unlocks it, without extending expiry', async () => {
  const x = fixture(); try {
    const issued = await issueGgCoupon(x.globalStorage, KEY); x.env.failPayment = true;
    const response = await handleReplaySafeShopCheckout(checkoutRequest(issued.code), x.env); assert.equal(response.status, 500);
    const result = await response.json(); assert.equal(result.new_attempt_allowed, false);
    await assert.rejects(inspectGgCoupon(x.globalStorage, issued.code), /coupon_in_use/);
    const recover = () => x.coordinator.fetch(new Request('https://mmd-shop-stock.internal/coupons/recover', { method: 'POST', body: JSON.stringify({ order_id: result.order_id, no_payment_started: false }) }));
    assert.equal((await recover()).status, 409);
    x.env.expiryConfirmed = true; assert.equal((await recover()).status, 200);
    assert.equal((await inspectGgCoupon(x.globalStorage, issued.code)).coupon.expires_at, issued.coupon.expires_at);
  } finally { x.restore(); }
});
test('requests without a coupon retain normal checkout price', async () => {
  const x = fixture(); try { const result = await (await handleReplaySafeShopCheckout(checkoutRequest(''), x.env)).json(); assert.equal(result.total_thb, 4500); assert.equal(x.paymentBodies[0].amount, 4500); } finally { x.restore(); }
});

test('Webflow deliverables fit the custom-code limit and embed the tested coupon runtime exactly', async () => {
  const { readFile } = await import('node:fs/promises');
  const embed = await readFile(new URL('../../webflow/mmd-shop/mmd-shop-coupons.embed.html', import.meta.url), 'utf8');
  const client = await readFile(new URL('../../webflow/mmd-shop/shop-coupon-client.js', import.meta.url), 'utf8');
  const footer = await readFile(new URL('../../webflow/mmd-shop/mmd-shop-commerce-footer.html', import.meta.url), 'utf8');
  const head = await readFile(new URL('../../webflow/shared/shop-checkout-safety.head.html', import.meta.url), 'utf8');
  const safety = await readFile(new URL('../../webflow/shared/shop-checkout-safety.js', import.meta.url), 'utf8');
  assert.ok(embed.length < 50000 && footer.length < 50000 && head.length < 50000);
  assert.equal(embed.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1].trim(), client.trim());
  assert.equal(head.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1].trim(), safety.trim());
});
