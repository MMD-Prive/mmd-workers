# SIGIL Booking Worker

Public-safe backend resolver for `/sigil/booking` v24.

## Purpose

Webflow must not read Airtable, R2, Google Drive, or Gmail directly. This worker receives the public booking page calls and performs the backend-only checks.

## Routes

- `POST /sigil/api/client/resolve`
  - Resolves member status from Airtable Members and member_packages.
  - Writes/updates `SIGIL Booking Requests` with `booking_ref`, `session_id`, `member_status`, and `access_scope`.
  - Non-found/new/expired users remain `public_only`.
  - Active members become `public_private`.

- `GET|POST /sigil/api/models/search`
  - Searches Airtable `Models` by `working_name`, `nickname`, `unique_key`, `folder_name`, `r2_prefix`, and `primary_image_key`.
  - Returns only public-safe preview fields.
  - Private search requires a prior booking request with `member_status=active` and `access_scope=public_private`.

- `POST /sigil/api/booking/intake`
  - Saves the booking draft into `SIGIL Booking Requests`.
  - Sends a Telegram/internal-admin notification when Telegram vars are configured.
  - Maps the v24 Webflow payload into the new Airtable fields:
    - `session_id`
    - `booking_ref`
    - `client_nickname`
    - `client_contact`
    - `line_or_member_id`
    - `member_status`
    - `access_scope`
    - `lane`
    - `job_class`
    - `model_scope`
    - `model_search_query`
    - `resolved_model_key`
    - `model_asset_source`
    - `resolved_image_url`
    - `r2_key_snapshot`
    - `drive_folder_id_snapshot`
    - `resolver_payload_json`

## Telegram notify

Configure these vars to push each new booking draft into the internal/admin Telegram channel or topic:

```toml
TELEGRAM_NOTIFY_ENABLED = "true"
TELEGRAM_INTERNAL_SEND_URL = "https://telegram-worker.malemodel-bkk.workers.dev/telegram/internal/send"
TELEGRAM_BOOKING_CHAT_ID = "-100xxxxxxxxxx"
TG_THREAD_BOOKING_DRAFT = ""
INTERNAL_ADMIN_BOOKING_URL = "/internal/admin/console"
```

Optional auth secrets, depending on the telegram-worker gate:

```bash
wrangler secret put INTERNAL_TOKEN
wrangler secret put CONFIRM_KEY
```

The notify payload is deliberately advisory only. It includes booking ref, session id, Airtable record id, client/contact, route, member/access status, model/preference, date/time/place, and a note that this is still a draft.

## Deployment notes

Required secret:

```bash
wrangler secret put AIRTABLE_API_KEY
```

Suggested route binding:

```text
sigil.mmdbkk.com/sigil/api/* -> sigil-booking-worker
```

The page should keep using:

```html
data-api-base="https://sigil.mmdbkk.com"
```

## Safety lock

This worker never confirms booking, model availability, private access, or payment by itself. Records are booking drafts only until official review and payment verification.
