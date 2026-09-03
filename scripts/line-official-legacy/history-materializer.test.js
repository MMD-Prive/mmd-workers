const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertHistoricalEventGate,
  assertHistoryApprovalGate,
  assertIdentityCommitGate,
  buildMaterializationPlan,
  defaultHistoryReviewId,
  materializeHistoricalRecord,
  parseHistoricalDate,
} = require("./history-materializer.js");

const STAGING_ID = "recSTAGING00001";
const CLIENT_ID = "recABCDEFGHIJKL";
const MEMBER_RECORD_ID = "recMEMBER000001";
const IMPORT_ID = "line_ofc_hist_001";

function stagedFields(overrides = {}) {
  return {
    import_id: IMPORT_ID,
    review_status: "committed",
    decision: "link_existing_client",
    decision_source: "manual_review",
    reviewed_by: "per",
    reviewed_at: "2026-09-03T16:00:00.000Z",
    matched_client_id: CLIENT_ID,
    matched_client: [CLIENT_ID],
    dry_run_only: false,
    line_renamed_name: "Reviewed Rename",
    email_candidate: "customer@example.com",
    historical_events_json: JSON.stringify({
      amounts: [{ type: "service", amount: 1250, token: "1,250 บาท", context: "service 1,250 บาท" }],
      dates: ["13/07/2569"],
      payment_refs: ["ref HIST001"],
    }),
    points_eligible_amount: 1250,
    unknown_amount: 0,
    points_review_required: "false",
    ...overrides,
  };
}

function approvedHistoryReview(overrides = {}) {
  return {
    history_review_id: defaultHistoryReviewId(IMPORT_ID),
    "LINE OFC Import Row": [STAGING_ID],
    Client: [CLIENT_ID],
    review_status: "approved",
    decision: "approve_service_history",
    approved_service_date: "2026-07-13",
    approved_service_amount_thb: 1250,
    approved_payment_ref: "HIST001",
    points_review_status: "approved",
    approved_points_eligible_amount_thb: 1250,
    reviewed_by: "per",
    reviewed_at: "2026-09-03T16:02:00.000Z",
    ...overrides,
  };
}

function client() {
  return { id: CLIENT_ID, fields: { "Client Name": "Reviewed Rename", "Contact Email": "customer@example.com" } };
}

function member() {
  return { id: MEMBER_RECORD_ID, fields: { member_id: "member-canonical-001", "Contact Email": "customer@example.com" } };
}

test("identity commit and history approval are separate gates", () => {
  assert.throws(() => assertIdentityCommitGate(stagedFields({ review_status: "ready_to_review" })), /HISTORY_IDENTITY_REVIEW_NOT_COMMITTED/);
  assert.equal(assertIdentityCommitGate(stagedFields()).clientId, CLIENT_ID);

  assert.throws(
    () => assertHistoryApprovalGate(approvedHistoryReview({ review_status: "pending" }), { stagingId: STAGING_ID, clientId: CLIENT_ID }),
    /HISTORY_EXPLICIT_REVIEW_NOT_APPROVED/,
  );
  assert.throws(
    () => assertHistoryApprovalGate(approvedHistoryReview({ decision: "hold_for_review" }), { stagingId: STAGING_ID, clientId: CLIENT_ID }),
    /HISTORY_EXPLICIT_SERVICE_APPROVAL_REQUIRED/,
  );
  assert.equal(
    assertHistoryApprovalGate(approvedHistoryReview(), { stagingId: STAGING_ID, clientId: CLIENT_ID }).pointsStatus,
    "approved",
  );
});

test("history review must link the same staging row and canonical Client", () => {
  assert.throws(
    () => assertHistoryApprovalGate(approvedHistoryReview({ "LINE OFC Import Row": ["recOTHER0000001"] }), { stagingId: STAGING_ID, clientId: CLIENT_ID }),
    /HISTORY_EXPLICIT_REVIEW_STAGING_MISMATCH/,
  );
  assert.throws(
    () => assertHistoryApprovalGate(approvedHistoryReview({ Client: ["recOTHER0000001"] }), { stagingId: STAGING_ID, clientId: CLIENT_ID }),
    /HISTORY_EXPLICIT_REVIEW_CLIENT_MISMATCH/,
  );
});

