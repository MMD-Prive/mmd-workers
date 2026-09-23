# Availability Adoption Phase 4 — Coverage Health & Owner Daily Review

Status: implementation candidate
Date: 2026-09-23

## Outcome

Give the owner one daily, read-only coverage summary in Calendar. It explains whether the coverage record is current, waiting for a Model, needs an explicit owner action, or cannot yet be trusted because a source is incomplete.

## Source of truth

- fresh availability only: SIGIL Availability Snapshot;
- identity and LINE connection: canonical Model record;
- recovery progression: protected Phase 2 evidence;
- actions: existing owner-only Phase 2/3 routes.

The health projection never converts a missing, stale, or unreadable state into availability.

## Review status precedence

1. `source_attention` — one or more reads are incomplete; no new action is offered for that affected row.
2. `owner_action_required` — canonical recovery action is due.
3. `waiting_for_model` — a link or reminder is already outstanding.
4. `confirmation_pending` — a canonical record exists but a fresh confirmation has not arrived.
5. `coverage_current` — every canonical, non-excluded Model has a fresh snapshot and no identity gap remains.

The response exposes exact derived counts and `fresh_coverage_percent`; it does not manufacture targets, performance grades, or send actions.

## Safety boundary

- daily review is read-only;
- `automatic_send: false` and `no_guess: true` are explicit in the contract;
- all reminder and activation actions remain owner clicks under their existing authorization and cooldown gates;
- raw LINE IDs, activation URLs, tokens, and private notes are not included in health data.
