const VERSION = "model-console-v1";

const WORKERS = {
  admin: "ADMIN_WORKER_BASE_URL",
  chat: "CHAT_WORKER_BASE_URL",
  payments: "PAYMENTS_WORKER_BASE_URL",
  telegram: "TELEGRAM_WORKER_BASE_URL",
  events: "EVENTS_WORKER_BASE_URL",
  realtime: "REALTIME_WORKER_BASE_URL",
  immigrate: "IMMIGRATE_WORKER_BASE_URL",
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    if (method === "OPTIONS") return preflight(req, env);

    try {
      if (method === "GET" && path === "/ping") {
        return out(req, env, { ok: true, worker: "model-console-worker", version: VERSION, ts: Date.now() });
      }

      if (!isAuthed(req, env)) return out(req, env, { ok: false, error: "unauthorized" }, 401);

      if (method === "GET" && path === "/v1/console/workers") {
        const workers = Object.entries(WORKERS).map(([name, key]) => ({ name, configured: Boolean(env[key]) }));
        return out(req, env, { ok: true, workers });
      }

      if (method === "GET" && path === "/v1/console/workers/health") {
        const checks = await Promise.all(Object.entries(WORKERS).map(([name, key]) => health(name, env[key], env)));
        return out(req, env, { ok: true, checks });
      }

      if (method === "GET" && path === "/v1/console/models") {
        return proxyAdmin(req, env, `/v1/admin/models/list${url.search}`, "GET");
      }

      if (method === "POST" && path === "/v1/console/models/upsert") {
        const body = await readJson(req);
        const response = await callWorker(env.ADMIN_WORKER_BASE_URL, "/v1/admin/models/upsert", env, {
          method: "POST",
          body,
        });
        await audit(env, req, "model.upsert", body?.id || body?.unique_key || null, response.ok, response.status);
        return out(req, env, response.data, response.status);
      }

      if (method === "GET" && path === "/v1/console/memory") {
        const key = url.searchParams.get("key");
        if (!key) return out(req, env, { ok: false, error: "missing_key" }, 400);
        const record = await memoryGet(env, key);
        return out(req, env, { ok: true, key, record });
      }

      if (method === "POST" && path === "/v1/console/memory") {
        const body = await readJson(req);
        if (!body?.key) return out(req, env, { ok: false, error: "missing_key" }, 400);
        const record = await memoryPut(env, body.key, body.value, {
          ttl_seconds: body.ttl_seconds,
          kind: body.kind || "operator_state",
          actor: actor(req),
        });
        return out(req, env, { ok: true, record });
      }

      if (method === "DELETE" && path === "/v1/console/memory") {
        const key = url.searchParams.get("key");
        if (!key) return out(req, env, { ok: false, error: "missing_key" }, 400);
        await memoryDelete(env, key);
        return out(req, env, { ok: true, key });
      }

      if (method === "POST" && path === "/v1/console/telegram/dm") {
        const body = await readJson(req);
        const response = await callWorker(env.ADMIN_WORKER_BASE_URL, "/v1/admin/telegram/dm", env, {
          method: "POST",
          body,
        });
        await audit(env, req, "telegram.dm", body?.chat_id || body?.telegram_id || null, response.ok, response.status);
        return out(req, env, response.data, response.status);
      }

      if (method === "POST" && path === "/v1/console/proxy") {
        const body = await readJson(req);
        const workerName = String(body?.worker || "");
        const envKey = WORKERS[workerName];
        if (!envKey) return out(req, env, { ok: false, error: "worker_not_allowed" }, 400);
        if (!safePath(body?.path)) return out(req, env, { ok: false, error: "invalid_path" }, 400);
        const response = await callWorker(env[envKey], body.path, env, {
          method: String(body.method || "GET").toUpperCase(),
          body: body.body,
        });
        await audit(env, req, `proxy.${workerName}`, body.path, response.ok, response.status);
        return out(req, env, response.data, response.status);
      }

      return out(req, env, { ok: false, error: "not_found" }, 404);
    } catch (error) {
      console.error("model-console", error);
      return out(req, env, { ok: false, error: "internal_error", message: String(error?.message || error) }, 500);
    }
  },
};

async function proxyAdmin(req, env, path, method) {
  const response = await callWorker(env.ADMIN_WORKER_BASE_URL, path, env, { method });
  return out(req, env, response.data, response.status);
}

