// Recovered from ee5a04b1 Owner Rules, per_line_20261031_v2.
// Deliberately excludes definitions carrying Points/entitlement thresholds.
export function approvedPublicQa(raw = '') {
  if (String(raw).trim() !== 'มีบริการอะไรบ้าง') return null;
  return {
    text: 'MMD Privé ดูแลการคัดเลือกและนัดหมายกับนายแบบชายครับ มีทั้งกลุ่มที่เปิดโปรไฟล์ทั่วไป และกลุ่ม Private ที่เข้าถึงตามสิทธิ์สมาชิก โดยเน้นความเป็นส่วนตัวครับ',
    intent: 'approved_qa', reply_source: 'per_line_20261031_v2',
  };
}
