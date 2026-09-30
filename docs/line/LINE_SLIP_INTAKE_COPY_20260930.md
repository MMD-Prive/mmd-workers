# LINE Slip Intake Copy — 2026-09-30

Owner: Boss Per / MMD Privé
Status: Canon copy for Kenji / LINE / SIGIL Pay routing

## Core rules

- Slip / proof is evidence only.
- Slip received does not mean paid, verified, approved, membership-active, private-access-ready, or job-confirmed.
- Kenji must not promise that a LINE slip can always be matched to a Payment.
- When evidence comes from LINE, the system may only link it to an existing Payment when customer, Session, payment stage, and amount resolve clearly.
- If matching is unclear, cancelled, mismatched, or incomplete, keep it in manual review.
- Do not ask the customer to resend if the system has already accepted the file.

## 1. Customer pays through SIGIL Pay link

Use when the customer has a signed SIGIL Pay / payment link and needs instructions.

```text
โอนตามยอดในลิงก์นี้ แล้วส่งสลิปในหน้าเดิมได้เลยครับ
กดลิงก์เดิม → เช็กยอด → เลื่อนลงไปที่ "03 PAYMENT PROOF" → แนบสลิป → กด "ส่งสลิปให้ MMD"

ส่งครั้งเดียวพอครับ ไม่ต้องส่งซ้ำหลายช่องทาง
สถานะจะขึ้นว่า "รอตรวจสอบ" จนกว่า MMD จะยืนยันยอดให้ครับ
```

## 2. System has accepted the slip file successfully

Use only after the intake/upload has actually accepted the file.

```text
ระบบรับสลิปเรียบร้อยแล้วครับ ระบบจะพยายามผูกกับรายการชำระเดิมให้
ถ้าระบบยังจับรายการไม่ชัด MMD จะตรวจให้เองครับ ไม่ต้องส่งซ้ำ
สถานะยังเป็น "รอตรวจสอบ" จนกว่า MMD จะยืนยันยอดครับ
```

## 3. Customer asks what happens after payment

Use when the customer asks what happens next after sending proof.

```text
ระบบได้รับหลักฐานแล้วครับ อยู่ระหว่างรอ MMD ตรวจยอด
พอยืนยันแล้ว MMD จะแจ้งขั้นตอนถัดไปให้ครับ
```

## 4. Image received but intake success is not yet known

Use only as a safe acknowledgement before the backend confirms successful evidence intake.

```text
ได้รับรูปแล้วครับ ขอเวลาตรวจและผูกเข้ากับรายการชำระก่อนนะครับ
ถ้าระบบจับรายการไม่ชัด MMD จะตรวจให้เองครับ
```

## Implementation notes

- Message 2 is event-gated: it belongs after successful file intake, not immediately when a customer sends an image.
- Message 4 is the fallback for image-only LINE messages when intake result is not confirmed yet.
- Keep Per Voice with `ครับ` to match SIGIL Pay copy.
- Do not include raw payment_ref, token, LINE ID, Airtable ID, Worker names, or backend error details in customer-facing replies.
