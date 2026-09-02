const START_PATHS = new Set(["/member/api/liff/start", "/member/api/liff/start/"]);
const SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const TRACE_TTL_SECONDS = 60 * 60 * 48;
const SHELL_BOUNDARY_COOKIE_TTL_SECONDS = 10 * 60;
const MAX_STEPS = 24;
const SHELL_BOUNDARY_COOKIE = "mmd_liff_boundary";

export function isLiffStartRequest(request) {
  if (!(request instanceof Request) || request.method !== "POST") return false;
  try { return START_PATHS.has(new URL(request.url).pathname); }
  catch { return false; }
}

export function isLiffShellGetRequest(request) {
  if (!(request instanceof Request) || request.method !== "GET") return false;
  try { return SHELL_PATHS.has(new URL(request.url).pathname.toLowerCase()); }
  catch { return false; }
}

export function createLiffShellBoundaryTrace(request, env = {}, ctx = null) {
  if (!isLiffShellGetRequest(request)) return null;
  const url = new URL(request.url);
  const boundaryId = `LIFFGET-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const snapshot = {
    boundary_id: boundaryId,
    observed_at: new Date().toISOString(),
    path: url.pathname,
    hostname: safeHostname(url.hostname),
    ua_class: coarseUaClass(request.headers.get("user-agent")),
    http_status: null,
    shell_current: false,
  };

  console.info({ event: "liff_shell_boundary", stage: "request", ...snapshot });

  const finish = (response) => {
    if (!(response instanceof Response)) return;
    snapshot.http_status = response.status;
    snapshot.shell_current = response.status === 200 && String(response.headers.get("content-type") || "").toLowerCase().includes("text/html");
    console.info({ event: "liff_shell_boundary", stage: "response", ...snapshot });
    const write = persistShellBoundary(env, snapshot);
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(write);
    else void write;
  };

  const attach = (response) => {
    if (!(response instanceof Response)) return response;
    const headers = new Headers(response.headers);
    headers.set("x-mmd-liff-boundary-id", boundaryId);
    headers.set("x-mmd-liff-shell", "current");
    headers.set("x-mmd-liff-ua-class", snapshot.ua_class);
    headers.append("set-cookie", `${SHELL_BOUNDARY_COOKIE}=${boundaryId}; Path=/member; Max-Age=${SHELL_BOUNDARY_COOKIE_TTL_SECONDS}; Secure; HttpOnly; SameSite=Lax`);
    headers.delete("content-length");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };

  return { boundaryId, snapshot, finish, attach };
}

export function createLiffResolutionTrace(request, env = {}, ctx = null) {
  if (!isLiffStartRequest(request)) return null;
  const traceId = `LIFF-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const startedAt = Date.now();
  const shellBoundaryId = shellBoundaryIdFromCookie(request.headers.get("cookie"));
  const snapshot = {
    trace_id: traceId,
    shell_boundary_id: shellBoundaryId || null,
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
    console.info({ event: "liff_resolution_trace", trace_id: traceId, shell_boundary_id: shellBoundaryId || "", ...step });
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

  event("request", "received", "", { shell_boundary_present: Boolean(shellBoundaryId) });
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

export function safeShellBoundaryId(value) {
  const boundaryId = String(value || "").trim().toUpperCase();
  return /^LIFFGET-[A-F0-9]{12}$/.test(boundaryId) ? boundaryId : "";
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

async function persistShellBoundary(env, snapshot) {
  if (!env?.LIFF_IDENTITY_KV?.put) return;
  const serialized = JSON.stringify(snapshot);
  try {
    await Promise.all([
      env.LIFF_IDENTITY_KV.put(`liff_shell_boundary:${snapshot.boundary_id}`, serialized, { expirationTtl: TRACE_TTL_SECONDS }),
      env.LIFF_IDENTITY_KV.put("liff_shell_boundary:latest", serialized, { expirationTtl: TRACE_TTL_SECONDS }),
    ]);
  } catch (error) {
    console.warn({
      event: "liff_shell_boundary_persist_failed",
      boundary_id: snapshot.boundary_id,
      failure_class: safeFailureClass(error),
    });
  }
}

function shellBoundaryIdFromCookie(cookieHeader) {
  const cookie = String(cookieHeader || "");
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName !== SHELL_BOUNDARY_COOKIE) continue;
    return safeShellBoundaryId(rawValue.join("="));
  }
  return "";
}

function coarseUaClass(value) {
  const ua = String(value || "").toLowerCase();
  if (!ua) return "unknown";
  if (ua.includes(" line/") || ua.includes("; line/") || ua.includes("line/")) return "line_in_app";
  if (/iphone|ipad|ipod|android|mobile/.test(ua)) return "mobile_browser";
  return "other";
}

function safeHostname(value) {
  const hostname = String(value || "").trim().toLowerCase();
  return /^[a-z0-9.-]{1,253}$/.test(hostname) ? hostname : "unknown";
}

function safeToken(value, fallback = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80);
  return normalized || fallback;
}

function safeMeta(meta) {
  const source = meta && typeof meta === "object" ? meta : {};
  const result = {};
  for (const key of ["http_status", "candidate", "mapped", "package_code", "source_key", "member_resolved", "pending_identity", "shell_boundary_present"]) {
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
