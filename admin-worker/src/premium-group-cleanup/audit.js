// PREMIUM_GROUP_ELIGIBILITY_CLEANUP (#2141) — phase 1: pure dry-run classification.
// No I/O, no messages, no removal. Anything uncertain is review_required (owner only).
import { CAPABILITIES, resolveMemberEntitlements } from "../../../auth-worker/src/member-entitlement-resolver.js";
import { clean, token } from "../hype-job-daily/util.js";

export const DECISION = Object.freeze({
  CANDIDATE: "dry_run_candidate",
  REVIEW: "review_required",
  IGNORED: "ignored",
});

export const REASON = Object.freeze({
  EXPIRED_NOT_RENEWED: "premium_expired_not_renewed",
  STILL_ENTITLED: "premium_still_entitled",
  PROTECTED_TIER: "protected_tier",
  MEMBER_BLOCKED: "membership_blocked",
  PAYMENT_PENDING: "payment_pending_review",
  OWNER_GRANT: "owner_grant_or_override",
  NO_TELEGRAM_MATCH: "no_reliable_telegram_match",
  SOURCE_FAILURE: "resolver_source_failure",
  NOT_IN_GROUP: "not_in_premium_group",
  PRIVILEGED_IN_GROUP: "privileged_in_group",
});

const PROTECTED = new Set([CAPABILITIES.VIP, CAPABILITIES.SVIP, CAPABILITIES.BLACK_CARD]);
const PENDING_STATES = new Set(["pending", "pending_payment", "pending_review", "payment_pending", "renewal_pending"]);
const OWNER_SOURCES = new Set(["manual", "owner", "owner_grant", "owner_override", "admin_override"]);
const DAY_MS = 24 * 60 * 60 * 1000;

export const isEnabled = (env = {}) => String(env.PREMIUM_GROUP_ELIGIBILITY_CLEANUP_ENABLED ?? "").trim().toLowerCase() === "true";
export const isDryRun = (env = {}) => String(env.PREMIUM_GROUP_CLEANUP_DRY_RUN ?? "true").trim().toLowerCase() !== "false";

export function maskId(value) {
  const text = clean(value, 80);
  return text ? `…${text.slice(-4)}` : "";
}

export function memberKey(fields = {}) {
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const line = clean(first(fields.line_user_id), 80);
  if (line) return `line:${line}`;
  const email = clean(first(fields.member_email), 160).toLowerCase();
  return email ? `email:${email}` : "";
}

export function groupByMember(records = []) {
  const groups = new Map();
  for (const record of records) {
    const fields = record?.fields || record || {};
    const key = memberKey(fields);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, line_user_id: clean(Array.isArray(fields.line_user_id) ? fields.line_user_id[0] : fields.line_user_id, 80), rows: [] });
    groups.get(key).rows.push({ ...fields });
  }
  return [...groups.values()];
}

function item(group, decision, reason, extra = {}) {
  return { member_ref: maskId(group.key.split(":").slice(1).join(":")), decision, reason, ...extra };
}

// lookupTelegram(lineUserId) -> { state: "linked"|"not_linked"|"ambiguous"|"lookup_failed", telegram_user_id? }
export function classifyMember(group, { now = Date.now(), lookupTelegram } = {}) {
  let resolved;
  try {
    resolved = resolveMemberEntitlements(group.rows, { now });
  } catch {
    return item(group, DECISION.REVIEW, REASON.SOURCE_FAILURE);
  }
  const ents = resolved.entitlements || [];
  const premium = ents.filter((e) => e.capability === CAPABILITIES.PRIVATE_PREMIUM);
  if (!premium.length) return null;

  if (ents.some((e) => PROTECTED.has(e.capability))) return item(group, DECISION.REVIEW, REASON.PROTECTED_TIER);
  if (resolved.member_blocked || premium.some((e) => e.lifecycle === "blocked")) return item(group, DECISION.REVIEW, REASON.MEMBER_BLOCKED);
  if (premium.some((e) => ["active", "expiring_soon", "grace"].includes(e.lifecycle))) return item(group, DECISION.IGNORED, REASON.STILL_ENTITLED);

  if (premium.some((e) => e.lifecycle === "pending" || PENDING_STATES.has(token(e.member_status)) || PENDING_STATES.has(token(e.access_status)))) {
    return item(group, DECISION.REVIEW, REASON.PAYMENT_PENDING);
  }
  if (premium.some((e) => OWNER_SOURCES.has(token(e.source)))) return item(group, DECISION.REVIEW, REASON.OWNER_GRANT);
  if (!premium.every((e) => e.lifecycle === "expired")) return item(group, DECISION.REVIEW, REASON.SOURCE_FAILURE);

  if (!group.line_user_id || typeof lookupTelegram !== "function") return item(group, DECISION.REVIEW, REASON.NO_TELEGRAM_MATCH);
  return { group, premium, needsLookup: true };
}

// checkPresence(telegramUserId) -> { presence: "present"|"absent"|"privileged"|"unknown" } (optional; read-only).
export async function buildAudit(records = [], { now = Date.now(), lookupTelegram, checkPresence } = {}) {
  const items = [];
  for (const group of groupByMember(records)) {
    const first = classifyMember(group, { now, lookupTelegram });
    if (!first) continue;
    if (!first.needsLookup) { items.push(first); continue; }
    let match;
    try { match = await lookupTelegram(first.group.line_user_id); } catch { match = { state: "lookup_failed" }; }
    const state = match?.state;
    if (state === "lookup_failed") { items.push(item(group, DECISION.REVIEW, REASON.SOURCE_FAILURE)); continue; }
    const tgId = clean(match?.telegram_user_id, 40);
    if (state !== "linked" || !/^\d+$/.test(tgId)) { items.push(item(group, DECISION.REVIEW, REASON.NO_TELEGRAM_MATCH)); continue; }
    let presence = "not_checked";
    if (typeof checkPresence === "function") {
      try { presence = (await checkPresence(tgId))?.presence || "unknown"; } catch { presence = "unknown"; }
      if (presence === "absent") { items.push(item(group, DECISION.IGNORED, REASON.NOT_IN_GROUP)); continue; }
      if (presence === "privileged") { items.push(item(group, DECISION.REVIEW, REASON.PRIVILEGED_IN_GROUP)); continue; }
      if (presence !== "present") { items.push(item(group, DECISION.REVIEW, REASON.SOURCE_FAILURE)); continue; }
    }
    const latest = Math.max(...first.premium.map((e) => Date.parse(e.expire_at) || 0));
    items.push(item(group, DECISION.CANDIDATE, REASON.EXPIRED_NOT_RENEWED, {
      expired_at: latest ? new Date(latest).toISOString().slice(0, 10) : null,
      days_since_expiry: latest ? Math.floor((now - latest) / DAY_MS) : null,
      telegram_user_id_masked: maskId(tgId),
      telegram_presence: presence,
    }));
  }
  const order = { [DECISION.CANDIDATE]: 0, [DECISION.REVIEW]: 1, [DECISION.IGNORED]: 2 };
  items.sort((a, b) => order[a.decision] - order[b.decision]);
  const counts = { total: items.length, candidates: 0, review_required: 0, ignored: 0 };
  const by_reason = {};
  for (const it of items) {
    if (it.decision === DECISION.CANDIDATE) counts.candidates++;
    else if (it.decision === DECISION.REVIEW) counts.review_required++;
    else counts.ignored++;
    by_reason[it.reason] = (by_reason[it.reason] || 0) + 1;
  }
  return { counts, by_reason, items };
}
