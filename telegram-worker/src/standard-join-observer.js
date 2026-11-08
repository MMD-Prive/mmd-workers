// #2141 STANDARD join-request observer.
// Only forwards verified-webhook metadata through a private service binding.
// Does not approve/decline requests, message members or operators, or change group membership.
const clean = (v, max = 180) => String(v == null ? "" : v).trim().slice(0, max);

export async function observeStandardJoinRequest(joinRequest, env = {}, deps = {}) {
  const chatId = clean(joinRequest?.chat?.id, 40);
  const standardId = clean(env.TELEGRAM_STANDARD_GROUP_ID, 40);
  if (!standardId || chatId !== standardId) {
    return { handled: false, reason: "not_standard_join_request" };
  }
  const uid = clean(joinRequest?.from?.id, 40);
  if (joinRequest?.from?.is_bot === true || !/^\d{5,20}$/.test(uid)) {
    return { handled: true, flow: "standard_join_intake", captured: false, code_status: "invalid_join_identity" };
  }
  const binding = deps.binding || env.HYPE_OPERATIONS;
  if (!binding?.fetch) {
    return { handled: true, flow: "standard_join_intake", captured: false, code_status: "intake_binding_unavailable" };
  }
  const displayName = [
    clean(joinRequest?.from?.first_name, 85),
    clean(joinRequest?.from?.last_name, 85),
  ].filter(Boolean).join(" ").slice(0, 180);
  const requestedAt = Number(joinRequest?.date);
  const payload = {
    room: "standard",
    telegram_user_id_numeric: uid,
    telegram_username: clean(joinRequest?.from?.username, 80),
    telegram_display_name: displayName,
    requested_at_unix: requestedAt,
  };
  try {
    const response = await binding.fetch(new Request(
      "https://admin-worker.internal/__internal/telegram-standard-join-intake", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-mmd-service-binding": "telegram-worker",
        },
        body: JSON.stringify(payload),
      },
    ));
    const result = await response.json().catch(() => null);
    return {
      handled: true, flow: "standard_join_intake",
      captured: response.ok && result?.captured === true,
      code_status: response.ok ? (result?.state === "disabled" ? "capture_disabled" : "queued_for_owner_review") : "capture_unavailable",
      join_request_state: "pending_owner_review",
      sends_nothing: true, approves_nothing: true, removes_nothing: true,
    };
  } catch {
    // Never include a user's name/id or service response details in the webhook reply.
    return {
      handled: true, flow: "standard_join_intake", captured: false,
      code_status: "capture_unavailable", join_request_state: "pending_owner_review",
    };
  }
}
