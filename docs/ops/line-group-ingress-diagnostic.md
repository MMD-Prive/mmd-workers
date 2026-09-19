# LINE Group Ingress Diagnostic — MMD Privé Team

Issue: #674

## Goal

Prove whether new LINE group events from **MMD Privé Team** reach the canonical production webhook before changing payment parsing or OCR logic.

Canonical webhook owner remains:

`https://mmdbkk.com/webhooks/line`

owned by `member-dashboard-chat-worker`.

Do not create a second webhook owner and do not re-enable legacy Netlify forwarding.

## Why ingress must be proven first

`member-dashboard-chat-worker/src/index.js` already persists accepted LINE events to `MMD — Console Inbox` using `event.message.id` / `webhookEventId`, including non-text messages. Therefore an image that creates no Console Inbox row indicates an upstream ingress/configuration problem before payment classification.

## Production checklist

1. In LINE Developers, confirm the OA currently present in **MMD Privé Team** belongs to the Messaging API channel whose credentials are deployed to `member-dashboard-chat-worker`.
2. Confirm `Use webhook` is enabled.
3. Confirm the webhook URL is exactly `https://mmdbkk.com/webhooks/line` and LINE's webhook verification succeeds.
4. Confirm the OA/channel allows participation in group and multi-person chats.
5. Send one unique text message in **MMD Privé Team**.
6. Send one new image immediately after it.
7. Inspect production Worker telemetry and `MMD — Console Inbox`.
8. The image event is considered ingress-PASS only when all of these are proven:
   - `event.type = message`
   - `event.source.type = group`
   - `event.source.groupId` is present
   - `event.message.type = image`
   - `event.message.id` is present
   - a matching Console Inbox record is created

## Privacy-safe telemetry contract

Operational logs may include only bounded structural fields such as:

- `event_type`
- `source_type`
- `message_type`
- `stable_event_id_present`
- `group_source_present`
- `redelivered`
- `inbox_recorded`
- `inbox_deduped`

Do not log:

- raw `groupId`
- raw `userId`
- message text
- reply token
- LINE access token or channel secret
- raw image bytes

If source correlation is required, use a one-way SHA-256 hash of `groupId`, never the raw ID.

## After ingress PASS

Only after the live image event reaches the canonical webhook should production image evidence intake be wired:

`verified LINE image event -> messageId -> LINE Content API -> private production R2 -> pending/review Payment Proof -> official verification/payments-worker`

The webhook must acknowledge promptly and must not wait for OCR.

## Payment authority guardrails

Image, QR, OCR, queue state, Telegram state, or admin UI must never directly:

- mark a payment paid or verified
- award points
- extend or activate membership
- grant entitlements
- confirm a booking or session

`payments-worker` remains Money Truth.

## Failure interpretation

- Text + image both absent: webhook/channel/group participation/configuration problem.
- Text present, image absent: LINE event-type delivery or worker image handling path requires inspection.
- Image present in Console Inbox but no Payment Proof: ingress is healthy; proceed to production evidence intake wiring.
- Payment Proof exists as `pending/review`: evidence intake is healthy; official verification remains a separate step.
