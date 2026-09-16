import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  addCalendarMonths,
  deriveClaimAndCode,
  getCareBackStore,
  resolveApprovedDiscount,
} from "../src/care-back-claim-store.js";

const realFetch = globalThis.fetch;
const IDENTITY = "a".repeat(64);
const SECRET = "test-only-liff-session-secret-1234567890";
const BIRTHDAY_NOW = new Date("2026-08-19T00:00:00.000Z");

function env() {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app_test",
    LIFF_SESSION_SECRET: SECRET,
  };
}

afterEach(() => { globalThis.fetch = realFetch; });

function tableFrom(input) {
  const parts = new URL(String(input)).pathname.split("/");
  const last = decodeURIComponent(parts.at(-1));
  if (/^rec[A-Za-z0-9]{14}$/.test(last)) return decodeURIComponent(parts.at(-2));
  return last;
}

function currentClaim(derived, overrides = {}) {
  return {
    id: `rec${"A".repeat(14)}`,
    fields: {
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
      campaign_reference_date: BIRTHDAY_NOW.toISOString(),
      ...overrides,
    },
  };
}

test("CARE BACK does not issue a coupon before the canonical Birthday Wish is saved", async () => {
  const writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const table = tableFrom(input);
    if ((init.method || "GET") === "GET") return Response.json({ records: [] });
    const body = JSON.parse(init.body);
    const fields = body.records?.[0]?.fields || body.fields;
    writes.push({ table, fields });
    return Response.json({ records: [{ id: `rec${String(writes.length).padStart(14, "A")}`, fields }] });
  };

  const result = await getCareBackStore(env()).openOrResume({
    identityHash: IDENTITY,
    memberId: "MMD-PER-01",
    memberProfile: { membership_status: "active", tier: "Premium" },
    now: BIRTHDAY_NOW,
  });

  assert.equal(writes.some((write) => write.table === "MMD — Promo Codes"), false);
  assert.equal(result.personal_code, "");
  assert.equal(result.coupon_state, "wish_required");
  assert.equal(result.approved_discount_percent, null);
  assert.equal(result.discount_percent, 0);
});

test("CARE BACK activates the code for exactly two calendar months without inventing an approved percentage", async () => {
  const writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const table = tableFrom(input);
    if ((init.method || "GET") === "GET") return Response.json({ records: [] });
    const body = JSON.parse(init.body);
    const fields = body.records?.[0]?.fields || body.fields;
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

  const promo = writes.find((write) => write.table === "MMD — Promo Codes");
  assert.ok(promo);
  assert.equal(promo.fields.status, "active");
  assert.equal(promo.fields.activated_at, "2026-08-19T00:00:00.000Z");
  assert.equal(promo.fields.expires_at, "2026-10-19T00:00:00.000Z");
  assert.equal(Object.hasOwn(promo.fields, "benefit_value"), false);
  assert.equal(Object.hasOwn(promo.fields, "approved_discount_percent"), false);
  assert.match(promo.fields.payload_json, /"validity_months":2/);
  assert.match(promo.fields.payload_json, /"max_discount_percent":10/);
  assert.doesNotMatch(promo.fields.payload_json, /"validity_days":30/);
  assert.equal(result.coupon_state, "ready");
  assert.equal(result.approved_discount_percent, null);
  assert.equal(result.coupon_wallet.approved_discount_percent, null);
  assert.equal(result.discount_percent, 0);
});

test("calendar-month validity preserves month semantics and clamps end-of-month", () => {
  assert.equal(addCalendarMonths("2026-08-31T12:34:56.000Z", 2), "2026-10-31T12:34:56.000Z");
  assert.equal(addCalendarMonths("2026-12-31T00:00:00.000Z", 2), "2027-02-28T00:00:00.000Z");
  assert.equal(addCalendarMonths("2027-12-31T00:00:00.000Z", 2), "2028-02-29T00:00:00.000Z");
});

