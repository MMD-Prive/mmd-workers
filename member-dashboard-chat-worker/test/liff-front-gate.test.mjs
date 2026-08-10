import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

test("LIFF front gate transparently forwards the request through the service binding", async () => {
  const calls = [];
  const env = {
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        calls.push({
          url: request.url,
          method: request.method,
          contentType: request.headers.get("content-type"),
          cookie: request.headers.get("cookie"),
          body: await request.json(),
        });
        return new Response(JSON.stringify({ ok: true }), {
          status: 201,
          statusText: "Created",
          headers: {
            "content-type": "application/json; charset=utf-8",
            "set-cookie": "__Host-mmd_liff_session=rotated; Secure; HttpOnly; Path=/; SameSite=Lax",
            "x-mmd-worker": "member-pages-worker",
          },
        });
      },
    },
  };

  const response = await worker.fetch(new Request("https://www.mmdbkk.com/member/api/liff/start?t=continuity", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "__Host-mmd_liff_session=current",
    },
    body: JSON.stringify({ id_token: "test" }),
  }), env);

  assert.deepEqual(calls, [{
    url: "https://www.mmdbkk.com/member/api/liff/start?t=continuity",
    method: "POST",
    contentType: "application/json",
    cookie: "__Host-mmd_liff_session=current",
    body: { id_token: "test" },
  }]);
  assert.equal(response.status, 201);
  assert.equal(response.statusText, "Created");
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(response.headers.get("set-cookie"), /__Host-mmd_liff_session=rotated/);
  assert.equal(response.headers.get("x-mmd-worker"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
  assert.equal(response.headers.get("x-mmd-upstream-service"), "member-pages-worker");
});

test("LIFF front gate fails closed when the service binding is missing", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff/status"), {});

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "LIFF_UPSTREAM_NOT_CONFIGURED");
});

test("same-site LIFF shell is owned by the front gate and proxied only on the exact path", async () => {
  const calls = [];
  const env = {
    MEMBER_PAGES_WORKER: {
      async fetch(request) {
        calls.push(request.url);
        return new Response("<!doctype html><title>MMD</title>", { status: 200, headers: { "content-type": "text/html" } });
      },
    },
  };

  const shell = await worker.fetch(new Request("https://mmdbkk.com/member/liff?intent=status&view=points"), env);
  const nearby = await worker.fetch(new Request("https://mmdbkk.com/member/liff-admin"), env);

  assert.equal(shell.status, 200);
  assert.match(shell.headers.get("content-type") || "", /^text\/html/);
  assert.deepEqual(calls, ["https://mmdbkk.com/member/liff?intent=status&view=points"]);
  assert.equal(nearby.status, 404);
});

test("Care Back stays outside the LIFF front gate until its API contract is ready", async () => {
  let calls = 0;
  const env = {
    MEMBER_PAGES_WORKER: {
      async fetch() {
        calls += 1;
        return new Response(JSON.stringify({ ok: true }));
      },
    },
  };

  const response = await worker.fetch(new Request("https://www.mmdbkk.com/api/care-back-wish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wish: "สุขสันต์ปีที่หกครับ", campaign: "6-years-care-back" }),
  }), env);

  assert.equal(response.status, 404);
  assert.equal(calls, 0);
  assert.deepEqual(await response.json(), { ok: false, error: "not_found" });
});

test("nearby non-LIFF paths do not enter the LIFF front gate", async () => {
  let calls = 0;
  const env = {
    MEMBER_PAGES_WORKER: {
      async fetch() {
        calls += 1;
        return new Response(null, { status: 204 });
      },
    },
  };

  const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff-status"), env);

  assert.equal(response.status, 404);
  assert.equal(calls, 0);
});
