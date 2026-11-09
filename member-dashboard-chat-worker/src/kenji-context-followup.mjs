// Bounded intake only: customer-supplied text is not identity, price, access,
// availability or booking truth. No network, model calls, or shared turn state.
const WEAK_INTENTS = new Set(['note_only', 'line_event']);
const BOOKING_INTENTS = new Set(['human_handoff', 'pricing_review', 'mmd_companion', 'availability_request']);
const TOPIC_CHANGE = /(?:^|[\s,])(?:ขอ)?(?:เปลี่ยนเรื่อง|อีกเรื่อง|เรื่องใหม่|ถามเรื่องอื่น|new topic)/i;
const REJECTION = /^(?:ไม่ใช่|ไม่ได้(?:หมายถึง|ถาม|จะ)|ไม่ต้องการ)/i;
const REFERENTIAL_TURN = /^(?:ขอ)?(?:แก้(?:เป็น|ไข)|เปลี่ยน(?:เป็น|วัน|เวลา|สถานที่)|ไม่ใช่|ไม่ได้(?:หมายถึง|ถาม|จะ)|ไม่ต้องการ|อัน(?:นี้|นั้น|เดิม)|คน(?:นี้|นั้น|เดิม)|ถ้าเป็น|เทียบกับ|แล้วถ้า)/i;
const PROTECTED_TOPIC = /สลิป|ชำระ|โอน(?:เงิน)?|จ่าย(?:เงิน)?|คืนเงิน|มัดจำ|refund|payment|paid|deposit|ร้องเรียน|ข้อมูลส่วนตัว|สิทธิ์|คะแนน|แต้ม|บัตรดำ|black\s*card|\b(?:svip|vip)\b/i;

export function isKenjiExplicitTopicChange(raw) {
  return TOPIC_CHANGE.test(String(raw || '').normalize('NFKC').trim());
}

// Preserve protected cues anywhere in the original text. This helper is
// for routing a plain correction, never for validating a new business fact.
export function kenjiPositiveClause(raw) {
  const message = String(raw || '').normalize('NFKC').trim();
  if (!REJECTION.test(message) || PROTECTED_TOPIC.test(message)) return null;
  const match = /(?:แต่(?:จริงๆ)?|แค่|ที่หมายถึง|ขอเปลี่ยนเป็น|ขอแก้เป็น)\s*(.+)$/i.exec(message);
  return match ? match[1].trim() : '';
}

export function isKenjiContextRoutingCandidate(raw) {
  const message = String(raw || '').normalize('NFKC').trim();
  return Boolean(message && message.length <= 600 && !PROTECTED_TOPIC.test(message) &&
    (isKenjiExplicitTopicChange(message) || REFERENTIAL_TURN.test(message)));
}

