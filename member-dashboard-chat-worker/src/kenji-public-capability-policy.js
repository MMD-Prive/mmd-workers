export const KENJI_PUBLIC_ALLOWED_CAPABILITIES = Object.freeze([
  "general_qna",
  "published_promotions",
]);

const RESTRICTED = Object.freeze([
  ["booking", /(จอง|booking|นัดหมาย|สร้างงาน|ยืนยันงาน|booking status)/i],
  ["availability", /(ว่างไหม|ใครว่าง|availability|เช็กคิว|ตรวจคิว|คิวคืนนี้|real[- ]?time)/i],
  ["private_access", /(sigil|private|black\s*card|แบล็ค\s*การ์ด|สิทธิ์ไพรเวท|private access)/i],
  ["points", /(point|points|พอยต์|แต้ม|คะแนนสะสม|ยอดคะแนน)/i],
  ["payment", /(ชำระ|payment|สลิป|โอนเงิน|ยอดเงิน|ใบเสร็จ|refund|คืนเงิน)/i],
  ["history", /(ประวัติ|history|ย้อนหลัง|เคยใช้บริการ)/i],
  ["care", /(ร้องเรียน|หลังบริการ|aftercare|recovery|private care|ปัญหาหลังงาน)/i],
  [
    "customer_record",
    /(ลูกค้าคนอื่น|สมาชิกคนอื่น|ข้อมูลคนอื่น|เบอร์โทร|อีเมล|line id|ไลน์ไอดี|ประวัติลูกค้า|customer record)/i,
  ],
  [
    "member_coupon",
    /(คูปอง(?:ของฉัน|ของผม|ของเรา|ในบัญชี|ที่ฉันได้|ที่ผมได้)|โค้ด(?:ส่วนลด)?ของฉัน|(?:my|personal)\s*(?:coupon|voucher|promo)|(?:โปรโมชั่น|โปรโมชัน|คูปอง|ส่วนลด|สิทธิ์).*?(?:ของฉัน|ของผม|ฉันใช้ได้ไหม|ผมใช้ได้ไหม|บัญชีของฉัน|บัญชีของผม)|(?:ฉัน|ผม).*(?:ได้รับสิทธิ์|มีสิทธิ์|ใช้คูปองได้ไหม|ได้โปรนี้ไหม))/i,
  ],
  [
    "member_record",
    /(สถานะสมาชิกของฉัน|เช็กสมาชิก|สมาชิกหมดอายุ|วันหมดอายุ|บัญชีของฉัน|membership status|my membership|my account|ต่ออายุ|renewal)/i,
  ],
]);

const PUBLISHED_PROMOTION = /(โปรโมชั่น|โปรโมชัน|โปรล่าสุด|promotion|promo|campaign|คูปอง|coupon|offer|สิทธิพิเศษที่ประกาศ|care[\s_-]*back|แคร์[\s_-]*แบ[ก็ค]|double[\s_-]*moment|6[\s_-]*years|6[\s_-]*ปี|ส่วนลด)/i;

function messageText(value) {
  return value == null ? "" : String(value).trim().replace(/\s+/g, " ").slice(0, 800);
}

export function classifyKenjiPublicCapability(value) {
  const message = messageText(value);
  if (!message) return { capability: "general_qna", allowed: true, reason: null };

  for (const [reason, pattern] of RESTRICTED) {
    if (pattern.test(message)) {
      return { capability: reason, allowed: false, reason };
    }
  }

  if (PUBLISHED_PROMOTION.test(message)) {
    return { capability: "published_promotions", allowed: true, reason: null };
  }

  return { capability: "general_qna", allowed: true, reason: null };
}

export function isGeneralKenjiIntent(value) {
  return messageText(value).toLowerCase() === "general";
}
