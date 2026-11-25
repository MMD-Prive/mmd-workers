import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createFixtureDatabase, openFixtureStaging } from './staging.mjs';

async function fixture(t, options = { enabled: true }) {
  const directory = mkdtempSync(join(tmpdir(), 'partner-replacement-stage-'));
  const path = join(directory, 'fixture.sqlite');
  const ids = createFixtureDatabase(path);
  const handles = new Set();
  function open(config = options) {
    const store = openFixtureStaging(path, config);
    handles.add(store);
    return store;
  }
  async function close(store) {
    await store.close();
    handles.delete(store);
  }
  t.after(async () => {
    for (const store of handles) await close(store);
    rmSync(directory, { recursive: true });
  });
  return { ...ids, path, store: open(), open, close };
}

function input(row, action, operationId, extra = {}) {
  const { session_id, generation, revision } = row;
  return { session_id, generation, revision, action, operation_id: operationId, ...extra };
}

const rowFromDisk = (path, sid) => {
  const db = new DatabaseSync(path, { readOnly: true });
  try { return JSON.parse(db.prepare('SELECT payload FROM sessions WHERE id = ?').get(sid).payload); }
  finally { db.close(); }
};

test('default gate denies actions and review without changing storage', async t => {
  const { store, sessionId, modelB, path } = await fixture(t, {});
  const before = readFileSync(path);
  assert.equal((await store.act('owner', null)).code, 'runtime_gate_closed');
  assert.equal((await store.approveFixtureReview('owner', sessionId, modelB)).code, 'runtime_gate_closed');
  assert.deepEqual(readFileSync(path), before);
});

test('reject non-staging files before opening read-write and do not overwrite an existing fixture', async t => {
  const { path } = await fixture(t);
  const other = join(path, '..', 'other.sqlite');
  const db = new DatabaseSync(other);
  db.exec('CREATE TABLE example (id INTEGER)');
  db.close();
  const before = readFileSync(other);
  assert.throws(() => openFixtureStaging(other, { enabled: true }), /staging fixture database/);
  assert.deepEqual(readFileSync(other), before);
  const seeded = readFileSync(path);
  assert.throws(() => createFixtureDatabase(path), { code: 'EEXIST' });
  assert.deepEqual(readFileSync(path), seeded);
});

