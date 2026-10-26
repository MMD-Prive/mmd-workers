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

test("expired awards remain historical but are excluded from the available balance", () => {
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

  assert.equal(summary.current_points_confirmed, 0);
  assert.equal(summary.points_earned_lifetime_ledger, 700);
  assert.equal(summary.points_redeemed_lifetime, 50);
  assert.equal(summary.points_active_record_count, 3);
  assert.equal(summary.legacy_aggregate_count, 1);
  assert.equal(summary.points_expiring_30d, 0);
  assert.equal(summary.nearest_points_expiry, null);
});

test("client projection declares the 365-day expiring-lot policy", () => {
  const result = buildClientProjection({
    client: client(),
    member: member(),
    memberMatchCount: 1,
    sessionRows: [session("old", "2024-01-01", 10000)],
    pointsRows: [point("old-earned", 100, { expires_at: "2025-01-01T00:00:00.000Z" })],
  }, NOW);

  assert.deepEqual(result.projection.points_policy, {
    thb_per_point: 100,
    expires: true,
    validity_days: 365,
    mode: "expiring_lots",
    tr_eligible: false,
    completed_jobs_only: true,
  });
  assert.equal(result.projection.current_points_confirmed, 0);
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
  assert.equal(JSON.parse(airtable.writes[0].fields.projection_json).points_policy.mode, "expiring_lots");

  const second = await runBatchPreload({ assertIdempotent: true, airtable, now: NOW });
  assert.equal(second.summary.planned_creates, 0);
  assert.equal(second.summary.planned_updates, 0);
  assert.equal(second.summary.unchanged, 1);
});

test("preload orders redemptions by date, deduplicates awards and expires remaining lots", () => {
  const rows = [
    point("redeem", -25, {posted_at:"2026-09-10"}),
    point("new", 200, {posted_at:"2026-09-01", expires_at:"2027-09-01"}),
    point("near", 100, {posted_at:"2025-10-01", expires_at:"2026-10-01"}),
    point("dup", 100, {posted_at:"2025-10-01", idempotency_key:"near"}),
    point("expired", 800, {posted_at:"2024-01-01"}),
    point("future", 999, {posted_at:"2027-01-01"}),
  ];
  const before = summarizeLifetimePoints(rows, NOW);
  assert.equal(before.current_points_confirmed, 275);
  assert.equal(before.points_expiring_30d, 75);
  assert.equal(before.nearest_points_expiry, "2026-10-01T00:00:00.000Z");
  assert.equal(summarizeLifetimePoints(rows, new Date("2026-10-01")).current_points_confirmed, 200);
});

test("batch prepares five latest dated bills with model names before customer access", () => {
 const rows=Array.from({length:8},(_,i)=>session("job-"+i,"2026-09-"+String(i+1).padStart(2,"0"),1000+i,{model_name:"Model "+i}));
 rows.push(session("future","2027-01-01",999999));
 const result=buildClientProjection({client:client(),member:member(),memberMatchCount:1,sessionRows:rows},NOW);
 assert.equal(result.projection.recent_services.length,5);
 assert.equal(result.projection.recent_services[0].model,"Model 7");
 assert.equal(result.projection.recent_services[0].totalAmountThb,1007);
 assert.equal(result.projection.completed_service_count,8);
});

