// v2 extension and reminder state machine installed only by the reviewed
// exact-artifact delta. It deliberately does not use the stale v1 issuer.
export const DOUBLE_MOMENT_BASE_DAYS = 120;
export const DOUBLE_MOMENT_MAX_DAYS = 180;
export const DOUBLE_MOMENT_REMINDER_TIMING = null;
export const DOUBLE_MOMENT_REMINDERS_ENABLED = false;
export const DOUBLE_MOMENT_LINE_DELIVERY_ENABLED = false;

const DAY_MS = 86_400_000;
const CLAIM_ID = /^[a-zA-Z0-9_-]{1,120}$/;
const OPERATION_ID = /^[a-f0-9-]{36}$/i;
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

export function validInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function expiryBounds(issuedAt) {
  const issued = validInstant(issuedAt);
  if (issued == null) return null;
  return {
    issued_at: new Date(issued).toISOString(),
    base_expires_at: new Date(issued + DOUBLE_MOMENT_BASE_DAYS * DAY_MS).toISOString(),
    max_expires_at: new Date(issued + DOUBLE_MOMENT_MAX_DAYS * DAY_MS).toISOString(),
  };
}

export function validateEffectiveExpiry({ issuedAt, baseExpiry, effectiveExpiry, extension }) {
  const bounds = expiryBounds(issuedAt);
  const effective = validInstant(effectiveExpiry);
  if (!bounds || effective == null || validInstant(baseExpiry) !== validInstant(bounds.base_expires_at)) return false;
  if (effective === validInstant(bounds.base_expires_at)) return true;
  return Boolean(extension && extension.status === 'committed'
    && extension.base_expires_at === bounds.base_expires_at
    && extension.effective_expires_at === new Date(effective).toISOString()
    && effective > validInstant(bounds.base_expires_at)
    && effective <= validInstant(bounds.max_expires_at));
}

export function resolveV2ActivationExpiry({ issuedAt, journal, recordedCreditExpiry, recordedPolicyExpiry, extension, addDaysIso }) {
  const baseline = journal?.expires_at || addDaysIso(issuedAt, DOUBLE_MOMENT_BASE_DAYS);
  const persistedExtension = extension?.status === 'committed'
    ? { ...extension, effective_expires_at: extension.result?.effective_expires_at || extension.requested_expires_at }
    : null;
  if (extension && extension.status !== 'committed') return null;
  const effective = persistedExtension?.effective_expires_at
    || journal?.effective_expires_at
    || recordedCreditExpiry
    || recordedPolicyExpiry
    || baseline;
  if (!validateEffectiveExpiry({ issuedAt, baseExpiry: baseline, effectiveExpiry: effective, extension: persistedExtension })) return null;
  return { base_expires_at: new Date(validInstant(baseline)).toISOString(), effective_expires_at: new Date(validInstant(effective)).toISOString(), extension: persistedExtension };
}

function clean(value, max = 180) { return String(value ?? '').trim().slice(0, max); }
function recordFields(row) { return row?.fields || {}; }
function exactOwner(fields, claimId, clientId, amount, sequence, kind, expiresAt) {
  const paid = kind === 'paid';
  return fields['Policy Version'] === 'v2'
    && fields['Credit Authority'] === 'double_moment_coordinator'
    && fields['Campaign Claim ID'] === claimId
    && Array.isArray(fields.Client) && fields.Client.length === 1 && fields.Client[0] === clientId
    && fields['Original Amount THB'] === amount
    && fields['Credit Type'] === (paid ? 'paid_credit' : 'bonus_credit')
    && fields['Bonus Sequence'] === sequence
    && fields['Expires At'] === expiresAt;
}

function creditStatus(fields, expected) {
  if (fields['Reserved Amount THB'] !== 0) return 'review';
  if (fields.Status === 'available' && fields['Available Amount THB'] === expected && fields['Applied Amount THB'] === 0) return 'available';
  if (fields.Status === 'used' && fields['Available Amount THB'] === 0 && fields['Applied Amount THB'] === expected) return 'used';
  return 'review';
}

