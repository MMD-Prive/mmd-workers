const WORKER_NAME_FALLBACK = "sigil-board-worker";
const RUNTIME_VERSION_FALLBACK = "SIGIL_BOARD_RUNTIME_V7_0";

const PERMISSION_MATRIX = {
  boss_per: [
    "view_runtime",
    "controlled_dry_run",
    "queue_action",
    "write_audit",
    "rollback_runtime",
    "admin_config",
  ],
  ewvon: ["view_runtime", "controlled_dry_run", "write_audit"],
  kenji_viewer: ["view_runtime"],
};

const WORKER_ACTIONS = new Set([
  "view_runtime",
  "controlled_dry_run",
  "queue_action",
  "write_audit",
  "rollback_runtime",
  "admin_config",
]);

const FALLBACK_RUNTIME = {
  ok: true,
  source: "fallback",
  board_level: "V7.0",
  mode: "safe_runtime",
  production_write: false,
  request_id: "fallback_runtime",
  snapshot_id: "sigil-board-v7-fallback",
  locked_truth: [
    "Payment slip is evidence only, not confirmation.",
    "SVIP is Boss Per manual decision only.",
    "Black Card is Ewvon private review, not auto approval.",
    "Frontend must not contain secrets.",
    "Every controlled action requires server-side auth and audit.",
    "Rollback is Boss Per only.",
  ],
  rules: [
    {
      id: "per-ai",
      name: "Per AI Keyword Rule",
      status: "active",
      intent: "talk_to_per_ai",
      body: "Hi Per / สวัสดี เปอร์ routes to Per AI support flow. Never claim Boss Per personally replied.",
    },
    {
      id: "payment-slip",
      name: "Payment Slip Evidence Only",
      status: "active",
      intent: "payment_ack_only",
      body: "Slip is supporting evidence only. Official matching and verification are required before confirmation.",
    },
    {
      id: "model-finder",
      name: "Model Finder Manual Assist",
      status: "active",
      intent: "model_finder_manual_assist",
      body: "Feature is being prepared. Offer manual assisted search. Do not say access denied.",
    },
    {
      id: "svip",
      name: "SVIP Manual Decision",
      status: "locked",
      intent: "svip_per_manual_only",
      body: "SVIP เป็นสิทธิ์ที่บอสเปอร์พิจารณาเป็นการส่วนตัวเท่านั้น ไม่ได้ปลดล็อกด้วยคะแนน.",
    },
    {
      id: "black-card",
      name: "Black Card Private Review",
      status: "locked",
      intent: "black_card_private_review",
      body: "Black Card is Ewvon private review. No automatic approval.",
    },
  ],
};

class HttpError extends Error {
  constructor(status, error, message, extra) {
    super(message || error);
    this.status = status;
    this.payload = { ok: false, error, message: message || error, ...(extra || {}) };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = corsFor(request, env);

    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

      rejectTokenParam(url);

      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, worker: workerName(env), runtime_version: runtimeVersion(env) }, 200, corsHeaders);
      }

      if (request.method === "GET" && url.pathname === "/sigil/board/runtime") {
        return json(await handleRuntime(request, env, ctx), 200, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/sigil/board/runtime/dry-run") {
        return json(await handleDryRun(request, env, ctx), 200, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/sigil/board/actions/queue") {
        return json(await handleQueueAction(request, env, ctx), 200, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/sigil/board/audit") {
        return json(await handleAuditWrite(request, env, ctx), 200, corsHeaders);
      }

      if (request.method === "POST" && url.pathname === "/sigil/board/runtime/rollback") {
        return json(await handleRollback(request, env, ctx), 200, corsHeaders);
      }

      return json({ ok: false, error: "not_found", path: url.pathname }, 404, corsHeaders);
    } catch (error) {
      if (error instanceof HttpError) return json(error.payload, error.status, corsHeaders);
      console.error(JSON.stringify({ worker: workerName(env), error: errorMessage(error) }));
      return json({ ok: false, error: "internal_error" }, 500, corsHeaders);
    }
  },
};

async function handleRuntime(request, env, ctx) {
  const requestId = requestIdFrom(request);
  const runtime = await loadRuntime(env, requestId);
  const safeRuntime = validateRuntimeOrFallback(runtime, requestId);

  ctx.waitUntil(writeAudit(env, {
    request_id: requestId,
    actor: "runtime_reader",
    role: "kenji_viewer",
    action: "view_runtime",
    target_route: "/sigil/board/runtime",
    verdict: "allowed",
    production_write: false,
    note: "Runtime read completed.",
  }));

  return safeRuntime;
}

