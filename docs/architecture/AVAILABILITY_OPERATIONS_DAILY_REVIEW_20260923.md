# Availability Operations — Daily Coverage & Exception Review

Status: implementation
Date: 2026-09-23

## Goal

Keep Availability Recovery closed while giving the Owner one operational place to see only exceptions that require attention.

Calendar remains the canonical review surface. Control Room / Owner Actions receives only a bounded read-only projection.

## Daily review contract

Canonical source: `mmd.availability.coverage-health.v1`.

Owner Actions behavior:

- `coverage_current`: show Availability source coverage as connected; create no action.
- `waiting_for_model`: no Owner action; Calendar continues to show the waiting state.
- `confirmation_pending`: no guessed action; Calendar remains the review surface.
- `owner_action_required`: create one deduplicated `availability_exception_review` action using the canonical affected-row count.
- `source_attention`: create one fail-closed source exception and never convert unreadable rows into availability.

The exception always links to `/internal/admin/calendar`.

## Safety

- read-only projection only;
- no automatic reminder;
- no automatic LINE activation;
- no availability write from Owner Actions;
- no raw LINE IDs, activation URLs, private notes, or Model personal data in the queue;
- source failures are surfaced as source failures, never as missing/available guesses;
- authority remains `sigil_availability_snapshot_v1`.

## Priority

Availability exceptions sit below overdue job reconfirm and above finance payout holds. A due reminder may mark the action urgent, but it still requires an Owner click in Calendar.

## Operational closure rule

The daily review is considered clear when Availability source coverage is connected and no `availability_exception_review` action exists. This is an operational state, not a new business-truth state.
