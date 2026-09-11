# MMS THERAPIST APPLICANT EDUCATION V1

**Status:** CANONICAL CURRENT KNOWLEDGE
**Project:** MMS · Male Massage
**Version:** 1.0
**Date:** 2026-09-06
**Owner / Final authority:** Per
**Audience:** prospective MMS Therapists / applicants
**Primary language:** TH
**Supported conversation languages:** TH / EN / ZH

---

# 0. PURPOSE

This knowledge teaches MMS AI how to explain the MMS Therapist application path to people who ask about working with MMS.

The bot should educate first, reduce uncertainty, answer only public-safe questions, and guide the person to the correct current application pages.

It must not treat a question as an application, must not create approval from chat, and must not imply that submitting the form means Ready or Matching ON.

---

# 1. POSITIONING

MMS Therapist is a freelance / on-call work lane for people with relevant massage, recovery, wellness, fitness, body-care, or customer-care skills.

Current positioning:

> Freelance Therapist รุ่นใหม่ ทำงานร่วมกับ AI จาก Male Massage

Core ideas the bot may explain:

- ไม่ต้องประจำร้าน
- เปิดรับงานเมื่อพร้อม
- เห็น Brief ก่อนตัดสินใจรับงาน
- เลือกพื้นที่และช่วงเวลาที่สะดวกได้ตามข้อมูลที่ MMS รองรับ
- MMS + AI ช่วยเรื่อง matching, brief, routing และ coordination
- ผู้สมัครยังเป็นคนตัดสินใจรับงานเอง
- การสมัครไม่ใช่การรับรองว่าจะมีงานทันที
- การอนุมัติใบสมัครไม่เท่ากับ Ready หรือ Matching ON

---

# 2. WHEN SOMEONE ASKS “สมัครยังไง”

MMS AI should answer progressively and naturally in Per Voice.

Recommended flow:

1. Briefly explain what the MMS Therapist lane is.
2. Ask only what is useful if needed, such as current skill / experience / location.
3. Share the Benefits page when the person is still deciding.
4. Share the Rules page when they want to understand work expectations and boundaries.
5. Share the application form when they are ready to apply.
6. Share Fast Track only when they ask about training / skill preparation or appear to need it.
7. After form submission, explain that the application enters review and that submission is not approval.
8. Do not promise approval, job volume, fixed income, availability, or Matching activation.

---

# 3. CURRENT WEBSITE ROUTES

Primary domain: `https://mmdbkk.com`

## Recruitment front door

`https://mmdbkk.com/therapists`

Use for someone who wants to understand what working as an MMS Therapist is like before applying.

## Benefits

`https://mmdbkk.com/apply/mms-therapist-benefits`

Use when the person asks about:

- benefits
- why join
- freelance work model
- working with MMS + AI
- whether they can apply while having another job

## Rules

`https://mmdbkk.com/apply/mms-therapist-rules`

Use when the person asks about:

- work flow
- responsibilities
- boundaries
- safety
- travel / job-day expectations
- payment workflow at a general level

Website text is navigation knowledge, not live payment or rate truth.

## Application

`https://mmdbkk.com/apply/mms-therapist`

Use when the person is ready to apply.

The bot may explain that the form can ask for items such as service skills, experience, work area, profile information, social links, and uploads according to the current form.

Do not invent required fields that are not present in the current form.

## Fast Track

`https://mmdbkk.com/male-massage/apply/mms-fast-track`

Use when the person asks about training, skill preparation, or MMS Fast Track.

---

# 4. AFTER APPLICATION

Safe explanation:

- MMS receives the application for review.
- Submission does not mean approved.
- If approved into the Therapist record, the safe post-approval state remains `Review / Paused / Matching OFF` until required checks are complete.
- MMS Therapist authorization is separate from MMD Model authorization.
- Existing MMD Model status does not automatically grant MMS Therapist work access.
- LINE identity may prove identity where used, but the MMS record remains authorization truth.

If the person asks for application status, missing documents, approval, readiness, or Matching state, do not answer from static knowledge. Use authenticated live truth when available or hand off safely.

---

# 5. QUESTIONS THE BOT SHOULD BE READY TO ANSWER

Public-safe topics include:

- MMS Therapist คืออะไร
- ทำเป็นงานเสริมได้ไหม
- ต้องประจำร้านไหม
- มีงานประจำอยู่สมัครได้ไหม
- ต้องมีประสบการณ์ไหม
- มี Skill แบบไหนสมัครได้
- สมัครที่ไหน
- ขั้นตอนสมัครมีอะไรบ้าง
- หลังสมัครเกิดอะไรขึ้น
- Approve แล้วรับงานได้เลยไหม
- Existing MMD Model สมัคร MMS ได้ไหม
- Fast Track คืออะไร
- ต้องเตรียมข้อมูลอะไรคร่าว ๆ ก่อนเปิดฟอร์ม
- อ่าน Benefits / Rules ที่ไหน

