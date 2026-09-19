# MMD Single Owner Admin + CEO V1

Date: 2026-09-07

## Canon

MMD Privé owner-side back office assumes **Per is the single human operator**.

This applies to the owner-facing experience of:

- `/internal/ceo`
- `/internal/admin/control-room`
- canonical `/internal/admin/*` surfaces using the shared AI Ops layer

The UI must not simulate a team of admins, reviewers, approvers, or operators when Per is the only human using the owner back office.

## Normal owner flow

Use this pattern wherever a human decision is required:

`AI reads context → AI summarizes / checks → Per confirms → canonical backend performs the action`

Do not add a second-human review step merely to approve Per's own work.

For content/configuration editing flows, prefer:

`Edit → Summary before live → Per confirms → Use live`

## AI role

AI may:

- gather read-only context;
- summarize what matters now;
- detect missing evidence / anomalies;
- propose the next best action;
- prepare drafts, routes, and safe previews;
- run automatic policy / privacy / consistency checks;
- explain what will change after confirmation.

AI must not become the canonical authority for:

- paid state;
- entitlement grants;
- private-model eligibility / disclosure;
- protected access;
- final owner approval.

Those remain with their existing canonical backends and explicit Per confirmation.

## UI language

Owner-facing default language should describe tasks, not organization roles.

Prefer:

- `Per · Owner Mode`
- `สิ่งที่ต้องดู`
- `ทำต่อ`
- `สรุปก่อนยืนยัน`
- `ยืนยันและใช้จริง`
- `ประวัติ / Advanced`

Avoid normal-flow labels that imply multiple humans, such as:

- Review Queue
- Assigned Reviewer
- Submit to Admin
- Waiting for Admin
- Team Review

Technical audit data may still preserve historic role names where needed for compatibility.

## Hubs

### CEO

CEO answers: **วันนี้ Per ต้องรู้อะไรและตัดสินใจอะไร?**

Default structure:

1. Today / Focus
2. Needs Per
3. Decision shortcuts
4. Operations shortcuts
5. AI Ops summary

### Admin Control Room

Admin Control Room answers: **Per จะลงมือทำอะไรต่อ?**

Default structure:

1. Today
2. Create Job
3. Payments
4. Membership Access
5. Kenji
6. Models / Studio
7. MMS
8. Advanced / history only when needed

`Create Job` is the human-facing creation flow. `Session` remains a backend/compatibility object and should not be promoted as Per's main task.

## Exceptions

MMS may retain separate Partner permissions where required by its own canonical access model, but the Per owner console itself remains single-owner and must not invent extra approval roles.
