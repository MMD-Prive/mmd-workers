import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/index.js";

function roomEnv() {
  let stored = null;
  return {
    AUTH_SERVICE_EVENTS_TO_REALTIME: "events-realtime-secret",
    INTERNAL_TOKEN: "legacy-internal-token",
    WEB_BASE_URL: "https://mmdbkk.com",
    ROOM: {
      idFromName(name) { return name; },
      get() {
        return {
          async fetch(_url, init) {
            stored = JSON.parse(init.body);
            return new Response("ok");
          },
        };
      },
    },
    getStored() { return stored; },
  };
}

function request(token) {
  return new Request("https://realtime.test/v1/rt/room/open", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Internal-Token": token },
    body: JSON.stringify({ job_id: "job_1" }),
  });
}

test("Realtime rejects the legacy token and accepts only Events dedicated auth", async () => {
  const env = roomEnv();
  assert.equal((await worker.fetch(request("legacy-internal-token"), env)).status, 401);
  assert.equal((await worker.fetch(request("wrong-secret"), env)).status, 401);

  const response = await worker.fetch(request("events-realtime-secret"), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.ok(env.getStored().customer);
  assert.ok(env.getStored().model);
});
