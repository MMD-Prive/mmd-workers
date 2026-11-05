// Integration specification only. No production authority/provider is installed.
const rule = (generation, source) => Object.freeze({generation, source});
export const offerWriterContract = Object.freeze({
  create: rule('new', 'create-session-canonical-link-runtime.js'),
  reassign: rule('new', 'owner-job-edit.js'),
  amend: rule('new', 'customer-change-resolution.js / owner-job-edit.js'),
  reopen: rule('new', 'producer must be identified before release'),
  accept: rule('same', 'index.js: handleModelSessionAction'),
  decline: rule('same', 'index.js: handleModelSessionAction'),
  acknowledge: rule('same', 'confirmation-ack.js'),
  reissue: rule('same', 'confirmation-link-reissue.js; credential only'),
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
