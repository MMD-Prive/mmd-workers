import assert from "node:assert/strict";
import test from "node:test";

import {
  createConfirmTokenRecord,
  signConfirmToken,
} from "./index.js";
import { handleConfirmationDetails } from "./confirmation-details.js";

const F = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  sessionStatus: "fldmwuvOaiCFdzzRa",
  createdAt: "flduULqxy2FIuJuaf",
  amountThb: "fldhwC79ndbnEXSZz",
  paymentRef: "fldojgjSQLaO0uQLX",
  paymentStatus: "fldTY5lE6m0kQf72n",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  jobType: "fldjK3U9bghnj7xUe",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  googleMapUrl: "fldoUDQ8sH93idPx0",
  note: "fldEcDkF7CH9VixWM",
  payModelThb: "fldlTO5aNfqUmlNWm",
});

function kvStore() {
  const map = new Map();
  return {
    async put(key, value) { map.set(key, value); },
    async get(key) { return map.get(key) ?? null; },
  };
}

function sessionRecord() {
  return {
    id: "rec_session_test",
    fields: {
      [F.sessionId]: "sess_confirm_details_test",
      [F.sessionStatus]: "Pending",
      [F.createdAt]: "2026-09-09T12:00:00.000Z",
      [F.amountThb]: 40500,
      [F.paymentRef]: "pay_confirm_details_test",
      [F.paymentStatus]: "pending",
      [F.clientName]: "พี่ SVIP",
      [F.modelName]: "EMs21 · J Dye",
      [F.jobType]: "private:exclusive:straight:vip",
      [F.jobDate]: "2026-09-09",
      [F.startTime]: "2026-09-09T19:00:00+07:00",
      [F.endTime]: "2026-09-09T20:30:00+07:00",
      [F.locationName]: "The Chamber Resort",
      [F.googleMapUrl]: "https://maps.google.com/example",
      [F.payModelThb]: 5500,
      [F.note]: [
        "Handling: test only",
        "[Partner Attribution] internal only",
        "[SIGIL Pricing v1] {\"full_price_thb\":45000,\"discount_mode\":\"percent\",\"discount_percent\":10,\"discount_thb\":4500,\"net_price_thb\":40500,\"deposit_basis_thb\":45000,\"deposit_percent\":30,\"deposit_due_thb\":13500,\"deposit_received_thb\":13500,\"balance_thb\":27000}",
        "[SIGIL VIP Detail v1] {\"vip_detail\":\"vtop\"}",
      ].join("\n"),
    },
  };
}

async function envAndTokens() {
  const kv = kvStore();
  const env = {
    PAYMENT_CONFIRMATION_SIGNING_SECRET: "confirmation-details-test-secret",
    PAY_SESSIONS_KV: kv,
    PAY_TOKEN_TTL_SECONDS: "3600",
    ALLOWED_ORIGINS: "\"https://mmdbkk.com,https://www.mmdbkk.com\"",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_API_KEY: "pat_test",
    AIRTABLE_TABLE_SESSIONS: "tblC98mKWbzmPuNzX",
    AIRTABLE_HTTP: {
      async fetch() {
        return new Response(JSON.stringify({ records: [sessionRecord()] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  };
  const iat = Math.floor(Date.now() / 1000);
  const base = {
    session_id: "sess_confirm_details_test",
    payment_ref: "pay_confirm_details_test",
    payment_type: "full",
    iat,
    exp: iat + 3600,
  };
  const customerClaims = { ...base, kind: "customer_confirm", role: "customer" };
  const modelClaims = { ...base, kind: "model_confirm", role: "model" };
  const customerToken = await signConfirmToken(customerClaims, env.PAYMENT_CONFIRMATION_SIGNING_SECRET);
  const modelToken = await signConfirmToken(modelClaims, env.PAYMENT_CONFIRMATION_SIGNING_SECRET);
  await createConfirmTokenRecord(env, customerToken, customerClaims);
  await createConfirmTokenRecord(env, modelToken, modelClaims);
  return { env, customerToken, modelToken };
}

function post(token, role, origin = "https://www.mmdbkk.com") {
  return new Request("https://sigil.mmdbkk.com/v1/confirm/details", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify({ t: token, expected_role: role }),
  });
}

test("customer confirmation details expose customer pricing but not internal payout or notes", async () => {
  const { env, customerToken } = await envAndTokens();
  const response = await handleConfirmationDetails(post(customerToken, "customer"), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.role, "customer");
  assert.equal(data.session_id, "sess_confirm_details_test");
  assert.equal(data.model_name, "EMs21 · J Dye");
  assert.equal(data.client_name, "พี่ SVIP");
  assert.equal(data.amount_thb, 40500);
  assert.equal(data.pricing.full_price_thb, 45000);
  assert.equal(data.pricing.discount_thb, 4500);
  assert.equal(data.pricing.deposit_basis_thb, 45000);
  assert.equal(data.pricing.deposit_due_thb, 13500);
  assert.equal(data.vip_detail, "vtop");
  assert.equal("model_payout_thb" in data, false);
  assert.equal("note" in data, false);
  assert.equal("notes" in data, false);
  assert.equal(JSON.stringify(data).includes("Partner Attribution"), false);
});

test("model confirmation details expose model payout but not customer pricing", async () => {
  const { env, modelToken } = await envAndTokens();
  const response = await handleConfirmationDetails(post(modelToken, "model"), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.role, "model");
  assert.equal(data.amount_scope, "model_payout");
  assert.equal(data.model_payout_thb, 5500);
  assert.equal(data.amount_thb, 5500);
  assert.equal("pricing" in data, false);
  assert.equal(JSON.stringify(data).includes("45000"), false);
  assert.equal(JSON.stringify(data).includes("Partner Attribution"), false);
});

test("confirmation details reject cross-role tokens and untrusted origins", async () => {
  const { env, customerToken } = await envAndTokens();
  const crossRole = await handleConfirmationDetails(post(customerToken, "model"), env);
  assert.equal(crossRole.status, 401);
  assert.equal((await crossRole.json()).error, "invalid_confirmation_token_purpose");

  const wrongOrigin = await handleConfirmationDetails(post(customerToken, "customer", "https://example.com"), env);
  assert.equal(wrongOrigin.status, 403);
  assert.equal((await wrongOrigin.json()).error, "origin_not_allowed");
});
