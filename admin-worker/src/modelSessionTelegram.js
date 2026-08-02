const EVENT_RULES = Object.freeze({
  job_offer: Object.freeze(["offered"]),
  travel_reminder: Object.freeze(["confirmed", "en_route"]),
  final_payment_confirmed: Object.freeze(["final_payment_confirmed"]),
  emergency_alert: Object.freeze(["work_started"]),
});

const EVENT_COPY = Object.freeze({
  job_offer: Object.freeze({
    title: "New Job Offer",
    text: "A new MMD job offer is waiting for your response.",
    button: "Open Job Offer",
  }),
  travel_reminder: Object.freeze({
    title: "Travel Reminder",
    text: "Please check your current travel step and update it in Model Console.",
    button: "Open Travel Step",
  }),
  final_payment_confirmed: Object.freeze({
    title: "Final Payment Confirmed",
    text: "MMD has confirmed the final payment. Open Model Console to continue.",
    button: "Open Model Console",
  }),
  emergency_alert: Object.freeze({
    title: "Emergency Alert",
    text: "A model has requested urgent MMD assistance from an active session.",
    button: "Open Session",
  }),
});

function clean(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function normalizeModelSessionTelegramEvent(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

export function isModelSessionTelegramEventAllowed(event, state) {
  const eventKey = normalizeModelSessionTelegramEvent(event);
  return Boolean(EVENT_RULES[eventKey]?.includes(clean(state)));
}

export function buildModelSessionTelegramPayload({ event, state, chatId, modelSessionUrl, emergencyChatId, emergencyThreadId, emergencyUrl }) {
  const eventKey = normalizeModelSessionTelegramEvent(event);
  if (!isModelSessionTelegramEventAllowed(eventKey, state)) {
    return { ok: false, error: "invalid_notification_event" };
  }

  const isEmergency = eventKey === "emergency_alert";
  const targetChatId = clean(isEmergency ? emergencyChatId : chatId);
  if (!targetChatId) return { ok: false, error: "telegram_recipient_not_ready" };

  const copy = EVENT_COPY[eventKey];
  const url = clean(isEmergency ? emergencyUrl : modelSessionUrl);
  if (!isEmergency && !url) return { ok: false, error: "model_session_link_not_ready" };

  return {
    ok: true,
    event: eventKey,
    payload: {
      chat_id: targetChatId,
      ...(isEmergency && clean(emergencyThreadId) ? { message_thread_id: clean(emergencyThreadId) } : {}),
      text: `<b>${escapeHtml(copy.title)}</b>\n\n${escapeHtml(copy.text)}`,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(url ? { reply_markup: { inline_keyboard: [[{ text: copy.button, url }]] } } : {}),
    },
  };
}

export const MODEL_SESSION_TELEGRAM_EVENT_RULES = EVENT_RULES;
