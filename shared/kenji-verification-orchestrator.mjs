/**
 * Kenji Verification Orchestrator v1
 *
 * Pure orchestration layer. Adapters remain authoritative:
 * identity -> entitlement resolver -> renewal/status -> payment verification.
 * This module never grants, mutates, or widens access.
 */

const CLOSED = new Set(["blocked", "suspended", "revoked", "ambiguous", "unresolved", "needs_review"]);

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function state(value, fallback = "unresolved") {
  const normalized = text(value).toLowerCase();
  return normalized || fallback;
}

function safeNextAction(identityState, membershipState, renewalState, paymentState) {
  if (CLOSED.has(identityState)) return "verify_identity";
  if (CLOSED.has(membershipState)) return "review_membership";
  if (paymentState === "received" || paymentState === "pending_review") return "verify_payment";
  if (renewalState === "eligible" || renewalState === "due") return "renew_membership";
  return "continue";
}

/**
 * Run the canonical read-only verification sequence.
 * Each adapter receives the same request and the previous result where useful.
 */
export async function runKenjiVerification(input = {}, adapters = {}) {
  const identity = await (adapters.matchIdentity
    ? adapters.matchIdentity(input)
    : { state: "unresolved", reason: "identity_adapter_unavailable" });
  const identityState = state(identity?.state);

  if (CLOSED.has(identityState)) {
    return buildResult(input, identity, null, null, null);
  }

  const membership = await (adapters.resolveMembership
    ? adapters.resolveMembership({ ...input, identity })
    : { state: "unresolved", reason: "membership_resolver_unavailable" });
  const membershipState = state(membership?.state);

  if (CLOSED.has(membershipState)) {
    return buildResult(input, identity, membership, null, null);
  }

  const renewal = await (adapters.resolveRenewal
    ? adapters.resolveRenewal({ ...input, identity, membership })
    : { state: "unresolved", reason: "renewal_adapter_unavailable" });
  const renewalState = state(renewal?.state);

  const payment = await (adapters.verifyPayment
    ? adapters.verifyPayment({ ...input, identity, membership, renewal })
    : { state: "unresolved", reason: "payment_verifier_unavailable" });
  return buildResult(input, identity, membership, renewal, payment);
}

function buildResult(input, identity, membership, renewal, payment) {
  const identityState = state(identity?.state);
  const membershipState = state(membership?.state);
  const renewalState = state(renewal?.state);
  const paymentState = state(payment?.state);
  const closed = CLOSED.has(identityState) || CLOSED.has(membershipState) || CLOSED.has(renewalState);
  return {
    ok: !closed && identityState === "matched" && membershipState !== "unresolved",
    identity_state: identityState,
    membership_state: membershipState,
    renewal_state: renewalState,
    payment_state: paymentState,
    canonical_client_id: text(identity?.canonical_client_id),
    resolved_level: text(membership?.resolved_level),
    next_action: safeNextAction(identityState, membershipState, renewalState, paymentState),
    safe_reply_context: {
      display_name: text(identity?.display_name),
      can_show_private_content: !closed && membership?.private_access === true,
      can_confirm_payment: paymentState === "verified",
    },
    evidence: {
      identity: identity?.evidence || null,
      membership: membership?.evidence || null,
      renewal: renewal?.evidence || null,
      payment: payment?.evidence || null,
    },
    source: "kenji_verification_orchestrator_v1",
    input_intent: text(input.intent),
  };
}

export { CLOSED };
