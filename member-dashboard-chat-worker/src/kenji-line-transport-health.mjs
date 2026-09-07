import { probeKenjiLineIngressTraceStorage } from "./kenji-line-ingress-trace.mjs";

const LINE_WEBHOOK_INFO_URL = "https://api.line.me/v2/bot/channel/webhook/endpoint";
const LINE_WEBHOOK_TEST_URL = "https://api.line.me/v2/bot/channel/webhook/test";
const MEMBER_TRUTH_HEALTH_URL = "https://member-pages-worker.internal/__internal/kenji/member-truth/health";
const MEMBER_TRUTH_HEALTH_SCHEMA = "mmd.kenji_member_truth_health.v1";
const HEALTH_QUERY = "transport_health";
const HEALTH_HEADER = "x-mmd-line-transport-health";
const TIMEOUT_MS = 1800;
const MEMBER_TRUTH_TIMEOUT_MS = 3200;
const CANONICAL_ENDPOINTS = new Set([
  "https://mmdbkk.com/webhooks/line",
  "https://www.mmdbkk.com/webhooks/line",
]);
const SAFE_TEST_REASONS = new Set(["OK", "COULD_NOT_CONNECT", "REQUEST_TIMEOUT", "ERROR_STATUS_CODE", "UNCLASSIFIED"]);
const SAFE_MEMBER_TRUTH_STATUSES = new Set([
  "ready",
  "resolver_config_missing",
  "resolver_auth_rejected",
  "resolver_unavailable",
  "resolver_http_error",
  "resolver_contract_error",
  "member_truth_health_route_missing",
  "member_truth_health_unavailable",
  "member_pages_binding_missing",
]);

