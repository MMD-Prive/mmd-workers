#!/usr/bin/env node

const { AirtableClient } = require("./dry-run-import.js");
const {
  HISTORY_REVIEWS_TABLE,
  assertIdentityCommitGate,
  defaultHistoryReviewId,
  parseHistoricalDate,
} = require("./history-materializer.js");

const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function formulaString(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(clean(value));
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const out = { apply: false, allCommitted: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--import-id") out.importId = argv[index + 1];
    if (arg === "--batch-id") out.batchId = argv[index + 1];
    if (arg === "--all-committed") out.allCommitted = true;
    if (arg === "--apply") out.apply = true;
  }
  return out;
}

function serviceEvents(fields) {
  const history = parseJson(fields.historical_events_json, {});
  const amounts = Array.isArray(history.amounts) ? history.amounts : [];
  return amounts.filter((event) => clean(event?.type).toLowerCase() === "service" && Number(event?.amount) > 0);
}

function serviceDetails(fields) {
  const history = parseJson(fields.historical_events_json, {});
  const details = history?.service_details;
  return details && typeof details === "object" && !Array.isArray(details) ? details : {};
}

function dates(fields) {
  const history = parseJson(fields.historical_events_json, {});
  return [...new Set((Array.isArray(history.dates) ? history.dates : []).map(clean).filter(Boolean))];
}

function refs(fields) {
  const history = parseJson(fields.historical_events_json, {});
  return [...new Set((Array.isArray(history.payment_refs) ? history.payment_refs : []).map(clean).filter(Boolean))];
}

function bounded(value, max = 120) {
  return clean(value).slice(0, max);
}

function buildReviewCandidate(staging) {
  const fields = staging.fields || {};
  const identity = assertIdentityCommitGate(fields);
  const events = serviceEvents(fields);
  const details = serviceDetails(fields);
  const detectedDates = dates(fields);
  const paymentRefs = refs(fields);
  const reconciledAmount = Number(fields.reconciled_service_amount || 0);
  const singleAmount = events.length === 1 ? Number(events[0].amount || 0) : 0;
  const candidateAmount = reconciledAmount > 0 ? reconciledAmount : singleAmount > 0 ? singleAmount : Number(fields.service_amount || 0);
  const parsedDate = detectedDates.length === 1 ? parseHistoricalDate(detectedDates[0]) : "";
  const warnings = parseJson(fields.points_parse_warnings, []);
  const candidatePointsAmount = Number(fields.points_eligible_amount || 0);
  const historyReviewId = defaultHistoryReviewId(fields.import_id);
  const duration = Number(details.duration_minutes || 0);

  return {
    historyReviewId,
    fields: {
      history_review_id: historyReviewId,
      "LINE OFC Import Row": [staging.id],
      Client: [identity.clientId],
      review_status: "pending",
      decision: "hold_for_review",
      points_review_status: "pending",
      ...(parsedDate ? { candidate_service_date: parsedDate.slice(0, 10) } : {}),
      ...(candidateAmount > 0 ? { candidate_service_amount_thb: Math.round(candidateAmount * 100) / 100 } : {}),
      ...(paymentRefs.length === 1 ? { candidate_payment_ref: paymentRefs[0] } : {}),
      ...(candidatePointsAmount > 0 ? { candidate_points_eligible_amount_thb: Math.round(candidatePointsAmount * 100) / 100 } : {}),
      ...(bounded(details.model_text, 100) ? { candidate_model_text: bounded(details.model_text, 100) } : {}),
      ...(bounded(details.start_time, 10) ? { candidate_start_time: bounded(details.start_time, 10) } : {}),
      ...(bounded(details.end_time, 10) ? { candidate_end_time: bounded(details.end_time, 10) } : {}),
      ...(bounded(details.location_text, 120) ? { candidate_location_text: bounded(details.location_text, 120) } : {}),
      ...(bounded(details.area_text, 80) ? { candidate_area_text: bounded(details.area_text, 80) } : {}),
      ...(bounded(details.service_type, 80) ? { candidate_service_type: bounded(details.service_type, 80) } : {}),
      ...(duration > 0 ? { candidate_duration_minutes: Math.round(duration) } : {}),
      evidence_summary: [
        `import_id=${clean(fields.import_id)}`,
        `rename_present=${Boolean(clean(fields.line_renamed_name))}`,
        `service_events=${events.length}`,
        `dates=${detectedDates.length}`,
        `payment_refs=${paymentRefs.length}`,
        `model_candidates=${Array.isArray(details.model_candidates) ? details.model_candidates.length : 0}`,
        `time_candidates=${Array.isArray(details.time_candidates) ? details.time_candidates.length : 0}`,
        `location_candidates=${Array.isArray(details.location_candidates) ? details.location_candidates.length : 0}`,
        `service_type_candidates=${Array.isArray(details.service_type_candidates) ? details.service_type_candidates.length : 0}`,
        `reconciliation_basis=${clean(fields.reconciliation_basis) || "none"}`,
        `historical_service_status=${clean(fields.historical_service_status) || "unknown"}`,
        `points_review_required=${clean(fields.points_review_required) || "false"}`,
        `warnings=${Array.isArray(warnings) ? warnings.length : 0}`,
      ].join("\n"),
      review_note: "Pending explicit human review. Candidate date/time/model/service/location/amount fields are evidence only; copy only verified values into approved fields after checking LINE OFC source context.",
    },
  };
}

