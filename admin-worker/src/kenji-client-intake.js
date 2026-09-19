const AIRTABLE_API = "https://api.airtable.com/v0";
const BASE_ID_DEFAULT = "appsV1ILPRfIjkaYg";
const CLIENTS_TABLE_DEFAULT = "tblVv58TCbwh5j1fS";
const ACTIONS_TABLE = "tblUzZ8ImRZOkks4c";

export const KENJI_CLIENT_INTAKE_PATH = "/v1/admin/kenji/control/clients/intake";

const CLIENT_READ_FIELDS = [
  "Client Name",
  "Client Name (Display)",
  "mmd_client_name",
  "nickname",
  "username",
  "line_user_id",
  "Phone Number",
  "email",
  "Contact Email",
  "source",
  "primary_channel",
  "notes_raw",
];

const STRONG_MATCH_FIELDS = [
  ["line_user_id", "line_user_id"],
  ["Phone Number", "phone"],
  ["email", "email"],
  ["Contact Email", "email"],
];

const NAME_MATCH_FIELDS = [
  "Client Name",
  "Client Name (Display)",
  "mmd_client_name",
  "nickname",
  "username",
];

export async function handleKenjiClientIntake(request, env = {}, actor = {}, context = {}) {
  const body = await readJson(request);
  const input = normalizeInput(body);
  const clientsTable = clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS) || CLIENTS_TABLE_DEFAULT;

  const strongCandidates = await collectStrongCandidates(env, clientsTable, input);
  if (strongCandidates.length > 1) throw new Error("client_match_ambiguous");

  let selected = strongCandidates[0] || null;
  let matchedOn = selected ? "strong_identity" : "";

  if (!selected) {
    const nameCandidates = await collectNameCandidates(env, clientsTable, input.display_name);
    if (nameCandidates.length > 1) throw new Error("client_match_ambiguous");
    selected = nameCandidates[0] || null;
    matchedOn = selected ? "exact_name" : "";
  }

  let action = "created";
  let record;
  if (selected) {
    assertNoIdentityConflict(selected.fields || {}, input);
    const patch = missingIdentityPatch(selected.fields || {}, input);
    record = Object.keys(patch).length
      ? await airtableUpdate(env, clientsTable, selected.id, patch)
      : selected;
    action = "matched";
  } else {
    record = await airtableCreate(env, clientsTable, newClientFields(input));
    matchedOn = "created_new_client";
  }

  const audit = await createAudit(env, {
    idempotencyKey: clean(context.idempotencyKey),
    payloadHash: clean(context.payloadHash),
    actor,
    targetId: record.id,
    reason: input.reason,
    summary: action === "created" ? "client_created" : "client_matched",
  });

  return json({
    ok: true,
    operation: "client_intake",
    action,
    client_id: record.id,
    client: projectClient(record, matchedOn),
    membership_mutation: false,
    entitlement_mutation: false,
    private_access_mutation: false,
    audit_id: audit.action_id,
  });
}

function normalizeInput(body = {}) {
  const displayName = clean(body.display_name, 160);
  const lineUserId = clean(body.line_user_id, 180);
  const phone = clean(body.phone, 80);
  const email = clean(body.email, 254).toLowerCase();
  const source = clean(body.source, 120) || "operator_manual";
  const referredBy = clean(body.referred_by, 240);
  const note = clean(body.note, 2000);
  const reason = clean(body.reason, 1000);

  if (!displayName || !reason) throw new Error("invalid_request");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("invalid_request");

  return {
    display_name: displayName,
    line_user_id: lineUserId,
    phone,
    email,
    source,
    referred_by: referredBy,
    note,
    reason,
  };
}

async function collectStrongCandidates(env, table, input) {
  const byId = new Map();
  for (const [field, key] of STRONG_MATCH_FIELDS) {
    const value = clean(input[key]);
    if (!value) continue;
    const rows = await airtableListExact(env, table, field, value, 6, CLIENT_READ_FIELDS);
    for (const row of rows) byId.set(row.id, row);
  }
  return [...byId.values()];
}

async function collectNameCandidates(env, table, displayName) {
  const byId = new Map();
  for (const field of NAME_MATCH_FIELDS) {
    const rows = await airtableListExact(env, table, field, displayName, 6, CLIENT_READ_FIELDS);
    for (const row of rows) byId.set(row.id, row);
  }
  return [...byId.values()];
}

