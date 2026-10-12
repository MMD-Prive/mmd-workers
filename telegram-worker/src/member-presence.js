// READ-ONLY Telegram group presence check (#2141 piece B).
// POST /telegram/internal/member-presence  { "telegram_user_id": "123", "room": "premium" }
// Only calls getChatMember. Never bans, kicks, sends, or creates invite links.
// Group ids come from env only (never hardcoded here).
const ROOM_ENV = Object.freeze({
  premium: "TELEGRAM_PREMIUM_GROUP_ID",
  standard: "TELEGRAM_STANDARD_GROUP_ID",
  black: "TELEGRAM_PRESENCE_BLACK_ROOM_ID",
  inner: "TELEGRAM_PRESENCE_INNER_ROOM_ID",
  preview: "TELEGRAM_PREVIEW_CHANNEL_ID",
});

export const MEMBER_PRESENCE_PATHS = Object.freeze(["/telegram/internal/member-presence", "/v1/internal/member-presence"]);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

export function classifyStatus(status) {
  const s = String(status || "").toLowerCase();
  if (["creator", "administrator"].includes(s)) return "privileged";
  if (["member", "restricted"].includes(s)) return "present";
  if (["left", "kicked"].includes(s)) return "absent";
  return "unknown";
}

export async function readMemberPresence(body, env, fetchImpl = fetch) {
  const userId = String(body?.telegram_user_id ?? "").trim();
  const room = String(body?.room ?? "").trim().toLowerCase();
  if (!/^\d{1,20}$/.test(userId)) return { status: 400, body: { ok: false, error: "invalid_telegram_user_id" } };
  if (!ROOM_ENV[room]) return { status: 400, body: { ok: false, error: "unsupported_room", supported: Object.keys(ROOM_ENV) } };
  const chatId = String(env?.[ROOM_ENV[room]] ?? "").trim();
  if (!chatId) return { status: 503, body: { ok: false, error: "room_not_configured", room } };
  const botToken = String(env?.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!botToken) return { status: 503, body: { ok: false, error: "telegram_bot_not_configured" } };

  let data = null;
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${botToken}/getChatMember`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: Number(userId) }),
    });
    data = await res.json().catch(() => null);
  } catch {
    return { status: 502, body: { ok: false, error: "telegram_unreachable", room } };
  }
  if (data?.ok !== true) {
    const desc = String(data?.description || "").toLowerCase();
    // Telegram answers "user not found"/"participant_id_invalid" when the id was never in the chat.
    if (desc.includes("user not found") || desc.includes("participant_id_invalid")) {
      return { status: 200, body: { ok: true, room, presence: "absent", telegram_status: "not_found", read_only: true } };
    }
    return { status: 502, body: { ok: false, error: "telegram_lookup_failed", room } };
  }
  const telegramStatus = String(data.result?.status || "");
  return { status: 200, body: { ok: true, room, presence: classifyStatus(telegramStatus), telegram_status: telegramStatus || "unknown", read_only: true } };
}

export async function handleMemberPresence(body, env, fetchImpl) {
  const out = await readMemberPresence(body, env, fetchImpl);
  return json(out.body, out.status);
}
