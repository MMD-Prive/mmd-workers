import test from "node:test";
import assert from "node:assert/strict";
import {
  lifetimePointsFromPreload,
  invalidateMemberHistoryPreload,
  readMemberHistoryPreload,
  recoveryStatusFromPreload,
  validateProjection,
} from "../src/member-history-preload.js";
import { readMemberHistoryRecoveryStatus, runMemberHistoryRecovery } from "../src/member-history-recovery.js";

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
      expires: true,
      validity_days: 365,
      mode: "expiring_lots",
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

test("internal recovery status can read a matching reconciled preload on a cache miss", async () => {
  const { env, calls } = fakeEnv(projection({ computed_at: new Date().toISOString() }));
  const status = await readMemberHistoryRecoveryStatus(env, LINE_ID, { readPreloadOnMiss: true, memberId: MEMBER_ID });
  assert.equal(status.state, "reconciled");
  assert.equal(status.reason, "batch_preload_ready");
  assert.equal(calls.length, 2);
  assert.ok([...env.LIFF_IDENTITY_KV.values.keys()].every(key => key.startsWith("my-mmd-preload:")));
});

test("preload recovery fallback stays closed for stale, foreign or review-required evidence", async () => {
  for (const [overrides, memberId, expected] of [
    [{ computed_at: "2000-01-01T00:00:00Z" }, MEMBER_ID, "checking"],
    [{ computed_at: new Date().toISOString() }, "other-member", "checking"],
    [{ computed_at: new Date().toISOString(), identity: { state: "unknown" } }, MEMBER_ID, "checking"],
    [{ computed_at: new Date().toISOString(), history_backfill_status: "review_required" }, MEMBER_ID, "review_required"],
  ]) {
    const { env } = fakeEnv(projection(overrides));
    const status = await readMemberHistoryRecoveryStatus(env, LINE_ID, { readPreloadOnMiss: true, memberId });
    assert.equal(status.state, expected);
  }
});

test("existing review and blocked status, KV failure and non-opted-in callers never use preload fallback", async () => {
  for (const state of ["blocked", "review_required", "in_progress", "reconciled"]) {
    const { env, calls } = fakeEnv();
    env.LIFF_IDENTITY_KV.get = async () => ({ state });
    assert.equal((await readMemberHistoryRecoveryStatus(env, LINE_ID, { readPreloadOnMiss: true, memberId: MEMBER_ID })).state, state);
    assert.equal(calls.length, 0);
  }
  const { env, calls } = fakeEnv();
  assert.equal((await readMemberHistoryRecoveryStatus(env, LINE_ID)).state, "checking");
  env.LIFF_IDENTITY_KV.get = async () => { throw Error("fixture_kv_unavailable"); };
  assert.equal((await readMemberHistoryRecoveryStatus(env, LINE_ID, { readPreloadOnMiss: true, memberId: MEMBER_ID })).state, "checking");
  assert.equal(calls.length, 0);
});

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

test("projection exposes expiring lots even when the 365-day spend is lower", () => {
  const preload = validateProjection(projection(), { clientId: CLIENT_ID, now: NOW });
  const points = lifetimePointsFromPreload(preload, MEMBER_ID);
  const status = recoveryStatusFromPreload(preload, "login", NOW);

  assert.equal(points.confirmedBalance, 1475);
  assert.equal(points.earnedTotal, 1500);
  assert.equal(points.pointsExpire, true);
  assert.equal(points.lifetimeServiceSpendThb, 150000);
  assert.equal(points.serviceSpend365dThb, 25000);
  assert.equal(status.current_points_total, 1475);
  assert.equal(status.preload_source, "my_mmd_batch_preload_v1");
});

test("stale or rolling-expiry projections are rejected and fall back", () => {
  const stale = validateProjection(projection({ computed_at: "2026-09-20T10:00:00.000Z" }), { clientId: CLIENT_ID, now: NOW });
  const rolling = validateProjection(projection({ points_policy: { expires: false, mode: "lifetime_total" } }), { clientId: CLIENT_ID, now: NOW });
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
  assert.equal(result.points_expire, true);
  assert.equal(result.preload_source, "my_mmd_batch_preload_v1");
  assert.deepEqual(calls.map((call) => call.table), ["tblVv58TCbwh5j1fS", "tblNV1b5sMC2fQPxt"]);
});

