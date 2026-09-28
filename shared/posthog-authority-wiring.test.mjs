import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const cases = [
  ["payments-worker/index.review-wrapper.js", ["payment_verified", "membership_activated", "payments-worker"]],
  ["member-pages-worker/src/index.js", ["my_mmd_session_started", "member-pages-worker"]],
  ["mms-worker/src/index.js", ["mms_prebooking_received", "mms-worker"]],
  ["himai-chat-worker/src/mmd-shop-checkout.js", ["shop_order_created", "himai-chat-worker"]],
  ["partners-worker/src/index.ts", ["partner_terms_accepted", "partners-worker"]],
  ["sigil-booking-worker/src/index.js", ["booking_received", "sigil-booking-worker"]],
];

for (const [path, needles] of cases) {
  test(`PostHog authority wiring: ${path}`, async () => {
    const source = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /posthog-authority-events\.mjs/);
    for (const needle of needles) assert.ok(source.includes(needle), `${path} missing ${needle}`);
  });
}
