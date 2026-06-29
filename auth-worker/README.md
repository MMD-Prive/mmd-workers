# MMD / SIGIL Access Core

First-party auth starter for MMD Privé.

This package replaces Memberstack as the future core identity layer while keeping Airtable ledger as the source of truth.

## What it includes

- Cloudflare Worker auth API
- Passwordless 6-digit login code flow
- HttpOnly secure session cookie
- Airtable-backed members, identities, login codes, public auth sessions, entitlements, and access log
- Membership tier derivation from `member_packages`
- Webflow login page embed
- Webflow protected-page gate script
- Deploy checklist and Airtable schema

## Core routes

```text
GET  /ping
POST /v1/auth/request-code
POST /v1/auth/verify-code
GET  /v1/auth/me
POST /v1/auth/logout
POST /v1/admin/access/grant
```

## Worker ownership

Keep `auth-worker` as a separate Cloudflare Worker inside the existing `mmd-workers` repo. Do not merge it into `admin-worker`, `payments-worker`, `chat-worker`, `events-worker`, `telegram-worker`, or `realtime-worker`.

- `auth-worker` owns login, 6-digit code issuance/verification, the auth session cookie, `GET /v1/auth/me`, logout, and Webflow gate checks.
- `admin-worker` owns internal admin approval flows and broader member/access operations.
- `payments-worker` owns payments, `payment_ref`, `member_packages`, `points_ledger`, and package lifecycle.
- `telegram-worker` may later deliver login codes, but must not own auth sessions.
- Airtable's existing `MMD Commerce Operating System` base is the source of truth. Do not create a new base unless explicitly approved.
- Do not reuse `Admin Sessions` for public member login. `Admin Sessions` belongs to admin auth only.
- `auth-worker` writes public login sessions only to `MMD — Auth Sessions`.
- `auth-worker` reads entitlement/access status from `MMD — Member Entitlements`.
- `member_packages` remains the membership ledger source of truth.

`POST /v1/admin/access/grant` remains in `auth-worker` for the MVP and is guarded by `ADMIN_BEARER`. Long term, admin ownership should move behind `admin-worker` or be proxied by `admin-worker`.

## Airtable base and tables

Use existing base: `MMD Commerce Operating System`.

Reuse existing tables:

- `Members`
- `member_packages`
- `packages`
- `Payments`
- `Sessions`
- `MMD — Points Ledger`
- `MMD — Member Entitlements`
- `System — Access Log`

Create only missing auth-specific tables:

- `MMD — Auth Identities` (`tbl1AM0GE1tHzZXFD`)
- `MMD — Auth Login Codes` (`tblbcWun1fUqXhzJZ`)
- `MMD — Auth Sessions` (`tblgu2ZDdmu6bTJqc`)

Do not create `access_grants`; use `MMD — Member Entitlements`. Do not create `audit_log`; use `System — Access Log`.

## Member ID Rule

`member_id` is an internal normalized SIGIL/MMD auth key. It must not assume or reuse Memberstack identity.

Derivation order:

- Use an existing MMD-owned member key if the `Members` record already has `member_id`, `Member ID`, or `auth_member_id`.
- Otherwise, for existing Airtable `Members` rows, derive `member_id` as `mmd_rec_<AirtableRecordId>`.
- For auth-created member rows, derive `member_id` from the normalized login identity as `mmd_<identity_type>_<sha256(identity_key)[0..16]>`, for example from normalized email, phone, or Telegram username.

Memberstack remains optional backup only and is not a source for `member_id`, tier, package status, access, or session state.

## Environment

- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE_ID`
- `AUTH_HMAC_SECRET`
- `ADMIN_BEARER`
- `ALLOWED_ORIGINS`
- `WEB_BASE_URL`
- `COOKIE_DOMAIN`
- `MMD_AUTH_DEV_MODE`
- `AIRTABLE_TABLE_MEMBERS`
- `AIRTABLE_TABLE_MEMBER_PACKAGES`
- `AIRTABLE_TABLE_PACKAGES`
- `AIRTABLE_TABLE_PAYMENTS`
- `AIRTABLE_TABLE_SESSIONS`
- `AIRTABLE_TABLE_POINTS_LEDGER`
- `AIRTABLE_TABLE_MEMBER_ENTITLEMENTS`
- `AIRTABLE_TABLE_ACCESS_LOG`
- `AIRTABLE_TABLE_AUTH_IDENTITIES`
- `AIRTABLE_TABLE_AUTH_LOGIN_CODES`
- `AIRTABLE_TABLE_AUTH_SESSIONS`
- `AIRTABLE_ENTITLEMENT_MEMBERSTACK_ID_FIELD`
- `AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD`
- `AIRTABLE_ENTITLEMENT_TELEGRAM_USER_ID_FIELD`
- `AIRTABLE_ENTITLEMENT_TELEGRAM_USERNAME_FIELD`
- `AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD`
- `AIRTABLE_ENTITLEMENT_ACCESS_STATUS_FIELDS`
- `AIRTABLE_ENTITLEMENT_MEMBER_STATUS_FIELDS`
- `AIRTABLE_ENTITLEMENT_ACTIVE_VALUES`
- `AIRTABLE_ENTITLEMENT_BLOCKED_MEMBER_STATUS_VALUES`
- `AIRTABLE_ENTITLEMENT_RESOURCE_FIELDS`
- `AIRTABLE_ENTITLEMENT_TIER_FIELDS`
- `AIRTABLE_ENTITLEMENT_EXPIRES_AT_FIELDS`
- `AIRTABLE_ACCESS_LOG_EVENT_ID_FIELD`
- `AIRTABLE_ACCESS_LOG_ACTION_FIELD`
- `AIRTABLE_ACCESS_LOG_RESULT_FIELD`
- `AIRTABLE_ACCESS_LOG_MEMBER_FIELD`
- `AIRTABLE_ACCESS_LOG_METADATA_FIELD`
- `AIRTABLE_ACCESS_LOG_IP_HASH_FIELD`
- `AIRTABLE_ACCESS_LOG_USER_AGENT_FIELD`
- `AIRTABLE_ACCESS_LOG_CREATED_AT_FIELD`

`MMD_AUTH_DEV_MODE=true` returns `dev_code` from `POST /v1/auth/request-code` for local testing only. Keep it `false` in production.

## Access log mapping

`System — Access Log` is mapped without requiring an `access_log_id` field. The MVP write uses:

- `Event ID`
- `Action`
- `Result`

`Result` is normalized to `success` or `fail` only. Additional audit details are intentionally optional. Set the `AIRTABLE_ACCESS_LOG_*_FIELD` variables only after those fields exist in Airtable. Access-log writes are non-blocking; auth must continue even if this table rejects a write.

## Entitlement mapping

`MMD — Member Entitlements` is not assumed to have a `member_id` field. Entitlements are looked up from the full member/profile identity context using real public/member identity fields only:

- `memberstack_id`
- `member_email`
- `telegram_user_id`
- `telegram_username`
- `line_user_id`

Current auth-facing filters:

| Concept | Current mapping |
|---|---|
| access status | `access_status`; only `active` and `grace` pass |
| member status | `member_status`; `inactive` and `blocked` are rejected |
| expiry | `expire_at`; blank or future passes |
| package/tier | `package_code`, `tier`, or `min_tier` |
| resource/scope | `resource_key`, `access_key`, or `package_code` |

If Airtable rejects the entitlement lookup because a mapped field is not present, `/v1/auth/me` must fail safe and return empty `entitlements`/`grants`.

## Intended architecture

```text
Webflow page
  -> MMD Gate Script
  -> mmd-auth-worker
  -> Airtable ledger/member tables
  -> profile/tier/access response
```

Memberstack is no longer required for new logins.
Memberstack can remain as an optional backup, but it is not the source of truth for tier or status.
