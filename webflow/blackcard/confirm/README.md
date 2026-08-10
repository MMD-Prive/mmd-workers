# /blackcard/confirm Webflow handoff

Canonical source-control handoff for the customer-facing Black Card Companion Preference page.

## Files

- `confirm.html` — Webflow Embed content
- `confirm.css` — Page Settings > Inside `<head>`
- `confirm.js` — Before `</body>` or a final Embed

## Locked behavior

- Mobile-first Companion Preference flow with expanded desktop briefing.
- Ewvon voice: receives context, organizes the request, and passes it to MMD for official review.
- A submitted preference is not a booking confirmation, availability guarantee, Black Card approval, membership grant, payment confirmation, or points award.
- Canonical query/body field `t` is required for submission, preserved in the request payload and success return, and used only as opaque correlation—not authentication or authorization.
- Local draft expires after seven days, is scoped by a one-way hash of `t`, and is disabled when `t` is absent or invalid.
- Legacy unscoped draft data is removed on initialization.
- Success return is `/blackcard/black-card`.
- Companion assets map to Hito, Hima, Hiro, and Hiei.
- CSS and JavaScript are scoped to `#mmd-blackcard-confirm`.

## Release gate

`data-submit-endpoint` is intentionally empty. The page fails closed unless a bounded printable `t` correlation value is present and a reviewed same-origin endpoint accepts the request. The client rejects a configured endpoint whose origin differs from the page origin.

The success view is allowed only when the endpoint returns HTTP `202` with JSON containing `ok: true`, `status: "pending_review"`, a non-empty opaque `request_id`, and a valid server timestamp in `submitted_at`. Every other response keeps the draft and remains in the error path.

The request body uses `t` only. The legacy body field `token` is forbidden.

Before publication or endpoint activation:

1. Assign and document the canonical backend owner and request contract.
2. Require trusted authentication/session validation; do not trust query parameters as official identity or eligibility.
3. Keep official verification authoritative for access and decisions.
4. Validate CSRF/origin protections, rate limiting, idempotency, audit logging, and customer-safe errors.
5. Run mobile/desktop Webflow preview checks and an end-to-end staging submission.
6. Obtain explicit production approval before Webflow publish, route mutation, or deployment.

No production route, Worker binding, secret, API, or Webflow publication is included in this handoff.