test("collect-only recovery reads source evidence without status or canonical writes", async () => {
  const writes = [];
  const env = {
    LIFF_IDENTITY_KV: {
      async get() { return null; },
      async put(...args) { writes.push(["put", args]); },
      async delete(...args) { writes.push(["delete", args]); },
    },
  };
  const store = { async list() { return []; } };
  const result = await runMemberHistoryRecovery({ env, store, lineUserId: LINE_ID, collectOnly: true, now: NOW });
  assert.equal(result.state, "checking");
  assert.equal(result.reason, "collect_only_evidence_collected");
  assert.equal(result.current_points_total, null);
  assert.equal(result.historical_points_added, 0);
  assert.deepEqual(writes, []);
});


test('owner import invalidation prevents cached and persisted old projections from replacing fresh totals',async()=>{
 const {env}=fakeEnv();
 assert.equal((await readMemberHistoryPreload(env,LINE_ID,{now:NOW})).available,true);
 await invalidateMemberHistoryPreload(env,LINE_ID,NOW);
 const stale=await readMemberHistoryPreload(env,LINE_ID,{now:NOW});
 assert.equal(stale.available,false);assert.equal(stale.reason,'source_changed');
 for(const key of [...env.LIFF_IDENTITY_KV.values.keys()])if(!key.endsWith(':invalidated'))env.LIFF_IDENTITY_KV.values.delete(key);
 assert.equal((await readMemberHistoryPreload(env,LINE_ID,{now:NOW})).reason,'source_changed');
});

test('reviewed refresh scans source evidence even when the batch projection is fresh',async()=>{
 const {env,calls}=fakeEnv();
 await readMemberHistoryPreload(env,LINE_ID,{now:NOW});calls.length=0;
 const result=await runMemberHistoryRecovery({env,lineUserId:LINE_ID,forceSourceRefresh:true,now:NOW});
 assert.notEqual(result.reason,'batch_preload_ready');
 assert.ok(calls.some(x=>x.table==='tblOs8yyLK09SKrCt'));
 assert.ok(!calls.some(x=>x.table==='tblNV1b5sMC2fQPxt'));
});



import {recentServicesFromPreload} from "../src/member-history-preload.js";
const recentNow = new Date("2026-10-27");
const recentRow = i => ({id:"service-"+i, kind:"booking", statusLabel:"Completed", occurredAt:"2026-10-"+String(i+1).padStart(2,"0"), model:"Model "+i, totalAmountThb:12000, internal_note:"private"});
const recentReady = () => ({available:true, projection:{member_id:"member-1", identity:{member_linked:true,member_match_count:1,state:"ready"},history_backfill_status:"reconciled",recent_services:Array.from({length:8},(_,i)=>recentRow(i))}});
test("recent services exposes only five newest own-member jobs and allowlisted fields", () => {
  const result=recentServicesFromPreload(recentReady(),"member-1",recentNow);
  assert.equal(result.length,5); assert.equal(result[0].occurredAt,"2026-10-08");
  assert.equal(result[0].totalAmountThb,12000); assert.equal(result[0].model,"Model 7");
  assert.equal(result[0].internal_note,undefined);
});
test("another member, ambiguous identity, pending evidence and unavailable preloads fall back", () => {
  assert.equal(recentServicesFromPreload(recentReady(),"member-2",recentNow),null);
  for(const mutate of [p=>p.available=false,p=>p.projection.history_backfill_status="review_required",p=>p.projection.identity.member_match_count=2,p=>p.projection.identity.state="review_required"]) {
    const p=recentReady(); mutate(p); assert.equal(recentServicesFromPreload(p,"member-1",recentNow),null);
  }
});
test("future, missing amounts and duplicates do not appear as customer bills", () => {
  const p=recentReady(); p.projection.recent_services=[recentRow(0),recentRow(0),{...recentRow(1),totalAmountThb:0},{...recentRow(2),occurredAt:"2027-01-01"},{...recentRow(3),model:"https://private.invalid"}];
  const result=recentServicesFromPreload(p,"member-1",recentNow);
  assert.equal(result.length,2); assert.equal(result[0].model,null);
});
