import test from "node:test";
import assert from "node:assert/strict";
import { buildOwnerActionsQueue } from "./src/owner-actions-queue.js";
import { buildOwnerActionDetail } from "./src/owner-action-detail.js";

test("owner actions queue deduplicates within each authoritative decision class", () => {
  const queue = buildOwnerActionsQueue({
    now: "2026-09-23T00:00:00.000Z",
    money: [{ proof_id: "proof-1" }, { proof_id: "proof-1" }, { proof_id: "proof-2" }],
    historical_recovery: [{ proof_id: "old-1" }, { proof_id: "old-1" }],
    reconfirm: { available: true, items: [
      { session_id: "s-1", status: "overdue" },
      { session_id: "s-1", status: "overdue" },
      { session_id: "s-2", status: "pending" },
    ] },
    members: [{ id: "m-1" }, { id: "m-1" }],
    boss: [{ href: "/internal/admin/exceptions" }],
    unavailable_sources: ["finance_audit", "mms", "hype", "unknown"],
  });

  assert.equal(queue.contract, "mmd_owner_actions_queue_v1");
  assert.equal(queue.actions[0].action_key, "payment_review");
  assert.deepEqual(queue.actions.map((item) => [item.action_key, item.count]), [
    ["payment_review", 2],
    ["historical_recovery", 1],
    ["job_reconfirm_overdue", 1],
    ["job_reconfirm_pending", 1],
    ["membership_review", 1],
    ["owner_exception", 1],
  ]);
  assert.deepEqual(queue.unavailable_sources, ["finance_audit", "mms", "hype"]);
});

test("owner actions queue uses stable source record ids for memberships and full authoritative lists", () => {
  const queue = buildOwnerActionsQueue({
    money: Array.from({ length: 8 }, (_, index) => ({ proof_id: `proof-${index}` })),
    historical_recovery: Array.from({ length: 7 }, (_, index) => ({ proof_id: `historical-${index}` })),
    members: [{ id: "rec-member-1" }, { id: "rec-member-2" }, { id: "rec-member-2" }],
  });
  const byKey = Object.fromEntries(queue.actions.map((item) => [item.action_key, item.count]));
  assert.equal(byKey.payment_review, 8);
  assert.equal(byKey.historical_recovery, 7);
  assert.equal(byKey.membership_review, 2);
});

test("owner actions queue does not expose source names, payment refs, or raw notes", () => {
  const queue = buildOwnerActionsQueue({
    money: [{ proof_id: "proof-secret", customer_name: "Private Name", payment_ref: "bank-secret" }],
    boss: [{ title: "Raw private note", text: "do not project", href: "/internal/admin/exceptions" }],
  });

  assert.equal(JSON.stringify(queue).includes("Private Name"), false);
  assert.equal(JSON.stringify(queue).includes("bank-secret"), false);
  assert.equal(JSON.stringify(queue).includes("Raw private note"), false);
  assert.equal(queue.send_allowed, false);
  assert.equal(queue.mutation_allowed, false);
});

test("owner actions queue projects connected Finance, MMS and HYPE coverage without source records", () => {
  const queue = buildOwnerActionsQueue({
    finance_audit: { available: true, reconciliation_count: 2, payout_hold_count: 1 },
    mms: { available: true, application_review_count: 3, prebooking_coordination_count: 4 },
    hype: { available: true, counts: { total: 2, overdue: 1, owner_actionable_overdue: 1, owner_actionable_by_kind: { entitlement_notification_incomplete: 1 } } },
    source_coverage: [
      { source: "finance_audit", label: "Finance Audit", state: "connected", authority: "canonical_finance_timeline", href: "/internal/admin/partners", action_count: 3 },
      { source: "mms", label: "MMS", state: "connected", authority: "mms-worker", href: "/internal/admin/mms", action_count: 7 },
      { source: "hype", label: "HYPE operational watch", state: "partial", authority: "hype_coordinator_read_only", href: "/internal/admin/control-room", action_count: 1 },
    ],
    unavailable_sources: ["hype"],
  });

  assert.deepEqual(queue.actions.map((item) => [item.action_key, item.count]), [
    ["finance_reconciliation", 2],
    ["finance_payout_hold", 1],
    ["mms_prebooking_coordination", 4],
    ["mms_application_review", 3],
    ["hype_entitlement_notification_overdue", 1],
  ]);
  assert.deepEqual(queue.unavailable_sources, ["hype"]);
  assert.deepEqual(queue.source_coverage.map((item) => [item.source, item.state, item.read_only]), [
    ["finance_audit", "connected", true],
    ["mms", "connected", true],
    ["hype", "partial", true],
  ]);
  assert.equal(JSON.stringify(queue).includes("bank-secret"), false);
});



