# MMD Knowledge Lock · Public Access Received Mobile First

Updated: 2026-08-03
Route: `/confirm/public-access-received`

## Purpose

This page confirms only that MMD has received the customer payment evidence for review.

It must not imply:

- payment success
- approval
- completed booking
- automatic access activation
- membership activation
- reward or entitlement confirmation

## Final public wording

Use Per voice: warm, short, premium, and direct.

Approved visible copy:

```text
รับหลักฐานแล้วครับ
MMD รับหลักฐานไว้ตรวจสอบแล้วนะครับ เดี๋ยวตรวจยอด เวลา และรายการให้ก่อน แล้วค่อยอัปเดตขั้นตอนถัดไปให้ครับ
รับหลักฐานแล้ว · รอตรวจยอดจริง
ยังไม่ใช่ผลตรวจยอดสุดท้าย
ถ้าเป็นยอดเดียวกัน ยังไม่ต้องส่งซ้ำหลายรอบครับ
```

## Customer-facing actor

Visible actor is only `MMD` unless a Companion has already been assigned.

Do not show internal owners, assistants, handlers, staff labels, admin labels, or operator labels on this page.

## Forbidden visible wording

Avoid visible wording that suggests finality, including:

```text
Payment Successful
Paid
Verified
Approved
ชำระเงินสำเร็จแล้ว
อนุมัติแล้ว
```

Avoid Thai wording that feels robotic or operationally internal. Do not use the Thai word `ระบบ` in customer-facing copy for this page.

## Visual direction

Mobile-first, compact, MMD Privé public theme:

- paper white
- editorial black
- wine red
- rose highlight
- casting charcoal
- no SIGIL black-gold mood
- no internal/admin wording

## Approved Webflow assets

MMD Logo:

```text
https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a6c4486e7585ba74ab2eeb1_MMD_Prive%CC%81_logo_signature_transparent%20Final.webp
```

Hero image:

```text
https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a69e716e56e25d449d2013d_Kenji%20-%20PUBLIC%20ACCESS%20EVIDENCE.webp
```

Footer/supporting image:

```text
https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a69e715475c0b94bf43929d_Footer%20PUBLIC%20ACCESS%20EVIDENCE.webp
```

## Data behavior

Read display values from:

```text
mmd_public_access_payment_v20
mmd_public_access_payment_v19
mmd_public_access_payment_v17
mmd_public_access_payment_v16
mmd_public_access_payment_v15
mmd_public_access_payment_v14
```

Query params may be used for display only:

```text
payment_ref
ref
transaction_ref
model
model_name
amount
amount_thb
package_label
item
```

Never display unsafe stored status labels. Normalize visible status to:

```text
รับหลักฐานแล้ว · รอตรวจยอดจริง
```

## Webflow implementation note

The page uses one HtmlEmbed on `/confirm/public-access-received`. The compact v20 markup lives in that HtmlEmbed, while the page head contains the compact mobile-first CSS. The old page footer override was cleared so it cannot overwrite the HtmlEmbed.
