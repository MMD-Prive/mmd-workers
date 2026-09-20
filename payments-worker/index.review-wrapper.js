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
import {
  handleCustomerSessionDetails,
  isCustomerSessionDetailsRequest,
} from "./customer-session-v2.js";
import {
  handlePaymentInstructions,
  isPaymentInstructionsRequest,
} from "./payment-instructions-v1.js";
import {
  enrichUnifiedConfirmVerify,
  handleUnifiedPaymentIntent,
  handleUnifiedSlipEvidence,
  isUnifiedConfirmVerifyRequest,
  isUnifiedPaymentIntentRequest,
  isUnifiedSlipEvidenceRequest,
} from "./unified-payment-proof.js";
import { reconcileCanonicalWebRenewalProof } from "./canonical-web-renewal-settlement.js";
import { preserveCanonicalWebRenewalPaymentSuccess } from "./canonical-web-renewal-response.js";
import { reconcilePremiumReviewedMembershipTerm } from "./premium-membership-term.js";
import { reconcileReviewedMembershipEntitlement } from "./reviewed-membership-write-through.js";
import {
  handleDoubleMomentRequest,
  isDoubleMomentRequest,
  reconcileDoubleMomentReviewedProof,
} from "./double-moment-purchase-v1.js";
import {
  handleFinalPaymentFlow,
  isFinalPaymentFlowRequest,
  reconcileReviewedFinalPayment,
} from "./final-payment-flow.js";
import {
  handleShopIntent,
  handleShopIntentExpiry,
  handleShopRefundConfirm,
  enrichShopConfirmVerify,
  isShopIntentRequest,
  maybeHandleShopConfirmationDetails,
  preflightReviewedShopPayment,
  reconcileReviewedShopPayment,
} from "./shop-payment-v1.js";

export { PointsPhase1Coordinator };

const NOTIFY_PATH = "/v1/payments/notify";

function canonicalTelegramEnv(env = {}) {
  const membership = String(env.TG_THREAD_PAYMENTS_MEMBERSHIP || env.TG_THREAD_MEMBERSHIP || "20").trim() || "20";
  const confirm = String(env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || "22").trim() || "22";
  return {
    ...env,
    TG_THREAD_PAYMENTS_MEMBERSHIP: membership,
    TG_THREAD_MEMBERSHIP: membership,
    TG_THREAD_PAYMENTS_CONFIRM: confirm,
    TG_THREAD_PAYMENT: confirm,
    TG_THREAD_CONFIRM: confirm,
  };
}

