# My MMD Note-First History Recovery V2

Status: Owner-approved implementation canon  
Owner: Per / MMD Privé  
Effective decision: 14 September 2026 (Asia/Bangkok)  
Supersedes: strict old-slip matching for legacy My MMD history reconstruction

## Product objective

Restore useful five-year customer history and current accumulated Points quickly after a verified member enters My MMD through LINE/LIFF.

This policy applies only to historical reconstruction. Current/new payment verification remains owned by the normal payment authority.

## Owner rule

1. An MMD-owned LINE Official customer Note is sufficient historical evidence that a service job occurred.
2. A job is excluded only when that job Note or normalized historical status explicitly says it was cancelled, for example `ยกเลิกงาน`, `งานยกเลิก`, `cancelled job`, or an equivalent explicit cancellation marker.
3. Old slips are optional supporting evidence. A historical customer is not required to reproduce a complete set of slips.
4. A verified slip or transfer trace with no matching job Note remains orphan payment evidence for later stitching. It must not delay Note-based history or Points recovery.
5. Tips, direct-hand tips, membership fees and renewal fees do not become service Points under this flow.
6. Historical service Points use `100 THB = 1 Point` from the combined eligible service amount found in non-cancelled Notes.
7. Phase 1 Points are shown as one lifetime accumulated total. They do not expire. No 365-day rolling reduction is applied in My MMD during this phase.
8. History recovery never grants, extends, downgrades or revokes membership/access. `my_mmd_entitlement_resolver_v1` remains current-access authority.

## Runtime flow

```text
Verified LINE login
-> exact canonical Client and Member resolution
-> read all available five-year LINE OFC staging Notes for that identity
-> dedupe by source fingerprint + canonical Client
-> explicit cancel => exclude job and Points
-> Note without cancel => accept historical occurrence
-> known date => create/reuse one completed historical Session
-> known eligible service amount => reconcile one non-expiring historical Points total
-> unmatched verified slips => retain as later-stitching queue/count
-> refresh My MMD Profile / History / Points
```

## Idempotency

- A deterministic source fingerprint produces one `history_review_id` and one historical `session_id`.
- Repeated login, reload, refresh or retry must not create duplicate Sessions or Points.
- Historical Points use one deterministic aggregate row per canonical Client.
- Existing per-event historical Points are deducted from the aggregate target before the aggregate row is written.
- The aggregate row is reconciled in place when newly imported Notes increase or correct the historical total.

## My MMD customer response

My MMD may show:

- current lifetime Points total;
- historical Points recovered from Notes;
- count of Notes found;
- recovered history count;
- count of explicit cancellations excluded;
- count of undated Notes or unmatched slips still being organized.

My MMD must never expose raw Notes, LINE user IDs, slips, internal rationale, payment references, risk notes, R2 keys or private operator data.

Customer-safe copy should explain that:

- old history is being restored from MMD records;
- old slips are not required for Note-based recovery;
- some transaction traces may still be organized later;
- current membership level and access are not changed by history reconstruction;
- Points are displayed as accumulated lifetime Points in Phase 1 and do not expire.

## Source boundary

The runtime processes MMD-authorized LINE OFC data already present in the canonical staging/import tables. If the full five-year LINE archive has not yet been imported for a person, the state remains source pending; the system must not claim that the customer has no history.

## Acceptance tests

- A Note with a service amount and no slip creates history and Points.
- A Note containing an explicit cancellation creates neither a completed Session nor Points.
- A verified slip without a matching Note remains orphan evidence and does not block the Note-based total.
- Two imports of the same Note produce one Session and one Points contribution.
- Old posted Points and old redemptions are included in the lifetime total regardless of prior expiry dates.
- No My MMD response exposes raw historical evidence.
