#!/usr/bin/env node

const crypto = require("node:crypto");
const path = require("node:path");
const {
  AirtableClient,
  buildStagingFields,
  matchClients,
  readRows,
} = require("./dry-run-import.js");
const { clean, parseCanonicalLineOfc } = require("./canonical-parser.js");

const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";
const PAYMENT_PROOFS_TABLE = process.env.AIRTABLE_PAYMENT_PROOFS_TABLE_ID || "tblfJfM4Sqag9zrLi";
const ALLOWED_SOURCES = new Set(["line_ofc", "line_crew", "line_group_album"]);
const SOURCE_CHANNEL_LABEL = {
  line_ofc: "LINE Official chat",
  line_crew: "LINE group chat",
  line_group_album: "LINE group album",
};
const FORBIDDEN_TRUTH_TABLES = new Set([
  "tblNImdF9PKAxhXGi", // MMD — Member Entitlements
  "tbl5dfnwjUFMLbnWL", // MMD — Points Ledger
  "tblWGGJJOx5eBvBZJ", // Payments
  "tblC98mKWbzmPuNzX", // Sessions
  "tbl8no0NkZ3LDgCXK", // Bookings
]);

function parseArgs(argv) {
  const out = { applyEvidence: false, source: "" };
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
  const keys = new Map(Object.keys(row || {}).map((key) => [key.toLowerCase(), key]));
  for (const name of names) {
    const key = keys.get(String(name).toLowerCase());
    if (key) return clean(row[key]);
  }
  return "";
}

function parsePositiveNumber(value) {
  const normalized = clean(value).replace(/,/g, "");
  if (!normalized) return 0;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function normalizeDate(value) {
  const raw = clean(value);
  if (!raw) return "";
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toISOString().slice(0, 10);
}

function normalizeHttpsUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : "";
  } catch {
    return "";
  }
}

function safeSourceRef(value) {
  const raw = clean(value).slice(0, 240);
  if (!raw) return "";
  if (/(?:bearer\s+|access[_-]?token|id[_-]?token|session(?:_id)?=|liff\.state|authorization:)/i.test(raw)) {
    throw coded("HISTORY_SOURCE_REF_LOOKS_SECRET");
  }
  return raw;
}

function normalizeSource(value, fallback = "") {
  const source = clean(value || fallback).toLowerCase().replace(/[\s-]+/g, "_");
  if (!ALLOWED_SOURCES.has(source)) throw coded("HISTORY_SOURCE_NOT_ALLOWED");
  return source;
}

