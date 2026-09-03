#!/usr/bin/env node

const crypto = require("node:crypto");
const { AirtableClient } = require("./dry-run-import.js");

const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";
const CLIENTS_TABLE = process.env.AIRTABLE_CLIENTS_TABLE_ID || "tblVv58TCbwh5j1fS";
const SESSIONS_TABLE = process.env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX";
const PAYMENTS_TABLE = process.env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ";
const POINTS_LEDGER_TABLE = process.env.AIRTABLE_TABLE_POINTS_LEDGER || "points_ledger";
const ENTITLEMENTS_TABLE = process.env.AIRTABLE_MEMBER_ENTITLEMENTS_TABLE_ID || "tblNImdF9PKAxhXGi";
const POINT_RATE_THB = 100;
const POINTS_BUCKET = "historical_backfill_v1";
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

function booleanish(value) {
  return value === true || value === 1 || ["true", "yes", "1"].includes(clean(value).toLowerCase());
}

function linkedClientIds(fields) {
  const linked = Array.isArray(fields.matched_client) ? fields.matched_client : [];
  return linked.map((item) => clean(item?.id || item)).filter(Boolean);
}

function reviewedClientId(fields) {
  return clean(fields.matched_client_id) || linkedClientIds(fields)[0] || "";
}

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function assertReviewGate(fields) {
  const status = selectName(fields.review_status).toLowerCase();
  const decision = selectName(fields.decision).toLowerCase();
  const source = selectName(fields.decision_source).toLowerCase();
  const reviewedBy = clean(fields.reviewed_by || fields.committed_by);
  const reviewedAt = clean(fields.reviewed_at || fields.committed_at);
  const clientId = reviewedClientId(fields);

  if (status !== "committed") throw coded("HISTORY_REVIEW_NOT_COMMITTED");
  if (decision !== "link_existing_client") throw coded("HISTORY_REVIEW_DECISION_REQUIRED");
  if (source !== "manual_review") throw coded("HISTORY_MANUAL_REVIEW_REQUIRED");
  if (!reviewedBy || !Number.isFinite(Date.parse(reviewedAt))) throw coded("HISTORY_REVIEW_EVIDENCE_REQUIRED");
  if (!/^rec[A-Za-z0-9]{10,30}$/.test(clientId)) throw coded("HISTORY_CANONICAL_CLIENT_REQUIRED");
  if (fields.dry_run_only === true) throw coded("HISTORY_IDENTITY_NOT_COMMITTED");

  return { clientId, reviewedBy, reviewedAt };
}

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
  if (booleanish(fields.points_review_required)) throw coded("HISTORY_POINTS_REVIEW_REQUIRED");
  if (Number(fields.unknown_amount || 0) > 0) throw coded("HISTORY_UNKNOWN_AMOUNT_REVIEW_REQUIRED");

  const serviceEvents = serviceEventsFromFields(fields);
  if (serviceEvents.length !== 1) throw coded(serviceEvents.length ? "HISTORY_MULTIPLE_SERVICE_EVENTS_REVIEW_REQUIRED" : "HISTORY_SERVICE_EVENT_REQUIRED");

  const dates = uniqueDates(fields);
  if (dates.length !== 1) throw coded(dates.length ? "HISTORY_MULTIPLE_DATES_REVIEW_REQUIRED" : "HISTORY_SERVICE_DATE_REQUIRED");
  const paidAt = parseHistoricalDate(dates[0]);
  if (!paidAt) throw coded("HISTORY_SERVICE_DATE_UNPARSEABLE");

  const amountThb = Math.round(Number(serviceEvents[0].amount) * 100) / 100;
  if (!Number.isFinite(amountThb) || amountThb <= 0) throw coded("HISTORY_SERVICE_AMOUNT_INVALID");
  const stagedEligible = Number(fields.points_eligible_amount || 0);
  if (stagedEligible > 0 && Math.abs(stagedEligible - amountThb) > 0.001) throw coded("HISTORY_POINTS_AMOUNT_MISMATCH");

  const refs = uniquePaymentRefs(fields);
  if (refs.length > 1) throw coded("HISTORY_MULTIPLE_PAYMENT_REFS_REVIEW_REQUIRED");
  return { amountThb, paidAt, sourcePaymentRef: refs[0] || "", serviceEvent: serviceEvents[0] };
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== ""));
}

