import assert from "node:assert/strict";
import test from "node:test";

import {
  commitEmailLessLineRenewalMoneyTruth,
  isEmailLessLineRenewalMoneyTruth,
} from "./reviewed-proof-canonical-money-truth.js";

const PAYMENT_REF = "016250213558COR01485";
const PAYMENTS_TABLE = "tblWGGJJOx5eBvBZJ";
const PAYMENT_REF_FIELD = "fldOO6SY49iDw8VBZ";
const FORMULA_PAYMENT_REF_FIELD = "fldk24YxRR0JC0cce";

function recoveryBody() {
  return {
    payment_ref: PAYMENT_REF,
    payment_stage: "membership",
    amount_thb: 2500,
    package_code: "premium",
    payment_method: "promptpay",
    paid_at: "2026-09-07",
    notes: "payment_review_console proof_id=line_recovery_20260907_winnie_2500; reviewed_by=per; recovered_member_id=inn; line_identity=U9231a8783d5d7535343b790bb735642c",
  };
}

function harness({ existing = null } = {}) {
  const writes = [];
  const airtableFetch = async (request) => {
    const req = request instanceof Request ? request : new Request(request);
    const url = new URL(req.url);

    if (req.method === "GET") {
      assert.equal(decodeURIComponent(url.pathname.split("/").at(-1)), PAYMENTS_TABLE);
      assert.match(url.searchParams.get("filterByFormula") || "", /Payment Reference/);
      return Response.json({ records: existing ? [existing] : [] });
    }

    const body = await req.json();
    if (req.method === "POST") {
      const fields = body.records?.[0]?.fields || {};
      writes.push({ method: "POST", fields });
      return Response.json({ records: [{ id: "recPAYMENTCANON01", fields }] }, { status: 201 });
    }

    if (req.method === "PATCH") {
      writes.push({ method: "PATCH", fields: body.fields || {} });
      return Response.json({ id: existing?.id || "recPAYMENTCANON01", fields: body.fields || {} });
    }

    return Response.json({ error: "method_not_allowed" }, { status: 405 });
  };

  return {
    env: {
      AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
      AIRTABLE_API_KEY: "pat-test",
      AIRTABLE_TABLE_PAYMENTS: PAYMENTS_TABLE,
      AIRTABLE_HTTP: { fetch: airtableFetch },
      AT_PAYMENTS__PAYMENT_REF: PAYMENT_REF_FIELD,
      AT_PAYMENTS__PAYMENT_DATE: "fld3yAwxIu2dkw7fO",
      AT_PAYMENTS__AMOUNT: "fldvCSwrUW8OMAooS",
      AT_PAYMENTS__PAYMENT_STATUS: "fldEJ1hmm7KwWuI6q",
      AT_PAYMENTS__PAYMENT_METHOD: "fldsblzIn0wzan3c9",
      AT_PAYMENTS__NOTES: "fldjsZIKoJPawlb2u",
      AT_PAYMENTS__VERIFICATION_STATUS: "fldJ7a0Ube9F0bmRy",
      AT_PAYMENTS__PAYMENT_INTENT_STATUS: "fld04fr3bRJTohO6y",
      AT_PAYMENTS__PACKAGE_CODE: "fldfyHYVrzbGPvMJR",
      AT_PAYMENTS__CREATED_AT: "flduxcPpowBxEZSLu",
    },
    writes,
  };
}

test("recovered email-less renewal is recognized narrowly", () => {
  assert.equal(isEmailLessLineRenewalMoneyTruth(recoveryBody()), true);
  assert.equal(isEmailLessLineRenewalMoneyTruth({ ...recoveryBody(), member_email: "member@example.com" }), false);
  assert.equal(isEmailLessLineRenewalMoneyTruth({ ...recoveryBody(), payment_stage: "deposit" }), false);
});

test("reviewed recovery writes canonical Payment Reference and never formula payment_ref", async () => {
  const h = harness();
  const response = await commitEmailLessLineRenewalMoneyTruth(h.env, recoveryBody());
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.authority, "payments-worker");
  assert.equal(result.payment_ref, PAYMENT_REF);
  assert.equal(result.payment_write.mode, "create");
  assert.equal(h.writes.length, 1);

  const fields = h.writes[0].fields;
  assert.equal(fields[PAYMENT_REF_FIELD], PAYMENT_REF);
  assert.equal(fields.fldvCSwrUW8OMAooS, 2500);
  assert.equal(fields.fldEJ1hmm7KwWuI6q, "Paid");
  assert.equal(fields.fldJ7a0Ube9F0bmRy, "verified");
  assert.equal(fields.fld04fr3bRJTohO6y, "Confirmed");
  assert.equal(fields.fldfyHYVrzbGPvMJR, "premium");
  assert.equal(Object.hasOwn(fields, "payment_ref"), false);
  assert.equal(Object.hasOwn(fields, FORMULA_PAYMENT_REF_FIELD), false);
});

test("same canonical payment reference is updated idempotently instead of duplicated", async () => {
  const existing = {
    id: "recEXISTINGPAY001",
    fields: { "Payment Reference": PAYMENT_REF, Amount: 2500, "Payment Status": "Pending" },
  };
  const h = harness({ existing });
  const response = await commitEmailLessLineRenewalMoneyTruth(h.env, recoveryBody());
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.equal(result.idempotent, true);
  assert.equal(result.payment_write.mode, "update");
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].method, "PATCH");
  assert.equal(h.writes[0].fields[PAYMENT_REF_FIELD], PAYMENT_REF);
});
