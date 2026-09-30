import assert from "node:assert/strict";
import test from "node:test";

import { KENJI_LV5_HYPE_INTERNALS } from "../src/kenji-lv5-hype-alert.mjs";

test("SVIP photo reveal exceptions route to Per review without widening protected actions", () => {
  const route = KENJI_LV5_HYPE_INTERNALS.routeForDecision({}, {
    reply_source: "hype_svip_exact_customer_photo_reveal",
    handoff_reason: "model_photo_reveal:client_caution",
    operational: {
      primary_action: "handoff_per",
      model_access_status: "review_required",
    },
  });
  assert.equal(route.event, "svip_photo_reveal_review_required");
  assert.equal(route.flow, "alert");
  assert.match(route.action, /Do not expose rate, offer, availability, booking or payment/);
});
