# Combined Porto, EMs16 and EMs23 guards: draft source-review preparation

## Status and exact scope

This is a draft, source-review release-path preparation based on repository commit
`bade7ff22b27ab8ec3ac83099e868e1b926f373e`. Publishing this draft does not authorize
marking it ready, merging, dispatching, or changing production. The executable policy is
deliberately `null`. Dispatch readiness stops before requesting the protected
release-job approval or accessing production credentials. PR contracts still
run normally while that policy is absent.

The preparation base is provenance for the input files. It is NOT the future
executing release SHA. A future commit adding these files necessarily has its
own SHA; dispatch must use that exact reviewed current main SHA.

The runtime contains only these three canonical exclusions:

- Canonical Porto MJ (`recnl4Fksh6pXEwA1`): exclude fresh automatic selection and
  pending preparation in `model` and `standard`, for every category.
- Canonical EMs16 (`recbdC0waCS3qp452`): exclude those same automatic operations
  only for `exclusive`, `premium`, and `standard`. Public `travel` and `extreme`
  retain the original eligibility and routing rules.
- Canonical EMs23 Faymn (`recHyQc4g70RTldS5`): exclude fresh group-automation
  selection and pending preparation in `model` and `standard`, for every category
  (`exclusive`, `premium`, `standard`, `travel`, `extreme`).

All three cover static and approved-intake cards and future dates without policy
expiry. Each retains its distinct exclusion reason. Identity is determined by
the canonical record ID, not a display name. The changes do not deactivate a
catalog, restrict booking, delete posts, rewrite exposure history, change room
routing/cooldowns, or change any enable flag. Promotion stays OFF. Roster/Tinn,
broad three-month history review, owner alerts and other main-branch work are not
part of the deployed artifact. Do not deploy a full-main Worker build.

## Immutable runtime artifact

- Baseline module: `model-eta-wrapper.js`, 207,037 bytes.
- Baseline SHA256: `d517c7ef259f17f66d1cb991a8cfd69748f08228540ea057b08adc3662cec8ee`.
- Observed baseline version: `88e741df-15bd-40ba-a4ce-f88a2735822b`.
- Observed baseline deployment: `d9617e88-3f2f-4698-a3e5-3853fd197e06`.
- Combined candidate: 207,854 bytes.
- Candidate SHA256: `9bcf5249602cf1505a7c1e70b14d757add0d241cd1949e910c9f2efddcd800a6`.
- Manifest SHA256: `ec6ca187e315b438c4cb771bdcd5bca3422c103eab838b5d33fce58f31d52ae4`.

The builder accepts only the exact reviewed manifest/schema/scope and exact
baseline. It requires two unique anchors in the `compcard-daily` section, pins
the resulting candidate and reverses both changes to the original bytes. The
fresh eligibility expression contains all three independent predicates. The pending
preparation anchor inserts all three checks before asset reads. Other bytes are
unchanged.

The old single-target overlays cannot be applied sequentially: each consumes
the same eligibility anchor and rejects a changed baseline. Do not dispatch or
repurpose the expired Porto-only entry. No future Cloudflare version or
deployment ID is preassigned. Any baseline drift requires a new reviewed
candidate and evidence, not relaxed hash checks.

## Latest observation and unresolved blocker

At 20:27 ICT on 2026-11-13, the active/latest version and deployment still matched
the baseline above. A fresh module read at 20:28:14 ICT reproduced its exact
207,037 bytes and SHA256. Compcard, Standard and intake were enabled; Promotion
was OFF. These observations are not a release window or a raw-state proof.

