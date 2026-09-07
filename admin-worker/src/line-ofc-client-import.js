const AIRTABLE_API = "https://api.airtable.com/v0";
const BASE_ID_DEFAULT = "appsV1ILPRfIjkaYg";
const CLIENTS_TABLE_DEFAULT = "tblVv58TCbwh5j1fS";
const STAGING_TABLE_DEFAULT = "tblOs8yyLK09SKrCt";
const VERIFIED_STAGING_TABLE_DEFAULT = "tbl1u0foFBvgFpT9G";
const PRE_SESSION_INDEX_TABLE_DEFAULT = "tblwn6I9VWie5d7Ui";
const ACTIONS_TABLE = "tblUzZ8ImRZOkks4c";

export const LINE_OFC_CLIENT_IMPORT_PATH = "/v1/admin/kenji/control/line-ofc/import";
export const LINE_OFC_IDENTITY_INDEX_VERSION = "line-ofc-airtable-index-v1";

const CLIENT_READ_FIELDS = [
  "Client Name", "Client Name (Display)", "mmd_client_name", "nickname", "username",
  "line_user_id", "Phone Number", "email", "Contact Email",
];

export async function handleLineOfcClientImport(request, env = {}, actor = {}, context = {}) {
  const input = normalizeInput(await readJson(request));
  const clientsTable = clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS) || CLIENTS_TABLE_DEFAULT;
  const stagingTable = clean(env.AIRTABLE_LINE_OFC_IMPORT_TABLE_ID) || STAGING_TABLE_DEFAULT;
  const candidates = await collectCandidates(env, clientsTable, input);
  const status = candidates.length === 1 ? "matched" : "review_required";
  const clientId = candidates.length === 1 ? candidates[0].id : "";
  const matchType = inferMatchType(candidates, input);

  // Import ID is the stable replay key. Upsert instead of create-only so a retry after
  // a downstream identity-index failure cannot duplicate private LINE evidence.
  const record = await airtableUpsertExact(
    env,
    stagingTable,
    "Import ID",
    input.import_id,
    stagingFields(input, status, clientId),
  );

  // Identity-only projection. Raw LINE notes, application answers, behaviour/care
  // context and candidate service history stay in the private staging table above.
  // Create Job reads the reviewed snake_case staging table, so project only the
  // minimum identity evidence needed for deterministic alias lookup.
  const identityProjection = await syncLineOfcIdentityProjection(env, {
    input,
    privateStagingRecordId: record.id,
    candidates,
    clientId,
    matchType,
  });

  const audit = await createAudit(env, {
    idempotencyKey: clean(context.idempotencyKey),
    payloadHash: clean(context.payloadHash),
    actor,
    targetId: record.id,
    reason: input.reason,
    summary: status === "matched" ? "line_ofc_import_matched_indexed" : "line_ofc_import_review_required_indexed",
  });

  return json({
    ok: true,
    operation: "line_ofc_client_import",
    import_id: input.import_id,
    staging_record_id: record.id,
    status,
    canonical_client_id: clientId || null,
    candidate_count: candidates.length,
    identity_index_version: LINE_OFC_IDENTITY_INDEX_VERSION,
    verified_staging_record_id: identityProjection.verified_staging_record_id,
    pre_session_index_record_id: identityProjection.pre_session_index_record_id,
    pre_session_lookup_status: identityProjection.session_lookup_status,
    membership_mutation: false,
    entitlement_mutation: false,
    telegram_mutation: false,
    audit_id: audit.action_id,
  });
}

function normalizeInput(body = {}) {
  const input = {
    import_id: clean(body.import_id, 180),
    line_user_id: clean(body.line_user_id, 180),
    email: clean(body.email, 254).toLowerCase(),
    phone: clean(body.phone, 80),
    display_name: clean(body.display_name, 160),
    telegram_username: clean(body.telegram_username, 160).replace(/^@/, ""),
    telegram_user_id: clean(body.telegram_user_id, 160),
    current_line_rename: clean(body.current_line_rename, 500),
    raw_line_notes: clean(body.raw_line_notes, 50000),
    membership_application_sensitive: clean(body.membership_application_sensitive, 50000),
    behaviour_care_context: clean(body.behaviour_care_context, 30000),
    service_history_candidate: normalizeJson(body.service_history_candidate, 50000),
    source_hash: clean(body.source_hash, 180),
    reason: clean(body.reason, 1000),
  };
  if (!input.import_id || !input.line_user_id || !input.reason) throw new Error("invalid_request");
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) throw new Error("invalid_request");
  if (!input.raw_line_notes && !input.membership_application_sensitive && !input.behaviour_care_context && !input.service_history_candidate) throw new Error("invalid_request");
  return input;
}

