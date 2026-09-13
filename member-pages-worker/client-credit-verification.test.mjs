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
