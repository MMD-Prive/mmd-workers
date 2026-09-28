import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichDiscoveryNames, recentPaymentJobs } from './src/payment-review-discovery.js';
import { applyCanonicalClientToReviewItem } from './src/payment-proof-client-provenance-wrapper.js';
import { handlePaymentReviewRequest } from './src/payment-review-runtime.js';

const tables = { sessions: 'sessions', clients: 'clients', models: 'models', index: 'index' };
const alias = (client = 'client-a', name = 'ลูกค้าไทย SVIP') => ({ id: 'alias-'+client, fields: { identity_key: 'line_ofc_per_rename:u-test', source_type: 'line_ofc_staging', preferred_name: name, line_display_name: 'Original LINE', line_user_id: 'u-test', linked_client: [client], resolution_status: 'linked', session_lookup_status: 'canonical_ready' } });
const item = { customer_name: 'Old Name', client_record_id: 'client-a', model_record_id: 'model-a', model_name: 'MODEL01', reviewable: true, context_issues: [] };
const client = { id: 'client-a', fields: { mmd_client_name: 'Original Name', nickname: 'Nickname' } };
const model = { id: 'model-a', fields: { working_name: 'MODEL01', nickname: 'Model Nickname', private_notes: 'do-not-return' } };
function names(rows = [alias()]) { return { tables, list: async table => table === 'clients' ? [client] : [model], page: async () => ({ records: rows }) }; }

test('authoritative Per Rename survives raw canonical name enrichment; both remain searchable', async () => {
  const [result] = await enrichDiscoveryNames([item], names());
  const wrapped = applyCanonicalClientToReviewItem(result, { clientRecordId: 'client-a', clientName: 'Original Name' });
  assert.equal(wrapped.customer_name, 'ลูกค้าไทย SVIP');
  assert.ok(wrapped.customer_aliases.includes('Original Name'));
  assert.ok(wrapped.customer_aliases.includes('Old Name'));
  assert.ok(wrapped.customer_aliases.includes('Original LINE'));
  assert.ok(wrapped.model_aliases.includes('Model Nickname'));
  assert.equal(wrapped.can_approve, true);
  assert.doesNotMatch(JSON.stringify(wrapped), /do-not-return|line_user_id|u-test/);
});

test('unlinked, ambiguous and non-authoritative alias rows never rename a customer', async () => {
  for (const fields of [{ linked_client: ['client-a', 'client-b'] }, { linked_client: ['client-b'] }, { source_type: 'import' }, { resolution_status: 'unresolved' }, { session_lookup_status: 'needs_review' }]) {
    const row = alias(); Object.assign(row.fields, fields);
    const [result] = await enrichDiscoveryNames([item], names([row]));
    assert.equal(result.customer_name, 'Old Name');
    assert.ok(!result.customer_aliases.includes('ลูกค้าไทย SVIP'));
  }
  const [conflict] = await enrichDiscoveryNames([item], names([alias(), alias('client-a', 'Conflicting name')]));
  assert.equal(conflict.customer_name, 'Old Name');
  const mismatch = applyCanonicalClientToReviewItem(item, { clientRecordId: 'client-b', clientName: 'Other customer' });
  assert.equal(mismatch.can_approve, false);
  assert.equal(mismatch.customer_name, 'Old Name');
});

test('Per Rename follows pagination and reports unavailable names instead of silently claiming complete search', async () => {
  const options = names(); let calls = 0;
  options.page = async (_table, params) => { calls++; return params.offset ? { records: [alias()] } : { records: [], offset: 'next' }; };
  const [result] = await enrichDiscoveryNames([item], options);
  assert.equal(result.customer_name, 'ลูกค้าไทย SVIP'); assert.equal(calls, 2);
  options.page = async () => { throw Error('unavailable'); };
  const [partial] = await enrichDiscoveryNames([item], options);
  assert.equal(partial.search_names_status, 'partial');
  assert.equal(partial.customer_name, 'Old Name');
});