test("points require a separate explicit decision and matching reviewed amount", () => {
  assert.throws(
    () => assertHistoryApprovalGate(approvedHistoryReview({ points_review_status: "pending" }), { stagingId: STAGING_ID, clientId: CLIENT_ID }),
    /HISTORY_EXPLICIT_POINTS_DECISION_REQUIRED/,
  );
  assert.throws(
    () => assertHistoryApprovalGate(approvedHistoryReview({ approved_points_eligible_amount_thb: 1200 }), { stagingId: STAGING_ID, clientId: CLIENT_ID }),
    /HISTORY_APPROVED_POINTS_AMOUNT_MISMATCH/,
  );
  const rejected = assertHistoryApprovalGate(
    approvedHistoryReview({ points_review_status: "rejected", approved_points_eligible_amount_thb: 0 }),
    { stagingId: STAGING_ID, clientId: CLIENT_ID },
  );
  assert.equal(rejected.pointsEligibleAmountThb, 0);
});

test("Thai Buddhist historical date is normalized without changing the day", () => {
  assert.equal(parseHistoricalDate("13/07/2569"), "2026-07-13T12:00:00.000Z");
});

test("parser candidate gate still fails closed on ambiguous staged history", () => {
  assert.throws(() => assertHistoricalEventGate(stagedFields({ points_review_required: "true" })), /HISTORY_POINTS_REVIEW_REQUIRED/);
  const multiple = stagedFields({
    historical_events_json: JSON.stringify({
      amounts: [{ type: "service", amount: 1000 }, { type: "service", amount: 2000 }],
      dates: ["2025-01-01"],
      payment_refs: [],
    }),
  });
  assert.throws(() => assertHistoricalEventGate(multiple), /HISTORY_MULTIPLE_SERVICE_EVENTS_REVIEW_REQUIRED/);
});

test("approved review produces writable Airtable Session/Payment and canonical base-points fields", () => {
  const fields = stagedFields();
  const planA = buildMaterializationPlan({
    fields,
    historyReviewFields: approvedHistoryReview(),
    historyReviewId: defaultHistoryReviewId(IMPORT_ID),
    stagingId: STAGING_ID,
    importId: IMPORT_ID,
    client: client(),
    memberWallet: { recordId: MEMBER_RECORD_ID, memberId: "member-canonical-001" },
    priorRemainderThb: 50,
  });
  const planB = buildMaterializationPlan({
    fields,
    historyReviewFields: approvedHistoryReview(),
    historyReviewId: defaultHistoryReviewId(IMPORT_ID),
    stagingId: STAGING_ID,
    importId: IMPORT_ID,
    client: client(),
    memberWallet: { recordId: MEMBER_RECORD_ID, memberId: "member-canonical-001" },
    priorRemainderThb: 50,
  });
  assert.equal(planA.writes.session.session_id, planB.writes.session.session_id);
  assert.equal(planA.writes.payment["Payment Reference"], planB.writes.payment["Payment Reference"]);
  assert.equal(planA.writes.session["Session Status"], "Completed");
  assert.equal(planA.writes.session.payment_status, "paid");
  assert.equal(planA.writes.payment["Payment Status"], "Paid");
  assert.equal(planA.writes.payment.payment_evidence_source, "imported_history");
  assert.equal(planA.writes.points.points_bucket, "base_phase1");
  assert.equal(planA.writes.points.source, "line_ofc_history");
  assert.equal(planA.writes.points.member_id, "member-canonical-001");
  assert.equal(planA.writes.points.points, 13);
  assert.equal(planA.writes.points.remainder_after_thb, 0);
  assert.deepEqual(planA.forbidden_writes, ["MMD — Member Entitlements"]);
});

test("service history can materialize with points rejected without creating a points write", () => {
  const plan = buildMaterializationPlan({
    fields: stagedFields(),
    historyReviewFields: approvedHistoryReview({ points_review_status: "rejected", approved_points_eligible_amount_thb: 0 }),
    historyReviewId: defaultHistoryReviewId(IMPORT_ID),
    stagingId: STAGING_ID,
    importId: IMPORT_ID,
    client: client(),
    memberWallet: null,
  });
  assert.equal(plan.writes.points, null);
});

class FakeAirtable {
  constructor({ fields = stagedFields(), review = approvedHistoryReview(), includeMember = true } = {}) {
    this.staging = { id: STAGING_ID, fields };
    this.client = client();
    this.member = includeMember ? member() : null;
    this.review = { id: "recHISTORYREV001", fields: review };
    this.entitlements = [{
      id: "recENT00000001",
      fields: {
        member_email: "customer@example.com",
        entitlement_id: "ent_public",
        capability: "public_member",
        member_status: "active",
        access_status: "active",
        expire_at: "2027-01-01T00:00:00.000Z",
        source_ref: "test",
      },
    }];
    this.sessions = [];
    this.payments = [];
    this.points = [];
    this.writes = [];
    this.reviewPatches = [];
  }

