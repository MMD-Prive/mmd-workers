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
