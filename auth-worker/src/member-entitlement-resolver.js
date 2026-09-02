const CAPABILITIES = Object.freeze({
  PUBLIC_MEMBER: "public_member",
  RED_CARD: "red_card",
  GUEST_PASS: "guest_pass",
  PRIVATE_STANDARD: "private_standard",
  PRIVATE_PREMIUM: "private_premium",
  VIP: "vip",
  SVIP: "svip",
  BLACK_CARD: "black_card",
});

const PROTECTED = new Set([
  CAPABILITIES.VIP,
  CAPABILITIES.SVIP,
  CAPABILITIES.BLACK_CARD,
]);

const PRIVATE = new Set([
  CAPABILITIES.PRIVATE_STANDARD,
  CAPABILITIES.PRIVATE_PREMIUM,
  CAPABILITIES.VIP,
  CAPABILITIES.SVIP,
  CAPABILITIES.BLACK_CARD,
]);

const HARD_BLOCK_STATUSES = new Set(["blocked", "suspended"]);
const REVOKED_STATUSES = new Set(["revoked"]);
const ACTIVE_STATUSES = new Set(["active"]);
const GRACE_STATUSES = new Set(["grace", "grace_period"]);

export { CAPABILITIES };

export function resolveMemberEntitlements(records = [], options = {}) {
  const now = parseNow(options.now);
  const normalized = Array.isArray(records)
    ? records.map((record, index) => normalizeEntitlement(record, index, now)).filter(Boolean)
    : [];

  const memberHardBlocked = normalized.some((item) => HARD_BLOCK_STATUSES.has(item.member_status));
  const active = normalized.filter((item) => item.lifecycle === "active");
  const grace = normalized.filter((item) => item.lifecycle === "grace");
  const inactive = normalized.filter((item) => !["active", "grace"].includes(item.lifecycle));

  const effective = memberHardBlocked ? [] : unique(active.map((item) => item.capability));
  const graceCapabilities = memberHardBlocked ? [] : unique(grace.map((item) => item.capability));
  const allRecognized = unique(normalized.map((item) => item.capability));

  const privateActive = effective.filter((capability) => PRIVATE.has(capability));
  const privateGrace = graceCapabilities.filter((capability) => PRIVATE.has(capability));
  const protectedActive = effective.filter((capability) => PROTECTED.has(capability));
  const protectedGrace = graceCapabilities.filter((capability) => PROTECTED.has(capability));

  const privateVisibilityEnvelope = memberHardBlocked
    ? "none"
    : highestPrivateEnvelope([...privateActive, ...privateGrace]);

  const hasPublicMember = effective.includes(CAPABILITIES.PUBLIC_MEMBER);
  const hasGuestPass = effective.includes(CAPABILITIES.GUEST_PASS);
  const hasPrivate = privateActive.length > 0;
  const hasBlackCard = effective.includes(CAPABILITIES.BLACK_CARD);
  const hasRedCard = effective.includes(CAPABILITIES.RED_CARD);

  const publicServiceAccess = !memberHardBlocked && (hasPublicMember || hasGuestPass || hasPrivate);
  const redCardRequestLane = !memberHardBlocked && (hasRedCard || hasBlackCard);

  return {
    schema_version: "my_mmd_entitlement_resolver_v1",
    evaluated_at: new Date(now).toISOString(),
    fail_closed: true,
    member_blocked: memberHardBlocked,
    entitlements: normalized,
    capability_state: {
      active: effective,
      grace: graceCapabilities,
      inactive: unique(inactive.map((item) => item.capability)),
      recognized: allRecognized,
    },
    access: {
      public_service_access: publicServiceAccess,
      guest_pass_access: !memberHardBlocked && hasGuestPass,
      red_card_request_lane: redCardRequestLane,
      private_visibility_envelope: privateVisibilityEnvelope,
      protected_allowlist_required: protectedActive.length > 0 || protectedGrace.length > 0,
      protected_capabilities_active: protectedActive,
      protected_capabilities_grace: protectedGrace,
      new_protected_grants_allowed: !memberHardBlocked && protectedActive.length > 0,
      new_drive_grants_allowed: !memberHardBlocked && active.length > 0 && grace.length === 0,
      new_telegram_grants_allowed: !memberHardBlocked && active.length > 0 && grace.length === 0,
      existing_grants_may_continue_in_grace: !memberHardBlocked && grace.length > 0,
    },
    review: {
      unknown_records: normalized.filter((item) => item.capability === "unknown").map((item) => item.source_ref).filter(Boolean),
      revoked_records: normalized.filter((item) => item.lifecycle === "revoked").map((item) => item.source_ref).filter(Boolean),
      blocked_records: normalized.filter((item) => item.lifecycle === "blocked").map((item) => item.source_ref).filter(Boolean),
    },
  };
}

