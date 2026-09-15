# MMS WEBSITE NAVIGATION KNOWLEDGE V1

**Status:** CANONICAL CURRENT ROUTE KNOWLEDGE
**Project:** MMS · Male Massage
**Version:** 1.0
**Date:** 2026-09-06
**Owner / Final authority:** Per
**Primary domain:** `https://mmdbkk.com`
**Purpose:** Give MMS AI a current, customer-safe website route map without using website copy as live operational truth.

---

# 0. CORE RULE

This file is navigation knowledge only.

- Use these URLs to guide users to the correct current MMS page.
- Website pages are **not** the source of truth for live availability, price, payment, application decisions, Therapist readiness, Matching state, or booking confirmation.
- Dynamic truth still comes from `mms-worker` according to `MMS_AI_KNOWLEDGE_MASTER_V4.md`.
- Never expose internal/admin URLs to ordinary customers, applicants, or Therapists unless the user is an authenticated authorized internal operator and the route is relevant to that role.
- Never send draft, placeholder, preview, or known obsolete routes.

---

# 1. CUSTOMER-SAFE MMS ROUTES

## 1.1 MMS entry

### Primary public MMS home

`https://mmdbkk.com/male-massage/home`

Use when the user wants to:

- understand MMS at a high level
- choose between the current MMS service paths
- start from the main Male Massage experience

Preferred customer-facing wording:

> ดูภาพรวม Male Massage และเลือกทางที่เหมาะกับวันนี้ได้ที่ https://mmdbkk.com/male-massage/home ครับ

### Root MMS route

`https://mmdbkk.com/male-massage`

This route is currently published and may be used as an MMS entry/bridge URL.
When a specific destination is known, prefer the more precise route such as `/male-massage/home` or `/male-massage/how-to-use`.

## 1.2 How MMS works

`https://mmdbkk.com/male-massage/how-to-use`

Use when the user asks:

- ใช้บริการยังไง
- จองยังไง
- ขั้นตอนเป็นยังไง
- ต้องทำอะไรก่อน / หลัง Pre-booking

Do not restate live pricing, deposit, travel fee, or confirmation status from static page copy when backend truth is required.

## 1.3 MMS Pre-booking

`https://mmdbkk.com/male-massage/member/mms-booking`

Use when the user is ready to submit an MMS pre-booking request.

Important:

- Pre-booking is a request, not confirmed availability.
- Do not say the Therapist is booked, confirmed, available, or paid until canonical backend state supports that statement.
- This is the current Webflow published path. Do **not** use the older stale route `/member/mms-booking`.

## 1.4 Relax Spa

`https://mmdbkk.com/male-massage/therapists/relax-spa`

Use when the customer specifically wants the current Relax Spa path or needs a venue-based option.
Do not infer current slot availability from the page itself.

## 1.5 MMS service page

`https://mmdbkk.com/male-massage/therapists/mms`

This is currently a published customer-safe MMS service page.
Use it only when it is the most relevant service destination; otherwise prefer `/male-massage/home` as the main entry.

---

# 2. THERAPIST RECRUITMENT ROUTES

## 2.1 Recruitment front door

`https://mmdbkk.com/therapists`

Use when someone asks:

- อยากเป็น Therapist
- งานเสริม Therapist คืออะไร
- MMS Therapist ทำงานยังไง
- อยากดูภาพรวมก่อนสมัคร

This is the preferred recruitment entry before the application form when the user is still deciding.

## 2.2 Application

`https://mmdbkk.com/apply/mms-therapist`

Use when the applicant is ready to apply.

Rules:

- Submission is not approval.
- Approval is not Ready / Matching ON.
- Application state must be checked from canonical backend data, not inferred from the website.

## 2.3 Benefits

`https://mmdbkk.com/apply/mms-therapist-benefits`

Use when the applicant asks about:

- ประโยชน์
- รูปแบบงาน
- ความยืดหยุ่น
- ทำเป็นอาชีพเสริมได้ไหม
- MMS + AI ช่วยอะไร

Do not promise jobs, income, or matching volume.

## 2.4 Therapist rules

Preferred current route:

`https://mmdbkk.com/apply/mms-therapist-rules`

Use when the applicant or Therapist asks about current work rules, boundaries, brief, travel, kit, hygiene, job flow, or closing a job.

Secondary published route:

`https://mmdbkk.com/male-massage/rules/mms-therapist`

Do not proactively send the secondary route when the preferred current rules page above answers the request.

## 2.5 MMS Fast Track

`https://mmdbkk.com/male-massage/apply/mms-fast-track`

