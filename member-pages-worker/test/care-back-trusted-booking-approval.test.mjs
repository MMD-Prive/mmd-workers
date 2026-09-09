import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { handleTrustedCareBackBookingApproval } from "../src/care-back-trusted-booking-approval.js";

const SERVICE_SECRET = "sigil-booking-to-member-pages-test-secret-123456";
const RESOLVER_SECRET = "member-status-resolver-test-secret-123456789012";
const LIFF_SECRET = "liff-session-test-secret-12345678901234567890";
const LINE_ID = `U${"a".repeat(32)}`;
const MODEL_ID = "recABCDEFGHIJKLMN";
const realFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = realFetch; });

function request(body = {}, secret = SERVICE_SECRET) {
  return new Request("https://member-pages-worker.internal/__internal/care-back/approve-booking", {
    method: "POST",
    headers: { "content-type": "application/json", "x-mmd-sigil-booking-secret": secret },
    body: JSON.stringify(body),
  });
}

function environment({ modelFields = {}, approve } = {}) {
  const calls = [];
  const store = {
    openOrResume() {},
    async approveCouponDiscount(input) {
      calls.push(input);
      if (approve) return approve(input);
      return {
        code: "ABC234",
        status: "active",
        model_level: input.modelLevel,
        job_format: input.jobFormat,
        approved_discount_percent: input.modelLevel === "Standard Models" && input.jobFormat === "VIP" ? 7 : input.publicModelPercent || 5,
        activated_at: "2026-09-05T00:00:00.000Z",
        expires_at: "2026-11-05T00:00:00.000Z",
        single_use: true,
      };
    },
  };
  const env = {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_MODELS_ID: "models",
    AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES: SERVICE_SECRET,
    MEMBER_STATUS_RESOLVER_SECRET: RESOLVER_SECRET,
    LIFF_SESSION_SECRET: LIFF_SECRET,
    CARE_BACK_STORE: store,
    MEMBER_STATUS_RESOLVER: {
      async fetch(req) {
        assert.equal(req.headers.get("x-mmd-member-resolver-secret"), RESOLVER_SECRET);
        const body = await req.json();
        assert.equal(body.line_user_id, LINE_ID);
        assert.equal(body.purpose, "liff_member_profile_read");
        return Response.json({ ok: true, data: { member_exists: true, member_id: "MMD-001", profile: { membership_status: "active", tier: "Premium" } } });
      },
    },
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith(`/${MODEL_ID}`)) {
      return Response.json({ id: MODEL_ID, fields: { working_name: "Model A", model_tier: "standard", job_types: ["pn", "vip"], ...modelFields } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  return { env, calls };
}

const baseBody = {
  booking_ref: "BK-001",
  session_id: "S-001",
  line_user_id: LINE_ID,
  selected_model_id: MODEL_ID,
  job_format: "VIP",
};

test("trusted booking approval rejects missing service authentication", async () => {
  const { env } = environment();
  const response = await handleTrustedCareBackBookingApproval(request(baseBody, "wrong-secret"), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("trusted booking approval rejects caller-supplied discount authority", async () => {
  const { env, calls } = environment();
  const response = await handleTrustedCareBackBookingApproval(request({ ...baseBody, approved_discount_percent: 10 }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "caller_discount_authority_rejected");
  assert.equal(calls.length, 0);
});

test("trusted booking approval resolves canonical member and model then writes Standard VIP 7 percent", async () => {
  const { env, calls } = environment();
  const response = await handleTrustedCareBackBookingApproval(request(baseBody), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.status, "approved");
  assert.equal(payload.model_record_id, MODEL_ID);
  assert.equal(payload.model_level, "Standard Models");
  assert.equal(payload.job_format, "VIP");
  assert.equal(payload.approved_discount_percent, 7);
  assert.equal(payload.authority, "care_back_backend_verified_booking_v1");
  assert.equal(calls.length, 1);
  assert.match(calls[0].identityHash, /^[a-f0-9]{64}$/);
  assert.equal(calls[0].memberId, "MMD-001");
  assert.equal(calls[0].modelLevel, "Standard Models");
  assert.equal(calls[0].jobFormat, "VIP");
  assert.equal(calls[0].publicModelPercent, null);
});

test("trusted booking approval fails closed when canonical model does not allow requested job format", async () => {
  const { env, calls } = environment({ modelFields: { job_types: ["pn"] } });
  const response = await handleTrustedCareBackBookingApproval(request(baseBody), env);
  const payload = await response.json();
  assert.equal(response.status, 409);
  assert.equal(payload.status, "review_required");
  assert.equal(payload.error, "care_back_job_format_not_allowed_for_model");
  assert.equal(calls.length, 0);
});

test("Public Model exact rate is backend-owned and defaults to canonical campaign 5 percent", async () => {
  const { env, calls } = environment({ modelFields: { model_tier: "public", job_types: ["vip"] } });
  const response = await handleTrustedCareBackBookingApproval(request(baseBody), env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.model_level, "Public Models");
  assert.equal(payload.approved_discount_percent, 5);
  assert.equal(calls[0].publicModelPercent, 5);
});
