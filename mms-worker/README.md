# mms-worker

Cloudflare Worker for MMS Male Therapist Delivery.

## Responsibilities

- MMS therapist application intake
- private R2 upload grants for profile photos and certificates
- verified therapist matching by recipient gender, zone, and 1-6 selected skills
- idempotent pre-booking coordination with a SQLite-backed Durable Object
- restricted Airtable synchronization

Sexual orientation is written only to `MMS Therapist Sensitive Profiles` after explicit consent. It is never returned by matching, booking, catalog, or public application responses.

## Public routes

- `GET /health`
- `GET /mms/api/catalog`
- `POST /mms/api/applications`
- `POST /mms/api/uploads/presign`
- `PUT /mms/api/uploads/:applicationRef/:uploadToken`

Public write routes accept only configured MMD/Webflow origins. Add Turnstile before advertising the application endpoint broadly.

## Service-binding routes

Call these through a Cloudflare Service Binding with the URL host `mms.internal`:

- `POST /mms/api/therapists/match`
- `POST /mms/api/prebookings`
- `GET /internal/mms/applications/:applicationId`
- `POST /internal/mms/applications/:applicationId/sync`
- `GET /internal/mms/prebookings/:prebookingId`

Do not add a public custom route for the internal endpoints.

## Required Cloudflare secret

- `AIRTABLE_API_TOKEN`

## Required Cloudflare resource

- private R2 bucket `mms-private-uploads`

The bucket is provisioned once at the account level. The deploy token only needs to publish the Worker and bind the existing bucket; routine deployments do not create or inspect R2 buckets.

If the Airtable secret is temporarily unavailable, applications and pre-bookings remain durable in their coordinator objects with a pending sync status. The internal application sync endpoint can retry after the secret is configured.
