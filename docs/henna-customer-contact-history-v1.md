# HENNA MMS customer contact history

Owner directive: Per, 4 October 2026. Preserve contact history for MMS customers so the central operator can identify past contacts and avoid duplicate outreach.

## Implemented

The production MMS LINE handler persists signed direct-user contact events before replying or acknowledging the webhook. It uses the existing private LINE_SLIP_EVIDENCE R2 binding under a separate `line-mms/customer-contact-history/v1/` prefix. No public route is added.

Records contain the MMS LINE recipient ID, hashed contact/event references, original event time, event type and message type. They do not contain message text, location coordinates, media, reply tokens or profile data. Group and room participants are excluded. A LINE contact is not evidence of membership; records explicitly carry `membership_status: not_verified`.

Redelivery and repeated writes use the same immutable object key. First/last contact must be derived from event timestamps, never webhook arrival order. Follow/unfollow events are evidence for later reachability checks, not a guarantee that delivery will succeed. Storage failure returns HTTP 503 before any reply, allowing configured LINE webhook redelivery to retry.

## Rollout and validation

Merge and deploy member-dashboard-chat-worker. Confirm private R2 binding availability and that webhook redelivery is enabled in the MMS LINE Console. Send an owner-controlled direct message with AI disabled and verify one private history object. Redeliver the same event and confirm object count does not increase. Check follow/unfollow in the same way. Existing webhook tests and new signature/storage tests must pass.

This is contact-event capture only. No announcement has been sent, no historical contacts have been invented, and no central history reader or campaign delivery ledger is included yet. Telegram bot contacts are a separate channel and are not collected by this LINE handler.

## Outstanding approved campaign

Per approved the MMS return announcement for end of 2026, in Thai and English, with https://t.me/MMDPriveTH. Audience: verified MMS members who contacted the MMS LINE account during 4 July–4 October 2026, once each, with success/failure totals.

Earlier months require an authorized historical source/import if they were not already captured. Recipient selection must deduplicate user IDs, resolve actual membership, use contact times in Asia/Bangkok and account for the latest follow/unfollow evidence. A delivery ledger must exist before dispatch to enforce one message per recipient. Collection here does not initiate that campaign or change any booking, membership or payment truth.
