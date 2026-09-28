# Availability Adoption — Cohort 1 Owner Actions & Outcome Tracking

Date: 2026-09-23  
Authority: SIGIL availability snapshot + Owner Calendar

## Goal

Keep the first five prioritized Models as one stable onboarding cohort while Owner actions and Model outcomes change.

The cohort must not rotate after the first reminder or activation link. A sixth Model cannot enter Cohort 1 until a later explicit cohort-advance phase.

## Owner start gate

Before any cohort Model action, Owner must press **Start Cohort 1**.

The start action:
- snapshots the current five prioritized canonical Models into a bounded KV receipt;
- sends no LINE message;
- issues no activation link;
- publishes no Availability state;
- creates no booking/payment mutation.

Receipt schema: `mmd.availability_adoption_cohort.v1`

Current pointer:
`availability-adoption:v1:cohort:current`

The receipt stores only bounded operational fields: canonical Model key, record/id, display name, original priority reason, upcoming-job timestamp/Partner marker, and dedupe count. It must never store LINE user ID, tokens, activation URL, customer identity, or private notes.

## Action boundary

After Cohort 1 starts:
- reminder and activation endpoints accept only Models in the locked receipt;
- no cohort receipt -> `availability_cohort_not_started`;
- Model outside receipt -> `model_not_in_current_availability_cohort`;
- all outbound actions remain one Owner click per Model;
- reminder cooldown and existing LINE/activation safety remain unchanged.

There is no bulk-send endpoint.

## Outcome states

Projection schema: `mmd.availability.onboarding-outcomes.v1`

Each Cohort 1 member is projected as one of:

- `action_required` — Owner still has the next action.
- `waiting_for_line` — activation link was issued and Model has not linked LINE.
- `waiting_for_availability` — reminder was sent and Model confirmation is pending.
- `follow_up_due` — reminder crossed the existing follow-up SLA without a later confirmation.
- `completed` — a fresh canonical SIGIL Availability snapshot exists.
- `blocked` — source/canonical identity is not safe enough to proceed.

For each member the Calendar may expose safe receipt fields:
- `last_owner_action`
- `last_owner_action_at`
- `completed_at`
- `safe_availability_state`

No raw LINE identity is projected.

## Cohort completion

Cohort 1 is complete only when all locked members are `completed`.

`auto_advance=false`

Starting Cohort 2 is intentionally outside this phase and must be a later explicit Owner action.
