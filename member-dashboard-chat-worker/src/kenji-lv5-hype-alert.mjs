function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function eventRef(event = {}) {
  return text(event?.message?.id || event?.webhookEventId || event?.replyToken, 120);
}

function routeForDecision(env = {}, decision = {}) {
  const primary = text(decision?.operational?.primary_action, 80);
  const modelStatus = text(decision?.operational?.model_access_status, 80);
  const source = text(decision?.reply_source, 120);
  const reason = text(decision?.handoff_reason, 500);

  if (primary === "review_payment" || /payment_review|required.*payment|payment_match/i.test(reason)) {
    return {
      event: "payment_match_uncertain",
      flow: "payment_proof",
      thread_id: Number(env.TELEGRAM_PAYMENT_THREAD_ID || env.TG_THREAD_PAYMENTS_CONFIRM || env.TG_THREAD_PAYMENT || 22) || 22,
      action: "Review Payment Inbox; do not change money/access from LINE reply.",
    };
  }
  if (primary === "resolve_identity" || /canonical_client|client_360|identity/i.test(reason)) {
    return {
      event: "identity_client_verification_failed",
      flow: "alert",
      thread_id: Number(env.TELEGRAM_ALERTS_THREAD_ID || env.TG_THREAD_ALERTS || 9) || 9,
      action: "Resolve Canonical Client / Per Rename before operational continuation.",
    };
  }
  if (primary === "handoff_per" || ["renewal", "verification_required", "silent"].includes(modelStatus) || /membership|entitlement|model_access/i.test(reason)) {
    return {
      event: "membership_review_required",
      flow: "membership",
      thread_id: Number(env.TELEGRAM_MEMBERSHIP_THREAD_ID || env.TG_THREAD_PAYMENTS_MEMBERSHIP || env.TG_THREAD_MEMBERSHIP || 20) || 20,
      action: "Review membership/model entitlement; do not widen visibility from Telegram.",
    };
  }
  if (source === "lv5_live_fanin_degraded" || /unavailable|degraded/i.test(reason)) {
    return {
      event: "auth_system_degraded",
      flow: "alert",
      thread_id: Number(env.TELEGRAM_ALERTS_THREAD_ID || env.TG_THREAD_ALERTS || 9) || 9,
      action: "Inspect LV5 live truth sources; no protected mutation was made.",
    };
  }
  return null;
}

export async function notifyKenjiLv5Hype(env = {}, event = {}, decision = {}) {
  if (decision?.handoff_required !== true) return { skipped: true, reason: "no_exception" };
  const route = routeForDecision(env, decision);
  if (!route) return { skipped: true, reason: "no_hype_route" };
  if (!env.TELEGRAM_WORKER?.fetch) return { skipped: true, reason: "telegram_binding_missing" };
  const token = text(env.AUTH_SERVICE_LINE_TO_TELEGRAM || env.INTERNAL_TOKEN, 2000);
  const chatId = text(env.TELEGRAM_OPS_CHAT_ID || env.TELEGRAM_CHAT_ID || env.HYPE_CHAT_ID, 80);
  if (!token || !chatId) return { skipped: true, reason: "telegram_config_missing" };

  const ref = eventRef(event);
  const intent = text(decision.intent || decision.inferred_intent, 80) || "unknown";
  const reason = text(decision.handoff_reason, 300) || "protected_operational_review";
  const body = {
    flow: route.flow,
    chat_id: chatId,
    message_thread_id: route.thread_id,
    text: [
      `⚠️ Kenji LV5 · ${route.event}`,
      `Intent: ${intent}`,
      ref ? `Reference: ${ref}` : "",
      `Reason: ${reason}`,
      `Action: ${route.action}`,
      "Authority: notification_only · Per/canonical backend remains final authority.",
    ].filter(Boolean).join("\n"),
  };
  try {
    const response = await env.TELEGRAM_WORKER.fetch(new Request("https://telegram-worker/telegram/internal/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }));
    return { sent: response.ok, status: response.status, event: route.event, thread_id: route.thread_id };
  } catch {
    return { sent: false, status: 0, event: route.event, thread_id: route.thread_id };
  }
}

export const KENJI_LV5_HYPE_INTERNALS = Object.freeze({ routeForDecision });
