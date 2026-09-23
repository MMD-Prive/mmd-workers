import { escapeHtml, num } from "./util.js";

function int(v) {
  const n = Number(String(v || "").trim());
  return Number.isFinite(n) ? n : 0;
}

function topicEnv(env, names = []) {
  for (const name of names) {
    const value = int(env?.[name]);
    if (value > 0) return value;
  }
  return 0;
}

const TOPIC_SPECS = Object.freeze([
  { key: "booking", label: "MMD • Booking", envs: ["TG_THREAD_BOOKING_DRAFT", "TG_THREAD_BOOKING"], fallback: 1399 },
  { key: "membership", label: "MMD • Payments (Membership)", envs: ["TG_THREAD_PAYMENTS_MEMBERSHIP", "TG_THREAD_MEMBERSHIP"], fallback: 20 },
  { key: "points", label: "MMD • Points", envs: ["TG_THREAD_POINTS"], fallback: 17 },
  { key: "payment", label: "MMD • Payments (Confirm)", envs: ["TG_THREAD_PAYMENTS_CONFIRM", "TG_THREAD_PAYMENT", "TG_THREAD_CONFIRM"], fallback: 22 },
  { key: "alerts", label: "MMD • Alerts", envs: ["TG_THREAD_ALERTS"], fallback: 9 },
  { key: "public_model", label: "MMD • Applications", envs: ["TG_THREAD_PUBLIC_MODEL"], fallback: 155 },
  { key: "partner", label: "MMD • Partner Ops", envs: ["TG_THREAD_PARTNER_CONFIRM", "TG_THREAD_PRICING_REVIEW"], fallback: 61 },
  { key: "himai_orders", label: "HIMAI • Orders", envs: ["TG_THREAD_HIMAI_ORDERS"], fallback: 157 },
  { key: "himai_payments", label: "HIMAI • Payments", envs: ["TG_THREAD_HIMAI_PAYMENTS"], fallback: 158 },
  { key: "himai_alerts", label: "HIMAI • Alerts", envs: ["TG_THREAD_HIMAI_ALERTS"], fallback: 159 },
  { key: "mmd_shop_orders", label: "MMD Shop • Orders", envs: ["TG_THREAD_MMD_SHOP_ORDERS"], fallback: 160 },
  { key: "mmd_shop_payments", label: "MMD Shop • Payments", envs: ["TG_THREAD_MMD_SHOP_PAYMENTS"], fallback: 161 },
  { key: "mmd_shop_alerts", label: "MMD Shop • Alerts", envs: ["TG_THREAD_MMD_SHOP_ALERTS"], fallback: 162 },
  { key: "legacy_archive", label: "MMD • Legacy Archive", envs: ["TG_THREAD_LEGACY_ARCHIVE", "TG_THREAD_SYSTEM_LOG"], fallback: 134 },
  { key: "rules_model", label: "MMD • Rules (Model)", envs: ["TG_THREAD_RULES_MODEL"], fallback: 39 },
  { key: "rules_customer", label: "MMD • Rules (Customer)", envs: ["TG_THREAD_RULES_CUSTOMER"], fallback: 29 },
  { key: "crew", label: "MMD Privé Crew", envs: ["TG_THREAD_CREW"], fallback: 0, optional: true },
]);

export function telegramTopics(env = {}) {
  return TOPIC_SPECS
    .map((topic) => ({
      ...topic,
      thread_id: topicEnv(env, topic.envs) || topic.fallback || 0,
    }))
    .filter((topic) => !topic.optional || topic.thread_id > 0);
}

