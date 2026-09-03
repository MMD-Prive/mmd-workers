const AIRTABLE_API = "https://api.airtable.com/v0";

export const CREATE_SESSION_CLIENT_LINEAGE_LOOKUP_PATH = "/v1/admin/clients/lineage-lookup";
export const CREATE_SESSION_CLIENT_RECENT_PATH = "/v1/admin/clients/recent";

const DEFAULT_TABLES = Object.freeze({
  clients: "tblVv58TCbwh5j1fS",
  members: "tblgWc5VRon5o8Mhk",
  entitlements: "tblNImdF9PKAxhXGi",
  lineStaging: "tbl1u0foFBvgFpT9G",
});

const CLIENT_FIELDS = [
  "Client Name",
  "Client Name (Display)",
  "username",
  "mmd_client_name",
  "nickname",
  "suffix_code",
  "line_user_id",
  "line_display_name",
  "telegram_username",
  "email",
  "Contact Email",
  "Phone Number",
  "source",
  "primary_channel",
  "notes_raw",
];

const MEMBER_FIELDS = [
  "Full Name",
  "Full Name (Display)",
  "username",
  "mmd_client_name",
  "line_id",
  "telegram_username",
  "Contact Email",
  "Phone Number",
  "memberstack_id",
  "member_id",
  "Membership Tier",
  "Membership Status",
  "Verification Status",
  "Membership Expiry",
  "Membership End Date",
  "Expire At",
  "Clients",
];

const ENTITLEMENT_FIELDS = [
  "member",
  "client",
  "memberstack_id",
  "member_email",
  "telegram_user_id",
  "telegram_username",
  "line_user_id",
  "member_status",
  "access_status",
  "entitlement_level",
  "package_code",
  "target_package_label",
  "expire_at",
  "grace_until",
  "telegram_access_status",
  "telegram_group_key",
  "member_lifecycle_status",
  "capability",
  "updated_at",
];

const LINE_STAGING_FIELDS = [
  "import_id",
  "line_user_id",
  "line_display_name",
  "line_renamed_name",
  "line_tags_raw",
  "normalized_name",
  "parsed_membership_status",
  "parsed_membership_tier",
  "parsed_membership_package",
  "matched_client",
  "matched_client_id",
  "review_status",
  "decision",
  "reviewed_at",
  "created_at",
];

const RETRYABLE_AIRTABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [320, 760, 1600];

export function isCreateSessionClientLineageRequest(path, method) {
  const p = normalizePath(path);
  const m = String(method || "GET").toUpperCase();
  return (
    (p === CREATE_SESSION_CLIENT_LINEAGE_LOOKUP_PATH && m === "POST") ||
    (p === CREATE_SESSION_CLIENT_RECENT_PATH && m === "GET")
  );
}

export async function handleCreateSessionClientLineageRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  if (!isCreateSessionClientLineageRequest(path, method)) {
    return json({ ok: false, error: "not_found" }, 404);
  }

  if (!(await isLineageAuthed(request, env))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) {
    return json({ ok: false, error: "lineage_storage_not_ready" }, 503);
  }

  let query = "";
  if (path === CREATE_SESSION_CLIENT_LINEAGE_LOOKUP_PATH) {
    const body = await request.json().catch(() => ({}));
    query = clean(body?.query).slice(0, 160);
  }

  try {
    const snapshot = await buildClientLineageRecords(env, {
      query,
      limit: path === CREATE_SESSION_CLIENT_RECENT_PATH ? 24 : 40,
      recent: path === CREATE_SESSION_CLIENT_RECENT_PATH || !query,
    });

    return json({
      ok: true,
      source: "canonical_client_lineage",
      authority: "airtable_operational_records",
      entitlement_policy: "display_snapshot_only_backend_rechecks",
      records: snapshot.records,
      count: snapshot.records.length,
      lineage_warnings: snapshot.warnings,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: "lineage_lookup_failed",
        detail: safeError(error),
      },
      503,
    );
  }
}

