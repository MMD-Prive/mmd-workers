#!/usr/bin/env node

const { AirtableClient } = require("./dry-run-import.js");

const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";
const HISTORY_REVIEWS_TABLE = process.env.AIRTABLE_CUSTOMER_HISTORY_REVIEWS_TABLE || "tblnpDFQMpo8AmNQv";
const CLIENTS_TABLE = process.env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS";
const MEMBERS_TABLE = process.env.AIRTABLE_TABLE_MEMBERS || "tblgWc5VRon5o8Mhk";
const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX";
const PAYMENTS_TABLE = process.env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ";
const POINTS_LEDGER_TABLE = process.env.AIRTABLE_TABLE_POINTS_LEDGER || "tbl5dfnwjUFMLbnWL";
const INTELLIGENCE_TABLE = process.env.AIRTABLE_CLIENT_INTELLIGENCE_EVIDENCE_TABLE || "tblx7NdfHO5iY6qtg";
const RECONCILIATION_TABLE = process.env.AIRTABLE_CLIENT_LIFECYCLE_RECONCILIATION_TABLE || "tblNV1b5sMC2fQPxt";
const AUTHORITY = "client_lifecycle_reconciliation_v1";

const DEFAULT_THRESHOLDS = Object.freeze({
  followUpDays: Number(process.env.CLIENT_FOLLOW_UP_DAYS || 30),
  dormantDays: Number(process.env.CLIENT_DORMANT_DAYS || 90),
  lostDays: Number(process.env.CLIENT_LOST_DAYS || 180),
  renewalWindowDays: Number(process.env.CLIENT_RENEWAL_WINDOW_DAYS || 30),
  highValueSpendThb: Number(process.env.CLIENT_HIGH_VALUE_REACTIVATION_THB || 120000),
});

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function truthy(value) {
  if (value === true) return true;
  const token = clean(value).toLowerCase();
  return ["true", "yes", "1", "y", "on", "eligible"].includes(token);
}

function linkedIds(value) {
  return Array.isArray(value) ? value.map((item) => clean(typeof item === "object" ? item?.id : item)).filter(Boolean) : [];
}

function dateMs(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value) {
  const ms = dateMs(value);
  return ms ? new Date(ms).toISOString().slice(0, 10) : "";
}

function isoTime(value) {
  const ms = dateMs(value);
  return ms ? new Date(ms).toISOString() : "";
}

function daysBetween(now, prior) {
  const nowMs = now instanceof Date ? now.getTime() : dateMs(now);
  const priorMs = prior instanceof Date ? prior.getTime() : dateMs(prior);
  if (!Number.isFinite(nowMs) || !priorMs) return null;
  return Math.max(0, Math.floor((nowMs - priorMs) / 86400000));
}

