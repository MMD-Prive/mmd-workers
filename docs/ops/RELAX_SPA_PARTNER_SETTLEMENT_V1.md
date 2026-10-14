# Relax Spa by 9: room-only pricing and revenue settlement

New work uses schema v3. The spa rate is **room only, excluding Therapist**.
The available Drive image `Relax Spa by 9.png` was inspected on 2026-10-14
and contains only the logo, not a rate sheet. No room prices are seeded. Owner must enter the actual terms and rate evidence. This document is
not deployment, bank verification or authenticated customer acceptance evidence.

## Formula and agreement

All amounts are integer satang. Define C = agreed customer price before explicit
discounts; T = Therapist fee including home-to-spa round-trip travel; R = agreed
room total; P = explicit referral fee (zero allowed); M = MMS amount.

- Fixed MMS fee: C = T + R + P + M. A supplied C must match exactly.
- Residual MMS: M = C - T - R - P, never negative. A supplied M must match.
- No percentages, default rates, automatic travel additions, hourly multiplication
  or minute prorating are used for new room agreements. No net profit is asserted.

Room terms record type, total R, agreed unit count, covered minutes, unit
meaning, inclusions and rate evidence. Coverage must include the service duration.
Travel assessment records estimate (including confirmed zero), actual transport
mode, assessment date, round-trip evidence and the confirming Owner. Unknown
travel is not zero. Travel remains inside T and is not an additional charge.
Named payees identify the actual recipients for Therapist, room, referral and MMS.
The spa and referrer are distinct roles even when both pay the same actual account.

Discounts, refunds, fees and tax use fixed-satang entries with an explicit bearer
and evidence. After C/T/R/P/M allocation, subtract each entry from its bearer.
Negative party allocations fail. Required gross receipts equal C minus discounts;
actual pre-settlement refunds must equal approved refunds. Final shares plus
fee/tax reserves must equal gross receipts minus refunds exactly. V3 rounds
nothing: input precision beyond one satang fails. V1/V2 retain their own frozen
formula and largest-remainder policy.

## Existing pages and lifecycle

Owner: `/internal/admin/mms/relax-spa`, using the existing signed credential-bound
session. Partner: `/partner/dashboard/relax-spa?t=<existing-token>`, using existing
recognized Partner checks. No domains, accounts or public route ownership change.

1. Partner recommends an existing Active Therapist; Owner records spa acceptance.
2. Owner prepares T, room terms, P/M, payees and adjustments. An incomplete draft
   can be saved and copied to a new version. It cannot confirm or quote.
3. A non-persisting server preview shows C/T/R/P/M, adjustments and balanced totals.
   Changing fields invalidates the preview. Owner explicitly confirms the terms.
4. Quote freezes the approved agreement, payees, formula, exact allocation preview
   and approver in the service. Changing rates creates new versions only.
5. Create a job from the frozen quote or link a verified existing MMS job.
6. Therapist accepts, starts and completes service through the existing MMS app.
7. Owner inspects and records actual receipts with the actual receiver and unique
   transaction evidence. Partial receipts and outstanding amounts remain visible.
8. Settlement rechecks canonical Completed status, Therapist, duration, venue,
   customer price, payable Therapist amount and confirmed inclusive travel. Full
   inspected receipts and approved refunds are required.
9. Owner records actual share payouts to agreed payees and expense payments for
   fee/tax reserves. Closing requires every payable amount to reconcile.

No command in this ledger transfers money. Recorded payment events are manual
Owner evidence review, not automatic bank/slip verification or global Payments
writes. Do not record the same earning in Model Partner Commissions as well.

## Quote-to-job producer and retry boundary

`create-job` is Owner-only and uses a deterministic canonical Job ID per service.
The ledger transaction reserves the immutable start/evidence/quote and a bounded
creation lease. Concurrent clicks return pending. Failed/ambiguous operations
retry the same reservation. Airtable `performUpsert` matches Job ID / Offer ID;
readback refuses conflicting snapshots and never rewrites an accepted job status.
A partial write retains the reservation for reconciliation; it never produces
another Job ID.