async function handleDryRun(request, env, ctx) {
  const body = await readJsonObject(request);
  const control = normalizeControlRequest(body, "controlled_dry_run");
  await requireControlPermission(request, env, control, "controlled_dry_run");

  const requestId = control.request_id || crypto.randomUUID();
  const result = {
    ok: true,
    mode: "controlled_dry_run",
    request_id: requestId,
    production_write: false,
    dry_run: true,
    action: control.action || "controlled_dry_run",
    target_route: control.target_route || "/sigil/board/runtime/dry-run",
    verdict: "dry_run_pass",
    server_auth: "passed",
    audit_required: true,
    simulated_effects: [
      "No production write.",
      "No Airtable mutation.",
      "No payment confirmation.",
      "No SVIP approval.",
      "No Black Card approval.",
      "Action may be queued only after audit.",
    ],
    payload_preview: safePreview(control.payload || {}),
    created_at: new Date().toISOString(),
  };

  ctx.waitUntil(writeAudit(env, auditEvent(control, requestId, "controlled_dry_run", result.target_route, "dry_run_pass", control.reason)));
  return result;
}

async function handleQueueAction(request, env, ctx) {
  const body = await readJsonObject(request);
  const control = normalizeControlRequest(body, "queue_action");
  await requireControlPermission(request, env, control, "queue_action");

  const requestId = control.request_id || crypto.randomUUID();
  const queueItem = {
    ok: true,
    mode: "worker_action_queue_preview",
    request_id: requestId,
    queue_id: `sigil_queue_${Date.now()}`,
    action: control.action || "queue_action",
    target_route: control.target_route || "/sigil/board/actions/queue",
    actor: control.actor || "unknown_actor",
    role: control.role || "kenji_viewer",
    status: "queued_preview_only",
    production_write: false,
    dispatch_status: "not_dispatched",
    server_auth: "passed",
    audit_required: true,
    created_at: new Date().toISOString(),
  };

  if (env.SIGIL_BOARD_KV) {
    await env.SIGIL_BOARD_KV.put(`queue:${queueItem.queue_id}`, JSON.stringify(queueItem), { expirationTtl: 60 * 60 * 24 * 30 });
  }

  ctx.waitUntil(writeAudit(env, auditEvent(control, requestId, "queue_action", queueItem.target_route, "queued_preview_only", control.reason)));
  return queueItem;
}

async function handleAuditWrite(request, env) {
  const body = await readJsonObject(request);
  const control = normalizeControlRequest(body, "write_audit");
  await requireControlPermission(request, env, control, "write_audit");

  const requestId = control.request_id || crypto.randomUUID();
  const audit = auditEvent(control, requestId, control.action || "write_audit", control.target_route || "/sigil/board/audit", "audit_written", control.reason || "Manual audit event.");
  await writeAudit(env, audit);

  return { ok: true, mode: "audit_write", request_id: requestId, production_write: false, audit };
}

async function handleRollback(request, env, ctx) {
  const body = await readJsonObject(request);
  const control = normalizeControlRequest(body, "rollback_runtime");
  await requireControlPermission(request, env, control, "rollback_runtime");

  if (control.role !== "boss_per") throw new HttpError(403, "rollback_boss_per_only", "Rollback is Boss Per only.");

  const requestId = control.request_id || crypto.randomUUID();
  const plan = {
    ok: true,
    mode: "rollback_guard",
    request_id: requestId,
    production_write: false,
    rollback_executed: false,
    rollback_status: "guarded_plan_only",
    target_route: control.target_route || "/sigil/board/runtime/rollback",
    required_role: "boss_per",
    note: "V7.0 creates rollback plan only. Actual rollback needs explicit snapshot storage and manual confirmation.",
    created_at: new Date().toISOString(),
  };

  ctx.waitUntil(writeAudit(env, auditEvent(control, requestId, "rollback_runtime", plan.target_route, "rollback_plan_only", control.reason)));
  return plan;
}

async function requireControlPermission(request, env, control, required) {
  requireAdminSecret(request, env);

  const role = control.role || "kenji_viewer";
  const allowed = PERMISSION_MATRIX[role] || [];

  if (!allowed.includes(required)) {
    throw new HttpError(403, "permission_denied", "Role does not have required permission.", { role, required_permission: required });
  }

  if (required === "rollback_runtime" && role !== "boss_per") {
    throw new HttpError(403, "rollback_boss_per_only", "Rollback requires Boss Per role.");
  }
}

function requireAdminSecret(request, env) {
  const configured = clean(env.SIGIL_WORKER_SECRET);
  if (!configured) throw new HttpError(500, "worker_secret_not_configured");

  const headerSecret = clean(request.headers.get("x-mmd-admin-secret"));
  const auth = clean(request.headers.get("authorization"));
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  if (constantTimeEqual(headerSecret, configured) || constantTimeEqual(bearer, configured)) return;
  throw new HttpError(401, "unauthorized");
}

function rejectTokenParam(url) {
  if (url.searchParams.has("token")) throw new HttpError(400, "invalid_request", "Use t instead of token.");
}

