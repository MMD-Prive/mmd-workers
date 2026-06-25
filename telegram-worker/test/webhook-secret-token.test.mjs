import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const WEBHOOK_URL = "https://telegram-worker.mmd.test/telegram/webhook";
const PREVIEW_POST_URL = "https://telegram-worker.mmd.test/telegram/preview/post";

function env(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    INTERNAL_API_TOKEN: "internal-secret",
    TELEGRAM_PREVIEW_CHANNEL_ID: "-100123",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    ...overrides,
  };
}

function webhookRequest(headers = {}) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      update_id: 1,
      message: {
        message_id: 10,
        text: "hello",
        chat: { id: 999 },
        from: { id: 111 },
      },
    }),
  });
}

test("/telegram/webhook rejects missing secret token when configured", async () => {
  const response = await worker.fetch(webhookRequest(), env());
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, { ok: false, error: "unauthorized" });
  assert.doesNotMatch(JSON.stringify(body), /expected-secret|X-Telegram-Bot-Api-Secret-Token/i);
});

test("/telegram/webhook rejects wrong secret token when configured", async () => {
  const response = await worker.fetch(
    webhookRequest({ "X-Telegram-Bot-Api-Secret-Token": "wrong-secret" }),
    env(),
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(body, { ok: false, error: "unauthorized" });
  assert.doesNotMatch(JSON.stringify(body), /expected-secret|wrong-secret|X-Telegram-Bot-Api-Secret-Token/i);
});

test("/telegram/webhook with correct secret token reaches update handler", async () => {
  const response = await worker.fetch(
    webhookRequest({ "X-Telegram-Bot-Api-Secret-Token": "expected-secret" }),
    env(),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.received, true);
  assert.equal(body.handled, false);
  assert.equal(body.reason, "no_matching_command");
});

test("/telegram/webhook remains open when secret token is not configured", async () => {
  const response = await worker.fetch(
    webhookRequest(),
    env({ TELEGRAM_WEBHOOK_SECRET_TOKEN: "" }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reason, "no_matching_command");
});

test("/telegram/preview/post remains protected by INTERNAL_API_TOKEN", async () => {
  const missing = await worker.fetch(new Request(PREVIEW_POST_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dry_run: true }),
  }), env());
  const missingBody = await missing.json();

  assert.equal(missing.status, 403);
  assert.equal(missingBody.error, "internal_token_required");

  const allowed = await worker.fetch(new Request(PREVIEW_POST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Internal-Token": "internal-secret",
    },
    body: JSON.stringify({ dry_run: true }),
  }), env());
  const allowedBody = await allowed.json();

  assert.equal(allowed.status, 200);
  assert.equal(allowedBody.ok, true);
  assert.equal(allowedBody.dry_run, true);
});
