#!/usr/bin/env node

const path = require("node:path");
const { readRows } = require("./dry-run-import.js");
const { runHistoryEvidenceIntake } = require("./history-evidence-intake.js");

const MMS_GROUP_NAME = "Male Massage";
const MMS_SOURCE = "line_crew";
const PAYOUT_RE = /(payout|pay\s*out|therapist\s*(?:pay|payout)|model\s*(?:pay|payout)|จ่าย(?:เงิน)?(?:ให้)?(?:น้อง|therapist|นักนวด|นายแบบ)|ค่าแรง|ค่าตัว|โอน(?:เงิน)?ให้(?:น้อง|therapist|นักนวด|นายแบบ))/i;
const PAYMENT_RE = /(payment|deposit|paid|slip|transfer|prompt\s*pay|promptpay|หลักฐาน(?:การ)?(?:ชำระ|โอน|จ่าย)|มัดจำ|ชำระ|โอน(?:เงิน)?แล้ว|จ่าย(?:เงิน)?แล้ว|ยอด\s*\d|บาท|thb)/i;

function clean(value, max = 8000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function parseArgs(argv) {
  const out = { applyEvidence: false, source: MMS_SOURCE };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") out.file = argv[index + 1];
    if (arg === "--batch-id") out.batchId = argv[index + 1];
    if (arg === "--source") out.source = argv[index + 1];
    if (arg === "--apply-evidence") out.applyEvidence = true;
  }
  return out;
}

function pick(row, names) {
  const entries = new Map(Object.keys(row || {}).map((key) => [String(key).toLowerCase(), key]));
  for (const name of names) {
    const key = entries.get(String(name).toLowerCase());
    if (key) return clean(row[key]);
  }
  return "";
}

function evidenceKind(row = {}) {
  const explicit = pick(row, ["evidence_kind", "kind", "document_type", "type"]).toLowerCase();
  if (["payout", "therapist_payout", "model_payout"].includes(explicit)) return "payout";
  if (["payment", "deposit", "customer_payment", "tip"].includes(explicit)) return "payment";
  if (["service_history", "customer_note"].includes(explicit)) return "service_history";
  const haystack = [
    pick(row, ["raw_line_notes", "raw_note", "note", "notes", "admin_note", "message_text", "text"]),
    pick(row, ["file_name", "filename", "attachment_name"]),
    pick(row, ["payment_type", "payout_type"]),
  ].filter(Boolean).join(" ");
  if (PAYOUT_RE.test(haystack)) return "payout";
  if (PAYMENT_RE.test(haystack)) return "payment";
  return "operational_document";
}

function safeRef(value, fallback) {
  const raw = clean(value || fallback, 180).replace(/[\r\n\t]+/g, " ");
  return `mms:male_massage:${raw}`.slice(0, 240);
}

