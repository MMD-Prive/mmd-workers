import crypto from "node:crypto";
import {
  buildCustomerVisibleProfile,
  buildKenjiMemorySnapshot,
  buildMmdClientId,
  parseLatestSignupFromRenamedName,
} from "../../../shared/kenji-member-memory-snapshot.mjs";
import {
  buildCustomerMemorySnapshotV2,
  buildKenjiSafeContextV2,
} from "../../../shared/kenji-customer-memory-v2.mjs";
import {
  buildConversationMatrixV1,
} from "../../../shared/kenji-conversation-matrix.mjs";
import {
  buildKenjiEntitlementSnapshot,
  projectKenjiAccess,
} from "./kenji-entitlement-runtime-contract.mjs";

const TABLES = Object.freeze({
  CLIENTS: "Clients",
  LINE_OFC_STAGING: "LINE OFC Client Import Staging",
  MEMBER_ENTITLEMENTS: "MMD — Member Entitlements",
  AI_MESSAGE_EVENTS: "SIGIL — AI Message Events",
  CUSTOMER_MEMORY: "MMD — Customer Memory Snapshots",
  CONVERSATION_MATRIX: "MMD — Kenji Conversation Matrix",
});

const F = Object.freeze({
  CLIENT_USERNAME: "username",
  CLIENT_MMD_NAME: "mmd_client_name",
  CLIENT_NICKNAME: "nickname",
  CLIENT_SUFFIX: "suffix_code",
  CLIENT_LINE_USER_ID: "line_user_id",
  CLIENT_LINE_DISPLAY_NAME: "line_display_name",
  CLIENT_POINTS_BALANCE: "Points Balance",
  CLIENT_MEMBERSHIP_STATUS: "Membership Status",
  CLIENT_EXPIRE_AT: "Expire At",
  STAGING_LINE_USER_ID: "line_user_id",
  STAGING_LINE_DISPLAY_NAME: "line_display_name",
  STAGING_LINE_RENAMED_NAME: "line_renamed_name",
  STAGING_NORMALIZED_NAME: "normalized_name",
  STAGING_PARSED_PACKAGE: "parsed_membership_package",
  STAGING_PARSED_LEVEL: "parsed_client_level",
  STAGING_PROPOSED_POINTS: "proposed_points",
  STAGING_SERVICE_AMOUNT: "service_amount",
  ENT_LINE_USER_ID: "line_user_id",
  ENT_CLIENT: "client",
  ENT_MEMBER_STATUS: "member_status",
  ENT_LIFECYCLE_STATUS: "member_lifecycle_status",
  ENT_ACCESS_STATUS: "access_status",
  ENT_CAPABILITY: "capability",
  ENT_LEVEL: "entitlement_level",
  ENT_PACKAGE_CODE: "package_code",
  ENT_RELATIONSHIP_TIER: "relationship_tier",
  ENT_START_AT: "start_at",
  ENT_EXPIRE_AT: "expire_at",
  ENT_GRACE_UNTIL: "grace_until",
  ENT_SOURCE: "source",
  ENT_SOURCE_REF: "source_ref",
  EVENT_ID: "event_id",
  EVENT_CREATED_AT: "created_at",
  EVENT_LINE_USER_ID: "line_user_id",
  EVENT_INTENT: "detected_intent",
  EVENT_HANDOFF_REQUIRED: "handoff_required",
  EVENT_HANDOFF_REASON: "handoff_reason",
  EVENT_FINAL_STATUS: "final_status",
  EVENT_LINKED_SESSION_ID: "linked_session_id",
  MATRIX_ID: "matrix_id",
  MATRIX_CLIENT: "Client",
  MATRIX_MEMORY: "Memory Snapshot",
  MATRIX_SCHEMA: "schema_version",
  MATRIX_CONVERSATION_HASH: "conversation_id_hash",
  MATRIX_CHANNEL: "channel",
  MATRIX_SCOPE: "conversation_scope",
  MATRIX_TOPIC: "topic",
  MATRIX_SUBTOPIC: "subtopic",
  MATRIX_RELATIONSHIP: "relationship_context",
  MATRIX_LAST_INTENT: "last_customer_intent",
  MATRIX_LAST_REQUEST: "last_customer_request",
  MATRIX_LAST_CUSTOMER_ACTION: "last_customer_action",
  MATRIX_LAST_KENJI_ACTION: "last_kenji_action",
  MATRIX_LAST_OUTCOME: "last_confirmed_outcome",
  MATRIX_STAGE: "conversation_stage",
  MATRIX_AWAITING: "awaiting_from",
  MATRIX_PENDING_ACTION: "pending_action",
  MATRIX_PENDING_REF: "pending_reference",
  MATRIX_CONTINUITY: "continuity_summary",
  MATRIX_DONT_ASK: "do_not_ask_again_json",
  MATRIX_OPEN_LOOPS: "important_open_loops_json",
  MATRIX_HANDOFF_REQUIRED: "handoff_required",
  MATRIX_HANDOFF_OWNER: "handoff_owner",
  MATRIX_HANDOFF_REASON: "handoff_reason",
  MATRIX_TRUTH_REQUIRED: "live_truth_required",
  MATRIX_TRUTH_DOMAINS: "live_truth_domains",
  MATRIX_LAST_EVENT: "last_event_id",
  MATRIX_LAST_INTERACTION: "last_interaction_at",
  MATRIX_UPDATED_AT: "state_updated_at",
  MATRIX_EXPIRES_AT: "state_expires_at",
  MATRIX_STATUS: "matrix_status",
  MATRIX_VERSION: "version",
  MATRIX_PAYLOAD: "payload_json",
});

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function esc(value) {
  return text(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function formulaEq(field, value) {
  return `{${field}}="${esc(value)}"`;
}

function hashRef(value) {
  return crypto.createHash("sha256").update(text(value)).digest("hex");
}

async function airtableList({ baseId, apiKey, tableName, params = {} }) {
  if (!baseId || !apiKey || !tableName) return [];
  const table = encodeURIComponent(tableName);
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${table}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  return Array.isArray(payload?.records) ? payload.records : [];
}

async function airtableWrite({ baseId, apiKey, tableName, method = "POST", body }) {
  if (!baseId || !apiKey || !tableName || !body) return null;
  const table = encodeURIComponent(tableName);
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${table}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function findClientByLineUserId(options, lineUserId) {
  if (!lineUserId) return null;
  const rows = await airtableList({
    ...options,
    tableName: TABLES.CLIENTS,
    params: { maxRecords: 1, filterByFormula: formulaEq(F.CLIENT_LINE_USER_ID, lineUserId) },
  });
  return rows[0] || null;
}

async function findLegacyByLineIdentity(options, { lineUserId, lineDisplayName }) {
  const filters = [];
  if (lineUserId) filters.push(formulaEq(F.STAGING_LINE_USER_ID, lineUserId));
  if (lineDisplayName) {
    filters.push(formulaEq(F.STAGING_LINE_DISPLAY_NAME, lineDisplayName));
    filters.push(formulaEq(F.STAGING_LINE_RENAMED_NAME, lineDisplayName));
  }
  if (!filters.length) return null;
  const rows = await airtableList({
    ...options,
    tableName: TABLES.LINE_OFC_STAGING,
    params: { maxRecords: 1, filterByFormula: filters.length === 1 ? filters[0] : `OR(${filters.join(",")})` },
  });
  return rows[0] || null;
}

async function findEntitlements(options, { lineUserId, clientRecordId }) {
  const filters = [];
  if (lineUserId) filters.push(formulaEq(F.ENT_LINE_USER_ID, lineUserId));
  if (clientRecordId) filters.push(`FIND("${esc(clientRecordId)}", ARRAYJOIN({${F.ENT_CLIENT}}))`);
  if (!filters.length) return [];
  return airtableList({
    ...options,
    tableName: TABLES.MEMBER_ENTITLEMENTS,
    params: { maxRecords: 100, filterByFormula: filters.length === 1 ? filters[0] : `OR(${filters.join(",")})` },
  });
}

async function findLatestAiEvent(options, lineUserId) {
  if (!lineUserId) return null;
  const rows = await airtableList({
    ...options,
    tableName: TABLES.AI_MESSAGE_EVENTS,
    params: {
      maxRecords: 1,
      filterByFormula: formulaEq(F.EVENT_LINE_USER_ID, lineUserId),
      "sort[0][field]": F.EVENT_CREATED_AT,
      "sort[0][direction]": "desc",
    },
  });
  return rows[0] || null;
}

async function findConversationMatrix(options, conversationHash) {
  if (!conversationHash) return null;
  const rows = await airtableList({
    ...options,
    tableName: TABLES.CONVERSATION_MATRIX,
    params: { maxRecords: 1, filterByFormula: formulaEq(F.MATRIX_CONVERSATION_HASH, conversationHash) },
  });
  return rows[0] || null;
}

function mapClient(row, { lineUserId, lineDisplayName }) {
  const x = row?.fields || {};
  return {
    id: row?.id,
    username: x[F.CLIENT_USERNAME],
    mmd_client_name: x[F.CLIENT_MMD_NAME],
    nickname: x[F.CLIENT_NICKNAME],
    suffix_code: x[F.CLIENT_SUFFIX],
    line_user_id: x[F.CLIENT_LINE_USER_ID] || lineUserId,
    line_display_name: x[F.CLIENT_LINE_DISPLAY_NAME] || lineDisplayName,
    membership_status: x[F.CLIENT_MEMBERSHIP_STATUS],
    expire_at: x[F.CLIENT_EXPIRE_AT],
    points_balance: x[F.CLIENT_POINTS_BALANCE],
  };
}

function mapLegacy(row) {
  const x = row?.fields || {};
  const renamed = parseLatestSignupFromRenamedName(x[F.STAGING_LINE_RENAMED_NAME] || x[F.STAGING_LINE_DISPLAY_NAME]);
  const summary = [];
  if (x[F.STAGING_PARSED_PACKAGE]) summary.push(`package hint: ${x[F.STAGING_PARSED_PACKAGE]}`);
  if (x[F.STAGING_PARSED_LEVEL]) summary.push(`client level: ${x[F.STAGING_PARSED_LEVEL]}`);
  if (x[F.STAGING_SERVICE_AMOUNT]) summary.push(`staged service amount: ${x[F.STAGING_SERVICE_AMOUNT]}`);
  if (x[F.STAGING_PROPOSED_POINTS]) summary.push(`proposed points: ${x[F.STAGING_PROPOSED_POINTS]}`);
  return {
    id: row?.id,
    line_user_id: x[F.STAGING_LINE_USER_ID],
    line_display_name: x[F.STAGING_LINE_DISPLAY_NAME],
    line_renamed_name: x[F.STAGING_LINE_RENAMED_NAME],
    normalized_name: x[F.STAGING_NORMALIZED_NAME],
    parsed_membership_package: x[F.STAGING_PARSED_PACKAGE],
    parsed_client_level: x[F.STAGING_PARSED_LEVEL],
    proposed_points: x[F.STAGING_PROPOSED_POINTS],
    service_history_summary: summary.join("; "),
    latest_signup_date_raw: renamed.latest_signup_date_raw,
    membership_cycle_start_at: renamed.membership_cycle_start_at,
  };
}

function mapEntitlementRow(row) {
  const x = row?.fields || {};
  return {
    id: row?.id,
    fields: {
      entitlement_id: row?.id,
      capability: x[F.ENT_CAPABILITY],
      entitlement_level: x[F.ENT_LEVEL],
      member_status: x[F.ENT_LIFECYCLE_STATUS] || x[F.ENT_MEMBER_STATUS],
      access_status: x[F.ENT_ACCESS_STATUS],
      package_code: x[F.ENT_PACKAGE_CODE],
      relationship_tier: x[F.ENT_RELATIONSHIP_TIER],
      start_at: x[F.ENT_START_AT],
      expire_at: x[F.ENT_EXPIRE_AT],
      grace_until: x[F.ENT_GRACE_UNTIL],
      source: x[F.ENT_SOURCE],
      source_ref: x[F.ENT_SOURCE_REF] || row?.id,
    },
  };
}

function legacyEntitlementForMemory(entitlementRows = []) {
  const row = entitlementRows[0];
  const x = row?.fields || {};
  return {
    id: row?.id,
    member_status: x[F.ENT_LIFECYCLE_STATUS] || x[F.ENT_MEMBER_STATUS],
    access_status: x[F.ENT_ACCESS_STATUS],
    package_code: x[F.ENT_PACKAGE_CODE],
    expire_at: x[F.ENT_EXPIRE_AT],
  };
}

function mapMatrixRow(row) {
  if (!row) return null;
  const x = row.fields || {};
  return buildConversationMatrixV1({
    matrix_id: x[F.MATRIX_ID],
    client_record_id: Array.isArray(x[F.MATRIX_CLIENT]) ? x[F.MATRIX_CLIENT][0] : "",
    conversation_id_hash: x[F.MATRIX_CONVERSATION_HASH],
    channel: x[F.MATRIX_CHANNEL],
    conversation_scope: x[F.MATRIX_SCOPE],
    topic: x[F.MATRIX_TOPIC],
    subtopic: x[F.MATRIX_SUBTOPIC],
    relationship_context: x[F.MATRIX_RELATIONSHIP],
    last_customer_intent: x[F.MATRIX_LAST_INTENT],
    last_customer_request: x[F.MATRIX_LAST_REQUEST],
    last_customer_action: x[F.MATRIX_LAST_CUSTOMER_ACTION],
    last_kenji_action: x[F.MATRIX_LAST_KENJI_ACTION],
    last_confirmed_outcome: x[F.MATRIX_LAST_OUTCOME],
    conversation_stage: x[F.MATRIX_STAGE],
    awaiting_from: x[F.MATRIX_AWAITING],
    pending_action: x[F.MATRIX_PENDING_ACTION],
    pending_reference: x[F.MATRIX_PENDING_REF],
    continuity_summary: x[F.MATRIX_CONTINUITY],
    do_not_ask_again_json: x[F.MATRIX_DONT_ASK],
    important_open_loops_json: x[F.MATRIX_OPEN_LOOPS],
    handoff_required: x[F.MATRIX_HANDOFF_REQUIRED],
    handoff_owner: x[F.MATRIX_HANDOFF_OWNER],
    handoff_reason: x[F.MATRIX_HANDOFF_REASON],
    live_truth_required: x[F.MATRIX_TRUTH_REQUIRED],
    live_truth_domains: x[F.MATRIX_TRUTH_DOMAINS],
    last_event_id: x[F.MATRIX_LAST_EVENT],
    last_interaction_at: x[F.MATRIX_LAST_INTERACTION],
    state_updated_at: x[F.MATRIX_UPDATED_AT],
    state_expires_at: x[F.MATRIX_EXPIRES_AT],
    matrix_status: x[F.MATRIX_STATUS],
    version: x[F.MATRIX_VERSION],
  });
}

function matrixFromLatestEvent(row, { conversationHash, clientRecordId, relationshipContext }) {
  const x = row?.fields || {};
  const intent = text(x[F.EVENT_INTENT]);
  const handoffRequired = Boolean(x[F.EVENT_HANDOFF_REQUIRED]);
  const finalStatus = text(x[F.EVENT_FINAL_STATUS]);
  let stage = handoffRequired ? "handoff" : "in_progress";
  let awaitingFrom = handoffRequired ? "mmd_review" : "none";

  if (/payment/.test(intent)) {
    stage = "awaiting_payment_verification";
    awaitingFrom = "payment_authority";
  } else if (/membership|points|vip|svip|black/.test(intent)) {
    stage = "awaiting_entitlement_refresh";
    awaitingFrom = "entitlement_authority";
  } else if (/resolved|sent|replied|complete|completed/.test(finalStatus)) {
    stage = "resolved";
    awaitingFrom = "none";
  }

  return buildConversationMatrixV1({
    matrix_id: `kcm1_line_${conversationHash.slice(0, 20)}`,
    client_record_id: clientRecordId,
    conversation_id_hash: conversationHash,
    channel: "line_ofc",
    conversation_scope: `line:${conversationHash.slice(0, 20)}`,
    topic: intent || "general",
    relationship_context: relationshipContext,
    last_customer_intent: intent,
    conversation_stage: stage,
    awaiting_from: awaitingFrom,
    pending_action: stage === "awaiting_payment_verification"
      ? "refresh payment truth before answering status"
      : stage === "awaiting_entitlement_refresh"
        ? "refresh entitlement truth before answering status"
        : handoffRequired
          ? "continue human review/handoff"
          : "continue current conversation",
    pending_reference: text(x[F.EVENT_LINKED_SESSION_ID]),
    continuity_summary: intent
      ? `Previous Kenji event was ${intent}${handoffRequired ? " and requires handoff" : ""}. Continue without re-asking already known basics.`
      : "Continue the known customer conversation without assuming protected current truth.",
    handoff_required: handoffRequired,
    handoff_owner: handoffRequired ? "Per" : "none",
    handoff_reason: text(x[F.EVENT_HANDOFF_REASON]),
    last_event_id: text(x[F.EVENT_ID]),
    last_interaction_at: text(x[F.EVENT_CREATED_AT]),
    state_updated_at: new Date().toISOString(),
    state_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    matrix_status: "active",
    version: 1,
  });
}

function matrixFields(matrix, clientRecordId, memoryRecordId = "") {
  return {
    [F.MATRIX_ID]: matrix.matrix_id,
    ...(clientRecordId ? { [F.MATRIX_CLIENT]: [clientRecordId] } : {}),
    ...(memoryRecordId ? { [F.MATRIX_MEMORY]: [memoryRecordId] } : {}),
    [F.MATRIX_SCHEMA]: matrix.schema,
    [F.MATRIX_CONVERSATION_HASH]: matrix.conversation_id_hash,
    [F.MATRIX_CHANNEL]: matrix.channel,
    [F.MATRIX_SCOPE]: matrix.conversation_scope,
    [F.MATRIX_TOPIC]: matrix.topic,
    [F.MATRIX_SUBTOPIC]: matrix.subtopic,
    [F.MATRIX_RELATIONSHIP]: matrix.relationship_context,
    [F.MATRIX_LAST_INTENT]: matrix.last_customer_intent,
    [F.MATRIX_LAST_REQUEST]: matrix.last_customer_request,
    [F.MATRIX_LAST_CUSTOMER_ACTION]: matrix.last_customer_action,
    [F.MATRIX_LAST_KENJI_ACTION]: matrix.last_kenji_action,
    [F.MATRIX_LAST_OUTCOME]: matrix.last_confirmed_outcome,
    [F.MATRIX_STAGE]: matrix.conversation_stage,
    [F.MATRIX_AWAITING]: matrix.awaiting_from,
    [F.MATRIX_PENDING_ACTION]: matrix.pending_action,
    [F.MATRIX_PENDING_REF]: matrix.pending_reference,
    [F.MATRIX_CONTINUITY]: matrix.continuity_summary,
    [F.MATRIX_DONT_ASK]: JSON.stringify(matrix.do_not_ask_again || []),
    [F.MATRIX_OPEN_LOOPS]: JSON.stringify(matrix.important_open_loops || []),
    [F.MATRIX_HANDOFF_REQUIRED]: matrix.handoff_required,
    [F.MATRIX_HANDOFF_OWNER]: matrix.handoff_owner,
    [F.MATRIX_HANDOFF_REASON]: matrix.handoff_reason,
    [F.MATRIX_TRUTH_REQUIRED]: matrix.live_truth_required,
    [F.MATRIX_TRUTH_DOMAINS]: matrix.live_truth_domains,
    [F.MATRIX_LAST_EVENT]: matrix.last_event_id,
    ...(matrix.last_interaction_at ? { [F.MATRIX_LAST_INTERACTION]: matrix.last_interaction_at } : {}),
    [F.MATRIX_UPDATED_AT]: matrix.state_updated_at,
    ...(matrix.state_expires_at ? { [F.MATRIX_EXPIRES_AT]: matrix.state_expires_at } : {}),
    [F.MATRIX_STATUS]: matrix.matrix_status,
    [F.MATRIX_VERSION]: matrix.version,
    [F.MATRIX_PAYLOAD]: JSON.stringify({ schema: matrix.schema, live_truth_required: matrix.live_truth_required, live_truth_domains: matrix.live_truth_domains }),
  };
}

async function persistMatrix(options, matrix, existingRow, clientRecordId) {
  if (!matrix?.matrix_id) return existingRow || null;
  const fields = matrixFields(matrix, clientRecordId);
  if (existingRow?.id) {
    const result = await airtableWrite({
      ...options,
      tableName: TABLES.CONVERSATION_MATRIX,
      method: "PATCH",
      body: { records: [{ id: existingRow.id, fields }], typecast: true },
    });
    return result?.records?.[0] || existingRow;
  }
  const result = await airtableWrite({
    ...options,
    tableName: TABLES.CONVERSATION_MATRIX,
    method: "POST",
    body: { records: [{ fields }], typecast: true },
  });
  return result?.records?.[0] || null;
}

async function persistMemoryV2(options, snapshotV2, compatV1, clientRecordId) {
  if (!clientRecordId || !snapshotV2) return null;
  const snapshotId = `kms2_${clientRecordId}`;
  const existing = await airtableList({
    ...options,
    tableName: TABLES.CUSTOMER_MEMORY,
    params: { maxRecords: 1, filterByFormula: formulaEq("snapshot_id", snapshotId) },
  });
  const fields = {
    snapshot_id: snapshotId,
    Client: [clientRecordId],
    schema_version: snapshotV2.schema,
    identity_status: snapshotV2.identity_status,
    relationship_context: snapshotV2.relationship_context,
    verification_status: snapshotV2.verification_status,
    membership_package_observed: snapshotV2.membership_package_observed,
    membership_status_observed: snapshotV2.membership_status_observed,
    membership_expiry_observed: snapshotV2.membership_expiry_observed,
    points_balance_confirmed_observed: snapshotV2.points_balance_confirmed_observed,
    service_history_summary: snapshotV2.service_history_summary,
    preference_summary: snapshotV2.preference_summary,
    kenji_handling_note: snapshotV2.kenji_handling_note,
    important_context_json: JSON.stringify({ conversation: snapshotV2.conversation }),
    authority_guard_json: JSON.stringify(snapshotV2.authority_guard),
    source_snapshot_json: JSON.stringify(snapshotV2.source_refs),
    compat_v1_json: JSON.stringify({ schema: compatV1.schema, updated_at: compatV1.updated_at }),
    last_truth_status: snapshotV2.last_truth_status,
    ...(snapshotV2.last_truth_refresh_at ? { last_truth_refresh_at: snapshotV2.last_truth_refresh_at } : {}),
    snapshot_status: snapshotV2.snapshot_status,
    version: snapshotV2.version,
    updated_at: snapshotV2.updated_at,
  };
  if (existing[0]?.id) {
    const result = await airtableWrite({
      ...options,
      tableName: TABLES.CUSTOMER_MEMORY,
      method: "PATCH",
      body: { records: [{ id: existing[0].id, fields }], typecast: true },
    });
    return result?.records?.[0] || existing[0];
  }
  const result = await airtableWrite({
    ...options,
    tableName: TABLES.CUSTOMER_MEMORY,
    method: "POST",
    body: { records: [{ fields }], typecast: true },
  });
  return result?.records?.[0] || null;
}

export async function loadKenjiMemberMemoryForLine(options = {}) {
  const lineUserId = text(options.lineUserId || options.line_user_id);
  const lineDisplayName = text(options.lineDisplayName || options.line_display_name || options.profile?.displayName);
  if (!lineUserId) return null;

  const airtable = { baseId: options.baseId, apiKey: options.apiKey };
  const conversationHash = hashRef(`line_ofc:${lineUserId}`);
  const [clientRow, legacyRow, latestEvent, existingMatrixRow] = await Promise.all([
    findClientByLineUserId(airtable, lineUserId),
    findLegacyByLineIdentity(airtable, { lineUserId, lineDisplayName }),
    findLatestAiEvent(airtable, lineUserId),
    findConversationMatrix(airtable, conversationHash),
  ]);
  const entitlementRows = await findEntitlements(airtable, { lineUserId, clientRecordId: clientRow?.id });
  const entitlementSnapshot = buildKenjiEntitlementSnapshot(entitlementRows.map(mapEntitlementRow));
  const kenjiAccess = projectKenjiAccess(entitlementSnapshot);

  const legacy = mapLegacy(legacyRow);
  const entitlement = legacyEntitlementForMemory(entitlementRows);
  const client = clientRow ? mapClient(clientRow, { lineUserId, lineDisplayName }) : {
    line_user_id: lineUserId,
    line_display_name: lineDisplayName,
    mmd_client_name: legacy.normalized_name || lineDisplayName,
  };

  const clientId = buildMmdClientId({
    nickname: client.mmd_client_name || client.nickname || legacy.normalized_name || lineDisplayName,
    hidden_name: true,
    package_code: entitlement.package_code || legacy.parsed_membership_package || legacy.parsed_client_level,
  });

  const compatV1 = buildKenjiMemorySnapshot({
    client: { ...client, ...clientId },
    entitlement,
    points: {
      points_balance_confirmed: client.points_balance,
      points_pending_review: legacy.proposed_points,
    },
    legacy,
    line_user_id: lineUserId,
    service_history_summary: legacy.service_history_summary,
  });

  const existingMatrix = mapMatrixRow(existingMatrixRow);
  const relationshipContext = entitlementRows.length
    ? (/active|grace/i.test(text(entitlement.member_status || entitlement.access_status)) ? "active_member" : "expired_member")
    : clientRow?.id
      ? "known_customer"
      : "new_contact";
  const eventMatrix = latestEvent
    ? matrixFromLatestEvent(latestEvent, { conversationHash, clientRecordId: clientRow?.id, relationshipContext })
    : null;
  const shouldRefreshFromEvent = Boolean(eventMatrix) && (!existingMatrix || text(eventMatrix.last_event_id) !== text(existingMatrix.last_event_id));
  const matrix = shouldRefreshFromEvent
    ? eventMatrix
    : existingMatrix || buildConversationMatrixV1({
      matrix_id: `kcm1_line_${conversationHash.slice(0, 20)}`,
      client_record_id: clientRow?.id,
      conversation_id_hash: conversationHash,
      channel: "line_ofc",
      conversation_scope: `line:${conversationHash.slice(0, 20)}`,
      relationship_context: relationshipContext,
      conversation_stage: "new_topic",
      matrix_status: "active",
    });

  let matrixRow = existingMatrixRow;
  if (!existingMatrixRow || shouldRefreshFromEvent) {
    matrixRow = await persistMatrix(airtable, matrix, existingMatrixRow, clientRow?.id);
  }

  const snapshotV2 = buildCustomerMemorySnapshotV2({
    compat_v1: compatV1,
    conversation_matrix: matrix,
    relationship_context: matrix.relationship_context || relationshipContext,
    identity_status: clientRow?.id ? "resolved" : "candidate",
    verification_status: clientRow?.id ? "verified" : "unknown",
    last_truth_status: entitlementRows.length || clientRow?.id ? "fresh" : "review_required",
    last_truth_refresh_at: new Date().toISOString(),
  });
  const memoryRow = await persistMemoryV2(airtable, snapshotV2, compatV1, clientRow?.id);

  if (matrixRow?.id && memoryRow?.id && matrixRow?.fields && !Array.isArray(matrixRow.fields[F.MATRIX_MEMORY])) {
    await airtableWrite({
      ...airtable,
      tableName: TABLES.CONVERSATION_MATRIX,
      method: "PATCH",
      body: { records: [{ id: matrixRow.id, fields: { [F.MATRIX_MEMORY]: [memoryRow.id] } }] },
    });
  }

  return {
    snapshot: compatV1,
    snapshot_v2: snapshotV2,
    conversation_matrix: matrix,
    entitlement_snapshot: entitlementSnapshot,
    kenji_access: kenjiAccess,
    kenji_safe_context: {
      ...buildKenjiSafeContextV2(snapshotV2, compatV1),
      entitlement_access: kenjiAccess,
    },
    customer_visible_profile: buildCustomerVisibleProfile(compatV1),
    found: {
      client: Boolean(clientRow?.id),
      legacy: Boolean(legacyRow?.id),
      entitlement: entitlementRows.length > 0,
      entitlement_count: entitlementRows.length,
      memory_v2: Boolean(memoryRow?.id),
      conversation_matrix: Boolean(matrixRow?.id),
      prior_ai_event: Boolean(latestEvent?.id),
    },
  };
}
