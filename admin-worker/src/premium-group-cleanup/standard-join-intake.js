// #2141: STANDARD + PREMIUM Telegram join requests -> separate private Airtable staging, unified owner review.
// Intentionally no approve/decline, sendMessage, customer bind, or entitlement mutations.
export const STANDARD_JOIN_INTAKE_RPC_PATH = "/__internal/telegram-standard-join-intake";
export const GROUP_JOIN_INTAKE_RPC_PATH = "/__internal/telegram-group-join-intake";
const JOIN_TABLE_DEFAULT = "tblGFkPcMFsxsW5Ul";
const PREMIUM_JOIN_TABLE_DEFAULT = "tblQVya3rvb1CpRrB";
const SOURCE_TABLE_DEFAULT = "tblCVwWXwyEhU2AEN";
const BASE_DEFAULT = "appsV1ILPRfIjkaYg";
const AT = "https://api.airtable.com/v0/";
const DEFAULT_LIMIT = 100;

const str = (v, max = 180) => String(v == null ? "" : v).trim().slice(0, max);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
});
const isEnabled = (env, room) => str(room === "premium" ? env.TELEGRAM_PREMIUM_JOIN_CAPTURE_ENABLED : env.TELEGRAM_STANDARD_JOIN_CAPTURE_ENABLED, 10).toLowerCase() === "true";
const validId = (v) => /^\d{5,20}$/.test(v);
const normalizedUser = (v) => str(v, 80).replace(/^@/, "").toLowerCase();
const compactName = (v) => str(v, 180).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const maybeName = (v) => str(v, 180).replace(/[\u0000-\u001f\u007f]/g, " ");
const statusName = (v) => typeof v === "string" ? v : str(v?.name, 40);
function config(env) {
  return {
    base: str(env.AIRTABLE_BASE_ID || BASE_DEFAULT, 70),
    join: str(env.AIRTABLE_TELEGRAM_STANDARD_JOIN_INTAKE_TABLE_ID || JOIN_TABLE_DEFAULT, 80),
    premiumJoin: str(env.AIRTABLE_TELEGRAM_PREMIUM_JOIN_INTAKE_TABLE_ID || PREMIUM_JOIN_TABLE_DEFAULT, 80),
    source: str(env.AIRTABLE_TELEGRAM_LINK_SOURCE_STAGING_TABLE_ID || SOURCE_TABLE_DEFAULT, 80),
    token: str(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 2500),
  };
}
function apiUrl(c, table, qs = "") {
  return AT + encodeURIComponent(c.base) + "/" + table.split("/").map(encodeURIComponent).join("/") + (qs ? "?" + qs : "");
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
  const p = String(path || "").replace(/\/+$/, "");
  return p === STANDARD_JOIN_INTAKE_RPC_PATH || p === GROUP_JOIN_INTAKE_RPC_PATH;
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
  // Preserve the legacy Standard fast-path for deployed clients.
  if (url.pathname === STANDARD_JOIN_INTAKE_RPC_PATH && !isEnabled(env, "standard"))
    return json({ ok: true, captured: false, state: "disabled" });
  const data = await request.json().catch(() => null);
  const room = data?.room;
  if (!["standard", "premium"].includes(room)) return failure("room_not_supported", 400);
  if (url.pathname === STANDARD_JOIN_INTAKE_RPC_PATH && room !== "standard") return failure("room_not_supported", 400);
  if (!isEnabled(env, room)) return json({ ok: true, captured: false, state: "disabled" });
  const uid = str(data.telegram_user_id_numeric, 30);
  const date = Number(data.requested_at_unix);
  if (!validId(uid) || !Number.isInteger(date) || date < 1500000000 || date > 2500000000) return failure("invalid_join_request", 400);
  const username = normalizedUser(data.telegram_username);
  if (username && !/^[a-z0-9_]{5,32}$/.test(username)) return failure("invalid_username", 400);
  const displayName = maybeName(data.telegram_display_name);
  const at = new Date(date * 1000).toISOString();
  const states = new Set(["canonical_verified", "needs_telegram_link", "review_required", "blocked_review", "authority_unavailable"]);
  const hypeState = str(data.hype_check_state, 50);
  const safeHypeState = states.has(hypeState) ? hypeState : "authority_unavailable";
  const level = str(data.hype_membership_level, 60).toLowerCase();
  const lifecycle = str(data.hype_membership_lifecycle, 60).toLowerCase();
  // Values are hints from the private HYPE read-only status service; never an approval authority.
  const hypeFields = {
    hype_check_state: safeHypeState,
    hype_membership_level: /^[a-z0-9_]{2,60}$/.test(level) ? level : "",
    hype_membership_lifecycle: /^[a-z0-9_]{2,60}$/.test(lifecycle) ? lifecycle : "",
    hype_checked_at: new Date().toISOString(),
  };
  const c = config(env);
  if (!c.token) return failure("airtable_not_configured", 503);
  const table = room === "premium" ? c.premiumJoin : c.join;
  const allowedOutcomes = new Set(["approved_by_existing_handler", "pending_owner_review", "approval_failed", "unknown"]);
  const outcome = str(data.join_outcome, 50);
  const outcomeFields = room === "premium"
    ? { join_outcome: allowedOutcomes.has(outcome) ? outcome : "unknown" }
    : {};
  const joinKey = `${room}:${uid}`;
  const filter = `{join_key}="${joinKey}"`; // uid is strictly numeric; no formula injection
  const f = deps.fetch || fetch;
  try {
    const existing = await airtableList(c, table, f, { filter, maxPages: 1 });
    if (existing.truncated || existing.rows.length > 1) return failure("join_key_conflict", 409);
    if (existing.rows.length === 1) {
      // Refresh only HYPE's read-only assessment. Never overwrite owner review or original Telegram evidence.
      if (!/^rec[A-Za-z0-9]{14}$/.test(str(existing.rows[0].id, 40))) return failure("join_record_invalid", 503);
      await airtableRequest(c, table + "/" + existing.rows[0].id, f, {
        method: "PATCH", body: JSON.stringify({ fields: { ...hypeFields, ...outcomeFields }, typecast: false }),
      });
      return json({ ok: true, captured: true, state: "already_recorded", room });
    }

    // Race-safe upsert keyed by (room + numeric id); no phone/email/note is captured.
    // Do not set review_status in a replay update: the UI treats empty as pending.
    const created = await airtableRequest(c, table, f, {
      method: "POST",
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: ["join_key"] },
        records: [{ fields: {
          join_key: joinKey,
          room,
          telegram_user_id_numeric: uid,
          telegram_username: username,
          telegram_display_name: displayName,
          requested_at: at,
          evidence_source: "telegram_chat_join_request",
          ...hypeFields,
          ...outcomeFields,
        } }],
        typecast: false,
      }),
    });
    if (!created.records?.length) return failure("capture_not_confirmed", 503);
    return json({ ok: true, captured: true, state: "pending_owner_review", room });
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
  // Separate source tables avoid cross-room identity collisions and preserve owner decisions.
  const [standard, premium, source] = await Promise.all([
    airtableList(c, c.join, f, { maxPages: 3 }),
    airtableList(c, c.premiumJoin, f, { maxPages: 3 }),
    airtableList(c, c.source, f, { maxPages: 5 }),
  ]);
  const all = [
    ...standard.rows.map(r => ({ ...safeRow(r), observed_room: "standard" })),
    ...premium.rows.map(r => ({ ...safeRow(r), observed_room: "premium" })),
  ];
  const counts = { standard: 0, premium: 0 };
  const valid = all.filter(v => ["standard", "premium"].includes(v.observed_room)
    && statusName(v.room) === v.observed_room && validId(str(v.telegram_user_id_numeric, 30)));
  for (const item of valid) counts[item.observed_room]++;
  const rows = valid
    .sort((a,b) => String(b.requested_at || "").localeCompare(String(a.requested_at || "")))
    .slice(0, DEFAULT_LIMIT);
  const candidates = source.rows.map(safeRow)
    .filter(s => s.line_oa_customer_ref && (s.telegram_display_name || s.telegram_username || s.telegram_user_id_numeric));
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
    const outcome = str(j.join_outcome?.name || j.join_outcome, 50);
    return {
      room: j.observed_room,
      telegram_user_id_masked: "…" + from.id.slice(-4),
      telegram_username: from.username,
      telegram_display_name: str(j.telegram_display_name, 180),
      requested_at: str(j.requested_at, 60),
      review_status: statusName(j.review_status) || "pending_owner_review",
      join_outcome: j.observed_room === "premium" ? (outcome || "unknown") : "pending_owner_review",
      hype_check_state: statusName(j.hype_check_state) || "not_checked",
      hype_membership_level: str(j.hype_membership_level, 60),
      hype_membership_lifecycle: str(j.hype_membership_lifecycle, 60),
      hype_checked_at: str(j.hype_checked_at, 60),
      possible_matches: found.slice(0, 3),
      possible_match_count: found.length,
      matches_require_owner_confirmation: true,
    };
  });
  return {
    ok: true, rooms: ["premium", "standard"], mode: "owner_review_only", dry_run: true,
    sends_nothing: true, removes_nothing: true, approves_nothing: true,
    count: queue.length, by_room: counts,
    capture_enabled: { standard: isEnabled(env, "standard"), premium: isEnabled(env, "premium") },
    rows_truncated: standard.truncated || premium.truncated || valid.length > DEFAULT_LIMIT,
    source_truncated: source.truncated,
    roster_complete: false,
    items: queue,
  };
}
