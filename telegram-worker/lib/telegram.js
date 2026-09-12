import { escapeHtml, num } from "./util.js";

function int(v) {
  const n = Number(String(v || "").trim());
  return Number.isFinite(n) ? n : 0;
}

const TOPIC_SPECS = Object.freeze([
  { key: "membership", label: "MMD • Payments (Membership)", env: "TG_THREAD_MEMBERSHIP", fallback: 20 },
  { key: "payment", label: "MMD • Payments (Confirm)", env: "TG_THREAD_PAYMENT", fallback: 21 },
  { key: "alerts", label: "MMD • Alerts", env: "TG_THREAD_ALERTS", fallback: 9 },
  { key: "points", label: "MMD • Points", env: "TG_THREAD_POINTS", fallback: 17 },
  { key: "system_log", label: "MMD • System Log", env: "TG_THREAD_SYSTEM_LOG", fallback: 22 },
  { key: "public_model", label: "MMD – Public Model", env: "TG_THREAD_PUBLIC_MODEL", fallback: 155 },
  { key: "booking", label: "MMD • Booking", env: "TG_THREAD_BOOKING", fallback: 1399 },
]);

export function telegramTopics(env = {}) {
  return TOPIC_SPECS.map((topic) => ({
    ...topic,
    thread_id: int(env[topic.env]) || topic.fallback,
  }));
}

export const TG_THREADS = (env) => {
  const topics = Object.fromEntries(telegramTopics(env).map((topic) => [topic.key, topic.thread_id]));
  const confirm = int(env.TG_THREAD_CONFIRM) || topics.payment;
  return {
    membership: topics.membership,
    confirm,
    payment: topics.payment,
    payment_proof: topics.payment,
    payment_verified: topics.payment,
    alerts: topics.alerts,
    alert: topics.alerts,
    exception: topics.alerts,
    recovery: topics.alerts,
    studio_alert: topics.alerts,
    points: topics.points,
    points_threshold: topics.points,
    system: topics.system_log,
    system_log: topics.system_log,
    public_model: topics.public_model,
    public_model_application: topics.public_model,
    booking: topics.booking,
    booking_draft: topics.booking,
  };
};

export async function sendTelegramMessage(payload, env) {
  const botToken = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) {
    return { ok: false, skipped: true, reason: "missing_telegram_bot_token" };
  }

  const chatId = String(payload.chat_id || "").trim();
  if (!chatId) {
    return { ok: false, error: "missing_chat_id" };
  }

  const body = {
    chat_id: chatId,
    text: String(payload.text || ""),
    parse_mode: payload.parse_mode || "HTML",
      disable_web_page_preview: payload.disable_web_page_preview !== false,
  };

  if (payload.disable_notification === true) body.disable_notification = true;

  const threadId = int(payload.message_thread_id || payload.thread_id);
  if (threadId) body.message_thread_id = threadId;
  if (payload.reply_markup) body.reply_markup = payload.reply_markup;

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || (data && data.ok === false)) return { ok: false, status: res.status, error: data || null };
  return { ok: true, result: data?.result || data };
}

export async function telegramNotify(payload, env) {
  const directChatId = String(payload.chat_id || "").trim();
  if (directChatId) {
    const directText = String(payload.text || "").trim();
    if (!directText) return { ok: false, error: "missing_text" };

    const result = await sendTelegramMessage({
      chat_id: directChatId,
      message_thread_id: payload.message_thread_id || payload.thread_id,
      text: directText,
      parse_mode: payload.parse_mode || "HTML",
    disable_web_page_preview: payload.disable_web_page_preview !== false,
      disable_notification: payload.disable_notification === true,
      reply_markup: payload.reply_markup,
    }, env);

    if (!result?.ok) {
      const reason = result?.reason || result?.error?.description || result?.error || result?.status || "unknown";
      throw new Error(`telegram_direct_send_failed:${String(reason).slice(0, 160)}`);
    }

    return result;
  }

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { ok: false, skipped: true, reason: "missing_telegram_env" };
  }

  const threads = TG_THREADS(env);
  const flow = String(payload.flow || "").toLowerCase().trim();
  const threadId = threads[flow] || 0;
  if (!threadId) {
    return { ok: false, error: "thread_lock_missing", detail: `missing thread for flow=${flow}` };
  }

  const text = String(payload.text || "").trim() || formatTelegramMessage(payload);
  return sendTelegramMessage({
    chat_id: env.TELEGRAM_CHAT_ID,
    message_thread_id: threadId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }, env);
}

