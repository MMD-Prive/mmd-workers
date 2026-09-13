# My MMD Golden History Recovery v1

Status: Canonical MMD Memory
Owner: Per / MMD Privé
Scope: Every member's direct My MMD entry and verified LINE/LIFF access; universal rule below supersedes cohort-only scope

## Canonical flow

```text
Open My MMD
-> verify exact LINE identity
-> resolve canonical Client / Member
-> if protected relationship is Golden / VIP / SVIP / Black Card, restore current protected relationship immediately from canonical entitlement / approved Rename-first evidence
-> inspect historical evidence already linked to the canonical Client
-> materialize only history that has passed the explicit evidence/review gates
-> refresh canonical reads
-> Sessions / Payments / Points / History return from canonical tables
```

Compact product rule:

> เปิด My MMD -> exact LINE identity -> Golden/SVIP active ทันที -> ตรวจ historical evidence ที่ผูก Client ไว้ -> materialize เฉพาะประวัติที่ผ่าน evidence gate -> refresh -> Sessions / Payments / Points / History กลับมา

## Required boundaries

1. Identity and current protected relationship are resolved before history recovery.
2. Rename-first applies to every customer/member when interpreting MMD-controlled relationship/tier evidence.
3. VIP / SVIP / Black Card are protected relationship capabilities. They are not inferred or downgraded from spend, service frequency, points, or missing historical rows.
4. Historical evidence is attached to the already resolved canonical Client/Member. History recovery must never select a person merely because a service/payment amount looks similar.
5. Candidate historical evidence is not canonical history. Only explicit approved evidence may materialize into Sessions, Payments, and Points Ledger.
6. Unapproved/ambiguous payment, service-completion, or points evidence remains pending/review-safe. Do not fabricate zeroes, paid state, points, or completed sessions.
7. History materialization must not mutate or downgrade current Member Entitlements. Current access remains authoritative through `my_mmd_entitlement_resolver_v1`.
8. After materialization, My MMD must refresh from canonical sources rather than rendering staging/review rows directly.
9. If canonical history is still pending, the UI should say history is recovering/pending rather than imply the customer has never used MMD.
10. The browser/Lovable/Webflow presentation layer must not parse Rename, infer tier, approve evidence, or grant entitlements. Those decisions remain backend/canonical-data responsibilities.

## Golden Member #001 reference

The first production reference case is `Golden Member #001` (J / Jjeune):

- exact LINE identity -> canonical Client / Member
- current protected relationship -> SVIP active
- historical evidence may continue recovering independently
- only reviewed history becomes Sessions / Payments / Points Ledger
- My MMD refresh then exposes the recovered canonical history

This reference case is the template for future direct My MMD recovery cohorts.

## Universal member access rule — owner decision, 2026-09-14 Bangkok

Rule ID: `my_mmd_all_member_history_reconstruction_v1`
Policy status: Owner-approved canonical rule. Applies prospectively to EVERY member accessing MY MMD, including Public, Private Standard/Premium, VIP, SVIP, Black Card and approved future tiers. No customer-name allowlist and no protected-tier-only recovery cohort.

เปอร์: “สมาชิกท่านไหน access ระบบจะทำวิธีการย้อนประวัติลูกค้าเหมือนกันให้หมดทุกคนต่อจากนี้”

This expands the Golden reference above to all members. คุณเอ็ม / Bhutorn is the end-to-end historical reconstruction reference; คุณโจ / Joeka is a known identity-linked account whose service-history import is still missing. These are acceptance cases, never hard-coded identity or balance defaults.

### Required flow on verified access

