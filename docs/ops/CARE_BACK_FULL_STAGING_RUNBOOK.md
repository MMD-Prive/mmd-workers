# CARE BACK full staging

This staging lane validates the complete public route-owner chain without attaching a custom production route:

`member-dashboard-chat-worker-staging.workers.dev` → `member-pages-worker-staging` → service-only synthetic identity fixtures → canonical Airtable CARE BACK tables.

It never publishes Webflow, changes `mmdbkk.com`, grants membership, points, payment status, booking, Hall, Black Card, SVIP, or access.

## Synthetic scenarios

- `current`: active synthetic member `MMD-STAGING-CURRENT-01`
- `returning`: expired synthetic member `MMD-STAGING-RETURNING-01`
- `new`: unmatched synthetic LINE identity

The fixture worker accepts only these three staging tokens and is not public on `workers.dev`. Synthetic mode is active only when `CARE_BACK_STAGING_MODE=synthetic` and the request host ends in `.workers.dev`.

## GitHub environment secrets

Create the protected `care-back-staging` environment and add:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CARE_BACK_STAGING_KV_NAMESPACE_ID`
- `CARE_BACK_STAGING_AIRTABLE_API_KEY`
- `CARE_BACK_STAGING_LIFF_SESSION_SECRET` (base64url-safe, at least 32 characters)
- `CARE_BACK_STAGING_CODE_SECRET` (base64url-safe, at least 32 characters)
- `CARE_BACK_STAGING_RESOLVER_SECRET` (base64url-safe, at least 32 characters)

Use an Airtable token restricted to base `appsV1ILPRfIjkaYg` and the existing canonical tables. Do not create a new Birthday Wishes table.

## Run

Run **Deploy CARE BACK full staging** manually. First run with `deploy=false` to validate. Then run with `deploy=true` after the protected environment reviewer approves it.

The deploy job writes only bounded synthetic records and tests current, returning, and new member behavior. A passing run is a staging gate only; production merge, production Worker deployment, LINE LIFF release, and Webflow publish remain separate approvals.
