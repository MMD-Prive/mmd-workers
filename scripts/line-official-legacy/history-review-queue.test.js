const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReviewCandidate, prepareHistoryReviewQueue } = require("./history-review-queue.js");
const { defaultHistoryReviewId } = require("./history-materializer.js");

const IMPORT_ID = "line_ofc_hist_001";
const STAGING_ID = "recSTAGING00001";
const CLIENT_ID = "recABCDEFGHIJKL";

function staging(overrides = {}) {
  return {
    id: STAGING_ID,
    fields: {
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
      historical_events_json: JSON.stringify({
        amounts: [{ type: "service", amount: 1250 }],
        dates: ["13/07/2569"],
        payment_refs: ["HIST001"],
      }),
      points_eligible_amount: 1250,
      points_review_required: "false",
      reconciliation_basis: "single_service_amount",
      historical_service_status: "completed",
      ...overrides,
    },
  };
}

test("review queue stores candidates separately from approved fields", () => {
  const candidate = buildReviewCandidate(staging());
  assert.equal(candidate.historyReviewId, defaultHistoryReviewId(IMPORT_ID));
  assert.equal(candidate.fields.review_status, "pending");
  assert.equal(candidate.fields.decision, "hold_for_review");
  assert.equal(candidate.fields.points_review_status, "pending");
  assert.equal(candidate.fields.candidate_service_date, "2026-07-13");
  assert.equal(candidate.fields.candidate_service_amount_thb, 1250);
  assert.equal(candidate.fields.candidate_payment_ref, "HIST001");
  assert.equal(candidate.fields.candidate_points_eligible_amount_thb, 1250);
  assert.equal("approved_service_date" in candidate.fields, false);
  assert.equal("approved_service_amount_thb" in candidate.fields, false);
  assert.equal("approved_points_eligible_amount_thb" in candidate.fields, false);
});

test("uncommitted identity cannot enter review queue", () => {
  assert.throws(() => buildReviewCandidate(staging({ review_status: "ready_to_review" })), /HISTORY_IDENTITY_REVIEW_NOT_COMMITTED/);
});

class FakeAirtable {
  constructor(rows = [staging()]) {
    this.rows = rows;
    this.reviewRows = [];
  }

  async findOne(table, formula) {
    if (table === "tbl1u0foFBvgFpT9G") {
      const importId = formula.match(/"([^"]+)"/)?.[1];
      return this.rows.find((row) => row.fields.import_id === importId) || null;
    }
    if (table === "tblnpDFQMpo8AmNQv") {
      const reviewId = formula.match(/"([^"]+)"/)?.[1];
      return this.reviewRows.find((row) => row.fields.history_review_id === reviewId) || null;
    }
    return null;
  }

  async list(table) {
    return table === "tbl1u0foFBvgFpT9G" ? this.rows : [];
  }

  async requestWithFieldFallback(table, init) {
    assert.equal(table, "tblnpDFQMpo8AmNQv");
    assert.equal(init.method, "POST");
    const row = { id: `recREVIEW${String(this.reviewRows.length + 1).padStart(7, "0")}`, fields: { ...(init.body?.fields || {}) } };
    this.reviewRows.push(row);
    return row;
  }
}

test("dry-run creates no Airtable review row", async () => {
  const airtable = new FakeAirtable();
  const result = await prepareHistoryReviewQueue({ importId: IMPORT_ID, apply: false, airtable });
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.ready_for_review_queue, 1);
  assert.equal(airtable.reviewRows.length, 0);
});

test("apply creates pending review only and is idempotent", async () => {
  const airtable = new FakeAirtable();
  const first = await prepareHistoryReviewQueue({ importId: IMPORT_ID, apply: true, airtable });
  assert.equal(first.queued, 1);
  assert.equal(first.truth_writes, false);
  assert.deepEqual(first.writes, ["MMD — Customer History Reviews"]);
  assert.equal(airtable.reviewRows.length, 1);
  assert.equal(airtable.reviewRows[0].fields.review_status, "pending");

  const second = await prepareHistoryReviewQueue({ importId: IMPORT_ID, apply: true, airtable });
  assert.equal(second.results[0].duplicate, true);
  assert.equal(airtable.reviewRows.length, 1);
});

test("all-committed mode skips blocked identity rows instead of inventing review approval", async () => {
  const airtable = new FakeAirtable([
    staging(),
    staging({ import_id: "line_ofc_hist_002", review_status: "review_required" }),
  ]);
  const result = await prepareHistoryReviewQueue({ allCommitted: true, apply: false, airtable });
  assert.equal(result.ready_for_review_queue, 1);
  assert.equal(result.blocked.length, 1);
  assert.match(result.blocked[0].error, /HISTORY_IDENTITY_REVIEW_NOT_COMMITTED/);
});