1. Verify the exact server-side LINE/LIFF identity and resolve one canonical Client/Member. Customer-supplied names, amounts and browser IDs never select the owner. If identity is unresolved or conflicting, retain an identity-review state and resume history work only after canonical resolution.
2. Inspect that member's durable recovery state. Enqueue or resume one bounded background recovery job when evidence has not been inspected, a prior attempt is incomplete/retryable, or the source evidence/policy version has changed. Login and current lawful access must not wait for archive processing. Concurrent login, reload, route changes and retry must not issue duplicate recovery jobs or canonical entries.
3. Read ALL authorized LINE OFC contact Notes for the resolved person, not just a `#client` line. Inspect MMD Confirmations, historical payment/settlement evidence, membership, renewal and contact profile evidence. Preserve source references, source timestamps and source hashes. A source connector unavailable or an incomplete export means source pending, never “no history”. Do not bypass source authentication or assume LINE messaging APIs expose OFC Notes.
4. Match existing canonical Sessions/Payments/Member history before proposing new entries. Create or update deterministic Customer History Reviews for unmatched evidence. Profile and membership evidence must be routed to their own canonical review/authority; membership fees or tier labels are not completed service spend.
5. Apply the same explicit evidence gates used for the Em reconstruction. A past service note may establish that an event occurred under Per's approved historical interpretation; it does not fill missing model, date, payment or amount. In reviewed MMD historical notes, “จ่ายก่อนเริ่มงาน” means already paid, as clarified by Per. This is a historical-evidence interpretation only and never impersonates live bank/official payment verification. Pending/cancelled status and conflicting evidence must still be respected.
6. Materialize only eligible, explicitly reviewed/approved records through the existing historical materializer. Missing/ambiguous model, completion, payment, coverage or amount stays Review Required; do not guess, create synthetic zeroes or silently approve a review just because the member logged in. This standing rule authorizes automatic discovery/queueing and replay of approved materialization, not blanket promotion of raw notes to financial truth.
7. Refresh canonical Profile, History and Points after successful materialization. Partial recovery may show already-verified records alongside a customer-safe pending notice. Raw Notes, operator rationale and private evidence never go to the member UI.

### Accounting and replay invariants

- One completed job produces one canonical Session, including jobs with multiple นายแบบ.
- Lifetime Spend counts each completed job's authoritative total once. Deposit and remaining balance are components of that total; do not add Payments or credit purchases again. Pending and cancelled jobs are excluded.
- Service points follow 100 THB = 1 point through the canonical ledger and chronological remainder policy. Preserve earned dates and expiry; recovery must not renew expired points or create a second award for the same job/payment. Membership/renewal fees, tips and promotion bonus remain governed by their separate policies.
- TR is a travel fee component, never a service code or an additional job. Preserve the authoritative completed-job total and apply the existing points-eligible service-spend policy; do not invent a missing split.
- Existing cancellations, retained deposits, credit expiry and reviewed adjustments are preserved. Do not issue new credit because an old cancellation is discovered. Em's 90-day retained deposit and a promotion's 180-day credit are separate policies, not global defaults.
- Source fingerprint + canonical Client + event identity + materialization key must support resumable, idempotent processing. New source evidence may reopen a review, but never silently rewrite a completed financial ledger.
- History recovery never grants, downgrades, extends or revokes membership/access. `my_mmd_entitlement_resolver_v1` and existing protected-relationship rules remain authoritative. Restrictions still apply.

### Customer and operator states

Backend-owned recovery states must distinguish queued/running, awaiting source, review required, partially recovered, complete, and retryable failure. Exact wire names must be defined and tested before UI integration. MY MMD displays “ประวัติเดิมยังอยู่ระหว่างตรวจสอบ” when applicable; “กำลังดึงประวัติเดิม” is appropriate only when work is actually queued/running. Never claim a background job exists based only on an empty history array.

The internal review queue must expose the affected canonical customer, last attempt, source coverage, verified/recovered counts and actionable blockers. Ambiguous evidence remains reviewable without changing the member's current tier.

### Implementation status / release gate

The standing rule is effective as product/operations policy. It is NOT proof of a deployed on-access automation.

At the audit establishing this rule, `member-pages-worker/src/member-app-client-history.js` reads canonical Sessions/Payments; the canonical entitlement bridge calls that reader. Historical intake/materialization exist as separate reviewed scripts. A durable on-access producer, source Notes ingestion integration, consumer/retry/deduplication orchestration and recovery-state UI still require runtime implementation and production verification.

Do not report “automatic reconstruction for every login is live” until all of these are proven:

- two different verified members (including a non-protected tier) invoke the same pipeline, each restricted to their own evidence;
- Jo/Joeka enters recovery while keeping authoritative SVIP status, with missing source history shown as pending rather than fabricated;
- Em's already-materialized jobs and 8,250 THB retained deposit are unchanged after repeated/concurrent access;
- approved records materialize once, ambiguous records remain Review Required, and unavailable Notes cannot produce a false complete/empty state;
- retry/resume/new evidence works without duplicate jobs, money or points;
- Profile/History/Points show refreshed canonical data on the published LINE environment.
