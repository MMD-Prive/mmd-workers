import { routeHypeNaturalLanguage } from "./hype-natural-language-router.js";

export const HYPE_CONVERSATIONAL_UNDERSTANDING_VERSION = "mmd.hype_conversational_understanding.v2";

const CONTEXT_COMMANDS = new Set([
  "status",
  "next",
  "booking",
  "payment",
  "membership",
  "points",
  "coupons",
  "careback",
  "orders",
  "mms_options",
  "handoff_status",
]);

const CONTEXT_REFERENCE_RE = /(?:เรื่องเดิม|เรื่องนั้น|อันเดิม|อันนั้น|แบบเดิม|ตัวเดิม|รายการเดิม|ของเดิม|ของเมื่อกี้|เรื่องเมื่อกี้|ที่คุยไว้|ที่ถามไว้|ที่แจ้งไว้|ที่ส่งไป|อันที่ส่งไป|เมื่อกี้|ข้อความก่อน|อันที่แล้ว)/i;
const GENERIC_PROGRESS_RE = /^(?:แล้ว\s*)?(?:เป็นไง(?:บ้าง)?|เป็นยังไง(?:บ้าง)?|ถึงไหน(?:แล้ว)?|เรียบร้อยยัง|ได้ยัง|โอเคยัง|มีอัปเดต(?:ไหม|มั้ย|หรือยัง)?|มีข่าว(?:ไหม|มั้ย)?|ตามให้หน่อย|เช็กให้หน่อย|เช็คให้หน่อย)(?:\s*(?:ครับ|ค่ะ|คะ|นะ|ฮะ|จ้า|ที|หน่อย))*[?.!]*$/i;
const ELLIPSIS_FOLLOWUP_RE = /^(?:(?:แล้ว|ส่วน|ทีนี้)\s*)?(?:ของผม|ของเรา|อันนั้น|เรื่องนั้น|อันที่ส่งไป|ที่ส่งไป)?\s*(?:ล่ะ|ละ|เมื่อไหร่|วันไหน|กี่โมง|เท่าไหร่|ยังไง|ทำยังไง|ต้องทำอะไรต่อ|ยังอยู่ไหม|ยังใช้ได้ไหม|ใช้ได้ไหม|ได้ยัง|ถึงไหน)(?:\s*(?:ครับ|ค่ะ|คะ|นะ|ฮะ|จ้า))*[?.!]*$/i;
const EXPLICIT_NEW_TOPIC_RE = /(?:^|\s)(?:เปลี่ยนเรื่อง|เรื่องใหม่|อีกเรื่อง|ถามอีกอย่าง|ถามเรื่องอื่น|new\s*topic|another\s*question|different\s*topic)(?:\s|$)/i;
const NEGATED_DOMAIN_RE = /(?:ไม่ใช่|ไม่ได้ถาม(?:เรื่อง)?|ไม่เกี่ยว(?:กับ)?|ไม่เอา)(?:\s*เรื่อง)?\s*(?:สมาชิก|เมมเบอร์|การจอง|คิว|ชำระ|จ่าย|สลิป|แต้ม|คะแนน|พอยต์|คูปอง|care\s*back|careback)/i;

const SOCIAL_INTENTS = Object.freeze([
  ["greeting", /^(?:สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey)(?:\s*(?:ครับ|ค่ะ|คะ|ฮะ|จ้า|hype))*[!.?]*$/i],
  ["thanks", /^(?:ขอบคุณ|ขอบใจ|thank\s*you|thanks|thx)(?:\s*(?:ครับ|ค่ะ|คะ|ฮะ|มาก|นะ|จ้า))*[!.?]*$/i],
  ["acknowledgement", /^(?:โอเค|เค|รับทราบ|เข้าใจแล้ว|ได้เลย|ตกลง|ok|okay|got\s*it)(?:\s*(?:ครับ|ค่ะ|คะ|ฮะ|นะ|จ้า))*[!.?]*$/i],
  ["identity", /^(?:hype\s*)?(?:คือใคร|เป็นใคร|ทำหน้าที่อะไร)|^(?:คุณ|เธอ)เป็นใคร[?.!]*$/i],
  ["wellbeing", /^(?:hype\s*)?(?:เป็นไงบ้าง|สบายดีไหม|พร้อมไหม|อยู่ไหม)[?.!]*$/i],
  ["help", /(?:คุยอะไรได้บ้าง|ถามอะไรได้บ้าง|ทำอะไรให้ได้บ้าง|ใช้งานยังไง|how\s+can\s+you\s+help)/i],
]);

