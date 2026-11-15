# MY PARTNER — MMD Announcement

Owner direction: Our Mission after loading; assigned/current work first, recruitment announcements second, Partner-ranked MY CO MODELS third. Desktop first; responsive mobile for Kendo. Recruitment is independent of replacing a model on an existing job.

## Implemented contract

All endpoints use existing Partner token checks or the credential-bound Owner console. No new login, public route, binding, or notification transport is introduced.

| Action | API | Authorization / required state | Confirmed result |
| --- | --- | --- | --- |
| Browse announcements | GET /v1/partner/announcements | Active recognized Partner; audience-filtered; excludes drafts | Scoped cards and own proposal statuses, cursor for more |
| Read brief | GET /v1/partner/announcements/detail?id=… | Same audience; private details only for selected Partner or owner | Current revision and exact brief |
| Propose / supply requested information | POST /v1/partner/announcements/propose | Open and before deadline; current revision; active roster relation; own shared image; explicit sharing and current-photo attestation | Stored proposal with status submitted; no booking created |
| Follow jobs in app | GET/POST /v1/partner/announcements/preferences | Existing Partner identity; conditional revision | Account-scoped category/area/budget preference and read timestamp |
| Create / edit / pause / close announcement | POST /v1/admin/partners/announcement-save | Existing owner/admin session, same-origin JSON; fixed service bridge; conditional revision | Stored draft/open/paused/closed/filled announcement |
| Review proposals | GET /v1/admin/partners/announcement-detail?id=… | Same owner session | Current full proposal list |
| Review selected shared photo | GET /v1/admin/partners/announcement-media?asset_id=… | Owner/admin, fixed shared-image prefix and MIME allowlist | Private no-store image response |
| Select / ask for information / decline | POST /v1/admin/partners/announcement-decision | Owner/admin; current revision; selection rechecks active roster/photo and remaining headcount | Stored decision; selected does not mean assigned or confirmed |

Private recruitment documents are persisted under `partner-announcements/v1/` in the existing Partner R2 bucket. Each document owns its proposals and audit events; conditional writes prevent closing, edits, proposals, and selections from silently overwriting each other. A repeated identical submission reuses the previous proposal. Conflicts keep typed Partner form values and require reviewing the latest brief. Owner draft values remain when a request fails.

List responses omit private briefs, private addresses, audit details, other Partners' proposals, and audience IDs. Detail responses expose private details only at the selected stage. R2 failures are errors, not an empty board. No null amount is interpreted as zero.

Budgets explicitly identify model net vs total job budget. Travel terms and Partner compensation terms are distinct. Proposal rates are labelled model net. No customer-payment or model-payout status is changed by recruitment.

## App workflow

- Our Mission: current/upcoming assigned work → 3 open recruitment cards → MY CO MODELS, ranked through existing account-specific order.
- All announcements: filters by type, area, Bangkok work date, minimum budget; paginated load-more. Matching counts explicitly cover loaded records when more pages remain.
- Detail: schedule, requirements, headcount, deadline, budget basis, travel and Partner terms → own submitted people/results → current roster/photo/rate/availability proposal.
- Photo upload reuses the existing model editor and sharing flow. Returning to the proposal preserves inputs; “load photos again” retrieves newly shared photos.
- “Jobs proposed” tracks submitted / more information / selected / not selected, independently of assigned jobs.
- Interested-job notices are in-app only, when the board is opened. They do not send LINE, Telegram, emails, push notifications or scheduled reminders.
- Owner: existing `/internal/admin/partners` → MMD Announcement → create/edit and review candidates. Real postings and selections are owner operations, not QA steps.

## Verification and boundaries

Automated fixture tests cover Partner and Owner UI flows through real handlers and the authenticated service bridge, scoped visibility, wrong-account/roster/photo rejection, stale revisions, duplicate submissions, close-vs-submit races, expired/paused intake, current roster checks at selection, preference conflicts, and storage failure without success or private error leakage.

Browser QA uses synthetic records only. Checked widths 320/390/430 and desktop 1280/1440; no horizontal overflow observed. Checked enlarged text, detail/form, filter, and existing photo-editor entry. Small-mobile dialog padding and close-button wrapping were corrected.

Design/source/tests/release are separate states. The private Site is a synthetic preview: sample numbers and images are not live system evidence, proposal/upload calls there deliberately cannot complete real business operations. No real announcement, model proposal, candidate selection, job mutation, payment, or outbound notification was executed for verification.

Existing boundaries retained: global visibility is a request under existing Sales Control, not an instant global cutoff. Unified LINE/Telegram history and replacement-model workflow are separate work. This change does not claim either complete.

Production release requires Partner worker deployment and the owner-console admin-worker release. Record exact PR/run/version evidence separately after deployment; source and fixture passes alone are not deployment proof.
