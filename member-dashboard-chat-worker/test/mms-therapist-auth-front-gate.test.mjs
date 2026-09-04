import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../src/front-gate-index.js";

test("MMS Therapist auth routes are delegated only to mms-worker and preserve cookies", async () => {
  const calls = [];
  const env = {
    MMS_WORKER: {
      async fetch(request) {
        calls.push({
          path: new URL(request.url).pathname,
          method: request.method,
          origin: request.headers.get("origin"),
          cookie: request.headers.get("cookie"),
          body: request.method === "POST" ? await request.json() : null,
        });
        return Response.json({ ok: true, data: { role: "mms_therapist" } }, {
          status: 200,
          headers: {
            "set-cookie": "__Secure-mms_therapist_session=test; Path=/; Secure; HttpOnly; SameSite=Lax",
          },
        });
      },
    },
  };

  const requestBody = { id_token: "line-id-token", invite_token: "invite-token" };
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/male-massage/therapists/api/auth/line", {
    method: "POST",
    headers: {
      origin: "https://www.mmdbkk.com",
      cookie: "other_session=unchanged",
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, data: { role: "mms_therapist" } });
  assert.deepEqual(calls, [{
    path: "/male-massage/therapists/api/auth/line",
    method: "POST",
    origin: "https://www.mmdbkk.com",
    cookie: "other_session=unchanged",
    body: requestBody,
  }]);
  assert.match(response.headers.get("set-cookie") || "", /__Secure-mms_therapist_session=/);
  assert.equal(response.headers.get("x-mmd-worker"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-upstream-service"), "mms-worker");
  assert.match(response.headers.get("cache-control") || "", /no-store/);
});

test("MMS Therapist auth front gate fails closed when mms-worker is unavailable", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/male-massage/therapists/api/auth/me", {
    method: "GET",
    headers: { origin: "https://mmdbkk.com" },
  }), {});

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "MMS_THERAPIST_AUTH_UPSTREAM_NOT_CONFIGURED");
});

test("wrangler claims only the dedicated Therapist auth namespace on apex and www", async () => {
  const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  for (const route of [
    "mmdbkk.com/male-massage/therapists/api/auth/*",
    "www.mmdbkk.com/male-massage/therapists/api/auth/*",
  ]) {
    assert.ok(wrangler.includes(`pattern = "${route}"`), `missing Worker route: ${route}`);
  }
  assert.match(wrangler, /binding = "MMS_WORKER"\s+service = "mms-worker"/);
  assert.doesNotMatch(wrangler, /pattern = "(?:www\.)?mmdbkk\.com\/male-massage\/therapists\*"/);
});
