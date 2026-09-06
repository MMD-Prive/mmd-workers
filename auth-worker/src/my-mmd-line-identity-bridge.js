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
const FAST_TRUST_SOURCE = "line_oa_renamed_name_fast_trust";
const FAST_TRUST_RANK = { vip: 1, svip: 2, black_card: 3 };
const FAST_TRUST_LABEL = { vip: "VIP", svip: "SVIP", black_card: "Black Card" };

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
    if (!firstResponse.ok || firstPayload?.ok !== true || typeof firstPayload?.data?.member_exists !== "boolean") {
      return firstResponse;
    }

    const body = await inspectRequest.json().catch(() => null);
    const lineUserId = canonicalLineId(body?.line_user_id);
    if (!lineUserId) return withRecoveryHeader(firstResponse, "invalid_line_identity");

    // MMD Fast Trust is deliberately narrow. Only an MMD-controlled LINE OA
    // renamed name associated with the exact verified LINE user id can trigger
    // this path. Customer display names, browser claims, tags, email matches,
    // and generic legacy parsing never enter this branch.
    const fastTrust = await resolveLineOaFastTrust(env, lineUserId);
    if (fastTrust.tier) {
      if (path === STATUS_PATH) {
        return fastTrustStatusResponse(firstResponse, firstPayload, fastTrust);
      }
      return fastTrustProfileResponse(firstResponse, firstPayload, lineUserId, fastTrust);
    }

    // No Fast Trust marker: retain the deterministic canonical-link recovery.
    if (firstPayload.data.member_exists !== false) {
      return firstResponse;
    }

    const recovery = await recoverCanonicalMemberLineLink(env, lineUserId);
    if (!recovery.linked) return withRecoveryHeader(firstResponse, recovery.reason || fastTrust.reason || "unresolved");

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

export function trustedTierFromRenamedName(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/(?:^|[^A-Za-z0-9])black\s*card$/i.test(text)) return "black_card";
  if (/(?:^|[^A-Za-z0-9])svip$/i.test(text)) return "svip";
  if (/(?:^|[^A-Za-z0-9])vip$/i.test(text)) return "vip";
  return null;
}

export function displayNameFromRenamedName(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const stripped = text
    .replace(/(?:\s|[-–—|/])*(?:black\s*card|svip|vip)\s*$/i, "")
    .trim();
  return stripped.slice(0, 120) || "สมาชิก MMD";
}

export async function resolveLineOaFastTrust(env = {}, lineUserId) {
  const lineId = canonicalLineId(lineUserId);
  if (!lineId) return { tier: null, reason: "invalid_line_identity" };
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return { tier: null, reason: "airtable_unavailable" };

  const stagingTable = String(env.AIRTABLE_TABLE_LINE_OFC_STAGING || env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID || STAGING_TABLE).trim();
  try {
    const records = await airtableList(env, stagingTable, {
      filterByFormula: `{line_user_id}=${formulaString(lineId)}`,
      maxRecords: 20,
    });
    const candidates = records.flatMap((record) => {
      const renamedName = String(record?.fields?.line_renamed_name || "").trim();
      const tier = trustedTierFromRenamedName(renamedName);
      return tier ? [{ tier, renamedName }] : [];
    });
    if (!candidates.length) return { tier: null, reason: "fast_trust_marker_missing" };

    // Rename history can contain more than one MMD-authored recognition marker.
    // Per policy, do not downgrade a trusted holder while history is backfilled;
    // the strongest MMD-authored marker wins: Black Card > SVIP > VIP.
    candidates.sort((a, b) => FAST_TRUST_RANK[b.tier] - FAST_TRUST_RANK[a.tier]);
    const winner = candidates[0];
    return {
      tier: winner.tier,
      label: FAST_TRUST_LABEL[winner.tier],
      displayName: displayNameFromRenamedName(winner.renamedName),
      source: FAST_TRUST_SOURCE,
      evidenceCount: candidates.length,
      reason: "trusted_line_oa_renamed_name",
    };
  } catch (error) {
    console.warn({ event: "my_mmd_fast_trust_lookup_failed", failure_class: safeFailure(error) });
    return { tier: null, reason: "fast_trust_lookup_unavailable" };
  }
}

