# Deploy Checklist: SIGIL Access Core

## 1. Create Airtable tables

Use the existing Airtable base: `MMD Commerce Operating System`. Do not create a new Airtable base unless explicitly approved.

Reuse existing tables:

- `Members`
- `member_packages`
- `packages`
- `Payments`
- `Sessions`
- `MMD — Points Ledger`
- `MMD — Member Entitlements`
- `System — Access Log`

Create only missing auth-specific tables from `docs/airtable-schema.md`:

- `MMD — Auth Identities` (`tbl1AM0GE1tHzZXFD`)
- `MMD — Auth Login Codes` (`tblbcWun1fUqXhzJZ`)
- `MMD — Auth Sessions` (`tblgu2ZDdmu6bTJqc`)

Do not create `access_grants`; use `MMD — Member Entitlements` as the access/entitlement source.

Do not create `audit_log`; use `System — Access Log`.

Do not reuse `Admin Sessions` for public member login. `Admin Sessions` belongs to admin auth only. `auth-worker` must write public login sessions only to `MMD — Auth Sessions`.

Confirm `member_id` semantics before production:

- `member_id` is an internal normalized SIGIL/MMD auth key.
- It must not assume or reuse Memberstack.
- Existing `Members` rows without a member key derive `member_id` as `mmd_rec_<AirtableRecordId>`.
- Auth-created rows derive `member_id` from normalized email, phone, or Telegram identity as `mmd_<identity_type>_<sha256(identity_key)[0..16]>`.

For the MVP, keep field names exactly as documented. If the existing base uses Airtable table IDs or nonstandard table names, map them in `auth-worker/wrangler.toml`.

## 2. Confirm worker ownership

Keep `auth-worker` as a separate Cloudflare Worker in the existing `mmd-workers` repo. Do not merge it into `admin-worker`, `payments-worker`, `chat-worker`, `events-worker`, `telegram-worker`, or `realtime-worker`.

- `auth-worker` owns login, 6-digit code flow, auth session cookie, `/v1/auth/me`, logout, and Webflow gate checks.
- `admin-worker` owns internal admin approval and member/access operations.
- `payments-worker` owns payments, `payment_ref`, `member_packages`, `points_ledger`, and package lifecycle.
- `telegram-worker` may later deliver login codes, but must not own auth sessions.
- `auth-worker` reads entitlement/access status from `MMD — Member Entitlements`.
- `member_packages` remains the membership ledger source of truth.
- `POST /v1/admin/access/grant` stays in `auth-worker` only for the MVP, guarded by `ADMIN_BEARER`; long-term admin ownership should move behind `admin-worker` or be proxied by `admin-worker`.

## 3. Set Cloudflare Worker secrets

```bash
wrangler secret put AIRTABLE_API_KEY
wrangler secret put AIRTABLE_BASE_ID
wrangler secret put AUTH_HMAC_SECRET
wrangler secret put ADMIN_BEARER
```

Use a long random value for `AUTH_HMAC_SECRET`.

Confirm these non-secret vars in `auth-worker/wrangler.toml`:

```toml
ALLOWED_ORIGINS = "https://mmdbkk.com,https://mmdprive.webflow.io,https://mmdprive.com"
WEB_BASE_URL = "https://mmdbkk.com"
COOKIE_DOMAIN = ".mmdbkk.com"
MMD_AUTH_DEV_MODE = "false"
```

Before deployment, map auth table vars to the existing base/table names or table IDs:

