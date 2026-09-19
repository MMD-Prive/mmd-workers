import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const URL = "https://telegram-worker.mmd.test/telegram/internal/preview/introduce-hype";

function env(overrides = {}) {
  return {
    TELEGRAM_BOT_TOKEN: "hype-bot-token",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    TELEGRAM_PREVIEW_CHANNEL_ID: "-1002393788585",
    HYPE_PREVIEW_INTRO_TOKEN: "preview-intro-secret",
    ...overrides,
  };
}

function request(token = "preview-intro-secret") {
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ confirm: "INTRODUCE_HYPE_PREVIEW_V1" }),
  });
}

test("Preview intro endpoint requires ephemeral token", async () => {
  const response = await worker.fetch(request("wrong"), env());
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.deepEqual(body, { ok: false, error: "unauthorized" });
});

test("Preview intro supports the Preview channel and discovers its linked discussion group", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init = {}) => {
    const method = String(url).split("/").pop();
    const payload = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, payload });

    if (method === "getMe") {
      return Response.json({ ok: true, result: { id: 777001, username: "mmdprivebot", is_bot: true } });
    }
    if (method === "getChat") {
      if (String(payload.chat_id) === "-1002393788585") {
        return Response.json({
          ok: true,
          result: {
            id: -1002393788585,
            type: "channel",
            title: "MMD Preview",
            linked_chat_id: -1009988776655,
          },
        });
      }
      if (String(payload.chat_id) === "-1009988776655") {
        return Response.json({
          ok: true,
          result: { id: -1009988776655, type: "supergroup", title: "MMD Preview Discussion" },
        });
      }
    }
    if (method === "getChatMember") {
      return Response.json({ ok: true, result: { status: "administrator", user: { id: 777001, is_bot: true } } });
    }
    if (method === "sendMessage") {
      return Response.json({ ok: true, result: { message_id: 4100, chat: { id: -1002393788585 }, text: payload.text } });
    }
    throw new Error(`unexpected method ${method}`);
  };

  try {
    const response = await worker.fetch(request(), env());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.bot_username, "mmdprivebot");
    assert.equal(body.message_id, 4100);
    assert.equal(body.chat_type, "channel");
    assert.equal(body.linked_group_id, "-1009988776655");
    assert.equal(body.linked_group_ready, true);
    assert.equal(body.linked_group_type, "supergroup");
    assert.equal(body.linked_group_membership, "administrator");
    assert.deepEqual(calls.map((call) => call.method), [
      "getMe",
      "getChat",
      "getChatMember",
      "getChat",
      "getChatMember",
      "sendMessage",
    ]);

    const sent = calls.find((call) => call.method === "sendMessage").payload;
    assert.match(sent.text, /สวัสดีครับ ผม HYPE/);
    assert.match(sent.text, /\/commands/);
    assert.match(sent.text, /private chat/);
    assert.doesNotMatch(sent.text, /customer_gender|canonical_client_id|payment_ref|เพศ:/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Preview intro sends nothing when group preflight fails", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const methods = [];

  globalThis.fetch = async (url, init = {}) => {
    const method = String(url).split("/").pop();
    const payload = init.body ? JSON.parse(String(init.body)) : null;
    methods.push(method);

    if (method === "getMe") {
      return Response.json({ ok: true, result: { id: 777001, username: "mmdprivebot", is_bot: true } });
    }
    if (method === "getChat") {
      return Response.json({ ok: false, error_code: 400, description: "Bad Request: chat not found" }, { status: 400 });
    }
    throw new Error(`unexpected method ${method} ${JSON.stringify(payload)}`);
  };

  try {
    const response = await worker.fetch(request(), env());
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.stage, "getChat");
    assert.equal(methods.includes("sendMessage"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
