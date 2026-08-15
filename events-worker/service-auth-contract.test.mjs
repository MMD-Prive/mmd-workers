import assert from "node:assert/strict";
import test from "node:test";

import { callPaymentsVerify, rtRoomOpen, tgInternalSend } from "./src/index.js";

test("Events sends dedicated credentials to Payments, Realtime, and Telegram", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return Response.json({ ok: true });
  };

  const env = {
    PAYMENTS_WORKER_BASE: "https://payments.test",
    RT_BASE_URL: "https://realtime.test",
    TELEGRAM_WORKER_BASE: "https://telegram.test",
    AUTH_SERVICE_EVENTS_TO_PAYMENTS: "events-payments-secret",
    AUTH_SERVICE_EVENTS_TO_REALTIME: "events-realtime-secret",
    AUTH_SERVICE_EVENTS_TO_TELEGRAM: "events-telegram-secret",
    CONFIRM_KEY: "legacy-confirm-key",
    INTERNAL_TOKEN: "legacy-internal-token",
  };

  try {
    await callPaymentsVerify({ session_id: "sess_1" }, env);
    await rtRoomOpen(env, { job_id: "job_1" });
    await tgInternalSend(env, { text: "test" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(calls.map((call) => call.url), [
    "https://payments.test/v1/internal/pay/verify",
    "https://realtime.test/v1/rt/room/open",
    "https://telegram.test/telegram/internal/send",
  ]);
  assert.equal(calls[0].init.headers["X-Internal-Token"], "events-payments-secret");
  assert.equal(calls[1].init.headers["X-Internal-Token"], "events-realtime-secret");
  assert.equal(calls[2].init.headers["X-Internal-Token"], "events-telegram-secret");
  assert.doesNotMatch(JSON.stringify(calls), /legacy-confirm-key|legacy-internal-token/);
});

test("Events fails closed when dedicated service credentials are missing", async () => {
  await assert.rejects(
    callPaymentsVerify({}, { PAYMENTS_WORKER_BASE: "https://payments.test" }),
    /missing_AUTH_SERVICE_EVENTS_TO_PAYMENTS/,
  );
  await assert.rejects(
    rtRoomOpen({ RT_BASE_URL: "https://realtime.test" }, {}),
    /missing_events_to_realtime_auth/,
  );
  assert.deepEqual(
    await tgInternalSend({ TELEGRAM_WORKER_BASE: "https://telegram.test" }, {}),
    { ok: false, skipped: true, reason: "missing_events_to_telegram_auth" },
  );
});
