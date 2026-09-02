import worker from "./index.js";

const PATH = "/telegram/internal/access/reconcile";

export default {
  async fetch(request, env, ctx) {
    let url;
    try { url = new URL(request.url); } catch { return worker.fetch(request, env, ctx); }
    if (request.method !== "POST" || url.pathname !== PATH) return worker.fetch(request, env, ctx);
    return handleReconcile(request, env);
  },
};

async function handleReconcile(request, env) {
  if (!authorized(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const body = await request.json().catch(() => null);
  const userId = String(body?.telegram_user_id || "").trim();
  if (!/^\d{5,20}$/.test(userId)) return json({ ok: false, error: "stable_telegram_user_id_required" }, 400);
  if (!String(env.TELEGRAM_BOT_TOKEN || "").trim()) return json({ ok: false, error: "telegram_bot_not_configured" }, 503);

  const actions = body?.actions && typeof body.actions === "object" ? body.actions : {};
  const rooms = unique([...(actions.grant || []), ...(actions.retain || []), ...(actions.revoke || [])]);
  const results = [];
  for (const room of rooms) {
    const action = actionFor(actions, room);
    results.push(await reconcileRoom(env, room, userId, action));
  }
  const ok = results.every((item) => item.ok);
  return json({ ok, authority: "my_mmd_entitlement_resolver_v1", results }, ok ? 200 : 409);
}

async function reconcileRoom(env, room, userId, action) {
  const chatId = roomId(env, room);
  if (!chatId) return { ok: false, room, action, reason: room === "vip" ? "vip_room_unresolved" : "room_not_configured" };

  if (action === "retain") {
    const response = await telegram(env, "getChatMember", { chat_id: chatId, user_id: userId });
    const status = String(response?.result?.status || "");
    return { ok: response.ok === true && !["left", "kicked"].includes(status), room, action, status: status || "unknown" };
  }

  if (action === "revoke") {
    const response = await telegram(env, "banChatMember", { chat_id: chatId, user_id: userId, revoke_messages: false });
    return { ok: response.ok === true || String(response.description || "").toLowerCase().includes("participant_id_invalid"), room, action };
  }

  if (action === "grant") {
    const unban = await telegram(env, "unbanChatMember", { chat_id: chatId, user_id: userId, only_if_banned: true });
    if (unban.ok !== true && !String(unban.description || "").toLowerCase().includes("user not found")) {
      return { ok: false, room, action, reason: "unban_failed" };
    }
    const invite = await telegram(env, "createChatInviteLink", {
      chat_id: chatId,
      member_limit: 1,
      expire_date: Math.floor(Date.now() / 1000) + 3600,
      name: `mmd-reconcile-${room}`.slice(0, 32),
    });
    if (invite.ok !== true || !invite?.result?.invite_link) return { ok: false, room, action, reason: "invite_create_failed" };
    return { ok: true, room, action, invite_link: invite.result.invite_link, invite_expires_in_sec: 3600 };
  }

  return { ok: false, room, action, reason: "unsupported_action" };
}

function roomId(env, room) {
  if (room === "black") return String(env.TELEGRAM_BLACK_ROOM_ID || "").trim();
  if (room === "svip") return String(env.TELEGRAM_SVIP_ROOM_ID || "").trim();
  if (room === "vip") return String(env.TELEGRAM_VIP_ROOM_ID || "").trim();
  return "";
}

async function telegram(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, http_status: response.status };
}

function actionFor(actions, room) {
  if (Array.isArray(actions.grant) && actions.grant.includes(room)) return "grant";
  if (Array.isArray(actions.retain) && actions.retain.includes(room)) return "retain";
  if (Array.isArray(actions.revoke) && actions.revoke.includes(room)) return "revoke";
  return "none";
}
function unique(values) { return [...new Set(values.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean))]; }
function authorized(request, env) {
  const expected = String(env.AUTH_SERVICE_AUTH_TO_TELEGRAM || "").trim();
  const actual = String(request.headers.get("x-mmd-auth-reconcile-secret") || "").trim();
  return Boolean(expected && actual && timingSafeEqual(expected, actual));
}
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
