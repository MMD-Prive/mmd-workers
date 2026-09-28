import { resolveKenjiLiveMemberContext } from "./kenji-live-member-truth-adapter.mjs";

const AUTHORITY = "my_mmd_entitlement_resolver_v1";
const BLOCKED = new Set(["blocked", "suspended", "revoked", "unresolved", "pending", "ambiguous", "needs_review"]);
const PACK_IDS = Object.freeze({
  guest: "rich_menu_membership_level_response_pack_v1_lv1_guest",
  public_member: "rich_menu_membership_level_response_pack_v1_lv2_public_member",
  private_member: "rich_menu_membership_level_response_pack_v1_lv3_private_member",
});
const GENERIC = "MMD ยินดีช่วยครับ กรุณาแจ้งเรื่องที่ต้องการสอบถามครับ";
const text = (value) => String(value ?? "").trim();

export function isRichMenuSupport(event = {}) {
  return event.type === "postback" && new URLSearchParams(text(event.postback?.data)).getAll("mmd_action").includes("support");
}

// Fresh exact identity and entitlement rows only. Client audience and memory
// never enter the canonical resolver or the response-level decision.
export function canonicalSupportLevel(context = {}) {
  context = context || {};
  const identity = text(context.identity_state).toLowerCase();
  const membership = text(context.membership_state).toLowerCase();
  const level = text(context.level || context.membership_level).toLowerCase();
  if (identity !== "matched") return { level: "guest", reason: "identity_unresolved" };
  if (BLOCKED.has(membership)) return { level: "guest", reason: "membership_blocked_or_unresolved" };
  if (["expired", "grace", "grace_period"].includes(membership)) return { level: "public_member", reason: "membership_expired_or_grace" };
  if (level === "private" && ["active", "expiring_soon"].includes(membership)) return { level: "private_member", reason: "verified_active_private" };
  return { level: "public_member", reason: "verified_without_active_private" };
}

async function readRows(env, table, formula, fields) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !table) throw new Error("lookup_unavailable");
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("filterByFormula", formula);
  for (const field of fields) url.searchParams.append("fields[]", field);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1600);
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` }, signal: controller.signal });
    if (!response.ok) throw new Error("lookup_failed");
    const payload = await response.json();
    // An incomplete set could hide a block/revocation or a duplicate pack.
    if (!Array.isArray(payload.records) || payload.offset) throw new Error("lookup_incomplete");
    return payload.records;
  } finally { clearTimeout(timer); }
}

export function selectSupportPack(rows, level) {
  const matches = rows.map(row => row.fields || {}).filter(card => {
    let payload;
    try { payload = typeof card.payload_json === "string" ? JSON.parse(card.payload_json) : card.payload_json; } catch { return false; }
    const answer = text(card.customer_answer);
    return card.status === "active" && card.response_mode === "auto_reply_allowed" &&
      Array.isArray(card.allowed_channels) && card.allowed_channels.includes("LINE_OFC") &&
      payload?.knowledge_type === "rich_menu_response" && payload.version === "v1" && payload.level === level &&
      payload.status === "published" && payload.source === "membership_resolver" && card.knowledge_id === PACK_IDS[level] &&
      text(card.knowledge_id) && answer.length > 0 && answer.length <= 1600 &&
      (level === "private_member" || !/kenji|เคนจิ/i.test(answer));
  });
  return matches.length === 1 ? matches[0] : null;
}

export async function resolveRichMenuSupport(event, env) {
  let canonical = { level: "guest", reason: "lookup_unavailable" };
  let verified = false;
  try {
    const id = event.source?.type === "user" ? text(event.source.userId) : "";
    if (!/^U[0-9a-f]{32}$/i.test(id)) throw new Error("identity_unavailable");
    const context = await resolveKenjiLiveMemberContext(env, id, "support");
    if (!context?.live_truth) throw new Error("member_truth_unavailable");
    canonical = canonicalSupportLevel(context);
    verified = true;
  } catch { /* Generic MMD only when canonical lookup is incomplete. */ }
  let card = null;
  if (verified) {
    try {
      const rows = await readRows(env, env.AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID || "tblsLd1uVOtG2kHoU",
        'AND({status}="active",FIND("rich_menu_response",{payload_json}))',
        ["knowledge_id", "customer_answer", "allowed_channels", "status", "response_mode", "risk_level", "source_path", "payload_json"]);
      card = selectSupportPack(rows, canonical.level);
    } catch { /* Missing, malformed, duplicate or unavailable packs fail closed. */ }
  }
  return {
    intent: "support", inferred_intent: "support", text: card ? text(card.customer_answer).replace(/\\n/g, "\n") : GENERIC,
    reply_source: card ? "rich_menu_response" : "rich_menu_fail_closed",
    selected_knowledge_ids: card ? [text(card.knowledge_id)] : [], knowledge_hits: card ? 1 : 0,
    knowledge_response_mode: card ? text(card.response_mode) : "", knowledge_source_path: card ? text(card.source_path) : "",
    canonical_level: canonical.level, response_level: card ? canonical.level : "guest", membership_reason: canonical.reason,
    truth_authority: AUTHORITY, truth_status: verified ? "verified" : "unavailable", live_truth_used: verified,
    model_attempted: false, guard_blocked: !card, guard_reason: card ? "" : "rich_menu_fail_closed",
    handoff_required: !card, handoff_reason: card ? "" : "rich_menu_pack_or_truth_unavailable",
  };
}
