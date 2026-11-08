import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { observeStandardJoinRequest } from "../src/standard-join-observer.js";

const webhook = (update) => new Request("https://telegram-worker.mmd.test/telegram/webhook", {
  method: "POST",
  headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": "expected-secret" },
  body: JSON.stringify(update),
});
const standardJoin = (from = {}) => ({
  update_id: 9301,
  chat_join_request: {
    chat: { id: -100555, type: "supergroup", title: "MMD PRIVÉ : STANDARD" },
    from: { id: 1234567890, first_name: "Example", last_name: "Member", username: "example_member", ...from },
    user_chat_id: 1234567890,
    bio: "This field must never be stored or forwarded",
    date: 1794120000,
  },
});
const env = (extra = {}) => ({
  TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
  TELEGRAM_STANDARD_GROUP_ID: "-100555",
  TELEGRAM_PREMIUM_GROUP_ID: "-100666",
  ...extra,
});

test("Standard join-request is forwarded over private service binding; never auto-approved or messaged", async () => {
  let count = 0;
  const binding = {
    async fetch(request) {
      count++;
      assert.equal(new URL(request.url).hostname, "admin-worker.internal");
      assert.equal(new URL(request.url).pathname, "/__internal/telegram-standard-join-intake");
      assert.equal(request.headers.get("x-mmd-service-binding"), "telegram-worker");
      const body = await request.json();
      assert.deepEqual(body, {
        room: "standard",
        telegram_user_id_numeric: "1234567890",
        telegram_username: "example_member",
        telegram_display_name: "Example Member",
        requested_at_unix: 1794120000,
      });
      assert.equal(Object.hasOwn(body, "user_chat_id"), false);
      assert.equal(Object.hasOwn(body, "bio"), false);
      return Response.json({ ok: true, captured: true, state: "pending_owner_review" });
    },
  };
  const result = await worker.fetch(webhook(standardJoin()), env({ HYPE_OPERATIONS: binding }));
  assert.equal(result.status, 200);
  const json = await result.json();
  assert.equal(json.flow, "standard_join_intake");
  assert.equal(json.captured, true);
  assert.equal(json.join_request_state, "pending_owner_review");
  assert.equal(json.approves_nothing, true);
  assert.equal(json.sends_nothing, true);
  assert.equal(json.removes_nothing, true);
  assert.equal(count, 1);
  assert.ok(!JSON.stringify(json).includes("1234567890"));
  assert.ok(!JSON.stringify(json).includes("Example"));
});

test("Standard join request remains pending and does nothing if Airtable capture is disabled or unavailable", async () => {
  const disabled = await worker.fetch(webhook(standardJoin()), env({
    HYPE_OPERATIONS: { async fetch() { return Response.json({ ok: true, captured: false, state: "disabled" }); } },
  }));
  const body = await disabled.json();
  assert.equal(body.code_status, "capture_disabled");
  assert.equal(body.captured, false);
  assert.equal(body.join_request_state, "pending_owner_review");
  const unavailable = await worker.fetch(webhook(standardJoin()), env());
  assert.equal((await unavailable.json()).code_status, "intake_binding_unavailable");
});

test("Standard join observer ignores other chats and bot actors, never touches protected Premium policy", async () => {
  const notStandard = await observeStandardJoinRequest({
    ...standardJoin().chat_join_request, chat: { id: -100666 },
  }, env());
  assert.equal(notStandard.handled, false);
  let called = 0;
  const bot = await worker.fetch(webhook(standardJoin({ is_bot: true })), env({
    HYPE_OPERATIONS: { async fetch() { called++; return Response.json({ ok: true }); } },
  }));
  assert.equal((await bot.json()).code_status, "invalid_join_identity");
  assert.equal(called, 0);
  const notTelegram = await worker.fetch(webhook(standardJoin()), env({
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "another-secret",
  }));
  assert.equal(notTelegram.status, 401);
});
