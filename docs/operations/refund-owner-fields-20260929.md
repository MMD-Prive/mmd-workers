# Refund owner fields — 2026-09-29

This closes the owner refund execution gap after PR #2034.

## Owner UI

`/internal/admin/refunds` now requires the owner to enter the refund amount before uploading the outgoing refund receipt.

Visible fields per refund task:

- refund amount, stored as `owner_refund_amount`
- currency, default `THB`
- customer-facing refund note, stored as `owner_refund_note`
- owner transfer reference/date, stored as `owner_refund_reference`
- outgoing refund receipt image upload
- returned `confirmation_url` after upload

The owner can still open the private bank account detail from R2 and copy the customer bank account. The copy block includes the entered refund amount.

## Backend contract

The internal refund-account intake accepts optional seeded amount fields:

- `refund_amount_due`
- `amount_to_refund`
- `refund_amount`
- `amount`
- `refund_currency`
- `refund_reason`

Receipt upload to `/v1/admin/refunds/receipt` accepts:

- `inbox_id`
- `file`
- `refund_amount` (required for refund tasks unless already seeded)
- `refund_currency`
- `refund_note`
- `refund_reference`

The handler stores these values in `payload_json`, uploads the owner receipt to private R2, generates the short-lived signed confirmation URL, and sends the confirmation payload to the canonical LINE transport.

## Safety

This does not mutate Payment Truth, Money Truth, membership, booking, or customer balance records. It only completes the refund ops task and sends customer-facing receipt evidence.