// Returns remaining paired moments only when Airtable, the activation journal,
// and the allocation ledger agree. Any missing or partial evidence is review.
export function inspectRemainingMoments({ claimId, clientId, claimFields = {}, activation = null, extension = null, credits = [], allocations = [] }) {
  const meta = safeJson(claimFields.payload_json);
  if (claimFields.claim_status === 'revoked' || meta.revoked === true) return { status: 'inactive', reason: 'claim_revoked', remaining_count: 0, remaining_sequences: [] };
  if (!CLAIM_ID.test(claimId || '') || !RECORD_ID.test(clientId || '')
      || claimFields.campaign_id !== 'promo_double_moment_sep2026'
      || claimFields.matched_client_id !== clientId || claimFields.claim_status !== 'applied'
      || meta.policy?.policy_version !== 'v2') return { status: 'review', reason: 'claim_invalid', remaining_count: 0, remaining_sequences: [] };
  if (!activation?.complete || extension && extension.status !== 'committed') return { status: 'review', reason: 'transition_incomplete', remaining_count: 0, remaining_sequences: [] };
  const issuedAt = activation.issued_at || meta.issued_at;
  const bounds = expiryBounds(issuedAt);
  const baseExpiry = activation.expires_at || meta.base_expires_at || meta.expires_at;
  const effectiveExpiry = activation.effective_expires_at || meta.effective_expires_at || meta.expires_at;
  const committedExtension = extension?.status === 'committed'
    ? { ...extension, effective_expires_at: extension.result?.effective_expires_at || extension.requested_expires_at }
    : activation.expiry_extension;
  if (!bounds || !validateEffectiveExpiry({ issuedAt, baseExpiry, effectiveExpiry, extension: committedExtension })) return { status: 'review', reason: 'expiry_journal_mismatch', remaining_count: 0, remaining_sequences: [] };
  if (validInstant(effectiveExpiry) <= Date.now()) return { status: 'expired', reason: 'claim_expired', remaining_count: 0, remaining_sequences: [] };
  if (!Array.isArray(credits) || credits.length !== 4) return { status: 'review', reason: 'credit_inventory_mismatch', remaining_count: 0, remaining_sequences: [] };
  if (!Array.isArray(allocations) || allocations.length > 2 || new Set(allocations.map(item => item?.sequence)).size !== allocations.length) return { status: 'review', reason: 'allocation_inventory_mismatch', remaining_count: 0, remaining_sequences: [] };
  const byId = new Map();
  for (const row of credits) {
    const id = clean(row?.fields?.credit_id, 180);
    if (!id || byId.has(id)) return { status: 'review', reason: 'credit_duplicate_or_missing_id', remaining_count: 0, remaining_sequences: [] };
    byId.set(id, row);
  }
  const remaining = [];
  for (let sequence = 1; sequence <= 2; sequence++) {
    const paidId = `${claimId}:paid:${sequence}`;
    const bonusId = `${claimId}:bonus:${sequence}`;
    const paid = byId.get(paidId), bonus = byId.get(bonusId);
    if (!paid?.id || !bonus?.id || paid.fields.credit_id !== paidId || bonus.fields.credit_id !== bonusId) return { status: 'review', reason: 'credit_pair_missing', remaining_count: 0, remaining_sequences: [] };
    const pf = recordFields(paid), bf = recordFields(bonus);
    if (!exactOwner(pf, claimId, clientId, 10_000, sequence, 'paid', effectiveExpiry)
        || !exactOwner(bf, claimId, clientId, 3_500, sequence, 'bonus', effectiveExpiry)) return { status: 'review', reason: 'credit_pair_conflict', remaining_count: 0, remaining_sequences: [] };
    const ps = creditStatus(pf, 10_000), bs = creditStatus(bf, 3_500);
    const allocation = allocations.find(item => item?.sequence === sequence);
    if (ps === 'review' || bs === 'review' || ps !== bs) return { status: 'review', reason: 'credit_pair_partial', remaining_count: 0, remaining_sequences: [] };
    if (ps === 'used') {
      if (!allocation?.complete || allocation.paid_credit_thb !== 10_000 || allocation.bonus_credit_thb !== 3_500) return { status: 'review', reason: 'allocation_ledger_mismatch', remaining_count: 0, remaining_sequences: [] };
    } else {
      if (allocation && !allocation.complete) return { status: 'review', reason: 'allocation_in_flight', remaining_count: 0, remaining_sequences: [] };
      if (allocation?.complete) return { status: 'review', reason: 'allocation_balance_mismatch', remaining_count: 0, remaining_sequences: [] };
      remaining.push(sequence);
    }
  }
  if (allocations.some(item => ![1, 2].includes(item?.sequence) || !byId.has(`${claimId}:paid:${item?.sequence}`))) return { status: 'review', reason: 'allocation_unknown', remaining_count: 0, remaining_sequences: [] };
  return { status: remaining.length ? 'eligible' : 'used', reason: remaining.length ? null : 'all_moments_used', remaining_count: remaining.length, remaining_sequences: remaining, issued_at: bounds.issued_at, base_expires_at: bounds.base_expires_at, expires_at: new Date(validInstant(effectiveExpiry)).toISOString() };
}

