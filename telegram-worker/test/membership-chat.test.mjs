import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import worker from "../src/index.js";
import { buildKenjiMemberReply } from "../../shared/kenji-member-concierge-core.mjs";
import { MEMBERSHIP_WELCOME_COPY } from "../../shared/membership-welcome-copy.mjs";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function runtime() {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "local-test-secret",
    TELEGRAM_BOT_TOKEN: "local-test-bot",
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
