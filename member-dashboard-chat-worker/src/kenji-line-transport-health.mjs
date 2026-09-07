const LINE_WEBHOOK_INFO_URL = "https://api.line.me/v2/bot/channel/webhook/endpoint";
const LINE_WEBHOOK_TEST_URL = "https://api.line.me/v2/bot/channel/webhook/test";
const HEALTH_QUERY = "transport_health";
const HEALTH_HEADER = "x-mmd-line-transport-health";
const TIMEOUT_MS = 1800;
const CANONICAL_ENDPOINTS = new Set([
  "https://mmdbkk.com/webhooks/line",
  "https://www.mmdbkk.com/webhooks/line",
]);
const SAFE_TEST_REASONS = new Set([
  "OK",
  "COULD_NOT_CONNECT",
  "REQUEST_TIMEOUT",
  "ERROR_STATUS_CODE",
  "UNCLASSIFIED",
]);

function text(value, max = 4096) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function normalizedEndpoint(value) {
  try {
    const url = new URL(text(value));
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.protocol}//${url.host}${pathname}`.toLowerCase();
  } catch {
    return "";
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-route-owner": "kenji-line-transport-health",
    },
  });
}

export function isKenjiLineTransportHealthRequest(request) {
  if (!request || String(request.method || "").toUpperCase() !== "GET") return false;
  try {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
    if (path !== "/webhooks/line") return false;
    return text(request.headers.get(HEALTH_HEADER), 20) === "1" || url.searchParams.get(HEALTH_QUERY) === "1";
  } catch {
    return false;
  }
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
    return await fetch(url, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function testSignedWebhookRoundTrip(token) {
  try {
    const response = await lineApiFetch(LINE_WEBHOOK_TEST_URL, token, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      return {
        attempted: true,
        success: false,
        status_code: 0,
        reason: "UNCLASSIFIED",
        status: response.status === 401 || response.status === 403 ? "channel_token_rejected" : "webhook_test_api_error",
      };
    }
    const payload = await response.json().catch(() => ({}));
    const statusCode = Number.isFinite(Number(payload?.statusCode)) ? Number(payload.statusCode) : 0;
    const success = payload?.success === true && statusCode === 200;
    const reason = safeReason(payload?.reason);
    return {
      attempted: true,
      success,
      status_code: statusCode,
      reason,
      status: success
        ? "ready"
        : statusCode === 401
          ? "signature_mismatch_or_webhook_auth_failure"
          : "webhook_roundtrip_failed",
    };
  } catch {
    return {
      attempted: true,
      success: false,
      status_code: 0,
      reason: "UNCLASSIFIED",
      status: "webhook_test_api_unavailable",
    };
  }
}

export async function inspectKenjiLineTransport(env = {}) {
  const secretPresent = Boolean(text(env.LINE_CHANNEL_SECRET));
  const token = text(env.LINE_CHANNEL_ACCESS_TOKEN);
  const tokenPresent = Boolean(token);
  const base = {
    schema: "mmd.kenji_line_transport_health.v2",
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
    status: "unavailable",
  };

  if (!tokenPresent) return { ...base, status: "access_token_missing" };

  try {
    const response = await lineApiFetch(LINE_WEBHOOK_INFO_URL, token, { method: "GET" });
    if (!response.ok) {
      return {
        ...base,
        line_api_reachable: response.status >= 400 && response.status < 500,
        status: response.status === 401 || response.status === 403 ? "channel_token_rejected" : "line_api_error",
      };
    }
    const payload = await response.json().catch(() => ({}));
    const endpointMatch = canonicalLineWebhookEndpointMatches(payload?.endpoint);
    const webhookActive = payload?.active === true;
    const configurationStatus = !secretPresent
      ? "signature_secret_missing"
      : !webhookActive
        ? "webhook_inactive"
        : !endpointMatch
          ? "endpoint_mismatch"
          : "ready";

    if (configurationStatus !== "ready") {
      return {
        ...base,
        line_api_reachable: true,
        webhook_active: webhookActive,
        endpoint_match: endpointMatch,
        status: configurationStatus,
      };
    }

    const signedTest = await testSignedWebhookRoundTrip(token);
    return {
      ...base,
      line_api_reachable: true,
      webhook_active: webhookActive,
      endpoint_match: endpointMatch,
      signed_webhook_test_attempted: signedTest.attempted,
      signed_webhook_test_success: signedTest.success,
      signed_webhook_test_status_code: signedTest.status_code,
      signed_webhook_test_reason: signedTest.reason,
      status: signedTest.status,
    };
  } catch {
    return { ...base, status: "line_api_unavailable" };
  }
}

export async function handleKenjiLineTransportHealth(request, env = {}) {
  if (!isKenjiLineTransportHealthRequest(request)) return null;
  const health = await inspectKenjiLineTransport(env);
  return json({ ok: health.status === "ready", route: "line_transport_health", ...health }, health.status === "ready" ? 200 : 503);
}