function safeJson(value) { try { const result = JSON.parse(value || '{}'); return result && typeof result === 'object' && !Array.isArray(result) ? result : {}; } catch { return {}; } }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function normalizeRequestedExpiry(value) {
  const ms = validInstant(value);
  return ms == null ? null : new Date(ms).toISOString();
}
function statePayloadHash(value) {
  const ordered = JSON.stringify({ claim_id: value.claim_id, client_record_id: value.client_record_id, requested_expires_at: value.requested_expires_at, actor_id: value.actor_id, reason: value.reason });
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(ordered)).then(bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join(''));
}
function uniqueRecords(rows, ids) {
  if (!Array.isArray(rows) || rows.length !== ids.length) return null;
  const map = new Map();
  for (const row of rows) {
    const id = row?.fields?.credit_id;
    if (!ids.includes(id) || map.has(id) || !row.id) return null;
    map.set(id, row);
  }
  return ids.every(id => map.has(id)) ? ids.map(id => map.get(id)) : null;
}

function inspectRecoverableCreditSet({ claimId, clientId, effectiveExpiry, nextExpiry, credits, allocations }) {
  if (!Array.isArray(allocations) || allocations.length > 2 || new Set(allocations.map(item => item?.sequence)).size !== allocations.length) return { status: 'review', reason: 'allocation_inventory_mismatch' };
  const ids = [1, 2].flatMap(sequence => [`${claimId}:paid:${sequence}`, `${claimId}:bonus:${sequence}`]);
  const set = uniqueRecords(credits, ids);
  if (!set) return { status: 'review', reason: 'credit_inventory_mismatch_requires_review' };
  let remaining = 0;
  for (let sequence = 1; sequence <= 2; sequence++) {
    const paid = set.find(row => row.fields.credit_id === `${claimId}:paid:${sequence}`);
    const bonus = set.find(row => row.fields.credit_id === `${claimId}:bonus:${sequence}`);
    for (const [row, amount, kind] of [[paid, 10_000, 'paid'], [bonus, 3_500, 'bonus']]) {
      const fields = row.fields || {};
      if (fields['Expires At'] !== effectiveExpiry && fields['Expires At'] !== nextExpiry) return { status: 'review', reason: 'credit_expiry_changed_requires_review' };
      if (!exactOwner(fields, claimId, clientId, amount, sequence, kind, fields['Expires At'])) return { status: 'review', reason: 'credit_pair_conflict' };
    }
    const ps = creditStatus(paid.fields, 10_000), bs = creditStatus(bonus.fields, 3_500);
    const allocation = allocations.find(item => item?.sequence === sequence);
    if (ps === 'review' || bs === 'review' || ps !== bs) return { status: 'review', reason: 'credit_pair_partial' };
    if (ps === 'used') {
      if (!allocation?.complete || allocation.paid_credit_thb !== 10_000 || allocation.bonus_credit_thb !== 3_500) return { status: 'review', reason: 'allocation_ledger_mismatch' };
    } else {
      if (allocation && !allocation.complete) return { status: 'review', reason: 'allocation_in_flight' };
      if (allocation?.complete) return { status: 'review', reason: 'allocation_balance_mismatch' };
      remaining++;
    }
  }
  return { status: remaining ? 'eligible' : 'used', remaining_count: remaining };
}

