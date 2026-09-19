import {
  resolveKenjiLv5LiveContext,
  resolveLiveCanonicalClient,
} from "./kenji-lv5-live-context.js";
import { executeKenjiLv5SupervisedAction } from "./kenji-lv5-supervised-action.js";
import { readBoundedShopOrdersForTelegram } from "./hype-shop-orders.js";

export const HYPE_CONTINUITY_PATH = "/__internal/hype/continuity";
export const HYPE_HANDOFF_PATH = "/__internal/hype/handoff";
export const HYPE_HANDOFF_STATUS_PATH = "/__internal/hype/handoff-status";
export const HYPE_TRANSACTION_INTAKE_PATH = "/__internal/hype/transaction-intake";
export const HYPE_SUPERVISED_EXECUTION_PATH = "/__internal/hype/transaction-execute";

const MATRIX_TABLE_FALLBACK = "tblS6iRgPjYLBqZJh";
const MATRIX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const AIRTABLE_API = "https://api.airtable.com/v0";

const F = Object.freeze({
  MATRIX_ID: "matrix_id",
  CLIENT: "Client",
  SCHEMA: "schema_version",
  HASH: "conversation_id_hash",
  CHANNEL: "channel",
  SCOPE: "conversation_scope",
  TOPIC: "topic",
  SUBTOPIC: "subtopic",
  RELATIONSHIP: "relationship_context",
  LAST_INTENT: "last_customer_intent",
  LAST_REQUEST: "last_customer_request",
  LAST_CUSTOMER_ACTION: "last_customer_action",
  LAST_KENJI_ACTION: "last_kenji_action",
  LAST_OUTCOME: "last_confirmed_outcome",
  STAGE: "conversation_stage",
  AWAITING: "awaiting_from",
  PENDING_ACTION: "pending_action",
  PENDING_REF: "pending_reference",
  CONTINUITY: "continuity_summary",
  DONT_ASK: "do_not_ask_again_json",
  OPEN_LOOPS: "important_open_loops_json",
  HANDOFF_REQUIRED: "handoff_required",
  HANDOFF_OWNER: "handoff_owner",
  HANDOFF_REASON: "handoff_reason",
  TRUTH_REQUIRED: "live_truth_required",
  TRUTH_DOMAINS: "live_truth_domains",
  LAST_EVENT: "last_event_id",
  LAST_INTERACTION: "last_interaction_at",
  UPDATED_AT: "state_updated_at",
  EXPIRES_AT: "state_expires_at",
  STATUS: "matrix_status",
  VERSION: "version",
  PAYLOAD: "payload_json",
});

export async function handleHypeContinuityRpc(request, env = {}) {
  const gate = validateRequest(request, HYPE_CONTINUITY_PATH);
  if (gate) return gate;

  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "invalid_json" }, 400);

  const telegramUserId = telegramId(body.telegram_user_id);
  if (!telegramUserId) return json({ ok: false, error: "telegram_identity_invalid" }, 400);

  const identity = await resolveLiveCanonicalClient(env, { telegram_user_id: telegramUserId }).catch(() => null);
  if (identity?.status !== "resolved" || !recordId(identity?.client?.canonical_client_id)) {
    return json({ ok: false, state: "connect_required", error: "canonical_client_unresolved" }, 404);
  }

  const lineUserId = lineId(identity.client.line_user_id);
  if (!lineUserId) {
    return json({
      ok: true,
      state: "canonical_only",
      persisted: false,
      reason: "line_identity_not_linked",
      canonical_client_id: identity.client.canonical_client_id,
    });
  }

  const projection = normalizeProjection(body.projection);
  const command = token(body.command || body.intent || "status");
  const message = clean(body.customer_message, 500);
  const result = await upsertContinuityMatrix(env, {
    clientRecordId: identity.client.canonical_client_id,
    lineUserId,
    displayName: identity.client.display_name,
    command,
    customerMessage: message,
    projection,
    handoff: null,
  });

  return json({
    ok: result.ok,
    state: result.ok ? "recorded" : "storage_unavailable",
    persisted: result.ok,
    matrix_record_id: result.record_id || null,
    version: result.version || null,
    canonical_client_id: identity.client.canonical_client_id,
    line_continuity_ready: true,
    error: result.ok ? undefined : result.error,
  }, result.ok ? 200 : 503);
}

export async function handleHypeHandoffRpc(request, env = {}) {
  const gate = validateRequest(request, HYPE_HANDOFF_PATH);
  if (gate) return gate;

  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "invalid_json" }, 400);

  const telegramUserId = telegramId(body.telegram_user_id);
  if (!telegramUserId) return json({ ok: false, error: "telegram_identity_invalid" }, 400);

  const target = normalizeTarget(body.target);
  if (!target) return json({ ok: false, error: "handoff_target_invalid" }, 400);

  const customerMessage = clean(body.customer_message, 500);
  const sourceCommand = token(body.command || body.intent || "handoff");
  const context = await resolveKenjiLv5LiveContext(env, {
    telegram_user_id: telegramUserId,
    intent: {
      type: sourceCommand === "handoff" ? "general" : sourceCommand,
      trigger: "telegram_hype_handoff",
      raw: customerMessage,
    },
  }).catch(() => null);

  const canonicalClientId = recordId(context?.client_360?.canonical_client_id);
  if (!canonicalClientId) {
    return json({
      ok: false,
      state: "connect_required",
      error: "canonical_client_unresolved",
      customer_message: "ยังต้องเชื่อม Telegram กับ MY MMD ก่อนจึงจะส่งต่อพร้อมประวัติได้ครับ",
    }, 404);
  }

  const identity = await resolveLiveCanonicalClient(env, { canonical_client_id: canonicalClientId }).catch(() => null);
  const lineUserId = lineId(identity?.client?.line_user_id);
  const projection = buildCanonicalHandoffProjection(context);
  let recoveryCorrelation = sourceCommand === "recovery"
    ? await buildShopRecoveryCorrelation(env, telegramUserId, customerMessage)
    : null;

  let handoffId = "";
  if (lineUserId && recoveryCorrelation?.correlated === true && clean(recoveryCorrelation.order_id, 180)) {
    const hash = await sha256Hex(`line_ofc:${lineUserId}`);
    const existing = await findMatrix(env, hash);
    if (existing.ok && existing.record) {
      const priorPayload = parseObject(existing.record.fields?.[F.PAYLOAD]);
      const priorRecovery = parseObject(priorPayload.recovery_correlation);
      const tracking = handoffTrackingFromRecord(existing.record);
      if (
        clean(priorRecovery.order_id, 180) === clean(recoveryCorrelation.order_id, 180)
        && tracking.id
        && !["resolved", "customer_notified"].includes(token(tracking.state))
      ) {
        handoffId = tracking.id;
      }
    }
  }
  if (!handoffId) handoffId = await buildHandoffId(canonicalClientId, target);
  if (recoveryCorrelation) recoveryCorrelation = { ...recoveryCorrelation, case_ref: handoffId };

  let matrix = { ok: false, error: "line_identity_not_linked" };
  if (lineUserId) {
    matrix = await upsertContinuityMatrix(env, {
      clientRecordId: canonicalClientId,
      lineUserId,
      displayName: clean(context?.client_360?.display_name, 120),
      command: sourceCommand,
      customerMessage,
      projection,
      recoveryCorrelation,
      handoff: {
        id: handoffId,
        target,
        reason: clean(body.reason, 160) || `customer_requested_${target}`,
      },
    });
  }

  return json({
    ok: true,
    state: matrix.ok ? "handoff_ready" : "handoff_ready_without_line_continuity",
    handoff_id: handoffId,
    target,
    display_name: clean(context?.client_360?.display_name, 120),
    canonical_client_id: canonicalClientId,
    line_continuity_ready: Boolean(lineUserId && matrix.ok),
    line_identity_present: Boolean(lineUserId),
    matrix_record_id: matrix.record_id || null,
    continuity_version: matrix.version || null,
    context: projection,
    recovery_correlation: recoveryCorrelation,
    operator_summary: buildOperatorSummary({
      target,
      displayName: context?.client_360?.display_name,
      customerMessage,
      projection,
      handoffId,
      recoveryCorrelation,
    }),
    resume: {
      customer_does_not_need_to_repeat: true,
      kenji_line_url: "https://lin.ee/xRqsALs",
      owner_route: "/internal/admin/kenji",
      live_truth_refresh_required: true,
    },
    guardrails: {
      business_truth_mutated: false,
      payment_mutated: false,
      job_mutated: false,
      entitlement_mutated: false,
      raw_private_notes_included: false,
      handoff_context_only: true,
    },
  });
}



