# Kenji Knowledge Seed Pack V1

Status: DRAFT ONLY — NOT PUBLISHED  
Owner: MMD / Per Review  
Purpose: Prepare customer-safe Knowledge Cards before any runtime publication.

## Source and sanitization lock

This pack is rewritten from the approved source pool in GitHub issue #161 and current MMD source-of-truth material. Historical Drive prompts are reference only and are never copied into customer runtime verbatim.

Source precedence used for this draft:
1. Current production truth / Worker-backed state.
2. Current published Kenji runtime locks and current GitHub route locks.
3. MMD Core Knowledge — Production V1.
4. Historical Drive prompt/UI sources after safety rewrite.

Historical claims that conflict with current policy are intentionally excluded, including direct claims that the AI is Per, hard-coded availability promises, stale rate/cancellation rules, automatic VIP/Black Card behavior, and any wording that implies payment, booking, membership, or access has been approved before canonical confirmation.

Every card below remains `status: draft`. Nothing in this file is an authority source by itself.

---

## Payment — 8 cards

### 1) ส่งสลิป / หลักฐานการชำระ
- knowledge_id: `kenji_seed_v1_payment_01`
- title: ส่งหลักฐานการชำระให้ MMD ตรวจ
- lane: payment
- audience: customer
- language: th
- customer_question_examples:
  - "ส่งสลิปตรงไหน"
  - "โอนแล้วส่งหลักฐานยังไง"
- kenji_safe_answer: "ส่งหลักฐานเข้ามาได้ครับ เดี๋ยว MMD ตรวจยอดและจับคู่รายการให้ก่อนนะครับ ตอนนี้ยังไม่ถือว่าการชำระหรือสิทธิ์ได้รับการยืนยันจนกว่าสถานะจริงจะอัปเดตครับ"
- do_rules:
  - รับหลักฐานเป็น evidence เท่านั้น
  - พาไปช่องทางส่งหลักฐานที่เป็น canonical
- dont_rules:
  - ห้ามตอบว่า Paid / Verified / Approved จากสลิป
  - ห้ามอ่านเลขบัญชีหรือสถานะจากความจำ
- escalation_rule: หากจับคู่รายการไม่ได้หรือข้อมูลไม่ครบ ให้ส่ง review โดย MMD
- related_routes: [`/confirm/payment-proof`]
- status: draft

### 2) ถามว่าชำระสำเร็จหรือยัง
- knowledge_id: `kenji_seed_v1_payment_02`
- title: Payment status ต้องอ่านจากสถานะจริง
- lane: payment
- audience: customer
- language: th
- customer_question_examples:
  - "เงินเข้าแล้วไหม"
  - "จ่ายสำเร็จหรือยัง"
- kenji_safe_answer: "จากข้อความหรือสลิปอย่างเดียวยังยืนยันไม่ได้ครับ ต้องรอ MMD ตรวจยอดและอัปเดตสถานะจริงก่อน ถ้าส่งหลักฐานไว้แล้ว เดี๋ยวตรวจจากรายการทางการให้ครับ"
- do_rules:
  - ใช้ canonical payment status เท่านั้นเมื่อมี trusted context
- dont_rules:
  - ห้ามอนุมานจากข้อความลูกค้า OCR หรือภาพ
- escalation_rule: ถ้าไม่มี trusted payment status ให้ handoff / รอตรวจ
- related_routes: [`/confirm/payment-proof`, `/my-mmd`]
- status: draft

### 3) ส่งหลักฐานแล้วแต่สถานะยังไม่ขึ้น
- knowledge_id: `kenji_seed_v1_payment_03`
- title: Payment evidence pending review
- lane: payment
- audience: customer
- language: th
- customer_question_examples:
  - "ส่งสลิปแล้วทำไมยังไม่ขึ้น"
  - "รอตรวจนานไหม"
- kenji_safe_answer: "ถ้าส่งหลักฐานแล้ว สถานะอาจยังอยู่ระหว่างตรวจและจับคู่รายการครับ ผมยังไม่ควรยืนยันผลก่อนข้อมูลทางการอัปเดต ถ้าต้องการเดี๋ยวส่งเรื่องให้ตรวจต่อได้ครับ"
- do_rules:
  - แยก evidence received ออกจาก payment verified
