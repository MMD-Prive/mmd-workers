import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKenjiAvailabilityDecision,
  KENJI_AVAILABILITY_AUTHORITY,
  resolveKenjiLineAvailability,
} from "../src/kenji-line-availability-live.mjs";

const NOW = Date.parse("2026-09-28T12:00:00.000Z");

function continuity(overrides = {}) {
  return {
    decision: "continuation",
    matrix: {
      matrix_status: "active",
      state_expires_at: "2026-10-05T12:00:00.000Z",
      payload_json: {
        active_model_v1: { model_code: "MX17", working_name: "Jasper", updated_at: "2026-09-28T11:50:00.000Z" },
      },
      ...overrides,
    },
  };
}

test("reads a fresh bounded availability snapshot through admin service binding", async () => {
  let captured = null;
  const env = {
    INTERNAL_TOKEN: "secret",
    ADMIN_WORKER: {
      async fetch(request) {
        captured = request;
        return Response.json({
          ok: true,
          model_key: "mx17",
          snapshot_state: "fresh",
          fresh: true,
          stale: false,
          age_seconds: 60,
          ttl_remaining_seconds: 840,
          snapshot: {
            schema: "sigil_availability_snapshot_v1",
            model_key: "mx17",
            safe_availability_state: "available_today",
            availability_bucket: "today",
            city: "Bangkok",
            zones: ["sukhumvit"],
            operational_flags: { live: true },
            confidence: "model_confirmed",
            updated_at: "2026-09-28T11:59:00.000Z",
            expires_at: "2026-09-28T12:14:00.000Z",
          },
        });
      },
    },
  };

  const result = await resolveKenjiLineAvailability({ env, continuity: continuity(), now_ms: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.status, "verified");
  assert.equal(result.authority, KENJI_AVAILABILITY_AUTHORITY);
  assert.deepEqual(result.model, { model_code: "MX17", working_name: "Jasper" });
  assert.deepEqual(result.snapshot, {
    state: "available_today",
    confidence: "model_confirmed",
    updated_at: "2026-09-28T11:59:00.000Z",
    expires_at: "2026-09-28T12:14:00.000Z",
  });
  assert.equal(new URL(captured.url).pathname, "/v1/internal/sigil/availability-snapshot");
  assert.equal(new URL(captured.url).searchParams.get("model_key"), "MX17");
  assert.equal(captured.method, "GET");
  assert.equal(captured.headers.get("x-mmd-internal-call"), "true");
  assert.equal(captured.headers.get("x-mmd-service-binding"), "member-dashboard-chat-worker");
  assert.equal(captured.headers.get("authorization"), "Bearer secret");
  assert.doesNotMatch(JSON.stringify(result), /Bangkok|sukhumvit|operational_flags/i);
});

test("stale, future-dated or mismatched availability is never accepted as live truth", async () => {
  const cases = [
    {
      name: "stale",
      payload: {
        ok: true, model_key: "mx17", snapshot_state: "stale", fresh: false, stale: true,
        snapshot: {
          model_key: "mx17", safe_availability_state: "available_now", confidence: "model_confirmed",
          updated_at: "2026-09-28T11:00:00.000Z", expires_at: "2026-09-28T11:15:00.000Z",
        },
      },
      status: "stale",
    },
    {
      name: "future-dated",
      payload: {
        ok: true, model_key: "mx17", snapshot_state: "fresh", fresh: true, stale: false,
        snapshot: {
          model_key: "mx17", safe_availability_state: "available_now", confidence: "model_confirmed",
          updated_at: "2026-09-28T12:10:00.000Z", expires_at: "2026-09-28T12:20:00.000Z",
        },
      },
      status: "unavailable",
    },
    {
      name: "model-mismatch",
      payload: {
        ok: true, model_key: "mx18", snapshot_state: "fresh", fresh: true, stale: false,
        snapshot: {
          model_key: "mx18", safe_availability_state: "available_now", confidence: "model_confirmed",
          updated_at: "2026-09-28T11:59:00.000Z", expires_at: "2026-09-28T12:14:00.000Z",
        },
      },
      status: "unavailable",
    },
  ];

  for (const item of cases) {
    const env = {
      INTERNAL_TOKEN: "secret",
      ADMIN_WORKER: { async fetch() { return Response.json(item.payload); } },
    };
    const result = await resolveKenjiLineAvailability({ env, continuity: continuity(), now_ms: NOW });
    assert.equal(result.ok, false, item.name);
    assert.equal(result.status, item.status, item.name);
  }
});

test("stale Matrix cannot supply a Model key to availability truth", async () => {
  let calls = 0;
  const env = {
    INTERNAL_TOKEN: "secret",
    ADMIN_WORKER: { async fetch() { calls += 1; return Response.json({ ok: true }); } },
  };
  const result = await resolveKenjiLineAvailability({
    env,
    continuity: { decision: "stale_refresh", matrix: continuity().matrix },
    now_ms: NOW,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "model_context_missing");
  assert.equal(calls, 0);
});

test("fresh availability copy states live status but never confirms an exact slot", () => {
  const decision = buildKenjiAvailabilityDecision("availability_request", {
    ok: true,
    status: "verified",
    authority: KENJI_AVAILABILITY_AUTHORITY,
    model: { model_code: "MX17", working_name: "Jasper" },
    snapshot: {
      state: "available_today",
      confidence: "model_confirmed",
      updated_at: "2026-09-28T11:59:00.000Z",
      expires_at: "2026-09-28T12:14:00.000Z",
    },
  });

  assert.equal(decision.reply_source, "availability_live_truth");
  assert.equal(decision.live_truth_verified, true);
  assert.equal(decision.handoff_required, true);
  assert.match(decision.text, /Jasper \(MX17\).*ว่างวันนี้/s);
  assert.match(decision.text, /ยังไม่ใช่การยืนยัน booking slot/);
  assert.match(decision.text, /calendar\/job conflict/);
  assert.doesNotMatch(decision.text, /จองได้แน่นอน|ยืนยันคิวแล้ว|คอนเฟิร์มแล้ว/);
});

test("missing live availability for an active Model fails closed with Per review copy", () => {
  const decision = buildKenjiAvailabilityDecision("availability_request", {
    ok: false,
    status: "unavailable",
    authority: KENJI_AVAILABILITY_AUTHORITY,
    model: { model_code: "MX17", working_name: "Jasper" },
  });

  assert.equal(decision.reply_source, "availability_live_truth_unavailable");
  assert.equal(decision.live_truth_verified, false);
  assert.equal(decision.handoff_required, true);
  assert.match(decision.text, /ยังอ่านไม่สำเร็จ/);
  assert.doesNotMatch(decision.text, /ว่างครับ|ว่างวันนี้|ว่างตอนนี้/);
});
