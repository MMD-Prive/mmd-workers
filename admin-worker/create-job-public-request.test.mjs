import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { signMarker } from '../shared/member-booking-marker.mjs';
import { PUBLIC_REQUEST_PATH, readCreateJobPublicRequest } from './src/create-job-public-request.js';

test('Create Job skips malformed rows and checks the selected client against the signed White request', async (t) => {
  const client = 'recOwner0000000001';
  const otherClient = 'recOther0000000001';
  const member = 'qa-white-member';
  const ref = 'mmdreq_' + 'a'.repeat(64);
  const secret = 'local-test-secret-'.repeat(2);
  const marker = {
    schema: 'member_booking_owner_v2',
    owner: createHash('sha256').update('my-mmd-booking-owner-v1:' + client + ':' + member).digest('hex'),
    scope: 'public',
    fingerprint: 'b'.repeat(64),
    state: 'submitted',
    client_id: client,
    publicDetails: { public_format: 'dining', duration_minutes: 90, budget_thb: 10000 },
  };
  marker.signature = await signMarker(secret, ref, marker);
  const signedRow = { fields: {
    booking_ref: ref,
    lane: 'public',
    line_or_member_id: member,
    'Selected Model Name': 'White',
    resolver_payload_json: JSON.stringify({ my_mmd_owner: marker }),
  } };
  const malformedRow = { fields: { ...signedRow.fields, resolver_payload_json: '{' } };
  t.mock.method(globalThis, 'fetch', async (url) => {
    const formula = url.searchParams.get('filterByFormula');
    return Response.json({ records: formula.startsWith('AND(') ? [malformedRow, signedRow] : [signedRow] });
  });
  const env = {
    AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES: secret,
    AIRTABLE_BASE_ID: 'qa-fixture',
    AIRTABLE_API_KEY: 'qa-fixture',
  };
  const read = (clientId, exact = false) => {
    const url = new URL(PUBLIC_REQUEST_PATH, 'https://admin.test');
    url.searchParams.set('client_id', clientId);
    if (exact) url.searchParams.set('ref', ref);
    return readCreateJobPublicRequest(new Request(url), env, { role: 'owner' });
  };
  const expected = {
    ref, work_type: 'dining', duration_minutes: 90, budget_thb: 10000, model_name: 'White',
  };
  const list = await read(client);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).items, [expected]);
  const exact = await read(client, true);
  assert.equal(exact.status, 200);
  assert.deepEqual(await exact.json(), { ok: true, ...expected });
  assert.equal((await read(otherClient, true)).status, 404);
});
