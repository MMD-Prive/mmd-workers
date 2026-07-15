(() => {
  "use strict";

  const root = document.getElementById("mmdKenjiKnowledgeV9");
  if (!root) return;

  const STORAGE_KEY = "mmd_kenji_knowledge_v9_cards";
  const BOARD_STATUS_ENDPOINT = "/v1/sigil/board/status";
  const BOARD_QUEUE_ENDPOINT = "/v1/sigil/board/queue";
  const SAFE_MODE_COPY = "Safe Mode พร้อมอ่าน แต่ยังไม่มีข้อมูลจาก Worker";

  const starterCards = [
    {
      id: "payment-proof-under-review-th",
      version: 1,
      status: "published",
      lane: "payment",
      audience: ["public", "member"],
      language: "th",
      title: "ลูกค้าส่งสลิปแล้วถามว่าจ่ายสำเร็จหรือยัง",
      questions: ["ส่งสลิปแล้ว จ่ายสำเร็จหรือยัง", "ช่วยเช็กยอดให้หน่อย"],
      safe_answer: "ผมรับทราบว่าคุณส่งหลักฐานแล้วครับ แต่ยังยืนยันสถานะชำระเงินจากข้อความเพียงอย่างเดียวไม่ได้ MMD จะตรวจผ่านระบบอย่างเป็นทางการก่อนเปลี่ยนสถานะครับ",
      allowed_actions: ["รับทราบว่าลูกค้าส่งหลักฐานแล้ว", "อธิบายว่าต้องรอการตรวจจากระบบ"],
      forbidden_actions: ["mark_paid", "verify_slip", "unlock_membership"],
      escalate_when: ["ยอดไม่ตรง", "ขอ refund", "มีข้อโต้แย้งเรื่องการชำระเงิน"],
      safe_routes: ["/sigil/pay"],
      owner: "Boss Per",
      final_reviewer: "Boss Per",
      change_reason: "ใช้ตอบคำถามเรื่องสลิปโดยไม่ยืนยันยอดแทนระบบ",
      updated_at: new Date().toISOString()
    },
    {
      id: "member-status-review-required-th",
      version: 1,
      status: "published",
      lane: "membership",
      audience: ["member"],
      language: "th",
      title: "สมาชิกถามว่าสถานะ active แล้วหรือยัง",
      questions: ["สมาชิก active หรือยัง", "เข้า Dashboard ได้หรือยัง"],
      safe_answer: "ผมยังยืนยันสถานะสมาชิกจากข้อความนี้ไม่ได้ครับ กรุณาเปิด Member Dashboard เพื่อตรวจสถานะที่ระบบอนุญาตให้แสดง หากยังขึ้นว่าต้องตรวจเพิ่มเติม MMD จะเป็นผู้ตรวจและแจ้งขั้นตอนต่อให้ครับ",
      allowed_actions: ["พาไปที่ Member Dashboard", "อธิบายว่าสถานะต้องมาจาก backend"],
      forbidden_actions: ["unlock_membership", "set_member_active", "grant_dashboard_access"],
      escalate_when: ["ตัวตนไม่ตรง", "บัญชีไม่ตรง", "ต้องเปิดสิทธิ์ด้วยมือ"],
      safe_routes: ["/member/dashboard"],
      owner: "Ewvon",
      final_reviewer: "Boss Per",
      change_reason: "ช่วยให้ Kenji ตอบเรื่องสถานะสมาชิกโดยไม่เดา",
      updated_at: new Date().toISOString()
    }
  ];

  const campaignTemplates = {
    current: {
      id: "current-client-six-months-extension-th",
      title: "Current Client +6 Months Extension",
      lane: "membership",
      audience: ["public_member", "member"],
      language: "th",
      questions: ["ลูกค้าเก่าได้ยืดเวลาไหม", "ได้เพิ่ม 6 เดือนไหม", "ตรวจสถานะสมาชิกได้ไหม"],
      safe_answer: "เบื้องต้นเคสนี้อาจอยู่ในกลุ่มลูกค้าปัจจุบันที่สามารถขอตรวจสถานภาพสมาชิกได้ครับ หาก MMD ตรวจสอบจากระบบแล้วพบว่ายังอยู่ในรอบสมาชิก อาจได้รับการยืดเวลาสมาชิกเพิ่ม 6 เดือนตามแคมเปญ Member Status Review 2026 ทั้งนี้สิทธิ์จะมีผลหลัง MMD ตรวจสอบเรียบร้อยแล้วเท่านั้นครับ",
      allowed_actions: ["แนะนำให้ขอตรวจสถานภาพ", "อธิบายว่า +6 เดือนต้องผ่าน MMD ตรวจสอบ", "ส่งไป route สมาชิกที่เกี่ยวข้อง"],
      forbidden_actions: ["ห้ามยืนยันว่า active แล้ว", "ห้ามบอกว่าได้รับ +6 เดือนแล้ว", "ห้ามเพิ่มวันสมาชิกเอง"],
      escalate_when: ["ลูกค้าถามสิทธิ์เฉพาะตัว", "ต้องตรวจวันที่หลังชื่อ", "ต้องยืนยันจากระบบ"],
      safe_routes: ["Telegram Preview", "/member/membership", "/member/dashboard"],
      owner: "Boss Per",
      final_reviewer: "Boss Per",
      change_reason: "Campaign card for current client extension review"
    },
    expired: {
      id: "expired-client-renewal-bonus-th",
      title: "Expired Client Renewal Bonus",
      lane: "renewal",
      audience: ["public_member", "member"],
      language: "