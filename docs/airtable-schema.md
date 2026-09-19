# MMD / SIGIL Access Core Airtable Schema

Use the existing Airtable base `MMD Commerce Operating System` as the source of truth. Do not create a new Airtable base unless explicitly approved.

Reuse existing MMD tables:

- `Members`
- `member_packages`
- `packages`
- `Payments`
- `Sessions`
- `MMD — Points Ledger`
- `MMD — Member Entitlements`
- `System — Access Log`

Create only missing auth-specific tables:

- `MMD — Auth Identities`
- `MMD — Auth Login Codes`
- `MMD — Auth Sessions`

Created auth tables in `MMD Commerce Operating System`:

| Table | Airtable table ID | Purpose |
|---|---|---|
| `MMD — Auth Identities` | `tbl1AM0GE1tHzZXFD` | Public member identity keys for email, phone, and Telegram login |
| `MMD — Auth Login Codes` | `tblbcWun1fUqXhzJZ` | Hash-only 6-digit login code challenges |
| `MMD — Auth Sessions` | `tblgu2ZDdmu6bTJqc` | Public member auth sessions only |

Do not create `access_grants`. Use `MMD — Member Entitlements` as the access/entitlement source.

Do not create `audit_log`. Use `System — Access Log`.

Do not reuse `Admin Sessions` for public member login. `Admin Sessions` belongs to admin auth only. `auth-worker` must write public login sessions only to `MMD — Auth Sessions`.

Map table names in `auth-worker/wrangler.toml` to existing table IDs or exact existing table names before deployment.

## Existing: Members

| Field | Type | Notes |
|---|---|---|
| member_id | single line text | Optional MMD-owned auth/member key. Do not assume Memberstack. If absent, auth derives `mmd_rec_<AirtableRecordId>` for existing rows. |
| name | single line text | Optional display name |
| email | email / text | Lowercase preferred |
| phone | phone / text | Normalized preferred |
| telegram_username | single line text | No `@`, lowercase preferred |
| status | single select | `guest`, `active`, `blocked` |
| created_at | date time | ISO timestamp |
| last_login_at | date time | ISO timestamp |

### member_id derivation

`member_id` is an internal normalized SIGIL/MMD auth key, not a Memberstack ID.

Derivation order:

- Existing MMD-owned key from `member_id`, `Member ID`, or `auth_member_id`.
- Existing Airtable `Members` row: `mmd_rec_<AirtableRecordId>`.
- Auth-created row: `mmd_<identity_type>_<sha256(identity_key)[0..16]>`, where `identity_key` is normalized email, phone, or Telegram username with its type prefix.

## New: MMD — Auth Identities

Table ID: `tbl1AM0GE1tHzZXFD`

| Field | Type | Notes |
|---|---|---|
| identity_id | single line text | Unique |
| member_id | single line text | Internal normalized SIGIL/MMD key. Never Memberstack. |
| identity_type | single select | `email`, `phone`, `telegram` |
| identity_value | single line text | Normalized value |
| identity_key | single line text | Unique. Example `email:per@example.com` |
| status | single select | `active`, `blocked` |
| created_at | date time | ISO timestamp |
| last_seen_at | date time | ISO timestamp |

## New: MMD — Auth Login Codes

Table ID: `tblbcWun1fUqXhzJZ`

| Field | Type | Notes |
|---|---|---|
| code_id | single line text | Unique |
| member_id | single line text | Internal normalized SIGIL/MMD key. Never Memberstack. |
| identity_type | single select | email / phone / telegram |
| identity_value | single line text | The visible identity value |
| identity_key | single line text | Search key |
| code_hash | long text | Hashed code, never store raw code |
| nonce | single line text | Per-code salt |
| attempts | number | Default 0 |
| expires_at | date time | Usually now + 10 min |
| consumed_at | date time or blank | Set after successful login |
| requester_ip_hash | single line text | Privacy-safe IP hash |
| user_agent | long text | Browser/device hint |
| created_at | date time | ISO timestamp |

