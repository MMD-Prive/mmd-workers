const LINE_WEBHOOK_INFO_URL = "https://api.line.me/v2/bot/channel/webhook/endpoint";
const HEALTH_QUERY = "transport_health";
const HEALTH_HEADER = "x-mmd-line-transport-health";
const TIMEOUT_MS = 1800;
const CANONICAL_ENDPOINTS = new Set([
  "https://mmdbkk.com/webhooks/line",
  "https://www.mmdbkk.com/webhooks/line",
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

export async function inspectKenjiLineTransport(env = {}) {
  const secretPresent = Boolean(text(env.LINE_CHANNEL_SECRET));
  const token = text(env.LINE_CHANNEL_ACCESS_TOKEN);
  const tokenPresent = Boolean(token);
  const base = {
    schema: "mmd.kenji_line_transport_health.v1",
    configured: secretPresent && tokenPresent,
    signature_secret_present: secretPresent,
    access_token_present: tokenPresent,
    line_api_reachable: false,
    webhook_active: false,
    endpoint_match: false,
    status: "unavailable",
  };

  if (!tokenPresent) return { ...base, status: "access_token_missing" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_line_transport_timeout"), TIMEOUT_MS);
  try {
    const response = await fetch(LINE_WEBHOOK_INFO_URL, {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
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
    return {
      ...base,
      line_api_reachable: true,
      webhook_active: webhookActive,
      endpoint_match: endpointMatch,
      status: !secretPresent
        ? "signature_secret_missing"
        : !webhookActive
          ? "webhook_inactive"
          : !endpointMatch
            ? "endpoint_mismatch"
            : "ready",
    };
  } catch {
    return { ...base, status: "line_api_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleKenjiLineTransportHealth(request, env = {}) {
  if (!isKenjiLineTransportHealthRequest(request)) return null;
  const health = await inspectKenjiLineTransport(env);
  return json({ ok: health.status === "ready", route: "line_transport_health", ...health }, health.status === "ready" ? 200 : 503);
}
