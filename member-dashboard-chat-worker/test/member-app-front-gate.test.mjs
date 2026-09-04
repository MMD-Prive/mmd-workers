import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../src/front-gate-index.js";

test("My MMD app API is forwarded only through member-pages-worker", async () => {
  const calls = [];
  const env = {
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        calls.push({
          url: request.url,
          method: request.method,
          cookie: request.headers.get("cookie"),
        });
        return Response.json({ displayName: "คุณเปอร์" }, {
          headers: {
            "set-cookie": "__Host-mmd_liff_session=rotated; Secure; HttpOnly; Path=/; SameSite=Strict",
            "x-mmd-member-app-api": "v1",
          },
        });
      },
    },
  };

  const response = await worker.fetch(new Request("https://www.mmdbkk.com/api/member/app/profile", {
    headers: { cookie: "__Host-mmd_liff_session=current" },
  }), env);

  assert.deepEqual(calls, [{
    url: "https://www.mmdbkk.com/api/member/app/profile",
    method: "GET",
    cookie: "__Host-mmd_liff_session=current",
  }]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { displayName: "คุณเปอร์" });
  assert.match(response.headers.get("set-cookie") || "", /rotated/);
  assert.equal(response.headers.get("x-mmd-worker"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-upstream-service"), "member-pages-worker");
});

test("My MMD app API fails closed when member-pages service binding is missing", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/api/member/app/dashboard"), {});
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.error.code, "MEMBER_PAGES_UPSTREAM_NOT_CONFIGURED");
});

test("wrangler claims My MMD app API on apex and www", async () => {
  const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  for (const route of [
    "mmdbkk.com/api/member/app/*",
    "www.mmdbkk.com/api/member/app/*",
  ]) {
    assert.ok(wrangler.includes(`pattern = "${route}"`), `missing Worker route: ${route}`);
  }
});
