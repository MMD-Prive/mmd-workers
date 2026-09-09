const test = require("node:test");
const assert = require("node:assert/strict");

const { classifyError, runHistoryBatchMigration } = require("./history-batch-migrate.js");

function review(id, stagingId, fields = {}) {
  return {
    id: `rec-${id}`,
    fields: {
      history_review_id: id,
      review_status: "approved",
      decision: "approve_service_history",
      "LINE OFC Import Row": [stagingId],
      ...fields,
    },
  };
}

class FakeAirtable {
  constructor() {
    this.reviews = [
      review("hist-001", "recSTAGE1"),
      review("hist-002", "recSTAGE2"),
      review("hist-003", "recSTAGE3", { review_status: "pending" }),
    ];
    this.staging = {
      recSTAGE1: { id: "recSTAGE1", fields: { import_id: "import-001" } },
      recSTAGE2: { id: "recSTAGE2", fields: { import_id: "import-002" } },
    };
  }

  async list(table, options = {}) {
    if (table === "tblnpDFQMpo8AmNQv") return this.reviews;
    if (table === "tbl1u0foFBvgFpT9G") {
      const recordId = String(options.filterByFormula || "").match(/\"([^\"]+)\"/)?.[1];
      return this.staging[recordId] ? [this.staging[recordId]] : [];
    }
    return [];
  }
}

test("batch is approved-review-only, bounded and dry-run by default", async () => {
  const airtable = new FakeAirtable();
  const calls = [];
  const materialize = async (input) => {
    calls.push(input);
    return { ok: true, dry_run: !input.apply };
  };
  const result = await runHistoryBatchMigration({ limit: 1, airtable, materialize });
  assert.equal(result.dry_run, true);
  assert.equal(result.approved_reviews_seen, 2);
  assert.equal(result.processed, 1);
  assert.equal(result.next_after_history_review_id, "hist-001");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].apply, false);
  assert.equal(result.safety.auto_approval, false);
  assert.equal(result.safety.entitlement_write, false);
});

test("batch resume cursor continues deterministically", async () => {
  const airtable = new FakeAirtable();
  const calls = [];
  const result = await runHistoryBatchMigration({
    afterHistoryReviewId: "hist-001",
    airtable,
    materialize: async (input) => {
      calls.push(input.historyReviewId);
      return { ok: true, dry_run: true };
    },
  });
  assert.deepEqual(calls, ["hist-002"]);
  assert.equal(result.next_after_history_review_id, "");
});

test("one blocked review is isolated and does not stop the batch", async () => {
  const airtable = new FakeAirtable();
  const result = await runHistoryBatchMigration({
    apply: true,
    airtable,
    materialize: async ({ historyReviewId }) => {
      if (historyReviewId === "hist-001") {
        const error = new Error("HISTORY_PAYMENT_COVERAGE_INCOMPLETE");
        error.code = "HISTORY_PAYMENT_COVERAGE_INCOMPLETE";
        throw error;
      }
      return { ok: true };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.processed, 2);
  assert.equal(result.blocked, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(result.results[0].status, "payment_evidence_incomplete");
  assert.equal(result.results[1].status, "materialized");
});

test("known fail-closed conditions are classified for operations", () => {
  assert.equal(classifyError({ code: "HISTORY_POINTS_OUT_OF_ORDER_REBUILD_REQUIRED" }), "wallet_rebuild_required");
  assert.equal(classifyError({ code: "HISTORY_PAYMENT_COVERAGE_INCOMPLETE" }), "payment_evidence_incomplete");
  assert.equal(classifyError({ code: "HISTORY_POINTS_CANONICAL_MEMBER_ID_REQUIRED" }), "member_wallet_required");
});