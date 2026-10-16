import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyMemberCompleteness } from './member-completeness.mjs';

const member = (id, overrides = {}) => ({ id, fields: {
  member_id: `m-${id}`, line_id: `line-${id}`, 'Full Name': `Private Name ${id}`,
  'Membership Status': { id: 'sel-active', name: 'Active' }, 'Membership Expiry': '2030-01-01',
  Clients: [`client-${id}`], 'Points Balance': 0, ...overrides,
} });
const client = (id, lineId) => ({ id, fields: { line_user_id: lineId } });

test('classifies structural gaps and identity conflicts with safe reason codes', () => {
  const result = classifyMemberCompleteness({
    members: [
      member('a', { member_id: 'duplicate', line_id: 'shared', 'Points Balance': 0 }),
      member('b', { member_id: 'duplicate', line_id: 'shared', Clients: ['client-b'] }),
      member('c', { line_id: 'line-c' }),
    ],
    clients: [client('client-a', 'different-line'), client('client-b', 'line-b'), client('client-c', 'line-c')],
    entitlements: [ { id: 'ent-a', fields: { member_id: 'duplicate' } }, { id: 'ent-b', fields: { member: ['c'] } } ],
    ledger: [],
  });
  assert.deepEqual(result.counts, { total: 3, structurally_complete: 1, missing_data: 0, identity_review: 2 });
  assert.deepEqual(result.rows[0].reasons, ['duplicate_member_id', 'duplicate_line_id', 'member_client_line_conflict']);
  assert.deepEqual(result.rows[1].reasons, ['duplicate_member_id', 'duplicate_line_id', 'member_client_line_conflict']);
  assert.equal(result.rows[2].category, 'structurally_complete');
  assert.equal(JSON.stringify(result).includes('Private Name'), false);
  assert.equal(JSON.stringify(result).includes('different-line'), false);
  assert.equal(result.scope, 'structural_only_not_validated_historical_truth');
});

test('reports identity blockers, missing fields, nonzero point snapshots, and aggregate client/ledger gaps', () => {
  const result = classifyMemberCompleteness({
    members: [member('gap', {
      member_id: '', line_id: '', 'Full Name': '', 'Membership Status': null,
      'Membership Expiry': null, Clients: [], 'Points Balance': 9,
    })],
    clients: [client('orphan', ''), client('orphan2', 'same'), client('orphan3', 'same')],
    entitlements: [], ledger: [{ id: 'ledger-no-id', fields: { member_id: null } }],
  });
  assert.equal(result.rows[0].category, 'identity_review');
  assert.deepEqual(result.rows[0].reasons, [
    'missing_member_id', 'missing_line_id', 'missing_client_link', 'missing_full_name',
    'missing_membership_status', 'missing_membership_expiry', 'missing_entitlement',
    'points_snapshot_without_member_ledger',
  ]);
  assert.deepEqual(result.clients, { missing_line: 1, duplicate_line_groups: 1, no_member_link: 3 });
  assert.deepEqual(result.ledger, { missing_member_id: 1 });
});

test('unresolved canonical client structure is identity review; ordinary profile gaps remain missing data', () => {
  const result = classifyMemberCompleteness({
    members: [
      member('multi', { Clients: ['client-x', 'missing-client'], 'Membership Status': null }),
      member('missing-record', { Clients: ['not-in-client-table'] }),
      member('duplicate-client-line', { line_id: 'shared-client-line', Clients: ['client-y'] }),
      member('profile-gap', { 'Membership Expiry': null }),
    ],
    clients: [client('client-x', 'line-multi'), client('client-y', 'shared-client-line'), client('client-z', 'shared-client-line'), client('client-profile-gap', 'line-profile-gap')],
    entitlements: [
      { id: 'e1', fields: { member_id: 'm-multi' } },
      { id: 'e2', fields: { member_id: 'm-missing-record' } },
      { id: 'e3', fields: { member_id: 'm-duplicate-client-line' } },
      { id: 'e4', fields: { member_id: 'm-profile-gap' } },
    ], ledger: [],
  });
  assert.equal(result.rows[0].category, 'identity_review');
  assert.ok(result.rows[0].reasons.includes('multiple_clients_links'));
  assert.ok(result.rows[0].reasons.includes('missing_linked_client_record'));
  assert.ok(result.rows[1].reasons.includes('missing_linked_client_record'));
  assert.ok(result.rows[2].reasons.includes('duplicate_client_line_user_id'));
  assert.equal(result.rows[3].category, 'missing_data');
  assert.deepEqual(result.rows[3].reasons, ['missing_membership_expiry']);
});

test('null and zero snapshots are not treated as nonzero; names never establish identity', () => {
  const result = classifyMemberCompleteness({
    members: [
      member('null', { 'Full Name': 'Same Name', 'Points Balance': null }),
      member('zero', { 'Full Name': 'Same Name', 'Points Balance': 0 }),
      member('different', { 'Full Name': 'Same Name', 'Points Balance': 4 }),
    ],
    clients: [client('client-null', 'line-null'), client('client-zero', 'line-zero'), client('client-different', 'line-different')],
    entitlements: [
      { id: 'e-null', fields: { member: ['null'] } },
      { id: 'e-zero', fields: { member_id: 'm-zero' } },
      { id: 'e-different', fields: { member_id: 'some-other-id' } },
    ],
    ledger: [],
  });
  assert.deepEqual(result.rows[0].reasons, []);
  assert.deepEqual(result.rows[1].reasons, []);
  assert.deepEqual(result.rows[2].reasons, ['missing_entitlement', 'points_snapshot_without_member_ledger']);
});
