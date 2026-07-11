# MMD Privé Member Application Gate

Production-oriented Webflow module for `/member/apply`.

## Files

- `member-apply.html` — page markup and connection contract
- `member-apply.css` — mobile-first visual system
- `member-apply.js` — five-step wizard, validation, review, draft restore
- `member-apply-os.css` — Worker health status styles
- `member-apply-os.js` — resilient submission, offline queue, retry, duplicate guard and analytics hooks

## Webflow load order

```html
<link rel="stylesheet" href="https://models.mmdbkk.com/webflow/member/apply/member-apply.css">
<link rel="stylesheet" href="https://models.mmdbkk.com/webflow/member/apply/member-apply-os.css">
```

Paste `member-apply.html` into the Webflow Embed element.

Load scripts before `</body>`:

```html
<script src="https://models.mmdbkk.com/webflow/member/apply/member-apply.js"></script>
<script src="https://models.mmdbkk.com/webflow/member/apply/member-apply-os.js"></script>
```

The OS add-on must load after the base wizard script. It intercepts the final form submission in capture phase and becomes the authoritative browser submission layer.

## Connection contract

All public configuration lives on the root HTML element:

```html
data-api-base="https://sigil.mmdbkk.com"
data-submit-path="/v1/member/applications"
data-dashboard-url="/member/dashboard"
data-membership-url="/member/membership"
data-help-url="https://t.me/mmdapply"
```

Optional:

```html
data-health-path="/ping"
```

No secret, bearer token or API key belongs in these attributes or any frontend file.

## Worker request

```http
POST https://sigil.mmdbkk.com/v1/member/applications
Content-Type: application/json
X-Idempotency-Key: member-apply:YYYY-MM-DD:<fingerprint>
X-MMD-Client: member-apply-os/1.0.0
```

The request body includes:

- canonical query fields: `t`, `code`, `promo`
- member profile and contact fields
- `primary_channel`: `line | telegram | email`
- application intent and preference arrays
- consent flags
- `client_version`, `timezone`, `locale`, `page_url`, `submitted_at`

## Recommended Worker response

```json
{
  "ok": true,
  "application_reference": "MMD-MA-260710-AB12",
  "status": "received",
  "next_url": "/member/membership"
}
```

Accepted reference aliases in the current frontend:

- `application_reference`
- `reference`
- `application_id`
- `id`

## Duplicate and idempotency behavior

The frontend derives a one-way SHA-256 fingerprint from normalized contact/application identifiers. It does not send a device fingerprint containing hardware or invasive browser attributes.

- duplicate submissions from the same browser are blocked for 10 minutes
- an `X-Idempotency-Key` is sent to the Worker
- the Worker should persist and enforce that key
- HTTP `409` is treated as an already-created application, not a fatal failure

Backend idempotency remains authoritative.

## Offline queue

When offline or when a retryable network/Worker failure occurs, the request is stored in localStorage under:

```text
mmd_member_application_queue_v1
```

The queue is retried when the browser emits the `online` event or on the next page load. It keeps at most 10 requests.

The draft and queue remain local to the browser. Never place server secrets or internal notes in either payload.

## Retry policy

Retryable conditions:

- timeout / aborted request
- offline network
- HTTP 408, 425, 429
- HTTP 5xx

Policy:

- maximum 5 attempts
- exponential backoff
- jitter added to reduce request bursts

Validation and non-retryable 4xx responses are shown to the user without automatic retries.

## Analytics hooks

The OS layer dispatches browser events and also pushes to `window.dataLayer` when available.

Event names include:

- `mmd:member_application_os_ready`
- `mmd:member_application_submit_started`
- `mmd:member_application_retry`
- `mmd:member_application_queued`
- `mmd:member_application_success`
- `mmd:member_application_submit_failed`
- `mmd:member_application_duplicate_blocked`

No analytics vendor is embedded. The page only emits neutral events.

## Production checklist

1. Implement `POST /v1/member/applications` on `sigil.mmdbkk.com`.
2. Implement CORS for the approved MMD/Webflow origins.
3. Support `OPTIONS` preflight for `X-Idempotency-Key` and `X-MMD-Client`.
4. Return a stable `application_reference`.
5. Enforce backend idempotency.
6. Validate and sanitize all fields server-side.
7. Rate limit abusive requests without blocking normal retries.
8. Confirm `/ping` is public-safe or change `data-health-path`.
9. Deploy assets from GitHub to R2 and load them from `models.mmdbkk.com`.
10. Smoke test online, offline, timeout, 409, 422, 429 and 500 states.

## Route locks

- `/member/apply` is a member application gate, not model recruitment.
- Kenji is the client/member continuity surface.
- `/member/membership` owns package selection.
- `/member/dashboard` owns member home/status continuity.
- query parameters `t`, `code` and `promo` are preserved into both routes.
