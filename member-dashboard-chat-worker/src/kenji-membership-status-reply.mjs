const AUTHORITY = 'my_mmd_entitlement_resolver_v1';
const ENTRY = 'https://miniapp.line.me/2010862595-yT4DCEMc/';
const LABELS = Object.freeze({private_standard:'Standard',private_premium:'Premium',vip:'VIP',svip:'SVIP',black_card:'Black Card',red_card:'Red Card',public_member:'Public Member',guest_pass:'Guest Pass'});
const STATES = Object.freeze({active:'ใช้งานอยู่',expiring_soon:'ใกล้หมดอายุ',grace:'อยู่ในช่วงผ่อนผัน',expired:'หมดอายุ',inactive:'ยังไม่ใช้งาน',pending:'รอตรวจสอบ',revoked:'ถูกเพิกถอน',blocked:'ระงับใช้งาน'});

// Read-only navigation is never approval or an access grant. Points are not
// consulted here; only this turn's canonical membership projection is trusted.
export function resolveMembershipStatusReply(truth = {}) {
  const m = truth.membership || {};
  const verified = truth.ok === true && truth.authority === AUTHORITY &&
    truth.identity_status === 'resolved' && Object.hasOwn(LABELS,m.level) && Object.hasOwn(STATES,m.lifecycle);
  let route = `${ENTRY}?intent=status&view=overview`;
  let text = 'ตอนนี้ยังตรวจยืนยันสถานะสมาชิกจากระบบไม่ได้ครับ ข้อความนี้ไม่ได้หมายความว่าสมาชิกหมดอายุ ไม่ต้องยืนยัน LINE หรือส่งหลักฐานเดิมซ้ำ ฝากข้อความให้เปอร์ตรวจต่อในแชตนี้ได้ครับ';
  let handoff = true;
  if (verified) {
    const lifecycle = m.member_blocked === true ? 'blocked' : m.lifecycle;
    const expiry = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(String(m.expire_at || '')) ? String(m.expire_at).slice(0,10) : '';
    text = `ประเภทสมาชิก: ${LABELS[m.level]}\nสถานะสมาชิก: ${STATES[lifecycle]}\nวันหมดอายุ: ${expiry || 'ยังไม่มีวันที่ยืนยันจากระบบครับ'}`;
    const protectedLevel = ['vip','svip','black_card','red_card'].includes(m.level);
    handoff = protectedLevel || ['blocked','revoked','pending','inactive'].includes(lifecycle);
    if (!handoff && ['expired','grace'].includes(lifecycle) && ['private_standard','private_premium'].includes(m.level)) {
      route = `${ENTRY}?intent=renew&view=package`;
      text += '\nตรวจตัวเลือกต่ออายุได้ใน My MMD การกดลิงก์ยังไม่ยืนยันการชำระเงิน ต่ออายุ หรือเปิดสิทธิ์ครับ';
    } else if (handoff) {
      text += '\nสถานะหรือสิทธิ์ระดับนี้ให้เปอร์ตรวจและดูแลต่อเป็นรายบุคคลในแชตนี้ครับ';
    }
  }
  return {text:`${text}\nเปิด My MMD → ${route}`,intent:'membership_status',inferred_intent:'membership_status',
    truth_authority:AUTHORITY,truth_status:verified?'verified':'unavailable',
    live_truth_used:verified,live_truth_verified:verified,model_attempted:false,
    handoff_required:handoff,handoff_reason:handoff?'membership_status:per_review':'',
    cta_appended:true,cta_type:route.includes('intent=renew')?'membership_renewal':'membership_status',cta_route:route};
}