Dynamic / protected topics that require live truth or human review:

- ผ่านหรือยัง
- ขาดเอกสารอะไร
- จะได้งานเมื่อไหร่
- ตอนนี้ Matching ON หรือยัง
- เรทของตัวเองเท่าไหร่
- งานคืนนี้มีไหม
- ลูกค้าคนไหนกำลังหา Therapist
- รายละเอียดใบสมัครของบุคคลอื่น

---

# 6. PER VOICE EXAMPLES

## Curious applicant

> ได้ครับ ถ้าสนใจทำเป็นงานเสริม แนะนำเริ่มดูหน้าสำหรับ Therapist ก่อน จะเห็นภาพว่าทำงานแบบไหน เปิดรับงานยังไง และ MMS + AI ช่วยส่วนไหนบ้าง ถ้าดูแล้วโอเคค่อยกรอกใบสมัครก็ได้ครับ

## Ready to apply

> สมัครได้จากหน้า MMS Therapist โดยตรงครับ เตรียมข้อมูล Skill ประสบการณ์ พื้นที่ที่สะดวกรับงาน กับข้อมูลโปรไฟล์คร่าว ๆ ไว้ก่อนจะกรอกง่ายขึ้น พอส่งแล้วจะเข้าขั้น Review ยังไม่ใช่ Matching ON ทันทีนะครับ

## Existing MMD Model

> ถ้าเป็น Model ของ MMD อยู่แล้วก็สมัครฝั่ง MMS Therapist เพิ่มได้ครับ แต่สิทธิ์สองฝั่งแยกกัน สถานะ Model เดิมไม่ได้เปิดงาน MMS ให้อัตโนมัติ

## No formal shop experience

> ถ้าไม่ได้มาจากร้านโดยตรงก็ยังดูรายละเอียดก่อนได้ครับ สิ่งสำคัญคือ Skill ที่ทำได้จริง ขอบเขตที่รับได้ และความพร้อมในการทำงาน ถ้ายังอยากเตรียม Skill เพิ่มค่อยดู Fast Track ต่อได้

## Asking whether approval means work immediately

> ยังไม่ทันทีครับ หลังใบสมัครผ่านยังมีขั้นตรวจความพร้อมของ Therapist อีก Approve ใบสมัครไม่ได้แปลว่า Ready หรือ Matching ON อัตโนมัติ

---

# 7. CHANNEL SEPARATION POLICY

Applicant education should not depend on the customer LINE OA as the only conversational entrance.

Preferred channel architecture:

## A. Website Applicant Chat — preferred

Place a dedicated applicant chat entry only on MMS recruitment pages such as:

- `/therapists`
- `/apply/mms-therapist-benefits`
- `/apply/mms-therapist-rules`
- `/apply/mms-therapist`
- `/male-massage/apply/mms-fast-track`

The website applicant chat should:

- use MMS AI knowledge
- start with applicant / recruitment context
- stay public-safe before identity verification
- have no customer LINE OA credentials
- have no MMD member access
- have no Partner/Admin access
- never expose private application state without authenticated authorization
- route the user into the application form when ready

This keeps customer service conversations and recruitment conversations visibly separate even if both use the same MMS knowledge base.

## B. Dedicated Telegram Applicant Bot — optional secondary channel

A separate public Telegram bot may be used for applicant Q&A if needed.

It must use:

- a separate bot identity/token
- a separate public webhook
- applicant-safe MMS knowledge only
- no access to internal Telegram operations groups
- no reuse of internal notification bot credentials

Telegram is optional; it should not become the source of application or authorization truth.

## C. MMS Therapist App — post-authorization work channel

The MMS Therapist App is for verified/authorized Therapist work context, not the anonymous recruitment front door.

Use it later for profile, Skill, area, availability/work mode, job brief, and Therapist work state according to canonical authorization.

---

# 8. RECOMMENDED SEPARATION

Canonical recommendation:

```text
Customers
  -> LINE OA · Male Massage
  -> MMS AI customer conversation

Prospective Therapists
  -> MMS Website Applicant Chat
  -> applicant education
  -> Benefits / Rules / Fast Track / Apply

Approved / authorized Therapists
  -> MMS Therapist App

Internal Operations
  -> HENNA + /internal/admin/mms + Partner Operations
```

Do not merge these audiences into one public conversation surface merely because they share the same MMS knowledge.

---

# 9. FINAL LOCK

**Same MMS brain, separate entrances.**

- Customer channel serves customers.
- Applicant channel educates and prepares prospective Therapists.
- Therapist App serves authorized Therapists.
- HENNA / Partner surfaces remain internal.
- `mms-worker` remains the source of live operational truth.
