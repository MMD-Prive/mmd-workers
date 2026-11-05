import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfferFixture, deferred} from './model-response-integration.fixture.mjs';
import {createModelResponseRuntime} from './model-response-runtime.mjs';
import {offerFenceContract, offerWriterContract} from './model-response-contract.mjs';

test('closed seam preserves legacy request/env/context without constructing a new provider', async () => {
  const request = new Request('https://local.invalid/action', {method: 'POST', body: 'unchanged'});
  const env = {}, ctx = {}; let calls = 0;
  for (const enabled of [undefined, false, 'true', 1]) {
    const runtime = createModelResponseRuntime({enabled,
      legacy: (r, e, c) => {assert.equal(r, request); assert.equal(e, env); assert.equal(c, ctx); calls++; return 'legacy';},
      createHandler: () => {throw Error('closed gate must not construct storage/fence/writer');},
    });
    assert.equal(await runtime(request, env, ctx), 'legacy');
  }
  assert.equal(calls, 4);
});

test('fixture activation is explicit and provider is constructed once', async () => {
  let providers = 0, calls = 0;
  const runtime = createModelResponseRuntime({enabled: true, legacy: () => assert.fail('no fallback'),
    createHandler: () => {providers++; return () => ++calls;},
  });
  assert.equal(providers, 0); assert.equal(await runtime(), 1); assert.equal(await runtime(), 2); assert.equal(providers, 1);
  assert.throws(() => createModelResponseRuntime({enabled: true, legacy() {}}), /provider required/);
});

for (const action of ['accept_job', 'decline_job']) test(`LOCAL_FIXTURE: current writer ${action}, cross-instance duplicate and restart replay`, async () => {
  const f = createOfferFixture();
  const input = {...f.input(), action, ...(action === 'decline_job' ? {reason: 'Fixture only', availability_options: ['2099-11-05T12:00']} : {})};
  const results = await Promise.all([f.instance().respond(input), f.instance().respond({...input, operation_id: 'operation_other_tab'})]);
  const saved = results.find(r => r.ok);
  assert.ok(saved); assert.equal(f.writes(), 1); assert.equal(f.snapshot().pending, null);
  assert.deepEqual(await f.instance().respond(input), saved);
  assert.deepEqual(saved.session.allowed_actions, action === 'accept_job' ? ['start_travel'] : []);
  assert.equal(saved.session.session_id, input.session_id);
  assert.equal(f.notificationCalls(), 0);
  if (action === 'decline_job') assert.deepEqual(JSON.parse([...f.records.values()][0].body).proposal.options, input.availability_options);
});

test('LOCAL_FIXTURE: opposite responses across instances cannot both apply', async () => {
  const f = createOfferFixture();
  const results = await Promise.all([f.instance().respond(f.input()), f.instance().respond({...f.input(), action: 'decline_job'})]);
  assert.equal(f.writes(), 1); assert.equal(results.filter(r => r.ok).length, 1);
});

test('LOCAL_FIXTURE: participating edit cannot advance generation while the current writer holds the Session fence', async () => {
  const f = createOfferFixture(), entered = deferred(), release = deferred();
  const originalGeneration = f.snapshot().generation;
  f.faults.beforeWrite = async () => {entered.resolve(); await release.promise;};
  const response = f.instance().respond(f.input());
  await entered.promise;
  const edit = f.mutate('reassign', {model: 'model_B', binding: 'binding_B'});
  // Yield to both handlers, without wall-clock sleeps or timeout-based assertions.
  await new Promise(setImmediate);
  assert.equal(f.snapshot().generation, originalGeneration); assert.equal(f.writes(), 0);
  release.resolve();
  const [saved, edited] = await Promise.all([response, edit]);
  assert.equal(saved.ok, true); assert.equal(f.writes(), 1);
  // The durable pending marker may conservatively reject the queued edit until
  // receipt persistence finishes; it must never bypass that marker.
  if (!edited.ok) assert.equal(edited.code, 'pending_reconciliation');
  else assert.equal(f.snapshot().generation, originalGeneration + 1);
});

for (const kind of ['reassign', 'amend', 'cancel', 'expire']) test(`LOCAL_FIXTURE: ${kind} between journal claim and fence prevents stale acceptance`, async () => {
  const f = createOfferFixture(), entered = deferred(), release = deferred();
  f.faults.claimBarrier = {entered, release};
  const response = f.instance().respond(f.input());
  await entered.promise;
  await f.mutate(kind, kind === 'reassign' ? {model: 'model_B', binding: 'binding_B'} : {});
  release.resolve(); const result = await response;
  assert.equal(result.ok, false); assert.equal(f.writes(), 0);
  assert.equal(f.snapshot().pending, null, 'known pre-write rejection must not lock the current offer');
  assert.equal((await f.mutate('reopen')).ok, true);
  const currentActor = kind === 'reassign' ? 'model_B' : 'model_A';
  assert.equal((await f.instance(currentActor).respond(f.input())).ok, true);
  assert.equal(f.writes(), 1);
});