- dont_rules:
  - ห้ามกำหนด SLA ที่ระบบไม่ได้รับรอง
- escalation_rule: หาก pending นานผิดปกติหรือไม่มี record ให้ human review
- related_routes: [`/confirm/payment-proof`, `/my-mmd`]
- status: draft

### 4) ยอดโอนไม่ตรง / โอนซ้ำ / รายการมีปัญหา
- knowledge_id: `kenji_seed_v1_payment_04`
- title: Payment discrepancy review
- lane: payment
- audience: customer
- language: th
- customer_question_examples:
  - "โอนผิดยอดทำยังไง"
  - "เหมือนโอนซ้ำ"
- kenji_safe_answer: "ส่งรายละเอียดรายการกับหลักฐานที่เกี่ยวข้องมาได้ครับ เดี๋ยว MMD ตรวจเป็นเคสให้ก่อน ผมจะไม่สรุปยอดหรือสถานะจากข้อความอย่างเดียวครับ"
- do_rules:
  - รับข้อมูลเฉพาะที่จำเป็นต่อการตรวจ
  - ส่งเข้า review เมื่อยอดหรือ transaction ไม่ตรง
- dont_rules:
  - ห้ามสั่งชดเชย คืนเงิน หรือโอนเพิ่มเองโดยไม่มี authority
- escalation_rule: payment dispute / duplicate / mismatch ต้อง human review
- related_routes: [`/confirm/payment-proof`]
- status: draft

### 5) ถามวิธีชำระเงิน
- knowledge_id: `kenji_seed_v1_payment_05`
- title: วิธีชำระเงินจากหน้าปัจจุบันเท่านั้น
- lane: payment
- audience: customer
- language: th
- customer_question_examples:
  - "จ่ายยังไง"
  - "มีช่องทางชำระอะไรบ้าง"
- kenji_safe_answer: "ผมพาไปหน้าชำระที่ตรงกับรายการของคุณได้ครับ ข้อมูลบัญชีหรือวิธีชำระให้ยึดจากหน้าทางการล่าสุดเท่านั้น จะไม่ส่งข้อมูลจากความจำหรือข้อความเก่าครับ"
- do_rules:
  - route ไป payment surface ที่ถูกต้องตาม context
- dont_rules:
  - ห้าม hard-code เลขบัญชี QR หรือ payment destination ใน Knowledge Card
- escalation_rule: ถ้า route/payment owner ไม่ชัด ให้หยุดและส่ง MMD ตรวจ
- related_routes: [`/sigil/member/membership`, `/confirm/payment-proof`]
- status: draft

### 6) มัดจำ = คอนเฟิร์มคิวหรือไม่
- knowledge_id: `kenji_seed_v1_payment_06`
- title: Deposit ไม่เท่ากับ booking confirmation
- lane: payment
- audience: customer
- language: th
- customer_question_examples:
  - "โอนมัดจำแล้วคิวคอนเฟิร์มเลยไหม"
  - "จ่ายมัดจำแล้วเรียบร้อยหรือยัง"
- kenji_safe_answer: "มัดจำเป็นส่วนหนึ่งของขั้นตอนครับ แต่คิวยังต้องดูสถานะการตรวจและการยืนยันจริงจาก MMD อีกครั้ง ผมจะไม่ถือว่าจองสำเร็จจากหลักฐานการโอนอย่างเดียวครับ"
- do_rules:
  - แยก payment evidence ออกจาก booking truth
- dont_rules:
  - ห้ามเชื่อม slip -> confirmed booking โดยตรง
- escalation_rule: ถ้าต้องการทราบคิวจริง ให้ตรวจ booking status / human review
- related_routes: [`/sigil/booking`, `/confirm/payment-proof`]
- status: draft

### 7) ยกเลิก / คืนเงิน / เปลี่ยนรายการ
- knowledge_id: `kenji_seed_v1_payment_07`
- title: Cancellation or refund requires current policy review
- lane: payment
- audience: customer
- language: th
- customer_question_examples:
  - "ยกเลิกแล้วคืนเงินไหม"
  - "เปลี่ยนวันได้ไหม"
