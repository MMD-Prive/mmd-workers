import {
  availabilityAdoptionCounts,
  availabilityAdoptionRow,
  boundedConsoleAvailabilityBody,
  matchConsoleAvailabilityReminderPath,
  matchConsoleAvailabilitySnapshotPath,
  modelAvailabilityAdoptionIdentity,
  resolveConsoleAvailabilityTarget,
} from "./sigil-availability-producer.mjs";

const VERSION = "model-console-v1.1";
const CONTRACT_VERSION = "mmd.model-console.v1.1";

const WORKERS = {
  admin: "ADMIN_WORKER_BASE_URL",
  applications: "APPLICATIONS_WORKER_BASE_URL",
  jobs: "JOBS_WORKER_BASE_URL",
  payments: "PAYMENTS_WORKER_BASE_URL",
  events: "EVENTS_WORKER_BASE_URL",
  telegram: "TELEGRAM_WORKER_BASE_URL",
  line: "LINE_WORKER_BASE_URL",
  realtime: "REALTIME_WORKER_BASE_URL",
};

const MODEL_ADAPTERS = {
  availability: { worker: "admin", path: id => `/v1/admin/models/${enc(id)}/availability` },
  jobs: { worker: "jobs", path: id => `/v1/admin/models/${enc(id)}/jobs` },
  payments: { worker: "payments", path: id => `/v1/admin/models/${enc(id)}/payments` },
  access: { worker: "admin", path: id => `/v1/admin/models/${enc(id)}/access` },
  alerts: { worker: "events", path: id => `/v1/admin/models/${enc(id)}/alerts` },
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = normalizePath(url.pathname);
    const method = req.method.toUpperCase();
    if (method === "OPTIONS") return preflight(req, env);

    try {
      if (method === "GET" && path === "/ping") {
        return out(req, env, { ok: true, worker: "model-console-worker", version: VERSION, contract_version: CONTRACT_VERSION, ts: Date.now() });
      }

      const session = await requireOperatorSession(req, env);
      if (!session.ok) return out(req, env, { ok: false, error: session.error }, session.status);
      const ctx = { actor: session.actor, request_id: req.headers.get("CF-Ray") || crypto.randomUUID() };

      if (method === "GET" && path === "/v1/console/session") {
        return out(req, env, { ok: true, operator: session.actor, expires_at: session.expires_at || null });
      }
      if (method === "GET" && path === "/v1/console/workers") {
        return out(req, env, { ok: true, workers: workerRegistry(env) });
      }
      if (method === "GET" && path === "/v1/console/workers/health") {
        const checks = await Promise.all(Object.entries(WORKERS).map(([name, key]) => health(name, env[key], env)));
        return out(req, env, { ok: true, contract_version: CONTRACT_VERSION, checks });
      }
      if (method === "GET" && path === "/v1/console/models") {
        return forward(req, env, "admin", `/v1/admin/models/list${url.search}`, { method: "GET" }, ctx);
      }

      if (method === "GET" && path === "/v1/console/availability/coverage") {
        return availabilityCoverage(req, env, url, ctx);
      }

      const modelRoute = matchModelRoute(path);
      if (modelRoute && method === "GET") {
        if (!modelRoute.section) return model360(req, env, modelRoute.id, ctx);
        const adapter = MODEL_ADAPTERS[modelRoute.section];
        return forward(req, env, adapter.worker, adapter.path(modelRoute.id), { method: "GET" }, ctx);
      }

      if (method === "POST" && path === "/v1/console/models/upsert") {
        const body = await readJson(req);
        const response = await callWorker(env.ADMIN_WORKER_BASE_URL, "/v1/admin/models/upsert", env, { method: "POST", body }, ctx);
        await permanentAudit(env, ctx, "model.upsert", body?.id || body?.unique_key || null, response);
        return out(req, env, response.data, response.status);
      }

      const availabilityReminderTargetId = matchConsoleAvailabilityReminderPath(path);
      if (method === "POST" && availabilityReminderTargetId) {
        const identity = await callWorker(
          env.ADMIN_WORKER_BASE_URL,
          `/v1/admin/models/list?q=${enc(availabilityReminderTargetId)}&limit=20`,
          env,
          { method: "GET" },
          ctx,
        );
        if (!identity.ok) return out(req, env, identity.data, identity.status);

        const target = resolveConsoleAvailabilityTarget(identity.data, availabilityReminderTargetId);
        if (!target.ok) return out(req, env, { ok: false, error: target.error }, target.status);

        const response = await callAvailabilityAdoptionReminder(env, target.model_key, ctx);
        await permanentAudit(env, ctx, "model.availability_adoption_reminder", target.model_key, response);
        return out(req, env, response.data, response.status);
      }

      const availabilityTargetId = matchConsoleAvailabilitySnapshotPath(path);
      if (method === "GET" && availabilityTargetId) {
        const identity = await callWorker(
          env.ADMIN_WORKER_BASE_URL,
          `/v1/admin/models/list?q=${enc(availabilityTargetId)}&limit=20`,
          env,
          { method: "GET" },
          ctx,
        );
        if (!identity.ok) return out(req, env, identity.data, identity.status);

        const target = resolveConsoleAvailabilityTarget(identity.data, availabilityTargetId);
        if (!target.ok) return out(req, env, { ok: false, error: target.error }, target.status);

        const response = await callAvailabilitySnapshotRead(env, target.model_key, ctx);
        return out(req, env, response.data, response.status);
      }

      if (method === "POST" && availabilityTargetId) {
        const body = await readJson(req);
        const identity = await callWorker(
          env.ADMIN_WORKER_BASE_URL,
          `/v1/admin/models/list?q=${enc(availabilityTargetId)}&limit=20`,
          env,
          { method: "GET" },
          ctx,
        );
        if (!identity.ok) return out(req, env, identity.data, identity.status);

        const target = resolveConsoleAvailabilityTarget(identity.data, availabilityTargetId);
        if (!target.ok) return out(req, env, { ok: false, error: target.error }, target.status);

        const safeBody = boundedConsoleAvailabilityBody(body, target.model_key);
        const response = await callAvailabilityProducer(env, safeBody, ctx);
        await permanentAudit(env, ctx, "model.availability_snapshot", target.model_key, response);
        return out(req, env, response.data, response.status);
      }

      if (["GET", "POST", "DELETE"].includes(method) && path === "/v1/console/memory") {
        return handleWorkingMemory(req, env, url, method, ctx);
      }

      if (method === "POST" && path === "/v1/console/telegram/dm") {
        const body = await readJson(req);
        const response = await callWorker(env.ADMIN_WORKER_BASE_URL, "/v1/admin/telegram/dm", env, { method: "POST", body }, ctx);
        await permanentAudit(env, ctx, "telegram.dm", body?.chat_id || body?.telegram_id || null, response);
        return out(req, env, response.data, response.status);
      }

      if (path === "/v1/console/proxy") {
        return out(req, env, { ok: false, error: "generic_proxy_disabled", replacement: "Use typed Model Console V1.1 adapters." }, 410);
      }
      return out(req, env, { ok: false, error: "not_found" }, 404);
    } catch (error) {
      console.error("model-console", error);
      return out(req, env, { ok: false, error: "internal_error" }, 500);
    }
  },
};

