#!/usr/bin/env node

const crypto = require("node:crypto");
const { AirtableClient } = require("./dry-run-import.js");

const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";
const CLIENTS_TABLE = process.env.AIRTABLE_CLIENTS_TABLE_ID || "tblVv58TCbwh5j1fS";
const MEMBERS_TABLE = process.env.AIRTABLE_TABLE_MEMBERS_ID || "tblgWc5VRon5o8Mhk";
const HISTORY_REVIEWS_TABLE = process.env.AIRTABLE_HISTORY_REVIEWS_TABLE_ID || "tblnpDFQMpo8AmNQv";
const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX";
const PAYMENTS_TABLE = process.env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ";
const POINTS_LEDGER_TABLE = process.env.AIRTABLE_TABLE_POINTS_LEDGER || "tbl5dfnwjUFMLbnWL";
const ENTITLEMENTS_TABLE = process.env.AIRTABLE_MEMBER_ENTITLEMENTS_TABLE_ID || "tblNImdF9PKAxhXGi";
const POINT_RATE_THB = 100;
const POINTS_BUCKET = "base_phase1";
const POINTS_SOURCE = "line_ofc_history";
const AUTHORITY = "my_mmd_entitlement_resolver_v1";
const MATERIALIZER = "history_materializer_v1";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function selectName(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return clean(value.name || value.value || value.id);
  return clean(value);
}

function parseArgs(argv) {
  const out = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--import-id") out.importId = argv[index + 1];
    if (arg === "--history-review-id") out.historyReviewId = argv[index + 1];
    if (arg === "--apply") out.apply = true;
  }
  return out;
}

function formulaString(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try {
    const parsed = JSON.parse(clean(value));
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function linkedIds(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clean(item?.id || item))
    .filter(Boolean);
}

function linkedClientIds(fields) {
  return linkedIds(fields.matched_client);
}

function reviewedClientId(fields) {
  return clean(fields.matched_client_id) || linkedClientIds(fields)[0] || "";
}

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function assertIdentityCommitGate(fields) {
  const status = selectName(fields.review_status).toLowerCase();
  const decision = selectName(fields.decision).toLowerCase();
  const source = selectName(fields.decision_source).toLowerCase();
  const reviewedBy = clean(fields.reviewed_by || fields.committed_by);
  const reviewedAt = clean(fields.reviewed_at || fields.committed_at);
  const clientId = reviewedClientId(fields);

  if (status !== "committed") throw coded("HISTORY_IDENTITY_REVIEW_NOT_COMMITTED");
  if (decision !== "link_existing_client") throw coded("HISTORY_IDENTITY_REVIEW_DECISION_REQUIRED");
  if (source !== "manual_review") throw coded("HISTORY_IDENTITY_MANUAL_REVIEW_REQUIRED");
  if (!reviewedBy || !Number.isFinite(Date.parse(reviewedAt))) throw coded("HISTORY_IDENTITY_REVIEW_EVIDENCE_REQUIRED");
  if (!/^rec[A-Za-z0-9]{10,30}$/.test(clientId)) throw coded("HISTORY_CANONICAL_CLIENT_REQUIRED");
  if (fields.dry_run_only === true) throw coded("HISTORY_IDENTITY_NOT_COMMITTED");

  return { clientId, reviewedBy, reviewedAt };
}

const assertReviewGate = assertIdentityCommitGate;

function parseHistoricalDate(value) {
  const raw = clean(value);
  if (!raw) return "";
  const iso = Date.parse(raw);
  if (Number.isFinite(iso) && /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(raw)) return new Date(iso).toISOString();

  const numeric = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numeric) {
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    if (year >= 2400) year -= 543;
    const month = Number(numeric[2]);
    const day = Number(numeric[1]);
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date.toISOString();
  }
  return "";
}

function deterministicToken(prefix, ...parts) {
  const hash = crypto.createHash("sha256").update(parts.map(clean).join("|")).digest("hex").slice(0, 24);
  return `${prefix}_${hash}`;
}

function defaultHistoryReviewId(importId) {
  return deterministicToken("hist_review", importId);
}

function serviceEventsFromFields(fields) {
  const history = parseJson(fields.historical_events_json, {});
  const amounts = Array.isArray(history.amounts) ? history.amounts : [];
  return amounts.filter((event) => clean(event?.type).toLowerCase() === "service" && Number(event?.amount) > 0);
}

