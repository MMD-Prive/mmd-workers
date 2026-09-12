/** Verified Member Concierge + Safe Reply Generator v1. Read-only and fail-closed. */
const CLOSED = new Set(["blocked","suspended","revoked","ambiguous","unresolved","needs_review"]);
const LEVELS = new Set(["guest","public","private"]);
const INTENTS = new Set(["support","membership","renewal","payment_proof","booking","talk_to_per","kenji_ai","about_mmd"]);
const clean = (v) => String(v ?? "").trim();
export function canonicalRichMenuIntent(input = {}) {
  const raw = clean(input.intent || input.postback_intent || input.data).toLowerCase();
  const map = { "support":"support","mmd_support":"support","membership":"membership","join":"membership","renew":"renewal","payment":"payment_proof","payment_proof":"payment_proof","book":"booking","booking":"booking","talk_to_per":"talk_to_per","per":"talk_to_per","kenji_ai":"kenji_ai","about":"about_mmd" };
  return map[raw] || (INTENTS.has(raw) ? raw : "support");
}
export function resolveReplyPolicy(input = {}) {
  const level = clean(input.level || input.membership_level).toLowerCase() || "guest";
  const identity = clean(input.identity_state).toLowerCase() || "unresolved";
  const membership = clean(input.membership_state).toLowerCase() || "unresolved";
  const blocked = CLOSED.has(identity) || CLOSED.has(membership) || !LEVELS.has(level);
  return { level: LEVELS.has(level) ? level : "guest", blocked, allow_private: !blocked && level === "private", allow_member_data: !blocked && level !== "guest" };
}
export function generateSafeReply(input = {}) {
  const intent = canonicalRichMenuIntent(input);
  const policy = resolveReplyPolicy(input);
  const name = policy.allow_private ? clean(input.display_name) : "";
  if (policy.blocked) return { text: "ขออนุญาตตรวจสอบบัญชีสมาชิกผ่านช่องทางทางการก่อนนะครับ เพื่อความถูกต้องและความเป็นส่วนตัว", silent: false, intent, level: policy.level, next_action: "verify_identity", source: "verified_member_concierge_v1" };
  if (intent === "talk_to_per") return { text: "ได้ครับ ผมจะส่งเรื่องให้ Per พิจารณาต่อในช่องทางทางการครับ", silent: false, intent, level: policy.level, next_action: "human_handoff", source: "verified_member_concierge_v1" };
  if (intent === "payment_proof") return { text: "ส่งหลักฐานการชำระเงินมาได้เลยครับ ระบบจะตรวจสอบยอดและจับคู่รายการอย่างเป็นทางการก่อนยืนยันครับ", silent: false, intent, level: policy.level, next_action: "verify_payment", source: "verified_member_concierge_v1" };
  if (intent === "renewal") return { text: "ได้ครับ ผมจะพาไปตรวจสถานะและขั้นตอนต่ออายุสมาชิกที่ตรงกับบัญชีนี้ครับ", silent: false, intent, level: policy.level, next_action: "renew_membership", source: "verified_member_concierge_v1" };
  if (intent === "booking") return { text: policy.allow_member_data ? `ได้ครับ${name ? ` คุณ${name}` : ""} ส่งบริการ วันที่ เวลา และโซนมาได้เลยครับ ผมจะจัดบรีฟเพื่อตรวจความพร้อมก่อนยืนยันครับ` : "ได้ครับ ส่งบริการ วันที่ เวลา และโซนมาได้เลยครับ ผมจะช่วยแนะนำขั้นตอนเริ่มต้นให้ครับ", silent: false, intent, level: policy.level, next_action: "collect_booking_brief", source: "verified_member_concierge_v1" };
  if (intent === "kenji_ai" && policy.level === "guest") return { text: "MMD พร้อมช่วยแนะนำขั้นตอนเริ่มต้นครับ หากต้องการดูสิทธิ์สมาชิก ให้เริ่มจากการสมัครสมาชิกก่อนครับ", silent: false, intent, level: policy.level, next_action: "membership_signup", source: "verified_member_concierge_v1" };
  const text = policy.level === "private" ? "สวัสดีครับ Kenji ดูแลเรื่องสมาชิกและการประสานงานส่วนตัวให้ได้ครับ" : policy.level === "public" ? "สวัสดีครับ MMD ช่วยดูเรื่องสมาชิก การต่ออายุ การชำระเงิน และการจองให้ได้ครับ" : "สวัสดีครับ MMD ยินดีช่วยแนะนำขั้นตอนเริ่มต้นให้ครับ";
  return { text, silent: false, intent, level: policy.level, next_action: policy.level === "guest" ? "membership_signup" : "continue", source: "verified_member_concierge_v1" };
}
export { CLOSED, LEVELS, INTENTS };
