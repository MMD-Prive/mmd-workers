import phase1Worker from "./index.phase1.js";
import workerWithSlipEvidence from "./index.with-slip-evidence.js";
import { PointsPhase1Coordinator } from "./index.phase1.js";
import { awardBasePointsPhase1 } from "./points-phase1.js";
import { handleReviewedProof, isReviewedProofRequest } from "./reviewed-proof.js";
import {
  commitEmailLessLineRenewalMoneyTruth,
  isEmailLessLineRenewalMoneyTruth,
} from "./reviewed-proof-canonical-money-truth.js";
import {
  handleCanonicalConfirmLink,
  isCanonicalConfirmLinkRequest,
} from "./canonical-confirm-link.js";
import { canonicalizeConfirmLinkRequest } from "./confirm-route-canonicalizer.js";
import {
  enforceSigilSessionServiceAmount,
  reconcileSigilConfirmLinkMoneyTruth,
  resolveSigilCombinedPaymentComponents,
} from "./sigil-membership-payment-components.js";

export { PointsPhase1Coordinator };

const NOTIFY_PATH = "/v1/payments/notify";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (isCanonicalConfirmLinkRequest(path, method)) {
      const canonicalRequest = await canonicalizeConfirmLinkRequest(request);
      const response = await handleCanonicalConfirmLink(canonicalRequest, env, ctx);
      return reconcileSigilConfirmLinkMoneyTruth(canonicalRequest, response, env);
    }

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

        // A SIGIL Jobs assisted renewal can have one bank transfer covering both
        // service + membership. Payments.Amount remains the full amount actually
        // paid, while Session service money and Base Points must use only the
        // service component stored in the canonical structured marker.
        let components = null;
        try {
          components = await resolveSigilCombinedPaymentComponents(
            env,
            body.payment_ref || body.transaction_ref,
            body.amount_thb ?? body.amount,
          );
        } catch (error) {
          return json({
            ok: false,
            authority: "payments-worker",
            error: String(error?.message || error || "sigil_payment_component_resolution_failed"),
          }, Number(error?.status || 409));
        }
        if (components) {
          return runSigilCombinedReviewedNotify(request, env, ctx, body, components);
        }

        const headers = internalNotifyHeaders(env);
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

async function runSigilCombinedReviewedNotify(request, env, ctx, body, components) {
  const notifyRequest = new Request(new URL(NOTIFY_PATH, request.url), {
    method: "POST",
    headers: internalNotifyHeaders(env),
    body: JSON.stringify(body),
  });

  // Suppress the legacy points writer exactly as index.phase1 does. The canonical
  // points call below uses only the service component, never the renewal fee.
  const baseEnv = { ...env, POINTS_RATE: "9007199254740991" };
  const response = await workerWithSlipEvidence.fetch(notifyRequest, baseEnv, ctx);
  if (!response.ok) return response;

  const payload = await response.clone().json().catch(() => null);
  if (!payload?.ok) return response;

  try {
    await enforceSigilSessionServiceAmount(env, body.session_id, components);
  } catch (error) {
    return json({
      ok: false,
      authority: "payments-worker",
      error: String(error?.message || error || "sigil_session_service_amount_reconcile_failed"),
    }, Number(error?.status || 502));
  }

  const pointsLedger = await awardBasePointsPhase1(env, {
    payment_ref: body.payment_ref || body.transaction_ref,
    stage: body.stage || body.payment_stage || body.payment_type || "deposit",
    session_id: body.session_id,
    amount_thb: components.points_eligible_amount_thb,
    member_id: body.member_id,
    member_email: body.member_email || body.email,
  }).catch((error) => ({
    ok: false,
    awarded: false,
    error: String(error?.message || error || "points_phase1_failed"),
  }));

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-mmd-payment-components", "membership_action_v1");
  return new Response(JSON.stringify({
    ...payload,
    pricing_breakdown: components,
    points_ledger: pointsLedger,
  }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function internalNotifyHeaders(env) {
  const token = String(env.INTERNAL_TOKEN || "").trim();
  return new Headers({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "X-Internal-Token": token,
  });
}

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