async function collectCandidates(env, table, input) {
  const found = new Map();
  const keys = [
    ["line_user_id", input.line_user_id],
    ["Phone Number", input.phone],
    ["email", input.email],
    ["Contact Email", input.email],
  ];
  for (const [field, value] of keys) {
    if (!value) continue;
    for (const row of await airtableListExact(env, table, field, value, 4, CLIENT_READ_FIELDS)) found.set(row.id, row);
  }
  return [...found.values()];
}

function inferMatchType(candidates, input) {
  if (candidates.length > 1) return "multiple_match_review";
  if (!candidates.length) return "no_match_staging_only";
  const fields = candidates[0]?.fields || {};
  if (same(fields.line_user_id, input.line_user_id)) return "line_user_id_exact";
  if (same(fields["Phone Number"], input.phone)) return "phone_exact";
  if (same(fields.email, input.email) || same(fields["Contact Email"], input.email)) return "email_exact";
  return "name_fuzzy_review";
}

async function syncLineOfcIdentityProjection(env, context) {
  const verifiedStagingTable = clean(
    env.AIRTABLE_TABLE_LINE_OFC_CLIENT_IMPORT_STAGING_ID ||
    env.AIRTABLE_VERIFIED_LINE_OFC_STAGING_TABLE_ID,
  ) || VERIFIED_STAGING_TABLE_DEFAULT;
  const preSessionTable = clean(
    env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID ||
    env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX,
  ) || PRE_SESSION_INDEX_TABLE_DEFAULT;

  const { input, privateStagingRecordId, candidates, clientId, matchType } = context;
  const matched = Boolean(clientId && candidates.length === 1);
  const ambiguous = candidates.length > 1;
  const now = new Date().toISOString();
  const preferredName = firstText(input.current_line_rename, input.display_name);
  const projectionImportId = `line_ofc_verified:${input.import_id}`;

  const verifiedFields = {
    import_id: projectionImportId,
    line_user_id: input.line_user_id,
    line_display_name: input.display_name,
    line_renamed_name: input.current_line_rename,
    normalized_name: preferredName,
    match_type: matchType,
    match_confidence: matched ? 100 : ambiguous ? 40 : 0,
    review_status: matched ? "committed" : ambiguous ? "review_required" : "new",
    decision: matched ? "link_existing_client" : "needs_human",
    decision_source: "worker_exact",
    review_note: matched
      ? "Identity-only projection from verified LINE OA import. Raw notes remain in private staging. Current rights must be re-read from my_mmd_entitlement_resolver_v1."
      : "Identity candidate from verified LINE OA import; canonical client link unresolved. No rights inferred.",
    raw_row_json: JSON.stringify({
      source: "mmd_line_ofc_private_staging",
      source_record_id: privateStagingRecordId,
      import_id: input.import_id,
      identity_only: true,
      source_hash: safeHashRef(input.source_hash),
    }),
    created_at: now,
  };
  if (clientId) {
    verifiedFields.matched_client = [clientId];
    verifiedFields.matched_client_id = clientId;
  }
  if (input.phone) verifiedFields.phone_candidate = input.phone;
  if (input.email) verifiedFields.email_candidate = input.email;

  const verifiedRecord = await airtableUpsertExact(
    env,
    verifiedStagingTable,
    "import_id",
    projectionImportId,
    verifiedFields,
  );

  const identityKey = `line_ofc_import:${input.import_id}`;
  const resolutionStatus = matched ? "linked" : ambiguous ? "review_required" : "candidate";
  const sessionLookupStatus = matched ? "canonical_ready" : ambiguous ? "review_required" : "searchable_candidate";
  const indexFields = {
    identity_key: identityKey,
    source_type: "line_ofc_staging",
    source_record_id: verifiedRecord.id,
    preferred_name: preferredName,
    line_user_id: input.line_user_id,
    line_display_name: input.display_name,
    legacy_signals: "Verified LINE OA identity evidence. Membership/access not inferred.",
    resolution_status: resolutionStatus,
    session_lookup_status: sessionLookupStatus,
    confidence: matched ? "verified" : ambiguous ? "medium" : "high",
    candidate_only: !matched,
    current_rights_source: "my_mmd_entitlement_resolver_v1",
    source_snapshot_json: JSON.stringify({
      version: LINE_OFC_IDENTITY_INDEX_VERSION,
      source: "line_ofc_staging",
      import_id: input.import_id,
      verified_staging_record_id: verifiedRecord.id,
      private_staging_record_id: privateStagingRecordId,
      match_type: matchType,
      identity_only: true,
    }),
    last_synced_at: now,
    notes: matched
      ? "Canonical Client linked from exact LINE/email/phone identity anchor. Create Job may use rename for discovery; rights remain resolver-owned."
      : "Searchable identity candidate only. Create Job must keep public-only/manual reconcile until canonical link is reviewed.",
  };
  if (input.email) indexFields.identity_email = input.email;
  if (clientId) indexFields.linked_client = [clientId];

  const indexRecord = await airtableUpsertExact(
    env,
    preSessionTable,
    "identity_key",
    identityKey,
    indexFields,
  );

  return {
    verified_staging_record_id: verifiedRecord.id,
    pre_session_index_record_id: indexRecord.id,
    session_lookup_status: sessionLookupStatus,
  };
}

