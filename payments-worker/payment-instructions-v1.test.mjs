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
        "Instruction ID": "mmd_payment_primary_v1",
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
        "Card Fee Percent": 4,
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
  assert.equal(payload.instructions.paypal_card.fee_percent, 4);
  assert.equal(payload.instructions.paypal_card.fee_thb, 1200);
  assert.equal(payload.instructions.paypal_card.service_amount_thb, 30000);
  assert.equal(payload.instructions.paypal_card.amount_due_thb, 31200);
  assert.equal(payload.instructions.paypal_card.fee_scope, "processing_fee_only");
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


test("defaults PayPal card processing fee to 4% when config omits it", async () => {
  const response = await handlePaymentInstructions(
    request(),
    envWith(config({ "Card Fee Percent": undefined })),
    detailsFetcher(details({ amount_due_thb: 10000 })),
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.instructions.paypal_card.fee_percent, 4);
  assert.equal(payload.instructions.paypal_card.fee_thb, 400);
  assert.equal(payload.instructions.paypal_card.amount_due_thb, 10400);
});


test("shop payment reads only the HIMAI Shop payment-instruction profile", async () => {
  let formula = "";
  const env = envWith({
    records: [
      {
        id: "rec_primary",
        fields: {
          "Instruction ID": "mmd_payment_primary_v1",
          Status: "active",
          Version: 9,
          "Bank Provider": "primary_bank",
          "Bank Name TH": "Primary Bank",
          "Account Name TH": "Primary Receiver",
          "Account Number": "9999999999",
          Methods: ["bank_transfer"],
          "Effective From": "2026-01-01T00:00:00.000Z",
        },
      },
      {
        id: "rec_shop",
        fields: {
          "Instruction ID": "mmd_shop_himai_v1",
          Status: "active",
          Version: 0,
          "Bank Provider": "shop_bank",
          "Bank Name TH": "Shop Bank",
          "Account Name TH": "Shop Receiver",
          "Account Number": "1234500000",
          Methods: ["bank_transfer"],
          "Effective From": "2026-01-01T00:00:00.000Z",
        },
      },
    ],
  });
  env.AIRTABLE_HTTP.fetch = async (input) => {
    formula = new URL(String(input)).searchParams.get("filterByFormula") || "";
    return Response.json({
      records: [{
        id: "rec_shop",
        fields: {
          "Instruction ID": "mmd_shop_himai_v1",
          Status: "active",
          Version: 0,
          "Bank Provider": "shop_bank",
          "Bank Name TH": "Shop Bank",
          "Account Name TH": "Shop Receiver",
          "Account Number": "1234500000",
          Methods: ["bank_transfer"],
          "Effective From": "2026-01-01T00:00:00.000Z",
        },
      }],
    });
  };

  const response = await handlePaymentInstructions(
    request(),
    env,
    detailsFetcher({
      ...details({ stage: "shop", amount_due_thb: 1500 }),
      payment_type: "shop",
      shop_order: { order_id: "ORDER-1" },
    }),
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.instruction_profile, "mmd_shop_himai_v1");
  assert.equal(payload.instructions.bank_transfer.enabled, true);
  assert.equal(payload.instructions.bank_transfer.account_number, "1234500000");
  assert.equal(payload.instructions.promptpay.enabled, false);
  assert.equal(payload.instructions.paypal_card.enabled, false);
  assert.match(formula, /mmd_shop_himai_v1/);
  assert.doesNotMatch(JSON.stringify(payload), /9999999999|Primary Receiver/);
});

