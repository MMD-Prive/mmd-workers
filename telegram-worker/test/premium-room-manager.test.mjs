import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const WEBHOOK_URL = "https://telegram-worker.mmd.test/telegram/webhook";

function webhookRequest(update) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
    },
    body: JSON.stringify(update),
  });
}

function env(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    INTERNAL_API_TOKEN: "internal-token",
    TELEGRAM_PREMIUM_GROUP_ID: "-1001668261779",
    TELEGRAM_CHAT_ID: "-1003546439681",
    HYPE_OPERATIONS: {
      async fetch() {
        return Response.json({
          ok: true,
          state: "ready",
          membership: {
            level: "private_premium",
            lifecycle: "active",
            blocked: false,
          },
        });
      },
    },
    ...overrides,
  };
}

function premiumJoinUpdate(user = {}) {
  return {
    update_id: 9201,
    chat_join_request: {
      chat: { id: -1001668261779, type: "supergroup", title: "MMD PRIVÉ : PREMIUM" },
      from: {
        id: 222222,
        first_name: "Premium",
        username: "premium_member",
        ...user,
      },
      user_chat_id: 222222,
      date: 1790720000,
    },
  };
}

test("HYPE approves Premium join request only after canonical active Premium truth", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const telegramCalls = [];

  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), body: JSON.parse(String(init.body || "{}")) };
    telegramCalls.push(call);
    if (/approveChatJoinRequest$/.test(call.url)) return Response.json({ ok: true, result: true });
    return Response.json({ ok: true, result: true });
  };

  try {
    const response = await worker.fetch(webhookRequest(premiumJoinUpdate()), env());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.handled, true);
    assert.equal(body.flow, "hype_premium_join_request");
    assert.equal(body.code_status, "premium_join_approved");
    assert.equal(body.join_request_state, "approved");

    const approve = telegramCalls.find((call) => /approveChatJoinRequest$/.test(call.url));
    assert.ok(approve);
    assert.deepEqual(approve.body, { chat_id: "-1001668261779", user_id: 222222 });
    assert.equal(telegramCalls.some((call) => /sendMessage$/.test(call.url)), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE leaves uncertain Premium join request pending and alerts owner review", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const telegramCalls = [];

  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), body: JSON.parse(String(init.body || "{}")) };
    telegramCalls.push(call);
    if (/sendMessage$/.test(call.url)) {
      return Response.json({ ok: true, result: { message_id: 88, chat: { id: -1003546439681 } } });
    }
    return Response.json({ ok: true, result: true });
  };

  try {
    const response = await worker.fetch(webhookRequest(premiumJoinUpdate()), env({
      HYPE_OPERATIONS: {
        async fetch() {
          return Response.json({
            ok: true,
            state: "ready",
            membership: {
              level: "standard",
              lifecycle: "active",
              blocked: false,
            },
          });
        },
      },
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.handled, true);
    assert.equal(body.join_request_state, "pending_owner_review");
    assert.equal(body.code_status, "premium_entitlement_required");
    assert.equal(telegramCalls.some((call) => /approveChatJoinRequest$/.test(call.url)), false);

    const alert = telegramCalls.find((call) => /sendMessage$/.test(call.url));
    assert.ok(alert);
    assert.equal(alert.body.chat_id, "-1003546439681");
    assert.match(alert.body.text, /PREMIUM JOIN REVIEW/);
    assert.match(alert.body.text, /premium_entitlement_required/);
    assert.match(alert.body.text, /ไม่ approve \/ decline โดยเดาสิทธิ์/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Premium room sync updates description and pins canonical Welcome", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const telegramCalls = [];

  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), body: JSON.parse(String(init.body || "{}")) };
    telegramCalls.push(call);

    if (/getChat$/.test(call.url)) {
      if (String(call.body.chat_id) === "-1002073919780") {
        return Response.json({
          ok: true,
          result: {
            id: -1002073919780,
            type: "supergroup",
            title: "MMD Standard old name",
          },
        });
      }
      return Response.json({
        ok: true,
        result: {
          id: -1001668261779,
          type: "supergroup",
          title: "MMD Premium old name",
          description: "old description",
        },
      });
    }
    if (/sendMessage$/.test(call.url)) {
      return Response.json({
        ok: true,
        result: {
          message_id: 701,
          chat: { id: -1001668261779 },
          text: call.body.text,
        },
      });
    }
    return Response.json({ ok: true, result: true });
  };

  try {
    const response = await worker.fetch(new Request("https://telegram-worker.mmd.test/telegram/internal/premium-room/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Internal-Token": "internal-token",
      },
      body: JSON.stringify({ confirm: "SYNC_HYPE_PREMIUM_ROOM_V1" }),
    }), env());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.mode, "hype_premium_room_manager_v1");
    assert.equal(body.description.state, "updated");
    assert.equal(body.welcome.state, "welcome_pinned");
    assert.equal(body.titles.ok, true);
    assert.deepEqual(
      body.titles.results.map((item) => [item.surface, item.state, item.desired_title]),
      [
        ["premium_group", "updated", "MMD PRIVÉ : PREMIUM"],
        ["standard_group", "updated", "MMD PRIVÉ : STANDARD"],
      ],
    );

    const premiumTitle = telegramCalls.find((call) => /setChatTitle$/.test(call.url) && call.body.chat_id === "-1001668261779");
    assert.ok(premiumTitle);
    assert.equal(premiumTitle.body.title, "MMD PRIVÉ : PREMIUM");

    const standardTitle = telegramCalls.find((call) => /setChatTitle$/.test(call.url) && call.body.chat_id === "-1002073919780");
    assert.ok(standardTitle);
    assert.equal(standardTitle.body.title, "MMD PRIVÉ : STANDARD");

    const description = telegramCalls.find((call) => /setChatDescription$/.test(call.url));
    assert.ok(description);
    assert.match(description.body.description, /MMD PRIVÉ : PREMIUM/);
    assert.match(description.body.description, /Copy Link/);

    const welcome = telegramCalls.find((call) => /sendMessage$/.test(call.url));
    assert.ok(welcome);
    assert.match(welcome.body.text, /MMD PRIVÉ : PREMIUM/);
    assert.match(welcome.body.text, /Copy Link/);
    assert.match(welcome.body.text, /LINE Official/);
    assert.match(welcome.body.text, /SIGIL Search/);
    const buttons = welcome.body.reply_markup.inline_keyboard.flat();
    assert.equal(buttons.some((button) => button.text.includes("SIGIL Search") && new URL(button.url).searchParams.get("mode") === "search"), true);
    assert.equal(buttons.some((button) => button.text.includes("SIGIL Booking") && new URL(button.url).searchParams.get("mode") === "booking"), true);

    const pin = telegramCalls.find((call) => /pinChatMessage$/.test(call.url));
    assert.ok(pin);
    assert.deepEqual(pin.body, {
      chat_id: "-1001668261779",
      message_id: 701,
      disable_notification: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Premium room sync is idempotent when canonical Welcome is already pinned", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const telegramCalls = [];
  const description = [
    "💎 MMD PRIVÉ : PREMIUM",
    "Premium Models • Availability • Private Updates",
    "สนใจโพสต์ไหน กด Copy Link แล้วส่งมาสอบถามทาง LINE Official",
  ].join("\n");

  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), body: JSON.parse(String(init.body || "{}")) };
    telegramCalls.push(call);

    if (/getChat$/.test(call.url)) {
      if (String(call.body.chat_id) === "-1002073919780") {
        return Response.json({
          ok: true,
          result: {
            id: -1002073919780,
            type: "supergroup",
            title: "MMD PRIVÉ : STANDARD",
          },
        });
      }
      return Response.json({
        ok: true,
        result: {
          id: -1001668261779,
          type: "supergroup",
          title: "MMD PRIVÉ : PREMIUM",
          description,
          pinned_message: {
            message_id: 700,
            text: "💎 MMD PRIVÉ : PREMIUM\nเจอ Post หรือ Model ที่สนใจ กด Copy Link แล้วส่งทาง LINE Official\nกด SIGIL Search หรือ SIGIL Booking ได้เลย",
          },
        },
      });
    }
    return Response.json({ ok: true, result: true });
  };

  try {
    const response = await worker.fetch(new Request("https://telegram-worker.mmd.test/telegram/internal/premium-room/sync", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Internal-Token": "internal-token",
      },
      body: JSON.stringify({ confirm: "SYNC_HYPE_PREMIUM_ROOM_V1" }),
    }), env());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.description.state, "already_current");
    assert.equal(body.welcome.state, "already_ready");
    assert.equal(body.welcome.sent, false);
    assert.equal(body.titles.ok, true);
    assert.equal(body.titles.results.every((item) => item.state === "already_current"), true);

    assert.equal(telegramCalls.some((call) => /setChatTitle$/.test(call.url)), false);
    assert.equal(telegramCalls.some((call) => /setChatDescription$/.test(call.url)), false);
    assert.equal(telegramCalls.some((call) => /sendMessage$/.test(call.url)), false);
    assert.equal(telegramCalls.some((call) => /pinChatMessage$/.test(call.url)), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
