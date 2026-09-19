# Verified Client Credit v1

`MMD — Client Credits` is the canonical retained-customer-funds ledger. A Client Credit is usable only when it is independently backed by the canonical Payments authority.

## Verification invariant

A credit is **verified** only when all of the following are true:

1. `Verification Status = verified`
2. `Verification Source = payment_authority`
3. `Verified Amount THB > 0`
4. the source Payment passed the existing official payment verification gate before the credit was minted
5. the verified amount covers the credit's original amount

`Verified?` in Airtable is an operator convenience projection, not an authority by itself. Browser/UI code must never infer verification.

## Minting

The admin carry-forward operation verifies the canonical source Payment and Session first. Only then may it upsert the deterministic `credit_id` and write the verification snapshot copied from Payments authority.

Old, migrated, or manually-created credit rows that do not contain the verification metadata fail closed and are not included in customer usable balance.

## Member API

`GET /api/member/app/credits` exposes only verified credits. Customer-safe items may expose `verified: true`; verifier identity, verification reference, source-payment reference, Airtable record IDs, internal reason codes, and the internal verification snapshot are never returned.

The available balance is the sum of verified credits whose lifecycle status is `available` or `partially_used`.