export async function handleHypeHandoffStatusRpc(request, env = {}) {
  const gate = validateRequest(request, HYPE_HANDOFF_STATUS_PATH);
  if (gate) return gate;

  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "invalid_json" }, 400);

  const operation = token(body.operation || "read");
  if (!["read", "transition"].includes(operation)) {
    return json({ ok: false, error: "handoff_status_operation_invalid" }, 400);
  }

  if (operation === "read") {
    const telegramUserId = telegramId(body.telegram_user_id);
    if (!telegramUserId) return json({ ok: false, error: "telegram_identity_invalid" }, 400);

    const identity = await resolveLiveCanonicalClient(env, { telegram_user_id: telegramUserId }).catch(() => null);
    if (identity?.status !== "resolved" || !recordId(identity?.client?.canonical_client_id)) {
      return json({ ok: false, state: "connect_required", error: "canonical_client_unresolved" }, 404);
    }
    const lineUserId = lineId(identity.client.line_user_id);
    if (!lineUserId) {
      return json({ ok: true, state: "none", tracking: false, reason: "line_identity_not_linked" });
    }

    const hash = await sha256Hex(`line_ofc:${lineUserId}`);
    const matrix = await findMatrix(env, hash);
    if (!matrix.ok) return json({ ok: false, state: "storage_unavailable", error: matrix.error }, 503);
    if (!matrix.record) return json({ ok: true, state: "none", tracking: false });

    const tracking = handoffTrackingFromRecord(matrix.record);
    if (!tracking.id) return json({ ok: true, state: "none", tracking: false });

    return json({
      ok: true,
      state: tracking.state || "prepared",
      tracking: true,
      handoff_id: tracking.id,
      target: tracking.target || null,
      updated_at: tracking.updated_at || null,
      actor_role: tracking.actor_role || null,
      terminal: ["resolved", "customer_notified"].includes(tracking.state),
      guardrails: handoffStatusGuardrails(),
    });
  }

  const handoffId = clean(body.handoff_id, 180);
  if (!/^HYPE-(?:PER|KENJI)-\d{14}-[a-f0-9]{8}$/i.test(handoffId)) {
    return json({ ok: false, error: "handoff_id_invalid" }, 400);
  }
  const nextState = token(body.state);
  if (!["sent", "acknowledged", "reviewing", "resolved", "customer_notified"].includes(nextState)) {
    return json({ ok: false, error: "handoff_state_invalid" }, 400);
  }

  const matrix = await findMatrixByPendingRef(env, handoffId);
  if (!matrix.ok) return json({ ok: false, state: "storage_unavailable", error: matrix.error }, 503);
  if (!matrix.record) return json({ ok: false, state: "not_found", error: "handoff_not_found" }, 404);

  const current = handoffTrackingFromRecord(matrix.record);
  const currentState = current.state || "prepared";
  if (!handoffTransitionAllowed(currentState, nextState)) {
    return json({
      ok: false,
      state: "transition_rejected",
      error: "handoff_transition_invalid",
      current_state: currentState,
      requested_state: nextState,
    }, 409);
  }

  if (currentState === nextState) {
    return json({
      ok: true,
      state: nextState,
      replayed: true,
      handoff_id: handoffId,
      target: current.target || normalizeTargetFromHandoffId(handoffId),
      updated_at: current.updated_at || null,
      guardrails: handoffStatusGuardrails(),
    });
  }

  const prior = matrix.record.fields || {};
  const priorPayload = parseObject(prior[F.PAYLOAD]);
  const stamp = new Date().toISOString();
  const actorRole = token(body.actor_role || "operator");
  const target = current.target || normalizeTargetFromHandoffId(handoffId);
  const version = Math.max(0, Number(prior[F.VERSION]) || 0) + 1;
  const tracking = {
    id: handoffId,
    target,
    state: nextState,
    updated_at: stamp,
    actor_role: actorRole || "operator",
  };

  const fields = {
    [F.LAST_KENJI_ACTION]: `handoff_${nextState}`,
    [F.LAST_OUTCOME]: handoffOutcome(nextState),
    [F.STAGE]: `handoff_${nextState}`,
    [F.AWAITING]: nextState === "resolved"
      ? "customer_notification"
      : nextState === "customer_notified"
        ? "none"
        : "mmd_review",
    [F.HANDOFF_REQUIRED]: !["resolved", "customer_notified"].includes(nextState),
    [F.LAST_EVENT]: `hype_handoff_${nextState}:${handoffId}`,
    [F.LAST_INTERACTION]: stamp,
    [F.UPDATED_AT]: stamp,
    [F.EXPIRES_AT]: new Date(Date.parse(stamp) + MATRIX_TTL_MS).toISOString(),
    [F.STATUS]: nextState === "customer_notified" ? "closed" : "active",
    [F.VERSION]: version,
    [F.PAYLOAD]: JSON.stringify({
      ...priorPayload,
      handoff_id: handoffId,
      handoff_target: target,
      handoff_tracking: tracking,
      live_truth_refresh_required: true,
      business_truth_mutated: false,
    }),
  };

  const write = await airtableWrite(env, "PATCH", {
    records: [{ id: matrix.record.id, fields }],
    typecast: true,
  });
  if (!write.ok) return json({ ok: false, state: "storage_unavailable", error: write.error }, 503);

  return json({
    ok: true,
    state: nextState,
    replayed: false,
    handoff_id: handoffId,
    target,
    updated_at: stamp,
    guardrails: handoffStatusGuardrails(),
  });
}

export async function handleHypeTransactionIntakeRpc(request, env = {}) {
  const gate = validateRequest(request, HYPE_TRANSACTION_INTAKE_PATH);
  if (gate) return gate;

  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "invalid_json" }, 400);

  const telegramUserId = telegramId(body.telegram_user_id);
  if (!telegramUserId) return json({ ok: false, error: "telegram_identity_invalid" }, 400);

  const operation = token(body.operation || "update");
  let mode = normalizeTransactionMode(body.mode || body.intent);
  if (operation !== "read" && !mode) return json({ ok: false, error: "transaction_mode_invalid" }, 400);
  if (!["read", "update"].includes(operation)) return json({ ok: false, error: "transaction_operation_invalid" }, 400);

  const customerMessage = clean(body.customer_message, 1000);
  const context = await resolveKenjiLv5LiveContext(env, {
    telegram_user_id: telegramUserId,
    intent: {
      type: transactionIntentType(mode),
      trigger: "telegram_hype_transaction_intake",
      raw: customerMessage,
    },
  }).catch(() => null);

  const canonicalClientId = recordId(context?.client_360?.canonical_client_id);
  if (!canonicalClientId) {
    return json({
      ok: false,
      state: "connect_required",
      error: "canonical_client_unresolved",
      customer_message: "กรุณาเชื่อม Telegram กับ MY MMD ก่อน ผมจึงจะเก็บ Transaction Draft ต่อเนื่องให้ได้ครับ",
    }, 404);
  }

  const identity = await resolveLiveCanonicalClient(env, { canonical_client_id: canonicalClientId }).catch(() => null);
  const lineUserId = lineId(identity?.client?.line_user_id);

  if (operation === "read") {
    if (!lineUserId) {
      return json({
        ok: true,
        state: "none",
        active: false,
        persisted: false,
        reason: "line_identity_not_linked",
        guardrails: transactionGuardrails(),
      });
    }
    const current = await readTransactionDraftMatrix(env, lineUserId);
    if (!current.ok) {
      if (current.error === "transaction_draft_not_found") {
        return json({ ok: true, state: "none", active: false, persisted: false, guardrails: transactionGuardrails() });
      }
      return json({ ok: false, state: "storage_unavailable", error: current.error, guardrails: transactionGuardrails() }, 503);
    }
    mode = current.mode;
    const route = canonicalTransactionRoute(mode, context);
    return json({
      ok: true,
      state: current.complete ? "draft_complete" : "collecting",
      active: true,
      mode,
      draft_id: current.draft_id,
      persisted: true,
      fields: current.fields,
      missing_fields: current.missing_fields,
      complete: current.complete,
      canonical_submit: {
        ready: canonicalSubmitReady(mode, current, context, route),
        href: route.href,
        route_kind: route.kind,
        requires_customer_action: true,
        submitted_by_hype: false,
      },
      guardrails: transactionGuardrails(),
    });
  }

  const incoming = normalizeTransactionFields(mode, body.fields || {});
  const route = canonicalTransactionRoute(mode, context);
  const preview = mergeTransactionDraft(mode, {}, incoming);
  let draft = {
    ok: false,
    persisted: false,
    draft_id: await buildTransactionDraftId(canonicalClientId, mode),
    mode,
    fields: preview.fields,
    missing_fields: preview.missing_fields,
    complete: preview.complete,
    error: lineUserId ? "storage_unavailable" : "line_identity_not_linked",
  };

  if (lineUserId) {
    draft = await upsertTransactionDraftMatrix(env, {
      clientRecordId: canonicalClientId,
      lineUserId,
      displayName: clean(context?.client_360?.display_name, 120),
      mode,
      customerMessage,
      incoming,
      routeKind: route.kind,
    });
    if (!draft.ok) {
      return json({
        ok: false,
        state: "storage_unavailable",
        error: draft.error || "transaction_draft_storage_failed",
        guardrails: transactionGuardrails(),
      }, 503);
    }
  }

  const state = transactionState(mode, draft, context, route);
  return json({
    ok: true,
    state,
    mode,
    draft_id: draft.draft_id,
    persisted: draft.persisted === true,
    line_continuity_ready: Boolean(lineUserId && draft.persisted),
    display_name: clean(context?.client_360?.display_name, 120),
    fields: draft.fields,
    missing_fields: draft.missing_fields,
    complete: draft.complete,
    canonical_submit: {
      ready: canonicalSubmitReady(mode, draft, context, route),
      href: route.href,
      route_kind: route.kind,
      requires_customer_action: true,
      submitted_by_hype: false,
    },
    current_truth: {
      membership_level: token(context?.entitlement?.membership_level || context?.entitlement?.canonical_membership_level || context?.entitlement_live?.membership_level || context?.entitlement_live?.canonical_membership_level),
      membership_lifecycle: token(context?.entitlement?.lifecycle || context?.entitlement?.status || context?.entitlement_live?.lifecycle || context?.entitlement_live?.status),
      payment_status: token(context?.payment?.status || context?.payment_live?.status),
      payment_paid: context?.payment?.paid === true || context?.payment_live?.paid === true,
      payment_review_required: context?.payment?.review_required === true || context?.payment_live?.review_required === true,
      outstanding_amount_thb: nonNegative(context?.payment?.outstanding_amount_thb || context?.payment_live?.outstanding_amount_thb),
    },
    guardrails: transactionGuardrails(),
  });
}

