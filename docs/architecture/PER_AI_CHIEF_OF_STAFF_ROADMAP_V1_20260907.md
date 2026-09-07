# Per AI Chief of Staff Roadmap V1

Date: 2026-09-07

## Canonical order

MMD owner-side intelligence evolves in this order:

`Command Center → Exception Inbox → Action Cards → Follow-up Autopilot → Smart Matching → System Health`

This roadmap assumes **Per is the single human operator**. It extends `MMD_SINGLE_OWNER_ADMIN_CEO_V1_20260907.md` and the shared AI Ops layer.

The goal is not to add more admin pages. The goal is to reduce how often Per must remember routes, inspect every queue, repeat follow-ups, or manually assemble context.

## Implementation status

- Command Center — LIVE P0
- Exception Inbox — LIVE P0
- Action Cards — LIVE P0
- Follow-up Autopilot — LIVE P1 durable reminder state
- Smart Matching — NEXT P1
- System Health — foundation exists; full operational-impact layer remains P1/P2

Follow-up Autopilot V1 is intentionally reminder-only. It can keep durable watch state, revalidate from verified admin dashboard evidence when Command Center opens, schedule due alarms, surface due items into Needs Per/Prepared, and let Per snooze or close a Watch. It does **not** message customers, mark money paid, confirm Jobs, change Membership, grant access, or mutate canonical business records.

Dedicated Telegram push is optional and activates only when the AI Ops Worker has `PER_FOLLOWUP_TELEGRAM_BOT_TOKEN` and `PER_FOLLOWUP_TELEGRAM_CHAT_ID` configured. Without that dedicated private channel, reminders stay Command-Center-only rather than being sent to an ambiguous shared Telegram destination.

## Operating model

`Per asks / opens Command Center → AI reads verified context → AI surfaces only what matters → AI prepares a safe next step → Per confirms meaningful decisions → canonical backend acts`

AI may summarize, rank, prepare, monitor, and remind. It does not become the authority for money, entitlement, protected access, private-model disclosure, or final owner decisions.

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
- Follow-up Autopilot watches that are due

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

Current V1 watch coverage:

- payment waiting too long — active when stable payment ID + verified pending signal + explicit due or source timestamp exists;
- booking/job confirmation overdue — active when stable Job/Session ID + verified waiting signal + explicit due or source timestamp exists;
- member renewal window — active when stable Member/Client ID + verified expiry exists;
- customer follow-up — active only when stable Client/Member ID + explicit due time exists;
- model readiness waiting on one missing item — intentionally WAITING until a verified one-missing-item projection exists.

Default threshold rules are conservative reminders, not business truth:

- Payment waiting: 2 hours after verified observed timestamp when no explicit due is supplied.
- Job confirmation waiting: 4 hours after verified waiting/observed timestamp when no explicit due is supplied.
- Membership renewal: 14 days before verified expiry.

If the source does not provide a stable ID and a due/threshold basis, the watch is skipped rather than inferred.

Every Watch stores:

- stable object ID;
- verified condition evidence;
- due/threshold rule;
- `last_checked_at`;
- `last_notified_at` / notification status;
- snooze / close / resolved state;
- bounded audit trail.

Durable state lives in the `FollowUpAutopilot` Durable Object. Browser storage is not used.

Revalidation rule:

`Command Center opens → POST /v1/admin/ai-ops/follow-ups/sync → authenticated /v1/admin/dashboard read → derive verified candidates → durable upsert/resolve → UI refresh`

Alarm rule:

- Durable Object alarm marks watches due and can notify Per through the dedicated private Telegram channel if configured.
- If dedicated Telegram is not configured, due watches remain visible in Command Center and no message is sent to another/shared channel.
- Alarm notifications are reminders to re-check the canonical source; they do not claim the underlying condition is still true unless it was recently revalidated.

Control actions:

- Snooze: changes reminder timing only.
- Close Watch: stops the reminder only.
- Reopen: reactivates reminder state only.

None of these actions changes Job, Payment, Membership, entitlement, customer, or Model truth.

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
4. **Watching** — durable Follow-up Autopilot state
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
