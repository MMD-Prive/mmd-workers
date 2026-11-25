const AUTHORITY = 'my_mmd_entitlement_resolver_v1';
const ENTRY = 'https://miniapp.line.me/2010862595-yT4DCEMc/';
const STATUS_ENTRY = `${ENTRY}?intent=status&view=overview`;
const LABELS = Object.freeze({private_standard:'Standard',private_premium:'Premium',vip:'VIP',svip:'SVIP',black_card:'Black Card',red_card:'Red Card',public_member:'Public Member',guest_pass:'Guest Pass'});
const STATES = Object.freeze({active:'ใช้งานอยู่',expiring_soon:'ใกล้หมดอายุ',grace:'อยู่ในช่วงผ่อนผัน',expired:'หมดอายุ',inactive:'ยังไม่ใช้งาน',pending:'รอตรวจสอบ',revoked:'ถูกเพิกถอน',blocked:'ระงับใช้งาน'});

function verifiedDate(value) {
  const rawExpiry = typeof value === "string" ? value : "";
  const day = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(rawExpiry) &&
    Number.isFinite(Date.parse(rawExpiry)) ? rawExpiry.slice(0,10) : '';
  const date = new Date(day + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === day ? day : '';
}

function summaryLines(truth) {
  const points = truth.points;
  const balance = points?.status === "verified" && Number.isSafeInteger(points.active_points) &&
    points.active_points >= 0 ? `ใช้ได้ ${points.active_points.toLocaleString("th-TH")} แต้ม` : "รอตรวจสอบ";
  const history = truth.service_history;
  const dates = history?.status === "verified" && Array.isArray(history.dates)
    ? history.dates.slice(0, 3).map(verifiedDate).filter(Boolean) : null;
  const historyText = !dates || (history.dates.length > 0 && !dates.length) ? "รอตรวจสอบ"
    : dates.length ? `รายการที่ยืนยันล่าสุด ${dates.join(", ")}` : "ยังไม่พบรายการที่ยืนยัน";
  return `Points: ${balance}\nประวัติการใช้บริการ: ${historyText}`;
}

// Only MY STATUS opts in to the same-account verified Points and service summary.
export function resolveMembershipStatusReply(truth = {}, { inChatOnly = false, includeSummary = false } = {}) {
  const m = truth.membership || {};
  const resolved = truth.ok === true && truth.authority === AUTHORITY && truth.identity_status === 'resolved';
  const prospect = includeSummary && resolved && truth.customer_status === 'prospect';
  const verified = resolved && Object.hasOwn(LABELS,m.level) && Object.hasOwn(STATES,m.lifecycle);
  const verifiedSummary = includeSummary && (verified || prospect);
  const needsAccountVerification = includeSummary && truth.ok === false && truth.authority === AUTHORITY &&
    truth.failure_class === 'identity_unresolved';
  let route = inChatOnly ? '' : STATUS_ENTRY;
  let text = 'ตอนนี้ยังตรวจยืนยันสถานะสมาชิกจากระบบไม่ได้ครับ ข้อความนี้ไม่ได้หมายความว่าสมาชิกหมดอายุ ไม่ต้องยืนยัน LINE หรือส่งหลักฐานเดิมซ้ำ ฝากข้อความให้เปอร์ตรวจต่อในแชตนี้ได้ครับ';
  let handoff = true;
  if (inChatOnly) text = 'สถานะสมาชิก: ยังตรวจสอบไม่ได้ครับ\nวันหมดอายุ: ยังตรวจสอบไม่ได้ครับ\nเดี๋ยวเปอร์ขอตรวจให้ก่อนนะครับ';
  if (includeSummary && !verifiedSummary) {
    route = needsAccountVerification ? STATUS_ENTRY : '';
    handoff = false;
    text = needsAccountVerification
      ? 'ยังไม่ได้ยืนยันตัวตนครับ กดลิงก์ด้านล่างเพื่อยืนยันและดูสถานะสมาชิกใน MY MMD ได้เลยครับ'
      : resolved
        ? 'ยืนยันตัวตนแล้วครับ แต่ตอนนี้ยังแสดงสถานะสมาชิกไม่ได้'
        : 'ตอนนี้ยังตรวจสอบสถานะสมาชิกไม่ได้ครับ กรุณาลองพิมพ์ MY STATUS ใหม่ภายหลัง';
  }
  if (prospect) {
    text = 'สถานะลูกค้า: ลูกค้าที่สนใจ';
    handoff = false;
  }
  if (verified) {
    const lifecycle = m.member_blocked === true ? 'blocked' : m.lifecycle;
    const expiry = verifiedDate(m.expire_at);
    const expiryText = expiry || 'ยังไม่มีวันที่ยืนยันจากระบบครับ';
    text = inChatOnly
      ? `สถานะสมาชิก: ${LABELS[m.level]} · ${STATES[lifecycle]}\nวันหมดอายุ: ${expiryText}`
      : `ประเภทสมาชิก: ${LABELS[m.level]}\nสถานะสมาชิก: ${STATES[lifecycle]}\nวันหมดอายุ: ${expiryText}`;
    if (includeSummary) {
      const status = ['active', 'expiring_soon'].includes(lifecycle) ? 'สมาชิกปัจจุบัน' : STATES[lifecycle];
      const dateLine = lifecycle === 'expired' && expiry
        ? `หมดอายุตั้งแต่วันที่ ${expiry}`
        : expiry ? `หมดอายุวันที่ ${expiry}` : 'วันหมดอายุ: รอตรวจสอบ';
      text = `สถานะลูกค้า: ${LABELS[m.level]} · ${status}\n${dateLine}`;
    }
    const protectedLevel = ['vip','svip','black_card','red_card'].includes(m.level);
    handoff = !expiry || protectedLevel || ['blocked','revoked','pending','inactive'].includes(lifecycle);
    if (inChatOnly && !expiry) text += '\nฝากให้เปอร์ตรวจวันหมดอายุในแชตนี้ได้ครับ ยังไม่ต้องสมัครหรือชำระซ้ำ';
    if (!inChatOnly && !handoff && ['expired','grace'].includes(lifecycle) && ['private_standard','private_premium'].includes(m.level)) {
      route = `${ENTRY}?intent=renew&view=package`;
      text += '\nตรวจตัวเลือกต่ออายุได้ใน My MMD การกดลิงก์ยังไม่ยืนยันการชำระเงิน ต่ออายุ หรือเปิดสิทธิ์ครับ';
    } else if (!inChatOnly && handoff) {
      text += '\nสถานะหรือสิทธิ์ระดับนี้ให้เปอร์ตรวจและดูแลต่อเป็นรายบุคคลในแชตนี้ครับ';
    }
  }
  if (verifiedSummary) text += '\n' + summaryLines(truth);
  const ctaLabel = needsAccountVerification ? 'ยืนยันตัวตนใน MY MMD' : 'เปิด My MMD';
  return {text:route ? `${text}\n${ctaLabel} → ${route}` : text,intent:'membership_status',inferred_intent:'membership_status',
    truth_authority:AUTHORITY,truth_status:(verified || prospect)?'verified':'unavailable',
    live_truth_used:verified || prospect,live_truth_verified:verified || prospect,model_attempted:false,
    handoff_required:handoff,handoff_reason:handoff?'membership_status:per_review':'',
    cta_appended:Boolean(route),cta_type:!route?'':route.includes('intent=renew')?'membership_renewal':'membership_status',cta_route:route};
}
