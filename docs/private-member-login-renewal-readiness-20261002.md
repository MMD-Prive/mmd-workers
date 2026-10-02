# Private member login and assisted renewal — 2026-10-02

Status: code/fixture verified; production customer flow NOT VERIFIED. No release, customer record change, payment approval, or slip verification was performed.

## Entry and today's evidence

- Public Private entry (user-selected): https://mmdbkk.com/sigil/start
- LINE identity runtime: https://mmdbkk.com/member/liff?world=private
- Private membership: https://mmdbkk.com/sigil/member/membership?intent=renew&world=private
- Payment Center: https://mmdbkk.com/my-mmd/payments
- Compatibility entry: https://mmdbkk.com/pay/renewal
- Official human review desk: https://mmdbkk.com/internal/ceo/payment-slip-inbox
- Matching/recovery desk: https://mmdbkk.com/internal/admin/payments

Shell GETs returned 403, but subsequent isolated Chrome-extension read-only checks reached the pages without taking over customer or owner sessions:

- `/sigil/start`: actual Private Entry, Member Space links to `/sigil/inme?lang=th`; membership is secondary. The live page is ss31; repository Webflow snapshot is V29. No stale snapshot was published.
- `/sigil/inme?lang=th`: two entrance sections are present together. One shows `/member/login`; the Member Card button was not clicked. Private identity, return and renewal context handoff remain unverified. Start is the public entrance, not evidence of a completed login.
- `/member/liff?world=private`: MY MMD preparation/ENTER shell reached; no LINE sign-in performed.
- `/sigil/member/membership?intent=renew&world=private`: catalog defaults to GuestPass 1,499 and Continue `/member/payments`. This is not an authenticated existing-member renewal quote; do not send members to pay that default as renewal.
- `/my-mmd/payments`: Payment Center reached but displays a load failure in this unverified browser session.
- `/internal/ceo/payment-slip-inbox`: BackOfficeAccessCode gate reached. Per must enter their own code; the queue and decision controls have not been authenticated/live-verified.
- `/sigil/pay` without a token: asks to open the payment link for the exact item. A valid signed checkout was not tested.

Membership and signed checkout pages carry Webflow page/site markers and CDN scripts. Webflow workspace/publication is currently unavailable according to the user. The Worker fixes below do not publish those pages. Admin login is Worker-rendered, but its post-login presentation also needs acceptance testing.
Code at base 7bf963d supports signed payment handoff to `/sigil/pay?t=...`; `/pay/renewal` is a redirect bridge, not a standalone bank-payment page. An unsigned renewal redirects to Private membership; a signed one retains only `t`. Public purchases stay on `/pay/membership` and signed `/pay/checkout`.

## Customer and Per steps

1. Customer starts at `/sigil/start` → Member Space. Complete Private LINE login in the original account; if the public entry handoff fails, the known identity runtime is `/member/liff?world=private`. Read canonical status/tier/expiry; missing or unresolved evidence remains checking/review required. Lite means Standard; Per Rename is the legacy naming source. A date in a renamed label is a renewal date, not an expiry. VIP/Black Card/SVIP must not be downgraded because a lookup is missing.
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

The spendable-points presentation now fails closed when canonical money evidence is absent, ambiguous, incomplete or disagrees with the posted ledger amount/points/session. A posted/approved historical row alone cannot certify points. Missing/read-failed sources no longer fall back to stale profile totals; duplicates and unsupported adjustments remain review required. This may temporarily hide legitimate legacy awards or debits without the required linkage. VIP/Black Card/SVIP and membership status are untouched. No existing ledger was changed, including the known false 6,132,082 THB / 61,320 points and 37 suspect sessions.

A separate historical preview uses the data team's frozen saved-OA job-note estimate adapter, not the suspect points ledger. `/api/member/app/history/preview` accepts only GET/HEAD, same origin, no query selectors, and derives the exact LINE UID from the existing signed session store and expiry checks. The response contains only that UID's whitelisted own preview, private/no-store. No names/amounts from other accounts, raw notes, contacts, model details, index or owner provenance are returned.

The LIFF Points section labels recorded job-history amount and estimated gross points before any expiry/deduction as preliminary and not redeemable or privilege-confirming. Quarantined/missing evidence stays null, never zero. Reload, failed sessions and late stale responses clear the display. The snapshot's 100 THB:1 point baseline is retained independently of redeemable points policy.

The real dataset is NOT in this repository, not bundled and not uploaded. Runtime expects an separately approved private KV provisioning under `private:customer-history-preview:2026-10-02`, pinned to SHA256 `07c390528df0a6900ed7b892c74927fcce2cdc975c37cb4efc733f5550662cf0`. With no valid payload it returns 503 pending, not a fabricated balance. Provisioning requires separate release/data authorization. No new binding, permission, credential, import, ledger repair, expiry/deduction policy change or rights materialization was performed.
## Validation and release gate

Local fixture suites: auth LIFF profile 82/82; member pages LIFF 397/397; payment route governance 33/33; payment review 38/38; unified payment/proof/renewal settlement 81/81. Syntax checks and git diff whitespace check passed. Added behavioral tests cover early membership rendering with a deferred profile, active/expired/unknown/protected display, Private world, repeated click, pending payment resume, expired session, unavailable payment status, and queue visibility without writes. Existing suites cover renew/signup separation, stable session/reload handling, proof dedupe, and settlement failure without entitlement/points grants.

