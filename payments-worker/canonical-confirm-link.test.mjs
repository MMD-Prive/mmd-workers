import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { handleCanonicalConfirmLink } = await import("./canonical-confirm-link.js");

function envWithAirtableRecorder() {
  const calls = [];
  const kv = new Map();
  const env = {
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_TABLE_SESSIONS: "tblC98mKWbzmPuNzX",
    AIRTABLE_TABLE_PAYMENTS: "tblWGGJJOx5eBvBZJ",
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "admin-payments-secret",
    AUTH_SERVICE_IMMIGRATE_TO_PAYMENTS: "immigrate-payments-secret",
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "test-confirm-signing-secret",
    PAY_TOKEN_TTL_SECONDS: "3600",
    WEB_BASE_URL: "https://mmdbkk.com",
    PAY_SESSIONS_KV: {
      async put(key, value) { kv.set(key, value); },
      async get(key) { return kv.get(key) || null; },
    },
  };

  env.AIRTABLE_HTTP = {
    async fetch(request) {
      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      const body = method === "GET" ? null : await request.clone().json();
      calls.push({ method, url, body });

      if (method === "GET") {
        return response({ records: [] });
      }

      if (method === "POST" && url.pathname.endsWith("/tblC98mKWbzmPuNzX")) {
        return response({ records: [{ id: "recSessionCanonical", fields: body.records[0].fields }] });
      }

      if (method === "POST" && url.pathname.endsWith("/tblWGGJJOx5eBvBZJ")) {
        return response({ records: [{ id: "recPaymentCanonical", fields: body.records[0].fields }] });
      }

      return response({ error: { type: "UNEXPECTED_TEST_REQUEST", message: `${method} ${url.pathname}` } }, 500);
    },
  };

  return { env, calls, kv };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function post(body, token = "admin-payments-secret") {
  return new Request("https://sigil.mmdbkk.com/v1/confirm/link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Internal-Token": token } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("canonical confirm-link writes only real Sessions/Payments schema fields", async () => {
  const { env, calls, kv } = envWithAirtableRecorder();
  const request = post({
    session_id: "sess_create_job_schema_test",
    payment_ref: "pay_create_job_schema_test",
    client_name: "พี่ SVIP",
    model_name: "EMs21 · J Dye",
    job_type: "dinner",
    job_date: "2026-09-10",
    start_time: "19:00",
    end_time: "22:00",
    location_name: "Bangkok",
    google_map_url: "https://maps.google.com/?q=Bangkok",
    amount_thb: 32500,
    pay_model_thb: 25000,
    payment_type: "full",
    note: "partner Kendo included in rate",
  });

  const result = await handleCanonicalConfirmLink(request, env);
  assert.equal(result.status, 200);
  const payload = await result.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.schema, "canonical_confirm_link_v1");
  assert.equal(payload.session_write.record_id, "recSessionCanonical");
  assert.equal(payload.payment_write.record_id, "recPaymentCanonical");
  assert.match(payload.customer_confirmation_url, /^https:\/\/mmdbkk\.com\/confirm\/job-confirmation\?t=/);
  assert.match(payload.model_confirmation_url, /^https:\/\/mmdbkk\.com\/confirm\/job-model\?t=/);
  assert.equal(kv.size, 2);

  const sessionPost = calls.find((call) => call.method === "POST" && call.url.pathname.endsWith("/tblC98mKWbzmPuNzX"));
  const paymentPost = calls.find((call) => call.method === "POST" && call.url.pathname.endsWith("/tblWGGJJOx5eBvBZJ"));
  assert.ok(sessionPost);
  assert.ok(paymentPost);

  const sessionFields = sessionPost.body.records[0].fields;
  assert.equal(sessionFields.fldLTq2kZbyRv22IA, "sess_create_job_schema_test");
  assert.equal(sessionFields.fldmwuvOaiCFdzzRa, "Pending");
  assert.equal(sessionFields.fldTY5lE6m0kQf72n, "pending");
  assert.equal(sessionFields.fldojgjSQLaO0uQLX, "pay_create_job_schema_test");
  assert.equal(sessionFields.fldhwC79ndbnEXSZz, 32500);
  assert.equal(sessionFields.fldlTO5aNfqUmlNWm, 25000);
  assert.equal(sessionFields.fldMvnQ0BzDfHUYjT, "พี่ SVIP");
  assert.equal(sessionFields.flddVz6eoWRHrzIQr, "EMs21 · J Dye");
  assert.equal(sessionFields.fldBeG0FkWwa8kgnp, "2026-09-10T19:00:00+07:00");
  assert.equal(sessionFields.fldiDSz0wW9Ct9I3P, "2026-09-10T22:00:00+07:00");
  assert.equal(Object.hasOwn(sessionFields, "Payment Status"), false);
  assert.equal(Object.hasOwn(sessionFields, "status"), false);
  assert.equal(Object.hasOwn(sessionFields, "payment_type"), false);
  assert.equal(Object.hasOwn(sessionFields, "fldHAlxnRfpKucnNV"), false);

  const paymentFields = paymentPost.body.records[0].fields;
  assert.equal(paymentFields.fldOO6SY49iDw8VBZ, "pay_create_job_schema_test");
  assert.equal(paymentFields.fld2wdhBvc8xrV6y5, "sess_create_job_schema_test");
  assert.equal(paymentFields.fldvCSwrUW8OMAooS, 32500);
  assert.equal(paymentFields.fldEJ1hmm7KwWuI6q, "Pending");
  assert.equal(paymentFields.fldsblzIn0wzan3c9, "PromptPay");
  assert.equal(paymentFields.fldJ7a0Ube9F0bmRy, "pending_review");
  assert.equal(paymentFields.fld04fr3bRJTohO6y, "Pending Confirmation");
  assert.equal(paymentFields.fldrr9g8ZZjqAbdKQ, "full");
  assert.equal(paymentFields.fldydUWHhqVLMkNSC, "full");
  assert.equal(Object.hasOwn(paymentFields, "fldk24YxRR0JC0cce"), false);
  assert.equal(Object.hasOwn(paymentFields, "payment_ref"), false);
  assert.equal(Object.hasOwn(paymentFields, "pay_model_thb"), false);
  assert.equal(Object.hasOwn(paymentFields, "fldlTO5aNfqUmlNWm"), false);
});

test("canonical confirm-link advances an overnight time-only end into the next Bangkok day", async () => {
  const { env, calls } = envWithAirtableRecorder();
  const result = await handleCanonicalConfirmLink(post({
    session_id: "sess_overnight",
    payment_ref: "pay_overnight",
    client_name: "Client",
    model_name: "Model",
    job_type: "companion",
    job_date: "2026-09-10",
    start_time: "22:00",
    end_time: "02:00",
    location_name: "Bangkok",
    amount_thb: 10000,
    payment_type: "full",
  }), env);

  assert.equal(result.status, 200);
  const sessionPost = calls.find((call) => call.method === "POST" && call.url.pathname.endsWith("/tblC98mKWbzmPuNzX"));
  const fields = sessionPost.body.records[0].fields;
  assert.equal(fields.fldBeG0FkWwa8kgnp, "2026-09-10T22:00:00+07:00");
  assert.equal(fields.fldiDSz0wW9Ct9I3P, "2026-09-11T02:00:00+07:00");
});

test("canonical confirm-link remains service-authenticated and fails before Airtable", async () => {
  const { env, calls } = envWithAirtableRecorder();
  const result = await handleCanonicalConfirmLink(post({
    client_name: "Client",
    model_name: "Model",
    job_type: "dinner",
    job_date: "2026-09-10",
    start_time: "19:00",
    end_time: "22:00",
    location_name: "Bangkok",
    amount_thb: 10000,
  }, "wrong-secret"), env);

  assert.equal(result.status, 401);
  assert.deepEqual(await result.json(), { ok: false, error: "service_auth_required" });
  assert.equal(calls.length, 0);
});

test("production wrapper intercepts confirm-link before the legacy payments worker", () => {
  const wrapper = readFileSync(new URL("./index.review-wrapper.js", import.meta.url), "utf8");
  assert.match(wrapper, /handleCanonicalConfirmLink/);
  assert.match(wrapper, /isCanonicalConfirmLinkRequest/);
  const canonicalIndex = wrapper.indexOf("isCanonicalConfirmLinkRequest");
  const legacyIndex = wrapper.lastIndexOf("return phase1Worker.fetch(request, env, ctx)");
  assert.notEqual(canonicalIndex, -1);
  assert.notEqual(legacyIndex, -1);
  assert.ok(canonicalIndex < legacyIndex);
});
