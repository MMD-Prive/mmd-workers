# Relax Spa by 9: room-only pricing and revenue settlement

New work uses schema v3. The spa rate is **room only, excluding Therapist**.
No rate image was available for this implementation, so no room prices are
seeded. Owner must enter the actual terms and rate evidence. This document is
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

A merge affecting these paths triggers the existing MMS, Admin and Partner deploy
workflows. MMS now defaults to code-only deployment with retained vars and no
secret file. Telegram rotation and missing Therapist secret initialization each
require separate explicit workflow-dispatch inputs, default false. Normal deploy
only verifies R2 availability and never creates the bucket. No binding/config
migration is needed for this release. Optional rotation retains the existing
shared concurrency lock.

The existing **Admin** workflow can provision private media/KV and sync missing
routes. The existing **Partner** workflow can create missing routes. Those broader
operations are not authorized by this change. Before an approved production merge,
use the following controlled release plan:

1. Obtain approval for the exact PR head and code-only release of mms-worker,
   admin-worker and partners-worker, including temporary suspension/restoration of
   their three automatic deploy workflows. Record current enabled states.
2. Pause those deploy workflows, merge the reviewed head, and read back the merge
   SHA. This avoids triggering unrelated provisioning or route synchronization.
3. Read deployed settings and exact existing bindings for all three Workers into
   private temporary configs. Preserve the runtime-generated Admin availability
   KV binding; stop on missing/ambiguous binding identity. Do not create resources.
4. Build and validate the three code bundles at the approved merge SHA. Use
   version uploads with retained vars and all existing bindings/secrets, no secret
   file and no route/provisioning step. Do not use direct-deploy migration fallback.
5. Promote only the approved versions, MMS first, then Admin and Partner. Record
   version IDs and 100% traffic readbacks. Verify bindings/route inventory unchanged
   and restore only workflows that were previously enabled.
6. Run authorized read-only Owner and two-Partner session checks on mobile. Real
   receipt/refund/payout acceptance needs separate authorization and human evidence;
   never create fake financial events in production.

Rollback promotes recorded prior Worker versions; it does not rewrite ledger data
or rate snapshots. No merge, workflow suspension, deploy, route/secret mutation or
production money event has been performed by writing this guide.
