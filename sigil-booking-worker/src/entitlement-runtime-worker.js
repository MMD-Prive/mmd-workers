import bookingWorker from "./index.js";
import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENT_RESOLVE_PATH = "/sigil/api/client/resolve";
const MODEL_SEARCH_PATH = "/sigil/api/models/search";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if ((method === "GET" || method === "POST") && path === MODEL_SEARCH_PATH) {
      const scope = await requestedScope(request, url);
      if (scope === "private") {
        const allowed = await canonicalStoredPrivateAccess(env, request, url).catch(() => false);
        if (!allowed) return json({ ok: true, matched: false, blocked: true, reason: "private_requires_entitlement_snapshot", access_scope: "public_only", member_status: "unknown", items: [] }, 200);
      }
      return bookingWorker.fetch(request, env, ctx);
    }

    if (method === "POST" && path === CLIENT_RESOLVE_PATH) {
      const clone = request.clone();
      const body = await clone.json().catch(() => ({}));
      const response = await bookingWorker.fetch(request, env, ctx);
      if (!response.ok) return response;
      const payload = await response.clone().json().catch(() => null);
      if (!payload?.ok) return response;
      const canonical = await resolveCanonicalAccess(env, body).catch(() => failClosedAccess());
      await persistCanonicalAccess(env, payload, canonical).catch(() => null);
      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      headers.set("cache-control", "no-store");
      return new Response(JSON.stringify({ ...payload, ...canonical.response, entitlement_snapshot: canonical.snapshot }), { status: response.status, headers });
    }

    return bookingWorker.fetch(request, env, ctx);
  },
};

async function resolveCanonicalAccess(env, body) {
  requireAirtable(env);
  const email = clean(body.client_contact || body.email).toLowerCase();
  const line = clean(body.line_or_member_id || body.line_id || body.member_id);
  const filters = [];
  if (email.includes("@")) filters.push(`LOWER({member_email})=${formulaText(email)}`);
  if (line) filters.push(`{line_user_id}=${formulaText(line)}`, `{memberstack_id}=${formulaText(line)}`);
  if (!filters.length) return failClosedAccess();
  const table = env.AIRTABLE_TABLE_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || "MMD — Member Entitlements";
  const rows = await airtableList(env, table, filters.length === 1 ? filters[0] : `OR(${filters.join(",")})`, 100);
  const snapshot = resolveMemberEntitlements(rows.map((row) => ({ ...row, fields: { ...(row.fields || {}), member_status: row.fields?.member_lifecycle_status || row.fields?.member_status } })));
  const access = snapshot.access || {};
  const active = Array.isArray(snapshot.capability_state?.active) ? snapshot.capability_state.active : [];
  const grace = Array.isArray(snapshot.capability_state?.grace) ? snapshot.capability_state.grace : [];
  const privateAllowed = !snapshot.member_blocked && String(access.private_visibility_envelope || "none") !== "none";
  const memberStatus = snapshot.member_blocked ? "blocked" : active.length ? "active" : grace.length ? "grace" : "expired";
  return {
    snapshot,
    response: {
      member_status: memberStatus,
      membership_tier: String(access.private_visibility_envelope || ""),
      access_scope: privateAllowed ? "public_private" : "public_only",
      can_search_public_models: Boolean(access.public_service_access || privateAllowed),
      can_search_private_models: privateAllowed,
      next_required_action: privateAllowed ? "continue_booking" : "signup_or_continue_public",
    },
  };
}

function failClosedAccess() {
  const snapshot = resolveMemberEntitlements([]);
  return { snapshot, response: { member_status: "unknown", membership_tier: "", access_scope: "public_only", can_search_public_models: true, can_search_private_models: false, next_required_action: "signup_or_continue_public" } };
}

async function persistCanonicalAccess(env, payload, canonical) {
  const bookingRef = clean(payload.booking_ref);
  if (!bookingRef) return;
  const table = env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || "SIGIL Booking Requests";
  const rows = await airtableList(env, table, `{booking_ref}=${formulaText(bookingRef)}`, 1);
  const row = rows[0];
  if (!row?.id) return;
  const response = canonical.response;
  await airtablePatch(env, table, row.id, {
    member_status: response.member_status,
    access_scope: response.access_scope,
    "Private Allowed": response.can_search_private_models,
    resolver_payload_json: JSON.stringify({ kind: "client_resolve", schema_version: canonical.snapshot.schema_version, entitlement_snapshot: canonical.snapshot, saved_at: new Date().toISOString() }),
  });
}

async function canonicalStoredPrivateAccess(env, request, url) {
  requireAirtable(env);
  let body = {};
  if (request.method.toUpperCase() === "POST") body = await request.clone().json().catch(() => ({}));
  const bookingRef = clean(url.searchParams.get("booking_ref") || body.booking_ref || body.request_id);
  const sessionId = clean(url.searchParams.get("session_id") || body.session_id);
  const checks = [];
  if (bookingRef) checks.push(`{booking_ref}=${formulaText(bookingRef)}`);
  if (sessionId) checks.push(`{session_id}=${formulaText(sessionId)}`);
  if (!checks.length) return false;
  const table = env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || "SIGIL Booking Requests";
  const rows = await airtableList(env, table, checks.length === 1 ? checks[0] : `OR(${checks.join(",")})`, 1);
  const fields = rows[0]?.fields || {};
  const raw = fields.resolver_payload_json;
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  const snapshot = parsed?.entitlement_snapshot;
  if (!snapshot || snapshot.schema_version !== "my_mmd_entitlement_resolver_v1") return false;
  return !snapshot.member_blocked && String(snapshot.access?.private_visibility_envelope || "none") !== "none";
}

async function requestedScope(request, url) {
  if (clean(url.searchParams.get("scope")).toLowerCase() === "private") return "private";
  if (request.method.toUpperCase() !== "POST") return "public";
  const body = await request.clone().json().catch(() => ({}));
  return clean(body.scope || body.model_scope).toLowerCase() === "private" ? "private" : "public";
}

async function airtableList(env, table, formula, maxRecords) {
  const qs = new URLSearchParams({ maxRecords: String(maxRecords), pageSize: String(Math.min(maxRecords, 100)) });
  if (formula) qs.set("filterByFormula", formula);
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${qs.toString()}`, { headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` } });
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  const data = await response.json();
  return Array.isArray(data.records) ? data.records : [];
}

async function airtablePatch(env, table, recordId, fields) {
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error(`airtable_${response.status}`);
}

function requireAirtable(env) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("airtable_config_missing");
}

function formulaText(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function clean(value) { return String(value ?? "").trim(); }
function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