test("authoritative discount resolver follows Model level x PN/VIP matrix", () => {
  assert.equal(resolveApprovedDiscount({ modelLevel: "Standard Models", jobFormat: "PN" }), 5);
  assert.equal(resolveApprovedDiscount({ modelLevel: "Standard Models", jobFormat: "VIP" }), 7);
  assert.equal(resolveApprovedDiscount({ modelLevel: "Premium", jobFormat: "PN" }), 5);
  assert.equal(resolveApprovedDiscount({ modelLevel: "Premium", jobFormat: "VIP" }), 10);
  assert.equal(resolveApprovedDiscount({ modelLevel: "EMs", jobFormat: "VIP" }), 10);
  assert.equal(resolveApprovedDiscount({ modelLevel: "GWs", jobFormat: "VIP" }), 10);
});

test("Public Models 3-5 band fails closed unless the trusted backend supplies the exact approved rate", () => {
  assert.equal(resolveApprovedDiscount({ modelLevel: "Public Models", jobFormat: "PN" }), null);
  assert.equal(resolveApprovedDiscount({ modelLevel: "Public Models", jobFormat: "PN", publicModelPercent: 2 }), null);
  assert.equal(resolveApprovedDiscount({ modelLevel: "Public Models", jobFormat: "PN", publicModelPercent: 3 }), 3);
  assert.equal(resolveApprovedDiscount({ modelLevel: "Public Models", jobFormat: "VIP", publicModelPercent: 4 }), 4);
  assert.equal(resolveApprovedDiscount({ modelLevel: "Public Models", jobFormat: "VIP", publicModelPercent: 5 }), 5);
  assert.equal(resolveApprovedDiscount({ modelLevel: "Public Models", jobFormat: "VIP", publicModelPercent: 6 }), null);
});

test("backend approval writes approved_discount_percent and clears legacy fixed benefit_value", async () => {
  const derived = await deriveClaimAndCode(IDENTITY, SECRET);
  const activation = "2026-08-19T00:00:00.000Z";
  const expiry = "2026-10-19T00:00:00.000Z";
  let patchFields = null;
  const promo = {
    id: `rec${"B".repeat(14)}`,
    fields: {
      code: derived.code,
      campaign_code: "6-years-care-back",
      status: "active",
      activated_at: activation,
      expires_at: expiry,
      max_uses: 1,
      used_count: 0,
      package_scope: ["all"],
      benefit_type: "discount_percent",
      benefit_value: 10,
      created_at: activation,
      payload_json: JSON.stringify({ schema_version: 2, claim_id: derived.claimId, wish_submitted: true }),
    },
  };

  globalThis.fetch = async (input, init = {}) => {
    const table = tableFrom(input);
    if ((init.method || "GET") === "GET") {
      if (table === "MMD — Campaign Claims") return Response.json({ records: [currentClaim(derived)] });
      if (table === "MMD — Promo Codes") return Response.json({ records: [promo] });
      return Response.json({ records: [] });
    }
    if (init.method === "PATCH") {
      patchFields = JSON.parse(init.body).fields;
      return Response.json({ id: promo.id, fields: { ...promo.fields, ...patchFields } });
    }
    throw new Error(`unexpected write ${init.method} ${table}`);
  };

  const approved = await getCareBackStore(env()).approveCouponDiscount({
    identityHash: IDENTITY,
    memberId: "MMD-PER-01",
    memberProfile: { membership_status: "active", tier: "Premium" },
    modelLevel: "Standard Models",
    jobFormat: "VIP",
    now: BIRTHDAY_NOW,
  });

  assert.equal(patchFields.model_level, "Standard Models");
  assert.equal(patchFields.job_format, "VIP");
  assert.equal(patchFields.approved_discount_percent, 7);
  assert.equal(patchFields.benefit_value, null);
  assert.equal(approved.approved_discount_percent, 7);
  assert.equal(approved.activated_at, activation);
  assert.equal(approved.expires_at, expiry);
});

