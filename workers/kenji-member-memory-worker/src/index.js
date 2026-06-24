import {
  buildCustomerVisibleProfile,
  buildKenjiMemorySnapshot,
  buildKenjiSafeContext,
  buildMmdClientId,
  canMaterializeFromTrigger,
  parseLatestSignupFromRenamedName,
} from "../../../shared/kenji-member-memory-snapshot.mjs";

const AIRTABLE_BASE_ID_DEFAULT = "appsV1ILPRfIjkaYg";

const TABLES = {
  CLIENTS: "Clients",
  LINE_OFC_STAGING: "LINE OFC Client Import Staging",
  LIFF_RENEWAL_SESSIONS: "MMD — LIFF Renewal Sessions",
  MEMBER_ENTITLEMENTS: "MMD — Member Entitlements",
};

const F = {
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
  LIFF_SESSION_ID: "renewal_session_id",
  LIFF_CLIENT: "Client",
  LIFF_STAGING: "LINE OFC Import Row",
  LIFF_LINE_USER_ID: "line_user_id",
  LIFF_LINE_DISPLAY_NAME: "line_display_name",
  LIFF_MEMBER_ID_CANDIDATE: "member_id_candidate",
  LIFF_MEMBER_ID_CANONICAL: "member_id_canonical",
  LIFF_MEMBER_ID_DISPLAY: "member_id_display",
  LIFF_MEMBER_ID_VALIDATION: "member_id_validation_status",
  LIFF_FLOW_STATUS: "renewal_flow_status",
  LIFF_TRIGGER: "renewal_trigger",
  LIFF_REQUESTED_PACKAGE: "requested_package",
  LIFF_MEMBER_SINCE_RAW: "member_since_evidence_raw",
  LIFF_MEMBER_SINCE_PROPOSED: "member_since_proposed",
  LIFF_HISTORY_STATUS: "history_materialization_status",
  LIFF_POINTS_STATUS: "points_materialization_status",
  LIFF_PROFILE_STATUS: "profile_materialization_status",
  LIFF_PROFILE_PREVIEW_JSON: "profile_preview_json",
  LIFF_LEGACY_SUMMARY: "legacy_evidence_summary",
  LIFF_MEMBER_MESSAGE: "member_facing_message",
  LIFF_IDENTITY_LINKED_AT: "identity_linked_at",
  LIFF_PROFILE_PREVIEWED_AT: "profile_previewed_at",
  LIFF_REVIEW_NOTE: "review_note",
  LIFF_PAYLOAD_JSON: "payload_json",
  LIFF_APP_STATUS: "liff_app_status",
  LIFF_URL_BINDING: "liff_url_binding",
  LIFF_ENTRY_ROUTE: "member_entry_route",
  LIFF_PAGE_INTENT: "membership_page_intent",
};

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,x-mmd-internal-key");
  return new Response(JSON.stringify(data, null, 2), { ...init, headers });
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function makeId(prefix) {
  return `${prefix}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${crypto.randomUUID().slice(0, 8)}`;
}

function assertInternal(request, env) {
  const required = text(env.MMD_INTERNAL_KEY);
  if (!required) return;
  const provided = text(request.headers.get("x-mmd-internal-key"));
  if (provided !== required) throw new Error("unauthorized");
}

function airtableEnv(env) {
  const apiKey = env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN;
  if (!apiKey) throw new Error("AIRTABLE_API_KEY missing");
  return { apiKey, baseId: env.AIRTABLE_BASE_ID || AIRTABLE_BASE_ID_DEFAULT };
}

function esc(value) {
  return text(value).replace(/'/g, "\\'");
}

function formulaEq(field, value) {
  return `{${field}}='${esc(value)}'`;
}

async function airtableList(env, table, params = {}) {
  const { apiKey, baseId } = airtableEnv(env);
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const res = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Airtable list failed: ${res.status}`);
  return data.records || [];
}

async function airtableCreate(env, table, fields) {
  const { apiKey, baseId } = airtableEnv(env);
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Airtable create failed: ${res.status}`);
  return data.records?.[0] || null;
}

