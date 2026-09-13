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

test("confirmation remains idempotent and model ack does not independently promote customer status", () => {
  assert.match(source, /if \(existing && !promoteCustomerStatus\)/);
  assert.match(source, /role === "customer" && shouldPromoteCustomerStatus/);
  assert.doesNotMatch(source, /role === "model" && shouldPromoteCustomerStatus/);
});

test("confirmation ack does not mark payment paid", () => {
  assert.doesNotMatch(source, /payment_status[^\n]*Paid/i);
  assert.doesNotMatch(source, /paymentStatus[^\n]*Paid/i);
  assert.doesNotMatch(source, /may_mark_paid/i);
});