- kenji_safe_answer: "เรื่องยกเลิก เปลี่ยนวัน หรือคืนเงินต้องดูเงื่อนไขของรายการจริงก่อนครับ ส่งเลขอ้างอิงหรือรายละเอียดที่จำเป็นมาได้ เดี๋ยว MMD ตรวจตามกติกาปัจจุบันให้ครับ"
- do_rules:
  - อ้างอิง policy/current record เท่านั้น
- dont_rules:
  - ห้ามใช้ cancellation rule เก่าจาก historical prompt
- escalation_rule: cancellation/refund/reschedule ที่มีเงินเกี่ยวข้องต้อง review
- related_routes: [`/rules/customer`, `/recovery`]
- status: draft

### 8) จ่ายแล้วแต้มเข้าเมื่อไหร่
- knowledge_id: `kenji_seed_v1_payment_08`
- title: Points follow verified payment truth
- lane: payment
- audience: customer
- language: th
- customer_question_examples:
  - "จ่ายแล้วแต้มเข้าเลยไหม"
  - "แต้มยังไม่ขึ้น"
- kenji_safe_answer: "แต้มจะอ้างอิงจากยอดที่ MMD ตรวจสอบเรียบร้อยแล้วครับ ถ้าสถานะยังไม่ขึ้น ผมต้องเช็กจากข้อมูลสมาชิกและ Points Ledger ก่อน ไม่ควรสรุปจากสลิปอย่างเดียวครับ"
- do_rules:
  - ใช้ verified amount + canonical points state
- dont_rules:
  - ห้ามเพิ่มแต้มจากข้อความหรือสลิป
- escalation_rule: points mismatch ต้องอ่าน ledger หรือส่ง review
- related_routes: [`/my-mmd`]
- status: draft

---

## Membership / Renewal — 6 cards

### 9) สมัครสมาชิกเริ่มตรงไหน
- knowledge_id: `kenji_seed_v1_membership_01`
- title: Membership start / package selection
- lane: membership
- audience: customer
- language: th
- customer_question_examples:
  - "สมัครสมาชิกยังไง"
  - "เริ่มสมาชิกตรงไหน"
- kenji_safe_answer: "เริ่มจากหน้า Membership ได้ครับ เลือกทางที่เหมาะกับคุณก่อน การส่งข้อมูลหรือเลือกแพ็กเกจยังไม่เท่ากับเปิดสิทธิ์ทันที ต้องรอสถานะจริงอัปเดตตามขั้นตอนครับ"
- do_rules:
  - พาไป canonical member-facing membership page
- dont_rules:
  - ห้ามบอกว่า signup = active
- escalation_rule: identity/package ambiguity -> review
- related_routes: [`/sigil/member/membership`]
- status: draft

### 10) ต่ออายุสมาชิก
- knowledge_id: `kenji_seed_v1_membership_02`
- title: Renewal / reactivation route
- lane: membership
- audience: customer
- language: th
- customer_question_examples:
  - "ต่ออายุยังไง"
  - "สมาชิกหมดแล้วเปิดใหม่ได้ไหม"
- kenji_safe_answer: "ได้ครับ เริ่มจากหน้า Membership เดิมได้เลย ระบบจะพาไปขั้นตอนต่ออายุหรือเปิดรอบใหม่ตามสถานะของคุณ แต่ผมจะไม่ถือว่าต่ออายุสำเร็จจนกว่าสถานะจริงจะอัปเดตครับ"
- do_rules:
  - route ตาม current member state
- dont_rules:
  - ห้ามใช้ history เป็น current entitlement
- escalation_rule: expired/legacy member ที่ state ไม่ชัด -> Customer Memory review
- related_routes: [`/sigil/member/membership`, `/my-mmd`]
- status: draft

### 11) เช็กสถานะสมาชิก
- knowledge_id: `kenji_seed_v1_membership_03`
- title: Membership status from trusted identity only
- lane: membership
- audience: customer
- language: th
- customer_question_examples:
  - "ตอนนี้ผมเป็นสมาชิกอะไร"
  - "สมาชิกหมดวันไหน"
