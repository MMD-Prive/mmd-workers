# LINE Canonical Identity Commit Adapter V1

Status: proposed implementation contract
Owner: MMD auth / LIFF identity
Scope: reviewed LINE OFC staging identity links only

## Objective

Bridge the existing review layer into the committed identity contract already consumed by the auth-worker resolver from PR #467:

`staging exact LINE -> reviewed link -> canonical Client -> committed identity link -> #467 resolver -> Drive bootstrap -> Member retry`

The adapter does not grant membership, package, points, payment, Hall access, Black Card/SVIP, or booking access.

## Source records

A staging row is eligible only when all of the following are true:

- `line_user_id` is a valid LINE user id (`U` + 32 hex chars)
- `decision = link_existing_client`
- `decision_source = manual_review`
- `reviewed_by` is present
- `reviewed_at` is a valid timestamp
- `review_status` is one of `review_required`, `ready_to_commit`, or `committed`
- `matched_client_id` is a valid Airtable Client record id
- any existing `matched_client` link is either empty or exactly the same Client

The adapter must never derive a committed identity from fuzzy name, email candidate, phone candidate, display name, membership tag, or unreviewed staging data.

## Canonical Client checks

Before any write, the adapter verifies:

1. exactly one `Clients` record exists for `matched_client_id`
2. the Client has exactly one canonical email across `Contact Email` and `email`
3. if the Client already has `line_user_id`, it equals the reviewed LINE id
4. no different Client already owns that LINE id
5. no existing committed staging link points the same LINE id at another Client
6. no other manually reviewed staging row points the same LINE id at a different Client

Any conflict fails closed with no adapter write.

## Commit fields

The adapter may write only canonical identity metadata:

### Clients

- `line_user_id` only when currently empty

### LINE OFC Client Import Staging

- `matched_client`
- `matched_client_id`
- `match_type = line_user_id_exact`
- `match_confidence = 100`
- `decision = link_existing_client`
- `decision_source = manual_review`
- `review_status = committed`
- `dry_run_only = false`
- `committed_at`
- `committed_by`
- clear `error_message`

It must not write Members, Member Entitlements, Payments, Points Ledger, package state, membership tier, or campaign state.

## Ordering and partial failure

The Client direct LINE link is written first, followed by the committed staging link.

Reason: if the second Airtable write fails after the first succeeds, the trusted identity resolver can still resolve through the canonical `Clients.line_user_id` source. The operation remains idempotent and can be retried to complete the staging projection.

If a committed staging link already exists for the same LINE id and same Client, the operation is a no-op for staging. If the Client direct LINE link is already present too, the entire operation is a no-op.

## Verification

After apply, the adapter re-reads both canonical sources and requires at least one of these trusted resolution paths to be true for the same Client:

- direct canonical Client LINE link
- committed exact staging link matching PR #467 contract

The CLI reports `resolver_ready`, `drive_bootstrap_ready`, and `member_retry_ready` only after this verification succeeds.

## Execution mode

Default execution is dry-run.

Production mutation requires explicit `--apply` and the usual MMD production approval gate.

Example:

```sh
node scripts/line-official-legacy/canonical-identity-commit-adapter.js \
  --import-id line_ofc_console_line_123456789
```

Apply only after approved review:

```sh
node scripts/line-official-legacy/canonical-identity-commit-adapter.js \
  --import-id line_ofc_console_line_123456789 \
  --line-user-id U0123456789abcdef0123456789abcdef \
  --apply
```

The adapter intentionally does not contain Drive credentials or call customer-facing routes. After the identity contract is committed, the existing LIFF request path continues through the #467 trusted resolver, Drive package lookup, auth-worker materialization, and the existing Member retry logic.