export function resolveKenjiContextFollowup(raw, inferredIntent, continuity = {}, now = Date.now()) {
  const effective = continuity.effective_intent || inferredIntent;
  const message = String(raw || '').normalize('NFKC').trim();
  if (!message || message.length > 600 || isKenjiExplicitTopicChange(message) ||
      PROTECTED_TOPIC.test(message) || /สมาชิก|membership/i.test(message)) return null;
  const weak = WEAK_INTENTS.has(inferredIntent);
  const referential = REFERENTIAL_TURN.test(message);
  if (!weak && !(referential && BOOKING_INTENTS.has(inferredIntent))) return null;
  if (weak && !WEAK_INTENTS.has(effective) && !BOOKING_INTENTS.has(effective)) return null;
  const matrix = continuity.matrix || {};
  const expires = Date.parse(matrix.state_expires_at || '');
  const current = continuity.available === true && continuity.storage_status === 'ready'
    && continuity.decision !== 'stale_refresh' && matrix.matrix_status === 'active'
    && Number.isFinite(expires) && expires > now;
  const lastInteraction = Date.parse(matrix.last_interaction_at || matrix.state_updated_at || '');
  const recent = Number.isFinite(lastInteraction) && lastInteraction <= now && now - lastInteraction <= 30 * 60_000;
  const pendingReason = String(matrix.handoff_reason || '');
  const bookingContext = current && (referential ? recent : continuity.decision !== 'new_topic')
    && (['booking', 'pricing', 'model', 'models'].includes(matrix.topic)
      || /^(?:booking_details|location_details|budget_details|budget_flexibility|model_reference):/.test(pendingReason));
  if (!weak && !bookingContext) return null;
  // A rejected date, time or budget is not a new brief. Read a correction
  // only from the positive clause after the rejection.
  const details = kenjiPositiveClause(message) ?? message;
  let answer = '';
  let reason = '';
  const dateCue = /(?:เสาร์|อาทิตย์|จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|วันที่|วันนี้|พรุ่งนี้|คืนนี้)/.test(details);
  const timeCue = /(?:\d\s*(?:ทุ่ม|โมง|นาฬิกา)|\d{1,2}:\d{2}|(?:หนึ่ง|สอง|สาม|สี่|ห้า|หก)ทุ่ม|เที่ยง(?:คืน)?)/.test(details);
  const locationCue = /(?:สถานที่|โรงแรม|ซอย|รัชดา|โซน|maps\.app\.goo\.gl|google\.[^\s/]+\/maps)/i.test(details);
  if (dateCue && timeCue) {
    answer = locationCue
      ? 'เห็นวัน เวลา และสถานที่ที่ระบุในข้อความนี้แล้วครับ ต้องให้เปอร์ตรวจรายละเอียดกับคิวก่อน ยังไม่ยืนยันว่าจองได้ครับ'
      : 'เห็นวันและเวลาที่ระบุในข้อความนี้แล้วครับ ขอพื้นที่หรือสถานที่เพิ่มเติม เพื่อให้เปอร์ตรวจรายละเอียดกับคิวก่อน ยังไม่ยืนยันว่าจองได้ครับ';
    reason = 'booking_details';
  } else if (locationCue) {
    answer = 'เห็นสถานที่หรือลิงก์ที่ส่งมาแล้วครับ ยังไม่ได้เปิดอ่านหรือยืนยันจุดนัดจากลิงก์ ให้เปอร์ตรวจสถานที่กับรายละเอียดนัดก่อนครับ';
    reason = 'location_details';
  } else if (/(?:งบ|มองไว้ประมาณ|ประมาณ).{0,32}\d|\d\s*[-–]\s*\d+\s*k\b/i.test(details)) {
    answer = 'เข้าใจว่านี่คืองบประมาณที่เสนอครับ ไม่ใช่ราคาที่ตกลงแล้ว ต้องให้เปอร์ตรวจเรทและเงื่อนไขก่อนครับ';
    reason = 'budget_details';
  } else if (bookingContext && /(?:บวกลบได้|ยืดหยุ่นได้|เพิ่มลดได้)/.test(details)) {
    answer = 'เข้าใจว่างบยืดหยุ่นได้ครับ ให้เปอร์ตรวจเรทและเงื่อนไขของคนที่สนใจก่อน ยังไม่ตกลงราคาแทนครับ';
    reason = 'budget_flexibility';
  } else if (/(?:ถ้างั้น\s*)?(?:เอา|ขอ|เลือก|คนนี้ก่อน|คนนี้แหละ).{0,8}(?:คนนี้|ก่อนละกัน)|คนนี้ก่อนละกัน/.test(details)) {
    answer = 'เข้าใจว่าต้องการเลือกคนที่อ้างถึงครับ ขอชื่อหรือรหัสที่ตรงกับรูปเพื่อให้เปอร์ตรวจต่อ ผมยังระบุไม่ได้ว่ารูปที่อ้างถึงเป็นใคร และยังไม่ยืนยันคิวหรือการจองครับ';
    reason = 'model_reference';
  } else if ((bookingContext && referential) ||
      (current && continuity.decision !== 'new_topic' && matrix.handoff_required === true)) {
    // A clarification already sent is not permission to repeat it forever.
    // Leave the open handoff intact and let Per continue instead of resetting.
    if (pendingReason === 'clarify_open_case:per_review' &&
        (matrix.payload_json?.line_delivery_succeeded === true || matrix.payload_json?.reply_source === 'bounded_context_waiting_per')) {
      return { intent: 'human_handoff', text: '', reply_source: 'bounded_context_waiting_per',
        handoff_required: true, handoff_reason: pendingReason };
    }
    const subject = pendingReason.startsWith('photo_accuracy:') ? 'รูปกับตัวจริง'
      : pendingReason.startsWith('advertisement_terms:') ? 'เงื่อนไขโฆษณา'
      : bookingContext ? 'รายละเอียดนัดหรือราคา' : '';
    if (subject) {
      answer = `ข้อความนี้ต้องการถามต่อเรื่อง${subject}จุดไหนครับ ผมยังไม่เข้าใจส่วนที่อ้างถึง จึงยังไม่ยืนยันข้อมูลหรือเงื่อนไขแทนเปอร์ครับ`;
      reason = 'clarify_open_case';
    }
  }
  if (!answer) return null;
  return { intent: 'human_handoff', text: answer, reply_source: 'bounded_context_followup',
    handoff_required: true, handoff_reason: `${reason}:per_review` };
}
