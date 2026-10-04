const text = value => String(value ?? "").trim();
const MEMBERSHIP_LEVELS = new Set(["private_standard", "private_premium", "vip", "svip", "black_card", "public_member", "red_card", "guest_pass"]);
export function isPrivateInterestCommand(event = {}) {
  if (event.type !== "message" || event.source?.type !== "user" || event.message?.type !== "text") return false;
  return /^สนใจ(?:ครับ|ค่ะ|คะ)?[.!?]*$/.test(text(event.message.text).normalize("NFKC").replace(/[\u200B\uFEFF]/g, "").trim());
}
export function renderPrivateInterest(truth = {}) {
  const verified = truth.ok === true && truth.authority === "my_mmd_entitlement_resolver_v1" && truth.identity_status === "resolved";
  const existing = verified && (MEMBERSHIP_LEVELS.has(truth.membership?.level) || MEMBERSHIP_LEVELS.has(truth.former_private_membership?.level) || truth.membership?.member_blocked === true);
  const lines = [];
  if (existing) lines.push("บัญชีนี้มีข้อมูลหรือประวัติสมาชิกครับ พิมพ์ “เช็กสิทธิ์” เพื่อดูสถานะ วันหมดอายุ สิทธิ์และเงื่อนไขต่ออายุของบัญชีเดิมครับ");
  else {
    // Missing canonical rows are not proof of nonmembership: an owner-confirmed
    // OA account may await sync. Only general information is advertised here.
    lines.push("ข้อมูลแพ็กเกจ Private สำหรับการสมัครใหม่ครับ");
    const catalog = truth.private_signup_catalog || {};
    const rows = Array.isArray(catalog.packages) ? catalog.packages : [];
    const standard = rows.filter(row => row.code === "standard");
    const premium = rows.filter(row => row.code === "premium");
    const valid = catalog.authority === "canonical_private_signup_catalog_v1" && catalog.status === "verified" && standard.length === 1 && premium.length === 1 && rows.length === 2
      && [standard[0], premium[0]].every(row => Number.isSafeInteger(row.price_thb) && row.price_thb > 0 && row.price_thb <= 250000)
      && standard[0].base_years === 1 && premium[0].base_years === 2;
    if (valid) {
      lines.push(`Standard ${standard[0].price_thb.toLocaleString("th-TH")} บาท · อายุพื้นฐาน 1 ปี`);
      lines.push(`Premium ${premium[0].price_thb.toLocaleString("th-TH")} บาท · อายุรวม 2 ปี`);
      const policy = catalog.new_member_policy || {};
      if (policy.authority === "owner_approved_private_signup_20261004_v1" && policy.welcome_points === 66 && policy.premium_total_years === 2 && policy.eligibility_requires_review === true && policy.payment_requires_verification === true) {
        lines.push("โปรสำหรับผู้สมัครใหม่ที่ผ่านการตรวจบัญชีและชำระตามเงื่อนไข: Welcome Points 66 แต้มครับ สิทธิ์และแต้มจะยึดรายการที่ตรวจยืนยันแล้ว");
      } else lines.push("โปรโมชั่นสมาชิกใหม่ยังรอเปอร์ตรวจเงื่อนไขครับ");
    } else lines.push("ราคาและระยะสิทธิ์แพ็กเกจ Private ยังรอตรวจครับ");
    lines.push("ข้อมูลนี้เป็นข้อมูลทั่วไป ยังไม่ได้ยืนยันว่าบัญชีนี้เข้าเงื่อนไขสมาชิกใหม่ครับ หากเคยเป็นสมาชิก ให้พิมพ์ “เช็กสิทธิ์” เพื่อตรวจบัญชีเดิมก่อน");
    lines.push("เริ่มยืนยันบัญชี LINE เดิม: https://mmdbkk.com/member/liff?world=private&intent=signup");
    lines.push("ให้เปอร์ยืนยันแพ็กเกจ ยอด และสิทธิ์ก่อนโอนครับ");
  }
  return { text: lines.join("\n"), missing: [], intent: "private_signup_interest", reply_source: "private_signup_interest_v1", audience: existing ? "existing_member" : "unknown_general_information", handoff_required: false };
}
