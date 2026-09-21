import {
  buildKenjiLv5OperationalContext,
  buildKenjiLv5CustomerReplyStrategy,
  KENJI_LV5_SCHEMA,
} from "../../shared/kenji-lv5-operational-concierge.mjs";
import {
  KENJI_LV5_LIVE_CONTEXT_SCHEMA,
  resolveKenjiLv5LiveContext,
} from "./kenji-lv5-live-context.js";
import {
  executeKenjiLv5SupervisedAction,
  KENJI_LV5_ACTION_RPC_PATH,
} from "./kenji-lv5-supervised-action.js";
import {
  handleKenjiRecommendationRpc,
  isKenjiRecommendationRpcRequest,
  KENJI_RECOMMENDATION_RPC_PATH,
} from "./kenji-recommendation-rpc.js";

export const KENJI_LV5_OPERATIONAL_RPC_PATH = "/v1/internal/kenji/operational-context";
export const KENJI_LV5_LIVE_RPC_PATH = "/v1/internal/kenji/operational-context/live";

const ALLOWED_CALLERS = new Set([
  "member-dashboard-chat-worker",
  "admin-worker",
  "admin-ai-ops-worker",
]);

export function isKenjiLv5OperationalRpcRequest(path, method = "") {
  const normalized = normalizePath(path);
  if (isKenjiRecommendationRpcRequest(normalized, method)) return true;
  return [KENJI_LV5_OPERATIONAL_RPC_PATH, KENJI_LV5_LIVE_RPC_PATH, KENJI_LV5_ACTION_RPC_PATH].includes(normalized)
    && String(method || "").toUpperCase() === "POST";
}

export async function handleKenjiLv5OperationalRpc(request, env = {}) {
  const path = normalizePath(new URL(request.url).pathname);
  if (path === KENJI_RECOMMENDATION_RPC_PATH) {
    return handleKenjiRecommendationRpc(request, env);
  }
  if (!authorized(request, env)) return json({ ok: false, error: "not_found" }, 404);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  if (path === KENJI_LV5_ACTION_RPC_PATH) {
    const result = await executeKenjiLv5SupervisedAction(env, body);
    return json({
      ...result,
      transport: {
        mode: "service_binding_only_supervised_action",
        caller: clean(request.headers.get("x-mmd-service-binding"), 120),
      },
    }, actionStatus(result));
  }

  if (path === KENJI_LV5_LIVE_RPC_PATH) {
    const context = await resolveKenjiLv5LiveContext(env, body);
    return json({
      ...context,
      transport: {
        mode: "service_binding_only_live_fanin",
        caller: clean(request.headers.get("x-mmd-service-binding"), 120),
      },
      schema: KENJI_LV5_LIVE_CONTEXT_SCHEMA,
    });
  }

  const context = buildKenjiLv5OperationalContext({
    client: body.client || body.identity || {},
    entitlement: body.entitlement || body.membership || {},
    calendar: body.calendar || {},
    job: body.job || body.jobs || {},
    payment: body.payment || {},
    hype: body.hype || {},
    intent: body.intent || {},
  });

  return json({
    ...context,
    reply_strategy: buildKenjiLv5CustomerReplyStrategy(context),
    transport: {
      mode: "service_binding_only",
      caller: clean(request.headers.get("x-mmd-service-binding"), 120),
    },
    schema: KENJI_LV5_SCHEMA,
  });
}

function actionStatus(result = {}) {
  if (result?.ok === true) return 200;
  if (result?.status === "write_failed") return 503;
  if (result?.status === "invalid_action_request") return 400;
  if (["supervision_required", "action_blocked"].includes(result?.status)) return 409;
  return 400;
}

function authorized(request, env) {
  let hostname = "";
  try { hostname = new URL(request.url).hostname; } catch { return false; }
  if (hostname !== "admin-worker.local") return false;
  if (clean(request.headers.get("x-mmd-internal-call")).toLowerCase() !== "true") return false;
  const caller = clean(request.headers.get("x-mmd-service-binding"), 120);
  if (!ALLOWED_CALLERS.has(caller)) return false;
  const expected = clean(env.INTERNAL_TOKEN, 2000);
  const bearer = bearerToken(request);
  return Boolean(expected && bearer && timingSafeEqual(expected, bearer));
}

function bearerToken(request) {
  const match = clean(request.headers.get("authorization"), 2400).match(/^Bearer\s+(.+)$/i);
  return clean(match?.[1], 2000);
}

function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePath(value = "") {
  const raw = String(value || "/").replace(/\/{2,}/g, "/");
  return raw.length > 1 ? raw.replace(/\/+$/g, "") : raw;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-kenji-level": "lv5-operational-concierge",
    },
  });
}
