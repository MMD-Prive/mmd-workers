# Partner Control Room — implementation and pilot acceptance

Lovable remains paused. This increment closes the outstanding implementation paths after #1504/#1506. It does **not** certify an authenticated pilot journey or authorize synthetic payments, identity binding or messages to a real Partner.

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
| Partner identity onboarding | LINE continues to open the read/manage dashboard. Telegram binding is the required final onboarding step before any Dashboard job response. The UI removes response controls until the canonical Partner record has both a numeric Telegram ID and `verified` status, and the API independently enforces the same gate before every write. |

## Live pilot prerequisites observed on 2026-09-21

Read-only Airtable checks found:

- Kendo is Active and recognized; Telegram verification is absent.
- The existing pilot Session remains `payment_status: pending`.
- Its existing referral snapshot declares `commission_terms: not_set` and `commercial_terms: case_by_case`.

Therefore a complete money/confirm journey still needs an actual approved commercial agreement, genuine Telegram binding by Kendo, and a genuinely verified payment. Kendo must use **Connect Telegram** and press **Start** in Telegram; no operator should enter or infer a Telegram ID on Kendo's behalf. Do not choose a rate, create a payment, or confirm a job to make acceptance pass. The owner reconciliation screen is prepared for the real agreement.

Login: <https://mmdbkk.com/sigil/model/dashboard/partner-login>
Owner review: <https://mmdbkk.com/internal/admin/partners>

## Validation

- Partner runtime/DOM suite: 73 tests, including Telegram onboarding/API enforcement, concurrent materialization, ambiguous-write fencing, historical and legacy agreement handling, deposit/final/refund scenarios, 305-row pagination, scoped photo review/publication/revocation, canonical sales resolver and encrypted backup recovery.
- Admin scope suite: 18 tests covering credential-bound owner access, exact-origin writes, fixed service routes, canonical creation/capture and bundled Co-Partner payout contracts.
- TypeScript and `git diff --check` pass.
- These are fixture/DOM tests, not visual mobile/desktop/PDF or authenticated pilot acceptance.

## Operational limits and final handoff gate

1. Genuine Partner/owner browser acceptance must cover login, private vault restore, owner image preview and printable earnings at mobile and desktop sizes. The supported browser previously blocked local/file preview; no alternative browser or network workaround is permitted. Public production/login checks alone cannot certify this.
2. Existing downstream customer channels may intentionally limit the length of customer-safe profile excerpts. The full approved copy and links are retained in the canonical keyword profile; approval does not change channel entitlement policy.
3. A mutation fence left in `reconciliation_required` needs operator investigation. Its deterministic R2 receipt records resource scope, route, record ID and nonce. Confirm the original Worker invocation has stopped, read back canonical records and deterministic source keys, and reconcile uncertain writes before an operator releases the fence. There is deliberately no automatic timed takeover. This coordinates Partner-owned mutations, not arbitrary external Airtable writers.
4. A refund after an already recorded transfer requires actual financial reconciliation. Never delete or relabel the transfer as though no payment occurred.

Only mark full pilot handoff complete after the genuine-event and browser evidence above exists. Do not equate a merged/deployed increment with end-to-end pilot completion.
