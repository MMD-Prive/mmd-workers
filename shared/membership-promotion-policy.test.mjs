import assert from 'node:assert/strict';
import test from 'node:test';
import {currentPrivateMembershipPromotion as promo,applyMembershipPromotion as apply,privateRenewalTiming as timing,privateRenewalPriceEligible,privateRenewalBaseYears,isPrivateCareBackAnnouncementVisible as visible,addBangkokCalendarMonths} from './membership-promotion-policy.mjs';
const renewal=(package_code,paid_at='2026-10-31T16:59:59.999Z')=>({package_code,paid_at,action:'renewal',existing_member:true,prior_expire_at:'2026-01-01T00:00:00Z'});
test('October Bangkok cutoff is based on payment time, with tier-specific bonus',()=>{
 assert.equal(promo(renewal('standard')).bonus_days,180);assert.equal(promo(renewal('premium')).bonus_years,1);
 for(const code of ['standard','premium']) {assert.equal(promo(renewal(code,'2026-07-31T16:59:59Z')),null);}
 assert.equal(promo({...renewal('premium'),paid_at:'',verified_at:'2026-10-01'}),null);
});
test('November wave advertises through 30 Nov while paid-time rights are honored through 31 Dec Bangkok',()=>{
 for(const code of ['standard','premium']){
  const late=promo(renewal(code,'2026-10-31T17:00:00Z'));assert.ok(late);assert.equal(late.ends_before,'2026-12-01T00:00:00+07:00');
  assert.equal(late.bonus_months,6);assert.equal(late.bonus_days,0);assert.equal(late.bonus_years,0);
  assert.ok(promo(renewal(code,'2026-12-31T16:59:59.999Z')));
  assert.equal(promo(renewal(code,'2026-12-31T17:00:00Z')),null);
 }
 assert.ok(promo({package_code:'premium',paid_at:'2026-12-31T16:59:59Z',action:'signup'}));
 assert.equal(promo({package_code:'premium',paid_at:'2026-12-31T17:00:00Z',action:'signup'}),null);
});

test('November announcement cutoff is Bangkok midnight and does not gate December rights',()=>{
 assert.equal(visible('2026-07-31T16:59:59.999Z','november'),false);
 assert.equal(visible('2026-10-31T16:59:59.999Z','november'),true);
 assert.equal(visible('2026-10-31T17:00:00Z','november'),true);
 assert.equal(visible('2026-11-30T16:59:59.999Z','november'),true);
 assert.equal(visible('2026-11-30T17:00:00Z','november'),false);
 assert.equal(visible('invalid','november'),false);
 assert.equal(visible('2026-10-31T16:59:59.999Z'),true);
 assert.equal(visible('2026-10-31T17:00:00Z'),false,'October-only callers cannot advertise stale terms in November');
 assert.equal(promo(renewal('premium','2026-11-30T17:00:00Z')).bonus_months,6);
});

test('actual November payment selects new bonus while late verification preserves October payment terms',()=>{
 for(const code of ['standard','premium']) {
  const historical=promo({...renewal(code),verified_at:'2026-11-30T10:00:00Z'});
  assert.equal(historical.code,`october_prepaid_${code}_2026`);
  assert.equal(historical.ends_before,'2026-11-01T00:00:00+07:00');
  assert.equal(historical.bonus_months,undefined);
  const current=promo({...renewal(code,'2026-10-31T17:00:00Z'),verified_at:'2026-12-01T00:00:00Z'});
  assert.equal(current.code,`november_returning_${code}_2026`);
  assert.equal(current.bonus_months,6);
 }
});

test('active, expired within six months, exact six-month boundary and older members receive the same November bonus',()=>{
 const paid_at='2026-11-01T10:00:00+07:00';
 const priorExpiries=['2027-02-28T10:00:00+07:00','2026-09-01T10:00:00+07:00','2026-05-01T10:00:00+07:00','2026-05-01T09:59:59.999+07:00','2024-01-01T10:00:00+07:00'];
 for(const code of ['standard','premium']) for(const prior_expire_at of priorExpiries){
  const p=promo({...renewal(code,paid_at),prior_expire_at});
  assert.equal(p.bonus_months,6,`${code}: ${prior_expire_at}`);
  assert.equal(p.bonus_years,0);assert.equal(p.bonus_days,0);
 }
});

test('returning signup requires verified expired history and does not turn active membership into a second signup',()=>{
 for(const code of ['standard','premium']){
  const returning={...renewal(code,'2026-11-01T10:00:00+07:00'),action:'signup',prior_expire_at:'2024-01-01T10:00:00+07:00'};
  assert.equal(promo(returning).bonus_months,6);
  assert.equal(promo({...returning,prior_expire_at:'2027-01-01T10:00:00+07:00'}),null);
  assert.equal(promo({...returning,prior_expire_at:''}),null);
  assert.equal(promo({...returning,prior_expire_at:'invalid'}),null);
  assert.equal(promo({...returning,action:'verify'}),null);
  assert.equal(promo({...returning,paid_at:'2026-10-31T16:59:59.999Z'}),null);
 }
});

