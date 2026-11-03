import test from 'node:test';
import assert from 'node:assert/strict';
import runtime from '../src/runtime-index.js';

const reference = 'mmdreq_' + 'a'.repeat(64);
const env = {
  AIRTABLE_API_KEY: 'fixture-only',
  AIRTABLE_BASE_ID: 'appFixture',
  AIRTABLE_TABLE_BOOKING_REQUESTS_ID: 'Bookings',
};
const paths = ['/sigil/api/client/resolve', '/sigil/api/booking/intake'];

async function withOwnedRecord(run) {
  const original = globalThis.fetch;
  const reads = [], writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof URL ? input : typeof input === 'string' ? input : input.url);
    assert.equal(url.hostname, 'api.airtable.com', 'only the local Airtable fixture may be called');
    const method = init.method || (input instanceof Request ? input.method : 'GET');
    if (method !== 'GET') {
      writes.push(method);
      throw new Error('owned request must not reach a write');
    }
    reads.push(url);
    assert.equal(decodeURIComponent(url.pathname.split('/')[3]), 'Bookings');
    assert.equal(url.searchParams.get('filterByFormula'), `{booking_ref}='${reference}'`);
    return Response.json({ records: [{
      id: 'recOwnedFixture',
      fields: {
        booking_ref: reference,
        resolver_payload_json: JSON.stringify({ my_mmd_owner: { owner: 'b'.repeat(64), state: 'submitted' } }),
      },
    }] });
  };
  try { await run({ reads, writes }); } finally { globalThis.fetch = original; }
}

for (const path of paths) {
  for (const field of ['booking_ref', 'request_id']) {
    for (const padding of [' ', '\t\n']) {
      test(`${path} denies owned ${field} with ${JSON.stringify(padding)} padding before any write`, async () => {
        await withOwnedRecord(async ({ reads, writes }) => {
          const request = new Request(`https://sigil.mmdbkk.com${path}`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ [field]: padding + reference + padding, lane: 'public' }),
          });
          const response = await runtime.fetch(request, env);
          assert.equal(response.status, 403);
          assert.equal((await response.json()).error, 'member_owned_request');
          assert.equal(reads.length, 1);
          assert.deepEqual(writes, []);
        });
      });
    }
  }
  test(`${path} rejects browser ownership metadata without a read or write`, async () => {
    await withOwnedRecord(async ({ reads, writes }) => {
      const request = new Request(`https://sigil.mmdbkk.com${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ booking_ref: reference, resolver_payload_json: { my_mmd_owner: { owner: 'c'.repeat(64) } } }),
      });
      const response = await runtime.fetch(request, env);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'browser_authority_rejected');
      assert.deepEqual(reads, []);
      assert.deepEqual(writes, []);
    });
  });
}
