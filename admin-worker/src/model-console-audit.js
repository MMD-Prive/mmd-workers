import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";

export const MODEL_CONSOLE_AUDIT_PATH = "/v1/admin/model-console/audit";
const ACCESS_LOG_TABLE = "System — Access Log";
const ALLOWED_ACTIONS = new Set(["model.upsert", "telegram.dm"]);

export function isModelConsoleAuditRequest(request) {
  const path = new URL(request.url).pathname.replace(/\/+$/g, "") || "/";
  return path === MODEL_CONSOLE_AUDIT_PATH;
}

export async function handleModelConsoleAudit(request, env = {}) {
  if (!isModelConsoleAuditRequest(request)) return json({ ok: false, error: "not_found" }, 404);
  if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, { Allow: "POST" });

  const actor = await authenticate(request, env);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) return json({ ok: false, error: "audit_store_not_configured" }, 503);

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 80);
  if (!ALLOWED_ACTIONS.has(action)) return json({ ok: false, error: "audit_action_not_allowed" }, 400);

  const eventId = clean(body.request_id, 180) || `model_console_${crypto.randomUUID()}`;
  const fields = {
    "Event ID": eventId,
    Action: `model.console.${action}`,
    Result: body.ok === true ? "success" : "fail",
    Actor: clean(body.actor || actor.id, 160),
    "Source Ref": clean(body.target, 240),
    "After JSON": boundedJson({
      schema: "mmd.admin.audit.v1",
      request_id: eventId,
      downstream_status: Number.isFinite(Number(body.downstream_status)) ? Number(body.downstream_status) : null,
      recorded_at: clean(body.at, 80) || new Date().toISOString(),
    }),
    "Created At (ISO)": new Date().toISOString(),
  };

  const base = encodeURIComponent(String(env.AIRTABLE_BASE_ID).trim());
  const table = encodeURIComponent(clean(env.AIRTABLE_TABLE_ACCESS_LOG || ACCESS_LOG_TABLE, 160));
  const airtable = env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP : { fetch };
  const response = await airtable.fetch(`https://api.airtable.com/v0/${base}/${table}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${String(env.AIRTABLE_API_KEY).trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  });
  if (!response.ok) return json({ ok: false, error: "permanent_audit_write_failed" }, 502);
  const saved = await response.json().catch(() => ({}));
  return json({ ok: true, event_id: eventId, record_id: saved.records?.[0]?.id || null }, 201);
}

async function authenticate(request, env) {
  const internal = clean(request.headers.get("X-Internal-Token"), 5000);
  const confirm = clean(request.headers.get("X-Confirm-Key"), 5000);
  if (internal && internal === clean(env.INTERNAL_TOKEN, 5000)) return { id: clean(request.headers.get("X-MMD-Operator"), 160) || "model-console" };
  if (confirm && confirm === clean(env.CONFIRM_KEY, 5000)) return { id: clean(request.headers.get("X-MMD-Operator"), 160) || "model-console" };
  const browserActor = await readCredentialBoundAdminActor(request, env);
  return browserActor && ["owner", "admin"].includes(clean(browserActor.role, 40).toLowerCase()) ? browserActor : null;
}

function clean(value, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function boundedJson(value) { return JSON.stringify(value).slice(0, 9000); }
function json(body, status = 200, extra = {}) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } }); }