function assertNoIdentityConflict(fields, input) {
  if (input.line_user_id && clean(fields.line_user_id) && clean(fields.line_user_id) !== input.line_user_id) {
    throw new Error("client_identity_conflict");
  }
  if (input.phone && clean(fields["Phone Number"]) && normalizePhone(fields["Phone Number"]) !== normalizePhone(input.phone)) {
    throw new Error("client_identity_conflict");
  }
  const existingEmail = clean(fields.email || fields["Contact Email"]).toLowerCase();
  if (input.email && existingEmail && existingEmail !== input.email) {
    throw new Error("client_identity_conflict");
  }
}

function missingIdentityPatch(fields, input) {
  const patch = {};
  if (!clean(fields["Client Name"])) patch["Client Name"] = input.display_name;
  if (input.line_user_id && !clean(fields.line_user_id)) patch.line_user_id = input.line_user_id;
  if (input.phone && !clean(fields["Phone Number"])) patch["Phone Number"] = input.phone;
  if (input.email && !clean(fields.email) && !clean(fields["Contact Email"])) patch.email = input.email;
  if (!clean(fields.source)) patch.source = input.source;
  if (!clean(fields.primary_channel)) patch.primary_channel = primaryChannel(input);
  if (!clean(fields.notes_raw)) {
    const note = intakeNote(input);
    if (note) patch.notes_raw = note;
  }
  return patch;
}

function newClientFields(input) {
  const fields = {
    "Client Name": input.display_name,
    source: input.source,
    primary_channel: primaryChannel(input),
  };
  if (input.line_user_id) fields.line_user_id = input.line_user_id;
  if (input.phone) fields["Phone Number"] = input.phone;
  if (input.email) fields.email = input.email;
  const note = intakeNote(input);
  if (note) fields.notes_raw = note;
  return fields;
}

function intakeNote(input) {
  return [
    "Kenji Client Intake",
    input.referred_by && `Referred by: ${input.referred_by}`,
    input.note && `Note: ${input.note}`,
  ].filter(Boolean).join("\n").slice(0, 4000);
}

function primaryChannel(input) {
  if (input.line_user_id) return "line_oa";
  if (input.email) return "email";
  if (input.phone) return "phone";
  return "operator_manual";
}

function projectClient(record, matchedOn) {
  const fields = record.fields || {};
  return {
    record_id: record.id,
    display_name: firstText(fields["Client Name (Display)"], fields["Client Name"], fields.mmd_client_name, fields.nickname, fields.username),
    primary_channel: clean(fields.primary_channel),
    source: clean(fields.source),
    matched_on: matchedOn,
  };
}

async function createAudit(env, input) {
  const actionId = "audit_" + crypto.randomUUID();
  const record = await airtableCreate(env, ACTIONS_TABLE, {
    action_id: actionId,
    idempotency_key: input.idempotencyKey,
    operation: "client_intake",
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
    filterByFormula: `{${field}}="${escapeFormula(value)}"`,
  });
  for (const name of fields) query.append("fields[]", name);
  const response = await fetch(`${AIRTABLE_API}/${config.base}/${table}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  if (!response.ok) throw new Error("airtable_" + response.status);
  const data = await response.json();
  return Array.isArray(data.records) ? data.records : [];
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
  const response = await fetch(`${AIRTABLE_API}/${config.base}/${table}/${recordId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error("airtable_" + response.status);
  return response.json();
}

function airtableConfig(env) {
  const base = clean(env.AIRTABLE_BASE_ID || BASE_ID_DEFAULT);
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  if (!base || !token) throw new Error("airtable_config_missing");
  return { base, token };
}

async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("invalid_request");
    return body;
  } catch (error) {
    if (error?.message === "invalid_request") throw error;
    throw new Error("invalid_request");
  }
}

function normalizePhone(value) { return clean(value).replace(/[^0-9+]/g, ""); }
function escapeFormula(value) { return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function firstText(...values) { for (const value of values) { const text = clean(value); if (text) return text; } return ""; }
function clean(value, max = 4000) { return String(value ?? "").trim().slice(0, max); }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Cache-Control": "no-store, private", "Content-Type": "application/json; charset=utf-8" } }); }
