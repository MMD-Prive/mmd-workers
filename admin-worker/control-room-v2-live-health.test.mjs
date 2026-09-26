import test from "node:test";
import assert from "node:assert/strict";
import { readControlRoomV2LiveHealth, CONTROL_ROOM_V2_LIVE_HEALTH_TARGETS } from "./src/control-room-v2-live-health.js";

test("Control Room V2 live refresh probes website and six authority workers without mutation", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: String(init.method || "GET").toUpperCase() });
    if (url === "https://www.mmdbkk.com/") {
      return new Response(null, { status: 200 });
    }
    return Response.json({
      ok: true,
      analytics: {
        posthog_authority: "configured",
        schema: "mmd_authority_v1",
      },
    }, { status: 200 });
  };
  try {
    const result = await readControlRoomV2LiveHealth({
      CF_VERSION_METADATA: {
        id: "ver-1234567890",
        tag: "gha-test",
        timestamp: "2026-09-22T09:30:00Z",
      },
    });
    assert.equal(CONTROL_ROOM_V2_LIVE_HEALTH_TARGETS.length, 6);
    assert.equal(result.website.ok, true);
    assert.equal(result.workers.total, 6);
    assert.equal(result.workers.healthy, 6);
    assert.equal(result.analytics.configured, 6);
    assert.equal(result.analytics.all_configured, true);
    assert.equal(result.complete, true);
    assert.equal(result.release.admin_worker.id, "ver-1234567890");
    assert.equal(result.read_only, true);
    assert.equal(result.transaction_mutation, false);
    assert.equal(calls.length, 7);
    assert.equal(calls.filter((call) => call.method === "HEAD").length, 1);
    assert.equal(calls.filter((call) => call.method === "GET").length, 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Control Room V2 live refresh degrades cleanly when one authority health probe fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://www.mmdbkk.com/") return new Response(null, { status: 200 });
    if (url.includes("mms-worker")) return Response.json({ ok: false }, { status: 503 });
    return Response.json({ ok: true, analytics: { posthog_authority: "configured", schema: "mmd_authority_v1" } });
  };
  try {
    const result = await readControlRoomV2LiveHealth({});
    assert.equal(result.complete, false);
    assert.equal(result.workers.healthy, 5);
    assert.equal(result.analytics.configured, 5);
    assert.equal(result.analytics.all_configured, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
