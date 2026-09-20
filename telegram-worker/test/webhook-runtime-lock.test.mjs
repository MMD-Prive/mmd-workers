import test from "node:test";
import assert from "node:assert/strict";

import accessRuntime from "../src/access-runtime.js";

const PATH = "https://telegram-worker.malemodel-bkk.workers.dev/telegram/internal/webhook/lock";

function request(secret = "service-secret") {
  return new Request(PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-auth-reconcile-secret": secret,
    },
    body: "{}",
  });
}

function env(overrides = {}) {
  return {
    AUTH_SERVICE_AUTH_TO_TELEGRAM: "service-secret",
    TELEGRAM_BOT_TOKEN: "bot-token",
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "webhook-secret",
    ...overrides,
  };
}

test("webhook lock requires internal service auth before touching Telegram", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ ok: true });
  };
  try {
    const response = await accessRuntime.fetch(request("wrong-secret"), env(), {});
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "unauthorized" });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("webhook lock fails closed when Worker runtime secrets are missing", async () => {
  const missingBot = await accessRuntime.fetch(request(), env({ TELEGRAM_BOT_TOKEN: "" }), {});
  assert.equal(missingBot.status, 503);
  assert.equal((await missingBot.json()).error, "telegram_bot_not_configured");

  const missingSecret = await accessRuntime.fetch(request(), env({ TELEGRAM_WEBHOOK_SECRET_TOKEN: "" }), {});
  assert.equal(missingSecret.status, 503);
  assert.equal((await missingSecret.json()).error, "telegram_webhook_secret_not_configured");
});

test("webhook lock sets and verifies canonical URL using Worker runtime secrets without exposing them", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, body });
    if (url.endsWith("/setWebhook")) return Response.json({ ok: true, result: true });
    if (url.endsWith("/getWebhookInfo")) {
      return Response.json({
        ok: true,
        result: {
          url: "https://mmdbkk.com/telegram/webhook",
          pending_update_count: 2,
        },
      });
    }
    throw new Error("unexpected Telegram method");
  };
  try {
    const response = await accessRuntime.fetch(request(), env(), {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.authority, "telegram-worker-runtime-secrets");
    assert.equal(body.webhook_url, "https://mmdbkk.com/telegram/webhook");
    assert.equal(body.pending_update_count, 2);
    assert.equal(Object.hasOwn(body, "secret_token"), false);
    assert.equal(JSON.stringify(body).includes("bot-token"), false);
    assert.equal(JSON.stringify(body).includes("webhook-secret"), false);

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /botbot-token\/setWebhook$/);
    assert.deepEqual(calls[0].body, {
      url: "https://mmdbkk.com/telegram/webhook",
      secret_token: "webhook-secret",
      drop_pending_updates: false,
    });
    assert.match(calls[1].url, /botbot-token\/getWebhookInfo$/);
  } finally {
    globalThis.fetch = original;
  }
});