export async function applyExpiryExtension(ctx, body, deps) {
  const { fail, claimById, creditById, paymentByRef, assertOwner, adapters, campaignId } = deps;
  const claimId = clean(body.claim_id, 120), clientId = clean(body.client_record_id, 40);
  const operationId = clean(body.operation_id, 40), actorId = clean(body.actor_id, 120), reason = clean(body.reason, 500);
  const requested = normalizeRequestedExpiry(body.requested_expires_at);
  if (!CLAIM_ID.test(claimId) || !RECORD_ID.test(clientId) || !OPERATION_ID.test(operationId)
      || !actorId || !reason || !requested) fail('invalid_expiry_extension', 422);
  const opKey = `expiry-extension:${claimId}`;
  const activationKey = `activation:${claimId}`;
  const payload = { claim_id: claimId, client_record_id: clientId, requested_expires_at: requested, actor_id: actorId, reason };
  const payloadHash = await statePayloadHash(payload);
  let op = await ctx.storage.get(opKey);
  if (op && op.operation_id === operationId && op.payload_hash !== payloadHash) fail('extension_operation_payload_conflict');
  if (op?.status === 'committed') {
    if (op.operation_id !== operationId) fail('extension_already_committed');
    return { ok: true, idempotent: true, ...op.result };
  }
  if (op && (op.operation_id !== operationId || op.payload_hash !== payloadHash)) fail('extension_transition_in_progress', 503);

  let claim = await claimById(ctx.env, claimId);
  if (!claim?.id) fail('claim_not_found');
  const fields = claim.fields || {}, meta = safeJson(fields.payload_json);
  if (fields.matched_client_id !== clientId || fields.campaign_id !== campaignId) fail('claim_owner_mismatch', 403);
  if (fields.claim_status === 'revoked') fail('claim_inactive');
  if (fields.claim_status !== 'applied' || meta.policy?.policy_version !== 'v2') fail('legacy_or_inactive_claim_requires_review');
  const activation = await ctx.storage.get(activationKey);
  if (!activation?.complete) fail('activation_incomplete_requires_review', 503);
  const paymentRef = clean(fields.payment_reference, 220);
  const payment = paymentRef ? await paymentByRef(ctx.env, paymentRef) : null;
  if (!payment?.id) fail('payment_missing_requires_review', 503);
  try { assertOwner(payment, claim); } catch { fail('payment_claim_owner_mismatch', 403); }
  const issuedAt = activation.issued_at || fields.applied_at || meta.issued_at;
  const bounds = expiryBounds(issuedAt);
  if (!bounds || activation.expires_at !== bounds.base_expires_at) fail('original_expiry_mismatch_requires_review');
  const extension = await ctx.storage.get(opKey);
  if (extension && extension.status !== 'pending') fail('extension_state_invalid_requires_review');
  if (fields.expiry_extension_transition?.status === 'pending' && fields.expiry_extension_transition.operation_id !== operationId) fail('extension_transition_conflict', 503);
  const currentExpiry = op?.previous_expires_at || activation.effective_expires_at || meta.effective_expires_at || meta.expires_at || activation.expires_at;
  const currentMs = validInstant(currentExpiry), requestedMs = validInstant(requested), maxMs = validInstant(bounds.max_expires_at);
  if (currentMs == null || requestedMs == null) fail('expiry_state_invalid_requires_review');
  if (currentMs <= Date.now()) fail('expired_claim_extension_requires_policy_review');
  if (requestedMs < currentMs) fail('expiry_extension_cannot_shorten');
  if (requestedMs > maxMs) fail('expiry_extension_cap_exceeded');
  const ids = [1, 2].flatMap(sequence => [`${claimId}:paid:${sequence}`, `${claimId}:bonus:${sequence}`]);
  const rows = await Promise.all(ids.map(id => creditById(ctx.env, id)));
  const credits = uniqueRecords(rows, ids);
  if (!credits) fail('credit_inventory_mismatch_requires_review');
  const allocationKey = `redemption:${claimId}`;
  const allocations = await ctx.storage.get(allocationKey) || [];
  const requestedIso = new Date(requestedMs).toISOString();
  if (requestedMs === currentMs && !op) return { ok: true, idempotent: true, no_op: true, claim_id: claimId, base_expires_at: bounds.base_expires_at, effective_expires_at: requestedIso };

  const currentState = op
    ? inspectRecoverableCreditSet({ claimId, clientId, effectiveExpiry: op.previous_expires_at, nextExpiry: requestedIso, credits, allocations })
    : inspectRemainingMoments({ claimId, clientId, claimFields: fields, activation, extension: null, credits, allocations });
  if (currentState.status === 'review') fail('credit_state_requires_review');
  if (!currentState.remaining_count) fail('no_remaining_moments');
  if (!op && currentState.expires_at !== new Date(currentMs).toISOString()) fail('expiry_records_mismatch_requires_review');

  if (!op) {
    op = { operation_id: operationId, payload_hash: payloadHash, status: 'pending', claim_id: claimId, client_record_id: clientId, issued_at: bounds.issued_at, base_expires_at: bounds.base_expires_at, previous_expires_at: currentState.expires_at, requested_expires_at: requestedIso, actor_id: actorId, reason, started_at: new Date().toISOString(), credit_attempts: [] };
    await ctx.storage.put(opKey, op);
  }
  // The durable pending record is written first. Every later path (redeem,
  // activation replay, reminder eligibility) gates on it until commit.
  const latestClaim = await claimById(ctx.env, claimId);
  if (!latestClaim?.id || latestClaim.fields?.matched_client_id !== clientId || latestClaim.fields?.campaign_id !== campaignId
      || latestClaim.fields?.claim_status !== 'applied' || safeJson(latestClaim.fields?.payload_json).policy?.policy_version !== 'v2') fail('claim_owner_changed_requires_review', 503);
  const latestMeta = safeJson(latestClaim.fields.payload_json);
  if (latestClaim.fields.expiry_extension_transition?.operation_id !== operationId) {
    await adapters.patchRecord(ctx.env, adapters.table(ctx.env, 'claims'), latestClaim.id, {
      payload_json: JSON.stringify({ ...latestMeta, expiry_extension_transition: { status: 'pending', operation_id: operationId, requested_expires_at: requestedIso } }),
    });
  }
  for (const row of credits) {
    const f = row.fields || {};
    if (f['Expires At'] === requestedIso) continue;
    if (f['Expires At'] !== op.previous_expires_at) fail('credit_expiry_changed_requires_review', 503);
    const latest = await creditById(ctx.env, f.credit_id);
    if (!latest?.id || latest.id !== row.id || !same(latest.fields, f)) fail('credit_state_changed_requires_review', 503);
    const currentOp = await ctx.storage.get(opKey);
    if (!currentOp || currentOp.operation_id !== operationId || currentOp.status !== 'pending') fail('extension_transition_lost', 503);
    if (!currentOp.credit_attempts.includes(f.credit_id)) {
      currentOp.credit_attempts.push(f.credit_id);
      await ctx.storage.put(opKey, currentOp);
    }
    await adapters.patchRecord(ctx.env, adapters.table(ctx.env, 'credits'), row.id, { 'Expires At': requestedIso });
    const verified = await creditById(ctx.env, f.credit_id);
    if (!verified?.id || verified.id !== row.id || verified.fields?.['Expires At'] !== requestedIso
        || !exactOwner(verified.fields, claimId, clientId, f['Original Amount THB'], f['Bonus Sequence'], f['Credit Type'] === 'paid_credit' ? 'paid' : 'bonus', requestedIso)
        || creditStatus(verified.fields, f['Original Amount THB']) === 'review') fail('credit_expiry_write_unconfirmed', 503);
  }
  const finalCredits = uniqueRecords(await Promise.all(ids.map(id => creditById(ctx.env, id))), ids);
  if (!finalCredits || finalCredits.some(row => row.fields?.['Expires At'] !== requestedIso)) fail('credit_expiry_set_incomplete', 503);
  const finalState = inspectRecoverableCreditSet({ claimId, clientId, effectiveExpiry: op.previous_expires_at, nextExpiry: requestedIso, credits: finalCredits, allocations });
  if (finalState.status === 'review' || !finalState.remaining_count) fail('credit_state_requires_review', 503);
  claim = await claimById(ctx.env, claimId);
  if (!claim?.id || claim.fields?.matched_client_id !== clientId || claim.fields?.campaign_id !== campaignId
      || claim.fields?.claim_status !== 'applied' || safeJson(claim.fields?.payload_json).policy?.policy_version !== 'v2') fail('claim_owner_changed_requires_review', 503);
  const latestPayment = await paymentByRef(ctx.env, paymentRef);
  if (!latestPayment?.id || latestPayment.id !== payment.id) fail('payment_claim_owner_mismatch', 503);
  try { assertOwner(latestPayment, claim); } catch { fail('payment_claim_owner_mismatch', 503); }
  const finalMeta = safeJson(claim.fields.payload_json);
  const audit = { operation_id: operationId, actor_id: actorId, reason, approved_at: op.started_at, base_expires_at: bounds.base_expires_at, previous_expires_at: op.previous_expires_at, effective_expires_at: requestedIso, revision: Number(activation.expiry_extension?.revision || 0) + 1 };
  const committedExtension = { ...audit, status: 'committed' };
  await adapters.patchRecord(ctx.env, adapters.table(ctx.env, 'claims'), claim.id, {
    payload_json: JSON.stringify({ ...finalMeta, issued_at: bounds.issued_at, base_expires_at: bounds.base_expires_at, effective_expires_at: requestedIso, expires_at: requestedIso, expiry_extension: committedExtension, expiry_extension_transition: { status: 'ready_to_commit', operation_id: operationId, requested_expires_at: requestedIso } }),
  });
  const storedClaim = await claimById(ctx.env, claimId);
  const storedMeta = safeJson(storedClaim?.fields?.payload_json);
  if (storedClaim?.fields?.matched_client_id !== clientId || storedMeta.effective_expires_at !== requestedIso || storedMeta.expiry_extension?.operation_id !== operationId) fail('claim_expiry_write_unconfirmed', 503);
  const activationNext = { ...activation, issued_at: bounds.issued_at, expires_at: bounds.base_expires_at, effective_expires_at: requestedIso, expiry_extension: committedExtension };
  const result = { claim_id: claimId, issued_at: bounds.issued_at, base_expires_at: bounds.base_expires_at, effective_expires_at: requestedIso, revision: committedExtension.revision };
  const committedOp = { ...op, status: 'committed', committed_at: new Date().toISOString(), result };
  await ctx.storage.transaction(async txn => {
    await txn.put(activationKey, activationNext);
    await txn.put(opKey, committedOp);
  });
  return { ok: true, ...result };
}

