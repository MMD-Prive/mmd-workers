# Three-calendar-month publication review (local safety candidate)

This is a fail-closed publication gate, separate from the unchanged seven-day
rotation preference. It applies to every selected canonical model, not only Tinn.
Tinn remains excluded independently. It does not approve registry changes,
commercial-tier changes, explicit material, new content, or customer test posts.

## Scope and conservative interpretation

Review the same canonical identity across Premium, Standard and Preview together.
Bind each room to the actual manifest chat ID. Missing, duplicate, changed or extra
unverified room bindings hold publication rather than claiming complete coverage.
The current reviewed bindings are Premium -1001668261779, Standard -1002073919780,
and Preview -1002393788585. The source validator matches against the active manifest,
not against names alone. Any new room requires an explicit source-scope review.

Subtract three calendar months in Asia/Bangkok, clamping month ends and retaining
local time of day. This is not a 90-day numeric cooldown. Any observed exposure in
that window, in any reviewed room, holds for review. Automated in-flight/uncertain
exposure also holds conservatively. The automated journal supplies positive evidence,
never proof that older/manual history is absent.

A plan with multiple target rooms is held as a whole with
compcard_review_multi_room_scope_required. No first-room send is attempted while
mirror authorization is unresolved. Historical sent receipts are not rewritten.

## Evidence registration contract (private state only; not registered by this patch)

Key relative to hype-compcards/v1/:
publication-review/models/CANONICAL_MODEL_ID.json

Required envelope:
- schema: hype_compcard_history_review_v1
- model_id: exact canonical record ID, never a name-derived guess
- timezone: Asia/Bangkok
- revision: evidence revision identifier
- reviewed_by: accountable reviewer identity
- reviewed_at: integer UTC epoch milliseconds, not in the future
- rooms: exactly one record for every configured room

Each room record requires:
- destination and chat_id matching the active room binding
- status: verified_complete (only after actual direct room-history verification)
- reconciliation_method: direct_room_history_review
- manual_posts_included: true; includes_all_authors: true
- identity_reconciliation_complete: true; unresolved_count: 0
- from: epoch milliseconds at or before the required calendar-window start
- through: epoch milliseconds exactly covering the evaluation instant
- evidence_refs: nonempty references to actual authorized source evidence
- observations: an array of verified posts for this canonical identity

Each observation requires model_id, chat_id, message_id (positive integer),
posted_at (UTC epoch milliseconds, not future), source_ref, identity_verified:true,
and identity_evidence_ref. Source refs must identify real message/history evidence;
identity evidence must establish this exact canonical person. Do not infer a match
from a similar name. Unresolved messages/identity gaps mean incomplete coverage.
An empty observations array is permitted only after a complete direct review.
The format is an attestation by a trusted evidence registrar, not cryptographic
verification of the external source. This patch does not add a registration API.

There is deliberately NO snapshot-staleness grace interval. No unobserved manual
posting interval is silently considered clear. Missing, stale, malformed, partial
or future evidence holds. No synchronous trusted Telegram-history reconciler is
installed by this patch; therefore deployment alone must NOT be represented as
restoring automatic publication. A static one-time import cannot satisfy later
pre-send evaluation. Until this missing integration is reviewed and available,
model posts remain held. Do not create new persistent access to work around it.

## Execution and recovery

The gate runs before freezing a new plan and again after asset/identity checks,
immediately before reserving exposure and sending. Frozen, retry and legacy pending
sends must pass it. No gate is applied by rewriting terminal sent/uncertain receipts.
A failed pending-send review becomes a blocked delivery under the existing immutable
journal contract; it cannot silently resume on a later cron tick. A later-day plan
must recheck current evidence. Any same-day recovery needs separately reviewed
state handling, not deleting/replacing authentic receipts.

Readiness reports retain transport/asset readiness and explicitly say publication
review is required at plan and pre-send; clearance is not cached.

## Owner warning and delivery blocker

Holds create a deduplicated structured private outbox record under
publication-review/owner-outbox/DATE/MODEL/SLOT/REASONS.json and a current decision
under publication-review/latest/MODEL/SLOT.json. Deduplication is per day, model,
slot and reason set. These are NOT delivered alerts. Status is undelivered with
owner_route_not_configured (or owner_warning_storage_failed if persistence fails).

The existing owner-aftercare route is tied to session completion and its own
recipient/evidence contract. This patch does not repurpose it or select a recipient.
A verified authorized owner notification transport remains a production blocker;
no credentials, chat IDs or external calls are created. Tell the owner honestly
that warning delivery is not configured. Do not claim console logs or an outbox
record mean the owner received a warning.

## Release safety

Keep HYPE_PROMOTION_ENABLED=false and all existing bindings/flags unchanged.
Package only the reviewed exact-live code overlay plus the new review module.
Never bundle current main or the unapproved Premium intake workspace. The release
writer owns pinned compiled hashes and release-gate review. Local tests use only
synthetic in-memory evidence and mock transports; no customer messages are sent.
