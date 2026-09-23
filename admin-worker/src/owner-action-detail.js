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
