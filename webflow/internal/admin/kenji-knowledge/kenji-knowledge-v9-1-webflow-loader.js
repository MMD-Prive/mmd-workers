/* Kenji Knowledge V9.1 Webflow Loader. Injects HTML and gates read-only board reads. */
(function(){
  "use strict";
  var ROOT_ID="mmdKenjiKnowledgeV9";
  var STORAGE_KEY="mmd_kenji_knowledge_v9_cards";
  var STATUS_ENDPOINT="/v1/sigil/board/status";
  var QUEUE_ENDPOINT="/v1/sigil/board/queue";
  var ADMIN_AUTH_ENDPOINT="/v1/admin/auth/me";
  var SAFE_MODE_COPY="Safe Mode พร้อมอ่าน แต่ยังไม่โหลด Board จนกว่าจะผ่านการตรวจสิทธิ์";
  var img={
    hero:"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56f9510d5f16d76cae7435_Kenji%20Know01.webp",
    campaign:"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56f951f9c3e0c7ffe9465c_Kenji%20Know02.webp",
    safety:"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56f95105a7994eb5995e87_Kenji%20Know04.webp",
    runtime:"https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56fb9a0acae936c0c362e5_Kenji%20Know05.webp"
  };
  var starterCards=[
    {id:"payment-proof-under-review-th",status:"published",lane:"payment",audience:"member",language:"th",title:"ลูกค้าส่งสลิปแล้วถามว่าจ่ายสำเร็จหรือยัง",safe_answer:"ผมรับทราบว่าคุณส่งหลักฐานแล้วครับ แต่ยังยืนยันสถานะชำระเงินจากข้อความเพียงอย่างเดียวไม่ได้ MMD จะตรวจผ่านระบบอย่างเป็นทางการก่อนเปลี่ยนสถานะครับ",forbidden_actions:"mark_paid, verify_slip, unlock_membership",routes:"/sigil/pay"},
    {id:"member-status-review-required-th",status:"published",lane:"membership",audience:"member",language:"th",title:"สมาชิกถามว่าสถานะ active แล้วหรือยัง",safe_answer:"ผมช่วยแนะนำขั้นตอนตรวจสถานะได้ครับ แต่ยังไม่สามารถยืนยัน active หรือ unlock สิทธิ์แทนระบบได้ ต้องให้ MMD ตรวจสอบจากข้อมูลจริงก่อนเสมอครับ",forbidden_actions:"unlock_membership, confirm_vip, confirm_blackcard",routes:"/member/dashboard, /member/membership"}
  ];
  var campaignTemplates=[
    {id:"current-client-six-months",title:"Current Client +6 Months Extension",lane:"membership",safe_answer:"เบื้องต้นเคสนี้อาจอยู่ในกลุ่มลูกค้าปัจจุบันที่สามารถขอตรวจสถานภาพสมาชิกได้ครับ หาก MMD ตรวจสอบจากระบบแล้วพบว่ายังอยู่ในรอบสมาชิก อาจได้รับการยืดเวลาสมาชิกเพิ่ม 6 เดือนตามแคมเปญ Member Status Review 2026 ทั้งนี้สิทธิ์จะมีผลหลัง MMD ตรวจสอบเรียบร้อยแล้วเท่านั้นครับ"},
    {id:"expired-client-renewal",title:"Expired Client Renewal Bonus",lane:"renewal",safe_answer:"ถ้าเคยเป็นลูกค้า MMD แต่ข้อมูลล่าสุดเกินรอบสมาชิกแล้ว เคสนี้อาจอยู่ในกลุ่มต่ออายุครับ MMD สามารถตรวจสถานภาพและแนะนำโปร Renewal เพื่อกลับมา active พร้อมรับ Points และ bonus extension ตามเงื่อนไขแคมเปญได้ ทั้งนี้ต้องให้ MMD ตรวจสอบจากระบบและยืนยันก่อนเสมอครับ"},
    {id:"new-member-welcome-points",title:"New Member Welcome Points",lane:"membership",safe_answer:"ตอนนี้ผมยังไม่พบสถานะสมาชิกเดิมที่ยืนยันได้จากระบบครับ หากต้องการเริ่มต้นกับ MMD สามารถสมัครสมาชิกใหม่ผ่าน Telegram Preview และรับ Welcome Points ตามเงื่อนไขแคมเปญได้ครับ สิทธิ์และแต้มจะมีผลหลัง MMD ตรวจสอบและยืนยันจากระบบเรียบร้อยแล้วเท่านั้นครับ"},
    {id:"unknown-status-review",title:"Unknown Status Review Guidance",lane:"support",safe_answer:"เคสนี้ควรให้ MMD ตรวจสอบสถานภาพจากข้อมูลจริงก่อนนะครับ ตอนนี้ผมยังไม่สามารถยืนยันได้ว่าเป็นสมาชิกปัจจุบัน หมดอายุ หรือเป็นลูกค้าใหม่ หากคุณส่งข้อมูลติดต่อที่เคยใช้ไว้ MMD จะช่วยตรวจสอบและแนะนำขั้นตอนที่เหมาะสมให้ครับ"},