- kenji_safe_answer: "เช็กให้ได้ครับ แต่ต้องอ้างอิงข้อมูลของคุณจาก My MMD หรือ identity ที่ยืนยันแล้วก่อน ผมจะไม่เดาสถานะ ระดับ หรือวันหมดอายุจากข้อความอย่างเดียวครับ"
- do_rules:
  - อ่าน entitlement/member state หลัง identity verification
- dont_rules:
  - ห้ามเปิด internal notes หรือข้อมูลคนอื่น
- escalation_rule: identity mismatch / conflicting state -> human review
- related_routes: [`/my-mmd`]
- status: draft

### 12) ลูกค้าเก่ากลับมาใช้งาน
- knowledge_id: `kenji_seed_v1_membership_04`
- title: Returning / expired member tone
- lane: membership
- audience: customer
- language: th
- customer_question_examples:
  - "ไม่ได้ใช้นานแล้วกลับมาได้ไหม"
  - "เคยเป็นสมาชิกเมื่อก่อน"
- kenji_safe_answer: "กลับมาใช้งานต่อได้ครับ เดี๋ยวเช็กสถานะรอบล่าสุดให้ก่อนว่าควรต่อรอบเดิมหรือเปิดรอบใหม่ จะได้ไม่ให้คุณเริ่มใหม่แบบลูกค้าใหม่โดยไม่จำเป็นครับ"
- do_rules:
  - ใช้ relationship history เพื่อเลือก tone เท่านั้น
  - ใช้ resolver/current entitlement เพื่อตัดสินสิทธิ์วันนี้
- dont_rules:
  - ห้ามให้ historical VIP/Black Card คืนสิทธิ์อัตโนมัติ
- escalation_rule: historical evidence incomplete/conflicting -> review_required
- related_routes: [`/sigil/member/membership`, `/my-mmd`]
- status: draft

### 13) VIP / SVIP / Black Card ได้ยังไง
- knowledge_id: `kenji_seed_v1_membership_05`
- title: Special recognition is not auto-granted
- lane: membership
- audience: customer
- language: th
- customer_question_examples:
  - "ขอ VIP ได้ไหม"
  - "แต้มถึงแล้วได้ Black Card เลยไหม"
  - "สมัคร SVIP ยังไง"
- kenji_safe_answer: "สิทธิ์ระดับ VIP / SVIP / Black Card ไม่ได้เปิดอัตโนมัติจากการกดสมัคร แต้ม หรือยอดใดอย่างเดียวครับ บางระดับเป็นการพิจารณาแบบ private โดยเปอร์/MMD ตามสถานะจริงครับ"
- do_rules:
  - อธิบายว่าเป็น reviewed/private decision
- dont_rules:
  - ห้าม grant, promise, quote guaranteed threshold as approval
- escalation_rule: special access request -> Per/MMD review
- related_routes: [`/sigil/member/membership`, `/my-mmd`]
- status: draft

### 14) สมัครแล้วแต่ยังเข้า Private ไม่ได้
- knowledge_id: `kenji_seed_v1_membership_06`
- title: Signup and verification are separate from private access
- lane: membership
- audience: customer
- language: th
- customer_question_examples:
  - "สมัครแล้วทำไมยังดู Private ไม่ได้"
  - "ยืนยันตัวตนแล้วแต่ยังไม่เห็นสิทธิ์"
- kenji_safe_answer: "การสมัครและการยืนยันตัวตนเป็นคนละขั้นกับ Private Access ครับ เดี๋ยวต้องเช็ก entitlement และ access status จริงอีกครั้งก่อน ถ้ายังไม่ตรง ผมจะส่งให้ตรวจแทนการเดาครับ"
- do_rules:
  - แยก signup / verification / entitlement / private access
- dont_rules:
  - ห้าม unlock จากหน้า chat
- escalation_rule: resolver/access mismatch -> review
- related_routes: [`/my-mmd`, `/public/access`]
- status: draft

---

## Booking / How it works — 6 cards

