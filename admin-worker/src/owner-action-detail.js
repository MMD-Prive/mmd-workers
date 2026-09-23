// Phase 4B — Owner Action Detail & Read-only Drilldown
// Projection only. It deliberately exposes no source records, personal data,
// payment references, private notes, or mutation capability.

import { buildOwnerActionsQueue } from "./owner-actions-queue.js";

const DETAIL_COPY = Object.freeze({
  payment_review: {
    reason: "หลักฐานการชำระเงินยังรอการตรวจจาก Money Truth",
    decision_boundary: "เปิดหน้าตรวจรับเงินเพื่อพิจารณาหลักฐานตามขั้นตอนของ Payments เท่านั้น",
  },
  historical_recovery: {
    reason: "หลักฐานย้อนหลังยังต้องจับคู่ก่อนสรุปประวัติ",
    decision_boundary: "เปิด Historical Backfill เพื่อตรวจหลักฐานและการจับคู่ใน authority ของมัน",
  },
  finance_reconciliation: {
    reason: "Finance Audit พบความสอดคล้องที่ต้องตรวจใน authority ทางการเงิน",
    decision_boundary: "เปิด Finance & Audit เพื่อตรวจ timeline และ reconciliation จาก canonical finance authority เท่านั้น",
  },
  availability_exception_review: {
    reason: "Daily Coverage Review พบ exception ของ Availability ที่ต้องย้อนดู source หรือ recovery action ตามหลักฐานจริง",
    decision_boundary: "เปิด Calendar เพื่อตรวจ coverage-health และจัดการเฉพาะ action ที่มี authority อยู่แล้ว; ห้ามเดาสถานะว่างหรือส่ง reminder อัตโนมัติ",
  },
  finance_payout_hold: {
    reason: "Finance Audit ระบุรายการที่ยังพักจ่าย",
    decision_boundary: "เปิด Finance & Audit เพื่อตรวจเหตุผลและหลักฐานใน authority ทางการเงินเท่านั้น",
  },
  job_reconfirm_overdue: {
    reason: "มีงานที่พ้นเวลายืนยันแล้ว",
    decision_boundary: "เปิด Jobs เพื่อตรวจสถานะและการคอนเฟิร์มจาก canonical session เท่านั้น",
  },
  job_reconfirm_pending: {
    reason: "มีงานที่ถึงเวลาต้องยืนยันก่อนเริ่ม",
    decision_boundary: "เปิด Jobs เพื่อตรวจสถานะและการคอนเฟิร์มจาก canonical session เท่านั้น",
  },
  membership_review: {
    reason: "มีสถานะสมาชิกที่ resolver ระบุว่าต้องตรวจ",
    decision_boundary: "เปิด Member Intelligence เพื่อดู decision ของ entitlement resolver เท่านั้น",
  },
  mms_prebooking_coordination: {
    reason: "MMS มี prebooking ที่ยังอยู่ระหว่างประสานงาน",
    decision_boundary: "เปิด MMS เพื่อตรวจสถานะและการประสานงานจาก mms-worker เท่านั้น",
  },
  mms_application_review: {
    reason: "MMS มีใบสมัครที่รอการตรวจ",
    decision_boundary: "เปิด MMS เพื่อตรวจใบสมัครใน authority ของ MMS เท่านั้น",
  },
  hype_entitlement_notification_overdue: {
    reason: "Entitlement ถูก materialize แล้ว แต่ notification ยังไม่จบและเลย SLA",
    decision_boundary: "เปิด Member Intelligence เพื่อตรวจ entitlement/notification state จาก resolver เท่านั้น; HYPE ไม่เปลี่ยนสิทธิ์หรือส่งแทน",
  },
  hype_recovery_unassigned_overdue: {
    reason: "Recovery case เลย SLA และยังไม่มี operator รับดู",
    decision_boundary: "เปิด Recovery queue เพื่อรับหรือจัดการเคสตาม workflow metadata เท่านั้น; การ assign ไม่ได้เปลี่ยน business truth",
  },
  hype_coupon_manual_review_overdue: {
    reason: "Coupon claim อยู่ manual_review และเลย SLA",
    decision_boundary: "เปิด Member Intelligence เพื่อตรวจ CARE BACK claim ตาม care_back_claim_policy เท่านั้น",
  },
  hype_telegram_bind_overdue: {
    reason: "Telegram identity bind ยังไม่ consume และหมดเวลาตาม SLA",
    decision_boundary: "เปิด Control Room เพื่อดู identity bind authority; ห้ามเดาตัวตนหรือสร้าง binding ใหม่อัตโนมัติ",
  },
  hype_operational_watch: {
    reason: "HYPE พบ overdue exception ชนิดใหม่ที่ยังไม่มี cohort contract เฉพาะ",
    decision_boundary: "HYPE เป็น coordinator เท่านั้น; เปิด Control Room เพื่อหา authority ต้นทางก่อนตัดสินใจ",
  },
  owner_exception: {
    reason: "ระบบพบเรื่องที่ต้องให้ Owner ใช้ judgement",
    decision_boundary: "เปิด Control Room เพื่อดู diagnostic ของ authority ที่เกี่ยวข้องก่อนตัดสินใจ",
  },
});

export function buildOwnerActionDetail(input = {}, actionKey) {
  const key = String(actionKey || "").trim();
  const queue = buildOwnerActionsQueue(input);
  const action = queue.actions.find((item) => item.action_key === key);
  const copy = DETAIL_COPY[key];
  if (!action || !copy) return null;

  return {
    ok: true,
    contract: "mmd_owner_action_detail_v1",
    mode: "owner_review_only",
    generated_at: queue.generated_at,
    action,
    drilldown: {
      action_key: action.action_key,
      reason: copy.reason,
      observed_count: action.count,
      urgency: action.urgency,
      authority: action.authority,
      source_surface: action.href,
      decision_boundary: copy.decision_boundary,
      records_exposed: false,
      personal_data_exposed: false,
      payment_reference_exposed: false,
      raw_notes_exposed: false,
      send_allowed: false,
      mutation_allowed: false,
    },
    unavailable_sources: queue.unavailable_sources,
    guardrails: queue.guardrails,
  };
}
