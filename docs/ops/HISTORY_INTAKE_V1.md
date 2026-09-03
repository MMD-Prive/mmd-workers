# MMD History Intake v1

Status: evidence collection contract only. This flow does not materialize current entitlement, payment truth, points ledger entries, or confirmed sessions.

## Purpose

Collect historical customer evidence from the places where MMD history actually exists today:

1. LINE OA 1:1 customer conversations.
2. Per's Crew LINE group/chat archive.
3. LINE group albums used for membership/payment/job evidence.

Airtable is the destination for reviewed/staged evidence, not the historical source.

## Flow

```text
LINE OA / Crew / group album export or manifest
  -> history-evidence-intake.js
  -> LINE OFC Client Import Staging
  -> MMD — Payment Proofs (pending only, when slip/payment metadata exists)
  -> human/review-safe reconciliation
  -> canonical identity commit
  -> later materialization of Sessions / Payments / Points
  -> my_mmd_entitlement_resolver_v1 for current rights
```

## Identity rule

- `line_renamed_name` is preserved exactly and remains the primary human-facing legacy identity evidence.
- LINE display name, LINE user id, email, and phone are matching/confirmation evidence only.
- Rename/history labels such as VIP, SVIP, and Black Card may prove historical relationship/recognition but do not create current access.

## Points rule

The existing historical note parser may produce `proposed_points` from service spend evidence at the locked staging rate `100 THB = 1 point`.

`proposed_points` is not a wallet mutation. History Intake v1 never writes `MMD — Points Ledger`.

Structured slip amount by itself is not treated as service spend. A 35,000 THB slip, for example, is staged as payment evidence only unless separate reviewed service-history evidence establishes a points-eligible service amount.

## Payment rule

When a row includes structured payment/slip metadata, History Intake v1 may create an immutable `MMD — Payment Proofs` evidence record with `status=pending`.

It must never set:

- `verified_at`
- `verified_by`
- `payment`
- `member`
- `session`
- paid/verified entitlement state

Official verification and matching happen later through the canonical payment/review flow.

## Immutable / duplicate-safe evidence

Each evidence item is SHA-256 fingerprinted from normalized source + source reference + identity/history/payment evidence.

- Same exact evidence -> same `history_<hash>` / `histproof_<hash>` identifiers.
- Existing evidence is returned and not overwritten.
- Reviewed/committed rows therefore cannot be downgraded by re-running intake.

## Allowed writes

History Intake v1 may write only:

- `LINE OFC Client Import Staging`
- `MMD — Payment Proofs`

Explicitly forbidden:

- `MMD — Member Entitlements`
- `MMD — Points Ledger`
- `Payments`
- `Sessions`
- `Bookings`

Current rights remain authoritative only through `my_mmd_entitlement_resolver_v1`.

## CLI

Dry-run is the default:

```sh
node scripts/line-official-legacy/history-evidence-intake.js \
  --file ./history.json \
  --source line_ofc \
  --batch-id history_20260903
```

Evidence-only apply:

```sh
node scripts/line-official-legacy/history-evidence-intake.js \
  --file ./history.json \
  --source line_crew \
  --batch-id history_20260903_crew \
  --apply-evidence
```

Allowed source values:

- `line_ofc`
- `line_crew`
- `line_group_album`

Each input row must include a stable `source_ref`, at least one identity anchor, and at least one history/payment evidence field.

## Example JSON

```json
[
  {
    "source": "line_ofc",
    "source_ref": "oa:chat:customer:2024-05-12:001",
    "line_user_id": "U...",
    "line_display_name": "Peapo",
    "line_renamed_name": "โป้ Blackcard",
    "tags": "#client #mem65 #mem66 #memBlackCard",
    "note": "Service purchase 12,000 THB on 12/05/2024 ref ABCD1234"
  },
  {
    "source": "line_crew",
    "source_ref": "crew:album:2026-06:slip-001",
    "line_renamed_name": "โป้ Blackcard",
    "amount_thb": 35000,
    "paid_at": "2026-06-22T14:17:00+07:00",
    "payment_ref": "A24fe4dc9b64e43ca"
  }
]
```

The first row may produce staged service history / proposed points. The second row remains payment evidence only until verified and reconciled.
