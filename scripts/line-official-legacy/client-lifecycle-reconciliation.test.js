const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_THRESHOLDS,
  buildProjection,
  chooseAction,
  currentPoints,
  lifecycleStatus,
  renewalState,
} = require("./client-lifecycle-reconciliation.js");

const NOW = new Date("2026-09-13T07:00:00.000Z");

function daysAgo(days) {
  return new Date(NOW.getTime() - days * 86400000).toISOString();
}

function client(id = "recClient123456") {
  return { id, fields: { "Client Name": "Test Client" } };
}

function member(overrides = {}) {
  return {
    id: "recMember123456",
    fields: {
      member_id: "MMD-MEMBER-1",
      Clients: ["recClient123456"],
      "Points Balance": 123,
      "Membership Status": "active",
      ...overrides,
    },
  };
}

function staging(clientId = "recClient123456") {
  return {
    id: "recStage123456",
    fields: {
      line_tags_raw: "#client #purchased",
      review_status: "committed",
      decision: "link_existing_client",
      matched_client: [clientId],
    },
  };
}

function completedSession(date, amount = 10000) {
  return {
    id: `recSession${String(date).replace(/\D/g, "")}`,
    fields: {
      Client: ["recClient123456"],
      "Session Status": "Completed",
      "Session Date": date,
      "Total Amount": amount,
      import_review_status: "approved",
    },
  };
}

test("lifecycle boundaries are deterministic", () => {
  assert.equal(lifecycleStatus(29, false), "active_recent");
  assert.equal(lifecycleStatus(30, false), "follow_up_30d");
  assert.equal(lifecycleStatus(89, false), "follow_up_30d");
  assert.equal(lifecycleStatus(90, false), "dormant_90d");
  assert.equal(lifecycleStatus(179, false), "dormant_90d");
  assert.equal(lifecycleStatus(180, false), "lost_180d");
  assert.equal(lifecycleStatus(500, true), "do_not_contact");
});

test("action priority puts identity and history review ahead of lifecycle marketing", () => {
  const blocked = chooseAction({ identityBlocked: true, unresolvedCount: 10, pointsState: "review_required", renewal: { due: true, overdue: false }, lifecycle: "lost_180d", doNotContact: false, highValue: true });
  assert.equal(blocked.action, "Review client identity match");

  const history = chooseAction({ identityBlocked: false, unresolvedCount: 2, pointsState: "review_required", renewal: { due: true, overdue: false }, lifecycle: "lost_180d", doNotContact: false, highValue: true });
  assert.equal(history.action, "Review historical LINE OFC evidence");
});

test("do-not-contact suppresses reactivation action", () => {
  const action = chooseAction({ identityBlocked: false, unresolvedCount: 0, pointsState: "confirmed", renewal: { due: false, overdue: false }, lifecycle: "do_not_contact", doNotContact: true, highValue: true });
  assert.equal(action.action, "Do not contact");
});

test("points remain review-required while historical reviews are unresolved", () => {
  assert.deepEqual(currentPoints(member(), 2), { value: 123, state: "review_required" });
  assert.deepEqual(currentPoints(member(), 0), { value: 123, state: "confirmed" });
  assert.deepEqual(currentPoints(null, 0), { value: null, state: "no_member_wallet" });
});

test("renewal due and overdue use canonical member dates only", () => {
  const due = renewalState(member({ "Renewal Due Date": "2026-09-20" }), NOW, DEFAULT_THRESHOLDS);
  assert.equal(due.due, true);
  assert.equal(due.overdue, false);

  const overdue = renewalState(member({ "Renewal Due Date": "2026-09-01" }), NOW, DEFAULT_THRESHOLDS);
  assert.equal(overdue.overdue, true);
});

test("projection contains no raw notes and flags lost high-value client", () => {
  const result = buildProjection({
    client: client(),
    member: member(),
    stagingRows: [staging()],
    reviewRows: [],
    sessionRows: [completedSession("2026-02-01", 130000)],
    paymentRows: [],
    intelligenceRows: [{ id: "recEvidence1", fields: { Client: ["recClient123456"], evidence_type: "model_review", raw_note: "private raw review" } }],
  }, NOW);

  assert.equal(result.projection.lifecycle_status, "lost_180d");
  assert.ok(result.projection.attention_flags.includes("high_value_reactivation"));
  assert.equal(result.projection.current_points_confirmed, 123);
  assert.equal(result.projection.model_review_evidence_count, 1);
  assert.ok(!result.fields.projection_json.includes("private raw review"));
  assert.ok(!result.fields.projection_json.includes("raw_note"));
});

test("unresolved history wins over renewal and lost status", () => {
  const result = buildProjection({
    client: client(),
    member: member({ "Renewal Due Date": "2026-08-01" }),
    stagingRows: [staging()],
    reviewRows: [{ id: "recReview1", fields: { Client: ["recClient123456"], review_status: "pending" } }],
    sessionRows: [completedSession("2026-01-01", 5000)],
    paymentRows: [],
    intelligenceRows: [],
  }, NOW);

  assert.equal(result.fields.next_best_action, "Review historical LINE OFC evidence");
  assert.equal(result.fields.points_state, "review_required");
  assert.ok(result.fields.attention_flags.includes("history_review_required"));
  assert.ok(result.fields.attention_flags.includes("renewal_overdue"));
});
