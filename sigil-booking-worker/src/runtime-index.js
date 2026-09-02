import entitlementRuntime from "./entitlement-runtime-worker.js";
import modelImagePolicyWorker from "./model-image-policy-worker.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENT_RESOLVE_PATH = "/sigil/api/client/resolve";
const MODEL_SEARCH_PATH = "/sigil/api/models/search";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method === "POST" && path === CLIENT_RESOLVE_PATH) {
      return entitlementRuntime.fetch(request, env, ctx);
    }

    if ((method === "GET" || method === "POST") && path === MODEL_SEARCH_PATH) {
      const scope = await requestedScope(request, url);
      if (scope === "private") {
        const allowed = await canonicalStoredPrivateAccess(env, request, url).catch(() => false);
        if (!allowed) {
          return json({
            ok: true,
            matched: false,
            blocked: true,
            reason: "private_requires_entitlement_snapshot",
            access_scope: "public_only",
            member_status: "unknown",
            items: [],
          });
        }
      }
      return modelImagePolicyWorker.fetch(request, env, ctx);
    }

    return modelImagePolicyWorker.fetch(request, env, ctx);
  },
};

async function canonicalStoredPrivateAccess(env, request, url) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return false;
  let body = {};
  if (request.method.toUpperCase() === "POST") body = await request.clone().json().catch(() => ({}));
  const bookingRef = clean(url.searchParams.get("booking_ref") || body.booking_ref || body.request_id);
  const sessionId = clean(url.searchParams.get("session_id") || body.session_id);
  const checks = [];
  if (bookingRef) checks.push(`{booking_ref}=${formulaText(bookingRef)}`);
  if (sessionId) checks.push(`{session_id}=${formulaText(sessionId)}`);
  if (!checks.length) return false;

  const table = env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || "SIGIL Booking Requests";
  const qs = new URLSearchParams({ maxRecords: "1", pageSize: "1", filterByFormula: checks.length === 1 ? checks[0] : `OR(${checks.join(",")})` });
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  if (!response.ok) return false;
  const data = await response.json().catch(() => ({}));
  const fields = data.records?.[0]?.fields || {};
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

function formulaText(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
function clean(value) { return String(value ?? "").trim(); }
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
