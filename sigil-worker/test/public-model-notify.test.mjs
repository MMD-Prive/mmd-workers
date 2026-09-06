import test from "node:test";
import assert from "node:assert/strict";
import {
  TELEGRAM_NOTIFY_FIELDS,
  buildPublicModelReviewUrl,
  buildPublicModelTelegramMessage,
  notifyPublicModelApplication,
  publicModelChatId,
  publicModelThreadId,
  shouldAttemptPublicModelNotification,
} from "../src/public-model-notify.js";

const APPLICATION_ID = "pma_abcdefgh1234";
const RECORD_ID = "recABCDEFGHIJKLMN";
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("retry policy avoids sent/pending duplicates and retries failed or unobserved duplicates", () => {
  assert.equal(shouldAttemptPublicModelNotification({ duplicate: false, status: "" }), true);
  assert.equal(shouldAttemptPublicModelNotification({ duplicate: true, status: "" }), true);
  assert.equal(shouldAttemptPublicModelNotification({ duplicate: true, status: "failed" }), true);
  assert.equal(shouldAttemptPublicModelNotification({ duplicate: true, status: "pending" }), false);
  assert.equal(shouldAttemptPublicModelNotification({ duplicate: true, status: "sent" }), false);
});

test("Public Model uses shared chat with dedicated topic and never falls back to confirm/payments topic", () => {
  assert.equal(publicModelChatId({ TELEGRAM_CHAT_ID: "-100123" }), "-100123");
  assert.equal(publicModelChatId({ TELEGRAM_PUBLIC_MODEL_CHAT_ID: "-100999", TELEGRAM_CHAT_ID: "-100123" }), "-100999");
  assert.equal(publicModelThreadId({ TELEGRAM_PUBLIC_MODEL_THREAD_ID: "155", TELEGRAM_ADMIN_THREAD_ID: "77", TG_THREAD_CONFIRM: "61" }), 155);
  assert.equal(publicModelThreadId({ TELEGRAM_ADMIN_THREAD_ID: "77", TG_THREAD_CONFIRM: "61" }), undefined);
});

test("review URL deep-links to the application", () => {
  assert.equal(
    buildPublicModelReviewUrl({ PUBLIC_MODEL_REVIEW_BASE_URL: "https://mmdbkk.com/internal/ceo/models" }, APPLICATION_ID),
    `https://mmdbkk.com/internal/ceo/models?application_id=${APPLICATION_ID}`,
  );
});

test("alert is privacy-light", () => {
  const reviewUrl = `https://mmdbkk.com/internal/ceo/models?application_id=${APPLICATION_ID}`;
  const text = buildPublicModelTelegramMessage({ nickname: "Tester", age: 28, height: 181, location: "Bangkok", occupation_detail: "Barista", work_types: ["Public Events"], phone: "0999999999", line_id: "secret-line", email: "private@example.com", why_consider: "private motivation", uploads: [{ kind: "photo" }, { kind: "document" }] }, APPLICATION_ID, reviewUrl);
  assert.match(text, /MMD Public Model Application/);
  assert.match(text, new RegExp(APPLICATION_ID));
  assert.match(text, /Open application:/);
  assert.doesNotMatch(text, /0999999999|secret-line|private@example\.com|private motivation/);
});

test("success writes pending then sent and routes to dedicated topic with one-tap review button", async () => {
  const writes = [];
  const telegramCalls = [];
  const env = {
    AIRTABLE_API_TOKEN: "test-airtable-token",
    TELEGRAM_BOT_TOKEN: "test-telegram-token",
    TELEGRAM_CHAT_ID: "-100123",
    TELEGRAM_PUBLIC_MODEL_THREAD_ID: "155",
    TG_THREAD_CONFIRM: "61",
    PUBLIC_MODEL_REVIEW_BASE_URL: "https://mmdbkk.com/internal/ceo/models",
    AIRTABLE_FETCH: async (url, init = {}) => {
      const method = init.method || "GET";
      if (method === "GET") { assert.match(String(url), /filterByFormula/); return jsonResponse({ records: [{ id: RECORD_ID, fields: {} }] }); }
      const body = JSON.parse(init.body); writes.push(body.fields); return jsonResponse({ id: RECORD_ID, fields: body.fields });
    },
    TELEGRAM_FETCH: async (url, init = {}) => { telegramCalls.push({ url: String(url), body: JSON.parse(init.body) }); return jsonResponse({ ok: true }); },
  };
  const result = await notifyPublicModelApplication({ env, payload: { nickname: "Tester" }, applicationId: APPLICATION_ID });
  assert.equal(result.ok, true);
  assert.equal(telegramCalls.length, 1);
  assert.equal(telegramCalls[0].body.chat_id, "-100123");
  assert.equal(telegramCalls[0].body.message_thread_id, 155);
  assert.notEqual(telegramCalls[0].body.message_thread_id, 61);
  assert.match(telegramCalls[0].body.text, new RegExp(`application_id=${APPLICATION_ID}`));
  assert.equal(telegramCalls[0].body.reply_markup.inline_keyboard[0][0].text, "เปิดใบสมัคร");
  assert.equal(telegramCalls[0].body.reply_markup.inline_keyboard[0][0].url, `https://mmdbkk.com/internal/ceo/models?application_id=${APPLICATION_ID}`);
  assert.equal(writes[0][TELEGRAM_NOTIFY_FIELDS.status], "pending");
  assert.equal(writes[1][TELEGRAM_NOTIFY_FIELDS.status], "sent");
  assert.ok(writes[1][TELEGRAM_NOTIFY_FIELDS.notifiedAt]);
});

test("shared chat without dedicated Public Model topic is audited and never falls back to confirm", async () => {
  const writes = [];
  const env = {
    AIRTABLE_API_TOKEN: "test-airtable-token",
    TELEGRAM_BOT_TOKEN: "test-telegram-token",
    TELEGRAM_CHAT_ID: "-100123",
    TG_THREAD_CONFIRM: "61",
    AIRTABLE_FETCH: async (_url, init = {}) => {
      const method = init.method || "GET";
      if (method === "GET") return jsonResponse({ records: [{ id: RECORD_ID, fields: {} }] });
      const body = JSON.parse(init.body); writes.push(body.fields); return jsonResponse({ id: RECORD_ID, fields: body.fields });
    },
  };
  await assert.rejects(notifyPublicModelApplication({ env, payload: { nickname: "Tester" }, applicationId: APPLICATION_ID }), /missing_public_model_telegram_configuration/);
  assert.equal(writes[0][TELEGRAM_NOTIFY_FIELDS.status], "pending");
  assert.equal(writes[1][TELEGRAM_NOTIFY_FIELDS.status], "failed");
});
