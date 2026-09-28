#!/usr/bin/env node

const crypto = require("node:crypto");
const path = require("node:path");
const { AirtableClient, readRows } = require("../line-official-legacy/dry-run-import.js");
const { parseHistoricalNote } = require("../line-official-legacy/historical-note-parser.js");

const BASE_ID = process.env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const TABLE_ID = process.env.AIRTABLE_TABLE_MODEL_HISTORY_IMPORTS || "tbljrlOK5m4iBXgST";
const FIELD = Object.freeze({
  importId: "fld7LhHzjzoySBEQr",
  sourceType: "fldQcbid1LhEKRIdV",
  sourceName: "fldLXm3VHqAw1TYju",
  sourceGroup: "fldDcfdRnCP6NBKRn",
  modelName: "fldWFeRMC7RyzddY3",
  modelId: "fld5SqqQLHu3ZdLhT",
  rawText: "fldwmgRtY6tjcuFUw",
  attachmentUrl: "flduMw3UKlAYgzRnU",
  originalTime: "fldEtwq0GhrQjuUyp",
  date: "fldfWlJoU43pYwGDY",
  time: "fldiTy4PIwrbQfgfG",
  amount: "fldtqPkAQb5a6pmBU",
  location: "fldIxiXE1nPGLZ0fu",
  customerRef: "fldxNXI8FBxRSZNar",
  paymentType: "fldMmwoqdVH7M5yQj",
  workType: "fldbl5j76dXNd8onO",
  confidence: "fldJX7uBYsZu4GKz5",
  review: "fldkb2BHx8GE46Obb",
  linkedType: "fldExiECUkKXCWvZ6",
  adminNote: "fldsPvgdFjgplqoTu",
  privacy: "fldhqunGErKHO3NVz",
});

const SOURCES = Object.freeze({
  line_model_group: { airtable: "line_model_group", label: "LINE model group" },
  line_group_note: { airtable: "line_group_note", label: "LINE group note" },
  line_team_group: { airtable: "line_team_group", label: "LINE team group" },
  line_private_chat: { airtable: "other", label: "LINE private chat" },
  chat_backup: { airtable: "other", label: "Chat backup" },
  slip_evidence: { airtable: "slip_evidence", label: "Slip evidence" },
  manual_admin: { airtable: "manual_admin", label: "Manual admin evidence" },
});

function clean(value, limit = 5000) {
  return String(value == null ? "" : value).trim().slice(0, limit);
}

