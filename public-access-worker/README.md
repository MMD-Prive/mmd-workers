# Public Access Worker V1

Public intake boundary for `/public/access`.

It accepts one request containing:
- client name and chosen contact channel
- free-form brief
- optional public model name or MMD ID (`model_query`)
- payment/supporting evidence file

## Route

```
POST https://sigil.mmdbkk.com/public/api/access/intake
```

The route accepts `multipart/form-data` with:

| Field | Required | Notes |
|---|---:|---|
| `name` | yes | client display name |
| `contact_method` | yes | `line`, `telegram`, `email`, or `phone` |
| `contact_value` | yes | selected contact value |
| `model_query` | no | public model name or MMD ID |
| `brief` | yes | up to 3,000 characters |
| `evidence` | yes | JPG, PNG, WEBP, or PDF; max 10 MB |
| `consent` | yes | must be `true` |
| `source` | no | e.g. `profiles` |
| `locale` | no | e.g. `th-TH` |

## Safety locks

- Evidence is uploaded to a **private R2 bucket** only.
- R2 keys are not returned to the public browser.
- The endpoint never marks a payment as paid.
- The endpoint never grants Public Access.
- The endpoint never confirms a model or booking.
- MMD must perform official review in Admin Console before any status change.
- `t` is deliberately not accepted or stored by this public endpoint.

## Required bindings / secrets

```toml
[[r2_buckets]]
binding = "PUBLIC_ACCESS_EVIDENCE"
bucket_name = "mmd-public-access-evidence"
```

```bash
wrangler secret put AIRTABLE_API_KEY
wrangler secret put TELEGRAM_INTERNAL_TOKEN
wrangler secret put TELEGRAM_INTERNAL_SEND_URL
wrangler secret put TELEGRAM_PUBLIC_ACCESS_CHAT_ID
```

Airtable table: `Public Access Requests`.

Required fields are documented in `docs/architecture/PUBLIC_ACCESS_V1.md`.

## Webflow bridge

```html
<div
  data-api-base="https://sigil.mmdbkk.com"
  data-submit-path="/public/api/access/intake"
></div>
```

The frontend should submit `FormData`; it must not attach API keys or trust client-supplied access status.