export const TG_THREADS = (env = {}) => {
  const topics = Object.fromEntries(telegramTopics(env).map((topic) => [topic.key, topic.thread_id]));
  const crew = topics.crew || topics.alerts;
  return {
    booking: topics.booking,
    booking_draft: topics.booking,
    dispatch: topics.booking,
    booking_dispatch: topics.booking,

    membership: topics.membership,
    payments_membership: topics.membership,
    care_back: topics.membership,
    coupon_review: topics.membership,
    membership_ops: topics.membership,
    confirm: topics.payment,
    payment: topics.payment,
    payments_confirm: topics.payment,
    payment_proof: topics.payment,
    payment_verified: topics.payment,

    points: topics.points,
    points_threshold: topics.points,

    alerts: topics.alerts,
    alert: topics.alerts,
    exception: topics.alerts,
    recovery: topics.alerts,
    studio_alert: topics.alerts,
    mms_alert: topics.alerts,
    mms_manual_handoff: topics.alerts,
    mms_job: topics.alerts,

    applications: topics.public_model,
    application: topics.public_model,
    mmd_application: topics.public_model,
    public_model: topics.public_model,
    public_model_application: topics.public_model,
    mms_application: topics.public_model,
    mms_therapist_application: topics.public_model,

    partner: topics.partner,
    partner_confirm: topics.partner,
    partner_review: topics.partner,

    himai_orders: topics.himai_orders,
    himai_order: topics.himai_orders,
    himai_payments: topics.himai_payments,
    himai_payment: topics.himai_payments,
    himai_alerts: topics.himai_alerts,
    himai_alert: topics.himai_alerts,

    mmd_shop_orders: topics.mmd_shop_orders,
    mmd_shop_order: topics.mmd_shop_orders,
    mmd_shop_payments: topics.mmd_shop_payments,
    mmd_shop_payment: topics.mmd_shop_payments,
    mmd_shop_alerts: topics.mmd_shop_alerts,
    mmd_shop_alert: topics.mmd_shop_alerts,

    legacy_archive: topics.legacy_archive,
    system: topics.legacy_archive,
    system_log: topics.legacy_archive,

    rules_customer: topics.rules_customer,
    customer_rules: topics.rules_customer,
    customer_rules_ack: topics.rules_customer,
    rules_model: topics.rules_model,
    model_rules: topics.rules_model,
    model_rules_ack: topics.rules_model,

    crew,
    human_handoff: crew,
  };
};

function pageHint(page) {
  if (!page) return "";
  if (typeof page === "string") return page;
  if (typeof page === "object") return String(page.path || page.href || page.url || "");
  return String(page);
}

export function resolveTelegramFlow(payload = {}) {
  const flow = String(payload.flow || "").toLowerCase().trim();

  if (flow === "dispatch" || flow === "booking_dispatch") return "booking";
  if (flow === "customer_rules" || flow === "customer_rules_ack") return "rules_customer";
  if (flow === "model_rules" || flow === "model_rules_ack") return "rules_model";
  if (flow === "human_handoff") return "crew";
  if (flow === "system" || flow === "system_log") return "legacy_archive";

  if ((flow === "confirm" || flow === "rules_ack") && payload.rules) {
    const role = String(payload.role || payload.rules?.role || "").toLowerCase().trim();
    const type = String(payload.type || "").toLowerCase().trim();
    const page = pageHint(payload.page).toLowerCase();
    const isModel = role === "model" || type === "model_rules_ack" || page.includes("/rules/model");
    return isModel ? "rules_model" : "rules_customer";
  }

  return flow;
}

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
  const flow = resolveTelegramFlow(payload);
  const threadId = threads[flow] || 0;
  if (!threadId) {
    return { ok: false, error: "thread_lock_missing", detail: `missing thread for flow=${flow}` };
  }

  const normalizedPayload = { ...payload, flow };
  const text = String(payload.text || "").trim() || formatTelegramMessage(normalizedPayload);
  return sendTelegramMessage({
    chat_id: env.TELEGRAM_CHAT_ID,
    message_thread_id: threadId,
    text,
    parse_mode: payload.parse_mode || "HTML",
    disable_web_page_preview: payload.disable_web_page_preview !== false,
    disable_notification: payload.disable_notification === true,
    reply_markup: payload.reply_markup,
  }, env);
}

