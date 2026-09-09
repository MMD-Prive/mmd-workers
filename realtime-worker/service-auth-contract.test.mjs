import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/index.js";

function roomEnv() {
  const calls = [];
  return {
    AUTH_SERVICE_EVENTS_TO_REALTIME: "events-realtime-secret",
    AUTH_SERVICE_ADMIN_TO_REALTIME: "admin-realtime-secret",
    INTERNAL_TOKEN: "legacy-internal-token",
    WEB_BASE_URL: "https://mmdbkk.com",
    ROOM: {
      idFromName(name) { return name; },
      get() {
        return {
          async fetch(url, init) {
            const body = init?.body ? JSON.parse(init.body) : null;
            calls.push({ url: String(url), body });
            if (String(url).endsWith("/set_location_policy")) {
              return new Response(JSON.stringify({ ok: true, data: { enabled: body?.enabled === true } }), {
                headers: { "content-type": "application/json" },
              });
            }
            return new Response("ok");
          },
        };
      },
    },
    getCalls() { return calls; },
  };
}

function roomOpenRequest(token) {
  return new Request("https://realtime.test/v1/rt/room/open", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Internal-Token": token },
    body: JSON.stringify({ job_id: "job_1" }),
  });
}

function locationPolicyRequest(token, enabled = true) {
  return new Request("https://realtime.test/v1/rt/room/location-policy", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Internal-Token": token },
    body: JSON.stringify({ job_id: "job_1", enabled, ttl_seconds: 180 }),
  });
}

test("Realtime rejects legacy auth and accepts dedicated service auth", async () => {
  const env = roomEnv();
  assert.equal((await worker.fetch(roomOpenRequest("legacy-internal-token"), env)).status, 401);
  assert.equal((await worker.fetch(roomOpenRequest("wrong-secret"), env)).status, 401);

  const response = await worker.fetch(roomOpenRequest("events-realtime-secret"), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.location_enabled, false);

  const calls = env.getCalls();
  const tokenCall = calls.find((call) => call.url.endsWith("/store_tokens"));
  const policyCall = calls.find((call) => call.url.endsWith("/set_location_policy"));
  assert.ok(tokenCall?.body?.customer);
  assert.ok(tokenCall?.body?.model);
  assert.deepEqual(policyCall?.body, { enabled: false, job_id: "job_1" });
});

test("Realtime location policy requires dedicated service auth", async () => {
  const env = roomEnv();
  assert.equal((await worker.fetch(locationPolicyRequest("legacy-internal-token"), env)).status, 401);
  assert.equal((await worker.fetch(locationPolicyRequest("wrong-secret"), env)).status, 401);

  assert.equal((await worker.fetch(locationPolicyRequest("events-realtime-secret"), env)).status, 200);
  assert.equal((await worker.fetch(locationPolicyRequest("admin-realtime-secret", false), env)).status, 200);
});
