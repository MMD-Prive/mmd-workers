import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRenewalEligibility, withLiffRenewalEligibility, RENEWAL_PRICE_POLICY } from '../src/liff-renewal-eligibility.js';
const session = tier => ({ memberExists: true, memberId: 'TEST-MEMBER', lineUserId: 'U' + 'a'.repeat(32), memberProfile: { tier, membership_status: 'active', membership_expires_at: '2027-02-28T16:59:59.999Z' } });
const spend = n => ({ state: 'resolved', sourceVerified: true, serviceSpendVerified: true, serviceSpend365Thb: n, recordsCount: 1, pointsRecoveryPending: false });
const offer = code => ({ ok: true, status: 'ready', package_code: code, amount_thb: code === 'standard' ? 1000 : 2500, payment_available: true, membership_years: 1, entitlement_granted: false, official_verification_required: true });
const req = (path = 'offer', init) => new Request('https://mmdbkk.com/member/api/liff/renewal/' + path, init);
const env = { LIFF_RENEWAL_CARD_ENABLED: 'true' };

for (const [code, limit, price] of [['standard', 10000, 1000], ['premium', 20000, 2500]]) {
  test(`${code}: exact threshold is eligible, one satang below needs review`, () => {
    assert.equal(evaluateRenewalEligibility(session(code), spend(limit - .01)).state, 'review');
    const result = evaluateRenewalEligibility(session(code), spend(limit));
    assert.equal(result.state, 'eligible'); assert.equal(result.amount_thb, price);
    assert.equal(result.pricing_policy, RENEWAL_PRICE_POLICY);
    assert.equal(evaluateRenewalEligibility(session(code), spend(1000000)).amount_thb, price);
  });
}
test('unknown, string, negative, non-finite and empty histories cannot become zero/eligible', () => {
  for (const evidence of [null, {}, spend(NaN), spend(Infinity), spend(-1), spend('20000'),
    { ...spend(50000), serviceSpendVerified: false }, { ...spend(50000), sourceVerified: false },
    { ...spend(50000), pointsRecoveryPending: true }, { ...spend(50000), recoveryState: 'review_required' },
    { ...spend(0), recordsCount: 0 }]) {
    const result = evaluateRenewalEligibility(session('standard'), evidence);
    assert.equal(result.reason, 'history_pending'); assert.equal(result.service_spend_365_thb, null);
  }
});
test('known zero keeps existing membership and does not invent a full renewal price', () => {
  const result = evaluateRenewalEligibility(session('premium'), spend(0));
  assert.equal(result.reason, 'below_threshold_price_review');
  assert.equal(result.service_spend_365_thb, 0); assert.equal(result.amount_thb, undefined);
});
test('changing package and protected/suspended members never receive a silently changed tier', () => {
  assert.equal(evaluateRenewalEligibility(session('standard'), spend(50000), 'premium').reason, 'package_change_review');
  assert.equal(evaluateRenewalEligibility(session('vip'), spend(50000)).state, 'defer');
  const blocked = session('premium'); blocked.memberProfile.membership_status = 'blocked';
  assert.equal(evaluateRenewalEligibility(blocked, spend(50000)).reason, 'membership_review');
});
test('disabled flag and unrelated routes preserve the exact response with no extra reads', async () => {
  const response = new Response('untouched'); let reads = 0;
  const deps = { readSession: async () => { reads++; return session('standard'); }, readSpend: async () => spend(10000) };
  assert.equal(await withLiffRenewalEligibility(req(), {}, () => response, deps), response);
  assert.equal(await withLiffRenewalEligibility(new Request('https://mmdbkk.com/member/api/liff/profile'), env, () => response, deps), response);
  assert.equal(reads, 0);
});
test('eligible offer is annotated read-only and strictly bound to canonical identity', async () => {
  let next = 0;
  const response = await withLiffRenewalEligibility(req('offer?amount=799&member_id=OTHER'), env,
    () => { next++; return Response.json(offer('standard')); }, {
      readSession: async () => session('standard'),
      readSpend: async (_, identity) => { assert.equal(identity.memberId, 'TEST-MEMBER'); assert.equal(identity.strictIdentity, true); return spend(10000); },
    });
  const body = await response.json(); assert.equal(next, 1); assert.equal(body.amount_thb, 1000);
  assert.equal(body.history_status, 'verified'); assert.equal(body.service_spend_365_thb, 10000);
  assert.equal(body.entitlement_granted, false); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(body.memberId, undefined); assert.equal(body.lineUserId, undefined);
});
test('under-threshold GET and POST never reach payment creation', async () => {
  for (const method of ['GET', 'POST']) {
    let called = false;
    const request = method === 'GET' ? req() : req('purchase', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ package_code: 'standard' }) });
    const response = await withLiffRenewalEligibility(request, env, () => { called = true; return Response.json(offer('standard')); },
      { readSession: async () => session('standard'), readSpend: async () => spend(0) });
    assert.equal(called, false); assert.equal(response.status, method === 'POST' ? 409 : 200);
    const body = await response.json(); assert.equal(body.payment_available, false); assert.equal(body.entitlement_granted, false);
  }
});
test('eligible purchase retains the original body and delegates exactly once', async () => {
  const request = req('purchase', { method: 'POST', body: JSON.stringify({ package_code: 'premium' }) });
  let calls = 0;
  const response = await withLiffRenewalEligibility(request, env, async () => {
    calls++; assert.deepEqual(await request.json(), { package_code: 'premium' });
    return Response.json({ ok: true, entitlement_granted: false });
  }, { readSession: async () => session('premium'), readSpend: async () => spend(20000) });
  assert.equal(calls, 1); assert.equal((await response.json()).entitlement_granted, false);
});
test('package-change selection is readable but cannot create a payment', async () => {
  let reads = 0, writes = 0;
  const deps = { readSession: async () => session('standard'), readSpend: async () => { reads++; return spend(50000); } };
  const result = await withLiffRenewalEligibility(req('offer?package_code=premium'), env, () => { writes++; return new Response(); }, deps);
  const body = await result.json(); assert.equal(body.package_code, 'premium'); assert.equal(body.current_package_code, 'standard');
  assert.equal(body.reason, 'package_change_review'); assert.equal(body.payment_available, false);
  assert.equal(reads, 0); assert.equal(writes, 0);
});
test('obsolete downstream price does not become a payable offer', async () => {
  const result = await withLiffRenewalEligibility(req(), env, () => Response.json({ ...offer('premium'), amount_thb: 1999 }),
    { readSession: async () => session('premium'), readSpend: async () => spend(20000) });
  const body = await result.json(); assert.equal(body.reason, 'price_policy_review'); assert.equal(body.amount_thb, null); assert.equal(body.payment_available, false);
});
test('malformed requests keep existing validation and duplicate selected package is rejected', async () => {
  const deps = { readSession: async () => { throw new Error('unexpected read'); }, readSpend: async () => null };
  const invalid = await withLiffRenewalEligibility(req('offer?package_code=premium&package_code=standard'), env, () => new Response('bad'), deps);
  assert.equal(invalid.status, 400);
  const response = new Response('owner rejected', { status: 400 });
  const bad = req('purchase', { method: 'POST', body: JSON.stringify({ package_code: 'premium', amount: 1 }) });
  assert.equal(await withLiffRenewalEligibility(bad, env, () => response, deps), response);
});
test('missing authentication preserves owner 401 and source failures remain review', async () => {
  const unauthorized = new Response('auth', { status: 401 });
  assert.equal(await withLiffRenewalEligibility(req(), env, () => unauthorized, { readSession: async () => null, readSpend: async () => null }), unauthorized);
  const response = await withLiffRenewalEligibility(req(), env, () => { throw new Error('must not create'); },
    { readSession: async () => session('standard'), readSpend: async () => { throw new Error('offline'); } });
  assert.equal((await response.json()).reason, 'history_pending');
});
