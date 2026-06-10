const AIRTABLE_API = "https://api.airtable.com/v0";

const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const TABLES = {
  applications: "tbl8z2MQpIqcdylim",
  members: "tblgWc5VRon5o8Mhk",
  clients: "tblVv58TCbwh5j1fS",
  payments: "tblWGGJJOx5eBvBZJ",
  activityLogs: "tblbUWRoFL6OI6QMJ",
  consoleInbox: "tblFHmfpB2TTrzO2e",
  memberEntitlements: "tblNImdF9PKAxhXGi",
};

const ACTIONS = new Set(["new", "renewal", "recover_access", "upgrade"]);

export function normalizeMembershipPayload(payload = {}) {
  const membershipAction = normalizeAction(payload.membership_action || payload.request_type || payload.action);
  const rawUsername = text(payload.username || payload.member_username || payload.display_name);
  const rawClientName = text(payload.mmd_client_name || payload.nickname || payload.preferred_name);
  const username = normalizeUsername(rawUsername || rawClientName || payload.email || payload.telegram_username);
  const mmdClientName = rawClientName || rawUsername || username;
  const lineUserId = text(payload.line_user_id || payload.lineId || payload.line_userid);

  return {
    ...payload,
    membership_action: membershipAction,
    requested_membership_action: membershipAction,
    username,
    mmd_client_name: mmdClientName,
    email: normalizeEmail(payload.email),
    phone: normalizePhone(payload.phone || payload.member_phone),
    memberstack_id: text(payload.memberstack_id || payload.member_id),
    telegram_username: normalizeTelegram(payload.telegram_username || payload.telegram),
    line_id: text(payload.line_id || lineUserId),
    line_user_id: lineUserId || text(payload.line_id),
    source_page: text(payload.source_page) || "/trust/inme",
  };
}

export function normalizeUsername(value) {
  const raw = text(value).replace(/^@+/, "");
  if (!raw) return "";
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 64);
}

export function resolveMembershipDecision(requestedAction, existingMember) {
  let membershipAction = normalizeAction(requestedAction);
  if (existingMember && membershipAction === "new") membershipAction = "renewal";

  if (membershipAction === "recover_access") {
    return { membership_action: membershipAction, status: "access_recovery", next_action: "recover_access" };
  }

  if (membershipAction === "upgrade") {
    return { membership_action: membershipAction, status: "under_review", next_action: "upgrade_under_review" };
  }

  if (membershipAction === "renewal") {
    return { membership_action: membershipAction, status: "payment_pending", next_action: "renewal_payment_pending" };
  }

  return { membership_action: "new", status: "payment_pending", next_action: "show_payment_options" };
}

export async function handleMembershipRequest(request, env) {
  try {
    if (request.method !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }

    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ ok: false, error: "invalid_json_payload" }, 400);
    }

    const normalized = normalizeMembershipPayload(body);
    if (!normalized.username && !normalized.email && !normalized.phone && !normalized.memberstack_id) {
      return json({ ok: false, error: "identity_required" }, 400);
    }
    if (!hasAirtable(env)) {
      return json({ ok: false, error: "missing_airtable_env" }, 500);
    }

    const requestId = makeRequestId();
    const existingMember = await findExistingMember(env, normalized);
    const existingClient = await findExistingClient(env, normalized);
    const decision = resolveMembershipDecision(normalized.membership_action, existingMember);
    const auditPayload = buildAuditPayload(request, requestId, normalized, decision, existingMember, existingClient);

    let applicationRecord = null;
    if (!existingMember) {
      applicationRecord = await createApplicationDraft(env, auditPayload);
    }

    const clientRecord = existingClient || (await createClientIfUseful(env, auditPayload));

    const [activityRecord, inboxRecord] = await Promise.all([
      createActivityLog(env, auditPayload, applicationRecord, clientRecord),
      createConsoleInbox(env, auditPayload, applicationRecord, clientRecord),
    ]);

    return json({
      ok: true,
      request_id: requestId,
      membership_request_id: requestId,
      request_type: decision.membership_action,
      membership_action: decision.membership_action,
      requested_membership_action: normalized.requested_membership_action,
      status: decision.status,
      next_action: decision.next_action,
      existing_member: Boolean(existingMember),
      application_record_id: applicationRecord?.id || null,
      client_record_id: clientRecord?.id || null,
      access_granted: false,
      memberstack_access_granted: false,
      payment_proof_verified: false,
      payment_status: "pending",
      verification_status: "pending",
      activity_log_record_id: activityRecord?.id || null,
      console_inbox_record_id: inboxRecord?.id || null,
      record_ids: {
        membership_application: applicationRecord?.id || null,
        client: clientRecord?.id || null,
        activity_log: activityRecord?.id || null,
        console_inbox: inboxRecord?.id || null,
      },
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "membership_request_failed",
        message: String(error?.message || error),
        access_granted: false,
      },
      502
    );
  }
}