function uniqueDates(fields) {
  const history = parseJson(fields.historical_events_json, {});
  const dates = Array.isArray(history.dates) ? history.dates : [];
  return [...new Set(dates.map(clean).filter(Boolean))];
}

function uniquePaymentRefs(fields) {
  const history = parseJson(fields.historical_events_json, {});
  const refs = Array.isArray(history.payment_refs) ? history.payment_refs : [];
  return [...new Set(refs.map(clean).filter(Boolean))];
}

function assertHistoricalEventGate(fields) {
  if (["true", "yes", "1"].includes(clean(fields.points_review_required).toLowerCase())) throw coded("HISTORY_POINTS_REVIEW_REQUIRED");
  if (Number(fields.unknown_amount || 0) > 0) throw coded("HISTORY_UNKNOWN_AMOUNT_REVIEW_REQUIRED");

  const serviceEvents = serviceEventsFromFields(fields);
  if (serviceEvents.length !== 1) throw coded(serviceEvents.length ? "HISTORY_MULTIPLE_SERVICE_EVENTS_REVIEW_REQUIRED" : "HISTORY_SERVICE_EVENT_REQUIRED");

  const dates = uniqueDates(fields);
  if (dates.length !== 1) throw coded(dates.length ? "HISTORY_MULTIPLE_DATES_REVIEW_REQUIRED" : "HISTORY_SERVICE_DATE_REQUIRED");
  const paidAt = parseHistoricalDate(dates[0]);
  if (!paidAt) throw coded("HISTORY_SERVICE_DATE_UNPARSEABLE");

  const amountThb = Math.round(Number(serviceEvents[0].amount) * 100) / 100;
  if (!Number.isFinite(amountThb) || amountThb <= 0) throw coded("HISTORY_SERVICE_AMOUNT_INVALID");
  const refs = uniquePaymentRefs(fields);
  if (refs.length > 1) throw coded("HISTORY_MULTIPLE_PAYMENT_REFS_REVIEW_REQUIRED");
  return { amountThb, paidAt, sourcePaymentRef: refs[0] || "", serviceEvent: serviceEvents[0] };
}

function assertHistoryApprovalGate(reviewFields, { stagingId, clientId }) {
  const reviewStatus = selectName(reviewFields.review_status).toLowerCase();
  const decision = selectName(reviewFields.decision).toLowerCase();
  const paymentStatus = selectName(reviewFields.payment_review_status).toLowerCase();
  const paymentCoverage = selectName(reviewFields.payment_coverage_status).toLowerCase();
  const pointsStatus = selectName(reviewFields.points_review_status).toLowerCase();
  const reviewedBy = clean(reviewFields.reviewed_by);
  const reviewedAt = clean(reviewFields.reviewed_at);
  const linkedStaging = linkedIds(reviewFields["LINE OFC Import Row"]);
  const linkedClients = linkedIds(reviewFields.Client);

  if (!["approved", "materialized"].includes(reviewStatus)) throw coded("HISTORY_EXPLICIT_REVIEW_NOT_APPROVED");
  if (decision !== "approve_service_history") throw coded("HISTORY_EXPLICIT_SERVICE_APPROVAL_REQUIRED");
  if (linkedStaging.length !== 1 || linkedStaging[0] !== clean(stagingId)) throw coded("HISTORY_EXPLICIT_REVIEW_STAGING_MISMATCH");
  if (linkedClients.length !== 1 || linkedClients[0] !== clean(clientId)) throw coded("HISTORY_EXPLICIT_REVIEW_CLIENT_MISMATCH");
  if (!reviewedBy || !Number.isFinite(Date.parse(reviewedAt))) throw coded("HISTORY_EXPLICIT_REVIEW_EVIDENCE_REQUIRED");

  const paidAt = parseHistoricalDate(reviewFields.approved_service_date);
  if (!paidAt) throw coded("HISTORY_APPROVED_SERVICE_DATE_REQUIRED");
  const amountThb = Math.round(Number(reviewFields.approved_service_amount_thb || 0) * 100) / 100;
  if (!Number.isFinite(amountThb) || amountThb <= 0) throw coded("HISTORY_APPROVED_SERVICE_AMOUNT_REQUIRED");

  if (!["approved", "rejected", "not_applicable"].includes(paymentStatus)) throw coded("HISTORY_EXPLICIT_PAYMENT_DECISION_REQUIRED");
  if (paymentStatus !== "approved") throw coded("HISTORY_HISTORICAL_PAYMENT_NOT_APPROVED");
  if (paymentCoverage !== "complete") throw coded("HISTORY_PAYMENT_COVERAGE_INCOMPLETE");
  const paymentAmountThb = Math.round(Number(reviewFields.approved_payment_amount_thb || 0) * 100) / 100;
  if (!Number.isFinite(paymentAmountThb) || paymentAmountThb <= 0) throw coded("HISTORY_APPROVED_PAYMENT_AMOUNT_REQUIRED");
  if (Math.abs(paymentAmountThb - amountThb) > 0.001) throw coded("HISTORY_APPROVED_PAYMENT_AMOUNT_MISMATCH");

  if (!["approved", "rejected", "not_applicable"].includes(pointsStatus)) throw coded("HISTORY_EXPLICIT_POINTS_DECISION_REQUIRED");
  const pointsEligibleAmountThb = Math.round(Number(reviewFields.approved_points_eligible_amount_thb || 0) * 100) / 100;
  if (pointsStatus === "approved") {
    if (pointsEligibleAmountThb <= 0) throw coded("HISTORY_APPROVED_POINTS_AMOUNT_REQUIRED");
    if (Math.abs(pointsEligibleAmountThb - amountThb) > 0.001) throw coded("HISTORY_APPROVED_POINTS_AMOUNT_MISMATCH");
    if (pointsEligibleAmountThb - paymentAmountThb > 0.001) throw coded("HISTORY_APPROVED_POINTS_EXCEED_PAID_AMOUNT");
  } else if (pointsEligibleAmountThb > 0) {
    throw coded("HISTORY_POINTS_AMOUNT_WITHOUT_APPROVAL");
  }

  return {
    reviewStatus,
    reviewedBy,
    reviewedAt,
    paidAt,
    amountThb,
    sourcePaymentRef: clean(reviewFields.approved_payment_ref),
    paymentStatus,
    paymentCoverage,
    paymentAmountThb,
    pointsStatus,
    pointsEligibleAmountThb: pointsStatus === "approved" ? pointsEligibleAmountThb : 0,
  };
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== "" && value !== null));
}