function identityFromBody(body) {
  const lineUserId = text(body.line_user_id || body.lineUserId);
  if (!lineUserId) throw new Error("line_user_id required from verified upstream LIFF/LINE owner");
  return {
    line_user_id: lineUserId,
    line_display_name: text(body.line_display_name || body.displayName),
  };
}

async function findClient(env, identity) {
  const rows = await airtableList(env, TABLES.CLIENTS, {
    maxRecords: 1,
    filterByFormula: formulaEq(F.CLIENT_LINE_USER_ID, identity.line_user_id),
  });
  return rows[0] || null;
}

async function findLegacy(env, identity) {
  const filters = [formulaEq(F.STAGING_LINE_USER_ID, identity.line_user_id)];
  if (identity.line_display_name) {
    filters.push(formulaEq(F.STAGING_LINE_DISPLAY_NAME, identity.line_display_name));
    filters.push(formulaEq(F.STAGING_LINE_RENAMED_NAME, identity.line_display_name));
  }
  const rows = await airtableList(env, TABLES.LINE_OFC_STAGING, {
    maxRecords: 1,
    filterByFormula: `OR(${filters.join(",")})`,
  });
  return rows[0] || null;
}

async function findEntitlement(env, identity, client) {
  const filters = [formulaEq(F.ENT_LINE_USER_ID, identity.line_user_id)];
  if (client?.id) filters.push(`FIND('${esc(client.id)}', ARRAYJOIN({${F.ENT_CLIENT}}))`);
  const rows = await airtableList(env, TABLES.MEMBER_ENTITLEMENTS, {
    maxRecords: 1,
    filterByFormula: `OR(${filters.join(",")})`,
  });
  return rows[0] || null;
}

function clientMap(row, identity) {
  const x = row?.fields || {};
  return {
    id: row?.id,
    username: x[F.CLIENT_USERNAME],
    mmd_client_name: x[F.CLIENT_MMD_NAME],
    nickname: x[F.CLIENT_NICKNAME],
    suffix_code: x[F.CLIENT_SUFFIX],
    line_user_id: x[F.CLIENT_LINE_USER_ID] || identity.line_user_id,
    line_display_name: x[F.CLIENT_LINE_DISPLAY_NAME] || identity.line_display_name,
    membership_status: x[F.CLIENT_MEMBERSHIP_STATUS],
    expire_at: x[F.CLIENT_EXPIRE_AT],
    points_balance: x[F.CLIENT_POINTS_BALANCE],
  };
}

function legacyMap(row) {
  const x = row?.fields || {};
  const renamed = parseLatestSignupFromRenamedName(x[F.STAGING_LINE_RENAMED_NAME] || x[F.STAGING_LINE_DISPLAY_NAME]);
  const summaryParts = [];
  if (x[F.STAGING_PARSED_PACKAGE]) summaryParts.push(`package hint: ${x[F.STAGING_PARSED_PACKAGE]}`);
  if (x[F.STAGING_PARSED_LEVEL]) summaryParts.push(`client level: ${x[F.STAGING_PARSED_LEVEL]}`);
  if (x[F.STAGING_SERVICE_AMOUNT]) summaryParts.push(`staged service amount: ${x[F.STAGING_SERVICE_AMOUNT]}`);
  if (x[F.STAGING_PROPOSED_POINTS]) summaryParts.push(`proposed points: ${x[F.STAGING_PROPOSED_POINTS]}`);
  return {
    id: row?.id,
    line_user_id: x[F.STAGING_LINE_USER_ID],
    line_display_name: x[F.STAGING_LINE_DISPLAY_NAME],
    line_renamed_name: x[F.STAGING_LINE_RENAMED_NAME],
    normalized_name: x[F.STAGING_NORMALIZED_NAME],
    parsed_membership_package: x[F.STAGING_PARSED_PACKAGE],
    parsed_client_level: x[F.STAGING_PARSED_LEVEL],
    proposed_points: x[F.STAGING_PROPOSED_POINTS],
    service_history_summary: summaryParts.join("; "),
    latest_signup_date_raw: renamed.latest_signup_date_raw,
    membership_cycle_start_at: renamed.membership_cycle_start_at,
  };
}

