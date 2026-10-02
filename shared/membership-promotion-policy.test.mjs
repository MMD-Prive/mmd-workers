import assert from "node:assert/strict";
import test from "node:test";

import { applyMembershipPromotion, currentPrivateMembershipPromotion } from "./membership-promotion-policy.mjs";

test("CARE BACK applies from August 2026 only to Private Standard and Premium", () => {
  assert.equal(currentPrivateMembershipPromotion({ package_code: "standard", verified_at: "2026-07-31T16:59:59.999Z", action: "renewal" }), null);
  assert.equal(currentPrivateMembershipPromotion({ package_code: "mmd_member", verified_at: "2026-09-17T00:00:00.000Z", action: "signup" }), null);
  assert.equal(currentPrivateMembershipPromotion({ package_code: "standard", verified_at: "2026-09-17T00:00:00.000Z", action: "renewal" }).bonus_days, 180);
  assert.equal(currentPrivateMembershipPromotion({ package_code: "premium", verified_at: "2026-09-17T00:00:00.000Z", action: "renewal" }).bonus_years, 1);
});

test("CARE BACK promotion preserves calendar semantics", () => {
  const standard = currentPrivateMembershipPromotion({ package_code: "standard", verified_at: "2026-09-17T00:00:00.000Z", action: "signup" });
  const premium = currentPrivateMembershipPromotion({ package_code: "premium", verified_at: "2026-09-17T00:00:00.000Z", action: "signup" });
  assert.equal(applyMembershipPromotion("2027-09-17T00:00:00.000Z", standard).toISOString(), "2028-03-15T00:00:00.000Z");
  assert.equal(applyMembershipPromotion("2028-02-29T00:00:00.000Z", premium).toISOString(), "2029-02-28T00:00:00.000Z");
});

test('existing Private renewals have two years from the real renewal/expiry anchor, never August 1',()=>{
  for(const code of ['standard','premium']) {
    const promotion=currentPrivateMembershipPromotion({package_code:code,verified_at:'2026-10-02T00:00:00Z',action:'renewal',existing_member:true});
    assert.equal(promotion.total_years,2);
    assert.equal(applyMembershipPromotion('2035-01-01',promotion,{start_at:'2026-12-31T00:00:00Z'}).toISOString(),'2028-12-31T00:00:00.000Z');
    assert.equal(applyMembershipPromotion('2035-01-01',promotion),null);
  }
  for(const code of ['vip','svip','black_card']) assert.equal(currentPrivateMembershipPromotion({package_code:code,verified_at:'2026-10-02',existing_member:true}),null);
  assert.equal(currentPrivateMembershipPromotion({package_code:'standard',verified_at:'2026-07-01',existing_member:true}),null);
});
test('two-year renewal retains leap-day calendar semantics',()=>{const policy=currentPrivateMembershipPromotion({package_code:'standard',verified_at:'2028-02-29T10:00:00Z',existing_member:true,action:'renewal'});assert.equal(applyMembershipPromotion('2029-02-28T10:00:00Z',policy,{start_at:'2028-02-29T10:00:00Z'}).toISOString(),'2030-02-28T10:00:00.000Z');});
