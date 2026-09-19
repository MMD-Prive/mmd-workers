import test from "node:test";
import assert from "node:assert/strict";

import { bookingIntakeSnapshot, mergeBookingRequestFields } from "./index.js";

test("booking intake merges deposit intent fields without erasing earlier wording", () => {
  const merged = mergeBookingRequestFields({
    "Created At": "2026-09-20T10:00:00.000Z",
    resolver_payload_json: JSON.stringify({
      intent: { trigger: "deposit", model_name: "Rossi", date: "2026-09-20" },
      payment_inference: false,
    }),
  }, {
    "Created At": "2026-09-20T10:30:00.000Z",
    resolver_payload_json: JSON.stringify({
      intent: { time: "20:00", end_time: "22:00", amount_thb: 9000 },
      job_creation_state: "creating",
    }),
  });
  assert.equal(Object.hasOwn(merged, "Created At"), false);
  const resolver = JSON.parse(merged.resolver_payload_json);
  assert.deepEqual(resolver.intent, {
    trigger: "deposit",
    model_name: "Rossi",
    date: "2026-09-20",
    time: "20:00",
    end_time: "22:00",
    amount_thb: 9000,
  });
  assert.equal(resolver.payment_inference, false);
  assert.equal(resolver.job_creation_state, "creating");
});

test("booking intake snapshot exposes only the accumulated intent and Job receipt", () => {
  const snapshot = bookingIntakeSnapshot({ fields: {
    booking_ref: "kenji_abc",
    session_id: "kreq_abc",
    resolver_payload_json: JSON.stringify({ intent: { model_name: "Rossi" }, job_receipt: { session_id: "sess_1" } }),
  } });
  assert.equal(snapshot.booking_ref, "kenji_abc");
  assert.deepEqual(snapshot.intent, { model_name: "Rossi" });
  assert.deepEqual(snapshot.job_receipt, { session_id: "sess_1" });
});
