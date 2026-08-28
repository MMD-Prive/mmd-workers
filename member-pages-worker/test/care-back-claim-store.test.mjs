import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { deriveClaimAndCode, getCareBackStore } from "../src/care-back-claim-store.js";

const realFetch = globalThis.fetch;
const IDENTITY = "a".repeat(64);
const SECRET = "test-only-liff-session-secret-1234567890";
const BIRTHDAY_NOW = new Date("2026-08-19T00:00:00.000Z");

afterEach(() => { globalThis.fetch = realFetch; });

function env() {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app_test",
    LIFF_SESSION_SECRET: SECRET,
  };
}

test("CARE BACK verification creates a current-member claim but no Promo Code before the Birthday Wish gate", async () => {
  const writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").at(-1));
    if ((init.method || "GET") === "GET") return Response.json({ records: [] });
    const body = JSON.parse(init.body);
    const fields = body.records[0].fields;
    writes.push({ table, fields });
    return Response.json({ records: [{ id: `rec_${writes.length}`, fields }] });
  };

  const result = await getCareBackStore(env()).openOrResume({
    identityHash: IDENTITY,
    memberId: "MMD-PER-01",
    memberProfile: { membership_status: "active", tier: "Premium" },
    now: BIRTHDAY_NOW,
  });

  assert.equal(writes.length, 2);
  assert.equal(writes[0].table, "MMD — Campaign Claims");
  assert.equal(writes[0].fields.campaign_id, "6-years-care-back");
  assert.equal(writes[0].fields.line_user_id_hash, IDENTITY);
  assert.equal(writes[0].fields.match_status, "matched");
  assert.equal(writes[0].fields.classification_group, "current_member");
  assert.equal(writes[0].fields.review_status, "not_required");
  assert.equal(writes[0].fields.claim_status, "benefit_approved");
  assert.equal(writes.some((write) => write.table === "MMD — Promo Codes"), false);
  assert.equal(writes[1].table, "MMD — Campaign Benefit Applications");
  assert.equal(writes[1].fields.benefit_type, "membership_extension");
  assert.equal(writes[1].fields.status, "pending");
  assert.match(writes[1].fields.idempotency_key, /^6-years-care-back:CB6-2026-[A-F0-9]+:membership_extension$/);
  assert.equal(result.personal_code, "");
  assert.equal(result.code_status, "draft");
  assert.equal(result.coupon_state, "wish_required");
  assert.equal(result.coupon_wallet.code, "");
  assert.equal(result.coupon_wallet.status, "wish_required");
  assert.equal(result.discount_percent, 0);
  assert.equal(result.membership_benefit.days, 180);
  assert.equal(result.review_status, "not_required");
  assert.equal(result.campaign_phase, "birthday");
  assert.equal(result.resumed, false);
  assert.deepEqual(result.points_policy, {
    reconciliation_state: "pending",
    rate_thb_per_point: 100,
    renewal_bonus_points: 0,
    renewal_bonus_state: "not_offered",
  });
  assert.doesNotMatch(JSON.stringify(writes), /raw-token|session-secret|test-only-liff/i);
});

test("CARE BACK activates a 10 percent personal coupon only after the Birthday Wish is saved", async () => {
  const writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").at(-1));
    if ((init.method || "GET") === "GET") return Response.json({ records: [] });
    const fields = JSON.parse(init.body).records[0].fields;
    writes.push({ table, fields });
    return Response.json({ records: [{ id: `rec${"D".repeat(14)}`, fields }] });
  };

  const result = await getCareBackStore(env()).openOrResume({
    identityHash: IDENTITY,
    memberId: "MMD-PER-01",
    memberProfile: { membership_status: "active", tier: "Premium" },
    wishSubmitted: true,
    now: BIRTHDAY_NOW,
  });

  assert.equal(writes[1].fields.status, "active");
  assert.equal(writes[1].fields.benefit_value, 10);
  assert.ok(Date.parse(writes[1].fields.expires_at) > BIRTHDAY_NOW.getTime());
  assert.match(writes[1].fields.payload_json, /"wish_submitted":true/);
  assert.match(result.personal_code, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(result.code_status, "active");
  assert.equal(result.coupon_state, "ready");
  assert.equal(result.discount_percent, 10);
  assert.equal(result.coupon_wallet.code, result.personal_code);
  assert.equal(result.coupon_wallet.status, "ready");
});

