# Kenji AI V1 Context Contract

Status: documentation only. This contract describes the sanitized context shape future Kenji code may consume. It does not implement LLM intelligence and does not authorize deploys, LINE publishing, Webflow publishing, route changes, or merges.

## Purpose

Kenji V1 context must separate user intent from backend truth. Chat, Rich Menu, LIFF, Telegram Preview, and public routes may start a flow, but they do not prove payment, membership, session, dashboard, VIP/SVIP, Black Card, or admin state.

## Contract Shape

```json
{
  "mode": "public_line_wakeup",
  "channel": "line",
  "intent": "talk_to_per_ai",
  "identity": {
    "trust": "unknown",
    "safe_display_name": "optional first name only"
  },
  "member_status": {
    "state": "unknown",
    "source": "none",
    "safe_next_action": "continue_to_member_status"
  },
  "payment_status": {
    "state": "unknown",
    "source": "none",
    "safe_next_action": "continue_to_payment_or_review"
  },
  "booking_status": {
    "state": "unknown",
    "source": "none",
    "safe_next_action": "continue_to_booking"
  },
  "route_hints": [
    {
      "label": "booking",
      "path": "/sigil/booking"
    }
  ],
  "escalation": {
    "required": false,
    "reason": null
  }
}
```

## Allowed Enums

`mode`:

- `public_line_wakeup`
- `member_dashboard_support`
- `renewal_support`
- `payment_guidance`
- `booking_guidance`
- `escalation_to_per`
- `unknown_safe_fallback`

`channel`:

- `line`
- `member_dashboard`
- `public_web`
- `internal_operator`
- `telegram_preview`
- `unknown`

`identity.trust`:

- `unknown`
- `public_line_profile`
- `liff_identified`
- `backend_matched`
- `authorized_member`
- `internal_operator`

`member_status.state`:

- `active`
- `expired`
- `pending`
- `no_paid_package`
- `review_required`
- `unknown`

`payment_status.state`:

- `not_started`
- `proof_received`
- `under_review`
- `safe_confirmed`
- `rejected`
- `refunded`
- `disputed`
- `unknown`

`booking_status.state`:

- `not_started`
- `requested`
- `pending_confirmation`
- `confirmed`
- `completed`
- `cancelled`
- `unknown`

## Field Rules

- `intent` may come from `inferLineIntent()` or a future safe intent classifier.
- `identity.safe_display_name` may use a first display name only. It must not include raw LINE ID, Telegram ID, email, phone, or private identifiers.
- `member_status`, `payment_status`, and `booking_status` may only represent trusted backend resolver output or `unknown`.
- `route_hints` may include public/member-safe routes only.
- `escalation.required` must be `true` when any required escalation trigger is present.

## Forbidden Context Fields

Do not pass these fields into public Kenji replies or LLM context:

- Raw email, phone, LINE ID, Telegram ID, Memberstack ID, Airtable record ID.
- Raw admin notes, model notes, client notes, risk flags, hidden availability, or operator-only comments.
- Raw payment reference, `payment_ref_raw`, bank/private details, slip URLs, proof file URLs.
- Tokens, bearer credentials, `X-Confirm-Key`, Rich Menu IDs, service-binding aliases, route ownership keys.
- Admin endpoint paths intended only for internal mutation.

## Source Admission Rules

| Source | May Enter Context? | Rule |
| --- | --- | --- |
| LINE message text | Yes | Intent/evidence only, never backend truth |
| LINE profile | Limited | Display name only; raw user ID remains out of reply/LLM context |
| Rich Menu wakeup | Yes | Wakeup/intent only, never access truth |
| LIFF identify response | Yes | Only safe response fields such as membership state, package state, `safe_next`, dashboard lock reason |
| Backend member resolver | Yes | Preferred source for member status if authorized and sanitized |
| Backend payment resolver | Yes | Preferred source for payment status if authorized and sanitized |
| Backend session resolver | Yes | Preferred source for booking/session status if authorized and sanitized |
| SIGIL Board status/queue | Internal mode only | Sanitized counts/cards for operator awareness; not public LINE context by default |
| Admin worker | Internal mode only | Requires internal auth; no public chat mutation |
| Telegram Preview | Limited | Entry/preview state only unless a real adapter is built |
| Frontend `localStorage` | No | Never truth for membership, payment, session, or access |

## Escalation Contract

Set `escalation.required: true` when the request involves:

- Payment confirmation, slip verification, refund, dispute, or "mark paid".
- VIP, SVIP, Black Card, points authority, package override, or manual upgrade.
- Complaint, privacy concern, safety concern, unclear identity, account mismatch, or manual review.
- Any approval, unlock, access change, membership mutation, payment mutation, session mutation, route change, secret change, or admin action.

`escalation.reason` should use a small safe label, such as:

- `payment_confirmation_request`
- `refund_request`
- `vip_svip_black_card`
- `complaint`
- `privacy_concern`
- `unclear_identity`
- `manual_review`
- `approval_or_access_change`

## Output Requirements

Every Kenji V1 answer should be one of:

- Safe acknowledgement.
- Public/member route guidance.
- Sanitized backend status summary.
- Request for non-sensitive clarifying detail.
- Escalation to Per/MMD.

Every Kenji V1 answer must avoid:

- Authority claims.
- Raw identifiers.
- Private notes.
- Backend mutation claims.
- Hidden availability or internal operational detail.
- Confirmation of payment, membership, booking, VIP/SVIP, or Black Card unless the safe backend resolver explicitly returns a public-safe confirmed state and the reply stays non-mutating.
