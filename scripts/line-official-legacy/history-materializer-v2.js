#!/usr/bin/env node

const { AirtableClient } = require("./dry-run-import.js");
const {
  HISTORY_REVIEWS_TABLE,
  defaultHistoryReviewId,
  materializeHistoricalRecord,
} = require("./history-materializer.js");
const { durationMinutes, normalizeClock } = require("./historical-note-parser.js");
const { resolveModelLabelsFromAirtable } = require("./model-identity-resolver.js");

const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX";
const MATERIALIZER = "history_materializer_v2_service_detail";

function clean(value) { return String(value == null ? "" : value).trim(); }
function formulaString(value) { return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
function money(value) { if (value === null || value === undefined || value === "") return null; const number = Number(value); return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null; }

function approvedSessionDetail(fields = {}) {
  const modelText = clean(fields.approved_model_text).slice(0, 160);
  const startTime = normalizeClock(fields.approved_start_time);
  const endTime = normalizeClock(fields.approved_end_time);
  const locationText = clean(fields.approved_location_text).slice(0, 180);
  const serviceType = clean(fields.approved_service_type).slice(0, 100);
  const serviceAmount = money(fields.approved_service_amount_thb);
  const approvedMinutes = Number(fields.approved_duration_minutes || 0);
  const minutes = Number.isFinite(approvedMinutes) && approvedMinutes > 0 ? approvedMinutes : durationMinutes(startTime, endTime);
  return {
    ...(modelText ? { model_name: modelText, "Assigned Model": modelText } : {}),
    ...(startTime ? { start_time: startTime } : {}),
    ...(endTime ? { end_time: endTime } : {}),
    ...(locationText ? { location_name: locationText } : {}),
    ...(serviceType ? { job_type: serviceType, session_type_raw: serviceType } : {}),
    ...(serviceAmount !== null ? { "Total Amount": serviceAmount, amount_thb: serviceAmount } : {}),
    ...(minutes > 0 ? { duration_hours: Math.round((minutes / 60) * 100) / 100 } : {}),
  };
}

async function findHistoryReview(airtable, historyReviewId) { return airtable.findOne(HISTORY_REVIEWS_TABLE, `{history_review_id}=${formulaString(historyReviewId)}`); }
async function findSession(airtable, sessionId) { return airtable.findOne(SESSIONS_TABLE, `{session_id}=${formulaString(sessionId)}`); }

function safeModelResolution(resolution = {}) {
  return {
    status: clean(resolution.status), raw_text: clean(resolution.raw_text), confidence: Number(resolution.confidence || 0),
    model_ids: Array.isArray(resolution.model_ids) ? resolution.model_ids : [],
    resolutions: (Array.isArray(resolution.resolutions) ? resolution.resolutions : []).map((item) => ({
      status: clean(item.status), raw_label: clean(item.raw_label), confidence: Number(item.confidence || 0), method: clean(item.method),
      model_id: clean(item.model_id), suggested_model_id: clean(item.suggested_model_id), suggested_alias: clean(item.suggested_alias),
    })),
  };
}

async function materializeHistoricalRecordV2({ importId, historyReviewId = "", apply = false, airtable = new AirtableClient(), resolver, now } = {}) {
  const resolvedReviewId = clean(historyReviewId) || defaultHistoryReviewId(importId);
  const review = await findHistoryReview(airtable, resolvedReviewId);
  if (!review?.id) { const error = new Error("HISTORY_EXPLICIT_REVIEW_NOT_FOUND"); error.code = "HISTORY_EXPLICIT_REVIEW_NOT_FOUND"; throw error; }

  const detail = approvedSessionDetail(review.fields || {});
  const modelResolution = detail.model_name ? await resolveModelLabelsFromAirtable(airtable, detail.model_name) : { status: "missing", raw_text: "", model_ids: [], resolutions: [], confidence: 0 };
  const canonicalModelPatch = modelResolution.status === "matched" && modelResolution.model_ids.length ? { "Canonical Model": modelResolution.model_ids } : {};
  const enrichedDetail = { ...detail, ...canonicalModelPatch };

  const base = await materializeHistoricalRecord({ importId, historyReviewId: resolvedReviewId, apply: false, airtable, ...(resolver ? { resolver } : {}), ...(now ? { now } : {}) });
  const sessionId = clean(base?.plan?.writes?.session?.session_id);
  const enrichedSessionPlan = { ...(base?.plan?.writes?.session || {}), ...enrichedDetail };

  if (!apply) {
    return {
      ...base,
      materializer: MATERIALIZER,
      plan: { ...base.plan, writes: { ...base.plan.writes, session: enrichedSessionPlan } },
      approved_service_detail: detail,
      model_resolution: safeModelResolution(modelResolution),
      multi_model_policy: "one session; link every confidently resolved canonical model; unresolved aliases stay review-gated",
    };
  }

  const committed = await materializeHistoricalRecord({ importId, historyReviewId: resolvedReviewId, apply: true, airtable, ...(resolver ? { resolver } : {}), ...(now ? { now } : {}) });
  let sessionRecordId = clean(committed?.session?.record_id);
  if (!sessionRecordId && sessionId) sessionRecordId = clean((await findSession(airtable, sessionId))?.id);
  let detailPatched = false;
  if (sessionRecordId && Object.keys(enrichedDetail).length) {
    await airtable.requestWithFieldFallback(SESSIONS_TABLE, { method: "PATCH", recordId: sessionRecordId, body: { fields: { ...enrichedDetail, import_review_status: "approved", imported_source_ref: resolvedReviewId } } });
    detailPatched = true;
  }
  return { ...committed, materializer: MATERIALIZER, approved_service_detail: detail, model_resolution: safeModelResolution(modelResolution), service_detail_patched: detailPatched, multi_model_policy: "one session; link every confidently resolved canonical model; unresolved aliases stay review-gated", entitlement_write: false };
}

function parseArgs(argv) { const out = { apply: false }; for (let index = 0; index < argv.length; index += 1) { if (argv[index] === "--import-id") out.importId = argv[index + 1]; if (argv[index] === "--history-review-id") out.historyReviewId = argv[index + 1]; if (argv[index] === "--apply") out.apply = true; } return out; }
async function main() { const args = parseArgs(process.argv.slice(2)); if (!clean(args.importId)) { console.error("Usage: node scripts/line-official-legacy/history-materializer-v2.js --import-id <id> [--history-review-id <id>] [--apply]"); process.exitCode = 1; return; } try { const result = await materializeHistoricalRecordV2(args); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); } catch (error) { process.stderr.write(`${JSON.stringify({ ok: false, materializer: MATERIALIZER, error: String(error?.code || error?.message || error) }, null, 2)}\n`); process.exitCode = 1; } }
if (require.main === module) main();
module.exports = { MATERIALIZER, approvedSessionDetail, materializeHistoricalRecordV2, parseArgs, safeModelResolution };
