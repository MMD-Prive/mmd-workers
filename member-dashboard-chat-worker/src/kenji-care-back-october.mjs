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
  if (!intents.has(intent) || !Number.isFinite(now) || now < CARE_BACK_OCTOBER_START) return null;
  // A proof, personal status, special membership or historical balance is never a sales offer.
  if (/สลิป|โอนแล้ว|ชำระแล้ว|จ่ายแล้ว|คืนเงิน|ได้สิทธิ์แล้ว|สิทธิ์เข้าแล้ว|(?:ของผม|ของฉัน|ของหนู)|(?:ผม|ฉัน|หนู).{0,24}(?:ได้ไหม|ได้อะไร|สิทธิ์|เข้าเกณฑ์)|black\s*card|\b[sv]*vip\b|ย้อนหลัง/i.test(text)) return null;
  if (now >= CARE_BACK_OCTOBER_END) return { text: 'CARE BACK รอบนี้สิ้นสุดวันที่ 31 ต.ค. 2569 แล้วครับ ตรวจข้อเสนอล่าสุดจากบัญชีเดิมได้เลย', route: status, label: 'ตรวจข้อเสนอล่าสุด' };
  const short = String(text).trim().replace(/(?:ครับ|ค่ะ|คะ|นะ|หน่อย|[.!?])+$/g, '').trim();
  if (['ใหม่', 'สมาชิกใหม่'].includes(short)) intent = 'care_back_new_member';
  if (['ปัจจุบัน', 'สมาชิกปัจจุบัน'].includes(short)) intent = 'care_back_current_member';
  if (['หมดอายุ', 'สมาชิกหมดอายุ'].includes(short)) intent = 'care_back_expired_member';
  const header = 'วันนี้วันสุดท้ายของ CARE BACK ครับ 🖤';
  if (/เกิน\s*90\s*วัน|เกิน\s*๙๐\s*วัน/.test(text) && !/ไม่เกิน\s*(?:90|๙๐)/.test(text)) return { text: `${header}\nหมดอายุเกิน 90 วัน ให้เปอร์ตรวจทางเลือกจากบัญชีเดิมก่อนครับ`, route: status, label: 'เปิดบัญชีเดิมให้ตรวจ' };
  if (intent.startsWith('care_back_new_')) return { text: `${header}\nสมาชิกใหม่: Standard 1,199 บาท/1 ปี · Premium 2,999 บาท/2 ปี พร้อม Welcome Points 66 คะแนน\nให้ระบบตรวจรายการก่อนชำระนะครับ`, route: signup, label: 'สมัคร Private CARE BACK' };
  if (intent === 'care_back_current_member') return { text: `${header}\nสมาชิกปัจจุบันที่ต่ออายุหรือชำระล่วงหน้า: Standard แถม 180 วัน · Premium แถม 1 ปี\nให้ระบบตรวจสิทธิ์จากบัญชีเดิมก่อนรับโปรครับ`, route: renewal, label: 'เช็กสิทธิ์ต่ออายุ CARE BACK' };
  if (intent === 'care_back_expired_member') return { text: `${header}\nสำหรับสมาชิกหมดอายุไม่เกิน 90 วัน: Standard 1,000 บาท แถม 180 วัน · Premium 2,500 บาท แถม 1 ปี\nให้ระบบตรวจบัญชีเดิมก่อนรับโปรครับ`, route: renewal, label: 'เช็กสิทธิ์ CARE BACK บัญชีเดิม' };
  return { text: `${header}\nตอนนี้เป็นสมาชิกใหม่ สมาชิกปัจจุบัน หรือสมาชิกหมดอายุครับ?\nพิมพ์ “ใหม่” / “ปัจจุบัน” / “หมดอายุ” ได้เลยครับ`, route: status, label: 'หรือเช็กบัญชีเดิมใน MY MMD' };
}
