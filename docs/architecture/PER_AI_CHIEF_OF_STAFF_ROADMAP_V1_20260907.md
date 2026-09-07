# Per AI Chief of Staff Roadmap V1

Date: 2026-09-07

## Canonical order

MMD owner-side intelligence evolves in this order:

`Command Center → Exception Inbox → Action Cards → Follow-up Autopilot → Smart Matching → System Health`

This roadmap assumes **Per is the single human operator**. It extends `MMD_SINGLE_OWNER_ADMIN_CEO_V1_20260907.md` and the shared AI Ops layer.

The goal is not to add more admin pages. The goal is to reduce how often Per must remember routes, inspect every queue, repeat follow-ups, or manually assemble context.

## Operating model

`Per asks / opens Command Center → AI reads verified context → AI surfaces only what matters → AI prepares a safe next step → Per confirms meaningful decisions → canonical backend acts`

AI may summarize, rank, prepare, and monitor. It does not become the authority for money, entitlement, protected access, private-model disclosure, or final owner decisions.

## 1. Command Center — P0

Canonical owner route remains:

`/internal/admin/control-room`

Do **not** create another competing owner home route unless a future migration explicitly retires Control Room.

Command Center should answer:

- What needs Per now?
- What is already prepared?
- What is being watched?
- What can Per ask in plain language?
- Where is the safest next action?

The first implementation may use deterministic intent routing for supported commands. It must never pretend an unsupported natural-language request was executed.

Supported command preview categories should begin with:

- Create Job
- client lookup / Customer 360 handoff
- payments / slip review
- membership / access inspection
- model / Studio handoff
- Kenji teaching/control
- MMS
- system health

Command preview is read-only. It prepares a next step; it does not commit a protected mutation.

## 2. Exception Inbox — P0

Exception Inbox belongs inside Command Center first. Do not create a new permanent page merely to display the same queue.

Normalize verified exceptions from existing sources such as:

- Admin dashboard `todos` / `boss`
- pending/unmatched payment evidence
- jobs waiting for confirmation or blocked state
- members near expiry / pending state
- source-unavailable or fail-closed AI Ops signals

Each item must show:

- why Per needs to care;
- evidence/source;
- urgency;
- safe destination;
- whether Per confirmation is required.

No evidence = no fabricated exception.

## 3. Action Cards — P0

Action Cards convert an exception or command preview into a prepared next step.

Minimum contract:

- `id`
- `kind`
- `title`
- `summary`
- `href`
- `authority`
- `execution_mode`
- `per_confirmation_required`
- `source`

V1 execution mode is `handoff_only` or `preview_only` for protected operations.

Later supervised actions may be added only when the canonical backend already exposes a safe authenticated mutation endpoint and the impact is displayed before confirmation.

## 4. Follow-up Autopilot — P1

Purpose: remove repeated mental reminders from Per.

Watch categories:

- payment waiting too long;
- booking/job confirmation overdue;
- member renewal window;
- model readiness waiting on one missing item;
- customer follow-up that has a verified due time.

Initial autopilot should **notify Per**, not message customers or mutate records automatically.

Every watch requires:

- stable object ID;
- verified condition;
- due/threshold rule;
- last checked time;
- last notified time;
- snooze/close state;
- audit trail.

No free-form AI timer state in browser storage.

## 5. Smart Matching — P1

Smart Matching assists Create Job; it does not become assignment authority.

Ranking inputs may include only verified/canonical data:

- selected Public / Private world;
- tier / lane / work type;
- orientation / customer lane;
- explicit model capabilities;
- current model eligibility;
- consented Public/Private scope;
- availability when a canonical source exists;
- prior client preference/history when safely linked;
- image/readiness state.

Legacy Drive folders are candidate hints only, never model truth.

Output must include reasons and missing evidence. Per confirms the final model.

## 6. System Health — P1/P2

System Health should explain operational impact, not just show green/red services.

Minimum health domains:

- admin auth;
- AI Ops;
- LINE webhook / ingress;
- payments;
- LIFF/member runtime;
- Airtable reads/writes where applicable;
- R2/media;
- critical Worker routes;
- entitlement resolver;
- MMS operational runtime.

Each incident should answer:

1. What is unavailable?
2. What work is affected?
3. Is data at risk or only temporarily unavailable?
4. What should Per do now?
5. What should Per avoid doing until recovery?

Health checks remain read-only unless a specific supervised recovery action has its own safe backend contract.

## UX lock

The owner-facing experience should converge toward five concepts:

1. **Ask Per AI** — plain-language command preview
2. **Needs Per** — normalized exception inbox
3. **Prepared** — action cards ready for confirmation/handoff
4. **Watching** — follow-up autopilot state
5. **Done Today** — verified audit summary when a trustworthy source exists

If `Done Today` has no canonical audit projection, show WAITING/UNAVAILABLE instead of inventing activity.

## Authority lock

Remain unchanged:

- Money truth → `payments-worker`
- Entitlement → `my_mmd_entitlement_resolver_v1`
- Telegram / Drive → observed state only
- Protected/private model access → backend eligibility authority
- Final owner confirmation → Per

The AI layer is a Chief-of-Staff layer, not a new source of truth.