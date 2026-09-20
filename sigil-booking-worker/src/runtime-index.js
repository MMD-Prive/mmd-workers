import entitlementRuntime from "./entitlement-runtime-worker.js";
import modelImagePolicyWorker from "./model-image-policy-worker.js";
import { attachCareBackApprovalToConfirmedBooking } from "./care-back-trusted-caller.js";
import { resolveModelSalesOfferFromAirtable } from "../../shared/model-sales-airtable.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENT_RESOLVE_PATH = "/sigil/api/client/resolve";
const BOOKING_INTAKE_PATH = "/sigil/api/booking/intake";
const BOOKING_CONFIRM_PATH = "/__internal/booking/confirm";
const MODEL_SEARCH_PATH = "/sigil/api/models/search";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method === "POST" && path === BOOKING_CONFIRM_PATH) {
      const approvalRequest = request.clone();
      const response = await entitlementRuntime.fetch(request, env, ctx);
      return attachCareBackApprovalToConfirmedBooking(approvalRequest, env, response);
    }

    if (method === "POST" && [CLIENT_RESOLVE_PATH, BOOKING_INTAKE_PATH].includes(path)) {
      return entitlementRuntime.fetch(request, env, ctx);
    }

    if ((method === "GET" || method === "POST") && path === MODEL_SEARCH_PATH) {
      const scope = await requestedScope(request, url);
      const bookingContext = await storedBookingSalesContext(env, request, url).catch(() => null);
      if (scope === "private" && bookingContext?.private_allowed !== true) {
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
      const response = await modelImagePolicyWorker.fetch(request, env, ctx);
      return applyModelSalesPolicyToSearchResponse(response, env, request, url, bookingContext);
    }

    return modelImagePolicyWorker.fetch(request, env, ctx);
  },
};

async function storedBookingSalesContext(env, request, url) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return null;
  let body = {};
  if (request.method.toUpperCase() === "POST") body = await request.clone().json().catch(() => ({}));
  const bookingRef = clean(url.searchParams.get("booking_ref") || body.booking_ref || body.request_id);
  const sessionId = clean(url.searchParams.get("session_id") || body.session_id);
  const checks = [];
  if (bookingRef) checks.push(`{booking_ref}=${formulaText(bookingRef)}`);
  if (sessionId) checks.push(`{session_id}=${formulaText(sessionId)}`);
  if (!checks.length) return { entitlement_snapshot: {}, private_allowed: false, client_id: "" };

  const table = env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID || "SIGIL Booking Requests";
  const qs = new URLSearchParams({ maxRecords: "1", pageSize: "1", filterByFormula: checks.length === 1 ? checks[0] : `OR(${checks.join(",")})` });
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  if (!response.ok) throw new Error("booking_context_unavailable");
  const data = await response.json().catch(() => ({}));
  const fields = data.records?.[0]?.fields || {};

  let snapshot = null;
  let privateAllowed = false;
  if (fields.honor_after_expiry === true && fields.entitlement_valid_at_confirm === true && fields.payment_verified_at_confirm === true) {
    const locked = parseJson(fields.entitlement_snapshot_at_confirm);
    if (locked?.entitlement_snapshot?.schema_version === "my_mmd_entitlement_resolver_v1") {
      snapshot = locked.entitlement_snapshot;
      privateAllowed = locked?.booking_access?.private_booking === true && snapshot.member_blocked !== true;
    }
  }
  if (!snapshot) {
    const parsed = parseJson(fields.resolver_payload_json);
    if (parsed?.entitlement_snapshot?.schema_version === "my_mmd_entitlement_resolver_v1") {
      snapshot = parsed.entitlement_snapshot;
      privateAllowed = !snapshot.member_blocked && String(snapshot.access?.private_visibility_envelope || "none") !== "none";
    }
  }
  const clientLink = Array.isArray(fields["Canonical Client"]) ? fields["Canonical Client"][0] : "";
  return {
    entitlement_snapshot: snapshot || {},
    private_allowed: privateAllowed,
    client_id: clean(fields.client_id || fields.client_record_id || clientLink),
  };
}

async function canonicalStoredPrivateAccess(env, request, url) {
  const context = await storedBookingSalesContext(env, request, url);
  return context?.private_allowed === true;
}

export async function applyModelSalesPolicyToSearchResponse(response, env, request, url, bookingContext, options = {}) {
  if (!response?.ok) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload || payload.ok !== true) return response;

  let body = {};
  if (request.method.toUpperCase() === "POST") body = await request.clone().json().catch(() => ({}));
  const requestedAt = clean(url.searchParams.get("requested_at") || body.requested_at) || new Date().toISOString();
  const workLane = clean(url.searchParams.get("work_lane") || body.work_lane || body.offer_type);
  const context = bookingContext || { entitlement_snapshot: {}, client_id: "" };
  const sourceModels = Array.isArray(payload.items)
    ? payload.items
    : (payload.model && typeof payload.model === "object" ? [payload.model] : []);
  if (!sourceModels.length) return response;

  const allowed = [];
  for (const model of sourceModels) {
    const sales = await resolveModelSalesOfferFromAirtable(env, {
      model_id: clean(model.model_id || model.model_record_id),
      model_key: clean(model.model_key || model.unique_key || model.working_name),
      client_id: clean(context.client_id),
      requested_at: requestedAt,
      work_lane: workLane,
      entitlement_snapshot: context.entitlement_snapshot || {},
    }, { fetchImpl: options.fetchImpl || fetch });
    if (sales.configured_rule_count > 0 && sales.sellable !== true) continue;
    allowed.push({
      ...model,
      sales_offer: sales.configured_rule_count > 0 ? {
        policy_version: sales.policy_version,
        sellable: sales.sellable === true,
        customer_rate_thb: sales.customer_rate_thb,
        price_visible: sales.price_visible === true,
        term_summary: sales.term_summary || "",
        requires_per_approval: sales.requires_per_approval === true,
        matched_rule_key: sales.matched_rule_key || null,
        rule_version: sales.rule_version,
      } : {
        policy_version: sales.policy_version,
        sellable: null,
        customer_rate_thb: null,
        price_visible: false,
        term_summary: "",
        requires_per_approval: true,
        matched_rule_key: null,
        rule_version: null,
        state: "not_configured",
      },
    });
  }

  const next = {
    ...payload,
    items: allowed.slice(0, 8),
    model: allowed[0] || null,
    matched: allowed.length > 0,
    sales_policy_version: "model_sales_control_v1_20260921",
  };
  if (!allowed.length && sourceModels.length) {
    next.blocked = true;
    next.reason = "model_sales_control_no_eligible_rule";
  }
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(next), { status: response.status, headers });
}

async function requestedScope(request, url) {
  if (clean(url.searchParams.get("scope")).toLowerCase() === "private") return "private";
  if (request.method.toUpperCase() !== "POST") return "public";
  const body = await request.clone().json().catch(() => ({}));
  return clean(body.scope || body.model_scope).toLowerCase() === "private" ? "private" : "public";
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch { return null; }
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
