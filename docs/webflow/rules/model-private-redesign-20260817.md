# MMD Rules Model Private Redesign — 2026-08-17

## Live route

`/rules/model`

## Decision

`/rules/model` is now redesigned as **Private Model Rules** first.

This pass does **not** create `/rules/model/private/job-day`. That page is intentionally deferred to save credit and avoid creating a new Webflow page now.

Public Model rules must be handled separately later because Public Model and Private Model do not share the same rule set.

## Webflow status

- Page updated and published live.
- Hero: TarT Model Dash Desk / TarT Model Dash Mb.
- Voice: Per Voice, guided by TarT.
- Layout: narrowed premium container around 1120px max width.
- Root selector: `#mmdPrivateModelRules`.

## Core copy locks

- Private Model and Public Model are separate rule sets.
- Primary CTA: `/sigil/model/console`.
- Secondary CTA: `/sigil/apply`.
- Back route: `/rules`.
- Deferred Job Day Guide: `/rules/model/private/job-day`.

## Required Private Model rules included

- Profile clarity.
- Respect and conduct.
- Availability.
- Privacy and data care.
- No-show / disappearing / unreachable on job day.
- Working badly or causing client damage.
- Sudden cancellation without necessary reason.
- Accommodation charge and other verifiable client expenses.
- Boss Per final review.

## Accommodation charge doctrine

If a model accepts a job and then disappears, cancels suddenly, becomes unreachable, or causes the job to fail in a way that creates real client expenses, MMD reviews the brief, chat, timing, booking evidence, and actual situation first.

If damage is caused by the model not following process, the model may need to be responsible for real expenses, including accommodation charges when the client requests reimbursement and supporting evidence exists.

## Next page later

Route: `/rules/model/private/job-day`

Purpose: private model job-day guide from preparation, travel, client meeting, arrival confirmation, waiting for MMD transfer signal, work start, job finish, separation, post-job review, and items to prepare.

## Rollback

If the live page breaks, remove the current embed content with root `#mmdPrivateModelRules` and restore the previous `/rules/model` embed or use Webflow page revisions.
