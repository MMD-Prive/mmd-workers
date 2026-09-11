import test from "node:test";
import assert from "node:assert/strict";
import {
  PAYMENT_INSTRUCTIONS_PATH,
  handlePaymentInstructions,
  isPaymentInstructionsRequest,
} from "./payment-instructions-v1.js";

const ORIGIN = "https://mmdbkk.com";

function request(body = { t: "signed-customer-token" }) {
  return new Request(`https://sigil.mmdbkk.com${PAYMENT_INSTRUCTIONS_PATH}`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function details(payment = {}) {
  return {
    ok: true,
    session_id: "sess_test",
    payment_ref: "pay_test",
    payment: {
      stage: "final",
      amount_due_thb: 30000,
      proof_received: false,
      verified: false,
      ...payment,
    },
  };
}

function config(fields = {}) {
  return {
    records: [{
      id: "rec_payment_instruction",
      fields: {
        Status: "active",
        Version: 1,
        "PromptPay Ref": "0899999999",
        "Bank Provider": "test_bank",
        "Bank Name TH": "ธนาคารทดสอบ",
        "Bank Name EN": "Test Bank",
        "Account Name TH": "ผู้รับทดสอบ",
        "Account Name EN": "Test Receiver",
        "Account Number": "1112223334",
        "PayPal URL": "https://www.paypal.com/example",
        Methods: ["promptpay", "bank_transfer", "paypal_card"],
        "QR Strategy": "dynamic_amount",
        "Effective From": "2026-01-01T00:00:00.000Z",
        ...fields,
      },
    }],
  };
}

function envWith(payload = config()) {
  return {
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_PAYMENT_INSTRUCTIONS: "tbl_test",
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_HTTP: {
      async fetch() {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  };
}

function detailsFetcher(payload = details(), status = 200, inspect = null) {
  return async (req) => {
    if (inspect) await inspect(req);
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": ORIGIN,
        Vary: "Origin",
      },
    });
  };
}

test("recognizes only the payment instructions route", () => {
  assert.equal(isPaymentInstructionsRequest(PAYMENT_INSTRUCTIONS_PATH, "POST"), true);
  assert.equal(isPaymentInstructionsRequest(PAYMENT_INSTRUCTIONS_PATH, "OPTIONS"), true);
  assert.equal(isPaymentInstructionsRequest("/v1/confirm/details", "POST"), false);
});

test("forces customer confirmation validation and returns current-stage amount", async () => {
  let validatedAsCustomer = false;
  const response = await handlePaymentInstructions(
    request({ t: "signed-customer-token", expected_role: "model" }),
    envWith(),
    detailsFetcher(details(), 200, async (req) => {
      const body = await req.json();
      validatedAsCustomer = body.expected_role === "customer" && body.t === "signed-customer-token";
    }),
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(validatedAsCustomer, true);
  assert.equal(payload.available, true);
  assert.equal(payload.stage, "final");
  assert.equal(payload.amount_due_thb, 30000);
  assert.equal(payload.instructions.promptpay.display_ref, "089-999-9999");
  assert.match(payload.instructions.promptpay.qr_url, /\/30000\.00\.png$/);
  assert.equal(payload.instructions.bank_transfer.account_number, "1112223334");
  assert.equal(payload.instructions.paypal_card.enabled, true);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
});

test("does not reveal destination data after proof is received", async () => {
  const response = await handlePaymentInstructions(
    request(),
    envWith(),
    detailsFetcher(details({ proof_received: true })),
  );
  const raw = await response.text();
  const payload = JSON.parse(raw);
  assert.equal(payload.available, false);
  assert.equal(payload.reason, "proof_received_waiting_verification");
  assert.equal("instructions" in payload, false);
  assert.doesNotMatch(raw, /1112223334|0899999999|paypal\.com/);
});

test("does not reveal destination data after official verification", async () => {
  const response = await handlePaymentInstructions(
    request(),
    envWith(),
    detailsFetcher(details({ verified: true })),
  );
  const payload = await response.json();
  assert.equal(payload.available, false);
  assert.equal(payload.reason, "payment_verified");
  assert.equal("instructions" in payload, false);
});

test("fails closed when server-side payment instructions are unavailable", async () => {
  const response = await handlePaymentInstructions(
    request(),
    envWith({ records: [] }),
    detailsFetcher(),
  );
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.error, "payment_instructions_unavailable");
});

test("propagates signed confirmation rejection before reading payment configuration", async () => {
  let airtableCalled = false;
  const env = envWith();
  env.AIRTABLE_HTTP.fetch = async () => {
    airtableCalled = true;
    return new Response(JSON.stringify(config()));
  };
  const response = await handlePaymentInstructions(
    request({ t: "bad-token" }),
    env,
    detailsFetcher({ ok: false, error: "invalid_confirmation_token" }, 401),
  );
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error, "invalid_confirmation_token");
  assert.equal(airtableCalled, false);
});