function stagingFields(input, status, clientId) {
  const fields = {
    "Import ID": input.import_id,
    "Import Status": status,
    "LINE User ID": input.line_user_id,
    "Current LINE Rename": input.current_line_rename,
    "Raw LINE Notes": input.raw_line_notes,
    "Membership Application (Sensitive)": input.membership_application_sensitive,
    "Behaviour & Care Context": input.behaviour_care_context,
    "Service History Candidate JSON": input.service_history_candidate,
    "Source Hash": input.source_hash,
    "Imported At": new Date().toISOString(),
    "Review Note": "LINE OFC evidence only. Service history requires explicit review before materialization; Telegram remains downstream observed state.",
  };
  if (input.email) fields.Email = input.email;
  if (input.phone) fields.Phone = input.phone;
  if (input.display_name) fields["Display Name"] = input.display_name;
  if (input.telegram_username) fields["Telegram Username"] = input.telegram_username;
  if (input.telegram_user_id) fields["Telegram User ID"] = input.telegram_user_id;
  if (clientId) fields["Canonical Client"] = [clientId];
  return fields;
}

async function createAudit(env, input) {
  const actionId = "audit_" + crypto.randomUUID();
  const record = await airtableCreate(env, ACTIONS_TABLE, {
    action_id: actionId,
    idempotency_key: input.idempotencyKey,
    operation: "line_ofc_client_import",
    target_id: input.targetId,
    actor_id: clean(input.actor?.id || "unknown"),
    actor_role: clean(input.actor?.role || "unknown"),
    expected_version: 0,
    actual_version: 1,
    result: "accepted",
    reason: input.reason,
    redacted_summary: input.summary,
    payload_hash: input.payloadHash,
    request_id: "req_" + crypto.randomUUID(),
    created_at: new Date().toISOString(),
  });
  return { action_id: actionId, record_id: record.id };
}

async function airtableListExact(env, table, field, value, limit, fields = []) {
  const config = airtableConfig(env);
  const query = new URLSearchParams({
    pageSize: String(limit),
    maxRecords: String(limit),
    filterByFormula: "{" + field + "}=\"" + escapeFormula(value) + "\"",
  });
  for (const name of fields) query.append("fields[]", name);
  const response = await fetch(`${AIRTABLE_API}/${config.base}/${table}?${query.toString()}`, { headers: { Authorization: `Bearer ${config.token}` } });
  if (!response.ok) throw new Error("airtable_" + response.status);
  const data = await response.json();
  return Array.isArray(data.records) ? data.records : [];
}

async function airtableUpsertExact(env, table, keyField, keyValue, fields) {
  const existing = await airtableListExact(env, table, keyField, keyValue, 2, [keyField]);
  if (existing.length > 1) throw new Error(`airtable_duplicate_${clean(table, 80)}`);
  if (existing.length === 1) return airtableUpdate(env, table, existing[0].id, fields);
  return airtableCreate(env, table, fields);
}

async function airtableCreate(env, table, fields) {
  const config = airtableConfig(env);
  const response = await fetch(`${AIRTABLE_API}/${config.base}/${table}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error("airtable_" + response.status);
  return response.json();
}

async function airtableUpdate(env, table, recordId, fields) {
  const config = airtableConfig(env);
  const response = await fetch(`${AIRTABLE_API}/${config.base}/${table}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error("airtable_" + response.status);
  return response.json();
}

function airtableConfig(env) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 2000);
  const base = clean(env.AIRTABLE_BASE_ID || BASE_ID_DEFAULT);
  if (!token || !base) throw new Error("airtable_not_configured");
  return { token, base };
}

function normalizeJson(value, max) {
  if (value === undefined || value === null || value === "") return "";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (raw.length > max) throw new Error("invalid_request");
  try { return JSON.stringify(JSON.parse(raw)); } catch (_) { throw new Error("invalid_request"); }
}
async function readJson(request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_request");
    return value;
  } catch (error) {
    if (error.message === "invalid_request") throw error;
    throw new Error("invalid_request");
  }
}
function firstText(...values) { for (const value of values) if (clean(value)) return clean(value); return ""; }
function same(a, b) { return Boolean(clean(a) && clean(b) && clean(a).toLowerCase() === clean(b).toLowerCase()); }
function safeHashRef(value) { const text = clean(value, 180); return text ? text.slice(0, 24) : ""; }
function escapeFormula(value) { return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function clean(value, max = 4000) { return String(value ?? "").trim().slice(0, max); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Cache-Control": "no-store, private", "Content-Type": "application/json; charset=utf-8" } }); }
