import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  approveCareBackCouponForConfirmedBooking,
  CareBackBookingContextError,
  detectCareBackModelLevel,
  normalizeModelServiceLevel,
  normalizeTrustedJobFormat,
  resolveModelJobEligibility,
  trustedPublicModelPercent,
} from "../src/care-back-coupon-approval.js";

const realFetch = globalThis.fetch;
const IDENTITY_HASH = "a".repeat(64);
const MODEL_ID = `rec${"D".repeat(14)}`;

afterEach(() => { globalThis.fetch = realFetch; });

function canonical(overrides = {}) {
  return {
    snapshot: {
      schema_version: "my_mmd_entitlement_resolver_v1",
      member_blocked: false,
      ...overrides.snapshot,
    },
    response: {
      member_status: "active",
      membership_tier: "standard",
      ...overrides.response,
    },
  };
}

function bookingFields(overrides = {}) {
  return {
    booking_ref: "book_001",
    client_contact: "member@example.com",
    line_or_member_id: "",
    "Selected Model ID": MODEL_ID,
    job_class: "travel",
    ...overrides,
  };
}

function installAirtable(modelFields = { private_tier: "Standard Review", private_service_level: "VIP" }) {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const table = parts[2] || "";
    const recordId = parts[3] || "";

    if (table === "Members") {
      return Response.json({ records: [{ id: `rec${"M".repeat(14)}`, fields: { member_id: "MMD-PER-01", email: "member@example.com" } }] });
    }
    if (table === "MMD — Campaign Claims") {
      return Response.json({ records: [{
        id: `rec${"C".repeat(14)}`,
        fields: {
          campaign_id: "6-years-care-back",
          matched_member_id: "MMD-PER-01",
          claim_id: "CB6-2026-ABCDEF",
          line_user_id_hash: IDENTITY_HASH,
        },
      }] });
    }
    if (table === "Models" && recordId === MODEL_ID) {
      return Response.json({ id: MODEL_ID, fields: modelFields });
    }
    throw new Error(`unexpected Airtable request: ${url.pathname}`);
  };
}

function memberPagesBinding(capture, approvedPercent = 7) {
  return {
    async fetch(request) {
      capture.url = request.url;
      capture.caller = request.headers.get("x-mmd-service-caller");
      capture.body = await request.json();
      return Response.json({
        ok: true,
        data: {
          authority: "care_back_coupon_v2_2",
          model_level: capture.body.model_level,
          model_service_level: capture.body.eligibility.model_service_level,
          job_format: capture.body.job_format,
          approved_discount_percent: approvedPercent,
          activated_at: "2026-09-04T00:00:00.000Z",
          expires_at: "2026-11-04T00:00:00.000Z",
          status: "active",
          single_use: true,
        },
      });
    },
  };
}

function env(binding) {
  return {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    MEMBER_PAGES_WORKER: binding,
  };
}

test("CARE BACK Model level resolver reads Airtable canonical axes and bounded legacy evidence", () => {
  assert.equal(detectCareBackModelLevel({ "CARE BACK Model Level": "GWs" }), "GWs");
  assert.equal(detectCareBackModelLevel({ recognition_class: "EMs", model_class: "Premium" }), "EMs");
  assert.equal(detectCareBackModelLevel({ sales_layer: "public", model_class: "Standard" }), "Public Models");
  assert.equal(detectCareBackModelLevel({ model_class: "Premium" }), "Premium");
  assert.equal(detectCareBackModelLevel({ model_class: "Standard" }), "Standard Models");
  assert.equal(detectCareBackModelLevel({ private_tier: "Standard Review" }), "Standard Models");
  assert.equal(detectCareBackModelLevel({ private_tier: "Premium Review" }), "Premium");
  assert.equal(detectCareBackModelLevel({ unique_key: "GWs19-sprite" }), "GWs");
  assert.equal(detectCareBackModelLevel({ working_name: "EMs02" }), "EMs");
  assert.equal(detectCareBackModelLevel({ category_path: "MMD Public Models/MMD Extreme Models" }), "Public Models");
  assert.equal(detectCareBackModelLevel({ private_tier: "Black Card Review" }), "");
});