export async function readPrivateReminderState(ctx, body, deps) {
  const { fail, claimById, creditById, paymentByRef, assertOwner, campaignId, clientForLine } = deps;
  const claimId = clean(body.claim_id, 120), lineUserId = clean(body.line_user_id, 80), clientId = clean(body.client_record_id, 40), memberId = clean(body.member_id, 180);
  if (!/^U[0-9a-f]{32}$/i.test(lineUserId) || !memberId || typeof clientForLine !== 'function') fail('reminder_identity_invalid', 422);
  const canonicalClientId = await clientForLine(ctx.env, lineUserId);
  if (!RECORD_ID.test(canonicalClientId || '') || clientId !== canonicalClientId) fail('reminder_identity_mismatch', 403);
  if (!DOUBLE_MOMENT_REMINDERS_ENABLED || !DOUBLE_MOMENT_REMINDER_TIMING) return { status: 'timing_unset', reminders: [] };
  if (!CLAIM_ID.test(claimId)) fail('reminder_identity_invalid', 422);
  const claim = await claimById(ctx.env, claimId);
  if (!claim?.id) fail('claim_not_found');
  const fields = claim.fields || {};
  if (fields.matched_client_id !== clientId || fields.matched_member_id !== memberId || fields.campaign_id !== campaignId) fail('claim_owner_mismatch', 403);
  const paymentRef = clean(fields.payment_reference, 220);
  const payment = paymentRef ? await paymentByRef(ctx.env, paymentRef) : null;
  if (!payment?.id) return { status: 'review', reminders: [] };
  try { assertOwner(payment, claim); } catch { return { status: 'review', reminders: [] }; }
  const ids = [1, 2].flatMap(sequence => [`${claimId}:paid:${sequence}`, `${claimId}:bonus:${sequence}`]);
  const credits = uniqueRecords(await Promise.all(ids.map(id => creditById(ctx.env, id))), ids);
  if (!credits) return { status: 'review', reminders: [] };
  const activation = await ctx.storage.get(`activation:${claimId}`);
  const extension = await ctx.storage.get(`expiry-extension:${claimId}`);
  const allocations = await ctx.storage.get(`redemption:${claimId}`) || [];
  const state = inspectRemainingMoments({ claimId, clientId, claimFields: fields, activation, extension, credits, allocations });
  if (state.status !== 'eligible') return { status: state.status, reminders: [] };
  // Timing is unset and no channel is enabled, so no card or message is emitted.
  return { status: 'policy_requires_review', reminders: [] };
}

