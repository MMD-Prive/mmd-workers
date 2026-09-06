import currentWorker from "./my-mmd-runtime-index.js";

const STATUS_PATH = "/__internal/member-status/resolve";
const PROFILE_PATH = "/__internal/member-profile/read";
const MEMBER_TABLE = "Members";
const CLIENT_TABLE = "Clients";
const STAGING_TABLE = "LINE OFC Client Import Staging";
const ENTITLEMENT_TABLE = "MMD — Member Entitlements";
const COMMITTED_LINE_MATCH_TYPE = "line_user_id_exact";
const COMMITTED_LINE_DECISION = "link_existing_client";
const COMMITTED_LINE_REVIEW_STATUS = "committed";

export default {
  async fetch(request, env = {}, ctx) {
    let path = "";
    try { path = new URL(request.url).pathname; } catch { return currentWorker.fetch(request, env, ctx); }
    const eligible = request.method === "POST" && (path === STATUS_PATH || path === PROFILE_PATH);
    if (!eligible) return currentWorker.fetch(request, env, ctx);

    const inspectRequest = request.clone();
    const retryRequest = request.clone();
    const firstResponse = await currentWorker.fetch(request, env, ctx);
    const firstPayload = await jsonPayload(firstResponse);

    // Only attempt deterministic recovery after the existing authenticated
    // resolver explicitly says that this LINE user has no Member row mapping.
    // Any resolver error, ambiguity or positive match remains authoritative.
    if (!firstResponse.ok || firstPayload?.ok !== true || firstPayload?.data?.member_exists !== false) {
      return firstResponse;
    }

    const body = await inspectRequest.json().catch(() => null);
    const lineUserId = canonicalLineId(body?.line_user_id);
    if (!lineUserId) return withRecoveryHeader(firstResponse, "invalid_line_identity");

    const recovery = await recoverCanonicalMemberLineLink(env, lineUserId);
    if (!recovery.linked) return withRecoveryHeader(firstResponse, recovery.reason || "unresolved");

    // Re-read through the normal resolver after writing only the canonical LINE
    // identity field. Membership, tier, points, packages and entitlement remain
    // untouched and continue to be resolved by their existing authorities.
    const retried = await currentWorker.fetch(retryRequest, env, ctx);
    return withRecoveryHeader(retried, "linked");
  },

  scheduled(controller, env, ctx) {
    if (typeof currentWorker.scheduled === "function") return currentWorker.scheduled(controller, env, ctx);
  },
};

export async function recoverCanonicalMemberLineLink(env = {}, lineUserId) {
  const lineId = canonicalLineId(lineUserId);
  if (!lineId) return { linked: false, reason: "invalid_line_identity" };
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return { linked: false, reason: "airtable_unavailable" };

  const memberTable = String(env.AIRTABLE_TABLE_MEMBERS || MEMBER_TABLE);
  const clientTable = String(env.AIRTABLE_TABLE_CLIENTS || CLIENT_TABLE);
  const stagingTable = String(env.AIRTABLE_TABLE_LINE_OFC_STAGING || STAGING_TABLE);
  const entitlementTable = String(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || ENTITLEMENT_TABLE);
  const memberLineField = String(env.AIRTABLE_MEMBERS_LINE_USER_ID_FIELD || "line_id").trim();
  const memberEmailField = String(env.AIRTABLE_MEMBERS_EMAIL_FIELD || "Contact Email").trim();
  const clientLineField = String(env.AIRTABLE_CLIENTS_LINE_USER_ID_FIELD || "line_user_id").trim();
  const clientEmailFields = csvFields(env.AIRTABLE_CLIENTS_EMAIL_FIELDS || "Contact Email,email");
  const entitlementLineField = String(env.AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD || "line_user_id").trim();
  const entitlementEmailField = String(env.AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD || "member_email").trim();

  try {
    const [clients, entitlements, committed] = await Promise.all([
      airtableList(env, clientTable, {
        filterByFormula: `{${clientLineField}}=${formulaString(lineId)}`,
        maxRecords: 2,
      }),
      airtableList(env, entitlementTable, {
        filterByFormula: `{${entitlementLineField}}=${formulaString(lineId)}`,
        maxRecords: 100,
      }),
      airtableList(env, stagingTable, {
        filterByFormula: `AND({line_user_id}=${formulaString(lineId)},{match_type}=${formulaString(COMMITTED_LINE_MATCH_TYPE)},{decision}=${formulaString(COMMITTED_LINE_DECISION)},{review_status}=${formulaString(COMMITTED_LINE_REVIEW_STATUS)})`,
        maxRecords: 3,
      }),
    ]);

    if (clients.length > 1) return { linked: false, reason: "client_line_ambiguous" };

    const candidateEmails = new Set();
    if (clients.length === 1) addClientEmails(candidateEmails, clients[0], clientEmailFields);
    for (const entitlement of entitlements) addEmail(candidateEmails, entitlement?.fields?.[entitlementEmailField]);

    const committedClientIds = committedClientRecordIds(committed, lineId);
    if (committedClientIds.ambiguous) return { linked: false, reason: "committed_line_ambiguous" };
    if (committedClientIds.id) {
      if (clients[0]?.id && String(clients[0].id) !== committedClientIds.id) {
        return { linked: false, reason: "client_line_conflict" };
      }
      const linkedClients = await airtableList(env, clientTable, {
        filterByFormula: `RECORD_ID()=${formulaString(committedClientIds.id)}`,
        maxRecords: 2,
      });
      if (linkedClients.length !== 1 || String(linkedClients[0]?.id || "") !== committedClientIds.id) {
        return { linked: false, reason: "committed_client_missing" };
      }
      const linkedLine = String(linkedClients[0]?.fields?.[clientLineField] || "").trim();
      if (linkedLine && linkedLine !== lineId) return { linked: false, reason: "committed_client_line_conflict" };
      addClientEmails(candidateEmails, linkedClients[0], clientEmailFields);
    }

    if (candidateEmails.size !== 1) {
      return { linked: false, reason: candidateEmails.size > 1 ? "canonical_email_ambiguous" : "canonical_email_missing" };
    }
    const email = candidateEmails.values().next().value;

    const members = await airtableList(env, memberTable, {
      filterByFormula: `LOWER({${memberEmailField}})=${formulaString(email)}`,
      maxRecords: 2,
    });
    if (members.length !== 1) {
      return { linked: false, reason: members.length > 1 ? "member_email_ambiguous" : "member_email_missing" };
    }

    const member = members[0];
    const existingLine = String(member?.fields?.[memberLineField] || "").trim();
    if (existingLine && existingLine !== lineId) return { linked: false, reason: "member_line_conflict" };
    if (existingLine === lineId) return { linked: true, reason: "already_linked", source: "canonical_evidence" };

    await airtableUpdate(env, memberTable, member.id, { [memberLineField]: lineId });
    console.log({ event: "my_mmd_line_identity_recovered", source: "canonical_evidence", access_mutated: false });
    return { linked: true, reason: "linked", source: "canonical_evidence" };
  } catch (error) {
    console.warn({ event: "my_mmd_line_identity_recovery_failed", failure_class: safeFailure(error) });
    return { linked: false, reason: "identity_recovery_unavailable" };
  }
}

