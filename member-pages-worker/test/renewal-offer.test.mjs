import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalRenewalPackageFromTier,
  renewalPriceForSpend,
  resolveCanonicalRenewalOffer,
} from "../src/renewal-offer.js";

test("Standard compatibility quote never revives retired spend-band prices", () => {
  for (const spend of [0, 9999.99, 10000, 49999.99, 50000, 1000000]) {
    const quote = renewalPriceForSpend("standard", spend);
    assert.equal(quote.amount_thb, 1000);
    assert.equal(quote.price_rule, "private_standard_renewal");
    assert.equal(quote.membership_years, 1);
  }
});

test("Premium compatibility quote never revives retired spend-band prices", () => {
  for (const spend of [0, 19999.99, 20000, 99999.99, 100000, 1000000]) {
    const quote = renewalPriceForSpend("premium", spend);
    assert.equal(quote.amount_thb, 2500);
    assert.equal(quote.price_rule, "private_premium_renewal");
    assert.equal(quote.membership_years, 1);
  }
});

test("compatibility quote does not imply verified eligibility for a zero or unknown history", () => {
  for (const spend of [undefined, null, NaN, Infinity, -1, 0]) {
    const quote = renewalPriceForSpend("standard", spend);
    assert.equal(quote.amount_thb, 1000);
    assert.equal(quote.service_spend_365_thb, 0);
    assert.equal(Object.hasOwn(quote, "discount_verified"), false);
    assert.equal(Object.hasOwn(quote, "history_status"), false);
  }
  assert.equal(renewalPriceForSpend("unknown", 100000), null);
});

test("renewal package is fixed by the verified current private tier", () => {
  assert.equal(canonicalRenewalPackageFromTier("Standard"), "standard");
  assert.equal(canonicalRenewalPackageFromTier("Premium"), "premium");
  assert.equal(canonicalRenewalPackageFromTier("VIP"), "");
});

test("unknown expiry cannot use an injected price resolver to create a quote", async () => {
  const session = {
    liff_intent: "renew",
    member_exists: true,
    line_user_id: "U1234567890abcdef1234567890abcdef",
    member_profile: { tier: "Premium" },
  };
  const env = {
    RENEWAL_OFFER_RESOLVER: {
      async resolve(input) {
        assert.equal(input.package_code, "premium");
        return {
          status: "ready",
          package_code: "premium",
          amount_thb: 1999,
          service_spend_365_thb: 25000,
          price_rule: "private_premium_spend_20000",
          membership_years: 2,
          history_status: "verified",
          discount_verified: true,
        };
      },
    },
  };
  const offer = await resolveCanonicalRenewalOffer(env, session, new Date("2026-09-15T00:00:00.000Z"));
  assert.equal(offer.status, "review_required");
  assert.equal(offer.reason, "canonical_expiry_required");
});

test("unsupported private tier never silently selects a renewal package", async () => {
  const offer = await resolveCanonicalRenewalOffer({}, {
    liff_intent: "renew",
    member_exists: true,
    line_user_id: "U1234567890abcdef1234567890abcdef",
    member_profile: { tier: "VIP" },
  });
  assert.equal(offer.status, "review_required");
  assert.equal(offer.reason, "renewal_current_package_not_supported");
});

test('active (advance) renewal uses the approved fixed price, ignores spend estimates and starts from the future expiry',async()=>{
 for(const [tier,price,rule] of [['Standard',1000,'active_advance_standard'],['Premium',2500,'active_advance_premium']]) {
  const session={liff_intent:'renew',member_exists:true,line_user_id:'U'+'a'.repeat(32),member_profile:{tier,membership_expires_at:'2027-03-01T00:00:00Z'}};
  const env={RENEWAL_OFFER_RESOLVER:{resolve:async()=>({status:'ready',package_code:tier.toLowerCase(),amount_thb:799,service_spend_365_thb:10000})}};
  const offer=await resolveCanonicalRenewalOffer(env,session,new Date('2026-10-12T03:00:00Z'));
  assert.equal(offer.status,'ready');assert.equal(offer.amount_thb,price);assert.equal(offer.price_rule,rule);
  assert.equal(offer.membership_start_at,'2027-03-01T00:00:00.000Z');assert.equal(offer.promotion_requires_verified_payment,true);
  assert.ok(offer.promotion,'promo applies to advance renewal paid inside the promo window');
  assert.equal((await resolveCanonicalRenewalOffer(env,session,new Date('2027-01-05T00:00:00Z'))).promotion,null,'no promo after the honored window');
 }
});
test('exact expiry anniversary and older require separate policy review',async()=>{
  const session={liff_intent:'renew',member_exists:true,line_user_id:'U'+'a'.repeat(32),member_profile:{tier:'Standard',membership_expires_at:'2025-10-02T00:00:00Z'}};
  const env={RENEWAL_OFFER_RESOLVER:{resolve:async()=>({status:'ready',package_code:'standard',amount_thb:1000})}};
  assert.equal((await resolveCanonicalRenewalOffer(env,session,new Date('2026-10-02T00:00:00Z'))).status,'review_required');
  const past=await resolveCanonicalRenewalOffer(env,session,new Date('2026-10-02T00:00:00.001Z'));assert.equal(past.reason,'renewal_expired_over_90_days_review_required');assert.equal(past.status,'review_required');
});

test('expired within 90 days uses approved fixed price and keeps base term separate',async()=>{
 for(const [tier,price,years,bonus] of [['Standard',1000,1,180],['Premium',2500,1,1]]) {
 const session={liff_intent:'renew',member_exists:true,line_user_id:'U'+'a'.repeat(32),member_profile:{tier,membership_expires_at:'2026-10-01T00:00:00Z'}};
 const offer=await resolveCanonicalRenewalOffer({},session,new Date('2026-10-31T16:59:59Z'));
 assert.equal(offer.status,'ready');assert.equal(offer.amount_thb,price);assert.equal(offer.membership_years,years);assert.equal(offer.promotion[tier==='Standard'?'bonus_days':'bonus_years'],bonus);assert.equal(offer.promotion_requires_verified_payment,true);
 assert.equal((await resolveCanonicalRenewalOffer({},session,new Date('2026-12-31T17:00:00Z'))).status,'review_required');
 }
});

test('Premium renewal is one purchased year plus the promo year (two years total), never three', async()=>{
  const session={liff_intent:'renew',member_exists:true,line_user_id:'U'+'a'.repeat(32),member_profile:{tier:'Premium',membership_expires_at:'2027-03-01T00:00:00Z'}};
  const offer=await resolveCanonicalRenewalOffer({},session,new Date('2026-10-12T03:00:00Z'));
  assert.equal(offer.membership_years,1);assert.equal(offer.promotion.bonus_years,1);
});
