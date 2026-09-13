import test from "node:test";
import assert from "node:assert/strict";

import {
  isVerifiedClientCreditRecord,
  verifiedCreditsFromRecords,
} from "./src/member-app-client-credits.js";

function record(overrides = {}) {
  return {
    fields: {
      credit_id: "CRD-recPAYMENT000001",
      Status: "available",
      "Original Amount THB": 8250,
      "Available Amount THB": 8250,
      "Applied Amount THB": 0,
      "Verification Status": "verified",
      "Verification Source": "payment_authority",
      "Verified Amount THB": 8250,
      "Verified By": "payments-worker",
      "Verification Ref": "verify-internal-123",
      "Verification Snapshot JSON": "{\"internal\":true}",
      Reason: "client_cancel_gt_48h",
      "Customer Display Note": "พร้อมใช้กับการจองครั้งถัดไป",
      "Created At": "2026-09-13T12:00:00.000Z",
      ...overrides,
    },
  };
}

test("payment-authority verified credit passes the verification invariant", () => {
  assert.equal(isVerifiedClientCreditRecord(record()), true);
});

test("pending/manual/underfunded credits fail closed", () => {
  assert.equal(isVerifiedClientCreditRecord(record({ "Verification Status": "pending_review" })), false);
  assert.equal(isVerifiedClientCreditRecord(record({ "Verification Source": "admin_review" })), false);
  assert.equal(isVerifiedClientCreditRecord(record({ "Verified Amount THB": 8000 })), false);
  assert.equal(isVerifiedClientCreditRecord(record({ "Available Amount THB": 9000 })), false);
});

test("member balance sums only verified active credits", () => {
  const result = verifiedCreditsFromRecords([
    record(),
    record({ credit_id: "CRD-recPAYMENT000002", "Verification Status": "pending_review", "Original Amount THB": 1000, "Available Amount THB": 1000, "Verified Amount THB": 1000 }),
    record({ credit_id: "CRD-recPAYMENT000003", Status: "used", "Available Amount THB": 0, "Applied Amount THB": 8250 }),
  ]);
  assert.equal(result.availableBalanceThb, 8250);
  assert.equal(result.items.length, 2);
  assert.equal(result.items.every((item) => item.verified === true), true);
});

test("customer-safe output never leaks verification or internal reason metadata", () => {
  const result = verifiedCreditsFromRecords([record()]);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("verify-internal-123"), false);
  assert.equal(serialized.includes("payments-worker"), false);
  assert.equal(serialized.includes("Verification Snapshot"), false);
  assert.equal(serialized.includes("client_cancel_gt_48h"), false);
  assert.equal(result.items[0]?.verificationState, "verified");
});

const DEADLINE = Date.parse("2026-12-12T16:59:59.999Z");
const cancellation = (extra = {}) => record({
  "Credit Type": "carried_forward_deposit",
  Reason: "client_cancel_no_penalty",
  "Expires At": new Date(DEADLINE).toISOString(),
  "Customer Display Note": "งานยกเลิกแล้ว เครดิตคงเหลือใช้ได้ภายใน 90 วัน",
  ...extra,
});

test("cancellation credit projects the exact live adapter trust and deadline contract", () => {
  const result = verifiedCreditsFromRecords([cancellation()], DEADLINE - 1);
  const item = result.items[0];
  assert.equal(result.availableBalanceThb, 8250);
  assert.equal(item.verificationStatus, "verified");
  assert.equal(item.verifiedAmountThb, 8250);
  assert.equal(item.creditType, "carried_forward_deposit");
  assert.equal(item.expiresAt, "2026-12-12T16:59:59.999Z");
  assert.equal(item.noticeType, "cancelled_deposit_credit");
  assert.equal(item.customerDisplayNote, item.note);
});

test("credit is valid through the inclusive Bangkok deadline, unavailable afterwards", () => {
  assert.equal(verifiedCreditsFromRecords([cancellation()], DEADLINE).availableBalanceThb, 8250);
  const expired = verifiedCreditsFromRecords([cancellation()], DEADLINE + 1);
  assert.equal(expired.availableBalanceThb, 0);
  assert.equal(expired.items[0].status, "expired");
  assert.equal(expired.items[0].availableAmountThb, 0);
  assert.equal(expired.items[0].originalAmountThb, 8250);
});

test("invalid explicit expiry fails closed without deleting the audit amount", () => {
  const result = verifiedCreditsFromRecords([cancellation({"Expires At": "bad-date"})]);
  assert.equal(result.availableBalanceThb, 0);
  assert.equal(result.items[0].status, "unknown");
  assert.equal(result.items[0].expiryState, "checking");
  assert.equal(result.items[0].originalAmountThb, 8250);
});

test("legacy undated credit remains compatible and has no cancellation notice inference", () => {
  const result = verifiedCreditsFromRecords([record()], DEADLINE + 1);
  assert.equal(result.availableBalanceThb, 8250);
  assert.equal(result.items[0].expiresAt, null);
  assert.equal(result.items[0].noticeType, null);
});

test("repeated reads never mutate balances, source sessions, payments, or points", () => {
  const input = [cancellation()];
  const original = JSON.stringify(input);
  assert.deepEqual(verifiedCreditsFromRecords(input, DEADLINE - 1), verifiedCreditsFromRecords(input, DEADLINE - 1));
  assert.equal(JSON.stringify(input), original);
  assert.equal(JSON.stringify(verifiedCreditsFromRecords(input, DEADLINE - 1)).includes("points"), false);
});

test("unverified cancellation cannot emit usable money or a notice", () => {
  const result = verifiedCreditsFromRecords([cancellation({"Verification Status": "pending_review"})]);
  assert.deepEqual(result.items, []);
  assert.equal(result.availableBalanceThb, 0);
});
