const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const DEFAULT_TABLES = Object.freeze({
  clients: "tblVv58TCbwh5j1fS",
  members: "tblgWc5VRon5o8Mhk",
  entitlements: "tblNImdF9PKAxhXGi",
  aiMessageEvents: "tbljCYfYqfm8gBTPq",
  consoleInbox: "tblFHmfpB2TTrzO2e",
  modelReviewRequests: "tblJ52hVu0f4uhEmS",
});

const CLIENT_FIELDS = [
  "Client Name",
  "mmd_client_name",
  "nickname",
  "username",
  "Status",
  "Verification Status",
  "Privacy Level",
  "Date Added",
  "Last Contacted",
  "primary_channel",
  "line_user_id",
  "email",
  "Contact Email",
  "memberstack_id",
];

const MEMBER_FIELDS = ["member_id", "Clients"];
const ENTITLEMENT_FIELDS = [
  "line_user_id",
  "member_email",
  "memberstack_id",
  "member_status",
  "access_status",
  "entitlement_level",
  "package_code",
  "start_at",
  "expire_at",
  "renewal_status",
  "relationship_tier",
  "points_balance_snapshot",
];
const CONVERSATION_FIELDS = [
  "event_id",
  "created_at",
  "channel",
  "source_path",
  "line_user_id",
  "contact_value",
  "detected_intent",
  "risk_level",
  "response_mode",
  "handoff_required",
  "handoff_reason",
  "final_status",
  "linked_session_id",
];
const CONSOLE_FIELDS = ["inbox_id", "created_at", "created_by", "source", "intent", "status"];
const MODEL_REVIEW_FIELDS = [
  "request_id",
  "request_type",
  "request_status",
  "requested_by",
  "requested_at",
  "requested_visibility",
];

export const KENJI_CONTROL_ENDPOINTS = Object.freeze({
  memory: "/v1/admin/kenji/control/memory",
  conversations: "/v1/admin/kenji/control/conversations",
  approvals: "/v1/admin/kenji/control/approvals",
});

export function isKenjiControlRequest(path, method = "GET") {
  return method === "GET" && Object.values(KENJI_CONTROL_ENDPOINTS).includes(normalizePath(path));
}

export async function handleKenjiControlRequest(request, env) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (!isKenjiControlRequest(path, request.method.toUpperCase())) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  const limit = boundedLimit(url.searchParams.get("limit"));
  try {
    if (path === KENJI_CONTROL_ENDPOINTS.memory) {
      return json(await readMemory(url.searchParams, env));
    }
    if (path === KENJI_CONTROL_ENDPOINTS.conversations) {
      return json(await readConversations(url.searchParams, env, limit));
    }
    return json(await readApprovals(url.searchParams, env, limit));
  } catch (error) {
    const code = String(error?.message || "endpoint_error");
    if (code === "query_required") return json({ ok: false, error: code }, 400);
    if (code === "airtable_config_missing") return json({ ok: false, error: code }, 503);
    return json({ ok: false, error: "endpoint_unavailable" }, 503);
  }
}

async function readMemory(params, env) {
  requireIdentity(params);
  const client = await resolveClient(params, env);
  if (!client) return { ok: true, data_status: "empty", memory: null };

  const entitlement = await resolveEntitlement(client, params, env);
  const fields = client.fields || {};
  const entitlementFields = entitlement?.fields || {};

  return {
    ok: true,
    data_status: "live",
    memory: {
      record_id: client.id,
      display_name: safeValue(fields, ["Client Name", "mmd_client_name", "nickname", "username"]),
      status: safeValue(fields, ["Status"]),
      verification_status: safeValue(fields, ["Verification Status"]),
      privacy_level: safeValue(fields, ["Privacy Level"]),
      date_added: safeValue(fields, ["Date Added"]),
      last_contact_at: safeValue(fields, ["Last Contacted"]),
      primary_channel: safeValue(fields, ["primary_channel"]),
      membership_status: safeValue(entitlementFields, ["member_status"]),
      access_status: safeValue(entitlementFields, ["access_status"]),
      membership_tier: safeValue(entitlementFields, ["entitlement_level", "relationship_tier"]),
      relationship_tier: safeValue(entitlementFields, ["relationship_tier"]),
      package_code: safeValue(entitlementFields, ["package_code"]),
      member_since: safeValue(entitlementFields, ["start_at"]),
      renewal_due: safeValue(entitlementFields, ["expire_at"]),
      renewal_status: safeValue(entitlementFields, ["renewal_status"]),
      points_confirmed: safeValue(entitlementFields, ["points_balance_snapshot"]),
      source: entitlement ? "Clients + MMD — Member Entitlements" : "Clients",
      privacy: "internal_admin_projection",
    },
  };
}

