export function validateTransition(from, to) {
  const transitions = {
    created: ["identity_verified", "manual_review", "rejected"],
    identity_verified: ["matched", "manual_review", "rejected"],
    matched: ["payment_pending", "benefit_approved", "manual_review", "rejected"],
    payment_pending: ["benefit_approved", "manual_review", "rejected"],
    manual_review: ["payment_pending", "benefit_approved", "rejected"],
    benefit_approved: ["applying", "rejected"],
    applying: ["benefit_applied", "apply_partially_failed"],
    apply_partially_failed: ["applying", "rejected"],
    benefit_applied: [], rejected: [],
  };
  return Boolean(transitions[from]?.includes(to));
}

export function buildAuditEvent(input = {}, now = new Date()) {
  const required = ["requestId", "actorId", "adminSessionId", "eventType", "claimId", "campaignId"];
  for (const key of required) if (!String(input[key] || "").trim()) throw new Error(`audit_${key}_required`);
  return { requestId: input.requestId, actorId: input.actorId, adminSessionId: input.adminSessionId,
    eventType: input.eventType, claimId: input.claimId, campaignId: input.campaignId,
    before: input.before ?? null, after: input.after ?? null, reason: String(input.reason || ""),
    idempotencyKey: String(input.idempotencyKey || ""), timestamp: now.toISOString() };
}

export function customerSafeResult(claim) {
  const base = { claimReference: claim.claimId, status: customerStatus(claim.claimStatus), completedAt: claim.appliedAt || null };
  if (claim.claimStatus !== "benefit_applied") return base;
  return { ...base, monthsAdded: Number(claim.approvedMonths || 0), pointsAdded: Number(claim.pointsAward || 0),
    newMembershipExpiry: claim.newMembershipExpiry || null };
}

export function customerSafeDashboardResult(claim, now = new Date()) {
  if (!claim) return campaignResult("not_started", {
    title:"สิทธิ์ CARE BACK ของคุณ",
    message:"ตรวจสอบสิทธิ์ส่วนตัวสำหรับแคมเปญครบรอบ 6 ปีของ MMD Privé",
    action:{ type:"link",label:"ตรวจสอบสิทธิ์",href:"/promotion/6-years-care-back" },
  });

  const status = dashboardStatus(claim);
  const updatedAt = safeIso(claim.updatedAt || claim.createdAt, now);
  if (status === "completed") {
    const benefits = [];
    if (Number(claim.approvedMonths) > 0) benefits.push(`เพิ่มอายุสมาชิก ${Number(claim.approvedMonths)} เดือน`);
    if (Number(claim.pointsAward) > 0) benefits.push(`เพิ่ม ${Number(claim.pointsAward).toLocaleString("th-TH")} Points`);
    return campaignResult(status, {
      title:"CARE BACK เรียบร้อยแล้ว",
      message:"สิทธิ์ของคุณได้รับการดำเนินการเรียบร้อยแล้วครับ ขอบคุณที่เคยอยู่กับ MMD Privé",
      benefit_summary:benefits.join(" · ") || null,
      effective_until:safeDate(claim.newMembershipExpiry),
      updated_at:updatedAt,
    });
  }
  if (status === "approved") return campaignResult(status, {
    title:"ยืนยันสิทธิ์แล้ว",
    message:"สิทธิ์ CARE BACK ของคุณพร้อมดำเนินการแล้วครับ",
    benefit_summary:approvedBenefitSummary(claim),
    updated_at:updatedAt,
  });
  if (status === "payment_required") return campaignResult(status, {
    title:"ยืนยันข้อมูลแล้ว · รอดำเนินการต่อ",
    message:"กรุณาดำเนินการตามขั้นตอนที่แสดงไว้เพื่อรับ CARE BACK",
    action:{ type:"link",label:"ดำเนินการต่อ",href:"/confirm/payment-confirmation" },
    updated_at:updatedAt,
  });
  if (status === "payment_verifying") return campaignResult(status, {
    title:"กำลังตรวจสอบการชำระ",
    message:"ระบบได้รับข้อมูลแล้วครับ HYPE จะแจ้งผลหลังจากตรวจสอบเรียบร้อย",
    updated_at:updatedAt,
  });
  if (status === "unavailable") return campaignResult(status, {
    title:"ยังไม่พบสิทธิ์ที่ดำเนินการได้",
    message:"สิทธิ์ CARE BACK เป็นสิทธิ์เฉพาะบุคคลและขึ้นอยู่กับการตรวจสอบข้อมูล หากต้องการให้ช่วยตรวจเพิ่มเติม สามารถติดต่อ HYPE ได้ครับ",
    action:{ type:"link",label:"ติดต่อ HYPE",href:"https://lin.ee/xRqsALs" },
    updated_at:updatedAt,
  });
  if (status === "temporarily_unavailable") return campaignResult(status, {
    title:"ยังแสดงสถานะไม่ได้ในขณะนี้",
    message:"ข้อมูลของคุณยังปลอดภัยครับ กรุณาลองใหม่อีกครั้ง หรือติดต่อ HYPE หากต้องการความช่วยเหลือ",
    action:{ type:"retry",label:"ลองอีกครั้ง",href:null },
    updated_at:updatedAt,
  });
  return campaignResult("under_review", {
    title:"กำลังตรวจสอบข้อมูล",
    message:"HYPE กำลังตรวจสอบสิทธิ์ของคุณอยู่ครับ หากข้อมูลครบแล้ว ระบบจะแจ้งผลที่นี่",
    updated_at:updatedAt,
  });
}

function dashboardStatus(claim) {
  if (claim.claimStatus === "benefit_applied") return "completed";
  if (claim.claimStatus === "rejected") return "unavailable";
  if (claim.claimStatus === "apply_partially_failed") return "temporarily_unavailable";
  if (claim.claimStatus === "benefit_approved" || claim.claimStatus === "applying") return "approved";
  if (claim.claimStatus === "payment_pending") return claim.paymentReference ? "payment_verifying" : "payment_required";
  return "under_review";
}
function campaignResult(status, values = {}) { return { id:"mmd_6th_anniversary_2026",label:"6 YEARS · CARE BACK",status,
  title:values.title || null,message:values.message || null,benefit_summary:values.benefit_summary || null,
  effective_until:values.effective_until || null,action:values.action || { type:"none",label:null,href:null },updated_at:values.updated_at || null }; }
function approvedBenefitSummary(claim) { const values=[]; if (Number(claim.approvedMonths)>0) values.push(`อายุสมาชิก ${Number(claim.approvedMonths)} เดือน`);
  if (Number(claim.pointsAward)>0) values.push(`${Number(claim.pointsAward).toLocaleString("th-TH")} Points`); return values.join(" · ") || null; }
function safeDate(value) { const text=String(value || "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null; }
function safeIso(value, fallback) { const date=new Date(value || fallback); return Number.isNaN(date.getTime()) ? null : date.toISOString(); }

function customerStatus(status) {
  return ({ created: "checking", identity_verified: "checking", matched: "additional_review",
    payment_pending: "payment_required", manual_review: "additional_review", benefit_approved: "approved_awaiting_processing",
    applying: "approved_awaiting_processing", apply_partially_failed: "support_required", benefit_applied: "completed",
    rejected: "support_required" })[status] || "checking";
}
