import { requireModelSession } from "./model-year6-wish.js";

const PATH = "/v1/model/history";
const BASE_DEFAULT = "appsV1ILPRfIjkaYg";
const SESSIONS_DEFAULT = "tblC98mKWbzmPuNzX";
const PAYOUTS_DEFAULT = "tblMvsl7qYozD05e5";
const IMPORTS_DEFAULT = "tbljrlOK5m4iBXgST";
const MODEL_RELATION = "fldrXQAyOMPCvbOaY";
const SESSION_FIELDS = Object.freeze({
  sessionId: "fldLTq2kZbyRv22IA",
  jobId: "fldHw5HdDDdkHXMhG",
  modelName: "flddVz6eoWRHrzIQr",
  jobDate: "fldpnqoIsUMfN7y3c",
  jobType: "fldjK3U9bghnj7xUe",
  workLane: "fldzYGziqLqTQaoaK",
  state: "fld57fhdWqIcOy4Jp",
  payout: "fldlTO5aNfqUmlNWm",
});
const PAYOUT_FIELDS = Object.freeze({
  sessionId: "fldwmqaIq9QubX9Uy",
  modelId: "fldO4HSMEN7fYe0vh",
  type: "fldgITP2xFiS2YHCG",
  amount: "fldTNf4UOoqc0KobP",
  status: "fldy2TgwO7Ayp6uhh",
  slip: "fldzONvJF4NWV7Izc",
  slipUrl: "fldx8ekePcfFmUjND",
  verification: "fldbnm3clTmwhGiNu",
});
const IMPORT_FIELDS = Object.freeze({
  sourceType: "fldQcbid1LhEKRIdV",
  sourceName: "fldLXm3VHqAw1TYju",
  modelId: "fld5SqqQLHu3ZdLhT",
  date: "fldfWlJoU43pYwGDY",
  time: "fldiTy4PIwrbQfgfG",
  amount: "fldtqPkAQb5a6pmBU",
  workType: "fldbl5j76dXNd8onO",
  paymentType: "fldMmwoqdVH7M5yQj",
  confidence: "fldJX7uBYsZu4GKz5",
  review: "fldkb2BHx8GE46Obb",
  linkedType: "fldExiECUkKXCWvZ6",
  linkedId: "fldqDftyQUwY3xWVI",
  privacy: "fldhqunGErKHO3NVz",
});
const COMPLETED_STATES = new Set(["work_finished", "separated", "under_review", "payout_pending", "closed"]);
const APPROVED_IMPORT_STATES = new Set(["approved", "linked_to_canonical"]);
const PENDING_REVIEW_STATES = new Set(["imported", "extracted", "matched_high_confidence", "matched_low_confidence", "duplicate_candidate", "needs_review"]);
const MONETARY_IMPORT_TYPES = new Set(["payout", "tips_payout", "transport", "bonus", "adjustment"]);
const MAX_PAGES = 10;
const clean = (value, limit = 500) => String(value ?? "").trim().slice(0, limit);
const number = (value) => value === null || value === undefined || value === "" ? null : Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value) * 100) / 100 : null;

export function isModelWorkHistoryRequest(request) {
  return normalizePath(new URL(request.url).pathname) === PATH;
}