test("PN/VIP job format accepts only trusted canonical values", () => {
  assert.equal(normalizeTrustedJobFormat("PN"), "PN");
  assert.equal(normalizeTrustedJobFormat("vip"), "VIP");
  assert.equal(normalizeTrustedJobFormat("travel"), "");
  assert.equal(normalizeTrustedJobFormat("extreme"), "");
  assert.equal(normalizeTrustedJobFormat("private_review"), "");
});

test("canonical private_service_level gates PN/VIP without inferring from Model level", () => {
  assert.equal(normalizeModelServiceLevel("VIP"), "VIP");
  assert.equal(normalizeModelServiceLevel("both"), "VIP");
  assert.equal(normalizeModelServiceLevel("PN"), "PN");
  assert.equal(normalizeModelServiceLevel("none"), "none");
  assert.deepEqual(resolveModelJobEligibility({ private_service_level: "VIP" }, "VIP"), { eligible: true, service_level: "VIP" });
  assert.deepEqual(resolveModelJobEligibility({ private_service_level: "VIP" }, "PN"), { eligible: true, service_level: "VIP" });
  assert.deepEqual(resolveModelJobEligibility({ private_service_level: "PN" }, "PN"), { eligible: true, service_level: "PN" });
  assert.deepEqual(resolveModelJobEligibility({ private_service_level: "PN" }, "VIP"), { eligible: false, service_level: "PN" });
  assert.deepEqual(resolveModelJobEligibility({ private_service_level: "none", private_work_format: "VIP" }, "PN"), { eligible: false, service_level: "none" });
  assert.deepEqual(resolveModelJobEligibility({ private_work_format: "both" }, "VIP"), { eligible: true, service_level: "VIP" });
});

test("Public Model exact rate remains bounded to the trusted 3-5 band", () => {
  assert.equal(trustedPublicModelPercent(null), null);
  assert.equal(trustedPublicModelPercent(2), null);
  assert.equal(trustedPublicModelPercent(3), 3);
  assert.equal(trustedPublicModelPercent(4), 4);
  assert.equal(trustedPublicModelPercent(5), 5);
  assert.equal(trustedPublicModelPercent(6), null);
});

test("trusted booking confirm derives Model level from Airtable and sends canonical eligibility to member-pages owner", async () => {
  installAirtable({ private_tier: "Standard Review", private_service_level: "VIP" });
  const capture = {};
  const result = await approveCareBackCouponForConfirmedBooking({
    env: env(memberPagesBinding(capture, 7)),
    body: { campaign_code: "6-years-care-back", job_format: "VIP" },
    bookingFields: bookingFields({ job_class: "travel" }),
    canonical: canonical(),
    bookingAccess: { allowed: true },
    paymentVerified: true,
  });

  assert.equal(result.requested, true);
  assert.equal(result.state, "approved");
  assert.equal(result.model_level, "Standard Models");
  assert.equal(result.model_service_level, "VIP");
  assert.equal(result.job_format, "VIP");
  assert.equal(result.approved_discount_percent, 7);
  assert.equal(result.expires_at, "2026-11-04T00:00:00.000Z");

  assert.equal(capture.url, "https://member-pages.internal/__internal/care-back/coupon/approve-booking");
  assert.equal(capture.caller, "sigil-booking-worker");
  assert.equal(capture.body.identity_hash, IDENTITY_HASH);
  assert.equal(capture.body.member_id, "MMD-PER-01");
  assert.equal(capture.body.model_level, "Standard Models");
  assert.equal(capture.body.job_format, "VIP");
  assert.equal(capture.body.eligibility.authority, "my_mmd_entitlement_resolver_v1");
  assert.equal(capture.body.eligibility.member_blocked, false);
  assert.equal(capture.body.eligibility.booking_allowed, true);
  assert.equal(capture.body.eligibility.payment_verified, true);
  assert.equal(capture.body.eligibility.model_job_eligible, true);
  assert.equal(capture.body.eligibility.model_service_level, "VIP");
});

