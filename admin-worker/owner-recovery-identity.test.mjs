import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOwnerRecoveryIdentity as run } from './src/owner-recovery-identity.js';
const missing = { status: 'unresolved', reason: 'per_rename_not_resolved' };
const input = { client_query: 'Old Name' };
const candidate = { client_id: 'recABCDEF123456', client_name: 'Current Name', matched_on: 'historical_name', matched_value: 'Old Name', line_user_id: 'PRIVATE' };
const resolve = async () => missing;

test('historical match requires explicit choice and strips raw identity', async () => {
  const result = await run({}, input, { resolve, lookup: async (request, env, options) => {
    assert.equal(options.alreadyAuthorized, true);
    assert.deepEqual(await request.json(), { query: 'Old Name', canonical_only: true, allow_manual_fallback: false });
    return Response.json({ ok: true, records: [candidate, candidate, { client_id: 'manual', client_name: 'Unlinked' }] });
  }});
  assert.equal(result.reason, 'recovery_client_selection_required');
  assert.equal(result.status, 'unresolved');
  assert.deepEqual(result.choices, [{ client_id: candidate.client_id, display_name: 'Current Name', matched_on: 'historical_name', matched_value: 'Old Name' }]);
});
for (const identity of [
  { status: 'resolved', client: { canonical_client_id: candidate.client_id } },
  { status: 'unresolved', reason: 'exact_per_rename_collision' },
  { status: 'unresolved', reason: 'per_rename_line_identity_mismatch' },
]) test('does not override '+(identity.reason || identity.status), async () => {
  assert.deepEqual(await run({}, input, { resolve: async () => identity, lookup: () => assert.fail('must not broaden a known identity/conflict') }), identity);
});
test('explicit client lookup never falls back to names', async () => {
  assert.deepEqual(await run({}, { canonical_client_id: candidate.client_id }, { resolve, lookup: () => assert.fail('unexpected search') }), missing);
});
test('upstream exceptions are unavailable, never not found or leaked', async () => {
  const result = await run({}, input, { resolve: async () => { throw Error('secret Airtable URL'); }, lookup: () => assert.fail('unexpected fallback') });
  assert.deepEqual(result, { status: 'unavailable', reason: 'identity_resolution_unavailable' });
});
for (const [label, response, reason] of [
  ['empty', () => Response.json({ ok: true, records: [] }), 'per_rename_not_resolved'],
  ['partial with match', () => Response.json({ ok: true, records: [candidate], degraded_sources: ['scan_limit'] }), 'identity_search_incomplete'],
  ['partial empty', () => Response.json({ ok: true, records: [], lineage_warnings: ['upstream'] }), 'identity_search_incomplete'],
  ['503', () => Response.json({ ok: false }, { status: 503 }), 'identity_search_unavailable'],
  ['invalid JSON', () => new Response('invalid'), 'identity_search_unavailable'],
  ['network', () => { throw Error('offline'); }, 'identity_search_unavailable'],
]) test('search '+label, async () => {
  const result = await run({}, input, { resolve, lookup: async () => response() });
  assert.equal(result.reason, reason);
});
