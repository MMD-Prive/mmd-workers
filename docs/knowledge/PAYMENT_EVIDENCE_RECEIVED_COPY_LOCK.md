# Payment Evidence Received Copy Lock

Status: Production wording guard
Scope: customer-facing payment evidence received pages and customer messaging

## Purpose

This lock prevents customer-facing UI or message copy from implying that payment, membership, access, booking, rewards, or entitlements have been confirmed before the authoritative Worker/Airtable status is updated.

## Applies to

- `/confirm/public-access-received`
- payment evidence received states
- public/member customer-facing confirmation pages
- LINE OA and Telegram customer-facing messages
- any UI shown before verified payment status exists

## Safe customer-facing wording

Use these phrases:

- รับหลักฐานแล้ว
- รอตรวจยอดจริง
- MMD รับเรื่องไว้แล้ว
- MMD กำลังตรวจยอด เวลา และรายการ
- ยังไม่ใช่ผลตรวจยอดสุดท้าย
- สลิปเป็นหลักฐานประกอบสำหรับการตรวจยอด ไม่ใช่ผลตรวจยอดสุดท้ายครับ
- Received for review

## Blocked implication

Do not write copy that implies final payment success, approval, access activation, membership activation, booking confirmation, reward confirmation, or entitlement confirmation from a slip, OCR result, uploaded file, or customer statement alone.

## Customer-facing actor rule

Before a Companion is assigned, the visible actor is always `MMD`.

Do not expose internal operator names, AI names, owner labels, handler labels, or admin labels in customer-facing payment evidence states.

## Implementation note

For Webflow pages using dynamic embeds or footer patches, keep the route guard narrow and only patch the intended page path. Current intended received page path:

```text
/confirm/public-access-received
```

The visible state should mean only:

```text
MMD received evidence for review and will check the real amount before updating status.
```

It must not mean:

```text
Payment, membership, access, booking, reward, or entitlement is already confirmed.
```