async function fastTrustStatusResponse(firstResponse, firstPayload, fastTrust) {
  const payload = {
    ...firstPayload,
    data: {
      ...firstPayload.data,
      member_exists: true,
      fast_trust: true,
      tier: fastTrust.label,
      tier_source: FAST_TRUST_SOURCE,
      history_recovery_state: "pending",
    },
  };
  return replaceJsonResponse(firstResponse, payload, fastTrust);
}

async function fastTrustProfileResponse(firstResponse, firstPayload, lineUserId, fastTrust) {
  const existing = firstPayload?.data?.member_exists === true && firstPayload?.data?.profile
    ? firstPayload.data.profile
    : null;
  const memberId = firstPayload?.data?.member_id
    ? String(firstPayload.data.member_id).trim().slice(0, 160)
    : await syntheticFastTrustMemberId(lineUserId);
  const profile = overlayFastTrustProfile(existing, {
    ...fastTrust,
    memberId,
  });
  const payload = {
    ...firstPayload,
    data: {
      ...firstPayload.data,
      member_exists: true,
      member_id: memberId,
      profile,
      fast_trust: true,
      tier_source: FAST_TRUST_SOURCE,
      history_recovery_state: "pending",
    },
  };
  return replaceJsonResponse(firstResponse, payload, fastTrust);
}

export function overlayFastTrustProfile(existingProfile, { label, displayName, memberId } = {}) {
  const existing = existingProfile && typeof existingProfile === "object" && !Array.isArray(existingProfile)
    ? existingProfile
    : {};
  const existing360 = existing.customer_360 && typeof existing.customer_360 === "object" && !Array.isArray(existing.customer_360)
    ? existing.customer_360
    : {};
  const existingMember = existing360.member && typeof existing360.member === "object" && !Array.isArray(existing360.member)
    ? existing360.member
    : {};
  const customer360 = {
    ...existing360,
    member: {
      ...existingMember,
      display_name: String(existingMember.display_name || existing.display_name || displayName || "สมาชิก MMD").slice(0, 120),
      member_id: String(existingMember.member_id || existing.member_id || memberId || "").slice(0, 160),
      tier: label,
      membership_status: "active",
      tier_source: FAST_TRUST_SOURCE,
      history_recovery_state: "pending",
    },
  };
  return {
    ...existing,
    display_name: String(existing.display_name || displayName || "สมาชิก MMD").slice(0, 120),
    member_id: String(existing.member_id || memberId || "").slice(0, 160),
    tier: label,
    membership_status: "active",
    membership_start: existing.membership_start || null,
    membership_expires_at: existing.membership_expires_at || null,
    points: Number.isFinite(Number(existing.points)) ? Number(existing.points) : null,
    points_records_count: Number.isInteger(Number(existing.points_records_count)) ? Number(existing.points_records_count) : null,
    payment_status: existing.payment_status || "unavailable",
    payment_history: Array.isArray(existing.payment_history) ? existing.payment_history : [],
    history: Array.isArray(existing.history) ? existing.history : [],
    tier_source: FAST_TRUST_SOURCE,
    fast_trust: true,
    history_recovery_state: "pending",
    customer_360: customer360,
  };
}

async function syntheticFastTrustMemberId(lineUserId) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mmd-fast-trust:${lineUserId}`));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `fasttrust_${hex.slice(0, 24)}`;
}

function replaceJsonResponse(response, payload, fastTrust) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-fast-trust", "true");
  headers.set("x-mmd-tier-source", FAST_TRUST_SOURCE);
  headers.set("x-mmd-fast-trust-tier", String(fastTrust?.tier || "").slice(0, 32));
  headers.set("x-mmd-identity-authority", "mmd-line-oa-renamed-name");
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}

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
