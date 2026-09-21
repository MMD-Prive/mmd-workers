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


test("customer change request intake is review-only and idempotent", () => {
  assert.match(source, /CONFIRM_CHANGE_REQUEST_PATH = "\/v1\/confirm\/change-request"/);
  assert.match(source, /AIRTABLE_TABLE_CUSTOMER_CHANGE_REQUESTS/);
  assert.match(source, /status\]: "pending_review"/);
  assert.match(source, /canonical_session_mutated: false/);
  assert.match(source, /requires_mmd_review: true/);
  assert.match(source, /idempotency_key_required/);
});

test("customer acknowledgement fails closed while a change request is pending", () => {
  assert.match(source, /listPendingCustomerChangeRequests\(env, authorized\.claims\.session_id\)/);
  assert.match(source, /customer_change_request_pending/);
  assert.match(source, /pending_change_requests: pending/);
  assert.doesNotMatch(source, /pending[\s\S]{0,300}patchFields\[fields\.sessionStatus\] = "Confirmed"/);
});

test("change request sends ops notification only after durable Airtable write", () => {
  const writeAt = source.indexOf("createCustomerChangeRequest(env, authorized");
  const notifyAt = source.indexOf("notifyCustomerChangeRequest(env, authorized");
  assert.ok(writeAt >= 0 && notifyAt > writeAt);
  assert.match(source, /notificationStatus\]: "pending"/);
  assert.match(source, /patchChangeNotification/);
});
