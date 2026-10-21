export const MMS_CHAT_POLICY = Object.freeze({
  version: 'mms-chat-2026-10-21-v1',
  title: 'กติกาการสนทนาใน MY MMS',
  introduction: 'คุยกับ Therapist ได้ตรงที่นี่ครับ สอบถาม ปรับคอร์ส และตกลงบริการได้เลย โดยการจองและรับงานต้องทำผ่าน MY MMS',
  rules: [
    'ห้ามขอ ส่ง หรือแลกช่องทางติดต่อส่วนตัว เช่น เบอร์โทร LINE ID อีเมล บัญชีโซเชียล ลิงก์ติดต่อ หรือ QR code เพื่อย้ายการติดต่อออกจาก MY MMS',
    'ห้ามชักชวนให้จอง รับงาน ชำระเงิน หรือตกลงใช้บริการนอกระบบ รวมถึงเสนอเงื่อนไขพิเศษให้ไปติดต่อนอกระบบ',
    'ห้ามหลบเลี่ยงการตรวจด้วยการแบ่งข้อมูลหลายข้อความ แทรกสัญลักษณ์ หรือใช้รูปภาพและไฟล์แนบ ขณะนี้แชตรับเฉพาะข้อความครับ',
    'ให้ระบุสถานที่และพิกัดสำหรับให้บริการผ่านรายละเอียดการจอง',
    'MY MMS ใช้ระบบอัตโนมัติตรวจข้อความก่อนส่ง ข้อความที่เข้าข่ายอาจถูกระงับและขอให้แก้ไข หากคิดว่าตรวจผิด สามารถขอให้ Per ตรวจสอบได้',
    'ข้อความที่ถูกระงับไม่ทำให้บัญชีถูกลงโทษอัตโนมัติ หากตรวจสอบแล้วพบการฝ่าฝืนซ้ำหรือจงใจหลบเลี่ยง อาจจำกัดการสนทนา พักใช้ หรือยุติบัญชีตามความรุนแรง โดยแจ้งเหตุผลและเปิดให้ขอทบทวน',
    'กติกานี้ใช้กับลูกค้าและ Therapist ทุกบัญชี',
  ],
});

export const MMS_CHAT_ERRORS = Object.freeze({
  MMS_CHAT_CONTACT_BLOCKED: 'ข้อความยังไม่ได้ส่งครับ พบข้อมูลที่อาจเป็นช่องทางติดต่อส่วนตัว กรุณานำข้อมูลนั้นออก แล้วส่งคำถามเรื่องบริการอีกครั้ง',
  MMS_CHAT_OFFSITE_BLOCKED: 'ข้อความยังไม่ได้ส่งครับ การชวนไปติดต่อ จอง หรือชำระเงินนอก MY MMS ขัดกับกติกา สามารถคุยรายละเอียดบริการที่นี่ได้เลย',
  MMS_CHAT_CONTEXT_REVIEW: 'ข้อความยังไม่ได้ส่งครับ พบข้อความที่อาจเกี่ยวกับการติดต่อนอกระบบ กรุณาเขียนรายละเอียดบริการให้ชัดขึ้น หรือขอให้ตรวจสอบ',
  MMS_CHAT_TEXT_ONLY: 'ขณะนี้ส่งได้เฉพาะข้อความครับ ยังไม่รับรูป ไฟล์ หรือ QR code',
  MMS_CHAT_POLICY_REQUIRED: 'กรุณาอ่านและยอมรับกติกาการสนทนาก่อนครับ',
  MMS_CHAT_RATE_LIMITED: 'ส่งข้อความถี่เกินไปครับ รอสักครู่แล้วลองใหม่',
  MMS_CHAT_MESSAGE_INVALID: 'กรุณาพิมพ์ข้อความ 1–1,000 ตัวอักษรครับ',
  MMS_CHAT_NOT_FOUND: 'ไม่พบห้องสนทนาที่บัญชีนี้เปิดได้ครับ',
  MMS_CHAT_THERAPIST_UNAVAILABLE: 'Therapist นี้ยังไม่พร้อมเปิดบทสนทนาใหม่ครับ',
  MMS_CHAT_REQUEST_CONFLICT: 'คำขอนี้ถูกใช้กับข้อความอื่นแล้วครับ กรุณาลองส่งใหม่',
});

export function normalizeChatText(value) {
  return String(value).normalize('NFKC').toLowerCase()
    .replace(/[\p{Cf}\u034f\ufe00-\ufe0f]/gu, '')
    .replace(/[๐-๙]/g, digit => String(digit.charCodeAt(0) - 0x0e50));
}

const thaiDigits = { ศูนย์: '0', หนึ่ง: '1', สอง: '2', สาม: '3', สี่: '4', ห้า: '5', หก: '6', เจ็ด: '7', แปด: '8', เก้า: '9' };
function phoneText(value) {
  return value.replace(/ศูนย์|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า/g, word => thaiDigits[word]);
}