function normalizeAction(value) {
  const action = text(value).toLowerCase();
  return ACTIONS.has(action) ? action : "new";
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeEmail(value) {
  return text(value).toLowerCase();
}

function normalizePhone(value) {
  return text(value).replace(/[^\d+]/g, "");
}

function normalizeTelegram(value) {
  return text(value).replace(/^@+/, "").toLowerCase();
}

function makeRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `memreq_${Date.now().toString(36)}_${suffix}`;
}

async function readJson(request) {
  try {
    const textBody = await request.text();
    return textBody ? JSON.parse(textBody) : {};
  } catch (_) {
    return null;
  }
}

function table(env, key) {
  const envKey = {
    applications: "AIRTABLE_TABLE_MEMBERSHIP_APPLICATIONS",
    members: "AIRTABLE_TABLE_MEMBERS",
    clients: "AIRTABLE_TABLE_CLIENTS",
    payments: "AIRTABLE_TABLE_PAYMENTS",
    activityLogs: "AIRTABLE_TABLE_ACTIVITY_LOGS",
    consoleInbox: "AIRTABLE_TABLE_CONSOLE_INBOX_ID",
    memberEntitlements: "AIRTABLE_TABLE_MEMBER_ENTITLEMENTS",
  }[key];
  return text(env?.[envKey]) || TABLES[key];
}

function baseId(env) {
  return text(env?.AIRTABLE_BASE_ID) || DEFAULT_BASE_ID;
}

function hasAirtable(env) {
  return Boolean(text(env?.AIRTABLE_API_KEY) && baseId(env));
}