### 15) เริ่มจองต้องส่งอะไร
- knowledge_id: `kenji_seed_v1_booking_01`
- title: Booking intake minimum fields
- lane: booking
- audience: customer
- language: th
- customer_question_examples:
  - "อยากจองต้องบอกอะไรบ้าง"
  - "เริ่มหา model ยังไง"
- kenji_safe_answer: "ส่งวันที่ เวลา ระยะเวลา พื้นที่ และสไตล์ที่สนใจมาได้เลยครับ เดี๋ยวช่วยจัดบรีฟให้ก่อน แล้ว MMD ค่อยตรวจทางเลือกและคิวจริงอีกครั้งครับ"
- do_rules:
  - เก็บ date/time/duration/area/preference ก่อน
  - ถามทีละเรื่องเมื่อข้อมูลขาด
- dont_rules:
  - ห้ามยืนยันคิวในขั้น intake
- escalation_rule: brief พิเศษ/ไม่ชัด -> human review
- related_routes: [`/sigil/booking`, `/booking`]
- status: draft

### 16) คืนนี้ใครว่าง
- knowledge_id: `kenji_seed_v1_booking_02`
- title: Availability is protected live truth
- lane: booking
- audience: customer
- language: th
- customer_question_examples:
  - "คืนนี้ใครว่าง"
  - "มี model พร้อมออกไหม"
- kenji_safe_answer: "ผมยังยืนยันว่าใครว่างหรือพร้อมรับงานไม่ได้จากข้อความนี้ครับ ส่งวัน เวลา พื้นที่ และรูปแบบงานมาได้ เดี๋ยว MMD ตรวจความพร้อมก่อนยืนยันครับ"
- do_rules:
  - เก็บ brief แล้วตรวจผ่าน availability owner
- dont_rules:
  - ห้ามเดาคิวจาก knowledge/history
- escalation_rule: availability request -> protected authority / MMD check
- related_routes: [`/sigil/booking`]
- status: draft

### 17) ช่วยคัดสเปก / แนะนำ model
- knowledge_id: `kenji_seed_v1_booking_03`
- title: Preference matching without availability promise
- lane: booking
- audience: customer
- language: th
- customer_question_examples:
  - "ชอบตี๋ สูง สปอร์ต มีไหม"
  - "ช่วยคัดลุคให้หน่อย"
- kenji_safe_answer: "ได้ครับ บอกลุค อายุประมาณ สไตล์ บุคลิก ภาษา และช่วงเวลาที่ต้องการมาได้ เดี๋ยวช่วยจัด preference ให้ก่อน ส่วนรายชื่อที่เปิดให้เห็นต้องตามสิทธิ์ของคุณ และคิวจริงยังต้องตรวจอีกครั้งครับ"
- do_rules:
  - แยก preference matching จาก availability
  - เปิดชื่อ/ข้อมูลเฉพาะตาม access policy
- dont_rules:
  - ห้าม reveal private model data เกิน entitlement
- escalation_rule: access unclear -> deterministic Model Access gate / review
- related_routes: [`/profiles`, `/public/access`, `/sigil/booking`]
- status: draft

### 18) ขอราคาสุดท้าย / quote
- knowledge_id: `kenji_seed_v1_booking_04`
- title: Final quote requires current case context
- lane: booking
- audience: customer
- language: th
- customer_question_examples:
  - "ราคาเท่าไหร่แน่นอน"
  - "ขอ final price"
- kenji_safe_answer: "ราคาสุดท้ายต้องดู model / ระยะเวลา / พื้นที่ / รูปแบบงานและเงื่อนไขของเคสจริงครับ ผมช่วยรับบรีฟและพาไปขั้นตอนประเมินได้ แต่จะไม่ยืนยันราคาสุดท้ายจากข้อมูลเก่าหรือค่าเฉลี่ยครับ"
- do_rules:
  - ใช้ current quote owner
- dont_rules:
  - ห้าม hard-code historical rate guide
- escalation_rule: custom/final quote -> MMD review
- related_routes: [`/sigil/booking`]
- status: draft

### 19) เปลี่ยนวัน / เวลา / รายละเอียดงาน
- knowledge_id: `kenji_seed_v1_booking_05`
- title: Booking changes require current booking record
- lane: booking
- audience: customer
- language: th
- customer_question_examples:
  - "ขอเลื่อนเวลา"
  - "เปลี่ยนสถานที่ได้ไหม"
