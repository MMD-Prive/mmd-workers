import test from "node:test";
import assert from "node:assert/strict";
import { fixedTierExpiry } from "./src/fixed-tier-expiry.js";

const NOW = new Date("2026-10-11T12:00:00Z");
const m = (o) => ({ level: "svip", levelVerified: true, status: "active", ...o });

test("verified SVIP and VIP get 31 Jul 2028 and active lifecycle", () => {
  for (const level of ["svip", "vip"]) {
    assert.deepEqual(fixedTierExpiry(m({ level }), NOW), { expiresAt: "2028-07-31", lifecycle: "active" });
  }
});
test("expired or checking status is still covered", () => {
  assert.equal(fixedTierExpiry(m({ status: "expired" }), NOW).expiresAt, "2028-07-31");
  assert.equal(fixedTierExpiry(m({ status: "checking" }), NOW).expiresAt, "2028-07-31");
});
test("unverified or display-only tier never qualifies", () => {
  assert.equal(fixedTierExpiry(m({ levelVerified: false }), NOW), null);
  assert.equal(fixedTierExpiry(null, NOW), null);
});
test("other tiers do not qualify", () => {
  for (const level of ["premium", "black_card", "red_card", "unknown", "guest"]) {
    assert.equal(fixedTierExpiry(m({ level }), NOW), null);
  }
});
test("blocked, suspended, revoked, pending_review are never overridden", () => {
  for (const status of ["blocked", "suspended", "revoked", "pending_review"]) {
    assert.equal(fixedTierExpiry(m({ status }), NOW), null);
  }
});
test("rule ends after 31 Jul 2028", () => {
  assert.equal(fixedTierExpiry(m(), new Date("2028-07-31T16:00:00Z")).expiresAt, "2028-07-31");
  assert.equal(fixedTierExpiry(m(), new Date("2028-08-01T00:00:00Z")), null);
});
