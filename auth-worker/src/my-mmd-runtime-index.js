import runtime from "./runtime-index.js";
import { resolveMemberEntitlements } from "./member-entitlement-resolver.js";

const AUTH_ME_PATH = "/v1/auth/me";
const MEMBER_PROFILE_PATH = "/__internal/member-profile/read";
const ENTITLEMENT_TABLE = "MMD — Member Entitlements";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const shouldEnrich = request.method === "GET" && url.pathname === AUTH_ME_PATH
      || request.method === "POST" && url.pathname === MEMBER_PROFILE_PATH;
    if (!shouldEnrich) return runtime.fetch(request, env, ctx);

    const identityRequest = request.clone();
    const response = await runtime.fetch(request, env, ctx);
    if (!response.ok) return response;

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) return response;

    const payload = await response.clone().json().catch(() => null);
    if (!payload || typeof payload !== "object") return response;

    const identity = await resolveIdentity(url.pathname, identityRequest, payload);
    const entitlementSnapshot = await readEntitlementSnapshot(env, identity);

    if (url.pathname === AUTH_ME_PATH && payload.profile && typeof payload.profile === "object") {
      payload.profile.entitlement_snapshot = entitlementSnapshot;
    }
    if (url.pathname === MEMBER_PROFILE_PATH && payload.data && typeof payload.data === "object") {
      payload.data.entitlement_snapshot = entitlementSnapshot;
      if (payload.data.profile && typeof payload.data.profile === "object") {
        payload.data.profile.entitlement_snapshot = entitlementSnapshot;
      }
    }

    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(JSON.stringify(payload), { status: response.status, headers });
  },
};

async function resolveIdentity(path, request, payload) {
  if (path === AUTH_ME_PATH) {
    return {
      email: normalizeEmail(payload?.profile?.email),
      line_user_id: "",
    };
  }
  const body = await request.json().catch(() => null);
  return {
    email: "",
    line_user_id: canonicalLineId(body?.line_user_id),
  };
}

async function readEntitlementSnapshot(env, identity = {}) {
  const empty = () => ({ ...resolveMemberEntitlements([]), source_status: "unavailable" });
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return empty();

  const clauses = [];
  const email = normalizeEmail(identity.email);
  const lineUserId = canonicalLineId(identity.line_user_id);
  if (email) clauses.push(`LOWER({${env.AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD || "member_email"}})=${formulaString(email)}`);
  if (lineUserId) clauses.push(`{${env.AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD || "line_user_id"}}=${formulaString(lineUserId)}`);
  if (!clauses.length) return empty();

  try {
    const records = await airtableList(env, env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || ENTITLEMENT_TABLE, {
      filterByFormula: clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`,
      maxRecords: 100,
    });
    const adapted = records.map((record) => ({
      ...record,
      fields: {
        ...(record?.fields || {}),
        member_status: record?.fields?.member_lifecycle_status || record?.fields?.member_status || "",
      },
    }));
    return { ...resolveMemberEntitlements(adapted), source_status: "verified" };
  } catch (error) {
    console.warn({ event: "my_mmd_entitlement_snapshot_unavailable", failure_class: safeFailure(error) });
    return empty();
  }
}

async function airtableList(env, tableName, params = {}) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableName)}`);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const init = { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } };
  const response = env.AIRTABLE_HTTP?.fetch
    ? await env.AIRTABLE_HTTP.fetch(new Request(url.toString(), init))
    : await fetch(url.toString(), init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.records)) throw new Error(`airtable_${response.status || "malformed"}`);
  return data.records;
}

function canonicalLineId(value) {
  const id = String(value || "").trim();
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function formulaString(value) {
  return `'${String(value || "").replace(/'/g, "\\'")}'`;
}

function safeFailure(error) {
  return String(error?.message || "unknown").toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 80) || "unknown";
}
