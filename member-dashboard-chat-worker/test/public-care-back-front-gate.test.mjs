import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../src/front-gate-index.js";

test("public CARE BACK Wish routes are delegated to member-pages-worker without LIFF gating", async () => {
  const calls = [];
  const env = {
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        calls.push({
          path: new URL(request.url).pathname,
          method: request.method,
          origin: request.headers.get("origin"),
          body: request.method === "POST" ? await request.json() : null,
        });
        return Response.json({ ok: true, state: "completed" }, {
          status: 200,
          headers: { "access-control-allow-origin": "https://mmdbkk.com" },
        });
      },
    },
  };

  const body = { wish_text: "สุขสันต์วันเกิด MMD ครับ", request_id: "wish-front-gate-0001" };
  const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/care-back/public-wish", {
    method: "POST",
    headers: { origin: "https://mmdbkk.com", "content-type": "application/json" },
    body: JSON.stringify(body),
  }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, state: "completed" });
  assert.deepEqual(calls, [{
    path: "/member/api/care-back/public-wish",
    method: "POST",
    origin: "https://mmdbkk.com",
    body,
  }]);
  assert.equal(response.headers.get("x-mmd-worker"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-upstream-service"), "member-pages-worker");
});

test("public Wish link route is also delegated and preserves the verified session cookie", async () => {
  const calls = [];
  const env = {
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        calls.push({ path: new URL(request.url).pathname, cookie: request.headers.get("cookie") });
        return Response.json({ ok: true, linked: true });
      },
    },
  };

  const response = await worker.fetch(new Request("https://www.mmdbkk.com/member/api/care-back/link-wish", {
    method: "POST",
    headers: {
      origin: "https://www.mmdbkk.com",
      cookie: "__Host-mmd_liff_session=current",
      "content-type": "application/json",
    },
    body: JSON.stringify({ wish_link_token: "pw_testtoken_0123456789" }),
  }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ path: "/member/api/care-back/link-wish", cookie: "__Host-mmd_liff_session=current" }]);
});

test("public Wish front gate fails closed when member-pages-worker is unavailable", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/care-back/public-wish", {
    method: "OPTIONS",
    headers: { origin: "https://mmdbkk.com" },
  }), {});

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "MEMBER_PAGES_UPSTREAM_NOT_CONFIGURED");
});

test("wrangler claims the public Wish and link routes on apex and www", async () => {
  const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  for (const route of [
    "mmdbkk.com/member/api/care-back/public-wish*",
    "www.mmdbkk.com/member/api/care-back/public-wish*",
    "mmdbkk.com/member/api/care-back/link-wish*",
    "www.mmdbkk.com/member/api/care-back/link-wish*",
  ]) {
    assert.ok(wrangler.includes(`pattern = "${route}"`), `missing Worker route: ${route}`);
  }
  assert.match(wrangler, /main = "src\/front-gate-index\.js"/);
});