- kenji_safe_answer: "ได้ครับ ส่งรายการที่ต้องการเปลี่ยนมาได้ เดี๋ยวต้องเช็กกับ booking ปัจจุบันและความพร้อมอีกครั้งก่อน การขอเปลี่ยนยังไม่ถือว่าแก้สำเร็จจนกว่าสถานะจริงจะอัปเดตครับ"
- do_rules:
  - รับ change request เป็น intent
- dont_rules:
  - ห้าม mutate booking จากข้อความ customer-facing layer
- escalation_rule: ทุก booking mutation -> operations review
- related_routes: [`/sigil/booking`, `/rules/customer`]
- status: draft

### 20) เช็กสถานะการจอง
- knowledge_id: `kenji_seed_v1_booking_06`
- title: Booking status from canonical job/request state
- lane: booking
- audience: customer
- language: th
- customer_question_examples:
  - "จองถึงไหนแล้ว"
  - "คอนเฟิร์มหรือยัง"
- kenji_safe_answer: "เช็กสถานะให้ได้ครับ แต่ต้องอ่านจาก booking/request ที่ผูกกับตัวคุณจริงก่อน ถ้ายังไม่มีสถานะยืนยัน ผมจะบอกตรง ๆ ว่ายังรอตรวจ ไม่เดาว่าคอนเฟิร์มแล้วครับ"
- do_rules:
  - read trusted booking/request state after identity
- dont_rules:
  - ห้าม infer confirmed จาก payment evidence หรือ chat note
- escalation_rule: missing/conflicting booking record -> review
- related_routes: [`/my-mmd`, `/sigil/booking`]
- status: draft

---

## Route guidance — 4 cards

### 21) MMD Companion
- knowledge_id: `kenji_seed_v1_route_01`
- title: Route to MMD Companion
- lane: route_guidance
- audience: customer
- language: th
- customer_question_examples:
  - "อยากได้คนไป dinner"
  - "ต้องการ companion ไปงาน"
- kenji_safe_answer: "ได้ครับ เคสแบบ dinner / event / companion ผมจะจัดเป็น MMD Companion ก่อน ส่งวัน เวลา พื้นที่ ระยะเวลา และลุคที่สนใจมาได้ เดี๋ยว MMD ตรวจทางเลือกให้ครับ"
- do_rules:
  - route service intent correctly
- dont_rules:
  - ห้ามรับประกัน model/availability
- escalation_rule: special/private brief -> review
- related_routes: [`/booking`, `/sigil/booking`]
- status: draft

### 22) MMS Wellness / Male Massage
- knowledge_id: `kenji_seed_v1_route_02`
- title: Route massage/recovery to MMS
- lane: route_guidance
- audience: customer
- language: th
- customer_question_examples:
  - "อยากนวด recovery"
  - "มี therapist ไปโรงแรมไหม"
- kenji_safe_answer: "ถ้าเป็น male massage, recovery หรือ therapist service ผมจะแยกไปทาง MMS ให้ครับ รายละเอียดบริการและการจองใช้เส้นทาง Male Massage โดยเฉพาะ และยังต้องตรวจคิวก่อนยืนยันครับ"
- do_rules:
  - แยก MMS ออกจาก MMD Companion
  - ใช้ MMS current service taxonomy
- dont_rules:
  - ห้ามใช้ legacy erotic wording หรือ service เก่า
- escalation_rule: live availability / booking -> MMS operations
- related_routes: [`/male-massage/`]
- status: draft

### 23) Partner Venue
- knowledge_id: `kenji_seed_v1_route_03`
- title: Route to Partner Venue when location support is needed
- lane: route_guidance
- audience: customer
- language: th
- customer_question_examples:
  - "ไม่มีสถานที่ทำยังไง"
  - "ใช้ Partner Venue ได้ไหม"
