import test from "node:test";
import assert from "node:assert/strict";

import { buildHypeCustomerStatusProjection } from "./src/hype-operating-concierge.js";
import { resolveLiveCanonicalClient } from "./src/kenji-lv5-live-context.js";

test("HYPE projects only customer-safe live status for a verified Telegram client", () => {
  const projection = buildHypeCustomerStatusProjection({
    live_truth_complete: true,
    readiness: "blocked",
    fan_in: {
      identity_resolution: "canonical",
      telegram_identity_present: true,
    },
    client_360: {
      canonical_client_id: "recSECRET123456789",
      display_name: "คุณเอ็ม",
      customer_gender: "female",
      customer_gender_source: "canonical_field",
    },
    entitlement: {
      status: "active",
      lifecycle: "active",
      membership_level: "private_premium",
      expire_at: "2028-09-19T00:00:00.000Z",
      blocked: false,
    },
    job: {
      status: "active_or_pending",
      active_jobs: [{
        job_id: "JOB-PRIVATE-1",
        status: "awaiting_payment",
        model_name: "Book EI",
        start_at: "2026-09-24T19:00:00+07:00",
        payment_state: "pending_review",
      }],
    },
    payment: {
      status: "pending_review",
      paid: false,
      review_required: true,
      outstanding_amount_thb: 5000,
      credit_balance_thb: 1500,
      payment_ref: "PAY-SECRET",
    },
    next_actions: [{
      action: "review_payment",
      label: "ตรวจหลักฐานการชำระเงิน",
      mode: "handoff",
      href: "/internal/admin/payments",
    }],
  });

  assert.equal(projection.ok, true);
  assert.equal(projection.state, "ready");
  assert.equal(projection.display_name, "คุณเอ็ม");
  assert.equal(projection.routing_context.customer_gender, "female");
  assert.equal(projection.routing_context.gender_source, "canonical_field");
  assert.equal(projection.routing_context.gender_explicit, true);
  assert.equal(projection.guardrails.data_minimized, true);
  assert.equal(projection.guardrails.no_gender_inference, true);
  assert.equal(projection.membership.level, "private_premium");
  assert.equal(projection.job.active_count, 1);
  assert.equal(projection.job.next.model_name, "Book EI");
  assert.equal(projection.payment.review_required, true);
  assert.equal(projection.next_action.action, "review_payment");
  assert.equal(projection.next_action.href, "");

  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /recSECRET|JOB-PRIVATE|PAY-SECRET|internal\/admin|airtable|service_secret/i);
});

test("HYPE fails closed when Telegram identity is not a verified canonical client", () => {
  const projection = buildHypeCustomerStatusProjection({
    live_truth_complete: false,
    fan_in: {
      identity_resolution: "unresolved",
      telegram_identity_present: false,
    },
  });

  assert.equal(projection.ok, false);
  assert.equal(projection.state, "connect_required");
  assert.equal(projection.code, "telegram_identity_not_linked");
  assert.equal(projection.next_action.href, "/my-mmd/");
});


test("live context resolves exactly one verified canonical Client from stable Telegram ID", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return Response.json({
      records: [{
        id: "recClientTelegram123",
        fields: {
          "Client Name": "คุณเอ็ม",
          line_user_id: "U0123456789abcdef0123456789abcdef",
          telegram_user_id: "111111",
          telegram_verification_status: "verified",
          "เพศ": "หญิง",
        },
      }],
    });
  };

  try {
    const resolved = await resolveLiveCanonicalClient({
      AIRTABLE_API_KEY: "airtable-test",
      AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
      AIRTABLE_TABLE_CLIENTS_ID: "tblVv58TCbwh5j1fS",
    }, {
      telegram_user_id: "111111",
    });

    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.client.canonical_client_id, "recClientTelegram123");
    assert.equal(resolved.client.display_name, "คุณเอ็ม");
    assert.equal(resolved.client.telegram_user_id, "111111");
    assert.equal(resolved.client.customer_gender, "female");
    assert.equal(resolved.client.customer_gender_source, "canonical_field");
    assert.match(decodeURIComponent(requestedUrl), /telegram_user_id/);
    assert.match(decodeURIComponent(requestedUrl), /telegram_verification_status/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("HYPE never infers customer gender from display name when canonical gender is missing", () => {
  const projection = buildHypeCustomerStatusProjection({
    live_truth_complete: true,
    readiness: "ready",
    fan_in: {
      identity_resolution: "canonical",
      telegram_identity_present: true,
    },
    client_360: {
      display_name: "คุณผู้หญิงใจดี",
      customer_gender: "unknown",
      customer_gender_source: "not_recorded",
    },
    entitlement: { status: "active", lifecycle: "active", membership_level: "public_member" },
    job: { active_jobs: [] },
    payment: { status: "unknown" },
    next_actions: [],
  });

  assert.equal(projection.routing_context.customer_gender, "unknown");
  assert.equal(projection.routing_context.gender_explicit, false);
  assert.equal(projection.guardrails.no_gender_inference, true);
});
