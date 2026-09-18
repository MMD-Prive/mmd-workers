// Customer-facing copy is published separately through the canonical knowledge workflow.
// This module never grants membership, coupons, credits, points or payment approval.
export const SALES_REPLY_VERSION = "2026-09-14.2";
export const SALES_REPLY_REVIEW_AT = Date.parse("2026-10-01T00:00:00+07:00");
export const SALES_CARD_PREFIX = "kenji_sep2026_membership_sales_";
export const SALES_CARD_IDS = Object.freeze({
  promotion_overview: `${SALES_CARD_PREFIX}01_overview`,
  double_moment: `${SALES_CARD_PREFIX}02_double_moment`,
  care_back: `${SALES_CARD_PREFIX}03_care_back`,
  signup: `${SALES_CARD_PREFIX}04_new_customer`,
  current: `${SALES_CARD_PREFIX}05_current_customer`,
  renewal: `${SALES_CARD_PREFIX}06_expired_customer`,
  payment: `${SALES_CARD_PREFIX}07_payment_pending`,
  coupon: `${SALES_CARD_PREFIX}08_wish_coupon`,
});
export const SALES_ROUTES = Object.freeze({
  status: "https://mmdbkk.com/my-mmd/",
  signup: "https://mmdbkk.com/sigil/member/membership?source=line&intent=signup",
  renewal: "https://mmdbkk.com/sigil/member/membership?source=line&intent=renew",
  membership: "https://mmdbkk.com/sigil/member/membership",
  payment: "https://mmdbkk.com/member/payments",
});
const PROTECTED = new Set([
  "privacy_request", "internal_access", "human_handoff", "manual_review",
  "complaint_escalation", "payment_dispute", "availability_request",
  "model_access_verification", "model_lookup", "per_continuity",
]);
const clean = (v) => String(v ?? "").trim();
const CARE = /care[\s_-]*back|แคร์\s*แบ[็๊]?ก|แคร์\s*แบค/i;
const DOUBLE = /double[\s_-]*moment|ดับเบิล\s*โมเมนต์/i;

export function refineKenjiSalesIntent(raw = "", prior = "") {
  const text = clean(raw).normalize("NFKC");
  const intent = clean(prior);
  if (PROTECTED.has(intent) || !text) return intent;
  const care = CARE.test(text);
  const double = DOUBLE.test(text);
  const proof = /ส่งสลิป|สลิป|โอนแล้ว|ชำระแล้ว|จ่ายแล้ว|จ่ายเงินแล้ว|payment\s*proof|already\s*paid/i.test(text);
  if ((care || double) && proof) return "care_back_payment_points";
  if (double) return "double_moment";
  if (care) {
    if (/คูปอง|coupon|wish|อวยพร/i.test(text)) return "care_back_coupon_wish";
    if (/(?:ของผม|ของฉัน|ของหนู|my\s+(?:status|benefit)|(?:ผม|ฉัน|หนู).{0,24}(?:ได้ไหม|ได้อะไร|สิทธิ์|กี่วัน|กี่แต้ม|เข้าเกณฑ์))/i.test(text)) return "care_back_personal_status";
    if (/black\s*card|บัตรดำ|svip|\bvip\b/i.test(text)) return "care_back_black_card";
    if (/แต้ม|คะแนน|points?/i.test(text)) return "care_back_historical_points";
    if (/ราคา|กี่บาท|เท่าไหร่|เท่าไร|price|cost/i.test(text)) return "care_back_membership_price";
    // A negative expiry phrase is not evidence of expiry. This is intent only.
    if (/ยังไม่หมด|ยังใช้งาน|not\s*expired/i.test(text) && !/ต่ออายุ|renew/i.test(text)) return "care_back_current_member";
    if (/ต่ออายุ|หมดอายุ|ขาดอายุ|expired|renew/i.test(text)) return "care_back_expired_member";
    if (/สมาชิกปัจจุบัน|สมาชิกเดิม|active|grace/i.test(text)) return "care_back_current_member";
    if (/สมัคร|สมาชิกใหม่|standard|premium|พรีเมียม|สแตนดาร์ด|new\s*member/i.test(text)) return "care_back_new_member";
    return "care_back_overview";
  }
  if (/โปร(?:โมชัน|โมชั่น)?(?:อะไร|เดือนนี้|กันยายน)|เดือนนี้.{0,16}โปร|promotion.{0,20}(?:month|september)/i.test(text)) return "promotion_overview";
  // Do not reclassify a receipt or protected payment discussion as acquisition.
  if (proof || ["payment_status", "payment_dispute"].includes(intent)) return intent;
  if (/ต่ออายุ|renewal|\brenew\b/i.test(text)) return "membership_renewal";
  if (/สมัครสมาชิก|สมัคร\s*(?:private|public|standard|premium)/i.test(text)) return "membership_signup";
  return intent;
}

export function salesCardKey(intent = "") {
  const value = clean(intent);
  if (value === "promotion_overview") return "promotion_overview";
  if (value === "double_moment") return "double_moment";
  if (value === "membership_signup") return "signup";
  if (["membership", "membership_renewal"].includes(value)) return "renewal";
  if (value === "care_back_coupon_wish") return "coupon";
  if (value === "care_back_payment_points") return "payment";
  if (value === "care_back_expired_member") return "renewal";
  if (value === "care_back_current_member") return "current";
  if (/^care_back_new_/.test(value)) return "signup";
  if (value.startsWith("care_back_")) return "care_back";
  return "";
}

export function publishedSalesCard(card, expectedId, now = Date.now()) {
  if (!card || !Number.isFinite(now) || now >= SALES_REPLY_REVIEW_AT) return false;
  if (card.knowledge_id !== expectedId || card.status !== "active" || card.response_mode !== "auto_reply_allowed" || card.workflow_stage !== "published") return false;
  if (!Array.isArray(card.allowed_channels) || !card.allowed_channels.includes("LINE_OFC")) return false;
  if (!Array.isArray(card.allowed_audience) || !card.allowed_audience.includes("Guest")) return false;
  const answer = clean(card.customer_answer);
  if (!answer || answer.length > 1400 || /\{\{|\}\}|bearer|authorization|secret|record[_\s-]?id|api[_\s-]?key/i.test(answer)) return false;
  const links = answer.match(/https?:\/\/[^\s<>]+/g) || [];
  if (links.length !== 1 || !Object.values(SALES_ROUTES).includes(links[0])) return false;
  let payload;
  try { payload = typeof card.payload_json === "string" ? JSON.parse(card.payload_json) : card.payload_json; } catch { return false; }
  if (!payload || payload.internal_only || payload.superseded || payload.superseded_by || payload.seed_pack?.version !== SALES_REPLY_VERSION) return false;
  const from = Date.parse(`${clean(card.effective_from).slice(0, 10)}T00:00:00+07:00`);
  // Even undated navigation cards belong to this versioned September snapshot.
  // A supplied invalid date fails closed; the review cutoff is not benefit expiry.
  const until = payload.effective_to !== undefined
    ? Date.parse(payload.effective_to)
    : payload.campaign_content_review_after !== undefined
      ? Date.parse(payload.campaign_content_review_after) - 1
      : SALES_REPLY_REVIEW_AT - 1;
  return Number.isFinite(from) && Number.isFinite(until) && from <= now && now <= until;
}
