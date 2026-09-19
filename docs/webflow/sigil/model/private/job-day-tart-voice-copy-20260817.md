# MMD Private Model Job Day — TarT Voice Copy

Status: copy/language lock for Webflow page  
Route: `/sigil/model/private/job-day`  
Date: 2026-08-17  
Layer: SIGIL / Private Model / Job Day  
Owner voice: TarT voice, not system voice

## Purpose

This document records the Thai copy direction and wording for the Private Model Job Day page.
The page should help a confirmed private model understand what to do before traveling, during travel, on arrival, after meeting the client, before starting work, during work, and after separation.

The page should not feel like a legal rulebook or system manual. It should feel like TarT talking directly to the model in a calm, practical, protective way.

## Route lock

```text
/sigil/model/private/job-day
= General Private Model Job Day Guide
```

Do not mix this page with:

```text
/sigil/model/client-brief
= Job-specific client brief with token/session/job context
```

Job Day Guide = general process.  
Client Brief = specific confirmed job details.

## Voice lock

Use TarT voice.

- TarT calls the model `พี่` followed by the model's preferred name when available.
- If no model name is available, fallback to `พี่ครับ`.
- Thai should sound like a real person speaking, not translated system copy.
- Keep mobile copy short, but preserve every required purpose.
- Desktop may show expanded detail.
- Avoid harsh legal phrasing unless absolutely necessary.
- Avoid sounding like a government form, policy page, or backend system.

## Dynamic greeting

Supported query examples:

```text
/sigil/model/private/job-day?name=ซิน
/sigil/model/private/job-day?model=ซิน
/sigil/model/private/job-day?model_name=ซิน
```

Greeting output:

```text
พี่ซินครับ
```

Fallback:

```text
พี่ครับ
```

Hero lead copy:

```text
พี่ครับ หน้านี้ไว้เช็กวันงานจริงแบบเร็ว ๆ นะครับ ก่อนออกเดินทาง ถึงที่หมาย พบลูกค้า รอสัญญาณ และปิดงาน ใช้หน้านี้เป็นหลักได้เลย
```

With name:

```text
พี่ซินครับ หน้านี้ไว้เช็กวันงานจริงแบบเร็ว ๆ นะครับ ก่อนออกเดินทาง ถึงที่หมาย พบลูกค้า รอสัญญาณ และปิดงาน ใช้หน้านี้เป็นหลักได้เลย
```

## Page hero

Eyebrow:

```text
PRIVATE MODEL · CONFIRMED JOB
```

Title:

```text
JOB DAY
GUIDE
```

Primary CTA:

```text
Open Model Dashboard
```

Secondary CTA:

```text
เช็กก่อนออก
```

Hero note label:

```text
TART NOTE
```

Hero note title:

```text
งานคอนเฟิร์มแล้ว ให้เริ่มจาก Dashboard
```

Hero note body:

```text
กดเข้า LINE ก่อนนะครับ จะได้เปิดบรีฟ ดูสถานะงาน และใช้ตอนแจ้งเดินทางหรือยืนยันหน้างาน
```

## Quick Check section

Section eyebrow:

```text
QUICK CHECK
```

Title:

```text
เช็กก่อนออก
```

Intro:

```text
ถ้าครบชุดนี้ พี่พร้อมไปต่อแล้วครับ
```

Checklist items:

```text
โทรศัพท์แบตพร้อม
เน็ตใช้งานได้
เปิดแจ้งเตือน LINE
ชุดตรงบรีฟ
เช็กเวลาและสถานที่
เปิด Model Dashboard ได้
```

## Model Dashboard section

Eyebrow:

```text
MODEL DASHBOARD
```

Title:

```text
เข้า Dashboard ก่อนเดินทาง
```

Body:

```text
ใช้เปิดบรีฟ เช็กขั้นตอน แจ้งเดินทาง ยืนยันเมื่อถึงพื้นที่ และรอสัญญาณจาก MMD ก่อนเริ่มงาน
```