export async function handleHypeSupervisedExecutionRpc(request, env = {}) {
  const gate = validateRequest(request, HYPE_SUPERVISED_EXECUTION_PATH);
  if (gate) return gate;

  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "invalid_json" }, 400);

  const telegramUserId = telegramId(body.telegram_user_id);
  if (!telegramUserId) return json({ ok: false, error: "telegram_identity_invalid" }, 400);

  const operation = token(body.operation || "execute");
  if (!["execute", "status"].includes(operation)) {
    return json({ ok: false, error: "execution_operation_invalid" }, 400);
  }

  const context = await resolveKenjiLv5LiveContext(env, {
    telegram_user_id: telegramUserId,
    intent: { type: "transaction_execution", trigger: "telegram_hype_p6" },
  }).catch(() => null);
  const canonicalClientId = recordId(context?.client_360?.canonical_client_id);
  if (!canonicalClientId) return json({ ok: false, state: "connect_required", error: "canonical_client_unresolved" }, 404);

  const identity = await resolveLiveCanonicalClient(env, { canonical_client_id: canonicalClientId }).catch(() => null);
  const lineUserId = lineId(identity?.client?.line_user_id);
  if (!lineUserId) return json({ ok: false, state: "line_identity_required", error: "line_identity_not_linked" }, 409);

  const draft = await readTransactionDraftMatrix(env, lineUserId);
  if (!draft.ok) {
    const status = draft.error === "transaction_draft_not_found" ? 404 : 503;
    return json({ ok: false, state: "draft_unavailable", error: draft.error }, status);
  }

  const requestedDraftId = clean(body.draft_id, 180);
  if (requestedDraftId && requestedDraftId !== draft.draft_id) {
    return json({ ok: false, state: "draft_conflict", error: "draft_id_mismatch" }, 409);
  }

  const existingReceipt = parseObject(draft.payload?.supervised_execution);
  if (operation === "status") {
    const observation = Object.keys(existingReceipt).length
      ? await observeP6Authority(env, existingReceipt, context)
      : null;
    return json({
      ok: true,
      state: Object.keys(existingReceipt).length ? "execution_recorded" : "draft_ready",
      mode: draft.mode,
      draft_id: draft.draft_id,
      execution: safeExecutionReceipt(existingReceipt),
      authority_observation: observation,
      guardrails: p6ExecutionGuardrails(),
    });
  }

  if (!draft.complete) {
    return json({
      ok: false,
      state: "draft_incomplete",
      error: "transaction_draft_incomplete",
      mode: draft.mode,
      draft_id: draft.draft_id,
      missing_fields: draft.missing_fields,
      guardrails: p6ExecutionGuardrails(),
    }, 409);
  }

  const executionId = await buildExecutionId(draft.draft_id, draft.mode);
  if (
    existingReceipt.execution_id === executionId
    && ["materialized", "queued", "customer_action_required", "review_required"].includes(token(existingReceipt.status))
  ) {
    return json({
      ok: true,
      state: "idempotent_replay",
      replayed: true,
      mode: draft.mode,
      draft_id: draft.draft_id,
      execution: safeExecutionReceipt(existingReceipt),
      guardrails: p6ExecutionGuardrails(),
    });
  }

  const route = canonicalTransactionRoute(draft.mode, context);
  const result = await executeP6Lane(env, {
    mode: draft.mode,
    draft,
    context,
    canonicalClientId,
    lineUserId,
    executionId,
    route,
  });

  const receipt = {
    schema: "mmd.hype_supervised_execution.v1",
    execution_id: executionId,
    draft_id: draft.draft_id,
    mode: draft.mode,
    status: result.status,
    authority: result.authority,
    canonical_ref: clean(result.canonical_ref, 180),
    canonical_href: clean(result.canonical_href || route.href, 1000),
    replay_safe: true,
    created_at: new Date().toISOString(),
    business_truth_mutated: result.status === "materialized",
    request_level_mutation: result.status === "materialized",
    protected_business_truth_mutated: false,
    protected_confirmation_performed: false,
    details: result.details || {},
  };

  const persisted = await writeExecutionReceipt(env, draft, receipt);
  if (!persisted.ok) {
    return json({
      ok: false,
      state: "execution_receipt_write_failed",
      error: persisted.error,
      retry_safe: true,
      execution: safeExecutionReceipt(receipt),
      guardrails: p6ExecutionGuardrails(),
    }, 503);
  }

  return json({
    ok: true,
    state: result.status,
    replayed: false,
    mode: draft.mode,
    draft_id: draft.draft_id,
    execution: safeExecutionReceipt(receipt),
    ops_alert: result.ops_alert || null,
    customer_message: clean(result.customer_message, 1200),
    guardrails: p6ExecutionGuardrails(),
  });
}

export async function observeP6Authority(env, receipt = {}, context = {}) {
  const mode = normalizeTransactionMode(receipt.mode);
  if (mode === "payment_proof") {
    const payment = context?.payment_live || context?.payment || {};
    return {
      source: "payments-worker",
      state: payment.paid === true
        ? "paid"
        : payment.review_required === true
          ? "review_required"
          : token(payment.status) || "pending",
      paid: payment.paid === true,
      review_required: payment.review_required === true,
      outstanding_amount_thb: nonNegative(payment.outstanding_amount_thb),
      final_confirmation_observed: payment.paid === true,
      inference_used: false,
    };
  }

  if (mode === "renewal") {
    const entitlement = context?.entitlement_live || context?.entitlement || {};
    return {
      source: "my_mmd_entitlement_resolver_v1",
      membership_level: token(entitlement.membership_level || entitlement.canonical_membership_level),
      lifecycle: token(entitlement.lifecycle || entitlement.status),
      active_through: clean(entitlement.active_through || entitlement.expire_at || entitlement.expires_at, 80),
      renewal_completion_inferred: false,
      final_confirmation_observed: false,
    };
  }

  if (mode === "mms") {
    const ref = clean(receipt.canonical_ref, 180);
    if (!/^mmspre_[a-f0-9]{24}$/.test(ref) || !env.MMS_WORKER?.fetch) {
      return {
        source: "mms-worker",
        state: token(receipt.status) || "unknown",
        final_confirmation_observed: false,
        inference_used: false,
      };
    }
    try {
      const response = await env.MMS_WORKER.fetch(new Request(`https://mms.internal/internal/mms/prebookings/${ref}`, {
        method: "GET",
      }));
      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok === true) {
        return {
          source: "mms-worker",
          state: clean(data?.prebooking?.status, 120) || "unknown",
          sync_status: clean(data?.prebooking?.sync_status, 120),
          final_confirmation_observed: false,
          inference_used: false,
        };
      }
    } catch {}
    return {
      source: "mms-worker",
      state: "unavailable",
      final_confirmation_observed: false,
      inference_used: false,
    };
  }

  if (mode === "booking") {
    return observeExactBookingCorrelation(env, receipt);
  }

  return {
    source: "canonical_authority",
    state: "unknown",
    final_confirmation_observed: false,
    inference_used: false,
  };
}


export async function observeExactBookingCorrelation(env = {}, receipt = {}) {
  const bookingRef = clean(receipt.canonical_ref, 180);
  const fallback = {
    source: "sigil-booking-worker",
    state: token(receipt.status) || "unknown",
    canonical_ref: bookingRef,
    booking_ref: bookingRef || null,
    exact_correlation: false,
    final_confirmation_observed: false,
    correlation_scope: "request_receipt_only",
    inference_used: false,
  };
  if (!bookingRef) return { ...fallback, state: "booking_ref_missing" };
  if (!clean(env.AIRTABLE_BASE_ID, 120) || !clean(env.AIRTABLE_API_KEY, 5000)) {
    return { ...fallback, state: "authority_unavailable" };
  }

  const bookingTable = clean(env.AIRTABLE_TABLE_BOOKING_REQUESTS_ID, 120) || "tblQa2OK4U69eOCRF";
  const sessionTable = clean(env.AIRTABLE_TABLE_SESSIONS, 120) || "tblC98mKWbzmPuNzX";
  const jobsTable = clean(env.AIRTABLE_TABLE_JOBS, 120) || "tbl0jxIjN8QYwGABX";

  const booking = await findExactAirtableRecord(env, bookingTable, "booking_ref", bookingRef);
  if (!booking.ok) {
    return {
      ...fallback,
      state: booking.conflict ? "booking_ref_conflict" : booking.error || "booking_request_unavailable",
      correlation_scope: booking.conflict ? "booking_ref_conflict" : "request_receipt_only",
      conflict: booking.conflict === true,
    };
  }
  if (!booking.record) return { ...fallback, state: "booking_request_not_found" };

  const resolver = parseObject(booking.record.fields?.resolver_payload_json);
  const creationState = token(resolver.job_creation_state);
  const jobReceipt = parseObject(resolver.job_receipt);
  const sessionId = clean(jobReceipt.session_id, 220);

  if (!sessionId) {
    return {
      ...fallback,
      state: creationState || "booking_request_recorded",
      booking_record_id: recordId(booking.record.id) || null,
      correlation_scope: "booking_ref_exact_no_job_receipt",
    };
  }

  const [session, job] = await Promise.all([
    findExactAirtableRecord(env, sessionTable, "session_id", sessionId),
    findExactAirtableRecord(env, jobsTable, "session_id", sessionId),
  ]);

  if (!session.ok || !job.ok) {
    const conflict = session.conflict === true || job.conflict === true;
    return {
      ...fallback,
      state: conflict ? "job_correlation_conflict" : "job_correlation_unavailable",
      booking_record_id: recordId(booking.record.id) || null,
      session_id: sessionId,
      correlation_scope: conflict ? "booking_ref_session_conflict" : "booking_ref_exact_job_read_unavailable",
      conflict,
    };
  }
  if (!session.record || !job.record) {
    return {
      ...fallback,
      state: !session.record ? "canonical_session_not_found" : "canonical_job_not_found",
      booking_record_id: recordId(booking.record.id) || null,
      session_id: sessionId,
      session_record_id: recordId(session.record?.id) || null,
      correlation_scope: "booking_ref_exact_job_missing",
    };
  }

  const sessionFields = session.record.fields || {};
  const jobFields = job.record.fields || {};
  const sessionJobId = clean(sessionFields.job_id, 160);
  const jobId = clean(jobFields.job_id, 160);
  if (sessionJobId && jobId && sessionJobId !== jobId) {
    return {
      ...fallback,
      state: "job_id_mismatch",
      booking_record_id: recordId(booking.record.id) || null,
      session_id: sessionId,
      session_record_id: recordId(session.record.id) || null,
      job_record_id: recordId(job.record.id) || null,
      correlation_scope: "booking_ref_exact_job_id_conflict",
      conflict: true,
    };
  }

  const canonicalJobId = jobId || sessionJobId || null;
  const jobState = token(jobFields.status || jobFields.job_status || jobFields.state);
  const sessionState = token(sessionFields.session_state || sessionFields.status || sessionFields.state);
  return {
    source: "sigil-booking-worker",
    state: jobState || sessionState || creationState || "correlated",
    canonical_ref: bookingRef,
    booking_ref: bookingRef,
    booking_record_id: recordId(booking.record.id) || null,
    session_id: sessionId,
    session_record_id: recordId(session.record.id) || null,
    job_id: canonicalJobId,
    job_record_id: recordId(job.record.id) || null,
    session_state: sessionState || null,
    job_state: jobState || null,
    exact_correlation: true,
    final_confirmation_observed: explicitFinalJobState(jobState),
    correlation_scope: "booking_ref_to_job_exact",
    inference_used: false,
  };
}