export async function handleModelWorkHistoryRequest(request, env = {}) {
  const url = new URL(request.url);
  if (!isModelWorkHistoryRequest(request)) return json({ ok: false, error: "not_found" }, 404);
  if (request.method.toUpperCase() !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405, { allow: "GET" });
  if (!originAllowed(request, url)) return json({ ok: false, error: "forbidden_origin" }, 403);

  const auth = await requireModelSession(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const modelId = clean(auth.payload?.model_record_id, 120);
  if (!/^rec[a-zA-Z0-9]{10,}$/.test(modelId)) return json({ ok: false, error: "model_identity_not_ready" }, 403);

  try {
    const [sessions, payouts, imports] = await Promise.all([
      readAll(env, clean(env.AIRTABLE_TABLE_SESSIONS, 80) || SESSIONS_DEFAULT,
        `FIND("${formulaEscape(modelId)}",ARRAYJOIN({${MODEL_RELATION}}))`, [...Object.values(SESSION_FIELDS), MODEL_RELATION]),
      readAll(env, clean(env.AIRTABLE_TABLE_PAYOUT_EVIDENCE, 80) || PAYOUTS_DEFAULT,
        `{${PAYOUT_FIELDS.modelId}}="${formulaEscape(modelId)}"`, Object.values(PAYOUT_FIELDS)),
      readAll(env, clean(env.AIRTABLE_TABLE_MODEL_HISTORY_IMPORTS, 80) || IMPORTS_DEFAULT,
        `{${IMPORT_FIELDS.modelId}}="${formulaEscape(modelId)}"`, Object.values(IMPORT_FIELDS)),
    ]);

    const ownedSessions = sessions.records.filter(row => linkedIds(row.fields?.[MODEL_RELATION]).includes(modelId));
    const completedSessions = ownedSessions.filter(row => COMPLETED_STATES.has(token(field(row, SESSION_FIELDS.state))));
    const modelPayouts = payouts.records.filter(row => clean(field(row, PAYOUT_FIELDS.modelId), 120) === modelId);
    const verifiedPaid = modelPayouts.filter(isVerifiedPaidPayout);
    const paidBySession = sumBySession(verifiedPaid);
    const allSessionKeys = new Set(ownedSessions.flatMap(sessionKeys));
    const allPayoutKeys = new Set(modelPayouts.map(row => row.id).filter(Boolean));
    const canonicalItems = completedSessions.map(row => projectSession(row, paidBySession));
    const reviewedImports = imports.records.filter(isModelVisibleApprovedImport);
    const imported = reviewedImports.map(row => projectImportedItem(row, allSessionKeys, allPayoutKeys)).filter(Boolean);
    const importedJobs = imported.filter(item => item.kind === "job");
    const importedEarnings = imported.filter(item => item.kind === "earning");
    const items = dedupeItems([...canonicalItems, ...importedJobs]).sort((a, b) => String(b.work_date || "").localeCompare(String(a.work_date || "")));
    const earnings = [...verifiedPaid.map(projectPaidPayout), ...importedEarnings]
      .sort((a, b) => String(b.paid_at || b.work_date || "").localeCompare(String(a.paid_at || a.work_date || "")));

    const earned = items.reduce((sum, item) => sum + (item.earned_amount_thb ?? 0), 0)
      + importedEarnings.reduce((sum, item) => sum + (item.amount_thb ?? 0), 0);
    const paidTotal = verifiedPaid.reduce((sum, row) => sum + (number(field(row, PAYOUT_FIELDS.amount)) ?? 0), 0);
    const pendingReviewCount = imports.records.filter(row => {
      const f = row.fields || {};
      return clean(f[IMPORT_FIELDS.modelId], 120) === modelId && PENDING_REVIEW_STATES.has(token(f[IMPORT_FIELDS.review]));
    }).length;
    const importCount = reviewedImports.length;
    const truncated = sessions.truncated || payouts.truncated || imports.truncated;

    return json({
      ok: true,
      schema: "mmd.model.work-history.v1",
      authority: "canonical_sessions_payout_evidence_and_owner_approved_history_imports",
      summary: {
        completed_job_count: items.length,
        earned_total_thb: truncated ? null : money(earned),
        paid_confirmed_total_thb: truncated ? null : money(paidTotal),
        payouts_without_slip_count: verifiedPaid.filter(row => !hasSlip(row)).length,
        completed_jobs_without_payout_record_count: canonicalItems.filter(item => item.payment_evidence === "not_recorded").length,
        history_items_waiting_review: pendingReviewCount,
        approved_history_source_items: importCount,
        backfill_status: importCount > 0 ? "reconciled_with_approved_imports" : pendingReviewCount > 0 ? "historical_items_under_review" : "canonical_only_backfill_not_started",
        scan_truncated: truncated,
      },
      items,
      earnings,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return json({ ok: false, error: error?.message === "airtable_not_configured" ? error.message : "history_unavailable" }, 503);
  }
}

export function isVerifiedPaidPayout(row) {
  return token(field(row, PAYOUT_FIELDS.status)) === "payout_paid"
    && token(field(row, PAYOUT_FIELDS.verification)) === "verified"
    && number(field(row, PAYOUT_FIELDS.amount)) !== null;
}

export function isModelVisibleApprovedImport(row) {
  const f = row?.fields || {};
  return APPROVED_IMPORT_STATES.has(token(f[IMPORT_FIELDS.review]))
    && token(f[IMPORT_FIELDS.privacy]) === "model_summary_allowed";
}

export function projectSession(row, paidBySession = new Map()) {
  const f = row?.fields || {};
  const id = clean(f[SESSION_FIELDS.sessionId], 120);
  const state = token(f[SESSION_FIELDS.state]);
  const date = dateOnly(f[SESSION_FIELDS.jobDate]);
  const amount = number(f[SESSION_FIELDS.payout]);
  const paid = paidBySession.get(id) || 0;
  return {
    id: `session:${id || row?.id || "unknown"}`,
    kind: "job",
    source: "canonical_session",
    work_date: date,
    work_type: safeWorkType(f[SESSION_FIELDS.jobType]),
    work_status: "completed",
    earned_amount_thb: amount,
    amount_basis: amount === null ? "amount_not_recorded" : "canonical_model_payout",
    paid_amount_thb: paid > 0 ? money(paid) : null,
    payment_evidence: paid > 0 ? "paid_confirmed" : state === "closed" ? "not_recorded" : "status_not_recorded",
    slip_attached: null,
    evidence_labels: ["MMD job record"],
  };
}

function projectImportedItem(row, canonicalKeys, canonicalPayoutIds) {
  const f = row?.fields || {};
  if (!isModelVisibleApprovedImport(row)) return null;
  const linkedType = token(f[IMPORT_FIELDS.linkedType]);
  const linkedId = clean(f[IMPORT_FIELDS.linkedId], 180);
  if ((linkedType === "session" || linkedType === "job") && linkedId && canonicalKeys.has(linkedId)) return null;
  if (linkedType === "payout" && linkedId && canonicalPayoutIds.has(linkedId)) return null;

  const paymentType = token(f[IMPORT_FIELDS.paymentType]);
  const amount = number(f[IMPORT_FIELDS.amount]);
  const isMonetary = MONETARY_IMPORT_TYPES.has(paymentType);
  const sourceType = token(f[IMPORT_FIELDS.sourceType]);
  const isPayoutRecord = linkedType === "payout" || linkedType === "payment" || (isMonetary && !clean(f[IMPORT_FIELDS.workType], 80));
  const hasSlip = sourceType === "slip_evidence";
  const sourceLabels = {
    line_model_group: "LINE · กลุ่ม Model กับ MMD",
    line_group_note: "LINE · โน้ตกลุ่ม",
    line_team_group: "LINE · กลุ่มงาน",
    slip_evidence: "หลักฐานสลิป",
    manual_admin: "ตรวจโดย MMD",
  };
  const base = {
    id: `import:${clean(row.id, 80)}`,
    source: "approved_historical_import",
    work_date: dateOnly(f[IMPORT_FIELDS.date]),
    work_type: safeWorkType(f[IMPORT_FIELDS.workType]),
    payment_evidence: hasSlip ? "slip_reference_imported" : "note_or_chat_only",
    slip_attached: hasSlip,
    evidence_labels: [sourceLabels[sourceType] || "ประวัติที่ MMD ตรวจแล้ว"],
  };
  return isPayoutRecord
    ? { ...base, kind: "earning", amount_thb: isMonetary ? amount : null, amount_basis: isMonetary ? "owner_approved_historical_record" : "amount_not_recorded" }
    : { ...base, kind: "job", work_status: "completed", earned_amount_thb: isMonetary ? amount : null, amount_basis: isMonetary ? "owner_approved_historical_record" : "amount_not_recorded", paid_amount_thb: null };
}

function projectPaidPayout(row) {
  const f = row?.fields || {};
  return {
    id: `payout:${clean(row.id, 80)}`,
    kind: "earning",
    source: "verified_payout_evidence",
    work_date: null,
    paid_at: null,
    amount_thb: number(f[PAYOUT_FIELDS.amount]),
    amount_basis: "verified_payout_ledger",
    payment_evidence: hasSlip(row) ? "paid_confirmed_with_slip" : "paid_confirmed_no_slip",
    slip_attached: hasSlip(row),
    evidence_labels: [hasSlip(row) ? "จ่ายแล้ว · มีสลิป" : "จ่ายแล้ว · ไม่มีสลิปแนบ"],
  };
}

function dedupeItems(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = item.id;
    const prior = byKey.get(key);
    if (!prior) byKey.set(key, item);
    else byKey.set(key, mergeDuplicate(prior, item));
  }
  return [...byKey.values()];
}

function mergeDuplicate(a, b) {
  const canonical = a.source === "canonical_session" ? a : b;
  const other = canonical === a ? b : a;
  const result = { ...canonical };
  if (result.earned_amount_thb === null) result.earned_amount_thb = other.earned_amount_thb;
  if (result.paid_amount_thb === null) result.paid_amount_thb = other.paid_amount_thb;
  if (result.payment_evidence === "not_recorded" && other.payment_evidence !== "not_recorded") result.payment_evidence = other.payment_evidence;
  result.evidence_labels = [...new Set([...(canonical.evidence_labels || []), ...(other.evidence_labels || [])])];
  return result;
}

async function readAll(env, tableId, formula, fields) {
  if (!clean(env.AIRTABLE_API_KEY, 1200) || !clean(env.AIRTABLE_BASE_ID, 80)) throw new Error("airtable_not_configured");
  const records = [];
  let offset = "";
  let pages = 0;
  do {
    const query = new URLSearchParams({ pageSize: "100", filterByFormula: formula, returnFieldsByFieldId: "true" });
    if (offset) query.set("offset", offset);
    const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID) || BASE_DEFAULT)}/${encodeURIComponent(tableId)}?${query}`, {
      headers: { authorization: `Bearer ${clean(env.AIRTABLE_API_KEY, 1200)}`, accept: "application/json" },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data?.records)) throw new Error("airtable_read_failed");
    for (const record of data.records) {
      const raw = record?.fields || {};
      const projected = Object.fromEntries(fields.map(fieldId => [fieldId, raw[fieldId]]));
      records.push({ id: clean(record.id, 80), fields: projected });
    }
    offset = clean(data.offset, 500);
    pages += 1;
  } while (offset && pages < MAX_PAGES);
  return { records, truncated: Boolean(offset) };
}

function sumBySession(rows) {
  const result = new Map();
  for (const row of rows) {
    const id = clean(field(row, PAYOUT_FIELDS.sessionId), 120);
    if (!id) continue;
    result.set(id, (result.get(id) || 0) + (number(field(row, PAYOUT_FIELDS.amount)) || 0));
  }
  return result;
}
function sessionKeys(row) {
  return [row.id, clean(field(row, SESSION_FIELDS.sessionId), 120), clean(field(row, SESSION_FIELDS.jobId), 120)].filter(Boolean);
}
function linkedIds(value) {
  if (Array.isArray(value)) return value.flatMap(item => typeof item === "string" ? [item] : [clean(item?.id, 120)]).filter(Boolean);
  return typeof value === "string" ? [value] : [];
}
function hasSlip(row) {
  return Boolean(field(row, PAYOUT_FIELDS.slip)?.length || clean(field(row, PAYOUT_FIELDS.slipUrl), 1000));
}
function field(row, fieldId) { return row?.fields?.[fieldId]; }
function token(value) { return clean(value && typeof value === "object" ? value.name : value, 120).toLowerCase().replace(/[ -]+/g, "_"); }
function safeWorkType(value) { return clean(value, 80).replace(/[<>\r\n]/g, "").slice(0, 80) || "MMD assignment"; }
function dateOnly(value) { const text = clean(value, 40); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null; }
function money(value) { return Math.round(value * 100) / 100; }
function formulaEscape(value) { return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\""); }
function normalizePath(path) { const value = String(path || "/").replace(/\/{2,}/g, "/"); return value.length > 1 ? value.replace(/\/+$/g, "") : value; }
function originAllowed(request, url) {
  const origin = clean(request.headers.get("origin"), 200);
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "https:" && (parsed.host === url.host || parsed.hostname === "mmdprive.webflow.io");
  } catch { return false; }
}
function json(value, status = 200, extraHeaders = {}) {
  return Response.json(value, { status, headers: { "cache-control": "no-store, private", "x-content-type-options": "nosniff", ...extraHeaders } });
}
