#!/usr/bin/env node

const { AirtableClient } = require("./dry-run-import.js");

const CLIENTS_TABLE = process.env.AIRTABLE_CLIENTS_TABLE_ID || "tblVv58TCbwh5j1fS";
const STAGING_TABLE = process.env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || "tbl1u0foFBvgFpT9G";
const COMMITTED_MATCH_TYPE = "line_user_id_exact";
const LINK_EXISTING_CLIENT = "link_existing_client";
const COMMITTED_REVIEW_STATUS = "committed";
const MANUAL_REVIEW_SOURCE = "manual_review";
const REVIEWABLE_STATUSES = new Set(["review_required", "ready_to_commit", COMMITTED_REVIEW_STATUS]);
const CLIENT_EMAIL_FIELDS = ["Contact Email", "email"];

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
    if (arg === "--line-user-id") out.lineUserId = argv[index + 1];
    if (arg === "--apply") out.apply = true;
  }
  return out;
}

function formulaString(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isLineUserId(value) {
  return /^U[0-9a-f]{32}$/i.test(clean(value));
}

function safeRecordId(value) {
  const recordId = clean(value);
  return /^rec[A-Za-z0-9]{10,30}$/.test(recordId) ? recordId : "";
}

function normalizeEmail(value) {
  const email = clean(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function validIsoTimestamp(value) {
  const raw = clean(value);
  if (!raw) return false;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp);
}

function fieldsOf(record) {
  return record?.fields || record?.cellValuesByFieldId || {};
}

function linkedClientIds(fields) {
  const linked = Array.isArray(fields.matched_client) ? fields.matched_client : [];
  return linked.map((item) => safeRecordId(item?.id || item)).filter(Boolean);
}

function reviewedClientId(fields) {
  return safeRecordId(fields.matched_client_id);
}

function isCommittedExactLink(fields, lineUserId, clientId = "") {
  const linked = linkedClientIds(fields);
  if (linked.length !== 1) return false;
  if (clientId && linked[0] !== clientId) return false;
  return clean(fields.line_user_id) === clean(lineUserId)
    && selectName(fields.match_type) === COMMITTED_MATCH_TYPE
    && selectName(fields.decision) === LINK_EXISTING_CLIENT
    && selectName(fields.review_status) === COMMITTED_REVIEW_STATUS
    && fields.dry_run_only !== true;
}

function assertReviewedLink(fields) {
  const lineUserId = clean(fields.line_user_id);
  const clientId = reviewedClientId(fields);
  const decision = selectName(fields.decision);
  const decisionSource = selectName(fields.decision_source);
  const reviewStatus = selectName(fields.review_status);
  const reviewedBy = clean(fields.reviewed_by);
  const reviewedAt = clean(fields.reviewed_at);
  const linked = linkedClientIds(fields);

  if (!isLineUserId(lineUserId)) throw coded("CANONICAL_LINE_ID_INVALID");
  if (decision !== LINK_EXISTING_CLIENT) throw coded("CANONICAL_REVIEW_DECISION_REQUIRED");
  if (decisionSource !== MANUAL_REVIEW_SOURCE) throw coded("CANONICAL_MANUAL_REVIEW_REQUIRED");
  if (!REVIEWABLE_STATUSES.has(reviewStatus)) throw coded("CANONICAL_REVIEW_STATUS_BLOCKED");
  if (!reviewedBy || !validIsoTimestamp(reviewedAt)) throw coded("CANONICAL_REVIEW_EVIDENCE_REQUIRED");
  if (!clientId) throw coded("CANONICAL_CLIENT_ID_REQUIRED");
  if (linked.length > 1) throw coded("CANONICAL_LINK_AMBIGUOUS");
  if (linked.length === 1 && linked[0] !== clientId) throw coded("CANONICAL_LINK_CONFLICT");

  return { lineUserId, clientId, reviewedBy, reviewedAt, reviewStatus };
}

function canonicalClientEmail(fields) {
  const emails = new Set();
  for (const field of CLIENT_EMAIL_FIELDS) {
    const email = normalizeEmail(fields[field]);
    if (email) emails.add(email);
  }
  if (emails.size > 1) throw coded("CANONICAL_CLIENT_EMAIL_AMBIGUOUS");
  return emails.values().next().value || "";
}

async function findTargetStagingRow({ airtable, importId = "", lineUserId = "" }) {
  const byImportId = clean(importId);
  const byLineUserId = clean(lineUserId);
  if (!byImportId && !byLineUserId) throw coded("CANONICAL_TARGET_REQUIRED");
  if (byLineUserId && !isLineUserId(byLineUserId)) throw coded("CANONICAL_LINE_ID_INVALID");

  if (byImportId) {
    const row = await airtable.findOne(STAGING_TABLE, `{import_id}=${formulaString(byImportId)}`);
    if (!row?.id) throw coded("CANONICAL_STAGING_ROW_NOT_FOUND");
    const rowLineUserId = clean(fieldsOf(row).line_user_id);
    if (byLineUserId && rowLineUserId !== byLineUserId) throw coded("CANONICAL_TARGET_MISMATCH");
    return row;
  }

  const rows = await airtable.list(STAGING_TABLE, {
    filterByFormula: `{line_user_id}=${formulaString(byLineUserId)}`,
    maxRecords: "25",
  });
  const reviewed = [];
  for (const row of rows) {
    try {
      const proof = assertReviewedLink(fieldsOf(row));
      if (proof.lineUserId === byLineUserId) reviewed.push(row);
    } catch {
      // Non-reviewed staging evidence is intentionally ignored here.
    }
  }
  if (reviewed.length === 0) throw coded("CANONICAL_REVIEWED_LINK_NOT_FOUND");
  if (reviewed.length > 1) throw coded("CANONICAL_REVIEWED_LINK_AMBIGUOUS");
  return reviewed[0];
}

async function readCanonicalClient({ airtable, clientId, lineUserId }) {
  const rows = await airtable.list(CLIENTS_TABLE, {
    filterByFormula: `RECORD_ID()=${formulaString(clientId)}`,
    maxRecords: "2",
  });
  if (rows.length !== 1 || clean(rows[0]?.id) !== clientId) throw coded("CANONICAL_CLIENT_NOT_FOUND");
  const fields = fieldsOf(rows[0]);
  const existingLine = clean(fields.line_user_id);
  if (existingLine && existingLine !== lineUserId) throw coded("CANONICAL_CLIENT_LINE_CONFLICT");
  const email = canonicalClientEmail(fields);
  if (!email) throw coded("CANONICAL_CLIENT_EMAIL_MISSING");

  const direct = await airtable.list(CLIENTS_TABLE, {
    filterByFormula: `{line_user_id}=${formulaString(lineUserId)}`,
    maxRecords: "2",
  });
  if (direct.length > 1) throw coded("CANONICAL_LINE_ALREADY_AMBIGUOUS");
  if (direct.length === 1 && clean(direct[0]?.id) !== clientId) throw coded("CANONICAL_LINE_ALREADY_LINKED_ELSEWHERE");

  return { record: rows[0], fields, email, existingLine };
}

async function readExistingCommittedLinks({ airtable, lineUserId }) {
  return airtable.list(STAGING_TABLE, {
    filterByFormula: `AND({line_user_id}=${formulaString(lineUserId)},{match_type}=${formulaString(COMMITTED_MATCH_TYPE)},{decision}=${formulaString(LINK_EXISTING_CLIENT)},{review_status}=${formulaString(COMMITTED_REVIEW_STATUS)})`,
    maxRecords: "10",
  });
}

function inspectExistingCommittedLinks(records, lineUserId, clientId) {
  const clientIds = new Set();
  for (const record of records) {
    const fields = fieldsOf(record);
    if (!isCommittedExactLink(fields, lineUserId)) continue;
    const linked = linkedClientIds(fields);
    if (linked.length !== 1) throw coded("CANONICAL_COMMITTED_LINK_AMBIGUOUS");
    clientIds.add(linked[0]);
  }
  if (clientIds.size > 1) throw coded("CANONICAL_COMMITTED_LINK_AMBIGUOUS");
  const existingClientId = clientIds.values().next().value || "";
  if (existingClientId && existingClientId !== clientId) throw coded("CANONICAL_COMMITTED_LINK_CONFLICT");
  return existingClientId;
}

async function assertNoConflictingReviewedLinks({ airtable, lineUserId, clientId, stagingRecordId }) {
  const rows = await airtable.list(STAGING_TABLE, {
    filterByFormula: `AND({line_user_id}=${formulaString(lineUserId)},{decision}=${formulaString(LINK_EXISTING_CLIENT)},{decision_source}=${formulaString(MANUAL_REVIEW_SOURCE)})`,
    maxRecords: "25",
  });
  for (const row of rows) {
    if (clean(row?.id) === clean(stagingRecordId)) continue;
    const fields = fieldsOf(row);
    const otherClientId = reviewedClientId(fields);
    if (!otherClientId) continue;
    if (!clean(fields.reviewed_by) || !validIsoTimestamp(fields.reviewed_at)) continue;
    if (otherClientId !== clientId) throw coded("CANONICAL_REVIEWED_LINK_CONFLICT");
  }
}

function buildCommitPlan({ row, proof, client, committedClientId, now }) {
  const alreadyCommitted = isCommittedExactLink(fieldsOf(row), proof.lineUserId, proof.clientId)
    || committedClientId === proof.clientId;
  return {
    alreadyCommitted,
    clientPatch: client.existingLine ? null : {
      id: proof.clientId,
      fields: { line_user_id: proof.lineUserId },
    },
    stagingPatch: alreadyCommitted ? null : {
      id: row.id,
      fields: {
        matched_client: [proof.clientId],
        matched_client_id: proof.clientId,
        match_type: COMMITTED_MATCH_TYPE,
        match_confidence: 100,
        decision: LINK_EXISTING_CLIENT,
        decision_source: MANUAL_REVIEW_SOURCE,
        review_status: COMMITTED_REVIEW_STATUS,
        dry_run_only: false,
        committed_at: now,
        committed_by: proof.reviewedBy,
        error_message: "",
      },
    },
  };
}

async function patchRecord(airtable, table, patch) {
  if (!patch) return;
  await airtable.request(table, {
    method: "PATCH",
    body: {
      records: [{ id: patch.id, fields: patch.fields }],
      typecast: false,
    },
  });
}

async function verifyCommittedContract({ airtable, lineUserId, clientId }) {
  const [clients, committed] = await Promise.all([
    airtable.list(CLIENTS_TABLE, {
      filterByFormula: `{line_user_id}=${formulaString(lineUserId)}`,
      maxRecords: "2",
    }),
    readExistingCommittedLinks({ airtable, lineUserId }),
  ]);
  const directCanonical = clients.length === 1 && clean(clients[0]?.id) === clientId;
  const committedClientId = inspectExistingCommittedLinks(committed, lineUserId, clientId);
  return {
    ok: directCanonical || committedClientId === clientId,
    direct_canonical_client: directCanonical,
    committed_staging_link: committedClientId === clientId,
  };
}

async function commitCanonicalIdentity({
  importId = "",
  lineUserId = "",
  apply = false,
  airtable = new AirtableClient(),
  now = new Date().toISOString(),
} = {}) {
  const row = await findTargetStagingRow({ airtable, importId, lineUserId });
  const proof = assertReviewedLink(fieldsOf(row));
  const client = await readCanonicalClient({ airtable, clientId: proof.clientId, lineUserId: proof.lineUserId });
  await assertNoConflictingReviewedLinks({
    airtable,
    lineUserId: proof.lineUserId,
    clientId: proof.clientId,
    stagingRecordId: row.id,
  });
  const existing = await readExistingCommittedLinks({ airtable, lineUserId: proof.lineUserId });
  const committedClientId = inspectExistingCommittedLinks(existing, proof.lineUserId, proof.clientId);
  const plan = buildCommitPlan({ row, proof, client, committedClientId, now });

  const baseResult = {
    ok: true,
    mode: "line_canonical_identity_commit_adapter",
    dry_run: !apply,
    staging_record_id: row.id,
    import_id: clean(fieldsOf(row).import_id),
    line_user_id_tail: proof.lineUserId.slice(-6),
    canonical_client_id: proof.clientId,
    canonical_email_resolved: Boolean(client.email),
    already_committed: plan.alreadyCommitted,
    mutations: {
      canonical_client_line_link: Boolean(plan.clientPatch),
      committed_staging_link: Boolean(plan.stagingPatch),
      membership_or_entitlement_write: false,
    },
  };

  if (!apply) return { ...baseResult, verified_contract: false };

  // Canonical Client is patched first. If the staging write subsequently fails,
  // the trusted resolver can still resolve through the direct canonical Client.
  await patchRecord(airtable, CLIENTS_TABLE, plan.clientPatch);
  await patchRecord(airtable, STAGING_TABLE, plan.stagingPatch);

  const verification = await verifyCommittedContract({
    airtable,
    lineUserId: proof.lineUserId,
    clientId: proof.clientId,
  });
  if (!verification.ok) throw coded("CANONICAL_COMMIT_VERIFY_FAILED");

  return {
    ...baseResult,
    dry_run: false,
    verified_contract: true,
    resolver_ready: true,
    drive_bootstrap_ready: true,
    member_retry_ready: true,
    verification,
  };
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.importId && !args.lineUserId) {
    console.error("Usage: node scripts/line-official-legacy/canonical-identity-commit-adapter.js --import-id <id> [--line-user-id U...] [--apply]");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await commitCanonicalIdentity(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      mode: "line_canonical_identity_commit_adapter",
      error: String(error?.code || error?.message || error),
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
  CLIENTS_TABLE,
  STAGING_TABLE,
  COMMITTED_MATCH_TYPE,
  LINK_EXISTING_CLIENT,
  COMMITTED_REVIEW_STATUS,
  MANUAL_REVIEW_SOURCE,
  assertReviewedLink,
  buildCommitPlan,
  commitCanonicalIdentity,
  inspectExistingCommittedLinks,
  isCommittedExactLink,
  parseArgs,
  verifyCommittedContract,
};
