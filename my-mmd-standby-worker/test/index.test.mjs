import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const BACKUP_ID = "2011691294-GCxAQ2yW";
const PRIMARY_ID = "2010862595-yT4DCEMc";

const shellHtml = `<!doctype html><html lang="th"><head><style>.card{display:block}</style></head><body><main>
<div id="message"></div><div id="actions" class="actions" aria-label="ตัวเลือก"></div>
<script>const CONFIG={"liffId":"${PRIMARY_ID}","startEndpoint":"/member/api/liff/start","profileEndpoint":"/member/api/liff/profile"};
const endpoint="/member/api/liff/intent"; const target="/my-mmd/";</script>
</main></body></html>`;

function runtime(handler, overrides = {}) {
  return {
    LINE_LIFF_BACKUP_ID: BACKUP_ID,
    MEMBER_PAGES_WORKER: { fetch: handler },
    ...overrides,
  };
}

test("backup shell uses a second LIFF id, backup APIs, and all membership lanes", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/member/liff-backup?intent=status&lang=th"), runtime(async (request) => {
    calls.push(request.url);
    return new Response(shellHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
  }));
  const html = await response.text();

  assert.deepEqual(calls, ["https://www.mmdbkk.com/member/liff?intent=status&lang=th"]);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-route-owner"), "my-mmd-standby-worker");
  assert.equal(response.headers.get("x-mmd-upstream-service"), "member-pages-worker");
  assert.equal(response.headers.get("x-mmd-standby-authority"), "canonical-shared");
  assert.match(html, new RegExp(BACKUP_ID));
  assert.doesNotMatch(html, new RegExp(PRIMARY_ID));
  assert.match(html, /\/member\/api\/liff-backup\/start/);
  assert.match(html, /\/member\/api\/liff-backup\/profile/);
  assert.match(html, /\/pay\/membership\?source=line&amp;entry=standby/);
  assert.match(html, /\/sigil\/member\/membership\?source=line&amp;intent=signup&amp;entry=standby/);
  assert.match(html, /\/sigil\/member\/membership\?source=line&amp;intent=renew&amp;entry=standby/);
  assert.match(html, /data-mmd-standby="warm-v1"/);
});

test("LIFF API mapping preserves method, body, cookie, Set-Cookie and rewrites server actions", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://mmdbkk.com/member/api/liff-backup/intent?source=test", {
    method: "POST",
    headers: {
      cookie: "__Host-mmd_liff_session=current",
      "content-type": "application/json",
      origin: "https://mmdbkk.com",
    },
    body: JSON.stringify({ liff_intent: "renew" }),
  }), runtime(async (request) => {
    calls.push({
      url: request.url,
      method: request.method,
      cookie: request.headers.get("cookie"),
      body: await request.text(),
    });
    return Response.json({
      ok: true,
      data: { screen: { actions: [{ id: "renew", endpoint: "/member/api/liff/intent" }] } },
    }, {
      headers: { "set-cookie": "__Host-mmd_liff_session=rotated; Secure; HttpOnly; Path=/; SameSite=Strict" },
    });
  }));
  const payload = await response.json();

  assert.deepEqual(calls, [{
    url: "https://mmdbkk.com/member/api/liff/intent?source=test",
    method: "POST",
    cookie: "__Host-mmd_liff_session=current",
    body: JSON.stringify({ liff_intent: "renew" }),
  }]);
  assert.equal(payload.data.screen.actions[0].endpoint, "/member/api/liff-backup/intent");
  assert.match(response.headers.get("set-cookie") || "", /rotated/);
});

test("member app and payment status reads map to canonical service routes", async () => {
  const calls = [];
  const env = runtime(async (request) => {
    calls.push(request.url);
    return Response.json({ ok: false, error: { code: "LIFF_SESSION_REQUIRED" } }, { status: 401 });
  });

  const app = await worker.fetch(new Request("https://www.mmdbkk.com/api/member-backup/app/points"), env);
  const payments = await worker.fetch(new Request("https://www.mmdbkk.com/v1/member-backup/payments"), env);

  assert.equal(app.status, 401);
  assert.equal(payments.status, 401);
  assert.deepEqual(calls, [
    "https://www.mmdbkk.com/api/member/app/points",
    "https://www.mmdbkk.com/v1/member/payments",
  ]);
});

test("backup browser routes lead to the backup LIFF endpoint and bounded view", async () => {
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/my-mmd-backup/history?lang=zh&unsafe=drop"), {});
  const location = new URL(response.headers.get("location"));
  assert.equal(response.status, 302);
  assert.equal(location.pathname, "/member/liff-backup");
  assert.equal(location.searchParams.get("intent"), "status");
  assert.equal(location.searchParams.get("view"), "history");
  assert.equal(location.searchParams.get("lang"), "zh");
  assert.equal(location.searchParams.has("unsafe"), false);
});

test("backup shell fails closed until a real second LIFF id is configured", async () => {
  let calls = 0;
  const response = await worker.fetch(new Request("https://www.mmdbkk.com/member/liff-backup"), runtime(async () => {
    calls += 1;
    return new Response(shellHtml, { headers: { "content-type": "text/html" } });
  }, { LINE_LIFF_BACKUP_ID: "__SET_ME__" }));
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.error.code, "STANDBY_LIFF_NOT_CONFIGURED");
  assert.equal(calls, 0);
});

test("health requires the backup id, service binding and canonical anonymous-session boundary", async () => {
  const healthy = await worker.fetch(new Request("https://www.mmdbkk.com/my-mmd-backup/health"), runtime(async (request) => {
    assert.equal(new URL(request.url).pathname, "/member/api/liff/status");
    return Response.json({ ok: false, error: { code: "LIFF_SESSION_REQUIRED" } }, { status: 401 });
  }));
  assert.equal(healthy.status, 200);
  assert.equal((await healthy.json()).checks.anonymous_session_boundary, "401");

  const missing = await worker.fetch(new Request("https://www.mmdbkk.com/my-mmd-backup/health"), {});
  assert.equal(missing.status, 503);

  const wrongBoundary = await worker.fetch(new Request("https://www.mmdbkk.com/my-mmd-backup/health"), runtime(async () => Response.json({ ok: true })));
  assert.equal(wrongBoundary.status, 503);
});

test("standby surface is bounded and keeps UI read-only methods", async () => {
  const postUi = await worker.fetch(new Request("https://www.mmdbkk.com/my-mmd-backup", { method: "POST" }), {});
  assert.equal(postUi.status, 405);
  assert.equal(postUi.headers.get("allow"), "GET, HEAD");

  const unknown = await worker.fetch(new Request("https://www.mmdbkk.com/webhooks/line"), {});
  assert.equal(unknown.status, 404);
});
