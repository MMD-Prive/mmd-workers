# Public Access V1 — Worker Contract

## Intent

`/public/access` is the calm, non-urgent route where a client leaves a brief, may name a public model by name or MMD ID, and submits payment/supporting evidence for the 690 THB Public Access fee.

It is not a booking confirmation page.

## Ownership

| Stage | Owner |
|---|---|
| Public brief + evidence intake | `public-access-worker` |
| Public model search / urgent booking | `sigil-booking-worker` |
| Payment truth | `payments-worker` |
| Official review / status mutation | `admin-worker` |
| Internal notification | `telegram-worker` |
| Session/job after approval | `events-worker` |

## Flow

```text
/public/access
  -> public-access-worker
  -> private R2 evidence + Airtable Public Access Request
  -> internal Telegram notification
  -> Admin Console review
  -> only then: approved access / optional booking handoff
```

## Airtable: Public Access Requests

Create these fields before deploy:

- Request ID (single line text)
- Status (single select: PENDING_REVIEW, APPROVED, DECLINED, NEEDS_MORE_INFO)
- Created At (date/time)
- Source (single line text)
- Client Name (single line text)
- Contact Method (single select/text)
- Contact Value (single line text)
- Model Query (single line text)
- Brief (long text)
- Locale (single line text)
- Evidence R2 Key (single line text; internal only)
- Evidence Name (single line text)
- Evidence Type (single line text)
- Evidence Bytes (number)
- Evidence SHA256 (single line text)
- Evidence Status (single select/text)
- Payment Status (single select/text)
- Access Status (single select/text)

## Public response

```json
{
  "ok": true,
  "request_id": "PA-20260718-XXXX",
  "status": "PENDING_REVIEW",
  "evidence_only": true,
  "official_verification_required": true,
  "access_granted": false
}
```

## Deliberate boundaries

- No `t` storage, acceptance, or logging.
- A name or MMD ID is a preference, not model confirmation.
- No private model lookup is available here.
- Admin console must use a signed/internal path to view evidence; never return public R2 URLs.
- Do not route this page to `/sigil/booking`; that remains the “ready urgent” public booking lane.
