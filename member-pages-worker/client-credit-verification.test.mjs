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
      "Reserved Amount THB": 0,
      "Credit Type": "carried_forward_deposit",
      "Credit Authority": "payment_authority",
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

test("Double Moment bonus requires campaign authority and exact v1 policy", () => {
  const bonus = record({
    credit_id: "credit_double_moment_bonus_1",
    "Credit Type": "bonus_credit",
    "Credit Authority": "campaign_worker",
    "Campaign ID": "promo_double_moment_sep2026",
    "Campaign Claim ID": "claim_double_moment_001",
    "Policy Version": "v1",
    "Original Amount THB": 3500,
    "Available Amount THB": 3500,
    "Applied Amount THB": 0,
    "Reserved Amount THB": 0,
    "Verified Amount THB": 0,
    "Backing Payment Amount THB": 20000,
    "Bonus Sequence": 1,
    "Minimum Service Amount THB": 20000,
  });
  assert.equal(isVerifiedClientCreditRecord(bonus), true);
  assert.equal(isVerifiedClientCreditRecord(record({ ...bonus.fields, "Campaign Claim ID": "" })), false);
  assert.equal(isVerifiedClientCreditRecord(record({ ...bonus.fields, "Bonus Sequence": 3 })), false);
  assert.equal(isVerifiedClientCreditRecord(record({ ...bonus.fields, "Backing Payment Amount THB": 19999 })), false);
});

test("credit response separates paid, bonus, and carried-forward balances", () => {
  const paid = record({
    credit_id: "credit_double_moment_paid",
    "Credit Type": "paid_credit",
    "Credit Authority": "payment_authority",
    "Original Amount THB": 20000,
    "Available Amount THB": 20000,
    "Verified Amount THB": 20000,
  });
  const bonus = record({
    credit_id: "credit_double_moment_bonus_1",
    "Credit Type": "bonus_credit",
    "Credit Authority": "campaign_worker",
    "Campaign ID": "promo_double_moment_sep2026",
    "Campaign Claim ID": "claim_double_moment_001",
    "Policy Version": "v1",
    "Original Amount THB": 3500,
    "Available Amount THB": 3500,
    "Verified Amount THB": 0,
    "Backing Payment Amount THB": 20000,
    "Bonus Sequence": 1,
    "Minimum Service Amount THB": 20000,
  });
  const result = verifiedCreditsFromRecords([paid, bonus, record()]);
  assert.deepEqual(result.buckets, {
    paidAvailableThb: 20000,
    bonusAvailableThb: 3500,
    carriedForwardAvailableThb: 8250,
  });
  assert.equal(result.availableBalanceThb, 31750);
});
