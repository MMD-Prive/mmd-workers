#!/usr/bin/env node

const fs = require("node:fs");
const { AirtableClient } = require("./dry-run-import.js");

const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";
const DECISION_SOURCE = "manual_review";
const ALLOWED_DECISIONS = new Set([
  "ignore",
  "link_existing_client",
  "create_new_client",
  "needs_human",
  "do_not_import",
]);
const ALLOWED_FIELDS = [
  "decision",
  "reviewed_by",
  "reviewed_at",
  "review_note",
  "matched_client_id",
  "decision_source",
];

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function parseArgs(argv) {
  const out = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") out.file = argv[index + 1];
    if (arg === "--input") out.file = argv[index + 1];
    if (arg === "--apply") out.apply = true;
  }
  return out;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const headers = (rows.shift() || []).map(clean);
  return rows
    .filter((items) => items.some((item) => clean(item)))
    .map((items) => Object.fromEntries(headers.map((header, index) => [header, items[index] || ""])));
}

function readDecisionFile(file) {
  const text = fs.readFileSync(file, "utf8");
  if (/\.csv$/i.test(file)) return parseCsv(text);
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.decisions)) return parsed.decisions;
  throw new Error("decision_file_must_be_json_or_csv");
}

function encodeFormulaValue(value) {
  return clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeDecision(input) {
  const importId = clean(input.import_id);
  const reviewDecision = clean(input.decision || input.review_decision);
  if (!importId) throw new Error("missing_import_id");
  if (!ALLOWED_DECISIONS.has(reviewDecision)) throw new Error(`invalid_review_decision:${importId}`);

  const fields = {
    decision: reviewDecision,
    reviewed_by: clean(input.reviewed_by),
    reviewed_at: clean(input.reviewed_at) || new Date().toISOString(),
    review_note: clean(input.review_note),
    matched_client_id: clean(input.matched_client_id),
    decision_source: DECISION_SOURCE,
  };

  if (reviewDecision === "link_existing_client" && !fields.matched_client_id) {
    throw new Error(`matched_client_id_required:${importId}`);
  }

  return { import_id: importId, fields };
}

function normalizeDecisions(items) {
  const seen = new Set();
  return items.map(normalizeDecision).map((item) => {
    if (seen.has(item.import_id)) throw new Error(`duplicate_import_id:${item.import_id}`);
    seen.add(item.import_id);
    return item;
  });
}

function chunks(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

async function buildPatchRecords(decisions, airtable) {
  const records = [];
  for (const decision of decisions) {
    const found = await airtable.findOne(STAGING_TABLE, `{import_id}="${encodeFormulaValue(decision.import_id)}"`);
    if (!found?.id) throw new Error(`staging_row_not_found:${decision.import_id}`);
    records.push({ id: found.id, fields: decision.fields, import_id: decision.import_id });
  }
  return records;
}

async function patchReviewDecisions({ file, apply = false, airtable = new AirtableClient() }) {
  if (!file) throw new Error("missing_file");
  const decisions = normalizeDecisions(readDecisionFile(file));
  const records = await buildPatchRecords(decisions, airtable);
  const planned = records.map((record) => ({
    table: STAGING_TABLE,
    import_id: record.import_id,
    record_id: record.id,
    fields: Object.fromEntries(ALLOWED_FIELDS.map((field) => [field, record.fields[field]])),
  }));

  if (!apply) {
    return {
      ok: true,
      mode: "line_ofc_review_decision_patch",
      dry_run: true,
      staging_table_only: true,
      planned_count: planned.length,
      planned,
    };
  }

  const patched = [];
  for (const group of chunks(records, 10)) {
    const response = await airtable.request(STAGING_TABLE, {
      method: "PATCH",
      body: { records: group.map((record) => ({ id: record.id, fields: record.fields })) },
    });
    patched.push(...(response.records || []));
  }

  return {
    ok: true,
    mode: "line_ofc_review_decision_patch",
    dry_run: false,
    staging_table_only: true,
    patched_count: patched.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error("Usage: npm run line-ofc:patch-review-decisions -- --input decisions.json [--apply]");
    process.exitCode = 1;
    return;
  }
  const result = await patchReviewDecisions(args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  ALLOWED_FIELDS,
  DECISION_SOURCE,
  parseArgs,
  normalizeDecision,
  normalizeDecisions,
  patchReviewDecisions,
};