const { summarizeMembershipDates } = require("./membership-date-review.js");
function membershipDateRow(changes = {}, fieldChanges = {}) {
  const payload = {
    schema_version: "membership_dates_review_v1", authority: "review_only",
    client_record_id: CLIENT_ID, reviewed_at: "2026-09-20T00:00:00Z",
    review_status: "dates_extracted_review_required", grants_entitlement: false, grants_points: false,
    first_signup_date_candidate: "2022-11-24", latest_membership_date_candidate: "2026-07-23",
    original_notes: { source_url: "https://chat.line.biz/U" + "a".repeat(32) + "/chat/U" + "b".repeat(32), note_count: 3 },
    events: [{ kind: "signup_candidate", date: "2022-11-24", excerpt: "private profile" },
      { kind: "renewal_candidate", date: "2025-07-23" }, { kind: "renewal_candidate", date: "2026-07-23" }],
    flags: [], ...changes,
  };
  return { id: "recDateReview", fields: { key: "memstart:" + CLIENT_ID, client: [CLIENT_ID],
    review_decision: "pending", first_signup_date_candidate: payload.first_signup_date_candidate,
    latest_membership_date_candidate: payload.latest_membership_date_candidate,
    membership_dates_json: JSON.stringify(payload), ...fieldChanges } };
}
test("prepared membership dates preserve first signup and all renewal candidates without granting rights", () => {
  const row = membershipDateRow();
  const actual = summarizeMembershipDates([row], CLIENT_ID, NOW);
  assert.equal(actual.first_signup_date_candidate, "2022-11-24");
  assert.deepEqual(actual.renewal_date_candidates, ["2025-07-23", "2026-07-23"]);
  assert.equal(actual.latest_membership_date_candidate, "2026-07-23");
  assert.equal(actual.verified, false);
  assert.equal(actual.access_verified, false);
  assert.equal(actual.original_note_count, 3);
  assert.doesNotMatch(JSON.stringify(actual), /private profile|chat.line.biz/);
  const before = buildClientProjection({client: client(), member: member(), memberMatchCount: 1}, NOW).projection;
  const after = buildClientProjection({client: client(), member: member(), memberMatchCount: 1, membershipDateRows: [row]}, NOW).projection;
  assert.deepEqual(after.membership_dates, actual);
  for (const field of ["lifecycle_status", "current_points_confirmed", "points_state", "history_backfill_status"]) assert.deepEqual(after[field], before[field]);
});
test("missing original Notes remain explicit and Per Rename never becomes first signup", () => {
  const row = membershipDateRow({review_status: "original_notes_required", first_signup_date_candidate: null,
    original_notes: null, events: [], flags: ["original_notes_not_reviewed_in_this_pass"],
    per_rename_snapshot: {date_candidate: "2026-07-23", source_staging_record_ids: ["recStagedRename"]}});
  const actual = summarizeMembershipDates([row], CLIENT_ID, NOW);
  assert.equal(actual.state, "original_notes_required");
  assert.equal(actual.first_signup_date_candidate, null);
  assert.equal(actual.latest_membership_date_candidate, "2026-07-23");
  assert.equal(actual.original_notes_reviewed, false);
});
test("conflicting signup stays blank while a separately evidenced renewal is retained", () => {
  const row = membershipDateRow({review_status: "date_conflict_review_required", first_signup_date_candidate: null,
    flags: ["conflicting_first_signup_dates"], events: [
      {kind: "signup_conflicting_candidate", date: "2023-09-04"},
      {kind: "signup_conflicting_candidate", date: "2023-09-09"},
      {kind: "renewal_candidate", date: "2026-07-23"}]});
  const actual = summarizeMembershipDates([row], CLIENT_ID, NOW);
  assert.equal(actual.first_signup_date_candidate, null);
  assert.equal(actual.latest_membership_date_candidate, "2026-07-23");
  assert.equal(actual.has_date_conflicts, true);
});
test("membership date projection rejects mismatched identity, duplicates, invalid dates and rejected reviews", () => {
  assert.equal(summarizeMembershipDates([], CLIENT_ID, NOW).state, "not_prepared");
  const good = membershipDateRow();
  assert.equal(summarizeMembershipDates([good, good], CLIENT_ID, NOW).state, "ambiguous_review");
  assert.equal(summarizeMembershipDates([membershipDateRow({client_record_id:"another-client"})], CLIENT_ID, NOW).state, "invalid_evidence");
  assert.equal(summarizeMembershipDates([membershipDateRow({}, {client:[CLIENT_ID, "another-client"]})], CLIENT_ID, NOW).state, "invalid_evidence");
  assert.equal(summarizeMembershipDates([membershipDateRow({latest_membership_date_candidate:"2027-01-01"})], CLIENT_ID, NOW).state, "invalid_evidence");
  assert.equal(summarizeMembershipDates([membershipDateRow({first_signup_date_candidate:"2023-02-30"})], CLIENT_ID, NOW).state, "invalid_evidence");
  assert.equal(summarizeMembershipDates([membershipDateRow({reviewed_at:"2027-01-01"})], CLIENT_ID, NOW).state, "invalid_evidence");
  assert.equal(summarizeMembershipDates([membershipDateRow({}, {review_decision:"rejected"})], CLIENT_ID, NOW).state, "rejected");
  assert.equal(summarizeMembershipDates([membershipDateRow({}, {membership_dates_json:"broken"})], CLIENT_ID, NOW).state, "invalid_evidence");
  assert.equal(summarizeMembershipDates([membershipDateRow({}, {latest_membership_date_candidate:"2025-01-01"})], CLIENT_ID, NOW).state, "invalid_evidence");
});
test("batch joins reviewed membership dates by Client and writes only reconciliation", async () => {
  const airtable = new FakeAirtable();
  airtable.rows.set(TABLES.membershipDates, [membershipDateRow()]);
  const first = await runBatchPreload({apply:true, airtable, now:NOW});
  assert.equal(first.summary.membership_date_review_rows_scanned, 1);
  const actual = JSON.parse(airtable.writes[0].fields.projection_json);
  assert.equal(actual.membership_dates.first_signup_date_candidate, "2022-11-24");
  assert.deepEqual(actual.membership_dates.renewal_date_candidates, ["2025-07-23","2026-07-23"]);
  assert.equal(first.truth_writes, false);
  const again = await runBatchPreload({assertIdempotent:true, airtable, now:NOW});
  assert.equal(again.summary.unchanged, 1);
});
