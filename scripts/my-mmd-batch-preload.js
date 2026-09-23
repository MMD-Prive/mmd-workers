#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { AirtableClient } = require("./line-official-legacy/dry-run-import.js");
const {
  DEFAULT_THRESHOLDS,
  lifecycleStatus,
  renewalState,
} = require("./line-official-legacy/client-lifecycle-reconciliation.js");

const SCHEMA = "my_mmd_batch_preload_v1";
const POINT_RATE_THB = 100;
const SPEND_WINDOW_DAYS = 365;
const MAX_AUTO_SERVICE_AMOUNT_THB = Number(process.env.MY_MMD_MAX_AUTO_SERVICE_AMOUNT_THB || 500000);

const TABLES = Object.freeze({
  clients: process.env.AIRTABLE_TABLE_CLIENTS || "tblVv58TCbwh5j1fS",
  members: process.env.AIRTABLE_TABLE_MEMBERS || "tblgWc5VRon5o8Mhk",
  legacyStaging: process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G",
  privateStaging: process.env.AIRTABLE_PRIVATE_LINE_OFC_STAGING_TABLE_ID || "tblOs8yyLK09SKrCt",
  reviews: process.env.AIRTABLE_CUSTOMER_HISTORY_REVIEWS_TABLE || "tblnpDFQMpo8AmNQv",
  sessions: process.env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX",
  payments: process.env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ",
  points: process.env.AIRTABLE_TABLE_POINTS_LEDGER || "tbl5dfnwjUFMLbnWL",
  intelligence: process.env.AIRTABLE_CLIENT_INTELLIGENCE_EVIDENCE_TABLE || "tblx7NdfHO5iY6qtg",
  reconciliation: process.env.AIRTABLE_CLIENT_LIFECYCLE_RECONCILIATION_TABLE || "tblNV1b5sMC2fQPxt",
});

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function selectName(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return clean(value.name || value.value || value.id);
  return clean(value);
}

