import worker, { FollowUpAutopilot } from "./smart-match-bridge.js";

export { FollowUpAutopilot };

const CONTEXT_PATH = "/v1/admin/ai-ops/context";
const CUSTOMER_PATH = "/internal/admin/customer-data";
const CLIENT_INTELLIGENCE_PATH = "/v1/admin/clients/intelligence";

export default {
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    if (!response.ok || !isCustomer360ContextRequest(request)) return response;

    const requestUrl = new URL(request.url);
    const clientId = clean(requestUrl.searchParams.get("client_id"));
    const clientIntel = isRecordId(clientId)
      ? await readCustomerIntelligence(request, clientId)
      : null;

    return decorateCustomer360Context(response, { clientId, clientIntel });
  },
};

export function isCustomer360ContextRequest(request) {
  try {
    const url = new URL(request.url);
    return request.method.toUpperCase() === "GET"
      && normalizePath(url.pathname) === CONTEXT_PATH
      && normalizePath(url.searchParams.get("path") || "") === CUSTOMER_PATH;
  } catch {
    return false;
  }
}

export async function decorateCustomer360Context(response, { clientId = "", clientIntel = null } = {}) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return response;

  const payload = await response.json().catch(() => null);
  if (!payload || payload.ok === false) return response;

  const canonicalClient = isRecordId(clientId) ? clientId : "";
  const oldBrief = Array.isArray(payload.brief) ? payload.brief : [];
  const oldVerified = Array.isArray(payload.verified) ? payload.verified : [];
  const oldAnomalies = Array.isArray(payload.anomalies) ? payload.anomalies : [];
  const oldSources = Array.isArray(payload.sources) ? payload.sources : [];
  const intelOk = Boolean(clientIntel?.ok && clientIntel?.data);

  payload.page = {
    ...(payload.page || {}),
    path: CUSTOMER_PATH,
    surface: "customer_360",
    canonical: true,
    status: "live_v1",
  };

  payload.brief = dedupe([
    "Customer 360 · LIVE: ใช้ backfill/queue/identity review จริงภายใต้ credential-bound admin gate และอ่าน downstream customer context แบบ read-only หลัง resolve Canonical Client",
    ...oldBrief.filter((item) => !/HOLD surface|runtime ยัง incomplete|Customer Index \/ Create Job lookup/i.test(String(item || ""))),
  ]);

  payload.verified = dedupe([
    ...oldVerified,
    "Customer Data backfill, queue and reviewed identity actions are live on the canonical Customer 360 route.",
    ...(intelOk ? ["Canonical Client Intelligence responded for the selected Client."] : []),
  ]);

  payload.anomalies = oldAnomalies.filter((item) => item?.code !== "surface_hold");
  if (canonicalClient && clientIntel && !intelOk) {
    payload.anomalies.push({
      code: "client_intelligence_unavailable",
      level: "info",
      text: `Client Intelligence read unavailable · HTTP ${Number(clientIntel.status || 0) || 0}`,
    });
  }

  const clientQuery = canonicalClient ? `?client_id=${encodeURIComponent(canonicalClient)}` : "";
  payload.next_actions = [
    action(1, "customer_360", canonicalClient ? "เปิด Customer 360 ของ Client นี้" : "Resolve Canonical Client", `${CUSTOMER_PATH}${clientQuery}`),
    action(2, "create_job", "Create Job", `/internal/admin/jobs/create-job${clientQuery}`),
    action(3, "member_intelligence", "Member Intelligence", `/internal/admin/member-intelligence${clientQuery}`),
  ];

  payload.sources = dedupeSources([
    ...oldSources,
    ...(clientIntel ? [{ route: CLIENT_INTELLIGENCE_PATH, ok: intelOk, status: Number(clientIntel.status || 0) }] : []),
  ]);

  payload.customer_360 = {
    status: "live_v1",
    canonical_route: CUSTOMER_PATH,
    mode: "operator_identity_and_context",
    identity_runtime: {
      backfill_start: "/v1/admin/customer-data/backfill/start",
      backfill_continue: "/v1/admin/customer-data/backfill/continue",
      queue: "/v1/admin/customer-data/queue",
      reviewed_actions: "/v1/admin/customer-data/queue/:record_id/action",
      status: "live",
    },
    client_intelligence: {
      endpoint: CLIENT_INTELLIGENCE_PATH,
      status: canonicalClient ? (intelOk ? "live" : "unavailable") : "waiting_for_canonical_client",
      read_only: true,
    },
    authority: {
      identity: "canonical_client_reviewed_match",
      payment: "payments-worker",
      membership_access: "my_mmd_entitlement_resolver_v1",
      ai: "advisory_only",
    },
    browser_boundaries: {
      grants_membership: false,
      grants_points: false,
      changes_payment_truth: false,
      widens_access: false,
      exposes_raw_private_notes: false,
    },
  };

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-customer-360", "live-v1");
  return new Response(JSON.stringify(payload), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function readCustomerIntelligence(request, clientId) {
  const source = new URL(request.url);
  const target = new URL(CLIENT_INTELLIGENCE_PATH, `${source.protocol}//${source.host}`);
  target.searchParams.set("client_id", clientId);
  const headers = new Headers({ accept: "application/json" });
  for (const key of ["cookie", "origin", "user-agent"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  try {
    const response = await fetch(target.toString(), { method: "GET", headers, redirect: "manual" });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { ok: response.ok && data !== null, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function action(priority, actionName, label, href) {
  return { priority, action: actionName, label, href };
}

function dedupe(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

function dedupeSources(items) {
  const map = new Map();
  for (const item of items) {
    const route = String(item?.route || "").trim();
    if (!route) continue;
    map.set(route, { route, ok: Boolean(item?.ok), status: Number(item?.status || 0) });
  }
  return [...map.values()];
}

function isRecordId(value) {
  return /^rec[\w]+$/.test(clean(value));
}

function clean(value) {
  return String(value || "").trim().slice(0, 180);
}

function normalizePath(value = "") {
  const text = String(value || "").split("?")[0].split("#")[0].replace(/\/{2,}/g, "/");
  if (!text) return "/";
  const path = text.startsWith("/") ? text : `/${text}`;
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