function committedClientRecordIds(records, lineUserId) {
  const ids = new Set();
  for (const record of Array.isArray(records) ? records : []) {
    const fields = record?.fields || {};
    if (String(fields.line_user_id || "").trim() !== lineUserId) continue;
    if (String(fields.match_type || "").trim() !== COMMITTED_LINE_MATCH_TYPE) continue;
    if (String(fields.decision || "").trim() !== COMMITTED_LINE_DECISION) continue;
    if (String(fields.review_status || "").trim() !== COMMITTED_LINE_REVIEW_STATUS) continue;
    if (fields.dry_run_only === true) continue;
    const linked = Array.isArray(fields.matched_client) ? fields.matched_client : [];
    if (linked.length > 1) return { id: "", ambiguous: true };
    const id = safeRecordId(linked[0]);
    if (id) ids.add(id);
  }
  if (ids.size > 1) return { id: "", ambiguous: true };
  return { id: ids.values().next().value || "", ambiguous: false };
}

function addClientEmails(set, record, fields) {
  for (const field of fields) addEmail(set, record?.fields?.[field]);
}
function addEmail(set, value) {
  const email = normalizeEmail(value);
  if (email) set.add(email);
}
function csvFields(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}
function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}
function canonicalLineId(value) {
  const id = String(value || "").trim();
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}
function safeRecordId(value) {
  const id = String(value || "").trim();
  return /^rec[A-Za-z0-9]{6,32}$/.test(id) ? id : "";
}
function formulaString(value) {
  return `'${String(value || "").replace(/'/g, "\\'")}'`;
}
function safeFailure(error) {
  return String(error?.message || error || "unknown").toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 80) || "unknown";
}

async function jsonPayload(response) {
  if (!(response instanceof Response)) return null;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return null;
  return response.clone().json().catch(() => null);
}
function withRecoveryHeader(response, state) {
  const headers = new Headers(response.headers);
  headers.set("x-mmd-line-identity-recovery", String(state || "unresolved").slice(0, 80));
  headers.set("x-mmd-identity-authority", "canonical-member-link");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function airtableList(env, tableName, params = {}) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const init = { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" } };
  const response = env.AIRTABLE_HTTP?.fetch
    ? await env.AIRTABLE_HTTP.fetch(new Request(url.toString(), init))
    : await fetch(url.toString(), init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.records)) throw new Error(`airtable_${response.status || "malformed"}`);
  return data.records;
}

async function airtableUpdate(env, tableName, recordId, fields) {
  const url = `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}/${encodeURIComponent(recordId)}`;
  const init = {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ fields, typecast: false }),
  };
  const response = env.AIRTABLE_HTTP?.fetch
    ? await env.AIRTABLE_HTTP.fetch(new Request(url, init))
    : await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) throw new Error(`airtable_update_${response.status || "malformed"}`);
  return data;
}
