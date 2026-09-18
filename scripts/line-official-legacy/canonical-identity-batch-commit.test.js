const test = require("node:test");
const assert = require("node:assert/strict");

const { STAGING_TABLE, CLIENTS_TABLE } = require("./canonical-identity-commit-adapter.js");
const { REVIEWABLE_FILTER, listReadyImportIds, run } = require("./canonical-identity-batch-commit.js");

const LINE_ID_A = "U5107dbdc87dbdd985ef5516b7f208fc3";
const LINE_ID_B = "Ue9e1b6f2a5c94a2a9c6b6f2a5c94a2a9";
const CLIENT_ID_A = "recABCDEF1234567";
const CLIENT_ID_B = "recGHIJKL7654321";
const NOW = "2026-09-17T12:00:00.000Z";

// Real production rows have been observed with several different
// review_status values ("review_required", "ready_to_review", etc. --
// see review-report.js and line-ofc-client-import.js). This helper
// deliberately does NOT use "ready_to_commit" anywhere, to prove the batch
// script's query keys off decision/decision_source, not a specific status.
function reviewedStage({ id, importId, lineUserId, clientId, reviewStatus = "review_required", reviewedAt = "2026-09-17T11:00:00.000Z" }) {
  return {
    id,
    fields: {
      import_id: importId,
      line_user_id: lineUserId,
      decision: "link_existing_client",
      decision_source: "manual_review",
      reviewed_by: "per",
      reviewed_at: reviewedAt,
      review_status: reviewStatus,
      matched_client_id: clientId,
      dry_run_only: true,
    },
  };
}

function canonicalClient(id, overrides = {}) {
  return { id, fields: { "Contact Email": `${id}@example.com`, ...overrides } };
}

test("listReadyImportIds returns reviewed, not-yet-committed rows regardless of the exact review_status label, deduped and cleaned", async () => {
  const fake = fakeAirtable({
    clients: [],
    staging: [
      reviewedStage({ id: "rec1", importId: "import_a", lineUserId: LINE_ID_A, clientId: CLIENT_ID_A, reviewStatus: "review_required" }),
      reviewedStage({ id: "rec1dupe", importId: "import_a", lineUserId: LINE_ID_A, clientId: CLIENT_ID_A, reviewStatus: "review_required" }),
      reviewedStage({ id: "rec2", importId: "import_b", lineUserId: LINE_ID_B, clientId: CLIENT_ID_B, reviewStatus: "ready_to_review" }),
      { id: "recCommitted", fields: { import_id: "import_committed", decision: "link_existing_client", decision_source: "manual_review", review_status: "committed" } },
      { id: "recUnreviewed", fields: { import_id: "import_unreviewed", decision: "link_existing_client", decision_source: "auto_match", review_status: "review_required" } },
      { id: "recBlank", fields: { import_id: "", decision: "link_existing_client", decision_source: "manual_review", review_status: "review_required" } },
    ],
  });
  const ids = await listReadyImportIds(fake, 500);
  assert.deepEqual(ids, ["import_a", "import_b"]);
});

test("apply commits every reviewed row and is idempotent on re-run", async () => {
  const fake = fakeAirtable({
    clients: [canonicalClient(CLIENT_ID_A), canonicalClient(CLIENT_ID_B)],
    staging: [
      reviewedStage({ id: "rec1", importId: "import_a", lineUserId: LINE_ID_A, clientId: CLIENT_ID_A }),
      // "ready_to_commit" is the one non-"review_required" status
      // assertReviewedLink() itself already accepts (REVIEWABLE_STATUSES in
      // canonical-identity-commit-adapter.js). A status like "ready_to_review"
      // (seen in review-report.js) is NOT in that allow-list and would
      // correctly surface as a CANONICAL_REVIEW_STATUS_BLOCKED failure here --
      // that mismatch is a separate, pre-existing gap in the adapter's own
      // contract, not something this batch runner should silently paper over.
      reviewedStage({ id: "rec2", importId: "import_b", lineUserId: LINE_ID_B, clientId: CLIENT_ID_B, reviewStatus: "ready_to_commit" }),
    ],
  });

  const applied = await run({ apply: true, airtable: fake, assertIdempotent: false, now: NOW });
  assert.equal(applied.candidates_found, 2);
  assert.equal(applied.newly_committed, 2);
  assert.equal(applied.already_committed, 0);
  assert.equal(applied.failed, 0);

  const clientWrites = fake.writes.filter((write) => write.table === CLIENTS_TABLE);
  assert.equal(clientWrites.length, 2);
  const stagingWrites = fake.writes.filter((write) => write.table === STAGING_TABLE);
  assert.equal(stagingWrites.length, 2);
  assert.equal(stagingWrites[0].body.records[0].fields.committed_at, NOW);
  assert.equal(stagingWrites[0].body.records[0].fields.review_status, "committed");

  // Once committed, buildCommitPlan() moves review_status to "committed", so
  // a re-run's reviewable-rows query naturally stops finding these rows at
  // all -- the batch converges to zero candidates instead of re-visiting
  // already-done work every run.
  fake.writes.length = 0;
  const rerun = await run({ apply: false, airtable: fake, assertIdempotent: true });
  assert.equal(rerun.candidates_found, 0);
  assert.equal(rerun.newly_committed, 0);
  assert.equal(rerun.already_committed, 0);
  assert.equal(rerun.pending_mutations, 0);
  assert.equal(fake.writes.length, 0);
});

