import { issueModelTelegramBind, telegramConnectedFromFields } from "./telegram-identity-bind-authority.js";

// After a model's LINE identity is verified (LIFF exchange), quietly push a
// one-tap Telegram connect link into their LINE chat. No page prompt, never
// blocks sign-in, and at most one push per cooldown window per model.
const COOLDOWN_SECONDS = 7 * 24 * 60 * 60;
const KEY_PREFIX = "model-telegram-bind-link:";
const PUSH_URL = "https://member-dashboard-chat-worker.local/__internal/line/model-telegram-bind-link";

const text = (value) => String(value ?? "").trim();

export async function maybeSendModelTelegramBindLink(env = {}, { model_record_id, line_user_id, display_name, fields = {} } = {}) {
  try {
    const recordId = text(model_record_id);
    const lineUserId = text(line_user_id);
    if (!/^rec[A-Za-z0-9]{14,24}$/.test(recordId) || !/^U[0-9a-f]{32}$/i.test(lineUserId)) return { sent: false, reason: "invalid_subject" };
    if (telegramConnectedFromFields(fields)) return { sent: false, reason: "already_connected" };

    const kv = env.SIGIL_AVAILABILITY_SNAPSHOTS;
    const binding = env.MEMBER_DASHBOARD_CHAT_WORKER;
    if (!kv || typeof kv.get !== "function" || typeof kv.put !== "function") return { sent: false, reason: "storage_unavailable" };
    if (!binding || typeof binding.fetch !== "function") return { sent: false, reason: "transport_unavailable" };

    const key = `${KEY_PREFIX}${recordId}`;
    if (await kv.get(key)) return { sent: false, reason: "cooldown" };

    const bind = await issueModelTelegramBind(env, { model_record_id: recordId });
    if (!bind?.ok || bind.telegram_connected === true) return { sent: false, reason: "no_bind_needed" };
    let link;
    try { link = new URL(text(bind.connect_url)); } catch { return { sent: false, reason: "connect_url_invalid" }; }
    if (link.protocol !== "https:" || link.hostname !== "t.me") return { sent: false, reason: "connect_url_invalid" };

    const response = await binding.fetch(new Request(PUSH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "admin-worker" },
      body: JSON.stringify({ line_user_id: lineUserId, display_name: text(display_name).slice(0, 80), connect_url: link.toString() }),
    }));
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) return { sent: false, reason: "push_failed" };
    await kv.put(key, JSON.stringify({ sent_at: new Date().toISOString() }), { expirationTtl: COOLDOWN_SECONDS });
    return { sent: true };
  } catch {
    return { sent: false, reason: "error" };
  }
}
