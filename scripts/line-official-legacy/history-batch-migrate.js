#!/usr/bin/env node

const { AirtableClient } = require("./dry-run-import.js");
const { materializeHistoricalRecord } = require("./history-materializer.js");

const HISTORY_REVIEWS_TABLE = process.env.AIRTABLE_HISTORY_REVIEWS_TABLE_ID || "tblnpDFQMpo8AmNQv";
const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";
const BATCH_SCHEMA = "history_batch_migration_v1";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function selectName(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return clean(value.name || value.value || value.id);
  return clean(value);
}

function linkedIds(value) {
  return (Array.isArray(value) ? value : []).map((item) => clean(item?.id || item)).filter(Boolean);
}

function formulaString(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseArgs(argv) {
  const out = { apply: false, limit: DEFAULT_LIMIT, afterHistoryReviewId: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") out.apply = true;
    if (arg === "--limit") out.limit = Number(argv[index + 1]);
    if (arg === "--after-history-review-id") out.afterHistoryReviewId = argv[index + 1];
  }
  out.limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(out.limit) || DEFAULT_LIMIT)));
  return out;
}

function isApprovedReview(fields = {}) {
  return selectName(fields.review_status).toLowerCase() === "approved" &&
    selectName(fields.decision).toLowerCase() === "approve_service_history";
}

function classifyError(error) {
  const code = clean(error?.code || error?.message || error);
  if (code.includes("HISTORY_POINTS_OUT_OF_ORDER_REBUILD_REQUIRED")) return "wallet_rebuild_required";
  if (code.includes("HISTORY_PAYMENT_COVERAGE_INCOMPLETE") || code.includes("HISTORY_EXPLICIT_PAYMENT_DECISION_REQUIRED") || code.includes("HISTORY_HISTORICAL_PAYMENT_NOT_APPROVED")) return "payment_evidence_incomplete";
  if (code.includes("HISTORY_POINTS_CANONICAL_MEMBER_ID_REQUIRED")) return "member_wallet_required";
  if (code.includes("HISTORY_CANONICAL_CLIENT") || code.includes("HISTORY_IDENTITY")) return "identity_review_required";
  return "review_required";
}

async function loadApprovedReviews(airtable) {
  const rows = await airtable.list(HISTORY_REVIEWS_TABLE, { maxRecords: "1000" });
  return rows
    .filter((row) => isApprovedReview(row.fields || {}))
    .sort((a, b) => clean(a.fields?.history_review_id).localeCompare(clean(b.fields?.history_review_id)));
}

async function resolveImportId(airtable, review) {
  const stagingIds = linkedIds(review?.fields?.["LINE OFC Import Row"]);
  if (stagingIds.length !== 1) throw coded("HISTORY_BATCH_STAGING_LINK_REQUIRED");
  const rows = await airtable.list(STAGING_TABLE, {
    filterByFormula: `RECORD_ID()=${formulaString(stagingIds[0])}`,
    maxRecords: "2",
  });
  if (rows.length !== 1) throw coded("HISTORY_BATCH_STAGING_ROW_NOT_UNIQUE");
  const importId = clean(rows[0]?.fields?.import_id);
  if (!importId) throw coded("HISTORY_BATCH_IMPORT_ID_REQUIRED");
  return importId;
}

async function runHistoryBatchMigration({
  apply = false,
  limit = DEFAULT_LIMIT,
  afterHistoryReviewId = "",
  airtable = new AirtableClient(),
  materialize = materializeHistoricalRecord,
} = {}) {
  const boundedLimit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(limit) || DEFAULT_LIMIT)));
  const approved = await loadApprovedReviews(airtable);
  const remaining = approved.filter((row) => clean(row.fields?.history_review_id) > clean(afterHistoryReviewId));
  const batch = remaining.slice(0, boundedLimit);
  const results = [];

  for (const review of batch) {
    const historyReviewId = clean(review.fields?.history_review_id);
    try {
      const importId = await resolveImportId(airtable, review);
      const result = await materialize({ importId, historyReviewId, apply, airtable });
      results.push({
        history_review_id: historyReviewId,
        import_id: importId,
        status: apply ? "materialized" : "dry_run_ready",
        ok: true,
        result,
      });
    } catch (error) {
      results.push({
        history_review_id: historyReviewId,
        status: classifyError(error),
        ok: false,
        error: clean(error?.code || error?.message || error),
      });
    }
  }

  const processed = batch.length;
  const next = remaining.length > processed ? clean(batch.at(-1)?.fields?.history_review_id) : "";
  return {
    ok: results.every((item) => item.ok),
    schema: BATCH_SCHEMA,
    dry_run: !apply,
    approved_reviews_seen: approved.length,
    processed,
    succeeded: results.filter((item) => item.ok).length,
    blocked: results.filter((item) => !item.ok).length,
    next_after_history_review_id: next,
    results,
    safety: {
      auto_approval: false,
      approved_reviews_only: true,
      bounded_limit: boundedLimit,
      entitlement_write: false,
    },
  };
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = await runHistoryBatchMigration(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, schema: BATCH_SCHEMA, error: clean(error?.code || error?.message || error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  BATCH_SCHEMA,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  classifyError,
  isApprovedReview,
  parseArgs,
  resolveImportId,
  runHistoryBatchMigration,
};