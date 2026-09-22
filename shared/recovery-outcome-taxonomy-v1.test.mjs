import test from "node:test";
import assert from "node:assert/strict";

import {
  RECOVERY_OUTCOME_TAXONOMY_VERSION,
  inferRecoveryDomain,
  isTerminalRecoveryOutcome,
  normalizeRecoveryDomain,
  recoveryOutcomeAllowed,
  recoveryOutcomeCodesForDomain,
  recoveryOutcomeLabel,
} from "./recovery-outcome-taxonomy-v1.mjs";

test("recovery taxonomy keeps one lifecycle across Shop Booking and MMS", () => {
  assert.equal(RECOVERY_OUTCOME_TAXONOMY_VERSION, "mmd-recovery-outcome-taxonomy-v1-20260919");
  assert.equal(recoveryOutcomeAllowed("mmd_shop", "intake_received", "sent"), true);
  assert.equal(recoveryOutcomeAllowed("booking", "intake_received", "reviewing"), true);
  assert.equal(recoveryOutcomeAllowed("mms", "intake_received", "acknowledged"), true);
});

test("terminal outcomes require resolved or customer_notified state", () => {
  assert.equal(recoveryOutcomeAllowed("mmd_shop", "reshipment_arranged", "reviewing"), false);
  assert.equal(recoveryOutcomeAllowed("mmd_shop", "reshipment_arranged", "resolved"), true);
  assert.equal(isTerminalRecoveryOutcome("booking", "rebooking_arranged"), true);
  assert.equal(isTerminalRecoveryOutcome("mms", "awaiting_customer"), false);
});

test("domain-specific outcomes stay bounded", () => {
  assert.equal(recoveryOutcomeAllowed("mmd_shop", "therapist_replacement_arranged", "resolved"), false);
  assert.equal(recoveryOutcomeAllowed("mms", "therapist_replacement_arranged", "resolved"), true);
  assert.equal(recoveryOutcomeAllowed("booking", "refund_completed", "resolved"), false);
  assert.equal(recoveryOutcomeLabel("mmd_shop", "refund_route_opened"), "ส่งเข้ากระบวนการ Refund แล้ว");
});

test("domain inference is deterministic and never guesses outside supported lanes", () => {
  assert.equal(inferRecoveryDomain("GG Water ยังไม่ถึง"), "mmd_shop");
  assert.equal(inferRecoveryDomain("Therapist มาสายครับ"), "mms");
  assert.equal(inferRecoveryDomain("งาน booking พรุ่งนี้มีปัญหา"), "booking");
  assert.equal(inferRecoveryDomain("อยากให้ทีมช่วยดูเรื่องนี้"), "unclassified");
  assert.equal(normalizeRecoveryDomain("male massage"), "mms");
});

test("taxonomy never contains protected money-completion claims", () => {
  const all = ["unclassified", "mmd_shop", "booking", "mms"]
    .flatMap((domain) => recoveryOutcomeCodesForDomain(domain));
  assert.equal(all.includes("refund_completed"), false);
  assert.equal(all.includes("payment_confirmed"), false);
  assert.equal(all.includes("delivered"), false);
});
