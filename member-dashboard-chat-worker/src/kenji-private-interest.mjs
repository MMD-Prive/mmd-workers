const text = value => String(value ?? "").trim();
const MEMBERSHIP_LEVELS = new Set(["private_standard", "private_premium", "vip", "svip", "black_card", "public_member", "red_card", "guest_pass"]);
export function isPrivateInterestCommand(event = {}) {
  if (event.type !== "message" || event.source?.type !== "user" || event.message?.type !== "text") return false;
  return /^สนใจ(?:ครับ|ค่ะ|คะ)?[.!?]*$/.test(text(event.message.text).normalize("NFKC").replace(/[\u200B\uFEFF]/g, "").trim());
}
export function renderPrivateInterest(truth = {}) {
  const verified = truth.ok === true && truth.authority === "my_mmd_entitlement_resolver_v1" && truth.identity_status === "resolved";
  // A valid catalog or an old OA note is not proof of this account's audience.
  const existing = verified && (MEMBERSHIP_LEVELS.has(truth.membership?.level) || MEMBERSHIP_LEVELS.has(truth.former_private_membership?.level) || truth.membership?.member_blocked === true);
  const body = existing
    ? "บัญชีนี้มีข้อมูลหรือประวัติสมาชิกครับ พิมพ์ “เช็กสิทธิ์” เพื่อดูสถานะ วันหมดอายุ สิทธิ์และเงื่อนไขต่ออายุของบัญชีเดิมครับ"
    : "ดูโปรไฟล์ที่เปิดให้ชมได้ที่ https://mmdbkk.com/profiles ครับ ถ้าต้องการตรวจสิทธิ์ของบัญชี ให้พิมพ์ MY STATUS ได้เลยครับ";
  return { text: body, missing: [], intent: "private_signup_interest", reply_source: "private_signup_interest_v1", audience: existing ? "existing_member" : "unknown_general_information", handoff_required: false };
}