```toml
AIRTABLE_TABLE_MEMBERS = "Members"
AIRTABLE_TABLE_MEMBER_PACKAGES = "member_packages"
AIRTABLE_TABLE_PACKAGES = "packages"
AIRTABLE_TABLE_PAYMENTS = "Payments"
AIRTABLE_TABLE_SESSIONS = "Sessions"
AIRTABLE_TABLE_POINTS_LEDGER = "MMD — Points Ledger"
AIRTABLE_TABLE_MEMBER_ENTITLEMENTS = "MMD — Member Entitlements"
AIRTABLE_TABLE_ACCESS_LOG = "System — Access Log"
AIRTABLE_TABLE_AUTH_IDENTITIES = "MMD — Auth Identities"
AIRTABLE_TABLE_AUTH_LOGIN_CODES = "MMD — Auth Login Codes"
AIRTABLE_TABLE_AUTH_SESSIONS = "MMD — Auth Sessions"

AIRTABLE_ENTITLEMENT_MEMBERSTACK_ID_FIELD = "memberstack_id"
AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD = "member_email"
AIRTABLE_ENTITLEMENT_TELEGRAM_USER_ID_FIELD = "telegram_user_id"
AIRTABLE_ENTITLEMENT_TELEGRAM_USERNAME_FIELD = "telegram_username"
AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD = "line_user_id"
AIRTABLE_ENTITLEMENT_ACCESS_STATUS_FIELDS = "access_status"
AIRTABLE_ENTITLEMENT_MEMBER_STATUS_FIELDS = "member_status"
AIRTABLE_ENTITLEMENT_ACTIVE_VALUES = "active,grace"
AIRTABLE_ENTITLEMENT_BLOCKED_MEMBER_STATUS_VALUES = "inactive,blocked"
AIRTABLE_ENTITLEMENT_RESOURCE_FIELDS = "resource_key,access_key,package_code"
AIRTABLE_ENTITLEMENT_TIER_FIELDS = "min_tier,tier,package_code"
AIRTABLE_ENTITLEMENT_EXPIRES_AT_FIELDS = "expire_at"

AIRTABLE_ACCESS_LOG_EVENT_ID_FIELD = "Event ID"
AIRTABLE_ACCESS_LOG_ACTION_FIELD = "Action"
AIRTABLE_ACCESS_LOG_RESULT_FIELD = "Result"
AIRTABLE_ACCESS_LOG_MEMBER_FIELD = ""
AIRTABLE_ACCESS_LOG_METADATA_FIELD = ""
AIRTABLE_ACCESS_LOG_IP_HASH_FIELD = ""
AIRTABLE_ACCESS_LOG_USER_AGENT_FIELD = ""
AIRTABLE_ACCESS_LOG_CREATED_AT_FIELD = ""
```

Created auth table IDs may be used instead of names:

```toml
AIRTABLE_TABLE_AUTH_IDENTITIES = "tbl1AM0GE1tHzZXFD"
AIRTABLE_TABLE_AUTH_LOGIN_CODES = "tblbcWun1fUqXhzJZ"
AIRTABLE_TABLE_AUTH_SESSIONS = "tblgu2ZDdmu6bTJqc"
```

`AIRTABLE_TABLE_MEMBER_ENTITLEMENTS` must point to `MMD — Member Entitlements`, not a new `access_grants` table.

`auth-worker` must not query `{member_id}` on `MMD — Member Entitlements`. It should build identity lookup formulas from `memberstack_id`, `member_email`, `telegram_user_id`, `telegram_username`, and `line_user_id` only.

`AIRTABLE_TABLE_ACCESS_LOG` must point to `System — Access Log`, not a new `audit_log` table.

`System — Access Log` does not use `access_log_id`. The MVP write uses `Event ID`, `Action`, and `Result`; `Result` must be normalized to `success` or `fail`. Map additional fields only after they exist in Airtable.

## 4. Test locally

```bash
node --check auth-worker/src/index.js
wrangler dev --config auth-worker/wrangler.toml
```

Temporarily set this in `wrangler.toml` while testing:

```toml
MMD_AUTH_DEV_MODE = "true"
```

Then call:

```bash
curl -i -X POST http://localhost:8787/v1/auth/request-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com"}'
```

Use the returned `dev_code` to verify:

```bash
curl -i -X POST http://localhost:8787/v1/auth/verify-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","code":"123456"}'
```

## 5. Deploy

```bash
wrangler deploy --config auth-worker/wrangler.toml
```

Set a route or custom domain such as:

```text
auth.mmdbkk.com/*
```

## 6. Add login page to Webflow

Create `/login` in Webflow and paste `webflow/login.html` into an Embed block.

Change this line to the real worker domain:

```html
<section class="sigil-login" data-auth-base="https://auth.mmdbkk.com">
```

## 7. Add gate script to protected pages

In Webflow page settings, before `</body>`:

```html
<style>
  .mmd-auth-locking body { opacity: 0; pointer-events: none; }
</style>
<script
  src="https://mmdbkk.com/assets/mmd-gate.js"
  data-mmd-gate
  data-auth-base="https://auth.mmdbkk.com"
  data-allow="premium,vip,svip,blackcard"
  data-login="/login"
  data-denied="/membership/upgrade-required"
  data-expired="/membership/renewal">
</script>
```

For Standard pages:

```html
data-allow="standard,premium,vip,svip,blackcard"
```

For VIP pages:

```html
data-allow="vip,svip,blackcard"
```

For Black Card pages:

```html
data-allow="blackcard"
```

## 8. Production delivery provider

The MVP creates codes but does not send email/SMS automatically unless you connect a provider.

Recommended next step:

- Telegram Worker delivery for users with Telegram username or ID.
- Email delivery via Resend / Postmark / Cloudflare Email Routing worker.
- SMS only later, because it adds cost and privacy concerns.

Production warning: keep `MMD_AUTH_DEV_MODE=false` in production. `dev_code` must never be returned from the live auth API.

Memberstack remains optional backup only. It is not the source of truth for tier, package status, access, or session state.
