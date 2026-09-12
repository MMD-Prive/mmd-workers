# MMS Telegram Operations Alerts

Male Massage (MMS) keeps operational Telegram alerts separate from the generic MMD payment/member topics.

## Topic bindings

The runtime reads explicit Telegram forum thread IDs from Cloudflare environment bindings. Thread IDs are never guessed and there is no root-chat fallback for booking/dispatch alerts.

- `MMS_TG_THREAD_BOOKING` — new MMS prebooking received / matching result available.
- `MMS_TG_THREAD_DISPATCH` — dispatch offered, therapist accepted, service started, service completed, job cancelled.
- `MMS_TG_THREAD_ALERTS` — manual coordination required, no approved therapist available, dispatch/storage/runtime attention states.

`TELEGRAM_BOT_TOKEN` and `MMS_TELEGRAM_CHAT_ID` remain the bot and forum-chat bindings.

## Noise policy

Do not alert every read, refresh, or therapist decline. The dispatcher emits alerts only for state changes that operations may need to see. Duplicate prebookings are suppressed.

## Privacy boundary

Telegram messages are metadata-minimized. They may include canonical prebooking/job IDs, safe service-zone labels, state, offer count, and operational error codes. They must not include exact addresses, customer contact details, LINE user IDs, sensitive applicant profile data, or therapist private profile data.

## Existing Therapist application alert

New Therapist applications already have a separate HENNA notification path with the canonical exact-application deep link. That path remains unchanged in this patch so the existing Airtable Telegram delivery audit stays authoritative. It should be migrated to a dedicated forum topic only together with its delivery-status persistence contract; do not add a second application alert that would create duplicate notifications.