const NORMALIZERS = Object.freeze([
  [/(?:สมาชิค|สมาขิก)/g, "สมาชิก", "membership_typo"],
  [/(?:เมมเบอร์|เมม)(?=\s|$|ผม|เรา|หมด|ยัง|ต่อ|ของ)/g, "สมาชิก", "membership_colloquial"],
  [/(?:ต่อเมม|ต่อสมาชิกภาพ)/g, "ต่ออายุสมาชิก", "renewal_colloquial"],
  [/(?:คุปอง|คูป๋อง|คูป็อง)/g, "คูปอง", "coupon_typo"],
  [/(?:โค้ดส่วนลด|โค๊ดส่วนลด|โค้ดลด)/g, "คูปอง", "coupon_colloquial"],
  [/(?:พ้อยท์|พ๊อยท์|พอยท์|พ้อยต์|พอยต์)/g, "แต้ม", "points_colloquial"],
  [/สลิ[๊้๋่]ป/g, "สลิป", "slip_tone"],
  [/(?:จ่ายตังค์|จ่ายตัง|จ่ายเงิน)/g, "จ่าย", "payment_colloquial"],
  [/(?:ยอด(?:ที่)?เหลือ|ยอดค้าง|เงินค้าง)/g, "ยอดคงเหลือ", "payment_balance_colloquial"],
  [/ชําระ/g, "ชำระ", "payment_unicode"],
  [/เช็ค/g, "เช็ก", "check_variant"],
  [/เท่าไร/g, "เท่าไหร่", "question_variant"],
  [/ตอนไหน/g, "เมื่อไหร่", "question_variant"],
  [/(?:รึยัง|หรือยาง)/g, "หรือยัง", "progress_variant"],
]);

const APPROXIMATE_ANCHORS = Object.freeze([
  ["สมาชิก", "membership_typo"],
  ["คูปอง", "coupon_typo"],
  ["คะแนน", "points_typo"],
  ["สลิป", "payment_typo"],
  ["การจอง", "booking_typo"],
  ["membership", "membership_typo_en"],
  ["payment", "payment_typo_en"],
  ["booking", "booking_typo_en"],
  ["coupon", "coupon_typo_en"],
]);

const COMMAND_DOMAIN = Object.freeze({
  status: "status",
  next: "next_action",
  booking: "booking",
  payment: "payment",
  membership: "membership",
  points: "points",
  coupons: "coupons",
  careback: "careback",
  orders: "shop_orders",
  mms_options: "mms",
  handoff_status: "handoff",
});

export function routeHypeConversationalUnderstandingV2(value, options = {}) {
  const original = normalize(value);
  if (!original || original.startsWith("/")) return noRoute("empty_or_command");

  const correctedClause = correctionClause(original);
  const semantic = semanticNormalize(correctedClause);
  const direct = routeHypeNaturalLanguage(semantic.text);
  const correctionApplied = correctedClause !== original;

  if (direct.ambiguous === true) {
    return {
      ...baseResult(),
      ambiguous: true,
      confidence: 0,
      reason: "multiple_supported_domains",
      candidates: direct.candidates || [],
      normalizations: semantic.normalizations,
      correction_applied: correctionApplied,
    };
  }

  if (direct.routed === true && direct.command) {
    if (!correctionApplied && NEGATED_DOMAIN_RE.test(original)) {
      return {
        ...baseResult(),
        reason: "negated_domain_without_replacement",
        clarification_required: true,
        candidates: direct.candidates || [],
        normalizations: semantic.normalizations,
      };
    }
    return {
      ...baseResult(),
      command: direct.command,
      domain: direct.domain,
      routed: true,
      confidence: semantic.normalizations.length || correctionApplied
        ? Math.min(0.96, Math.max(0.88, Number(direct.confidence) || 0))
        : direct.confidence,
      reason: semantic.normalizations.length || correctionApplied
        ? "semantic_normalized_domain_match"
        : "deterministic_domain_match",
      candidates: direct.candidates || [],
      normalizations: semantic.normalizations,
      correction_applied: correctionApplied,
      requires_live_truth_refresh: true,
    };
  }

  const socialIntent = classifySocialIntent(original);
  const explicitNewTopic = EXPLICIT_NEW_TOPIC_RE.test(original);
  const contextRequired = !explicitNewTopic && isContextReference(original);
  if (contextRequired) {
    const context = normalizeContext(options.context);
    if (!context.provided) {
      return {
        ...baseResult(),
        reason: "context_lookup_required",
        context_required: true,
        social_intent: "",
        normalizations: semantic.normalizations,
      };
    }
    if (!context.available || !CONTEXT_COMMANDS.has(context.command)) {
      return {
        ...baseResult(),
        reason: context.stale ? "continuity_context_stale" : "continuity_context_unavailable",
        context_required: true,
        clarification_required: true,
        normalizations: semantic.normalizations,
      };
    }

    return {
      ...baseResult(),
      command: context.command,
      domain: COMMAND_DOMAIN[context.command] || context.command,
      routed: true,
      confidence: context.open_thread ? 0.94 : 0.87,
      reason: context.open_thread
        ? "bounded_open_thread_reference"
        : "bounded_recent_topic_reference",
      context_required: true,
      context_applied: true,
      context_version: context.version,
      requires_live_truth_refresh: true,
      normalizations: semantic.normalizations,
    };
  }

  if (socialIntent) {
    return {
      ...baseResult(),
      reason: "bounded_safe_conversation",
      social_intent: socialIntent,
      confidence: 0.99,
      normalizations: semantic.normalizations,
    };
  }

  return {
    ...baseResult(),
    reason: explicitNewTopic ? "explicit_new_topic_without_supported_domain" : direct.reason || "no_supported_domain",
    normalizations: semantic.normalizations,
  };
}

