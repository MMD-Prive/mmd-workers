import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./customer-change-request.js", import.meta.url), "utf8");

test("customer change request is signed-customer-only and fail-closed", () => {
  assert.match(source, /CUSTOMER_CHANGE_REQUEST_PATH\s*=\s*"\/v1\/confirm\/change-request"/);
  assert.match(source, /authorizeConfirmationRequest\(request, env\)/);
  assert.match(source, /authorized\.expectedRole !== "customer"/);
  assert.match(source, /customer_confirmation_required/);
});

test("change requests are review intake and never mutate canonical Sessions directly", () => {
  assert.match(source, /"pending_review"/);
  assert.match(source, /canonical Session unchanged/);
  assert.match(source, /AIRTABLE_TABLE_CUSTOMER_CHANGE_REQUESTS/);
  assert.match(source, /tblhQGfJc4GgiteZr/);
  assert.doesNotMatch(source, /AIRTABLE_TABLE_SESSIONS/);
  assert.doesNotMatch(source, /patch.*session/i);
});

test("time location date reschedule cancellation and remark are supported", () => {
  for (const type of ["time_change","location_change","date_change","reschedule","cancellation","remark"]) {
    assert.match(source, new RegExp(`"${type}"`));
  }
  assert.match(source, /cancellation_reason_required/);
  assert.match(source, /requested_location_required/);
  assert.match(source, /requested_time_required/);
});

test("MMD receives durable Console Inbox plus Telegram notification", () => {
  assert.match(source, /tblFHmfpB2TTrzO2e/);
  assert.match(source, /customer_change_/);
  assert.match(source, /status\] = "new"/);
  assert.match(source, /telegram-worker\.internal\/telegram\/internal\/send/);
  assert.match(source, /message_thread_id/);
  assert.match(source, /mmd_notified/);
});

test("identical customer submissions are idempotent", () => {
  assert.match(source, /idempotencyKey = await sha256Hex/);
  assert.match(source, /findExisting\(env, idempotencyKey\)/);
  assert.match(source, /duplicate: true/);
});