async function model360(req, env, id, ctx) {
  const identity = await callWorker(env.ADMIN_WORKER_BASE_URL, `/v1/admin/models/list?q=${enc(id)}`, env, { method: "GET" }, ctx);
  if (!identity.ok) return out(req, env, identity.data, identity.status);
  const sections = await Promise.all(Object.entries(MODEL_ADAPTERS).map(async ([name, adapter]) => {
    const result = await callWorker(env[WORKERS[adapter.worker]], adapter.path(id), env, { method: "GET" }, ctx);
    return [name, result.ok ? { state: "ready", data: result.data } : { state: result.status === 503 ? "not_configured" : "unavailable", status: result.status }];
  }));
  return out(req, env, {
    ok: true,
    schema: "mmd.model-360.v1",
    authority: "downstream_workers_and_airtable",
    model_id: id,
    identity: identity.data,
    sections: Object.fromEntries(sections),
    generated_at: new Date().toISOString(),
  });
}

async function requireOperatorSession(req, env) {
  const cookie = req.headers.get("Cookie") || "";
  if (!cookie) return { ok: false, status: 401, error: "admin_session_required" };
  const base = env.SESSION_VALIDATOR_BASE_URL || "https://mmdbkk.com";
  if (!base) return { ok: false, status: 503, error: "session_validator_not_configured" };
  try {
    const response = await fetch(`${trim(base)}${env.SESSION_VALIDATOR_PATH || "/v1/admin/auth/me"}`, {
      method: "GET",
      headers: { Cookie: cookie, Accept: "application/json", "X-MMD-Console": CONTRACT_VERSION },
      redirect: "manual",
    });
    if (!response.ok) return { ok: false, status: 401, error: "invalid_admin_session" };
    const data = await response.json().catch(() => ({}));
    if (data.ok === false || !(data.operator || data.user || data.session || data.authenticated)) return { ok: false, status: 401, error: "invalid_admin_session" };
    const who = data.operator || data.user || data.session || {};
    return { ok: true, actor: String(who.id || who.email || who.name || "admin"), expires_at: who.expires_at || data.expires_at };
  } catch {
    return { ok: false, status: 503, error: "session_validator_unreachable" };
  }
}