export function formatTelegramMessage(p) {
  const flow = String(p.flow || "").toLowerCase();

  const isMembership = flow === "membership" || flow === "payments_membership";
  const isConfirm = flow === "confirm" || flow === "payment" || flow === "payments_confirm";
  const isPaymentProof = flow === "payment_proof";
  const isPaymentVerified = flow === "payment_verified";
  const isPoints = flow === "points_threshold";
  const isRulesCustomer = flow === "rules_customer";
  const isRulesModel = flow === "rules_model";

  if (isPoints) {
    const lines = [];
    lines.push(`<b>📈 MMD • POINTS THRESHOLD</b>`);
    if (p.tier) lines.push(`<b>Tier:</b> ${escapeHtml(p.tier)}`);
    if (p.member_id) lines.push(`<b>MemberId:</b> ${escapeHtml(p.member_id)}`);
    lines.push(`<b>Total:</b> ${escapeHtml(String(p.points_total ?? "-"))}`);
    lines.push(`<b>Threshold:</b> ${escapeHtml(String(p.points_threshold ?? "-"))}`);
    if (p.source) lines.push(`<b>Source:</b> ${escapeHtml(p.source)}`);
    if (p.page) lines.push(`<b>Page:</b> ${escapeHtml(pageHint(p.page))}`);
    lines.push(``);
    lines.push(`<b>TS:</b> ${escapeHtml(p.ts || new Date().toISOString())}`);
    return lines.join("\n");
  }

  if (isRulesCustomer || isRulesModel) {
    const lines = [];
    lines.push(`<b>${isRulesModel ? "🎭 MMD • RULES (MODEL)" : "💗 MMD • RULES (CUSTOMER)"}</b>`);
    lines.push(`<b>Event:</b> rules acknowledged`);
    if (p.rules?.version) lines.push(`<b>Version:</b> ${escapeHtml(p.rules.version)}`);
    if (p.rules?.url) lines.push(`<b>Rules:</b> ${escapeHtml(p.rules.url)}`);
    const member = p.member || {};
    if (member.member_id) lines.push(`<b>MemberId:</b> ${escapeHtml(member.member_id)}`);
    if (member.name) lines.push(`<b>Name:</b> ${escapeHtml(member.name)}`);
    const page = pageHint(p.page);
    if (page) lines.push(`<b>Page:</b> ${escapeHtml(page)}`);
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
    legacy_archive: "🗄️ MMD • LEGACY ARCHIVE",
    system: "🗄️ MMD • LEGACY ARCHIVE",
    system_log: "🗄️ MMD • LEGACY ARCHIVE",
    applications: "🆕 MMD • APPLICATIONS",
    application: "🆕 MMD • APPLICATIONS",
    mmd_application: "🆕 MMD • APPLICATIONS",
    public_model: "🆕 MMD • PUBLIC MODEL APPLICATION",
    public_model_application: "🆕 MMD • PUBLIC MODEL APPLICATION",
    mms_application: "🆕 MMS • THERAPIST APPLICATION",
    mms_therapist_application: "🆕 MMS • THERAPIST APPLICATION",
    booking: "🕯️ MMD • BOOKING",
    booking_draft: "🕯️ MMD • BOOKING DRAFT",
    himai_orders: "📦 HIMAI • ORDERS",
    himai_order: "📦 HIMAI • ORDERS",
    himai_payments: "💳 HIMAI • PAYMENTS",
    himai_payment: "💳 HIMAI • PAYMENTS",
    himai_alerts: "🚨 HIMAI • ALERTS",
    himai_alert: "🚨 HIMAI • ALERTS",
    mmd_shop_orders: "📦 MMD SHOP • ORDERS",
    mmd_shop_order: "📦 MMD SHOP • ORDERS",
    mmd_shop_payments: "💳 MMD SHOP • PAYMENTS",
    mmd_shop_payment: "💳 MMD SHOP • PAYMENTS",
    mmd_shop_alerts: "🚨 MMD SHOP • ALERTS",
    mmd_shop_alert: "🚨 MMD SHOP • ALERTS",
    crew: "👥 MMD PRIVÉ CREW",
    human_handoff: "👥 MMD PRIVÉ CREW",
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
  if (p.page) lines.push(`<b>Page:</b> ${escapeHtml(pageHint(p.page))}`);

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
