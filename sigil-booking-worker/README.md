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

Booking draft notifications are configured for the `MMD Privé & HYPE` forum supergroup and the `MMD • Booking` topic.

```toml
TELEGRAM_NOTIFY_ENABLED = "true"
TELEGRAM_INTERNAL_SEND_URL = "https://telegram-worker.malemodel-bkk.workers.dev/telegram/internal/send"
TELEGRAM_BOOKING_CHAT_ID = "-1003546439681"
TG_THREAD_BOOKING_DRAFT = "1399"
INTERNAL_ADMIN_BOOKING_URL = "https://sigil.mmdbkk.com/internal/admin/console"
```

The booking chat is a Telegram forum supergroup. `TG_THREAD_BOOKING_DRAFT` is required because booking drafts must land in the `MMD • Booking` topic, not the General topic.

### Auth contract

`sigil-booking-worker` calls `telegram-worker` with bearer auth:

```http
Authorization: Bearer <INTERNAL_TOKEN>
```

`telegram-worker` also accepts the legacy internal header:

```http
X-Internal-Token: <INTERNAL_API_TOKEN>
```

Production requirement:

```text
sigil-booking-worker.INTERNAL_TOKEN == telegram-worker.INTERNAL_API_TOKEN
```

Do not rotate `telegram-worker.INTERNAL_API_TOKEN` blindly because other workers may already depend on it. Prefer setting or updating `sigil-booking-worker.INTERNAL_TOKEN` to match the current Telegram worker internal token.

### Notify payload behavior

The notify payload is advisory only. It includes booking ref, session id, Airtable record id, client/contact, route, member/access status, model/preference, date/time/place, and a note that this is still a draft.

Telegram delivery now fails closed for direct forum-topic sends. If Telegram rejects a message, `/telegram/internal/send` returns a non-2xx response and `sigil-booking-worker` records `telegram_notify.ok = false` instead of marking delivery as successful.

## Deployment notes

Required booking worker secret:

```bash
wrangler secret put AIRTABLE_API_KEY --config sigil-booking-worker/wrangler.toml
wrangler secret put INTERNAL_TOKEN --config sigil-booking-worker/wrangler.toml
```

Required Telegram worker secrets:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN --config telegram-worker/wrangler.toml
wrangler secret put INTERNAL_API_TOKEN --config telegram-worker/wrangler.toml
```

Suggested deploy order:

```bash
git pull --ff-only
npm run test:telegram
npm run deploy:telegram
npm run deploy:sigil-booking
```

Suggested route binding:

```text
sigil.mmdbkk.com/sigil/api/* -> sigil-booking-worker
```

The page should keep using:

```html
data-api-base="https://sigil.mmdbkk.com"
```

## Smoke test

Test the Telegram topic path before creating a real booking record:

```bash
curl -sS \
  -X POST \
  "https://telegram-worker.malemodel-bkk.workers.dev/telegram/internal/send" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $INTERNAL_API_TOKEN" \
  --data '{
    "chat_id": "-1003546439681",
    "message_thread_id": "1399",
    "text": "🧪 <b>MMD Booking Notify Test</b>\\nSIGIL Booking topic delivery is ready.",
    "parse_mode": "HTML",
    "disable_web_page_preview": true
  }'
```

Expected result:

```json
{
  "ok": true,
  "telegram": {
    "ok": true
  }
}
```

The test message must appear in `MMD Privé & HYPE` → `MMD • Booking`, not General and not payment topics.

Then submit one real `/sigil/booking` draft. The booking intake response should include:

```json
{
  "ok": true,
  "telegram_notify": {
    "ok": true,
    "skipped": false
  }
}
```

If `telegram_notify.ok` is false, check:

1. `TELEGRAM_BOT_TOKEN` exists on `telegram-worker`.
2. `INTERNAL_TOKEN` and `INTERNAL_API_TOKEN` match.
3. The bot is still a member of `MMD Privé & HYPE`.
4. `TG_THREAD_BOOKING_DRAFT` is still `1399`.
5. Telegram did not reject the HTML payload.

## Safety lock

This worker never confirms booking, model availability, private access, or payment by itself. Records are booking drafts only until official review and payment verification.
