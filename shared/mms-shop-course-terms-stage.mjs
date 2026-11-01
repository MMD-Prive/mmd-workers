// Owner-confirmed price basis for the supplied menus. Stage only; no live agreement is modified.
export const MMS_SHOP_COURSE_PRICE_TERMS = 'ราคาตามเมนูคือค่าห้อง/คอร์สที่ MMS จ่ายให้ร้าน ไม่รวมค่า Therapist';
export const MMS_SHOP_COURSE_SETTLEMENT_NOTE = 'ค่า Therapist และค่าเดินทางแยกจากราคาของร้าน ยอดรวมของแต่ละงานต้องจัดสรรตามข้อตกลงที่อนุมัติ';
export const MMS_SHOP_COURSE_STAGE_AGREEMENTS = Object.freeze({
  kalima: Object.freeze({ shop_name: 'Kalima Massage', price_basis: 'mms_payable_room_course', therapist_included: false, travel_included: false, confirmation_source: 'owner_instruction', stage_only: true }),
  relax: Object.freeze({ shop_name: 'Relax Spa by 9', price_basis: 'mms_payable_room_course', therapist_included: false, travel_included: false, confirmation_source: 'owner_instruction', stage_only: true }),
});
