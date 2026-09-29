export const KENJI_CANONICAL_PUBLISHED_KNOWLEDGE_PATH = "/v1/internal/kenji/knowledge/published";
const CANONICAL_URL = `https://admin-worker.local${KENJI_CANONICAL_PUBLISHED_KNOWLEDGE_PATH}`;

function clean(value) {
  return String(value ?? "").trim();
}

export async function fetchKenjiCanonicalPublishedKnowledge(env = {}, options = {}) {
  const internalToken = clean(env.INTERNAL_TOKEN);
  if (!env.ADMIN_WORKER?.fetch || !internalToken) return { ok: false, source: "unavailable", cards: [] };

  try {
    const response = await env.ADMIN_WORKER.fetch(new Request(CANONICAL_URL, {
      method: "GET",
      headers: {
        authorization: `Bearer ${internalToken}`,
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
      },
      signal: options.signal,
    }));
    if (!response.ok) return { ok: false, source: "admin-worker", cards: [], status: response.status };
    const payload = await response.json().catch(() => null);
    const cards = Array.isArray(payload?.cards) ? payload.cards : Array.isArray(payload?.items) ? payload.items : [];
    if (!payload || payload.ok !== true || !Array.isArray(cards)) {
      return { ok: false, source: "admin-worker", cards: [], status: response.status };
    }
    return {
      ok: true,
      source: "admin-worker",
      data_status: clean(payload.data_status) || "unknown",
      cards,
      status: response.status,
    };
  } catch (_) {
    return { ok: false, source: "admin-worker", cards: [], status: 0 };
  }
}
