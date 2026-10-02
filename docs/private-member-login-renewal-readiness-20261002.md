# Private member login and assisted renewal — 2026-10-02

Status: code/fixture verified; production customer flow NOT VERIFIED. No release, customer record change, payment approval, or slip verification was performed.

## Entry and today's evidence

- Private login: https://mmdbkk.com/member/liff?world=private
- Private membership: https://mmdbkk.com/sigil/member/membership?intent=renew&world=private
- Payment Center: https://mmdbkk.com/my-mmd/payments
- Compatibility entry: https://mmdbkk.com/pay/renewal
- Official human review desk: https://mmdbkk.com/internal/ceo/payment-slip-inbox
- Matching/recovery desk: https://mmdbkk.com/internal/admin/payments

The first four URLs were GET-tested from the Mac shell and each returned HTTP 403. This is a verification blocker, not evidence of a working or broken authenticated customer flow. No browser/session takeover was attempted. The owner desk URLs above come from repository contracts and were not authenticated/live-tested.

Code at base 7bf963d supports signed payment handoff to `/sigil/pay?t=...`; `/pay/renewal` is a redirect bridge, not a standalone bank-payment page. An unsigned renewal redirects to Private membership; a signed one retains only `t`. Public purchases stay on `/pay/membership` and signed `/pay/checkout`.

## Customer and Per steps

1. Customer opens Private login in the original LINE account. Read canonical status/tier/expiry; missing or unresolved evidence remains checking/review required. Lite means Standard; Per Rename is the legacy naming source. A date in a renamed label is a renewal date, not an expiry. VIP/Black Card/SVIP must not be downgraded because a lookup is missing.
2. For renewal, continue the existing package from a verified member session. Standard/Premium quote is calculated server-side, not from a browser amount. Unsupported/protected tiers need owner review. New signup is a separate intent. Do not estimate a protected member's plan or term.
3. Check Payment Center for an existing reference before issuing a new payment. Continue its signed checkout. If a slip is already received/pending review, wait; do not pay or upload again. Session expiry requires LINE login again. Cross-session persistence/recovery still needs a live acceptance check; the current BFF snapshot is session-backed.
4. Before transfer, customer checks the reference, purpose=membership, member, expected amount and bank instructions issued by the canonical payment backend. If no valid quote/reference/instructions exist, Per must resolve identity/package and issue the canonical payment handoff first. Do not use an arbitrary bank account or an amount guessed from LINE notes.
5. Customer attaches one slip on that exact signed checkout. If upload/observer is unavailable, send the reference plus slip in the same original MMD LINE chat and ask Per to match that evidence to the exact canonical member and renewal. Sending a chat message alone does not prove it is stored in the review queue. Keep it pending until the evidence record and linkage are confirmed.
6. Per logs into the CEO slip inbox or admin payments desk, finds the exact proof/reference, and confirms money arrival independently. Check recipient, amount, date/time, member/LINE identity, package, renewal term and any duplicate payment. Missing OCR/reference/linkage belongs in matching/recovery, never blind approval. Use the existing membership owner-match UI; do not match only on a familiar amount. Historical corrupt sessions/points are outside this decision.
7. Per makes the explicit Official Verify decision with a reason. The admin review contract requires proof ID and a stable unique idempotency key, then calls payments-worker reviewed-proof. It must remain the sole money authority. This task did not execute that decision.
8. After approval, check both money truth and membership write-through. `manual_membership_review_required`, failed write-through or failed audit is unresolved even if money was confirmed. Confirm member expiry/access in canonical backend before telling the customer renewal is active. Reload Private login and check the same member; points follow the authoritative ledger, never the uploaded slip alone. Retry the same decision key for delivery recovery, not a second settlement.

Review contracts: `GET /v1/admin/payments/review-queue`, `GET /v1/admin/payments/evidence?proof_id=...`, `POST /v1/admin/payments/review`. All require an authenticated admin. The queue is read-only. Existing approval guards reject missing/ambiguous context; reviewed membership has its own fail-closed write-through. See `webflow/internal/ceo/payment-slip-inbox/README.md`, `admin-worker/src/payment-review-runtime.js`, and `payments-worker/reviewed-membership-write-through.js`.

## Patch and limits

- Start an independent canonical `/api/member/app/membership` read alongside full profile, rendering verified tier/status/expiry without waiting for the profile archive/contact/points decorator. Points remain unknown until their own authoritative result. This endpoint still uses the auth profile resolver; there is no measured production latency guarantee.
- Keep unsigned renewal compatibility entries in `world=private` even if browser context says public. Signed URLs still contain only `t`.
- Make `pending_review` and `under_review` proofs visible to the existing human queue, preserving explicit approval and settlement guards.
- Guard repeated renewal clicks, resume session-backed pending payment before issuing another intent, and provide evidence/reference instructions when setup fails. The legacy `/member/renewal` Webflow CTA is the surface changed here; canonical membership and the current MY MMD application have their own route owners. Publish of the global CTA requires a separately approved Webflow release if this legacy page is still used.

Points policy was not changed. Current deployed code applies expiring lots to customer redeemable points. It must not be used as the requested gross historical nominee report. Known corrupt approved sessions/Champ points remain a separate explicit data-correction approval; an authoritative ledger row can still contain bad historic input. No snapshot import, ledger repair, expiry/deduction change, or rights materialization was done.

## Validation and release gate

Local fixture suites: auth LIFF profile 82/82; member pages LIFF 377/377; payment route governance 33/33; payment review 38/38; unified payment/proof/renewal settlement 71/71. Syntax checks and git diff whitespace check passed. Added behavioral tests cover early membership rendering with a deferred profile, active/expired/unknown/protected display, Private world, repeated click, pending payment resume, expired session, unavailable payment status, and queue visibility without writes. Existing suites cover renew/signup separation, stable session/reload handling, proof dedupe, and settlement failure without entitlement/points grants.

The installed Node rejects repository `--experimental-default-type=module` and `--default-type=module` flags. The 71 unified-payment tests were run on an unchanged file mirror in `/tmp/mmd-renewal-module-tests` with root `type:module` (payments-worker/shared/webflow/auth-worker copied); no source behavior was modified for the run. Native npm command remains incompatible with this host runtime.

Before release: parent approves scope, merge and deploy separately; check conflicts with ongoing LIFF work; run CI on the supported Node runtime; authenticate on staging/live read-only and measure login/status/points latency; use approved synthetic fixtures to verify quote and proof-review-to-renewal loop; confirm observer-independent queue access. No real test transfer, slip approval, customer message, or new entitlement may be used without separate authorization.
