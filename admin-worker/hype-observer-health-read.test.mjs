import assert from "node:assert/strict";
import test from "node:test";
import { projectHypeObserverHealth } from "./src/hype-observer-health-read.js";

test("observer health projection is bounded and truth-safe", () => {
  const x=projectHypeObserverHealth({
    overall_status:"critical",
    checked_at:"2026-09-21T00:00:00.000Z",
    silence_hours:52.25,
    held_open:4,
    outbox_failed_terminal:1,
    membership_v4_seen_after_deploy:true,
    alert_codes:["slip_silent_48h","outbox_failed_terminal"],
    hype_alert_required:true,
    owner_summary:"bounded summary",
  });
  assert.equal(x.available,true);
  assert.equal(x.status,"critical");
  assert.equal(x.silence_hours,52.25);
  assert.equal(x.alert_required,true);
  assert.equal(x.operational_only,true);
  assert.equal(x.business_truth_inferred,false);
});