The protected read-only evidence run
[43374087746](https://github.com/MMD-Prive/mmd-workers/actions/runs/43374087746)
failed in `R2_OBSERVATION`, operation `r2_list_get`, with `http_403` using its
existing release credential. It has not been retried for this preparation.
Current raw object bytes and GET ETags remain unavailable. No alternate credential
or connected-service route is used to bypass this denial. Old semantic inventory
and synthetic fixture data cannot fill the missing evidence.

`REVIEWED_RELEASE_POLICY` stays `null`. No protected approval is currently pending.
A future release requires legitimately available complete state evidence, current
protection and exact-main CI evidence, a fresh finite window and producer horizon,
a reviewed policy tied to these new candidate/manifest pins, and the actual
protected-environment approval. The 20:00 send window is not presumed quiet.

The source implementation was merged separately in
[PR #3185](https://github.com/MMD-Prive/mmd-workers/pull/3185); that does not deploy
this artifact. The repository path retains its historical Porto/EMs16 name for
workflow compatibility, while its manifest and candidate tests pin all three
scopes. No workflow, state scanner, approval rule or runtime flag is changed by
this update. The release provenance method label now names EMs23 as well.

## Implemented release gates

The existing workflow uses only existing `contents: read` and `actions: read`, the
existing Cloudflare secret, the `mmd-production-mutation` environment, and the
`deploy-events-worker-production` concurrency group with `cancel-in-progress: false`.
Automatic concurrency cancellation is disabled; manual cancellation remains
supported and is checked again before each mutation.
No permission, reviewer, secret, binding or environment setting is created or
changed. The shared release transport and approval validators are unchanged.

1. Source contracts run without production credentials. Exact-runtime checks
   clearly skip when their separately supplied local baseline is absent.
2. An unprivileged dispatch-readiness job rejects the currently absent reviewed
   policy. No dispatch input or environment variable can override that constant.
3. When a later source revision has a real reviewed policy, readiness requires
   manual main dispatch, new combined-target owner authorization, exact executing
   SHA and baseline pins. It verifies fresh remote main and successful Node
   18/20/22 jobs from the exact-main push run, plus completed scoped contracts in
   this dispatch attempt, through Actions run/attempt/job reads. No `checks:read`
   permission is added. Missing, failed, unfinished, ambiguous or denied reads
   stop the attempt.
4. Existing validators check protection configuration and main-only environment
   access. That configuration check is NOT an approval receipt. The protected
   release job separately requires actual Per approval. A message reference,
   merge or green PR check cannot substitute for it.
5. The entry validates clean exact checkout, all schedule/flag pins, fixed window,
   complete R2 evidence and current main/CI. The shared transport separately
   validates active/latest version, inherited configuration, routes, cron,
   settings, source annotations, upload and promotion readback.
6. Immediately before each upload and promotion, the boundary repeats the
   state/CI checks and clock checks, then rechecks exact deployment/latest,
   settings/routes/cron/subdomain, current main and current-run cancellation
   state after the potentially long state scan. Drift results in zero POST at that boundary.
7. Upload uses strict inherited bindings. Candidate syntax and exact-runtime
   tests must pass with zero skipped cases, in a child process that receives no
   production credentials. Promotion is exactly the returned version at 100%.
8. Final reads verify exact active bytes, configuration, flags and unchanged
   state snapshot. Sanitized receipts retain stage and mutation uncertainty.

No live scheduled or send handler is invoked for testing. No automatic retry,
cleanup, state settlement or rollback is implemented. A failed upload may leave
an unpromoted version; a failed verification after promotion may leave new code
active. Inspect the receipt and reconcile read-only before any further action.

## Fixed date and producer-quiescence evidence are still missing

There is no selected or authorized new release date/window. The expired
November 12 constants are not reused. A later reviewed source revision must
specify one future Bangkok publishing date and bounded UTC interval; missing,
early, expired or cross-date windows fail closed. There is no dynamic date
roll-forward. Synthetic dates and durations in tests are NOT proposals or
provider timing evidence.

Complete R2 inventory does not prove old code has stopped. A separate reviewed
source/entry-point artifact and runtime-bound artifact must establish that all
potentially running old-version entrypoints, retries, background tasks and
downstream producers cannot initiate additional outbound sends or relevant R2
writes during the window. This includes queued downstream work capable of
initiating another send/write. The policy records their artifact hashes,
entry-point inventory, last possible producer start, reviewed maximum producer
activity and clock margin, plus no-new-producer coverage through window end.
The ten-minute delivery lease is NOT a bound on execution lifetime.

This horizon does NOT claim a deadline by which an already accepted Telegram
request becomes visible. Already accepted messages cannot be cancelled by this
release. Existing sent/uncertain receipts remain preserved and truthful. Their
visibility may remain uncertain independently of the no-new-producer proof.

The required complete raw-state artifacts, timing bounds, room identities,
promotion-disable boundary and reviewed authorization reference are not assembled
in an executable release policy here. The policy must remain null
until they are independently obtained and reviewed. Hash-shaped synthetic test
values are not evidence and must never be copied into production policy.

## R2 inventory and conservative blockers

The state gate reads complete paginated `plans/`, `deliveries/`, `history/` and
`monthly-promotions/` prefixes under `hype-compcards/v1/`. It does not mistake
empty current-date prefixes for absence of prior unfinished work. It validates
current and historical records and repeats inventory after ETag/size-checked
object reads. It rejects duplicate JSON members, malformed/oversized data,
unexpected keys, missing pages, repeated/contradictory cursors and safety-limit
exhaustion. The verified small terminal-page shape without `result_info` is
accepted only below the requested page limit; a full page without continuation
proof remains ambiguous and blocks.

Plan digests, date/slot/model/category, destinations, chat identities, receipt
context, attempts, timestamps and exposure relationships must agree. The
validator follows the exact live category routing, not newer main routing.
Snapshot output contains hashes, sizes, keys and minimal status/identity only,
not captions, chat IDs, asset content or raw receipts.

This preparation deliberately requires stronger quiescence than the expired
Porto path: pending and retryable not_sent, missing destination receipts,
preparing/sending even after lease expiry, active leases, future retry markers,
unresolved exposure reservations and ambiguous historical evidence all block.
They are never edited or reconciled by this release. Existing terminal sent and
delivery_uncertain records are read without retry. Historical terminal
promotion evidence requires exact reviewed key/hash exceptions and must predate
the reviewed disable boundary; current promotion evidence always blocks.
Unknown monthly-reservation/schema state blocks rather than being ignored.

Snapshots are not atomic R2 transactions. Their meaning depends on independent
producer-quiescence proof, and they must remain identical before both mutations
and afterward. R2 read denial using the actual existing release credential
stops before upload; connected-plugin reads do not prove that credential works.

## Verification commands

From the repository root, source-only contracts (expected explicit exact-runtime
skips, not a full runtime proof):

```sh
node --test release/events-porto-ems16-exclusion/candidate.test.mjs \
  scripts/events-porto-ems16-exclusion-release.test.mjs \
  scripts/events-porto-ems16-release-state.test.mjs
```

For full offline verification, supply the exact authorized baseline locally:

```sh
COMBINED_GUARD_BASELINE=/absolute/path/to/live-baseline.mjs \
EMS16_LIVE_BASELINE=/absolute/path/to/live-baseline.mjs \
node --test release/events-porto-ems16-exclusion/candidate.test.mjs \
  scripts/events-porto-ems16-exclusion-release.test.mjs \
  scripts/events-porto-ems16-release-state.test.mjs \
  scripts/events-rotation-release-transport.test.mjs \
  scripts/admin-production-approval.test.mjs \
  scripts/admin-production-validation.test.mjs \
  events-worker/ems16-private-automation.test.mjs \
  events-worker/compcard-policy.test.mjs events-worker/compcard-journal.test.mjs \
  events-worker/compcard-daily.test.mjs events-worker/compcard-cadence.test.mjs \
  events-worker/compcard-intake.test.mjs \
  scripts/events-porto-exclusion-release.test.mjs \
  scripts/events-porto-ems16-evidence-read.test.mjs \
  scripts/events-porto-ems16-readonly-evidence.test.mjs
```

Runtime tests use memory-only storage, approved-intake fixtures and mocked sends,
with network forbidden. They cover all three guards together and independently,
static/intake, future dates, frozen pending plans, sent/uncertain receipts,
leases/retry holds, category changes, public EMs16, unrelated identities and
Promotion OFF. Valid standard-intake control fixtures must actually reach the
mocked send path; all three exclusions block asset reads for fresh and frozen
plans. The live intake validator admits only `standard` cards. These tests do not
claim that intake adds exclusive/premium-category or Preview candidates.
Release/state contracts use synthetic providers and clocks,
including CI, approval, pagination, date, state and mutation-boundary failures.

The review package records actual command results and file hashes. Local Node
24 results are not future remote Node 18/20/22 CI or production prevention.
The owner has authorized the narrow combined deny-only deployment and necessary
PR. That intent does not supply missing raw-state evidence or the separate actual
protected-environment approval. Before release, recheck current main, review the
exact target, bind the authorized scope and verified evidence in an executable
policy, and satisfy required exact-head checks without bypass. This draft does
not mark itself ready, merge or dispatch. Until the gates are satisfied it is
source-review preparation, not deployment-ready.