test('replacement, scoped readback, new customer acknowledgment and replay survive restart', async t => {
  const { store, path, open, close, sessionId, modelA, modelB, oldLink } = await fixture(t);
  const initial = await store.view('owner', sessionId);
  const diskBefore = rowFromDisk(path, sessionId);
  const replace = input(initial, 'replace', 'replace_fixture_a_to_b', { next_model: modelB });
  assert.equal((await store.act('owner', input(initial, 'issue_customer_link', 'premature_issue'))).code, 'replacement_readback_required');
  assert.equal((await store.act('owner', replace)).code, 'partner_settlement_review_required');
  assert.equal((await store.approveFixtureReview('otherOwner', sessionId, modelB)).code, 'ownership_required');
  assert.equal((await store.act('otherOwner', replace)).code, 'ownership_required');
  assert.equal((await store.act('partner', replace)).code, 'ownership_required');
  assert.equal((await store.view('modelB', sessionId)).code, 'ownership_required');
  assert.equal((await store.approveFixtureReview('owner', sessionId, modelB)).ok, true);

  const changed = await store.act('owner', replace);
  assert.equal(changed.ok, true, JSON.stringify(changed));
  assert.equal(changed.notification_sent, false);
  assert.equal(changed.session.session_id, sessionId);
  assert.equal(changed.session.generation, initial.generation + 1);
  assert.notEqual(changed.session.revision, initial.revision);
  const diskAfter = rowFromDisk(path, sessionId);
  assert.equal(diskAfter.model, modelB);
  assert.deepEqual(diskAfter.schedule, diskBefore.schedule);
  assert.deepEqual(diskAfter.financial, diskBefore.financial);
  assert.equal(diskAfter.model_credentials, diskBefore.model_credentials);
  assert.equal(diskAfter.model_ack, false);
  assert.equal(diskAfter.customer_ack, false);
  assert.equal(diskAfter.reconfirm_ack, false);
  assert.equal(diskAfter.ready, false);
  await close(store);

  const restarted = open();
  const current = await restarted.view('modelB', sessionId);
  assert.equal(current.model, modelB);
  assert.equal(current.job_update.state, 'awaiting_customer');
  assert.deepEqual(current.allowed_actions, []);
  assert.equal((await restarted.view('modelA', sessionId)).code, 'ownership_required');
  assert.equal((await restarted.view('otherCustomer', sessionId)).code, 'ownership_required');
  assert.equal((await restarted.act('owner', replace)).replay, true);
  const old = input(current, 'acknowledge', 'ack_old', { link_id: oldLink });
  assert.equal((await restarted.act('customer', old)).code, 'confirmation_link_superseded');

  const issue = input(current, 'issue_customer_link', 'issue_fixture_link');
  const issued = await restarted.act('owner', issue);
  assert.equal(issued.ok, true, JSON.stringify(issued));
  assert.equal(issued.notification_sent, false);
  assert.notEqual(issued.link_id, oldLink);
  await close(restarted);

  const afterLink = open();
  assert.equal((await afterLink.act('owner', issue)).link_id, issued.link_id);
  const ack = input(current, 'acknowledge', 'ack_current', { link_id: issued.link_id });
  assert.equal((await afterLink.act('otherCustomer', ack)).code, 'ownership_required');
  assert.equal((await afterLink.act('customer', ack)).ok, true);
  const customerView = await afterLink.view('customer', sessionId);
  assert.equal(customerView.job_update.state, 'awaiting_model');
  assert.equal(customerView.customer_ack, true);
  assert.equal(customerView.session_id, sessionId);
  assert.deepEqual(customerView.schedule, initial.schedule);
  assert.equal(initial.model, modelA);
});

test('competing handles cannot replace the same revision twice', async t => {
  const { store, open, path, sessionId, modelB } = await fixture(t);
  const initial = await store.view('owner', sessionId);
  await store.approveFixtureReview('owner', sessionId, modelB);
  const competitor = open();
  const result = await Promise.all([
    store.act('owner', input(initial, 'replace', 'replace_once', { next_model: modelB })),
    competitor.act('owner', input(initial, 'replace', 'replace_competing', { next_model: modelB })),
  ]);
  assert.equal(result.filter(x => x.ok).length, 1);
  assert.ok(['replacement_unavailable', 'offer_changed', 'model_unchanged'].includes(result.find(x => !x.ok)?.code), JSON.stringify(result));
  const row = rowFromDisk(path, sessionId);
  assert.equal(row.generation, initial.generation + 1);
  assert.equal(row.model, modelB);
});

test('unknown result retains its durable fence across restart and blocks retry', async t => {
  const { store, path, open, close, sessionId, modelB } = await fixture(t);
  const initial = await store.view('owner', sessionId);
  await store.approveFixtureReview('owner', sessionId, modelB);
  const db = new DatabaseSync(path);
  db.exec("CREATE TRIGGER fault BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'fixture receipt failure'); END");
  db.close();

  const replace = input(initial, 'replace', 'replace_unknown', { next_model: modelB });
  assert.equal((await store.act('owner', replace)).code, 'outcome_unknown');
  await close(store);
  const restarted = open();
  assert.equal((await restarted.act('owner', replace)).code, 'pending_reconciliation');
  assert.equal((await restarted.view('modelB', sessionId)).code, 'pending_reconciliation');
  const row = rowFromDisk(path, sessionId);
  assert.ok(row.pending);
  assert.equal(row.generation, initial.generation + 1);
});