function buildMaterializationIdentity({ importId, historyReviewId, clientId, paidAt, amountThb, sourcePaymentRef }) {
  const seed = [importId, historyReviewId, clientId, paidAt, amountThb, sourcePaymentRef].join("|");
  return {
    sessionId: deterministicToken("hist_sess", seed),
    paymentRef: deterministicToken("hist_pay", seed),
    pointsEntry: deterministicToken("hist_points", seed),
    materializationKey: deterministicToken("hist_mat", seed),
  };
}

function buildMaterializationPlan({
  fields,
  historyReviewFields,
  historyReviewId,
  stagingId,
  importId,
  client,
  memberWallet = null,
  priorRemainderThb = 0,
}) {
  const identityReview = assertIdentityCommitGate(fields);
  const approved = assertHistoryApprovalGate(historyReviewFields, { stagingId, clientId: identityReview.clientId });
  const memberEmail = normalizeEmail(client?.fields?.["Contact Email"] || client?.fields?.email || fields.email_candidate);
  if (!memberEmail) throw coded("HISTORY_CANONICAL_MEMBER_EMAIL_REQUIRED");
  if (approved.pointsStatus === "approved" && !clean(memberWallet?.memberId)) throw coded("HISTORY_POINTS_CANONICAL_MEMBER_ID_REQUIRED");

  const ids = buildMaterializationIdentity({
    importId,
    historyReviewId,
    clientId: identityReview.clientId,
    paidAt: approved.paidAt,
    amountThb: approved.amountThb,
    sourcePaymentRef: approved.sourcePaymentRef,
  });
  const priorRemainder = Math.max(0, Math.floor(Number(priorRemainderThb || 0)));
  const eligibleWholeThb = Math.floor(approved.pointsEligibleAmountThb || 0);
  const pool = priorRemainder + eligibleWholeThb;
  const points = approved.pointsStatus === "approved" ? Math.floor(pool / POINT_RATE_THB) : 0;
  const remainderAfter = approved.pointsStatus === "approved" ? pool % POINT_RATE_THB : priorRemainder;
  const displayName = clean(fields.line_renamed_name || fields.normalized_name || client?.fields?.["Client Name"] || client?.fields?.nickname);
  const sourceNote = `history_review:${historyReviewId}; import:${importId}; reviewer:${approved.reviewedBy}; source_payment_ref:${approved.sourcePaymentRef || "none"}`;
  const jobDate = approved.paidAt.slice(0, 10);

  return {
    schema: MATERIALIZER,
    authority: AUTHORITY,
    history_review_id: historyReviewId,
    materialization_idempotency_key: ids.materializationKey,
    import_id: importId,
    canonical_client_id: identityReview.clientId,
    canonical_member_id: clean(memberWallet?.memberId),
    member_record_id: clean(memberWallet?.recordId),
    member_email: memberEmail,
    reviewed_by: approved.reviewedBy,
    reviewed_at: approved.reviewedAt,
    paid_at: approved.paidAt,
    amount_thb: approved.amountThb,
    source_payment_ref: approved.sourcePaymentRef,
    payment_review_status: approved.paymentStatus,
    payment_coverage_status: approved.paymentCoverage,
    approved_payment_amount_thb: approved.paymentAmountThb,
    points_review_status: approved.pointsStatus,
    membership_handoff_required: Boolean(clean(fields.note_detected_membership_action) || Number(fields.membership_fee_amount || 0) > 0 || Number(fields.renewal_fee_amount || 0) > 0),
    writes: {
      session: {
        "Session Name": `Historical · ${displayName || identityReview.clientId} · ${jobDate}`,
        Client: [identityReview.clientId],
        "Session Status": "Completed",
        session_id: ids.sessionId,
        created_at: approved.paidAt,
        email: memberEmail,
        amount_thb: approved.amountThb,
        payment_ref: ids.paymentRef,
        payment_status: "paid",
        client_name: displayName,
        job_type: "historical_service",
        job_date: jobDate,
        notes: sourceNote,
        import_review_status: "approved",
        imported_source_ref: historyReviewId,
        imported_confidence_score: 100,
      },
      payment: {
        "Payment Reference": ids.paymentRef,
        "Payment Date": jobDate,
        Amount: approved.paymentAmountThb,
        "Payment Status": "Paid",
        "Payment Method": "Other",
        Client: [identityReview.clientId],
        ...(memberWallet?.recordId ? { Member: [memberWallet.recordId] } : {}),
        Notes: sourceNote,
        "Member Email": memberEmail,
        "Created At": approved.reviewedAt,
        session_id: ids.sessionId,
        payment_stage: "full",
        payment_type: "full",
        source: "manual",
        payment_evidence_source: "imported_history",
        import_review_status: "approved",
      },
      points: approved.pointsStatus === "approved" ? {
        "Points Entry": ids.pointsEntry,
        member_id: clean(memberWallet?.memberId),
        member_email: memberEmail,
        payment_ref: ids.paymentRef,
        session_id: ids.sessionId,
        amount_thb: approved.pointsEligibleAmountThb,
        eligible_amount_thb: eligibleWholeThb,
        prior_remainder_thb: priorRemainder,
        pool_thb: pool,
        points,
        remainder_after_thb: remainderAfter,
        points_bucket: POINTS_BUCKET,
        rate_policy: "historical_100_thb_1_pt_remainder",
        source: POINTS_SOURCE,
        note: sourceNote,
        idempotency_key: `historical_base:${ids.paymentRef}`,
        posted_at: approved.paidAt,
        transaction_status: "posted",
        created_by: MATERIALIZER,
      } : null,
    },
    forbidden_writes: ["MMD — Member Entitlements"],
  };
}

