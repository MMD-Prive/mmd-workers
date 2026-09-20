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
    INTERNAL_API_TOKEN: "svc-secret-router-health-test",
    AUTH_SERVICE_PAYMENTS_TO_TELEGRAM: "payments-service-secret",
    AUTH_SERVICE_MMS_TO_TELEGRAM: "mms-service-secret",
    AUTH_SERVICE_SIGIL_TO_TELEGRAM: "sigil-service-secret",
    AUTH_SERVICE_HIMAI_TO_TELEGRAM: "himai-service-secret",
    AUTH_SERVICE_PARTNERS_TO_TELEGRAM: "partners-service-secret",
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

test("router health is configured after active direct senders are fully migrated", async () => {
  const result = await buildTelegramRouterHealth(configuredEnv());
  assert.equal(result.schema, HYPE_TELEGRAM_ROUTER_HEALTH_SCHEMA);
  assert.equal(result.registry_version, "2026-09-21.2");
  assert.equal(result.status, "configured");
  assert.equal(result.ok, true);
  assert.equal(result.counts.unavailable, 0);
  assert.equal(result.counts.partial, 0);
  assert.equal(result.counts.legacy_direct_senders, 0);
  assert.equal(result.causes.includes("legacy_direct_senders_present"), false);
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

test("all migrated domain lanes require and report canonical service auth", async () => {
  const result = await buildTelegramRouterHealth(configuredEnv());
  const byKey = Object.fromEntries(result.lanes.map((lane) => [lane.key, lane]));
  for (const key of ["payments","membership","booking","public_model","mms_applications","mms_ops","partner_ops","himai_orders","himai_payments","himai_alerts","mmd_shop_orders","mmd_shop_payments","mmd_shop_alerts"]) {
    assert.equal(byKey[key].status, "configured", key);
  }
  for (const key of ["public_model","mms_applications","mms_ops","partner_ops","himai_orders","himai_payments","himai_alerts","mmd_shop_orders","mmd_shop_payments","mmd_shop_alerts"]) {
    assert.equal(byKey[key].service_auth_configured, true, key);
    assert.equal(byKey[key].migration_state, "canonical_internal_send", key);
  }
});


test("missing migrated domain service auth degrades only because the route requirement is incomplete", async () => {
  const env = configuredEnv();
  delete env.AUTH_SERVICE_MMS_TO_TELEGRAM;
  const result = await buildTelegramRouterHealth(env);
  const byKey = Object.fromEntries(result.lanes.map((lane) => [lane.key, lane]));
  assert.equal(result.status, "degraded");
  assert.equal(byKey.mms_applications.status, "unavailable");
  assert.equal(byKey.mms_ops.status, "unavailable");
  assert.equal(byKey.mms_applications.destination_configured, true);
  assert.equal(byKey.mms_applications.service_auth_configured, false);
  assert.ok(result.causes.includes("one_or_more_lane_service_auth_missing"));
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
  for (const secret of ["svc-secret-router-health-test","payments-service-secret","mms-service-secret","sigil-service-secret","himai-service-secret","partners-service-secret"]) {
    assert.equal(serialized.includes(secret), false);
  }
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
