// Navigation only. Prices, personal offers and membership activation remain
// with the canonical membership/payment pages after identity verification.
export const PRIVATE_MEMBERSHIP_LINKS = Object.freeze({
  signup: "https://miniapp.line.me/2010862595-yT4DCEMc/?intent=signup&view=signup&world=private",
  renew: "https://miniapp.line.me/2010862595-yT4DCEMc/?intent=renew&view=package&world=private",
  status: "https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview",
});

const NAVIGATION_INTENTS = new Set([
  "membership_signup", "private_membership_signup", "private_membership_options",
  "membership_interest", "membership_menu", "membership_renewal",
]);
const CLOSED = new Set(["blocked", "suspended", "revoked", "ambiguous", "unresolved", "needs_review", "pending"]);
const PRIVATE_LEVELS = new Set(["private_standard", "private_premium"]);
const normalize = value => String(value || "").normalize("NFKC").toLowerCase().trim();

function excluded(text) {
  return /(?:public|elite|red\s*card|mmd\s*member\b|black\s*card|\b[sv]*vip\b|massage|นวด|นายแบบ|นางแบบ|สมัครงาน|supplier|himai|สลิป|ชำระ|โอน|จ่าย|payment|paid|refund|คืนเงิน|จอง|คิว|แต้ม|คะแนน|points?|care\s*back|แคร์|คูปอง|coupon|wish|อวยพร|โบนัส|แถม|โปรโมชั่น|โปรโมชัน|สถานะ|สิทธิ์ของ|ยืนยัน|อนุมัติ|ข้อมูลคนอื่น|เฉพาะ|พิเศษ|custom|ต่อรอง|ลดราคา)/i.test(text) ||
    /(?:ต่ออายุ|สมัคร).{0,12}(?:แล้ว|สำเร็จ|เรียบร้อย|ผ่านหรือยัง|ใช้ได้หรือยัง)/.test(text);
}

export function inferPrivateMembershipNavigation(text = "", previousIntent = "") {
  const value = normalize(text);
  if (!value || excluded(value)) return "";
  const short = value.replace(/\s+/g, "").replace(/(?:ครับ|ค่ะ|คะ|นะ|หน่อย|[.!?])+$/g, "");
  if (NAVIGATION_INTENTS.has(previousIntent)) {
    if (["ใหม่", "ยังไม่เคย", "ไม่เคย", "ไม่เคยเป็นสมาชิก", "ยังไม่เคยเป็นสมาชิก"].includes(short)) return "private_membership_signup";
    if (["เคย", "เคยเป็นสมาชิก", "สมาชิกเดิม", "สมาชิกเก่า"].includes(short)) return "membership_renewal";
  }
  if (/^(?:package|แพ็กเกจ|แพคเกจ)(?:สมาชิก|private)?$/.test(short) ||
      /^(?:ดู|ขอดู)?(?:แพ็กเกจ|แพคเกจ)สมาชิก$/.test(short) ||
      /^(?:สมาชิกมีอะไรบ้าง|มีแพ็กเกจอะไรบ้าง|มีแพคเกจอะไรบ้าง)$/.test(short)) return "private_membership_options";
  if (/(?:standard|premium|สแตนดาร์ด|พรีเมียม|พรีเมี่ยม).{0,28}(?:ต่างกัน|ต่างจาก|เทียบ|เปรียบเทียบ|ข้อแตกต่าง|difference|compare)|(?:ต่างกัน|ต่างจาก|เทียบ|เปรียบเทียบ|ข้อแตกต่าง|difference|compare).{0,28}(?:standard|premium|สแตนดาร์ด|พรีเมียม|พรีเมี่ยม)/i.test(value)) return "private_membership_options";
  // Custom quotes retain the existing Per review/handoff path.
  if (!/(?:เฉพาะ|พิเศษ|custom|ต่อรอง|ลดราคา)/i.test(value) &&
      /(?:ราคา|price|เท่าไร|เท่าไหร่|กี่บาท).{0,18}(?:สมาชิก|membership|standard|premium|แพ็กเกจ|แพคเกจ)|(?:สมาชิก|membership|standard|premium|แพ็กเกจ|แพคเกจ).{0,18}(?:ราคา|price|เท่าไร|เท่าไหร่|กี่บาท)/i.test(value)) return "private_membership_options";
  if (["regis", "register", "สมัคร", "อยากสมัคร", "ขอสมัคร"].includes(short)) return "membership_signup";
  if (/^(?:เลือก|เอา|สนใจ|ขอ)?(?:standard|premium|guestpass|สแตนดาร์ด|พรีเมียม|พรีเมี่ยม)$/.test(short)) return "private_membership_signup";
  if (/^(?:อยาก|ต้องการ|ขอ|ช่วย)?(?:ต่ออายุ(?:สมาชิก)?|renew)(?:ล่วงหน้า|ก่อนหมดอายุ|ยังไง|อย่างไร|ได้ไหม)?$/.test(short) ||
      /(?:ต่ออายุ|renew)/i.test(value) && /(?:สมาชิก|membership|standard|premium|private)/i.test(value)) return "membership_renewal";
  return "";
}

