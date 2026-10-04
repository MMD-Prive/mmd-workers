import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { projectKenjiRenewalPromotion, readKenjiCareBackCoupon } from "../src/kenji-member-benefits.js";

const now = new Date("2026-10-04T08:00:00Z");
const uid = `U${"a".repeat(32)}`;
for (const level of ["private_standard", "private_premium"]) {
  for (const [lifecycle, expire_at] of [["active", "2028-01-01"], ["grace", "2026-10-01"], ["expired", "2025-10-05T08:00:00Z"]]) {
    test(`${level} ${lifecycle} receives only a conditional approved renewal promotion`, () => {
      const result = projectKenjiRenewalPromotion({ level, lifecycle, expire_at }, now);
      assert.equal(result.status, "conditional_eligible"); assert.equal(result.requires_verified_payment, true);
      assert.equal(result.total_years, 2); assert.equal(result.base_years, 1); assert.equal(result.promotion_years, 1);
      assert.equal(result.checkout_status, "review_required");
      assert.equal(result.starts_from, lifecycle === "active" ? "existing_expiry" : "verified_renewal_time");
    });
  }
}
for (const expire_at of ["2025-10-04T08:00:00Z", "2025-10-03T08:00:00Z"]) test(`exactly one calendar year or older ${expire_at} is excluded`, () => {
  assert.equal(projectKenjiRenewalPromotion({ level: "private_premium", lifecycle: "expired", expire_at }, now).status, "not_applicable");
});
for (const level of ["vip", "svip", "black_card", "public_member"]) test(`${level} has no inferred Standard/Premium promo`, () => {
  assert.equal(projectKenjiRenewalPromotion({ level, lifecycle: "active", expire_at: "2028-01-01" }, now).status, "not_applicable");
});
test("blocked, missing expiry and Bangkok campaign cutoff do not promise benefits", () => {
  const membership = { level: "private_premium", lifecycle: "active", expire_at: "2028-01-01" };
  assert.equal(projectKenjiRenewalPromotion({ ...membership, member_blocked: true }, now).status, "not_applicable");
  assert.equal(projectKenjiRenewalPromotion({ ...membership, expire_at: "" }, now).status, "review_required");
  assert.equal(projectKenjiRenewalPromotion(membership, new Date("2026-10-31T17:00:00Z")).status, "not_applicable");
});
test("ordinary wallet uses existing LIFF HMAC and strict canonical member with no issuing call", async () => {
  const secret = "fixture-only-secret".repeat(3); let calls = 0;
  const env = { LIFF_SESSION_SECRET: secret, CARE_BACK_STORE: {
    openOrResume() { throw new Error("no mutation allowed"); },
    readCouponWallet: async input => { calls++; assert.equal(input.memberId, "fixture-member"); assert.equal(input.identityHash, createHmac("sha256", secret).update(`identity:${uid}`).digest("hex")); return { status: "ready", approved_discount_percent: 10, expires_at: "2099-01-01" }; },
  } };
  const coupon = await readKenjiCareBackCoupon(env, uid, "fixture-member");
  assert.equal(calls, 1); assert.equal(coupon.status, "ready"); assert.equal(coupon.approved_discount_percent, 10);
  assert.equal(coupon.code, undefined); assert.equal(coupon.identityHash, undefined);
});
test("issued recovery follows exact UID and linked approved promo using GET only", async () => {
  const reads = [];
  const env = { AIRTABLE_API_KEY: "fixture-only", AIRTABLE_BASE_ID: "fixture-base", AIRTABLE_HTTP: { fetch: async request => {
    assert.equal(request.method, "GET"); const url = new URL(request.url); reads.push(url);
    if (url.pathname.includes("Recovery")) { assert.match(url.searchParams.get("filterByFormula"), new RegExp(uid)); return Response.json({ records: [{ id: "fixture-recovery", fields: { line_user_id: uid, coupon_code: "ABC234", "Promo Code": ["rec1234567890abcd"] } }] }); }
    return Response.json({ id: "rec1234567890abcd", fields: { code: "ABC234", campaign_code: "6-years-care-back", status: "active", used_count: 0, approved_discount_percent: 5, expires_at: "2099-01-01" } });
  } } };
  const result = await readKenjiCareBackCoupon(env, uid, "fixture-member");
  assert.equal(reads.length, 2); assert.equal(result.status, "ready"); assert.equal(result.approved_discount_percent, 5);
  assert.equal(result.expires_at, "2099-01-01T00:00:00.000Z");
});
for (const wallet of [{ status: "used", approved_discount_percent: 10 }, { status: "expired", approved_discount_percent: 10 }, { status: "ready", approved_discount_percent: 30, expires_at: "2099-01-01" }, { status: "ready", approved_discount_percent: 10 }]) test(`coupon never invents benefit ${JSON.stringify(wallet)}`, async () => {
  const env = { LIFF_SESSION_SECRET: "fixture".repeat(8), CARE_BACK_STORE: { openOrResume() { throw new Error("no write"); }, readCouponWallet: async () => wallet } };
  assert.equal((await readKenjiCareBackCoupon(env, uid, "fixture-member")).approved_discount_percent, null);
});
test("ambiguous recovery or wrong owner is unavailable, never fallback to another coupon", async () => {
  for (const records of [[{ fields: { line_user_id: `U${"b".repeat(32)}`, coupon_code: "ABC234", "Promo Code": ["rec1234567890abcd"] } }], [{}, {}]]) {
    const env = { AIRTABLE_API_KEY: "fixture", AIRTABLE_BASE_ID: "fixture", AIRTABLE_HTTP: { fetch: async request => request.url.includes("Recovery") ? Response.json({ records }) : Response.json({ id: "rec1234567890abcd", fields: { code: "ABC234", campaign_code: "6-years-care-back", status: "active", expires_at: "2099-01-01" } }) } };
    assert.equal((await readKenjiCareBackCoupon(env, uid, "fixture-member")).status, "unavailable");
  }
});