export function isHypeContextReference(value) {
  return isContextReference(normalize(value));
}

export function classifyHypeSafeConversation(value) {
  return classifySocialIntent(normalize(value));
}

function semanticNormalize(value) {
  let text = value;
  const normalizations = [];
  for (const [pattern, replacement, label] of NORMALIZERS) {
    pattern.lastIndex = 0;
    if (!pattern.test(text)) continue;
    pattern.lastIndex = 0;
    text = text.replace(pattern, replacement);
    normalizations.push(label);
  }

  for (const [anchor, label] of APPROXIMATE_ANCHORS) {
    if (text.includes(anchor)) continue;
    const match = approximateSubstring(text, anchor);
    if (!match) continue;
    text = `${match.before}${anchor}${match.after}`;
    normalizations.push(label);
  }

  return {
    text: text.replace(/\s+/g, " ").trim(),
    normalizations: [...new Set(normalizations)],
  };
}

function approximateSubstring(value, anchor) {
  const source = Array.from(value);
  const target = Array.from(anchor);
  if (target.length < 5 || source.length > 600) return null;

  let best = null;
  for (const size of [target.length - 1, target.length, target.length + 1]) {
    if (size < 4 || size > source.length) continue;
    for (let start = 0; start <= source.length - size; start += 1) {
      const slice = source.slice(start, start + size);
      const distance = editDistance(slice, target, 1);
      if (distance > 1) continue;
      if (!best || distance < best.distance) best = { start, size, distance };
      if (distance === 0) break;
    }
  }
  if (!best) return null;
  return {
    before: source.slice(0, best.start).join(""),
    after: source.slice(best.start + best.size).join(""),
  };
}

function editDistance(left, right, ceiling = Infinity) {
  if (Math.abs(left.length - right.length) > ceiling) return ceiling + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const next = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
      current.push(next);
      rowMin = Math.min(rowMin, next);
    }
    if (rowMin > ceiling) return ceiling + 1;
    previous = current;
  }
  return previous[right.length];
}

function correctionClause(value) {
  const match = /(?:ไม่ใช่|ขอแก้|เอาใหม่)[\s\S]{0,120}?(?:หมายถึง|แต่(?:หมายถึง)?|คือ|เอาเป็น)\s*(.+)$/i.exec(value);
  const corrected = normalize(match?.[1] || "");
  return corrected.length >= 2 ? corrected : value;
}

function classifySocialIntent(value) {
  for (const [intent, pattern] of SOCIAL_INTENTS) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) return intent;
  }
  return "";
}

function isContextReference(value) {
  return CONTEXT_REFERENCE_RE.test(value) || GENERIC_PROGRESS_RE.test(value) || ELLIPSIS_FOLLOWUP_RE.test(value);
}

function normalizeContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { provided: false, available: false, stale: false, command: "", open_thread: false, version: 0 };
  }
  const command = String(value.command || "").trim().toLowerCase();
  return {
    provided: true,
    available: value.available === true,
    stale: value.stale === true || value.state === "stale",
    command,
    open_thread: value.open_thread === true,
    version: Number.isInteger(Number(value.matrix_version)) ? Number(value.matrix_version) : 0,
  };
}

function baseResult() {
  return {
    schema: HYPE_CONVERSATIONAL_UNDERSTANDING_VERSION,
    command: "",
    domain: "",
    routed: false,
    ambiguous: false,
    confidence: 0,
    reason: "",
    candidates: [],
    context_required: false,
    context_applied: false,
    clarification_required: false,
    social_intent: "",
    requires_live_truth_refresh: false,
    normalizations: [],
    correction_applied: false,
  };
}

function noRoute(reason) {
  return { ...baseResult(), reason };
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 600);
}
