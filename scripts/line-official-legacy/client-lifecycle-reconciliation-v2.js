#!/usr/bin/env node

const { AirtableClient } = require("./dry-run-import.js");
const {
  AUTHORITY: BASE_AUTHORITY,
  DEFAULT_THRESHOLDS,
  buildProjection,
  canonicalClientIdFromStaging,
  hasClientTag,
} = require("./client-lifecycle-reconciliation.js");

const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";
const HISTORY_REVIEWS_TABLE = process.env.AIRTABLE_CUSTOMER_HISTORY_REVIEWS_TABLE || "tblnpDFQMpo8AmNQv";
const CLIENTS_TABLE = process.env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS";
const MEMBERS_TABLE = process.env.AIRTABLE_TABLE_MEMBERS || "tblgWc5VRon5o8Mhk";
const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX";
const PAYMENTS_TABLE = process.env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ";
const INTELLIGENCE_TABLE = process.env.AIRTABLE_CLIENT_INTELLIGENCE_EVIDENCE_TABLE || "tblx7NdfHO5iY6qtg";
const RECONCILIATION_TABLE = process.env.AIRTABLE_CLIENT_LIFECYCLE_RECONCILIATION_TABLE || "tblNV1b5sMC2fQPxt";
const AUTHORITY = "client_lifecycle_reconciliation_v2_backlog_aware";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function linkedIds(value) {
  return Array.isArray(value) ? value.map((item) => clean(typeof item === "object" ? item?.id : item)).filter(Boolean) : [];
}

function indexByLinkedClient(records, fieldNames) {
  const map = new Map();
  for (const row of records || []) {
    const fields = row?.fields || {};
    let ids = [];
    for (const fieldName of fieldNames) {
      ids = linkedIds(fields[fieldName]);
      if (ids.length) break;
    }
    for (const id of ids) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(row);
    }
  }
  return map;
}

function memberForClient(members, clientId) {
  const matches = (members || []).filter((row) => linkedIds(row?.fields?.Clients || row?.fields?.Client).includes(clientId));
  if (matches.length !== 1) return { row: null, ambiguous: matches.length > 1 };
  return { row: matches[0], ambiguous: false };
}

function reviewedStagingIds(reviewRows) {
  const ids = new Set();
  for (const review of reviewRows || []) {
    for (const id of linkedIds(review?.fields?.["LINE OFC Import Row"])) ids.add(id);
  }
  return ids;
}

function unqueuedSourceRows(stagingRows, reviewRows) {
  const reviewed = reviewedStagingIds(reviewRows);
  return (stagingRows || []).filter((row) => hasClientTag(row?.fields?.line_tags_raw) && clean(row?.id) && !reviewed.has(clean(row.id)));
}

function syntheticPendingReviews(stagingRows, reviewRows) {
  return unqueuedSourceRows(stagingRows, reviewRows).map((row) => ({
    id: `synthetic:${clean(row.id)}`,
    fields: {
      review_status: "pending",
      materialization_status: "",
      source_staging_id: clean(row.id),
      synthetic_unqueued_source: true,
    },
  }));
}

function projectionWithBacklog(input, now = new Date(), thresholds = DEFAULT_THRESHOLDS) {
  const reviewRows = Array.isArray(input?.reviewRows) ? input.reviewRows : [];
  const stagingRows = Array.isArray(input?.stagingRows) ? input.stagingRows : [];
  const unqueued = unqueuedSourceRows(stagingRows, reviewRows);
  const result = buildProjection({
    ...input,
    reviewRows: [...reviewRows, ...syntheticPendingReviews(stagingRows, reviewRows)],
  }, now, thresholds);
  result.projection.unqueued_history_note_count = unqueued.length;
  result.projection.base_authority = BASE_AUTHORITY;
  result.projection.authority = AUTHORITY;
  result.fields.projection_json = JSON.stringify(result.projection);
  result.fields.authority = AUTHORITY;
  return result;
}

function parseArgs(argv) {
  const out = { apply: false, clientId: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--apply") out.apply = true;
    if (argv[index] === "--client-id") out.clientId = clean(argv[index + 1]);
  }
  return out;
}

async function upsertProjection(airtable, result) {
  if (!result.clientId || !result.reconciliation_id) return { skipped: true, reason: "client_id_required" };
  const escaped = result.reconciliation_id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const existing = await airtable.findOne(RECONCILIATION_TABLE, `{reconciliation_id}="${escaped}"`);
  if (existing?.id) {
    const updated = await airtable.requestWithFieldFallback(RECONCILIATION_TABLE, {
      method: "PATCH",
      recordId: existing.id,
      body: { fields: result.fields },
    });
    return { record_id: clean(updated?.id || existing.id), created: false };
  }
  const created = await airtable.requestWithFieldFallback(RECONCILIATION_TABLE, {
    method: "POST",
    body: { fields: result.fields },
  });
  return { record_id: clean(created?.id), created: true };
}