async function findExactAirtableRecord(env, table, field, value) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 120);
  const tokenValue = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 5000);
  if (!baseId || !tokenValue || !table || !field || !clean(value, 500)) {
    return { ok: false, error: "airtable_config_missing", record: null, conflict: false };
  }
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("pageSize", "2");
  url.searchParams.set("filterByFormula", `{${field}}=${formulaText(value)}`);
  try {
    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${tokenValue}`, accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: `airtable_read_${response.status}`, record: null, conflict: false };
    const records = Array.isArray(payload.records) ? payload.records : [];
    if (records.length > 1) return { ok: false, error: "exact_record_conflict", record: null, conflict: true };
    return { ok: true, record: records[0] || null, conflict: false };
  } catch {
    return { ok: false, error: "airtable_read_failed", record: null, conflict: false };
  }
}

function explicitFinalJobState(value) {
  return ["confirmed", "final_payment_confirmed", "finished", "completed", "closed"].includes(token(value));
}

function formulaText(value) {
  return `"${clean(value, 500).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function executeP6Lane(env, input = {}) {
  const mode = input.mode;
  if (mode === "booking") return executeP6Booking(env, input);
  if (mode === "mms") return executeP6Mms(env, input);
  if (mode === "payment_proof") return executeP6PaymentProof(input);
  if (mode === "renewal") return executeP6Renewal(input);
  return {
    status: "review_required",
    authority: "canonical_backend_and_per",
    customer_message: "รายการนี้ยังไม่มี supervised execution lane ที่เปิดใช้งานครับ",
  };
}

export async function executeP6Booking(env, input = {}) {
  const f = input.draft.fields || {};
  if (!clean(f.model_preference, 120)) {
    return {
      status: "review_required",
      authority: "sigil-booking-worker",
      canonical_href: "/booking",
      customer_message: "Booking Draft ครบข้อมูลพื้นฐานแล้ว แต่ยังไม่ได้ระบุ Model จึงยัง materialize เป็น canonical booking request ไม่ได้ครับ",
      details: { blocker: "model_preference_required" },
    };
  }

  const action = await executeKenjiLv5SupervisedAction(env, {
    action: "create_booking_request",
    action_id: input.executionId,
    canonical_client_id: input.canonicalClientId,
    line_user_id: input.lineUserId,
    intent: {
      trigger: "hype_p6_supervised_booking",
      model_name: clean(f.model_preference, 120),
      date: clean(f.preferred_date, 20),
      time: clean(f.preferred_time, 8),
      location: clean(f.area, 180),
      raw: "HYPE P6 supervised booking materialization",
    },
  });

  if (action?.ok === true && action?.status === "booking_request_created") {
    return {
      status: "materialized",
      authority: "sigil-booking-worker",
      canonical_ref: clean(action.booking_ref || action.request_session_id, 180),
      canonical_href: "/booking",
      customer_message: "สร้าง canonical Booking Request draft แล้วครับ ยังไม่ใช่การ confirm งาน/Model/Payment",
      ops_alert: {
        flow: "booking",
        title: "HYPE P6 · BOOKING REQUEST MATERIALIZED",
        ref: clean(action.booking_ref || action.request_session_id, 180),
      },
      details: {
        mutation_scope: "booking_request_draft_only",
        final_confirmation: false,
        payment_confirmed: false,
        model_assigned: false,
        calendar_hold_created: false,
      },
    };
  }

  if (action?.status === "action_blocked") {
    return {
      status: "review_required",
      authority: "canonical_backend_and_per",
      canonical_href: "/booking",
      customer_message: "Booking Request ผ่าน supervised gate ไม่ครบครับ ผมเก็บ draft เดิมไว้และส่งต่อให้ MMD ตรวจแทน",
      ops_alert: {
        flow: "booking",
        title: "HYPE P6 · BOOKING REVIEW REQUIRED",
        blockers: Array.isArray(action.blockers) ? action.blockers.slice(0, 8) : [],
      },
      details: { blockers: Array.isArray(action.blockers) ? action.blockers.slice(0, 8) : [] },
    };
  }

  return {
    status: "review_required",
    authority: "canonical_backend_and_per",
    canonical_href: "/booking",
    customer_message: "Booking Request ยังสร้างไม่สำเร็จครับ ผมจะไม่สร้าง Job หรือยืนยัน Model แทนระบบ",
    ops_alert: { flow: "booking", title: "HYPE P6 · BOOKING EXECUTION NEEDS REVIEW" },
    details: { upstream_status: clean(action?.status, 120), retry_safe: action?.retry_safe === true },
  };
}

export async function executeP6Mms(env, input = {}) {
  if (!env.MMS_WORKER?.fetch) {
    return {
      status: "review_required",
      authority: "mms-worker",
      canonical_href: "/male-massage/member/mms-booking",
      customer_message: "MMS canonical worker ยังไม่พร้อมสำหรับ supervised pre-booking ครับ",
      details: { blocker: "mms_service_binding_unavailable" },
    };
  }

  const f = input.draft.fields || {};
  if (clean(f.therapist_preference, 120)) {
    return {
      status: "review_required",
      authority: "mms-worker",
      canonical_href: "/male-massage/member/mms-booking",
      customer_message: "คุณระบุ Therapist preference ไว้ครับ แต่ HYPE ยังไม่มี canonical Therapist ID ที่ยืนยัน จึงส่งให้ MMS ตรวจแทนการเดาหรือทิ้ง preference",
      ops_alert: { flow: "alerts", title: "HYPE P6 · MMS THERAPIST PREFERENCE REVIEW" },
      details: { blocker: "therapist_preference_requires_canonical_resolution" },
    };
  }

  const duration = Number(f.duration_minutes);
  const payload = {
    idempotency_key: input.executionId,
    member_ref: input.canonicalClientId,
    line_user_id: input.lineUserId,
    recipient_gender: clean(f.recipient_gender, 40),
    zone: clean(f.zone, 80),
    service_date: clean(f.service_date, 20),
    service_time: clean(f.service_time, 8),
    ...(Number.isFinite(duration) && duration >= 60 && duration <= 300 ? { duration_minutes: duration } : {}),
    skills: Array.isArray(f.skills) ? f.skills.slice(0, 6) : [],
    requested_therapist_ids: [],
    note: clean(f.note, 800) || "Prepared by HYPE P6. Pre-booking only; Therapist confirmation remains canonical MMS authority.",
    language: "th",
  };

  try {
    const response = await env.MMS_WORKER.fetch(new Request("https://mms.internal/mms/api/prebookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) {
      return {
        status: "review_required",
        authority: "mms-worker",
        canonical_href: "/male-massage/member/mms-booking",
        customer_message: "MMS pre-booking ยังสร้างไม่สำเร็จครับ ผมเก็บ draft เดิมไว้ให้ทีมตรวจ",
        ops_alert: { flow: "alerts", title: "HYPE P6 · MMS PREBOOKING REVIEW REQUIRED" },
        details: { upstream_status: response.status, upstream_code: clean(data?.error?.code || data?.error, 120) },
      };
    }

    const prebookingId = clean(data?.prebooking?.prebooking_id, 180);
    return {
      status: "materialized",
      authority: "mms-worker",
      canonical_ref: prebookingId,
      canonical_href: "/male-massage/member/mms-booking",
      customer_message: "สร้าง MMS canonical pre-booking แล้วครับ ระบบอาจมีตัวเลือก Therapist แต่ยังไม่ถือว่า confirm Therapist/Booking/Payment",
      ops_alert: {
        flow: "alerts",
        title: "HYPE P6 · MMS PREBOOKING MATERIALIZED",
        ref: prebookingId,
      },
      details: {
        duplicate: data?.duplicate === true,
        matched_options_count: Array.isArray(data?.matched_therapist_ids) ? data.matched_therapist_ids.length : 0,
        therapist_confirmed: false,
        booking_confirmed: false,
      },
    };
  } catch {
    return {
      status: "review_required",
      authority: "mms-worker",
      canonical_href: "/male-massage/member/mms-booking",
      customer_message: "MMS pre-booking service ติดต่อไม่ได้ครับ ผมจะไม่ confirm รายการแทนระบบ",
      details: { upstream_status: "unavailable" },
    };
  }
}

export function executeP6PaymentProof(input = {}) {
  const route = input.route || {};
  const ready = route.kind === "signed_payment_proof";
  return {
    status: ready ? "customer_action_required" : "review_required",
    authority: "payments-worker",
    canonical_href: route.href || "/member/payments",
    customer_message: ready
      ? "ผมเตรียม Payment Proof handoff ให้แล้วครับ กรุณาเปิดหน้ารายการจริงเพื่ออัปโหลดหลักฐานเข้า Payment Authority"
      : "ผมยังไม่พบ signed payment intent ของรายการนี้ จึงไม่ย้ายไฟล์ Telegram เข้า Payment Authority แบบเดาครับ",
    ops_alert: {
      flow: "payment",
      title: ready ? "HYPE P6 · PAYMENT PROOF HANDOFF READY" : "HYPE P6 · PAYMENT PROOF NEEDS CANONICAL INTENT",
    },
    details: {
      evidence_present: input.draft.fields?.evidence_present === true,
      raw_media_transferred: false,
      payment_verified: false,
      payment_marked_paid: false,
    },
  };
}

export function executeP6Renewal(input = {}) {
  const route = input.route || {};
  const ready = ["private_renewal_entry", "public_membership_entry"].includes(route.kind);
  return {
    status: ready ? "queued" : "review_required",
    authority: "membership_authority",
    canonical_href: route.href || "/my-mmd/",
    customer_message: ready
      ? "ผมเตรียม Renewal handoff ตามแพ็กเกจปัจจุบันแล้วครับ ขั้นต่อไปต้องเปิดหน้าต่ออายุและให้ Payment/Membership Authority ยืนยัน"
      : "Membership lane ยัง resolve ไม่ครบครับ ผมจะไม่เลือก tier หรือสร้างสิทธิ์ใหม่แทนระบบ",
    ops_alert: {
      flow: "membership",
      title: ready ? "HYPE P6 · RENEWAL INTENT QUEUED" : "HYPE P6 · RENEWAL REVIEW REQUIRED",
    },
    details: {
      package_change_requested: false,
      membership_renewed: false,
      entitlement_granted: false,
    },
  };
}

export async function buildExecutionId(draftId, mode) {
  const digest = await sha256Hex(`${draftId}|${mode}|hype-p6-supervised-execution-v1`);
  return `HYPE-EXEC-${mode.toUpperCase()}-${digest.slice(0, 16)}`;
}

async function writeExecutionReceipt(env, draft, receipt) {
  const recordIdValue = clean(draft.matrix_record_id, 120);
  if (!recordIdValue) return { ok: false, error: "matrix_record_missing" };
  const priorPayload = parseObject(draft.payload);
  const stamp = new Date().toISOString();
  const updatedPayload = {
    ...priorPayload,
    supervised_execution: receipt,
    live_truth_refresh_required: true,
    business_truth_mutated: receipt.business_truth_mutated === true,
    protected_business_truth_mutated: false,
  };
  const write = await airtableWrite(env, "PATCH", {
    records: [{
      id: recordIdValue,
      fields: {
        [F.LAST_KENJI_ACTION]: `hype_supervised_execution:${receipt.mode}`,
        [F.LAST_OUTCOME]: executionOutcomeText(receipt),
        [F.STAGE]: "supervised_execution",
        [F.AWAITING]: executionAwaiting(receipt),
        [F.PENDING_ACTION]: executionPendingAction(receipt),
        [F.PENDING_REF]: receipt.execution_id,
        [F.CONTINUITY]: executionContinuity(receipt),
        [F.TRUTH_REQUIRED]: true,
        [F.TRUTH_DOMAINS]: transactionTruthDomains(receipt.mode),
        [F.UPDATED_AT]: stamp,
        [F.LAST_INTERACTION]: stamp,
        [F.EXPIRES_AT]: new Date(Date.parse(stamp) + MATRIX_TTL_MS).toISOString(),
        [F.PAYLOAD]: JSON.stringify(updatedPayload),
      },
    }],
    typecast: true,
  });
  return write.ok ? { ok: true } : { ok: false, error: write.error || "execution_receipt_write_failed" };
}

export function safeExecutionReceipt(value = {}) {
  const receipt = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    schema: clean(receipt.schema, 80),
    execution_id: clean(receipt.execution_id, 180),
    draft_id: clean(receipt.draft_id, 180),
    mode: normalizeTransactionMode(receipt.mode),
    status: token(receipt.status),
    authority: clean(receipt.authority, 120),
    canonical_ref: clean(receipt.canonical_ref, 180),
    canonical_href: safeCustomerHref(receipt.canonical_href),
    replay_safe: receipt.replay_safe === true,
    created_at: clean(receipt.created_at, 80),
    business_truth_mutated: receipt.business_truth_mutated === true,
    request_level_mutation: receipt.request_level_mutation === true,
    protected_business_truth_mutated: false,
    details: safeExecutionDetails(receipt.details),
  };
}

