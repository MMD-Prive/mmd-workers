# Partner Copy, CTA & Theme Canon v2

Audit date: 2026-09-22

## Scope

Applies to `/partner`, all `/partner/*` surfaces, Worker-rendered Review / Recognized / Dashboard, and `/sigil/model/dashboard/partner-login`.

## Voice

Use positive operational language. State:
1. what is happening now;
2. what the system protects or controls;
3. what happens next.

Prefer:
- ข้อมูลของคุณเข้าสู่ Partner Review แล้ว
- Private Vault อยู่ภายใต้การควบคุมของ Partner
- ขั้นถัดไปจะเปิดเมื่อ Review กำหนด route แล้ว

Avoid building normal UX/marketing copy around:
- ไม่ใช่
- ยังไม่
- ไม่มี
- ไม่ได้
- ห้าม
- not / cannot / never

Precise runtime errors may still use negative conditions where the failure itself is material.

Privacy and legal boundaries must remain strict but should be affirmative:
- Partner controls Vault PIN, decryption keys and Share with MMD.
- All client and model dealings stay within the MMD SĪGIL operating structure.

## Lifecycle

`Intake → Review → Recognized → Agreement → Active / Dashboard`

Use **Intake** rather than **สมัคร Partner**.

## CTA canon

Primary:
- เริ่ม Partner Intake
- เริ่ม Modeling Partner Intake
- เริ่ม Client / Referral Intake
- เริ่ม Service Partner Intake
- เริ่ม Brand / Venue Intake
- เริ่ม Strategic Partner Intake
- เริ่ม Private Access Intake
- ส่งเข้า Partner Review
- เข้าสู่ระบบด้วย LINE
- เปิด Partner Dashboard

Secondary:
- ดู Partner Lanes
- ดูหลักการก่อนส่ง
- อ่าน Partner Terms
- Partner Home

Friend Referral remains separate from Modeling Partner / agency / rate flows.

## Routes

- Partner Home: `/partner`
- Intake: `/partner/apply`
- Modeling: `/partner/apply?partner_type=modeling`
- Client / Referral: `/partner/apply?partner_type=client_referral`
- Service: `/partner/apply?partner_type=service`
- Brand / Venue: `/partner/apply?partner_type=brand_venue`
- Strategic: `/partner/apply?partner_type=strategic`
- Private Access: `/partner/apply?partner_type=private_access`
- Friend Referral apply: `/partner/model/recommend-model-apply?source=model-to-model`
- Partner Login: `/sigil/model/dashboard/partner-login`
- Terms: `/partner/terms`
- Dashboard: `/partner/dashboard`

## Theme

Reference: quiet near-black editorial field with generous negative space.

- Canvas: `#0a0908`
- Canvas mid: `#0f0d0b`
- Panel: `#12100e`
- Ivory: `#fff9f0`
- Body: `#d9d1c7`
- Muted: `#91887f`
- Champagne gold: `#d7af67`
- Gold light: `#f5e2b5`
- Gold line: `rgba(215,175,103,.28)`
- Deep wine: `#2a0e13`
- CTA ink: `#17120b`
- Verification sage: `#5f9272`

Primary CTA: champagne-gold pill with dark ink.
Secondary CTA: near-black transparent surface with restrained gold border/text.
Green: small verified / LINE signal only; never a large full-green Partner CTA.

## Typography

- Thai: Anuphan 400 / 500 / 600 / 700
- English / UI: General Sans 400 / 500 / 600 / 700
- Secondary Latin / metrics: Satoshi 400 / 500 / 700
- `font-display: swap`

## Footer

Quiet minimal closing:
- left: `MMD PRIVÉ · BANGKOK`
- right: `Private by design.`

Use a near-black field and generous breathing room.
