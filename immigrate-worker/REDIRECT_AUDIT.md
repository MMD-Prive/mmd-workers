# REDIRECT_AUDIT - Phase 5 SIGIL Public Model Assets

## Phase 5 - SIGIL public model asset completion

Date: 2026-06-26
Worker: `immigrate-worker`
Scope: public SIGIL model API sanitizer and asset fallbacks only.

### Summary

- Added public-safe model sanitizer output shape:
  - `model_id`
  - `display_name`
  - `status`
  - `cover_url`
  - `gallery_count`
  - `service_fit_tags`
  - `asset_status`
  - `public_safe`
- Added public image alias fallback support for stable public `https://` URLs only.
- Kept private/internal asset data out of public responses, including R2 keys/prefixes, Drive URLs, attachment objects, internal notes, tokens, and upstream error details.
- Set `asset_status` to `ready` only when a stable public image URL is present; otherwise `drive_pending_sync`.
- Added gallery count aliases and public service-fit tag allowlist:
  - `straight-fit`
  - `gay-fit`
  - `private-fit`
  - `travel-fit`
- Added same sanitizer path for search, detail, and new-arrivals endpoints.

### Validation

```sh
npm --prefix immigrate-worker test
```

Result: passed.

### Deploy

```sh
npx wrangler deploy --config immigrate-worker/wrangler.toml
```

Latest listed deployment version:

```txt
d3121f40-0ed2-4a73-b6dd-a07ce8c95455
created_at: 2026-06-26T12:55:31.359Z
```

No production Airtable write route was exercised.

### Live Smoke

Workers.dev:

```sh
curl -i "https://immigrate-worker.malemodel-bkk.workers.dev/api/sigil/models/search?q=kenji&cb=$(date +%s)"
```

Result: HTTP 200, `status: "models_found"`, Kenji returned with:

```json
{
  "model_id": "mdl_pri_str_kenji",
  "display_name": "Kenji",
  "status": "active",
  "cover_url": "",
  "gallery_count": 0,
  "service_fit_tags": ["private-fit", "travel-fit"],
  "asset_status": "drive_pending_sync",
  "public_safe": true
}
```

SIGIL domain:

```sh
curl -i "https://sigil.mmdbkk.com/api/sigil/models/search?q=kenji&cb=$(date +%s)"
```

Result: HTTP 200, `status: "models_found"`, Kenji returned through `sigil-worker` upstream to `immigrate-worker` with the same public-safe shape.

## Phase 6A - SIGIL booking frontend submit route

Date: 2026-06-26
Worker: `immigrate-worker`
Scope: `/sigil/booking` HTML page submit route and public booking request response safety.

### Summary

- Kept `/sigil/booking` as the HTML page route.
- Did not make POST `/sigil/booking` public; it remains on the existing admin/create-links path.
- Updated the SIGIL booking frontend to submit public booking requests through the existing public handler path:
  - `/api/sigil/booking/request`
- Kept `/v1/public/booking-request` as a backward-compatible alias for the same public booking handler.
- The SIGIL-routed submit path avoids relying on `/v1/public/*` host routing from `sigil.mmdbkk.com`.
- The public submit path is rendered as a relative path only. It does not hardcode `workers.dev`, `sigil.mmdbkk.com`, or `mmdbkk.com`.
- Aligned frontend payload with the existing public booking handler required fields instead of adding a new backend contract.
- Added a public `contact` field required by `PUBLIC_BOOKING_REQUIRED_FIELDS`.
- Removed payment refs, confirm/cancel URLs, metadata blobs, and raw token propagation from the booking page submit payload.
- Updated success copy to pending/review language: `Booking request received for review.`
- Hardened public booking success response to avoid exposing Airtable storage mode/target or upstream write details.

### Files Changed

- `immigrate-worker/src/index.ts`
- `immigrate-worker/test/sigil-booking-api.test.mjs`
- `immigrate-worker/REDIRECT_AUDIT.md`

### Validation

```sh
npm --prefix immigrate-worker test
```

Result: passed.

Covered:

- GET `/sigil/booking` returns HTML.
- HTML/JS submits to relative `/api/sigil/booking/request`.
- HTML/JS does not submit the public form to `/sigil/booking`.
- POST `/api/sigil/booking/request` reaches `handlePublicBookingRequest`.
- POST `/v1/public/booking-request` remains a compatibility route to `handlePublicBookingRequest`.
- POST `/sigil/booking` remains non-public and redirects toward SIGIL admin login without becoming the public booking handler.
- Booking page HTML does not contain forbidden field names such as `orientation_label`, `r2_prefix`, `primary_image_key`, `airtable_record_id`, `redirect_url`, or raw token values.
- Existing model search, new-arrivals, and detail sanitizer tests still pass.

### Deploy

```sh
npx wrangler deploy --config immigrate-worker/wrangler.toml
```

Latest listed deployment version:

```txt
819dc2b5-a47a-4347-afaf-2f755f422fcd
created_at: 2026-06-26T16:51:51.328Z
```

Wrangler uploaded/deployed the worker version and then returned the existing routes API warning/failure:

```txt
Some triggers failed to deploy for immigrate-worker:
- /accounts/.../workers/scripts/immigrate-worker/routes
```

### Live Smoke

Booking page:

```sh
curl -i "https://sigil.mmdbkk.com/sigil/booking?cb=$(date +%s)"
```

Result: HTTP 200. Live HTML contains:

```js
fetch("/api/sigil/booking/request", ...)
```

Model search:

```sh
curl -i "https://sigil.mmdbkk.com/api/sigil/models/search?q=kenji&cb=$(date +%s)"
```

Result: HTTP 200, `status: "models_found"`, Kenji returned with the public-safe Phase 5 shape.

Public booking request:

```sh
curl -i -X POST "https://sigil.mmdbkk.com/api/sigil/booking/request"
```

Expected result after deploy: HTTP 200, `ok: true`, pending/request IDs returned. Response omits Airtable storage internals and does not use confirmed-booking language.

Note: the Phase 6A live public booking request smoke exercised the production public booking write path and created test Airtable records. Safe labels used:

- `Codex Phase 6A Smoke`
- `Codex Phase 6A Smoke Final`

These records were created as explicit smoke-test records and should be treated as test data. No cleanup/mark-test mutation was performed in this PR follow-up because that would be another production Airtable write and was not requested.

Manual browser smoke:

- Opened `/sigil/booking`.
- Searched `Kenji`.
- Confirmed match text: `Matched: Kenji (mdl_pri_str_kenji)`.
- Submitted a smoke request with `Codex Phase 6A Smoke` data.
- Confirmed UI status: `Booking request received for review.`
- Confirmed no confirmed booking language appeared in the UI result.