Dashboard card:

```text
Open Model Dashboard
LIFF · MMD Privé · Private Model
```

Dashboard URL:

```text
https://miniapp.line.me/2010862595-yT4DCEMc
```

## Job Day Flow section

Eyebrow:

```text
JOB DAY FLOW
```

Title:

```text
วันงานต้องทำอะไรบ้าง
```

Intro:

```text
มือถือจะพับให้อ่านง่าย ส่วน desktop เปิดรายละเอียดให้ครบครับ
```

### 01 ก่อนออกเดินทาง

Short body:

```text
เช็กบรีฟ เวลา สถานที่ ชุด และของที่ต้องใช้ให้เรียบร้อย ถ้ามีอะไรไม่ตรง ให้บอก MMD ก่อนออกเดินทางนะครับ
```

Detail bullets:

```text
เปิด Model Dashboard ไว้
ดูเส้นทางและเผื่อเวลา
โทรศัพท์ต้องติดต่อได้ตลอด
ถ้าเริ่มไม่ทันหรือมีเหตุฉุกเฉิน ให้รีบแจ้ง ไม่ต้องรอใกล้เวลา
```

### 02 ระหว่างเดินทาง

Short body:

```text
พอเริ่มเดินทางแล้ว ให้แจ้ง MMD ตามช่องทางที่ได้รับบรีฟไว้ ถ้ารถติด ฝนตก หรือ ETA เปลี่ยน ให้แจ้งทันทีครับ
```

Detail bullets:

```text
แจ้งว่าเริ่มเดินทางแล้ว
ส่ง location หรือ ETA ถ้ามีการขอ
อย่าปิดแจ้งเตือน
ห้ามหายหลังรับงาน เพราะงานนี้ถูกคอนเฟิร์มแล้ว
```

### 03 ถึงพื้นที่ / เจอลูกค้า

Short body:

```text
ถึงแล้วให้แจ้งก่อน อย่าเพิ่งเข้าพื้นที่ส่วนตัวถ้ายังไม่ได้รับสัญญาณจาก MMD หรือจุดนัดยังไม่ตรงกับบรีฟ
```

Detail bullets:

```text
แจ้งว่า “ถึงแล้ว”
รอจุดนัดพบตามบรีฟ
ถ้าพบลูกค้าแล้ว ให้แจ้งว่า “พบลูกค้าแล้ว”
ถ้ามีขั้นตอนยืนยันหน้างาน ให้ทำก่อนเริ่มงาน
```

### 04 รอสัญญาณก่อนเริ่ม

Short body:

```text
ถ้ามียอดคงเหลือหรือมีอะไรที่ MMD ต้องเช็กก่อน ให้รอสัญญาณก่อนเริ่มงานทุกครั้งครับ
```

Detail bullets:

```text
สลิปจากลูกค้า ยังไม่ใช่คำยืนยันสุดท้าย
MMD ต้องเช็กยอดก่อน
ถ้าลูกค้าบอกว่าโอนแล้ว ให้รอ MMD ยืนยัน
อย่าเริ่มงานเองก่อนมีสัญญาณ
```

### 05 ระหว่างงาน

Short body:

```text
ทำตามบรีฟ รักษาขอบเขต และอย่าเพิ่มเงื่อนไขเองนอกระบบ ถ้ามีอะไรเปลี่ยน ให้แจ้ง MMD ทันทีครับ
```

Detail bullets:

```text
ไม่คุยเงินเอง
ไม่รับดีลนอกระบบ
ไม่แชร์ข้อมูลลูกค้า
ถ้ามีเหตุไม่ปกติ ให้บอกเร็วที่สุด
```

### 06 จบงาน / แยกลูกค้า

Short body:

```text
จบงานแล้วให้แจ้ง MMD และหลังแยกจากลูกค้าแล้วให้แจ้งอีกครั้ง เพื่อปิดงานให้ครบครับ
```

Detail bullets:

