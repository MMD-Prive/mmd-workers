# MY MMD customer surface · LIFF direction

Date: 2026-09-27

## Customer journey

- LIFF is the customer entry and return point for their verified history, Points, service credit and payment status. Keep navigation to these views within the authenticated LIFF session.
- Payment status and history come from the session-bound, read-only `GET /v1/member/payments` contract. Money truth belongs to `payments-worker`; neither LIFF nor Webflow may calculate a payable amount, select another payment reference, verify a slip or grant entitlement.
- An actionable payment may follow only the backend-issued signed `/pay/checkout?t=...` (or the permitted `/sigil/pay?t=...`) URL on `mmdbkk.com`. Keep this same-site handoff inside the LINE webview when the client supports it. A pending review suppresses another payment action.
- Internal review remains an admin surface. Its customer context must resolve from canonical identity/payment references; do not expose internal review controls or private records in LIFF.

## Current code boundary

- `member-pages-worker/src/liff-member-shell.js` already renders verified history, Points and Credit Wallet, and validates the signed membership checkout URL.
- `member-pages-worker/src/member-payments-bff.js` already serves bounded payment status/history by signed member session; it rejects browser-selected payment context.
- `continue_payment` authentication bridges currently return to `/member/payments` or `/my-mmd/payments`, which are separate customer presentations. This means the single LIFF payment experience is **not complete**.
- The signed checkout currently lives at `/pay/checkout`, a same-domain route outside the LIFF shell. Preserve the official payment contract when consolidating navigation.

## Migration gate

Implement an in-LIFF payment view using only the current BFF contract, then update the `continue_payment` return routes and relevant Rich Menu links together. Test authenticated member and guest pending-intent journeys, pending review, expired/unavailable sessions and back navigation in LINE before retiring compatibility presentations. Do not generate intents as acceptance fixtures or treat a synthetic browser session as a real LINE acceptance.