async function readConversations(params, env, limit) {
  requireIdentity(params);
  const client = await resolveClient(params, env);
  const conditions = conversationIdentityConditions(params, client);
  if (!conditions.length) {
    return { ok: true, data_status: "empty", count: 0, conversations: [], privacy: "internal_admin_projection" };
  }

  const records = await listRecords(
    env,
    tableName(env, "aiMessageEvents"),
    conditions,
    limit,
    CONVERSATION_FIELDS,
    "created_at"
  );

  return {
    ok: true,
    data_status: records.length ? "live" : "empty",
    count: records.length,
    conversations: records.map(projectConversation),
    privacy: "internal_admin_projection",
  };
}

async function readApprovals(params, env, limit) {
  const status = firstNonEmpty(params.get("status"), "pending").toLowerCase();
  const [consoleRecords, modelReviewRecords] = await Promise.all([
    listRecords(env, tableName(env, "consoleInbox"), [], limit, CONSOLE_FIELDS, "created_at"),
    listRecords(env, tableName(env, "modelReviewRequests"), [], limit, MODEL_REVIEW_FIELDS, "requested_at"),
  ]);

  const rows = [
    ...consoleRecords.map(projectConsoleApproval),
    ...modelReviewRecords.map(projectModelApproval),
  ].filter((item) => status === "all" || matchesStatus(item.status, status));

  rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const approvals = rows.slice(0, limit);
  return {
    ok: true,
    data_status: approvals.length ? "live" : "empty",
    count: approvals.length,
    approvals,
    privacy: "internal_admin_projection",
  };
}

function requireIdentity(params) {
  const identity = firstNonEmpty(
    params.get("client_id"),
    params.get("member_id"),
    params.get("line_user_id"),
    params.get("email")
  );
  if (!identity) throw new Error("query_required");
  return identity;
}

async function resolveClient(params, env) {
  const clientId = clean(params.get("client_id"));
  if (isRecordId(clientId)) {
    const direct = await findRecordById(env, tableName(env, "clients"), clientId, CLIENT_FIELDS);
    if (direct) return direct;
  }

  const memberId = clean(params.get("member_id"));
  if (memberId) {
    const members = await listRecords(
      env,
      tableName(env, "members"),
      [{ field: "member_id", value: memberId }],
      1,
      MEMBER_FIELDS
    );
    const linkedClientId = firstLinkedRecordId(members[0]?.fields?.Clients);
    if (linkedClientId) {
      const linked = await findRecordById(env, tableName(env, "clients"), linkedClientId, CLIENT_FIELDS);
      if (linked) return linked;
    }
  }

  const conditions = [];
  pushCondition(conditions, "line_user_id", params.get("line_user_id"));
  pushCondition(conditions, "email", params.get("email"));
  pushCondition(conditions, "Contact Email", params.get("email"));
  if (clientId) {
    for (const field of ["memberstack_id", "Client Name", "mmd_client_name", "username"]) {
      pushCondition(conditions, field, clientId);
    }
  }
  if (!conditions.length) return null;

  const records = await listRecords(env, tableName(env, "clients"), conditions, 1, CLIENT_FIELDS);
  return records[0] || null;
}

async function resolveEntitlement(client, params, env) {
  const fields = client?.fields || {};
  const conditions = [];
  pushCondition(conditions, "line_user_id", firstNonEmpty(params.get("line_user_id"), fields.line_user_id));
  pushCondition(conditions, "member_email", firstNonEmpty(params.get("email"), fields.email, fields["Contact Email"]));
  pushCondition(conditions, "memberstack_id", fields.memberstack_id);
  if (!conditions.length) return null;

  const records = await listRecords(
    env,
    tableName(env, "entitlements"),
    conditions,
    1,
    ENTITLEMENT_FIELDS,
    "expire_at"
  );
  return records[0] || null;
}

function conversationIdentityConditions(params, client) {
  const fields = client?.fields || {};
  const conditions = [];
  pushCondition(conditions, "line_user_id", firstNonEmpty(params.get("line_user_id"), fields.line_user_id));
  pushCondition(conditions, "contact_value", firstNonEmpty(params.get("email"), fields.email, fields["Contact Email"]));
  return conditions;
}

function projectConversation(record) {
  const fields = record.fields || {};
  return {
    record_id: record.id,
    event_id: safeValue(fields, ["event_id"]),
    created_at: safeValue(fields, ["created_at"]),
    channel: safeValue(fields, ["channel"]),
    source_path: safeValue(fields, ["source_path"]),
    intent: safeValue(fields, ["detected_intent"]),
    risk_level: safeValue(fields, ["risk_level"]),
    response_mode: safeValue(fields, ["response_mode"]),
    handoff_required: safeValue(fields, ["handoff_required"]),
    handoff_reason: safeValue(fields, ["handoff_reason"]),
    status: safeValue(fields, ["final_status"]),
    linked_session_id: safeValue(fields, ["linked_session_id"]),
  };
}

function projectConsoleApproval(record) {
  const fields = record.fields || {};
  const intent = safeValue(fields, ["intent"]);
  return {
    record_id: record.id,
    request_id: safeValue(fields, ["inbox_id"]),
    source: "MMD — Console Inbox",
    type: intent,
    title: intent || "Console Inbox",
    status: safeValue(fields, ["status"]),
    created_at: safeValue(fields, ["created_at"]),
    owner: safeValue(fields, ["created_by"]),
  };
}