test("a reviewed row with a review_status the commit adapter does not recognize fails closed, not silently", async () => {
  const fake = fakeAirtable({
    clients: [canonicalClient(CLIENT_ID_A)],
    staging: [
      reviewedStage({ id: "rec1", importId: "import_a", lineUserId: LINE_ID_A, clientId: CLIENT_ID_A, reviewStatus: "ready_to_review" }),
    ],
  });
  const result = await run({ apply: true, airtable: fake });
  assert.equal(result.candidates_found, 1);
  assert.equal(result.newly_committed, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.failures[0].error, "CANONICAL_REVIEW_STATUS_BLOCKED");
  assert.equal(fake.writes.length, 0);
});

test("a blocked row is reported as failed without aborting the rest of the batch", async () => {
  const fake = fakeAirtable({
    clients: [
      canonicalClient(CLIENT_ID_A, { line_user_id: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }), // already linked elsewhere -> conflict
      canonicalClient(CLIENT_ID_B),
    ],
    staging: [
      reviewedStage({ id: "rec1", importId: "import_a", lineUserId: LINE_ID_A, clientId: CLIENT_ID_A }),
      reviewedStage({ id: "rec2", importId: "import_b", lineUserId: LINE_ID_B, clientId: CLIENT_ID_B }),
    ],
  });

  const result = await run({ apply: true, airtable: fake });
  assert.equal(result.candidates_found, 2);
  assert.equal(result.newly_committed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.failures[0].error, "CANONICAL_CLIENT_LINE_CONFLICT");
  // The healthy row still committed even though the other row failed.
  assert.equal(fake.writes.some((write) => write.table === CLIENTS_TABLE && write.body.records[0].id === CLIENT_ID_B), true);
});

function fakeAirtable({ clients = [], staging = [] } = {}) {
  const state = {
    clients: structuredClone(clients),
    staging: structuredClone(staging),
  };
  const writes = [];

  function extractQuoted(formula, field) {
    const escaped = String(field).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = String(formula || "").match(new RegExp(`\\{${escaped}\\}=\\\"([^\\\"]*)\\\"`));
    return match?.[1] || "";
  }

  function isCommitted(row) {
    const fields = row.fields || {};
    return fields.match_type === "line_user_id_exact"
      && fields.decision === "link_existing_client"
      && fields.review_status === "committed";
  }

  return {
    writes,
    async findOne(table, formula) {
      assert.equal(table, STAGING_TABLE);
      const importId = extractQuoted(formula, "import_id");
      return state.staging.find((row) => row.fields?.import_id === importId) || null;
    },
    async list(table, query = {}) {
      const formula = String(query.filterByFormula || "");
      if (table === CLIENTS_TABLE) {
        const recordMatch = formula.match(/RECORD_ID\(\)=\"([^\"]+)\"/);
        if (recordMatch) return state.clients.filter((row) => row.id === recordMatch[1]);
        const lineUserId = extractQuoted(formula, "line_user_id");
        if (lineUserId) return state.clients.filter((row) => row.fields?.line_user_id === lineUserId);
        return state.clients;
      }
      if (table === STAGING_TABLE) {
        const lineUserId = extractQuoted(formula, "line_user_id");
        let rows = lineUserId ? state.staging.filter((row) => row.fields?.line_user_id === lineUserId) : state.staging;
        if (formula.includes("{match_type}")) rows = rows.filter(isCommitted);
        if (formula.includes("{decision_source}")) {
          rows = rows.filter((row) => row.fields?.decision === "link_existing_client" && row.fields?.decision_source === "manual_review");
        }
        if (formula.includes("{review_status}!=")) {
          rows = rows.filter((row) => row.fields?.review_status !== "committed");
        }
        return rows;
      }
      throw new Error(`unexpected_list_table:${table}`);
    },
    async request(table, init = {}) {
      assert.equal(init.method, "PATCH");
      writes.push({ table, method: init.method, body: structuredClone(init.body) });
      const patches = init.body?.records || [];
      const rows = table === CLIENTS_TABLE ? state.clients : table === STAGING_TABLE ? state.staging : null;
      if (!rows) throw new Error(`unexpected_patch_table:${table}`);
      for (const patch of patches) {
        const row = rows.find((item) => item.id === patch.id);
        if (!row) throw new Error(`missing_patch_record:${patch.id}`);
        row.fields = { ...(row.fields || {}), ...(patch.fields || {}) };
      }
      return { records: patches };
    },
  };
}