Dispatch initialization must succeed before a new Offer row becomes visible;
otherwise a Therapist can accept before dispatch has a job. Initialization failure
leaves no visible offer, and retry reuses the existing Job ID. Existing offers must
match the complete safe display snapshot (including payout, deductions, duration,
start, expiry and included travel), not just their payout column. Conflicts fail
with `JOB_SNAPSHOT_MISMATCH`; retry never repairs them by overwriting an accepted
offer. Reconcile conflicting records through a separately reviewed operation.

The producer uses existing MMS Jobs, Offers and Dispatch Coordinator bindings.
It creates one offer for the agreed Therapist; it does not accept for them. The
Therapist sees T, explicitly agreed deductions and the resulting payable amount,
with travel labeled included. Private room/customer/MMS details remain outside
the offer projection. Generic dispatch still uses its existing pricing path;
this producer never invokes the general 70/30 formula.

Existing-job linking must verify Therapist, venue, duration, C, payable T and
explicit travel inclusion from canonical data. Missing prices/travel fail as
unconfirmed. A confirmed zero additional travel amount is allowed; absent
metadata is never converted to zero or used to skip C verification.

## Compatibility, corrections and access

The same `relax-spa-by-9:v1` object and `state` key remain. No Cloudflare migration,
new namespace, Airtable field or destructive data migration is introduced.
Persisted v1/v2 jobs and approved/paid snapshots are not rewritten or recomputed
with v3. Existing quoted v2 jobs retain their own link/settlement formula; new
agreement creation and quoting require v3.

After approval/payment, Owner records customer-refund and payee-return corrections
as new immutable, evidenced entries with the exact role, fixed-satang amount,
reason, terms reference, time and explicit approval. Original settlement/payouts
remain unchanged. A refund reduces only its named role's reviewed target; money
already paid beyond that target becomes due back. Actual returned cash is capped
by that due amount. Unpaid roles pay the corrected target. The job reopens as
reconciling and can close only when corrected net payouts and expenses balance.
Other post-approval rate/price/expense changes require a separate reviewed plan;
the API refuses silent amendments to original records.

Only Owner can quote, create/link jobs, record money, approve, correct or close.
Partner snapshots include only their referrals, own share/net payout/return due
and scoped status; they exclude agreement/travel, receipts, other payouts, private
job creation claims and correction evidence. Same-origin gateways derive actor
identity from existing sessions. Request fingerprints, normalized unique evidence,
canonical Job uniqueness, storage transactions and append-only audits protect
retries and cross-account access. Existing archive limits remain in force.

## Current review and release boundary (2026-10-14)

PR #2386 merged at `7ff1c49565ef79e017a87dc4509a4ce6ea62f677` fixes the
serialized browser `__name` dependency and adds the post-bundle Owner/Partner
regression with keepNames. PR #2382 retains those main changes exactly; it does
not add a second helper, revert the white/green/light-gray theme, or require
another release of the same UI fix. Local bundled UI tests pass (9 cases).

The real signed Owner session now loads the Relax Spa snapshot and shows
“อ่านรายการจากระบบแล้ว”, with zero referrals/agreements/jobs. The previous
loading/error result is superseded. No actual room agreement is available for a
valid production preview. Do not invent rate evidence to claim a successful
monetary preview. Two Partner sessions and a Therapist session are still needed;
authenticated account isolation and complete service/payment E2E are unverified.

Only MMS producer/release code, their tests and this document remain in #2382.
The producer initializes dispatch before making a new offer visible. Retry checks
the complete safe payload plus the real job/offer fallback fields: service,
duration, start, venue, travel inclusion, payable amount, deduction note and
expiry. Unagreed ETA fields are rejected. Conflicts fail without rewriting an
accepted record. Lost replies after Job or Offer writes reuse the same IDs.

### Release method and automatic effects

