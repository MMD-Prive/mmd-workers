# My MMD Golden History Recovery v1

Status: Canonical MMD Memory
Owner: Per / MMD Privé
Scope: Direct My MMD entry and verified LINE/LIFF sessions

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
