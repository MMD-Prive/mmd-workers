// #2141: STANDARD Telegram join request -> owner-only, private Airtable intake.
// Intentionally no approve/decline, sendMessage, customer bind, or entitlement mutations.
export const STANDARD_JOIN_INTAKE_RPC_PATH = "/__internal/telegram-standard-join-intake";
const JOIN_TABLE_DEFAULT = "tblGFkPcMFsxsW5Ul";
const SOURCE_TABLE_DEFAULT = "tblCVwWXwyEhU2AEN";
const BASE_DEFAULT = "appsV1ILPRfIjkaYg";
const AT = "https://api.airtable.com/v0/";
const DEFAULT_LIMIT = 100;

const str = (v, max = 180) => String(v == null ? "" : v).trim().slice(0, max);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
});
const isEnabled = (env) => str(env.TELEGRAM_STANDARD_JOIN_CAPTURE_ENABLED, 10).toLowerCase() === "true";
const validId = (v) => /^\d{5,20}$/.test(v);
const normalizedUser = (v) => str(v, 80).replace(/^@/, "").toLowerCase();
const compactName = (v) => str(v, 180).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const maybeName = (v) => str(v, 180).replace(/[\u0000-\u001f\u007f]/g, " ");
const statusName = (v) => typeof v === "string" ? v : str(v?.name, 40);
function config(env) {
  return {
    base: str(env.AIRTABLE_BASE_ID || BASE_DEFAULT, 70),
    join: str(env.AIRTABLE_TELEGRAM_STANDARD_JOIN_INTAKE_TABLE_ID || JOIN_TABLE_DEFAULT, 80),
    source: str(env.AIRTABLE_TELEGRAM_LINK_SOURCE_STAGING_TABLE_ID || SOURCE_TABLE_DEFAULT, 80),
    token: str(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 2500),
  };
}
function apiUrl(c, table, qs = "") {
  return AT + encodeURIComponent(c.base) + "/" + encodeURIComponent(table) + (qs ? "?" + qs : "");
}
async function airtableRequest(c, table, fetchImpl, options = {}, qs = "") {
  const response = await fetchImpl(apiUrl(c, table, qs), {
    ...options,
    headers: { "authorization": `Bearer ${c.token}`, ...(options.body ? { "content-type": "application/json" } : {}) },
  });
  if (!response.ok) throw new Error("airtable_unavailable");
  return response.json();
}
async function airtableList(c, table, fetchImpl, { filter = "", maxPages = 5 } = {}) {
  let rows = [], offset = "", truncated = false;
  for (let page = 0; page < maxPages; page++) {
    const q = new URLSearchParams({ pageSize: "100" });
    if (offset) q.set("offset", offset);
    if (filter) q.set("filterByFormula", filter);
    const data = await airtableRequest(c, table, fetchImpl, {}, q.toString());
    rows.push(...(Array.isArray(data.records) ? data.records : []));
    offset = str(data.offset, 300);
    if (!offset) return { rows, truncated: false };
  }
  truncated = Boolean(offset);
  return { rows, truncated };
}
const safeRow = (r) => r?.fields && typeof r.fields === "object" ? r.fields : {};
const failure = (reason, status) => json({ ok: false, error: reason, captured: false }, status);

export function isStandardJoinIntakeRpcRequest(path) {
  return String(path || "").replace(/\/+$/, "") === STANDARD_JOIN_INTAKE_RPC_PATH;
}

