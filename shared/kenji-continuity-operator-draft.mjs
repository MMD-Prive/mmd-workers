export const KENJI_CONTINUITY_OPERATOR_DRAFT_SCHEMA = "mmd.kenji_continuity_operator_draft.v1";
export const KENJI_CONTINUITY_OPERATOR_DRAFT_MODE = "operator_draft";

const MAX_MATRIX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const OPEN_STAGES = new Set([
  "in_progress",
  "awaiting_customer",
  "awaiting_per",
  "awaiting_payment_verification",
  "awaiting_entitlement_refresh",
  "handoff",
]);
const ALLOWED_CHANNELS = new Set(["line", "line_oa", "line_ofc", "liff"]);
const RETURNING_RELATIONSHIPS = new Set([
  "known_customer",
  "repeat_customer",
  "active_member",
  "expired_member",
  "private_access_verified",
  "vip_relationship",
  "svip_relationship",
  "blackcard_relationship",
]);
const TOPIC_LABELS = Object.freeze({
  payment: "เรื่องชำระเงิน",
  membership: "เรื่องสมาชิก",
  entitlement: "เรื่องสิทธิ์สมาชิก",
  points: "เรื่องพอยต์",
  booking: "เรื่องการจอง",
  availability: "เรื่องคิว",
  pricing: "เรื่องเรต",
  model_access: "เรื่องสิทธิ์ดูโปรไฟล์",
  model_visibility: "เรื่องสิทธิ์ดูโปรไฟล์",
  aftercare: "เรื่องดูแลหลังใช้บริการ",
  coupon: "เรื่องคูปอง",
  care_back: "เรื่อง CARE BACK",
  shop: "เรื่องออเดอร์",
  order: "เรื่องออเดอร์",
  support: "เรื่องที่คุยค้างไว้",
});
const PROTECTED_TOPICS = new Set([
  "payment",
  "membership",
  "entitlement",
  "points",
  "booking",
  "availability",
  "pricing",
  "model_access",
  "model_visibility",
  "coupon",
  "care_back",
  "shop",
  "order",
]);
const GENERIC_NAMES = new Set(["client", "customer", "unknown", "สมาชิก", "ลูกค้า", "ไม่ทราบชื่อ"]);

function clean(value) {
  return String(value ?? "").trim();
}