test("shop payment supports server-configured static QR with customer-entered amount plus bank transfer", async () => {
  const env = envWith();
  env.AIRTABLE_HTTP.fetch = async () => Response.json({
    records: [{
      id: "rec_shop",
      fields: {
        "Instruction ID": "mmd_shop_himai_v1",
        Status: "active",
        Version: 1,
        "Bank Provider": "kbank",
        "Bank Name TH": "ธนาคารกสิกรไทย",
        "Account Name TH": "ธัชชะ ป.",
        "Account Number": "0681900357",
        Methods: ["promptpay", "bank_transfer"],
        "QR Strategy": "static_url",
        "QR Image URL": "https://assets.example.test/himai-open-amount-qr.png",
        "Effective From": "2026-09-21T00:00:00.000Z",
      },
    }],
  });

  const response = await handlePaymentInstructions(
    request(),
    env,
    detailsFetcher({
      ...details({ stage: "shop", amount_due_thb: 2500 }),
      payment_type: "shop",
      shop_order: { order_id: "ORDER-QR-1" },
    }),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.instruction_profile, "mmd_shop_himai_v1");
  assert.equal(payload.instructions.promptpay.enabled, true);
  assert.equal(payload.instructions.promptpay.qr_url, "https://assets.example.test/himai-open-amount-qr.png");
  assert.equal(payload.instructions.promptpay.qr_strategy, "static_url");
  assert.equal(payload.instructions.promptpay.amount_entry, "customer_manual");
  assert.equal(payload.instructions.bank_transfer.enabled, true);
  assert.equal(payload.instructions.bank_transfer.account_number, "0681900357");
  assert.equal(payload.instructions.paypal_card.enabled, false);
  assert.doesNotMatch(JSON.stringify(payload), /promptpay\.io\/|\/2500\.00\.png/);
});

test("service payment without a job profile row stays on the primary instruction profile", async () => {
  let formula = "";
  const env = envWith();
  env.AIRTABLE_HTTP.fetch = async (input) => {
    formula = new URL(String(input)).searchParams.get("filterByFormula") || "";
    return Response.json(config());
  };
  const response = await handlePaymentInstructions(request(), env, detailsFetcher(details()));
  const payload = await response.json();
  assert.equal(payload.instruction_profile, "mmd_payment_primary_v1");
  assert.match(formula, /mmd_payment_primary_v1/);
});

test("does not expose payment methods when shop reservation is no longer accepting payment", async () => {
  let airtableCalled = false;
  const env = envWith();
  env.AIRTABLE_HTTP.fetch = async () => {
    airtableCalled = true;
    return new Response(JSON.stringify(config()));
  };
  const response = await handlePaymentInstructions(
    request(),
    env,
    detailsFetcher(details({ accepting_payment: false, amount_due_thb: 0 })),
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.available, false);
  assert.equal(payload.reason, "payment_not_accepting");
  assert.equal("instructions" in payload, false);
  assert.equal(airtableCalled, false);
});

function profileRow(instructionId, accountNumber, extra = {}) {
  return {
    id: `rec_${instructionId}`,
    fields: {
      "Instruction ID": instructionId,
      Status: "active",
      Version: 1,
      "PromptPay Ref": "0899999999",
      "Bank Provider": `${instructionId}_bank`,
      "Bank Name TH": `ธนาคาร ${instructionId}`,
      "Account Name TH": "ผู้รับทดสอบ",
      "Account Number": accountNumber,
      "PayPal URL": "https://www.paypal.com/example",
      Methods: ["promptpay", "bank_transfer", "paypal_card"],
      "QR Strategy": "dynamic_amount",
      "Effective From": "2026-01-01T00:00:00.000Z",
      ...extra,
    },
  };
}

function envWithRows(rows, queried = []) {
  const env = envWith();
  env.AIRTABLE_HTTP.fetch = async (input) => {
    queried.push(new URL(String(input)).searchParams.get("filterByFormula") || "");
    return Response.json({ records: rows });
  };
  return env;
}

const ALL_PROFILES = () => [
  profileRow("mmd_payment_primary_v1", "1111111111"),
  profileRow("mmd_job_v1", "2222222222"),
  profileRow("mmd_membership_v1", "3333333333"),
  profileRow("mmd_shop_himai_v1", "4444444444"),
];

async function instructionsFor(detailsPayload, rows = ALL_PROFILES(), queried = []) {
  const response = await handlePaymentInstructions(request(), envWithRows(rows, queried), detailsFetcher(detailsPayload));
  assert.equal(response.status, 200);
  return response.json();
}

test("job stages use the job profile, not the membership or primary account", async () => {
  for (const stage of ["deposit", "balance", "final", "full"]) {
    const payload = await instructionsFor(details({ stage }));
    assert.equal(payload.instruction_profile, "mmd_job_v1", stage);
    assert.equal(payload.instructions.bank_transfer.account_number, "2222222222", stage);
    assert.doesNotMatch(JSON.stringify(payload), /1111111111|3333333333|4444444444/);
  }
});