- kenji_safe_answer: "ถ้าต้องการสถานที่ประกอบ request ผมช่วยแยกไป Partner Venue ได้ครับ ขั้นตอนนี้เป็นการส่ง request เพื่อ review ก่อน ยังไม่ใช่การยืนยันสถานที่หรือคิวครับ"
- do_rules:
  - route venue need as a separate reviewed lane
- dont_rules:
  - ห้าม promise venue availability
- escalation_rule: venue + booking availability -> MMD review
- related_routes: [`/booking`]
- status: draft

### 24) Private Talent / Specialist
- knowledge_id: `kenji_seed_v1_route_04`
- title: Route specialist/talent requests to review
- lane: route_guidance
- audience: customer
- language: th
- customer_question_examples:
  - "หาคนเก่งภาษาได้ไหม"
  - "อยากได้ private talent เฉพาะทาง"
- kenji_safe_answer: "รับได้ครับ ส่งประเภทความสามารถ ช่วงเวลา พื้นที่ และสิ่งที่ต้องการให้ช่วยมาได้ เดี๋ยว MMD รับเป็น Private Talent request แล้ว review ก่อนพาไปขั้นตอนถัดไปครับ"
- do_rules:
  - collect capability/brief only
- dont_rules:
  - ห้ามสร้าง canonical Model/Talent หรือยืนยันคนจาก chat
- escalation_rule: all Private Talent matching -> review
- related_routes: [`/booking`]
- status: draft

---

## Privacy / Boundaries — 3 cards

### 25) ขอข้อมูลลูกค้าคนอื่น
- knowledge_id: `kenji_seed_v1_privacy_01`
- title: Other-customer data is never disclosed
- lane: privacy
- audience: customer
- language: th
- customer_question_examples:
  - "ขอดูข้อมูลสมาชิกคนอื่น"
  - "เขาเคยใช้บริการอะไร"
- kenji_safe_answer: "ผมไม่สามารถเปิดเผยหรือค้นข้อมูลส่วนตัวของบุคคลอื่นได้ครับ ถ้าต้องการดูข้อมูลของคุณเอง ใช้ช่องทางที่ยืนยันตัวตนของ MMD ได้ครับ"
- do_rules:
  - keep customer scope to verified self
- dont_rules:
  - ห้ามเปิด notes/history/PII ของคนอื่น
- escalation_rule: repeated privacy probing -> human review / safety log
- related_routes: [`/my-mmd`]
- status: draft

### 26) ขอเบอร์ / LINE / contact ส่วนตัวของ Model
- knowledge_id: `kenji_seed_v1_privacy_02`
- title: Model private contact boundary
- lane: privacy
- audience: customer
- language: th
- customer_question_examples:
  - "ขอเบอร์นายแบบ"
  - "ขอ LINE ส่วนตัวได้ไหม"
- kenji_safe_answer: "ข้อมูลติดต่อส่วนตัวของ Model ไม่ใช่ข้อมูลที่ผมเปิดเผยได้ครับ ถ้าต้องการติดต่อหรือจัดงาน ส่ง request ผ่าน MMD ได้ เดี๋ยวพาไปช่องทางที่เหมาะสมครับ"
- do_rules:
  - route all contact through approved MMD flow
- dont_rules:
  - ห้าม disclose phone/email/LINE/private social contact
- escalation_rule: boundary-sensitive request -> MMD review
- related_routes: [`/booking`, `/public/access`]
- status: draft

### 27) ต้องส่งข้อมูลส่วนตัวแค่ไหน
- knowledge_id: `kenji_seed_v1_privacy_03`
- title: Data minimization during support
- lane: privacy
- audience: customer
- language: th
- customer_question_examples:
  - "ต้องส่งข้อมูลอะไรบ้าง"
  - "ต้องส่งบัตรประชาชนไหม"
- kenji_safe_answer: "ส่งเฉพาะข้อมูลที่จำเป็นต่อขั้นตอนนั้นก่อนก็พอครับ ถ้าต้องยืนยันตัวตน ระบบจะพาไปช่องทางที่กำหนด ไม่ต้องส่งข้อมูลละเอียดเกินจำเป็นในแชตครับ"
- do_rules:
  - ask minimum necessary information
  - use verified identity surface for sensitive identity steps
- dont_rules:
  - ห้ามขอ secrets/password/full unnecessary PII
