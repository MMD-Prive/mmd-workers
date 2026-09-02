import core from "./index.js";
import { json, safeJson } from "../lib/http.js";
import { requireInternalToken } from "../lib/guard.js";
import { buildMemberAccessReconciliation } from "./member-access-reconciler.js";

const RECONCILE_PLAN_PATHS = new Set([
  "/telegram/internal/member-access/reconcile-plan",
  "/v1/internal/member-access/reconcile-plan",
]);

export default {
  async fetch(request, env, ctx) {
    const path = normalizePath(new URL(request.url).pathname);
    if (request.method === "POST" && RECONCILE_PLAN_PATHS.has(path)) {
      requireInternalToken(request, env, {
        allowServiceSecrets: ["AUTH_SERVICE_AUTH_TO_TELEGRAM"],
      });
      const body = await safeJson(request);
      if (!body) return json({ ok: false, error: "invalid_json" }, 400);
      const plan = buildMemberAccessReconciliation({
        snapshot: body.entitlement_snapshot,
        current: body.current,
        approvals: body.approvals,
      });
      return json({ ok: true, plan }, 200);
    }
    return core.fetch(request, env, ctx);
  },
};

function normalizePath(pathname) {
  const value = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (value.length > 1 && value.endsWith("/")) return value.slice(0, -1);
  return value || "/";
}