async function health(name, baseUrl, env) {
  const base = { name, configured: Boolean(baseUrl), reachable: false, contract_version: null, auth_valid: null, dependency_healthy: null, last_successful_event: null, deployment_version: null, state: "blocked" };
  if (!baseUrl) return base;
  const started = Date.now();
  try {
    const response = await fetch(`${trim(baseUrl)}/ping`, { headers: internalHeaders(env, { actor: "health", request_id: crypto.randomUUID() }) });
    const data = await response.json().catch(() => ({}));
    const reachable = response.status < 500;
    const authValid = ![401, 403].includes(response.status);
    const dependencyHealthy = data.dependency_healthy ?? data.dependencies?.healthy ?? response.ok;
    return {
      ...base, reachable, auth_valid: authValid, dependency_healthy: Boolean(dependencyHealthy),
      contract_version: data.contract_version || data.contract || null,
      last_successful_event: data.last_successful_event || data.last_event_at || null,
      deployment_version: data.deployment_version || data.version || null,
      status: response.status, latency_ms: Date.now() - started,
      state: response.ok && dependencyHealthy ? "healthy" : reachable && authValid ? "degraded" : "blocked",
    };
  } catch (error) {
    return { ...base, latency_ms: Date.now() - started, error: String(error?.message || error) };
  }
}

async function forward(req, env, worker, path, options, ctx) {
  const response = await callWorker(env[WORKERS[worker]], path, env, options, ctx);
  return out(req, env, response.data, response.status);
}

