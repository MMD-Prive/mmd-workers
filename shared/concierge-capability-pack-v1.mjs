export const CONCIERGE_CAPABILITY_PACK_VERSION = "mmd-concierge-capability-pack-v1-20260919";

export const CONCIERGE_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "shop_orders",
    number: 1,
    label: "MMD Shop Order Assistant",
    primary_owner: "HYPE",
    henna_role: "bridge_to_hype_or_my_mmd",
    authority: "member-pages-worker:my_mmd_shop_orders_v1",
    customer_routes: Object.freeze(["/my-mmd/orders"]),
    current_mode: "route_or_bounded_status_when_authenticated",
    never_claim: Object.freeze(["order delivered", "payment confirmed", "refund completed"]),
  }),
  Object.freeze({
    id: "care_back_coupon",
    number: 2,
    label: "CARE BACK / Coupon Intelligence",
    primary_owner: "HYPE",
    henna_role: "bridge_to_hype_or_my_mmd",
    authority: "member-pages-worker:care_back_claim_and_coupon_wallet",
    customer_routes: Object.freeze(["/promotion/6-years-care-back", "/my-mmd/coupons"]),
    current_mode: "canonical_wallet_state_only",
    never_claim: Object.freeze(["coupon activated", "coupon reissued", "points granted"]),
  }),
  Object.freeze({
    id: "mms_therapist_options",
    number: 3,
    label: "MMS Therapist Options Assistant",
    primary_owner: "HENNA",
    henna_role: "mms_specialist",
    hype_role: "cross_system_bridge",
    authority: "mms-worker",
    customer_routes: Object.freeze(["/male-massage/member/mms-booking", "/male-massage/therapists/mms"]),
    current_mode: "mms_worker_grounded_options_only",
    never_claim: Object.freeze(["therapist confirmed", "availability guaranteed", "booking confirmed"]),
  }),
  Object.freeze({
    id: "service_recovery",
    number: 4,
    label: "Service Recovery / Complaint Concierge",
    primary_owner: "HYPE",
    henna_role: "mms_recovery_intake_and_handoff",
    authority: "canonical_job_payment_mms_plus_human_review",
    customer_routes: Object.freeze([]),
    current_mode: "context_handoff_and_recovery_routing",
    never_claim: Object.freeze(["case resolved", "refund approved", "staff fault confirmed"]),
  }),
  Object.freeze({
    id: "closed_loop_handoff",
    number: 5,
    label: "Closed-loop Handoff",
    primary_owner: "HYPE",
    henna_role: "observe_mms_handoff_state",
    authority: "kenji_conversation_matrix_plus_target_authority_ack",
    customer_routes: Object.freeze([]),
    current_mode: "aware_but_no_resolution_claim_without_ack",
    never_claim: Object.freeze(["human acknowledged", "review completed", "customer notified", "case resolved"]),
  }),
  Object.freeze({
    id: "hall_model_discovery",
    number: 6,
    label: "Model / Hall Discovery",
    primary_owner: "HYPE",
    henna_role: "bridge_non_mms_model_discovery_to_hype",
    authority: "member-pages-worker:hall_audience_plus_model_access",
    customer_routes: Object.freeze(["/hall"]),
    current_mode: "customer_selected_audience_only",
    never_claim: Object.freeze(["show all models", "gender inferred", "audience inferred", "model available"]),
  }),
  Object.freeze({
    id: "points_coupon_balance",
    number: 7,
    label: "Points + Coupon Inline Balance",
    primary_owner: "HYPE",
    henna_role: "bridge_to_hype_or_my_mmd",
    authority: "member-pages-worker:hype_member_wallet_projection_v1",
    customer_routes: Object.freeze(["/my-mmd/points", "/my-mmd/coupons"]),
    current_mode: "hype_private_bounded_points_and_coupon_read_henna_route_only",
    never_claim: Object.freeze(["points balance guessed", "coupon validity guessed", "points granted", "coupon activated", "coupon reissued"]),
  }),
]);

export function conciergeCapabilityById(id = "") {
  const key = String(id || "").trim().toLowerCase();
  return CONCIERGE_CAPABILITIES.find((item) => item.id === key) || null;
}

export function conciergeCapabilityPrompt(role = "shared") {
  const normalizedRole = String(role || "shared").trim().toLowerCase();
  const header = normalizedRole === "henna"
    ? "Shared MMD awareness for HENNA: HENNA owns MMS specialist work; non-MMS member/account work bridges to HYPE or MY MMD."
    : normalizedRole === "hype"
      ? "Shared MMD awareness for HYPE: HYPE owns cross-system concierge/routing; MMS specialist work bridges to HENNA/mms-worker."
      : "Shared MMD concierge awareness.";

  const lines = [header, `Capability pack: ${CONCIERGE_CAPABILITY_PACK_VERSION}`];
  for (const item of CONCIERGE_CAPABILITIES) {
    const roleText = normalizedRole === "henna"
      ? item.henna_role || (item.primary_owner === "HENNA" ? "owner" : "bridge")
      : normalizedRole === "hype"
        ? item.hype_role || (item.primary_owner === "HYPE" ? "owner" : "bridge")
        : item.primary_owner;
    lines.push(
      `${item.number}. ${item.label} | role=${roleText} | authority=${item.authority} | mode=${item.current_mode}`,
    );
  }
  lines.push("Never turn awareness into authority. If canonical live truth is missing, route/handoff instead of guessing.");
  return lines.join("\n");
}

export function detectSharedConciergeCapability(value = "") {
  const text = normalize(value);
  if (!text) return "";

  if (/(?:mmd\s*shop|shop order|ออเดอร์|ออร์เดอร์|คำสั่งซื้อ|ของที่สั่ง|gg\s*water)/i.test(text)) return "shop_orders";
  if (/(?:care\s*back|careback|แคร์\s*แบ็ก|birthday\s*wish|คำอวยพร|คูปอง.*(?:care|วันเกิด)|coupon.*(?:care|birthday))/i.test(text)) return "care_back_coupon";
  if (/(?:หา|แนะนำ|เลือก|ตัวเลือก).*(?:therapist|เทอราปิส|นักบำบัด|หมอนวด)|(?:therapist|เทอราปิส).*(?:ตัวเลือก|แนะนำ|คนไหนดี)/i.test(text)) return "mms_therapist_options";
  if (/(?:มีปัญหา|ร้องเรียน|complaint|ไม่มา|ยังไม่มา|มาสาย|ยอดไม่ตรง|บริการมีปัญหา|ขอคืนเงิน|refund|ไม่โอเคกับงาน)/i.test(text)) return "service_recovery";
  if (/(?:เรื่องที่ส่ง|เคสที่ส่ง|handoff|ส่งให้.*(?:เปอร์|kenji|เคนจิ|ทีม)).*(?:ถึงไหน|สถานะ|รับเรื่อง|ตอบ|แล้วหรือยัง)|(?:รับเรื่องแล้วไหม|ทีมเห็นหรือยัง)/i.test(text)) return "closed_loop_handoff";
  if (/(?:hall|เลือกมุมมอง|ดูนายแบบ|ดูโมเดล|ดู model|หา model|หาโมเดล|โปรไฟล์นายแบบ)/i.test(text)) return "hall_model_discovery";
  if (/(?:แต้ม|points?|coupon|คูปอง).*(?:เหลือ|ยอด|ใช้ได้|หมดอายุ|balance)|(?:ยอดแต้ม|แต้มคงเหลือ|คูปองของฉัน)/i.test(text)) return "points_coupon_balance";

  return "";
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