function normalizeItem(raw, index, defaultSource = "") {
  const source = normalizeSource(pick(raw, ["source", "source_channel", "channel"]) || defaultSource);
  const sourceRef = safeSourceRef(pick(raw, ["source_ref", "message_ref", "message_id", "album_ref", "archive_ref", "ref"]));
  if (!sourceRef) throw coded("HISTORY_SOURCE_REF_REQUIRED");

  const item = {
    source,
    source_ref: sourceRef,
    line_user_id: pick(raw, ["line_user_id", "line user id", "user_id", "userId"]),
    line_display_name: pick(raw, ["line_display_name", "display_name", "display name"]),
    line_renamed_name: pick(raw, ["line_renamed_name", "rename", "renamed_name", "nickname", "member_name"]),
    line_tags_raw: pick(raw, ["line_tags_raw", "legacy_tags", "tags", "hashtags"]),
    phone: pick(raw, ["phone", "member_phone", "Phone Number"]),
    email: pick(raw, ["email", "member_email", "Contact Email"]),
    raw_note: pick(raw, ["raw_note", "note", "notes", "admin_note", "message_text", "text"]),
    amount_thb: parsePositiveNumber(pick(raw, ["amount_thb", "amount", "paid_amount", "payment_amount"])),
    paid_at: normalizeDate(pick(raw, ["paid_at", "payment_date", "date"])),
    payment_ref: clean(pick(raw, ["payment_ref", "transaction_ref", "txn_ref", "provider_txn_id"])).slice(0, 120),
    slip_url: normalizeHttpsUrl(pick(raw, ["slip_url", "image_url", "attachment_url", "evidence_url"])),
    row_number: index + 1,
  };

  const identityEvidence = item.line_user_id || item.line_renamed_name || item.line_display_name || item.phone || item.email;
  const historyEvidence = item.raw_note || item.amount_thb || item.paid_at || item.payment_ref || item.slip_url;
  if (!identityEvidence) throw coded("HISTORY_IDENTITY_EVIDENCE_REQUIRED");
  if (!historyEvidence) throw coded("HISTORY_EVIDENCE_REQUIRED");
  return item;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function evidenceHash(item) {
  const payload = {
    source: item.source,
    source_ref: item.source_ref,
    line_user_id: item.line_user_id,
    line_display_name: item.line_display_name,
    line_renamed_name: item.line_renamed_name,
    line_tags_raw: item.line_tags_raw,
    phone: item.phone,
    email: item.email,
    raw_note: item.raw_note,
    amount_thb: item.amount_thb,
    paid_at: item.paid_at,
    payment_ref: item.payment_ref,
    slip_url: item.slip_url,
  };
  return crypto.createHash("sha256").update(stableJson(payload)).digest("hex");
}

function redactedRawRow(item) {
  return {
    source: item.source,
    source_ref: item.source_ref,
    line_user_id_present: Boolean(item.line_user_id),
    line_display_name: item.line_display_name,
    line_renamed_name: item.line_renamed_name,
    line_tags_raw: item.line_tags_raw,
    phone: item.phone ? "[redacted]" : "",
    email: item.email ? "[redacted]" : "",
    raw_note: item.raw_note,
    amount_thb: item.amount_thb || 0,
    paid_at: item.paid_at,
    payment_ref: item.payment_ref,
    slip_url_present: Boolean(item.slip_url),
  };
}

function makeParserRow(item, fingerprint) {
  return {
    __row: item.row_number,
    __source: item.source,
    __source_file_title: `history:${item.source}`,
    __import_id: `history_${fingerprint.slice(0, 24)}`,
    __raw_row_redacted: redactedRawRow(item),
    line_user_id: item.line_user_id,
    line_display_name: item.line_display_name,
    line_renamed_name: item.line_renamed_name,
    line_tags_raw: item.line_tags_raw,
    phone: item.phone,
    email: item.email,
    raw_note: item.raw_note,
  };
}

function buildPaymentProofFields(item, fingerprint, stagingImportId) {
  const hasPaymentEvidence = Boolean(item.amount_thb || item.paid_at || item.payment_ref || item.slip_url);
  if (!hasPaymentEvidence) return null;
  return compact({
    proof_id: `histproof_${fingerprint.slice(0, 24)}`,
    payer_name: item.line_renamed_name || item.line_display_name,
    amount_thb: item.amount_thb || undefined,
    paid_at: item.paid_at || undefined,
    channel: SOURCE_CHANNEL_LABEL[item.source],
    payment_ref: item.payment_ref || undefined,
    slip_url: item.slip_url || undefined,
    note: [
      "Historical evidence intake only; not payment truth.",
      `source=${item.source}`,
      `source_ref=${item.source_ref}`,
      `staging_import_id=${stagingImportId}`,
      `evidence_sha256=${fingerprint}`,
    ].join("\n"),
    status: "pending",
  });
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== ""));
}

