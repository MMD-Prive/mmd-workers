import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reconcilePremiumReviewedMembershipTerm } from '../payments-worker/premium-membership-term.js';
import {
  currentPrivateMembershipPromotion as canonicalPromotion,
  applyMembershipPromotion as canonicalApply,
  privateRenewalTiming, addBangkokCalendarYears,
} from '../shared/membership-promotion-policy.mjs';

const manifest = JSON.parse(readFileSync(new URL('./fixtures/care-back-november-payments-20261101.json', import.meta.url)));
const patches = new Map(manifest.modules[0].patches.map(p => [p.id, p]));
const sha = value => createHash('sha256').update(value).digest('hex');
const historicalConstants = {
  CARE_BACK_START_AT: '2026-08-01T00:00:00+07:00',
  CARE_BACK_START_MS: Date.parse('2026-08-01T00:00:00+07:00'),
  PROMO_HONORED_BEFORE: '2027-01-01T00:00:00+07:00',
  PROMO_HONORED_BEFORE_MS: Date.parse('2027-01-01T00:00:00+07:00'),
  PROMO_PUBLIC_ENDS_BEFORE: '2026-11-01T00:00:00+07:00',
  PRIVATE_CARE_BACK: {
    standard: { code: 'care_back_private_standard_2026', bonus_days: 180, bonus_years: 0, label: 'CARE BACK +180 days' },
    premium: { code: 'care_back_private_premium_2026', bonus_days: 0, bonus_years: 1, label: 'CARE BACK +1 year' },
  },
  token2: value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
  privateRenewalTiming, addBangkokCalendarYears,
};
function evaluateFunction(code, dependencies = historicalConstants) {
  return new Function(...Object.keys(dependencies), 'return (' + code + ');')(...Object.values(dependencies));
}
const promotion = evaluateFunction(patches.get('currentPrivateMembershipPromotion').after);
const apply = evaluateFunction(patches.get('applyMembershipPromotion').after);

test('pinned live function bytes are complete, parseable and reviewed', () => {
  assert.equal(manifest.worker, 'payments-worker');
  assert.equal(manifest.modules[0].before_sha256, 'b07133b10d83dfba1a2ccc0fd89d12dcc06b1bfc44916b86ca94155abb9e7f94');
  assert.deepEqual([...patches.keys()], [
    'currentPrivateMembershipPromotion', 'applyMembershipPromotion', 'resolveWriteThroughPlan',
    'materializeRenewal', 'materializeRecoveredMembership', 'entitlementFields', 'reconcilePremiumReviewedMembershipTerm',
  ]);
  for (const p of patches.values()) {
    assert.equal(sha(p.before), p.before_sha256, p.id);
    assert.equal(sha(p.after), p.after_sha256, p.id);
    assert.doesNotMatch(p.before + p.after, /TRUNCATED/);
    assert.equal(typeof evaluateFunction(p.after), 'function', p.id);
  }
});

test('recovered production selector agrees with canonical paid-time policy across all cohorts', () => {
  for (const package_code of ['standard', 'premium', 'vip', 'black_card', ''])
  for (const paid_at of ['2026-07-31T16:59:59Z', '2026-08-01T00:00:00+07:00', '2026-10-31T23:59:59+07:00', '2026-11-01T00:00:00+07:00', '2026-11-30T23:59:59+07:00', '2026-12-31T23:59:59+07:00', '2027-01-01T00:00:00+07:00', 'invalid'])
  for (const prior_expire_at of ['2027-02-28T12:00:00+07:00', '2026-10-01T12:00:00+07:00', '2026-05-01T12:00:00+07:00', '2024-01-01T12:00:00+07:00', ''])
  for (const action of ['renewal', 'signup', 'other'])
  for (const existing_member of [true, false]) {
    const input = { package_code, paid_at, prior_expire_at, action, existing_member };
    assert.deepEqual(promotion(input), canonicalPromotion(input), JSON.stringify(input));
  }
});

test('historical transactions keep the exact pre-November production policy', () => {
  const before = evaluateFunction(patches.get('currentPrivateMembershipPromotion').before);
  for (const package_code of ['standard', 'premium'])
  for (const action of ['renewal', 'signup'])
  for (const existing_member of [true, false])
  for (const prior_expire_at of ['2028-01-01', '2026-10-01', '2025-10-01', '']) {
    const input = {package_code, action, existing_member, prior_expire_at, paid_at: '2026-10-31T12:00:00+07:00'};
    assert.deepEqual(promotion(input), before(input));
  }
});

test('production inline month arithmetic matches calendar policy including leap days and Bangkok midnight', () => {
  for (const date of ['2027-08-31T23:59:59+07:00', '2027-03-31T00:00:00+07:00', '2027-11-30T12:34:56+07:00', '2028-02-29T00:00:00+07:00', 'invalid'])
  for (const benefit of [{bonus_months:6}, {bonus_days:180}, {bonus_years:1}, {total_years:2}, {bonus_months:0}, null]) {
    const options = { start_at:'2026-11-01T23:59:59+07:00' };
    assert.equal(apply(date, benefit, options)?.toISOString(), canonicalApply(date, benefit, options)?.toISOString());
  }
  assert.equal(apply('2027-08-31T23:59:59+07:00', {bonus_months:6}).toISOString(), '2028-02-29T16:59:59.000Z');
});

