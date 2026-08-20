import {
  buildCustomerVisibleProfile,
  buildKenjiMemorySnapshot,
  buildKenjiSafeContext,
  buildMmdClientId,
  parseLatestSignupFromRenamedName,
} from "../../shared/kenji-member-memory-snapshot.mjs";

// Migration preservation only. This provider-neutral memory loader is retained
// for future Cloudflare migration and is not a production webhook owner.

const TABLES = Object.freeze({
  CLIENTS: "Clients",
  LINE_OFC_STAGING: "LINE OFC Client Import Staging",
  MEMBER_ENTITLEMENTS: "MMD — Member Entitlements",
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
  ENT_ACCESS_STATUS: "access_status",
  ENT_PACKAGE_CODE: "package_code",
  ENT_EXPIRE_AT: "expire_at",
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

async function findEntitlement(options, { lineUserId, clientRecordId }) {
  const filters = [];
  if (lineUserId) filters.push(formulaEq(F.ENT_LINE_USER_ID, lineUserId));
  if (clientRecordId) filters.push(`FIND("${esc(clientRecordId)}", ARRAYJOIN({${F.ENT_CLIENT}}))`);
  if (!filters.length) return null;
  const rows = await airtableList({
    ...options,
    tableName: TABLES.MEMBER_ENTITLEMENTS,
    params: { maxRecords: 1, filterByFormula: filters.length === 1 ? filters[0] : `OR(${filters.join(",")})` },
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

function mapEntitlement(row) {
  const x = row?.fields || {};
  return {
    id: row?.id,
    member_status: x[F.ENT_MEMBER_STATUS],
    access_status: x[F.ENT_ACCESS_STATUS],
    package_code: x[F.ENT_PACKAGE_CODE],
    expire_at: x[F.ENT_EXPIRE_AT],
  };
}

export async function loadKenjiMemberMemoryForLine(options = {}) {
  const lineUserId = text(options.lineUserId || options.line_user_id);
  const lineDisplayName = text(options.lineDisplayName || options.line_display_name || options.profile?.displayName);
  if (!lineUserId) return null;

  const airtable = { baseId: options.baseId, apiKey: options.apiKey };
  const clientRow = await findClientByLineUserId(airtable, lineUserId);
  const legacyRow = await findLegacyByLineIdentity(airtable, { lineUserId, lineDisplayName });
  const entitlementRow = await findEntitlement(airtable, { lineUserId, clientRecordId: clientRow?.id });

  const legacy = mapLegacy(legacyRow);
  const entitlement = mapEntitlement(entitlementRow);
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

  const snapshot = buildKenjiMemorySnapshot({
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

  return {
    snapshot,
    kenji_safe_context: buildKenjiSafeContext(snapshot),
    customer_visible_profile: buildCustomerVisibleProfile(snapshot),
    found: {
      client: Boolean(clientRow?.id),
      legacy: Boolean(legacyRow?.id),
      entitlement: Boolean(entitlementRow?.id),
    },
  };
}
