import test from "node:test";
import assert from "node:assert/strict";
import { appendEtaEvent, normalizeEtaMinutes } from "./src/model-eta-wrapper.js";

test("events ETA accepts 1-240 whole minutes", () => {
  assert.equal(normalizeEtaMinutes(1), 1);
  assert.equal(normalizeEtaMinutes(15), 15);
  assert.equal(normalizeEtaMinutes(240), 240);
  assert.equal(normalizeEtaMinutes(-1), 0);
  assert.equal(normalizeEtaMinutes(241), 0);
  assert.equal(normalizeEtaMinutes(15.2), 0);
});

test("ETA timeline append preserves order and caps history", () => {
  const prior = Array.from({ length: 205 }, (_, i) => ({ event: `old_${i}` }));
  const event = { event: "eta_update", eta_minutes: 20 };
  const next = appendEtaEvent(prior, event);
  assert.equal(next.length, 200);
  assert.deepEqual(next.at(-1), event);
  assert.equal(next.at(0).event, "old_6");
});