async function loadRuntime(env, requestId) {
  if (!env.SIGIL_BOARD_KV) return runtimeSnapshot(requestId, "fallback_no_kv");

  const stored = await env.SIGIL_BOARD_KV.get("runtime:active", "json");
  if (!stored) {
    const snapshot = runtimeSnapshot(requestId, "fallback_empty_kv");
    await env.SIGIL_BOARD_KV.put("runtime:active", JSON.stringify(snapshot));
    return snapshot;
  }

  return { ...stored, request_id: requestId, production_write: false };
}

function runtimeSnapshot(requestId, source) {
  return { ...FALLBACK_RUNTIME, source, request_id: requestId, runtime_generated_at: new Date().toISOString() };
}

function validateRuntimeOrFallback(runtime, requestId) {
  const text = JSON.stringify(runtime || {}).toLowerCase();
  const hardBlocks = [];

  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) hardBlocks.push("runtime_not_object");
  if (!Array.isArray(runtime.rules)) hardBlocks.push("missing_rules_array");
  if (runtime.production_write === true) hardBlocks.push("production_write_true");
  if (text.includes("payment confirmed") || text.includes("เงินเข้าแล้ว")) hardBlocks.push("payment_confirmation_from_slip");
  if (text.includes("eligible by points") || text.includes("svip_eligible")) hardBlocks.push("svip_point_based");
  if (text.includes("black card approved automatically") || text.includes("auto approve black")) hardBlocks.push("black_card_auto_approval");

  if (hardBlocks.length) return { ...runtimeSnapshot(requestId, "fallback_runtime_blocked"), blocked_runtime_reason: hardBlocks };

  return { ...runtime, ok: true, request_id: requestId, production_write: false, validation: { ok: true, checked_at: new Date().toISOString() } };
}

function normalizeControlRequest(body, fallbackAction) {
  const action = clean(body.action) || fallbackAction;
  const role = clean(body.role) || "kenji_viewer";
  const required = clean(body.required_permission) || action;

  return {
    request_id: clean(body.request_id) || crypto.randomUUID(),
    actor: clean(body.actor) || "unknown_actor",
    role: isRole(role) ? role : "kenji_viewer",
    action: isWorkerAction(action) ? action : fallbackAction,
    target_route: clean(body.target_route) || clean(body.target) || "",
    required_permission: isWorkerAction(required) ? required : fallbackAction,
    reason: clean(body.reason),
    dry_run: body.dry_run !== false,
    audit_hint: clean(body.audit_hint),
    payload: isObject(body.payload) ? body.payload : {},
  };
}

function auditEvent(control, requestId, action, targetRoute, verdict, note) {
  return {
    request_id: requestId,
    actor: control.actor || "unknown_actor",
    role: control.role || "kenji_viewer",
    action,
    target_route: targetRoute,
    verdict,
    production_write: false,
    note: note || "",
  };
}

async function writeAudit(env, event) {
  const audit = { ...event, worker: workerName(env), audit_id: `audit_${Date.now()}_${crypto.randomUUID()}`, created_at: new Date().toISOString() };
  console.log(JSON.stringify({ type: "sigil_board_audit", ...audit }));

  if (env.SIGIL_BOARD_KV) {
    await env.SIGIL_BOARD_KV.put(`audit:${audit.audit_id}`, JSON.stringify(audit), { expirationTtl: 60 * 60 * 24 * 90 });
  }
}

async function readJsonObject(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) throw new HttpError(415, "unsupported_media_type", "Use application/json.");

  const data = await request.json().catch(() => null);
  if (!isObject(data)) throw new HttpError(400, "invalid_json");
  return data;
}

function safePreview(payload) {
  const out = {};
  for (const [key, value] of Object.entries(payload || {})) {
    const lower = key.toLowerCase();
    if (["token", "secret", "key", "password", "email", "phone"].some((part) => lower.includes(part))) out[key] = "[redacted]";
    else if (typeof value === "string") out[key] = value.slice(0, 240);
    else out[key] = value;
  }
  return out;
}

function corsFor(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  const headers = new Headers();

  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  headers.set("access-control-allow-headers", "content-type,authorization,x-mmd-admin-secret,x-request-id");
  headers.set("access-control-max-age", "86400");

  if (origin && allowed.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
  }

  return headers;
}

function json(body, status = 200, headers = new Headers()) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body, null, 2), { status, headers: responseHeaders });
}

function requestIdFrom(request) {
  return clean(request.headers.get("x-request-id")) || crypto.randomUUID();
}

function workerName(env) {
  return clean(env.WORKER_NAME) || WORKER_NAME_FALLBACK;
}

function runtimeVersion(env) {
  return clean(env.RUNTIME_VERSION) || RUNTIME_VERSION_FALLBACK;
}

function isRole(value) {
  return value === "boss_per" || value === "ewvon" || value === "kenji_viewer";
}

function isWorkerAction(value) {
  return WORKER_ACTIONS.has(value);
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function constantTimeEqual(a, b) {
  if (!a || !b) return false;
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}
