// Offline planner only. Inputs must be normalized from authoritative settlement,
// member, entitlement and existing campaign-grant records, never from client input.
export const CAMPAIGN = 'care_back_phase2_premium_90_2026';
const START = Date.parse('2026-10-01T00:00:00+07:00');
const END = Date.parse('2026-12-01T00:00:00+07:00');
const DAYS = 90;
const DAY_MS = 86_400_000;
const KEY = /^[A-Za-z0-9_-]{1,128}$/;

function instant(value) {
  if (typeof value !== 'string') return NaN;
  const m = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(value);
  if (!m || +m[2] > 23 || +m[3] > 59 || +m[4] > 59) return NaN;
  const calendar = new Date(m[1] + 'T00:00:00.000Z');
  if (!Number.isFinite(+calendar) || calendar.toISOString().slice(0,10) !== m[1]) return NaN;
  return Date.parse(value);
}
const review = (reason) => ({ status: 'review', reason });
const skip = (reason) => ({ status: 'skip', reason });

export function previewPremium90(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return review('missing_snapshot');
  const { memberId, memberState, grantState, evidence, entitlement } = snapshot;
  if (typeof memberId !== 'string' || !KEY.test(memberId)) return review('canonical_member_missing');
  if (memberState === 'blocked' || memberState === 'protected') return skip('membership_not_adjustable');
  if (memberState !== 'premium') return review('authoritative_premium_state_missing');
  const grantKey = CAMPAIGN + ':' + memberId;
  if (grantState === 'applied') return skip('already_applied');
  if (grantState !== 'absent') return review('grant_state_not_proven');
  if (!Array.isArray(evidence) || evidence.length === 0) return review('no_confirmation_evidence');
  const qualified = new Set();
  const seen = new Map();
  let incomplete = false;
  for (const item of evidence) {
    if (!item || item.memberId !== memberId || typeof item.paymentRef !== 'string' || !KEY.test(item.paymentRef)) return review('payment_member_link_conflict');
    const { paymentRef, action, tier, disposition } = item;
    if (!['renewal', 'signup'].includes(action) || !['premium', 'standard'].includes(tier)) return review('settlement_kind_unknown');
    if (!['confirmed', 'reversed', 'unverified', 'conflict'].includes(disposition) || disposition === 'conflict') return review('settlement_evidence_conflict');
    const confirmed = instant(item.earliestProvenConfirmedAt);
    const identity = JSON.stringify([action, tier, disposition, Number.isFinite(confirmed) ? confirmed : null, item.authoritative === true]);
    if (seen.has(paymentRef) && seen.get(paymentRef) !== identity) return review('payment_evidence_conflict');
    seen.set(paymentRef, identity);
    if (action !== 'renewal' || tier !== 'premium' || disposition === 'reversed') continue;
    if (disposition !== 'confirmed' || item.authoritative !== true || !Number.isFinite(confirmed)) {
      incomplete = true;
      continue;
    }
    if (confirmed >= START && confirmed < END) qualified.add(paymentRef);
  }
  if (!qualified.size) return incomplete ? review('original_confirmation_unproven') : skip('no_qualifying_premium_renewal');
  if (!entitlement || typeof entitlement.id !== 'string' || !KEY.test(entitlement.id) ||
      entitlement.memberId !== memberId || entitlement.tier !== 'premium' ||
      entitlement.uniqueCurrentTerm !== true || typeof entitlement.revision !== 'string' || !entitlement.revision.trim()) {
    return review('canonical_expiry_not_proven');
  }
  const expiry = instant(entitlement.expireAt);
  const adjusted = new Date(expiry + DAYS * DAY_MS);
  if (!Number.isFinite(+adjusted) || adjusted.getUTCFullYear() > 9999) return review('invalid_current_expiry');
  return {
    status: 'preview',
    grantKey,
    entitlementId: entitlement.id,
    expectedRevision: entitlement.revision,
    before: new Date(expiry).toISOString(),
    after: adjusted.toISOString(),
    days: DAYS,
    qualifiedPayments: qualified.size,
  };
}
