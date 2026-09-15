import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { attachCareBackApprovalToConfirmedBooking } from "../src/care-back-trusted-caller.js";

const SECRET = "sigil-booking-to-member-pages-test-secret-123456";
const LINE_ID = `U${"b".repeat(32)}`;
const MODEL_ID = "recABCDEFGHIJKLMN";
const realFetch = globalThis.fetch;

afterEach(() => { globalThis.fetch = realFetch; });

function bookingRequest(body = {}) {
  return new Request("https://sigil.mmdbkk.com/__internal/booking/confirm", {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": "trusted-confirm" },
    body: JSON.stringify({ booking_ref: "BK-001", session_id: "S-001", ...body }),
  });
}

function confirmedResponse() {
  return Response.json({ ok: true, booking_ref: "BK-001", session_id: "S-001", confirmed_at: "2026-09-05T00:00:00.000Z" });
}

function env({ service = true, secret = SECRET } = {}) {
  const calls = [];
  const runtime = {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_BOOKING_REQUESTS_ID: "booking_requests",
    AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES: secret,
  };
  if (service) {
    runtime.MEMBER_PAGES_WORKER = {
      async fetch(req) {
        calls.push({
          url: req.url,
          secret: req.headers.get("x-mmd-sigil-booking-secret"),
          body: await req.json(),
        });
        return Response.json({
          ok: true,
          status: "approved",
          authority: "care_back_backend_verified_booking_v1",
          model_level: "Standard Models",
          job_format: "VIP",
          approved_discount_percent: 7,
          activated_at: "2026-09-05T00:00:00.000Z",
          expires_at: "2026-11-05T00:00:00.000Z",
          single_use: true,
        });
      },
    };
  }
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "api.airtable.com") {
      return Response.json({ records: [{ id: "recBooking", fields: {
        booking_ref: "BK-001",
        session_id: "S-001",
        line_or_member_id: LINE_ID,
        "Selected Model ID": MODEL_ID,
      } }] });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  return { runtime, calls };
}

test("trusted confirmed booking calls member-pages with canonical stored identity/model and explicit PN/VIP format", async () => {
  const { runtime, calls } = env();
  const response = await attachCareBackApprovalToConfirmedBooking(bookingRequest({ job_format: "VIP" }), runtime, confirmedResponse());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.care_back_approval.status, "approved");
  assert.equal(payload.care_back_approval.approved_discount_percent, 7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].secret, SECRET);
  assert.match(calls[0].url, /\/__internal\/care-back\/approve-booking$/);
  assert.deepEqual(calls[0].body, {
    booking_ref: "BK-001",
    session_id: "S-001",
    line_user_id: LINE_ID,
    selected_model_id: MODEL_ID,
    job_format: "VIP",
  });
  assert.equal("approved_discount_percent" in calls[0].body, false);
});

test("trusted booking confirm does not infer PN/VIP from browser booking state when trusted job_format is absent", async () => {
  const { runtime, calls } = env();
  const response = await attachCareBackApprovalToConfirmedBooking(bookingRequest(), runtime, confirmedResponse());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.care_back_approval.status, "review_required");
  assert.equal(payload.care_back_approval.reason, "trusted_job_format_required");
  assert.equal(calls.length, 0);
});

test("missing service auth or binding keeps coupon approval fail closed without rolling back a valid booking", async () => {
  const { runtime, calls } = env({ service: false, secret: "" });
  const response = await attachCareBackApprovalToConfirmedBooking(bookingRequest({ job_format: "PN" }), runtime, confirmedResponse());
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.care_back_approval.status, "review_required");
  assert.equal(payload.care_back_approval.reason, "member_pages_service_auth_not_configured");
  assert.equal(calls.length, 0);
});
