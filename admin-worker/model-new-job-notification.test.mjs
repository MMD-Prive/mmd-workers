import test from "node:test";
import assert from "node:assert/strict";
import { sendModelNewJobNotification } from "./src/model-reconfirm-runtime.js";

const SESSION_ID = "sess-model-notification-1";
const MODEL_ID = "rec12345678901234";
const LINE_ID = "U0123456789abcdef0123456789abcdef";
const BASE_ENV = {
  AIRTABLE_API_KEY: "airtable-secret",
  AIRTABLE_BASE_ID: "base-test",
  AIRTABLE_TABLE_SESSIONS: "Sessions",
  AIRTABLE_TABLE_MODELS: "Models",
  AT_SESSIONS__SESSION_ID: "session_id",
  AT_SESSIONS__STATE: "session_state",
  AT_SESSIONS__MODEL_RECORD_ID: "Assigned Model",
  AT_MODELS__LINE_USER_ID: "line_user_id",
  AT_MODELS__TELEGRAM_USER_ID: "telegram_user_id",
  AT_MODELS__TELEGRAM_VERIFICATION_STATUS: "telegram_verification_status",
  MODEL_LINE_CHANNEL_ACCESS_TOKEN: "line-secret",
  MODEL_LIFF_PUBLISHED_ID: "2010864854-N34SgCqq",
};

function setupFetch({ state = "confirmed", modelFields = { line_user_id: LINE_ID }, lineStatus = 200 } = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push({ url: url.toString(), init });
    if (url.hostname === "api.airtable.com" && url.pathname.endsWith("/Sessions")) {
      return Response.json({ records: [{
        id: "recSession12345678",
        fields: { session_id: SESSION_ID, session_state: state, "Assigned Model": [MODEL_ID] },
      }] });
    }
    if (url.hostname === "api.airtable.com" && url.pathname.endsWith(`/Models/${MODEL_ID}`)) {
      return Response.json({ id: MODEL_ID, fields: modelFields });
    }
    if (url.hostname === "api.line.me") return Response.json({}, { status: lineStatus });
    if (url.hostname === "telegram-worker.test") return Response.json({ ok: true });
    throw new Error(`unexpected_fetch:${url}`);
  };
  return { calls, restore: () => { globalThis.fetch = originalFetch; } };
}

test("new confirmed assignment pushes a privacy-safe LINE notice with an app action", async () => {
  const mock = setupFetch();
  try {
    const result = await sendModelNewJobNotification(BASE_ENV, SESSION_ID);
    assert.deepEqual(result, { ok: true, channel: "line" });
    const lineCall = mock.calls.find(({ url }) => url.startsWith("https://api.line.me/"));
    assert.ok(lineCall);
    const payload = JSON.parse(lineCall.init.body);
    assert.equal(payload.to, LINE_ID);
    assert.match(payload.messages[0].altText, /มีงานใหม่/);
    assert.match(payload.messages[0].template.text, /มีงานใหม่/);
    assert.doesNotMatch(JSON.stringify(payload), /ลูกค้า|ที่อยู่|ยอดชำระ|payout/i);
    assert.equal(payload.messages[0].template.actions[0].uri, "https://liff.line.me/2010864854-N34SgCqq");
    assert.equal(mock.calls.some(({ url }) => url.includes("telegram-worker.test")), false);
  } finally {
    mock.restore();
  }
});

test("Telegram is used only as fallback after LINE fails and Model binding is verified", async () => {
  const mock = setupFetch({
    modelFields: {
      line_user_id: LINE_ID,
      telegram_user_id: "123456789",
      telegram_verification_status: "verified",
    },
    lineStatus: 503,
  });
  try {
    const result = await sendModelNewJobNotification({
      ...BASE_ENV,
      TELEGRAM_WORKER_BASE: "https://telegram-worker.test",
      AUTH_SERVICE_EVENTS_TO_TELEGRAM: "events-telegram-secret",
    }, SESSION_ID);
    assert.equal(result.ok, true);
    assert.equal(result.channel, "telegram");
    assert.equal(result.fallback_reason, "line_push_http_503");
    const sent = mock.calls.find(({ url }) => url.includes("telegram-worker.test"));
    assert.ok(sent);
    assert.equal(sent.init.headers["x-internal-token"], "events-telegram-secret");
    const payload = JSON.parse(sent.init.body);
    assert.equal(payload.chat_id, "123456789");
    assert.equal(payload.intent, "model_new_job_fallback");
    assert.match(payload.text, /MMD APP/);
  } finally {
    mock.restore();
  }
});

test("no notice is sent for a session outside the assigned/confirmed states", async () => {
  const mock = setupFetch({ state: "cancelled" });
  try {
    const result = await sendModelNewJobNotification(BASE_ENV, SESSION_ID);
    assert.deepEqual(result, { ok: true, skipped: true, reason: "session_not_assigned" });
    assert.equal(mock.calls.some(({ url }) => url.startsWith("https://api.line.me/")), false);
    assert.equal(mock.calls.some(({ url }) => url.includes("telegram-worker.test")), false);
  } finally {
    mock.restore();
  }
});

test("unverified Telegram identity is never used as fallback", async () => {
  const mock = setupFetch({
    modelFields: {
      line_user_id: LINE_ID,
      telegram_user_id: "123456789",
      telegram_verification_status: "pending",
    },
    lineStatus: 503,
  });
  try {
    const result = await sendModelNewJobNotification({
      ...BASE_ENV,
      TELEGRAM_WORKER_BASE: "https://telegram-worker.test",
      AUTH_SERVICE_EVENTS_TO_TELEGRAM: "events-telegram-secret",
    }, SESSION_ID);
    assert.equal(result.ok, false);
    assert.equal(result.telegram_reason, "verified_telegram_unavailable");
    assert.equal(mock.calls.some(({ url }) => url.includes("telegram-worker.test")), false);
  } finally {
    mock.restore();
  }
});
