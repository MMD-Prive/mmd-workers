# Model Job Discovery: linked-model presentation

Owner-approved design reference: `/design/job-discovery` in Lovable project `3e2490c3-5886-4fc6-8133-a23c66bed028`, reviewed 1 October 2026 (ICT).

## This change

The existing authenticated `/public/api/jobs` board and job detail/application views use a compact ivory/red presentation with charcoal/gold Private cards, `Jobs:` copy, full bold multiline briefs, moderate 25px compensation, and compact two-column job facts. Linked Models can send interest directly from the detail view using the existing fast-lane endpoint. Success and duplicate acknowledgements reveal the link back to the aggregate board; errors keep the retry action available.

The owner letter opens only from the envelope. Native dialogs manage focus and Escape, dismissal animates toward the measured envelope, and reduced motion closes immediately. Existing owner-authored quotes are preserved. No automatic chat, external contact CTA, approval waiting room or browser persistence is introduced.

The reviewed pages bypass the legacy Worker surface transformer, whose CSS otherwise enlarges the headings and spacing. Owner pages and pre-LIFF short-link pages keep their existing presentation.

## Authority

- The existing LIFF signed Model handoff and Model gate remain required.
- Private teasers omit sensitive metadata entirely. Detail access still requires the existing server-issued reveal cookie; opening an application or posting interest cannot bypass it.
- The existing fast-lane interest API creates a durable candidate. Owner selection/approval remains separate; interest never creates a booking, rate or automatic reply.
- Only real published jobs from the existing store appear. No demo jobs, fabricated dates/rates, or rotating fictional availability are introduced into production.
- No new endpoint, schema, entitlement rule, media approval change or credential is added.

## Next implementation boundary

This PR ports the linked-model board and interest journey; it is not the new-applicant intake cutover. The approved entry design has nickname, LINE, phone, eight current-photo slots, one clip and an optional image comp card. One current identity photo is the internal entry minimum; clip and comp card are optional and do not count as that photo. Files are limited to 25MiB. Photo copy:

> กรุณาไม่ใช้รูปที่สวมแว่นดำ หมวก
>
> กรุณาเลือกรูปที่เห็นหน้าชัดเจน ไม่เซลฟี่ ไม่แต่งสีภาพจนไม่ตรงกับปก

The current public-model intake is a separate service; the board gate presently requires a canonical linked Model. A new applicant must not be promoted to a linked Model or granted Private access solely because a contact form was sent. The subsequent intake PR needs a verified applicant session and reusable profile handoff, an explicit optional comp-card upload/review contract, and a safe discovery projection for applicants, preserving owner selection and existing approval policies. No change to the full later Model media workflow is implied by the entry clip/comp-card layout.

Production DM and assistant wiring, applicant profile editing, and the eventual discovery opportunity pool are not included. The existing canonical photo updater remains available to linked Models.

## Validation

- `npm run test:job-board` in `public-access-worker`: 33/33 passed.
- `node --check` passed for the presentation module, board runtime and Worker entrypoint.
- The three pre-existing baseline failures were test assumptions: two inspected hidden legacy copy rather than visible short-link text, and one attempted to inspect an unauthenticated redirect as a board. Assertions now exercise visible copy and the authenticated route.
- Real-browser viewport/LINE LIFF validation remains required before release. The local browser harness could not run because this environment has no Chromium executable and the browser installation path was unavailable. Do not treat prototype browser checks as validation of this Worker port.

No production deployment was performed.
