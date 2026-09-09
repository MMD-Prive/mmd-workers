# MMS `/therapists` — Recruitment Front Door

Canonical role: **Applicant entrance**, not customer booking home.

Architecture lock:

> **Same MMS brain, separate entrances.**

## Route ownership

- `/therapists` — recruitment front door + ask-first applicant entry
- `/apply/mms-therapist-benefits` — benefits
- `/apply/mms-therapist-rules` — work rules and boundaries
- `/male-massage/apply/mms-fast-track` — training / skill preparation
- `/apply/mms-therapist` — formal application
- `/male-massage/therapists/login` — approved Therapist login
- `/male-massage/therapists/me` — approved Therapist dashboard

Customer MMS discovery remains under `/male-massage/*` and must not be collapsed back into `/therapists`.

## Applicant entrance

`applicant-entry.html` is the repository-backed source for the persistent **ถามก่อนสมัคร** website entrance added to `/therapists`.

Current behavior is intentionally public-safe and transparent:

- routes prospective applicants to fit / FAQ / Benefits / Rules / Fast Track / Apply
- does **not** send them into the customer LINE OA
- does **not** pretend Website Applicant Chat is connected before a dedicated backend exists
- does **not** read customer, member, booking, payment, internal, or another applicant's data

When the dedicated Applicant Chat runtime is enabled later, this same entrance may become the chat launcher while retaining the same permission boundary.

## Knowledge sources

- `docs/knowledge/MMS_AI_KNOWLEDGE_MASTER_V4.md`
- `docs/knowledge/MMS_THERAPIST_APPLICANT_EDUCATION_V1.md`
- `docs/knowledge/MMS_WEBSITE_NAVIGATION_KNOWLEDGE_V1.md`

## Important legacy note

`therapists.html` in this folder is a legacy customer-facing implementation from before the route split. It is **not** the current `/therapists` recruitment implementation and must not be deployed back over the live recruitment page.

The current Webflow recruitment story is governed by the Webflow rule `rules/mms-home-page.md` and the applicant entrance rule `rules/mms-applicant-entry.md`.
