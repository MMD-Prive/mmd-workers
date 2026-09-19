# Model Session Contract V1

Status: additive contract only. This PR does not add runtime wiring, transition endpoints, route changes, deploy behavior, Telegram link issuance, or Flash validation.

## Purpose

Model Session Contract V1 gives later APIs and UI one source of truth for model-side lifecycle naming, route ownership, UI action hints, and future server transition validation.

The contract keeps MMD canonical names as the source of truth. Legacy or review inputs may normalize into canonical states, but they are not added as production state names.

## Canonical States

The canonical state order is:

1. `offered`
2. `offer_declined`
3. `offer_expired`
4. `confirmed`
5. `en_route`
6. `nearby`
7. `arrived`
8. `met_customer`
9. `final_payment_pending`
10. `final_payment_confirmed`
11. `work_started`
12. `work_finished`
13. `separated`
14. `under_review`
15. `payout_pending`
16. `closed`

## Normalized Inputs

Accepted aliases normalize as follows:

| Input | Canonical |
| --- | --- |
| `assigned` | `confirmed` |
| `traveling` | `en_route` |
| `met` | `met_customer` |
| `met_client` | `met_customer` |
| `payment_pending` | `final_payment_pending` |
| `payment_confirmed` | `final_payment_confirmed` |
| `working` | `work_started` |
| `finished` | `work_finished` |
| `review` | `under_review` |
| `payout` | `payout_pending` |

## Page Ownership

| Page | States |
| --- | --- |
| `/model/session/offered` | `offered`, `offer_declined`, `offer_expired` |
| `/model/session/assigned` | `confirmed` |
| `/model/session/on-the-way` | `en_route`, `nearby` |
| `/model/session/arrival-payment` | `arrived`, `met_customer`, `final_payment_pending`, `final_payment_confirmed` |
| `/model/session/session-live` | `work_started` |
| `/model/session/wrap-up` | `work_finished`, `separated`, `under_review`, `payout_pending`, `closed` |

## UI Action Hints

`allowed_actions[]` is a UI hint only. It must never be treated as the security gate for a POST transition.

Start Work may be visible only when the current state is `final_payment_confirmed`.

## Future Server Validation Rules

Future POST transition handlers must re-check current server state immediately before writing a new state. They must not trust a page state, hidden field, client payload, or `allowed_actions[]`.

The future `start_work` transition has these hard requirements:

- current server state must be `final_payment_confirmed`
- handler must call `payments-worker` live before writing `work_started`
- slip/proof alone must never unlock the action

## Future Link And Flash Rules

Telegram deep links must be short-lived signed links, not plain session IDs.

Flash unlock must never come from slip/proof alone.

## Files

- `admin-worker/src/modelSessionContractV1.js`
- `admin-worker/model-session-contract-v1.test.mjs`