function safeExecutionDetails(value = {}) {
  const d = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return compactFields({
    blocker: clean(d.blocker, 120),
    blockers: Array.isArray(d.blockers) ? d.blockers.map((x) => clean(x, 120)).filter(Boolean).slice(0, 8) : undefined,
    mutation_scope: clean(d.mutation_scope, 120),
    final_confirmation: d.final_confirmation === true,
    payment_confirmed: d.payment_confirmed === true,
    model_assigned: d.model_assigned === true,
    calendar_hold_created: d.calendar_hold_created === true,
    duplicate: d.duplicate === true,
    matched_options_count: nonNegative(d.matched_options_count),
    therapist_confirmed: d.therapist_confirmed === true,
    booking_confirmed: d.booking_confirmed === true,
    raw_media_transferred: d.raw_media_transferred === true,
    payment_verified: d.payment_verified === true,
    payment_marked_paid: d.payment_marked_paid === true,
    package_change_requested: d.package_change_requested === true,
    membership_renewed: d.membership_renewed === true,
    entitlement_granted: d.entitlement_granted === true,
    retry_safe: d.retry_safe === true,
  });
}

function safeCustomerHref(value) {
  const href = clean(value, 1000);
  if (!href || href.startsWith("//")) return "";
  if (/^\/(?:booking|member\/payments|my-mmd\/|sigil\/member\/membership|pay\/membership|sigil\/pay|pay\/checkout|male-massage\/member\/mms-booking)/.test(href)) return href;
  return "";
}

function executionOutcomeText(receipt = {}) {
  const status = token(receipt.status);
  if (status === "materialized") return "Supervised low-risk request materialized; protected final confirmation still pending.";
  if (status === "queued") return "Supervised intent queued; canonical authority still must complete the transaction.";
  if (status === "customer_action_required") return "Canonical handoff prepared; customer action is required before authority review.";
  return "Supervised execution requires canonical review; no protected truth was changed.";
}

function executionAwaiting(receipt = {}) {
  const status = token(receipt.status);
  if (status === "customer_action_required") return "customer";
  if (receipt.mode === "payment_proof") return "payment_authority";
  if (receipt.mode === "renewal") return "membership_authority";
  if (receipt.mode === "mms") return "mms";
  if (receipt.mode === "booking") return "mmd_review";
  return "canonical_authority";
}

function executionPendingAction(receipt = {}) {
  const status = token(receipt.status);
  if (status === "customer_action_required") return "customer opens canonical submit surface";
  if (status === "materialized") return "canonical authority reviews and continues request";
  if (status === "queued") return "canonical authority processes queued intent";
  return "manual/canonical review required";
}

function executionContinuity(receipt = {}) {
  return [
    `HYPE P6 supervised execution ${receipt.execution_id || ""}.`,
    `Mode ${receipt.mode || "unknown"}, status ${receipt.status || "review_required"}.`,
    "Idempotent receipt recorded. Protected confirmation/payment/membership authority remains unchanged.",
  ].join(" ").slice(0, 1200);
}

export function p6ExecutionGuardrails() {
  return {
    supervised_execution: true,
    idempotent: true,
    request_level_mutation_allowed: true,
    protected_business_truth_mutated: false,
    payment_marked_paid: false,
    payment_verified: false,
    job_confirmed: false,
    model_final_assigned: false,
    calendar_hold_created: false,
    membership_granted: false,
    membership_renewed: false,
    therapist_confirmed: false,
    mms_booking_confirmed: false,
    protected_actions_require_canonical_authority: true,
  };
}

async function readTransactionDraftMatrix(env, lineUserId) {
  const hash = await sha256Hex(`line_ofc:${lineUserId}`);
  const existing = await findMatrix(env, hash);
  if (!existing.ok) return { ok: false, error: existing.error || "matrix_read_failed" };
  const prior = existing.record?.fields || {};
  const payload = parseObject(prior[F.PAYLOAD]);
  const draft = payload.transaction_intake;
  const mode = normalizeTransactionMode(draft?.mode);
  if (!mode || draft?.submitted === true) return { ok: false, error: "transaction_draft_not_found" };
  const merged = mergeTransactionDraft(mode, {}, draft.fields || {});
  return {
    ok: true,
    persisted: true,
    matrix_record_id: clean(existing.record?.id, 120),
    payload,
    draft_id: clean(draft.draft_id, 160) || clean(prior[F.PENDING_REF], 160),
    mode,
    fields: merged.fields,
    missing_fields: merged.missing_fields,
    complete: merged.complete,
  };
}

async function upsertTransactionDraftMatrix(env, input = {}) {
  const hash = await sha256Hex(`line_ofc:${input.lineUserId}`);
  const existing = await findMatrix(env, hash);
  if (!existing.ok) return { ok: false, error: existing.error || "matrix_read_failed" };

  const prior = existing.record?.fields || {};
  const priorPayload = parseObject(prior[F.PAYLOAD]);
  const priorDraft = priorPayload.transaction_intake?.mode === input.mode
    ? priorPayload.transaction_intake
    : {};
  const merged = mergeTransactionDraft(input.mode, priorDraft.fields || {}, input.incoming || {});
  const draftId = clean(priorDraft.draft_id, 160) || await buildTransactionDraftId(input.clientRecordId, input.mode);
  const stamp = new Date().toISOString();
  const version = Math.max(0, Number(prior[F.VERSION]) || 0) + 1;
  const loops = unique([
    ...parseList(prior[F.OPEN_LOOPS]),
    `transaction_intake:${input.mode}`,
    ...merged.missing_fields.map((field) => `missing:${field}`),
  ]);
  const dontAsk = unique([
    ...parseList(prior[F.DONT_ASK]),
    "telegram_identity",
    ...Object.keys(merged.fields).map((field) => `transaction:${input.mode}:${field}`),
  ]);

  const transactionPayload = {
    schema: "mmd.hype_transaction_intake.v1",
    draft_id: draftId,
    mode: input.mode,
    fields: merged.fields,
    missing_fields: merged.missing_fields,
    complete: merged.complete,
    route_kind: clean(input.routeKind, 80),
    source: "telegram_hype",
    updated_at: stamp,
    submitted: false,
    business_truth_mutated: false,
  };

  const fields = {
    [F.MATRIX_ID]: clean(prior[F.MATRIX_ID], 160) || `kcm1_line_${hash.slice(0, 20)}`,
    [F.CLIENT]: [input.clientRecordId],
    [F.SCHEMA]: clean(prior[F.SCHEMA], 80) || "mmd.kenji_conversation_matrix.v1",
    [F.HASH]: hash,
    [F.CHANNEL]: "telegram_hype",
    [F.SCOPE]: clean(prior[F.SCOPE], 160) || `cross_channel:${hash.slice(0, 20)}`,
    [F.TOPIC]: transactionTopic(input.mode),
    [F.SUBTOPIC]: `transaction_intake:${input.mode}`,
    [F.RELATIONSHIP]: clean(prior[F.RELATIONSHIP], 120) || "known_customer",
    [F.LAST_INTENT]: `transaction_intake:${input.mode}`,
    [F.LAST_REQUEST]: input.customerMessage || `HYPE transaction intake: ${input.mode}`,
    [F.LAST_CUSTOMER_ACTION]: `provided_transaction_details:${input.mode}`,
    [F.LAST_KENJI_ACTION]: merged.complete ? "transaction_draft_ready_for_customer_submit" : "transaction_draft_collecting",
    [F.LAST_OUTCOME]: "Draft prepared only; canonical submit still requires customer action and backend authority.",
    [F.STAGE]: "transaction_intake",
    [F.AWAITING]: merged.complete ? "customer_submit" : "customer",
    [F.PENDING_ACTION]: merged.complete
      ? "open canonical submit surface"
      : `collect missing fields: ${merged.missing_fields.join(", ")}`,
    [F.PENDING_REF]: draftId,
    [F.CONTINUITY]: buildTransactionContinuitySummary(input.mode, merged),
    [F.DONT_ASK]: JSON.stringify(dontAsk),
    [F.OPEN_LOOPS]: JSON.stringify(loops),
    [F.TRUTH_REQUIRED]: true,
    [F.TRUTH_DOMAINS]: transactionTruthDomains(input.mode),
    [F.LAST_EVENT]: clean(prior[F.LAST_EVENT], 160),
    [F.LAST_INTERACTION]: stamp,
    [F.UPDATED_AT]: stamp,
    [F.EXPIRES_AT]: new Date(Date.parse(stamp) + MATRIX_TTL_MS).toISOString(),
    [F.STATUS]: "active",
    [F.VERSION]: version,
    [F.PAYLOAD]: JSON.stringify({
      ...priorPayload,
      runtime_schema: clean(priorPayload.runtime_schema, 120) || "mmd.hype_cross_channel_continuity.v1",
      source: "telegram_hype",
      display_name: clean(input.displayName, 120),
      transaction_intake: transactionPayload,
      live_truth_refresh_required: true,
      business_truth_mutated: false,
    }),
  };

  const write = existing.record
    ? await airtableWrite(env, "PATCH", { records: [{ id: existing.record.id, fields }], typecast: true })
    : await airtableWrite(env, "POST", { records: [{ fields }], typecast: true });
  if (!write.ok) return { ok: false, error: write.error || "matrix_write_failed" };
  const row = Array.isArray(write.payload?.records) ? write.payload.records[0] : null;
  return {
    ok: true,
    persisted: true,
    record_id: clean(row?.id || existing.record?.id, 120),
    version,
    draft_id: draftId,
    mode: input.mode,
    fields: merged.fields,
    missing_fields: merged.missing_fields,
    complete: merged.complete,
  };
}