async function findStagingRow(airtable, importId) {
  return airtable.findOne(STAGING_TABLE, `{import_id}=${formulaString(importId)}`);
}

async function findHistoryReview(airtable, historyReviewId) {
  return airtable.findOne(HISTORY_REVIEWS_TABLE, `{history_review_id}=${formulaString(historyReviewId)}`);
}

async function readCanonicalClient(airtable, clientId) {
  const rows = await airtable.list(CLIENTS_TABLE, { filterByFormula: `RECORD_ID()=${formulaString(clientId)}`, maxRecords: "2" });
  if (rows.length !== 1) throw coded("HISTORY_CANONICAL_CLIENT_NOT_UNIQUE");
  return rows[0];
}

async function resolveCanonicalMemberWallet(airtable, memberEmail) {
  const rows = await airtable.list(MEMBERS_TABLE, {
    filterByFormula: `OR(LOWER({Contact Email}&"")=${formulaString(memberEmail)},LOWER({email}&"")=${formulaString(memberEmail)})`,
    maxRecords: "2",
  }).catch(() => []);
  if (rows.length > 1) throw coded("HISTORY_CANONICAL_MEMBER_AMBIGUOUS");
  if (!rows.length) return null;
  const fields = rows[0].fields || {};
  return {
    recordId: clean(rows[0].id),
    memberId: clean(fields.member_id || fields["Member ID"]),
    memberEmail,
  };
}

