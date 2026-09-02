# mms-worker

Cloudflare Worker for MMS Male Therapist Delivery.

## Responsibilities

- MMS therapist application intake
- private R2 upload grants for profile photos and certificates
- verified therapist matching by recipient gender, zone, and 1-6 selected skills
- idempotent pre-booking coordination with a SQLite-backed Durable Object
- restricted Airtable synchronization
- HENNA LINE Official Account webhook with fail-closed signature verification

Sexual orientation is written only to `MMS Therapist Sensitive Profiles` after explicit consent. It is never returned by matching, booking, catalog, or public application responses.

## Public routes

- `GET /health`
- `GET /mms/api/catalog`
- `POST /mms/api/applications`
- `POST /mms/api/uploads/presign`
- `PUT /mms/api/uploads/:applicationRef/:uploadToken`
- `POST /mms/webhooks/line`

## HENNA LINE bot

Set these as Cloudflare secrets for the Male Massage LINE Messaging API channel only:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`

`LINE_AUTO_REPLY_ENABLED` defaults to `false`. In this state, the webhook verifies and classifies events but sends no automatic LINE replies. Set it to `true` only after the LINE Console webhook verification and production smoke pass.

The canonical Male Massage Messaging API channel is `2011386859`, configured as `MMS_LINE_CHANNEL_ID` for identity checks. It is not a secret.

HENNA answers only stable MMS information (booking intake, service categories, how-to, and therapist applications). Price, live availability, explicit human requests, and unknown questions are routed to the existing MMS Telegram operations chat without copying customer message content.

Public write routes accept only configured MMD/Webflow origins. Add Turnstile before advertising the application endpoint broadly.

## Service-binding routes

Call these through a Cloudflare Service Binding with the URL host `mms.internal`:

- `POST /mms/api/therapists/match`
- `POST /mms/api/prebookings`
- `GET /internal/mms/applications/:applicationId`
- `POST /internal/mms/applications/:applicationId/sync`
- `GET /internal/mms/prebookings/:prebookingId`

Do not add a public custom route for the internal endpoints.

## GitHub Actions secrets

- `MMS_CLOUDFLARE_API_TOKEN`: Cloudflare account token with Workers Scripts Edit and Workers R2 Storage Edit
- `MMS_AIRTABLE_API_TOKEN`: Airtable PAT used as the runtime `AIRTABLE_API_TOKEN`

## Required Cloudflare resource

- private R2 bucket `mms-private-uploads`

The production workflow creates the bucket once when needed and reuses it on later deployments.

If the Airtable secret is temporarily unavailable, applications and pre-bookings remain durable in their coordinator objects with a pending sync status. The internal application sync endpoint can retry after the secret is configured.
