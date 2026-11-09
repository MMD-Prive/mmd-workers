const AUTHORITY = 'my_mmd_entitlement_resolver_v1';
const LABELS = Object.freeze({private_standard:'Standard',private_premium:'Premium',vip:'VIP',svip:'SVIP',black_card:'Black Card',red_card:'Red Card',public_member:'Public Member',guest_pass:'Guest Pass'});
const STATES = Object.freeze({active:'ใช้งานอยู่',expiring_soon:'ใกล้หมดอายุ',grace:'อยู่ในช่วงผ่อนผัน',expired:'หมดอายุ',inactive:'ยังไม่ใช้งาน',pending:'รอตรวจสอบ',revoked:'ถูกเพิกถอน',blocked:'ระงับใช้งาน'});

// Read-only navigation is never approval or an access grant. Points are not
// consulted here; only this turn's canonical membership projection is trusted.
export function resolveMembershipStatusReply(truth = {}) {
  const m = truth.membership || {};
  const verified = truth.ok === true && truth.authority === AUTHORITY &&
    truth.identity_status === 'resolved' && Object.hasOwn(LABELS,m.level) && Object.hasOwn(STATES,m.lifecycle);
  let text = 'สถานะสมาชิก: ยังตรวจสอบไม่ได้ครับ\nวันหมดอายุ: ยังตรวจสอบไม่ได้ครับ\nตอนนี้ข้อมูลจากระบบยังไม่พอยืนยันครับ ฝากข้อความให้เปอร์ตรวจต่อในแชตนี้ได้เลย';
  let handoff = true;
  if (verified) {
    const lifecycle = m.member_blocked === true ? 'blocked' : m.lifecycle;
    const expiry = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(String(m.expire_at || '')) ? String(m.expire_at).slice(0,10) : '';
    text = `สถานะสมาชิก: ${LABELS[m.level]} · ${STATES[lifecycle]}\nวันหมดอายุ: ${expiry || 'ยังไม่มีวันที่ยืนยันจากระบบครับ'}`;
    const protectedLevel = ['vip','svip','black_card','red_card'].includes(m.level);
    handoff = protectedLevel || ['blocked','revoked','pending','inactive'].includes(lifecycle);
    if (handoff) {
      text += '\nสถานะหรือสิทธิ์ระดับนี้ให้เปอร์ตรวจและดูแลต่อเป็นรายบุคคลในแชตนี้ครับ';
    }
  }
  return {text,intent:'membership_status',inferred_intent:'membership_status',
    truth_authority:AUTHORITY,truth_status:verified?'verified':'unavailable',
    live_truth_used:verified,live_truth_verified:verified,model_attempted:false,
    handoff_required:handoff,handoff_reason:handoff?'membership_status:per_review':'',
    cta_appended:false,cta_type:'',cta_route:''};
}