test("backend approval fails closed when model/job context cannot resolve an authoritative rate", async () => {
  const derived = await deriveClaimAndCode(IDENTITY, SECRET);
  const promo = {
    id: `rec${"B".repeat(14)}`,
    fields: {
      code: derived.code,
      campaign_code: "6-years-care-back",
      status: "active",
      activated_at: "2026-08-19T00:00:00.000Z",
      expires_at: "2026-10-19T00:00:00.000Z",
      used_count: 0,
      payload_json: JSON.stringify({ claim_id: derived.claimId, wish_submitted: true }),
    },
  };
  globalThis.fetch = async (input) => {
    const table = tableFrom(input);
    if (table === "MMD — Campaign Claims") return Response.json({ records: [currentClaim(derived)] });
    if (table === "MMD — Promo Codes") return Response.json({ records: [promo] });
    return Response.json({ records: [] });
  };

  await assert.rejects(
    getCareBackStore(env()).approveCouponDiscount({
      identityHash: IDENTITY,
      memberId: "MMD-PER-01",
      memberProfile: { membership_status: "active", tier: "Premium" },
      modelLevel: "Public Models",
      jobFormat: "VIP",
      now: BIRTHDAY_NOW,
    }),
    (error) => error?.code === "CARE_BACK_DISCOUNT_CONTEXT_UNRESOLVED",
  );
});

test("Coupon Wallet exposes only a matrix-valid approved_discount_percent", async () => {
  const derived = await deriveClaimAndCode(IDENTITY, SECRET);
  globalThis.fetch = async (input, init = {}) => {
    assert.equal(init.method || "GET", "GET");
    const table = tableFrom(input);
    if (table === "MMD — Campaign Claims") return Response.json({ records: [currentClaim(derived)] });
    return Response.json({ records: [{
      id: `rec${"X".repeat(14)}`,
      fields: {
        code: derived.code,
        campaign_code: "6-years-care-back",
        status: "active",
        model_level: "Standard Models",
        job_format: "VIP",
        approved_discount_percent: 7,
        activated_at: "2026-08-19T00:00:00.000Z",
        expires_at: "2026-10-19T00:00:00.000Z",
        used_count: 0,
        benefit_type: "discount_percent",
        benefit_value: 10,
        payload_json: JSON.stringify({ claim_id: derived.claimId, wish_submitted: true }),
      },
    }] });
  };

  const wallet = await getCareBackStore(env()).readCouponWallet({
    identityHash: IDENTITY,
    memberId: "MMD-PER-01",
    now: BIRTHDAY_NOW,
  });

  assert.equal(wallet.status, "ready");
  assert.equal(wallet.approved_discount_percent, 7);
  assert.equal(wallet.discount_percent, 7);
  assert.equal(wallet.activated_at, "2026-08-19T00:00:00.000Z");
  assert.equal(wallet.expires_at, "2026-10-19T00:00:00.000Z");
});

test("Coupon Wallet refuses a legacy fixed 10 when model/job approval evidence is absent", async () => {
  const derived = await deriveClaimAndCode(IDENTITY, SECRET);
  globalThis.fetch = async (input) => {
    const table = tableFrom(input);
    if (table === "MMD — Campaign Claims") return Response.json({ records: [currentClaim(derived)] });
    return Response.json({ records: [{
      id: `rec${"X".repeat(14)}`,
      fields: {
        code: derived.code,
        campaign_code: "6-years-care-back",
        status: "active",
        approved_discount_percent: 10,
        benefit_value: 10,
        activated_at: "2026-08-19T00:00:00.000Z",
        expires_at: "2026-10-19T00:00:00.000Z",
        used_count: 0,
        payload_json: JSON.stringify({ claim_id: derived.claimId, wish_submitted: true }),
      },
    }] });
  };

  const wallet = await getCareBackStore(env()).readCouponWallet({
    identityHash: IDENTITY,
    memberId: "MMD-PER-01",
    now: BIRTHDAY_NOW,
  });
  assert.equal(wallet.approved_discount_percent, null);
  assert.equal(wallet.discount_percent, 0);
});

test("CARE BACK allows September continuation claims but closes new claims after September", async () => {
  const writes = [];
  globalThis.fetch = async (input, init = {}) => {
    const table = tableFrom(input);
    if ((init.method || "GET") === "GET") return Response.json({ records: [] });
    const body = JSON.parse(init.body);
    const fields = body.records?.[0]?.fields || body.fields;
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