function buildMaterializationPlan({ fields, importId, client, priorRemainderThb = 0 }) {
  const review = assertReviewGate(fields);
  const event = assertHistoricalEventGate(fields);
  const memberEmail = normalizeEmail(client?.fields?.["Contact Email"] || client?.fields?.email || fields.email_candidate);
  if (!memberEmail) throw coded("HISTORY_CANONICAL_MEMBER_EMAIL_REQUIRED");

  const seed = [importId, review.clientId, event.paidAt, event.amountThb, event.sourcePaymentRef].join("|");
  const sessionId = deterministicToken("hist_sess", seed);
  const paymentRef = deterministicToken("hist_pay", seed);
  const priorRemainder = Math.max(0, Math.floor(Number(priorRemainderThb || 0)));
  const pool = priorRemainder + Math.floor(event.amountThb);
  const points = Math.floor(pool / POINT_RATE_THB);
  const remainderAfter = pool % POINT_RATE_THB;
  const displayName = clean(fields.line_renamed_name || fields.normalized_name || client?.fields?.["Client Name"] || client?.fields?.nickname);
  const sourceNote = `history:${importId}; reviewer:${review.reviewedBy}; source_payment_ref:${event.sourcePaymentRef || "none"}`;

  return {
    schema: MATERIALIZER,
    authority: AUTHORITY,
    import_id: importId,
    canonical_client_id: review.clientId,
    member_email: memberEmail,
    reviewed_by: review.reviewedBy,
    reviewed_at: review.reviewedAt,
    paid_at: event.paidAt,
    amount_thb: event.amountThb,
    source_payment_ref: event.sourcePaymentRef,
    membership_handoff_required: Boolean(clean(fields.note_detected_membership_action) || Number(fields.membership_fee_amount || 0) > 0 || Number(fields.renewal_fee_amount || 0) > 0),
    writes: {
      session: {
        session_id: sessionId,
        status: "completed",
        "Session Status": "completed",
        "Payment Status": "paid",
        payment_ref: paymentRef,
        payment_type: "full",
        amount_thb: event.amountThb,
        member_email: memberEmail,
        client_name: displayName,
        job_type: "historical_service",
        job_date: event.paidAt.slice(0, 10),
        note: sourceNote,
        notes: sourceNote,
        created_at: event.paidAt,
      },
      payment: {
        payment_ref: paymentRef,
        session_id: sessionId,
        payment_stage: "full",
        payment_type: "full",
        amount_thb: event.amountThb,
        amount: event.amountThb,
        member_email: memberEmail,
        notes: sourceNote,
        "Payment Method": "historical_review",
        "Payment Status": "paid",
        "Verification Status": "historical_reviewed",
        "Payment Intent Status (AI)": "historical_manual_review",
        "Payment Date": event.paidAt,
        "Created At": review.reviewedAt,
      },
      points: {
        member_id: review.clientId,
        member_email: memberEmail,
        payment_ref: paymentRef,
        session_id: sessionId,
        amount_thb: event.amountThb,
        eligible_amount_thb: Math.floor(event.amountThb),
        prior_remainder_thb: priorRemainder,
        pool_thb: pool,
        points,
        remainder_after_thb: remainderAfter,
        points_bucket: POINTS_BUCKET,
        rate_policy: "historical_100_thb_1_pt_remainder",
        source: MATERIALIZER,
        note: sourceNote,
        idempotency_key: `${POINTS_BUCKET}:${paymentRef}`,
        posted_at: event.paidAt,
        transaction_status: "posted",
      },
    },
    forbidden_writes: ["MMD — Member Entitlements"],
  };
}

async function findStagingRow(airtable, importId) {
  return airtable.findOne(STAGING_TABLE, `{import_id}=${formulaString(importId)}`);
}