async function loadEntitlements(airtable, memberEmail) {
  return airtable.list(ENTITLEMENTS_TABLE, { filterByFormula: `LOWER({member_email})=${formulaString(memberEmail)}`, maxRecords: "100" });
}

async function loadPriorBaseRemainder(airtable, memberEmail, paidAt, excludePaymentRef = "") {
  const rows = await airtable.list(POINTS_LEDGER_TABLE, {
    filterByFormula: `AND(LOWER({member_email})=${formulaString(memberEmail)},{points_bucket}=${formulaString(POINTS_BUCKET)})`,
    maxRecords: "1000",
  }).catch(() => []);
  const eventTime = Date.parse(paidAt);
  const ordered = rows
    .filter((row) => clean(row?.fields?.payment_ref) !== clean(excludePaymentRef))
    .map((row) => ({ row, posted: Date.parse(clean(row?.fields?.posted_at)) }))
    .filter((item) => Number.isFinite(item.posted))
    .sort((a, b) => a.posted - b.posted);
  if (ordered.some((item) => item.posted > eventTime)) throw coded("HISTORY_POINTS_OUT_OF_ORDER_REBUILD_REQUIRED");
  const beforeOrSame = ordered.filter((item) => item.posted <= eventTime);
  return Number(beforeOrSame.at(-1)?.row?.fields?.remainder_after_thb || 0);
}

async function findByField(airtable, table, field, value) {
  return airtable.findOne(table, `{${field}}=${formulaString(value)}`);
}

function stableResolverSnapshot(snapshot = {}) {
  return {
    schema_version: clean(snapshot.schema_version),
    member_blocked: snapshot.member_blocked === true,
    capability_state: {
      active: [...(snapshot.capability_state?.active || [])].sort(),
      expiring_soon: [...(snapshot.capability_state?.expiring_soon || [])].sort(),
      grace: [...(snapshot.capability_state?.grace || [])].sort(),
      inactive: [...(snapshot.capability_state?.inactive || [])].sort(),
      recognized: [...(snapshot.capability_state?.recognized || [])].sort(),
    },
    access: snapshot.access || {},
  };
}

function sameSnapshot(a, b) {
  return JSON.stringify(stableResolverSnapshot(a)) === JSON.stringify(stableResolverSnapshot(b));
}

async function writeIfMissing(airtable, table, uniqueField, fields) {
  const existing = await findByField(airtable, table, uniqueField, fields[uniqueField]);
  if (existing?.id) return { duplicate: true, record_id: existing.id };
  const created = await airtable.requestWithFieldFallback(table, { method: "POST", body: { fields: compact(fields) } });
  return { duplicate: false, record_id: created?.id || "" };
}

async function patchHistoryReviewAudit(airtable, reviewRecordId, plan, result, now) {
  const summary = {
    schema: MATERIALIZER,
    history_review_id: plan.history_review_id,
    session_record_id: clean(result.session?.record_id),
    payment_record_id: clean(result.payment?.record_id),
    points_record_id: clean(result.points?.record_id),
    points_skipped: result.points?.skipped === true,
    resolver_unchanged: true,
    entitlement_write: false,
  };
  await airtable.requestWithFieldFallback(HISTORY_REVIEWS_TABLE, {
    method: "PATCH",
    recordId: reviewRecordId,
    body: {
      fields: {
        review_status: "materialized",
        materialization_idempotency_key: plan.materialization_idempotency_key,
        materialized_at: now,
        materialization_result_json: JSON.stringify(summary),
      },
    },
  });
}

async function defaultResolver(records, now) {
  const module = await import("../../auth-worker/src/member-entitlement-resolver.js");
  return module.resolveMemberEntitlements(records, { now });
}

