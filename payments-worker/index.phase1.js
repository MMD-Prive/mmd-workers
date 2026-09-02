import workerWithSlipEvidence from "./index.with-slip-evidence.js";
import { awardBasePointsPhase1 } from "./points-phase1.js";
export { PointsPhase1Coordinator } from "./points-phase1.js";

const NOTIFY_PATH = "/v1/payments/notify";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method !== "POST" || path !== NOTIFY_PATH) {
      return workerWithSlipEvidence.fetch(request, env, ctx);
    }

    const body = await request.clone().json().catch(() => ({}));

    // Keep existing payment/session validation and persistence, but suppress the
    // legacy per-payment points calculation. Phase 1 is the only base-points
    // writer after a trusted notify succeeds.
    const baseEnv = { ...env, POINTS_RATE: "9007199254740991" };
    const response = await workerWithSlipEvidence.fetch(request, baseEnv, ctx);
    if (!response.ok) return response;

    const payload = await response.clone().json().catch(() => null);
    if (!payload?.ok) return response;

    const pointsLedger = await awardBasePointsPhase1(env, {
      payment_ref: body.payment_ref || body.transaction_ref,
      stage: body.stage || body.payment_stage || body.payment_type || "deposit",
      session_id: body.session_id,
      amount_thb: body.amount_thb || body.amount,
      member_id: body.member_id,
      member_email: body.member_email || body.email,
    }).catch((error) => ({
      ok: false,
      awarded: false,
      error: String(error?.message || error || "points_phase1_failed"),
    }));

    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(JSON.stringify({ ...payload, points_ledger: pointsLedger }), {
      status: response.status,
      headers,
    });
  },
};

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}