Use when someone asks about MMS Fast Track / training before work.
Training availability, schedule, current fee, or seat availability must use approved current truth when dynamic.

---

# 3. AUTHENTICATED THERAPIST ROUTES

## 3.1 Therapist Login

`https://mmdbkk.com/male-massage/therapists/login`

Use only for the MMS Therapist access flow.

Important:

- MMD Model access does not automatically equal MMS Therapist access.
- LINE identity alone does not prove MMS Therapist authorization.
- Do not promise login success before current authorization state is verified.

## 3.2 My Therapist

`https://mmdbkk.com/male-massage/therapists/me`

Private Therapist destination after verified MMS Therapist access.

Use for authenticated approved Therapist guidance involving profile/settings/work-area/availability/work-mode where the current product flow supports it.
Do not expose another Therapist's private dashboard or data.

---

# 4. INTERNAL MMS ROUTES — NEVER PUBLICLY SUGGEST

Primary Partner Operations route:

`https://mmdbkk.com/internal/admin/mms`

Application review deep-link pattern:

`https://mmdbkk.com/internal/admin/mms?tab=applications&application_id=<mmsapp_id>`

These are internal-only routes for authorized Partner/HENNA operations.
They must never be offered to ordinary customers, applicants, or Therapists.

Application review remains:

`MMS Today → ใบสมัคร MMS → Approve → Therapists → Ready / Matching`

Approval safe state remains:

`Review · Paused · Matching OFF`

---

# 5. ROUTES THAT MUST NOT BE SENT

Do not send or recommend:

- `/male-massage/therapists/boss` — current Webflow page is draft
- `/mms-build-placeholder` — current Webflow page is draft / placeholder
- `/member/mms-booking` — stale path; current published booking path is `/male-massage/member/mms-booking`
- any Webflow preview, branch preview, staging-only URL, draft page, unpublished therapist profile, or internal route to a public user

---

# 6. INTENT → URL ROUTING

| User intent | Preferred URL |
| --- | --- |
| อยากดู Male Massage / MMS | `https://mmdbkk.com/male-massage/home` |
| ใช้บริการยังไง | `https://mmdbkk.com/male-massage/how-to-use` |
| พร้อมส่ง Pre-booking | `https://mmdbkk.com/male-massage/member/mms-booking` |
| สนใจ Relax Spa | `https://mmdbkk.com/male-massage/therapists/relax-spa` |
| สนใจสมัคร Therapist แต่ยังอยากอ่านก่อน | `https://mmdbkk.com/therapists` |
| พร้อมสมัคร MMS Therapist | `https://mmdbkk.com/apply/mms-therapist` |
| อยากดู Benefits | `https://mmdbkk.com/apply/mms-therapist-benefits` |
| อยากดูกติกา Therapist | `https://mmdbkk.com/apply/mms-therapist-rules` |
| สนใจ Fast Track | `https://mmdbkk.com/male-massage/apply/mms-fast-track` |
| MMS Therapist login | `https://mmdbkk.com/male-massage/therapists/login` |
| MMS Therapist dashboard | `https://mmdbkk.com/male-massage/therapists/me` |

---

# 7. RESPONSE BEHAVIOR

When a URL directly helps the user's next step:

1. answer the question briefly first;
2. give **one best URL** rather than dumping the entire site map;
3. explain in one short phrase what the page is for;
4. if the request needs live truth, check canonical state before making a live claim;
5. do not expose internal architecture in normal customer replies.

Good:

> สมัครได้ที่ https://mmdbkk.com/apply/mms-therapist ครับ ถ้ายังอยากดูก่อนว่างานเป็นแบบไหน เปิด https://mmdbkk.com/therapists ได้เลย

Better when only one next step is needed:

> ถ้าพร้อมสมัครแล้ว ใช้หน้านี้ได้เลยครับ https://mmdbkk.com/apply/mms-therapist

Avoid:

- listing every MMS URL when the user asked one simple question;
- treating website copy as live operational truth;
- sending admin URLs;
- sending draft/placeholder routes;
- using an older route because it exists in historical documentation.

---

# 8. SOURCE / FRESHNESS LOCK

Route inventory verified against the current Webflow site page list on **2026-09-06**.

For future conflicts:

1. current published Webflow route metadata decides whether a website path exists and is draft/public;
2. current product canon decides which of multiple published paths is preferred;
3. `mms-worker` remains the source of truth for live operational state;
4. this route file should be updated when MMS Webflow IA changes.

Short form:

> **Website tells MMS AI where to send the user. `mms-worker` tells MMS AI what is true right now.**
