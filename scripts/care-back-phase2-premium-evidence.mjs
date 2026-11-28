// Read-only adapter for server-owned Airtable snapshots. No network and no writes.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolveMemberEntitlements } from '../auth-worker/src/member-entitlement-resolver.js';
import { previewPremium90 } from './care-back-phase2-premium-preview.mjs';

const START = Date.parse('2026-09-30T17:00:00Z');
const END = Date.parse('2026-11-30T17:00:00Z');
const review = reason => ({ status: 'review', reason });
function iso(s) {
  if (typeof s !== 'string') return NaN;
  const m = /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(s);
  if (!m) return NaN;
  const day = new Date(m[1] + 'T00:00:00Z');
  return Number.isFinite(+day) && day.toISOString().slice(0, 10) === m[1] ? Date.parse(s) : NaN;
}
const fields = r => r?.fields ?? {};
const norm = value => {
  const s = typeof value === 'object' && value ? value.name : value;
  return typeof s === 'string' ? s.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_') : '';
};
function paidLowerBound(payment, proof) {
  const canonical = payment['Payment Date'] || payment.paid_at;
  const exact = iso(canonical);
  if (Number.isFinite(exact)) return exact;
  // Airtable Payment Date and proof paid_at are date-only. Require both verified
  // sources to agree. Bangkok day start is earlier than UTC day start, so use
  // that only as a lower bound. Never use it as a confirmation timestamp.
  if (typeof canonical !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(canonical) ||
      proof.paid_at !== canonical) return NaN;
  return iso(canonical + 'T00:00:00+07:00');
}
const ref = f => f.payment_ref || f['Payment Reference'] || f.transaction_ref;
const matches = (rows, pred) => rows.filter(r => pred(fields(r),r));
const one = (rows, pred) => { const r = matches(rows,pred); return r.length === 1 ? r[0] : null; };
function parse(s) {
  try { const x = JSON.parse(s); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; }
}
function linkExactly(ids, id) { return Array.isArray(ids) && ids.length === 1 && ids[0] === id; }

function evidenceFor(payment, snapshot, member, asOf) {
  const p = fields(payment);
  const key = ref(p);
  const session = p.session_id || p['Session ID'];
  const m = fields(member);
  if (!key || !session || !m.member_id || !member.id) return review('payment_identity_incomplete');
  const renew = one(snapshot.renewals, f => [f.renewal_session_id, f.payment_intent_session_id].includes(session));
  if (!renew) return review('renewal_session_not_unique');
  const rf = fields(renew);
  if (norm(rf.liff_intent) !== 'renew' || norm(rf.requested_package || rf.package_code) !== 'premium' ||
      rf.line_user_id !== (m.line_id || m.line_user_id) ||
      !rf.line_user_id || !rf.renewal_session_id || !renew.id ||
      ['rejected','cancelled','canceled','blocked','suspended','revoked'].includes(norm(rf.renewal_flow_status))) {
    return review('renewal_member_or_package_mismatch');
  }
  const proof = one(snapshot.proofs,f => ref(f) === key && norm(f.status) === 'verified');
  if (!proof || !proof.id || !linkExactly(fields(proof)['MMD — LIFF Renewal Sessions'],renew.id) ||
      !linkExactly(fields(proof).member,member.id)) return review('verified_proof_link_not_unique');
  const paidAt = paidLowerBound(p,fields(proof));
  // Paid time is a lower bound only; the successful journal is the upper bound.
  // A day alone or an audit after cutoff never proves on-time verification.
  if (!Number.isFinite(paidAt) || paidAt < START) return review('campaign_lower_bound_unproven');
  if (paidAt >= END) return { status:'skip', reason:'payment_after_campaign' };
  const events = snapshot.audits.flatMap(a => {
    const f = fields(a);
    const before = parse(f['Before JSON']);
    const after = parse(f['After JSON']);
    const at = iso(f['Created At (ISO)']);
    if (f.Action !== 'payment_review_decision' || f.Target !== 'payment_proof' ||
        norm(f.Result) !== 'success' || f.Reason !== 'approve' || !String(f['Event ID'] || '').startsWith('mmdpr_') ||
        !String(f['Source Ref'] || '').startsWith('payment-review:') ||
        before.proof_record_id !== proof.id || before.payment_ref !== key || after.payment_ref !== key ||
        before.payment_stage !== 'membership' || after.payment_stage !== 'membership' ||
        after.authority !== 'payments-worker' || after.money_truth_changed !== true ||
        (before.renewal_session_id && before.renewal_session_id !== rf.renewal_session_id) ||
        ![rf.renewal_session_id,rf.payment_intent_session_id].filter(Boolean).includes(after.session_id) ||
        !Number.isFinite(at) || at < paidAt || at > asOf || at >= END) return [];
    return [at];
  });
  if (events.length === 0) return review('original_confirmation_not_proven_by_cutoff');
  return { status:'qualified', paidTermLinks:rf['Member Entitlement'], evidence:{ memberId:m.member_id, paymentRef:key, action:'renewal', tier:'premium',
    disposition:'confirmed', authoritative:true, earliestProvenConfirmedAt:new Date(Math.min(...events)).toISOString() } };
}

