import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RENEWAL_COPY, renewalViewHtml, createRenewalView } from '../src/liff-renewal-view.js';
import { isPrivateCareBackAnnouncementVisible, currentPrivateMembershipPromotion, applyMembershipPromotion, addBangkokCalendarYears, privateRenewalBaseYears } from '../../shared/membership-promotion-policy.mjs';

const promotionAt = (time, code='premium', action='renewal') => currentPrivateMembershipPromotion({ package_code:code, paid_at:time, action, existing_member:action==='renewal', prior_expire_at:'2027-02-28T16:59:59.999Z' });

function dom() {
  const elements = new Map();
  const node = () => ({ textContent:'', hidden:false, disabled:false, children:[], addEventListener(){}, append(...items){this.children.push(...items);}, replaceChildren(...items){this.children=items;}, className:'' });
  const get = id => {
    if(id==='rn-logo-image') return null;
    if(!elements.has(id)) elements.set(id,node());
    return elements.get(id);
  };
  const radios=['premium','standard'].map(value=>({...node(),value,checked:false}));
  return { document:{getElementById:get,querySelectorAll:()=>radios,createElement:node}, elements,get };
}
function render(code='premium',extra={}) {
  const d=dom();
  const ui=createRenewalView({document:d.document,fetcher:()=>{throw new Error('must not fetch from render')},navigate:()=>{throw new Error('must not navigate from render')},showView:()=>{},checkoutUrl:()=>'',getBusy:()=>false,setBusy:()=>{}});
  const offer={ok:true,status:'ready',payment_available:true,package_code:code,current_package_code:code,amount_thb:code==='premium'?2500:1000,history_status:'verified',service_spend_365_thb:25000,pricing_policy:'renewal_spend_365_20261025',discount_verified:true,official_verification_required:true,entitlement_granted:false,membership_years:1,current_expires_at:'2027-02-28T16:59:59.999Z',renewal_starts_at:'2027-02-28T16:59:59.999Z',new_expires_at:'2029-02-28T16:59:59.999Z',promotion_label:code==='premium'?'CARE BACK เพิ่ม 1 ปี':'CARE BACK เพิ่ม 180 วัน',bonus_years:code==='premium'?1:0,bonus_days:code==='standard'?180:0,...extra};
  ui.render(offer); return {...d,ui};
}

test('Premium signup is 2,999 THB for its normal two-year term, not a one-year fee',()=>{
  assert.equal(RENEWAL_COPY.signupPremium,'สมัครใหม่ 2,999 บาท / 2 ปี · ระยะสมาชิกปกติ');
  const html=renewalViewHtml(new Date('2026-10-25T13:00:00+07:00'));
  assert.match(html,/สมัครใหม่ 2,999 บาท \/ 2 ปี/); assert.doesNotMatch(html,/2,999 บาท \/ ปี/);
  assert.match(html,/สมัครใหม่ 1,199 บาท \/ 1 ปี/);
  assert.match(html,/ไม่บวกโบนัสต่ออายุให้เป็น 3 ปีโดยอัตโนมัติ/);
});

test('announcement stops exactly at November 1 Bangkok without changing monetary eligibility',()=>{
  assert.equal(isPrivateCareBackAnnouncementVisible('2026-10-31T23:59:59.999+07:00'),true);
  assert.equal(isPrivateCareBackAnnouncementVisible('2026-11-01T00:00:00+07:00'),false);
  assert.equal(isPrivateCareBackAnnouncementVisible('2026-12-31T23:59:59.999+07:00'),false);
  assert.equal(isPrivateCareBackAnnouncementVisible('2026-07-31T23:59:59.999+07:00'),false);
  assert.equal(isPrivateCareBackAnnouncementVisible('invalid'),false);
  assert.equal(isPrivateCareBackAnnouncementVisible(null),false);
});

for(const [code,years,days] of [['premium',1,0],['standard',0,180]]) {
  test(`${code}: November and the final December millisecond remain eligible for canonical CARE BACK`,()=>{
    for(const time of ['2026-11-01T00:00:00+07:00','2026-12-15T12:00:00+07:00','2026-12-31T23:59:59.999+07:00']) {
      const promo=promotionAt(time,code);
      assert.ok(promo); assert.equal(promo.bonus_years,years); assert.equal(promo.bonus_days,days);
      assert.equal(promo.ends_before,'2026-11-01T00:00:00+07:00');
      assert.equal(promo.honored_before,'2027-01-01T00:00:00+07:00');
    }
    assert.equal(promotionAt('2027-01-01T00:00:00+07:00',code),null);
  });
}

