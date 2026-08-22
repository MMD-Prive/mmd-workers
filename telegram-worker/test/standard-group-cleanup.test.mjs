import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const WEBHOOK_URL = "https://telegram-worker.mmd.test/telegram/webhook";

function makeEnv(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_STANDARD_GROUP_ID: "-100777",
    ...overrides,
  };
}

function joinRequest(chatId = -100777) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
    },
    body: JSON.stringify({
      update_id: 100,
      message: {
        message_id: 55,
        chat: { id: chatId, type: "supergroup" },
        from: { id: 111 },
        new_chat_members: [{ id: 222, first_name: "Customer" }],
      },
    }),
  });
}

test("HYPE deletes join service messages only in configured Standard Group", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let telegramCall = null;

  globalThis.fetch = async (url, init = {}) => {
    telegramCall = {
      url: String(url),
      body: JSON.parse(String(init.body || "{}")),
    };
    return Response.json({ ok: true, result: true });
  };

  try {
    const response = await worker.fetch(joinRequest(), makeEnv());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.handled, true);
    assert.equal(body.flow, "standard_group_join_cleanup");
    assert.equal(body.deleted, true);
    assert.match(telegramCall.url, /api\.telegram\.org\/bottelegram-token\/deleteMessage$/);
    assert.deepEqual(telegramCall.body, { chat_id: "-100777", message_id: 55 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE leaves join service messages in other groups untouched", async () => {
  const response = await worker.fetch(joinRequest(-100888), makeEnv());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.handled, false);
  assert.equal(body.reason, "join_message_outside_standard_group");
});

test("join cleanup is disabled until TELEGRAM_STANDARD_GROUP_ID is configured", async () => {
  const response = await worker.fetch(joinRequest(), makeEnv({ TELEGRAM_STANDARD_GROUP_ID: "" }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.handled, false);
  assert.equal(body.reason, "standard_group_cleanup_not_configured");
});