export function resolvePrivateMembershipFollowup(text, intent, continuity = {}) {
  if ((!NAVIGATION_INTENTS.has(intent) && !["note_only", "model_lookup", "membership", "membership_experience", "context_clarification"].includes(intent)) ||
      continuity.available !== true || continuity.handoff_required === true ||
      continuity.matrix?.human_takeover === true || continuity.matrix?.handoff_required === true ||
      ["stale_refresh", "human_takeover", "handoff_per", "handoff_required", "paused", "awaiting_human"].includes(continuity.decision) ||
      ["stale", "resolved"].includes(continuity.matrix?.matrix_status)) return intent;
  const expires = Date.parse(continuity.matrix?.state_expires_at);
  if (!Number.isFinite(expires) || expires <= Date.now()) return intent;
  return inferPrivateMembershipNavigation(text, continuity.matrix?.last_customer_intent) || intent;
}

export function privateMembershipNavigationReply({ intent = "", text = "", memberContext = null } = {}) {
  if (!NAVIGATION_INTENTS.has(intent) || excluded(normalize(text))) return "";
  // Special memberships keep their existing eligibility/review policy.
  if (["vip", "svip", "black_card"].includes(memberContext?.canonical_membership_level)) return "";
  if (memberContext && (memberContext.identity_state !== "matched" || CLOSED.has(memberContext.membership_state))) {
    return `ขอตรวจบัญชีก่อนดำเนินการสมาชิกครับ\nเปิด MY MMD เพื่อยืนยันบัญชี → ${PRIVATE_MEMBERSHIP_LINKS.status}`;
  }
  const existingPrivate = memberContext?.identity_state === "matched" &&
    PRIVATE_LEVELS.has(memberContext.canonical_membership_level);
  const signupLink = existingPrivate ? PRIVATE_MEMBERSHIP_LINKS.renew : PRIVATE_MEMBERSHIP_LINKS.signup;
  if (intent === "membership_renewal" || existingPrivate && ["membership_signup", "private_membership_signup", "membership_interest"].includes(intent)) {
    return `ใช้ LINE บัญชีเดิมตรวจราคา ระยะเวลา และวันหมดอายุก่อนชำระครับ\nดูข้อเสนอต่ออายุ → ${PRIVATE_MEMBERSHIP_LINKS.renew}`;
  }
  if (intent === "private_membership_options") {
    return `Standard 1 ปี / Premium 2 ปีครับ ดูสิทธิ์และราคาล่าสุดก่อนเลือกได้เลย\n${existingPrivate ? "ดูตัวเลือกจากบัญชีเดิม" : "เลือก Private Membership"} → ${signupLink}`;
  }
  if (intent === "membership_interest") {
    return "ได้ครับ 🖤 เคยเป็นสมาชิก MMD มาก่อนหรือยังครับ?\nพิมพ์ “ใหม่” หรือ “เคยเป็นสมาชิก” ได้เลยครับ";
  }
  if (intent === "membership_menu") {
    return `เลือกเริ่มได้เลยครับ\nสมัคร Private → ${PRIVATE_MEMBERSHIP_LINKS.signup}\nต่ออายุบัญชีเดิม → ${PRIVATE_MEMBERSHIP_LINKS.renew}`;
  }
  return `เลือกแพ็กเกจ Private แล้วเชื่อม LINE เพื่อตรวจรายการก่อนชำระครับ\nสมัคร Private → ${signupLink}`;
}