test('November signup packages and one-year renewal base remain unchanged',()=>{
 const newPremium=promo({package_code:'premium',paid_at:'2026-11-01T10:00:00+07:00',action:'signup',existing_member:false});
 assert.equal(newPremium.total_years,2);assert.equal(newPremium.bonus_years,0);assert.equal(newPremium.bonus_months,undefined);
 assert.equal(promo({package_code:'standard',paid_at:'2026-11-01T10:00:00+07:00',action:'signup',existing_member:false}),null);
 for(const code of ['standard','premium'])assert.equal(privateRenewalBaseYears(code),1);
});

test('six calendar months clamp month ends including a Bangkok date across the UTC boundary',()=>{
 const p=promo(renewal('premium','2026-11-01T10:00:00+07:00'));
 assert.equal(apply('2027-08-30T17:15:00Z',p).toISOString(),'2028-02-28T17:15:00.000Z');
 assert.equal(apply('2028-08-30T17:15:00Z',p).toISOString(),'2029-02-27T17:15:00.000Z');
 assert.equal(apply('2026-11-29T17:00:00Z',p).toISOString(),'2027-05-29T17:00:00.000Z');
 assert.equal(addBangkokCalendarMonths(new Date('2026-08-31T10:00:00+07:00'),6).toISOString(),'2027-02-28T03:00:00.000Z');
});

test('bonus extends the supplied purchased term while start and expired state remain separate',()=>{
 const paid_at='2026-11-01T10:00:00+07:00';
 const oldExpiry='2026-01-01T10:00:00+07:00';
 const p=promo({...renewal('standard',paid_at),prior_expire_at:oldExpiry});
 assert.equal(timing(oldExpiry,paid_at).active,false);
 assert.equal(timing(oldExpiry,paid_at).start_at,'2026-11-01T03:00:00.000Z');
 assert.equal(apply('2027-11-01T10:00:00+07:00',p).toISOString(),'2028-05-01T03:00:00.000Z');
 assert.equal(timing('2027-02-28T10:00:00+07:00',paid_at).start_at,'2027-02-28T03:00:00.000Z');
});

test('new bonus alone cannot broaden the separately authorized renewal-price window',()=>{
 const expiry='2026-08-03T03:00:00Z';
 assert.equal(privateRenewalPriceEligible(timing(expiry,'2026-11-01T03:00:00Z')),true);
 assert.equal(privateRenewalPriceEligible(timing(expiry,'2026-11-01T03:00:00.001Z')),false);
 assert.equal(promo({...renewal('premium','2026-11-01T03:00:00.001Z'),prior_expire_at:expiry}).bonus_months,6);
});

test('November bonus fails closed on unknown identity/expiry and unsupported or protected packages',()=>{
 for(const code of ['vip','svip','blackcard','black_card','mmd_member','elite','red_card','constructor','unknown'])assert.equal(promo(renewal(code,'2026-11-01T10:00:00+07:00')),null);
 const p=renewal('premium','2026-11-01T10:00:00+07:00');
 assert.equal(promo({...p,existing_member:false}),null);
 assert.equal(promo({...p,existing_member:'true'}),null);
 assert.equal(promo({...p,prior_expire_at:''}),null);
 assert.equal(promo({...p,paid_at:''}),null);
 assert.equal(promo({...p,paid_at:'invalid'}),null);
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

test('pinned pre-November signup and renewal policy objects retain their historical contract',()=>{
 const paid_at='2026-10-31T16:59:59.999Z';
 const common={starts_at:'2026-08-01T00:00:00+07:00',ends_before:'2026-11-01T00:00:00+07:00',honored_before:'2027-01-01T00:00:00+07:00'};
 assert.deepEqual(promo(renewal('standard',paid_at)),{code:'october_prepaid_standard_2026',bonus_days:180,bonus_years:0,label:'CARE BACK +180 days',...common});
 assert.deepEqual(promo(renewal('premium',paid_at)),{code:'october_prepaid_premium_2026',bonus_days:0,bonus_years:1,label:'CARE BACK +1 year',...common});
 assert.deepEqual(promo({package_code:'premium',paid_at,action:'signup',existing_member:false}),{code:'private_premium_signup_total_two_years_2026',total_years:2,bonus_days:0,bonus_years:0,label:'Premium signup total 2 years',starts_at:common.starts_at});
 for(const package_code of ['standard','premium']) {
  assert.equal(promo({...renewal(package_code,paid_at),action:'signup'}),null);
  assert.equal(promo({...renewal(package_code,paid_at),prior_expire_at:'2025-10-31T16:59:59.999Z'}),null);
 }
});


