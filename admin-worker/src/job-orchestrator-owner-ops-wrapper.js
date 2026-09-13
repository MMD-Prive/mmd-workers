import delegatedWorker from "./payment-proof-client-provenance-wrapper.js";
import {
  OWNER_JOB_ACTIONS_PATH,
  applyOwnerJobAction,
  augmentDashboardPayload,
  isOwnerJobActionsRequest,
  listOwnerJobActions,
  ownerActionHttpResponse,
} from "./job-orchestrator-owner-ops-runtime.js";

const DASHBOARD_PATH = "/v1/admin/dashboard";
const AUTH_ME_PATH = "/v1/admin/auth/me";
const OWNER_ROLES = new Set(["owner", "admin", "super_admin", "superadmin"]);
const MODEL_SESSION_RUNTIME_PATHS = new Set(["/v1/model/session/current", "/v1/model/session/action"]);

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store, private", "content-type": "application/json; charset=utf-8" } });
}
function lifecycleEnv(env = {}, path = "") {
  if (!MODEL_SESSION_RUNTIME_PATHS.has(path)) return env;
  return {
    ...env,
    AT_SESSIONS__STATE: clean(env.AT_SESSIONS__CANONICAL_STATE, 120) || "model_session_state",
    AT_SESSIONS__STATE_UPDATED_AT: clean(env.AT_SESSIONS__STATE_UPDATED_AT, 120) || "model_session_state_updated_at",
  };
}
async function readOwnerActor(request, env, ctx) {
  const cookie = clean(request.headers.get("cookie"), 12000);
  if (!cookie) return null;
  const url = new URL(AUTH_ME_PATH, request.url);
  const headers = new Headers({ accept: "application/json", cookie });
  const response = await delegatedWorker.fetch(new Request(url.toString(), { method: "GET", headers }), env, ctx);
  if (!(response instanceof Response) || !response.ok) return null;
  const data = await response.json().catch(() => null);
  if (!data || data.authenticated === false || data.ok === false) return null;
  const actor = {
    id: clean(data.actor_id || data.actor?.id, 120),
    role: clean(data.actor_role || data.actor?.role, 80).toLowerCase(),
  };
  if (!actor.id || !OWNER_ROLES.has(actor.role)) return null;
  return actor;
}
async function augmentDashboard(response, env) {
  if (!(response instanceof Response) || !response.ok) return response;
  const type = clean(response.headers.get("content-type"), 120).toLowerCase();
  if (!type.includes("application/json")) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload || payload.ok === false) return response;
  let ownerOps;
  try {
    ownerOps = await listOwnerJobActions(env);
  } catch (error) {
    ownerOps = { ok: false, error: clean(error?.message, 160) || "owner_ops_unavailable" };
  }
  const projected = ownerOps?.ok
    ? augmentDashboardPayload(payload, ownerOps)
    : { ...payload, owner_actions: { authority: "model_session_contract_v1", state: "degraded", error: ownerOps?.error || "owner_ops_unavailable" } };
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-job-orchestrator", ownerOps?.ok ? "owner-ops-v1" : "owner-ops-degraded");
  return new Response(JSON.stringify(projected), { status: response.status, statusText: response.statusText, headers });
}

export default {
  ...delegatedWorker,
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = String(request.method || "GET").toUpperCase();

    if (isOwnerJobActionsRequest(url, method)) {
      const actor = await readOwnerActor(request, env, ctx);
      if (!actor) return json({ ok: false, error: "owner_admin_session_required", authority: "model_session_contract_v1" }, 401);
      try {
        if (method === "GET") return json(await listOwnerJobActions(env));
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "invalid_owner_action_request" }, 400);
        return ownerActionHttpResponse(await applyOwnerJobAction(env, body, actor));
      } catch (error) {
        return json({ ok: false, error: "owner_job_action_failed", detail: clean(error?.message, 160), authority: "model_session_contract_v1" }, 500);
      }
    }

    const response = await delegatedWorker.fetch(request, lifecycleEnv(env, url.pathname), ctx);
    if (url.pathname === DASHBOARD_PATH && method === "GET") return augmentDashboard(response, env);
    return response;
  },
};

export { OWNER_JOB_ACTIONS_PATH, lifecycleEnv };
