# Refund owner field acceptance

Acceptance for `/internal/admin/refunds`:

1. Each refund task shows the customer bank detail summary plus amount input.
2. Owner cannot upload an outgoing refund receipt for a refund task without a refund amount.
3. Upload persists `owner_refund_amount`, `owner_refund_currency`, `owner_refund_note`, and `owner_refund_reference` in the task payload.
4. Upload returns `confirmation_url` to the owner UI.
5. Admin sends `refund_amount`, `refund_currency`, `refund_note`, `refund_reference`, `receipt_url`, and `confirmation_url` to the canonical LINE refund receipt transport.
6. Money Truth remains unchanged.