  async findOne(table, formula) {
    if (table === "tbl1u0foFBvgFpT9G") return this.staging;
    if (table === "tblnpDFQMpo8AmNQv") {
      const requested = formula.match(/"([^"]+)"/)?.[1] || "";
      return requested === this.review.fields.history_review_id ? this.review : null;
    }
    const match = formula.match(/\{([^}]+)\}=\"([^\"]+)\"/);
    if (!match) return null;
    const [, field, value] = match;
    const rows = table === "tblC98mKWbzmPuNzX"
      ? this.sessions
      : table === "tblWGGJJOx5eBvBZJ"
        ? this.payments
        : table === "tbl5dfnwjUFMLbnWL"
          ? this.points
          : [];
    return rows.find((row) => String(row.fields?.[field] || "") === value) || null;
  }

  async list(table) {
    if (table === "tblVv58TCbwh5j1fS") return [this.client];
    if (table === "tblgWc5VRon5o8Mhk") return this.member ? [this.member] : [];
    if (table === "tblNImdF9PKAxhXGi") return this.entitlements;
    if (table === "tbl5dfnwjUFMLbnWL") return this.points;
    return [];
  }

  async requestWithFieldFallback(table, init) {
    if (table === "tblnpDFQMpo8AmNQv" && init.method === "PATCH") {
      Object.assign(this.review.fields, init.body?.fields || {});
      this.reviewPatches.push({ ...(init.body?.fields || {}) });
      return this.review;
    }
    const record = { id: `recWRITE${String(this.writes.length + 1).padStart(8, "0")}`, fields: { ...(init.body?.fields || {}) } };
    this.writes.push({ table, record });
    if (table === "tblC98mKWbzmPuNzX") this.sessions.push(record);
    else if (table === "tblWGGJJOx5eBvBZJ") this.payments.push(record);
    else if (table === "tbl5dfnwjUFMLbnWL") this.points.push(record);
    else throw new Error(`unexpected_write:${table}`);
    return record;
  }
}

async function resolver(records) {
  const active = records.some((row) => row.fields?.capability === "public_member") ? ["public_member"] : [];
  return {
    schema_version: "my_mmd_entitlement_resolver_v1",
    member_blocked: false,
    capability_state: { active, expiring_soon: [], grace: [], inactive: [], recognized: active },
    access: { public_service_access: active.length > 0, private_visibility_envelope: "none" },
  };
}

test("dry-run requires explicit history review and performs zero canonical history writes", async () => {
  const airtable = new FakeAirtable();
  const result = await materializeHistoricalRecord({ importId: IMPORT_ID, apply: false, airtable, resolver, now: "2026-09-03T16:05:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.resolver_write, false);
  assert.equal(airtable.writes.length, 0);
  assert.equal(airtable.reviewPatches.length, 0);
});

test("missing explicit review blocks materialization even when identity is committed", async () => {
  const airtable = new FakeAirtable();
  airtable.review = { id: "", fields: {} };
  await assert.rejects(
    () => materializeHistoricalRecord({ importId: IMPORT_ID, apply: true, airtable, resolver }),
    /HISTORY_EXPLICIT_REVIEW_NOT_FOUND/,
  );
  assert.equal(airtable.writes.length, 0);
});

test("approved points require a canonical Member wallet id", async () => {
  const airtable = new FakeAirtable({ includeMember: false });
  await assert.rejects(
    () => materializeHistoricalRecord({ importId: IMPORT_ID, apply: true, airtable, resolver }),
    /HISTORY_POINTS_CANONICAL_MEMBER_ID_REQUIRED/,
  );
  assert.equal(airtable.writes.length, 0);
});

test("apply writes Session + Payment + Points, closes review audit, and proves Resolver unchanged", async () => {
  const airtable = new FakeAirtable();
  const result = await materializeHistoricalRecord({ importId: IMPORT_ID, apply: true, airtable, resolver, now: "2026-09-03T16:05:00.000Z" });
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, false);
  assert.equal(result.resolver_unchanged, true);
  assert.equal(result.entitlement_write, false);
  assert.equal(airtable.sessions.length, 1);
  assert.equal(airtable.payments.length, 1);
  assert.equal(airtable.points.length, 1);
  assert.equal(airtable.review.fields.review_status, "materialized");
  assert.ok(airtable.review.fields.materialization_idempotency_key.startsWith("hist_mat_"));
  assert.equal(airtable.writes.some((item) => item.table === "tblNImdF9PKAxhXGi"), false);

  const second = await materializeHistoricalRecord({ importId: IMPORT_ID, apply: true, airtable, resolver, now: "2026-09-03T16:06:00.000Z" });
  assert.equal(second.session.duplicate, true);
  assert.equal(second.payment.duplicate, true);
  assert.equal(second.points.duplicate, true);
  assert.equal(airtable.sessions.length, 1);
  assert.equal(airtable.payments.length, 1);
  assert.equal(airtable.points.length, 1);
});