test("availability operations surface only SLA follow-up or source exceptions", () => {
  const queue = buildOwnerActionsQueue({
    availability: {
      available: true,
      coverage_health: {
        review_status: "owner_action_required",
        owner_action_required: 3,
        follow_up_due: 1,
        source_unavailable_models: 0,
      },
    },
    source_coverage: [
      { source: "availability", label: "Availability", state: "connected", authority: "sigil_availability_snapshot_v1", href: "/internal/admin/calendar", action_count: 1 },
    ],
  });

  assert.deepEqual(queue.actions.map((item) => [item.action_key, item.count, item.urgency]), [
    ["availability_exception_review", 1, "urgent"],
  ]);
  assert.deepEqual(queue.source_coverage.map((item) => [item.source, item.state, item.href]), [
    ["availability", "connected", "/internal/admin/calendar"],
  ]);

  const onboardingBacklog = buildOwnerActionsQueue({
    availability: {
      available: true,
      coverage_health: {
        review_status: "owner_action_required",
        owner_action_required: 27,
        follow_up_due: 0,
        source_unavailable_models: 0,
      },
    },
    source_coverage: [
      { source: "availability", label: "Availability", state: "connected", authority: "sigil_availability_snapshot_v1", href: "/internal/admin/calendar", action_count: 0 },
    ],
  });
  assert.equal(onboardingBacklog.actions.some((item) => item.action_key === "availability_exception_review"), false);

  const current = buildOwnerActionsQueue({
    availability: {
      available: true,
      coverage_health: {
        review_status: "coverage_current",
        owner_action_required: 0,
        follow_up_due: 0,
        source_unavailable_models: 0,
      },
    },
    source_coverage: [
      { source: "availability", label: "Availability", state: "connected", authority: "sigil_availability_snapshot_v1", href: "/internal/admin/calendar", action_count: 0 },
    ],
  });
  assert.equal(current.actions.some((item) => item.action_key === "availability_exception_review"), false);
  assert.equal(current.source_coverage[0].state, "connected");
});

test("availability source attention is fail-closed and routes to Calendar", () => {
  const input = {
    availability: {
      available: true,
      coverage_health: {
        review_status: "source_attention",
        owner_action_required: 0,
        follow_up_due: 0,
        source_unavailable_models: 2,
      },
    },
    source_coverage: [
      { source: "availability", label: "Availability", state: "partial", authority: "sigil_availability_snapshot_v1", href: "/internal/admin/calendar", action_count: 2 },
    ],
    unavailable_sources: ["availability"],
  };
  const queue = buildOwnerActionsQueue(input);
  const action = queue.actions.find((item) => item.action_key === "availability_exception_review");
  assert.equal(action.count, 2);
  assert.equal(action.urgency, "attention");
  assert.equal(action.authority, "sigil_availability_snapshot_v1");
  assert.equal(action.href, "/internal/admin/calendar");
  assert.deepEqual(queue.unavailable_sources, ["availability"]);

  const detail = buildOwnerActionDetail(input, "availability_exception_review");
  assert.equal(detail.drilldown.source_surface, "/internal/admin/calendar");
  assert.equal(detail.drilldown.send_allowed, false);
  assert.equal(detail.drilldown.mutation_allowed, false);
  assert.match(detail.drilldown.decision_boundary, /ห้ามเดาสถานะว่าง/);
});



test("HYPE watch-only backlog stays out while overdue items split into source cohorts", () => {
  const watchOnly = buildOwnerActionsQueue({
    hype: { available: true, counts: { total: 53, overdue: 0, watch: 53, owner_actionable_overdue: 0, owner_actionable_by_kind: {} } },
    source_coverage: [
      { source: "hype", label: "HYPE operational watch", state: "connected", authority: "hype_coordinator_read_only", href: "/internal/admin/control-room", action_count: 0 },
    ],
  });
  assert.equal(watchOnly.actions.some((item) => item.action_key.startsWith("hype_")), false);

  const overdue = buildOwnerActionsQueue({
    hype: {
      available: true,
      counts: {
        total: 53,
        overdue: 12,
        watch: 41,
        owner_actionable_overdue: 4,
        owner_actionable_by_kind: {
          entitlement_notification_incomplete: 1,
          recovery_unassigned: 1,
          coupon_manual_review: 1,
          telegram_bind_unconsumed: 1,
        },
      },
    },
    source_coverage: [
      { source: "hype", label: "HYPE operational watch", state: "connected", authority: "hype_coordinator_read_only", href: "/internal/admin/control-room", action_count: 4 },
    ],
  });
  assert.deepEqual(overdue.actions.map((item) => [item.action_key, item.count, item.href, item.authority]), [
    ["hype_entitlement_notification_overdue", 1, "/internal/admin/member-intelligence", "my_mmd_entitlement_resolver_v1"],
    ["hype_recovery_unassigned_overdue", 1, "/internal/admin/recovery?assignment=unassigned", "recovery_queue_operational_metadata"],
    ["hype_coupon_manual_review_overdue", 1, "/internal/admin/member-intelligence", "care_back_claim_policy"],
    ["hype_telegram_bind_overdue", 1, "/internal/admin/control-room", "telegram_identity_bind_authority"],
  ]);
});

