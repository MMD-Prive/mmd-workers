#!/usr/bin/env node

const { AirtableClient } = require("./dry-run-import.js");
const { parseCanonicalLineOfc } = require("./canonical-parser.js");

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

function safeJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function parseGuard(parsed, source) {
  const renamedNameSource = clean(source);
  if (!renamedNameSource || renamedNameSource === "line_renamed_name") return parsed;
  const warnings = [...(parsed.parse_warnings || []), `line_renamed_name_fallback:${source}`];
  const confidenceCap = renamedNameSource === "member_name" ? 0.72 : 0.45;
  return {
    ...parsed,
    parse_confidence: Math.min(parsed.parse_confidence, confidenceCap),
    parse_warnings: Array.from(new Set(warnings)),
  };
}

function hasTokenEvidence(parseJson) {
  return Array.isArray(parseJson.all_member_tokens)
    && Object.prototype.hasOwnProperty.call(parseJson, "chosen_member_since_token")
    && Object.prototype.hasOwnProperty.call(parseJson, "chosen_member_since_strategy")
    && Array.isArray(parseJson.member_since_candidates);
}

function reconstructParse(record) {
  const fields = record.fields || {};
  const rawRow = safeJson(fields.raw_row_json);
  const renamedName = clean(fields.line_renamed_name);
  const displayName = clean(fields.line_display_name);
  const lineTagsRaw = clean(fields.line_tags_raw);
  return parseGuard(parseCanonicalLineOfc({
    nickname: renamedName || displayName,
    line_renamed_name: renamedName || displayName,
    line_display_name: displayName,
    line_user_id: clean(fields.line_user_id),
    tags: lineTagsRaw,
  }), rawRow.line_renamed_name_source);
}

function redactedPlanSample(record, nextParse) {
  const fields = record.fields || {};
  return {
    staging_record_id: record.id ? `${record.id.slice(0, 6)}...${record.id.slice(-4)}` : "",
    import_id: clean(fields.import_id).replace(/(line_ofc_console_).+/i, "$1[redacted]"),
    would_update_fields: ["membership_parse_json", "parsed_member_since", "parsed_member_since_raw"],
    current_member_since_raw: clean(fields.parsed_member_since_raw),
    next_member_since: nextParse.member_since,
    next_member_since_raw: nextParse.member_since_raw,
    all_member_tokens: nextParse.all_member_tokens,
    chosen_member_since_token: nextParse.chosen_member_since_token,
    chosen_member_since_strategy: nextParse.chosen_member_since_strategy,
  };
}

function buildBackfillPlan(records) {
  const stale = [];
  const blocked = [];
  for (const record of records) {
    const fields = record.fields || {};
    const currentParse = safeJson(fields.membership_parse_json);
    if (hasTokenEvidence(currentParse)) continue;
    if (!fields.raw_row_json) {
      blocked.push({ id: record.id, reason: "missing_raw_row_json" });
      continue;
    }
    const nextParse = reconstructParse(record);
    stale.push({ record, nextParse });
  }
  return {
    total_rows_checked: records.length,
    rows_already_hardened: records.length - stale.length - blocked.length,
    rows_needing_backfill: stale.length,
    rows_blocked: blocked.length,
    blocked_reasons: blocked.reduce((acc, item) => {
      acc[item.reason] = (acc[item.reason] || 0) + 1;
      return acc;
    }, {}),
    dry_run_only: true,
    redacted_samples: stale.slice(0, 5).map((item) => redactedPlanSample(item.record, item.nextParse)),
  };
}

async function fetchBatchRows({ batchId, airtable = new AirtableClient() }) {
  return airtable.list(STAGING_TABLE, {
    filterByFormula: `{import_batch_id}="${clean(batchId).replace(/"/g, '\\"')}"`,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.batchId) {
    console.error("Usage: npm run line-ofc:member-token-backfill-plan -- --batch-id <batch_id>");
    process.exitCode = 1;
    return;
  }
  const records = await fetchBatchRows({ batchId: args.batchId });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: "line_ofc_member_token_backfill_plan",
    batch_id: args.batchId,
    ...buildBackfillPlan(records),
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  buildBackfillPlan,
  hasTokenEvidence,
  reconstructParse,
};