async function health(name, baseUrl, env) {
  if (!baseUrl) return { name, configured: false, ok: false, status: null };
  const started = Date.now();
  try {
    const response = await fetch(`${trim(baseUrl)}/ping`, { headers: internalHeaders(env) });
    return { name, configured: true, ok: response.ok, status: response.status, latency_ms: Date.now() - started };
  } catch (error) {
    return { name, configured: true, ok: false, status: null, latency_ms: Date.now() - started, error: String(error?.message || error) };
  }
}

async function callWorker(baseUrl, path, env, options = {}) {
  if (!baseUrl) return { ok: false, status: 503, data: { ok: false, error: "worker_not_configured" } };
  const headers = internalHeaders(env);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${trim(baseUrl)}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : { ok: response.ok }; }
  catch { data = { ok: response.ok, raw: text }; }
  return { ok: response.ok, status: response.status, data };
}

function internalHeaders(env) {
  const headers = new Headers();
  if (env.ADMIN_BEARER) headers.set("Authorization", `Bearer ${env.ADMIN_BEARER}`);
  if (env.CONFIRM_KEY) headers.set("X-Confirm-Key", env.CONFIRM_KEY);
  if (env.INTERNAL_TOKEN) headers.set("X-Internal-Token", env.INTERNAL_TOKEN);
  return headers;
}

async function memoryPut(env, key, value, meta = {}) {
  const record = {
    schema: "mmd.console.memory.v1",
    key,
    kind: meta.kind || "operator_state",
    value,
    actor: meta.actor || "unknown",
    updated_at: new Date().toISOString(),
  };
  if (!env.MMD_MODEL_CONSOLE_MEMORY) throw new Error("MMD_MODEL_CONSOLE_MEMORY binding missing");
  const options = {};
  if (Number(meta.ttl_seconds) >= 60) options.expirationTtl = Number(meta.ttl_seconds);
  await env.MMD_MODEL_CONSOLE_MEMORY.put(key, JSON.stringify(record), options);
  return record;
}

async function memoryGet(env, key) {
  if (!env.MMD_MODEL_CONSOLE_MEMORY) throw new Error("MMD_MODEL_CONSOLE_MEMORY binding missing");
  return env.MMD_MODEL_CONSOLE_MEMORY.get(key, "json");
}

async function memoryDelete(env, key) {
  if (!env.MMD_MODEL_CONSOLE_MEMORY) throw new Error("MMD_MODEL_CONSOLE_MEMORY binding missing");
  return env.MMD_MODEL_CONSOLE_MEMORY.delete(key);
}

async function audit(env, req, action, target, ok, status) {
  if (!env.MMD_MODEL_CONSOLE_MEMORY) return;
  const id = crypto.randomUUID();
  const record = {
    schema: "mmd.console.audit.v1",
    id,
    action,
    target,
    actor: actor(req),
    ok,
    status,
    at: new Date().toISOString(),
  };
  await env.MMD_MODEL_CONSOLE_MEMORY.put(`audit:${Date.now()}:${id}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 90 });
}

function actor(req) {
  return req.headers.get("X-MMD-Operator") || "admin";
}

function isAuthed(req, env) {
  const bearer = req.headers.get("Authorization") || "";
  const confirm = req.headers.get("X-Confirm-Key") || "";
  return Boolean((env.ADMIN_BEARER && bearer === `Bearer ${env.ADMIN_BEARER}`) || (env.CONFIRM_KEY && confirm === env.CONFIRM_KEY));
}

function safePath(path) {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("..") && path.length <= 512;
}

async function readJson(req) {
  try { return await req.json(); } catch { return {}; }
}

function trim(value) { return String(value || "").replace(/\/$/, ""); }

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean));
}

function cors(req, env) {
  const headers = new Headers();
  const origin = req.headers.get("Origin") || "";
  const allowed = allowedOrigins(env);
  if (origin && allowed.has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Confirm-Key,X-MMD-Operator");
  headers.set("Access-Control-Max-Age", "86400");
  return headers;
}

function preflight(req, env) { return new Response(null, { status: 204, headers: cors(req, env) }); }

function out(req, env, data, status = 200) {
  const headers = cors(req, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}
