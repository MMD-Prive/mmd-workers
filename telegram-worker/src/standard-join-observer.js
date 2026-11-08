// #2141 STANDARD + PREMIUM join-request evidence observers, HYPE read-only projection.
// Only forwards verified-webhook metadata through a private service binding.
// Does not approve/decline requests, message members or operators, or change group membership.
const clean = (v, max = 180) => String(v == null ? "" : v).trim().slice(0, max);

// HYPE reads verified canonical membership from the existing private Admin service.
// It never infers identity from display name and never authorizes any room action.
async function checkHypeMembership(telegramId, binding, room = "standard") {
  if (!binding?.fetch) return { state: "authority_unavailable" };
  try {
    const res = await binding.fetch(new Request("https://admin-worker.internal/__internal/hype/operational-status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-service-binding": "telegram-worker",
      },
      body: JSON.stringify({
        telegram_user_id: telegramId,
        intent: { type: "membership", trigger: `telegram_${room}_join_request` },
      }),
    }));
    const data = await res.json().catch(() => null);
    if (data?.state === "connect_required" || data?.code === "telegram_identity_not_linked") {
      return { state: "needs_telegram_link" };
    }
    if (!res.ok || data?.ok !== true) return { state: "authority_unavailable" };
    const level = clean(data.membership?.level, 60).toLowerCase();
    const lifecycle = clean(data.membership?.lifecycle, 60).toLowerCase();
    if (data.membership?.blocked === true) {
      return { state: "blocked_review", level, lifecycle };
    }
    if (data.state === "ready" && level && lifecycle) {
      return { state: "canonical_verified", level, lifecycle };
    }
    return { state: "review_required", level, lifecycle };
  } catch {
    return { state: "authority_unavailable" };
  }
}

export async function observeStandardJoinRequest(joinRequest, env = {}, deps = {}) {
  return observeTelegramGroupJoinRequest(joinRequest, env, { ...deps, room: "standard" });
}

// Premium intake runs *after* the existing Premium handler, never changing its decision.
export async function observePremiumJoinRequest(joinRequest, env = {}, deps = {}) {
  return observeTelegramGroupJoinRequest(joinRequest, env, { ...deps, room: "premium" });
}

export async function observeTelegramGroupJoinRequest(joinRequest, env = {}, deps = {}) {
  const room = deps.room === "premium" ? "premium" : "standard";
  const flow = room + "_join_intake";
  const chatId = clean(joinRequest?.chat?.id, 40);
  const configuredId = clean(room === "premium" ? env.TELEGRAM_PREMIUM_GROUP_ID : env.TELEGRAM_STANDARD_GROUP_ID, 40);
  if (!configuredId || chatId !== configuredId) {
    return { handled: false, reason: "not_" + room + "_join_request" };
  }
  const uid = clean(joinRequest?.from?.id, 40);
  if (joinRequest?.from?.is_bot === true || !/^\d{5,20}$/.test(uid)) {
    return { handled: true, flow: flow, captured: false, code_status: "invalid_join_identity" };
  }
  const binding = deps.binding || env.HYPE_OPERATIONS;
  if (!binding?.fetch) {
    return { handled: true, flow: flow, captured: false, code_status: "intake_binding_unavailable" };
  }
  const displayName = [
    clean(joinRequest?.from?.first_name, 85),
    clean(joinRequest?.from?.last_name, 85),
  ].filter(Boolean).join(" ").slice(0, 180);
  const requestedAt = Number(joinRequest?.date);
  const hype = await checkHypeMembership(uid, binding, room);
  const payload = {
    room,
    hype_check_state: hype.state,
    hype_membership_level: hype.level || "",
    hype_membership_lifecycle: hype.lifecycle || "",
    telegram_user_id_numeric: uid,
    telegram_username: clean(joinRequest?.from?.username, 80),
    telegram_display_name: displayName,
    requested_at_unix: requestedAt,
    ...(room === "premium" ? { join_outcome: clean(deps.join_outcome || "unknown", 50) } : {}),
  };
  try {
    const response = await binding.fetch(new Request(
      room === "premium"
        ? "https://admin-worker.internal/__internal/telegram-group-join-intake"
        : "https://admin-worker.internal/__internal/telegram-standard-join-intake", {
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
      handled: true, flow,
      captured: response.ok && result?.captured === true,
      code_status: response.ok ? (result?.state === "disabled" ? "capture_disabled" : "queued_for_owner_review") : "capture_unavailable",
      join_request_state: room === "premium" && deps.join_outcome === "approved_by_existing_handler" ? "approved" : "pending_owner_review",
      sends_nothing: true, approves_nothing: true, removes_nothing: true,
    };
  } catch {
    // Never include a user's name/id or service response details in the webhook reply.
    return {
      handled: true, flow, captured: false,
      code_status: "capture_unavailable", join_request_state: "pending_owner_review",
    };
  }
}
