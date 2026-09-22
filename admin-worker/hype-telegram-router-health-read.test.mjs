import assert from "node:assert/strict";
import test from "node:test";

import { projectTelegramRouterHealth, readHypeTelegramRouterHealth } from "./src/hype-telegram-router-health-read.js";

test("bounded router projection exposes no destination identifiers", () => {
  const projected = projectTelegramRouterHealth({
    schema: "mmd.hype_telegram_router_health.v1",
    registry_version: "2026-09-21.1",
    checked_at: "2026-09-21T00:00:00Z",
    status: "partial",
    canonical_owner: "telegram-worker",
    counts: { lanes_total: 2, configured: 1, partial: 1, unavailable: 0, legacy_direct_senders: 1 },
    causes: ["legacy_direct_senders_present"],
    lanes: [
      { key: "payments", label: "Payments", status: "configured", topic: "payment", source_workers: ["payments-worker"], flows: ["payment"], fallback: "alerts", migration_state: "canonical_internal_send", route_owner: "telegram-worker", authority: "payments-worker" },
    ],
    legacy_direct_senders: [{ worker: "mms-worker", reason: "direct sender", migration_required: true }],
    transport: { bot_configured: true, ops_chat_configured: true, webhook_secret_configured: true, internal_auth_configured: true, live_probe: { attempted: false, ok: null } },
  });
  assert.equal(projected.available, true);
  assert.equal(projected.status, "partial");
  assert.equal(projected.counts.legacy_direct_senders, 1);
  assert.equal(projected.business_truth_inferred, false);
  assert.equal(JSON.stringify(projected).includes("-100"), false);
});

test("missing binding or credential fails closed to unavailable", async () => {
  const result = await readHypeTelegramRouterHealth({});
  assert.equal(result.available, false);
  assert.equal(result.status, "unknown");
});

test("service binding reads authenticated router health without browser authority", async () => {
  const calls = [];
  const env = {
    AUTH_SERVICE_STUDIO_TO_TELEGRAM: "service-token",
    TELEGRAM_ROUTER: {
      async fetch(request) {
        calls.push({ url: request.url, auth: request.headers.get("authorization") });
        return Response.json({
          schema: "mmd.hype_telegram_router_health.v1",
          registry_version: "2026-09-21.1",
          checked_at: "2026-09-21T00:00:00Z",
          status: "configured",
          canonical_owner: "telegram-worker",
          counts: { lanes_total: 1, configured: 1, partial: 0, unavailable: 0, legacy_direct_senders: 0 },
          causes: [],
          lanes: [],
          legacy_direct_senders: [],
          transport: { bot_configured: true, ops_chat_configured: true, webhook_secret_configured: true, internal_auth_configured: true, live_probe: { attempted: false, ok: null } },
        });
      },
    },
  };
  const result = await readHypeTelegramRouterHealth(env);
  assert.equal(result.available, true);
  assert.equal(result.status, "configured");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/telegram\/internal\/router\/health\?probe=0$/);
  assert.equal(calls[0].auth, "Bearer service-token");
});
