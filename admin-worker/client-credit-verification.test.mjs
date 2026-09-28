import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./src/client-credit-admin-wrapper.js", import.meta.url), "utf8");
const refSource = readFileSync(new URL("./src/client-credit-ref-wrapper.js", import.meta.url), "utf8");

test("verified client credit schema fields are wired by stable Airtable field ids", () => {
  for (const fieldId of [
    "fldQW1Mzqyd8oilDc",
    "fld2Fr7uC8Urstmvd",
    "fldmmdSKcfT0dxIiu",
    "fldsqtVC8y215ZfT6",
    "fldTYIAc9xrNdA5Oe",
    "fldlwTOl5TeBl7P0I",
    "fldPBgoB8GGoSbc2x",
  ]) {
    assert.match(source, new RegExp(fieldId));
  }
});

test("payment verification gate precedes verified credit writes", () => {
  const paymentGate = source.indexOf("const money = officialPaymentState(payment)");
  const rejectionGate = source.indexOf("SOURCE_PAYMENT_NOT_VERIFIED");
  const verificationWrite = source.indexOf('[CREDIT.verificationStatus]: "verified"');
  const authorityWrite = source.indexOf("[CREDIT.verificationSource]: VERIFIED_CREDIT_SOURCE");
  assert.ok(paymentGate >= 0);
  assert.ok(rejectionGate > paymentGate);
  assert.ok(verificationWrite > rejectionGate);
  assert.ok(authorityWrite > rejectionGate);
});

test("verified amount is minted from authoritative received funds, not browser amount", () => {
  assert.match(source, /\[CREDIT\.verifiedAmount\]: money\.receivedThb/);
  assert.match(source, /CARRY_FORWARD_MUST_MATCH_RECEIVED/);
  assert.match(source, /Math\.abs\(requestedAmountThb - money\.receivedThb\)/);
});

test("admin available balance excludes unverified credits", () => {
  assert.match(source, /item\.verified === true && \["available", "partially_used"\]\.includes\(item\.status\)/);
});

test("historical proofs can be attached as provenance only after their reviewed handoff", () => {
  assert.match(refSource, /status === "verified" \|\| status === "reviewed"/);
  assert.match(refSource, /findOfficialSourceProofByRef/);
  assert.match(refSource, /carry-forward endpoint still independently/);
});
