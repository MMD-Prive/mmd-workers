// Read-only multi-room view for the owner control page (#2141). Reads Entitlements + Clients + Telegram presence (getChatMember).
// Sends nothing, removes nothing, writes nothing. Actionable items are linked members confirmed present in a room they should not be in.
import { resolveMemberEntitlements } from "../../../auth-worker/src/member-entitlement-resolver.js";
import { clean } from "../hype-job-daily/util.js";
import { maskId, groupByMember } from "./audit.js";
import { ROOMS, ROOM_STATE, evaluateRoom, promoGraceUntilMs } from "./rooms.js";

const POLICY_ROOMS = ["standard", "premium", "black", "inner"];
const MAX_LOOKUPS = 80;
const ITEM_CAP = 150;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function buildRoomsPreview({ records = [], now = Date.now(), env = {}, lookupTelegram, checkPresence } = {}) {
  const promoGraceUntil = promoGraceUntilMs(env);
  const policy = Object.fromEntries(POLICY_ROOMS.map((r) => [r, { ok: 0, grace_promo: 0, remove_candidate: 0, review_required: 0 }]));
  const unlinked = Object.fromEntries(POLICY_ROOMS.map((r) => [r, 0]));
  const items = [];
  let lookups = 0;
  let truncated = false;

  for (const group of groupByMember(records)) {
    let resolved;
    try { resolved = resolveMemberEntitlements(group.rows, { now }); } catch { continue; }
    const ents = resolved.entitlements || [];
    const states = {};
    for (const room of POLICY_ROOMS) {
      states[room] = evaluateRoom(room, ents, { now, promoGraceUntil, blocked: Boolean(resolved.member_blocked) });
      policy[room][states[room].state] = (policy[room][states[room].state] || 0) + 1;
    }
    const rooms = POLICY_ROOMS.filter((r) => states[r].state !== ROOM_STATE.OK);
    if (!rooms.length) continue;
    if (!group.line_user_id || typeof lookupTelegram !== "function") { rooms.forEach((r) => (unlinked[r] += 1)); continue; }
    if (lookups >= MAX_LOOKUPS) { truncated = true; continue; }
    lookups += 1;
    let match;
    try { match = await lookupTelegram(group.line_user_id); } catch { match = { state: "lookup_failed" }; }
    const tgId = clean(match?.telegram_user_id, 40);
    if (match?.state !== "linked" || !/^\d+$/.test(tgId)) { rooms.forEach((r) => (unlinked[r] += 1)); continue; }
    const latest = Math.max(0, ...ents.map((e) => Date.parse(e.expire_at) || 0));
    for (const room of rooms) {
      let presence = "not_checked";
      if (typeof checkPresence === "function") {
        try { presence = (await checkPresence(tgId, room))?.presence || "unknown"; } catch { presence = "unknown"; }
        if (presence === "absent") continue;
      }
      items.push({
        member_ref: maskId(group.key.split(":").slice(1).join(":")),
        room,
        room_label: ROOMS[room].label,
        state: states[room].state,
        reason: states[room].reason,
        telegram_user_id_masked: maskId(tgId),
        telegram_presence: presence,
        expired_at: latest && latest < now ? new Date(latest).toISOString().slice(0, 10) : null,
        days_since_expiry: latest && latest < now ? Math.floor((now - latest) / DAY_MS) : null,
      });
    }
  }
  const order = { [ROOM_STATE.REMOVE_CANDIDATE]: 0, [ROOM_STATE.REVIEW]: 1, [ROOM_STATE.GRACE_PROMO]: 2 };
  items.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9));
  return {
    promo_grace_until: promoGraceUntil ? new Date(promoGraceUntil).toISOString() : null,
    rooms: [
      ...POLICY_ROOMS.map((room) => ({ room, label: ROOMS[room].label, can_remove: ROOMS[room].canRemove, policy: policy[room], unlinked_non_entitled: unlinked[room] })),
      { room: "preview", label: ROOMS.preview.label, can_remove: false, view_only: true },
    ],
    items: items.slice(0, ITEM_CAP),
    items_truncated: items.length > ITEM_CAP,
    lookups_truncated: truncated,
  };
}