function normalizeTransactionMode(value) {
  const mode = token(value);
  return ["booking", "payment_proof", "renewal", "mms"].includes(mode) ? mode : "";
}

export function normalizeTransactionFields(mode, value = {}) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (mode === "booking") {
    return compactFields({
      service_intent: token(input.service_intent),
      preferred_date: isoDateLoose(input.preferred_date || input.date),
      preferred_time: hhmmLoose(input.preferred_time || input.time),
      area: clean(input.area || input.location, 180),
      duration: clean(input.duration, 80),
      model_preference: clean(input.model_preference || input.model_name, 120),
      request_note: clean(input.request_note || input.note, 800),
    });
  }
  if (mode === "payment_proof") {
    return compactFields({
      evidence_present: input.evidence_present === true,
      evidence_type: token(input.evidence_type),
      customer_note: clean(input.customer_note || input.note, 500),
    });
  }
  if (mode === "renewal") {
    return compactFields({
      intent: "renew",
      customer_note: clean(input.customer_note || input.note, 500),
    });
  }
  if (mode === "mms") {
    return compactFields({
      recipient_gender: normalizeRecipientGender(input.recipient_gender),
      zone: token(input.zone),
      service_date: isoDateLoose(input.service_date || input.date),
      service_time: hhmmLoose(input.service_time || input.time),
      duration_minutes: boundedDuration(input.duration_minutes),
      skills: normalizeSkills(input.skills),
      therapist_preference: clean(input.therapist_preference || input.therapist_name, 120),
      note: clean(input.note, 800),
    });
  }
  return {};
}

export function mergeTransactionDraft(mode, previous = {}, incoming = {}) {
  const fields = normalizeTransactionFields(mode, { ...previous, ...incoming });
  const missing = transactionMissingFields(mode, fields);
  return { fields, missing_fields: missing, complete: missing.length === 0 };
}

function transactionMissingFields(mode, fields = {}) {
  if (mode === "booking") {
    const missing = [];
    if (!fields.service_intent) missing.push("service_intent");
    if (!fields.preferred_date) missing.push("preferred_date");
    if (!fields.preferred_time) missing.push("preferred_time");
    if (!fields.area) missing.push("area");
    return missing;
  }
  if (mode === "payment_proof") {
    return fields.evidence_present === true ? [] : ["payment_evidence"];
  }
  if (mode === "renewal") return [];
  if (mode === "mms") {
    const missing = [];
    if (!fields.recipient_gender) missing.push("recipient_gender");
    if (!fields.zone) missing.push("zone");
    if (!fields.service_date) missing.push("service_date");
    if (!fields.service_time) missing.push("service_time");
    if (!Array.isArray(fields.skills) || !fields.skills.length) missing.push("skills");
    return missing;
  }
  return ["transaction_mode"];
}

export function canonicalTransactionRoute(mode, context = {}) {
  if (mode === "booking") return { href: "/booking", kind: "booking_entry" };
  if (mode === "renewal") {
    const level = token(context?.entitlement?.membership_level || context?.entitlement?.canonical_membership_level || context?.entitlement_live?.membership_level || context?.entitlement_live?.canonical_membership_level);
    if (["private_standard", "private_premium", "standard", "premium", "vip", "svip", "black_card", "blackcard"].includes(level)) {
      return { href: "/sigil/member/membership?intent=renew", kind: "private_renewal_entry" };
    }
    if (["public_member", "member", "elite", "red_card"].includes(level)) {
      return { href: "/pay/membership", kind: "public_membership_entry" };
    }
    return { href: "/my-mmd/", kind: "membership_resolution_required" };
  }
  if (mode === "mms") return { href: "/male-massage/member/mms-booking", kind: "mms_prebooking_entry" };
  if (mode === "payment_proof") {
    const signed = signedPaymentHref(context?.next_actions);
    if (signed) return { href: signed, kind: "signed_payment_proof" };
    return { href: "/member/payments", kind: "payment_status_resume" };
  }
  return { href: "/my-mmd/", kind: "my_mmd" };
}

