import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";

// An intent that does not name a method must not claim one; a named method maps to the Airtable option.
async function createIntent(extra) {
  const originalFetch = globalThis.fetch;
  let created = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    if (init.method === "GET") return Response.json({ records: [] });
    if (init.method === "POST") {
      created = { id: "rec_payment", fields: JSON.parse(init.body).records[0].fields };
      return Response.json({ records: [created] });
    }
    throw new Error(`unexpected request: ${init.method} ${url}`);
  };
  const env = { AIRTABLE_BASE_ID: "base_test", AIRTABLE_API_KEY: "test_key", AIRTABLE_TABLE_PAYMENTS: "Payments", AIRTABLE_TABLE_SESSIONS: "Sessions", INTERNAL_TOKEN: "test_internal_token" };
  try {
    const response = await worker.fetch(new Request("https://payments.internal/v1/pay/verify", {
      method: "POST",
      body: JSON.stringify({ session_id: "sess_method_1", payment_stage: "membership", amount: 2500, package_code: "premium", payment_ref: "pay_method_1", ...extra }),
    }), env);
    assert.equal(response.status, 200);
    return created.fields;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("payment intent without a method leaves Payment Method unset", async () => {
  const fields = await createIntent({});
  assert.equal(Object.hasOwn(fields, "Payment Method"), false);
  assert.equal(fields["Payment Status"], "Pending");
});

test("payment intent maps a named method to the Airtable option", async () => {
  assert.equal((await createIntent({ payment_method: "bank_transfer" }))["Payment Method"], "Bank Transfer");
  assert.equal((await createIntent({ payment_method: "paypal_card" }))["Payment Method"], "Credit Card");
  assert.equal((await createIntent({ payment_method: "promptpay" }))["Payment Method"], "PromptPay");
});
