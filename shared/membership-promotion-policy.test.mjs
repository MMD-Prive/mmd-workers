import assert from 'node:assert/strict';
import test from 'node:test';
import {currentPrivateMembershipPromotion as promo,applyMembershipPromotion as apply,privateRenewalTiming as timing} from './membership-promotion-policy.mjs';
const renewal=(package_code,paid_at='2026-10-31T16:59:59.999Z')=>({package_code,paid_at,action:'renewal',existing_member:true,prior_expire_at:'2026-01-01T00:00:00Z'});
test('October Bangkok cutoff is based on payment time, with tier-specific bonus',()=>{
 assert.equal(promo(renewal('standard')).bonus_days,180);assert.equal(promo(renewal('premium')).bonus_years,1);
 for(const code of ['standard','premium']) {assert.equal(promo(renewal(code,'2026-10-31T17:00:00Z')),null);assert.equal(promo(renewal(code,'2026-07-31T16:59:59Z')),null);}
 assert.equal(promo({...renewal('premium'),paid_at:'',verified_at:'2026-10-01'}),null);
});
test('new Premium total2 is not base2 plus Verify1; Standard signup has no inferred bonus',()=>{
 const p=promo({package_code:'premium',paid_at:'2026-10-01',action:'signup'});assert.equal(p.total_years,2);assert.equal(p.bonus_years,0);
 assert.equal(apply('2028-02-29T10:00:00Z',p,{start_at:'2026-02-28T10:00:00Z'}).toISOString(),'2028-02-28T10:00:00.000Z');
 assert.equal(promo({package_code:'standard',paid_at:'2026-10-01',action:'signup'}),null);
 assert.equal(promo({...renewal('premium'),action:'verify'}),null);assert.equal(promo({...renewal('premium'),existing_member:false}),null);
});
test('bonus adds to purchased term and respects leap dates',()=>{
 assert.equal(apply('2028-02-29T10:00:00Z',promo(renewal('premium'))).toISOString(),'2029-02-28T10:00:00.000Z');
 assert.equal(apply('2027-12-31T00:00:00Z',promo(renewal('standard'))).toISOString(),'2028-06-28T00:00:00.000Z');
});
test('strict one-calendar-year expiry boundary and unknown expiry fail closed',()=>{
 const expiry='2025-10-31T10:00:00Z';assert.equal(timing(expiry,'2026-10-31T09:59:59.999Z').expired_less_than_one_year,true);
 assert.equal(timing(expiry,'2026-10-31T10:00:00Z').expired_one_year_or_more,true);
 assert.equal(promo({...renewal('premium','2026-10-31T10:00:00Z'),prior_expire_at:expiry}),null);
 assert.equal(promo({...renewal('premium'),prior_expire_at:''}),null);
 assert.equal(timing('2024-02-29T10:00:00Z','2025-02-28T10:00:00Z').expired_one_year_or_more,true);
});
test('Public and protected packages do not receive ordinary Private promotion',()=>{
 for(const c of ['vip','svip','black_card','mmd_member','elite','red_card'])assert.equal(promo(renewal(c)),null);
});

test('Thai leap day across UTC date boundary clamps to local February28',()=>{
 const p=promo(renewal('premium'));assert.equal(apply('2028-02-28T18:30:00Z',p).toISOString(),'2029-02-27T18:30:00.000Z');
 assert.equal(timing('2024-02-28T18:30:00Z','2025-02-27T18:30:00Z').expired_one_year_or_more,true);
});