## New: MMD — Auth Sessions

Table ID: `tblgu2ZDdmu6bTJqc`

| Field | Type | Notes |
|---|---|---|
| session_id | single line text | Unique |
| member_id | single line text | Internal normalized SIGIL/MMD key. Never Memberstack. |
| session_hash | long text | Hashed cookie token |
| created_at | date time | ISO timestamp |
| expires_at | date time | Usually now + 30 days |
| revoked_at | date time or blank | Set on logout/admin revoke |
| ip_hash | single line text | Privacy-safe IP hash |
| user_agent | long text | Browser/device hint |

## Existing: member_packages

The worker reads this table to derive real membership status.

Required fields:

| Field | Type | Notes |
|---|---|---|
| member_email | email/text | Lowercase preferred |
| package_code | text/select | standard, premium, vip, svip, blackcard, guest pass |
| status | select/text | Must be `active` for access |
| end_date | date time | Must be in the future |

This keeps Airtable ledger as source of truth and prevents front-end role spoofing.

## Existing: MMD — Member Entitlements

Use this table as the access/entitlement source for Webflow gate checks and member-specific grants. Do not create a parallel `access_grants` table.

Auth-worker must not assume a `member_id` field exists on this table. Entitlement lookups use the full member/profile identity context and only these real identity fields:

- `memberstack_id`
- `member_email`
- `telegram_user_id`
- `telegram_username`
- `line_user_id`

Current known auth-facing field mappings:

| Concept | Mapping |
|---|---|
| member reference | Matched through `memberstack_id`, `member_email`, `telegram_user_id`, `telegram_username`, or `line_user_id`; never `{member_id}` |
| access status | `access_status`; active values are `active` and `grace` |
| member status | `member_status`; `inactive` and `blocked` are rejected |
| expiry | `expire_at`; blank or future passes |
| package/tier | `package_code`, `tier`, or `min_tier` |
| resource/scope | `resource_key`, `access_key`, or `package_code` |

Entitlement reads are fail-safe. If identity/status fields are absent, unmapped, or rejected by Airtable, `/v1/auth/me` returns empty `entitlements`/`grants` instead of failing login or gate checks.

Expected auth-facing concepts once mapping is completed:

| Concept | Notes |
|---|---|
| member reference | Link or stable ID for the member |
| resource key | Page/path/model/access key to unlock |
| entitlement status | Active/revoked/expired equivalent |
| start/end dates | Optional effective window |
| minimum tier | Optional tier floor when the entitlement is tier-based |

## Existing: System — Access Log

Use this table for auth and access audit events. Do not create a parallel `audit_log` table.

The current auth-worker mapping does not use `access_log_id`; do not add a parallel `audit_log` table.

Current MVP write fields:

| Field | Notes |
|---|---|
| `Event ID` | Auth-generated log ID |
| `Action` | Example `auth.login`, `auth.request_code`, `admin.access_grant` |
| `Result` | Normalized to `success` or `fail` only |

Additional audit fields are optional and must be mapped through `AIRTABLE_ACCESS_LOG_*_FIELD` variables after those fields exist in Airtable. Access-log writes are non-blocking and must never block login/session flows.

Expected auth-facing concepts once mapping is completed:

| Concept | Notes |
|---|---|
| member reference | Optional member ID/link |
| action | Example `auth.login`, `auth.request_code`, `admin.access_grant` |
| result | `success` or `error` equivalent |
| metadata | JSON or long text details |
| IP hash | Privacy-safe IP hash |
| user agent | Browser/device hint |
| created time | Event timestamp |

## Existing tables outside auth ownership

The auth worker may read from membership state but does not own payment or package lifecycle tables:

- `Payments`
- `Sessions`
- `packages`
- `MMD — Points Ledger`

Those remain under `payments-worker` ownership.