function pick(row, names, limit = 5000) {
  const keys = new Map(Object.keys(row || {}).map(key => [key.toLowerCase(), key]));
  for (const name of names) {
    const actual = keys.get(name.toLowerCase());
    if (actual) return clean(row[actual], limit);
  }
  return "";
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function parseArgs(argv) {
  const args = { apply: false, source: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--file") args.file = argv[index + 1];
    if (argv[index] === "--source") args.source = argv[index + 1];
    if (argv[index] === "--apply") args.apply = true;
  }
  return args;
}

function normalizeSource(value) {
  const requested = clean(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  const config = SOURCES[requested];
  if (!config) throw coded("MODEL_HISTORY_SOURCE_NOT_ALLOWED");
  return { requested, ...config };
}

function safeSourceRef(value) {
  const ref = clean(value, 300);
  if (/(?:bearer\s+|access[_-]?token|id[_-]?token|authorization:|session(?:_id)?=|liff\.state)/i.test(ref)) {
    throw coded("MODEL_HISTORY_SOURCE_REF_LOOKS_SECRET");
  }
  return ref;
}

function safeHttpsUrl(value) {
  const raw = clean(value, 1200);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function positiveNumber(value) {
  const parsed = Number(clean(value, 80).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

function exactModelId(value) {
  const modelId = clean(value, 120);
  return /^rec[A-Za-z0-9]{10,}$/.test(modelId) ? modelId : "";
}

function isoDateTime(value) {
  const raw = clean(value, 120);
  if (!raw) return "";
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

function isoDate(value) {
  const raw = clean(value, 80);
  if (!raw) return "";
  let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (!match) return "";
  let year = Number(match[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  if (year > 2400) year -= 543;
  return validDate(year, Number(match[2]), Number(match[1]));
}

function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function splitConfirmationBlocks(text) {
  const raw = clean(text, 100000);
  const matches = [...raw.matchAll(/mmd\s*confirmation/gi)];
  if (matches.length <= 1) return [raw];
  const blocks = [];
  const prefix = raw.slice(0, matches[0].index).trim();
  if (prefix) blocks.push(prefix);
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index;
    const end = matches[index + 1]?.index ?? raw.length;
    const block = raw.slice(start, end).trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

function slipStatus(text, attachmentUrl, sourceRequested) {
  if (attachmentUrl || sourceRequested === "slip_evidence") return "attached_or_linked";
  if (/(?:สลิป|slip|หลักฐานโอน|payment proof|ส่งหลักฐาน)/i.test(text)) return "mentioned_not_attached";
  return "not_attached";
}

function mapWorkType(value, text, confirmed) {
  const raw = `${clean(value, 120)} ${text}`;
  if (/\btravel\b|เดินทาง|ทริป/i.test(raw)) return "travel";
  if (/\bextreme\b/i.test(raw)) return "extreme";
  if (/(?:^|\W)pn(?:\W|$)/i.test(raw)) return "pn";
  if (/(?:^|\W)vip(?:\W|$)/i.test(raw)) return "vip";
  return confirmed ? "other" : "needs_review";
}

function inferAmount(rowAmount, parsed, text) {
  if (rowAmount !== null) return { amount: rowAmount, paymentType: "unknown", basis: "source_column" };
  const modelAmountPatterns = [
    /(?:ค่าตัว|ยอดโมเดล|จ่ายโมเดล|รับสุทธิ|model\s*(?:payout|fee)|payout)\s*[:=\-]?\s*(?:฿|thb)?\s*([0-9][0-9,]*(?:\.\d+)?)/i,
    /(?:฿|thb)?\s*([0-9][0-9,]*(?:\.\d+)?)\s*(?:บาท|thb|฿)?\s*(?:ค่าตัว|ให้โมเดล|จ่ายโมเดล|model\s*(?:payout|fee)|payout)/i,
  ];
  for (const pattern of modelAmountPatterns) {
    const match = text.match(pattern);
    const amount = positiveNumber(match?.[1]);
    if (amount !== null) return { amount, paymentType: "payout", basis: "model_payout_label" };
  }
  const amounts = parsed.note_detected_amounts || [];
  if (amounts.length === 1) return { amount: positiveNumber(amounts[0].amount), paymentType: "unknown", basis: "single_unverified_amount" };
  return { amount: null, paymentType: "unknown", basis: amounts.length > 1 ? "multiple_amounts_require_review" : "not_recorded" };
}

function normalizeRow(row, index, defaultSource) {
  const source = normalizeSource(pick(row, ["source", "source_type", "channel"], 80) || defaultSource);
  const rawText = pick(row, ["raw_text", "message_text", "message", "text", "note", "notes", "admin_note"], 100000);
  const attachmentUrl = safeHttpsUrl(pick(row, ["attachment_url", "slip_url", "image_url", "evidence_url"], 1200));
  if (!rawText && !attachmentUrl) throw coded("MODEL_HISTORY_EVIDENCE_REQUIRED");
  const explicitRef = safeSourceRef(pick(row, ["source_ref", "message_ref", "message_id", "archive_ref", "ref"], 300));
  const fallbackRef = `row-${index + 1}-${sha256({ source: source.requested, rawText, attachmentUrl }).slice(0, 16)}`;
  return {
    source,
    sourceRef: explicitRef || fallbackRef,
    sourceGroup: pick(row, ["source_group_name", "group_name", "chat_name"], 200),
    modelName: pick(row, ["model_name", "model", "talent_name"], 200),
    modelIdRaw: pick(row, ["model_id_candidate", "model_id", "model_record_id"], 120),
    rawText,
    attachmentUrl,
    originalTime: isoDateTime(pick(row, ["original_message_time", "message_time", "timestamp", "datetime"], 120)),
    explicitDate: isoDate(pick(row, ["extracted_date", "work_date", "job_date", "date"], 80)),
    explicitAmount: positiveNumber(pick(row, ["extracted_amount", "model_payout", "payout", "amount_thb", "amount"], 80)),
    explicitWorkType: pick(row, ["model_work_type", "work_type", "job_type"], 120),
    customerRef: pick(row, ["customer_reference", "client_reference", "customer_ref"], 200),
  };
}

function buildPlan(item, segmentText, segmentIndex) {
  const parsed = parseHistoricalNote(segmentText);
  const confirmed = /mmd\s*confirmation/i.test(segmentText);
  const modelId = exactModelId(item.modelIdRaw);
  const amount = inferAmount(item.explicitAmount, parsed, segmentText);
  const parsedDates = (parsed.note_detected_dates || []).map(isoDate).filter(Boolean);
  const extractedDate = item.explicitDate || (new Set(parsedDates).size === 1 ? parsedDates[0] : "");
  const status = slipStatus(segmentText, item.attachmentUrl, item.source.requested);
  const importId = `modelhist_${sha256({ source: item.source.requested, ref: item.sourceRef, segmentIndex }).slice(0, 24)}`;
  const identityStatus = modelId ? "exact_model_record_id" : item.modelIdRaw ? "invalid_model_record_id_requires_review" : "model_not_linked";
  let confidence = confirmed ? 0.66 : 0.32;
  if (modelId) confidence += 0.12;
  if (extractedDate) confidence += 0.07;
  if (amount.basis === "model_payout_label") confidence += 0.08;
  if (amount.basis === "single_unverified_amount") confidence -= 0.08;
  confidence = Math.max(0.1, Math.min(0.93, Math.round(confidence * 100) / 100));

  const fields = {
    [FIELD.importId]: importId,
    [FIELD.sourceType]: item.source.airtable,
    [FIELD.sourceName]: item.source.label,
    [FIELD.rawText]: segmentText,
    [FIELD.paymentType]: amount.paymentType,
    [FIELD.workType]: mapWorkType(item.explicitWorkType, segmentText, confirmed),
    [FIELD.confidence]: confidence,
    [FIELD.review]: "needs_review",
    [FIELD.linkedType]: "none",
    [FIELD.privacy]: "internal",
    [FIELD.adminNote]: [
      "Historical model evidence intake; owner review required before model visibility.",
      `evidence_kind=${confirmed ? "mmd_confirmation" : "informal_conversation"}`,
      `source_variant=${item.source.requested}`,
      `source_ref_sha256=${sha256(item.sourceRef)}`,
      `slip_status=${status}`,
      `model_identity=${identityStatus}`,
      `amount_basis=${amount.basis}`,
      "missing_slip_never_means_unpaid=true",
    ].join("\n"),
  };
  if (item.sourceGroup) fields[FIELD.sourceGroup] = item.sourceGroup;
  if (item.modelName || parsed.note_detected_model_text) fields[FIELD.modelName] = item.modelName || parsed.note_detected_model_text;
  if (modelId) fields[FIELD.modelId] = modelId;
  if (item.attachmentUrl) fields[FIELD.attachmentUrl] = item.attachmentUrl;
  if (item.originalTime) fields[FIELD.originalTime] = item.originalTime;
  if (extractedDate) fields[FIELD.date] = extractedDate;
  if (parsed.note_detected_start_time) fields[FIELD.time] = parsed.note_detected_start_time;
  if (amount.amount !== null) fields[FIELD.amount] = amount.amount;
  if (parsed.note_detected_location_text) fields[FIELD.location] = parsed.note_detected_location_text;
  if (item.customerRef) fields[FIELD.customerRef] = item.customerRef;

  return {
    importId,
    fields,
    summary: {
      import_id: importId,
      source: item.source.requested,
      evidence_kind: confirmed ? "mmd_confirmation" : "informal_conversation",
      slip_status: status,
      model_identity: identityStatus,
      extracted_date: extractedDate || null,
      amount_detected: amount.amount !== null,
      amount_basis: amount.basis,
      review_status: "needs_review",
      privacy_level: "internal",
    },
  };
}

function formulaText(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function createIfMissing(airtable, plan) {
  const existing = await airtable.findOne(TABLE_ID, `{${FIELD.importId}}=${formulaText(plan.importId)}`);
  if (existing?.id) return { id: existing.id, created: false };
  const record = await airtable.request(TABLE_ID, {
    method: "POST",
    query: { returnFieldsByFieldId: "true" },
    body: { fields: plan.fields, typecast: false },
  });
  return { id: record.id || "", created: true };
}

async function runModelHistoryEvidenceIntake({
  file,
  rows,
  source = "",
  apply = false,
  airtable = new AirtableClient({ baseId: BASE_ID }),
} = {}) {
  const input = rows || (file ? readRows(file) : []);
  if (!Array.isArray(input) || input.length === 0) throw coded("MODEL_HISTORY_INPUT_EMPTY");
  const plans = [];
  for (let index = 0; index < input.length; index += 1) {
    const normalized = normalizeRow(input[index], index, source);
    const blocks = splitConfirmationBlocks(normalized.rawText || "");
    for (let segmentIndex = 0; segmentIndex < blocks.length; segmentIndex += 1) {
      if (!blocks[segmentIndex] && !normalized.attachmentUrl) continue;
      plans.push(buildPlan(normalized, blocks[segmentIndex], segmentIndex));
    }
  }

  const result = {
    ok: true,
    mode: "model_history_evidence_intake_v1",
    dry_run: !apply,
    count: plans.length,
    safety: {
      owner_review_required: true,
      model_visible_records_created: false,
      missing_slip_treated_as_unpaid: false,
      raw_text_in_output: false,
    },
    plans: plans.map(plan => plan.summary),
  };
  if (!apply) return result;

  const writes = [];
  for (const plan of plans) {
    const write = await createIfMissing(airtable, plan);
    writes.push({ import_id: plan.importId, record_id: write.id, created: write.created });
  }
  return {
    ...result,
    dry_run: false,
    writes,
    created_count: writes.filter(write => write.created).length,
    duplicate_count: writes.filter(write => !write.created).length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file || !args.source) {
    process.stderr.write("Usage: node scripts/model-history/model-history-evidence-intake.js --file <json|csv> --source <line_model_group|line_group_note|line_team_group|line_private_chat|chat_backup|slip_evidence|manual_admin> [--apply]\n");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await runModelHistoryEvidenceIntake(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      mode: "model_history_evidence_intake_v1",
      error: clean(error?.code || error?.message || error, 160),
      file: path.basename(args.file || ""),
    })}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  FIELD,
  SOURCES,
  TABLE_ID,
  buildPlan,
  exactModelId,
  inferAmount,
  normalizeRow,
  parseArgs,
  runModelHistoryEvidenceIntake,
  splitConfirmationBlocks,
};