export default {
  async fetch(request, env, ctx) {
    env = canonicalTelegramEnv(env);
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/v1/pay/slip/evidence/health") {
      const airtableReady = Boolean(String(env.AIRTABLE_BASE_ID || "").trim() && String(env.AIRTABLE_API_KEY || "").trim() && String(env.AIRTABLE_TABLE_PAYMENT_PROOFS || "").trim());
      const r2Ready = Boolean(env.PAYMENT_SLIP_EVIDENCE && typeof env.PAYMENT_SLIP_EVIDENCE.put === "function");
      const telegramReady = Boolean(String(env.TELEGRAM_BOT_TOKEN || "").trim());
      const tokenReady = Boolean(String(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY || "").trim() && env.PAY_SESSIONS_KV);
      const telegramThreadId = Number(env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || env.TG_THREAD_CONFIRM || 22) || 22;
      return json({
        ok: true,
        authority: "payments-worker",
        schema: "mmd_web_payment_proof_v1",
        version: "sigil_pay_proof_intake_v3",
        signed_token_required: true,
        canonical_proof_status: "pending",
        telegram_thread_id: telegramThreadId,
        bindings: {
          airtable: airtableReady,
          r2: r2Ready,
          telegram: telegramReady,
          confirmation_token: tokenReady,
        },
        ready: airtableReady && r2Ready && telegramReady && tokenReady && telegramThreadId === 22,
      }, 200);
    }

    const shopExpiryResponse = await handleShopIntentExpiry(request.clone(), env);
    if (shopExpiryResponse) return shopExpiryResponse;

    const shopRefundResponse = await handleShopRefundConfirm(request.clone(), env);
    if (shopRefundResponse) return shopRefundResponse;

    if (isShopIntentRequest(path, method)) {
      return handleShopIntent(request, env);
    }

    if (isFinalPaymentFlowRequest(path, method)) {
      return handleFinalPaymentFlow(request, env);
    }

    if (isDoubleMomentRequest(path, method)) {
      return handleDoubleMomentRequest(request, env, (nextRequest) =>
        handleUnifiedPaymentIntent(nextRequest, env, (paymentRequest) => phase1Worker.fetch(paymentRequest, env, ctx))
      );
    }

    if (isPaymentInstructionsRequest(path, method)) {
      return handlePaymentInstructions(request, env, async (detailsRequest) => {
        const shopDetails = await maybeHandleShopConfirmationDetails(detailsRequest, env);
        if (shopDetails) return shopDetails;
        return handleCustomerSessionDetails(detailsRequest, env, (nextRequest) => phase1Worker.fetch(nextRequest, env, ctx));
      });
    }

    if (isCustomerSessionDetailsRequest(path, method)) {
      const shopDetails = await maybeHandleShopConfirmationDetails(request.clone(), env);
      if (shopDetails) return shopDetails;
      return handleCustomerSessionDetails(request, env, (nextRequest) => phase1Worker.fetch(nextRequest, env, ctx));
    }

    if (isCanonicalConfirmLinkRequest(path, method)) {
      const canonicalRequest = await canonicalizeConfirmLinkRequest(request);
      const response = await handleCanonicalConfirmLink(canonicalRequest, env, ctx);
      return reconcileSigilConfirmLinkMoneyTruth(canonicalRequest, response, env);
    }

    if (isUnifiedPaymentIntentRequest(path, method)) {
      return handleUnifiedPaymentIntent(request, env, (nextRequest) => phase1Worker.fetch(nextRequest, env, ctx));
    }

    if (isUnifiedSlipEvidenceRequest(path, method)) {
      const settlementRequest = request.clone();
      const slipResponse = await handleUnifiedSlipEvidence(request, env, (nextRequest) => phase1Worker.fetch(nextRequest, env, ctx));
      const settlementResponse = await reconcileCanonicalWebRenewalProof(settlementRequest, slipResponse, env);
      return preserveCanonicalWebRenewalPaymentSuccess(settlementResponse);
    }

    if (isUnifiedConfirmVerifyRequest(path, method)) {
      const shopVerifyRequest = request.clone();
      const verifiedResponse = await enrichUnifiedConfirmVerify(
        request,
        env,
        (nextRequest) => phase1Worker.fetch(nextRequest, env, ctx),
      );
      return enrichShopConfirmVerify(shopVerifyRequest, verifiedResponse, env);
    }

    if (isReviewedProofRequest(path, method)) {
      const reconcileRequest = request.clone();
      const shopRequest = request.clone();
      const doubleMomentRequest = request.clone();
      const finalPaymentRequest = request.clone();
      const shopPreflight = await preflightReviewedShopPayment(shopRequest.clone(), env);
      if (shopPreflight) return shopPreflight;

      const reviewResponse = await handleReviewedProof(request, env, ctx, async (body) => {
        if (!String(env.INTERNAL_TOKEN || "").trim()) {
          return json({ ok: false, error: "payments_internal_token_not_ready", authority: "payments-worker" }, 503);
        }

        if (isEmailLessLineRenewalMoneyTruth(body)) {
          return commitEmailLessLineRenewalMoneyTruth(env, body);
        }

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
      const shopResponse = await reconcileReviewedShopPayment(shopRequest.clone(), reviewResponse, env);
      const termResponse = await reconcilePremiumReviewedMembershipTerm(reconcileRequest.clone(), shopResponse, env);
      const entitlementResponse = await reconcileReviewedMembershipEntitlement(reconcileRequest, termResponse, env);
      const doubleMomentResponse = await reconcileDoubleMomentReviewedProof(doubleMomentRequest, entitlementResponse, env);
      return reconcileReviewedFinalPayment(finalPaymentRequest, doubleMomentResponse, env);
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
