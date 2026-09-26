const TARGETS = Object.freeze([
  Object.freeze({ key: "payments-worker", url: "https://sigil.mmdbkk.com/v1/pay/slip/evidence/health" }),
  Object.freeze({ key: "member-pages-worker", url: "https://member-pages-worker.malemodel-bkk.workers.dev/health" }),
  Object.freeze({ key: "mms-worker", url: "https://mms-worker.malemodel-bkk.workers.dev/health" }),
  Object.freeze({ key: "himai-chat-worker", url: "https://www.mmdbkk.com/mmd-shop/api/health" }),
  Object.freeze({ key: "partners-worker", url: "https://partners-worker.malemodel-bkk.workers.dev/health" }),
  Object.freeze({ key: "sigil-booking-worker", url: "https://sigil-booking-worker.malemodel-bkk.workers.dev/health" }),
]);

const WEBSITE = "https://www.mmdbkk.com/";
const TIMEOUT_MS = 4500;

function clean(value, max = 180) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

async function safeFetch(url, init = {}) {
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept: "application/json",
        "user-agent": "mmd-control-room-v2-live-health/1",
        ...(init.headers || {}),
      },
    });
    return response;
  } catch (error) {
    return { ok: false, status: 0, error: clean(error?.message || error || "fetch_failed") };
  }
}

async function probeWebsite() {
  const response = await safeFetch(WEBSITE, { method: "HEAD" });
  return {
    ok: response?.ok === true,
    status: Number(response?.status || 0),
  };
}

async function probeAuthority(target) {
  const response = await safeFetch(target.url, {
    method: "GET",
    headers: { origin: "https://www.mmdbkk.com" },
  });
  if (response?.ok !== true || typeof response?.json !== "function") {
    return {
      key: target.key,
      ok: false,
      status: Number(response?.status || 0),
      analytics: "unknown",
      reason: clean(response?.error || ("http_" + (response?.status || 0))),
    };
  }
  const payload = await response.json().catch(() => null);
  const analytics = clean(payload?.analytics?.posthog_authority, 32) || "unknown";
  return {
    key: target.key,
    ok: payload?.ok === true && response.ok,
    status: response.status,
    analytics,
    schema: clean(payload?.analytics?.schema, 80) || null,
  };
}

function versionMetadata(env = {}) {
  const meta = env.CF_VERSION_METADATA;
  if (!meta || typeof meta !== "object") return null;
  return {
    id: clean(meta.id, 100) || null,
    tag: clean(meta.tag, 120) || null,
    timestamp: clean(meta.timestamp, 100) || null,
  };
}

export async function readControlRoomV2LiveHealth(env = {}) {
  const checkedAt = new Date().toISOString();
  const [website, ...workers] = await Promise.all([
    probeWebsite(),
    ...TARGETS.map(probeAuthority),
  ]);
  const healthyWorkers = workers.filter((item) => item.ok === true).length;
  const configuredAnalytics = workers.filter((item) => item.analytics === "configured").length;

  return {
    schema: "mmd.control_room_v2.live_health.v1",
    checked_at: checkedAt,
    complete: website.ok === true && healthyWorkers === TARGETS.length,
    website,
    workers: {
      total: TARGETS.length,
      healthy: healthyWorkers,
      items: workers,
    },
    analytics: {
      total: TARGETS.length,
      configured: configuredAnalytics,
      all_configured: configuredAnalytics === TARGETS.length,
    },
    release: {
      admin_worker: versionMetadata(env),
    },
    read_only: true,
    transaction_mutation: false,
  };
}

export const CONTROL_ROOM_V2_LIVE_HEALTH_TARGETS = TARGETS;
