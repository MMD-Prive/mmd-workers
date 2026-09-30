import assert from "node:assert/strict";
import test from "node:test";

import { SvipPhotoRevealModeAudit } from "../src/svip-photo-reveal-mode-audit.mjs";

function stateMock() {
  const values = new Map();
  let queue = Promise.resolve();
  return {
    storage: {
      get: async key => values.get(key),
      transaction(fn) {
        const task = queue.then(() => fn({
          get: async key => values.get(key),
          put: async (key, value) => values.set(key, value),
        }));
        queue = task.catch(() => {});
        return task;
      },
    },
  };
}

async function observe(gate, mode, source = "test") {
  const response = await gate.fetch(new Request("https://svip-photo-mode.internal/observe", {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({ mode, source }),
  }));
  assert.equal(response.status, 200);
  return response.json();
}

test("mode audit records every observed transition and ignores duplicate observations", async () => {
  const gate = new SvipPhotoRevealModeAudit(stateMock());

  const initial = await observe(gate, "off", "deploy");
  assert.equal(initial.changed, true);
  assert.equal(initial.from, "unset");
  assert.equal(initial.to, "off");

  const duplicate = await observe(gate, "off", "request");
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.version, 1);

  const pilot = await observe(gate, "pilot", "owner_pilot");
  assert.equal(pilot.changed, true);
  assert.equal(pilot.from, "off");
  assert.equal(pilot.to, "pilot");

  const killed = await observe(gate, "off", "owner_kill_switch");
  assert.equal(killed.changed, true);
  assert.equal(killed.from, "pilot");
  assert.equal(killed.to, "off");

  const status = await gate.fetch(new Request("https://svip-photo-mode.internal/status"));
  const body = await status.json();
  assert.equal(body.mode, "off");
  assert.equal(body.version, 3);
  assert.equal(body.history.length, 3);
  assert.deepEqual(body.history.map(event => [event.from, event.to]), [
    ["unset", "off"],
    ["off", "pilot"],
    ["pilot", "off"],
  ]);
});

test("unknown mode is audited as fail-closed off", async () => {
  const gate = new SvipPhotoRevealModeAudit(stateMock());
  const event = await observe(gate, "LIVE_typo", "bad_config");
  assert.equal(event.to, "off");
});
