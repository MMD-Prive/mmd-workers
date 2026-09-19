import { buildCustomerMemorySnapshotV2 } from "../../shared/kenji-customer-memory-v2.mjs";
import { buildKenjiMemorySnapshot } from "../../shared/kenji-member-memory-snapshot.mjs";

const CLIENTS_TABLE_FALLBACK = "tblVv58TCbwh5j1fS";
const ENTITLEMENTS_TABLE_FALLBACK = "tblNImdF9PKAxhXGi";
const MEMORY_TABLE_FALLBACK = "tbl9tUMjJGmoyclS5";
const MATRIX_TABLE_FALLBACK = "tblS6iRgPjYLBqZJh";
const READ_TIMEOUT_MS = 800;
const POST_TURN_READ_TIMEOUT_MS = 1600;
const POST_TURN_RETRY_DELAYS_MS = Object.freeze([0, 90, 220, 420]);

function text(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && "name" in value) {
    return value.name == null ? "" : String(value.name).trim();
  }
  return value == null ? "" : String(value).trim();
}

function numberOrUndefined(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function escapeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function lineUserIdOf(event = {}) {
  return event?.source?.type === "user" ? text(event?.source?.userId) : "";
}

function eventIdOf(event = {}) {
  return text(event?.message?.id || event?.webhookEventId || event?.replyToken);
}

function telemetryEventIdOf(event = {}) {
  const id = eventIdOf(event);
  return id ? `kai_line_${id}`.slice(0, 120) : "";
}

function clientsTable(env = {}) {
  return text(env.AIRTABLE_TABLE_CLIENTS_ID || CLIENTS_TABLE_FALLBACK);
}

function entitlementsTable(env = {}) {
  return text(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || ENTITLEMENTS_TABLE_FALLBACK);
}

function memoryTable(env = {}) {
  return text(env.AIRTABLE_TABLE_CUSTOMER_MEMORY_SNAPSHOTS_ID || MEMORY_TABLE_FALLBACK);
}

function matrixTable(env = {}) {
  return text(env.AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID || MATRIX_TABLE_FALLBACK);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(text(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function sleep(ms) {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function airtableList(env = {}, table = "", params = {}, timeoutMs = READ_TIMEOUT_MS) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const tableId = text(table);
  if (!apiKey || !baseId || !tableId) return { ok: false, records: [], reason: "airtable_env_missing" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_customer_memory_timeout"), timeoutMs);
  try {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, records: [], reason: "airtable_read_failed", status: response.status };
    const payload = await response.json().catch(() => ({}));
    return { ok: true, records: Array.isArray(payload?.records) ? payload.records : [] };
  } catch (_) {
    return { ok: false, records: [], reason: "airtable_read_failed" };
  } finally {
    clearTimeout(timer);
  }
}

async function airtableWrite(env = {}, table = "", method = "POST", body = {}) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const tableId = text(table);
  if (!apiKey || !baseId || !tableId) return { ok: false, reason: "airtable_env_missing" };
  try {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { ok: false, reason: "airtable_write_failed", status: response.status };
    const payload = await response.json().catch(() => ({}));
    return { ok: true, payload };
  } catch (_) {
    return { ok: false, reason: "airtable_write_failed" };
  }
}

async function findExactClient(env = {}, lineUserId = "") {
  const result = await airtableList(env, clientsTable(env), {
    maxRecords: 2,
    pageSize: 2,
    filterByFormula: `{line_user_id}=\"${escapeFormulaValue(lineUserId)}\"`,
  });
  if (!result.ok) return { ok: false, status: "unavailable", reason: result.reason, records: [] };
  if (result.records.length > 1) return { ok: false, status: "ambiguous", reason: "multiple_exact_clients", records: result.records };
  if (result.records.length === 0) return { ok: true, status: "not_found", reason: "exact_client_not_found", records: [] };
  return { ok: true, status: "resolved", reason: "exact_clients_line_user_id", record: result.records[0], records: result.records };
}

async function findEntitlementsByLine(env = {}, lineUserId = "") {
  return airtableList(env, entitlementsTable(env), {
    maxRecords: 25,
    pageSize: 25,
    filterByFormula: `{line_user_id}=\"${escapeFormulaValue(lineUserId)}\"`,
  });
}

async function findMemoryBySnapshotId(env = {}, snapshotId = "") {
  return airtableList(env, memoryTable(env), {
    maxRecords: 2,
    pageSize: 2,
    filterByFormula: `{snapshot_id}=\"${escapeFormulaValue(snapshotId)}\"`,
  });
}

async function findMatrixByHash(env = {}, conversationHash = "", timeoutMs = READ_TIMEOUT_MS) {
  return airtableList(env, matrixTable(env), {
    maxRecords: 2,
    pageSize: 2,
    filterByFormula: `{conversation_id_hash}=\"${escapeFormulaValue(conversationHash)}\"`,
  }, timeoutMs);
}

function clientForMemory(row = null) {
  const fields = row?.fields || {};
  return {
    id: text(row?.id),
    record_id: text(row?.id),
    username: text(fields.username),
    mmd_client_name: text(fields.mmd_client_name || fields.nickname || fields["Client Name"]),
    nickname: text(fields.nickname || fields.mmd_client_name || fields["Client Name"]),
    line_display_name: text(fields.line_display_name),
    membership_status: text(fields["Membership Status"]),
    expire_at: text(fields["Expire At"]),
    points_balance: numberOrUndefined(fields["Points Balance"]),
  };
}

function verificationStatus(row = null) {
  const value = text(row?.fields?.["Verification Status"]).toLowerCase();
  if (value === "verified") return "verified";
  if (value === "pending") return "pending";
  if (value === "unverified") return "unverified";
  return value || "unknown";
}

function entitlementObservation(rows = []) {
  const mapped = rows.map((row) => {
    const fields = row?.fields || {};
    const status = text(fields.member_lifecycle_status || fields.member_status || fields.access_status).toLowerCase();
    const tier = text(fields.relationship_tier || fields.package_code || fields.entitlement_level).toLowerCase().replace(/[\s-]+/g, "_");
    return {
      id: text(row?.id),
      status,
      access_status: text(fields.access_status),
      package_code: text(fields.package_code || fields.relationship_tier || fields.entitlement_level),
      relationship_tier: text(fields.relationship_tier),
      entitlement_level: text(fields.entitlement_level),
      expire_at: text(fields.expire_at),
      points_balance_snapshot: numberOrUndefined(fields.points_balance_snapshot),
      tier,
    };
  });

  const active = mapped.filter((item) => /active|current|grace/.test(item.status || text(item.access_status).toLowerCase()));
  const source = active.length ? active : mapped;
  const tierSet = [...new Set(source.map((item) => item.tier).filter(Boolean))];
  const statusSet = [...new Set(source.map((item) => item.status).filter(Boolean))];
  const observed = source[0] || mapped[0] || {};

  let relationship = "";
  if (active.length && tierSet.length === 1) {
    const tier = tierSet[0];
    if (tier === "svip") relationship = "svip_relationship";
    else if (["black", "blackcard", "black_card"].includes(tier)) relationship = "blackcard_relationship";
    else if (tier === "vip") relationship = "vip_relationship";
    else relationship = "active_member";
  } else if (active.length) {
    relationship = "active_member";
  } else if (statusSet.some((status) => /expired|inactive/.test(status))) {
    relationship = "expired_member";
  }

  return {
    rows: mapped,
    observed: {
      member_status: observed.status || text(observed.access_status),
      access_status: text(observed.access_status),
      package_code: text(observed.package_code),
      expire_at: text(observed.expire_at),
    },
    confirmed_points_observed: observed.points_balance_snapshot,
    relationship_context: relationship,
  };
}

function relationshipContext({ observation = {}, verification = "unknown" } = {}) {
  if (text(observation.relationship_context)) return text(observation.relationship_context);
  if (verification === "verified") return "verified_public_member";
  return "known_customer";
}

function matrixContext(row = null) {
  const fields = row?.fields || {};
  return {
    matrix_id: text(fields.matrix_id),
    relationship_context: text(fields.relationship_context),
    topic: text(fields.topic),
    subtopic: text(fields.subtopic),
    last_customer_intent: text(fields.last_customer_intent),
    last_customer_request: text(fields.last_customer_request),
    last_customer_action: text(fields.last_customer_action),
    last_kenji_action: text(fields.last_kenji_action),
    last_confirmed_outcome: text(fields.last_confirmed_outcome),
    conversation_stage: text(fields.conversation_stage),
    awaiting_from: text(fields.awaiting_from),
    pending_action: text(fields.pending_action),
    pending_reference: text(fields.pending_reference),
    continuity_summary: text(fields.continuity_summary),
    do_not_ask_again_json: text(fields.do_not_ask_again_json),
    important_open_loops_json: text(fields.important_open_loops_json),
    handoff_required: fields.handoff_required === true,
    handoff_owner: text(fields.handoff_owner),
    handoff_reason: text(fields.handoff_reason),
    live_truth_required: fields.live_truth_required === true,
    live_truth_domains: Array.isArray(fields.live_truth_domains) ? fields.live_truth_domains.map(text).filter(Boolean) : [],
    last_event_id: text(fields.last_event_id),
    last_interaction_at: text(fields.last_interaction_at),
    state_updated_at: text(fields.state_updated_at),
    state_expires_at: text(fields.state_expires_at),
    matrix_status: text(fields.matrix_status),
    version: Number(fields.version) || 0,
  };
}

function snapshotFields({ snapshot = {}, compat = {}, clientRecordId = "", identity = {}, matrix = {} } = {}) {
  return {
    snapshot_id: `kms2_${clientRecordId}`,
    Client: [clientRecordId],
    schema_version: snapshot.schema,
    identity_status: snapshot.identity_status,
    relationship_context: snapshot.relationship_context,
    verification_status: snapshot.verification_status,
    membership_package_observed: snapshot.membership_package_observed,
    membership_status_observed: snapshot.membership_status_observed,
    ...(snapshot.membership_expiry_observed ? { membership_expiry_observed: snapshot.membership_expiry_observed } : {}),
    ...(Number.isFinite(identity.confirmed_points_observed) ? { points_balance_confirmed_observed: identity.confirmed_points_observed } : {}),
    service_history_summary: snapshot.service_history_summary,
    preference_summary: snapshot.preference_summary,
    kenji_handling_note: "Known canonical customer context. Memory is continuity context only; refresh protected current truth from the owning resolver before customer-facing confirmation.",
    important_context_json: JSON.stringify({
      identity_resolution: {
        status: "resolved",
        match_type: "exact_clients_line_user_id",
        client_record_id: clientRecordId,
        entitlement_record_ids: identity.entitlement_record_ids || [],
      },
      conversation: snapshot.conversation || matrix || {},
    }),
    authority_guard_json: JSON.stringify({
      ...(snapshot.authority_guard || {}),
      memory_is_context_only: true,
      may_grant_entitlement: false,
      may_confirm_payment: false,
      may_confirm_booking_or_availability: false,
      may_set_points: false,
      may_restore_vip_svip_black_card: false,
    }),
    source_snapshot_json: JSON.stringify({
      source: "line_identity_exact_client_relink",
      client_record_id: clientRecordId,
      entitlement_record_ids: identity.entitlement_record_ids || [],
      matrix_id: text(matrix.matrix_id),
      last_event_id: text(matrix.last_event_id),
      raw_line_user_id_stored_here: false,
    }),
    compat_v1_json: JSON.stringify({ schema: compat.schema, compatibility: "context_only", updated_at: compat.updated_at }),
    last_truth_status: snapshot.last_truth_status,
    ...(snapshot.last_truth_refresh_at ? { last_truth_refresh_at: snapshot.last_truth_refresh_at } : {}),
    snapshot_status: snapshot.snapshot_status,
    version: snapshot.version,
    updated_at: snapshot.updated_at,
  };
}

async function upsertSnapshot(env = {}, { snapshot = {}, compat = {}, clientRecordId = "", identity = {}, matrix = {}, existingRows = [] } = {}) {
  if (existingRows.length > 1) return { ok: false, status: "ambiguous", reason: "duplicate_memory_snapshot" };
  const fields = snapshotFields({ snapshot, compat, clientRecordId, identity, matrix });
  const existing = existingRows[0] || null;
  const result = existing?.id
    ? await airtableWrite(env, memoryTable(env), "PATCH", { records: [{ id: existing.id, fields }], typecast: true })
    : await airtableWrite(env, memoryTable(env), "POST", { records: [{ fields }], typecast: true });
  if (!result.ok) return { ok: false, status: "unavailable", reason: result.reason, http_status: result.status };
  const row = Array.isArray(result.payload?.records) ? result.payload.records[0] : result.payload;
  return { ok: true, id: text(row?.id || existing?.id), created: !existing?.id, row };
}

function linkedRecordId(value) {
  return Array.isArray(value) ? text(value[0]) : "";
}

async function patchMatrixIdentityLinks(env = {}, row = null, context = {}) {
  if (!row?.id || !context?.client_record_id || !context?.memory_record_id) return { ok: false, skipped: true, reason: "matrix_or_context_missing" };
  const fields = row.fields || {};
  const currentClient = linkedRecordId(fields.Client);
  const currentMemory = linkedRecordId(fields["Memory Snapshot"]);
  const currentRelationship = text(fields.relationship_context);
  if (
    currentClient === context.client_record_id &&
    currentMemory === context.memory_record_id &&
    currentRelationship === context.relationship_context
  ) {
    return { ok: true, skipped: true, reason: "already_linked", id: row.id };
  }
  const result = await airtableWrite(env, matrixTable(env), "PATCH", {
    records: [{
      id: row.id,
      fields: {
        Client: [context.client_record_id],
        "Memory Snapshot": [context.memory_record_id],
        relationship_context: context.relationship_context,
      },
    }],
    typecast: true,
  });
  return result.ok
    ? { ok: true, id: row.id, updated: true }
    : { ok: false, reason: result.reason, http_status: result.status };
}

export async function resolveKenjiLineCustomerMemoryContext({ env = {}, event = {}, now = "" } = {}) {
  const lineUserId = lineUserIdOf(event);
  if (!lineUserId) return { resolved: false, status: "not_user_context", reason: "line_user_identity_unavailable" };

  const exact = await findExactClient(env, lineUserId);
  if (!exact.ok || exact.status !== "resolved" || !exact.record?.id) {
    return {
      resolved: false,
      status: exact.status || "unavailable",
      reason: exact.reason || "canonical_client_unresolved",
      recovery_path: exact.status === "not_found" || exact.status === "ambiguous" ? "/member/api/liff/recovery" : "",
    };
  }

  const clientRecordId = text(exact.record.id);
  const snapshotId = `kms2_${clientRecordId}`;
  const conversationHash = await sha256Hex(`line_ofc:${lineUserId}`);
  const [entitlementResult, memoryResult, matrixResult] = await Promise.all([
    findEntitlementsByLine(env, lineUserId),
    findMemoryBySnapshotId(env, snapshotId),
    findMatrixByHash(env, conversationHash),
  ]);

  if (!memoryResult.ok || memoryResult.records.length > 1 || !matrixResult.ok || matrixResult.records.length > 1) {
    return {
      resolved: false,
      status: memoryResult.records?.length > 1 || matrixResult.records?.length > 1 ? "ambiguous" : "unavailable",
      reason: memoryResult.records?.length > 1 ? "duplicate_memory_snapshot" : matrixResult.records?.length > 1 ? "duplicate_matrix" : "customer_memory_storage_unavailable",
    };
  }

  const verification = verificationStatus(exact.record);
  const observation = entitlementResult.ok ? entitlementObservation(entitlementResult.records) : entitlementObservation([]);
  const relationship = relationshipContext({ observation, verification });
  const client = clientForMemory(exact.record);
  const compat = buildKenjiMemorySnapshot({
    client,
    entitlement: observation.observed,
    points: Number.isFinite(observation.confirmed_points_observed)
      ? { points_balance_confirmed: observation.confirmed_points_observed }
      : Number.isFinite(client.points_balance)
        ? { points_balance_confirmed: client.points_balance }
        : {},
    line_user_id: lineUserId,
  });
  const matrix = matrixContext(matrixResult.records[0] || null);
  const existingVersion = Number(memoryResult.records[0]?.fields?.version) || 1;
  const stamp = text(now) || new Date().toISOString();
  const snapshot = buildCustomerMemorySnapshotV2({
    compat_v1: compat,
    conversation_matrix: matrix,
    relationship_context: relationship,
    identity_status: "resolved",
    verification_status: verification,
    last_truth_status: entitlementResult.ok && entitlementResult.records.length ? "fresh" : "review_required",
    last_truth_refresh_at: stamp,
    snapshot_status: "active",
    version: Math.max(2, existingVersion + 1),
  });

  const identity = {
    entitlement_record_ids: entitlementResult.ok ? entitlementResult.records.map((row) => text(row?.id)).filter(Boolean) : [],
    confirmed_points_observed: observation.confirmed_points_observed,
  };
  const memory = await upsertSnapshot(env, {
    snapshot,
    compat,
    clientRecordId,
    identity,
    matrix,
    existingRows: memoryResult.records,
  });
  if (!memory.ok || !memory.id) {
    return { resolved: false, status: memory.status || "unavailable", reason: memory.reason || "memory_snapshot_write_failed" };
  }

  const context = {
    resolved: true,
    status: "resolved",
    reason: "exact_clients_line_user_id",
    client_record_id: clientRecordId,
    memory_record_id: memory.id,
    snapshot_id: snapshotId,
    relationship_context: relationship,
    verification_status: verification,
    conversation_hash: conversationHash,
    snapshot_version: snapshot.version,
    memory_created: memory.created === true,
    safe_context: {
      identity_status: "resolved",
      relationship_context: relationship,
      verification_status: verification,
      display_name_for_kenji: snapshot.display_name_for_kenji,
      snapshot_id: snapshotId,
      live_truth_wins_over_memory: true,
    },
  };

  if (matrixResult.records[0]?.id) {
    context.matrix_link = await patchMatrixIdentityLinks(env, matrixResult.records[0], context);
  }
  return context;
}

export async function linkKenjiMatrixCustomerMemoryAfterTurn({ env = {}, event = {}, context = {} } = {}) {
  if (context?.resolved !== true || !text(context.client_record_id) || !text(context.memory_record_id)) {
    return { ok: false, skipped: true, reason: "customer_context_unresolved" };
  }
  const expectedEventId = telemetryEventIdOf(event);
  let latest = null;
  for (const delayMs of POST_TURN_RETRY_DELAYS_MS) {
    await sleep(delayMs);
    const lookup = await findMatrixByHash(env, context.conversation_hash, POST_TURN_READ_TIMEOUT_MS);
    if (!lookup.ok || lookup.records.length !== 1) continue;
    latest = lookup.records[0];
    if (!expectedEventId || text(latest?.fields?.last_event_id) === expectedEventId) break;
  }
  if (!latest?.id) return { ok: false, skipped: true, reason: "matrix_not_ready" };
  return patchMatrixIdentityLinks(env, latest, context);
}