function entitlementMap(row) {
  const x = row?.fields || {};
  return {
    id: row?.id,
    member_status: x[F.ENT_MEMBER_STATUS],
    access_status: x[F.ENT_ACCESS_STATUS],
    package_code: x[F.ENT_PACKAGE_CODE],
    expire_at: x[F.ENT_EXPIRE_AT],
  };
}

async function buildContext(env, identity, body = {}) {
  const clientRow = await findClient(env, identity);
  const legacyRow = await findLegacy(env, identity);
  const entitlementRow = await findEntitlement(env, identity, clientRow);
  const legacy = legacyMap(legacyRow);
  const entitlement = entitlementMap(entitlementRow);
  const client = clientRow ? clientMap(clientRow, identity) : {
    line_user_id: identity.line_user_id,
    line_display_name: identity.line_display_name,
    mmd_client_name: body.nickname || legacy.normalized_name,
  };

  const clientId = buildMmdClientId({
    nickname: body.nickname || client.mmd_client_name || client.nickname || legacy.normalized_name || identity.line_display_name,
    hidden_name: true,
    package_code: body.requested_package || entitlement.package_code || legacy.parsed_membership_package || legacy.parsed_client_level,
  });

  const snapshot = buildKenjiMemorySnapshot({
    client: { ...client, ...clientId },
    entitlement,
    points: {
      points_balance_confirmed: client.points_balance,
      points_pending_review: legacy.proposed_points,
    },
    legacy,
    conversation: { summary: body.conversation_summary },
    line_user_id: identity.line_user_id,
    materialization_status: canMaterializeFromTrigger(body.materialization_trigger) ? "ready_for_review_safe_materialization" : "snapshot_only",
  });

  return { clientRow, legacyRow, entitlementRow, legacy, snapshot };
}

function memberMessage(snapshot) {
  const name = snapshot.display_name_for_kenji ? `คุณ${snapshot.display_name_for_kenji}` : "คุณ";
  const points = Number(snapshot.points_balance_confirmed || 0).toLocaleString("en-US");
  return `เข้าสู่ระบบเรียบร้อยครับ ${name} ตอนนี้ผมเห็นแต้มที่ยืนยันแล้ว ${points} points ข้อมูลเก่าที่รอตรวจจะยังไม่ถูกนำมาแสดงจนกว่าจะผ่านการตรวจสอบนะครับ`;
}