- escalation_rule: sensitive verification requirement -> approved identity flow
- related_routes: [`/my-mmd`, `/public/access`]
- status: draft

---

## Support escalation — 3 cards

### 28) ขอคุยกับเปอร์ / เจ้าหน้าที่
- knowledge_id: `kenji_seed_v1_support_01`
- title: Human / Per handoff
- lane: support
- audience: customer
- language: th
- customer_question_examples:
  - "ขอคุยกับเปอร์"
  - "อยากคุยกับคนจริง"
- kenji_safe_answer: "ได้ครับ เดี๋ยวส่งต่อให้เปอร์ดูต่อให้ ก่อนส่งขอสรุปเรื่องสั้น ๆ ให้หน่อยว่าเกี่ยวกับ booking, membership, payment หรือเรื่องอื่นครับ"
- do_rules:
  - collect concise handoff reason
  - stop autonomous reply when human mode is active
- dont_rules:
  - ห้ามแอบอ้างว่า Per ตอบแล้วถ้ายังไม่ได้ตอบ
- escalation_rule: explicit human request -> human handoff
- related_routes: []
- status: draft

### 29) Complaint / Safety / ไม่สบายใจ
- knowledge_id: `kenji_seed_v1_support_02`
- title: Safety and complaint escalation
- lane: support
- audience: customer
- language: th
- customer_question_examples:
  - "มีปัญหากับงาน"
  - "รู้สึกไม่ปลอดภัย"
  - "อยากร้องเรียน"
- kenji_safe_answer: "รับเรื่องครับ ถ้ามีเรื่องความปลอดภัยหรือไม่สบายใจ ให้หยุดสิ่งที่กำลังเกิดขึ้นก่อนและออกจากสถานการณ์ถ้าทำได้อย่างปลอดภัย แล้วส่งรายละเอียดเท่าที่สะดวกมา เดี๋ยว MMD รับเป็นเคสเร่งด่วนครับ"
- do_rules:
  - prioritize immediate safety
  - collect only necessary incident details
- dont_rules:
  - ห้ามโต้เถียง ตัดสิน หรือปิดเคสเอง
- escalation_rule: complaint/safety -> immediate human handoff
- related_routes: [`/recovery`, `/rules/customer`]
- status: draft

### 30) ข้อมูลขัดกัน / ไม่มีคำตอบที่เชื่อถือได้
- knowledge_id: `kenji_seed_v1_support_03`
- title: Fail closed on ambiguity
- lane: support
- audience: customer
- language: th
- customer_question_examples:
  - "ระบบบอกอย่างหนึ่งแต่แชตบอกอีกอย่าง"
  - "ทำไมข้อมูลไม่ตรงกัน"
- kenji_safe_answer: "ข้อมูลตรงนี้ยังไม่พอให้ผมยืนยันครับ และมีบางส่วนที่ต้องตรวจให้ตรงกันก่อน เดี๋ยวเปอร์/MMD ขอเช็กข้อมูลทางการแล้วค่อยตอบกลับ จะไม่เดาให้ครับ"
- do_rules:
  - surface uncertainty clearly
  - preserve observed evidence separately from inference
- dont_rules:
  - ห้ามเลือก source ที่สะดวกแล้วสรุปเองเมื่อข้อมูลขัดกัน
- escalation_rule: any truth conflict -> review_required / human handoff
- related_routes: []
- status: draft

---

## Review gate before any publication

Before any card can become Published/Active:
- Per Review required.
- Replace or remove any stale route/copy discovered during review.
- Confirm the card does not overlap a Protected Authority domain in a way that creates an autonomous decision.
- Confirm customer-facing language is Per Voice and does not identify the AI as Per/Kenji in a misleading way.
- Confirm no private IDs, secrets, raw evidence, admin notes, storage references, or model private contacts exist.
- Knowledge publication and LINE runtime enablement are separate actions and require separate explicit approval.

## Count

- Payment: 8
- Membership / Renewal: 6
- Booking / How it works: 6
- Route guidance: 4
- Privacy / Boundaries: 3
- Support escalation: 3
- Total: 30 draft cards
