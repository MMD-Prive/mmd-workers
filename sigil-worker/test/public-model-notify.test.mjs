import test from "node:test";
import assert from "node:assert/strict";
import { TELEGRAM_NOTIFY_FIELDS, buildPublicModelTelegramMessage, notifyPublicModelApplication, publicModelThreadId, shouldAttemptPublicModelNotification } from "../src/public-model-notify.js";

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

test("thread routing preserves Public Model -> Admin -> confirm fallback", () => {
  assert.equal(publicModelThreadId({ TELEGRAM_PUBLIC_MODEL_THREAD_ID: "88", TELEGRAM_ADMIN_THREAD_ID: "77", TG_THREAD_CONFIRM: "61" }), 88);
  assert.equal(publicModelThreadId({ TELEGRAM_ADMIN_THREAD_ID: "77", TG_THREAD_CONFIRM: "61" }), 77);
  assert.equal(publicModelThreadId({ TG_THREAD_CONFIRM: "61" }), 61);
});

test("alert is privacy-light", () => {
  const text = buildPublicModelTelegramMessage({ nickname: "Tester", age: 28, height: 181, location: "Bangkok", occupation_detail: "Barista", work_types: ["Public Events"], phone: "0999999999", line_id: "secret-line", email: "private@example.com", why_consider: "private motivation", uploads: [{ kind: "photo" }, { kind: "document" }] }, APPLICATION_ID);
  assert.match(text, /MMD Public Model Application/);
  assert.match(text, new RegExp(APPLICATION_ID));
  assert.doesNotMatch(text, /0999999999|secret-line|private@example\.com|private motivation/);
});

test("success writes pending then sent", async () => {
  const writes = [];
  const telegramCalls = [];
  const env = {
    AIRTABLE_API_TOKEN: "test-airtable-token", TELEGRAM_BOT_TOKEN: "test-telegram-token", TELEGRAM_CHAT_ID: "-100123", TG_THREAD_CONFIRM: "61",
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
  assert.equal(telegramCalls[0].body.message_thread_id, 61);
  assert.equal(writes[0][TELEGRAM_NOTIFY_FIELDS.status], "pending");
  assert.equal(writes[1][TELEGRAM_NOTIFY_FIELDS.status], "sent");
  assert.ok(writes[1][TELEGRAM_NOTIFY_FIELDS.notifiedAt]);
});

test("failure is audited without rolling back application", async () => {
  const writes = [];
  const env = {
    AIRTABLE_API_TOKEN: "test-airtable-token", TELEGRAM_CHAT_ID: "-100123",
    AIRTABLE_FETCH: async (_url, init = {}) => {
      const method = init.method || "GET";
      if (method === "GET") return jsonResponse({ records: [{ id: RECORD_ID, fields: {} }] });
      const body = JSON.parse(init.body); writes.push(body.fields); return jsonResponse({ id: RECORD_ID, fields: body.fields });
    },
  };
  await assert.rejects(notifyPublicModelApplication({ env, payload: { nickname: "Tester" }, applicationId: APPLICATION_ID }), /missing_telegram_configuration/);
  assert.equal(writes[0][TELEGRAM_NOTIFY_FIELDS.status], "pending");
  assert.equal(writes[1][TELEGRAM_NOTIFY_FIELDS.status], "failed");
});
