import test from "node:test";
import assert from "node:assert/strict";
import {
  lifetimePointsFromPreload,
  readMemberHistoryPreload,
  recoveryStatusFromPreload,
  validateProjection,
} from "../src/member-history-preload.js";
import { runMemberHistoryRecovery } from "../src/member-history-recovery.js";

const NOW = new Date("2026-09-22T12:00:00.000Z");
const LINE_ID = `U${"a".repeat(32)}`;
const CLIENT_ID = "recClient123456";
const MEMBER_ID = "MMD-MEMBER-1";

function projection(overrides = {}) {
  return {
    schema: "my_mmd_batch_preload_v1",
    computed_at: "2026-09-22T10:00:00.000Z",
    client_id: CLIENT_ID,
    member_id: MEMBER_ID,
    identity: { state: "ready", member_linked: true },
    history_backfill_status: "reconciled",
    source_note_count: 3,
    unresolved_history_reviews: 0,
    unqueued_legacy_history_count: 0,
    private_history_candidate_count: 0,
    completed_service_count: 4,
    lifetime_service_spend_thb: 150000,
    eligible_service_spend_365d_thb: 25000,
    current_points_confirmed: 1475,
    points_earned_lifetime_ledger: 1500,
    points_redeemed_lifetime: 25,
    points_active_record_count: 5,
    points_state: "confirmed",
    points_policy: {
      thb_per_point: 100,
      expires: false,
      validity_days: null,
      mode: "lifetime_total",
    },
    ...overrides,
  };
}

class FakeKv {
  constructor() {
    this.values = new Map();
  }

  async get(key, type) {
    const value = this.values.get(key);
    if (value == null) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async delete(key) {
    this.values.delete(key);
  }
}

function fakeEnv(preloadedProjection = projection()) {
  const calls = [];
  const kv = new FakeKv();
  return {
    calls,
    env: {
      AIRTABLE_API_KEY: "test-key",
      AIRTABLE_BASE_ID: "appTest",
      LIFF_SESSION_SECRET: "x".repeat(32),
      LIFF_IDENTITY_KV: kv,
      AIRTABLE_HTTP: {
        async fetch(request) {
          const url = new URL(request.url);
          const table = decodeURIComponent(url.pathname.split("/").at(-1));
          calls.push({ table, formula: url.searchParams.get("filterByFormula") });
          if (table === "tblVv58TCbwh5j1fS") {
            return Response.json({ records: [{ id: CLIENT_ID, fields: { line_user_id: LINE_ID } }] });
          }
          if (table === "tblNV1b5sMC2fQPxt") {
            return Response.json({ records: [{ id: "recProjection123", fields: { projection_json: JSON.stringify(preloadedProjection) } }] });
          }
          throw new Error(`unexpected_table:${table}`);
        },
      },
    },
  };
}

test("preload resolves the canonical client projection once and then uses KV cache", async () => {
  const { env, calls } = fakeEnv();
  const first = await readMemberHistoryPreload(env, LINE_ID, { now: NOW });
  const second = await readMemberHistoryPreload(env, LINE_ID, { now: NOW });

  assert.equal(first.available, true);
  assert.equal(first.cache, "miss");
  assert.equal(second.available, true);
  assert.equal(second.cache, "hit");
  assert.equal(calls.length, 2);
  assert.match(calls[0].formula, /line_user_id/);
  assert.match(calls[1].formula, new RegExp(`client:${CLIENT_ID}`));
});

test("projection remains lifetime Points even when the 365-day spend is lower", () => {
  const preload = validateProjection(projection(), { clientId: CLIENT_ID, now: NOW });
  const points = lifetimePointsFromPreload(preload, MEMBER_ID);
  const status = recoveryStatusFromPreload(preload, "login", NOW);

  assert.equal(points.confirmedBalance, 1475);
  assert.equal(points.earnedTotal, 1500);
  assert.equal(points.pointsExpire, false);
  assert.equal(points.lifetimeServiceSpendThb, 150000);
  assert.equal(points.serviceSpend365dThb, 25000);
  assert.equal(status.current_points_total, 1475);
  assert.equal(status.preload_source, "my_mmd_batch_preload_v1");
});

test("stale or rolling-expiry projections are rejected and fall back", () => {
  const stale = validateProjection(projection({ computed_at: "2026-09-20T10:00:00.000Z" }), { clientId: CLIENT_ID, now: NOW });
  const rolling = validateProjection(projection({ points_policy: { expires: true, mode: "rolling_365d" } }), { clientId: CLIENT_ID, now: NOW });
  assert.equal(stale.available, false);
  assert.equal(stale.reason, "projection_stale");
  assert.equal(rolling.available, false);
  assert.equal(rolling.reason, "projection_points_policy_mismatch");
});

test("history recovery uses a fresh batch projection without scanning source tables", async () => {
  const { env, calls } = fakeEnv();
  const result = await runMemberHistoryRecovery({
    env,
    lineUserId: LINE_ID,
    memberId: MEMBER_ID,
    trigger: "login",
    now: NOW,
  });

  assert.equal(result.state, "reconciled");
  assert.equal(result.current_points_total, 1475);
  assert.equal(result.points_expire, false);
  assert.equal(result.preload_source, "my_mmd_batch_preload_v1");
  assert.deepEqual(calls.map((call) => call.table), ["tblVv58TCbwh5j1fS", "tblNV1b5sMC2fQPxt"]);
});