// The only allowed writer: private service binding from authenticated Telegram webhook.
// Owner decisions and existing records are never overwritten by duplicate update deliveries.
export async function handleStandardJoinIntakeRpc(request, env = {}, deps = {}) {
  let url;
  try { url = new URL(request.url); } catch { return failure("invalid_request", 400); }
  if (url.hostname !== "admin-worker.internal" || !isStandardJoinIntakeRpcRequest(url.pathname)) {
    return failure("internal_only", 403);
  }
  if (request.method !== "POST") return failure("method_not_allowed", 405);
  if (request.headers.get("x-mmd-service-binding") !== "telegram-worker") return failure("caller_not_authorized", 403);
  if (!isEnabled(env)) return json({ ok: true, captured: false, state: "disabled" });

  const data = await request.json().catch(() => null);
  if (!data || data.room !== "standard") return failure("room_not_supported", 400);
  const uid = str(data.telegram_user_id_numeric, 30);
  const date = Number(data.requested_at_unix);
  if (!validId(uid) || !Number.isInteger(date) || date < 1500000000 || date > 2500000000) return failure("invalid_join_request", 400);
  const username = normalizedUser(data.telegram_username);
  if (username && !/^[a-z0-9_]{5,32}$/.test(username)) return failure("invalid_username", 400);
  const displayName = maybeName(data.telegram_display_name);
  const at = new Date(date * 1000).toISOString();
  const c = config(env);
  if (!c.token) return failure("airtable_not_configured", 503);

  const joinKey = `standard:${uid}`;
  const filter = `{join_key}="${joinKey}"`; // uid is strictly numeric; no formula injection
  const f = deps.fetch || fetch;
  try {
    const existing = await airtableList(c, c.join, f, { filter, maxPages: 1 });
    if (existing.truncated || existing.rows.length > 1) return failure("join_key_conflict", 409);
    if (existing.rows.length === 1) return json({ ok: true, captured: true, state: "already_recorded", room: "standard" });

    // Race-safe upsert keyed by (room + numeric id); no phone/email/note is captured.
    // Do not set review_status in a replay update: the UI treats empty as pending.
    const created = await airtableRequest(c, c.join, f, {
      method: "POST",
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: ["join_key"] },
        records: [{ fields: {
          join_key: joinKey,
          room: "standard",
          telegram_user_id_numeric: uid,
          telegram_username: username,
          telegram_display_name: displayName,
          requested_at: at,
          evidence_source: "telegram_chat_join_request",
        } }],
        typecast: false,
      }),
    });
    if (!created.records?.length) return failure("capture_not_confirmed", 503);
    return json({ ok: true, captured: true, state: "pending_owner_review", room: "standard" });
  } catch {
    return failure("capture_unavailable", 503);
  }
}

function candidateEvidence(item, from) {
  const directId = str(item.telegram_user_id_numeric, 30);
  const name = compactName(item.telegram_display_name);
  const user = normalizedUser(item.telegram_username);
  if (directId && validId(directId) && directId === from.id) return "numeric_id_exact";
  if (user && user !== "username" && from.username && user === from.username) return "username_exact";
  if (name.length >= 4 && from.name.length >= 4 && name === from.name) return "display_name_only";
  return "";
}

export async function readStandardJoinQueue(env = {}, deps = {}) {
  const c = config(env);
  if (!c.token) throw new Error("airtable_not_configured");
  const f = deps.fetch || fetch;
  const [join, source] = await Promise.all([
    airtableList(c, c.join, f, { maxPages: 3 }),
    airtableList(c, c.source, f, { maxPages: 5 }),
  ]);
  const rows = join.rows
    .map((r) => safeRow(r))
    .filter((v) => statusName(v.room) === "standard" && validId(str(v.telegram_user_id_numeric, 30)))
    .sort((a,b) => String(b.requested_at || "").localeCompare(String(a.requested_at || "")))
    .slice(0, DEFAULT_LIMIT);
  const candidates = source.rows.map(safeRow).filter(s => s.line_oa_customer_ref && (s.telegram_display_name || s.telegram_username || s.telegram_user_id_numeric));
  const queue = rows.map(j => {
    const from = {
      id: str(j.telegram_user_id_numeric, 30),
      username: normalizedUser(j.telegram_username),
      name: compactName(j.telegram_display_name),
    };
    const found = [];
    for (const s of candidates) {
      const evidence = candidateEvidence(s, from);
      if (!evidence) continue;
      found.push({
        customer_ref: str(s.line_oa_customer_ref, 200),
        nickname: str(s.nickname, 90),
        evidence,
        weak_only: evidence === "display_name_only",
        possible_duplicate: s.possible_duplicate === true || str(s.possible_duplicate).toLowerCase() === "true",
        source_kind: "unverified_line_oa_chat_export",
      });
    }
    const strength = { numeric_id_exact: 0, username_exact: 1, display_name_only: 2 };
    found.sort((a,b) => strength[a.evidence] - strength[b.evidence]);
    return {
      room: "standard",
      telegram_user_id_masked: "…" + from.id.slice(-4),
      telegram_username: from.username,
      telegram_display_name: str(j.telegram_display_name, 180),
      requested_at: str(j.requested_at, 60),
      review_status: statusName(j.review_status) || "pending_owner_review",
      possible_matches: found.slice(0, 3),
      possible_match_count: found.length,
      matches_require_owner_confirmation: true,
    };
  });
  return {
    ok: true, room: "standard", mode: "owner_review_only", dry_run: true,
    sends_nothing: true, removes_nothing: true, approves_nothing: true,
    count: queue.length, rows_truncated: join.truncated || join.rows.length > DEFAULT_LIMIT,
    source_truncated: source.truncated,
    items: queue,
  };
}