test('LOCAL_FIXTURE: binding rejection inside the fence clears only its own pre-write pending marker', async () => {
  const f = createOfferFixture(), entered = deferred(), release = deferred();
  f.faults.claimBarrier = {entered, release};
  const response = f.instance().respond(f.input()); await entered.promise;
  f.external({binding: 'binding_B'}); release.resolve();
  assert.equal((await response).ok, false); assert.equal(f.writes(), 0);
  assert.equal(f.snapshot().pending, null);
  assert.equal((await f.mutate('reopen')).ok, true);
  assert.equal((await f.instance().respond(f.input())).ok, true);
});

test('LOCAL_FIXTURE: A to B to A creates a distinct generation and rejects A original operation', async () => {
  const f = createOfferFixture(), old = f.input();
  await f.mutate('reassign', {model: 'model_B', binding: 'binding_B'});
  await f.mutate('reassign', {model: 'model_A', binding: 'binding_A'});
  assert.notEqual(f.input().offer_revision, old.offer_revision);
  assert.equal((await f.instance().respond(old)).receipt.code, 'offer_revision_changed');
  assert.equal((await f.instance('model_B').respond(f.input())).receipt.code, 'response_not_authorized');
  assert.equal((await f.instance().respond(f.input())).ok, true); assert.equal(f.writes(), 1);
});

for (const kind of ['reassign', 'amend', 'cancel', 'expire', 'acknowledge', 'reissue']) test(`LOCAL_FIXTURE: uncertain current-writer response blocks ${kind} after handler restart`, async () => {
  const f = createOfferFixture(), input = f.input(); f.faults.loseResponse = true;
  assert.equal((await f.instance().respond(input)).receipt.outcome, 'unknown');
  assert.ok(f.snapshot().pending);
  assert.equal((await f.mutate(kind)).code, 'pending_reconciliation');
  assert.equal((await f.instance().respond(input)).receipt.outcome, 'unknown');
  assert.equal(f.writes(), 1);
});

test('LOCAL_FIXTURE: receipt-save failure retains pending and blocks new generation', async () => {
  const f = createOfferFixture(), input = f.input(); f.faults.receiptFailure = true;
  assert.equal((await f.instance().respond(input)).receipt.outcome, 'unknown');
  assert.equal(f.snapshot().state, 'confirmed'); assert.ok(f.snapshot().pending);
  assert.equal((await f.mutate('reopen')).code, 'pending_reconciliation');
  assert.equal((await f.instance().respond(input)).receipt.outcome, 'unknown'); assert.equal(f.writes(), 1);
});

test('LOCAL_FIXTURE: credential-only reissue keeps offer generation, amend changes it', async () => {
  const f = createOfferFixture(), before = f.snapshot();
  await f.mutate('reissue'); assert.equal(f.snapshot().generation, before.generation);
  assert.equal(f.snapshot().credentials, before.credentials + 1);
  await f.mutate('amend', {terms: 'terms_B'}); assert.notEqual(f.snapshot().generation, before.generation);
});

test('LOCAL_FIXTURE: signed-link seed cannot write after cancellation and never creates an offer', async () => {
  const f = createOfferFixture(); f.external({state: ''}); const before = f.snapshot();
  assert.equal((await f.mutate('acknowledge')).ok, true); assert.equal(f.snapshot().state, 'confirmed');
  assert.equal(f.snapshot().generation, before.generation);
  await f.mutate('cancel'); assert.equal((await f.mutate('acknowledge')).code, 'offer_closed');
});

test('LOCAL_FIXTURE: participating acknowledgement and Console acceptance keep one generation', async () => {
  const f = createOfferFixture(), before = f.snapshot();
  const [saved, acknowledged] = await Promise.all([f.instance().respond(f.input()), f.mutate('acknowledge')]);
  assert.equal(saved.ok, true); assert.equal(f.writes(), 1);
  assert.equal(f.snapshot().generation, before.generation); assert.equal(f.snapshot().state, 'confirmed');
  if (!acknowledged.ok) assert.equal(acknowledged.code, 'pending_reconciliation');
});