export function formatTelegramMessage(p) {
  const flow = String(p.flow || "").toLowerCase();

  const isMembership = flow === "membership";
  const isConfirm = flow === "confirm";
  const isPaymentProof = flow === "payment_proof";
  const isPaymentVerified = flow === "payment_verified";
  const isPoints = flow === "points_threshold";

  if (isPoints) {
    const lines = [];
    lines.push(`<b>📈 MMD • POINTS THRESHOLD</b>`);
    if (p.tier) lines.push(`<b>Tier:</b> ${escapeHtml(p.tier)}`);
    if (p.member_id) lines.push(`<b>MemberId:</b> ${escapeHtml(p.member_id)}`);
    lines.push(`<b>Total:</b> ${escapeHtml(String(p.points_total ?? "-"))}`);
    lines.push(`<b>Threshold:</b> ${escapeHtml(String(p.points_threshold ?? "-"))}`);
    if (p.source) lines.push(`<b>Source:</b> ${escapeHtml(p.source)}`);
    if (p.page) lines.push(`<b>Page:</b> ${escapeHtml(p.page)}`);
    lines.push(``);
    lines.push(`<b>TS:</b> ${escapeHtml(p.ts || new Date().toISOString())}`);
    return lines.join("\n");
  }

  const operationalTitles = {
    alerts: "🚨 MMD • ALERT",
    alert: "🚨 MMD • ALERT",
    exception: "🚨 MMD • EXCEPTION",
    recovery: "🚨 MMD • RECOVERY",
    studio_alert: "🚨 MMD • STUDIO ALERT",
    system: "💻 MMD • SYSTEM LOG",
    system_log: "💻 MMD • SYSTEM LOG",
    public_model: "🆕 MMD • PUBLIC MODEL",
    public_model_application: "🆕 MMD • PUBLIC MODEL",
    booking: "🕯️ MMD • BOOKING",
    booking_draft: "🕯️ MMD • BOOKING DRAFT",
  };

  const title = isMembership
    ? "🧾 MMD • MEMBERSHIP SUBMIT"
    : isConfirm
    ? "✅ MMD • CONFIRM SUBMIT"
    : isPaymentProof
    ? "🧾 MMD • PAYMENT PROOF RECEIVED"
    : isPaymentVerified
    ? "✅ MMD • PAYMENT VERIFIED"
    : operationalTitles[flow] || "🔔 MMD • PAYMENT NOTIFY";

  const lines = [];
  lines.push(`<b>${title}</b>`);
  lines.push(`<b>Flow:</b> ${escapeHtml(flow || "-")}`);

  if (p.tier) lines.push(`<b>Tier:</b> ${escapeHtml(p.tier)}`);
  lines.push(`<b>Amount:</b> ${escapeHtml(String(num(p.amount_thb) || "-"))} ${escapeHtml(p.currency || "THB")}`);
  if (p.payment_method) lines.push(`<b>Method:</b> ${escapeHtml(p.payment_method)}`);
  if (p.proof_id) lines.push(`<b>Proof:</b> ${escapeHtml(p.proof_id)}`);
  if (p.ref) lines.push(`<b>Ref:</b> ${escapeHtml(p.ref)}`);
  if (p.status) lines.push(`<b>Status:</b> ${escapeHtml(p.status)}`);
  if (p.page) lines.push(`<b>Page:</b> ${escapeHtml(p.page)}`);

  if (isMembership) {
    if (p.promptpay_url) lines.push(`<b>PromptPay:</b> ${escapeHtml(p.promptpay_url)}`);
    if (p.promo_code) lines.push(`<b>Promo:</b> ${escapeHtml(p.promo_code)}`);

    const c = p.customer || {};
    if (c.member_id || c.email || c.name) {
      lines.push(``);
      lines.push(`<b>Customer</b>`);
      if (c.member_id) lines.push(`• id: ${escapeHtml(c.member_id)}`);
      if (c.email) lines.push(`• email: ${escapeHtml(c.email)}`);
      if (c.name) lines.push(`• name: ${escapeHtml(c.name)}`);
    }
  }

  if (isConfirm) {
    if (p.deposit_thb) lines.push(`<b>Deposit:</b> ${escapeHtml(String(p.deposit_thb))}`);
    if (p.balance_thb) lines.push(`<b>Balance:</b> ${escapeHtml(String(p.balance_thb))}`);
    if (p.model) lines.push(`<b>Model:</b> ${escapeHtml(p.model)}`);
    if (p.intent) lines.push(`<b>Intent:</b> ${escapeHtml(p.intent)}`);

    const m = p.member || {};
    if (m.member_id || m.email || m.phone || m.name) {
      lines.push(``);
      lines.push(`<b>Member</b>`);
      if (m.member_id) lines.push(`• id: ${escapeHtml(m.member_id)}`);
      if (m.email) lines.push(`• email: ${escapeHtml(m.email)}`);
      if (m.phone) lines.push(`• phone: ${escapeHtml(m.phone)}`);
      if (m.name) lines.push(`• name: ${escapeHtml(m.name)}`);
    }
  }

  lines.push(``);
  lines.push(`<b>TS:</b> ${escapeHtml(p.ts || new Date().toISOString())}`);
  return lines.join("\n");
}
