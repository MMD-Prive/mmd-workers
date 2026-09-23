import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kenjiSalesV2SmokeRequest,
  handleKenjiSeedLineRequestWithRedeliveryRecovery,
} from '../src/kenji-line-redelivery-recovery.mjs';
import productionWorker from '../src/mms-line-front-gate.js';

const header = { 'x-mmd-kenji-sales-v2-smoke': '1' };
const origin = 'https://www.mmdbkk.com';

for (const path of ['/webhooks/line', '/webhooks/line/']) {
  test(`V2 smoke header normalizes only matched GET ${path}`, () => {
    const request = new Request(origin + path, { headers: header });
    const normalized = kenjiSalesV2SmokeRequest(request);
    assert.equal(new URL(normalized.url).searchParams.get('kenji_sales_v2_smoke'), '1');
    assert.equal(new URL(normalized.url).pathname, path);
    assert.equal(normalized.method, 'GET');
    assert.equal(new URL(request.url).search, '');
    assert.equal(normalized.headers.get('x-mmd-kenji-sales-v2-smoke'), '1');
  });
}

for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
  test(`V2 smoke header does not transform ${method}`, () => {
    const request = new Request(origin + '/webhooks/line', { method, headers: header });
    assert.equal(kenjiSalesV2SmokeRequest(request), request);
  });
}

for (const path of ['/webhooks/line/mms', '/internal/admin', '/webhooks/line-other']) {
  test(`V2 smoke header does not acquire ${path}`, () => {
    const request = new Request(origin + path, { headers: header });
    assert.equal(kenjiSalesV2SmokeRequest(request), request);
  });
}

test('ordinary GET remains unchanged', () => {
  const request = new Request(origin + '/webhooks/line');
  assert.equal(kenjiSalesV2SmokeRequest(request), request);
});

test('nonexact smoke flag does not activate diagnostic', () => {
  const request = new Request(origin + '/webhooks/line', { headers: { 'x-mmd-kenji-sales-v2-smoke': 'true' } });
  assert.equal(kenjiSalesV2SmokeRequest(request), request);
});

for (const [name, handle] of [
  ['redelivery wrapper', (request) => handleKenjiSeedLineRequestWithRedeliveryRecovery(request, {})],
  ['production entrypoint', (request) => productionWorker.fetch(request, {}, {})],
]) {
  test(`${name}: header reaches V2 inspection without any external write`, async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('unexpected outbound request'); });
    const response = await handle(new Request(origin + '/webhooks/line', { headers: header }));
    assert.equal(response.status, 503, 'missing credentials fail closed');
    const body = await response.json();
    assert.equal(body.version, '2026-09-14.2');
    assert.equal(body.synthetic, true);
    assert.equal(body.line_delivery_attempted, false);
    assert.equal(body.telemetry_write_attempted, false);
    assert.equal(body.cards.length, 8);
    assert.ok(body.cards.every(card => card.ready === false));
    assert.equal(calls, 0, 'no LINE call or customer mutation');
  });
}

test('POST with smoke header still requires original LINE signature', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('unexpected outbound request'); });
  const request = new Request(origin + '/webhooks/line', {
    method: 'POST', headers: { ...header, 'content-type': 'application/json' }, body: '{"events":[]}',
  });
  const response = await handleKenjiSeedLineRequestWithRedeliveryRecovery(request, { LINE_CHANNEL_SECRET: 'synthetic-unit-test-secret' });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'invalid_signature');
  assert.equal(calls, 0);
});
