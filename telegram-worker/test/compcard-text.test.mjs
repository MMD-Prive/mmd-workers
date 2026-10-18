import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import worker from "../src/index.js";
import { COMPCARD_TEXT_PATH } from "../src/compcard-photo.js";

const ENV = {
  TELEGRAM_BOT_TOKEN: "fixture-bot-secret-never-expose",
  AUTH_SERVICE_STUDIO_TO_TELEGRAM: "fixture-studio-secret",
  AUTH_SERVICE_EVENTS_TO_TELEGRAM: "fixture-events-secret",
  INTERNAL_API_TOKEN: "fixture-owner-secret",
  AUTH_SERVICE_PAYMENTS_TO_TELEGRAM: "fixture-payments-secret",
  TELEGRAM_PREMIUM_GROUP_ID: "-1001111111111",
  TELEGRAM_STANDARD_GROUP_ID: "-1002222222222",
  TELEGRAM_PREVIEW_CHANNEL_ID: "-1003333333333",
  TELEGRAM_PREVIEW_GROUP_ID: "-1004444444444",
};
const ROOMS = { premium: ENV.TELEGRAM_PREMIUM_GROUP_ID, standard: ENV.TELEGRAM_STANDARD_GROUP_ID, preview: ENV.TELEGRAM_PREVIEW_CHANNEL_ID };
const TEXT = "CARE BACK · ตรวจสอบสิทธิ์ที่แสดงใน MY MMD\nhttps://my.mmdbkk.com/\n<b>ข้อความนี้เป็น plain text</b>";
const normalize = value => value.replace(/\r\n?/g, "\n");
const digest = value => createHash("sha256").update(value, "utf8").digest("hex");

function request(options = {}) {
  const text = options.text ?? TEXT;
  const destination = options.destination ?? "premium";
  const body = {
    destination,
    expected_chat_id: options.expectedChatId ?? ROOMS[destination],
    text,
    approved_sha256: options.hash ?? digest(typeof text === "string" ? normalize(text) : ""),
  };
  options.modify?.(body);
  return new Request(`https://telegram-worker.internal${COMPCARD_TEXT_PATH}`, {
    method: "POST",
    headers: {
      "content-type": options.contentType ?? "application/json; charset=utf-8",
      authorization: `Bearer ${options.token ?? ENV.AUTH_SERVICE_EVENTS_TO_TELEGRAM}`,
      ...options.headers,
    },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

function mockTelegram(t, overrides = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.ok(String(url).startsWith("https://api.telegram.org/bot"));
    assert.equal(init.redirect, "error");
    assert.equal(init.headers["Content-Type"], "application/json");
    const method = String(url).split("/").at(-1);
    const body = JSON.parse(init.body);
    calls.push({ method, body });
    const chat = { id: Number(body.chat_id), type: body.chat_id === ROOMS.preview ? "channel" : "supergroup", title: "MMD PRIVÉ" };
    if (overrides[method]) return overrides[method]({ body, chat });
    if (method === "getChat") return Response.json({ ok: true, result: chat });
    if (method === "getMe") return Response.json({ ok: true, result: { id: 777, is_bot: true } });
    if (method === "getChatMember") return Response.json({ ok: true, result: { status: "administrator", can_post_messages: true, user: { id: 777, is_bot: true } } });
    if (method === "sendMessage") return Response.json({ ok: true, result: { message_id: 815, chat, text: body.text, date: 1792332000 } });
    throw new Error(`unexpected API ${method}`);
  });
  return calls;
}

test("dedicated approved-text route is discoverable and accepts POST only", async t => {
  const calls = mockTelegram(t);
  const health = await worker.fetch(new Request("https://telegram-worker.internal/health"), ENV);
  assert.deepEqual((await health.json()).routes.compcard_text, [COMPCARD_TEXT_PATH]);
  const read = await worker.fetch(new Request(`https://telegram-worker.internal${COMPCARD_TEXT_PATH}`), ENV);
  assert.equal(read.status, 404);
  assert.equal(calls.length, 0);
});

for (const destination of Object.keys(ROOMS)) {
  test(`approved text sends once to exact ${destination} with plain text, no link preview, and a verified receipt`, async t => {
    const calls = mockTelegram(t);
    const response = await worker.fetch(request({ destination, text: TEXT.replaceAll("\n", "\r\n"), hash: digest(TEXT).toUpperCase(), token: destination === "premium" ? ENV.AUTH_SERVICE_STUDIO_TO_TELEGRAM : ENV.AUTH_SERVICE_EVENTS_TO_TELEGRAM }), ENV);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, delivery_state: "sent", destination, approved_sha256: digest(TEXT), message_id: 815, chat_id: ROOMS[destination], chat_type: destination === "preview" ? "channel" : "supergroup", telegram_date: 1792332000 });
    assert.deepEqual(calls.map(call => call.method), ["getChat", "getMe", "getChatMember", "sendMessage"]);
    assert.deepEqual(calls[3].body, { chat_id: ROOMS[destination], text: TEXT, link_preview_options: { is_disabled: true } });
    assert.doesNotMatch(JSON.stringify(body), /fixture-bot-secret|fixture-events-secret|fixture-studio-secret/);
  });
}

test("text endpoint excludes generic owner, payment, absent, and conflicting service tokens", async t => {
  const calls = mockTelegram(t);
  for (const options of [
    { token: "" }, { token: "wrong" }, { token: ENV.INTERNAL_API_TOKEN }, { token: ENV.AUTH_SERVICE_PAYMENTS_TO_TELEGRAM },
    { token: "x".repeat(4097) }, { headers: { "X-Internal-Token": "conflicting" } },
  ]) {
    const response = await worker.fetch(request(options), ENV);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).delivery_state, "not_sent");
  }
  assert.equal((await worker.fetch(request(), { ...ENV, AUTH_SERVICE_EVENTS_TO_TELEGRAM: "", AUTH_SERVICE_STUDIO_TO_TELEGRAM: "" })).status, 503);
  assert.equal(calls.length, 0);
});