Merging this final scope triggers **Deploy mms-worker** only. Admin/Partner paths,
the shared renderer/theme, and their workflow files are unchanged from main.
There is no reason to invoke their provisioning, route-sync or downstream Kenji
workflows. Do not pause workflows during this read-only audit or rerun #2378/#2386.

Use the reviewed exact head with green CI. Existing MMS workflow uploads a version
with `--keep-vars` and no secrets file on normal pushes; Telegram rotation and
Therapist secret initialization are explicit default-false dispatch inputs. It
reads R2 availability and does not create the bucket. Promotion reuses the existing
`deploy-uploaded-worker-version.mjs` helper: only the deployments API is written,
with exact version/100% readback; Wrangler non-versioned settings sync is avoided.
The uploader now refuses
migration error 10211 by default instead of falling back to a direct deployment.
The separate library migration path requires explicit `allowMigration:true`; the
production CLI does not set it. Upload failures must stop promotion.

Before an authorized release, read back and retain the active version/100% traffic,
routes, named bindings with resource identities, compatibility settings and secret
names. Compare all candidate binding targets with this baseline; `--keep-vars`
alone is not evidence of resource-binding preservation. Refuse an unresolved or
changed binding and do not create it. Candidate config/DO migrations are unchanged
from deployed main. Current expected resource targets are:

- MMS_COORDINATOR -> mms-worker_MmsCoordinator
- MMS_DISPATCH_COORDINATOR -> mms-worker_MmsDispatchCoordinator
- RELAX_SPA_LEDGER -> mms-worker_RelaxSpaLedger
- MMS_PRIVATE_UPLOADS -> mms-private-uploads
- TELEGRAM_WORKER -> telegram-worker

MMS has no custom routes. Use existing credentials without printing values. Do not
call route, secret-write, resource-provisioning or non-versioned settings mutation
commands. Capture upload receipt, promote only that new MMS version, then compare
the same baseline and traffic. No release was performed by preparing this patch.
Local CLI credentials are unavailable/expired, so the production binding comparison
and execution are still release gates rather than a claim of completed validation.

Rollback promotes the MMS version captured immediately before the authorized
release, currently `3e3cd902-9dfd-4bb1-bd35-49d697173419`, without rebuilding,
changing settings or reverting ledger data. Refresh the target if another release
intervenes. This is an emergency rollback target, not authorization to re-rollout
#2378 for evidence.

### Evidence and open inputs

#2378 receipts: MMS38533343085 / Admin38533343021 / Partner38533343122. Its MMS
rotation/auth-initialization steps were skipped. Admin sync processed146/146,
created0; Partner processed6/6, created0. Those are processed pattern counts, not
full inventory or proof that all historical settings stayed identical. A complete
pre-#2378 baseline was not available; historical equality is unproven.

Subsequent #2386 Admin38539050931 and Partner38539050995 succeeded at7ff1c495.
Those receipts are distinct from live traffic/readback and authenticated checks.
Sanitized audit evidence remains under local output/relax-spa-audit/.

The known Drive image Relax Spa by 9.png (file1NL95OSzsyJ-PlHy6VNyfqNMkPIvbX0ok)
is a logo, not a room-rate sheet. Price, unit, room type, coverage, inclusions and
effective date remain incomplete. Keep the rate as a draft, with no seeded price.

The user supplied the approved Male Massage AI PNG (1983x793), SHA256
`4ed6770759e92887e9c6c8eec7941ccb28fa58dd332fe44fea1e06511a9fb5b6`.
The Internal MMS header and Internal Relax Spa page use those exact bytes, without
crop/recolor/resampling. A compact dark-green holder keeps cream text legible;
CSS preserves the original ratio and wraps the header on mobile. The hashed PNG
URL lives under the existing authenticated Internal MMS route tree and uses
private caching; no Cloudflare route or storage binding is added. GET/HEAD use the
same existing admin auth gate; other methods are refused. The shared Partner
renderer and global SĪGIL branding are unchanged. Only Admin requires a release
for this branding follow-up; its existing downstream deployment effects still
require explicit release authorization.