export function normalizeEntitlement(record, index = 0, now = Date.now()) {
  const fields = record?.fields || record || {};
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;

  const capability = capabilityFromFields(fields);
  const memberStatus = token(fields.member_status || fields["Membership Status"]);
  const accessStatus = token(fields.access_status || fields.status);
  const startAt = timestamp(fields.start_at || fields.start_date);
  const expireAt = timestamp(fields.expire_at || fields.end_date || fields["Membership Expiry"]);
  const graceUntil = timestamp(fields.grace_until);
  const isGuestPass = capability === CAPABILITIES.GUEST_PASS;

  let lifecycle = "inactive";
  if (HARD_BLOCK_STATUSES.has(memberStatus) || HARD_BLOCK_STATUSES.has(accessStatus)) {
    lifecycle = "blocked";
  } else if (REVOKED_STATUSES.has(memberStatus) || REVOKED_STATUSES.has(accessStatus)) {
    lifecycle = "revoked";
  } else if (startAt && startAt > now) {
    lifecycle = "pending";
  } else if (expireAt && expireAt < now) {
    if (!isGuestPass && graceUntil && graceUntil >= now) lifecycle = "grace";
    else lifecycle = "expired";
  } else if (!isGuestPass && (GRACE_STATUSES.has(accessStatus) || GRACE_STATUSES.has(memberStatus))) {
    lifecycle = graceUntil && graceUntil < now ? "expired" : "grace";
  } else if (ACTIVE_STATUSES.has(accessStatus) || ACTIVE_STATUSES.has(memberStatus)) {
    lifecycle = "active";
  } else if (!accessStatus && !memberStatus && expireAt && expireAt >= now) {
    lifecycle = "active";
  }

  return {
    entitlement_id: text(fields.entitlement_id) || `row_${index + 1}`,
    capability,
    lifecycle,
    access_status: accessStatus,
    member_status: memberStatus,
    start_at: isoOrBlank(startAt),
    expire_at: isoOrBlank(expireAt),
    grace_until: isGuestPass ? "" : isoOrBlank(graceUntil),
    source: text(fields.source),
    source_ref: text(fields.source_ref || fields.entitlement_id),
    package_code: text(fields.package_code),
    relationship_tier: text(fields.relationship_tier),
  };
}

export function capabilityFromFields(fields = {}) {
  const candidates = [
    fields.capability,
    fields.entitlement_level,
    fields.package_code,
    fields.target_package_label,
    fields.relationship_tier,
    fields.tier,
    fields["Membership Tier"],
  ].map(token).filter(Boolean);

  for (const value of candidates) {
    if (matches(value, ["black_card", "blackcard"])) return CAPABILITIES.BLACK_CARD;
    if (matches(value, ["svip"])) return CAPABILITIES.SVIP;
    if (matches(value, ["vip"])) return CAPABILITIES.VIP;
    if (matches(value, ["red_card", "redcard"])) return CAPABILITIES.RED_CARD;
    if (matches(value, ["guest_pass", "guestpass", "7_day", "7_days", "7days"])) return CAPABILITIES.GUEST_PASS;
    if (matches(value, ["premium_private", "private_premium", "premium"])) return CAPABILITIES.PRIVATE_PREMIUM;
    if (matches(value, ["standard_private", "private_standard", "standard"])) return CAPABILITIES.PRIVATE_STANDARD;
    if (matches(value, ["public_member", "public_membership", "member_690"])) return CAPABILITIES.PUBLIC_MEMBER;
  }

  return "unknown";
}

function highestPrivateEnvelope(capabilities) {
  const set = new Set(capabilities);
  if (set.has(CAPABILITIES.BLACK_CARD)) return "black_card";
  if (set.has(CAPABILITIES.SVIP)) return "svip";
  if (set.has(CAPABILITIES.VIP)) return "vip";
  if (set.has(CAPABILITIES.PRIVATE_PREMIUM)) return "premium";
  if (set.has(CAPABILITIES.PRIVATE_STANDARD)) return "standard";
  return "none";
}

function matches(value, names) {
  return names.some((name) => value === name || value.includes(name));
}

function token(value) {
  return text(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function text(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(",");
  if (typeof value === "object") return String(value.name || value.value || value.id || "").trim();
  return String(value).trim();
}

function timestamp(value) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isoOrBlank(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : "";
}

function parseNow(value) {
  if (value === undefined || value === null || value === "") return Date.now();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new TypeError("options.now must be a valid timestamp");
  return parsed;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
