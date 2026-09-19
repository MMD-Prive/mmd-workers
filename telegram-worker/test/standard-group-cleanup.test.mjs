import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const WEBHOOK_URL = "https://telegram-worker.mmd.test/telegram/webhook";

function makeEnv(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_STANDARD_GROUP_ID: "-100555",
    TELEGRAM_MMD_CHAT_GROUP_ID: "-100777",
    TELEGRAM_PREVIEW_GROUP_ID: "-100888",
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

async function expectDeletedJoin(chatId, expectedSurface, { expectWelcome = false } = {}) {
  const originalFetch = globalThis.fetch;
  const telegramCalls = [];

  globalThis.fetch = async (url, init = {}) => {
    const call = {
      url: String(url),
      body: JSON.parse(String(init.body || "{}")),
    };
    telegramCalls.push(call);
    if (/sendMessage$/.test(call.url)) {
      return Response.json({ ok: true, result: { message_id: 99, chat: { id: chatId }, text: call.body.text } });
    }
    return Response.json({ ok: true, result: true });
  };

  try {
    const response = await worker.fetch(joinRequest(chatId), makeEnv());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.handled, true);
    assert.equal(body.flow, "telegram_group_join_cleanup");
    assert.equal(body.surface, expectedSurface);
    assert.equal(body.deleted, true);

    const deleteCall = telegramCalls.find((call) => /deleteMessage$/.test(call.url));
    assert.ok(deleteCall);
    assert.deepEqual(deleteCall.body, { chat_id: String(chatId), message_id: 55 });

    const welcomeCall = telegramCalls.find((call) => /sendMessage$/.test(call.url));
    if (expectWelcome) {
      assert.ok(welcomeCall);
      assert.equal(body.welcome_sent, true);
      assert.match(welcomeCall.body.text, /ยินดีต้อนรับสู่ MMD Privé Preview/);
      assert.match(welcomeCall.body.text, /\/commands/);
      assert.doesNotMatch(welcomeCall.body.text, /เพศ|gender|payment_ref|canonical_client_id/i);
      const urls = welcomeCall.body.reply_markup.inline_keyboard.flat().map((button) => button.url);
      assert.equal(urls.includes("https://t.me/mmdprivebot"), true);
    } else {
      assert.equal(welcomeCall, undefined);
      assert.equal(body.welcome_sent, false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("HYPE deletes join service messages in MMD Chat", { concurrency: false }, async () => {
  await expectDeletedJoin(-100777, "mmd_chat");
});

test("HYPE replaces Telegram Preview join service messages with a safe HYPE welcome", { concurrency: false }, async () => {
  await expectDeletedJoin(-100888, "telegram_preview", { expectWelcome: true });
});

test("legacy Standard Group binding remains supported", { concurrency: false }, async () => {
  await expectDeletedJoin(-100555, "standard_group");
});

test("HYPE leaves join service messages in other groups untouched", async () => {
  const response = await worker.fetch(joinRequest(-100999), makeEnv());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.handled, false);
  assert.equal(body.reason, "join_message_outside_cleanup_groups");
});

test("join cleanup is disabled until at least one cleanup group is configured", async () => {
  const response = await worker.fetch(joinRequest(), makeEnv({
    TELEGRAM_STANDARD_GROUP_ID: "",
    TELEGRAM_MMD_CHAT_GROUP_ID: "",
    TELEGRAM_PREVIEW_GROUP_ID: "",
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.handled, false);
  assert.equal(body.reason, "join_cleanup_not_configured");
});


test("HYPE does not welcome a bot joining Telegram Preview", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const telegramCalls = [];

  globalThis.fetch = async (url, init = {}) => {
    telegramCalls.push({ url: String(url), body: JSON.parse(String(init.body || "{}")) });
    return Response.json({ ok: true, result: true });
  };

  try {
    const req = new Request(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
      },
      body: JSON.stringify({
        update_id: 101,
        message: {
          message_id: 56,
          chat: { id: -100888, type: "supergroup" },
          from: { id: 111 },
          new_chat_members: [{ id: 333, first_name: "Automation", is_bot: true }],
        },
      }),
    });

    const response = await worker.fetch(req, makeEnv());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.deleted, true);
    assert.equal(body.welcome_sent, false);
    assert.equal(telegramCalls.filter((call) => /sendMessage$/.test(call.url)).length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
