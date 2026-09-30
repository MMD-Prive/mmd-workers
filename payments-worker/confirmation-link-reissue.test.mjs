import assert from "node:assert/strict";
import test from "node:test";
import { handleConfirmationReissue, handleModelConfirmationReissue } from "./confirmation-link-reissue.js";

test("safe confirmation pair reissue rewrites only signed URLs and preserves payment state", async () => {
  const kv = new Map();
  const patches = [];
  const env = {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "airtable-test",
    AIRTABLE_TABLE_SESSIONS: "tblC98mKWbzmPuNzX",
    AIRTABLE_TABLE_PAYMENTS: "tblWGGJJOx5eBvBZJ",
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "service-test",
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "signing-secret-for-confirmation-reissue-test",
    PAY_TOKEN_TTL_SECONDS: "3600",
    WEB_BASE_URL: "https://mmdbkk.com",
    PAY_SESSIONS_KV: {
      async put(key, value) { kv.set(key, value); },
      async get(key) { return kv.get(key) || null; },
    },
  };

  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.includes("tblC98mKWbzmPuNzX")) {
      return Response.json({ records: [{
        id: "recSession",
        fields: {
          fldLTq2kZbyRv22IA: "sess_fixture",
          fldojgjSQLaO0uQLX: "pay_fixture",
          fldi9ZdoiUXzSv1rI: "https://mmdbkk.com/sigil/confirm/job-confirmation?t=old-customer",
          fld0mFma9J9yfEaKb: "https://mmdbkk.com/sigil/confirm/job-model?t=old-model",
          fldTY5lE6m0kQf72n: "paid",
        },
      }] });
    }
    if (request.method === "GET" && url.pathname.includes("tblWGGJJOx5eBvBZJ")) {
      return Response.json({ records: [{
        id: "recPayment",
        fields: {
          fldOO6SY49iDw8VBZ: "pay_fixture",
          fldrr9g8ZZjqAbdKQ: "deposit",
          fldEJ1hmm7KwWuI6q: "paid",
        },
      }] });
    }
    if (request.method === "PATCH" && url.pathname.includes("tblC98mKWbzmPuNzX/recSession")) {
      const body = await request.json();
      patches.push(body.fields);
      return Response.json({ id: "recSession", fields: body.fields });
    }
    throw new Error("unexpected_fetch:" + request.method + ":" + request.url);
  };

  try {
    const response = await handleConfirmationReissue(new Request("https://sigil.mmdbkk.com/v1/internal/confirm/reissue", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": "service-test" },
      body: JSON.stringify({ session_id: "sess_fixture" }),
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.session_id, "sess_fixture");
    assert.equal(body.payment_ref, "pay_fixture");
    assert.equal(body.payment_type, "deposit");
    assert.equal(body.payment_state_mutated, false);
    assert.equal(body.notification_sent, false);
    assert.equal(body.customer_confirmation_url, undefined);
    assert.equal(body.model_confirmation_url, undefined);
    assert.equal(patches.length, 1);
    assert.deepEqual(Object.keys(patches[0]).sort(), ["fld0mFma9J9yfEaKb", "fldi9ZdoiUXzSv1rI"]);
    assert.match(patches[0].fldi9ZdoiUXzSv1rI, /^https:\/\/mmdbkk\.com\/sigil\/confirm\/job-confirmation\?t=/);
    assert.match(patches[0].fld0mFma9J9yfEaKb, /^https:\/\/mmdbkk\.com\/sigil\/confirm\/job-model\?t=/);
    assert.ok(kv.size >= 2);
  } finally {
    globalThis.fetch = original;
  }
});

test("safe confirmation pair reissue requires admin-to-payments service auth", async () => {
  const response = await handleConfirmationReissue(new Request("https://sigil.mmdbkk.com/v1/internal/confirm/reissue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "sess_fixture" }),
  }), { AUTH_SERVICE_ADMIN_TO_PAYMENTS: "service-test" });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "service_auth_required");
});


test("model-only confirmation reissue rotates only the Model URL", async () => {
  const kv = new Map();
  const patches = [];
  const env = {
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_API_KEY: "airtable-test",
    AIRTABLE_TABLE_SESSIONS: "tblC98mKWbzmPuNzX",
    AIRTABLE_TABLE_PAYMENTS: "tblWGGJJOx5eBvBZJ",
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "service-test",
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "signing-secret-for-confirmation-reissue-test",
    PAY_TOKEN_TTL_SECONDS: "3600",
    WEB_BASE_URL: "https://mmdbkk.com",
    PAY_SESSIONS_KV: {
      async put(key, value) { kv.set(key, value); },
      async get(key) { return kv.get(key) || null; },
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.includes("tblC98mKWbzmPuNzX")) {
      return Response.json({ records: [{
        id: "recSession",
        fields: {
          fldLTq2kZbyRv22IA: "sess_fixture",
          fldojgjSQLaO0uQLX: "pay_fixture",
          fldi9ZdoiUXzSv1rI: "https://mmdbkk.com/sigil/confirm/job-confirmation?t=keep-customer",
          fld0mFma9J9yfEaKb: "https://mmdbkk.com/sigil/confirm/job-model?t=old-model",
        },
      }] });
    }
    if (request.method === "GET" && url.pathname.includes("tblWGGJJOx5eBvBZJ")) {
      return Response.json({ records: [{ id: "recPayment", fields: { fldOO6SY49iDw8VBZ:"pay_fixture", fldrr9g8ZZjqAbdKQ:"deposit" } }] });
    }
    if (request.method === "PATCH" && url.pathname.includes("tblC98mKWbzmPuNzX/recSession")) {
      const body = await request.json(); patches.push(body.fields);
      return Response.json({ id:"recSession", fields:body.fields });
    }
    throw new Error("unexpected_fetch:" + request.method + ":" + request.url);
  };
  try {
    const response = await handleModelConfirmationReissue(new Request("https://payments.internal/v1/internal/confirm/reissue-model", {
      method:"POST",
      headers:{ "content-type":"application/json", "x-internal-token":"service-test" },
      body:JSON.stringify({ session_id:"sess_fixture" }),
    }), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.customer_confirmation_url_mutated, false);
    assert.equal(body.payment_state_mutated, false);
    assert.match(body.model_confirmation_url, /^https:\/\/mmdbkk\.com\/sigil\/confirm\/job-model\?t=/);
    assert.equal(patches.length, 1);
    assert.deepEqual(Object.keys(patches[0]), ["fld0mFma9J9yfEaKb"]);
    assert.ok(kv.size >= 1);
  } finally {
    globalThis.fetch = original;
  }
});