function text(value, max = 4096) { return String(value == null ? "" : value).trim().slice(0, max); }
function normalizedEndpoint(value) {
  try {
    const url = new URL(text(value));
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${url.host}${pathname}`.toLowerCase();
  } catch { return ""; }
}
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, private", "x-mmd-route-owner": "kenji-line-transport-health" } });
}
export function isKenjiLineTransportHealthRequest(request) {
  if (!request || String(request.method || "").toUpperCase() !== "GET") return false;
  try {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
    if (path !== "/webhooks/line") return false;
    return text(request.headers.get(HEALTH_HEADER), 20) === "1" || url.searchParams.get(HEALTH_QUERY) === "1";
  } catch { return false; }
}
export function canonicalLineWebhookEndpointMatches(endpoint = "") {
  const value = normalizedEndpoint(endpoint);
  return [...CANONICAL_ENDPOINTS].some((candidate) => normalizedEndpoint(candidate) === value);
}
function safeReason(value) {
  const reason = text(value, 80).toUpperCase();
  return SAFE_TEST_REASONS.has(reason) ? reason : "UNCLASSIFIED";
}
async function lineApiFetch(url, token, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_line_transport_timeout"), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) }, signal: controller.signal });
  } finally { clearTimeout(timer); }
}
async function testSignedWebhookRoundTrip(token) {
  try {
    const response = await lineApiFetch(LINE_WEBHOOK_TEST_URL, token, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (!response.ok) return { attempted: true, success: false, status_code: 0, reason: "UNCLASSIFIED", status: response.status === 401 || response.status === 403 ? "channel_token_rejected" : "webhook_test_api_error" };
    const payload = await response.json().catch(() => ({}));
    const statusCode = Number.isFinite(Number(payload?.statusCode)) ? Number(payload.statusCode) : 0;
    const success = payload?.success === true && statusCode === 200;
    const reason = safeReason(payload?.reason);
    return { attempted: true, success, status_code: statusCode, reason, status: success ? "ready" : statusCode === 401 ? "signature_mismatch_or_webhook_auth_failure" : "webhook_roundtrip_failed" };
  } catch {
    return { attempted: true, success: false, status_code: 0, reason: "UNCLASSIFIED", status: "webhook_test_api_unavailable" };
  }
}
function traceProbeEnv(env = {}) {
  const source = env || {};
  return new Proxy(source, {
    get(target, property) {
      if (property === "KENJI_LINE_INGRESS_TRACE_ENABLED") {
        return text(Reflect.get(target, property, target)) || "true";
      }
      return Reflect.get(target, property, target);
    },
    has(target, property) {
      if (property === "KENJI_LINE_INGRESS_TRACE_ENABLED") return true;
      return Reflect.has(target, property);
    },
  });
}
function traceFields(trace = {}) {
  return {
    ingress_trace_enabled: trace.enabled === true,
    ingress_trace_configured: trace.configured === true,
    ingress_trace_storage_ok: trace.storage_ok === true,
    ingress_trace_storage_status: text(trace.storage_status, 80),
    ingress_trace_storage_http_status: Number(trace.storage_http_status) || 0,
    ingress_trace_cleanup_ok: trace.cleanup_ok === true,
  };
}
function safeMemberTruthStatus(value) {
  const status = text(value, 80);
  return SAFE_MEMBER_TRUTH_STATUSES.has(status) ? status : "member_truth_health_unavailable";
}
async function probeKenjiMemberTruthBridge(env = {}) {
  const binding = env.MEMBER_PAGES_WORKER;
  if (typeof binding?.fetch !== "function") {
    return {
      configured: false,
      ok: false,
      status: "member_pages_binding_missing",
      http_status: 0,
      resolver_binding_present: false,
      resolver_secret_present: false,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_member_truth_bridge_timeout"), MEMBER_TRUTH_TIMEOUT_MS);
  try {
    const response = await binding.fetch(new Request(MEMBER_TRUTH_HEALTH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
      },
      body: "{}",
      signal: controller.signal,
    }));
    const payload = await response.json().catch(() => null);
    const schemaMatches = payload?.schema === MEMBER_TRUTH_HEALTH_SCHEMA;
    if (!schemaMatches) {
      return {
        configured: false,
        ok: false,
        status: response.status === 404 ? "member_truth_health_route_missing" : "member_truth_health_unavailable",
        http_status: Number(response.status) || 0,
        resolver_binding_present: false,
        resolver_secret_present: false,
      };
    }
    return {
      configured: payload?.configured === true,
      ok: response.ok && payload?.ok === true && payload?.status === "ready",
      status: safeMemberTruthStatus(payload?.status),
      http_status: Number(response.status) || 0,
      resolver_binding_present: payload?.resolver_binding_present === true,
      resolver_secret_present: payload?.resolver_secret_present === true,
    };
  } catch (_) {
    return {
      configured: false,
      ok: false,
      status: "member_truth_health_unavailable",
      http_status: 0,
      resolver_binding_present: false,
      resolver_secret_present: false,
    };
  } finally {
    clearTimeout(timer);
  }
}
function memberTruthFields(probe = {}) {
  return {
    member_truth_bridge_configured: probe.configured === true,
    member_truth_bridge_ok: probe.ok === true,
    member_truth_bridge_status: safeMemberTruthStatus(probe.status),
    member_truth_bridge_http_status: Number(probe.http_status) || 0,
    member_truth_resolver_binding_present: probe.resolver_binding_present === true,
    member_truth_resolver_secret_present: probe.resolver_secret_present === true,
  };
}
export async function inspectKenjiLineTransport(env = {}) {
  const secretPresent = Boolean(text(env.LINE_CHANNEL_SECRET));
  const token = text(env.LINE_CHANNEL_ACCESS_TOKEN);
  const tokenPresent = Boolean(token);
  const base = {
    schema: "mmd.kenji_line_transport_health.v4",
    configured: secretPresent && tokenPresent,
    signature_secret_present: secretPresent,
    access_token_present: tokenPresent,
    line_api_reachable: false,
    webhook_active: false,
    endpoint_match: false,
    signed_webhook_test_attempted: false,
    signed_webhook_test_success: false,
    signed_webhook_test_status_code: 0,
    signed_webhook_test_reason: "",
    ingress_trace_enabled: true,
    ingress_trace_configured: Boolean(text(env.AIRTABLE_API_KEY) && text(env.AIRTABLE_BASE_ID)),
    ingress_trace_storage_ok: false,
    ingress_trace_storage_status: "not_attempted",
    ingress_trace_storage_http_status: 0,
    ingress_trace_cleanup_ok: false,
    member_truth_bridge_configured: false,
    member_truth_bridge_ok: false,
    member_truth_bridge_status: "member_pages_binding_missing",
    member_truth_bridge_http_status: 0,
    member_truth_resolver_binding_present: false,
    member_truth_resolver_secret_present: false,
    status: "unavailable",
  };
  if (!tokenPresent) return { ...base, status: "access_token_missing" };
  try {
    const response = await lineApiFetch(LINE_WEBHOOK_INFO_URL, token, { method: "GET" });
    if (!response.ok) return { ...base, line_api_reachable: response.status >= 400 && response.status < 500, status: response.status === 401 || response.status === 403 ? "channel_token_rejected" : "line_api_error" };
    const payload = await response.json().catch(() => ({}));
    const endpointMatch = canonicalLineWebhookEndpointMatches(payload?.endpoint);
    const webhookActive = payload?.active === true;
    const configurationStatus = !secretPresent ? "signature_secret_missing" : !webhookActive ? "webhook_inactive" : !endpointMatch ? "endpoint_mismatch" : "ready";
    if (configurationStatus !== "ready") return { ...base, line_api_reachable: true, webhook_active: webhookActive, endpoint_match: endpointMatch, status: configurationStatus };

    const [signedTest, traceProbe, memberTruthProbe] = await Promise.all([
      testSignedWebhookRoundTrip(token),
      probeKenjiLineIngressTraceStorage(traceProbeEnv(env)),
      probeKenjiMemberTruthBridge(env),
    ]);
    return {
      ...base,
      line_api_reachable: true,
      webhook_active: webhookActive,
      endpoint_match: endpointMatch,
      signed_webhook_test_attempted: signedTest.attempted,
      signed_webhook_test_success: signedTest.success,
      signed_webhook_test_status_code: signedTest.status_code,
      signed_webhook_test_reason: signedTest.reason,
      ...traceFields(traceProbe),
      ...memberTruthFields(memberTruthProbe),
      status: signedTest.status,
    };
  } catch { return { ...base, status: "line_api_unavailable" }; }
}
export async function handleKenjiLineTransportHealth(request, env = {}) {
  if (!isKenjiLineTransportHealthRequest(request)) return null;
  const health = await inspectKenjiLineTransport(env);
  const transportReady = health.status === "ready";
  const traceReady = health.ingress_trace_configured !== true || health.ingress_trace_storage_ok === true;
  const memberTruthReady = health.member_truth_bridge_configured === true && health.member_truth_bridge_ok === true;
  const ready = transportReady && traceReady && memberTruthReady;
  return json({ ok: ready, route: "line_transport_health", ...health }, ready ? 200 : 503);
}