// Classification is deterministic and intentionally holds ambiguous attempts.
// It never approves payments, penalizes an account, or calls an external model.
export function inspectChatMessage(text, previous = []) {
  const current = normalizeChatText(text);
  const compact = current.replace(/[\s\p{P}\p{S}]/gu, '');
  const phone = phoneText(current);
  const digits = phone.replace(/[^0-9+]/g, '');
  const contact = () => ({ code: 'MMS_CHAT_CONTACT_BLOCKED' });
  const offsite = () => ({ code: 'MMS_CHAT_OFFSITE_BLOCKED' });
  const context = () => ({ code: 'MMS_CHAT_CONTEXT_REVIEW' });

  if (/(?:^|\D)(?:0[2-9](?:[\s()._-]*\d){7,8}|\+?66[\s()._-]*[2-9](?:[\s()._-]*\d){7,8})(?:\D|$)/.test(phone)) return contact();
  if (/^(?:0[2-9]\d{7,8}|\+?66[2-9]\d{7,8})$/.test(digits)) return contact();
  if (/[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\s*\.\s*[a-z]{2,}/i.test(current)) return contact();
  // No arbitrary links: redirects and URL shorteners can conceal contact links.
  if (/(?:https?:|www\.|line:\/|line\.me|lin\.ee|t\.me|wa\.me|facebook\.com|instagram\.com|m\.me|bit\.ly|tinyurl\.com)/i.test(current)) return contact();
  if (/(?:[a-z0-9-]+\.)+(?:com|net|org|me|app|io|co|th|xyz|link)(?:\b|\/)/i.test(current)) return contact();
  if (/(?:^|\s)@[a-z0-9_.-]{2,}/i.test(current)) return contact();
  if (/(?:[a-z0-9._%+-]+\s*\[?at\]?\s*[a-z0-9.-]+\s*\[?dot\]?\s*[a-z]{2,})/i.test(current)) return contact();
  if (/(?:line\s*id|ไลน์ไอดี|ไอดีไลน์)\s*[:=]?\s*[@]?[a-z0-9_.-]{2,}/i.test(current)) return contact();
  if (/\b(?:my\s+)?l\s*i\s*n\s*e\s*(?::|=|\bis\b)\s*[@]?[a-z0-9_.-]{2,}/i.test(current)) return contact();
  if (/(?:ไลน์|ไอดี|ไอจี)[a-z0-9_.-]{2,}/i.test(compact) || /(?:^|\s)(?:id|ig|fb)\s*[:=]?\s*[@]?[a-z0-9_.-]{2,}/i.test(current)) return contact();
  if (/(?:ขอ|ส่ง|บอก|แลก|แอด|เพิ่มเพื่อน|ทัก|ทิ้ง|ให้|ดู|เอา).{0,24}(?:เบอร์|เบอร|ไลน์|ไลน|ไอดี|เฟซ|เฟส|ไอจี|วอตส์แอป|วอทส์แอป|ช่องทางติดต่อ|คิวอาร์|qr|line\s*id|whatsapp|telegram)/i.test(compact)) return offsite();
  if (/(?:เบอร์|ไลน์|ไอดี|ไอจี|line\s*id|instagram|facebook)\s*(?:ผม|ฉัน|ของผม|ของฉัน|คือ|:|=|id|ไอดี)/i.test(current)) return contact();
  if (/(?:คุย|ติดต่อ|ทัก|นัด|จอง|รับงาน|โอน|จ่าย|ชำระ).{0,20}(?:ส่วนตัว|นอกระบบ|นอกแอป|ข้างนอก|นอกรอบ|โดยตรง|ตรงกับผม|ตรงให้ผม)/.test(compact)) return offsite();
  if (/(?:ติดต่อ|คุย|จอง|นัด)กันเอง/.test(compact)) return offsite();
  if (/(?:คุย|ติดต่อ|ทัก).{0,12}(?:ทาง|ใน|ผ่าน|ที่)(?:ไลน์|line|ไอจี|เฟซ|เฟส|instagram|facebook|whatsapp|telegram)/i.test(compact)) return context();
  if (/(?:ขอช่องทางอื่น|มีช่องทางอื่นไหม|คุยที่อื่น|แชตที่อื่น|คุยอีกแอป|ส่งบัญชีมา|ขอเลขบัญชี|เลขบัญชีผม)/.test(compact)) return context();
  if (/(?:contact|message|add|text|call|dm).{0,20}(?:me|my|line|whatsapp|telegram|instagram|phone|number)|(?:book|pay|chat).{0,20}(?:outside|off.?app|privately|directly)/i.test(current)) return offsite();
  if (/(?:ไม่ต้องผ่าน|เลี่ยง|หลบ).{0,12}(?:mms|ระบบ|แอป)|(?:ตัด|ไม่เสีย|ไม่ต้องเสีย).{0,8}(?:ค่าคอม|คอมมิชชั่น)/i.test(compact)) return offsite();
  // Short numeric fragments are held before delivery; durations/prices with
  // explicit units remain usable. Check prior same-sender fragments as well.
  if (/^[\d\s+()._-]{1,24}$/.test(phone.trim()) || /^(?:ไลน์|ไอดี|เบอร์|ช่องทางส่วนตัว|ขอช่องทางอื่น|line|lineid|id|ig|fb)$/.test(compact)) return context();
  if (/^[a-z][a-z0-9_.-]{2,39}$/.test(current.trim()) && /[0-9_.]/.test(current.trim())) return context();
  const recent = previous.slice(-6).map(normalizeChatText);
  if (recent.length) {
    for (let start = 0; start < recent.length; start++) {
      const joined = [...recent.slice(start), current].join('');
      const joinedDigits = phoneText(joined).replace(/[^0-9+]/g, '');
      if (joinedDigits !== digits && /^(?:0[2-9]\d{7,8}|\+?66[2-9]\d{7,8})$/.test(joinedDigits)) return contact();
      if (/(?:ขอ|ส่ง|แลก|แอด|ทัก)(?:ไลน์|ไอดี|เบอร์|line|id)/.test(joined.replace(/[\s\p{P}\p{S}]/gu, ''))) return offsite();
    }
  }
  return { code: null };
}

export function chatSafeLabel(value, fallback = 'Therapist') {
  const text = typeof value === 'string' ? value.trim().slice(0, 120) : '';
  return text && !inspectChatMessage(text).code ? text : fallback;
}
