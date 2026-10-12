// Telegram room policy for the owner control page (#2141). Pure functions, no I/O, never removes anything.
// Rooms (owner decisions 2026-10-12):
//   standard : every member tier, expired members may stay (news only)
//   premium  : Premium+ not expired, Guest Pass 7 days; expired Premium -> promo grace until PREMIUM_GROUP_PROMO_GRACE_UNTIL
//   black    : VIP + Black Card (+ SVIP who were VIP before); expired -> owner decides per person
//   inner    : SVIP only; expired -> owner decides per person
//   preview  : public channel, view only
// Anything uncertain is review_required (owner only). Chat ids come from env, never from code.
import { CAPABILITIES } from "../../../auth-worker/src/member-entitlement-resolver.js";
import { clean, token } from "../hype-job-daily/util.js";

export const ROOM_STATE = Object.freeze({
  OK: "ok",
  GRACE_PROMO: "grace_promo",
  REMOVE_CANDIDATE: "remove_candidate",
  REVIEW: "review_required",
  VIEW_ONLY: "view_only",
});

export const ROOM_REASON = Object.freeze({
  ENTITLED: "entitled",
  EXPIRED_STANDARD_STAYS: "expired_standard_may_stay",
  PROMO_GRACE: "expired_in_promo_grace",
  EXPIRED_NOT_RENEWED: "expired_not_renewed",
  GUEST_PASS_ENDED: "guest_pass_ended",
  TIER_BELOW_ROOM: "tier_below_room",
  NOT_A_MEMBER: "not_a_member",
  VIP_CLASS_EXPIRED: "vip_class_expired_owner_decides",
  VIP_CLASS_UNVERIFIED: "vip_class_state_unclear",
  OWNER_GRANT: "owner_grant_or_override",
  BLOCKED: "membership_blocked",
  PENDING: "payment_pending_review",
  PREVIEW_VIEW_ONLY: "preview_channel_view_only",
});

// Env names live in telegram-worker. black/inner use *_PRESENCE_* ids on purpose: TELEGRAM_BLACK_ROOM_ID / TELEGRAM_SVIP_ROOM_ID
// would enable the existing access/reconcile grant/revoke flow, which this page must not switch on by itself.
export const ROOMS = Object.freeze({
  standard: { label: "Standard", env: "TELEGRAM_STANDARD_GROUP_ID", canRemove: true },
  premium: { label: "Premium", env: "TELEGRAM_PREMIUM_GROUP_ID", canRemove: true },
  black: { label: "The Black Room", env: "TELEGRAM_PRESENCE_BLACK_ROOM_ID", canRemove: true },
  inner: { label: "Inner Chamber", env: "TELEGRAM_PRESENCE_INNER_ROOM_ID", canRemove: true },
  preview: { label: "Preview channel", env: "TELEGRAM_PREVIEW_CHANNEL_ID", canRemove: false },
});

const VIP_CLASS = new Set([CAPABILITIES.VIP, CAPABILITIES.SVIP, CAPABILITIES.BLACK_CARD]);
const LIVE = new Set(["active", "expiring_soon", "grace"]);
const PENDING = new Set(["pending", "pending_payment", "pending_review", "payment_pending", "renewal_pending"]);
const OWNER_SOURCES = new Set(["manual", "owner", "owner_grant", "owner_override", "admin_override"]);

export function roomConfigured(env = {}, room) {
  const def = ROOMS[room];
  return Boolean(def && clean(env[def.env], 40));
}

export function promoGraceUntilMs(env = {}) {
  const ms = Date.parse(clean(env.PREMIUM_GROUP_PROMO_GRACE_UNTIL, 40));
  return Number.isFinite(ms) ? ms : 0;
}

const res = (state, reason) => ({ state, reason });
const isLive = (e) => LIVE.has(e.lifecycle);

// entitlements: items from resolveMemberEntitlements().entitlements
export function evaluateRoom(room, entitlements = [], opts = {}) {
  const out = evaluateRoomBase(room, entitlements, opts);
  // An owner-granted/overridden entitlement is fine while it is live, but never auto-removable.
  const owner = (Array.isArray(entitlements) ? entitlements : []).some((e) => OWNER_SOURCES.has(token(e.source)));
  if (owner && (out.state === ROOM_STATE.REMOVE_CANDIDATE || out.state === ROOM_STATE.GRACE_PROMO)) return res(ROOM_STATE.REVIEW, ROOM_REASON.OWNER_GRANT);
  return out;
}