```text
แจ้งว่า “จบงานแล้ว”
แจ้งว่า “แยกลูกค้าแล้ว”
ถ้ามีทิปส์หรือค่าใช้จ่ายเพิ่ม ให้แจ้งตามจริง
อย่าอยู่ต่อโดยไม่มีบรีฟใหม่
```

## Important section

Eyebrow:

```text
IMPORTANT
```

Title:

```text
เรื่องที่พี่ต้องรู้
```

Intro:

```text
ไม่ยาว แต่สำคัญครับ
```

### ถ้าหายวันงาน

```text
งานนี้คอนเฟิร์มแล้ว ถ้าพี่หาย ติดต่อไม่ได้ หรือยกเลิกกะทันหันโดยไม่มีเหตุจำเป็น MMD จะต้องตรวจผลกระทบจากหลักฐานจริง
```

### ถ้างานพังหรือเกิดความเสียหาย

```text
ถ้าเกิดจากการไม่ทำตามบรีฟ ไม่แจ้งสถานะ หรือทำให้งานเสียโดยไม่มีเหตุจำเป็น อาจมีผลต่อสิทธิ์งานถัดไป และอาจต้องรับผิดชอบค่าใช้จ่ายจริงที่ตรวจสอบได้
```

### กรณีที่พัก / ค่าโรงแรม

```text
ถ้าลูกค้ามีค่าใช้จ่ายจากการจองที่พักหรือสถานที่ และมีการเรียกเก็บจากเหตุที่เกิดจากฝั่ง model MMD จะตรวจจากบรีฟ เวลา แชต และหลักฐานก่อนตัดสินครับ
```

### เรื่องข้อมูลส่วนตัว

```text
ห้ามแชร์ชื่อ สถานที่ ห้องพัก แชต รูป หรือรายละเอียดลูกค้าออกนอกงาน ทุกอย่างในบรีฟถือเป็นข้อมูลส่วนตัวครับ
```

## What to Prepare section

Eyebrow:

```text
WHAT TO PREPARE
```

Title:

```text
ของที่ควรเตรียม
```

Items:

```text
โทรศัพท์แบตเต็ม
Power bank / สายชาร์จ
เน็ตพร้อมใช้
ชุดตรงบรีฟ
ของใช้ส่วนตัว
เงินสดสำรองเล็กน้อย
ยาประจำตัวถ้ามี
เปิดแจ้งเตือน LINE
```

## Final CTA section

Eyebrow:

```text
READY
```

Title:

```text
พร้อมแล้ว เข้า Dashboard ได้เลยครับ
```

Body:

```text
ใช้ dashboard เป็นทางหลักสำหรับเปิดบรีฟ แจ้งสถานะ และไปต่อในวันงาน ถ้าเข้าไม่ได้ ให้แจ้ง MMD ทันที
```

Buttons:

```text
Open Model Dashboard
Back
```

Back URL:

```text
/sigil/model/private
```

## Mobile behavior lock

Mobile should be compact:

- Hero lead max 4 lines.
- Hero note hidden on mobile.
- Accordion closed except first item.
- Sticky CTA visible at bottom.
- Important notes remain visible as cards.
- Checklist appears before detailed flow.

Desktop should be detailed:

- Hero note visible.
- Accordion content open as detail cards.
- Two-column flow grid.
- More copy can be visible without interaction.

## Current hero assets

Desktop hero:

```text
https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a821ed5379aff3b208bd082_Tart-%20Jobday%20Desk.webp
```

Mobile hero:

```text
https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a821ed5cb51c23e7edb3aa9_Tart-%20Jobday%20Mob.webp
```

SIGIL logo:

```text
https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a0f2cbc7e26b6735aee4cb2_SIGIL%20LOGO%20Transp.webp
```

MMD Privé signature logo:

```text
https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6c4486e7585ba74ab2eeb1_MMD_Prive%CC%81_logo_signature_transparent%20Final.webp
```

## Notes

This is a copy/language record only. The live Webflow page may require a separate code update and publish pass.
