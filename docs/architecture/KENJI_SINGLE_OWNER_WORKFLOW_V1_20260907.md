# Kenji Single-Owner Workflow V1 — 2026-09-07

Owner: Per (single human operator)
Canonical surface: `/internal/admin/kenji`

## Decision

MMD does not operate Kenji administration as a multi-admin review team. The normal operator flow must therefore not require Per to review his own change in separate Review and QA rooms.

Canonical owner flow:

`Teach / Edit -> Pre-Publish Summary -> Use Live`

The existing backend safety contract stays in force. Review validation, QA checks, version guards, audit history and production publish remain Worker-owned. The UI collapses those technical stages into one supervised pre-publish checkpoint.

## Normal UI

1. Teach Kenji in plain language.
2. Save as a non-production draft.
3. Show one pre-publish summary containing:
   - before / after when replacing existing knowledge;
   - customer-facing answer;
   - internal guard/instruction;
   - category, audience and channel scope;
   - links/routes affected when present;
   - automated validation / unsafe-term / privacy / source checks;
   - warnings and blockers;
   - explicit statement of what becomes live after publish.
4. Per confirms once and presses `Use Live`.
5. Worker runs the required validation and QA gates, publishes only if they pass, and writes audit history.

## Kenji AI 2.0 view

Kenji AI 2.0 is the customer-facing concierge runtime, but its owner preview belongs inside the same canonical Kenji Admin shell rather than living as a separate admin room.

Canonical operator preview:

`/internal/admin/kenji?view=ai20`

Customer runtime remains:

`/member/kenji-ai-20`

Rules:

- `view=ai20` is an owner preview view only. It does not move member runtime ownership, customer identity, money truth, entitlement truth, Model eligibility or publish authority into the admin browser.
- The view reuses `/member/kenji-ai-20?mode=admin-preview` so Per can see the real member-facing Kenji AI 2.0 surface from inside Kenji Admin.
- The existing lightweight `Try a question` Knowledge search may remain available as a teaching aid, but it is not equivalent to Kenji AI 2.0 runtime preview.
- Kenji AI 2.0 continues to read published Knowledge from the existing runtime source and may guide, explain, classify and route only.
- Payment verification, membership/access grants, private-model eligibility, booking guarantees and final approvals stay with their canonical backend/human authorities.
- The standalone member route remains required for customers and should not redirect into admin.
- Deep links must preserve `view=ai20` through authorized admin login handoff.

## Kenji Knowledge view

Kenji Knowledge is not a separate admin product. It is a first-class view inside the canonical Kenji Admin surface.

Canonical operator view:

`/internal/admin/kenji?view=knowledge`

Rules:

- Reuse the existing Worker-backed Knowledge tab and Knowledge workflow; do not create a second knowledge store or duplicate publish path.
- The normal Knowledge workflow remains `Teach / Edit -> Pre-Publish Summary -> Use Live` with Worker validation, QA, expected-version checks and audit behind the single owner confirmation.
- `/internal/admin/kenji-knowledge` is legacy/compatibility navigation only and should guide or redirect the authorized operator into `/internal/admin/kenji?view=knowledge` rather than becoming a second operational surface.
- Knowledge may contain customer-safe answers, internal guards, category/audience/channel scope and route guidance, but it does not become money truth, entitlement truth, private-model eligibility truth or approval authority.
- Sensitive Payment / Membership / Access / Model / Policy knowledge keeps the extra owner acknowledgement in the same pre-publish summary.
- Deep links must retain the admin login handoff and return to the requested `view=knowledge` state after authentication.

## SIGIL Board view

SIGIL Board belongs inside the same single-owner Kenji administration surface.

Canonical operator view:

`/internal/admin/kenji?view=board`

Rules:

- `/internal/admin/kenji` remains the canonical Worker-owned route; `view=board` is a UI view, not a new authority namespace.
- The Board view reads sanitized advisory data only from `GET /v1/sigil/board/status` and `GET /v1/sigil/board/queue`.
- Board API ownership and sanitization remain with the SIGIL Worker. Moving the view into Kenji Admin does not move the underlying truth or write authority.
- The canonical Kenji Board view must not fabricate fallback/demo customer cases. If the Worker cannot be read, show an unavailable/empty state instead of invented operational data.
- `/sigil/board` is a legacy presentation/compatibility route and should guide or redirect an authorized operator to `/internal/admin/kenji?view=board`; it must not evolve into a second independent operational board.
- Money truth, entitlement/access truth, private-model eligibility, and final human decisions remain with their existing backend/human authorities. The Board is not an approval engine.
- Campaign, Private Review, Risk, Need Info and other sanitized Board lanes may be surfaced in this view without changing their backend owners.

## Sensitive content

Payment, membership/entitlement, access, private model disclosure, or critical-risk knowledge requires an additional confirmation checkbox inside the same summary. This is not a second reviewer; it is an owner acknowledgement before production mutation.

## Advanced / History

Technical Review, QA, Versions and Audit remain available only as Advanced / History diagnostics. They are not the normal owner workflow.

## Authority boundaries

- Money truth remains `payments-worker`.
- Entitlement truth remains `my_mmd_entitlement_resolver_v1`.
- Private model eligibility remains backend authority.
- LINE/Telegram/Drive observed state never grants rights.
- Browser code never receives Airtable keys, service credentials, or publish authority.
- Draft creation never mutates production.
- Final publish remains an authenticated Worker action with idempotency and expected-version checks.

## Model Keyword Profiles

The same single-owner pattern applies to Kenji Model Keyword Profiles:

`Edit -> Summary -> Use Live`

The Worker still validates canonical Model linkage, customer-safe copy, source, privacy, operational-data guards, profile-version conflict and publish audit before changing Production.
