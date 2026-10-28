import test from "node:test";
import assert from "node:assert/strict";
import { fixedTierExpiry } from "./src/fixed-tier-expiry.js";

const NOW = new Date("2026-10-11T12:00:00Z");
const m = (o) => ({ level: "svip", levelVerified: true, status: "active", ...o });

test("verified VIP has a fixed expiry and SVIP has no expiry", () => {
 assert.deepEqual(fixedTierExpiry(m({level:"vip"}),NOW),{expiresAt:"2027-08-31",lifecycle:"active"});
 assert.deepEqual(fixedTierExpiry(m(),NOW),{expiresAt:null,lifecycle:"active"});
});
test("expired or checking status is still covered", () => {
  assert.equal(fixedTierExpiry(m({level:"vip", status: "expired" }), NOW).expiresAt, "2027-08-31");
  assert.equal(fixedTierExpiry(m({level:"vip", status: "checking" }), NOW).expiresAt, "2027-08-31");
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
test("VIP expires at end of Bangkok day; SVIP remains lifetime", () => {
 assert.equal(fixedTierExpiry(m({level:"vip"}),new Date("2027-08-31T16:59:59.999Z")).lifecycle,"active");
 assert.deepEqual(fixedTierExpiry(m({level:"vip"}),new Date("2027-08-31T17:00:00Z")),{expiresAt:"2027-08-31",lifecycle:"expired"});
 assert.deepEqual(fixedTierExpiry(m(),new Date("2030-01-01")),{expiresAt:null,lifecycle:"active"});
});
