import test from "node:test";
import assert from "node:assert/strict";
import { requestMemberReplyRefresh } from "./member-reply-refresh.mjs";

test("a completed job queues refresh only for a canonical identity", async () => {
  const calls = [];
  const env = { MEMBER_PAGES_MEMBER_WALLET: { fetch: async request => {
    calls.push({ url: request.url, headers: request.headers, body: await request.json() });
    return new Response(null, { status: 202 });
  } } };
  assert.equal(await requestMemberReplyRefresh(env, "MEMBER_PAGES_MEMBER_WALLET", "admin-worker",
    { line_user_id: "U" + "b".repeat(32) }, "session_mark_work_finished"), true);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).pathname, "/__internal/kenji/member-reply-snapshot/refresh");
  assert.equal(calls[0].headers.get("x-mmd-service-binding"), "admin-worker");
  assert.equal(calls[0].body.reason, "session_mark_work_finished");
  assert.equal(await requestMemberReplyRefresh(env, "MEMBER_PAGES_MEMBER_WALLET", "admin-worker",
    { line_user_id: "Jo" }), false);
  assert.equal(calls.length, 1);
});