function signedPaymentHref(actions) {
  for (const action of Array.isArray(actions) ? actions : []) {
    const raw = clean(action?.href, 1200);
    if (!raw) continue;
    let path = raw;
    try {
      const u = new URL(raw, "https://mmdbkk.com");
      if (!["mmdbkk.com", "www.mmdbkk.com"].includes(u.hostname)) continue;
      path = `${u.pathname}${u.search}`;
    } catch {}
    if (/^\/sigil\/pay\?[^#]*\bt=[A-Za-z0-9._~-]+/.test(path)) return path;
    if (/^\/pay\/checkout\?[^#]*\bt=[A-Za-z0-9._~-]+/.test(path)) return path;
  }
  return "";
}

function canonicalSubmitReady(mode, draft, context, route) {
  if (mode === "payment_proof") {
    if (context?.payment?.paid === true || context?.payment_live?.paid === true || context?.payment?.review_required === true || context?.payment_live?.review_required === true) return false;
    return draft.complete === true && route.kind === "signed_payment_proof";
  }
  if (mode === "renewal") {
    const lifecycle = token(context?.entitlement?.lifecycle || context?.entitlement?.status || context?.entitlement_live?.lifecycle || context?.entitlement_live?.status);
    if (["blocked", "suspended", "revoked"].includes(lifecycle)) return false;
    return route.kind === "private_renewal_entry" || route.kind === "public_membership_entry";
  }
  return draft.complete === true;
}

function transactionState(mode, draft, context, route) {
  if (mode === "payment_proof" && (context?.payment?.paid === true || context?.payment_live?.paid === true)) return "already_paid";
  if (mode === "payment_proof" && (context?.payment?.review_required === true || context?.payment_live?.review_required === true)) return "payment_review_pending";
  if (!draft.complete) return "collecting";
  if (mode === "payment_proof" && route.kind !== "signed_payment_proof") return "payment_intent_required";
  if (!canonicalSubmitReady(mode, draft, context, route)) return "canonical_review_required";
  return "ready_for_customer_submit";
}

function transactionIntentType(mode) {
  return ({
    booking: "booking",
    payment_proof: "payment_status",
    renewal: "membership_renewal",
    mms: "mms_booking",
  })[mode] || "general";
}

function transactionTopic(mode) {
  return ({
    booking: "booking",
    payment_proof: "payment",
    renewal: "membership",
    mms: "mms",
  })[mode] || "account_status";
}

function transactionTruthDomains(mode) {
  return ({
    booking: ["identity", "membership", "job", "calendar"],
    payment_proof: ["identity", "payment", "job"],
    renewal: ["identity", "membership", "payment"],
    mms: ["identity", "membership", "mms"],
  })[mode] || ["identity"];
}

function buildTransactionContinuitySummary(mode, merged) {
  const labels = {
    booking: "Booking intake",
    payment_proof: "Payment proof intake",
    renewal: "Membership renewal intake",
    mms: "MMS pre-booking intake",
  };
  const parts = [
    `${labels[mode] || "Transaction intake"} draft is ${merged.complete ? "complete" : "collecting"}.`,
    merged.missing_fields.length ? `Missing: ${merged.missing_fields.join(", ")}.` : "Required intake fields captured.",
    "Draft only; customer must complete the canonical submit step and backend authority remains unchanged.",
  ];
  return parts.join(" ").slice(0, 1200);
}

export function transactionGuardrails() {
  return {
    draft_only: true,
    business_truth_mutated: false,
    payment_mutated: false,
    payment_verified: false,
    job_confirmed: false,
    model_assigned: false,
    membership_renewed: false,
    membership_granted: false,
    mms_booking_confirmed: false,
    customer_submit_required: true,
    canonical_backend_authority_required: true,
    raw_payment_media_persisted: false,
  };
}

async function buildTransactionDraftId(clientId, mode) {
  const digest = await sha256Hex(`${clientId}|${mode}|hype-transaction-draft-v1`);
  return `HYPE-DRAFT-${mode.toUpperCase()}-${digest.slice(0, 12)}`;
}

function compactFields(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (item === "" || item === null || item === undefined) return false;
    if (Array.isArray(item) && item.length === 0) return false;
    return true;
  }));
}

function isoDateLoose(value) {
  const raw = clean(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function hhmmLoose(value) {
  const raw = clean(value, 8);
  if (!/^\d{2}:\d{2}$/.test(raw)) return "";
  const [h, m] = raw.split(":").map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 ? raw : "";
}

function boundedDuration(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 60 && n <= 300 ? Math.round(n) : undefined;
}

function normalizeRecipientGender(value) {
  const v = token(value);
  if (["male", "female", "other", "prefer_not_to_say"].includes(v)) return v;
  return "";
}

function normalizeSkills(value) {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return unique(rows.map((item) => token(item)).filter(Boolean)).slice(0, 6);
}

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const raw = clean(value, 12000);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function upsertContinuityMatrix(env, input = {}) {
  const hash = await sha256Hex(`line_ofc:${input.lineUserId}`);
  const existing = await findMatrix(env, hash);
  if (!existing.ok) return { ok: false, error: existing.error || "matrix_read_failed" };

  const prior = existing.record?.fields || {};
  const priorPayload = parseObject(prior[F.PAYLOAD]);
  const priorTracking = parseObject(priorPayload.handoff_tracking);
  const stamp = new Date().toISOString();
  const handoff = input.handoff;
  const tracking = handoff
    ? { id: handoff.id, target: handoff.target, state: "prepared", updated_at: stamp, actor_role: "hype" }
    : priorTracking;
  const version = Math.max(0, Number(prior[F.VERSION]) || 0) + 1;
  const existingLoops = parseList(prior[F.OPEN_LOOPS]);
  const existingDontAsk = parseList(prior[F.DONT_ASK]);
  const loops = unique([
    ...existingLoops,
    ...openLoopsFromProjection(input.projection),
    ...(input.recoveryCorrelation ? ["service_recovery"] : []),
    ...(input.recoveryCorrelation?.correlated === true ? ["shop_recovery"] : []),
    ...(handoff ? ["human_handoff"] : []),
  ]);
  const dontAsk = unique([
    ...existingDontAsk,
    "telegram_identity",
    ...(input.customerMessage ? ["latest_customer_request"] : []),
    ...(input.recoveryCorrelation?.correlated === true ? ["shop_order_reference"] : []),
  ]);
  const stage = handoff ? "handoff" : deriveStage(input.projection);
  const targetLabel = handoff?.target === "kenji" ? "Kenji" : handoff?.target === "per" ? "Per" : "none";
  const summary = buildContinuitySummary({
    command: input.command,
    projection: input.projection,
    handoff,
  });

  const fields = {
    [F.MATRIX_ID]: clean(prior[F.MATRIX_ID], 160) || `kcm1_line_${hash.slice(0, 20)}`,
    [F.CLIENT]: [input.clientRecordId],
    [F.SCHEMA]: clean(prior[F.SCHEMA], 80) || "mmd.kenji_conversation_matrix.v1",
    [F.HASH]: hash,
    [F.CHANNEL]: "telegram_hype",
    [F.SCOPE]: clean(prior[F.SCOPE], 160) || `cross_channel:${hash.slice(0, 20)}`,
    [F.TOPIC]: topicForCommand(input.command),
    [F.SUBTOPIC]: clean(input.command, 80),
    [F.RELATIONSHIP]: clean(prior[F.RELATIONSHIP], 120) || "known_customer",
    [F.LAST_INTENT]: clean(input.command, 120) || "general",
    [F.LAST_REQUEST]: input.customerMessage || `HYPE command: ${clean(input.command, 80)}`,
    [F.LAST_CUSTOMER_ACTION]: handoff ? `requested_handoff:${handoff.target}` : `hype_command:${clean(input.command, 80)}`,
    [F.LAST_KENJI_ACTION]: handoff ? "handoff_context_prepared" : "hype_context_recorded",
    [F.LAST_OUTCOME]: handoff
      ? "handoff_pending; protected current truth must be refreshed before action"
      : "HYPE read-only status delivered; no business truth changed",
    [F.STAGE]: stage,
    [F.AWAITING]: handoff ? (handoff.target === "per" ? "mmd_review" : "kenji") : awaitingFromProjection(input.projection),
    [F.PENDING_ACTION]: handoff
      ? `resume conversation with ${targetLabel} using continuity context; refresh live truth first`
      : pendingActionFromProjection(input.projection),
    [F.PENDING_REF]: handoff?.id || clean(prior[F.PENDING_REF], 160),
    [F.CONTINUITY]: summary,
    [F.DONT_ASK]: JSON.stringify(dontAsk),
    [F.OPEN_LOOPS]: JSON.stringify(loops),
    [F.HANDOFF_REQUIRED]: Boolean(handoff),
    [F.HANDOFF_OWNER]: targetLabel,
    [F.HANDOFF_REASON]: handoff?.reason || "",
    [F.TRUTH_REQUIRED]: true,
    [F.TRUTH_DOMAINS]: truthDomainsFor(input.command, input.projection),
    [F.LAST_EVENT]: clean(prior[F.LAST_EVENT], 160),
    [F.LAST_INTERACTION]: stamp,
    [F.UPDATED_AT]: stamp,
    [F.EXPIRES_AT]: new Date(Date.parse(stamp) + MATRIX_TTL_MS).toISOString(),
    [F.STATUS]: "active",
    [F.VERSION]: version,
    [F.PAYLOAD]: JSON.stringify({
      ...priorPayload,
      runtime_schema: "mmd.hype_cross_channel_continuity.v1",
      source: "telegram_hype",
      command: clean(input.command, 80),
      handoff_id: handoff?.id || clean(priorPayload.handoff_id, 180) || null,
      handoff_target: handoff?.target || clean(priorPayload.handoff_target, 40) || null,
      handoff_tracking: Object.keys(tracking).length ? tracking : null,
      display_name: clean(input.displayName, 120),
      projection: input.projection,
      recovery_correlation: input.recoveryCorrelation || priorPayload.recovery_correlation || null,
      live_truth_refresh_required: true,
      business_truth_mutated: false,
    }),
  };

  const write = existing.record
    ? await airtableWrite(env, "PATCH", { records: [{ id: existing.record.id, fields }], typecast: true })
    : await airtableWrite(env, "POST", { records: [{ fields }], typecast: true });
  if (!write.ok) return { ok: false, error: write.error || "matrix_write_failed" };
  const row = Array.isArray(write.payload?.records) ? write.payload.records[0] : null;
  return { ok: true, record_id: clean(row?.id || existing.record?.id, 120), version };
}

function normalizeProjection(value) {
  const p = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const membership = p.membership || {};
  const job = p.job || {};
  const payment = p.payment || {};
  const next = p.next_action || {};
  return {
    state: token(p.state),
    membership: {
      level: token(membership.level),
      lifecycle: token(membership.lifecycle || membership.status),
      blocked: membership.blocked === true,
    },
    job: {
      active_count: nn(job.active_count),
      next_status: token(job.next?.status),
      model_name: clean(job.next?.model_name, 120),
      start_at: clean(job.next?.start_at, 80),
      payment_state: token(job.next?.payment_state),
    },
    payment: {
      status: token(payment.status),
      paid: payment.paid === true,
      review_required: payment.review_required === true,
      outstanding_amount_thb: nonNegative(payment.outstanding_amount_thb),
      credit_balance_thb: nonNegative(payment.credit_balance_thb),
    },
    next_action: {
      action: token(next.action),
      label: clean(next.label, 140),
    },
  };
}

function buildCanonicalHandoffProjection(context = {}) {
  return normalizeProjection({
    state: context.live_truth_complete === true ? "ready" : "partial",
    membership: {
      level: context?.entitlement?.membership_level || context?.entitlement?.canonical_membership_level,
      lifecycle: context?.entitlement?.lifecycle || context?.entitlement?.status,
      blocked: context?.entitlement?.blocked === true,
    },
    job: {
      active_count: Array.isArray(context?.job?.active_jobs) ? context.job.active_jobs.length : 0,
      next: Array.isArray(context?.job?.active_jobs) ? context.job.active_jobs[0] : null,
    },
    payment: context?.payment || {},
    next_action: Array.isArray(context?.next_actions) ? context.next_actions[0] : null,
  });
}

function deriveStage(p = {}) {
  if (p.payment.review_required) return "awaiting_payment_verification";
  if (p.membership.blocked) return "awaiting_entitlement_refresh";
  if (p.job.active_count > 0) return "in_progress";
  return "active";
}

function awaitingFromProjection(p = {}) {
  if (p.payment.review_required) return "payment_authority";
  if (p.membership.blocked) return "entitlement_authority";
  return "none";
}

function pendingActionFromProjection(p = {}) {
  if (p.payment.review_required) return "refresh payment truth before continuing";
  if (p.membership.blocked) return "refresh entitlement truth before continuing";
  if (p.next_action.label) return p.next_action.label;
  if (p.job.active_count > 0) return "continue current job context";
  return "continue current conversation";
}

function openLoopsFromProjection(p = {}) {
  const out = [];
  if (p.payment.review_required) out.push("payment_verification");
  if (p.membership.blocked) out.push("entitlement_review");
  if (p.job.active_count > 0) out.push("active_job");
  if (p.next_action.action) out.push(`next:${p.next_action.action}`);
  return out;
}

function truthDomainsFor(command, p = {}) {
  const domains = ["identity"];
  if (["status", "next", "handoff", "kenji", "human", "recovery"].includes(command)) domains.push("membership", "job", "payment");
  if (command === "recovery") domains.push("shop_order", "shop_payment", "shop_fulfillment");
  if (command === "booking") domains.push("job", "calendar");
  if (command === "payment") domains.push("payment");
  if (p.membership.level || p.membership.lifecycle) domains.push("membership");
  if (p.job.active_count > 0) domains.push("job");
  if (p.payment.status || p.payment.review_required || p.payment.paid) domains.push("payment");
  return unique(domains);
}

function topicForCommand(command) {
  if (command === "recovery") return "service_recovery";
  if (command === "payment") return "payment";
  if (command === "booking") return "booking";
  if (command === "next") return "next_action";
  if (["kenji", "human", "handoff"].includes(command)) return "human_handoff";
  return "account_status";
}

function buildContinuitySummary({ command, projection, handoff, recoveryCorrelation }) {
  const chunks = [
    `HYPE ${clean(command, 80) || "status"} context.`,
    projection.membership.level ? `Membership ${projection.membership.level}/${projection.membership.lifecycle || "unknown"}.` : "",
    projection.job.active_count ? `${projection.job.active_count} active/pending job(s)${projection.job.model_name ? ` with ${projection.job.model_name}` : ""}.` : "No active job confirmed in this snapshot.",
    projection.payment.review_required
      ? "Payment proof is awaiting canonical review."
      : projection.payment.paid
        ? "Payment is canonically marked paid."
        : projection.payment.status
          ? `Payment state ${projection.payment.status}.`
          : "",
    projection.next_action.label ? `Next action: ${projection.next_action.label}.` : "",
    recoveryCorrelation?.correlated === true
      ? `Shop recovery linked to Order ${clean(recoveryCorrelation.order_id, 180)}; payment=${clean(recoveryCorrelation.payment_status, 80) || "unknown"}; fulfillment=${clean(recoveryCorrelation.fulfillment_state, 80) || "unknown"}; Case Ref ${clean(recoveryCorrelation.case_ref, 180)}.`
      : recoveryCorrelation?.state === "ambiguous"
        ? "Shop recovery detected but multiple owned Order candidates exist; do not guess the Order reference."
        : "",
    handoff ? `Customer requested supervised handoff to ${handoff.target}; do not ask them to restart the story. Refresh live truth before acting.` : "",
  ].filter(Boolean);
  return chunks.join(" ").slice(0, 1200);
}

function buildOperatorSummary({ target, displayName, customerMessage, projection, handoffId, recoveryCorrelation }) {
  const lines = [
    `HYPE → ${target === "kenji" ? "Kenji" : "Per"} handoff`,
    `Ref: ${handoffId}`,
    `Client: ${clean(displayName, 120) || "Canonical Client"}`,
    customerMessage ? `Latest request: ${customerMessage}` : "",
    projection.membership.level ? `Membership: ${projection.membership.level} · ${projection.membership.lifecycle || "unknown"}` : "",
    projection.job.active_count ? `Job: ${projection.job.active_count} active/pending · ${projection.job.model_name || "-"} · ${projection.job.next_status || "unknown"}` : "Job: no active job in current snapshot",
    `Payment: ${projection.payment.paid ? "paid" : projection.payment.review_required ? "review_required" : projection.payment.status || "unknown"}`,
    projection.next_action.label ? `Next: ${projection.next_action.label}` : "",
    recoveryCorrelation?.correlated === true
      ? `Shop Recovery: Order ${clean(recoveryCorrelation.order_id, 180)} · Payment ${clean(recoveryCorrelation.payment_status, 80) || "unknown"} · Fulfillment ${clean(recoveryCorrelation.fulfillment_state, 80) || "unknown"} · Case ${clean(recoveryCorrelation.case_ref, 180) || handoffId}`
      : recoveryCorrelation?.state === "ambiguous"
        ? `Shop Recovery: ambiguous (${Number(recoveryCorrelation.candidate_count) || 0} owned candidates) · ask customer to choose Order ID`
        : "",
    "Context is continuity-only. Refresh canonical truth before any protected action.",
  ].filter(Boolean);
  return lines.join("\n").slice(0, 1800);
}

async function buildShopRecoveryCorrelation(env, telegramUserId, customerMessage) {
  const message = clean(customerMessage, 500);
  if (!isShopRecoveryMessage(message)) return null;

  const requestedOrderId = extractShopOrderId(message);
  const read = await readBoundedShopOrdersForTelegram(env, telegramUserId, requestedOrderId);
  if (read.status !== 200 || read.body?.ok !== true) {
    return {
      domain: "mmd_shop",
      state: read.body?.state === "review_required" ? "review_required" : "unavailable",
      correlated: false,
      candidate_count: 0,
      method: "canonical_read_failed",
    };
  }

  const correlation = read.body.correlation || {};
  const candidateOrderId = clean(correlation.candidate_order_id, 180);
  if (correlation.auto_correlation_allowed !== true || !candidateOrderId) {
    return {
      domain: "mmd_shop",
      state: Number(correlation.candidate_count) > 1 ? "ambiguous" : "unmatched",
      correlated: false,
      candidate_count: Number(correlation.candidate_count) || 0,
      method: clean(correlation.method, 120) || "none",
    };
  }

  const order = (Array.isArray(read.body.orders) ? read.body.orders : [])
    .find((item) => clean(item?.order_id, 180) === candidateOrderId);
  if (!order) {
    return {
      domain: "mmd_shop",
      state: "unmatched",
      correlated: false,
      candidate_count: Number(correlation.candidate_count) || 0,
      method: "candidate_not_in_projection",
    };
  }

  return {
    domain: "mmd_shop",
    state: "correlated",
    correlated: true,
    method: clean(correlation.method, 120),
    order_id: candidateOrderId,
    order_status: token(order.order_status),
    payment_status: token(order.payment_status),
    fulfillment_state: token(order.fulfillment?.state),
    delivery_method: token(order.fulfillment?.delivery_method),
    courier: clean(order.fulfillment?.courier, 180) || null,
    tracking_number: clean(order.fulfillment?.tracking_number, 220) || null,
    total_thb: nonNegative(order.total_thb),
    candidate_count: Number(correlation.candidate_count) || 1,
    source_authority: clean(read.body.authority, 160) || "member-pages-worker",
    live_truth_refresh_required: true,
  };
}

function isShopRecoveryMessage(value) {
  const text = clean(value, 500).toLowerCase();
  const shop = /(?:mmd\s*shop|shop|order|ออเดอร์|ออร์เดอร์|คำสั่งซื้อ|gg\s*water|ของที่สั่ง|พัสดุ|tracking|จัดส่ง|ส่งของ)/i.test(text);
  const problem = /(?:ปัญหา|ยังไม่|ไม่ถึง|ไม่ได้รับ|ผิด|หาย|ช้า|มาช้า|สถานะ|refund|คืนเงิน|complaint|ร้องเรียน|ติดตาม|ถึงไหน)/i.test(text);
  return shop && problem;
}

function extractShopOrderId(value) {
  const text = clean(value, 500);
  const patterns = [
    /(?:order|ออเดอร์|ออร์เดอร์|คำสั่งซื้อ)\s*(?:id|ref|#|เลข)?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9_-]{3,79})/i,
    /\b(MMD[-_][A-Za-z0-9_-]{3,76})\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return clean(match[1], 180);
  }
  return "";
}

async function findMatrix(env, hash) {
  const config = airtableConfig(env);
  if (!config.ok) return config;
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.table)}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", `{${F.HASH}}="${escapeFormula(hash)}"`);
  try {
    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: `airtable_read_${response.status}` };
    return { ok: true, record: Array.isArray(payload.records) ? payload.records[0] || null : null };
  } catch {
    return { ok: false, error: "airtable_read_failed" };
  }
}


async function findMatrixByPendingRef(env, handoffId) {
  const config = airtableConfig(env);
  if (!config.ok) return config;
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.table)}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", `{${F.PENDING_REF}}="${escapeFormula(handoffId)}"`);
  try {
    const response = await fetch(url.toString(), {
      headers: { authorization: `Bearer ${config.token}`, accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: `airtable_read_${response.status}` };
    return { ok: true, record: Array.isArray(payload.records) ? payload.records[0] || null : null };
  } catch {
    return { ok: false, error: "airtable_read_failed" };
  }
}

function handoffTrackingFromRecord(record = {}) {
  const fields = record.fields || {};
  const payload = parseObject(fields[F.PAYLOAD]);
  const tracking = parseObject(payload.handoff_tracking);
  const pendingRef = clean(fields[F.PENDING_REF], 180);
  const id = clean(tracking.id || payload.handoff_id || pendingRef, 180);
  if (!/^HYPE-(?:PER|KENJI)-\d{14}-[a-f0-9]{8}$/i.test(id)) return {};
  return {
    id,
    target: normalizeTarget(tracking.target || payload.handoff_target) || normalizeTargetFromHandoffId(id),
    state: token(tracking.state) || (clean(fields[F.LAST_OUTCOME]).includes("handoff_pending") ? "prepared" : ""),
    updated_at: clean(tracking.updated_at || fields[F.UPDATED_AT], 80),
    actor_role: token(tracking.actor_role),
  };
}

function normalizeTargetFromHandoffId(value) {
  const match = /^HYPE-(PER|KENJI)-/i.exec(clean(value, 180));
  return match ? match[1].toLowerCase() : "";
}

function handoffTransitionAllowed(current, next) {
  const order = ["prepared", "sent", "acknowledged", "reviewing", "resolved", "customer_notified"];
  const from = order.indexOf(token(current));
  const to = order.indexOf(token(next));
  if (from < 0 || to < 0) return false;
  return to >= from;
}

function handoffOutcome(state) {
  if (state === "sent") return "handoff sent to owning operations lane";
  if (state === "acknowledged") return "handoff acknowledged by owning operator";
  if (state === "reviewing") return "handoff under operator review";
  if (state === "resolved") return "handoff marked resolved by owning operator; customer notification not yet confirmed";
  if (state === "customer_notified") return "handoff resolved and customer notification confirmed";
  return "handoff pending";
}

function handoffStatusGuardrails() {
  return {
    conversation_state_only: true,
    protected_business_truth_mutated: false,
    payment_mutated: false,
    job_mutated: false,
    entitlement_mutated: false,
    state_requires_explicit_operator_write: true,
  };
}

async function airtableWrite(env, method, body) {
  const config = airtableConfig(env);
  if (!config.ok) return config;
  try {
    const response = await fetch(
      `${AIRTABLE_API}/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.table)}`,
      {
        method,
        headers: {
          authorization: `Bearer ${config.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const payload = await response.json().catch(() => ({}));
    return response.ok
      ? { ok: true, payload }
      : { ok: false, error: `airtable_write_${response.status}` };
  } catch {
    return { ok: false, error: "airtable_write_failed" };
  }
}

function airtableConfig(env) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 80);
  const tokenValue = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 1000);
  const table = clean(env.AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID, 120) || MATRIX_TABLE_FALLBACK;
  if (!baseId || !tokenValue || !table) return { ok: false, error: "airtable_config_missing" };
  return { ok: true, baseId, token: tokenValue, table };
}

async function buildHandoffId(clientId, target) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const digest = await sha256Hex(`${clientId}|${target}|${stamp}`);
  return `HYPE-${target.toUpperCase()}-${stamp}-${digest.slice(0, 8)}`;
}

function validateRequest(request, expectedPath) {
  let url;
  try { url = new URL(request.url); } catch { return json({ ok: false, error: "invalid_request" }, 400); }
  if (url.pathname !== expectedPath) return json({ ok: false, error: "not_found" }, 404);
  if (url.hostname !== "admin-worker.internal") return json({ ok: false, error: "internal_only" }, 403);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (clean(request.headers.get("x-mmd-service-binding"), 80) !== "telegram-worker") {
    return json({ ok: false, error: "internal_caller_invalid" }, 403);
  }
  return null;
}

async function readBody(request) {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? body : null;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(clean(value, 1000));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function parseList(value) {
  if (Array.isArray(value)) return value.map((x) => clean(x, 160)).filter(Boolean);
  const raw = clean(value, 3000);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x) => clean(x, 160)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function unique(values) {
  return [...new Set(values.map((x) => clean(x, 160)).filter(Boolean))];
}

function normalizeTarget(value) {
  const target = token(value);
  if (["kenji", "per"].includes(target)) return target;
  return "";
}

function lineId(value) {
  const id = clean(value, 80);
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function telegramId(value) {
  const id = clean(value, 40);
  return /^\d{5,20}$/.test(id) ? id : "";
}

function recordId(value) {
  const id = clean(value, 80);
  return /^rec[A-Za-z0-9]+$/.test(id) ? id : "";
}

function escapeFormula(value) {
  return clean(value, 500).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function nn(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function token(value) {
  return clean(value, 160).toLowerCase().normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-mmd-hype-handoff": "supervised-v1",
    },
  });
}
