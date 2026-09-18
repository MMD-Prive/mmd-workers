import test from "node:test";
import assert from "node:assert/strict";
import { handleOperatorPaymentEvent } from "../src/operator-payment-event.js";

const URL = "https://mmdbkk.com/member/api/operator/membership/payment-event";
const TOKEN = "test-operator-secret";

function validBody(overrides = {}) {
  return {
    event: "membership_payment_verified",
    reference_id: "REF-001",
    order_id: "order_001",
    member_email: "member@example.com",
    payment_reference: "BANK-123",
    amount_thb: 35000,
    currency: "THB",
    product: "black_card",
    verified_at: "2026-09-03T06:30:00.000Z",
    verified_by: "staff-test",
    source: "lovable_blackcard_admin",
    idempotency_key: "mmd:order:order_001:membership_payment_verified",
    ...overrides,
  };
}

function makeRequest(body = validBody(), options = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.auth !== false) headers.set("authorization", `Bearer ${options.token || TOKEN}`);
  if (options.idempotency !== false && body?.idempotency_key) headers.set("idempotency-key", options.idempotencyKey || body.idempotency_key);
  return new Request(URL, { method: "POST", headers, body: JSON.stringify(body) });
}

function createHarness({ entitlements = [{ id: "recEnt1", fields: { member_email: "member@example.com" } }], failAudit = false } = {}) {
  const accessLog = [];
  let auditCounter = 0;

  const env = {
    AUTH_SERVICE_LOVABLE_TO_AUTH: TOKEN,
    AIRTABLE_API_KEY: "airtable-test-key",
    AIRTABLE_BASE_ID: "appTest",
    AIRTABLE_TABLE_ACCESS_LOG: "System — Access Log",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "MMD — Member Entitlements",
    AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD: "member_email",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new globalThis.URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").pop());

        if (request.method === "POST" && table === "System — Access Log") {
          if (failAudit) return jsonResponse({ error: "forced" }, 500);
          const payload = await request.json();
          const created = payload.records.map((entry) => {
            const record = { id: `recAudit${++auditCounter}`, fields: entry.fields };
            accessLog.push(record);
            return record;
          });
          return jsonResponse({ records: created }, 200);
        }

        if (request.method === "GET" && table === "System — Access Log") {
          const formula = url.searchParams.get("filterByFormula") || "";
          const sourceMatch = /\{Source Ref\}='([^']+)'/.exec(formula);
          const sourceRef = sourceMatch?.[1] || "";
          const records = accessLog.filter((record) => record.fields.Action === "membership_payment_evidence" && record.fields["Source Ref"] === sourceRef);
          return jsonResponse({ records: records.slice(0, 1) }, 200);
        }

        if (request.method === "GET" && table === "MMD — Member Entitlements") {
          const formula = url.searchParams.get("filterByFormula") || "";
          const emailMatch = /=\'([^']+)\'/.exec(formula);
          const email = String(emailMatch?.[1] || "").toLowerCase();
          const records = entitlements.filter((record) => String(record.fields?.member_email || "").toLowerCase() === email);
          return jsonResponse({ records }, 200);
        }

        return jsonResponse({ error: "unexpected_mock_request", table, method: request.method }, 500);
      },
    },
  };

  return { env, accessLog };
}

async function read(response) {
  return { status: response.status, body: await response.json() };
}

function assertNoGrantFields(value) {
  const forbidden = new Set(["grant", "activate_vip", "activate_black_card", "points_granted", "invite_url", "telegram_invite"]);
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      assert.equal(forbidden.has(key), false, `forbidden response field: ${key}`);
      visit(child);
    }
  };
  visit(value);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

test("missing bearer auth -> 401 and audited", async () => {
  const h = createHarness();
  const result = await read(await handleOperatorPaymentEvent(makeRequest(validBody(), { auth: false }), h.env));
  assert.equal(result.status, 401);
  assert.equal(result.body.error, "missing_service_auth");
  assert.equal(h.accessLog.length, 1);
  assert.equal(h.accessLog[0].fields.Result, "fail");
  assertNoGrantFields(result.body);
});