async function buildClientLineageRecords(env, { query = "", limit = 40, recent = false } = {}) {
  const tables = tableNames(env);
  const warnings = [];

  // Clients are the canonical selectable inventory and are the only required read.
  // Enrichment must never make Find Client unavailable.
  const clients = await airtableList(env, tables.clients, CLIENT_FIELDS, 500);
  const members = await optionalAirtableList(env, tables.members, MEMBER_FIELDS, 160, warnings, "members");
  const entitlements = await optionalAirtableList(env, tables.entitlements, ENTITLEMENT_FIELDS, 240, warnings, "entitlements");

  // LINE staging is large and evidence-only. Never scan hundreds of staging rows
  // for every lookup. Search it server-side only when the operator entered a query.
  const staging = query
    ? await optionalAirtableList(
        env,
        tables.lineStaging,
        LINE_STAGING_FIELDS,
        80,
        warnings,
        "line_staging",
        { filterByFormula: stagingSearchFormula(query) },
      )
    : [];

  const memberIndexes = buildMemberIndexes(members);
  const entitlementIndexes = buildEntitlementIndexes(entitlements);
  const stagingIndexes = buildStagingIndexes(staging);
  const needle = normalizeSearch(query);

  const rows = clients
    .map((record) => {
      const fields = record.fields || {};
      const relatedMember = resolveRelatedMember(fields, memberIndexes, entitlementIndexes, record.id);
      const relatedEntitlements = resolveRelatedEntitlements(fields, relatedMember, entitlementIndexes, record.id);
      const entitlement = chooseDisplayEntitlement(relatedEntitlements);
      const relatedStaging = resolveRelatedStaging(fields, stagingIndexes, record.id);
      const searchValues = lineageSearchValues(fields, relatedMember?.fields || {}, entitlement?.fields || {}, relatedStaging);
      const score = recent ? recentScore(record, relatedMember, entitlement, relatedStaging) : matchScore(needle, searchValues);
      if (!recent && needle && score <= 0) return null;
      return {
        score,
        createdTime: record.createdTime || "",
        record: toClientLineageRecord(record, relatedMember, entitlement, relatedStaging, score),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (!recent && b.score !== a.score) return b.score - a.score;
      return String(b.createdTime || "").localeCompare(String(a.createdTime || ""));
    })
    .slice(0, Math.max(1, Math.min(Number(limit) || 40, 60)))
    .map((item) => item.record);

  return { records: rows, warnings };
}

async function optionalAirtableList(env, tableName, fields, maxRecords, warnings, label, options = {}) {
  try {
    return await airtableList(env, tableName, fields, maxRecords, options);
  } catch (error) {
    warnings.push(`${label}:${safeError(error)}`);
    return [];
  }
}

function toClientLineageRecord(clientRecord, memberRecord, entitlementRecord, stagingRecords, score) {
  const client = clientRecord.fields || {};
  const member = memberRecord?.fields || {};
  const entitlement = entitlementRecord?.fields || {};
  const staging = stagingRecords?.[0]?.fields || {};

  const clientName = firstText(
    client["Client Name (Display)"],
    client["Client Name"],
    client.mmd_client_name,
    client.nickname,
    member["Full Name (Display)"],
    member["Full Name"],
    member.mmd_client_name,
    staging.line_renamed_name,
    staging.line_display_name,
  );

  const lineUserId = firstText(client.line_user_id, entitlement.line_user_id, staging.line_user_id);
  const lineDisplayName = firstText(client.line_display_name, staging.line_renamed_name, staging.line_display_name);
  const memberEmail = firstText(member["Contact Email"], entitlement.member_email, client.email, client["Contact Email"]);
  const packageCode = firstText(entitlement.package_code, member["Membership Tier"], staging.parsed_membership_package);
  const tier = firstText(entitlement.entitlement_level, member["Membership Tier"], staging.parsed_membership_tier);
  const membershipStatus = firstText(
    entitlement.member_lifecycle_status,
    entitlement.member_status,
    member["Membership Status"],
    member["Verification Status"],
  );
  const telegramUsername = firstText(client.telegram_username, member.telegram_username, entitlement.telegram_username);

  return compact({
    client_id: clientRecord.id,
    member_id: firstText(member.member_id),
    member_email: memberEmail,
    memberstack_id: firstText(member.memberstack_id, entitlement.memberstack_id),
    client_name: clientName,
    username: firstText(client.username, member.username),
    phone: "",
    package_code: packageCode,
    tier,
    membership_status: membershipStatus,
    purchased_history: buildLineageSummary(member, entitlement),
    line_record_id: firstText(staging.import_id, stagingRecords?.[0]?.id),
    line_user_id: lineUserId,
    line_display_name: lineDisplayName,
    legacy_tags: mergeLegacyTags(stagingRecords),
    customer_telegram_username: telegramUsername,
    customer_telegram_status: normalizeTelegramStatus(entitlement.telegram_access_status),
    confidence: Math.max(1, Math.min(100, Math.round(Number(score) || 70))),
    lineage_source: "canonical_client",
    entitlement_snapshot_source: entitlementRecord ? "member_entitlements_display_only" : memberRecord ? "members_display_only" : "none",
  });
}

function buildLineageSummary(member, entitlement) {
  const pieces = [];
  const access = firstText(entitlement.access_status);
  const lifecycle = firstText(entitlement.member_lifecycle_status, entitlement.member_status, member["Membership Status"]);
  const expiry = firstText(entitlement.expire_at, member["Membership Expiry"], member["Membership End Date"], member["Expire At"]);
  if (access) pieces.push(access);
  if (lifecycle && !pieces.some((value) => normalizeSearch(value) === normalizeSearch(lifecycle))) pieces.push(lifecycle);
  if (expiry) pieces.push(`exp ${String(expiry).slice(0, 10)}`);
  return pieces.join(" · ");
}

function resolveRelatedMember(client, memberIndexes, entitlementIndexes, clientRecordId) {
  const directlyLinked = memberIndexes.byClientRecordId.get(clientRecordId);
  if (directlyLinked) return directlyLinked;

  const directEntitlements = entitlementIndexes.byClientRecordId.get(clientRecordId) || [];
  for (const entitlement of directEntitlements) {
    for (const memberId of linkIds(entitlement.fields?.member)) {
      const byRecord = memberIndexes.byRecordId.get(memberId);
      if (byRecord) return byRecord;
    }
  }

  const email = normalizeSearch(firstText(client.email, client["Contact Email"]));
  if (email && memberIndexes.byEmail.has(email)) return memberIndexes.byEmail.get(email);

  const line = normalizeSearch(client.line_user_id);
  if (line && memberIndexes.byLine.has(line)) return memberIndexes.byLine.get(line);

  const username = normalizeSearch(client.username);
  if (username && memberIndexes.byUsername.has(username)) return memberIndexes.byUsername.get(username);
  return null;
}

function resolveRelatedEntitlements(client, memberRecord, indexes, clientRecordId) {
  const out = [];
  const seen = new Set();
  const add = (record) => {
    if (!record || seen.has(record.id)) return;
    seen.add(record.id);
    out.push(record);
  };

  for (const record of indexes.byClientRecordId.get(clientRecordId) || []) add(record);
  if (memberRecord) {
    for (const record of indexes.byMemberRecordId.get(memberRecord.id) || []) add(record);
  }

  const email = normalizeSearch(firstText(memberRecord?.fields?.["Contact Email"], client.email, client["Contact Email"]));
  if (email) for (const record of indexes.byEmail.get(email) || []) add(record);

  const line = normalizeSearch(firstText(client.line_user_id, memberRecord?.fields?.line_id));
  if (line) for (const record of indexes.byLine.get(line) || []) add(record);

  return out;
}

function chooseDisplayEntitlement(records) {
  if (!Array.isArray(records) || !records.length) return null;
  return records.slice().sort((a, b) => entitlementRank(b) - entitlementRank(a))[0] || null;
}

function entitlementRank(record) {
  const fields = record?.fields || {};
  const access = normalizeSearch(fields.access_status);
  const lifecycle = normalizeSearch(fields.member_lifecycle_status || fields.member_status);
  const capability = normalizeSearch(fields.capability);
  let score = 0;
  if (/active|granted|allow|enabled/.test(access)) score += 40;
  if (/active|current/.test(lifecycle)) score += 30;
  if (/membership|member|private|access/.test(capability)) score += 15;
  if (fields.package_code || fields.entitlement_level) score += 10;
  if (fields.expire_at) score += 5;
  return score;
}

function resolveRelatedStaging(client, indexes, clientRecordId) {
  const out = [];
  const seen = new Set();
  const add = (record) => {
    if (!record || seen.has(record.id)) return;
    seen.add(record.id);
    out.push(record);
  };

  for (const record of indexes.byClientRecordId.get(clientRecordId) || []) add(record);
  const line = normalizeSearch(client.line_user_id);
  if (line) for (const record of indexes.byLine.get(line) || []) add(record);
  const name = normalizeSearch(firstText(client["Client Name"], client["Client Name (Display)"], client.mmd_client_name, client.nickname));
  if (name) for (const record of indexes.byName.get(name) || []) add(record);

  return out
    .filter((record) => stagingIsReviewSafe(record.fields || {}, clientRecordId))
    .sort((a, b) => String(b.createdTime || "").localeCompare(String(a.createdTime || "")));
}

function stagingIsReviewSafe(fields, clientRecordId) {
  const linked = new Set([...linkIds(fields.matched_client), clean(fields.matched_client_id)].filter(Boolean));
  if (linked.has(clientRecordId)) return true;
  const status = normalizeSearch(firstText(fields.review_status, fields.decision));
  return /approved|reviewed|committed|matched/.test(status);
}

function buildMemberIndexes(records) {
  const indexes = {
    byRecordId: new Map(),
    byClientRecordId: new Map(),
    byEmail: new Map(),
    byLine: new Map(),
    byUsername: new Map(),
  };
  for (const record of records) {
    const fields = record.fields || {};
    indexes.byRecordId.set(record.id, record);
    for (const clientId of linkIds(fields.Clients)) setFirst(indexes.byClientRecordId, clientId, record);
    setFirst(indexes.byEmail, normalizeSearch(fields["Contact Email"]), record);
    setFirst(indexes.byLine, normalizeSearch(fields.line_id), record);
    setFirst(indexes.byUsername, normalizeSearch(fields.username), record);
  }
  return indexes;
}

function buildEntitlementIndexes(records) {
  const indexes = {
    byClientRecordId: new Map(),
    byMemberRecordId: new Map(),
    byEmail: new Map(),
    byLine: new Map(),
  };
  for (const record of records) {
    const fields = record.fields || {};
    for (const id of linkIds(fields.client)) pushMap(indexes.byClientRecordId, id, record);
    for (const id of linkIds(fields.member)) pushMap(indexes.byMemberRecordId, id, record);
    pushMap(indexes.byEmail, normalizeSearch(fields.member_email), record);
    pushMap(indexes.byLine, normalizeSearch(fields.line_user_id), record);
  }
  return indexes;
}

function buildStagingIndexes(records) {
  const indexes = {
    byClientRecordId: new Map(),
    byLine: new Map(),
    byName: new Map(),
  };
  for (const record of records) {
    const fields = record.fields || {};
    for (const id of linkIds(fields.matched_client)) pushMap(indexes.byClientRecordId, id, record);
    if (clean(fields.matched_client_id)) pushMap(indexes.byClientRecordId, clean(fields.matched_client_id), record);
    pushMap(indexes.byLine, normalizeSearch(fields.line_user_id), record);
    for (const value of [fields.normalized_name, fields.line_renamed_name, fields.line_display_name]) {
      pushMap(indexes.byName, normalizeSearch(value), record);
    }
  }
  return indexes;
}

function lineageSearchValues(client, member, entitlement, stagingRecords) {
  const values = [
    client["Client Name"], client["Client Name (Display)"], client.username, client.mmd_client_name, client.nickname,
    client.line_user_id, client.line_display_name, client.telegram_username, client.email, client["Contact Email"], client["Phone Number"],
    member["Full Name"], member["Full Name (Display)"], member.username, member.mmd_client_name, member.line_id,
    member.telegram_username, member["Contact Email"], member["Phone Number"], member.member_id, member["Membership Tier"], member["Membership Status"],
    entitlement.member_email, entitlement.line_user_id, entitlement.telegram_username, entitlement.entitlement_level,
    entitlement.package_code, entitlement.target_package_label, entitlement.member_status, entitlement.member_lifecycle_status,
  ];
  for (const record of stagingRecords || []) {
    const fields = record.fields || {};
    values.push(fields.line_user_id, fields.line_display_name, fields.line_renamed_name, fields.line_tags_raw, fields.normalized_name);
  }
  return values.filter((value) => value !== undefined && value !== null && value !== "").map((value) => String(value));
}

function matchScore(needle, values) {
  if (!needle) return 70;
  let best = 0;
  for (const raw of values) {
    const value = normalizeSearch(raw);
    if (!value) continue;
    if (value === needle) best = Math.max(best, 100);
    else if (value.startsWith(needle)) best = Math.max(best, 94);
    else if (value.includes(needle)) best = Math.max(best, 88);
    else if (needle.length >= 4 && needle.includes(value)) best = Math.max(best, 82);
  }
  return best;
}

function recentScore(clientRecord, memberRecord, entitlementRecord, stagingRecords) {
  let score = 70;
  if (memberRecord) score += 8;
  if (entitlementRecord) score += 8;
  if (stagingRecords?.length) score += 4;
  if (firstText(clientRecord.fields?.line_user_id, entitlementRecord?.fields?.line_user_id, stagingRecords?.[0]?.fields?.line_user_id)) score += 5;
  return Math.min(99, score);
}

function mergeLegacyTags(records) {
  const out = [];
  const seen = new Set();
  for (const record of records || []) {
    const raw = firstText(record.fields?.line_tags_raw);
    for (const part of String(raw || "").split(/[\n,;|]+/)) {
      const value = clean(part);
      if (!value) continue;
      const key = normalizeSearch(value);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length >= 12) return out;
    }
  }
  return out;
}

