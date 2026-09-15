import delegatedWorker from "./payment-proof-client-provenance-wrapper.js";
import {
  OWNER_JOB_ACTIONS_PATH,
  applyOwnerJobAction,
  augmentDashboardPayload,
  isOwnerJobActionsRequest,
  listOwnerJobActions,
  ownerActionHttpResponse,
} from "./job-orchestrator-owner-ops-runtime.js";
import { calendarApiResponse, calendarJsonResponse, calendarPageResponse, readCalendarOwnerActor, calendarDate } from "./admin-calendar-visibility.js";

const DASHBOARD_PATH = "/v1/admin/dashboard";
const AUTH_ME_PATH = "/v1/admin/auth/me";
const CALENDAR_API_PATH = "/v1/admin/calendar";
const CALENDAR_PAGE_PATH = "/internal/admin/calendar";
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
function calendarLoginRedirect(request) {
  const login = new URL("/internal/admin/login", request.url);
  login.searchParams.set("next", CALENDAR_PAGE_PATH);
  return Response.redirect(login.toString(), 302);
}
async function handleCalendar(request, env, ctx, url, method) {
  const actor = await readCalendarOwnerActor(request, env);
  if (!actor) {
    if (url.pathname === CALENDAR_PAGE_PATH) return calendarLoginRedirect(request);
    return calendarJsonResponse({ ok: false, error: "owner_admin_session_required" }, 401);
  }
  const date = url.searchParams.get("date");
  if (date !== null && !calendarDate(date)) return calendarJsonResponse({ ok: false, error: "invalid_calendar_date" }, 400);
  if (url.pathname === CALENDAR_PAGE_PATH) {
    if (method !== "GET" && method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    const page = await calendarPageResponse(env, date || "");
    return method === "HEAD" ? new Response(null, { status: page.status, headers: page.headers }) : page;
  }
  if (method !== "GET") return calendarJsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  try {
    return await calendarApiResponse(env, url);
  } catch (error) {
    console.warn("[admin-calendar] read unavailable", { actor_id: actor.id, error: clean(error?.message, 120) });
    return calendarJsonResponse({ ok: false, error: "calendar_unavailable", schema: "mmd.admin.calendar.v1" }, 503);
  }
}

export default {
  ...delegatedWorker,
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = String(request.method || "GET").toUpperCase();
    const calendarPath = url.pathname.replace(/\/$/, "");
    if (calendarPath === CALENDAR_PAGE_PATH || calendarPath === CALENDAR_API_PATH) {
      url.pathname = calendarPath;
      return handleCalendar(request, env, ctx, url, method);
    }

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

export { OWNER_JOB_ACTIONS_PATH, lifecycleEnv, CALENDAR_API_PATH, CALENDAR_PAGE_PATH };