test("strict text JSON, approval hash, and frozen destination prevent unauthorized body changes", async t => {
  const calls = mockTelegram(t);
  const cases = [
    { rawBody: "not-json" }, { rawBody: "null" }, { rawBody: "[]" }, { rawBody: "42" },
    { destination: "unknown" }, { destination: "__proto__" },
    { expectedChatId: "-1009999999999" }, { expectedChatId: ROOMS.standard }, { expectedChatId: "@MMDPriveTH" },
    { hash: "" }, { hash: "b".repeat(64) }, { hash: digest(TEXT.replaceAll("\n", "\r\n")), text: TEXT.replaceAll("\n", "\r\n") },
    { text: "" }, { text: " \t\n " }, { text: 23 }, { text: [TEXT] }, { text: "a".repeat(4097) },
    { text: "control\u0000byte" }, { text: "invalid\ud800" }, { text: "invalid\udc00" },
    ...["text", "destination", "expected_chat_id", "approved_sha256"].map(field => ({ modify: body => delete body[field] })),
    ...["chat_id", "parse_mode", "entities", "reply_markup", "message_thread_id", "photo", "link_preview_options"].map(field => ({ modify: body => { body[field] = "untrusted"; } })),
  ];
  for (const options of cases) {
    const response = await worker.fetch(request(options), ENV);
    assert.ok([400, 409].includes(response.status));
    assert.equal((await response.json()).delivery_state, "not_sent");
  }
  assert.equal((await worker.fetch(request({ contentType: "text/plain" }), ENV)).status, 415);
  assert.equal(calls.length, 0);
});

test("4096-unit approved text and well-formed Unicode are accepted without modification", async t => {
  const calls = mockTelegram(t);
  const text = "ก".repeat(4092) + "\n✨🙂";
  assert.equal(text.length, 4096);
  const response = await worker.fetch(request({ text }), ENV);
  assert.equal(response.status, 200);
  assert.equal(calls.at(-1).body.text, text);
});

test("oversized JSON is rejected even without a Content-Length header", async t => {
  const calls = mockTelegram(t);
  const response = await worker.fetch(request({ rawBody: JSON.stringify({ text: "a".repeat(65_536) }) }), ENV);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).delivery_state, "not_sent");
  assert.equal(calls.length, 0);
});

for (const [name, override] of [
  ["different chat", { getChat: ({ chat }) => Response.json({ ok: true, result: { ...chat, id: -1009999999999 } }) }],
  ["Preview discussion group", { getChat: ({ chat }) => Response.json({ ok: true, result: { ...chat, type: "supergroup" } }) }],
  ["missing posting permission", { getChatMember: () => Response.json({ ok: true, result: { status: "administrator", can_post_messages: false, user: { id: 777, is_bot: true } } }) }],
]) {
  test(`approved-text preflight blocks ${name} before any message`, async t => {
    const calls = mockTelegram(t, override);
    const response = await worker.fetch(request({ destination: "preview" }), ENV);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).delivery_state, "not_sent");
    assert.equal(calls.some(call => call.method === "sendMessage"), false);
  });
}

for (const errorCode of [400, 403, 429]) {
  test(`explicit text rejection ${errorCode} is not_sent and never retried`, async t => {
    const calls = mockTelegram(t, { sendMessage: () => Response.json({ ok: false, error_code: errorCode, description: ENV.TELEGRAM_BOT_TOKEN, parameters: { retry_after: 30 } }, { status: errorCode }) });
    const response = await worker.fetch(request(), ENV);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.delivery_state, "not_sent");
    assert.equal(body.telegram_error_code, errorCode);
    assert.equal(body.retry_after_seconds, errorCode === 429 ? 30 : undefined);
    assert.doesNotMatch(JSON.stringify(body), /fixture-bot-secret/);
    assert.deepEqual(calls.map(call => call.method), ["getChat", "getMe", "getChatMember", "sendMessage"]);
  });
}

for (const [name, outcome] of [
  ["different text", ({ chat }) => Response.json({ ok: true, result: { message_id: 815, chat, text: "different" } })],
  ["missing text", ({ chat }) => Response.json({ ok: true, result: { message_id: 815, chat } })],
  ["changed text newlines", ({ chat }) => Response.json({ ok: true, result: { message_id: 815, chat, text: TEXT.replaceAll("\n", "\r\n") } })],
  ["invalid message ID", ({ chat, body }) => Response.json({ ok: true, result: { message_id: 0, chat, text: body.text } })],
  ["wrong receipt chat", ({ chat, body }) => Response.json({ ok: true, result: { message_id: 815, chat: { ...chat, id: -1009999999999 }, text: body.text } })],
  ["HTTP 500", () => Response.json({ ok: false, error_code: 500 }, { status: 500 })],
  ["non-JSON response", () => new Response("gateway error", { status: 502 })],
  ["network timeout", () => { throw new Error(`timeout at https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`); }],
]) {
  test(`${name} after sendMessage is held as delivery_uncertain with no second send`, async t => {
    const calls = mockTelegram(t, { sendMessage: outcome });
    const response = await worker.fetch(request(), ENV);
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.delivery_state, "delivery_uncertain");
    assert.doesNotMatch(JSON.stringify(body), /fixture-bot-secret|api\.telegram\.org/);
    assert.deepEqual(calls.map(call => call.method), ["getChat", "getMe", "getChatMember", "sendMessage"]);
  });
}
