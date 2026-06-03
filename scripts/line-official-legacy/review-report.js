#!/usr/bin/env node

const { AirtableClient } = require("./dry-run-import.js");

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

function selectName(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return clean(value.name || value.value || value.id);
  return clean(value);
}

function safeJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function fieldsOf(record) {
  return record.fields || record.cellValuesByFieldId || record;
}

function value(fields, name, fieldId) {
  return fields[name] ?? fields[fieldId];
}

function normalizeRow(record) {
  const fields = fieldsOf(record);
  const membershipParse = safeJson(value(fields, "membership_parse_json", "fld9UIM1ldUmS1C9s"));
  const proposedEntitlement = safeJson(value(fields, "proposed_entitlement_json", "fldzKw53nu4Y9LUOc"));
  return {
    id: record.id || "",
    import_id: clean(value(fields, "import_id", "fld4WvEkUiPipY3Qd")),
    import_batch_id: clean(value(fields, "import_batch_id", "fldAS82UT6oQAP691")),
    review_status: selectName(value(fields, "review_status", "fldv0NAa6o6heJsQZ")),
    match_type: selectName(value(fields, "match_type", "fldxYb9vQhguNd4VD")),
    match_confidence: Number(value(fields, "match_confidence", "fld1yf8uzcfPDwJud") || 0),
    parsed_client_level: selectName(value(fields, "parsed_client_level", "fldGMB64f5L3A4dUL")) || membershipParse.client_level || "unknown",
    parsed_membership_status: selectName(value(fields, "parsed_membership_status", "fld5vhO0UUQ2KKBS6")) || membershipParse.membership_status || "none",
    parsed_membership_tier: selectName(value(fields, "parsed_membership_tier", "flduz31xE0hpPQ9Au")) || membershipParse.membership_tier || "none",
    parsed_membership_package: selectName(value(fields, "parsed_membership_package", "fldfQse3D2pBpSMPv")) || membershipParse.membership_package || "none",
    membership_parse_json: membershipParse,
    proposed_entitlement_json: proposedEntitlement,
    error_message: clean(value(fields, "error_message", "fldM4rIADr6ewhdep")),
    points_review_required: clean(value(fields, "points_review_required", "fldJ2fwB1znlO9Zaj")),
    points_parse_warnings: safeJson(value(fields, "points_parse_warnings", "fldRlbvzmds1zJeSe")),
  };
}

function isPotentiallyReadyAfterManualReview(row) {
  if (row.error_message) return false;
  if (row.review_status !== "ready_to_review") return false;
  if (!row.match_type.startsWith("exact_")) return false;
  return true;
}

function isNeverCommittableWithoutReview(row) {
  return row.review_status === "review_required"
    || row.review_status === "staging_only"
    || row.match_type === "multiple_candidates"
    || row.match_type === "no_match";
}

function countBy(rows, fn) {
  return rows.reduce((acc, row) => {
    const key = fn(row) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function redactImportId(importId) {
  const raw = clean(importId);
  if (!raw) return "";
  if (/draft|memreq|bkreq|img|renewal|price/.test(raw)) return raw.replace(/(line_ofc_console_)[a-z0-9_:-]+/i, "$1[redacted]");
  return raw.replace(/(line_ofc_console_)[a-z]+_[0-9]+/i, "$1[redacted]");
}

function redactedSample(row) {
  return {
    staging_record_id: row.id ? `${row.id.slice(0, 6)}...${row.id.slice(-4)}` : "",
    import_id: redactImportId(row.import_id),
    match_type: row.match_type,
    review_status: row.review_status,
    match_confidence: row.match_confidence,
    parsed_membership_status: row.parsed_membership_status,
    parsed_client_level: row.parsed_client_level,
    parsed_membership_tier: row.parsed_membership_tier,
    parsed_membership_package: row.parsed_membership_package,
    member_since: row.membership_parse_json.member_since || "",
    all_member_tokens: row.membership_parse_json.all_member_tokens || [],
    chosen_member_since_token: row.membership_parse_json.chosen_member_since_token || "",
    chosen_member_since_strategy: row.membership_parse_json.chosen_member_since_strategy || "",
    proposed_entitlement_source: row.proposed_entitlement_json.source || "",
    proposed_entitlement_review_required: Boolean(row.proposed_entitlement_json.review_required),
  };
}

function summarizeRows(records) {
  const rows = records.map(normalizeRow);
  const reviewRequired = rows.filter((row) => row.review_status === "review_required");
  const multipleMatch = rows.filter((row) => row.match_type === "multiple_candidates" && row.review_status === "review_required");
  const noMatch = rows.filter((row) => row.match_type === "no_match" && row.review_status === "staging_only");
  const memberVipPremium = rows.filter((row) => (
    row.parsed_membership_status === "member"
    && (row.parsed_client_level === "vip" || row.parsed_membership_tier === "vip")
    && row.parsed_membership_tier === "vip"
    && row.parsed_membership_package === "premium"
  ));
  const potentiallyReady = rows.filter(isPotentiallyReadyAfterManualReview);
  const neverCommittableWithoutReview = rows.filter(isNeverCommittableWithoutReview);
  return {
    total_staging_rows: rows.length,
    review_required_rows: reviewRequired.length,
    multiple_match_review_rows: multipleMatch.length,
    member_vip_premium_rows: memberVipPremium.length,
    no_match_rows: noMatch.length,
    rows_unsafe_to_commit_now: rows.length,
    rows_never_committable_without_review: neverCommittableWithoutReview.length,
    rows_potentially_ready_after_manual_review: potentiallyReady.length,
    counts: {
      review_status: countBy(rows, (row) => row.review_status),
      match_type: countBy(rows, (row) => row.match_type),
      membership_status: countBy(rows, (row) => row.parsed_membership_status),
      client_level: countBy(rows, (row) => row.parsed_client_level),
      membership_tier: countBy(rows, (row) => row.parsed_membership_tier),
      membership_package: countBy(rows, (row) => row.parsed_membership_package),
    },
    queues: {
      review_required: reviewRequired.length,
      multiple_match: multipleMatch.length,
      member_vip_premium_evidence: memberVipPremium.length,
      no_match_staging: noMatch.length,
      ready_to_commit_after_reviewer_resolution: potentiallyReady.length,
    },
    reason_summary: {
      review_required_by_match_type: countBy(reviewRequired, (row) => row.match_type),
      no_match_by_import_kind: countBy(noMatch, (row) => row.import_id.split("_").slice(3, 4)[0] || "unknown"),
    },
    redacted_samples: {
      review_required: reviewRequired.slice(0, 3).map(redactedSample),
      multiple_match: multipleMatch.slice(0, 3).map(redactedSample),
      member_vip_premium: memberVipPremium.slice(0, 3).map(redactedSample),
      no_match: noMatch.slice(0, 3).map(redactedSample),
      potentially_ready_after_manual_review: potentiallyReady.slice(0, 3).map(redactedSample),
    },
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
    console.error("Usage: npm run line-ofc:review-report -- --batch-id <batch_id>");
    process.exitCode = 1;
    return;
  }
  const records = await fetchBatchRows({ batchId: args.batchId });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: "line_ofc_review_report",
    batch_id: args.batchId,
    ...summarizeRows(records),
  }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  isNeverCommittableWithoutReview,
  isPotentiallyReadyAfterManualReview,
  normalizeRow,
  summarizeRows,
};
