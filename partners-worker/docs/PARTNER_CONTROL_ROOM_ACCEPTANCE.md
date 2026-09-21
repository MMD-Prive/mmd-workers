# Partner Control Room — implementation and pilot acceptance

Lovable remains paused. This document is the **Partner Dashboard Phase 1 closure contract**. Phase 1 uses verified LINE Partner access as the Dashboard authority. Telegram is explicitly deferred and optional; it may add notifications later but is not an authentication or job-response gate. Payment Truth, owner approval and scoped Partner authority remain fail-closed.

## Implemented and tested

| Area | Evidence / behavior |
| --- | --- |
| Agreement capture | Canonical Create Job calls partners-worker with only the linked Session ID. The authority reads approved canonical terms itself. New bookings freeze current approved terms; historical bookings use independently dated approval history. Browser rates and Partner IDs never determine financial truth. |
| Existing unpriced jobs | Owner console can explicitly attach an approved agreement to a legacy `commission_terms: not_set` Session. It preserves the original snapshot, actual approval timestamp, owner identity and reconciliation reason. It never silently backdates an agreement. |
| Settlement | Owner reviews the actual total and chooses one verified full receipt or verified deposit + final receipts. Duplicate/foreign/refunded/void receipts block settlement. Tips are excluded. A historical final-payment-only basis remains final-payment-only. Profit Share requires a cost total and evidence reference, including explicit zero costs. |
| Ledger / payout | Locked receipt and agreement snapshots determine commission. Completion review, holds, current receipts and recalculated ledger amounts are checked before approval/payment. Durable transfer reference; conflicting replay rejected. Owner can void an unpaid commission with evidence; a recorded transfer cannot be erased. |
| Concurrency | Existing R2 conditional writes serialize Partner owner decisions by Model and financial writes by Session. Competing requests return conflict. An uncertain upstream write stays fenced for reconciliation rather than allowing a potentially duplicate transfer/intake. Approved agreement versions increase even when draft versions collide. Future-effective proposals stay in review until effective, preserving the current agreement. |
| Profiles | Only approved shared copy reaches Models and canonical Model Keyword Profiles. Age/profile/skills/experience and all three portfolio/news links propagate to customer-safe copy. Existing customer/visibility policy is preserved; a new keyword profile defaults to public-Kenji No. Pending proposals do not replace the current profile. |
| Media | Owner opens the actual scoped image, then approves its exact SHA-256 and public use. Only that approval publishes the cover into the canonical media registry and Models Public Image URL. The public image endpoint verifies approval, digest and current canonical cover on every read. Archive revokes publication. Private original keys remain internal. |
| Sales policy | Partner detail uses the shared canonical sales resolver for current Bangkok-time audience policy previews, including schedule expiry and hidden rates. A preview never creates a customer identity or grants an entitlement. Exact-client rules cannot become model-wide rules. |
| History / reports | Airtable offsets are followed through all pages. Exact Partner-link filtering is retained. Void/refund/reversal/held states are excluded from pending earnings; paid status is exact, not a substring such as “unpaid”. CSV and print views use the complete returned history. |
| Private Vault | AES-GCM/PBKDF2 remains browser-only. Import checks decrypted Partner ownership and re-encrypts with the current PIN. Failed saves fence queued writes; unsaved notes can be exported encrypted. Stale server revisions cannot overwrite another device. Lock/login expiry clears private editor state. |
| Notifications / coordination | Partner Activity includes commission/payment history and durable payout references as well as shared requests and owner replies. Existing admin Telegram notifications remain. Console is an explicit shared coordination request queue; it does not automatically send customer messages. |
| Partner identity onboarding | LINE opens and authorizes the read/manage dashboard. A valid Partner token plus canonical Partner scope is sufficient for Dashboard actions. Telegram is optional and may be connected later for notifications; it never grants Partner authority. Job responses remain independently blocked until canonical Payment Truth reaches Official Verify. |

## Phase 1 live state observed on 2026-09-22

Read-only production checks found:

- Kendo is `Active` and `recognized`.
- Kendo's verified LINE claim is linked to the canonical Partner record.
- A fresh Partner access-token hash exists after Kendo used the LINE entry, confirming the real Partner LINE exchange path reached token issuance.
- Telegram verification is absent by design and does not block Phase 1.
- Kendo has two linked model referrals in the current roster.
- The existing pilot Session remains `payment_status: pending`.
- No synthetic payment, rate, agreement or job confirmation was created to force acceptance.

Phase 1 therefore closes around real LINE access, Dashboard operations, model/roster control, agreements/proposals, private vault, reporting and the Payment Truth gate. A real Confirm/Changes/Decline event will become available automatically when a genuinely linked Session reaches Official Verify. Telegram can be added later as an optional notification channel without changing Partner authority.

Login: <https://mmdbkk.com/sigil/model/dashboard/partner-login>
Owner review: <https://mmdbkk.com/internal/admin/partners>

## Validation

- Partner runtime/DOM suite covers optional Telegram behavior, LINE-authorized Dashboard actions, Payment Truth enforcement, concurrent materialization, ambiguous-write fencing, historical and legacy agreement handling, deposit/final/refund scenarios, paginated history, scoped photo review/publication/revocation, canonical sales resolver and encrypted backup recovery.
- Admin scope suite: 18 tests covering credential-bound owner access, exact-origin writes, fixed service routes, canonical creation/capture and bundled Co-Partner payout contracts.
- TypeScript and `git diff --check` pass.
- These are fixture/DOM tests, not visual mobile/desktop/PDF or authenticated pilot acceptance.

## Phase 1 closure and deferred work

Phase 1 is considered operationally closed when this change is merged, deployed, and the production smoke remains green. The closed scope is: LINE login, Home/Jobs, Models, model detail/edit/add/remove requests, media review handoff, Agreements, System 1/2/3 proposals, Sales Control/visibility/audience proposals, Earnings/Performance, Partner Console, private external schedule/notes, Private Vault, and Payment Truth-gated job responses.

Deferred beyond Phase 1:
1. Telegram Partner binding and direct Partner notification UX.
2. Real-event job confirmation until a genuine Session reaches Official Verify; never fabricate a payment to make this happen.
3. Broader visual UAT refinements that do not change authority or data correctness.
4. Historical financial reconciliation when a legacy row is ambiguous. A recorded transfer must never be deleted or relabeled as though no payment occurred.

Existing downstream customer channels may intentionally limit customer-safe excerpts; approval does not widen entitlement policy. Mutation fences in `reconciliation_required` remain manual-reconciliation events and never auto-take over.
