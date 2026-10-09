import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./job-model-payout-destination-v1.js", import.meta.url), "utf8");

test("payout destination form never renders values as HTML or persists/logs them", () => {
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(source, /console\./);
  assert.doesNotMatch(source, /alert\(|confirm\(|prompt\(/);
});

test("payout destination form talks only to the sigil API with the model role", () => {
  assert.match(source, /const API = "https:\/\/sigil\.mmdbkk\.com"/);
  assert.match(source, /\/v1\/confirm\/payout-destination\/context/);
  assert.match(source, /\/v1\/confirm\/payout-destination"/);
  assert.match(source, /expected_role: "model"/);
  assert.doesNotMatch(source, /model_record_id|model_id|record_id/);
});

test("form stays hidden unless the backend says enabled and can_submit", () => {
  assert.match(source, /!result\.data\.enabled \|\| !result\.data\.can_submit/);
});

test("full account number is cleared after submit and only the masked tail is displayed", () => {
  assert.match(source, /ref\.value = ""/);
  assert.match(source, /destination\.masked_ref/);
});

test("form never shows the confirm-page amount fields or customer data", () => {
  assert.doesNotMatch(source, /payment_ref|payment_status|payment_type|line_id|amount_thb/);
});
