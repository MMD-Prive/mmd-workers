// Shared customer copy for Kenji and HYPE. This module sends no messages.
export const MEMBERSHIP_WELCOME_COPY = Object.freeze({
  publicUnavailable: "ตอนนี้ยังไม่เปิดขายแพ็กเกจ Public ครับ สอบถามข้อมูลเพิ่มเติมกับ Per ได้ในแชตนี้ครับ",
  welcome: "สวัสดีครับ ยินดีต้อนรับสู่ MMD Privé ครับ 😊 Per ช่วยแนะนำข้อมูลสมาชิกและขั้นตอนการใช้บริการให้ได้ครับ สนใจดู Membership Package หรือมีบริการที่อยากสอบถามอยู่แล้วครับ?",
  package: "สนใจ Membership Package ได้เลยครับ 😊 ครั้งนี้ต้องการสมัครสมาชิกใหม่ ต่ออายุสมาชิกเดิม หรือขอรายละเอียดก่อนครับ?",
  signup: "ยินดีครับ 😊 อยากทราบเรื่องไหนก่อนครับ — ราคาแพ็กเกจ สิทธิประโยชน์ หรือขั้นตอนสมัคร? พิมพ์เรื่องที่สนใจมาได้เลยครับ",
  details: "ราคา ระยะเวลา และสิทธิประโยชน์ต้องอ้างอิงแพ็กเกจที่ยืนยันแล้วครับ ต้องการสอบถามเรื่องไหน หรือให้ Per ช่วยดูรายละเอียดครับ?",
});

export function classifyMembershipWelcomeIntent(input) {
  const text = String(input ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (/\bpublic\b|พับลิก|พับลิค/.test(text)) return "public_package_unavailable";
  const membership = /\bmembership\b|แพ็กเกจสมาชิก|แพคเกจสมาชิก|สมัครสมาชิก|สมัครใหม่|สมาชิกใหม่/.test(text);
  // Preserve renewal/status handling in the existing concierge.
  if (/ต่ออายุ|หมดอายุ|สถานะ|\b(?:renew|renewal|status)\b/.test(text)) return "";
  if (!membership) return "";
  if (/ราคา|เท่าไร|เท่าไหร่|กี่บาท|สิทธิ|รายละเอียด|ระยะเวลา|\b(?:price|pricing|cost|benefits|details)\b/.test(text)) return "membership_details";
  if (/สมัคร|สมาชิกใหม่|\b(?:sign\s*up|new\s+member)\b/.test(text)) return "membership_signup";
  return "membership_package";
}
