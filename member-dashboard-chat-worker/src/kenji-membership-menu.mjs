// Exact command "MMD Membership": a static link menu. No LLM, no truth read,
// no entitlement lookup, nothing about the sender's own membership is said.
const text = value => String(value ?? "").trim();
// Links open the My MMD LIFF mini app so the customer stays inside LINE
// (signup / renew / status); payment opens in the same LIFF webview.
const LIFF_BASE = "https://miniapp.line.me/2010862595-yT4DCEMc/";
const liff = (intent, view) => `${LIFF_BASE}?intent=${intent}&view=${view}`;
export const MEMBERSHIP_MENU_LINKS = Object.freeze({
  signup: liff("signup", "signup"),
  renew: liff("renew", "profile"),
  status: liff("status", "profile"),
});

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
      `• สมัครสมาชิก (Public / Private) → ${MEMBERSHIP_MENU_LINKS.signup}`,
      `• ต่ออายุสมาชิก → ${MEMBERSHIP_MENU_LINKS.renew}`,
      `• เช็กสถานะสมาชิก → ${MEMBERSHIP_MENU_LINKS.status}`,
      "",
      "สถานะสมาชิกและการชำระเงินจะยืนยันหลัง MMD ตรวจสอบข้อมูลทางการแล้วครับ",
    ].join("\n"),
    missing: [], intent: "membership_menu", reply_source: "membership_menu_v1", handoff_required: false,
  };
}
