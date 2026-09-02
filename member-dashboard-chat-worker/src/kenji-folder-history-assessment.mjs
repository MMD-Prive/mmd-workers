/**
 * Kenji Folder Mention -> Customer History Assessment
 *
 * Pure, side-effect-free policy helpers. This module intentionally does not:
 * - fetch Airtable or raw chat history;
 * - decide membership, payment, availability, or access;
 * - expose model-private/admin data;
 * - call an LLM.
 *
 * The worker adapter must authenticate the customer, scope history to the same
 * customer/channel, redact it, and persist only the returned assessment.
 */

export const KENJI_FOLDER_HISTORY_POLICY_VERSION = "kenji-folder-history-assessment-v1";
export const KENJI_FOLDER_HISTORY_LIMIT = 50;
export const KENJI_FOLDER_MESSAGE_LIMIT = 600;

const ROLE_ALLOWLIST = new Set(["customer", "assistant", "agent", "system"]);

const PATTERNS = {
  booking: /(?:book|booking|reserve|จอง|นัด|รับงาน|ใช้บริการ)/i,
  price: /(?:price|rate|ราคา|เท่าไร|ค่าตัว|งบ|budget)/i,
  availability: /(?:available|ว่าง|คืนนี้|วันนี้|พรุ่งนี้|เวลาไหน|กี่โมง)/i,
  complaint: /(?:complaint|ร้องเรียน|ไม่โอเค|แย่|โกง|หลอก)/i,
  payment: /(?:paid|payment|โอนแล้ว|จ่ายแล้ว|สลิป|มัดจำ)/i,
  privacy: /(?:phone|เบอร์|ไลน์|line id|telegram|ที่อยู่|ข้อมูลส่วนตัว|ขอข้อมูลลูกค้า)/i,
  coercion: /(?:force|บังคับ|ขู่|blackmail|ข่มขู่|ไม่ยินยอม)/i,
  minor: /(?:minor|เด็ก|อายุต่ำกว่า|under\s*18|(?:^|\D)1[0-7](?:\D|$))/i,
  preference: /(?:ชอบ|ต้องการ|อยากได้|สนใจ|prefer|looking for|อยากเจอ)/i,
};

function asString(value) {
  return typeof value === "string" ? value : "";
}

function normalizeSpaces(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeFolderMention(value) {
  return normalizeSpaces(
    asString(value)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/^#+/, "")
      .replace(/[_-]+/g, " "),
  );
}

export function resolveFolderMention(rawMention, catalog = []) {
  const normalized = normalizeFolderMention(rawMention);
  if (!normalized) return { status: "missing", normalized: "", matches: [] };

  const matches = catalog
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const candidates = [
        entry.folder_name,
        entry.folder,
        entry.model_key,
        entry.display_name,
        ...(Array.isArray(entry.aliases) ? entry.aliases : []),
      ].map(normalizeFolderMention).filter(Boolean);
      return { entry, candidates };
    })
    .filter(({ candidates }) => candidates.includes(normalized))
    .map(({ entry }) => ({
      model_key: asString(entry.model_key || entry.id || entry.folder_name),
      display_name: asString(entry.display_name || entry.folder_name || entry.model_key),
      folder_name: asString(entry.folder_name || entry.folder || entry.model_key),
      visibility: asString(entry.visibility || "unknown"),
    }));

  if (matches.length === 0) return { status: "not_found", normalized, matches: [] };
  if (matches.length > 1) return { status: "ambiguous", normalized, matches };
  return { status: "matched", normalized, match: matches[0], matches };
}

function redactPii(text) {
  return normalizeSpaces(
    asString(text)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
      .replace(/(?:line\s*id|telegram\s*id|user\s*id)\s*[:=]?\s*[A-Z0-9_@-]{5,}/gi, "[redacted-id]")
      .replace(/(?:https?:\/\/|www\.)\S+/gi, "[redacted-link]")
      .replace(/(?:\+?66|0)\d[\d -]{7,14}\d/g, "[redacted-phone]")
      .replace(/(?:slip|สลิป|บัญชี|เลขบัญชี|payment[_ -]?ref)[^.!?]{0,80}/gi, "[redacted-payment]")
      .replace(/(?:ที่อยู่|address|พิกัด|location)[^.!?]{0,80}/gi, "[redacted-location]"),
  ).slice(0, KENJI_FOLDER_MESSAGE_LIMIT);
}

export function redactHistoryMessage(message = {}) {
  const role = ROLE_ALLOWLIST.has(asString(message.role).toLowerCase())
    ? asString(message.role).toLowerCase()
    : "customer";
  return {
    role,
    text: redactPii(message.text),
    occurred_at: asString(message.occurred_at || message.timestamp || ""),
    source_ref_hash: /^[a-f0-9]{64}$/i.test(asString(message.source_ref_hash))
      ? asString(message.source_ref_hash).toLowerCase()
      : "",
  };
}

