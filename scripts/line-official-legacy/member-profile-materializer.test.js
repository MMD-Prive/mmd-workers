const assert = require("node:assert/strict");
const test = require("node:test");

const { buildMaterializationPlan, materializeMemberProfile } = require("./member-profile-materializer.js");

function approvedFields(overrides = {}) {
  return {
    import_id: "line_ofc_history_001",
    member_id_candidate: "MMD-001",
    decision: "approve_materialization",
    reviewed_by: "Per",
    reviewed_at: "2026-08-26T00:00:00.000Z",
    historical_service_status: "completed",
    reconciled_service_amount: 22500,
    proposed_points: 225,
    points_review_required: "false",
    points_confidence: 0.95,
    note_detected_dates: JSON.stringify(["2026-08-20"]),
    ...overrides,
  };
}

const member = { member_id: "MMD-001", email: "member@example.com", line_user_id: `U${"a".repeat(32)}` };

test("approved dashboard materialization creates bounded session, ledger and audit plans", () => {
  const plan = buildMaterializationPlan({ stagingRecord: { fields: approvedFields() }, member, trigger: "dashboard_access" });
  assert.equal(plan.ok, true);
  assert.equal(plan.writes.points.points, 225);
  assert.equal(plan.writes.points.rate_policy, "100THB=1PT_FLOOR");
  assert.equal(plan.writes.points.expires_at, undefined);
  assert.equal(plan.writes.session.imported_source_ref, "line_ofc_history_001");
  assert.doesNotMatch(JSON.stringify(plan), /raw_note|payment_ref|internal_note/);
});

test("identity-only and unapproved staging never materialize", () => {
  for (const [trigger, overrides, reason] of [
    ["liff_identity", {}, "trigger_required"],
    ["dashboard_access", { decision: "link_existing_client" }, "review_approval_required"],
    ["dashboard_access", { member_id_candidate: "MMD-OTHER" }, "identity_mismatch"],
    ["dashboard_access", { points_review_required: "true" }, "points_review_required"],
    ["dashboard_access", { note_detected_dates: "[]" }, "service_date_required"],
  ]) {
    const plan = buildMaterializationPlan({ stagingRecord: { fields: approvedFields(overrides) }, member, trigger });
    assert.equal(plan.ok, false);
    assert.equal(plan.reason, reason);
    assert.equal(plan.writes, null);
  }
});

test("cancelled history is audit-only and never creates spend or points", () => {
  const plan = buildMaterializationPlan({ stagingRecord: { fields: approvedFields({ historical_service_status: "cancelled", reconciled_service_amount: 0, proposed_points: 0 }) }, member, trigger: "admin_commit" });
  assert.equal(plan.ok, true);
  assert.equal(plan.reason, "cancelled_zero");
  assert.equal(plan.writes.session, null);
  assert.equal(plan.writes.points, null);
  assert.equal(plan.writes.audit.reason_code, "cancelled_zero");
});

test("points policy mismatch and ambiguous dates fail closed", () => {
  for (const overrides of [
    { reconciled_service_amount: 1499, proposed_points: 15 },
    { proposed_points: 225.5 },
    { note_detected_dates: JSON.stringify(["2026-08-20", "2026-08-21"]) },
  ]) {
    const plan = buildMaterializationPlan({ stagingRecord: { fields: approvedFields(overrides) }, member, trigger: "dashboard_access" });
    assert.equal(plan.ok, false);
  }
});

test("retries are idempotent across session, points and audit writes", async () => {
  const seen = { session: false, points: false, audit: false, writes: [] };
  const store = {
    getStagingByImportId: async () => ({ id: "staging-internal", fields: approvedFields() }),
    getMemberById: async () => member,
    hasSession: async () => seen.session,
    hasPoints: async () => seen.points,
    hasAudit: async () => seen.audit,
    createSession: async () => { seen.session = true; seen.writes.push("session"); },
    createPoints: async () => { seen.points = true; seen.writes.push("points"); },
    createAudit: async () => { seen.audit = true; seen.writes.push("audit"); },
    markStagingMaterialized: async () => { seen.writes.push("staging"); },
  };
  const first = await materializeMemberProfile({ store, importId: "line_ofc_history_001", memberId: "MMD-001", trigger: "dashboard_access" });
  const second = await materializeMemberProfile({ store, importId: "line_ofc_history_001", memberId: "MMD-001", trigger: "dashboard_access" });
  assert.deepEqual(first.wrote, ["session", "points", "audit"]);
  assert.deepEqual(second.wrote, []);
  assert.equal(seen.writes.filter((item) => item === "session").length, 1);
  assert.equal(seen.writes.filter((item) => item === "points").length, 1);
  assert.equal(seen.writes.filter((item) => item === "audit").length, 1);
});
