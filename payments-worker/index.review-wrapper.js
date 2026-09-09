import phase1Worker from "./index.phase1.js";
import { PointsPhase1Coordinator } from "./index.phase1.js";
import { handleReviewedProof, isReviewedProofRequest } from "./reviewed-proof.js";
import {
  commitEmailLessLineRenewalMoneyTruth,
  isEmailLessLineRenewalMoneyTruth,
} from "./reviewed-proof-canonical-money-truth.js";

export { PointsPhase1Coordinator };

const NOTIFY_PATH = "/v1/payments/notify";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (isReviewedProofRequest(path, method)) {
      return handleReviewedProof(request, env, ctx, async (body) => {
        if (!String(env.INTERNAL_TOKEN || "").trim()) {
          return json({ ok: false, error: "payments_internal_token_not_ready", authority: "payments-worker" }, 503);
        }

        // Canonical recovered LINE renewals have already passed the reviewed-proof
        // identity/proof/package gates. The legacy notify path still writes literal
        // `payment_ref`, which is a read-only compatibility formula in Payments.
        // Route only this narrow recovery case through the canonical field writer.
        if (isEmailLessLineRenewalMoneyTruth(body)) {
          return commitEmailLessLineRenewalMoneyTruth(env, body);
        }

        const headers = new Headers({
          "Content-Type": "application/json",
          "Authorization": `Bearer ${String(env.INTERNAL_TOKEN).trim()}`,
          "X-Internal-Token": String(env.INTERNAL_TOKEN).trim(),
        });
        return phase1Worker.fetch(new Request(new URL(NOTIFY_PATH, request.url), {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        }), env, ctx);
      });
    }

    return phase1Worker.fetch(request, env, ctx);
  },
};

function normalizePath(pathname = "") {
  const path = String(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-MMD-Payment-Authority": "payments-worker",
    },
  });
}
