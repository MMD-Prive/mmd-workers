import test from "node:test";
import assert from "node:assert/strict";
import { assertCampaignActive, buildBenefitPlan, classifyEligibility, internalConsiderations,
  resolveMembershipPrice, resolveUpgradePrice, validateApprovedMonths } from "../src/policy.js";

const history = [{ tier: "standard", verified: true }];
const base = { membershipTier: "standard", membershipHistory: history };

test("five eligibility statuses and 90/91/365/366 boundaries", () => {
  assert.equal(classifyEligibility({ ...base, membershipEndAt: "2026-08-01" }).status, "current_member");
  assert.equal(classifyEligibility({ ...base, membershipEndAt: "2026-05-03" }).status, "recently_expired");
  assert.equal(classifyEligibility({ ...base, membershipEndAt: "2026-05-02" }).status, "inactive_expired");
  assert.equal(classifyEligibility({ ...base, membershipEndAt: "2025-08-01" }).status, "inactive_expired");
  assert.equal(classifyEligibility({ ...base, membershipEndAt: "2025-07-31" }).status, "former_member");
  assert.equal(classifyEligibility({ membershipHistory: [] }).status, "new_member");
});

test("special, missing expiry, and conflicting history never guess", () => {
  for (const membershipTier of ["vip", "svip", "blackcard"]) {
    assert.equal(classifyEligibility({ ...base, membershipTier, membershipEndAt: "2027-01-01" }).status, "manual_review");
  }
  assert.equal(classifyEligibility({ membershipHistory: history }).status, "manual_review");
  assert.equal(classifyEligibility({ ...base, membershipEndAt: "2026-01-01", conflictingHistory: true }).status, "manual_review");
});

test("campaign Bangkok window is inclusive and outside fails", () => {
  assert.throws(() => assertCampaignActive("2026-07-31T16:59:59.999Z"), /campaign_not_started/);
  assert.equal(assertCampaignActive("2026-07-31T17:00:00.000Z"), true);
  assert.equal(assertCampaignActive("2026-08-31T16:59:59.999Z"), true);
  assert.throws(() => assertCampaignActive("2026-08-31T17:00:00.000Z"), /campaign_ended/);
});

test("month approval is fixed for current and bounded for returning", () => {
  const current = classifyEligibility({ ...base, membershipEndAt: "2026-12-01" });
  assert.equal(validateApprovedMonths(current), 6);
  assert.throws(() => validateApprovedMonths(current, 5), /current_member_months_fixed/);
  const recent = classifyEligibility({ ...base, membershipEndAt: "2026-07-01" });
  assert.equal(validateApprovedMonths(recent, 4), 4);
  assert.throws(() => validateApprovedMonths(recent, 5), /approved_months_out_of_range/);
});

test("membership prices use exact thresholds and no Premium 999", () => {
  assert.equal(resolveMembershipPrice({ tier: "premium", mode: "new" }).amountThb, 2999);
  assert.equal(resolveMembershipPrice({ tier: "premium", mode: "renewal", verifiedSpend365: 19999 }).amountThb, 2500);
  assert.equal(resolveMembershipPrice({ tier: "premium", mode: "renewal", verifiedSpend365: 20000 }).amountThb, 1999);
  assert.equal(resolveMembershipPrice({ tier: "standard", mode: "renewal", verifiedSpend365: 9999 }).amountThb, 1000);
  assert.equal(resolveMembershipPrice({ tier: "standard", mode: "renewal", verifiedSpend365: 10000 }).amountThb, 799);
  assert.equal(resolveMembershipPrice({ tier: "standard", mode: "renewal", verifiedSpend365: 50000 }).amountThb, 499);
  const amounts = [resolveMembershipPrice({ tier: "premium", mode: "new" }), resolveMembershipPrice({ tier: "premium", mode: "renewal" })].map(x => x.amountThb);
  assert.equal(amounts.includes(999), false);
});

test("Guest and Standard upgrade windows use verified start date", () => {
  assert.equal(resolveUpgradePrice({ fromTier: "guest-pass", verifiedPackageStartAt: "2026-08-01", upgradeAt: "2026-08-08" }).amountThb, 1500);
  assert.equal(resolveUpgradePrice({ fromTier: "guest-pass", verifiedPackageStartAt: "2026-08-01", upgradeAt: "2026-08-09" }).amountThb, 2000);
  assert.equal(resolveUpgradePrice({ fromTier: "guest-pass", verifiedPackageStartAt: "2026-08-01", upgradeAt: "2026-11-02" }).amountThb, 2999);
  assert.equal(resolveUpgradePrice({ fromTier: "standard", verifiedPackageStartAt: "2026-01-31", upgradeAt: "2026-02-14" }).amountThb, 1800);
  assert.equal(resolveUpgradePrice({ fromTier: "standard", verifiedPackageStartAt: "2026-01-31", upgradeAt: "2026-02-15" }).amountThb, 2000);
  assert.equal(resolveUpgradePrice({ fromTier: "standard", verifiedPackageStartAt: "2026-01-31", upgradeAt: "2026-08-01" }).amountThb, 2999);
});

test("benefits use separate identity campaign keys and upgrade adds no points", () => {
  const plan = buildBenefitPlan({ claimId: "claim-1", identityHash: "a".repeat(64), claimStatus: "benefit_approved",
    approvedMonths: 6, pointsAward: 300, paymentRequired: false, effectiveAt: "2026-08-01T00:00:00Z",
    membershipEndSnapshot: "2026-12-31", membershipTier: "standard", upgradeApplied: true });
  assert.deepEqual(plan.map(x => x.benefitType), ["membership_extension", "membership_upgrade", "anniversary_points"]);
  assert.equal(plan[0].payload.tier, "premium");
  assert.equal(new Set(plan.map(x => x.idempotencyKey)).size, 3);
  assert.equal(plan.filter(x => x.benefitType === "anniversary_points").length, 1);
});

test("payment gates and internal-only considerations", () => {
  assert.throws(() => buildBenefitPlan({ claimId:"c",identityHash:"a".repeat(64),claimStatus:"benefit_approved",approvedMonths:2,
    pointsAward:200,paymentRequired:true,paymentVerified:false,effectiveAt:"2026-08-01" }), /verified_payment_required/);
  assert.deepEqual(internalConsiderations({ verifiedSpend365: 120000, verifiedLifetimeServiceSpend: 50000, hasVerifiedMembershipHistory: true }), ["vip_consideration"]);
  assert.deepEqual(internalConsiderations({ verifiedLifetimeServiceSpend: 50001, hasVerifiedMembershipHistory: true }), ["blackcard_private_consideration"]);
});

test("final Points are 300 current, 200 returning, and 66 new",()=>{
  assert.equal(classifyEligibility({...base,membershipEndAt:"2026-12-01"}).pointsAward,300);
  assert.equal(classifyEligibility({...base,membershipEndAt:"2026-07-01"}).pointsAward,200);
  assert.equal(classifyEligibility({membershipHistory:[]}).pointsAward,66);
});
