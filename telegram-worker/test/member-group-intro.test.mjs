import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const URL = "https://telegram-worker.mmd.test/telegram/internal/member-groups/introduce-hype";

function env(overrides = {}) {
  return {
    TELEGRAM_BOT_TOKEN: "hype-bot-token",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    TELEGRAM_STANDARD_GROUP_ID: "-1002073919780",
    TELEGRAM_PREMIUM_GROUP_ID: "-1001668261779",
    HYPE_MEMBER_GROUP_INTRO_TOKEN: "intro-secret",
    ...overrides,
  };
}

function request(token = "intro-secret", confirm = "INTRODUCE_HYPE_MEMBER_GROUPS_V1") {
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ confirm }),
  });
}

test("HYPE member-group intro endpoint requires the ephemeral token", async () => {
  const response = await worker.fetch(request("wrong-secret"), env());
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, { ok: false, error: "unauthorized" });
  assert.doesNotMatch(JSON.stringify(body), /intro-secret|hype-bot-token/);
});

test("HYPE member-group intro preflights both groups before posting and returns message ids", { concurrency: false }, async () => {
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
      return Response.json({
        ok: true,
        result: { id: Number(payload.chat_id), type: "supergroup", title: payload.chat_id === "-1001668261779" ? "Premium" : "Standard" },
      });
    }
    if (method === "getChatMember") {
      return Response.json({ ok: true, result: { status: "administrator", user: { id: 777001, is_bot: true } } });
    }
    if (method === "sendMessage") {
      const messageId = payload.chat_id === "-1001668261779" ? 8801 : 8802;
      return Response.json({ ok: true, result: { message_id: messageId, chat: { id: Number(payload.chat_id) }, text: payload.text } });
    }
    if (method === "deleteMessage") {
      return Response.json({ ok: true, result: true });
    }
    throw new Error(`unexpected Telegram method ${method}`);
  };

  try {
    const response = await worker.fetch(request(), env());
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.mode, "hype_member_group_intro_v1");
    assert.equal(body.bot_username, "mmdprivebot");
    assert.deepEqual(body.sent, [
      { group: "premium", chat_id: "-1001668261779", message_id: 8801 },
      { group: "standard", chat_id: "-1002073919780", message_id: 8802 },
    ]);

    const firstSend = calls.findIndex((call) => call.method === "sendMessage");
    const preflightCalls = calls.slice(0, firstSend);
    assert.equal(preflightCalls.filter((call) => call.method === "getChat").length, 2);
    assert.equal(preflightCalls.filter((call) => call.method === "getChatMember").length, 2);
    assert.equal(calls.filter((call) => call.method === "sendMessage").length, 2);
    assert.equal(calls.filter((call) => call.method === "deleteMessage").length, 0);

    const introPayload = calls.find((call) => call.method === "sendMessage")?.payload;
    assert.match(introPayload.text, /สวัสดีครับ ผม HYPE/);
    assert.match(introPayload.text, /\/commands/);
    assert.match(introPayload.text, /ข้อมูลตรงนี้/);
    assert.doesNotMatch(introPayload.text, /customer|payment_ref|canonical_client_id/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE member-group intro sends nothing if either group fails preflight", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const methods = [];

  globalThis.fetch = async (url, init = {}) => {
    const method = String(url).split("/").pop();
    const payload = init.body ? JSON.parse(String(init.body)) : null;
    methods.push(method);

    if (method === "getMe") {
      return Response.json({ ok: true, result: { id: 777001, username: "mmdprivebot", is_bot: true } });
    }
    if (method === "getChat" && payload.chat_id === "-1001668261779") {
      return Response.json({ ok: false, error_code: 400, description: "Bad Request: chat not found" }, { status: 400 });
    }
    throw new Error(`unexpected method after failed preflight: ${method}`);
  };

  try {
    const response = await worker.fetch(request(), env());
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.error, "hype_member_group_preflight_failed");
    assert.equal(body.failed_group, "premium");
    assert.equal(body.stage, "getChat");
    assert.equal(methods.includes("sendMessage"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE member-group intro rolls back the first post if the second post fails", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const deletes = [];

  globalThis.fetch = async (url, init = {}) => {
    const method = String(url).split("/").pop();
    const payload = init.body ? JSON.parse(String(init.body)) : null;

    if (method === "getMe") {
      return Response.json({ ok: true, result: { id: 777001, username: "mmdprivebot", is_bot: true } });
    }
    if (method === "getChat") {
      return Response.json({ ok: true, result: { id: Number(payload.chat_id), type: "supergroup" } });
    }
    if (method === "getChatMember") {
      return Response.json({ ok: true, result: { status: "administrator" } });
    }
    if (method === "sendMessage" && payload.chat_id === "-1001668261779") {
      return Response.json({ ok: true, result: { message_id: 9901, chat: { id: -1001668261779 } } });
    }
    if (method === "sendMessage" && payload.chat_id === "-1002073919780") {
      return Response.json({ ok: false, error_code: 400, description: "Bad Request: not enough rights" }, { status: 400 });
    }
    if (method === "deleteMessage") {
      deletes.push(payload);
      return Response.json({ ok: true, result: true });
    }
    throw new Error(`unexpected Telegram method ${method}`);
  };

  try {
    const response = await worker.fetch(request(), env());
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.failed_group, "standard");
    assert.deepEqual(deletes, [{ chat_id: "-1001668261779", message_id: 9901 }]);
    assert.equal(body.rollback[0].ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
