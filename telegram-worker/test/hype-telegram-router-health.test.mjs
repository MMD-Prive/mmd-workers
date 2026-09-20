import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTelegramRouterHealth,
  HYPE_TELEGRAM_ROUTER_HEALTH_SCHEMA,
} from "../src/hype-telegram-router-health.js";

function configuredEnv() {
  return {
    TELEGRAM_BOT_TOKEN: "test-bot-token",
    TELEGRAM_CHAT_ID: "-1003546439681",
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "secret",
    INTERNAL_API_TOKEN: "internal",
    TG_THREAD_BOOKING_DRAFT: "1399",
    TG_THREAD_PAYMENTS_MEMBERSHIP: "20",
    TG_THREAD_POINTS: "17",
    TG_THREAD_PAYMENTS_CONFIRM: "22",
    TG_THREAD_ALERTS: "9",
    TG_THREAD_PUBLIC_MODEL: "155",
    TG_THREAD_PARTNER_CONFIRM: "61",
    TG_THREAD_HIMAI_ORDERS: "157",
    TG_THREAD_HIMAI_PAYMENTS: "158",
    TG_THREAD_HIMAI_ALERTS: "159",
    TG_THREAD_MMD_SHOP_ORDERS: "160",
    TG_THREAD_MMD_SHOP_PAYMENTS: "161",
    TG_THREAD_MMD_SHOP_ALERTS: "162",
    TG_THREAD_LEGACY_ARCHIVE: "134",
    TG_THREAD_RULES_MODEL: "39",
    TG_THREAD_RULES_CUSTOMER: "29",
  };
}

test("router health is partial while legacy direct senders remain", async () => {
  const result = await buildTelegramRouterHealth(configuredEnv());
  assert.equal(result.schema, HYPE_TELEGRAM_ROUTER_HEALTH_SCHEMA);
  assert.equal(result.status, "partial");
  assert.equal(result.ok, true);
  assert.equal(result.counts.unavailable, 0);
  assert.ok(result.counts.partial > 0);
  assert.ok(result.counts.legacy_direct_senders > 0);
  assert.ok(result.causes.includes("legacy_direct_senders_present"));
  assert.equal(result.canonical_owner, "telegram-worker");
});

test("missing bot token makes router degraded", async () => {
  const env = configuredEnv();
  delete env.TELEGRAM_BOT_TOKEN;
  const result = await buildTelegramRouterHealth(env);
  assert.equal(result.status, "degraded");
  assert.equal(result.ok, false);
  assert.ok(result.causes.includes("telegram_bot_token_missing"));
  assert.ok(result.counts.unavailable > 0);
});

test("canonical payment lanes remain configured while direct sender lanes are partial", async () => {
  const result = await buildTelegramRouterHealth(configuredEnv());
  const byKey = Object.fromEntries(result.lanes.map((lane) => [lane.key, lane]));
  assert.equal(byKey.payments.status, "configured");
  assert.equal(byKey.membership.status, "configured");
  assert.equal(byKey.booking.status, "configured");
  assert.equal(byKey.public_model.status, "partial");
  assert.equal(byKey.mms_applications.status, "partial");
  assert.equal(byKey.partner_ops.status, "partial");
  assert.equal(byKey.mmd_shop_payments.status, "partial");
});

test("router health never exposes raw chat ids or thread ids", async () => {
  const env = configuredEnv();
  const result = await buildTelegramRouterHealth(env);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(env.TELEGRAM_CHAT_ID), false);
  for (const thread of ["1399","20","17","22","9","155","61","157","158","159","160","161","162","134","39","29"]) {
    assert.equal(new RegExp('\"thread_id\"\\s*:\\s*' + thread).test(serialized), false);
  }
  assert.equal(serialized.includes("test-bot-token"), false);
  assert.equal(serialized.includes("internal"), false);
});

test("live probe failure degrades otherwise-configured router without sending a message", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    assert.match(String(url), /api\.telegram\.org\/bottest-bot-token\/(?:getMe|getWebhookInfo)/);
    return new Response(JSON.stringify({ ok: false }), { status: 503, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await buildTelegramRouterHealth(configuredEnv(), { probe: true });
    assert.equal(result.status, "degraded");
    assert.equal(result.transport.live_probe.attempted, true);
    assert.equal(result.transport.live_probe.ok, false);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = previous;
  }
});
