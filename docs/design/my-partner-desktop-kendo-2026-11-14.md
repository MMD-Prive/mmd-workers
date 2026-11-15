# MY PARTNER · Desktop first / Kendo mobile

Owner clarification, 14 November 2026 (Asia/Bangkok): desktop is the primary workspace. The mobile user is Partner **Kendo**, correcting “Kenji”. This is responsive MY PARTNER on the existing routes; no new persona, account, or permission tier.

## Implemented

- Desktop workspace expands to 1560 px, with a persistent sidebar exposing the existing modules. Upcoming jobs remain above MY CO MODELS, in the existing chronological order and Partner-controlled Top order.
- Desktop job rows align date/time, model/work, location, and status. Model rows align identity, approved rates/visibility, and profile/photo actions. Intermediate screens use two content columns rather than squeezing three columns.
- At 960 px and below, navigation becomes a compact menu with the existing secondary modules under More. At 600 px and below, job details, model rates, and actions reflow into readable blocks. Text enlargement can reduce navigation to one column.
- Fixed intrinsic select/label width overflowing the Console at 320 px. Model editor fits the viewport, scrolls within the dialog, and retains safe-area spacing. Controls retain a minimum 44 px height and visible keyboard focus.
- Preview builder now emits a repeatable responsive review page for 320/390/430/768/1280/1440 px and 200% text.

## Preserved behavior

LINE authentication, account/assignment checks, routes, response validation, pending request states, Top order persistence, and all API contracts remain unchanged. Visibility remains a request for review, not an immediate global switch. Kendo receives only the information and actions permitted to his existing account. No live messages, uploads, notifications, job transitions, or financial changes were performed during verification.

## Evidence

- Existing Partner tests: 144 passed; TypeScript passed.
- Browser preview uses the production renderer and explicitly labelled synthetic data. Checked 320, 390, 430, 768, 1280, and 1440 px; no page horizontal overflow on the home view. Desktop observed at 1363 px as well.
- Checked 200% text at 320 px; no horizontal overflow. Checked expanded job details, synthetic ETA, wrong-location coordination prefill, Console, and the photo editor at 320 px. Console and photo editor fit their available width after the width fix.
- These checks verify the responsive presentation and existing flow with fixtures. They do not certify LINE login on Kendo’s physical phone or an authenticated Kendo production session.
- Source publication and deployment are recorded in the associated PR and native deployment results; this document is not independent evidence that publication succeeded.

## Rollback

Revert this presentation change and deploy partners-worker through the existing workflow. No data migration, credential change, or account change is required.
