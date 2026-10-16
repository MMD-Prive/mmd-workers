import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../src/index.js";
import { buildKenjiMemberReply } from "../../shared/kenji-member-concierge-core.mjs";

const originalFetch = globalThis.fetch;
const DISCUSSION_ID = "-1002579607650";
const CHANNEL_ID = "-1002393788585";
afterEach(() => { globalThis.fetch = originalFetch; });

function runtime() {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "local-test-secret",
    TELEGRAM_BOT_TOKEN: "local-test-bot",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    TELEGRAM_PREVIEW_CHANNEL_ID: CHANNEL_ID,
    TELEGRAM_MMD_CHAT_GROUP_ID: DISCUSSION_ID,
  };
}

function mockTelegram() {
  const sent = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), "https://api.telegram.org/botlocal-test-bot/sendMessage");
    assert.equal(options.method, "POST");
    sent.push(JSON.parse(options.body));
    return Response.json({ ok: true, result: { message_id: 100 } });
  };
  return sent;
}

async function receive(update, env = runtime()) {
  const response = await worker.fetch(new Request("https://telegram.test/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "local-test-secret",
    },
    body: JSON.stringify(update),
  }), env);
  return { status: response.status, body: await response.json() };
}

function groupMessage(text, overrides = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      text,
      chat: { id: DISCUSSION_ID, type: "supergroup" },
      from: { id: 123, is_bot: false },
      ...overrides,
    },
  };
}

test("explicit Preview discussion FAQ gets the same shared Kenji reply as private chat", async () => {
  const sent = mockTelegram();
  const question = "Membership Package";
  const mention = "@mmdprivebot";
  const privateResponse = await receive({
    update_id: 0,
    message: { message_id: 9, text: question, chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false } },
  });
  assert.equal(privateResponse.body.flow, "membership_chat");
  const privateReply = sent.at(-1).text;
  const { status, body } = await receive(groupMessage(`${mention} ${question}`, {
    entities: [{ type: "mention", offset: 0, length: mention.length }],
  }));
  assert.equal(status, 200);
  assert.equal(body.flow, "membership_chat");
  assert.equal(body.intent, "membership_package");
  assert.equal(sent.length, 2);
  assert.equal(sent.at(-1).text, privateReply);
  assert.equal(privateReply, buildKenjiMemberReply(question));
  assert.equal(sent.at(-1).reply_to_message_id, 10);
  assert.equal(sent.at(-1).chat_id, DISCUSSION_ID);
});

test("addressed command and reply-to-bot are supported", async () => {
  const sent = mockTelegram();
  const command = "/ask@mmdprivebot";
  const commandResponse = await receive(groupMessage(`${command} สมัครสมาชิกใหม่`, {
    entities: [{ type: "bot_command", offset: 0, length: command.length }],
  }));
  assert.equal(commandResponse.body.intent, "membership_signup");

  const replyResponse = await receive(groupMessage("แพ็กเกจสมาชิกมีสิทธิอะไร", {
    reply_to_message: { from: { id: 999, is_bot: true, username: "mmdprivebot" } },
  }));
  assert.equal(replyResponse.body.intent, "membership_details");
  assert.equal(sent.length, 2);
});

test("unaddressed discussion chatter and protected questions receive no FAQ response", async () => {
  const sent = mockTelegram();
  for (const text of [
    "Membership Package",
    "@mmdprivebot Membership Package status",
    "@mmdprivebot Membership Package active?",
    "@mmdprivebot Membership Package payment approved?",
    "@mmdprivebot Membership Package booking confirmed?",
    "@mmdprivebot Membership Package access granted?",
  ]) {
    const entities = text.startsWith("@mmdprivebot")
      ? [{ type: "mention", offset: 0, length: "@mmdprivebot".length }]
      : [];
    const { body } = await receive(groupMessage(text, { entities }));
    assert.notEqual(body.flow, "membership_chat", text);
  }
  assert.equal(sent.length, 0);
});

test("unrelated groups fail to enter the Preview discussion FAQ path", async () => {
  const sent = mockTelegram();
  for (const chat of [
    { id: "-1002393788587", type: "supergroup" },
    { id: "-1002393788588", type: "group" },
  ]) {
    const { body } = await receive(groupMessage("@mmdprivebot random text", {
      chat,
      entities: [{ type: "mention", offset: 0, length: "@mmdprivebot".length }],
    }));
    assert.notEqual(body.flow, "membership_chat");
  }
  assert.equal(sent.length, 0);
});

test("channel posts, edited messages, anonymous users, forwards, and bot senders do not trigger", async () => {
  const sent = mockTelegram();
  const mention = "@mmdprivebot";
  const message = groupMessage(`${mention} Membership Package`, {
    entities: [{ type: "mention", offset: 0, length: mention.length }],
  }).message;
  for (const update of [
    { update_id: 2, channel_post: message },
    { update_id: 3, edited_message: message },
    { update_id: 4, message: { ...message, from: { id: 123, is_bot: true } } },
    { update_id: 5, message: { ...message, sender_chat: { id: DISCUSSION_ID } } },
    { update_id: 6, message: { ...message, forward_origin: { type: "user" } } },
  ]) {
    const { body } = await receive(update);
    assert.notEqual(body.flow, "membership_chat");
  }
  assert.equal(sent.length, 0);
});

test("missing discussion ID fails closed", async () => {
  const sent = mockTelegram();
  const env = runtime();
  delete env.TELEGRAM_PREVIEW_DISCUSSION_CHAT_ID;
  delete env.TELEGRAM_MMD_CHAT_GROUP_ID;
  const mention = "@mmdprivebot";
  const { body } = await receive(groupMessage(`${mention} Membership Package`, {
    entities: [{ type: "mention", offset: 0, length: mention.length }],
  }), env);
  assert.notEqual(body.flow, "membership_chat");
  assert.equal(sent.length, 0);
});

test("/start preview keeps the locked public-safe keyboard", async () => {
  const sent = mockTelegram();
  const { status, body } = await receive({
    update_id: 7,
    message: { message_id: 11, text: "/start preview", chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false } },
  });
  assert.equal(status, 200);
  assert.equal(body.flow, "preview_start");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].reply_markup.inline_keyboard, [
    [{ text: "🎁 เช็กสิทธิ์ 6 YEARS CARE BACK", url: "https://www.mmdbkk.com/promotion/6-years-care-back" }],
    [{ text: "My Code / Status", url: "https://www.mmdbkk.com/member/dashboard" }],
    [{ text: "Preview Models", url: "https://www.mmdbkk.com/profiles" }],
    [{ text: "Apply / Renew Membership", url: "https://www.mmdbkk.com/pay/membership" }],
    [{ text: "Help / How It Works", url: "https://www.mmdbkk.com/promotion/6-years-care-back#how-it-works" }],
    [{ text: "Back to Preview Channel", url: "https://t.me/MMDPriveTH" }],
  ]);
});
