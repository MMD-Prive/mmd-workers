# MMD SIGIL Partners Worker

Production Cloudflare Worker for the MMD SIGIL partner flow.

Layer ownership:
- Yuki = Partner Control Layer
- Ewvon = Black Card Authority Layer
- Partner Worker responses use `control_layer: "YUKI"` where partner control context is returned.

## Routes

- `GET /health`
- `POST /v1/partner/upload`
- `POST /v1/partner/request`
- `GET /v1/partner/verify?t=...`
- `GET /v1/partner/dashboard?t=...`
- `POST /v1/partner/models/change?t=...`
- `POST /v1/partner/models/upload?t=...`
- `POST /v1/partner/jobs/action?t=...`
- `POST /v1/partner/sales/proposal?t=...`
- `GET|POST /v1/partner/private-vault?t=...`
- `POST /v1/partner/accept-terms`
- `POST /v1/partner/approve`
- `POST /v1/apply/public-model` (alias: `POST /apply/public-model`)

## Public model application

`POST /v1/apply/public-model` backs the public `/apply/public-model` form. It is a direct
applicant lane, not a partner lane. Public model applicants are not partners:

- It writes only to `AIRTABLE_TABLE_MODEL_APPLICATIONS` — never to Model Partners,
  Model Referrals, or Partner Assets.
- Record values: `applicationStatus = new_review`, `source = apply_public_model`,
  `savedBy = partners-worker`, `consentToPrivacy = true`.
- `Application Type: public_model`, `Intent: modeling_public_events`, and
  `Source Path: /apply/public-model` are recorded in the notes payload (the Model
  Applications table has no dedicated fields for them).
- Uploaded file metadata (category, name, R2 key) is recorded in the notes payload.
  Files themselves are uploaded beforehand via `/v1/partner/upload` using the shared
  `prq_` request id.

Required fields: `name_alias`, `identity`, `skills`, `why_consider`, `consent: true`,
and at least one of `line_id` / `phone` / `email`. Optional: `request_id` (`prq_` format),
`talent_name`, `age` (18-70), `talent_location`, `portfolio_url`, `height`,
`body_profile`, `work_types[]`, `availability`, `travel_ready`, `boundaries`, `notes`,
`source_path`, `files[]`.

Response: `{ ok, request_id, model_application_record_id, files_received }`.

Telegram: sends an `MMD Public Model Application` message. Thread routing uses
`TELEGRAM_PUBLIC_MODEL_THREAD_ID` if set, falling back to `TELEGRAM_ADMIN_THREAD_ID`,
then to the default `TG_THREAD_CONFIRM` behavior. Both new vars are optional.

CORS: `ALLOWED_ORIGINS` includes `https://mmdprive.com` and `https://www.mmdprive.com`
for this form.

## Legal terms redirect scope

- `/terms` returns `302` to `/partner/terms`.
- `/terms?t=...` preserves `t` when redirecting to `/partner/terms?t=...`.
- `/legal/terms` returns `302` to `/partner/terms`.
- `/terms-of-service` and `/terms-and-conditions` must not redirect to `/partner/terms`.
- `302` is intentional to avoid permanent browser/CDN caching while terms routing is still being finalized.
- Bare `mmdbkk.com` requests are still canonicalized to `www.mmdbkk.com` first with `301`; the terms redirect is handled on `www.mmdbkk.com`.

## Required Secrets

Required secret bindings are `AIRTABLE_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `TOKEN_SECRET`. Manage them through Cloudflare secret management; do not commit literal secret values.

`TOKEN_SECRET` is used for HMAC SHA-256 token signatures. The raw token is never stored in Airtable; only the SHA-256 hash is stored in `Model Partners`.

## Partner Phase 1 access contract

- Verified LINE Partner access is the Dashboard authority for Phase 1.
- Telegram is optional and may be connected later for notifications; it is not required to open the Dashboard or use Dashboard job actions.
- Dashboard Confirm / Changes / Decline still requires canonical Payment Truth to reach Official Verify and exact Partner Session scope.
- The separate Telegram bot callback remains Telegram-identity-bound when that channel is used. Making Telegram optional for Dashboard use does not weaken Telegram callback verification.
- Telegram never grants Partner authority and never replaces LINE Partner verification.

## Partner Control Room privacy boundary

- Partner-private notes are encrypted in the browser with AES-GCM using a key derived from the Partner's Vault PIN. The PIN and plaintext are never sent to the Worker.
- The Worker stores only the encrypted envelope in private R2 and returns ciphertext only to the verified Partner session.
- Shared model profile changes require an explicit `share_with_mmd: true` acknowledgement and are written to `MMD — Partner Model Change Requests` for review. They do not directly mutate canonical Models.
- Source rate, requested customer sell rate, audience and visibility changes are proposals. They remain fail-closed until the existing Boss Per approval path accepts them.
- Dashboard job reads are scoped by the canonical Partner ID snapshot; model mutations are scoped through the Partner's linked Model Referral records.

## Deploy

```bash
npm install
npm run types
npm run typecheck
npm run deploy
```

## Webflow

The published `/partner/form` currently opens its modal locally unless it includes a real submit bridge. Add `webflow-sigil-partner-form.js` to the page after the form markup. It posts to:

```txt
https://partners-worker.malemodel-bkk.workers.dev/v1/partner/request
```

The bridge also supports future file inputs by uploading each file to `/v1/partner/upload` first, then submitting the returned metadata in the final request.

## Smoke Tests

```bash
curl https://partners-worker.malemodel-bkk.workers.dev/health
```

Expected:

```json
{
  "ok": true,
  "service": "partners-worker"
}
```

No-file request test:

```bash
curl -X POST https://partners-worker.malemodel-bkk.workers.dev/v1/partner/request \
  -H 'Content-Type: application/json' \
  -d '{
    "request_id":"prq_20260427_manual01",
    "name_alias":"Ken Agency",
    "access_source":"modeling_broker",
    "value_bring":"A curated private modeling network with verified availability.",
    "why_consider":"We can bring discreet talent referrals aligned with MMD SIGIL standards.",
    "experience":"Bangkok model coordination",
    "contact":"LINE: example",
    "source_path":"/partner/form",
    "files":[]
  }'
```

Approval test:

```bash
curl -X POST https://partners-worker.malemodel-bkk.workers.dev/v1/partner/approve \
  -H 'Content-Type: application/json' \
  -d '{"partner_record_id":"recXXXXXXXXXXXXXX","action":"recognized","note":"Strong network, clean profile"}'
```
