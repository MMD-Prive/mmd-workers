# HYPE daily model cards and promotion rotation

## Owner request and source

The owner confirmed these audiences and the source folder on 18 October 2026
(Bangkok): [New Card 2026](https://drive.google.com/open?id=1r1yfSjwhuKqzPh7278wn-OmRwqtDdQ-Z).

| Canonical category | Telegram destination | Caption |
| --- | --- | --- |
| Exclusive | Premium and Preview Channel | Premium has a short introduction and compatible printed statistics; Preview has a short teaser |
| Premium | Premium | Model introduction |
| Standard | Premium and Standard | Model introduction |
| Travel, Extreme | Preview Channel | Public model introduction |
| Promotion | One room per day: Premium, Standard, Preview, then repeat | Approved campaign copy |

Preview uses `TELEGRAM_PREVIEW_CHANNEL_ID`, never the linked discussion group.
The three existing destination IDs are frozen in the approved manifest; the
transport verifies configured IDs, live Telegram chat identity and bot permission
before every send. Changes to a binding cannot silently substitute another room.

## Schedule

All business dates and times use Asia/Bangkok (UTC+7).

- Existing D-1 model reconfirm: 16:00, handled by the existing reconfirm runtime.
- Model card: 16:30, one model each day, routed to that category's approved rooms.
- Promotion: 20:00, one room each day. 18 October starts with Premium.
- The existing events-worker cron remains `*/15 * * * *`.
- A slot can recover known failed sends for up to 90 minutes, within the same
  Bangkok calendar date. Old cron invocations cannot replay a previous day.

The compcard times are initial operating defaults chosen for the requested daily
plan. `HYPE_COMPCARD_SEND_AT_ICT` and `HYPE_PROMOTION_SEND_AT_ICT` control them.
`HYPE_COMPCARD_ENABLED=false` stops the complete new publishing runner;
`HYPE_PROMOTION_ENABLED=false` stops only its promotion slot. Reconfirm has its
own existing feature flags.

## Approved inventory

The first manifest contains 19 reviewed, finished source images with unique
matches to current Active model records: 6 Exclusive, 8 Premium, 3 Standard,
and 2 Travel. No Extreme card currently has a unique, Active, category-consistent
match; Extreme routing is implemented and will work when such a card is approved.

Selection favors models not yet exposed since this runner's activation, then the
oldest exposure, with a seven-day cooldown. Available categories rotate in ties.
The runner does not invent older exposure history. Every send rechecks the exact
canonical record, working name, status, category and explicit visibility blocks.
Commercial tier comes from canonical tier fields, not GWs/EMs recognition or a
Straight/Gay source folder name.

Images are delivered unchanged from the approved Drive file. All 19 were visually
reviewed and their complete, anonymously downloadable original bytes were verified.
The manifest pins SHA-256, MIME type, exact size and model identity. A changed
file, HTML sign-in response, mismatched category or blocked model is held.

Tae S and Tinn F have conflicting printed versus canonical measurements, so their
captions omit measurements. Hack's approved image has a Travel heading but a
reference to Extreme in its body; canonical Travel controls routing. Existing
image disclaimers remain intact. Captions do not repeat unverified marketing,
availability, price or eligibility claims. A Preview teaser shortens the caption;
it does not redact text already printed inside the owner's approved image.

## Promotion availability and campaign terms

The first campaign is the existing owner-reviewed, `ready_to_send` CARE BACK copy
from `ops/campaigns/care-back-telegram-post-20260929.json`. Its plain-text version
removes only the `<b>` tags, retains exact wording and the MY MMD login link, and
uses the new audience rotation rather than the old post pack's routing metadata.
It does not promise numeric benefits or expose payment or membership state.

CARE BACK has `availability_mode: "bounded"` and an exclusive end of
`2026-11-01T00:00:00+07:00`. This matches
`docs/knowledge/CARE_BACK_2026_FINAL_LOCK.md` and the public campaign cutoff in
`member-pages-worker/src/care-back-claim-store.js`. No new CARE BACK promotion is
sent after 31 October. Later private payment honoring rules do not extend this
public campaign.

Double Moment uses an explicit `availability_mode: "continuous"`, an approved
start time, `valid_to: null`, and `status: "active"`. It remains eligible until
the owner pauses it or revokes approval. Missing or malformed dates never imply
continuous availability; bounded campaigns require a valid exclusive end. The
same availability predicate is used by readiness, campaign selection and the
last pre-send check. All campaigns still require approved copy/hash and verified
destination identity and permissions.

The advertising entry is `double-moment-continues-2026-telegram`; its financial
identity remains `promo_double_moment_sep2026`, package `double_moment_20000`,
policy `v1`. The approved copy states: pay THB 20,000 for total credit THB
27,000 (paid credit THB 20,000 plus two separate THB 3,500 Moment bonuses);
each bonus is for a different confirmed booking with service amount at least
THB 20,000; credit validity is 180 days from verified payment as recorded by
the existing system; one package per verified member per campaign. Existing
Official Verify and credit ledger remain authoritative. Advertising continuity
does not create/renew a purchase, extend credit validity, or issue credits or
points. No payment-worker logic was changed.

The Double Moment plain-text message is identical for Premium, Standard and
Preview and pinned by SHA-256 in the approved manifest. It links to the existing
MY MMD entry at `https://www.mmdbkk.com/member/login`.

When CARE BACK expires, Double Moment continues through the existing daily room
rotation with no gap; model-card rotation is independent. A scheduled promotion
can still be paused using `HYPE_PROMOTION_ENABLED=false`, or an individual card
can be paused/revoked in the approved manifest. Do not use a far-future end date
to simulate continuous availability.

With both campaigns active, selection is deterministic by Bangkok date and
sorted campaign ID. For the initial six rounds this yields CARE BACK / Premium
on 18 Oct, Double Moment / Standard on 19 Oct, CARE BACK / Preview on 20 Oct,
Double Moment / Premium on 21 Oct, CARE BACK / Standard on 22 Oct, and Double
Moment / Preview on 23 Oct. From 1 Nov, Double Moment is selected each day while
the same room rotation continues from the 18 Oct Premium anchor.

## Delivery and verification

The Events service calls dedicated authenticated endpoints in telegram-worker:

- `GET /telegram/internal/compcard/destinations` verifies destinations without sending.
- `POST /telegram/internal/compcard/photo` accepts pinned original PNG/JPEG bytes.
- `POST /telegram/internal/compcard/text` accepts pinned approved plain text.

The transport accepts only the existing Events or Studio service credential.
Credentials remain Cloudflare secrets. It does not accept arbitrary chat IDs,
remote media URLs, HTML parse modes or alternate routing metadata. Telegram
receipts must match the frozen chat, approved content and valid message ID.

Daily plans, per-room delivery claims, receipts, cooldown history and readiness
are in the private R2 bucket `mmd-hype-compcard-state`, bound as
`HYPE_COMPCARD_STATE`. Managed public access is disabled and no custom domain is
attached. The public `mmd-models` asset bucket must not be used for this state.

All keys begin with `hype-compcards/v1/`:

| Key | Purpose |
| --- | --- |
| `readiness/latest.json` | Current build, manifest, source probe, eligible counts, recipient permissions and schedule; no message sends |
| `plans/YYYY-MM-DD/model.json` or `promotion.json` | Immutable, integrity-checked daily plan |
| `deliveries/YYYY-MM-DD/model/ROOM.json` or `promotion/ROOM.json` | Independent room lease, result and confirmed receipt |
| `summaries/YYYY-MM-DD/model.json` or `promotion.json` | Consolidated daily result |
| `history/MODEL_RECORD_ID.json` | Conservative exposure history for rotation |

R2 conditional writes prevent concurrent cron ticks from sending the same room
twice. A confirmed `not_sent` failure can retry at most three times with a
15-minute backoff. A timeout or missing receipt after sending becomes
`delivery_uncertain`; it never retries automatically. Other rooms may complete.
Do not delete an uncertain delivery record or clear its cooldown to force a
resend: inspect the actual destination and reconcile the original receipt first.
Adding or changing a campaign changes the manifest revision but does not itself
invalidate an unchanged frozen plan. The original digest and journal entries are
preserved. A frozen plan can continue only when its card identity, approval,
content/hash, destination and chat ID still match; changed or paused/revoked
content blocks unfinished sends. Successful receipts remain idempotent, and
`delivery_uncertain` is never retried automatically.

The scheduled preflight refreshes at most every 30 minutes, additionally keyed
by build, manifest revision and Bangkok date. Verify this private record after
deployment and then inspect real per-room receipts after the first scheduled
slot. A green readiness record is readiness evidence, not a sent-message receipt.
The stored snapshot wraps the report in `success: true, result: {...}` so R2 API
clients do not interpret the report's operational `errors` array as an API failure.
Business readiness remains `result.ready`; envelope success only means the report
can be read. The runner also accepts earlier unwrapped snapshots during upgrade.
The runner logs only bounded machine status codes, never tokens or captions.

Daily summaries use the same `success: true, result: {...}` envelope. Read
`result.status`, `result.sent`, `result.uncertain`, and `result.outcomes` for the
per-room status and verified receipt. A later cron tick can regenerate this
summary from durable completed claims without sending the completed rooms again.
The underlying plans, delivery claims and history retain their existing native
format and conditional-write behavior; this reporting change does not migrate
or reset them. Use the wrapped summaries for routine API-based delivery audits.

## Release checks

`hype-compcard-ci.yml` gates routing, active source approval, concurrent delivery,
partial failure, unknown outcomes, campaign expiry and both Telegram transports.
The events deployment workflow repeats the new scheduler tests and existing ETA,
aftercare and reconfirm regressions. The Telegram deployment workflow discovers
both new transport suites through `test/*.test.mjs`.

All test transports are mocked. Deployment uses the existing events and Telegram
workflows; it requires no manual test post in a customer room.