async function readCanonicalClient(airtable, clientId) {
  const rows = await airtable.list(CLIENTS_TABLE, { filterByFormula: `RECORD_ID()=${formulaString(clientId)}`, maxRecords: "2" });
  if (rows.length !== 1) throw coded("HISTORY_CANONICAL_CLIENT_NOT_UNIQUE");
  return rows[0];
}

async function loadEntitlements(airtable, memberEmail) {
  return airtable.list(ENTITLEMENTS_TABLE, { filterByFormula: `LOWER({member_email})=${formulaString(memberEmail)}`, maxRecords: "100" });
}

async function loadPriorHistoricalRemainder(airtable, memberEmail, paidAt) {
  const rows = await airtable.list(POINTS_LEDGER_TABLE, {
    filterByFormula: `AND(LOWER({member_email})=${formulaString(memberEmail)},{points_bucket}=${formulaString(POINTS_BUCKET)})`,
    maxRecords: "100",
  }).catch(() => []);
  const ordered = rows
    .map((row) => ({ row, posted: Date.parse(clean(row?.fields?.posted_at)) }))
    .filter((item) => Number.isFinite(item.posted))
    .sort((a, b) => a.posted - b.posted);
  const eventTime = Date.parse(paidAt);
  if (ordered.some((item) => item.posted > eventTime)) throw coded("HISTORY_POINTS_OUT_OF_ORDER_REBUILD_REQUIRED");
  return Number(ordered.at(-1)?.row?.fields?.remainder_after_thb || 0);
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

async function defaultResolver(records, now) {
  const module = await import("../../auth-worker/src/member-entitlement-resolver.js");
  return module.resolveMemberEntitlements(records, { now });
}

async function materializeHistoricalRecord({ importId, apply = false, airtable = new AirtableClient(), resolver = defaultResolver, now = new Date().toISOString() } = {}) {
  if (!clean(importId)) throw coded("HISTORY_IMPORT_ID_REQUIRED");
  const staging = await findStagingRow(airtable, importId);
  if (!staging?.id) throw coded("HISTORY_STAGING_ROW_NOT_FOUND");
  const fields = staging.fields || {};
  const review = assertReviewGate(fields);
  const eventPreview = assertHistoricalEventGate(fields);
  const client = await readCanonicalClient(airtable, review.clientId);
  const memberEmail = normalizeEmail(client?.fields?.["Contact Email"] || client?.fields?.email || fields.email_candidate);
  if (!memberEmail) throw coded("HISTORY_CANONICAL_MEMBER_EMAIL_REQUIRED");
  const priorRemainder = await loadPriorHistoricalRemainder(airtable, memberEmail, eventPreview.paidAt);
  const plan = buildMaterializationPlan({ fields, importId, client, priorRemainderThb: priorRemainder });
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
  const payment = await writeIfMissing(airtable, PAYMENTS_TABLE, "payment_ref", plan.writes.payment);
  const points = plan.writes.points.points > 0
    ? await writeIfMissing(airtable, POINTS_LEDGER_TABLE, "idempotency_key", plan.writes.points)
    : { duplicate: false, skipped: true, record_id: "" };

  const entitlementRowsAfter = await loadEntitlements(airtable, plan.member_email);
  const resolverAfter = await resolver(entitlementRowsAfter, now);
  const unchanged = sameSnapshot(resolverBefore, resolverAfter);
  if (!unchanged) throw coded("HISTORY_RESOLVER_CHANGED_ROLLBACK_REQUIRED");

  return {
    ok: true,
    dry_run: false,
    materializer: MATERIALIZER,
    authority: AUTHORITY,
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
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.importId) {
    console.error("Usage: node scripts/line-official-legacy/history-materializer.js --import-id <id> [--apply]");
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
  MATERIALIZER,
  POINTS_BUCKET,
  POINT_RATE_THB,
  assertHistoricalEventGate,
  assertReviewGate,
  buildMaterializationPlan,
  deterministicToken,
  materializeHistoricalRecord,
  parseArgs,
  parseHistoricalDate,
  sameSnapshot,
  stableResolverSnapshot,
};
