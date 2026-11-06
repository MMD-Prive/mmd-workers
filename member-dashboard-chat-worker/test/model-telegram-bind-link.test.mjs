import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const URL_OK = "https://t.me/mmdprivebot?start=bind_kvr2TOKENabcdefghijklmnop";
const call = (body, headers = { "x-mmd-service-binding": "admin-worker", "x-mmd-internal-call": "true" }) =>
  worker.fetch(new Request("https://member-dashboard-chat-worker.local/__internal/line/model-telegram-bind-link", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }), { LINE_CHANNEL_ACCESS_TOKEN: "tok" }, { waitUntil() {} });

test("pushes the t.me link intact (no sanitizer corruption)", async () => {
  const real = globalThis.fetch; let sent;
  globalThis.fetch = async (u, init) => { sent = JSON.parse(init.body); return new Response("{}", { status: 200 }); };
  try {
    const res = await call({ line_user_id: "U" + "a".repeat(32), display_name: "Captain S", connect_url: URL_OK });
    assert.equal(res.status, 200);
    assert.ok(sent.messages[0].text.includes(URL_OK));
  } finally { globalThis.fetch = real; }
});

test("rejects non-t.me links and unauthenticated callers", async () => {
  assert.equal((await call({ line_user_id: "U" + "a".repeat(32), connect_url: "https://evil.example/x" })).status, 400);
  assert.equal((await call({ line_user_id: "U" + "a".repeat(32), connect_url: URL_OK }, {})).status, 401);
});