function evaluateRoomBase(room, entitlements = [], { now = Date.now(), promoGraceUntil = 0, blocked = false } = {}) {
  if (room === "preview") return res(ROOM_STATE.VIEW_ONLY, ROOM_REASON.PREVIEW_VIEW_ONLY);
  const ents = Array.isArray(entitlements) ? entitlements : [];
  if (!ents.length) return res(ROOM_STATE.REVIEW, ROOM_REASON.NOT_A_MEMBER);
  if (blocked || ents.some((e) => e.lifecycle === "blocked")) return res(ROOM_STATE.REVIEW, ROOM_REASON.BLOCKED);
  if (ents.some((e) => e.lifecycle === "pending" || PENDING.has(token(e.member_status)) || PENDING.has(token(e.access_status)))) {
    return res(ROOM_STATE.REVIEW, ROOM_REASON.PENDING);
  }
  const live = ents.filter(isLive);
  const liveCaps = new Set(live.map((e) => e.capability));
  const hasVipClass = ents.some((e) => VIP_CLASS.has(e.capability));
  const liveVipClass = [...liveCaps].some((c) => VIP_CLASS.has(c));
  const livePremiumUp = liveCaps.has(CAPABILITIES.PRIVATE_PREMIUM) || liveVipClass;
  const liveGuest = liveCaps.has(CAPABILITIES.GUEST_PASS);

  if (room === "standard") {
    const anyPrivateOrGuest = ents.some((e) => [CAPABILITIES.PRIVATE_STANDARD, CAPABILITIES.PRIVATE_PREMIUM, CAPABILITIES.GUEST_PASS].includes(e.capability) || VIP_CLASS.has(e.capability));
    if (live.length && (livePremiumUp || liveCaps.has(CAPABILITIES.PRIVATE_STANDARD) || liveGuest)) return res(ROOM_STATE.OK, ROOM_REASON.ENTITLED);
    if (anyPrivateOrGuest) return res(ROOM_STATE.OK, ROOM_REASON.EXPIRED_STANDARD_STAYS);
    return res(ROOM_STATE.REVIEW, ROOM_REASON.NOT_A_MEMBER);
  }

  if (room === "premium") {
    if (livePremiumUp) return res(ROOM_STATE.OK, ROOM_REASON.ENTITLED);
    if (liveGuest) return res(ROOM_STATE.OK, ROOM_REASON.ENTITLED); // 7-day window is enforced by the resolver lifecycle
    if (hasVipClass) return res(ROOM_STATE.REVIEW, ROOM_REASON.VIP_CLASS_EXPIRED);
    const premiumExpired = ents.some((e) => e.capability === CAPABILITIES.PRIVATE_PREMIUM);
    if (premiumExpired) {
      if (promoGraceUntil && now <= promoGraceUntil) return res(ROOM_STATE.GRACE_PROMO, ROOM_REASON.PROMO_GRACE);
      return res(ROOM_STATE.REMOVE_CANDIDATE, ROOM_REASON.EXPIRED_NOT_RENEWED);
    }
    if (ents.some((e) => e.capability === CAPABILITIES.GUEST_PASS)) return res(ROOM_STATE.REMOVE_CANDIDATE, ROOM_REASON.GUEST_PASS_ENDED);
    return res(ROOM_STATE.REMOVE_CANDIDATE, ROOM_REASON.TIER_BELOW_ROOM);
  }

  if (room === "black") {
    if (liveVipClass) return res(ROOM_STATE.OK, ROOM_REASON.ENTITLED);
    if (hasVipClass) return res(ROOM_STATE.REVIEW, ROOM_REASON.VIP_CLASS_EXPIRED);
    return res(ROOM_STATE.REMOVE_CANDIDATE, ROOM_REASON.TIER_BELOW_ROOM);
  }

  if (room === "inner") {
    if (liveCaps.has(CAPABILITIES.SVIP)) return res(ROOM_STATE.OK, ROOM_REASON.ENTITLED);
    if (ents.some((e) => e.capability === CAPABILITIES.SVIP)) return res(ROOM_STATE.REVIEW, ROOM_REASON.VIP_CLASS_EXPIRED);
    return res(ROOM_STATE.REMOVE_CANDIDATE, ROOM_REASON.TIER_BELOW_ROOM);
  }

  return res(ROOM_STATE.REVIEW, ROOM_REASON.VIP_CLASS_UNVERIFIED);
}