test("CARE BACK deterministic identifiers make a verified retry resume the same claim and code", async () => {
  const derived = await deriveClaimAndCode(IDENTITY, SECRET);
  let writes = 0;
  const claimRecordId = `rec${"A".repeat(14)}`;
  const promoRecordId = `rec${"B".repeat(14)}`;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").at(-1));
    if ((init.method || "GET") !== "GET") { writes += 1; throw new Error("retry must not create records"); }
    if (table === "MMD — Campaign Claims") {
      return Response.json({ records: [{ id: claimRecordId, fields: {
        claim_id: derived.claimId,
        campaign_id: "6-years-care-back",
        line_user_id_hash: IDENTITY,
        matched_member_id: "MMD-PER-01",
        match_status: "matched",
        classification_group: "current_member",
        default_months: 6,
        payment_status: "not_required",
        payment_required: false,
        review_status: "not_required",
        claim_status: "benefit_approved",
        membership_tier_snapshot: "Premium",
      } }] });
    }
    if (table === "MMD — Promo Codes") return Response.json({ records: [{ id: promoRecordId, fields: {
      code: derived.code,
      campaign_code: "6-years-care-back",
      status: "active",
      expires_at: new Date(BIRTHDAY_NOW.getTime() + 60 * 60 * 1000).toISOString(),
      max_uses: 1,
      used_count: 0,
      package_scope: ["all"],
      benefit_type: "discount_percent",
        benefit_value: 10,
        payload_json: JSON.stringify({ schema_version: 2, claim_id: derived.claimId, policy_state: "ready", wish_submitted: true, coupon_policy: { benefit_type: "discount_percent", benefit_value: 10, validity_days: 30, single_use: true, eligible_service_only: true, requires_completed_birthday_wish: true, not_applicable_to: ["membership_fee", "renewal_fee", "tips", "payment_verification", "black_card_approval"] } }),
    } }] });
    return Response.json({ records: [{ id: `rec${"C".repeat(14)}`, fields: { idempotency_key: `6-years-care-back:${derived.claimId}:membership_extension` } }] });
  };

  const result = await getCareBackStore(env()).openOrResume({
    identityHash: IDENTITY,
    memberId: "MMD-PER-01",
    memberProfile: { membership_status: "active", tier: "Premium" },
    wishSubmitted: true,
    now: BIRTHDAY_NOW,
  });
  assert.equal(writes, 0);
  assert.equal(result.claim_reference, derived.claimId);
  assert.equal(result.personal_code, derived.code);
  assert.equal(result.resumed, true);
});

test("Coupon Wallet reads an issued coupon without creating or mutating campaign records", async () => {
  const derived = await deriveClaimAndCode(IDENTITY, SECRET);
  let writes = 0;
  globalThis.fetch = async (input, init = {}) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if ((init.method || "GET") !== "GET") { writes += 1; throw new Error("wallet must be read-only"); }
    if (table === "MMD — Campaign Claims") return Response.json({ records: [{ id: `rec${"W".repeat(14)}`, fields: {
      claim_id: derived.claimId,
      campaign_id: "6-years-care-back",
      line_user_id_hash: IDENTITY,
      matched_member_id: "MMD-PER-01",
    } }] });
    return Response.json({ records: [{ id: `rec${"X".repeat(14)}`, fields: {
      code: derived.code,
      campaign_code: "6-years-care-back",
      status: "active",
      expires_at: "2026-09-18T00:00:00.000Z",
      used_count: 0,
      benefit_type: "discount_percent",
      benefit_value: 10,
      payload_json: JSON.stringify({ claim_id: derived.claimId, wish_submitted: true }),
    } }] });
  };

  const wallet = await getCareBackStore(env()).readCouponWallet({
    identityHash: IDENTITY,
    memberId: "MMD-PER-01",
    now: BIRTHDAY_NOW,
  });

  assert.equal(writes, 0);
  assert.equal(wallet.status, "ready");
  assert.equal(wallet.code, derived.code);
  assert.equal(wallet.discount_percent, 10);
});

