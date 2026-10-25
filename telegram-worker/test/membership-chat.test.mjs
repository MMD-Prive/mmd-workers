import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../src/index.js";
import { buildKenjiMemberReply } from "../../shared/kenji-member-concierge-core.mjs";
import { MEMBERSHIP_WELCOME_COPY } from "../../shared/membership-welcome-copy.mjs";

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
    PREVIEW_PROMO_CODES_KV: { put() { throw new Error("Membership chat must not write promo records"); } },
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

async function receiveUpdate(update, env = runtime()) {
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
  const privateResponse = await receiveUpdate({
    update_id: 0,
    message: { message_id: 9, text: question, chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false } },
  });
  assert.equal(privateResponse.body.flow, "membership_chat");
  const privateReply = sent.at(-1).text;
  const { status, body } = await receiveUpdate(groupMessage(`${mention} ${question}`, {
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
  const commandResponse = await receiveUpdate(groupMessage(`${command} สมัครสมาชิกใหม่`, {
    entities: [{ type: "bot_command", offset: 0, length: command.length }],
  }));
  assert.equal(commandResponse.body.intent, "membership_signup");

  const replyResponse = await receiveUpdate(groupMessage("แพ็กเกจสมาชิกมีสิทธิอะไร", {
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
    const { body } = await receiveUpdate(groupMessage(text, { entities }));
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
    const { body } = await receiveUpdate(groupMessage("@mmdprivebot random text", {
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
    const { body } = await receiveUpdate(update);
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
  const { body } = await receiveUpdate(groupMessage(`${mention} Membership Package`, {
    entities: [{ type: "mention", offset: 0, length: mention.length }],
  }), env);
  assert.notEqual(body.flow, "membership_chat");
  assert.equal(sent.length, 0);
});

test("/start preview keeps the locked public-safe keyboard", async () => {
  const sent = mockTelegram();
  const { status, body } = await receiveUpdate({
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

async function receive(text, { path = "/telegram/webhook", secret = "local-test-secret", edited = false, type = "private", isBot = false, binding } = {}) {
  const response = await worker.fetch(new Request(`https://telegram.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
    body: JSON.stringify({ update_id: 1, [edited ? "edited_message" : "message"]: {
      message_id: 10, text, chat: { id: 111111, type }, from: { id: 111111, is_bot: isBot },
    } }),
  }), { ...runtime(), ...(binding ? { HYPE_CONTEXT_WRITER: binding } : {}) });
  return { status: response.status, body: await response.json() };
}

for (const path of ["/telegram/webhook", "/v1/webhook"]) {
  test(`${path} uses the exact Kenji response for both membership spellings`, async () => {
    const sent = mockTelegram();
    for (const keyword of ["Membership Package", "Membership Packcage", "  MEMBERSHIP   PACKCAGE  ", "แพ็กเกจสมาชิก"]) {
      const { status, body } = await receive(keyword, { path });
      assert.equal(status, 200);
      assert.equal(body.flow, "membership_chat");
      assert.equal(body.intent, "membership_package");
      assert.equal(body.telegram.ok, true);
      assert.deepEqual(sent.at(-1), {
        chat_id: "111111", text: buildKenjiMemberReply(keyword), parse_mode: "HTML", disable_web_page_preview: true,
      });
    }
    assert.equal(sent.length, 4);
  });
}

test("Public requests get the unavailable response without sales links, price or keyboard", async () => {
  const sent = mockTelegram();
  for (const keyword of ["Membership Package Public", "Membership Packcage Public ราคาเท่าไร", "Public Access", "สมัครแพคพับลิค", "ชำระแพค public"]) {
    const { body } = await receive(keyword);
    assert.equal(body.intent, "public_package_unavailable");
    assert.equal(sent.at(-1).text, MEMBERSHIP_WELCOME_COPY.publicUnavailable);
    assert.equal("reply_markup" in sent.at(-1), false);
    assert.doesNotMatch(sent.at(-1).text, /https?:|\d+\s*บาท|ส่งสลิป|ขั้นตอนสมัคร/);
  }
  assert.equal(sent.length, 5);
});

test("membership details and signup use Kenji copy without inventing price", async () => {
  const sent = mockTelegram();
  for (const keyword of ["สวัสดี Membership Packcage ราคาเท่าไร", "Membership Package สมัครใหม่"]) {
    const { body } = await receive(keyword);
    assert.equal(body.flow, "membership_chat");
    assert.equal(sent.at(-1).text, buildKenjiMemberReply(keyword));
    assert.doesNotMatch(sent.at(-1).text, /\d+\s*บาท/);
  }
});

test("membership replies require a new human private message", async () => {
  const sent = mockTelegram();
  for (const options of [{ type: "group" }, { type: "supergroup" }, { type: "channel" }, { type: "" }, { edited: true }, { isBot: true }]) {
    const { body } = await receive("Membership Package", options);
    assert.notEqual(body.flow, "membership_chat");
  }
  assert.ok(sent.every(message => message.text !== MEMBERSHIP_WELCOME_COPY.package));
});

test("unrelated and existing protected intents do not fall into membership answers", async () => {
  const sent = mockTelegram();
  for (const text of ["random note", "ต่ออายุสมาชิก", "Membership Package ส่งสลิปแล้ว", "Membership Package จอง", "/unknown"]) {
    const { body } = await receive(text);
    assert.notEqual(body.flow, "membership_chat");
  }
  assert.ok(sent.every(message => message.text !== MEMBERSHIP_WELCOME_COPY.package));
});

test("wrong webhook secret cannot trigger a membership reply", async () => {
  const sent = mockTelegram();
  const { status } = await receive("Membership Packcage", { secret: "wrong" });
  assert.equal(status, 401);
  assert.equal(sent.length, 0);
});

test("reports a Telegram send failure without retrying", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ ok: false }, { status: 502 }); };
  const { body } = await receive("Membership Package");
  assert.equal(body.telegram.ok, false);
  assert.equal(calls, 1);
});


test("unfinished transaction context keeps ownership over membership keywords", async () => {
  const sent = mockTelegram();
  const calls = [];
  const binding = { async fetch(request) {
    assert.equal(new URL(request.url).pathname, "/__internal/hype/transaction-intake");
    const body = await request.json();
    calls.push(body);
    assert.equal(body.operation, "read");
    return Response.json({ ok: true, active: true, complete: false, mode: "booking",
      fields: { service_intent: "dining" }, missing_fields: ["preferred_date", "preferred_time", "area"] });
  } };
  for (const keyword of ["Membership Package", "Membership Packcage"]) {
    const { body } = await receive(keyword, { binding });
    assert.notEqual(body.flow, "membership_chat");
    assert.match(sent.at(-1).text, /draft เดิม/);
  }
  assert.equal(calls.length, 2);
});

test("explicit owner handoff commands retain their original handler", async () => {
  mockTelegram();
  const { body } = await receive("/case-review HYPE-PER-20260919120000-abc12345");
  assert.equal(body.flow, "hype_owner_handoff_transition");
});

test("HYPE private acquisition route offers LINE OFC for men and BELIEVE IN ME for women", async () => {
  const sent = mockTelegram();
  const { status, body } = await receiveUpdate({
    update_id: 200,
    message: { message_id: 12, text: "/start route", chat: { id: 123, type: "private" }, from: { id: 123, is_bot: false } },
  });
  assert.equal(status, 200);
  assert.equal(body.flow, "hype_preview_lead_routing");
  assert.match(sent[0].text, /เลือกตามสิ่งที่สนใจได้เอง/);
  assert.deepEqual(sent[0].reply_markup.inline_keyboard, [
    [{ text: "ผู้ชาย · เข้า LINE Official", url: "https://lin.ee/xRqsALs" }],
    [{ text: "ผู้หญิง · BELIEVE IN ME", url: "https://www.mmdbkk.com/believe/inme" }],
    [{ text: "กลับไป Telegram Preview", url: "https://t.me/MMDPriveTH" }],
  ]);
});

test("HYPE acquisition routing does not run or reveal choices in a public Telegram group", async () => {
  const sent = mockTelegram();
  const { body } = await receiveUpdate({
    update_id: 201,
    message: { message_id: 13, text: "/start route", chat: { id: 123, type: "group" }, from: { id: 123, is_bot: false } },
  });
  assert.notEqual(body.flow, "hype_preview_lead_routing");
  assert.equal(sent.length, 0);
});
