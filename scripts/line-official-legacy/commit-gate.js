#!/usr/bin/env node

const { AirtableClient } = require("./dry-run-import.js");
const { summarizeRows } = require("./review-report.js");

const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--batch-id") out.batchId = argv[index + 1];
  }
  return out;
}

function encodeFormulaValue(value) {
  return clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function duplicateImportIdCount(records) {
  const counts = new Map();
  for (const record of records) {
    const importId = clean(record.fields?.import_id || record.import_id);
    if (!importId) continue;
    counts.set(importId, (counts.get(importId) || 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).length;
}

async function fetchBatchRows({ batchId, airtable }) {
  return airtable.list(STAGING_TABLE, {
    filterByFormula: `{import_batch_id}="${encodeFormulaValue(batchId)}"`,
  });
}

function evaluateCommitGate(records) {
  const summary = summarizeRows(records);
  const duplicateCount = duplicateImportIdCount(records);
  const blockers = {
    unsafe_to_commit: summary.rows_unsafe_to_commit_now,
    review_required: summary.review_required_rows,
    multiple_match_review: summary.multiple_match_review_rows,
    duplicate_staging_import_ids: duplicateCount,
  };
  const ok = Object.values(blockers).every((value) => value === 0);
  return {
    ok,
    mode: "line_ofc_commit_gate",
    hard_gate: blockers,
    message: ok
      ? "Commit gate passed. No commit implementation is executed by this staging gate."
      : "Commit refused. Resolve all staging blockers before any Clients or Member Entitlements write path can run.",
    summary,
  };
}

async function runCommitGate({ batchId, airtable = new AirtableClient() }) {
  if (!batchId) throw new Error("missing_batch_id");
  const records = await fetchBatchRows({ batchId, airtable });
  return evaluateCommitGate(records);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.batchId) {
    console.error("Usage: npm run line-ofc:commit -- --batch-id <batch_id>");
    process.exitCode = 1;
    return;
  }
  const result = await runCommitGate({ batchId: args.batchId });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  duplicateImportIdCount,
  evaluateCommitGate,
  runCommitGate,
};
