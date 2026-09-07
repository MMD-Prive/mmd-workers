function text(value) {
  return value == null ? "" : String(value).trim();
}

function parsePayload(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(text(value) || "{}");
  } catch (_) {
    return {};
  }
}

export function redeliveryOutcomeFromAiEvent(record = null) {
  const fields = record?.fields || {};
  const payload = parsePayload(fields.payload_json);
  const finalStatus = text(fields.final_status).toLowerCase();
  const handoffRequired = fields.handoff_required === true;
  const delivered = payload.line_delivery_succeeded === true;
  const guardReason = text(payload.guard_reason || fields.handoff_reason).toLowerCase();

  if (!record?.id) {
    return { completed: false, retry_allowed: true, reason: "redelivery_unseen" };
  }
  if (delivered || finalStatus === "sent") {
    return { completed: true, retry_allowed: false, reason: "redelivery_already_sent" };
  }
  if (handoffRequired || finalStatus === "escalated") {
    return { completed: true, retry_allowed: false, reason: "redelivery_already_handed_off" };
  }
  if (finalStatus === "failed") {
    return { completed: false, retry_allowed: true, reason: "redelivery_retry_failed_delivery" };
  }
  if (["line_redelivery", "runtime_line_kill", "reply_not_eligible"].includes(guardReason)) {
    return { completed: false, retry_allowed: true, reason: `redelivery_retry_${guardReason}` };
  }
  return { completed: false, retry_allowed: true, reason: "redelivery_retry_incomplete" };
}
