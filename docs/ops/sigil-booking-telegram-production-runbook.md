# SIGIL Booking Telegram Production Handoff

Status: READY FOR DEPLOY CHECK  
Owner: MMD / SIGIL  
Updated: 2026-08-09 Bangkok

## Scope

This handoff locks the production values and smoke-test order for SIGIL Booking v24:

- Webflow `/sigil/booking`
- Cloudflare Worker `sigil-booking-worker`
- Airtable `SIGIL Booking Requests`
- Telegram internal booking draft notification
- Internal admin booking console link

## Airtable truth

Base:

- `AIRTABLE_BASE_ID = appsV1ILPRfIjkaYg`

Tables:

- `SIGIL Booking Requests = tblQa2OK4U69eOCRF`
- `Models = tblI4B0bI446vp9GX`
- `Members = tblgWc5VRon5o8Mhk`
- `member_packages = tblurt3GuKKiNjQAK`
- `MMD — Member Entitlements = tblNImdF9PKAxhXGi`

Required booking fields confirmed in Airtable:

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

## Telegram production target

Telegram forum group:

- title: `MMD Privé & HYPE`
- chat_id: `-1003546439681`
- is_forum: `true`

Booking topic:

- title: `MMD • Booking`
- message_thread_id: `1399`

Worker vars:

```toml
TELEGRAM_NOTIFY_ENABLED = "true"
TELEGRAM_INTERNAL_SEND_URL = "https://telegram-worker.malemodel-bkk.workers.dev/telegram/internal/send"
TELEGRAM_BOOKING_CHAT_ID = "-1003546439681"
TG_THREAD_BOOKING_DRAFT = "1399"
INTERNAL_ADMIN_BOOKING_URL = "https://sigil.mmdbkk.com/internal/admin/console"
```

## Secrets

```bash
cd sigil-booking-worker
wrangler secret put AIRTABLE_API_KEY
wrangler secret put INTERNAL_TOKEN
wrangler secret put CONFIRM_KEY
```

Notes:

- `AIRTABLE_API_KEY` reads/writes Airtable.
- `INTERNAL_TOKEN` authenticates calls into `telegram-worker` internal send.
- `CONFIRM_KEY` is for internal/system gate where required.
- Do not commit secrets to GitHub.

## Deploy

```bash
cd sigil-booking-worker
wrangler deploy
```

## Smoke tests

### 1. Client resolve

POST `/sigil/api/client/resolve`

Expected:

- Known active member returns active/existing state.
- Unknown or new user returns public-only/default state.
- No private access should be granted by frontend only.

### 2. Model search

GET or POST `/sigil/api/models/search`

Expected:

- Public search works for public/default scope.
- Private model scope requires active member/private access.
- Response returns public-safe image/catalog data only.
- Real job creation should send only canonical `model_key` / `unique_key` back to worker.

### 3. Booking intake

POST `/sigil/api/booking/intake`

Expected:

- Creates or stores draft in Airtable `SIGIL Booking Requests`.
- Maps v24 frontend payload into Airtable fields.
- Returns safe draft/session response.
- Triggers Telegram notify when `TELEGRAM_NOTIFY_ENABLED=true`.

### 4. Telegram internal notify

Expected message target:

- `chat_id = -1003546439681`
- `message_thread_id = 1399`

Expected content:

- Booking draft only.
- No promise of final job confirmation.
- No payment approval claim.
- Admin link points to `https://sigil.mmdbkk.com/internal/admin/console`.

### 5. Webflow `/sigil/booking`

Expected:

- Uses API base `https://sigil.mmdbkk.com`
- Calls:
  - `/sigil/api/client/resolve`
  - `/sigil/api/models/search`
  - `/sigil/api/booking/intake`
- Uses LINE / Noto font stack:

```css
font-family: "LINE Seed Sans TH", "Line Seed Sans TH", "Noto Sans Thai", "Outfit", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
```

## Non-negotiables

- Booking intake creates draft only.
- Telegram notification is internal alert only.
- Payment proof/slip is supporting evidence only.
- Confirmation requires official MMD review and matched-funds/payment verification.
- Frontend must not query Airtable, R2 private objects, Gmail, or Google Drive directly.
- Preserve route token query param as `t`.
- Do not route public chatbot behavior through `telegram-worker`; public AI belongs to `chat-worker`.
- Do not revive `immigrate-worker` for new booking flow work.

## Restore Telegram webhook note

`getUpdates` can only be used after deleting the bot webhook. After topic discovery is complete, restore webhook to the verified `telegram-worker` webhook route.

Do not assume `/v1/webhook` unless the `telegram-worker` route has been verified in source.