test("browser draft job_class=vip cannot authorize a CARE BACK VIP rate", async () => {
  const capture = {};
  await assert.rejects(
    approveCareBackCouponForConfirmedBooking({
      env: env(memberPagesBinding(capture, 7)),
      body: { campaign_code: "6-years-care-back" },
      bookingFields: bookingFields({ job_class: "vip" }),
      canonical: canonical(),
      bookingAccess: { allowed: true },
      paymentVerified: true,
    }),
    (error) => error instanceof CareBackBookingContextError && error.code === "CARE_BACK_JOB_FORMAT_REQUIRED",
  );
  assert.equal(capture.body, undefined);
});

test("trusted VIP cannot exceed a Model whose canonical service level is PN", async () => {
  installAirtable({ model_class: "Standard", private_service_level: "PN" });
  const capture = {};
  await assert.rejects(
    approveCareBackCouponForConfirmedBooking({
      env: env(memberPagesBinding(capture, 7)),
      body: { campaign_code: "6-years-care-back", job_format: "VIP" },
      bookingFields: bookingFields(),
      canonical: canonical(),
      bookingAccess: { allowed: true },
      paymentVerified: true,
    }),
    (error) => error instanceof CareBackBookingContextError && error.code === "CARE_BACK_MODEL_JOB_FORMAT_NOT_ELIGIBLE",
  );
  assert.equal(capture.body, undefined);
});

test("Public Models fail closed until trusted confirm supplies the exact 3-5 rate", async () => {
  installAirtable({ sales_layer: "public", private_service_level: "PN" });
  const capture = {};
  await assert.rejects(
    approveCareBackCouponForConfirmedBooking({
      env: env(memberPagesBinding(capture, 4)),
      body: { campaign_code: "6-years-care-back", job_format: "PN" },
      bookingFields: bookingFields(),
      canonical: canonical(),
      bookingAccess: { allowed: true },
      paymentVerified: true,
    }),
    (error) => error instanceof CareBackBookingContextError && error.code === "CARE_BACK_PUBLIC_MODEL_PERCENT_REQUIRED",
  );
  assert.equal(capture.body, undefined);
});

test("Public Models accept an explicit trusted 3-5 rate and pass it to the canonical owner", async () => {
  installAirtable({ sales_layer: "public", private_service_level: "PN" });
  const capture = {};
  const result = await approveCareBackCouponForConfirmedBooking({
    env: env(memberPagesBinding(capture, 4)),
    body: { campaign_code: "6-years-care-back", job_format: "PN", public_model_percent: 4 },
    bookingFields: bookingFields(),
    canonical: canonical(),
    bookingAccess: { allowed: true },
    paymentVerified: true,
  });
  assert.equal(result.approved_discount_percent, 4);
  assert.equal(capture.body.model_level, "Public Models");
  assert.equal(capture.body.job_format, "PN");
  assert.equal(capture.body.public_model_percent, 4);
  assert.equal(capture.body.eligibility.model_service_level, "PN");
});

test("CARE BACK approval refuses blocked or unverified customer eligibility before touching Airtable", async () => {
  let touched = false;
  globalThis.fetch = async () => { touched = true; throw new Error("should not fetch"); };
  const capture = {};
  await assert.rejects(
    approveCareBackCouponForConfirmedBooking({
      env: env(memberPagesBinding(capture, 7)),
      body: { campaign_code: "6-years-care-back", job_format: "VIP" },
      bookingFields: bookingFields(),
      canonical: canonical({ snapshot: { member_blocked: true } }),
      bookingAccess: { allowed: true },
      paymentVerified: true,
    }),
    (error) => error instanceof CareBackBookingContextError && error.code === "CARE_BACK_CUSTOMER_ELIGIBILITY_UNRESOLVED",
  );
  assert.equal(touched, false);
  assert.equal(capture.body, undefined);
});