for (const patch of [{model: 'model_B'}, {terms: 'terms_B'}, {eligible: false}]) test(`LOCAL_FIXTURE known limitation: bypassing writer after recheck (${Object.keys(patch)[0]}) is not fenced`, async () => {
  const f = createOfferFixture();
  f.faults.beforeWrite = () => f.external(patch);
  const result = await f.instance().respond(f.input());
  // Deliberately expose the unsafe interleaving. This passing test proves a
  // limitation, never production readiness or external-writer coverage.
  assert.equal(result.ok, true); assert.equal(f.writes(), 1);
  assert.equal(offerWriterContract.external.generation, 'unverified');
  assert.match(offerFenceContract.externalWriter, /gate remains closed/);
});

test('LOCAL_FIXTURE: unverified writer has no approved mutation path', async () => {
  const f = createOfferFixture(); const before = f.snapshot();
  assert.equal((await f.mutate('external')).code, 'writer_not_verified'); assert.deepEqual(f.snapshot(), before);
});

test('unverified external mutation cannot activate the default runtime seam', async () => {
  const f = createOfferFixture(); f.external({model: 'model_B'});
  let legacyCalls = 0;
  const runtime = createModelResponseRuntime({legacy: () => {legacyCalls++; return 'unchanged legacy';},
    createHandler: () => assert.fail('no new adapter/fence/storage while gate is closed'),
  });
  assert.equal(await runtime(new Request('https://local.invalid/action'), {MODEL_RESPONSE_ENABLED: true}), 'unchanged legacy');
  assert.equal(legacyCalls, 1); assert.equal(f.writes(), 0); assert.equal(f.records.size, 0);
});

test('LOCAL_FIXTURE: notification intent dedup does not mean delivered or permit blind unknown retry', async () => {
  const f = createOfferFixture();
  assert.equal(await f.emitIntent({...f.input(), model_id: 'model_A'}), null); assert.equal(f.outbox.size, 0);
  const saved = await f.instance().respond(f.input()); assert.equal(saved.ok, true);
  const id = await f.emitIntent(saved.event);
  assert.ok(id); assert.equal(await f.emitIntent(saved.event), id); assert.equal(f.outbox.size, 1);
  assert.equal(f.outbox.get(id).outcome, 'pending');
  assert.equal(f.deliverMock(id, 'failed'), true); assert.equal(f.deliverMock(id, 'sent'), true);
  assert.equal(f.deliverMock(id, 'sent'), false);
  const another = createOfferFixture(); const next = await another.instance().respond(another.input());
  const nextId = await another.emitIntent(next.event); another.deliverMock(nextId, 'unknown');
  assert.equal(another.deliverMock(nextId, 'sent'), false); assert.equal(f.notificationCalls(), 0);
  const uncertain = createOfferFixture(); uncertain.faults.loseResponse = true;
  await uncertain.instance().respond(uncertain.input());
  assert.equal(await uncertain.emitIntent({...uncertain.input(), model_id: 'model_A'}), null); assert.equal(uncertain.outbox.size, 0);
});

for (const outcome of ['sent', 'unknown']) test(`LOCAL_FIXTURE: next generation has its own event despite previous ${outcome} and reused operation ID`, async () => {
  const f = createOfferFixture(), firstInput = f.input();
  const first = await f.instance().respond(firstInput);
  const firstEvent = await f.emitIntent(first.event); f.deliverMock(firstEvent, outcome);
  await f.mutate('reopen');
  // Deliberate reuse proves event identity is not operation_id alone.
  const secondInput = {...f.input(), operation_id: firstInput.operation_id};
  const second = await f.instance().respond(secondInput); assert.equal(second.ok, true);
  const secondEvent = await f.emitIntent(second.event);
  assert.ok(secondEvent); assert.notEqual(secondEvent, firstEvent); assert.equal(f.outbox.size, 2);
  assert.equal(f.outbox.get(secondEvent).outcome, 'pending');
  assert.equal(f.outbox.get(firstEvent).outcome, outcome);
  const replay = await f.instance().respond({...secondInput, operation_id: 'operation_another_tab'});
  assert.deepEqual(replay, second); assert.equal(await f.emitIntent(replay.event), secondEvent);
  assert.equal(f.outbox.size, 2); assert.equal(f.writes(), 2); assert.equal(f.notificationCalls(), 0);
});

test('LOCAL_FIXTURE: intent must match the exact committed session, generation, model, action and operation', async () => {
  const f = createOfferFixture(); const saved = await f.instance().respond(f.input());
  for (const patch of [{session_id: 'sess_other'}, {offer_revision: '999'}, {model_id: 'model_B'},
    {action: 'decline_job'}, {operation_id: 'operation_not_committed'}]) {
    assert.equal(await f.emitIntent({...saved.event, ...patch}), null);
  }
  assert.equal(f.outbox.size, 0); assert.ok(await f.emitIntent(saved.event)); assert.equal(f.outbox.size, 1);
});