test("stale terminal CARE BACK diagnostics never create an Owner Action", () => {
  const queue = buildOwnerActionsQueue({
    hype: {
      available: true,
      counts: {
        total: 0,
        overdue: 0,
        watch: 0,
        owner_actionable_overdue: 0,
        owner_actionable_by_kind: {},
        stale_terminal_records: 8,
      },
      stale_terminal_by_kind: {
        coupon_manual_review_terminal: 8,
      },
    },
  });

  assert.equal(queue.actions.some((item) => item.action_key === "hype_coupon_manual_review_overdue"), false);
  assert.equal(queue.actions.some((item) => item.action_key === "hype_operational_watch"), false);
  assert.equal(queue.queue_health.schema, "mmd_owner_actions_queue_health_v1");
  assert.equal(queue.queue_health.active_owner_decisions, 0);
  assert.equal(queue.queue_health.unknown_hype_overdue, 0);
  assert.equal(queue.queue_health.stale_terminal_records, 8);
  assert.deepEqual(queue.queue_health.stale_terminal_by_kind, { coupon_manual_review_terminal: 8 });
  assert.equal(queue.queue_health.classification_complete, true);
  assert.equal(queue.queue_health.business_truth_mutated, false);
});

test("unknown HYPE overdue kind remains visible through generic fail-closed fallback", () => {
  const queue = buildOwnerActionsQueue({
    hype: {
      available: true,
      counts: {
        owner_actionable_overdue: 3,
        owner_actionable_by_kind: {
          entitlement_notification_incomplete: 2,
          future_unknown_kind: 1,
        },
      },
    },
  });
  assert.deepEqual(queue.actions.map((item) => [item.action_key, item.count]), [
    ["hype_entitlement_notification_overdue", 2],
    ["hype_operational_watch", 1],
  ]);
});



test("queue health fails phase closure safely on unknown HYPE overdue or unavailable source", () => {
  const queue = buildOwnerActionsQueue({
    hype: {
      available: true,
      counts: {
        owner_actionable_overdue: 2,
        owner_actionable_by_kind: {
          entitlement_notification_incomplete: 1,
          future_unknown_kind: 1,
        },
      },
    },
    unavailable_sources: ["hype"],
  });

  assert.equal(queue.queue_health.unknown_hype_overdue, 1);
  assert.equal(queue.queue_health.classification_complete, false);
  assert.equal(queue.queue_health.source_coverage_complete, false);
  assert.equal(queue.queue_health.phase_5_closure_ready, false);
});

test("HYPE cohort detail routes to the owning source and remains read-only", () => {
  const input = {
    hype: {
      available: true,
      counts: {
        owner_actionable_overdue: 1,
        owner_actionable_by_kind: { recovery_unassigned: 1 },
      },
    },
  };
  const detail = buildOwnerActionDetail(input, "hype_recovery_unassigned_overdue");
  assert.equal(detail.drilldown.source_surface, "/internal/admin/recovery?assignment=unassigned");
  assert.equal(detail.drilldown.authority, "recovery_queue_operational_metadata");
  assert.equal(detail.drilldown.records_exposed, false);
  assert.equal(detail.drilldown.send_allowed, false);
  assert.equal(detail.drilldown.mutation_allowed, false);
  assert.match(detail.drilldown.decision_boundary, /business truth/);
});

test("known Owner Action detail stays safe when the action clears between queue and drilldown", () => {
  const detail = buildOwnerActionDetail({}, "hype_telegram_bind_overdue");

  assert.equal(detail.ok, true);
  assert.equal(detail.state, "cleared_since_queue");
  assert.equal(detail.action.action_key, "hype_telegram_bind_overdue");
  assert.equal(detail.action.count, 0);
  assert.equal(detail.action.review_required, false);
  assert.equal(detail.action.authority, "telegram_identity_bind_authority");
  assert.equal(detail.action.href, "/internal/admin/control-room");
  assert.equal(detail.drilldown.state, "cleared_since_queue");
  assert.equal(detail.drilldown.observed_count, 0);
  assert.equal(detail.drilldown.records_exposed, false);
  assert.equal(detail.drilldown.personal_data_exposed, false);
  assert.equal(detail.drilldown.send_allowed, false);
  assert.equal(detail.drilldown.mutation_allowed, false);
  assert.match(detail.drilldown.decision_boundary, /snapshot เก่า/);
});

test("owner action detail is a source-safe owner-only read projection", () => {
  const detail = buildOwnerActionDetail({
    now: "2026-09-23T00:00:00.000Z",
    money: [{ proof_id: "proof-secret", customer_name: "Private Name", payment_ref: "bank-secret" }],
    unavailable_sources: ["mms"],
  }, "payment_review");

  assert.equal(detail.contract, "mmd_owner_action_detail_v1");
  assert.equal(detail.action.detail_href, "/v1/admin/dashboard/owner-actions?action_key=payment_review");
  assert.equal(detail.drilldown.records_exposed, false);
  assert.equal(detail.drilldown.personal_data_exposed, false);
  assert.equal(detail.drilldown.send_allowed, false);
  assert.equal(detail.drilldown.mutation_allowed, false);
  assert.equal(JSON.stringify(detail).includes("Private Name"), false);
  assert.equal(JSON.stringify(detail).includes("bank-secret"), false);
  assert.equal(buildOwnerActionDetail({ money: [{ proof_id: "proof-1" }] }, "unknown"), null);
});