function normalizeToken(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function hasClientTag(value) {
  return /(?:^|[\s,;|])#client(?:$|[\s,;|])/i.test(` ${clean(value)} `);
}

function canonicalClientIdFromStaging(row) {
  const fields = row?.fields || {};
  const linked = linkedIds(fields.matched_client || fields.Client);
  const scalar = clean(fields.matched_client_id || fields.canonical_client_id);
  const ids = new Set([...linked, ...(scalar ? [scalar] : [])]);
  const review = normalizeToken(fields.review_status);
  const decision = normalizeToken(fields.decision);
  if (review !== "committed" || decision !== "link_existing_client" || ids.size !== 1) return "";
  return ids.values().next().value;
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

function completedSessions(rows) {
  return (rows || []).filter((row) => {
    const fields = row?.fields || {};
    const status = normalizeToken(fields["Session Status"] || fields.status);
    const importStatus = normalizeToken(fields.import_review_status);
    return ["completed", "complete", "done"].includes(status) && (!importStatus || importStatus === "approved");
  });
}

function verifiedPayments(rows) {
  return (rows || []).filter((row) => {
    const fields = row?.fields || {};
    const status = normalizeToken(fields["Payment Status"] || fields.payment_status);
    const verification = normalizeToken(fields["Verification Status"] || fields.verification_status);
    const importStatus = normalizeToken(fields.import_review_status);
    const evidence = normalizeToken(fields.payment_evidence_source);
    return ["paid", "completed", "settled"].includes(status) && (verification === "verified" || importStatus === "approved" || evidence === "imported_history");
  });
}

function unresolvedReviews(rows) {
  return (rows || []).filter((row) => {
    const fields = row?.fields || {};
    const review = normalizeToken(fields.review_status);
    const materialization = normalizeToken(fields.materialization_status);
    if (["rejected", "ignored", "materialized", "complete", "completed"].includes(review)) return false;
    if (["materialized", "complete", "completed"].includes(materialization)) return false;
    return true;
  });
}

function sessionDate(row) {
  const fields = row?.fields || {};
  return fields.job_date || fields["Session Date"] || fields.created_at || row.createdTime;
}

function paymentDate(row) {
  const fields = row?.fields || {};
  return fields["Payment Date"] || fields["Created At"] || fields.created_at || row.createdTime;
}

function latestDate(values) {
  let best = 0;
  for (const value of values) best = Math.max(best, dateMs(value));
  return best ? new Date(best).toISOString() : "";
}

function serviceSpend(rows) {
  return (rows || []).reduce((sum, row) => {
    const fields = row?.fields || {};
    const amount = number(fields["Total Amount"] ?? fields.final_total_amount ?? fields.total_amount ?? fields.base_service_amount ?? 0);
    return sum + Math.max(0, amount || 0);
  }, 0);
}

function paidSpend(rows) {
  return (rows || []).reduce((sum, row) => {
    const fields = row?.fields || {};
    const amount = number(fields.Amount ?? fields.amount_thb ?? fields["Payment Amount"] ?? 0);
    return sum + Math.max(0, amount || 0);
  }, 0);
}

function lifecycleStatus(days, doNotContact, thresholds = DEFAULT_THRESHOLDS) {
  if (doNotContact) return "do_not_contact";
  if (days == null) return "unknown";
  if (days >= thresholds.lostDays) return "lost_180d";
  if (days >= thresholds.dormantDays) return "dormant_90d";
  if (days >= thresholds.followUpDays) return "follow_up_30d";
  return "active_recent";
}

function renewalState(member, now, thresholds = DEFAULT_THRESHOLDS) {
  if (!member) return { due: false, overdue: false, daysToDue: null };
  const fields = member.fields || {};
  const status = normalizeToken(fields["Membership Status"] || fields.membership_status);
  const renewalStatus = normalizeToken(fields["Renewal Status"] || fields.renewal_status);
  const dueMs = dateMs(fields["Renewal Due Date"] || fields["Membership Expiry"] || fields.membership_expires_at);
  if (["renewed", "complete", "completed", "paid"].includes(renewalStatus)) return { due: false, overdue: false, daysToDue: null };
  if (status === "expired") return { due: false, overdue: true, daysToDue: dueMs ? Math.floor((dueMs - now.getTime()) / 86400000) : null };
  if (!dueMs) return { due: false, overdue: false, daysToDue: null };
  const daysToDue = Math.ceil((dueMs - now.getTime()) / 86400000);
  return { due: daysToDue >= 0 && daysToDue <= thresholds.renewalWindowDays, overdue: daysToDue < 0, daysToDue };
}

function intelligenceCount(rows) {
  return (rows || []).filter((row) => {
    const fields = row?.fields || {};
    const type = normalizeToken(fields.evidence_type || fields.type || fields.category);
    return !type || /review|feedback|preference|relationship|service/.test(type);
  }).length;
}

function currentPoints(member, unresolvedCount) {
  if (!member) return { value: null, state: "no_member_wallet" };
  const raw = number(member?.fields?.["Points Balance"] ?? member?.fields?.points_balance);
  if (raw == null) return { value: null, state: "checking" };
  if (unresolvedCount > 0) return { value: Math.max(0, raw), state: "review_required" };
  return { value: Math.max(0, raw), state: "confirmed" };
}

function dataQuality({ canonicalClient, memberAmbiguous, sourceNotes, unresolvedCount, sessionCount, paymentCount, pointsState }) {
  let score = canonicalClient ? 30 : 0;
  if (!memberAmbiguous) score += 10;
  if (sourceNotes > 0) score += 10;
  if (unresolvedCount === 0) score += 20;
  if (sessionCount > 0 || paymentCount > 0) score += 15;
  if (["confirmed", "no_member_wallet"].includes(pointsState)) score += 15;
  return Math.max(0, Math.min(100, score));
}

function chooseAction({ identityBlocked, unresolvedCount, pointsState, renewal, lifecycle, doNotContact, highValue }) {
  if (identityBlocked) return { status: "blocked", action: "Review client identity match", reason: "#client history is not linked to exactly one canonical Client." };
  if (doNotContact) return { status: "healthy", action: "Do not contact", reason: "Client contact suppression is active; preserve history without reactivation outreach." };
  if (unresolvedCount > 0) return { status: "needs_review", action: "Review historical LINE OFC evidence", reason: `${unresolvedCount} historical review item(s) remain unresolved.` };
  if (pointsState === "review_required" || pointsState === "checking") return { status: "needs_review", action: "Reconcile points wallet", reason: "Current points cannot be treated as final until historical earning evidence is reconciled." };
  if (renewal.overdue) return { status: "needs_action", action: "Follow up overdue membership renewal", reason: "Canonical Member renewal/expiry date has passed." };
  if (renewal.due) return { status: "needs_action", action: "Prepare membership renewal", reason: `Canonical renewal is due within ${renewal.daysToDue} day(s).` };
  if (lifecycle === "lost_180d") return { status: "needs_action", action: highValue ? "High-value client reactivation" : "Client reactivation", reason: "No canonical activity for at least the configured lost-client interval." };
  if (lifecycle === "dormant_90d") return { status: "needs_action", action: "Re-engage dormant client", reason: "No canonical activity for at least the configured dormant interval." };
  if (lifecycle === "follow_up_30d") return { status: "needs_action", action: "Light follow-up", reason: "Client has crossed the configured follow-up interval." };
  if (lifecycle === "unknown") return { status: "needs_review", action: "Establish last verified activity", reason: "No canonical activity date is available." };
  return { status: "healthy", action: "No action required", reason: "Client is recent and has no higher-priority reconciliation flag." };
}

function buildProjection(input, now = new Date(), thresholds = DEFAULT_THRESHOLDS) {
  const {
    client,
    member,
    memberAmbiguous = false,
    stagingRows = [],
    reviewRows = [],
    sessionRows = [],
    paymentRows = [],
    intelligenceRows = [],
  } = input || {};
  const clientId = clean(client?.id);
  const completeSessions = completedSessions(sessionRows);
  const goodPayments = verifiedPayments(paymentRows);
  const pendingReviews = unresolvedReviews(reviewRows);
  const sourceNoteCount = stagingRows.filter((row) => hasClientTag(row?.fields?.line_tags_raw)).length;
  const clientFields = client?.fields || {};
  const memberFields = member?.fields || {};
  const doNotContact = truthy(clientFields["Do Not Contact"] ?? clientFields.do_not_contact ?? memberFields["Do Not Contact"] ?? memberFields.do_not_contact);
  const lastService = latestDate(completeSessions.map(sessionDate));
  const lastActivity = latestDate([
    lastService,
    ...goodPayments.map(paymentDate),
    clientFields["Last Contacted"],
    clientFields["Last Booking Date"],
    memberFields["Last Activity"],
    memberFields["Last Booking Date"],
  ]);
  const days = daysBetween(now, lastActivity);
  const lifecycle = lifecycleStatus(days, doNotContact, thresholds);
  const renewal = renewalState(member, now, thresholds);
  const points = currentPoints(member, pendingReviews.length);
  const verifiedSpend = Math.max(serviceSpend(completeSessions), paidSpend(goodPayments));
  const highValue = verifiedSpend >= thresholds.highValueSpendThb;
  const identityBlocked = !clientId || memberAmbiguous;
  const action = chooseAction({ identityBlocked, unresolvedCount: pendingReviews.length, pointsState: points.state, renewal, lifecycle, doNotContact, highValue });
  const flags = [];
  if (identityBlocked) flags.push("identity_review_required");
  if (pendingReviews.length) flags.push("history_review_required");
  if (["review_required", "checking"].includes(points.state)) flags.push("points_reconciliation_required");
  if (renewal.due) flags.push("renewal_due");
  if (renewal.overdue) flags.push("renewal_overdue");
  if (lifecycle === "follow_up_30d") flags.push("follow_up");
  if (lifecycle === "dormant_90d") flags.push("dormant");
  if (lifecycle === "lost_180d") flags.push("lost");
  if (highValue && ["dormant_90d", "lost_180d"].includes(lifecycle)) flags.push("high_value_reactivation");
  if (truthy(memberFields["VIP Eligible?"] ?? memberFields.vip_eligible)) flags.push("vip_candidate");
  if (truthy(memberFields["SVIP Eligible?"] ?? memberFields.svip_eligible)) flags.push("svip_candidate");
  if (doNotContact) flags.push("do_not_contact");

  const quality = dataQuality({
    canonicalClient: Boolean(clientId),
    memberAmbiguous,
    sourceNotes: sourceNoteCount,
    unresolvedCount: pendingReviews.length,
    sessionCount: completeSessions.length,
    paymentCount: goodPayments.length,
    pointsState: points.state,
  });

  const historyBackfillStatus = identityBlocked ? "blocked" : pendingReviews.length ? "review_required" : sourceNoteCount ? "reconciled" : "pending";
  const projection = {
    schema: AUTHORITY,
    client_id: clientId || null,
    member_id: clean(memberFields.member_id) || null,
    source_note_count: sourceNoteCount,
    completed_service_count: completeSessions.length,
    unresolved_history_reviews: pendingReviews.length,
    last_service_date: dateOnly(lastService) || null,
    days_since_activity: days,
    lifecycle_status: lifecycle,
    current_points_confirmed: points.value,
    points_state: points.state,
    verified_service_spend_thb: Math.round(verifiedSpend * 100) / 100,
    model_review_evidence_count: intelligenceCount(intelligenceRows),
    attention_flags: flags,
    computed_at: now.toISOString(),
  };

  return {
    reconciliation_id: clientId ? `client:${clientId}` : "",
    clientId,
    memberRecordId: clean(member?.id),
    fields: {
      reconciliation_id: clientId ? `client:${clientId}` : "",
      ...(clientId ? { Client: [clientId] } : {}),
      ...(member?.id ? { Member: [member.id] } : {}),
      history_backfill_status: historyBackfillStatus,
      lifecycle_status: lifecycle,
      action_status: action.status,
      next_best_action: action.action,
      next_best_action_reason: action.reason,
      ...(lastActivity ? { last_activity_at: lastActivity } : {}),
      ...(lastService ? { last_service_date: dateOnly(lastService) } : {}),
      ...(days != null ? { days_since_activity: days } : {}),
      source_note_count: sourceNoteCount,
      completed_service_count: completeSessions.length,
      verified_service_spend_thb: Math.round(verifiedSpend * 100) / 100,
      ...(points.value != null ? { current_points_confirmed: points.value } : {}),
      points_state: points.state,
      unresolved_history_reviews: pendingReviews.length,
      model_review_evidence_count: intelligenceCount(intelligenceRows),
      data_quality_score: quality / 100,
      ...(flags.length ? { attention_flags: flags } : {}),
      projection_json: JSON.stringify(projection),
      authority: AUTHORITY,
      computed_at: now.toISOString(),
    },
    projection,
  };
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
    const updated = await airtable.requestWithFieldFallback(RECONCILIATION_TABLE, { method: "PATCH", recordId: existing.id, body: { fields: result.fields } });
    return { record_id: clean(updated?.id || existing.id), created: false };
  }
  const created = await airtable.requestWithFieldFallback(RECONCILIATION_TABLE, { method: "POST", body: { fields: result.fields } });
  return { record_id: clean(created?.id), created: true };
}

async function reconcileClientLifecycle({ apply = false, clientId = "", airtable = new AirtableClient(), now = new Date(), thresholds = DEFAULT_THRESHOLDS } = {}) {
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
    const result = buildProjection({
      client: clientMap.get(canonicalId),
      member: memberMatch.row,
      memberAmbiguous: memberMatch.ambiguous,
      stagingRows: sourceRows,
      reviewRows: reviewsByClient.get(canonicalId) || [],
      sessionRows: sessionsByClient.get(canonicalId) || [],
      paymentRows: paymentsByClient.get(canonicalId) || [],
      intelligenceRows: intelligenceByClient.get(canonicalId) || [],
    }, now, thresholds);
    results.push(result);
  }

  if (!apply) {
    return {
      ok: true,
      dry_run: true,
      schema: AUTHORITY,
      client_tag_rows_scanned: staging.length,
      canonical_clients_in_cohort: cohort.size,
      unmatched_or_uncommitted_rows: unmatched.length,
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
    client_tag_rows_scanned: staging.length,
    canonical_clients_in_cohort: cohort.size,
    unmatched_or_uncommitted_rows: unmatched.length,
    projected_rows_written: writes.length,
    writes,
    truth_writes: false,
    forbidden_writes: ["MMD — Member Entitlements", "Members.Membership Tier", "Members.Membership Status", "MMD — Points Ledger"],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = await reconcileClientLifecycle(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, schema: AUTHORITY, error: String(error?.code || error?.message || error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  AUTHORITY,
  DEFAULT_THRESHOLDS,
  buildProjection,
  canonicalClientIdFromStaging,
  chooseAction,
  currentPoints,
  hasClientTag,
  lifecycleStatus,
  parseArgs,
  reconcileClientLifecycle,
  renewalState,
};
