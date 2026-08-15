import assert from "node:assert/strict";
import test from "node:test";

import { callPaymentsCreateLink, verifyStartWorkPaymentTruth } from "./src/index.js";
import { notifyStudioTelegram } from "./src/studio-telegram-worker.js";

test("Admin payment calls use only Admin to Payments auth", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("final-status")) return Response.json({ ok: true, final_payment_confirmed: true });
    return Response.json({ ok: true });
  };

  const env = {
    PAYMENTS_BASE_URL: "https://payments.test",
    MODEL_SESSION_PAYMENT_TRUTH_URL: "https://payments.test/final-status",
    AUTH_SERVICE_ADMIN_TO_PAYMENTS: "admin-payments-secret",
    CONFIRM_KEY: "legacy-confirm-key",
  };

  try {
    await callPaymentsCreateLink(env, {});
    assert.deepEqual(await verifyStartWorkPaymentTruth(env, { session_id: "sess_1" }), { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.init.headers["X-Internal-Token"], "admin-payments-secret");
    assert.equal("X-Confirm-Key" in call.init.headers, false);
    assert.doesNotMatch(JSON.stringify(call.init.headers), /legacy-confirm-key/);
  }
});

test("Admin payment calls fail closed without dedicated auth", async () => {
  await assert.rejects(
    callPaymentsCreateLink({ PAYMENTS_BASE_URL: "https://payments.test" }, {}),
    /missing_AUTH_SERVICE_ADMIN_TO_PAYMENTS/,
  );
  assert.deepEqual(
    await verifyStartWorkPaymentTruth(
      { MODEL_SESSION_PAYMENT_TRUTH_URL: "https://payments.test/final-status" },
      { session_id: "sess_1" },
    ),
    { ok: false, error: "payment_service_auth_not_ready" },
  );
});

test("Studio Telegram notification sends only its dedicated credential", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (url, init = {}) => {
    sent = { url: String(url), init };
    return Response.json({ ok: true });
  };

  try {
    const result = await notifyStudioTelegram({
      TELEGRAM_INTERNAL_SEND_URL: "https://telegram.test/telegram/internal/send",
      TELEGRAM_STUDIO_CHAT_ID: "-1001",
      AUTH_SERVICE_STUDIO_TO_TELEGRAM: "studio-telegram-secret",
      INTERNAL_API_TOKEN: "legacy-api-token",
      INTERNAL_TOKEN: "legacy-internal-token",
      CONFIRM_KEY: "legacy-confirm-key",
    }, {
      path: "/studio/api/intake/commit",
      body: { model_name: "Test" },
      result: { record_id: "recTest" },
    });
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(sent.init.headers["X-Internal-Token"], "studio-telegram-secret");
  assert.deepEqual(Object.keys(sent.init.headers).sort(), ["Content-Type", "X-Internal-Token"].sort());
  assert.doesNotMatch(JSON.stringify(sent.init.headers), /legacy-/);
});

test("Studio Telegram notification skips when dedicated auth is missing", async () => {
  const result = await notifyStudioTelegram({
    TELEGRAM_INTERNAL_SEND_URL: "https://telegram.test/telegram/internal/send",
    TELEGRAM_STUDIO_CHAT_ID: "-1001",
  }, { path: "/studio/api/intake/commit", body: {}, result: {} });
  assert.deepEqual(result, { ok: false, skipped: true, reason: "missing_studio_telegram_service_auth" });
});