export function installDoubleMomentExpiryV2({ Coordinator, fail, json, dependencies }) {
  if (!Coordinator?.prototype || !dependencies) throw new Error('double_moment_extension_install_invalid');
  const originalActivate = Coordinator.prototype.activate;
  const originalRedeem = Coordinator.prototype.redeem;
  Coordinator.prototype.activate = async function(body) {
    const op = await this.storage.get(`expiry-extension:${body.claim_id}`);
    if (op && op.status !== 'committed') fail('expiry_extension_in_progress', 503);
    return originalActivate.call(this, body);
  };
  Coordinator.prototype.redeem = async function(body) {
    const op = await this.storage.get(`expiry-extension:${body.claim_id}`);
    if (op && op.status !== 'committed') fail('expiry_extension_in_progress', 503);
    return originalRedeem.call(this, body);
  };
  Coordinator.prototype.extendExpiry = async function(body) {
    const result = await applyExpiryExtension(this, body, dependencies);
    return json(result);
  };
  Coordinator.prototype.reminderState = async function(body) {
    return { ok: true, ...await readPrivateReminderState(this, body, dependencies) };
  };
  Coordinator.prototype.dispatchReminder = async function() {
    // Explicit release flags and an approved timing policy are both required.
    // This branch remains unreachable in the prepared artifact by default.
    if (!DOUBLE_MOMENT_REMINDERS_ENABLED || !DOUBLE_MOMENT_REMINDER_TIMING) fail('reminder_delivery_disabled', 404);
    fail('reminder_delivery_adapter_unavailable', 503);
  };
}