const session = (id, clientId = 'client-a') => ({ id, fields: { session_id: 'sess-'+id, Client: [clientId], 'Canonical Model': ['model-a'], client_name: 'Old Name', model_name: 'MODEL01', job_date: '2026-10-04', created_at: '2026-09-21', customer_confirmation_url: 'private-token', pay_model_thb: 22500 } });
const payment = (id, sid, status = 'Pending') => ({ id, fields: { 'Payment Reference': 'pay-'+id, session_id: 'sess-'+sid, Client: ['client-a'], Amount: 30000, 'Payment Status': status, payment_stage: 'full' } });
const proof = (id, payId, sid) => ({ id, fields: { proof_id: id, payment_ref: 'pay-'+payId, status: 'pending', payment: [payId], session: [sid], client: ['client-a'] } });
async function jobs(sessions, payments, proofs = []) {
  const options = names();
  return recentPaymentJobs({ ...options, paymentsTable: 'payments', proofsTable: 'proofs', list: async (table, params) => {
    if (table === 'sessions') { assert.equal(params.sort[0].field, 'created_at'); return sessions; }
    if (table === 'payments') return payments;
    if (table === 'proofs') return proofs;
    return options.list(table, params);
  } });
}

test('recent jobs include missing slips and keep multiple jobs/payments separate', async () => {
  const result = await jobs([session('job-a'), session('job-b'), session('job-c')], [payment('p-a', 'job-a'), payment('p-b', 'job-b'), payment('p-deposit', 'job-b', 'Paid')], [proof('proof-b', 'p-b', 'job-b')]);
  assert.equal(result.length, 3);
  assert.equal(result[0].payments[0].state, 'waiting_proof');
  assert.equal(result[1].payments[0].state, 'proof_pending');
  assert.deepEqual(result[1].payments[0].proof_ids, ['proof-b']);
  assert.equal(result[1].payments[1].state, 'paid');
  assert.deepEqual(result[2].payments, []);
  assert.doesNotMatch(JSON.stringify(result), /private-token|22500|confirmation_url|pay_model_thb/);
});

test('mismatched proof/client, duplicate payment ref, cancelled and unknown states cannot expose an approval shortcut', async () => {
  const base = payment('p-a', 'job-a');
  for (const [payments, proofs, expected] of [
    [[base], [proof('bad', 'p-a', 'different-job')], 'needs_review'],
    [[{ ...base, fields: { ...base.fields, Client: ['client-b'] } }], [], 'needs_review'],
    [[base, { ...base, id: 'duplicate' }], [], 'needs_review'],
    [[payment('p-a', 'job-a', 'Cancelled')], [proof('test', 'p-a', 'job-a')], 'cancelled'],
    [[payment('p-a', 'job-a', 'Unexpected')], [], 'needs_review'],
    [[payment('p-a', 'job-a', 'Paid')], [proof('test', 'p-a', 'job-a')], 'paid'],
  ]) {
    const [result] = await jobs([session('job-a')], payments, proofs);
    assert.equal(result.payments[0].state, expected);
    assert.deepEqual(result.payments[0].proof_ids, []);
  }
});

test('recent job discovery and targeted proof lookup use existing auth and GET-only Airtable reads', async () => {
  const calls = [], actor = { id: 'owner-test', role: 'owner' };
  const env = { AIRTABLE_BASE_ID: 'app-test', AIRTABLE_API_KEY: 'test', AIRTABLE_HTTP: { fetch: async req => {
    calls.push(req); assert.equal(req.method, 'GET');
    const url = new URL(req.url);
    if (url.pathname.endsWith('tblC98mKWbzmPuNzX')) return Response.json({ records: [session('job-a')] });
    if (url.pathname.endsWith('tblfJfM4Sqag9zrLi')) return Response.json({ records: [proof('target-proof', 'p-a', 'job-a'), proof('other-proof', 'p-a', 'job-a')] });
    return Response.json({ records: [] });
  } } };
  const url = 'https://www.mmdbkk.com/v1/admin/payments/review-queue';
  assert.equal((await handlePaymentReviewRequest(new Request(url+'?view=recent_jobs'), env, null)).status, 401);
  assert.equal(calls.length, 0);
  const recent = await handlePaymentReviewRequest(new Request(url+'?view=recent_jobs'), env, actor);
  assert.equal(recent.status, 200); assert.equal((await recent.json()).jobs.length, 1);
  const exact = await handlePaymentReviewRequest(new Request(url+'?proof_id=target-proof'), env, actor);
  const data = await exact.json();
  assert.deepEqual(data.items.map(row => row.proof_id), ['target-proof']);
  assert.match(new URL(calls.at(-1).url).searchParams.get('filterByFormula'), /AND\(.*\{proof_id\}='target-proof'/);
});