function token(value) {
  return selectName(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value) {
  const parsed = number(value);
  return parsed != null && parsed > 0 ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

function linkedIds(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clean(typeof item === "object" ? item?.id : item))
    .filter(Boolean);
}

function dateMs(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value) {
  const ms = dateMs(value);
  return ms ? new Date(ms).toISOString().slice(0, 10) : "";
}

function cutoffDate(now, days = SPEND_WINDOW_DAYS) {
  const date = new Date(now instanceof Date ? now.getTime() : Date.parse(now));
  if (!Number.isFinite(date.getTime())) return "0000-00-00";
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function batchWindow(now, hours = 6) {
  const date = new Date(now instanceof Date ? now.getTime() : Date.parse(now));
  if (!Number.isFinite(date.getTime())) return "";
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(Math.floor(date.getUTCHours() / hours) * hours);
  return date.toISOString();
}

function normalizeEmail(value) {
  const result = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : "";
}

function normalizePhone(value) {
  const raw = clean(value);
  const digits = raw.replace(/\D/g, "");
  if (/^0[689]\d{8}$/.test(digits)) return `+66${digits.slice(1)}`;
  if (/^66[689]\d{8}$/.test(digits)) return `+${digits}`;
  if (raw.startsWith("+") && /^\d{8,15}$/.test(digits)) return `+${digits}`;
  return "";
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 32);
}

function indexByLinkedClient(records, fieldNames) {
  const result = new Map();
  for (const row of records || []) {
    const fields = row?.fields || {};
    let ids = [];
    for (const fieldName of fieldNames) {
      ids = linkedIds(fields[fieldName]);
      if (ids.length) break;
    }
    for (const id of ids) {
      if (!result.has(id)) result.set(id, []);
      result.get(id).push(row);
    }
  }
  return result;
}

function memberForClient(members, clientId) {
  const matches = (members || []).filter((row) => linkedIds(row?.fields?.Clients || row?.fields?.Client).includes(clientId));
  return {
    row: matches.length === 1 ? matches[0] : null,
    ambiguous: matches.length > 1,
    count: matches.length,
  };
}

function isCompletedSession(row) {
  const fields = row?.fields || {};
  const status = token(fields["Session Status"] || fields.session_state || fields.status);
  const importStatus = token(fields.import_review_status);
  return ["completed", "complete", "done"].includes(status) && (!importStatus || importStatus === "approved");
}

function isTrSession(row) {
  const fields = row?.fields || {};
  const values = [fields["Session Type"], fields.job_type, fields.session_type_raw, fields.service_type]
    .map((value) => token(value))
    .filter(Boolean);
  return values.some((value) => value === "tr" || value.startsWith("tr_") || value.endsWith("_tr"));
}

function sessionDate(row) {
  const fields = row?.fields || {};
  return dateOnly(fields.job_date || fields["Session Date"] || fields.completed_at || fields.created_at || row?.createdTime);
}

function paymentDate(row) {
  const fields = row?.fields || {};
  return fields["Payment Date"] || fields["Created At"] || fields.created_at || row?.createdTime;
}

function isVerifiedPayment(row) {
  const fields = row?.fields || {};
  const status = token(fields["Payment Status"] || fields.payment_status);
  const verification = token(fields["Verification Status"] || fields.verification_status);
  const importStatus = token(fields.import_review_status);
  const evidence = token(fields.payment_evidence_source);
  const paid = ["paid", "completed", "settled", "full_payment"].includes(status);
  const verified = verification === "verified" || importStatus === "approved" || evidence === "imported_history";
  return paid && verified;
}

function verifiedPaymentIndexes(rows) {
  const bySession = new Map();
  const verified = [];
  for (const row of rows || []) {
    if (!isVerifiedPayment(row)) continue;
    verified.push(row);
    const sessionId = clean(row?.fields?.session_id);
    if (sessionId) bySession.set(sessionId, row);
  }
  return { bySession, verified };
}

function trustedSessionAmount(row, paymentIndexes, maxAmount = MAX_AUTO_SERVICE_AMOUNT_THB) {
  const fields = row?.fields || {};
  const canonicalAmount = money(fields["Total Amount"] ?? fields.final_total_amount ?? fields.total_amount);
  if (canonicalAmount > 0 && canonicalAmount <= maxAmount) return { amount: canonicalAmount, source: "canonical_total", anomaly: false };
  if (canonicalAmount > maxAmount) return { amount: 0, source: "canonical_total", anomaly: true, raw_amount: canonicalAmount };

  const secondaryAmount = money(fields.amount_thb ?? fields.base_service_amount);
  if (!secondaryAmount) return { amount: 0, source: "missing", anomaly: false };
  if (secondaryAmount > maxAmount) return { amount: 0, source: "secondary_amount", anomaly: true, raw_amount: secondaryAmount };

  const sessionId = clean(fields.session_id);
  const statusVerified = ["verified", "paid"].includes(token(fields.status || fields.payment_status));
  const linkedVerifiedPayment = Boolean(sessionId && paymentIndexes.bySession.has(sessionId));
  if (statusVerified || linkedVerifiedPayment) {
    return { amount: secondaryAmount, source: statusVerified ? "verified_session" : "verified_payment", anomaly: false };
  }
  return { amount: 0, source: "unverified_secondary_amount", anomaly: true, raw_amount: secondaryAmount };
}

function buildServiceSummary(sessionRows = [], paymentRows = [], now = new Date(), maxAmount = MAX_AUTO_SERVICE_AMOUNT_THB) {
  const paymentIndexes = verifiedPaymentIndexes(paymentRows);
  const cutoff = cutoffDate(now);
  const today = dateOnly(now);
  const byKey = new Map();
  let trExcludedCount = 0;

  for (const row of sessionRows || []) {
    if (!isCompletedSession(row)) continue;
    if (isTrSession(row)) {
      trExcludedCount += 1;
      continue;
    }
    const fields = row?.fields || {};
    const key = clean(fields.session_id || fields.job_id || fields.imported_source_ref || row?.id);
    if (!key) continue;
    const amount = trustedSessionAmount(row, paymentIndexes, maxAmount);
    const event = {
      key,
      record_id: clean(row?.id),
      date: sessionDate(row),
      amount_thb: amount.amount,
      amount_source: amount.source,
      amount_anomaly: amount.anomaly,
      raw_amount_thb: amount.raw_amount || 0,
    };
    const prior = byKey.get(key);
    if (!prior || event.amount_thb > prior.amount_thb || (!prior.date && event.date)) byKey.set(key, event);
  }

  const events = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
  const lifetimeSpend = events.reduce((sum, event) => sum + event.amount_thb, 0);
  const eligibleEvents = events.filter((event) => event.date && event.date >= cutoff && (!today || event.date <= today));
  const eligibleSpend365 = eligibleEvents.reduce((sum, event) => sum + event.amount_thb, 0);
  return {
    completed_service_count: events.length,
    spend_eligible_service_count: events.filter((event) => event.amount_thb > 0).length,
    lifetime_service_spend_thb: Math.round(lifetimeSpend * 100) / 100,
    eligible_service_spend_365d_thb: Math.round(eligibleSpend365 * 100) / 100,
    points_earned_lifetime_projected: Math.floor(lifetimeSpend / POINT_RATE_THB),
    points_earned_365d_analytical: Math.floor(eligibleSpend365 / POINT_RATE_THB),
    amount_anomaly_count: events.filter((event) => event.amount_anomaly).length,
    missing_or_unverified_amount_count: events.filter((event) => event.amount_thb <= 0).length,
    tr_excluded_count: trExcludedCount,
    last_service_date: events.map((event) => event.date).filter(Boolean).sort().at(-1) || "",
    events,
  };
}

function pointValue(fields = {}) {
  const explicit = number(fields.points);
  if (explicit != null) return Math.trunc(explicit);
  const amount = number(fields.eligible_amount_thb ?? fields.amount_thb);
  return amount == null ? null : Math.floor(amount / POINT_RATE_THB);
}

function isLegacyAggregatePoint(fields = {}) {
  const key = clean(fields.idempotency_key || fields.logical_source_id).toLowerCase();
  return key.startsWith("historical_note_total_v2:") || key.startsWith("historical_note_total_v1:");
}

function summarizeLifetimePoints(rows = []) {
  const seen = new Set();
  let balance = 0;
  let earned = 0;
  let redeemed = 0;
  let activeRecords = 0;
  let legacyAggregates = 0;

  for (const row of rows || []) {
    const fields = row?.fields || {};
    const status = token(fields.transaction_status || fields.status);
    if (!["posted", "completed", "verified"].includes(status) || fields.reversed_at) continue;
    if (isLegacyAggregatePoint(fields)) legacyAggregates += 1;
    const key = clean(fields.idempotency_key || fields.logical_source_id || fields.transaction_id || row?.id);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const points = pointValue(fields);
    if (points == null) continue;
    activeRecords += 1;
    balance += points;
    if (points >= 0) earned += points;
    else redeemed += Math.abs(points);
  }

  return {
    current_points_confirmed: Math.max(0, Math.trunc(balance)),
    points_earned_lifetime_ledger: Math.max(0, Math.trunc(earned)),
    points_redeemed_lifetime: Math.max(0, Math.trunc(redeemed)),
    points_active_record_count: activeRecords,
    points_expiring_30d: 0,
    nearest_points_expiry: null,
    legacy_aggregate_count: legacyAggregates,
  };
}

function pointsRowsForMember(rows, member) {
  if (!member) return [];
  const fields = member.fields || {};
  const memberId = clean(fields.member_id);
  const emails = new Set([
    normalizeEmail(fields["Contact Email"]),
    normalizeEmail(fields.email),
  ].filter(Boolean));
  return (rows || []).filter((row) => {
    const pointFields = row?.fields || {};
    return (memberId && clean(pointFields.member_id) === memberId)
      || (emails.size > 0 && emails.has(normalizeEmail(pointFields.member_email)));
  });
}

function unresolvedReviews(rows = []) {
  return rows.filter((row) => {
    const fields = row?.fields || {};
    const review = token(fields.review_status);
    const materialization = token(fields.materialization_status);
    if (["rejected", "ignored", "materialized", "complete", "completed"].includes(review)) return false;
    if (["materialized", "complete", "completed"].includes(materialization)) return false;
    return true;
  });
}

function reviewedLegacyIds(rows = []) {
  const result = new Set();
  for (const row of rows) for (const id of linkedIds(row?.fields?.["LINE OFC Import Row"])) result.add(id);
  return result;
}

function hasLegacyHistoryEvidence(row) {
  const fields = row?.fields || {};
  return /(?:^|[\s,;|])#client(?:$|[\s,;|])/i.test(` ${clean(fields.line_tags_raw)} `)
    || clean(fields.raw_note)
    || clean(fields.historical_events_json);
}

function hasPrivateHistoryCandidate(row) {
  const fields = row?.fields || {};
  const raw = clean(fields["Service History Candidate JSON"]);
  if (!raw || raw === "{}" || raw === "[]" || raw === "null") return false;
  return true;
}

function latestIso(values) {
  const best = Math.max(0, ...values.map(dateMs));
  return best ? new Date(best).toISOString() : "";
}

function truthy(value) {
  if (value === true) return true;
  return ["true", "yes", "1", "y", "on"].includes(token(value));
}

function lifecycleAction({ identityBlocked, backlogCount, amountAnomalies, pointsMismatch, renewal, lifecycle, doNotContact }) {
  if (identityBlocked) return { status: "blocked", action: "Review client identity match", reason: "Canonical LINE identity or Member link is ambiguous." };
  if (doNotContact) return { status: "healthy", action: "Do not contact", reason: "Client contact suppression is active." };
  if (amountAnomalies > 0) return { status: "needs_review", action: "Review historical service amounts", reason: `${amountAnomalies} completed service amount(s) failed the automatic amount guardrail.` };
  if (backlogCount > 0) return { status: "needs_review", action: "Review historical LINE OFC evidence", reason: `${backlogCount} historical evidence item(s) remain unresolved.` };
  if (pointsMismatch) return { status: "needs_review", action: "Reconcile lifetime points wallet", reason: "Confirmed lifetime service spend and posted lifetime Points do not yet agree." };
  if (renewal.overdue) return { status: "needs_action", action: "Follow up overdue membership renewal", reason: "Canonical membership renewal date has passed." };
  if (renewal.due) return { status: "needs_action", action: "Prepare membership renewal", reason: `Canonical renewal is due within ${renewal.daysToDue} day(s).` };
  if (lifecycle === "lost_180d") return { status: "needs_action", action: "Client reactivation", reason: "No canonical activity for at least 180 days." };
  if (lifecycle === "dormant_90d") return { status: "needs_action", action: "Re-engage dormant client", reason: "No canonical activity for at least 90 days." };
  if (lifecycle === "follow_up_30d") return { status: "needs_action", action: "Light follow-up", reason: "Client has crossed the 30-day follow-up interval." };
  if (lifecycle === "unknown") return { status: "needs_review", action: "Establish last verified activity", reason: "No canonical activity date is available." };
  return { status: "healthy", action: "No action required", reason: "Preloaded customer history is current and has no higher-priority flag." };
}

function buildClientProjection(input, now = new Date(), thresholds = DEFAULT_THRESHOLDS) {
  const client = input?.client || null;
  const member = input?.member || null;
  const clientId = clean(client?.id);
  const clientFields = client?.fields || {};
  const memberFields = member?.fields || {};
  const memberAmbiguous = input?.memberAmbiguous === true;
  const duplicateLineIdentity = input?.duplicateLineIdentity === true;
  const reviewRows = input?.reviewRows || [];
  const legacyRows = input?.legacyRows || [];
  const privateRows = input?.privateRows || [];
  const paymentRows = input?.paymentRows || [];
  const service = buildServiceSummary(input?.sessionRows || [], paymentRows, now);
  const pendingReviews = unresolvedReviews(reviewRows);
  const reviewedIds = reviewedLegacyIds(reviewRows);
  const unqueuedLegacyCount = legacyRows.filter((row) => hasLegacyHistoryEvidence(row) && !reviewedIds.has(clean(row?.id))).length;
  const privateCandidateCount = privateRows.filter(hasPrivateHistoryCandidate).length;
  const backlogCount = pendingReviews.length + unqueuedLegacyCount + privateCandidateCount;

  const memberPointRows = pointsRowsForMember(input?.pointsRows || [], member);
  const points = summarizeLifetimePoints(memberPointRows);
  const pointsMismatch = service.points_earned_lifetime_projected !== points.points_earned_lifetime_ledger;
  const pointsState = !member
    ? "no_member_wallet"
    : backlogCount > 0 || service.amount_anomaly_count > 0 || pointsMismatch
      ? "review_required"
      : "confirmed";

  const lineUserId = clean(clientFields.line_user_id);
  const email = normalizeEmail(clientFields["Contact Email"] || clientFields.email || memberFields["Contact Email"] || memberFields.email);
  const phone = normalizePhone(clientFields["Phone Number"] || clientFields.phone || memberFields["Phone Number"] || memberFields.phone);
  const identityBlocked = !clientId || memberAmbiguous || duplicateLineIdentity;
  const identityState = identityBlocked ? "review_required" : lineUserId && (email || phone) ? "ready" : lineUserId ? "contact_enrichment_pending" : "line_identity_missing";
  const verifiedPayments = paymentRows.filter(isVerifiedPayment);
  const lastActivity = latestIso([
    service.last_service_date,
    ...verifiedPayments.map(paymentDate),
    clientFields["Last Contacted"],
    clientFields["Last Booking Date"],
    memberFields["Last Activity"],
    memberFields["Last Booking Date"],
  ]);
  const daysSince = lastActivity ? Math.max(0, Math.floor(((now instanceof Date ? now.getTime() : Date.parse(now)) - dateMs(lastActivity)) / 86400000)) : null;
  const doNotContact = truthy(clientFields["Do Not Contact"] ?? clientFields.do_not_contact ?? memberFields["Do Not Contact"] ?? memberFields.do_not_contact);
  const lifecycle = lifecycleStatus(daysSince, doNotContact, thresholds);
  const renewal = renewalState(member, now, thresholds);
  const action = lifecycleAction({
    identityBlocked,
    backlogCount,
    amountAnomalies: service.amount_anomaly_count,
    pointsMismatch,
    renewal,
    lifecycle,
    doNotContact,
  });

  const flags = [];
  if (identityBlocked) flags.push("identity_review_required");
  if (backlogCount || service.amount_anomaly_count) flags.push("history_review_required");
  if (pointsMismatch) flags.push("points_reconciliation_required");
  if (renewal.due) flags.push("renewal_due");
  if (renewal.overdue) flags.push("renewal_overdue");
  if (doNotContact) flags.push("do_not_contact");

  const sourceNoteCount = legacyRows.filter(hasLegacyHistoryEvidence).length + privateCandidateCount;
  const qualityParts = [Boolean(clientId), !identityBlocked, Boolean(lineUserId), Boolean(email || phone), backlogCount === 0, service.amount_anomaly_count === 0, !pointsMismatch];
  const dataQuality = Math.round((qualityParts.filter(Boolean).length / qualityParts.length) * 100) / 100;
  const historyStatus = identityBlocked ? "blocked" : backlogCount || service.amount_anomaly_count ? "review_required" : "reconciled";
  const verifiedPaymentTotal = verifiedPayments.reduce((sum, row) => sum + money(row?.fields?.Amount ?? row?.fields?.amount_thb), 0);

  const projection = {
    schema: SCHEMA,
    as_of_date: dateOnly(now),
    batch_window: batchWindow(now),
    client_id: clientId || null,
    member_id: clean(memberFields.member_id) || null,
    identity: {
      state: identityState,
      line_present: Boolean(lineUserId),
      email_present: Boolean(email),
      phone_present: Boolean(phone),
      member_linked: Boolean(member),
      member_match_count: Number(input?.memberMatchCount || (member ? 1 : 0)),
    },
    history_backfill_status: historyStatus,
    source_note_count: sourceNoteCount,
    private_history_candidate_count: privateCandidateCount,
    unqueued_legacy_history_count: unqueuedLegacyCount,
    unresolved_history_reviews: pendingReviews.length,
    completed_service_count: service.completed_service_count,
    spend_eligible_service_count: service.spend_eligible_service_count,
    lifetime_service_spend_thb: service.lifetime_service_spend_thb,
    eligible_service_spend_365d_thb: service.eligible_service_spend_365d_thb,
    verified_payment_total_thb: Math.round(verifiedPaymentTotal * 100) / 100,
    amount_anomaly_count: service.amount_anomaly_count,
    missing_or_unverified_amount_count: service.missing_or_unverified_amount_count,
    tr_excluded_count: service.tr_excluded_count,
    last_service_date: service.last_service_date || null,
    last_activity_at: lastActivity || null,
    days_since_activity: daysSince,
    lifecycle_status: lifecycle,
    points_policy: {
      thb_per_point: POINT_RATE_THB,
      expires: false,
      validity_days: null,
      mode: "lifetime_total",
      tr_eligible: false,
      completed_jobs_only: true,
    },
    points_state: pointsState,
    current_points_confirmed: points.current_points_confirmed,
    points_earned_lifetime_projected: service.points_earned_lifetime_projected,
    points_earned_lifetime_ledger: points.points_earned_lifetime_ledger,
    points_redeemed_lifetime: points.points_redeemed_lifetime,
    points_active_record_count: points.points_active_record_count,
    points_earned_365d_analytical: service.points_earned_365d_analytical,
    points_expiring_30d: points.points_expiring_30d,
    nearest_points_expiry: points.nearest_points_expiry,
    legacy_aggregate_count: points.legacy_aggregate_count,
    model_review_evidence_count: (input?.intelligenceRows || []).length,
    attention_flags: flags,
    authority: SCHEMA,
  };
  projection.source_fingerprint = fingerprint(projection);
  projection.computed_at = now.toISOString();

  return {
    clientId,
    reconciliationId: clientId ? `client:${clientId}` : "",
    projection,
    fields: {
      reconciliation_id: clientId ? `client:${clientId}` : "",
      ...(clientId ? { Client: [clientId] } : {}),
      ...(member?.id ? { Member: [member.id] } : {}),
      history_backfill_status: historyStatus,
      lifecycle_status: lifecycle,
      action_status: action.status,
      next_best_action: action.action,
      next_best_action_reason: action.reason,
      ...(lastActivity ? { last_activity_at: lastActivity } : {}),
      ...(service.last_service_date ? { last_service_date: service.last_service_date } : {}),
      ...(daysSince != null ? { days_since_activity: daysSince } : {}),
      source_note_count: sourceNoteCount,
      completed_service_count: service.completed_service_count,
      verified_service_spend_thb: service.lifetime_service_spend_thb,
      current_points_confirmed: points.current_points_confirmed,
      points_state: pointsState,
      unresolved_history_reviews: backlogCount,
      model_review_evidence_count: (input?.intelligenceRows || []).length,
      data_quality_score: dataQuality,
      ...(flags.length ? { attention_flags: flags } : {}),
      projection_json: JSON.stringify(projection),
      authority: SCHEMA,
      computed_at: now.toISOString(),
      lifetime_service_spend_thb: service.lifetime_service_spend_thb,
      eligible_service_spend_365d_thb: service.eligible_service_spend_365d_thb,
      points_earned_lifetime_projected: service.points_earned_lifetime_projected,
      points_expiring_30d: points.points_expiring_30d,
      preload_state: historyStatus,
      source_fingerprint: projection.source_fingerprint,
      identity_state: identityState,
    },
  };
}

function canonicalClientIdFromLegacy(row) {
  const fields = row?.fields || {};
  const ids = new Set([
    ...linkedIds(fields.matched_client || fields.Client),
    ...[clean(fields.matched_client_id || fields.canonical_client_id)].filter(Boolean),
  ]);
  const review = token(fields.review_status);
  const decision = token(fields.decision);
  return review === "committed" && decision === "link_existing_client" && ids.size === 1 ? [...ids][0] : "";
}

function canonicalClientIdFromPrivate(row) {
  const ids = linkedIds(row?.fields?.["Canonical Client"] || row?.fields?.Client);
  return ids.length === 1 ? ids[0] : "";
}

function lineIdentityCounts(clients) {
  const counts = new Map();
  for (const row of clients || []) {
    const id = clean(row?.fields?.line_user_id);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

function parseArgs(argv) {
  const out = { apply: false, assertIdempotent: false, clientId: "", reportPath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--apply") out.apply = true;
    if (argv[index] === "--assert-idempotent") out.assertIdempotent = true;
    if (argv[index] === "--client-id") out.clientId = clean(argv[index + 1]);
    if (argv[index] === "--report") out.reportPath = clean(argv[index + 1]);
  }
  return out;
}

function existingFingerprint(row) {
  try {
    const parsed = JSON.parse(clean(row?.fields?.projection_json));
    return clean(parsed?.source_fingerprint || row?.fields?.source_fingerprint);
  } catch {
    return clean(row?.fields?.source_fingerprint);
  }
}

function chunks(items, size = 10) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function writeProjectionBatch(airtable, creates, updates) {
  const writes = [];
  for (const batch of chunks(creates)) {
    const result = await airtable.requestBatchWithFieldFallback(TABLES.reconciliation, {
      method: "POST",
      body: { records: batch.map((item) => ({ fields: item.fields })) },
    });
    writes.push(...(result.records || []).map((row) => ({ record_id: clean(row.id), created: true })));
  }
  for (const batch of chunks(updates)) {
    const result = await airtable.requestBatchWithFieldFallback(TABLES.reconciliation, {
      method: "PATCH",
      body: { records: batch.map((item) => ({ id: item.recordId, fields: item.fields })) },
    });
    writes.push(...(result.records || []).map((row) => ({ record_id: clean(row.id), created: false })));
  }
  return writes;
}

async function runBatchPreload({
  apply = false,
  assertIdempotent = false,
  clientId = "",
  reportPath = "",
  airtable = new AirtableClient(),
  now = new Date(),
  thresholds = DEFAULT_THRESHOLDS,
} = {}) {
  const [clients, members, legacy, privateRows, reviews, sessions, payments, points, intelligence, existing] = await Promise.all([
    airtable.list(TABLES.clients),
    airtable.list(TABLES.members),
    airtable.list(TABLES.legacyStaging, { filterByFormula: `FIND("#client",LOWER({line_tags_raw}&""))>0` }),
    airtable.list(TABLES.privateStaging),
    airtable.list(TABLES.reviews),
    airtable.list(TABLES.sessions),
    airtable.list(TABLES.payments),
    airtable.list(TABLES.points),
    airtable.list(TABLES.intelligence).catch(() => []),
    airtable.list(TABLES.reconciliation),
  ]);

  if (!clients.length || clients.length > 5000) throw new Error(`MY_MMD_PRELOAD_CLIENT_GUARDRAIL:${clients.length}`);
  const selectedClients = clientId ? clients.filter((row) => clean(row.id) === clientId) : clients;
  if (clientId && selectedClients.length !== 1) throw new Error("MY_MMD_PRELOAD_CLIENT_NOT_FOUND");
  const clientIds = new Set(clients.map((row) => clean(row.id)));
  const legacyByClient = new Map();
  const privateByClient = new Map();
  const unmatchedLegacy = [];
  const unmatchedPrivate = [];
  for (const row of legacy) {
    const id = canonicalClientIdFromLegacy(row);
    if (!id || !clientIds.has(id)) {
      unmatchedLegacy.push(clean(row?.id));
      continue;
    }
    if (!legacyByClient.has(id)) legacyByClient.set(id, []);
    legacyByClient.get(id).push(row);
  }
  for (const row of privateRows) {
    const id = canonicalClientIdFromPrivate(row);
    if (!id || !clientIds.has(id)) {
      if (hasPrivateHistoryCandidate(row)) unmatchedPrivate.push(clean(row?.id));
      continue;
    }
    if (!privateByClient.has(id)) privateByClient.set(id, []);
    privateByClient.get(id).push(row);
  }

  const reviewsByClient = indexByLinkedClient(reviews, ["Client"]);
  const sessionsByClient = indexByLinkedClient(sessions, ["Client"]);
  const paymentsByClient = indexByLinkedClient(payments, ["Client"]);
  const intelligenceByClient = indexByLinkedClient(intelligence, ["Client", "client"]);
  const lineCounts = lineIdentityCounts(clients);
  const results = [];
  for (const client of selectedClients) {
    const id = clean(client.id);
    const memberMatch = memberForClient(members, id);
    const lineId = clean(client?.fields?.line_user_id);
    results.push(buildClientProjection({
      client,
      member: memberMatch.row,
      memberAmbiguous: memberMatch.ambiguous,
      memberMatchCount: memberMatch.count,
      duplicateLineIdentity: Boolean(lineId && lineCounts.get(lineId) > 1),
      legacyRows: legacyByClient.get(id) || [],
      privateRows: privateByClient.get(id) || [],
      reviewRows: reviewsByClient.get(id) || [],
      sessionRows: sessionsByClient.get(id) || [],
      paymentRows: paymentsByClient.get(id) || [],
      pointsRows: points,
      intelligenceRows: intelligenceByClient.get(id) || [],
    }, now, thresholds));
  }

  if (results.length !== selectedClients.length) throw new Error("MY_MMD_PRELOAD_PROJECTION_ACCOUNTING_GUARDRAIL");
  const existingById = new Map(existing.map((row) => [clean(row?.fields?.reconciliation_id), row]));
  const creates = [];
  const updates = [];
  const unchanged = [];
  for (const result of results) {
    const current = existingById.get(result.reconciliationId);
    if (!current) creates.push(result);
    else if (existingFingerprint(current) === result.projection.source_fingerprint) unchanged.push(result);
    else updates.push({ ...result, recordId: clean(current.id) });
  }
  if (creates.length + updates.length > selectedClients.length) throw new Error("MY_MMD_PRELOAD_WRITE_GUARDRAIL");

  const summary = {
    schema: SCHEMA,
    mode: apply ? "apply" : "dry_run",
    canonical_clients_scanned: selectedClients.length,
    members_scanned: members.length,
    legacy_history_rows_scanned: legacy.length,
    private_staging_rows_scanned: privateRows.length,
    reviews_scanned: reviews.length,
    sessions_scanned: sessions.length,
    payments_scanned: payments.length,
    points_rows_scanned: points.length,
    unmatched_legacy_rows: unmatchedLegacy.length,
    unmatched_private_history_candidates: unmatchedPrivate.length,
    planned_creates: creates.length,
    planned_updates: updates.length,
    unchanged: unchanged.length,
    history_state: {},
    identity_state: {},
    points_state: {},
    completed_service_count: 0,
    lifetime_service_spend_thb: 0,
    eligible_service_spend_365d_thb: 0,
    amount_anomaly_count: 0,
    review_backlog_count: 0,
  };
  for (const result of results) {
    const projection = result.projection;
    summary.history_state[projection.history_backfill_status] = (summary.history_state[projection.history_backfill_status] || 0) + 1;
    summary.identity_state[projection.identity.state] = (summary.identity_state[projection.identity.state] || 0) + 1;
    summary.points_state[projection.points_state] = (summary.points_state[projection.points_state] || 0) + 1;
    summary.completed_service_count += projection.completed_service_count;
    summary.lifetime_service_spend_thb += projection.lifetime_service_spend_thb;
    summary.eligible_service_spend_365d_thb += projection.eligible_service_spend_365d_thb;
    summary.amount_anomaly_count += projection.amount_anomaly_count;
    summary.review_backlog_count += projection.unresolved_history_reviews + projection.unqueued_legacy_history_count + projection.private_history_candidate_count;
  }
  summary.lifetime_service_spend_thb = Math.round(summary.lifetime_service_spend_thb * 100) / 100;
  summary.eligible_service_spend_365d_thb = Math.round(summary.eligible_service_spend_365d_thb * 100) / 100;

  let writes = [];
  if (apply && (creates.length || updates.length)) writes = await writeProjectionBatch(airtable, creates, updates);
  const result = {
    ok: true,
    dry_run: !apply,
    summary,
    projected_rows_written: writes.length,
    truth_writes: false,
    writes: writes.length ? writes : undefined,
    forbidden_writes: [
      "MMD — Member Entitlements",
      "Members.Membership Tier",
      "Members.Membership Status",
      "MMD — Points Ledger",
      "Payments",
      "Sessions",
    ],
  };
  if (reportPath) fs.writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  if (assertIdempotent && (creates.length || updates.length)) throw new Error(`MY_MMD_PRELOAD_IDEMPOTENCY_FAILED:${creates.length + updates.length}`);
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = await runBatchPreload(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, schema: SCHEMA, error: clean(error?.code || error?.message || error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  MAX_AUTO_SERVICE_AMOUNT_THB,
  POINT_RATE_THB,
  SPEND_WINDOW_DAYS,
  SCHEMA,
  TABLES,
  buildClientProjection,
  buildServiceSummary,
  canonicalClientIdFromLegacy,
  canonicalClientIdFromPrivate,
  hasPrivateHistoryCandidate,
  isLegacyAggregatePoint,
  parseArgs,
  runBatchPreload,
  summarizeLifetimePoints,
  trustedSessionAmount,
};
