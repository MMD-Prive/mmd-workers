// Owner-approved advertising copy (31 Oct 2026). No personal eligibility or benefit write.
export const CARE_BACK_OCTOBER_VERSION = '2026-10-31.1';
export const CARE_BACK_OCTOBER_START = Date.parse('2026-10-31T00:00:00+07:00');
export const CARE_BACK_OCTOBER_END = Date.parse('2026-11-01T00:00:00+07:00');
const signup = 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=signup&view=signup&world=private';
const renewal = 'https://www.mmdbkk.com/member/renewal';
const status = 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview';
const intents = new Set(['promotion_overview', 'care_back_overview', 'care_back_dates',
  'care_back_new_member', 'care_back_new_standard', 'care_back_new_premium',
  'care_back_current_member', 'care_back_expired_member', 'care_back_membership_price']);

export function careBackOctoberFollowup(text, continuity = {}, now = Date.now()) {
  const matrix = continuity.matrix || {};
  if (continuity.available !== true || continuity.handoff_required || matrix.human_takeover || matrix.handoff_required ||
      !['continuation', 'continue', 'new_topic'].includes(continuity.decision) ||
      matrix.matrix_status !== 'active' || !intents.has(matrix.last_customer_intent) ||
      !(Date.parse(matrix.state_expires_at) > now)) return '';
  const short = String(text).trim().replace(/(?:ครับ|ค่ะ|คะ|นะ|หน่อย|[.!?])+$/g, '').trim();
  return ({ ใหม่: 'care_back_new_member', สมาชิกใหม่: 'care_back_new_member',
    ปัจจุบัน: 'care_back_current_member', สมาชิกปัจจุบัน: 'care_back_current_member',
    หมดอายุ: 'care_back_expired_member', สมาชิกหมดอายุ: 'care_back_expired_member' })[short] || '';
}

export function careBackOctoberReply(intent, text = '', now = Date.now()) {
  const supported = new Set(['promotion_overview', 'care_back_overview', 'care_back_dates', 'care_back_new_member', 'care_back_new_standard', 'care_back_new_premium', 'care_back_current_member', 'care_back_expired_member', 'care_back_membership_price']);
  if (!supported.has(intent) || !Number.isFinite(now) || now < Date.parse('2026-10-31T00:00:00+07:00')) return null;
  if (/สลิป|โอนแล้ว|ชำระแล้ว|จ่ายแล้ว|คืนเงิน|ได้สิทธิ์แล้ว|สิทธิ์เข้าแล้ว|(?:ของผม|ของฉัน|ของหนู)|(?:ผม|ฉัน|หนู).{0,24}(?:ได้ไหม|ได้อะไร|สิทธิ์|เข้าเกณฑ์)|black\s*card|\b[sv]*vip\b|ย้อนหลัง/i.test(text)) return null;
  if (now >= Date.parse('2026-11-01T00:00:00+07:00')) return { text: 'CARE BACK รอบนี้สิ้นสุดวันที่ 31 ต.ค. 2569 แล้วครับ กดตรวจข้อเสนอล่าสุดได้เลย', route: 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview', label: 'ตรวจข้อเสนอล่าสุด' };
  return { text: 'CARE BACK วันนี้วันสุดท้ายครับ 🖤\nสมาชิกใหม่: Standard 1,199 บาท/1 ปี · Premium 2,999 บาท/2 ปี พร้อม Welcome Points 66 คะแนน\nสมาชิกเดิมมีโปรต่ออายุ กดสมัคร/ตรวจสิทธิ์จากบัญชีเดิมก่อนชำระได้เลยครับ', route: 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=signup&view=signup&world=private', label: 'สมัคร / เช็กสิทธิ์' };
}
