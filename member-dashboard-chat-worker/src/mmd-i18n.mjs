// Catalog keys: payment.proof.ops.* (shared mmd-i18n sync required before release).
export const PAYMENT_PROOF_OPS_COPY_TH = Object.freeze({
  customerUnknown: "ยังจับคู่ลูกค้าไม่ได้", currency: "บาท", amountUnreadable: "อ่านยอดไม่ได้ · ต้องตรวจภาพต้นฉบับ",
  amountPending: "กำลังอ่านยอด / ยังไม่มีผลอ่านยอด", renewal: "ต่ออายุสมาชิก", signup: "สมัครสมาชิกใหม่",
  purposeUnknown: "ยังยืนยันประเภทเงินไม่ได้", bankUnverified: "ยังไม่ยืนยันเงินเข้า",
  imagePending: "ภาพจากลูกค้า · รอตรวจว่าเป็นสลิปหรือภาพแจ้งปัญหา",
});

export const MMD_MEMBERSHIP_STATUS_COPY_TH = Object.freeze({
  renewal_pending: "ผมยังยืนยันข้อมูลสมาชิกเดิมและข้อเสนอต่ออายุของบัญชีนี้ไม่ได้ครับ ต้องให้เปอร์ตรวจประวัติก่อน จึงยังแจ้งราคาและช่องทางชำระไม่ได้ครับ",
  renewal_payment_pending: "ข้อเสนอนี้ยังไม่เปิดสิทธิ์สมาชิกครับ ต้องตรวจช่องทางชำระสำหรับบัญชีนี้ก่อน",
  renewal_offer: ({ label, amount, years }) => `ต่ออายุ ${label} ได้ ${years} ปี ราคา ${amount} บาทครับ`,
  identity_unresolved: "ตอนนี้ยังจับคู่บัญชี LINE กับข้อมูลสมาชิกที่ยืนยันได้ไม่สำเร็จครับ จึงยังสรุปสถานะสมาชิกไม่ได้",
  no_entitlement: "ตอนนี้ยังไม่พบสิทธิ์สมาชิกที่ยืนยันได้จากบัญชีนี้ครับ จึงยังสรุปสถานะระดับหรือวันหมดอายุไม่ได้",
  upstream_error: "ตัวตรวจสิทธิ์สมาชิกขัดข้องชั่วคราวครับ จึงยังยืนยันระดับหรือวันหมดอายุไม่ได้",
  projection_invalid: "ข้อมูลสิทธิ์สมาชิกยังไม่สมบูรณ์ครับ จึงยังยืนยันระดับหรือวันหมดอายุไม่ได้",
});