async function airtableRequest(env, tableId, init, query = "") {
  if (!hasAirtable(env)) throw new Error("missing_airtable_env");
  const url = `${AIRTABLE_API}/${encodeURIComponent(baseId(env))}/${encodeURIComponent(tableId)}${query}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`airtable_${response.status}_${JSON.stringify(data)}`);
  }
  return data;
}

async function airtableCreate(env, tableId, fields) {
  return airtableCreateRaw(env, tableId, compact(fields));
}

async function airtableCreateRaw(env, tableId, fields) {
  const data = await airtableRequest(env, tableId, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: compact(fields) }], typecast: true }),
  });
  const record = data.records?.[0] || {};
  return { id: record.id || "", fields: record.fields || {} };
}

async function airtableFindFirst(env, tableId, formula) {
  if (!hasAirtable(env) || !formula) return null;
  const params = new URLSearchParams();
  params.set("pageSize", "1");
  params.set("filterByFormula", formula);
  try {
    const data = await airtableRequest(env, tableId, { method: "GET" }, `?${params.toString()}`);
    const record = data.records?.[0];
    return record ? { id: record.id, fields: record.fields || {} } : null;
  } catch (_) {
    return null;
  }
}

async function findExistingMember(env, payload) {
  return findIdentityRecord(env, table(env, "members"), payload);
}

async function findExistingClient(env, payload) {
  return findIdentityRecord(env, table(env, "clients"), payload);
}

async function findIdentityRecord(env, tableId, payload) {
  const formulas = identityFormulas(payload);
  for (const formula of formulas) {
    const record = await airtableFindFirst(env, tableId, formula);
    if (record) return record;
  }
  return null;
}

function identityFormulas(payload) {
  const candidates = [
    ["memberstack_id", payload.memberstack_id],
    ["email", payload.email],
    ["Email", payload.email],
    ["phone", payload.phone],
    ["Phone Number", payload.phone],
    ["telegram_username", payload.telegram_username],
    ["Telegram Username", payload.telegram_username],
    ["line_id", payload.line_id],
    ["line_user_id", payload.line_user_id],
    ["Line User ID", payload.line_user_id],
  ];
  return candidates
    .filter(([, value]) => text(value))
    .map(([field, value]) => `{${field}}="${escapeFormulaValue(value)}"`);
}

function buildAuditPayload(request, requestId, payload, decision, existingMember, existingClient) {
  return {
    request_id: requestId,
    received_at: new Date().toISOString(),
    source_page: payload.source_page,
    source: "trust_inme",
    requested_membership_action: payload.requested_membership_action,
    membership_action: decision.membership_action,
    status: decision.status,
    next_action: decision.next_action,
    username: payload.username,
    mmd_client_name: payload.mmd_client_name,
    email: payload.email,
    phone: payload.phone,
    memberstack_id: payload.memberstack_id,
    telegram_username: payload.telegram_username,
    line_id: payload.line_id,
    line_user_id: payload.line_user_id,
    package_code: text(payload.package_code || payload.target_package || payload.membership_tier),
    proof_url: text(payload.proof_url || payload.slip_url || payload.payment_proof_url),
    note: text(payload.note || payload.message || payload.admin_note),
    ip: clientIp(request),
    user_agent: text(request.headers.get("user-agent")),
    existing_member_id: existingMember?.id || "",
    existing_client_id: existingClient?.id || "",
    access_granted: false,
    raw_payload: payload,
  };
}

async function createApplicationDraft(env, audit) {
  const fields = {
    request_id: audit.request_id,
    application_id: audit.request_id,
    source: audit.source,
    source_page: audit.source_page,
    membership_action: audit.membership_action,
    requested_membership_action: audit.requested_membership_action,
    status: audit.status,
    next_action: audit.next_action,
    username: audit.username,
    mmd_client_name: audit.mmd_client_name,
    email: audit.email,
    phone: audit.phone,
    memberstack_id: audit.memberstack_id,
    telegram_username: audit.telegram_username,
    line_id: audit.line_id,
    line_user_id: audit.line_user_id,
    package_code: audit.package_code,
    proof_url: audit.proof_url,
    note: audit.note,
    access_granted: false,
    created_at: audit.received_at,
    payload_json: JSON.stringify(audit.raw_payload),
  };
  return createWithFallback(env, table(env, "applications"), fields, [
    pickFields(fields, ["request_id", "membership_action", "status", "email", "phone", "memberstack_id", "payload_json"]),
    pickFields(fields, ["application_id", "status", "email", "phone", "payload_json"]),
    { request_id: audit.request_id, status: audit.status },
    {},
  ]);
}

async function createClientIfUseful(env, audit) {
  if (!audit.email && !audit.phone && !audit.line_user_id && !audit.telegram_username && !audit.username) {
    return null;
  }
  try {
    const fields = {
      "Client Name": audit.mmd_client_name || audit.username,
      client_name: audit.mmd_client_name || audit.username,
      username: audit.username,
      email: audit.email,
      "Phone Number": audit.phone,
      phone: audit.phone,
      memberstack_id: audit.memberstack_id,
      telegram_username: audit.telegram_username,
      line_id: audit.line_id,
      line_user_id: audit.line_user_id,
      source: audit.source,
      membership_status: "request_pending",
      last_membership_request_id: audit.request_id,
      notes: audit.note,
      payload_json: JSON.stringify(audit.raw_payload),
    };
    return await createWithFallback(env, table(env, "clients"), fields, [
      pickFields(fields, ["Client Name", "email", "Phone Number", "line_user_id", "telegram_username"]),
      pickFields(fields, ["client_name", "email", "phone", "line_user_id", "telegram_username"]),
      { "Client Name": audit.mmd_client_name || audit.username || audit.email },
    ]);
  } catch (_) {
    return null;
  }
}

async function createActivityLog(env, audit, applicationRecord, clientRecord) {
  try {
    const fields = {
      Action: "membership.request.created",
      Target: audit.request_id,
      Details: JSON.stringify(redactAuditPayload(audit)),
      "Created At": audit.received_at,
      action: "membership.request.created",
      target: audit.request_id,
      ip: audit.ip,
      user_agent: audit.user_agent,
      request_id: audit.request_id,
      membership_action: audit.membership_action,
      status: audit.status,
      memberstack_id: audit.memberstack_id,
      member_email: audit.email,
      client_record_id: clientRecord?.id || audit.existing_client_id,
      member_record_id: audit.existing_member_id,
      application_record_id: applicationRecord?.id || "",
      payload_json: JSON.stringify(redactAuditPayload(audit)),
    };
    return await createWithFallback(env, table(env, "activityLogs"), fields, [
      pickFields(fields, ["Action", "Target", "Details", "Created At"]),
      pickFields(fields, ["Action", "Target", "Details"]),
      pickFields(fields, ["action", "target", "ip", "user_agent"]),
      { action: "membership.request.created", target: audit.request_id },
      {},
    ]);
  } catch (_) {
    return null;
  }
}

async function createConsoleInbox(env, audit, applicationRecord, clientRecord) {
  const fields = {
    inbox_id: audit.request_id,
    source: audit.source,
    intent: `membership_${audit.membership_action}`,
    member_name: audit.mmd_client_name || audit.username,
    member_email: audit.email,
    member_phone: audit.phone,
    memberstack_id: audit.memberstack_id,
    telegram_username: audit.telegram_username,
    line_user_id: audit.line_user_id,
    line_id: audit.line_id,
    admin_note: buildAdminNote(audit),
    status: "new",
    error_message: "",
    linked_member: audit.existing_member_id ? [audit.existing_member_id] : undefined,
    payload_json: JSON.stringify({
      ...redactAuditPayload(audit),
      application_record_id: applicationRecord?.id || null,
      client_record_id: clientRecord?.id || audit.existing_client_id || null,
    }),
  };
  return createWithFallback(env, table(env, "consoleInbox"), fields, [
    pickFields(fields, [
      "inbox_id",
      "source",
      "intent",
      "member_name",
      "member_email",
      "member_phone",
      "memberstack_id",
      "telegram_username",
      "line_user_id",
      "line_id",
      "admin_note",
      "payload_json",
      "status",
      "error_message",
    ]),
    pickFields(fields, ["inbox_id", "source", "intent", "admin_note", "payload_json", "status"]),
    { inbox_id: audit.request_id, source: audit.source, intent: `membership_${audit.membership_action}` },
  ]);
}

async function createWithFallback(env, tableId, primaryFields, fallbacks = []) {
  const attempts = [primaryFields, ...fallbacks].map(compact);
  let lastError = null;
  for (const fields of attempts) {
    try {
      return await airtableCreateRaw(env, tableId, fields);
    } catch (error) {
      lastError = error;
      if (!String(error?.message || error).includes("UNKNOWN_FIELD_NAME")) break;
    }
  }
  throw lastError || new Error("airtable_create_failed");
}

function pickFields(source, keys) {
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

function buildAdminNote(audit) {
  const proofNote = audit.proof_url ? " Proof/slip was supplied but is not confirmation." : "";
  return [
    `Membership ${audit.membership_action} request from /trust/inme.`,
    `Next action: ${audit.next_action}.`,
    audit.existing_member_id ? `Matched member: ${audit.existing_member_id}.` : "No existing member matched.",
    "Do not grant Memberstack access until payment verification or admin approval is complete.",
    proofNote,
    audit.note,
  ]
    .filter(Boolean)
    .join(" ");
}

function redactAuditPayload(audit) {
  return {
    ...audit,
    raw_payload: {
      ...audit.raw_payload,
      proof_file: audit.raw_payload?.proof_file ? "[redacted]" : undefined,
      slip_file: audit.raw_payload?.slip_file ? "[redacted]" : undefined,
    },
  };
}

function clientIp(request) {
  return text(
    request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      request.headers.get("x-real-ip")
  );
}

function escapeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => {
      if (entry === undefined || entry === null) return false;
      if (typeof entry === "string") return entry.trim().length > 0;
      return true;
    })
  );
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