// grantState is deliberately a separate repository-owned input. Absence or applied
// must be explicitly proven by that repository, not inferred from the expiry or an
// empty export. There is intentionally no production ledger adapter in this PR.
export function previewCanonicalPremium90(snapshot, { memberId, asOf, grantState } = {}) {
  if (!['members','payments','proofs','renewals','entitlements','audits'].every(k => Array.isArray(snapshot?.[k])) ||
      snapshot.complete !== true || !Number.isFinite(iso(asOf))) return review('incomplete_authoritative_snapshot');
  if (typeof memberId !== 'string' || !memberId) return review('canonical_member_missing');
  const member = one(snapshot.members,f => f.member_id === memberId);
  if (!member?.id) return review('canonical_member_not_unique');
  const mf = fields(member);
  const line = mf.line_id || mf.line_user_id;
  if (!line || !one(snapshot.members,f => (f.line_id || f.line_user_id) === line)) return review('member_line_identity_not_unique');
  const rows = matches(snapshot.entitlements,f => f.member_id === memberId);
  const resolved = resolveMemberEntitlements(rows, { now: iso(asOf) });
  if (resolved.member_blocked || ['blocked','suspended','revoked'].includes(norm(mf['Membership Status'] || mf.status))) return { status:'skip', reason:'membership_not_adjustable' };
  if (['vip','svip','blackcard','black_card'].includes(norm(mf['Membership Tier'] || mf.tier)) ||
      resolved.access.protected_allowlist_required) return { status:'skip', reason:'membership_not_adjustable' };
  const ownRenewalSessions = new Set(matches(snapshot.renewals,f => f.line_user_id === line && norm(f.liff_intent) === 'renew').flatMap(r => [fields(r).renewal_session_id,fields(r).payment_intent_session_id].filter(Boolean)));
  const candidates = matches(snapshot.payments,p => ownRenewalSessions.has(p.session_id || p['Session ID']) &&
    norm(p['Payment Status']) === 'paid' && norm(p['Verification Status']) === 'verified' &&
    norm(p.payment_stage || p.payment_type || p.stage) === 'membership' &&
    norm(p.package_code || p['Package Code'] || p.package) === 'premium');
  const evidence = [];
  const paidTermEvidence = new Map();
  let needsReview = false;
  for (const p of candidates) {
    if (!one(snapshot.payments, f => ref(f) === ref(fields(p)))) return review('payment_reference_not_unique');
    const outcome = evidenceFor(p,snapshot,member,iso(asOf));
    if (outcome.status === 'qualified') {
      evidence.push(outcome.evidence);
      paidTermEvidence.set(outcome.evidence.paymentRef, outcome.paidTermLinks);
    }
    else if (outcome.status === 'review') needsReview = true;
  }
  if (!evidence.length) return needsReview
    ? review('original_confirmation_not_proven_by_cutoff')
    : { status:'skip', reason:'no_qualifying_premium_renewal' };
  const current = ['active','expiring_soon'];
  const chain = resolved.entitlements
    .filter(e => e.capability === 'private_premium' && [...current,'pending'].includes(e.lifecycle))
    .sort((a,b) => Date.parse(a.start_at) - Date.parse(b.start_at));
  if (!chain.length || !current.includes(chain[0].lifecycle)) return review('canonical_expiry_not_unique');
  const canonicalRow = e => one(rows,f => f.entitlement_id === e.entitlement_id);
  for (let k=0;k<chain.length;k++) {
    const e=chain[k], r=canonicalRow(e);
    if (!r?.id || !linkExactly(fields(r).member,member.id)) return review('canonical_entitlement_member_link_missing');
    if (k === 0) continue;
    if (!Number.isFinite(iso(e.start_at)) || !Number.isFinite(iso(e.expire_at)) ||
        iso(e.start_at) !== iso(chain[k-1].expire_at) || iso(e.expire_at) <= iso(e.start_at)) {
      return review('paid_term_chain_not_contiguous');
    }
    const paidRef = ref(fields(r));
    if (!linkExactly(paidTermEvidence.get(paidRef), r.id) ||
        !one(snapshot.entitlements, f => ref(f) === paidRef)) return review('paid_successor_not_proven');
  }
  const terminal=chain.at(-1), term=canonicalRow(terminal);
  // A diagnostic fingerprint only; do not use it as a storage CAS.
  const fingerprint = createHash('sha256').update(JSON.stringify(chain.map(e => [canonicalRow(e).id,e.entitlement_id,e.start_at,e.expire_at]))).digest('hex');
  const plan = previewPremium90({ memberId, memberState:'premium', grantState, evidence,
    entitlement:{id:terminal.entitlement_id, memberId, tier:'premium', uniqueCurrentTerm:true,
      expireAt:terminal.expire_at, revision:fingerprint} });
  return plan;
}

// Local-only aggregate mode. Export provenance/completeness must be checked by
// the operator; unknown grant state is forced and no PII is printed to stdout.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const snapshot = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const asOf = process.argv[3];
    if (!snapshot.complete || !Number.isFinite(iso(asOf))) throw new Error('incomplete snapshot');
    const counts = {};
    for (const memberId of new Set(snapshot.members.map(m => fields(m).member_id).filter(Boolean))) {
      const plan = previewCanonicalPremium90(snapshot,{ memberId,asOf,grantState:'unknown' });
      const bucket = plan.reason || plan.status;
      counts[bucket] = (counts[bucket] || 0) + 1;
    }
    process.stdout.write(JSON.stringify({ mode:'offline_read_only_unknown_grant_state', counts }) + '\n');
  } catch { process.stderr.write('Preview unavailable: check restricted snapshot shape and as-of time.\n'); process.exitCode = 1; }
}