function normalizeMmsHistoryRow(row = {}, index = 0, defaultSource = MMS_SOURCE) {
  const source = pick(row, ["source", "source_channel"]) || defaultSource;
  if (!["line_ofc", "line_crew", "line_group_album"].includes(source)) throw new Error("MMS_HISTORY_SOURCE_NOT_ALLOWED");
  const kind = evidenceKind(row);
  const originalRef = pick(row, ["source_ref", "note_id", "message_ref", "message_id", "album_ref", "archive_ref", "ref"]);
  // Row positions change between exports. OA notes must carry a stable source
  // reference; never silently deduplicate two customers' notes as "row-1".
  if (source === "line_ofc" && !originalRef) throw new Error("MMS_OFC_SOURCE_REF_REQUIRED");
  const sourceRef = source === "line_ofc"
    ? `mms:line_ofc:${originalRef}`
    : safeRef(
    originalRef,
    `row-${index + 1}`,
  );
  if (sourceRef.length > 240) throw new Error("MMS_HISTORY_SOURCE_REF_TOO_LONG");
  const displayName = pick(row, ["line_display_name", "display_name", "display name"]);
  const renamedName = pick(row, ["current_line_rename", "line_renamed_name", "rename", "renamed_name", "nickname", "member_name"]);
  const lineUserId = pick(row, ["line_user_id", "line user id", "user_id", "userId"]);
  const originalNote = pick(row, ["raw_line_notes", "raw_note", "note", "notes", "admin_note", "message_text", "text"]);
  const attachmentUrl = pick(row, ["slip_url", "image_url", "attachment_url", "evidence_url"]);
  const amount = pick(row, ["amount_thb", "amount", "paid_amount", "payment_amount"]);
  const paymentRef = pick(row, ["payment_ref", "transaction_ref", "txn_ref", "provider_txn_id"]);
  const fileName = pick(row, ["file_name", "filename", "attachment_name"]);

  const provenance = [
    "[MMS historical evidence]",
    source === "line_ofc" ? "account=@malemassage | source=line_ofc" : `group=${MMS_GROUP_NAME}`,
    `kind=${kind}`,
    fileName ? `file=${fileName}` : "",
    kind !== "payment" && amount ? `amount_raw=${amount}` : "",
    kind !== "payment" && paymentRef ? `payment_ref_raw=${paymentRef}` : "",
    kind !== "payment" && attachmentUrl ? `attachment_url=${attachmentUrl}` : "",
    kind !== "payment" && pick(row, ["service_date", "paid_at", "payment_date", "date"])
      ? `date_raw=${pick(row, ["service_date", "paid_at", "payment_date", "date"])}` : "",
  ].filter(Boolean).join(" | ");

  const normalized = {
    ...row,
    source,
    source_ref: sourceRef,
    line_user_id: lineUserId,
    line_display_name: displayName,
    // The canonical MMD history intake requires identity evidence. Room-level
    // documents that have no sender identity remain review-only under the room
    // label instead of being guessed onto a customer.
    line_renamed_name: renamedName || displayName || (lineUserId || source === "line_ofc" ? "" : MMS_GROUP_NAME),
    raw_note: [provenance, originalNote].filter(Boolean).join("\n"),
  };

  if (kind !== "payment") {
    normalized.amount_thb = "";
    normalized.amount = "";
    normalized.paid_amount = "";
    normalized.payment_amount = "";
    normalized.payment_ref = "";
    normalized.transaction_ref = "";
    normalized.txn_ref = "";
    normalized.provider_txn_id = "";
    normalized.slip_url = "";
    normalized.image_url = "";
    normalized.attachment_url = "";
    normalized.evidence_url = "";
    // A service date or payout date alone is not customer payment evidence.
    normalized.paid_at = "";
    normalized.payment_date = "";
    normalized.date = "";
  }

  return normalized;
}

async function runMmsHistoryEvidenceIntake({
  file,
  rows,
  batchId = `mms_history_${Date.now().toString(36)}`,
  applyEvidence = false,
  airtable,
  source = MMS_SOURCE,
} = {}) {
  const rawRows = rows || (file ? readRows(file) : []);
  if (!Array.isArray(rawRows) || rawRows.length === 0) throw new Error("MMS_HISTORY_INPUT_EMPTY");
  const normalized = rawRows.map((row, index) => normalizeMmsHistoryRow(row, index, source));
  const kinds = normalized.reduce((counts, row) => {
    const match = clean(row.raw_note).match(/\bkind=([^ |\n]+)/);
    const kind = match?.[1] || "unknown";
    counts[kind] = (counts[kind] || 0) + 1;
    return counts;
  }, {});
  const result = await runHistoryEvidenceIntake({
    items: normalized,
    source: MMS_SOURCE,
    batchId,
    applyEvidence,
    ...(airtable ? { airtable } : {}),
  });
  return {
    ...result,
    mode: "mms_history_evidence_intake_v1",
    tenant: "mms",
    source_group_name: normalized.every((row) => row.source === "line_ofc") ? null : MMS_GROUP_NAME,
    source_account: normalized.some((row) => row.source === "line_ofc") ? "@malemassage" : null,
    evidence_kinds: kinds,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    process.stderr.write("Usage: node scripts/line-official-legacy/mms-history-evidence-intake.js --file <json|csv> [--source line_ofc|line_crew|line_group_album] [--batch-id id] [--apply-evidence]\n");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await runMmsHistoryEvidenceIntake(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      mode: "mms_history_evidence_intake_v1",
      error: String(error?.code || error?.message || error),
      file: path.basename(args.file || ""),
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  MMS_GROUP_NAME,
  MMS_SOURCE,
  evidenceKind,
  normalizeMmsHistoryRow,
  parseArgs,
  runMmsHistoryEvidenceIntake,
};
