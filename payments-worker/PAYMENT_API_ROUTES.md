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
| POST | `/v1/pay/slip/evidence` | Accept slip evidence from Payment Confirmation | Evidence-only, official verification still required |

## Slip evidence route contract

Implemented route:

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
- write a pending/manual review note
- notify Telegram/admin for manual verification

The route currently does not persist the binary file itself. It records safe metadata and pending review context only. Add R2 or Airtable attachment storage separately before claiming slip file storage.

GET smoke behavior:

```txt
GET /v1/pay/slip/evidence -> 405 Method Not Allowed
Allow: POST
```

Expected POST response before official verification:

```json
{
  "ok": true,
  "evidence_only": true,
  "official_verification_required": true,
  "verification_status": "pending",
  "payment_status": "pending",
  "message": "Slip evidence received. Official verification is still required."
}
```

Safe smoke command:

```bash
curl -i https://sigil.mmdbkk.com/v1/pay/slip/evidence

curl -i -X POST https://sigil.mmdbkk.com/v1/pay/slip/evidence \
  -F "payment_ref=pay_test" \
  -F "session_id=sess_test" \
  -F "payment_stage=deposit" \
  -F "proof_type=payment_slip" \
  -F "source_page=payment_confirmation" \
  -F "file=@/path/to/slip.jpg"
```
