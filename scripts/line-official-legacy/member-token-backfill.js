#!/usr/bin/env node

const {
  AirtableClient,
} = require("./dry-run-import.js");
const {
  buildBackfillPlan,
  hasTokenEvidence,
  reconstructParse,
} = require("./member-token-backfill-plan.js");

const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";
const VERIFY_RECORD_ID = "recrwS2H0Qr61RSqf";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function parseArgs(argv) {
  const out = { plan: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--batch-id") out.batchId = argv[index + 1];
    if (argv[index] === "--plan" || argv[index] === "--dry-run") out.plan = true;
  }
  return out;
}

function chunks(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function airtableDate(value) {
  const raw = clean(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;
  return raw;
}

function buildProposedEntitlement(fields, parsed) {
  const existing = (() => {
    try {
      return fields.proposed_entitlement_json ? JSON.parse(fields.proposed_entitlement_json) : {};
    } catch {
      return {};
    }
  })();
  return {
    ...existing,
    source: "line_ofc",
    client_level: parsed.client_level,
    client_level_raw: parsed.client_level_raw,
    client_level_tokens: parsed.client_level_tokens,
    membership_status: parsed.membership_status,
    membership_tier: parsed.membership_tier,
    membership_package: parsed.membership_package,
    member_since: parsed.member_since,
    member_since_raw: parsed.member_since_raw,
    has_purchased: parsed.has_purchased,
    review_required: true,
  };
}

function buildBackfillUpdates(records) {
  const updates = [];
  for (const record of records) {
    const fields = record.fields || {};
    const currentParse = (() => {
      try {
        return fields.membership_parse_json ? JSON.parse(fields.membership_parse_json) : {};
      } catch {
        return {};
      }
    })();
    const parsed = reconstructParse(record);
    const nextFields = {
      membership_parse_json: JSON.stringify(parsed, null, 2),
      parsed_member_since_raw: parsed.member_since_raw,
      proposed_entitlement_json: JSON.stringify(buildProposedEntitlement(fields, parsed), null, 2),
    };
    if (parsed.member_since) nextFields.parsed_member_since = airtableDate(parsed.member_since);
    if (
      !hasTokenEvidence(currentParse)
      || clean(fields.parsed_member_since_raw) !== parsed.member_since_raw
      || clean(fields.parsed_member_since) !== nextFields.parsed_member_since
    ) {
      updates.push({ id: record.id, fields: nextFields });
    }
  }
  return updates;
}

function redactedUpdateSample(update) {
  const parse = JSON.parse(update.fields.membership_parse_json);
  return {
    staging_record_id: update.id ? `${update.id.slice(0, 6)}...${update.id.slice(-4)}` : "",
    update_fields: Object.keys(update.fields),
    parsed_member_since: update.fields.parsed_member_since || "",
    parsed_member_since_raw: update.fields.parsed_member_since_raw,
    all_member_tokens: parse.all_member_tokens || [],
    chosen_member_since_token: parse.chosen_member_since_token || "",
    chosen_member_since_strategy: parse.chosen_member_since_strategy || "",
  };
}

async function fetchBatchRows({ batchId, airtable }) {
  return airtable.list(STAGING_TABLE, {
    filterByFormula: `{import_batch_id}="${clean(batchId).replace(/"/g, '\\"')}"`,
  });
}

async function applyUpdates({ airtable, updates }) {
  let updated = 0;
  for (const group of chunks(updates, 10)) {
    const data = await airtable.requestBatchWithFieldFallback(STAGING_TABLE, {
      method: "PATCH",
      body: { records: group },
    });
    updated += (data.records || []).length;
  }
  return updated;
}

function redactedVerification(record) {
  const fields = record.fields || {};
  const parse = JSON.parse(fields.membership_parse_json || "{}");
  const proposed = JSON.parse(fields.proposed_entitlement_json || "{}");
  return {
    staging_record_id: record.id ? `${record.id.slice(0, 6)}...${record.id.slice(-4)}` : "",
    parsed_member_since: fields.parsed_member_since || "",
    parsed_member_since_raw: fields.parsed_member_since_raw || "",
    chosen_member_since_token: parse.chosen_member_since_token || "",
    all_member_tokens: parse.all_member_tokens || [],
    proposed_entitlement_member_since_raw: proposed.member_since_raw || "",
    review_status: fields.review_status || "",
  };
}

async function runBackfill({ batchId, plan = false, airtable = new AirtableClient() }) {
  const records = await fetchBatchRows({ batchId, airtable });
  const planSummary = buildBackfillPlan(records);
  const updates = buildBackfillUpdates(records);
  if (plan) {
    return {
      ok: true,
      mode: "line_ofc_member_token_backfill_plan",
      batch_id: batchId,
      ...planSummary,
      rows_that_would_update: updates.length,
      redacted_update_samples: updates.slice(0, 5).map(redactedUpdateSample),
    };
  }

  const rowsUpdated = await applyUpdates({ airtable, updates });
  const verification = await airtable.request(STAGING_TABLE, {
    recordId: VERIFY_RECORD_ID,
  });
  return {
    ok: true,
    mode: "line_ofc_member_token_backfill",
    batch_id: batchId,
    rows_checked: records.length,
    rows_updated: rowsUpdated,
    updated_fields_only: [
      "membership_parse_json",
      "parsed_member_since",
      "parsed_member_since_raw",
      "proposed_entitlement_json",
    ],
    verification: redactedVerification(verification),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.batchId) {
    console.error("Usage: npm run line-ofc:member-token-backfill -- --batch-id <batch_id> [--plan]");
    process.exitCode = 1;
    return;
  }
  const result = await runBackfill({ batchId: args.batchId, plan: args.plan });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  airtableDate,
  buildBackfillUpdates,
  buildProposedEntitlement,
  runBackfill,
};