test("session extension payment uses the job profile", async () => {
  const payload = await instructionsFor({ ...details({ stage: "" }), payment_type: "extension" });
  assert.equal(payload.instruction_profile, "mmd_job_v1");
  assert.equal(payload.instructions.bank_transfer.account_number, "2222222222");
});

test("membership, renewal and black card payments use the membership profile", async () => {
  for (const paymentType of ["membership", "renewal", "blackcard", "black_card", "red_card", "elite", "mmd_member"]) {
    const payload = await instructionsFor({ ...details({ stage: "" }), payment_type: paymentType });
    assert.equal(payload.instruction_profile, "mmd_membership_v1", paymentType);
    assert.equal(payload.instructions.bank_transfer.account_number, "3333333333", paymentType);
    assert.doesNotMatch(JSON.stringify(payload), /1111111111|2222222222|4444444444/);
  }
});

test("public membership purchase sessions use the membership profile", async () => {
  const payload = await instructionsFor({ ...details({ stage: "" }), session_id: "publicmem_elite_abc123", payment_type: "" });
  assert.equal(payload.instruction_profile, "mmd_membership_v1");
  assert.equal(payload.instructions.bank_transfer.account_number, "3333333333");
});

test("job and membership payments fall back to the primary profile until their own row exists", async () => {
  const onlyPrimary = [profileRow("mmd_payment_primary_v1", "1111111111")];
  const queried = [];
  const job = await instructionsFor(details({ stage: "final" }), onlyPrimary, queried);
  assert.equal(job.instruction_profile, "mmd_payment_primary_v1");
  assert.equal(job.instructions.bank_transfer.account_number, "1111111111");
  assert.match(queried[0], /mmd_job_v1/);
  assert.match(queried[queried.length - 1], /mmd_payment_primary_v1/);

  const membership = await instructionsFor({ ...details({ stage: "" }), payment_type: "membership" }, onlyPrimary);
  assert.equal(membership.instruction_profile, "mmd_payment_primary_v1");
  assert.equal(membership.instructions.bank_transfer.account_number, "1111111111");
});

test("a missing membership row never falls through to the job account", async () => {
  const rows = [profileRow("mmd_payment_primary_v1", "1111111111"), profileRow("mmd_job_v1", "2222222222")];
  const payload = await instructionsFor({ ...details({ stage: "" }), payment_type: "membership" }, rows);
  assert.equal(payload.instruction_profile, "mmd_payment_primary_v1");
  assert.doesNotMatch(JSON.stringify(payload), /2222222222/);
});

test("unknown item types stay on the primary profile and never read job or membership rows", async () => {
  const queried = [];
  const payload = await instructionsFor({ ...details({ stage: "" }), payment_type: "points_topup" }, ALL_PROFILES(), queried);
  assert.equal(payload.instruction_profile, "mmd_payment_primary_v1");
  assert.equal(payload.instructions.bank_transfer.account_number, "1111111111");
  assert.equal(queried.length, 1);
  assert.doesNotMatch(queried.join(" "), /mmd_job_v1|mmd_membership_v1/);
});

test("shop payments are unaffected by the job and membership profiles", async () => {
  const payload = await instructionsFor({ ...details({ stage: "shop", amount_due_thb: 1500 }), payment_type: "shop", shop_order: { order_id: "ORDER-9" } });
  assert.equal(payload.instruction_profile, "mmd_shop_himai_v1");
  assert.equal(payload.instructions.bank_transfer.account_number, "4444444444");
});

test("each profile controls its own methods (bank transfer can stay off for one profile)", async () => {
  const rows = [
    profileRow("mmd_payment_primary_v1", "1111111111", { Methods: ["promptpay", "paypal_card"] }),
    profileRow("mmd_job_v1", "2222222222"),
  ];
  const membership = await instructionsFor({ ...details({ stage: "" }), payment_type: "membership" }, rows);
  assert.equal(membership.instruction_profile, "mmd_payment_primary_v1");
  assert.equal(membership.instructions.bank_transfer.enabled, false);
  const job = await instructionsFor(details({ stage: "final" }), rows);
  assert.equal(job.instruction_profile, "mmd_job_v1");
  assert.equal(job.instructions.bank_transfer.enabled, true);
});
