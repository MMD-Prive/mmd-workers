// Integration specification only. No production authority/provider is installed.
const rule = (generation, source) => Object.freeze({generation, source});
export const offerWriterContract = Object.freeze({
  create: rule('new', 'create-session-canonical-link-runtime.js'),
  reassign: rule('new', 'owner-job-edit.js'),
  amend: rule('new', 'customer-change-resolution.js / owner-job-edit.js'),
  reopen: rule('new', 'admin-worker/src/owner-job-edit.js: buildEdit resets editable declined/expired state to offered; other reopen producers unverified'),
  accept: rule('same', 'index.js: handleModelSessionAction'),
  decline: rule('same', 'index.js: handleModelSessionAction'),
  acknowledge: rule('same', 'payments-worker/confirmation-ack.js: patchAcknowledgement'),
  reissue: rule('same', 'payments-worker/confirmation-link-reissue.js; pair/model-only credential writes'),
  cancel: rule('close', 'active cancellation writer inventory incomplete'),
  expire: rule('close', 'modelSessionContractV1.js; executor not verified'),
  external: rule('unverified', 'Automation 2 published script unavailable'),
});
export const offerFenceContract = Object.freeze({
  key: 'canonical_session_id',
  generation: 'server-issued, persisted, never reused, distinct from terms digest and credential expiry',
  scope: 'all participating writers, from authority recheck through external write and persisted receipt',
  uncertainWrite: 'durable pending blocks conflicting writes until operation-specific reconciliation',
  externalWriter: 'reread cannot fence a bypassing writer; production gate remains closed',
});

// Required integration contract, not evidence that deployed writers use it.
export const crossWorkerOfferContract = Object.freeze({
  ownerEdit: Object.freeze({worker: 'admin-worker', generation: 'new',
    span: 'before Jobs PATCH through Session PATCH, verification and persisted receipt',
    resets: Object.freeze(['model_ack', 'customer_ack', 'reconfirm_ack', 'ready'])}),
  acknowledge: Object.freeze({worker: 'payments-worker', generation: 'same',
    span: 'fresh canonical offer check through acknowledgement PATCH and receipt',
    seed: 'model role seeds confirmed only when lifecycle state is empty'}),
  reissue: Object.freeze({worker: 'payments-worker', generation: 'same',
    span: 'fresh canonical offer check through token records, Session URL PATCH and receipt',
    modes: Object.freeze(['pair', 'model-only'])}),
  limitation: 'Shared fixture coordination only; real auth/payment checks, tokens, Jobs writes and durable provider are not installed or verified here',
});
