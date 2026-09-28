const assert = require("node:assert/strict");
const test = require("node:test");

const {
  SCHEMA,
  TABLES,
  buildClientProjection,
  buildServiceSummary,
  runBatchPreload,
  summarizeLifetimePoints,
} = require("./my-mmd-batch-preload.js");

const NOW = new Date("2026-09-22T12:00:00.000Z");
const CLIENT_ID = "recClient123456";
const MEMBER_RECORD_ID = "recMember123456";
const MEMBER_ID = "MMD-MEMBER-1";

function session(id, date, amount, fields = {}) {
  return {
    id,
    fields: {
      Client: [CLIENT_ID],
      session_id: id,
      "Session Status": "Completed",
      "Session Date": date,
      "Total Amount": amount,
      import_review_status: "approved",
      ...fields,
    },
  };
}

function point(id, points, fields = {}) {
  return {
    id,
    createdTime: "2020-01-01T00:00:00.000Z",
    fields: {
      member_id: MEMBER_ID,
      transaction_status: "posted",
      posted_at: "2020-01-01T00:00:00.000Z",
      points,
      idempotency_key: id,
      ...fields,
    },
  };
}

function client() {
  return {
    id: CLIENT_ID,
    fields: {
      line_user_id: "U12345678901234567890123456789012",
      "Contact Email": "member@example.com",
    },
  };
}

function member() {
  return {
    id: MEMBER_RECORD_ID,
    fields: {
      Clients: [CLIENT_ID],
      member_id: MEMBER_ID,
      "Contact Email": "member@example.com",
      "Membership Status": "active",
    },
  };
}

test("service spend keeps lifetime total while retaining a separate 365-day analytical window", () => {
  const summary = buildServiceSummary([
    session("old", "2024-01-01", 10000),
    session("recent", "2026-09-01", 25000),
    session("pending", "2026-09-02", 9000, { "Session Status": "Pending" }),
    session("cancelled", "2026-09-03", 9000, { "Session Status": "Cancelled" }),
    session("tr", "2026-09-04", 5000, { "Session Type": "TR" }),
  ], [], NOW);

  assert.equal(summary.lifetime_service_spend_thb, 35000);
  assert.equal(summary.eligible_service_spend_365d_thb, 25000);
  assert.equal(summary.points_earned_lifetime_projected, 350);
  assert.equal(summary.points_earned_365d_analytical, 250);
  assert.equal(summary.completed_service_count, 2);
  assert.equal(summary.tr_excluded_count, 1);
});

test("implausible imported amount is quarantined instead of changing spend or points", () => {
  const summary = buildServiceSummary([
    session("bad-import", "2026-03-01", undefined, {
      "Total Amount": undefined,
      amount_thb: 6132082,
      status: "verified",
    }),
  ], [], NOW);

  assert.equal(summary.lifetime_service_spend_thb, 0);
  assert.equal(summary.points_earned_lifetime_projected, 0);
  assert.equal(summary.amount_anomaly_count, 1);
  assert.equal(summary.events[0].raw_amount_thb, 6132082);
});

test("lifetime points include old and formerly expiring rows, aggregate history, and redemptions", () => {
  const summary = summarizeLifetimePoints([
    point("old-earned", 100, { expires_at: "2021-01-01T00:00:00.000Z" }),
    point("historical_note_total_v2:member", 600, {
      idempotency_key: "historical_note_total_v2:member",
      expires_at: "2022-01-01T00:00:00.000Z",
    }),
    point("redeem", -50),
    point("duplicate-record", 100, { idempotency_key: "old-earned" }),
    point("pending", 999, { transaction_status: "pending" }),
    point("reversed", 999, { reversed_at: "2026-01-01T00:00:00.000Z" }),
  ]);

  assert.equal(summary.current_points_confirmed, 650);
  assert.equal(summary.points_earned_lifetime_ledger, 700);
  assert.equal(summary.points_redeemed_lifetime, 50);
  assert.equal(summary.points_active_record_count, 3);
  assert.equal(summary.legacy_aggregate_count, 1);
  assert.equal(summary.points_expiring_30d, 0);
  assert.equal(summary.nearest_points_expiry, null);
});

test("client projection declares a non-expiring lifetime Points policy", () => {
  const result = buildClientProjection({
    client: client(),
    member: member(),
    memberMatchCount: 1,
    sessionRows: [session("old", "2024-01-01", 10000)],
    pointsRows: [point("old-earned", 100, { expires_at: "2025-01-01T00:00:00.000Z" })],
  }, NOW);

  assert.deepEqual(result.projection.points_policy, {
    thb_per_point: 100,
    expires: false,
    validity_days: null,
    mode: "lifetime_total",
    tr_eligible: false,
    completed_jobs_only: true,
  });
  assert.equal(result.projection.current_points_confirmed, 100);
  assert.equal(result.projection.points_earned_lifetime_projected, 100);
  assert.equal(result.projection.points_earned_lifetime_ledger, 100);
  assert.equal(result.projection.points_active_record_count, 1);
  assert.equal(result.projection.eligible_service_spend_365d_thb, 0);
  assert.equal(result.projection.points_expiring_30d, 0);
});

class FakeAirtable {
  constructor() {
    this.rows = new Map([
      [TABLES.clients, [client()]],
      [TABLES.members, [member()]],
      [TABLES.legacyStaging, []],
      [TABLES.privateStaging, []],
      [TABLES.reviews, []],
      [TABLES.sessions, [session("old", "2024-01-01", 10000)]],
      [TABLES.payments, []],
      [TABLES.points, [point("old-earned", 100)]],
      [TABLES.intelligence, []],
      [TABLES.reconciliation, []],
    ]);
    this.writes = [];
  }

  async list(table) {
    return this.rows.get(table) || [];
  }

  async requestBatchWithFieldFallback(table, init) {
    assert.equal(table, TABLES.reconciliation);
    assert.equal(init.method, "POST");
    const created = init.body.records.map((record, index) => ({
      id: `recProjection${index}`,
      fields: { ...record.fields },
    }));
    this.rows.get(TABLES.reconciliation).push(...created);
    this.writes.push(...created);
    return { records: created };
  }
}

test("projection-only apply is idempotent and never writes source-of-truth tables", async () => {
  const airtable = new FakeAirtable();
  const first = await runBatchPreload({ apply: true, airtable, now: NOW });
  assert.equal(first.projected_rows_written, 1);
  assert.equal(first.truth_writes, false);
  assert.equal(airtable.writes[0].fields.authority, SCHEMA);
  assert.equal(JSON.parse(airtable.writes[0].fields.projection_json).points_policy.mode, "lifetime_total");

  const second = await runBatchPreload({ assertIdempotent: true, airtable, now: NOW });
  assert.equal(second.summary.planned_creates, 0);
  assert.equal(second.summary.planned_updates, 0);
  assert.equal(second.summary.unchanged, 1);
});
