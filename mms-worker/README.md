# mms-worker

Cloudflare Worker for MMS Male Therapist Delivery.

## Responsibilities

- MMS therapist application intake
- private R2 upload grants for profile photos and certificates
- verified therapist matching by recipient gender, zone, and 1-6 selected skills
- idempotent pre-booking coordination with a SQLite-backed Durable Object
- restricted Airtable synchronization
- dedicated MMS Therapist LINE identity/session boundary

Sexual orientation is written only to `MMS Therapist Sensitive Profiles` after explicit consent. It is never returned by matching, booking, catalog, public application, or Therapist auth responses.

## Public routes

- `GET /health`
- `GET /mms/api/catalog`
- `POST /mms/api/applications`
- `POST /mms/api/uploads/presign`
- `PUT /mms/api/uploads/:applicationRef/:uploadToken`

Public write routes accept only configured MMD/Webflow origins. Add Turnstile before advertising the application endpoint broadly.

## MMS Therapist auth contract

The Therapist workspace is a separate authorization world from My MMD member access, the MMD Model Dashboard, and My MMS customer access.

Canonical browser routes:

- `POST /male-massage/therapists/api/auth/line`
- `GET /male-massage/therapists/api/auth/me`
- `POST /male-massage/therapists/api/auth/logout`

The production page is `/male-massage/therapists/login`; successful authentication continues to `/male-massage/therapists/me`.

### Identity rules

- The browser sends a LINE ID token obtained from the dedicated MMS Therapist LIFF / LINE Login channel.
- `mms-worker` verifies that token server-side with LINE's `POST https://api.line.me/oauth2/v2.1/verify` endpoint and the fixed `MMS_THERAPIST_LINE_CHANNEL_ID` audience.
- Client-provided LINE user IDs, display names, email addresses, application LINE handles, or profile objects are never accepted as identity authority.
- The verified LINE `sub` is HMAC-hashed with `MMS_THERAPIST_IDENTITY_PEPPER` and the Therapist channel ID before lookup. Raw LINE subjects and ID tokens are not stored.
- The application form's `LINE ID` field is contact data only. It must never auto-link a Therapist account.

### First-link bootstrap

A first-time Therapist must have a one-time high-entropy invite linked to a specific canonical `MMS Therapists` record.

The database stores only `SHA-256(invite_token)` in `Therapist Access Invite Hash`. The raw invite is never stored. A valid invite is consumed on successful linking and the verified LINE subject hash is bound to that Therapist record.

No public invite-generation route exists in this contract. Invite issuance remains an internal/admin action.

### Canonical Therapist fields required

The `MMS Therapists` table must contain these auth fields before the feature can be enabled:

- `Therapist Auth Status` — select values: `Unlinked`, `Active`, `Suspended`, `Revoked`
- `LINE Subject Hash` — single line text
- `Therapist Access Invite Hash` — single line text
- `Therapist Access Invite Expires At` — date/time
- `Therapist Access Linked At` — date/time
- `Therapist Access Last Login At` — date/time

Operational `Status` must also be `Active`. Both operational status and Therapist auth status are revalidated on `/auth/me`, so changing either status can fail closed without waiting for the cookie to expire.

### Session contract

- role: `mms_therapist`
- cookie: `__Secure-mms_therapist_session`
- `HttpOnly; Secure; SameSite=Lax`
- path: `/male-massage/therapists`
- lifetime: 8 hours
- signed with `MMS_THERAPIST_SESSION_SECRET`
- cookie claims contain only version, role, `therapist_id`, issued time, and expiry
- no LINE subject, ID token, Airtable record ID, application contact data, or private profile data is placed in the cookie

The contract intentionally does not accept a My MMD member session or Model Dashboard session as Therapist authorization.

### Required configuration before enablement

Non-secret:

- `MMS_THERAPIST_AUTH_ENABLED=true`
- `MMS_THERAPIST_LINE_CHANNEL_ID=<dedicated Therapist LINE channel ID>`

Secrets:

- `MMS_THERAPIST_SESSION_SECRET` — at least 32 random bytes / equivalent entropy
- `MMS_THERAPIST_IDENTITY_PEPPER` — at least 32 random bytes / equivalent entropy

`MMS_THERAPIST_AUTH_ENABLED` is committed as `false`. Do not flip it until the dedicated Therapist LINE channel, Airtable fields, first-link invite process, and same-origin route are ready.

### Same-origin requirement

The cookie is intentionally scoped to `/male-massage/therapists`, so production must route the three auth paths through the `mmdbkk.com` / `www.mmdbkk.com` origin to `mms-worker` (or an equivalent trusted same-origin gateway). Do not treat the `workers.dev` hostname as the production browser login origin.

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
