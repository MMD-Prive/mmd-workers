# LINE group image ingress fix plan

Tracking implementation for #678 / #674.

Production evidence now proves LINE group text ingress, but the same text event is persisted twice and paired image events are absent downstream.

Required runtime behavior:

- exactly-once Console Inbox persistence per stable LINE message/event id
- preserve non-text message events, especially `message.type=image`
- capture `source.type=group` and group correlation metadata internally
- fetch image bytes from LINE content API using `message.id`
- store evidence privately in production R2 and compute SHA-256
- create only evidence-state `MMD — Payment Proofs` records with `status=pending` when slip/payment context qualifies
- never mark payment verified/paid and never mutate Points, Membership, Entitlements, Sessions, or booking truth
- keep webhook acknowledgement fast and diagnostics privacy-safe

Implementation must add tests for duplicate suppression, group image handling, LINE content-fetch failure, and no payment-truth side effects.
