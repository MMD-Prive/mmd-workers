import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";

test("membership intent stays pending until internal Official Verify", async () => {
  const originalFetch = globalThis.fetch;
  let payment = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    assert.equal(url.hostname, "api.airtable.com");
    const table = decodeURIComponent(url.pathname.split("/").at(-1));
    if (init.method === "GET") {
      return Response.json({ records: table === "Payments" && payment ? [payment] : [] });
    }
    if (init.method === "POST" || init.method === "PATCH") {
      assert.equal(table, init.method === "POST" ? "Payments" : "rec_payment");
      const body = JSON.parse(init.body);
      payment = { id: "rec_payment", fields: { ...payment?.fields, ...(body.records?.[0]?.fields || body.fields) } };
      return Response.json(init.method === "POST" ? { records: [payment] } : payment);
    }
    throw new Error(`unexpected request: ${init.method} ${url}`);
  };

  const env = {
    AIRTABLE_BASE_ID: "base_test",
    AIRTABLE_API_KEY: "test_key",
    AIRTABLE_TABLE_PAYMENTS: "Payments",
    AIRTABLE_TABLE_SESSIONS: "Sessions",
    INTERNAL_TOKEN: "test_internal_token",
  };
  try {
    const intent = await worker.fetch(new Request("https://payments.internal/v1/pay/verify", {
      method: "POST",
      body: JSON.stringify({ session_id: "signup_123", payment_stage: "membership", amount: 2999, package_code: "premium", payment_ref: "pay_signup_123" }),
    }), env);
    assert.equal(intent.status, 200);
    assert.equal((await intent.json()).verification_status, "pending");
    assert.equal(payment.fields["Payment Status"], "Pending");
    assert.equal(payment.fields["Verification Status"], "pending_review");
    assert.equal(payment.fields["Payment Intent Status"], "Pending Confirmation");

    const verified = await worker.fetch(new Request("https://payments.internal/v1/payments/notify", {
      method: "POST",
      headers: { "X-Internal-Token": "test_internal_token" },
      body: JSON.stringify({ session_id: "signup_123", payment_stage: "membership", amount_thb: 2999, package_code: "premium", payment_ref: "pay_signup_123", receipt_url: "https://example.test/reviewed-slip" }),
    }), env);
    assert.equal(verified.status, 200, await verified.text());
    assert.equal(payment.fields["Payment Status"], "Paid");
    assert.equal(payment.fields["Verification Status"], "verified");
    assert.equal(payment.fields["Payment Intent Status"], "Confirmed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
