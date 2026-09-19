import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./confirmation-ack.js", import.meta.url), "utf8");

test("customer confirmation promotes blank or pending Session Status to Confirmed", () => {
  assert.match(source, /sessionStatus:[\s\S]*fldmwuvOaiCFdzzRa/);
  assert.match(source, /function shouldPromoteCustomerStatus\(value\)[\s\S]*!normalized \|\| normalized === "pending"/);
  assert.match(source, /role === "customer" && shouldPromoteCustomerStatus/);
  assert.match(source, /patchFields\[fields\.sessionStatus\] = "Confirmed"/);
});

test("model confirmation seeds canonical Model lifecycle state without changing customer Session Status", () => {
  assert.match(source, /modelSessionState:[\s\S]*fld57fhdWqIcOy4Jp/);
  assert.match(source, /modelSessionStateUpdatedAt:[\s\S]*fldFJI1Leni6wvzR4/);
  assert.match(source, /seedModelSessionState = role === "model" && !currentModelSessionState/);
  assert.match(source, /patchFields\[fields\.modelSessionState\] = "confirmed"/);
  assert.match(source, /patchFields\[fields\.modelSessionStateUpdatedAt\] = acknowledgedAt/);
  assert.match(source, /model_session_state_seeded: ack\.model_session_state_seeded/);
  assert.doesNotMatch(source, /role === "model" && shouldPromoteCustomerStatus/);
});

test("repeated model acknowledgement can repair a legacy blank canonical state idempotently", () => {
  assert.match(source, /if \(existing && !promoteCustomerStatus && !seedModelSessionState\)/);
  assert.match(source, /idempotent: Boolean\(existing\)/);
  assert.match(source, /model_session_state_seeded: seedModelSessionState/);
});

test("confirmation ack does not mark payment paid", () => {
  assert.doesNotMatch(source, /payment_status[^\n]*Paid/i);
  assert.doesNotMatch(source, /paymentStatus[^\n]*Paid/i);
  assert.doesNotMatch(source, /may_mark_paid/i);
});