async function materializeHistoricalRecord({
  importId,
  historyReviewId = "",
  apply = false,
  airtable = new AirtableClient(),
  resolver = defaultResolver,
  now = new Date().toISOString(),
} = {}) {
  if (!clean(importId)) throw coded("HISTORY_IMPORT_ID_REQUIRED");
  const staging = await findStagingRow(airtable, importId);
  if (!staging?.id) throw coded("HISTORY_STAGING_ROW_NOT_FOUND");
  const fields = staging.fields || {};
  const identityReview = assertIdentityCommitGate(fields);
  const client = await readCanonicalClient(airtable, identityReview.clientId);
  const memberEmail = normalizeEmail(client?.fields?.["Contact Email"] || client?.fields?.email || fields.email_candidate);
  if (!memberEmail) throw coded("HISTORY_CANONICAL_MEMBER_EMAIL_REQUIRED");

  const resolvedReviewId = clean(historyReviewId) || defaultHistoryReviewId(importId);
  const historyReview = await findHistoryReview(airtable, resolvedReviewId);
  if (!historyReview?.id) throw coded("HISTORY_EXPLICIT_REVIEW_NOT_FOUND");
  const approved = assertHistoryApprovalGate(historyReview.fields || {}, { stagingId: staging.id, clientId: identityReview.clientId });
  const memberWallet = await resolveCanonicalMemberWallet(airtable, memberEmail);
  if (approved.pointsStatus === "approved" && !clean(memberWallet?.memberId)) throw coded("HISTORY_POINTS_CANONICAL_MEMBER_ID_REQUIRED");

  const ids = buildMaterializationIdentity({
    importId,
    historyReviewId: resolvedReviewId,
    clientId: identityReview.clientId,
    paidAt: approved.paidAt,
    amountThb: approved.amountThb,
    sourcePaymentRef: approved.sourcePaymentRef,
  });
  const priorRemainder = approved.pointsStatus === "approved"
    ? await loadPriorBaseRemainder(airtable, memberEmail, approved.paidAt, ids.paymentRef)
    : 0;
  const plan = buildMaterializationPlan({
    fields,
    historyReviewFields: historyReview.fields || {},
    historyReviewId: resolvedReviewId,
    stagingId: staging.id,
    importId,
    client,
    memberWallet,
    priorRemainderThb: priorRemainder,
  });

  const entitlementRowsBefore = await loadEntitlements(airtable, plan.member_email);
  const resolverBefore = await resolver(entitlementRowsBefore, now);

  if (!apply) {
    return {
      ok: true,
      dry_run: true,
      plan,
      resolver_before: stableResolverSnapshot(resolverBefore),
      resolver_write: false,
    };
  }

  const session = await writeIfMissing(airtable, SESSIONS_TABLE, "session_id", plan.writes.session);
  const payment = await writeIfMissing(airtable, PAYMENTS_TABLE, "Payment Reference", plan.writes.payment);
  const points = plan.writes.points && plan.writes.points.points > 0
    ? await writeIfMissing(airtable, POINTS_LEDGER_TABLE, "idempotency_key", plan.writes.points)
    : { duplicate: false, skipped: true, record_id: "" };

  const entitlementRowsAfter = await loadEntitlements(airtable, plan.member_email);
  const resolverAfter = await resolver(entitlementRowsAfter, now);
  const unchanged = sameSnapshot(resolverBefore, resolverAfter);
  if (!unchanged) throw coded("HISTORY_RESOLVER_CHANGED_ROLLBACK_REQUIRED");

  const result = {
    ok: true,
    dry_run: false,
    materializer: MATERIALIZER,
    authority: AUTHORITY,
    history_review_id: resolvedReviewId,
    import_id: importId,
    session,
    payment,
    points,
    membership_handoff_required: plan.membership_handoff_required,
    resolver_before: stableResolverSnapshot(resolverBefore),
    resolver_after: stableResolverSnapshot(resolverAfter),
    resolver_unchanged: true,
    entitlement_write: false,
  };
  await patchHistoryReviewAudit(airtable, historyReview.id, plan, result, now);
  return result;
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.importId) {
    console.error("Usage: node scripts/line-official-legacy/history-materializer.js --import-id <id> [--history-review-id <id>] [--apply]");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await materializeHistoricalRecord(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, materializer: MATERIALIZER, error: String(error?.code || error?.message || error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  AUTHORITY,
  HISTORY_REVIEWS_TABLE,
  MATERIALIZER,
  POINTS_BUCKET,
  POINTS_SOURCE,
  POINT_RATE_THB,
  assertHistoricalEventGate,
  assertHistoryApprovalGate,
  assertIdentityCommitGate,
  assertReviewGate,
  buildMaterializationIdentity,
  buildMaterializationPlan,
  defaultHistoryReviewId,
  deterministicToken,
  materializeHistoricalRecord,
  parseArgs,
  parseHistoricalDate,
  sameSnapshot,
  stableResolverSnapshot,
};