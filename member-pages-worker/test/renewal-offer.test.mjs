import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalRenewalPackageFromTier,
  renewalPriceForSpend,
  resolveCanonicalRenewalOffer,
} from "../src/renewal-offer.js";

test("renewal pricing follows verified Standard spend bands", () => {
  assert.equal(renewalPriceForSpend("standard", 0).amount_thb, 1000);
  assert.equal(renewalPriceForSpend("standard", 9999.99).amount_thb, 1000);
  assert.equal(renewalPriceForSpend("standard", 10000).amount_thb, 799);
  assert.equal(renewalPriceForSpend("standard", 49999.99).amount_thb, 799);
  assert.equal(renewalPriceForSpend("standard", 50000).amount_thb, 499);
});

test("renewal pricing follows verified Premium spend bands and keeps two-year term", () => {
  assert.equal(renewalPriceForSpend("premium", 0).amount_thb, 2500);
  assert.equal(renewalPriceForSpend("premium", 19999.99).amount_thb, 2500);
  assert.equal(renewalPriceForSpend("premium", 20000).amount_thb, 1999);
  assert.equal(renewalPriceForSpend("premium", 99999.99).amount_thb, 1999);
  const top = renewalPriceForSpend("premium", 100000);
  assert.equal(top.amount_thb, 999);
  assert.equal(top.membership_years, 2);
});

test("renewal package is fixed by the verified current private tier", () => {
  assert.equal(canonicalRenewalPackageFromTier("Standard"), "standard");
  assert.equal(canonicalRenewalPackageFromTier("Premium"), "premium");
  assert.equal(canonicalRenewalPackageFromTier("VIP"), "");
});

test("renewal offer can use a bounded test resolver without browser pricing authority", async () => {
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
  assert.equal(offer.status, "ready");
  assert.equal(offer.package_code, "premium");
  assert.equal(offer.amount_thb, 1999);
  assert.equal(offer.price_rule, "private_premium_spend_20000");
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
