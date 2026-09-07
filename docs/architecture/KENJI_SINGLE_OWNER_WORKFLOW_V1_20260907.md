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
