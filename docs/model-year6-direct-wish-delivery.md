# MMD MODEL · Year 6 Direct Wish Delivery

Status: implementation contract
Surface: `/sigil/model/wish`
Campaign: `mmd_year_6_model_direct_wish`

## Flow

```text
Model
→ authenticated MMD MODEL / LINE session
→ Wish submission
→ manual_review
→ Per/Admin Approve
→ deliver only to Model-selected scopes
   ├─ Telegram customer group(s)
   └─ Past Clients → private note in MY MMD
```

This is deliberately separate from the existing post-job `mmd_year_6_model_wish` sidecar. Direct Year 6 Wish does not need an active job and must never create a fake Session or affect payout.

## Model input

The Webflow page submits to the existing query-safe Model route:

```text
POST /v1/model/session/current?mode=year6_direct_wish
```

Identity authority is the signed `mmd_model_session_v1` session.

Visible Q1 copy is locked:

```text
01 · อวยพร 6 ปี MMD
อวยพร MMD ครบ 6 ปี
```

Submission stores in `MMD — Birthday Wishes` (`tblvMJjYXy29mgDLb`) with:

```text
campaign_id = mmd_year_6_model_direct_wish
wish_option = model_direct_wish
wish_status = manual_review
idempotency = one direct Year 6 Wish per canonical Model
```

## Review gate

The existing credential-bound Model Wish review endpoints remain authority:

```text
GET  /v1/admin/model-wishes/review-queue
POST /v1/admin/model-wishes/review
```

The direct campaign extends that queue only after the existing admin gate has authorized the request. Approve activates only checked scopes. Reject stores `revoked`.

No Telegram send and no past-client projection may happen while `manual_review`.

## Telegram routing

Canonical Model taxonomy is exactly:

```text
Standard / Premium / Exclusive
```

There is no VIP Model tier.

Approved Model Wish distribution:

```text
Standard  → Standard Group + Premium Group
Premium   → Premium Group
Exclusive → Premium Group
```

Wish delivery is text-only. This preserves the customer-facing Exclusive rule that real Model photos must not be exposed; any future Exclusive visual must use an explicitly approved AI-safe asset.

Current configured/fallback group IDs used by this flow:

```text
Standard Group: -1002073919780
Premium Group:  -1001668261779
```

Both remain environment-overridable. Black Room and INNER Chamber are not destinations for this campaign.

## Past Clients → MY MMD

Past-client visibility is independent from Telegram consent.

The Worker requires all of the following:

- direct Wish is approved (`completed`),
- `past_clients_consent === true`,
- authenticated MY MMD member session,
- exact canonical Client resolution,
- a completed canonical Session linked to that exact Client,
- the exact `Canonical Model` record on that completed Session equals the Wish Model.

If exact canonical linkage is unavailable, the projection fails closed and returns no note.

Customer-safe dashboard projection:

```json
{
  "private_model_notes": [
    {
      "type": "model_wish",
      "visibility": "past_client_private",
      "model_name": "safe display name",
      "text": "approved birthday_wish only",
      "submitted_at": "timestamp or null",
      "approved_at": "timestamp or null"
    }
  ]
}
```

The canonical My MMD presentation consumes this from `GET /api/member/app/dashboard` and renders it privately on the member home screen.

## Privacy locks

`private_note_per` is Per-only and is never sent to Telegram or MY MMD customers.

The customer projection never exposes Q2 MMD message, Airtable IDs, Model record IDs, LINE IDs, media IDs, R2 data, `payload_json`, internal statuses, or review audit details.

This direct campaign is also excluded from the general public Wish wall; that public projection continues to use its separate campaign/status rules.