function normalizeTelegramStatus(value) {
  const status = normalizeSearch(value);
  if (/verified/.test(status)) return "verified";
  if (/active|granted|linked|member|joined/.test(status)) return "linked";
  if (/invited|pending/.test(status)) return "invited";
  return "missing";
}

function stagingSearchFormula(query) {
  const needle = airtableFormulaString(normalizeSearch(query));
  if (!needle) return "FALSE()";
  const fields = [
    "line_display_name",
    "line_renamed_name",
    "line_tags_raw",
    "normalized_name",
    "line_user_id",
    "matched_client_id",
  ];
  const checks = fields.map((field) => `IFERROR(SEARCH(\"${needle}\",LOWER({${field}}&\"\")),0)>0`);
  return `OR(${checks.join(",")})`;
}

function airtableFormulaString(value) {
  return clean(value).replace(/\\/g, "\\\\").replace(/\"/g, '\\"');
}

async function airtableList(env, tableName, fields, maxRecords, options = {}) {
  const output = [];
  let offset = "";
  const cap = Math.max(1, Math.min(Number(maxRecords) || 100, 500));

  while (output.length < cap) {
    const params = new URLSearchParams();
    params.set("pageSize", String(Math.min(100, cap - output.length)));
    if (offset) params.set("offset", offset);
    if (clean(options.filterByFormula)) params.set("filterByFormula", clean(options.filterByFormula));
    for (const field of fields || []) params.append("fields[]", field);

    const requestUrl = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}?${params.toString()}`;
    const response = await airtableFetchWithRetry(requestUrl, env);

    if (!response.ok) {
      throw new Error(`airtable_${tableName}_${response.status}`);
    }

    const data = await response.json();
    const records = Array.isArray(data.records) ? data.records : [];
    output.push(...records);
    offset = clean(data.offset);
    if (!offset || records.length === 0) break;
  }

  return output.slice(0, cap);
}

async function airtableFetchWithRetry(url, env) {
  let response = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (response.ok || !RETRYABLE_AIRTABLE_STATUS.has(response.status) || attempt >= RETRY_DELAYS_MS.length) {
      return response;
    }

    const retryAfterSeconds = Number(response.headers.get("Retry-After"));
    const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(4000, retryAfterSeconds * 1000)
      : RETRY_DELAYS_MS[attempt];
    await sleep(retryAfterMs);
  }
  return response;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function tableNames(env) {
  return {
    clients: clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS) || DEFAULT_TABLES.clients,
    members: clean(env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS) || DEFAULT_TABLES.members,
    entitlements: clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS) || DEFAULT_TABLES.entitlements,
    lineStaging: clean(env.AIRTABLE_TABLE_LINE_OFC_CLIENT_IMPORT_STAGING_ID || env.AIRTABLE_TABLE_LINE_OFC_CLIENT_IMPORT_STAGING) || DEFAULT_TABLES.lineStaging,
  };
}

async function isLineageAuthed(request, env) {
  const authorization = clean(request.headers.get("Authorization"));
  const bearer = authorization.replace(/^Bearer\s+/i, "").trim();
  const confirm = clean(request.headers.get("X-Confirm-Key"));
  const candidates = [clean(env.INTERNAL_TOKEN), clean(env.ADMIN_BEARER)].filter(Boolean);

  for (const expected of candidates) {
    if (bearer && (await constantTimeEqual(bearer, expected))) return true;
  }
  const expectedConfirm = clean(env.CONFIRM_KEY);
  return Boolean(expectedConfirm && confirm && (await constantTimeEqual(confirm, expectedConfirm)));
}

async function constantTimeEqual(a, b) {
  const aa = new TextEncoder().encode(String(a || ""));
  const bb = new TextEncoder().encode(String(b || ""));
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function linkIds(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const single = clean(value);
  return single ? [single] : [];
}

function setFirst(map, key, value) {
  if (key && !map.has(key)) map.set(key, value);
}

function pushMap(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function firstText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const item = value.find((entry) => clean(entry));
      if (item !== undefined) return clean(item);
    } else if (clean(value)) {
      return clean(value);
    }
  }
  return "";
}

function compact(object) {
  return Object.fromEntries(Object.entries(object || {}).filter(([, value]) => value !== undefined && value !== null));
}

function normalizeSearch(value) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function clean(value) {
  return String(value ?? "").trim();
}

function safeError(error) {
  return clean(error?.message || error || "unknown_error").slice(0, 180);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private, max-age=0",
      "X-MMD-Client-Lineage": "canonical-v2",
    },
  });
}