test("CARE BACK keeps an expired member coupon inactive until a verified renewal is recorded", async () => {
  const writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").at(-1));
    if ((init.method || "GET") === "GET") return Response.json({ records: [] });
    const body = JSON.parse(init.body);
    const fields = body.records[0].fields;
    writes.push({ table, fields });
    return Response.json({ records: [{ id: `rec${"E".repeat(14)}`, fields }] });
  };

  const result = await getCareBackStore(env()).openOrResume({
    identityHash: IDENTITY,
    memberId: "MMD-PER-01",
    memberProfile: { membership_status: "expired", tier: "Standard" },
    wishSubmitted: true,
    now: BIRTHDAY_NOW,
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].fields.classification_group, "inactive_expired");
  assert.equal(writes[0].fields.payment_required, true);
  assert.equal(writes[0].fields.claim_status, "payment_pending");
  assert.equal(writes.some((write) => write.table === "MMD — Promo Codes"), false);
  assert.equal(result.code_status, "draft");
  assert.equal(result.coupon_state, "renewal_required");
  assert.equal(result.membership_benefit.days, 90);
  assert.deepEqual(result.points_policy, {
    reconciliation_state: "pending",
    rate_thb_per_point: 100,
    renewal_bonus_points: 150,
    renewal_bonus_state: "renewal_required",
  });
});

test("CARE BACK does not issue a new-member coupon until both payment and review are verified", async () => {
  const derived = await deriveClaimAndCode(IDENTITY, SECRET);
  const writes = [];
  const claimFields = {
    claim_id: derived.claimId,
    campaign_id: "6-years-care-back",
    line_user_id_hash: IDENTITY,
    matched_member_id: "MMD-NEW-01",
    match_status: "matched",
    classification_group: "new_member",
    default_months: 6,
    membership_tier_snapshot: "Standard",
    payment_status: "verified",
    payment_required: true,
    review_status: "pending",
    claim_status: "manual_review",
    campaign_reference_date: BIRTHDAY_NOW.toISOString(),
  };
  globalThis.fetch = async (input, init = {}) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if ((init.method || "GET") === "GET") {
      return Response.json({ records: table === "MMD — Campaign Claims" ? [{ id: `rec${"N".repeat(14)}`, fields: claimFields }] : [] });
    }
    writes.push({ table, init });
    throw new Error("review-pending flow must not write a coupon");
  };

  const result = await getCareBackStore(env()).openOrResume({
    identityHash: IDENTITY,
    memberId: "MMD-NEW-01",
    memberProfile: { membership_status: "active", tier: "Standard" },
    wishSubmitted: true,
    now: BIRTHDAY_NOW,
  });

  assert.equal(writes.length, 0);
  assert.equal(result.personal_code, "");
  assert.equal(result.coupon_state, "verification_required");
  assert.equal(result.points_policy.renewal_bonus_points, 66);
  assert.equal(result.points_policy.renewal_bonus_state, "payment_required");
});

