// LOCAL_FIXTURE ONLY. Shared Maps and queues model a persistent coordinator's
// contract; they are NOT a production durable fence or Airtable transaction.
import vm from 'node:vm';
import {legacyHandlerSource} from './model-response-legacy-writer.fixture.mjs';
import {normalizeModelDecline} from './model-decline-options.mjs';
import {createModelResponseAdapter} from './model-response-adapter.mjs';
import {createModelResponseRuntime} from './model-response-runtime.mjs';
import {offerWriterContract} from './model-response-contract.mjs';

export const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
const copy = value => structuredClone(value);
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join('');
export function createOfferFixture() {
  const records = new Map(), outbox = new Map();
  const durable = {generation: 1, model: 'model_A', binding: 'binding_A', terms: 'terms_A',
    state: 'offered', eligible: true, pending: null, credentials: 1};
  let tail = Promise.resolve(), etag = 0, writes = 0, writeAttempts = 0, notificationCalls = 0;
  const faults = {loseResponse: false, receiptFailure: false, claimBarrier: null, beforeWrite: null};
  const lock = async callback => {
    const previous = tail; let release;
    tail = new Promise(resolve => {release = resolve;});
    await previous;
    try {return await callback();} finally {release();}
  };
  const projection = () => ({session_id: 'sess_fixture', state: durable.state,
    model_session_state: durable.state, normalized_state: durable.state,
    allowed_actions: durable.state === 'confirmed' ? ['start_travel'] : [],
    package_code: null, payout_terms: null, pay_model_thb: null});
  const authority = actor => ({ok: actor === durable.model, allowed: durable.eligible && durable.state === 'offered',
    model_id: durable.model, binding: durable.binding, session_id: 'sess_fixture', offer_revision: String(durable.generation)});
  const bucket = {
    async get(key) {const row = records.get(key); return row ? {json: async () => JSON.parse(row.body)} : null;},
    async put(key, body, {onlyIf}) {
      const previous = records.get(key);
      if (onlyIf.etagDoesNotMatch && previous) return null;
      if (onlyIf.etagMatches && previous?.etag !== onlyIf.etagMatches) return null;
      const value = JSON.parse(body);
      if (value.outcome === 'success' && faults.receiptFailure) throw Error('fixture receipt storage failure');
      const tag = String(++etag); records.set(key, {body, etag: tag});
      if (value.outcome === 'success') durable.pending = null;
      if (value.outcome === 'unknown' && faults.claimBarrier) {
        const barrier = faults.claimBarrier; faults.claimBarrier = null;
        barrier.entered.resolve(); await barrier.release.promise;
      }
      return {etag: tag};
    },
  };
  function instance(actor = 'model_A') {
    const context = () => ({ok: true, session: {id: 'recFixture', fields: {session_id: 'sess_fixture', model_session_state: durable.state}}, tables: {sessions: {table: 'Sessions'}}});
    const currentWriter = vm.runInNewContext(legacyHandlerSource + ';handleModelSessionAction', {
      safeJson: request => request.json(), resolveModelSessionContext: async () => context(),
      modelSessionActionTargetsContext: (body, ctx) => body.session_id === ctx.session.fields.session_id,
      str: x => String(x ?? ''), modelSessionJson: (body, status = 200) => Response.json(body, {status}),
      PUBLIC_EXTENSION_MODEL_ACTIONS: new Set(), MODEL_SESSION_MODEL_ALLOWED_ACTIONS: new Set(['accept_job', 'decline_job']),
      MODEL_SESSION_MODEL_BLOCKED_ACTIONS: new Set(), normalizeModelSessionAction: x => x, normalizeModelDecline,
      modelSessionStateFromRecord: (_tables, record) => ({field: 'model_session_state', state: record.fields.model_session_state}),
      normalizeSessionState: x => x,
      resolveModelSessionTransition: (action, state) => ({ok: state === 'offered', to: action === 'accept_job' ? 'confirmed' : 'offer_declined'}),
      modelSessionResponseSession: (_tables, record) => ({...projection(), state: record.fields.model_session_state, model_session_state: record.fields.model_session_state}),
      airtablePatchById: async (_env, _table, _id, fields) => {
        writeAttempts++;
        if (faults.beforeWrite) {const hook = faults.beforeWrite; faults.beforeWrite = null; await hook();}
        writes++; durable.state = fields.model_session_state;
        if (faults.loseResponse) throw Error('fixture response lost after write');
        return {ok: true, id: 'recFixture', fields: {session_id: 'sess_fixture', model_session_state: durable.state}};
      },
      notifyTravelEvent: () => {notificationCalls++; throw Error('no real notification allowed');},
      requestMemberReplyRefresh: () => {notificationCalls++; throw Error('no real notification allowed');},
    });
    const adapter = createModelResponseAdapter({bucket, readAuthority: async () => authority(actor), writer: currentWriter,
      withOfferFence: (expected, callback) => lock(async () => {
        if (durable.pending) return {ok: false};
        const fresh = authority(actor);
        if (expected.session_id !== fresh.session_id || expected.offer_revision !== fresh.offer_revision || !fresh.ok || !fresh.allowed) return {ok: false};
        const pending = {generation: durable.generation, expectedModel: durable.model};
        durable.pending = pending;
        const attemptsBefore = writeAttempts;
        let applied;
        try {applied = await callback(); return applied;}
        finally {
          // A known rejection before any external write must not hold a newer
          // offer hostage. Once attempted, unknown outcomes remain pending.
          if (writeAttempts === attemptsBefore && applied?.ok !== true && durable.pending === pending) durable.pending = null;
        }
      }),
    });
    const runtime = createModelResponseRuntime({legacy: () => {throw Error('fixture legacy fallback prohibited');}, enabled: true, createHandler: () => adapter});
    return {respond: input => runtime(new Request('https://local.invalid/v1/model/session/action', {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(input),
    }), {}).then(r => r.json()).then(result => result.ok ? {...result, event: {
      session_id: input.session_id, offer_revision: input.offer_revision, model_id: actor,
      action: input.action, operation_id: result.receipt.operation_id,
    }} : result)};
  }
  const mutate = (kind, patch = {}) => lock(async () => {
    if (durable.pending) return {ok: false, code: 'pending_reconciliation'};
    const rule = offerWriterContract[kind];
    if (!rule || rule.generation === 'unverified') return {ok: false, code: 'writer_not_verified'};
    if (rule.generation === 'new') {durable.generation++; durable.state = 'offered'; durable.eligible = true;}
    if (rule.generation === 'close') durable.eligible = false;
    if (kind === 'reissue') durable.credentials++;
    if (kind === 'acknowledge') {
      if (!durable.eligible) return {ok: false, code: 'offer_closed'};
      // Models only the signed-link seed when state is empty; this is not the
      // production acknowledgement handler nor a claim it accepts all states.
      if (!durable.state) durable.state = 'confirmed';
    }
    Object.assign(durable, copy(patch)); return {ok: true};
  });
  return {instance, mutate, faults, records, outbox, snapshot: () => copy(durable),
    input: () => ({action: 'accept_job', session_id: 'sess_fixture', offer_revision: String(durable.generation), operation_id: 'operation_fixture_' + durable.generation}),
    writes: () => writes, notificationCalls: () => notificationCalls,
    // Bypasses the contract intentionally, modelling the unverified writer.
    external: patch => Object.assign(durable, copy(patch)),
    emitIntent: async event => {
      if (!event || typeof event !== 'object' || !['session_id', 'offer_revision', 'model_id', 'action', 'operation_id'].every(key => typeof event[key] === 'string' && event[key])) return null;
      const journalKey = 'model-responses/v1/' + await digest(JSON.stringify([event.model_id, event.session_id, event.offer_revision])) + '.json';
      const row = records.get(journalKey), record = row ? JSON.parse(row.body) : null;
      if (record?.outcome !== 'success' || record.receipt.operation_id !== event.operation_id || record.action !== event.action) return null;
      // Dedup the committed business event, never a transport attempt or an
      // operation ID on its own. Historical generations remain distinct.
      const id = JSON.stringify([event.session_id, event.offer_revision, event.model_id, 'model_response', event.action]);
      if (!outbox.has(id)) outbox.set(id, {outcome: 'pending'});
      return id;
    },
    deliverMock: (id, outcome) => {const row = outbox.get(id); if (!row || row.outcome === 'sent' || row.outcome === 'unknown') return false; row.outcome = outcome; return true;},
  };
}
