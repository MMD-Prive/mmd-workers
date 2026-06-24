# Kenji Member Memory Worker

Connects verified LINE/LIFF identity to MMD Airtable member memory and returns a safe Kenji context snapshot.

## Owner

This worker owns the current LIFF -> Airtable memory -> Kenji context bridge.
Do not add this flow to `immigrate-worker`; that worker stays legacy/migration-only.

## Endpoints

### `POST /api/liff/session`

Creates one `MMD — LIFF Renewal Sessions` row after an upstream LINE/LIFF owner has verified identity.

Input body:

```json
{
  "line_user_id": "Uxxxx",
  "line_display_name": "Jay Pm 24/06/26",
  "nickname": "Jay",
  "requested_package": "premium",
  "entry_route": "/member/membership"
}
```

Returns:

- customer-visible profile preview
- Kenji safe context
- member-facing message
- materialization status

### `GET|POST /api/member/profile-preview`

Returns only the customer-visible profile fields.

### `POST /api/kenji/context`

Returns the safe context object that chat/LINE/Per AI/Kenji can inject before replying.

## Security model

This bridge expects LINE identity to be verified upstream before calling it. Protect production calls with `MMD_INTERNAL_KEY` using header:

`x-mmd-internal-key: <secret>`

The worker does not accept raw LINE tokens and does not expose raw Airtable notes.

## Airtable tables used

- `Clients`
- `LINE OFC Client Import Staging`
- `MMD — LIFF Renewal Sessions`
- `MMD — Member Entitlements`

## Rules locked in this bridge

- Client ID is immutable after materialization.
- Customer nickname can change; Client ID cannot.
- Confirmed points are customer-visible.
- Legacy/proposed points stay internal until review/materialization.
- LINE identity linking alone does not materialize points, service history, profile, payments, or entitlements.
- Ban/internal restriction state is not customer-visible.
- SVIP is a Per-only manual decision, not an automatic points unlock.
