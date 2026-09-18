# MMD MEMORY · PUBLIC ACCESS PAYMENT REBUILD V21 LOCK

Updated: 2026-08-04
Route: `/confirm/public-access-payment`
Webflow page ID: `6a59faf26b1b95d6eb8c072b`
Webflow HtmlEmbed ID: `bb307a43-7ae1-ab53-9d1b-7943c8805054`
Version marker: `mmdPublicAccessPaymentV21`

## Status

Active customer-facing legacy payment evidence upload route for Public Access.
This route must match the same visual and copy level as `/confirm/payment-proof` and `/confirm/public-access-received`.

## Purpose

`/confirm/public-access-payment` is the Public Access-specific proof upload page.
It receives customer evidence for MMD review only.
It must not imply payment approval, access opening, booking confirmation, or final verification.

## Theme

Use MMD Privé v2026 public theme:

- White / Ink / Stone / Wine / Legacy Red Accent
- mobile-first
- desktop not full screen
- clean, private, sharp, premium, editorial, discreet
- no beige-gold hotel mood
- no champagne wedding tone
- no black-gold SIGIL mood
- no nightclub / cyberpunk / lounge mood

Required root classes:

```html
mmd-prive mmd-page-light mmd-prive-theme-v2026
```

## Hero

Current hero image:

```text
https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a71b7b7affa15a777efe17f_Profiles%20Hito%20YU.webp
```

Crop:

```css
object-position: 50% 16%;
```

## Logo and footer

Use approved MMD Privé logo:

```text
https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6c4486e7585ba74ab2eeb1_MMD_Prive%CC%81_logo_signature_transparent%20Final.webp
```

Logo must be compact.
Slogan must be rendered as separate text, not embedded in the logo image.

Header slogan:

```text
ดูแลแบบส่วนตัว
ตรวจให้ชัดก่อนทุกขั้นตอน
```

Footer slogan:

```text
ดูแลอย่างเป็นส่วนตัว
ชัดเจนก่อนทุกขั้นตอน
```

## Customer-facing copy lock

Use Per voice.
Do not use the Thai word `ระบบ` in visible copy.
Do not show internal owner labels.
Visible actor is `MMD` only.

Primary headline:

```text
ส่งหลักฐานให้ MMD ตรวจสอบ
```

Hero copy:

```text
หน้านี้สำหรับ Public Access ครับ MMD จะรับหลักฐานไว้ก่อน แล้วตรวจยอด เวลา และรายการจริงให้ชัด ก่อนอัปเดตขั้นตอนถัดไปให้ครับ
```

Status copy:

```text
รับหลักฐานแล้ว · รอตรวจยอดจริง
```

Guard copy:

```text
ยังไม่ใช่ผลตรวจยอดสุดท้าย
```

After-submit note:

```text
ถ้าเป็นยอดเดียวกัน ยังไม่ต้องส่งซ้ำหลายรอบครับ เดี๋ยว MMD อัปเดตขั้นตอนถัดไปให้เมื่อข้อมูลพร้อม
```

## Forbidden customer-facing wording

Never use:

```text
Payment Successful
Paid
Verified
Approved
ชำระเงินสำเร็จแล้ว
อนุมัติแล้ว
ยืนยันชำระแล้ว
เปิดสิทธิ์แล้ว
```

## Form fields

Visible fields:

- ชื่อเล่นของคุณ
- ช่องทางติดต่อ
- ชื่อ Model ที่สนใจ
- วันที่ต้องการจอง
- ช่องทางที่โอน
- ยอด Public Access, fixed `690`
- รายละเอียดเพิ่มเติม
- แนบหลักฐาน image or PDF
- consent checkbox

## Endpoint

Upload endpoint:

```text
https://sigil.mmdbkk.com/v1/pay/slip/evidence
```

Accepted file types:

```text
image/*
application/pdf
```

Max size:

```text
15MB
```

## Required FormData lock

The frontend must append:

```text
payment_ref=mmd_public_YYYYMMDD_model_client_tail
proof_ref=proof_<timestamp>_<tail>
proof_type=payment_slip
payment_stage=evidence_received
payment_type=public_access_evidence
payment_purpose=public_model_access
package_code=public_access_690
package_label=Public Access 690
amount_thb=690
workflow_status=payment_evidence_received
next_step=mmd_payment_verification
airtable_write_intent=create
google_drive_sync=true
notify_intent=payment_evidence_received
evidence_only=true
requires_mmd_verification=true
official_verification_required=true
frontend_unlock=false
review_rule=proof_is_evidence_only
source_route=/confirm/public-access-payment
contact_channel=customer_provided
```

## Storage compatibility

After upload, store compatible sessionStorage keys:

```text
mmd_public_access_payment_v21
mmd_public_access_payment_v20
mmd_public_access_payment_v19
mmd_payment_proof_v1
```

## Redirect

After evidence is received, redirect to:

```text
/confirm/public-access-received
```

with query params:

```text
payment_ref
model
amount=690
package=Public Access 690
```

## Webflow implementation note

The full rebuilt page currently lives inside the Webflow HtmlEmbed on `/confirm/public-access-payment`.
Page footer freeform code is intentionally cleared to:

```html
<!-- MMD Public Access Payment v21: full rebuilt page lives in HtmlEmbed. No footer override. -->
```

The page is excluded from sitemap.

## Final rule

`/confirm/public-access-payment` is a Public Access evidence upload page only.
It receives proof for MMD review.
It does not confirm payment, access, booking, membership, or final status.
