const DEFAULT_API_HOST = "https://us.i.posthog.com";
const DEFAULT_TIMEOUT_MS = 2500;

const SAFE_PROPERTY_KEYS = new Set([
  "surface",
  "world",
  "flow",
  "route",
  "payment_stage",
  "package_code",
  "status",
  "amount_thb",
  "currency",
  "materialized",
  "duplicate",
  "verification",
  "decision",
  "terms_version",
  "lane",
  "job_class",
  "access_scope",
  "member_status",
  "shop",
  "stock_confirmation_required",
  "storage_status",
  "sync_status",
]);

function clean(value, max = 160) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function safePrimitive(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return clean(value);
  return undefined;
}

function safeProperties(input = {}) {
  const out = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!SAFE_PROPERTY_KEYS.has(key)) continue;
    const safe = safePrimitive(value);
    if (safe !== undefined && safe !== "") out[key] = safe;
  }
  return out;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function analyticsEnabled(env = {}) {
  return !["1", "true", "yes", "on"].includes(clean(env.POSTHOG_AUTHORITY_DISABLED, 16).toLowerCase());
}

function apiHost(env = {}) {
  return clean(env.POSTHOG_API_HOST || DEFAULT_API_HOST, 300).replace(/\/+$/, "");
}

function projectToken(env = {}) {
  return clean(env.POSTHOG_PROJECT_TOKEN, 300);
}

export function posthogAuthorityReady(env = {}) {
  return analyticsEnabled(env) && Boolean(projectToken(env));
}

export async function captureAuthorityEvent(env = {}, input = {}) {
  if (!analyticsEnabled(env)) return { ok: true, skipped: true, reason: "disabled" };

  const event = clean(input.event, 120);
  const authority = clean(input.authority, 80);
  const scope = clean(input.scope || authority || "authority", 60).replace(/[^a-zA-Z0-9_-]/g, "_");
  const distinctValue = clean(input.distinctValue, 500);
  const insertValue = clean(input.insertValue || distinctValue, 500);
  const token = projectToken(env);

  if (!event || !/^[a-zA-Z0-9_ -]+$/.test(event)) {
    return { ok: false, skipped: true, reason: "invalid_event" };
  }
  if (!authority || !distinctValue) {
    return { ok: false, skipped: true, reason: "missing_required_context" };
  }
  if (!token) {
    return { ok: false, skipped: true, reason: "project_token_missing" };
  }

  try {
    const [distinctHash, insertHash] = await Promise.all([
      sha256Hex(`${scope}:${distinctValue}`),
      sha256Hex(`${event}:${insertValue}`),
    ]);
    const properties = {
      ...safeProperties(input.properties),
      authority,
      source: "server",
      schema: "mmd_authority_v1",
      $process_person_profile: false,
      $insert_id: `mmd_authority_${insertHash.slice(0, 40)}`,
    };

    const controller = new AbortController();
    const timeoutMs = Math.max(250, Math.min(10000, Number(env.POSTHOG_AUTHORITY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)));
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${apiHost(env)}/i/v0/e/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          api_key: token,
          event,
          distinct_id: `mmd_${scope}_${distinctHash.slice(0, 32)}`,
          properties,
          timestamp: new Date().toISOString(),
        }),
      });
      return { ok: response.ok, status: response.status };
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    return {
      ok: false,
      error: clean(error?.name === "AbortError" ? "posthog_timeout" : error?.message || error || "posthog_capture_failed", 180),
    };
  }
}

export function authorityRuntimeHealth(env = {}, authority = "", ctx = null) {
  const configured = posthogAuthorityReady(env);
  const safeAuthority = clean(authority, 80) || "unknown-worker";
  if (configured) {
    const day = new Date().toISOString().slice(0, 10);
    queueAuthorityEvent(ctx, env, {
      event: "analytics_runtime_health",
      authority: safeAuthority,
      scope: "analytics_health",
      distinctValue: safeAuthority,
      insertValue: `${safeAuthority}:${day}`,
      properties: {
        surface: "system",
        world: "ops",
        status: "configured",
      },
    });
  }
  return {
    posthog_authority: configured ? "configured" : "missing",
    schema: "mmd_authority_v1",
  };
}

export function queueAuthorityEvent(ctx, env = {}, input = {}) {
  const task = captureAuthorityEvent(env, input)
    .then((result) => {
      if (!result.ok && !result.skipped) {
        console.warn(JSON.stringify({
          event: "posthog_authority_capture_failed",
          authority: clean(input.authority, 80),
          analytics_event: clean(input.event, 120),
          status: result.status || null,
          error: result.error || null,
        }));
      }
      return result;
    })
    .catch(() => ({ ok: false, error: "posthog_capture_failed" }));

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(task);
    return;
  }

  void task;
}