async function reconcileClientLifecycleV2({ apply = false, clientId = "", airtable = new AirtableClient(), now = new Date(), thresholds = DEFAULT_THRESHOLDS } = {}) {
  const [staging, clients, members, reviews, sessions, payments, intelligence] = await Promise.all([
    airtable.list(STAGING_TABLE, { filterByFormula: `FIND("#client",LOWER({line_tags_raw}&""))>0` }),
    airtable.list(CLIENTS_TABLE),
    airtable.list(MEMBERS_TABLE),
    airtable.list(HISTORY_REVIEWS_TABLE),
    airtable.list(SESSIONS_TABLE),
    airtable.list(PAYMENTS_TABLE),
    airtable.list(INTELLIGENCE_TABLE).catch(() => []),
  ]);

  const clientMap = new Map(clients.map((row) => [clean(row.id), row]));
  const cohort = new Map();
  const unmatched = [];
  for (const row of staging) {
    const canonicalId = canonicalClientIdFromStaging(row);
    if (!canonicalId || !clientMap.has(canonicalId)) {
      unmatched.push({ import_id: clean(row?.fields?.import_id), line_user_id_present: Boolean(clean(row?.fields?.line_user_id)), reason: "canonical_client_not_committed" });
      continue;
    }
    if (clientId && canonicalId !== clientId) continue;
    if (!cohort.has(canonicalId)) cohort.set(canonicalId, []);
    cohort.get(canonicalId).push(row);
  }
  if (clientId && !cohort.has(clientId) && clientMap.has(clientId)) cohort.set(clientId, []);

  const reviewsByClient = indexByLinkedClient(reviews, ["Client"]);
  const sessionsByClient = indexByLinkedClient(sessions, ["Client"]);
  const paymentsByClient = indexByLinkedClient(payments, ["Client"]);
  const intelligenceByClient = indexByLinkedClient(intelligence, ["Client", "client"]);
  const results = [];

  for (const [canonicalId, sourceRows] of cohort.entries()) {
    const memberMatch = memberForClient(members, canonicalId);
    results.push(projectionWithBacklog({
      client: clientMap.get(canonicalId),
      member: memberMatch.row,
      memberAmbiguous: memberMatch.ambiguous,
      stagingRows: sourceRows,
      reviewRows: reviewsByClient.get(canonicalId) || [],
      sessionRows: sessionsByClient.get(canonicalId) || [],
      paymentRows: paymentsByClient.get(canonicalId) || [],
      intelligenceRows: intelligenceByClient.get(canonicalId) || [],
    }, now, thresholds));
  }

  const summary = {
    client_tag_rows_scanned: staging.length,
    canonical_clients_in_cohort: cohort.size,
    unmatched_or_uncommitted_rows: unmatched.length,
    unqueued_history_notes: results.reduce((sum, item) => sum + Number(item.projection.unqueued_history_note_count || 0), 0),
    lifecycle: {},
    points_state: {},
    action_status: {},
    attention_flags: {},
  };
  for (const item of results) {
    const p = item.projection;
    summary.lifecycle[p.lifecycle_status] = (summary.lifecycle[p.lifecycle_status] || 0) + 1;
    summary.points_state[p.points_state] = (summary.points_state[p.points_state] || 0) + 1;
    const actionStatus = item.fields.action_status || "unknown";
    summary.action_status[actionStatus] = (summary.action_status[actionStatus] || 0) + 1;
    for (const flag of p.attention_flags || []) summary.attention_flags[flag] = (summary.attention_flags[flag] || 0) + 1;
  }

  if (!apply) {
    return {
      ok: true,
      dry_run: true,
      schema: AUTHORITY,
      summary,
      unmatched,
      projections: results.map((item) => item.projection),
      writes: [],
      forbidden_writes: ["MMD — Member Entitlements", "Members.Membership Tier", "Members.Membership Status", "MMD — Points Ledger"],
    };
  }

  const writes = [];
  for (const result of results) writes.push(await upsertProjection(airtable, result));
  return {
    ok: true,
    dry_run: false,
    schema: AUTHORITY,
    summary,
    projected_rows_written: writes.length,
    writes,
    truth_writes: false,
    forbidden_writes: ["MMD — Member Entitlements", "Members.Membership Tier", "Members.Membership Status", "MMD — Points Ledger"],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = await reconcileClientLifecycleV2(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, schema: AUTHORITY, error: String(error?.code || error?.message || error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  AUTHORITY,
  parseArgs,
  projectionWithBacklog,
  reconcileClientLifecycleV2,
  reviewedStagingIds,
  syntheticPendingReviews,
  unqueuedSourceRows,
};