test("invalid bearer auth -> 401 and audited", async () => {
  const h = createHarness();
  const result = await read(await handleOperatorPaymentEvent(makeRequest(validBody(), { token: "wrong-secret" }), h.env));
  assert.equal(result.status, 401);
  assert.equal(result.body.error, "invalid_service_auth");
  assert.equal(h.accessLog.length, 1);
  assertNoGrantFields(result.body);
});

test("invalid payload -> 400 and audited", async () => {
  const h = createHarness();
  const body = validBody({ member_email: "", amount_thb: -1 });
  const result = await read(await handleOperatorPaymentEvent(makeRequest(body), h.env));
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "invalid_payment_event");
  assert.ok(result.body.details.includes("member_email_required"));
  assert.ok(result.body.details.includes("amount_thb_invalid"));
  assert.equal(h.accessLog.length, 1);
  assertNoGrantFields(result.body);
});

test("new known-member event -> 200 accepted:true evidence-only", async () => {
  const h = createHarness();
  const result = await read(await handleOperatorPaymentEvent(makeRequest(), h.env));
  assert.equal(result.status, 200);
  assert.equal(result.body.accepted, true);
  assert.equal(result.body.duplicate, false);
  assert.equal(result.body.resolution, "pending_canonical_resolution");
  assert.match(result.body.event_id, /^mmdpe_/);
  assert.equal(h.accessLog.length, 1);
  assert.equal(h.accessLog[0].fields.Action, "membership_payment_evidence");
  const after = JSON.parse(h.accessLog[0].fields["After JSON"]);
  assert.equal(after.entitlement_mutation, false);
  assert.equal(after.points_mutation, false);
  assertNoGrantFields(result.body);
});

test("same idempotency key + same payload -> 200 duplicate:true", async () => {
  const h = createHarness();
  const first = await read(await handleOperatorPaymentEvent(makeRequest(), h.env));
  const second = await read(await handleOperatorPaymentEvent(makeRequest(), h.env));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body.accepted, true);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.event_id, first.body.event_id);
  assert.equal(h.accessLog.length, 2);
  assert.equal(h.accessLog[1].fields.Reason, "duplicate");
  assertNoGrantFields(second.body);
});

test("same idempotency key + changed payload -> 409 and audited", async () => {
  const h = createHarness();
  await handleOperatorPaymentEvent(makeRequest(), h.env);
  const changed = validBody({ amount_thb: 34999 });
  const result = await read(await handleOperatorPaymentEvent(makeRequest(changed), h.env));
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "idempotency_payload_mismatch");
  assert.equal(result.body.accepted, false);
  assert.equal(h.accessLog.length, 2);
  assert.equal(h.accessLog[1].fields.Reason, "idempotency_payload_mismatch");
  assertNoGrantFields(result.body);
});

test("unknown member -> 202 needs_member_match and no grant", async () => {
  const h = createHarness({ entitlements: [] });
  const result = await read(await handleOperatorPaymentEvent(makeRequest(), h.env));
  assert.equal(result.status, 202);
  assert.equal(result.body.accepted, true);
  assert.equal(result.body.duplicate, false);
  assert.equal(result.body.resolution, "needs_member_match");
  assert.equal(h.accessLog.length, 1);
  const evidence = JSON.parse(h.accessLog[0].fields["Before JSON"]);
  assert.equal(evidence.member_match, false);
  assertNoGrantFields(result.body);
});

test("audit write failure -> 503 fail closed", async () => {
  const h = createHarness({ failAudit: true });
  const result = await read(await handleOperatorPaymentEvent(makeRequest(), h.env));
  assert.equal(result.status, 503);
  assert.equal(result.body.error, "operator_payment_audit_write_failed");
  assertNoGrantFields(result.body);
});