async function loadStagingRows({ airtable, importId = "", batchId = "", allCommitted = false }) {
  if (clean(importId)) {
    const row = await airtable.findOne(STAGING_TABLE, `{import_id}=${formulaString(importId)}`);
    return row?.id ? [row] : [];
  }
  if (clean(batchId)) return airtable.list(STAGING_TABLE, { filterByFormula: `{import_batch_id}=${formulaString(batchId)}` });
  if (allCommitted) return airtable.list(STAGING_TABLE, { filterByFormula: `{review_status}=${formulaString("committed")}` });
  throw new Error("HISTORY_REVIEW_QUEUE_SCOPE_REQUIRED");
}

async function createPendingIfMissing(airtable, candidate) {
  const existing = await airtable.findOne(HISTORY_REVIEWS_TABLE, `{history_review_id}=${formulaString(candidate.historyReviewId)}`);
  if (existing?.id) return { history_review_id: candidate.historyReviewId, duplicate: true, record_id: existing.id };
  const created = await airtable.requestWithFieldFallback(HISTORY_REVIEWS_TABLE, {
    method: "POST",
    body: { fields: candidate.fields },
  });
  return { history_review_id: candidate.historyReviewId, duplicate: false, record_id: created?.id || "" };
}

async function prepareHistoryReviewQueue({ importId = "", batchId = "", allCommitted = false, apply = false, airtable = new AirtableClient() } = {}) {
  const rows = await loadStagingRows({ airtable, importId, batchId, allCommitted });
  const candidates = [];
  const blocked = [];

  for (const row of rows) {
    try {
      candidates.push(buildReviewCandidate(row));
    } catch (error) {
      blocked.push({ import_id: clean(row?.fields?.import_id), error: String(error?.code || error?.message || error) });
    }
  }

  if (!apply) {
    return {
      ok: true,
      dry_run: true,
      scanned: rows.length,
      ready_for_review_queue: candidates.length,
      blocked,
      candidates: candidates.map((item) => ({ history_review_id: item.historyReviewId, fields: item.fields })),
      truth_writes: false,
    };
  }

  const results = [];
  for (const candidate of candidates) results.push(await createPendingIfMissing(airtable, candidate));
  return {
    ok: true,
    dry_run: false,
    scanned: rows.length,
    queued: results.length,
    blocked,
    results,
    writes: ["MMD — Customer History Reviews"],
    truth_writes: false,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.importId && !args.batchId && !args.allCommitted) {
    console.error("Usage: node scripts/line-official-legacy/history-review-queue.js (--import-id <id> | --batch-id <id> | --all-committed) [--apply]");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await prepareHistoryReviewQueue(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, error: String(error?.code || error?.message || error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { buildReviewCandidate, parseArgs, prepareHistoryReviewQueue };