async function callWorker(baseUrl, path, env, options = {}, ctx = {}) {
  if (!baseUrl) return { ok: false, status: 503, data: { ok: false, error: "worker_not_configured" } };
  const headers = internalHeaders(env, ctx);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${trim(baseUrl)}${path}`, { method: options.method || "GET", headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : { ok: response.ok }; } catch { data = { ok: response.ok, error: "invalid_downstream_response" }; }
  return { ok: response.ok, status: response.status, data };
}

async function callAvailabilityProducer(env, body, ctx = {}) {
  const baseUrl = env.ADMIN_WORKER_BASE_URL;
  const token = String(env.INTERNAL_TOKEN || "").trim();
  if (!baseUrl || !token) {
    return { ok: false, status: 503, data: { ok: false, error: "availability_producer_not_configured" } };
  }
  const response = await fetch(`${trim(baseUrl)}/v1/internal/sigil/availability-snapshot`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "X-MMD-Internal-Call": "true",
      "X-MMD-Service-Binding": "model-console-worker",
      "X-MMD-Operator": ctx.actor || "model-console",
      "X-Request-ID": ctx.request_id || crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : { ok: response.ok }; } catch { data = { ok: false, error: "invalid_availability_producer_response" }; }
  return { ok: response.ok && data?.ok !== false, status: response.status, data };
}

async function callAvailabilityAdoptionReminder(env, modelKey, ctx = {}) {
  const baseUrl = env.ADMIN_WORKER_BASE_URL;
  const token = String(env.INTERNAL_TOKEN || "").trim();
  if (!baseUrl || !token) {
    return { ok: false, status: 503, data: { ok: false, error: "availability_reminder_not_configured" } };
  }
  const response = await fetch(`${trim(baseUrl)}/v1/internal/sigil/availability-adoption/remind`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "X-MMD-Internal-Call": "true",
      "X-MMD-Service-Binding": "model-console-worker",
      "X-MMD-Operator": ctx.actor || "model-console",
      "X-Request-ID": ctx.request_id || crypto.randomUUID(),
    },
    body: JSON.stringify({ model_key: modelKey }),
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : { ok: response.ok }; } catch { data = { ok: false, error: "invalid_availability_reminder_response" }; }
  return { ok: response.ok && data?.ok !== false, status: response.status, data };
}

async function callAvailabilitySnapshotRead(env, modelKey, ctx = {}) {
  const baseUrl = env.ADMIN_WORKER_BASE_URL;
  const token = String(env.INTERNAL_TOKEN || "").trim();
  if (!baseUrl || !token) {
    return { ok: false, status: 503, data: { ok: false, error: "availability_reader_not_configured" } };
  }
  const response = await fetch(
    `${trim(baseUrl)}/v1/internal/sigil/availability-snapshot?model_key=${enc(modelKey)}`,
    {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-MMD-Internal-Call": "true",
        "X-MMD-Service-Binding": "model-console-worker",
        "X-MMD-Operator": ctx.actor || "model-console",
        "X-Request-ID": ctx.request_id || crypto.randomUUID(),
      },
    },
  );
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : { ok: response.ok }; } catch { data = { ok: false, error: "invalid_availability_reader_response" }; }
  return { ok: response.ok && data?.ok !== false, status: response.status, data };
}

async function availabilityCoverage(req, env, url, ctx) {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 100);
  const q = String(url.searchParams.get("q") || "").trim();
  const inventory = await callWorker(
    env.ADMIN_WORKER_BASE_URL,
    `/v1/admin/models/list?limit=${limit}${q ? `&q=${enc(q)}` : ""}`,
    env,
    { method: "GET" },
    ctx,
  );
  if (!inventory.ok) return out(req, env, inventory.data, inventory.status);

  const items = Array.isArray(inventory.data?.items) ? inventory.data.items : [];
  const models = items.map(modelAvailabilityAdoptionIdentity).filter(Boolean);

  const adoptionRows = await Promise.all(models.map(async (model) => {
    if (!model.model_key || model.excluded) return availabilityAdoptionRow(model, {});
    const result = await callAvailabilitySnapshotRead(env, model.model_key, ctx);
    return availabilityAdoptionRow(model, result);
  }));

  const counts = adoptionRows.reduce((acc, item) => {
    const key = String(item?.snapshot_state || "unknown") || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const adoption = availabilityAdoptionCounts(adoptionRows);

  const rank = item => item.snapshot_state === "stale" ? 0
    : item.snapshot_state === "missing" || item.snapshot_state === "unavailable" ? 1
      : item.snapshot_state === "identity_missing" ? 2
        : item.fresh === true ? 4 : 3;
  adoptionRows.sort((a, b) => rank(a) - rank(b) || String(a.display_name || "").localeCompare(String(b.display_name || "")));

  return out(req, env, {
    ok: true,
    schema: "mmd.sigil-availability-coverage.v1",
    generated_at: new Date().toISOString(),
    policy: {
      authority: "sigil_availability_snapshot_v1",
      reminder_mode: "owner_triggered",
      reminder_channel: "line",
      reminder_cooldown_seconds: 86400,
      automatic_send: false,
      no_guess: true,
    },
    counts,
    adoption,
    items: adoptionRows,
  });
}

function internalHeaders(env, ctx = {}) {
  const headers = new Headers({ Accept: "application/json", "X-MMD-Console": CONTRACT_VERSION, "X-MMD-Operator": ctx.actor || "model-console", "X-Request-ID": ctx.request_id || crypto.randomUUID() });
  if (env.ADMIN_BEARER) headers.set("Authorization", `Bearer ${env.ADMIN_BEARER}`);
  if (env.CONFIRM_KEY) headers.set("X-Confirm-Key", env.CONFIRM_KEY);
  if (env.INTERNAL_TOKEN) headers.set("X-Internal-Token", env.INTERNAL_TOKEN);
  return headers;
}

async function handleWorkingMemory(req, env, url, method, ctx) {
  if (!env.MMD_MODEL_CONSOLE_MEMORY) return out(req, env, { ok: false, error: "working_memory_not_configured" }, 503);
  const key = method === "POST" ? (await readJson(req)) : { key: url.searchParams.get("key") };
  if (!allowedMemoryKey(key?.key)) return out(req, env, { ok: false, error: "invalid_working_memory_key" }, 400);
  if (method === "GET") return out(req, env, { ok: true, key: key.key, record: await env.MMD_MODEL_CONSOLE_MEMORY.get(key.key, "json") });
  if (method === "DELETE") { await env.MMD_MODEL_CONSOLE_MEMORY.delete(key.key); return out(req, env, { ok: true, key: key.key }); }
  const ttl = Math.min(Math.max(Number(key.ttl_seconds) || 86400, 60), 60 * 60 * 24 * 7);
  const record = { schema: "mmd.console.working-memory.v1", key: key.key, kind: key.kind || "operator_state", value: key.value, actor: ctx.actor, updated_at: new Date().toISOString() };
  await env.MMD_MODEL_CONSOLE_MEMORY.put(key.key, JSON.stringify(record), { expirationTtl: ttl });
  return out(req, env, { ok: true, record });
}

async function permanentAudit(env, ctx, action, target, response) {
  if (!env.ADMIN_EVENT_LOG_BASE_URL) throw new Error("ADMIN_EVENT_LOG_BASE_URL missing");
  const audit = await callWorker(env.ADMIN_EVENT_LOG_BASE_URL || env.ADMIN_WORKER_BASE_URL, env.ADMIN_EVENT_LOG_PATH || "/v1/admin/model-console/audit", env, { method: "POST", body: { schema: "mmd.admin.audit.v1", action, target, actor: ctx.actor, request_id: ctx.request_id, downstream_status: response.status, ok: response.ok, at: new Date().toISOString() } }, ctx);
  if (!audit.ok) throw new Error("permanent_audit_write_failed");
}

function matchModelRoute(path) {
  const match = path.match(/^\/v1\/console\/models\/([^/]+)(?:\/(availability|jobs|payments|access|alerts))?$/);
  return match ? { id: decodeURIComponent(match[1]), section: match[2] || null } : null;
}
function workerRegistry(env) { return Object.entries(WORKERS).map(([name, key]) => ({ name, configured: Boolean(env[key]) })); }
function allowedMemoryKey(key) { return typeof key === "string" && /^(draft:model:|view:model:|match:|lock:model:)[A-Za-z0-9:_-]{1,180}$/.test(key); }
function enc(value) { return encodeURIComponent(String(value)); }
function trim(value) { return String(value || "").replace(/\/$/, ""); }
function normalizePath(value) { return value.length > 1 ? value.replace(/\/+$/, "") : value; }
async function readJson(req) { try { return await req.json(); } catch { return {}; } }
function allowedOrigins(env) { return new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean)); }
function cors(req, env) {
  const headers = new Headers({ Vary: "Origin", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Credentials": "true", "Access-Control-Max-Age": "86400" });
  const origin = req.headers.get("Origin") || "";
  if (origin && allowedOrigins(env).has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}
function preflight(req, env) { return new Response(null, { status: 204, headers: cors(req, env) }); }
function out(req, env, data, status = 200) { const headers = cors(req, env); headers.set("Content-Type", "application/json; charset=utf-8"); headers.set("Cache-Control", "no-store"); return new Response(JSON.stringify(data), { status, headers }); }
