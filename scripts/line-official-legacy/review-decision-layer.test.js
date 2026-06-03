const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { evaluateCommitGate } = require("./commit-gate.js");
const {
  ALLOWED_FIELDS,
  normalizeDecision,
  parseArgs,
  patchReviewDecisions,
} = require("./patch-review-decisions.js");

function tempJson(payload) {
  const file = path.join(os.tmpdir(), `line-ofc-decisions-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  return file;
}

test("review decision dry-run plans staging patches only", async () => {
  const file = tempJson({
    decisions: [
      {
        import_id: "line_ofc_console_review_1",
        review_decision: "link_existing_client",
        reviewed_by: "Per",
        reviewed_at: "2026-06-02T00:00:00.000Z",
        review_note: "matched manually",
        matched_client_id: "recClient1",
      },
    ],
  });
  const calls = [];
  const airtable = {
    findOne: async (table, formula) => {
      calls.push({ action: "findOne", table, formula });
      return { id: "recStage1", fields: { import_id: "line_ofc_console_review_1" } };
    },
    requestBatchWithFieldFallback: async (table, init) => {
      calls.push({ action: "requestBatchWithFieldFallback", table, init });
      return { records: [] };
    },
  };

  const result = await patchReviewDecisions({ file, airtable });
  assert.equal(result.dry_run, true);
  assert.equal(result.staging_table_only, true);
  assert.equal(result.planned_count, 1);
  assert.equal(result.planned[0].table, "tbl1u0foFBvgFpT9G");
  assert.equal(result.planned[0].fields.decision_source, "manual_review");
  assert.equal(result.planned[0].fields.decision, "link_existing_client");
  assert.equal(Object.prototype.hasOwnProperty.call(result.planned[0].fields, "review_decision"), false);
  assert.equal(calls.every((call) => call.table === "tbl1u0foFBvgFpT9G"), true);
  assert.equal(calls.some((call) => call.action === "requestBatchWithFieldFallback"), false);
});

test("review decision apply patches only staging decision fields", async () => {
  const file = tempJson([
    {
      import_id: "line_ofc_console_review_2",
      review_decision: "needs_human",
      reviewed_by: "Per",
      review_note: "ambiguous",
    },
  ]);
  const calls = [];
  const airtable = {
    findOne: async (table, formula) => {
      calls.push({ action: "findOne", table, formula });
      return { id: "recStage2", fields: { import_id: "line_ofc_console_review_2" } };
    },
    request: async (table, init) => {
      calls.push({ action: "request", table, init });
      return { records: [{ id: "recStage2", fields: init.body.records[0].fields }] };
    },
  };

  const result = await patchReviewDecisions({ file, apply: true, airtable });
  const patchCall = calls.find((call) => call.action === "request");
  assert.equal(result.dry_run, false);
  assert.equal(result.patched_count, 1);
  assert.equal(patchCall.table, "tbl1u0foFBvgFpT9G");
  assert.equal(patchCall.init.method, "PATCH");
  assert.deepEqual(Object.keys(patchCall.init.body.records[0].fields).sort(), [
    "decision",
    "decision_source",
    "matched_client_id",
    "review_note",
    "reviewed_at",
    "reviewed_by",
  ]);
});

test("review decision apply fails closed when Airtable schema fields are missing", async () => {
  const file = tempJson([
    {
      import_id: "line_ofc_console_review_schema",
      decision: "needs_human",
      reviewed_by: "Per",
    },
  ]);
  const calls = [];
  const airtable = {
    findOne: async (table, formula) => {
      calls.push({ action: "findOne", table, formula });
      return { id: "recStageSchema", fields: { import_id: "line_ofc_console_review_schema" } };
    },
    request: async (table, init) => {
      calls.push({ action: "request", table, init });
      const error = new Error("airtable_request_failed:422");
      error.detail = { error: { type: "UNKNOWN_FIELD_NAME", message: 'Unknown field name: "decision"' } };
      throw error;
    },
  };

  await assert.rejects(
    () => patchReviewDecisions({ file, apply: true, airtable }),
    /airtable_request_failed:422/,
  );
  assert.equal(calls.filter((call) => call.action === "request").length, 1);
});

test("review decision layer accepts requested input alias and decision field", () => {
  assert.deepEqual(ALLOWED_FIELDS, [
    "decision",
    "reviewed_by",
    "reviewed_at",
    "review_note",
    "matched_client_id",
    "decision_source",
  ]);
  assert.deepEqual(parseArgs(["--input", "decisions.json"]), { apply: false, file: "decisions.json" });
  assert.deepEqual(parseArgs(["--file", "decisions.json"]), { apply: false, file: "decisions.json" });
  const normalized = normalizeDecision({
    import_id: "line_ofc_console_review_3",
    decision: "do_not_import",
    reviewed_by: "Per",
  });
  assert.equal(normalized.fields.decision, "do_not_import");
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.fields, "review_decision"), false);
});

test("commit refuses when unsafe_to_commit is greater than zero", () => {
  const result = evaluateCommitGate([
    {
      id: "recUnsafe",
      fields: {
        import_id: "line_ofc_console_unsafe",
        import_batch_id: "batch_commit",
        review_status: "staging_only",
        match_type: "no_match",
        membership_parse_json: JSON.stringify({ membership_status: "none" }),
        proposed_entitlement_json: JSON.stringify({ source: "line_ofc", review_required: true }),
      },
    },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.hard_gate.unsafe_to_commit, 1);
  assert.match(result.message, /Commit refused/);
});

test("review and dry-run scripts contain no Member Entitlements write path", () => {
  const scriptDir = __dirname;
  const files = [
    "dry-run-import.js",
    "review-page.js",
    "patch-review-decisions.js",
    "commit-gate.js",
  ];
  for (const file of files) {
    const content = fs.readFileSync(path.join(scriptDir, file), "utf8");
    assert.equal(content.includes("tblNImdF9PKAxhXGi"), false, file);
    assert.equal(/Member Entitlements[^\\n]*(PATCH|POST|DELETE)/i.test(content), false, file);
  }
});
