# payments-worker SIGIL API routes

This file records the production routing contract for the MMD Privé / SIGIL payment API.

## Cloudflare route ownership

The payments worker must own these production host routes so requests do not fall through to the origin and return Cloudflare `522`:

```toml
routes = [
  { pattern = "sigil.mmdbkk.com/v1/pay/*", zone_name = "mmdbkk.com" },
  { pattern = "sigil.mmdbkk.com/v1/payments/*", zone_name = "mmdbkk.com" },
  { pattern = "sigil.mmdbkk.com/v1/confirm/*", zone_name = "mmdbkk.com" }
]
```

## Current production endpoints

| Method | Path | Purpose | Notes |
| --- | --- | --- | --- |
| POST | `/v1/pay/verify` | Create or return a payment intent | Manual PromptPay flow, pending review |
| POST | `/v1/payments/notify` | Internal/admin payment notification | Requires internal auth, can mark paid/verified |
| POST | `/v1/confirm/link` | Create customer/model confirmation links | Internal flow |

## Slip evidence route contract

Planned route:

```txt
POST /v1/pay/slip/evidence
```

Purpose: accept customer slip evidence from the Payment Confirmation page.

Hard lock:

```txt
Slip = supporting evidence only.
Payment / access / session confirmation = official verification required.
```

The slip evidence route must not:

- mark payment as paid
- mark verification as verified
- unlock access
- activate member status
- confirm session/job
- award points

The route may:

- accept `multipart/form-data`
- record `session_id`, `payment_ref`, `payment_type`, `payment_stage`, `source_page`, `proof_type`
- attach/store a slip only when a safe storage target exists
- write a pending/manual review note
- notify Telegram/admin for manual verification

Recommended GET smoke behavior after deployment:

```txt
GET /v1/pay/slip/evidence -> 405 Method Not Allowed
Allow: POST
```

Recommended POST response before official verification:

```json
{
  "ok": true,
  "evidence_only": true,
  "verification_status": "pending",
  "payment_status": "pending",
  "message": "Slip evidence received. Official verification is still required."
}
```