function projectModelApproval(record) {
  const fields = record.fields || {};
  const type = safeValue(fields, ["request_type"]);
  return {
    record_id: record.id,
    request_id: safeValue(fields, ["request_id"]),
    source: "MMD — Model Review Requests",
    type,
    title: type || "Model Review Request",
    status: safeValue(fields, ["request_status"]),
    created_at: safeValue(fields, ["requested_at"]),
    owner: safeValue(fields, ["requested_by"]),
    requested_visibility: safeValue(fields, ["requested_visibility"]),
  };
}

async function findRecordById(env, table, recordId, fields) {
  const formula = `RECORD_ID()="${escapeFormulaString(recordId)}"`;
  const records = await listRecordsByFormula(env, table, formula, 1, fields);
  return records[0] || null;
}

async function listRecords(env, table, conditions, limit, fields = [], sortField = "") {
  const formula = makeOrFormula(conditions);
  return listRecordsByFormula(env, table, formula, limit, fields, sortField);
}

async function listRecordsByFormula(env, table, formula, limit, fields = [], sortField = "") {
  const config = airtableConfig(env);
  const query = new URLSearchParams();
  const bounded = Math.min(Math.max(limit || 1, 1), 25);
  query.set("pageSize", String(bounded));
  query.set("maxRecords", String(bounded));
  if (formula) query.set("filterByFormula", formula);
  if (sortField) {
    query.set("sort[0][field]", sortField);
    query.set("sort[0][direction]", "desc");
  }
  for (const field of fields) query.append("fields[]", field);

  const response = await fetch(
    `https://api.airtable.com/v0/${encodeURIComponent(config.baseId)}/${encodeURIComponent(table)}?${query.toString()}`,
    { headers: { Authorization: `Bearer ${config.token}` } }
  );
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  const data = await response.json();
  return Array.isArray(data.records) ? data.records.slice(0, bounded) : [];
}

function airtableConfig(env) {
  const baseId = clean(env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID);
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN);
  if (!baseId || !token) throw new Error("airtable_config_missing");
  return { baseId, token };
}

function tableName(env, key) {
  const map = {
    clients: env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || DEFAULT_TABLES.clients,
    members: env.AIRTABLE_TABLE_MEMBERS_ID || DEFAULT_TABLES.members,
    entitlements: env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || DEFAULT_TABLES.entitlements,
    aiMessageEvents: env.AIRTABLE_TABLE_AI_MESSAGE_EVENTS_ID || env.AIRTABLE_TABLE_AI_MESSAGE_EVENTS || DEFAULT_TABLES.aiMessageEvents,
    consoleInbox: env.AIRTABLE_TABLE_CONSOLE_INBOX_ID || env.AIRTABLE_TABLE_CONSOLE_INBOX || DEFAULT_TABLES.consoleInbox,
    modelReviewRequests: env.AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS_ID || env.AIRTABLE_TABLE_MODEL_REVIEW_REQUESTS || DEFAULT_TABLES.modelReviewRequests,
  };
  return clean(map[key]);
}

function makeOrFormula(conditions = []) {
  const normalized = conditions
    .filter((item) => item && clean(item.field) && clean(item.value))
    .map((item) => `{${item.field}}="${escapeFormulaString(item.value)}"`);
  if (!normalized.length) return "";
  if (normalized.length === 1) return normalized[0];
  return `OR(${normalized.join(",")})`;
}

function pushCondition(list, field, value) {
  const normalized = clean(value);
  if (normalized) list.push({ field, value: normalized });
}

function escapeFormulaString(value) {
  return clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function firstLinkedRecordId(value) {
  if (!Array.isArray(value) || !value.length) return "";
  const first = value[0];
  if (typeof first === "string") return first;
  return clean(first?.id);
}

function safeValue(fields, names) {
  for (const name of names) {
    const value = fields[name];
    if (value === null || value === undefined || value === "") continue;
    if (["string", "number", "boolean"].includes(typeof value)) return value;
    if (Array.isArray(value)) {
      return value.slice(0, 10).map((item) => (typeof item === "object" ? item?.name || item?.id || "" : item));
    }
  }
  return null;
}

function matchesStatus(value, expected) {
  const actual = clean(value).toLowerCase();
  const wanted = clean(expected).toLowerCase();
  if (wanted === "pending") {
    return !["approved", "published", "resolved", "closed", "done", "archived", "rejected", "cancelled", "canceled"].includes(actual);
  }
  return actual === wanted;
}

function boundedLimit(value) {
  const parsed = Number.parseInt(value || "25", 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : 25, 1), 25);
}

function isRecordId(value) {
  return /^rec[A-Za-z0-9]{14}$/.test(clean(value));
}

function firstNonEmpty(...values) {
  return values.map(clean).find(Boolean) || "";
}

function clean(value) {
  return String(value ?? "").trim();
}

function normalizePath(pathname = "") {
  const value = String(pathname || "/").replace(/\/{2,}/g, "/");
  return value.length > 1 ? value.replace(/\/+$/g, "") : value;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
