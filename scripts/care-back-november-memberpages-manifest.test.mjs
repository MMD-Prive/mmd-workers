import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {currentPrivateMembershipPromotion, applyMembershipPromotion, privateRenewalTiming, privateRenewalPriceEligible, addBangkokCalendarYears} from '../shared/membership-promotion-policy.mjs';
const m=JSON.parse(readFileSync(new URL('./fixtures/care-back-november-memberpages-20261101.json',import.meta.url)));
const pairs=new Map(m.modules[0].patches.map(p=>[p.id,p]));
const sha=s=>createHash('sha256').update(s).digest('hex');
const context={currentPrivateMembershipPromotion, privateRenewalTiming, privateRenewalPriceEligible,addBangkokCalendarYears,
  token5:v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''),
  CARE_BACK_START_AT:'2026-08-01T00:00:00+07:00',CARE_BACK_START_MS:Date.parse('2026-08-01T00:00:00+07:00'),
  PROMO_PUBLIC_ENDS_BEFORE:'2026-11-01T00:00:00+07:00',PROMO_HONORED_BEFORE:'2027-01-01T00:00:00+07:00',PROMO_HONORED_BEFORE_MS:Date.parse('2027-01-01T00:00:00+07:00'),
  PRIVATE_CARE_BACK:{standard:{code:'care_back_private_standard_2026',bonus_days:180,bonus_years:0,label:'CARE BACK +180 days'},premium:{code:'care_back_private_premium_2026',bonus_days:0,bonus_years:1,label:'CARE BACK +1 year'}},
};
const fn=(text,c=context)=>new Function(...Object.keys(c),'return ('+text+');')(...Object.values(c));
test('recovered Member Pages manifest pins complete before and after bytes',()=>{
 assert.equal(m.worker,'member-pages-worker');assert.equal(pairs.size,13);
 for(const p of pairs.values()){assert.equal(sha(p.before),p.before_sha256,p.id);assert.equal(sha(p.after),p.after_sha256,p.id);assert.doesNotMatch(p.before+p.after,/TRUNCATED/);}
 for(const name of ['currentPrivateMembershipPromotion','applyMembershipPromotion','isPrivateCareBackAnnouncementVisible','promoLabel','handleOffer','projectKenjiRenewalPromotion'])assert.equal(typeof fn(pairs.get(name).after),'function');
});
test('emitted shared policy keeps new signup and historical terms and applies six calendar months',()=>{
 const policy=fn(pairs.get('currentPrivateMembershipPromotion').after),apply=fn(pairs.get('applyMembershipPromotion').after);
 for(const package_code of ['standard','premium','vip'])for(const paid_at of ['2026-10-31T12:00:00+07:00','2026-11-01T00:00:00+07:00','2026-12-31T12:00:00+07:00','2027-01-01T00:00:00+07:00'])for(const prior_expire_at of ['2027-08-31','2026-10-01','2024-01-01',''])for(const action of ['renewal','signup'])for(const existing_member of [true,false]){
  const input={package_code,paid_at,prior_expire_at,action,existing_member};assert.deepEqual(policy(input),currentPrivateMembershipPromotion(input));
 }
 for(const date of ['2027-08-31T23:59:59+07:00','2027-03-31T00:00:00+07:00'])assert.equal(apply(date,{bonus_months:6}).toISOString(),applyMembershipPromotion(date,{bonus_months:6}).toISOString());
});
test('public announcement is visible through November 30 and ends at Bangkok midnight',()=>{
 const visible=fn(pairs.get('isPrivateCareBackAnnouncementVisible').after);
 assert.equal(visible(new Date('2026-11-01T00:00:00+07:00')),true);
 assert.equal(visible(new Date('2026-11-30T23:59:59+07:00')),true);
 assert.equal(visible(new Date('2026-12-01T00:00:00+07:00')),false);
 const campaign=new Function('now','RENEWAL_COPY','isPrivateCareBackAnnouncementVisible',pairs.get('renewalViewHtml-campaign').after+'\nreturn campaign;');
 const november=campaign(new Date('2026-11-01T00:00:00+07:00'),{},visible);
 assert.match(november.campaignTitle,/เพิ่ม 6 เดือน/);assert.match(november.campaignTerms,/หมดอายุไม่เกิน 6 เดือนหรือเกิน 6 เดือน/);assert.match(november.campaignAnnouncement,/30 พ.ย. 2569/);assert.doesNotMatch(JSON.stringify(november),/สิ้นปี|31 ธ.ค./);
 const old={historical:true};assert.equal(campaign(new Date('2026-10-31T12:00:00+07:00'),old,visible),old);
});
test('live offer DTO changes only by adding its canonical month quantity',async()=>{
 const offer={status:'ready',package_code:'premium',membership_years:1,amount_thb:999,promotion:{bonus_months:6},price_rule:'existing-test-rule'};
 const deps={json13:x=>x,resolveOffer:async()=>({session:{memberProfile:{}},offer}),clean17:x=>String(x||''),PACKAGE_LABELS:{premium:'Premium'},expiryAfter:()=> 'unchanged-calculated-date',promoLabel:fn(pairs.get('promoLabel').after)};
 const before=await fn(pairs.get('handleOffer').before,deps)({method:'GET'},{}),after=await fn(pairs.get('handleOffer').after,deps)({method:'GET'},{});
 assert.deepEqual(after,{...before,bonus_months:6});assert.match(after.promotion_label,/เพิ่ม 6 เดือน/);assert.equal(after.entitlement_granted,false);
 offer.status='review_required';offer.classification='new_signup';const blocked=await fn(pairs.get('handleOffer').after,deps)({method:'GET'},{});assert.equal(blocked.payment_available,false);assert.equal(blocked.bonus_months,undefined);
});
test('projection retains review for expired accounts without fabricating price or base term',()=>{
 const projection=fn(pairs.get('projectKenjiRenewalPromotion').after);const now=new Date('2026-11-01T12:00:00+07:00');
 for(const level of ['private_standard','private_premium']){
  const active=projection({level,lifecycle:'active',expire_at:'2027-05-01T12:00:00+07:00'},now);assert.equal(active.promotion_months,6);assert.equal(active.base_years,1);assert.equal(active.checkout_status,'review_required');
  for(const expire_at of ['2026-07-01T12:00:00+07:00','2024-01-01T12:00:00+07:00']){const old=projection({level,lifecycle:'expired',expire_at},now);assert.equal(old.promotion_months,6);assert.equal(old.status,'review_required');assert.equal(old.base_years,undefined);assert.equal(old.amount_thb,undefined);}
 }
});
test('both emitted UI renderers show months without calling them days or years',()=>{
 const bonus=new Function('offer',pairs.get('createRenewalView-months').after+'\nreturn bonus;');assert.equal(bonus({bonus_months:6}),'6 เดือน');assert.equal(bonus({bonus_days:180}),'180 วัน');
 const rows=[];new Function('offer','addRow',pairs.get('renderShell-renewal-months').after)({bonus_months:6},(...row)=>rows.push(row));assert.deepEqual(rows,[['CARE BACK เพิ่ม','6 เดือน']]);
 assert.equal(fn(pairs.get('promoLabel').after)({bonus_months:6}),'โปรต่ออายุ: เพิ่ม 6 เดือน');
});