function formulaText(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function createImmutableEvidenceRecord(airtable, table, keyField, keyValue, fields) {
  if (FORBIDDEN_TRUTH_TABLES.has(table)) throw coded("HISTORY_TRUTH_TABLE_WRITE_FORBIDDEN");
  const existing = await airtable.findOne(table, `{${keyField}}=${formulaText(keyValue)}`);
  if (existing?.id) return { record: existing, created: false };
  const record = await airtable.requestWithFieldFallback(table, {
    method: "POST",
    body: { fields },
  });
  return { record, created: true };
}

function assertProofIsEvidenceOnly(fields) {
  if (!fields) return;
  const forbidden = ["verified_at", "verified_by", "payment", "member", "session"];
  for (const field of forbidden) {
    if (Object.prototype.hasOwnProperty.call(fields, field)) throw coded("HISTORY_PROOF_TRUTH_FIELD_FORBIDDEN");
  }
  if (clean(fields.status).toLowerCase() !== "pending") throw coded("HISTORY_PROOF_MUST_BE_PENDING");
}

async function buildEvidencePlan(item, { batchId, airtable, rowIndex = 0 } = {}) {
  const fingerprint = evidenceHash(item);
  const row = makeParserRow(item, fingerprint);
  const parsed = parseCanonicalLineOfc({
    nickname: item.line_renamed_name,
    line_renamed_name: item.line_renamed_name,
    line_display_name: item.line_display_name,
    line_user_id: item.line_user_id,
    email: item.email,
    phone: item.phone,
    tags: item.line_tags_raw,
    note: item.raw_note,
  });
  const match = await matchClients(airtable, parsed, row, { allowUsernameExact: false });
  const stagingFields = buildStagingFields({
    row,
    rowIndex,
    sourceFile: `history-${item.source}.json`,
    batchId,
    parsed,
    match,
  });
  stagingFields.raw_row_json = JSON.stringify(redactedRawRow(item), null, 2);
  const proofFields = buildPaymentProofFields(item, fingerprint, stagingFields.import_id);
  assertProofIsEvidenceOnly(proofFields);
  return {
    fingerprint,
    source: item.source,
    source_ref: item.source_ref,
    staging_fields: stagingFields,
    payment_proof_fields: proofFields,
    canonical_match: {
      matched_client_id: match.matchedClient || "",
      match_type: match.matchType,
      match_confidence: match.matchConfidence,
      review_status: match.reviewStatus,
    },
  };
}

async function runHistoryEvidenceIntake({
  file,
  items,
  source = "",
  batchId = `history_${Date.now().toString(36)}`,
  applyEvidence = false,
  airtable = new AirtableClient(),
} = {}) {
  const rawRows = items || (file ? readRows(file) : []);
  if (!Array.isArray(rawRows) || rawRows.length === 0) throw coded("HISTORY_INPUT_EMPTY");
  const normalized = rawRows.map((row, index) => normalizeItem(row, index, source));
  const plans = [];
  for (let index = 0; index < normalized.length; index += 1) {
    plans.push(await buildEvidencePlan(normalized[index], { batchId, airtable, rowIndex: index }));
  }

  const result = {
    ok: true,
    mode: "history_evidence_intake_v1",
    batch_id: batchId,
    dry_run: !applyEvidence,
    count: plans.length,
    boundaries: {
      evidence_tables_only: true,
      current_entitlement_changed: false,
      points_ledger_changed: false,
      payment_truth_changed: false,
      session_or_booking_truth_changed: false,
      current_rights_source: "my_mmd_entitlement_resolver_v1",
    },
    plans: plans.map((plan) => ({
      fingerprint: plan.fingerprint,
      source: plan.source,
      source_ref: plan.source_ref,
      import_id: plan.staging_fields.import_id,
      proof_id: plan.payment_proof_fields?.proof_id || "",
      parsed_client_level: plan.staging_fields.parsed_client_level || "",
      proposed_points: Number(plan.staging_fields.proposed_points || 0),
      points_review_required: clean(plan.staging_fields.points_review_required) === "true",
      ...plan.canonical_match,
    })),
  };

  if (!applyEvidence) return result;

  const writes = [];
  for (const plan of plans) {
    const staging = await createImmutableEvidenceRecord(
      airtable,
      STAGING_TABLE,
      "import_id",
      plan.staging_fields.import_id,
      plan.staging_fields,
    );
    writes.push({ table: "LINE OFC Client Import Staging", id: staging.record?.id || "", created: staging.created });
    if (plan.payment_proof_fields) {
      const proof = await createImmutableEvidenceRecord(
        airtable,
        PAYMENT_PROOFS_TABLE,
        "proof_id",
        plan.payment_proof_fields.proof_id,
        plan.payment_proof_fields,
      );
      writes.push({ table: "MMD — Payment Proofs", id: proof.record?.id || "", created: proof.created });
    }
  }

  return { ...result, dry_run: false, writes };
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    process.stderr.write("Usage: node scripts/line-official-legacy/history-evidence-intake.js --file <json|csv> --source <line_ofc|line_crew|line_group_album> [--batch-id id] [--apply-evidence]\n");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await runHistoryEvidenceIntake(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      mode: "history_evidence_intake_v1",
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
  ALLOWED_SOURCES,
  FORBIDDEN_TRUTH_TABLES,
  PAYMENT_PROOFS_TABLE,
  STAGING_TABLE,
  assertProofIsEvidenceOnly,
  buildEvidencePlan,
  buildPaymentProofFields,
  evidenceHash,
  normalizeItem,
  parseArgs,
  runHistoryEvidenceIntake,
};
