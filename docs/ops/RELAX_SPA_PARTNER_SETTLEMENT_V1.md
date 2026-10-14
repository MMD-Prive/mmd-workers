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

## Workflow audit and approval-bound rollout

The earlier three-Worker rollout plan is superseded by the observed #2378
receipts and the follow-up release boundary below. Do not pause workflows or
repeat that rollout to collect evidence. The current patch changes only the MMS
producer, its tests and this document; it does not require an Admin/Partner release.

## Read-only follow-up audit — 2026-10-14

PR [#2378](https://github.com/MMD-Prive/mmd-workers/pull/2378) merged as
`857d1949275a8c164aa1798049091fdc15e9999e`. This follow-up started from current main
`095622b8ebf5986af64097aa6e492ee7160ea753`, retaining intervening changes.

| Worker | PR #2378 receipt | Dashboard active version / traffic |
| --- | --- | --- |
| MMS | [38533343085](https://github.com/MMD-Prive/mmd-workers/actions/runs/38533343085), `3e3cd902-9dfd-4bb1-bd35-49d697173419` | `3e3cd902`, 100% |
| Admin | [38533343021](https://github.com/MMD-Prive/mmd-workers/actions/runs/38533343021), `8e12209c-40bb-4974-b404-e2af0bbc2306` | superseded by `6642bbb4`, 100% |
| Partner | [38533343122](https://github.com/MMD-Prive/mmd-workers/actions/runs/38533343122), `8d361c82-bd01-43cc-87ec-a34a850616ac` | `8d361c82`, 100% |

Admin subsequently deployed from main `095622b8` through
[Deploy Kenji Recommendation Layer 38533462943](https://github.com/MMD-Prive/mmd-workers/actions/runs/38533462943),
version `6642bbb4-10e6-4926-b983-227771e576d0`. Its trigger was `workflow_run`,
not a manual re-rollout of #2378.

#2378 logs report Admin route sync 146/146 with created=0 and Partner 6/6 with
created=0. Those are the configured patterns processed by each sync, not an
inventory of every route attached to each Worker. Current dashboard lists 286
Admin zone routes and 10 Partner zone routes; MMS has no custom domains/routes.
No complete pre-deploy route/binding/secret-name baseline was available, so this
is not proof that every historical setting remained identical. A sync invocation
is not evidence of a resource mutation. HTTP success is not settings evidence.

Current settings were read in an existing authenticated Cloudflare browser
session, without revealing secret values: MMS has 5 resource bindings / 8 secret
names; Admin 28 bindings / 27 secret names; Partner 5 bindings / 7 secret names.
MMS includes `RELAX_SPA_LEDGER`, `MMS_DISPATCH_COORDINATOR`, `MMS_COORDINATOR`,
`MMS_PRIVATE_UPLOADS`, `TELEGRAM_WORKER`; Admin and Partner both bind `MMS_WORKER`.
#2378 MMS Telegram rotation and Therapist secret initialization steps were skipped.
No claim is made about secret value equality or historical rotation outside those
steps. CLI metadata readback was unavailable with local expired authentication;
no replacement credential was created.

The Owner Relax Spa page redirected the existing Chrome session to login. A
separate legacy diagnostic page remaining readable does not establish the signed
Owner session required here. Two Partner sessions and a Therapist session are
still required. No authenticated role isolation, mobile acceptance, actual
service, payment or complete online E2E success is claimed. No real job, offer,
notification, receipt or payout was created for this audit.

Rate evidence candidate:
[Relax Spa by 9.png](https://drive.google.com/file/d/1NL95OSzsyJ-PlHy6VNyfqNMkPIvbX0ok/view).
It is a logo only. Actual room type, price, unit meaning, covered duration,
inclusions and effective date remain unconfirmed; keep the rate draft incomplete.
The confirmed commercial meaning is room-only, excluding Therapist.

### Release boundary for the follow-up patch

Do not merge this follow-up as a read-only audit step: changes under `mms-worker/**`
automatically run `Deploy mms-worker` on main. The patch does not match Admin or
Partner deploy path filters, so their provision/route-sync steps are unnecessary.
Admin's successful deploy can itself trigger the Kenji recommendation workflow;
therefore deploying Admin is not a harmless substitute for a targeted MMS release.
No workflow was paused and no production settings changed during this audit.

The current MMS workflow skips optional secret writes by default and uses a
route-free config, but uploads bindings from the repository and can fall back to
a direct migration deploy on error 10211. It cannot by itself prove that all live
bindings are preserved. For a strictly code-only release, prepare a separate
reviewed release job that reads the active version and non-versioned settings,
asserts one 100% active version, uploads the built code with every existing binding
inherited, no migrations, and identical compatibility/runtime settings, then
compares metadata before promotion. Fail rather than fall back to a direct deploy.
Do not call routes, script-settings, resource provisioning or secret-write APIs.
Cloudflare's ordinary script-version upload inherits from the latest uploaded
version, which can differ from active: require latest=active and strict binding
inheritance, or use the version-pinned Workers Versions API. See
[official inheritance rules](https://developers.cloudflare.com/workers/observability/errors/).
This procedure has not been executed or validated against production credentials.

After explicit release authorization, pin the reviewed PR head and green CI,
re-read the production baseline immediately before upload, record the new version
receipt and promote only MMS. Rollback is promotion of the captured previous MMS
version (currently `3e3cd902-9dfd-4bb1-bd35-49d697173419`) without rebuilding,
route sync, secret rotation or data rollback. Refresh that rollback target if
another release intervenes. #2378 must not be rolled out again as a new release.


### Owner session follow-up and bundled-script failure

The existing Chrome session subsequently reached the Owner dashboard and opened
`/internal/admin/mms/relax-spa`. The page shell loaded, but remained at the loading
message. Browser console showed `ReferenceError: __name is not defined` inside
`spaBrowser`. No snapshot, preview or monetary action was submitted.

The renderer serializes a function with `toString()`. Bundling with function-name
preservation injects references to the Worker's naming helper, which is absent in
the rendered browser script. The rendered script now provides a block-scoped
identity helper. A regression bundles the renderer with `keepNames:true` and boots
both Owner and Partner DOMs; this failed before the fix and passes after it.
Nine focused UI tests pass locally. This is source-level repair, not evidence that
the deployed page is fixed. Preserve the newer shared theme merged in #2381;
this patch does not redesign or revert it.

The enlarged patch now includes the shared Admin/Partner renderer. Its merge
would therefore also trigger Admin and Partner deployment workflows, including
Admin's downstream Kenji workflow; the earlier MMS-only release boundary no
longer describes this head. Keep the PR unmerged until a code-only release for
all affected Workers is reviewed and authorized. No workflow was disabled and no
production deploy, route, resource or secret mutation was performed.