test("CARE BACK issues a new-member coupon after wish, payment, review, and membership activation all pass", async () => {
  const derived = await deriveClaimAndCode(IDENTITY, SECRET);
  const writes = [];
  const claimFields = {
    claim_id: derived.claimId,
    campaign_id: "6-years-care-back",
    line_user_id_hash: IDENTITY,
    matched_member_id: "MMD-NEW-02",
    match_status: "matched",
    classification_group: "new_member",
    default_months: 6,
    membership_tier_snapshot: "Standard",
    payment_status: "verified",
    payment_required: true,
    review_status: "approved",
    claim_status: "benefit_approved",
    campaign_reference_date: BIRTHDAY_NOW.toISOString(),
  };
  globalThis.fetch = async (input, init = {}) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if ((init.method || "GET") === "GET") {
      return Response.json({ records: table === "MMD — Campaign Claims" ? [{ id: `rec${"P".repeat(14)}`, fields: claimFields }] : [] });
    }
    const fields = JSON.parse(init.body).records[0].fields;
    writes.push({ table, fields });
    return Response.json({ records: [{ id: `rec${"Q".repeat(14)}`, fields }] });
  };

  const result = await getCareBackStore(env()).openOrResume({
    identityHash: IDENTITY,
    memberId: "MMD-NEW-02",
    memberProfile: { membership_status: "active", tier: "Standard" },
    wishSubmitted: true,
    now: BIRTHDAY_NOW,
  });

  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, "MMD — Promo Codes");
  assert.equal(writes[0].fields.status, "active");
  assert.equal(result.coupon_state, "ready");
  assert.equal(result.personalized_benefits.some((item) => item.type === "points_bonus" && item.value === 66), true);
});

test("CARE BACK fails closed if a deterministic code is already linked to another claim", async () => {
  const derived = await deriveClaimAndCode(IDENTITY, SECRET);
  globalThis.fetch = async (input) => {
    const table = decodeURIComponent(new URL(String(input)).pathname.split("/").at(-1));
    if (table === "MMD — Campaign Claims") {
      return Response.json({ records: [{ id: "rec_claim", fields: {
        claim_id: derived.claimId,
        campaign_id: "6-years-care-back",
        line_user_id_hash: IDENTITY,
        matched_member_id: "MMD-PER-01",
        match_status: "matched",
        classification_group: "current_member",
        default_months: 6,
        payment_status: "not_required",
        payment_required: false,
        review_status: "not_required",
        claim_status: "benefit_approved",
        membership_tier_snapshot: "Premium",
      } }] });
    }
    return Response.json({ records: [{ id: "rec_code", fields: {
      code: derived.code,
      campaign_code: "6-years-care-back",
      status: "draft",
      payload_json: JSON.stringify({ claim_id: "CB6-2026-DIFFERENT" }),
    } }] });
  };

  await assert.rejects(
    getCareBackStore(env()).openOrResume({
      identityHash: IDENTITY,
      memberId: "MMD-PER-01",
      memberProfile: { membership_status: "active", tier: "Premium" },
      now: BIRTHDAY_NOW,
    }),
    (error) => error?.code === "CARE_BACK_CODE_CONFLICT",
  );
});

test("CARE BACK allows a new claim in the September continuation window but closes new claims after it", async () => {
  const writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").at(-1));
    if ((init.method || "GET") === "GET") return Response.json({ records: [] });
    const fields = JSON.parse(init.body).records[0].fields;
    writes.push({ table, fields });
    return Response.json({ records: [{ id: `rec${"F".repeat(14)}`, fields }] });
  };

  const continuation = await getCareBackStore(env()).openOrResume({
    identityHash: IDENTITY,
    memberId: "MMD-PER-01",
    memberProfile: { membership_status: "active", tier: "Premium" },
    now: new Date("2026-09-15T00:00:00.000Z"),
  });
  assert.equal(continuation.campaign_phase, "continuation");
  assert.equal(writes[0].fields.payload_json.includes('"campaign_phase":"continuation"'), true);

  globalThis.fetch = async () => Response.json({ records: [] });
  await assert.rejects(
    getCareBackStore(env()).openOrResume({
      identityHash: IDENTITY,
      memberId: "MMD-PER-01",
      memberProfile: { membership_status: "active", tier: "Premium" },
      now: new Date("2026-10-01T00:00:00.000Z"),
    }),
    (error) => error?.code === "CARE_BACK_CAMPAIGN_CLOSED",
  );
});
