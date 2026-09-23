#!/usr/bin/env node
"use strict";

// Batch-commits every LINE OFC Client Import Staging row that has already
// passed manual review (decision=link_existing_client,
// decision_source=manual_review, reviewed_by/reviewed_at present) and is not
// yet committed. This deliberately does NOT filter on a single literal
// review_status value: the staging table's review_status choices have drifted
// across the tools that write it over time (line-ofc-client-import.js only
// ever writes "committed" / "review_required" / "new"; review-report.js
// reports against "ready_to_review"; the commit adapter itself tolerates
// "review_required", "ready_to_commit", or "committed"). Picking one literal
// string here would silently under-match real reviewed rows. Instead this
// queries the same decision/decision_source signal the commit adapter's own
// assertReviewedLink() already treats as authoritative, and lets that
// function do the real (stricter) per-row validation.
//
// Why this exists (see docs/architecture/LINE_CANONICAL_IDENTITY_COMMIT_ADAPTER_V1.md
// and scripts/line-official-legacy/canonical-identity-commit-adapter.js):
// the safe, fully-tested per-row commit contract already exists
// (commitCanonicalIdentity), but in production nothing ever calls it except a
// human running the CLI by hand, once per row:
//
//   node scripts/line-official-legacy/canonical-identity-commit-adapter.js \
//     --import-id <id> --apply
//
// A reviewed, ready-to-commit LINE<->Client link can therefore sit
// unmaterialized indefinitely. Until it is committed, Clients.line_user_id
// stays empty for that customer, so every first login keeps falling through
// to LINE-OFC-only (unlinked) recovery, and a manual reconnect attempt keeps
// landing on the /member/api/liff/recovery email-entry flow -- instead of
// resolving instantly through the identity link a human already approved.
//
// This script closes that specific gap without any Airtable schema change,
// without a new table, and without weakening the review requirement: it
// only calls the existing, already-tested commitCanonicalIdentity() contract
// in bulk, and only against rows a human has ALREADY marked
// ready_to_commit (decision=link_existing_client, decision_source=
// manual_review, reviewed_by/reviewed_at present -- enforced by
// commitCanonicalIdentity itself, not re-implemented here).
//
// Re-running is always safe: commitCanonicalIdentity() is a no-op for
// anything already committed, so each run is purely incremental over
// whatever newly reached ready_to_commit since the last run.

const fs = require("node:fs");
const assert = require("node:assert/strict");
const {
  STAGING_TABLE,
  LINK_EXISTING_CLIENT,
  MANUAL_REVIEW_SOURCE,
  COMMITTED_REVIEW_STATUS,
  commitCanonicalIdentity,
} = require("./canonical-identity-commit-adapter.js");
const { AirtableClient } = require("./dry-run-import.js");

const DEFAULT_MAX_ROWS = 500;
// Mirrors assertReviewedLink()'s own eligibility signal: a human recorded a
// decision to link an existing Client, from manual review, and the row has
// not already been committed. Any row this query returns that still fails
// assertReviewedLink()'s stricter checks (bad timestamp, ambiguous link,
// etc.) is reported in `failures`, not silently skipped.
const REVIEWABLE_FILTER = `AND({decision}="${LINK_EXISTING_CLIENT}",{decision_source}="${MANUAL_REVIEW_SOURCE}",{review_status}!="${COMMITTED_REVIEW_STATUS}")`;

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function maxRows() {
  const configured = Number(process.env.CANONICAL_IDENTITY_BATCH_MAX_ROWS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_ROWS;
}

async function listReadyImportIds(airtable, limit) {
  const rows = await airtable.list(STAGING_TABLE, {
    filterByFormula: REVIEWABLE_FILTER,
    maxRecords: String(limit),
  });
  const importIds = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const importId = clean(row?.fields?.import_id);
    if (!importId || seen.has(importId)) continue;
    seen.add(importId);
    importIds.push(importId);
  }
  return importIds;
}

async function run({
  apply = false,
  reportPath = "",
  assertIdempotent = false,
  airtable = new AirtableClient(),
  now = new Date().toISOString(),
} = {}) {
  const importIds = await listReadyImportIds(airtable, maxRows());
  const committed = [];
  const alreadyCommitted = [];
  const failed = [];

  for (const importId of importIds) {
    try {
      // eslint-disable-next-line no-await-in-loop -- each row is a small,
      // independent, fail-closed Airtable read/patch; sequential keeps the
      // audit trail (committed_by/committed_at) unambiguous per row and
      // avoids concurrent writes to the same Client record across rows.
      const result = await commitCanonicalIdentity({ importId, apply, airtable, now });
      if (result.already_committed) alreadyCommitted.push(importId);
      else committed.push(importId);
    } catch (error) {
      failed.push({
        import_id_tail: importId.slice(-8),
        error: String(error?.code || error?.message || error),
      });
    }
  }

  const report = {
    version: "canonical-identity-batch-commit-v1",
    mode: apply ? "apply" : "dry_run",
    candidates_found: importIds.length,
    newly_committed: committed.length,
    already_committed: alreadyCommitted.length,
    failed: failed.length,
    failures: failed.slice(0, 50),
    // Rows that were read successfully and are NOT yet committed. On a
    // dry-run this is "how many would be committed"; on a fresh apply run
    // it is normally 0 because commitCanonicalIdentity() just committed
    // them. A permanently-blocked row (ambiguous email, conflicting
    // review, etc.) lands in `failed`, not here, since no bulk re-run can
    // fix it without a human -- it must never make this assertion flap.
    pending_mutations: committed.length,
    completed_at: new Date().toISOString(),
  };

  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report) + "\n");
  if (assertIdempotent && report.pending_mutations !== 0) {
    throw new Error(`idempotency_failed:${report.pending_mutations}`);
  }
  return report;
}

function selfTest() {
  const rows = [
    { fields: { import_id: "line_ofc_console_line_a" } },
    { fields: { import_id: "line_ofc_console_line_b" } },
    { fields: { import_id: "line_ofc_console_line_a" } }, // duplicate, must dedupe
    { fields: { import_id: "" } }, // blank, must be skipped
    { fields: {} }, // missing import_id, must be skipped
  ];
  const fakeAirtable = {
    async list(table, query) {
      assert.equal(table, STAGING_TABLE);
      assert.equal(query.filterByFormula, REVIEWABLE_FILTER);
      return rows;
    },
  };
  return listReadyImportIds(fakeAirtable, 500).then((ids) => {
    assert.deepEqual(ids, ["line_ofc_console_line_a", "line_ofc_console_line_b"]);
    process.stdout.write("self-test passed\n");
  });
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    selfTest().catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
  } else {
    const apply = args.includes("--apply");
    const reportIndex = args.indexOf("--report");
    run({
      apply,
      reportPath: reportIndex >= 0 ? args[reportIndex + 1] : "",
      assertIdempotent: args.includes("--assert-idempotent"),
    }).catch((error) => {
      console.error(error?.stack || error);
      process.exitCode = 1;
    });
  }
}

module.exports = {
  REVIEWABLE_FILTER,
  listReadyImportIds,
  run,
};