test('ordinary Premium signup is exactly two years and does not add a renewal bonus',()=>{
  const promo=promotionAt('2026-10-25T12:00:00+07:00','premium','signup');
  assert.equal(promo.total_years,2); assert.equal(promo.bonus_years,0); assert.equal(promo.bonus_days,0);
  const start='2026-10-25T05:00:00.000Z';
  assert.equal(applyMembershipPromotion(new Date('2028-10-25T05:00:00.000Z'),promo,{start_at:start}).toISOString(),'2028-10-25T05:00:00.000Z');
});

test('Premium renewal keeps one purchased year plus one CARE BACK year, not three',()=>{
  assert.equal(privateRenewalBaseYears('premium'),1);
  const expiry='2027-02-28T16:59:59.999Z';
  const base=addBangkokCalendarYears(new Date(expiry),1);
  const extended=applyMembershipPromotion(base,promotionAt('2026-12-31T23:59:59.999+07:00'),{start_at:expiry});
  assert.equal(extended.toISOString(),'2029-02-28T16:59:59.999Z');
});

test('customer markup advertises October only and does not leak internal year-end window',()=>{
  const html=renewalViewHtml(new Date('2026-10-25T13:00:00+07:00'));
  assert.match(html,/CARE BACK MEMBERSHIP/); assert.match(html,/รอบประชาสัมพันธ์ถึง 31 ต.ค. 2569/);
  assert.match(html,/Standard เพิ่ม 180 วัน · Premium เพิ่ม 1 ปี เมื่อผ่านเงื่อนไข/);
  assert.doesNotMatch(html,/31 ธ.ค.|สิ้นปี|2027-01-01|honored_before|5 วันสุดท้าย/);
  const november=renewalViewHtml(new Date('2026-11-01T00:00:00+07:00'));
  assert.doesNotMatch(november,/<aside class="rn-campaign"/);
  assert.match(november,/สมัครใหม่ 2,999 บาท \/ 2 ปี/);
});

test('wish coupon entry goes to existing Care view, never applies a membership discount',()=>{
  const html=renewalViewHtml(new Date('2026-10-25T13:00:00+07:00'));
  assert.match(html,/class="rn-coupon-entry" data-view="care"/);
  assert.match(html,/คูปองค่าบริการสูงสุด 10%/);
  assert.match(html,/คูปองค่าบริการแยกจากค่าสมัครและค่าต่ออายุสมาชิก/);
  assert.doesNotMatch(html,/฿799|฿1,999/);
});

test('verified Premium quote shows base, bonus and two-year total separately with unchanged 2,500 due',()=>{
  const d=render();
  assert.equal(d.get('rn-selection').textContent,'Premium · 1 ปี + 1 ปี');
  const rows=d.get('renewal-rows').children.map(r=>r.children.map(c=>c.textContent).join(':'));
  assert.ok(rows.includes('ระยะต่ออายุพื้นฐาน:1 ปี'));
  assert.ok(rows.includes('CARE BACK เพิ่ม:1 ปี'));
  assert.match(d.get('renewal-promo').textContent,/รวมระยะสมาชิก 2 ปี/);
  assert.equal(d.get('renewal-amount').textContent,'฿2,500');
  assert.equal(d.get('renewal-action').disabled,false);
});

test('verified Standard quote shows 1 year plus 180 days, without promising two years',()=>{
  const d=render('standard');
  assert.equal(d.get('rn-selection').textContent,'Standard · 1 ปี + 180 วัน');
  assert.equal(d.get('renewal-amount').textContent,'฿1,000');
  assert.doesNotMatch(d.get('renewal-promo').textContent,/รวมระยะสมาชิก 2 ปี/);
});

test('no bonus in an approved offer means no promotional total is fabricated',()=>{
  const d=render('premium',{bonus_years:0,bonus_days:0,promotion_label:''});
  assert.equal(d.get('rn-selection').textContent,'Premium · ต่ออายุ 1 ปี');
  assert.equal(d.get('renewal-promo').hidden,true);
  assert.equal(d.get('renewal-rows').children.some(r=>r.children[0].textContent==='CARE BACK เพิ่ม'),false);
});

test('unknown history still blocks payment and hides personal bonus',()=>{
  const d=render('premium',{status:'contact_owner',payment_available:false,history_status:'checking',service_spend_365_thb:null,reason:'history_pending'});
  assert.equal(d.get('renewal-action').disabled,true);
  assert.equal(d.get('renewal-amount').textContent,'—');
  assert.equal(d.get('renewal-promo').hidden,true);
});

test('announcement helper is never referenced by payment or benefit calculation functions',()=>{
  assert.doesNotMatch(currentPrivateMembershipPromotion.toString(),/isPrivateCareBackAnnouncementVisible/);
  assert.doesNotMatch(applyMembershipPromotion.toString(),/isPrivateCareBackAnnouncementVisible/);
  assert.doesNotMatch(createRenewalView.toString(),/isPrivateCareBackAnnouncementVisible|honored_before/);
  new Function('return ('+createRenewalView.toString()+')');
});