async function createLiffSession(env, identity, body, context) {
  const msg = memberMessage(context.snapshot);
  const fields = {
    [F.LIFF_SESSION_ID]: makeId("liff_member"),
    [F.LIFF_CLIENT]: context.clientRow?.id ? [context.clientRow.id] : undefined,
    [F.LIFF_STAGING]: context.legacyRow?.id ? [context.legacyRow.id] : undefined,
    [F.LIFF_LINE_USER_ID]: identity.line_user_id,
    [F.LIFF_LINE_DISPLAY_NAME]: identity.line_display_name,
    [F.LIFF_MEMBER_ID_CANDIDATE]: context.snapshot.client_id_display,
    [F.LIFF_MEMBER_ID_CANONICAL]: context.snapshot.client_id_canonical,
    [F.LIFF_MEMBER_ID_DISPLAY]: context.snapshot.client_id_display,
    [F.LIFF_MEMBER_ID_VALIDATION]: context.snapshot.client_id_canonical ? "valid" : "review_required",
    [F.LIFF_FLOW_STATUS]: "identity_linked",
    [F.LIFF_TRIGGER]: body.entry_route || "line_liff",
    [F.LIFF_REQUESTED_PACKAGE]: body.requested_package || context.snapshot.membership_package,
    [F.LIFF_MEMBER_SINCE_RAW]: context.legacy.latest_signup_date_raw,
    [F.LIFF_MEMBER_SINCE_PROPOSED]: context.legacy.membership_cycle_start_at || undefined,
    [F.LIFF_HISTORY_STATUS]: "snapshot_only",
    [F.LIFF_POINTS_STATUS]: "confirmed_only_visible",
    [F.LIFF_PROFILE_STATUS]: "profile_preview_ready",
    [F.LIFF_PROFILE_PREVIEW_JSON]: JSON.stringify(buildCustomerVisibleProfile(context.snapshot)),
    [F.LIFF_LEGACY_SUMMARY]: context.legacy.service_history_summary || "",
    [F.LIFF_MEMBER_MESSAGE]: msg,
    [F.LIFF_IDENTITY_LINKED_AT]: new Date().toISOString(),
    [F.LIFF_PROFILE_PREVIEWED_AT]: new Date().toISOString(),
    [F.LIFF_REVIEW_NOTE]: "LIFF identity linked only. No automatic materialization of points, profile, history, payments, or entitlements.",
    [F.LIFF_PAYLOAD_JSON]: JSON.stringify({ snapshot: context.snapshot, kenji_safe_context: buildKenjiSafeContext(context.snapshot) }),
    [F.LIFF_APP_STATUS]: "configured_existing_app",
    [F.LIFF_URL_BINDING]: body.liff_url_binding || env.LIFF_URL_BINDING || "",
    [F.LIFF_ENTRY_ROUTE]: body.member_entry_route || body.entry_route || "/member/membership",
    [F.LIFF_PAGE_INTENT]: body.membership_page_intent || body.intent || "profile_preview",
  };

  return { record: await airtableCreate(env, TABLES.LIFF_RENEWAL_SESSIONS, fields), message: msg };
}

async function handleSession(request, env) {
  assertInternal(request, env);
  const body = await request.json().catch(() => ({}));
  const identity = identityFromBody(body);
  const context = await buildContext(env, identity, body);
  const created = await createLiffSession(env, identity, body, context);
  return json({
    ok: true,
    session_id: created.record?.fields?.[F.LIFF_SESSION_ID],
    profile: buildCustomerVisibleProfile(context.snapshot),
    kenji_safe_context: buildKenjiSafeContext(context.snapshot),
    member_facing_message: created.message,
    materialization: {
      status: context.snapshot.materialization_status,
      allowed: canMaterializeFromTrigger(body.materialization_trigger),
    },
  });
}

async function handlePreview(request, env) {
  assertInternal(request, env);
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : Object.fromEntries(new URL(request.url).searchParams.entries());
  const identity = identityFromBody(body);
  const context = await buildContext(env, identity, body);
  return json({ ok: true, profile: buildCustomerVisibleProfile(context.snapshot) });
}

async function handleKenjiContext(request, env) {
  assertInternal(request, env);
  const body = await request.json().catch(() => ({}));
  const identity = identityFromBody(body);
  const context = await buildContext(env, identity, body);
  return json({ ok: true, kenji_safe_context: buildKenjiSafeContext(context.snapshot), visibility_guard: context.snapshot.internal_visibility_guard });
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return json({ ok: true });
      const url = new URL(request.url);
      if (url.pathname === "/health") return json({ ok: true, service: "kenji-member-memory-worker" });
      if (url.pathname === "/api/liff/session" && request.method === "POST") return handleSession(request, env);
      if (url.pathname === "/api/member/profile-preview" && ["GET", "POST"].includes(request.method)) return handlePreview(request, env);
      if (url.pathname === "/api/kenji/context" && request.method === "POST") return handleKenjiContext(request, env);
      return json({ ok: false, error: "not_found" }, { status: 404 });
    } catch (error) {
      return json({ ok: false, error: error.message }, { status: error.message === "unauthorized" ? 401 : 500 });
    }
  },
};