The installed Node rejects repository `--experimental-default-type=module` and `--default-type=module` flags. The unified-payment tests were run on an unchanged file mirror in `/tmp/mmd-renewal-module-tests` with root `type:module` (payments-worker/shared/webflow/auth-worker copied); no source behavior was modified for the run. Native npm command remains incompatible with this host runtime.

Before release: parent approves scope, merge and deploy separately; check conflicts with ongoing LIFF work; run CI on the supported Node runtime; authenticate on staging/live read-only and measure login/status/points latency; use approved synthetic fixtures to verify quote and proof-review-to-renewal loop; confirm observer-independent queue access. No real test transfer, slip approval, customer message, or new entitlement may be used without separate authorization.

## CI blocker

The original draft head 84c77e31b7d6c33c456690fa2a0686c2ec2e9339 triggered six workflows, all startup_failure before jobs/check-runs. Repository Actions permissions at the original draft head reported `enabled:true`, `allowed_actions:local_only`. Required Node.js CI references external `actions/checkout@v4` and `actions/setup-node@v4`; main ruleset requires build(18.x), build(20.x), build(22.x). This policy incompatibility is confirmed; no run-specific annotation exists to prove the precise failure cause. Organization policy cannot be read by this credential (403), so inheritance is unresolved. That original allowlist blocker was subsequently resolved with explicit organization approval, as recorded below. No broad action allowance, credential refresh or protection bypass occurred.

## Owner rule update and additional fixture scope

For an existing Standard/Premium member eligible from the August 2026 promo window, the paid term is exactly two calendar years. If active, start after the existing canonical expiry; if expired, start at the reviewed proof payment/renewal date. August 1 is the eligibility boundary, never a universal expiry anchor. Premium does not stack the former extra year. Pre-August history and fresh new-signup policy are unchanged. Expiry beyond one calendar year is new-signup classification/pricing; discounted renewal is held for review. Quote and reviewed write-through enforce this separately from term duration. Protected VIP/SVIP/Black Card cannot enter a lower Standard/Premium promo or be overwritten by recovery. The two paid Blackcard members remain three years from their respective actual signup dates; their records are untouched and their actual dates were not imported or fabricated.

Historical duplicate payments keep their recorded expiry rather than automatically backfilling the new duration. No production member dates were modified. Recovery still requires canonical Member/Client/renewal binding and successful trusted money confirmation before materialization.

Pending-first intake: retain slip, payer name, claimed amount, timestamp, renewal purpose and pending-match note before account linkage. Completely unlinked evidence and a Client-only link without an exact canonical payment cannot claim verified money or mark paid. A Client-only exact canonical payment can retain the existing money-policy decision, but cannot automatically extend membership without Member/renewal binding. Fully matched owner acceptance is preserved; its pre-existing bank-validation policy was not expanded or rewritten. Points are never awarded by intake. The existing observer's manual queue/delivery still requires live acceptance; collecting a LINE message alone does not prove queue persistence.

Bank route: canonical signed confirmation loader selects active/effective `mmd_payment_primary_v1` from Payment Instructions table `tblTPC2yV1P3CwbgU` for membership/renewal, isolated from shop-only `mmd_shop_himai_v1`. Parent privately verified the primary instruction is the intended Krungthai record. No account destination was copied into this frontend/repository or changed in production. Instruction contract fixtures 14/14 passed; a signed live renewal response is still unverified.

CI update: owner explicitly approved the organization-scoped exact two-action allowlist. It was saved via an already permitted owner browser session with GitHub-owned/Marketplace-wide allowances off; no workflow/runners/fork/credential changes. Effective repo policy reads selected with only `actions/checkout@v4` and `actions/setup-node@v4`; GITHUB_TOKEN remains read and cannot approve PRs. One requested retry of the old Node.js run was rejected as non-retriable startup_failure, so no CI started from that attempt. The next substantive rule/test commit on this same draft branch is the parent-approved validation trigger. Merge/deploy/data upload remain separately gated.

## Minimal display release readiness

Owner authorized expiry and supported points first with exact notice `ข้อมูลยังแสดงไม่ครบ`; complete history is not a release prerequisite. A separate authenticated minimal card lives outside the full-profile/ENTER area so it can show the existing authoritative expiry or own provisional points as soon as either independent read completes. It never invents a missing date, converts recorded gross points to redeemable points, or restores the known false ledger 61,320. One supported historical aggregate can display; the quarantined UIDs keep historical points unknown while independently supported expiry can still show. Missing/unavailable points do not blank expiry, and unknown expiry does not blank supported provisional points. The response adds per-field points state, partial history and the exact notice without changing the pinned private JSON/SHA.

The actual new CI at head `41acb335e2ec5eb901f7ce56fc9c9b1b22f1bec4` (Node.js run `36977913347`, check-run `110745680940`) created checks/jobs but no steps executed. Its exact failure annotation is: “The job was not started because your account is locked due to a billing issue.” Node18 failed;20/22 were cancelled. GitHub billing is now the confirmed required-check blocker. Parent notified the user. No billing/card changes, repeated retry, protection bypass, merge, deploy or private data upload occurred. Keep this release staged until required CI and deployment permissions pass. The final necessary minimal-display push may naturally trigger workflows; it is not evidence of runner execution or test success.
