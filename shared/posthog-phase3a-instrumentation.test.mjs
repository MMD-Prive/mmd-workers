import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

const contracts = [
  ["sigil-booking-worker/src/index.js", "booking_received", 'flow: "booking_intake"'],
  ["payments-worker/index.review-wrapper.js", "payment_verified", "flow: paymentFlow"],
  ["payments-worker/index.review-wrapper.js", "membership_activated", 'flow: "membership_activation"'],
  ["member-pages-worker/src/index.js", "my_mmd_session_started", 'flow: "my_mmd_login"'],
  ["mms-worker/src/index.js", "mms_prebooking_received", 'flow: "mms_prebooking"'],
  ["himai-chat-worker/src/mmd-shop-checkout.js", "shop_order_created", 'flow: "shop_checkout"'],
  ["partners-worker/src/index.ts", "partner_terms_accepted", 'flow: "partner_onboarding"'],
];

for (const [path, eventName, flowMarker] of contracts) {
  test(`Phase 3A analytics contract: ${eventName}`, async () => {
    const source = await readFile(new URL(path, root), "utf8");
    assert.match(source, new RegExp(`event:\\s*["']${eventName}["']`));
    assert.ok(source.includes(flowMarker), `${path} must carry canonical flow for ${eventName}`);
  });
}

test("Phase 3A safe property allowlist keeps funnel dimensions", async () => {
  const source = await readFile(new URL("shared/posthog-authority-events.mjs", root), "utf8");
  for (const key of ["surface", "world", "flow", "payment_stage", "status"]) {
    assert.ok(source.includes(`"${key}"`), `safe analytics properties must include ${key}`);
  }
});
