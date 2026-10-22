import assert from 'node:assert/strict';
import test from 'node:test';
import {resolvePerRenameAlias} from './src/per-rename-client-search.js';
import {handleCreateSessionClientLineageRequest} from './src/create-session-client-lineage-runtime.js';

// Entirely synthetic fixtures. No production names, identities, credentials or records.
const clientId = 'recSyntheticClient01';
const lineId = 'U' + '1'.repeat(32);
const name = 'ทดสอบ ป้ายจำลอง';
const client = {id: clientId, fields: {'Client Name': name, line_user_id: lineId}};
const index = {id: 'recSyntheticIndex01', fields: {
  identity_key: 'line_ofc_per_rename:' + lineId,
  source_type: 'line_ofc_staging',
  preferred_name: name,
  line_user_id: lineId,
  line_display_name: 'Synthetic display',
  linked_client: [clientId],
  resolution_status: 'linked',
  session_lookup_status: 'canonical_ready',
}};
const env = {
  AIRTABLE_API_KEY: 'synthetic-test-only', AIRTABLE_BASE_ID: 'synthetic-base',
  AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID: 'synthetic_index',
  AIRTABLE_TABLE_CLIENTS_ID: 'synthetic_clients', AIRTABLE_TABLE_MEMBERS_ID: 'synthetic_members',
  AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID: 'synthetic_entitlements',
  AIRTABLE_TABLE_LINE_OFC_CLIENT_IMPORT_STAGING_ID: 'synthetic_staging',
  INTERNAL_TOKEN: 'synthetic-token-only',
};
function mockStorage({indexes = [index], clients = [client], staging = []} = {}) {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const u = new URL(String(input));
    assert.equal(u.hostname, 'api.airtable.com');
    assert.equal(init.method || 'GET', 'GET');
    calls.push(u);
    const path = u.pathname.split('/');
    const table = path[3];
    let body;
    if (table === 'synthetic_index') body = {records: indexes};
    else if (table === 'synthetic_clients' && path[4]) body = clients.find(c => c.id === path[4]);
    else if (table === 'synthetic_clients') body = {records: clients};
    else if (table === 'synthetic_staging') body = {records: staging};
    else body = {records: []};
    return new Response(JSON.stringify(body || {error: 'synthetic_not_found'}), {status: body ? 200 : 404});
  };
  return {calls, restore: () => {globalThis.fetch = previous;}};
}
function request(query) {
  return new Request('https://fixture.invalid/v1/admin/clients/lineage-lookup', {
    method: 'POST', headers: {Authorization: 'Bearer synthetic-token-only', 'Content-Type': 'application/json'},
    body: JSON.stringify({query, canonical_only: true, allow_manual_fallback: false}),
  });
}
for (const query of ['คุณ ' + name, 'ทดสอบป้ายจำลอง', 'ทดสอบ ป้าย จำลอง']) {
  test(`canonical Per Rename discovery handles synthetic variant: ${query}`, async () => {
    const mock = mockStorage();
    try {
      const result = await resolvePerRenameAlias(env, query);
      assert.equal(result.state, 'resolved');
      assert.equal(result.record.client_id, clientId);
      assert.equal(result.record.current_line_rename, name);
      assert.equal(result.record.membership_status, '');
      assert.equal(result.record.tier, '');
    } finally {mock.restore();}
  });
  test(`strict lineage discovery handles synthetic variant: ${query}`, async () => {
    const mock = mockStorage();
    try {
      const response = await handleCreateSessionClientLineageRequest(request(query), env);
      const result = await response.json();
      assert.equal(response.status, 200);
      assert.equal(result.records.length, 1);
      assert.equal(result.records[0].client_id, clientId);
      assert.equal(result.manual_fallback, false);
      assert.equal(result.canonical_only, true);
      assert.deepEqual(result.results, result.records);
      assert.equal(result.no_canonical_match, false);
      assert.equal(mock.calls.length, 2);
      assert.ok(mock.calls[0].pathname.endsWith('/synthetic_index'));
      assert.ok(mock.calls[1].pathname.endsWith('/synthetic_clients/' + clientId));
    } finally {mock.restore();}
  });
  test(`strict lineage fallback retains Thai staging formula when Per Rename is absent: ${query}`, async () => {
    const mock = mockStorage({indexes: []});
    try {
      const response = await handleCreateSessionClientLineageRequest(request(query), env);
      const result = await response.json();
      assert.equal(result.records[0].client_id, clientId);
      assert.equal(result.no_canonical_match, false);
      assert.ok(mock.calls[0].pathname.endsWith('/synthetic_index'));
      const staging = mock.calls.find(u => u.pathname.endsWith('/synthetic_staging'));
      assert.ok(staging.searchParams.get('filterByFormula').includes('SUBSTITUTE('));
    } finally {mock.restore();}
  });
}
test('Thai tone-mark variants find the same authoritative Per Rename client', async () => {
  const savedName = 'ตัว 18 กย 69';
  const toneIndex = {...index, fields: {...index.fields, preferred_name: savedName}};
  const toneClient = {...client, fields: {'Client Name': savedName, line_user_id: lineId}};
  const mock = mockStorage({indexes: [toneIndex], clients: [toneClient]});
  try {
    const result = await resolvePerRenameAlias(env, 'ตั๋ว');
    assert.equal(result.state, 'resolved');
    assert.equal(result.record.client_id, clientId);
    assert.equal(result.record.current_line_rename, savedName);
  } finally {mock.restore();}
});

