import test from "node:test";
import assert from "node:assert/strict";
import { handleOperatorPaymentEvent } from "../src/operator-payment-event.js";

const URL = "https://mmdbkk.com/member/api/operator/membership/payment-event";
const TOKEN = "test-operator-secret";
const TELEGRAM_TOKEN = "test-auth-to-telegram";

function body(overrides = {}) {
  return {
    event: "membership_payment_verified",
    reference_id: "REF-001",
    order_id: "order_001",
    member_email: "member@example.com",
    payment_reference: "BANK-123456789",
    amount_thb: 35000,
    currency: "THB",
    product: "black_card",
    verified_at: "2026-09-04T03:30:00.000Z",
    verified_by: "staff-test",
    source: "lovable_blackcard_admin",
    idempotency_key: "mmd:order:order_001:membership_payment_verified",
    ...overrides,
  };
}

function requestFor(payload = body()) {
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${TOKEN}`,
      "idempotency-key": payload.idempotency_key,
    },
    body: JSON.stringify(payload),
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function harness({ telegramStatus = 200 } = {}) {
  const accessLog = [];
  const telegramCalls = [];
  let auditCounter = 0;

  const env = {
    AUTH_SERVICE_LOVABLE_TO_AUTH: TOKEN,
    AUTH_SERVICE_AUTH_TO_TELEGRAM: TELEGRAM_TOKEN,
    PAYMENT_HYPE_ALERT_REQUIRED: "true",
    AIRTABLE_API_KEY: "airtable-test-key",
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_TABLE_ACCESS_LOG: "System — Access Log",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "MMD — Member Entitlements",
    AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD: "member_email",
    TELEGRAM_ACCESS_RECONCILER: {
      async fetch(request) {
        telegramCalls.push({
          authorization: request.headers.get("authorization"),
          payload: await request.json(),
        });
        if (telegramStatus !== 200) return jsonResponse({ ok: false, error: "forced_telegram_failure" }, telegramStatus);
        return jsonResponse({ ok: true, telegram: { ok: true } }, 200);
      },
    },
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new globalThis.URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").pop());

        if (request.method === "POST" && table === "System — Access Log") {
          const payload = await request.json();
          const records = payload.records.map((entry) => {
            const record = { id: `recAudit${++auditCounter}`, fields: entry.fields };
            accessLog.push(record);
            return record;
          });
          return jsonResponse({ records }, 200);
        }

        if (request.method === "GET" && table === "System — Access Log") {
          const formula = url.searchParams.get("filterByFormula") || "";
          const sourceRef = /\{Source Ref\}='([^']+)'/.exec(formula)?.[1] || "";
          const records = accessLog.filter((record) => record.fields.Action === "membership_payment_evidence" && record.fields["Source Ref"] === sourceRef);
          return jsonResponse({ records: records.slice(0, 1) }, 200);
        }

        if (request.method === "GET" && table === "MMD — Member Entitlements") {
          return jsonResponse({ records: [{ id: "recEnt1", fields: { member_email: "member@example.com" } }] }, 200);
        }

        return jsonResponse({ error: "unexpected_mock_request" }, 500);
      },
    },
  };

  return { env, accessLog, telegramCalls };
}

test("verified payment sends a masked HYPE alert after canonical evidence audit", async () => {
  const h = harness();
  const response = await handleOperatorPaymentEvent(requestFor(), h.env);
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.accepted, true);
  assert.equal(result.hype_alert, "sent");
  assert.equal(h.accessLog.length, 1);
  assert.equal(h.telegramCalls.length, 1);
  assert.equal(h.telegramCalls[0].authorization, `Bearer ${TELEGRAM_TOKEN}`);
  assert.equal(h.telegramCalls[0].payload.flow, "payment_verified");
  assert.equal(h.telegramCalls[0].payload.ref, "BANK…6789");
  assert.equal("member_email" in h.telegramCalls[0].payload, false);
});

test("verified payment returns retry_required when the mandatory HYPE alert fails", async () => {
  const h = harness({ telegramStatus: 500 });
  const response = await handleOperatorPaymentEvent(requestFor(), h.env);
  const result = await response.json();

  assert.equal(response.status, 503);
  assert.equal(result.accepted, true);
  assert.equal(result.hype_alert, "retry_required");
  assert.equal(h.accessLog.length, 1);
  assert.equal(h.telegramCalls.length, 1);
});

test("rejected payment does not emit the verified-payment HYPE alert", async () => {
  const h = harness();
  const rejected = body({
    event: "membership_payment_rejected",
    idempotency_key: "mmd:order:order_001:membership_payment_rejected",
  });
  const response = await handleOperatorPaymentEvent(requestFor(rejected), h.env);
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.accepted, true);
  assert.equal(h.telegramCalls.length, 0);
});
