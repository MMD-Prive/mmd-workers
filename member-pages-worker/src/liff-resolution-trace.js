const START_PATHS = new Set(["/member/api/liff/start", "/member/api/liff/start/"]);
const TRACE_TTL_SECONDS = 60 * 60 * 48;
const MAX_STEPS = 24;

export function isLiffStartRequest(request) {
  if (!(request instanceof Request) || request.method !== "POST") return false;
  try { return START_PATHS.has(new URL(request.url).pathname); }
  catch { return false; }
}

export function createLiffResolutionTrace(request, env = {}, ctx = null) {
  if (!isLiffStartRequest(request)) return null;
  const traceId = `LIFF-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const startedAt = Date.now();
  const snapshot = {
    trace_id: traceId,
    started_at: new Date(startedAt).toISOString(),
    finished_at: null,
    duration_ms: null,
    final_status: "running",
    final_reason: "",
    steps: [],
  };

  const event = (stage, status, reason = "", meta = {}) => {
    const step = {
      at_ms: Math.max(0, Date.now() - startedAt),
      stage: safeToken(stage, "unknown_stage"),
      status: safeToken(status, "unknown"),
      reason: safeToken(reason, ""),
      ...safeMeta(meta),
    };
    if (snapshot.steps.length < MAX_STEPS) snapshot.steps.push(step);
    console.info({ event: "liff_resolution_trace", trace_id: traceId, ...step });
    return step;
  };

  const finish = (status, reason = "", meta = {}) => {
    if (snapshot.finished_at) return;
    event("final", status, reason, meta);
    snapshot.finished_at = new Date().toISOString();
    snapshot.duration_ms = Math.max(0, Date.now() - startedAt);
    snapshot.final_status = safeToken(status, "unknown");
    snapshot.final_reason = safeToken(reason, "");
    const write = persistTrace(env, snapshot);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(write);
    else void write;
  };

  event("request", "received");
  return { traceId, event, finish, snapshot };
}

export function attachTraceId(response, traceId) {
  if (!(response instanceof Response) || !safeTraceId(traceId)) return response;
  const headers = new Headers(response.headers);
  headers.set("x-mmd-trace-id", traceId);
  headers.delete("content-length");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function safeTraceId(value) {
  const traceId = String(value || "").trim().toUpperCase();
  return /^LIFF-[A-F0-9]{12}$/.test(traceId) ? traceId : "";
}

async function persistTrace(env, snapshot) {
  if (!env?.LIFF_IDENTITY_KV?.put) return;
  try {
    await env.LIFF_IDENTITY_KV.put(`liff_resolution_trace:${snapshot.trace_id}`, JSON.stringify(snapshot), {
      expirationTtl: TRACE_TTL_SECONDS,
    });
  } catch (error) {
    console.warn({
      event: "liff_resolution_trace_persist_failed",
      trace_id: snapshot.trace_id,
      failure_class: safeFailureClass(error),
    });
  }
}

function safeToken(value, fallback = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80);
  return normalized || fallback;
}

function safeMeta(meta) {
  const source = meta && typeof meta === "object" ? meta : {};
  const result = {};
  for (const key of ["http_status", "candidate", "mapped", "package_code", "source_key", "member_resolved", "pending_identity"]) {
    const value = source[key];
    if (typeof value === "boolean" || Number.isInteger(value)) result[key] = value;
    else if (typeof value === "string") result[key] = safeToken(value);
  }
  return result;
}

function safeFailureClass(error) {
  const name = String(error?.name || "").toLowerCase();
  if (name === "typeerror") return "type_error";
  return "unavailable";
}
