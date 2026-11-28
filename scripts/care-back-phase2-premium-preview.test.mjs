import test from 'node:test';
import assert from 'node:assert/strict';
import { previewPremium90 } from './care-back-phase2-premium-preview.mjs';
const id = 'member_fixture';
const row = { memberId:id, action:'renewal', tier:'premium', paymentRef:'payment_fixture', disposition:'confirmed', authoritative:true, earliestProvenConfirmedAt:'2026-10-29T12:00:00+07:00' };
const entitlement = { id:'term_fixture', memberId:id, tier:'premium', uniqueCurrentTerm:true, revision:'r1', expireAt:'2029-06-30T20:00:00+07:00' };
const input = { memberId:id, memberState:'premium', grantState:'absent', evidence:[row], entitlement };
function preview(changes) { return previewPremium90({ ...input, ...changes }); }
test('historical and fresh qualifying renewals have the same account key and exact expiry delta', () => {
  const old = preview();
  const fresh = preview({ evidence:[{ ...row, paymentRef:'next_fixture', earliestProvenConfirmedAt:'2026-11-28T12:00:00+07:00' }] });
  assert.equal(old.status,'preview');
  assert.equal(old.before, '2029-06-30T13:00:00.000Z');
  assert.equal(old.after, '2029-09-28T13:00:00.000Z');
  assert.deepEqual(fresh, old);
});
test('two qualifying payments never result in two increments; already recorded is a no-op', () => {
  const p = preview({ evidence:[row,{ ...row, paymentRef:'another_fixture' },row] });
  assert.equal(p.qualifiedPayments,2);
  assert.equal(p.days,90);
  assert.equal(preview({ grantState:'applied' }).reason,'already_applied');
  assert.equal(preview({ grantState:'unknown' }).status,'review');
});
test('Bangkok last millisecond passes, cutoff and pre-October fail', () => {
  for (const [at,status] of [['2026-09-30T16:59:59.999Z','skip'],['2026-09-30T17:00:00.000Z','preview'],['2026-11-30T16:59:59.999Z','preview'],['2026-11-30T17:00:00.000Z','skip']]) {
    assert.equal(preview({ evidence:[{ ...row, earliestProvenConfirmedAt:at }] }).status,status);
  }
});
test('insufficient or conflicting payment evidence remains in review', () => {
  for (const change of [{ authoritative:false },{ earliestProvenConfirmedAt:'2026-11-30' },{ earliestProvenConfirmedAt:'2026-11-31T00:00:00Z' },{ memberId:'other_fixture' },{ disposition:'unverified' }]) {
    assert.equal(preview({ evidence:[{ ...row, ...change }] }).status,'review');
  }
  assert.equal(preview({ evidence:[row,{ ...row, disposition:'reversed' }] }).status,'review');
});
test('first-time, Standard and reversed payments do not get the Premium renewal bonus', () => {
  for (const change of [{ action:'signup' },{ tier:'standard' },{ disposition:'reversed' }]) assert.equal(preview({ evidence:[{ ...row, ...change }] }).status,'skip');
});
test('does not mutate input, guess a term, or bypass blocked and protected membership', () => {
  const frozen = Object.freeze({ ...input, evidence:Object.freeze([Object.freeze({ ...row })]), entitlement:Object.freeze({ ...entitlement }) });
  previewPremium90(frozen);
  assert.equal(frozen.entitlement.expireAt,entitlement.expireAt);
  assert.equal(preview({ entitlement:{ ...entitlement, uniqueCurrentTerm:false } }).status,'review');
  assert.equal(preview({ entitlement:{ ...entitlement, revision:'' } }).status,'review');
  assert.equal(preview({ memberState:'blocked' }).status,'skip');
  assert.equal(preview({ memberState:'protected' }).status,'skip');
});