test('all three recovered writers serialize the six-month term without dropping historical units', () => {
  const reviewed = patches.get('resolveWriteThroughPlan').after.match(/membership_term: (promotion\?\.total_years[\s\S]+?),\n    membership_expiry_rule:/)[1];
  const canonical = patches.get('materializeRenewal').after.match(/const membershipTerm = ([^\n]+);/)[1];
  const recovered = patches.get('materializeRecoveredMembership').after.match(/const membershipTermLabel = ([\s\S]+?);\n  const entitlementLevel/)[1];
  for (const [benefit, suffix] of [[{bonus_months:6}, '_plus_6_months'], [{bonus_days:180}, '_plus_180_days'], [{bonus_years:1}, '_plus_1_year'], [null, '']]) {
    assert.equal(new Function('promotion','baseYears', 'return ' + reviewed)(benefit,1), '1_year'+suffix);
    assert.equal(new Function('promotion','renewalYears', 'return ' + canonical)(benefit,1), '1_year'+suffix);
    assert.equal(new Function('promotion','membershipTerm', 'return ' + recovered)(benefit,{membership_term:'1_year'}), '1_year'+suffix);
  }
});

test('reviewed writer stores its resolved term so replays do not lose the months label', () => {
  const build = evaluateFunction(patches.get('entitlementFields').after, {
    compact8: value => Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined && v!==null && v!=='')), AUTHORITY2:'test',
  });
  const result = build({member_record_id:'fixture', membership_term:'1_year_plus_6_months', proposed_expire_at:'2028-05-01T00:00:00.000Z'});
  assert.equal(result.membership_term, '1_year_plus_6_months');
  assert.equal(result.expire_at, '2028-05-01T00:00:00.000Z');
  assert.match(patches.get('materializeRecoveredMembership').after, /renewal_status: "renewed",\n      membership_term: membershipTermLabel,/);
});

function premiumResponse(term, rule) {
  return Response.json({ ok:true, entitlement_materialized:true, entitlement_record_id:'rec01234567890123',
    membership_expire_at:'2028-05-01T05:00:00.000Z', membership_term:term, membership_expiry_rule:rule });
}
const premiumRequest=()=>new Request('https://payments.example.invalid/reviewed-proof', {
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({package_code:'premium'}),
});
function premiumWrapper(implementation, writes) {
  if(implementation==='source')return (request,response)=>reconcilePremiumReviewedMembershipTerm(request,response,{
    AIRTABLE_BASE_ID:'fixture-base',AIRTABLE_API_KEY:'fixture',AIRTABLE_HTTP:{fetch:async request=>{
      writes.push((await request.json()).fields);return Response.json({id:'rec01234567890123'});
    }},
  });
  return evaluateFunction(patches.get('reconcilePremiumReviewedMembershipTerm').after,{
    code9:value=>String(value||'').trim().toLowerCase(),
    isRecordId:value=>/^rec[a-zA-Z0-9]{10,}$/.test(value),clean21:value=>String(value||'').trim(),
    addUtcYears:(value,years)=>{const date=new Date(value);date.setUTCFullYear(date.getUTCFullYear()+years);return date;},
    patchEntitlement:async(_env,_id,fields)=>{writes.push(fields);},
    rebuild:(_response,data)=>Response.json(data),
  });
}
for(const implementation of ['source','emitted']) {
  test(implementation+' Premium wrapper preserves canonical November recovery and replay without another year',async()=>{
    const writes=[];const reconcile=premiumWrapper(implementation,writes);
    for(const anchor of ['current_expiry','verified_payment']) {
      const response=premiumResponse('1_year_plus_6_months',`1_year_from_${anchor}_plus_november_returning_premium_2026`);
      assert.equal(await reconcile(premiumRequest(),response),response);
      assert.equal(await reconcile(premiumRequest(),response),response);
      const data=await response.clone().json();assert.equal(data.membership_expire_at,'2028-05-01T05:00:00.000Z');
      assert.equal(data.membership_term,'1_year_plus_6_months');
    }
    assert.deepEqual(writes,[]);
  });
  test(implementation+' Premium wrapper retains its existing legacy one-year repair',async()=>{
    const writes=[];const reconcile=premiumWrapper(implementation,writes);
    const response=premiumResponse('1_year','1_year_from_verified_payment');
    const data=await(await reconcile(premiumRequest(),response)).json();
    assert.equal(data.membership_expire_at,'2029-05-01T05:00:00.000Z');assert.equal(data.membership_term,'2_years');
    assert.deepEqual(writes,[{expire_at:'2029-05-01T05:00:00.000Z',membership_expiry_rule:'2_years_from_verified_payment'}]);
  });
}