function token(value) {
  return clean(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function parseTime(value) {
  const parsed = Date.parse(clean(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function safeChannel(value) {
  const normalized = token(value);
  return ALLOWED_CHANNELS.has(normalized) ? normalized : "";
}

function safePreferredName(value) {
  const raw = clean(value).normalize("NFKC");
  if (/[\r\n\t]/u.test(raw)) return "";
  const candidate = raw.replace(/\s+/g, " ");
  if (!candidate || candidate.length > 48 || GENERIC_NAMES.has(candidate.toLowerCase())) return "";
  if (/[<>@:/\\{}\[\]|=_#]/u.test(candidate)) return "";
  if (/https?:|www\.|(?:bearer|authorization|password|secret|token|cookie)|\bsk-[a-z0-9_-]+|\beyJ[a-z0-9_-]+/iu.test(candidate)) return "";
  if (/\brec[A-Za-z0-9]{14}\b|\bU[A-Za-z0-9_-]{20,}\b/.test(candidate)) return "";
  if (/\d{6,}/.test(candidate)) return "";
  if (!/^[A-Za-zÀ-žก-๛.'’ -]+$/u.test(candidate)) return "";
  return candidate;
}

function unavailable(reason, { mode = "off", channel = "", truthRefreshRequired = false } = {}) {
  return {
    schema: KENJI_CONTINUITY_OPERATOR_DRAFT_SCHEMA,
    mode: clean(mode) || "off",
    available: false,
    text: null,
    channel: safeChannel(channel),
    send_allowed: false,
    requires_owner_review: true,
    reason,
    applies: {
      preferred_name: false,
      returning_tone: false,
      continuity_acknowledgement: false,
    },
    guardrails: {
      customer_auto_send: false,
      business_truth_claims: false,
      memory_is_context_only: true,
      protected_truth_refresh_required: Boolean(truthRefreshRequired),
    },
  };
}

function topicProjection(continuity = {}) {
  const direct = token(continuity.topic);
  if (TOPIC_LABELS[direct]) return { key: direct, label: TOPIC_LABELS[direct] };

  for (const domain of list(continuity.live_truth_domains).map(token)) {
    if (TOPIC_LABELS[domain]) return { key: domain, label: TOPIC_LABELS[domain] };
  }
  return { key: "support", label: TOPIC_LABELS.support };
}

function returningRelationship(relationship = {}) {
  if (relationship.returning_customer === true) return true;
  return RETURNING_RELATIONSHIPS.has(token(relationship.context || relationship.state));
}

/**
 * Build a deterministic, owner-review-only continuation draft.
 *
 * This module never sends a message and never interpolates Matrix summaries,
 * open loops, pending actions/references, or any canonical business state.
 */
export function buildKenjiContinuityOperatorDraft(input = {}, options = {}) {
  const mode = token(options.mode || input.mode || "off");
  const channel = safeChannel(input.channel);
  const safety = input.safety && typeof input.safety === "object" ? input.safety : {};
  const continuity = input.continuity && typeof input.continuity === "object" ? input.continuity : {};
  const truthRefreshRequired = safety.live_truth_required === true
    || safety.handoff_required === true
    || list(continuity.live_truth_domains).length > 0;

  if (mode !== KENJI_CONTINUITY_OPERATOR_DRAFT_MODE) {
    return unavailable(mode === "off" ? "phase4_mode_off" : "unsupported_phase4_mode", {
      mode,
      channel,
      truthRefreshRequired,
    });
  }
  if (!channel) return unavailable("line_channel_required", { mode, truthRefreshRequired });

  const identity = input.identity && typeof input.identity === "object" ? input.identity : {};
  if (token(identity.state) !== "known" || identity.verified !== true) {
    return unavailable("verified_canonical_identity_required", { mode, channel, truthRefreshRequired });
  }
  const confidence = token(identity.confidence);
  if (confidence !== "high" && number(identity.confidence) < 0.9) {
    return unavailable("high_confidence_identity_required", { mode, channel, truthRefreshRequired });
  }
  const preferredName = safePreferredName(identity.preferred_name);
  if (!preferredName) return unavailable("customer_safe_name_required", { mode, channel, truthRefreshRequired });

  const relationship = input.relationship && typeof input.relationship === "object" ? input.relationship : {};
  if (!returningRelationship(relationship)) {
    return unavailable("reviewed_returning_relationship_required", { mode, channel, truthRefreshRequired });
  }

  if (token(continuity.decision) !== "continuation" || number(continuity.confidence) < 0.9) {
    return unavailable("verified_open_thread_required", { mode, channel, truthRefreshRequired });
  }
  if (token(continuity.matrix_status) !== "active") {
    return unavailable("active_matrix_required", { mode, channel, truthRefreshRequired });
  }
  if (continuity.context_only !== true || continuity.live_truth_wins !== true) {
    return unavailable("continuity_authority_boundary_required", { mode, channel, truthRefreshRequired });
  }
  if (!Number.isInteger(number(continuity.matrix_version)) || number(continuity.matrix_version) < 1) {
    return unavailable("matrix_version_required", { mode, channel, truthRefreshRequired });
  }
  if (!OPEN_STAGES.has(token(continuity.conversation_stage))) {
    return unavailable("open_conversation_stage_required", { mode, channel, truthRefreshRequired });
  }
  if (safety.review_required === true) {
    return unavailable("continuity_review_required", { mode, channel, truthRefreshRequired });
  }
  if (safety.stale === true) {
    return unavailable("continuity_stale", { mode, channel, truthRefreshRequired });
  }

  const nowMs = parseTime(options.now || input.evaluated_at || new Date().toISOString());
  const updatedAt = parseTime(continuity.updated_at);
  const expiresAt = parseTime(continuity.expires_at);
  if (nowMs === null || updatedAt === null || expiresAt === null) {
    return unavailable("matrix_freshness_unavailable", { mode, channel, truthRefreshRequired });
  }
  if (updatedAt > nowMs + 60_000 || nowMs - updatedAt > MAX_MATRIX_AGE_MS || expiresAt < nowMs) {
    return unavailable("matrix_stale_or_expired", { mode, channel, truthRefreshRequired });
  }

  const topic = topicProjection(continuity);
  const protectedTruthRefreshRequired = truthRefreshRequired || PROTECTED_TOPICS.has(topic.key);
  const text = safety.handoff_required === true
    ? `คุณ${preferredName}ครับ ผมรับช่วงต่อจาก${topic.label}เดิมให้นะครับ เดี๋ยวให้เปอร์ตรวจข้อมูลล่าสุดก่อนตอบยืนยันอีกครั้งครับ`
    : protectedTruthRefreshRequired
      ? `คุณ${preferredName}ครับ ผมต่อจาก${topic.label}เดิมให้ได้เลยครับ เดี๋ยวตรวจสถานะล่าสุดจากระบบเจ้าของข้อมูลก่อนตอบยืนยันอีกครั้งนะครับ`
      : `คุณ${preferredName}ครับ ผมต่อจาก${topic.label}เดิมให้ได้เลยครับ ขอเช็กบริบทล่าสุดอีกครั้งก่อนตอบต่อนะครับ`;

  return {
    schema: KENJI_CONTINUITY_OPERATOR_DRAFT_SCHEMA,
    mode,
    available: true,
    text,
    channel,
    send_allowed: false,
    requires_owner_review: true,
    reason: "operator_review_required",
    applies: {
      preferred_name: true,
      returning_tone: true,
      continuity_acknowledgement: true,
    },
    guardrails: {
      customer_auto_send: false,
      business_truth_claims: false,
      memory_is_context_only: true,
      protected_truth_refresh_required: protectedTruthRefreshRequired,
    },
  };
}
