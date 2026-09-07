const PATH = "/__internal/kenji/member-truth/health";
const SERVICE_HOST = "member-pages-worker.internal";
const ALLOWED_CALLER = "member-dashboard-chat-worker";
const MEMBER_PROFILE_PATH = "/__internal/member-profile/read";
const MEMBER_PROFILE_PURPOSE = "liff_member_profile_read";
const MEMBER_RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";
const SCHEMA = "mmd.kenji_member_truth_health.v1";
const TIMEOUT_MS = 2500;
const SYNTHETIC_LINE_USER_ID = `U${"0".repeat(32)}`;

function text(value) {
  return value == null ? "" : String(value).trim();
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-member-truth-health": SCHEMA,
    },
  });
}

function authorized(request) {
  if (!(request instanceof Request)) return false;
  let url;
  try { url = new URL(request.url); } catch { return false; }
  return (
    request.method === "POST" &&
    url.pathname === PATH &&
    url.hostname === SERVICE_HOST &&
    text(request.headers.get("x-mmd-internal-call")).toLowerCase() === "true" &&
    text(request.headers.get("x-mmd-service-binding")) === ALLOWED_CALLER
  );
}

export function isKenjiLineMemberTruthHealthRequest(request) {
  if (!(request instanceof Request)) return false;
  try {
    return request.method === "POST" && new URL(request.url).pathname === PATH;
  } catch {
    return false;
  }
}

function baseHealth(env = {}) {
  const resolverBindingPresent = typeof env.MEMBER_STATUS_RESOLVER?.fetch === "function";
  const resolverSecretPresent = text(env.MEMBER_STATUS_RESOLVER_SECRET).length >= 32;
  return {
    schema: SCHEMA,
    configured: resolverBindingPresent && resolverSecretPresent,
    resolver_binding_present: resolverBindingPresent,
    resolver_secret_present: resolverSecretPresent,
    upstream_http_status: 0,
  };
}

export async function inspectKenjiLineMemberTruthHealth(env = {}) {
  const base = baseHealth(env);
  if (!base.configured) {
    return { ...base, ok: false, status: "resolver_config_missing" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("kenji_member_truth_health_timeout"), TIMEOUT_MS);
  try {
    const response = await env.MEMBER_STATUS_RESOLVER.fetch(new Request(
      `https://mmd-auth-worker.internal${MEMBER_PROFILE_PATH}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [MEMBER_RESOLVER_SECRET_HEADER]: text(env.MEMBER_STATUS_RESOLVER_SECRET),
        },
        body: JSON.stringify({
          line_user_id: SYNTHETIC_LINE_USER_ID,
          purpose: MEMBER_PROFILE_PURPOSE,
        }),
        signal: controller.signal,
      },
    ));

    const statusCode = Number(response.status) || 0;
    const payload = await response.json().catch(() => null);
    if (statusCode === 404) {
      return { ...base, ok: false, upstream_http_status: statusCode, status: "resolver_auth_rejected" };
    }
    if (statusCode === 503) {
      return { ...base, ok: false, upstream_http_status: statusCode, status: "resolver_unavailable" };
    }
    if (!response.ok) {
      return { ...base, ok: false, upstream_http_status: statusCode, status: "resolver_http_error" };
    }

    const contractHealthy = payload?.ok === true && typeof payload?.data?.member_exists === "boolean";
    return contractHealthy
      ? { ...base, ok: true, upstream_http_status: statusCode, status: "ready" }
      : { ...base, ok: false, upstream_http_status: statusCode, status: "resolver_contract_error" };
  } catch (_) {
    return { ...base, ok: false, upstream_http_status: 0, status: "resolver_unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

export async function handleKenjiLineMemberTruthHealth(request, env = {}) {
  if (!authorized(request)) return json({ ok: false, schema: SCHEMA, status: "not_found" }, 404);
  const health = await inspectKenjiLineMemberTruthHealth(env);
  return json(health, health.ok === true ? 200 : 503);
}

export const KENJI_LINE_MEMBER_TRUTH_HEALTH_PATH = PATH;
