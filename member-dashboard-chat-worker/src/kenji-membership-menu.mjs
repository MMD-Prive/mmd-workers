// Exact command "MMD Membership": a static link menu. No LLM, no truth read,
// no entitlement lookup, nothing about the sender's own membership is said.
const text = value => String(value ?? "").trim();
const PUBLIC_SIGNUP_URL = "https://mmdbkk.com/pay/membership?source=line";
const PRIVATE_SIGNUP_URL = "https://mmdbkk.com/sigil/member/membership?source=line&intent=signup";
const RENEWAL_URL = "https://mmdbkk.com/sigil/member/membership?source=line&intent=renew";

export function isMembershipMenuCommand(event = {}) {
  if (event.type !== "message" || event.source?.type !== "user" || event.message?.type !== "text") return false;
  const value = text(event.message.text).normalize("NFKC").replace(/[​﻿]/g, "").trim();
  return /^mmd\s*membership(?:\s*(?:ครับ|ค่ะ|คะ|นะ))?[.!?]*$/i.test(value);
}

export function renderMembershipMenu() {
  return {
    text: [
      "MMD Membership เลือกเริ่มได้ตามนี้ครับ",
      "",
      `• สมัคร Public Membership (Member / Elite / Red Card) → ${PUBLIC_SIGNUP_URL}`,
      `• สมัคร Standard / Premium (Private Membership) → ${PRIVATE_SIGNUP_URL}`,
      `• ต่ออายุสมาชิก → ${RENEWAL_URL}`,
      "",
      "สถานะสมาชิกและการชำระเงินจะยืนยันหลัง MMD ตรวจสอบข้อมูลทางการแล้วครับ",
    ].join("\n"),
    missing: [], intent: "membership_menu", reply_source: "membership_menu_v1", handoff_required: false,
  };
}