test('Thai tone-mark variant finds a canonical client through reviewed LINE staging', async () => {
  const savedName = 'ตัว 18 กย 69';
  const toneClient = {...client, fields: {'Client Name': savedName, line_user_id: lineId}};
  const reviewedStaging = [{id: 'recSyntheticStaging01', fields: {
    line_renamed_name: savedName,
    line_display_name: 'Synthetic LINE display',
    line_user_id: lineId,
    matched_client_id: clientId,
    review_status: 'reviewed',
  }}];
  const mock = mockStorage({indexes: [], clients: [toneClient], staging: reviewedStaging});
  try {
    const response = await handleCreateSessionClientLineageRequest(request('ตั๋ว'), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.records.length, 1);
    assert.equal(body.records[0].client_id, clientId);
    assert.equal(body.records[0].matched_on, 'per_manual_rename');
    assert.equal(body.manual_fallback, false);
    const formula = mock.calls.find(u => u.pathname.endsWith('/synthetic_staging'))?.searchParams.get('filterByFormula') || '';
    assert.ok(formula.includes('SUBSTITUTE('));
    assert.ok(formula.includes('ตัว'));
  } finally {mock.restore();}
});

test('synthetic typo and unlinked rows cannot manufacture canonical identity', async () => {
  for (const [indexes, query] of [
    [[index], 'ต่างชื่อ ป้ายจำลอง'],
    [[{...index, fields: {...index.fields, linked_client: []}}], 'คุณ ' + name],
  ]) {
    const mock = mockStorage({indexes});
    try {assert.equal((await resolvePerRenameAlias(env, query)).state, 'none');}
    finally {mock.restore();}
  }
});
test('synthetic expected LINE identity mismatch remains blocked', async () => {
  const mock = mockStorage();
  try {
    const result = await resolvePerRenameAlias(env, 'คุณ ' + name, {line_user_id: 'U' + '3'.repeat(32)});
    assert.equal(result.state, 'ambiguous');
    assert.equal(result.reason, 'per_rename_line_identity_mismatch');
  } finally {mock.restore();}
});
test('spacing-equivalent synthetic names with distinct canonical IDs remain ambiguous', async () => {
  const other = {...index, id: 'recSyntheticIndex02', fields: {...index.fields,
    preferred_name: 'ทดสอบป้ายจำลอง', linked_client: ['recSyntheticClient02'], line_user_id: 'U' + '2'.repeat(32)}};
  const mock = mockStorage({indexes: [index, other]});
  try {
    const result = await resolvePerRenameAlias(env, 'คุณ ' + name);
    assert.equal(result.state, 'ambiguous');
    assert.equal(result.reason, 'exact_per_rename_collision');
  } finally {mock.restore();}
});
test('absent authorization stays unauthorized and does not query storage', async () => {
  const mock = mockStorage();
  try {
    const response = await handleCreateSessionClientLineageRequest(new Request('https://fixture.invalid/v1/admin/clients/lineage-lookup', {method: 'POST', body: '{}'}), env);
    assert.equal(response.status, 401);
    assert.equal(mock.calls.length, 0);
  } finally {mock.restore();}
});

test('synthetic initial-only names cannot match letters inside a longer search query', async () => {
  const initials = ['c', 'A', 'C', 'A', 'A'];
  const clients = initials.map((initial, i) => ({
    id: `recSyntheticInitial${i}`, fields: {'Client Name': initial},
  }));
  const mock = mockStorage({clients});
  try {
    const response = await handleCreateSessionClientLineageRequest(request('ทดสอบ Blackcard'), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.records, []);
    assert.equal(body.manual_fallback, false);
  } finally {mock.restore();}
});
test('an explicit synthetic short-name query still finds its canonical record', async () => {
  const mock = mockStorage({clients: [{id: clientId, fields: {'Client Name': 'A'}}]});
  try {
    const response = await handleCreateSessionClientLineageRequest(request('A'), env);
    const body = await response.json();
    assert.equal(body.records.length, 1);
    assert.equal(body.records[0].client_id, clientId);
    assert.equal(body.records[0].client_name, 'A');
  } finally {mock.restore();}
});

