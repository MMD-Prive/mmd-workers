import assert from "node:assert/strict";
import test from "node:test";

import { handleCareBackBookingApproval } from "../src/care-back-booking-approval.js";

const HASH = "a".repeat(64);

function request(body = {}, headers = {}) {
  return new Request("https://member-pages.internal/__internal/care-back/coupon/approve-booking", {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-service-caller": "sigil-booking-worker", ...headers },
    body: JSON.stringify(body),
  });
}

function validBody(overrides = {}) {
  return {
    identity_hash: HASH,
    member_id: "MMD-PER-01",
    member_profile: { membership_status: "active", tier: "Premium" },
    model_level: "Standard Models",
    job_format: "VIP",
    booking_ref: "book_001",
    eligibility: {
      authority: "my_mmd_entitlement_resolver_v1",
      member_blocked: false,
      booking_allowed: true,
      payment_verified: true,
    },
    ...overrides,
  };
}

test("CARE BACK booking approval is not exposed in synthetic staging", async () => {
  let called = false;
  const response = await handleCareBackBookingApproval(request(validBody()), {
    CARE_BACK_STAGING_MODE: "synthetic",
    CARE_BACK_STORE: {
      openOrResume() {},
      async approveCouponDiscount() { called = true; return {}; },
    },
  });
  assert.equal(response.status, 404);
  assert.equal(called, false);
});

test("CARE BACK booking approval requires the trusted Worker caller label", async () => {
  const response = await handleCareBackBookingApproval(request(validBody(), { "x-mmd-service-caller": "browser" }), {
    CARE_BACK_STORE: { openOrResume() {}, async approveCouponDiscount() { return {}; } },
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "trusted_service_required");
});

test("CARE BACK booking approval forwards only canonical eligibility context into approveCouponDiscount", async () => {
  let received = null;
  const env = {
    CARE_BACK_STORE: {
      openOrResume() {},
      async approveCouponDiscount(input) {
        received = input;
        return {
          code: "ABC234",
          status: "active",
          model_level: "Standard Models",
          job_format: "VIP",
          approved_discount_percent: 7,
          activated_at: "2026-09-04T00:00:00.000Z",
          expires_at: "2026-11-04T00:00:00.000Z",
          single_use: true,
        };
      },
    },
  };
  const response = await handleCareBackBookingApproval(request(validBody({ coupon_code: "ABC234" })), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.approved_discount_percent, 7);
  assert.equal(payload.data.model_level, "Standard Models");
  assert.equal(payload.data.job_format, "VIP");
  assert.equal(received.identityHash, HASH);
  assert.equal(received.memberId, "MMD-PER-01");
  assert.equal(received.modelLevel, "Standard Models");
  assert.equal(received.jobFormat, "VIP");
  assert.equal(received.publicModelPercent, null);
  assert.equal(received.memberProfile.membership_status, "active");
});

test("CARE BACK booking approval fails closed when canonical eligibility is not verified", async () => {
  let called = false;
  const response = await handleCareBackBookingApproval(request(validBody({
    eligibility: {
      authority: "my_mmd_entitlement_resolver_v1",
      member_blocked: false,
      booking_allowed: true,
      payment_verified: false,
    },
  })), {
    CARE_BACK_STORE: {
      openOrResume() {},
      async approveCouponDiscount() { called = true; return {}; },
    },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "care_back_customer_eligibility_unresolved");
  assert.equal(called, false);
});

test("CARE BACK booking approval rejects a coupon-code mismatch after backend approval", async () => {
  const response = await handleCareBackBookingApproval(request(validBody({ coupon_code: "DEF567" })), {
    CARE_BACK_STORE: {
      openOrResume() {},
      async approveCouponDiscount() {
        return {
          code: "ABC234",
          status: "active",
          model_level: "Standard Models",
          job_format: "VIP",
          approved_discount_percent: 7,
          activated_at: "2026-09-04T00:00:00.000Z",
          expires_at: "2026-11-04T00:00:00.000Z",
          single_use: true,
        };
      },
    },
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "care_back_coupon_mismatch");
});