export function buildAssessmentInput({
  folderMention = "",
  folderResolution = {},
  history = [],
  customerContext = {},
} = {}) {
  const status = asString(folderResolution.status);
  const match = folderResolution.match && typeof folderResolution.match === "object"
    ? folderResolution.match
    : null;
  const boundedHistory = Array.isArray(history)
    ? history.slice(-KENJI_FOLDER_HISTORY_LIMIT).map(redactHistoryMessage).filter((item) => item.text)
    : [];

  return {
    policy_version: KENJI_FOLDER_HISTORY_POLICY_VERSION,
    folder_mention: normalizeFolderMention(folderMention),
    folder_status: status || "not_resolved",
    model_key: match ? asString(match.model_key) : "",
    model_display_name: match ? asString(match.display_name) : "",
    history_window: asString(customerContext.history_window || "same_customer_same_channel"),
    history_message_count: boundedHistory.length,
    history: boundedHistory,
  };
}

function collectCustomerText(history) {
  return history
    .filter((item) => item.role === "customer")
    .map((item) => item.text)
    .join(" ")
    .slice(0, KENJI_FOLDER_HISTORY_LIMIT * KENJI_FOLDER_MESSAGE_LIMIT);
}

function has(pattern, text) {
  return pattern.test(text);
}

function classifyReadiness({ folderStatus, text, signals }) {
  if (folderStatus !== "matched") return "needs_clarification";
  if (signals.includes("safety_concern") || signals.includes("complaint")) return "human_review";
  if (signals.includes("booking_intent") && (has(PATTERNS.availability, text) || has(PATTERNS.price, text))) return "actionable_request";
  if (signals.length > 0) return "interested_needs_clarification";
  return "no_clear_intent";
}

export function evaluateCustomerHistory(input = {}) {
  const folderStatus = asString(input.folder_status || "not_resolved");
  const text = collectCustomerText(Array.isArray(input.history) ? input.history : []);
  const signals = [];
  if (has(PATTERNS.booking, text)) signals.push("booking_intent");
  if (has(PATTERNS.price, text)) signals.push("price_intent");
  if (has(PATTERNS.availability, text)) signals.push("availability_intent");
  if (has(PATTERNS.preference, text)) signals.push("explicit_preference");
  if (has(PATTERNS.complaint, text)) signals.push("complaint");
  if (has(PATTERNS.payment, text)) signals.push("payment_claim");
  if (has(PATTERNS.privacy, text)) signals.push("privacy_boundary");
  if (has(PATTERNS.coercion, text) || has(PATTERNS.minor, text)) signals.push("safety_concern");

  const readiness = classifyReadiness({ folderStatus, text, signals });
  let decision = "safe_general_reply";
  let nextAction = "reply_with_general_next_step";
  if (folderStatus === "missing" || folderStatus === "not_found" || folderStatus === "ambiguous") {
    decision = "clarify_model";
    nextAction = "ask_for_exact_folder_name";
  } else if (signals.includes("safety_concern") || signals.includes("complaint")) {
    decision = "internal_review";
    nextAction = "escalate_to_human";
  } else if (signals.includes("privacy_boundary")) {
    decision = "safe_general_reply";
    nextAction = "decline_private_data_and_continue_safely";
  } else if (readiness === "actionable_request") {
    decision = "backend_check_required";
    nextAction = "request_verified_availability_and_price";
  }

  const confidence = folderStatus === "matched" && signals.length >= 2
    ? "high"
    : folderStatus === "matched" && signals.length === 1
      ? "medium"
      : "low";

  return {
    policy_version: KENJI_FOLDER_HISTORY_POLICY_VERSION,
    model_key: asString(input.model_key),
    folder_status: folderStatus,
    signals,
    readiness,
    decision,
    next_action: nextAction,
    confidence,
    history_message_count: Number(input.history_message_count) || 0,
    customer_reply_safe: decision !== "internal_review",
  };
}

export function buildCustomerSafeReply(assessment = {}) {
  if (assessment.decision === "clarify_model") {
    return "ขอชื่อ Folder ของนายแบบให้ตรงอีกนิดครับ แล้วผมจะช่วยดูขั้นตอนต่อให้";
  }
  if (assessment.decision === "internal_review") {
    return "เรื่องนี้ผมขอส่งให้ทีมดูแลตรวจสอบต่อครับ";
  }
  if (assessment.decision === "backend_check_required") {
    return "ผมรับคำขอไว้แล้วครับ เดี๋ยวขอตรวจสอบรายละเอียดที่ยืนยันได้ก่อน แล้วจะแจ้งขั้นตอนถัดไปให้ครับ";
  }
  if (assessment.decision === "safe_general_reply") {
    return "ผมช่วยสรุปข้อมูลทั่วไปและขั้นตอนถัดไปให้ได้ครับ";
  }
  return "ผมขอรายละเอียดเพิ่มอีกนิด เพื่อช่วยให้ตรงเรื่องครับ";
}
