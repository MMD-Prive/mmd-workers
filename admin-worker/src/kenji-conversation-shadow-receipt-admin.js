export const KENJI_CONVERSATION_SHADOW_RECEIPT_ADMIN_PATH = "/v1/admin/kenji/conversation-shadow-receipt";
const MEMBER_RECEIPT_PATH = "https://member-dashboard-chat-worker.local/__internal/kenji/conversation-shadow-receipt";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private, max-age=0",
      "x-mmd-route-owner": "admin-worker",
    },
  });
}

function isOwnerOrAdmin(actor) {
  return actor && ["owner", "admin"].includes(String(actor.role || "").trim().toLowerCase());
}

export function isKenjiConversationShadowReceiptAdminRequest(path, method) {
  return String(method || "").toUpperCase() === "GET" && path === KENJI_CONVERSATION_SHADOW_RECEIPT_ADMIN_PATH;
}

export async function handleKenjiConversationShadowReceiptAdmin(env = {}, actor = null) {
  if (!actor) return json({ ok: false, error: "owner_admin_session_required" }, 401);
  if (!isOwnerOrAdmin(actor)) return json({ ok: false, error: "forbidden" }, 403);
  const binding = env.MEMBER_DASHBOARD_CHAT_WORKER;
  if (!binding?.fetch) return json({ ok: false, error: "service_binding_unavailable" }, 502);
  try {
    const upstream = await binding.fetch(new Request(MEMBER_RECEIPT_PATH, {
      method: "GET",
      headers: {
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "admin-worker",
      },
    }));
    const payload = await upstream.json().catch(() => null);
    if (!payload || typeof payload !== "object") return json({ ok: false, error: "shadow_receipt_unavailable" }, 502);
    return json(payload, upstream.status);
  } catch (_) {
    return json({ ok: false, error: "shadow_receipt_unavailable" }, 502);
  }
}
