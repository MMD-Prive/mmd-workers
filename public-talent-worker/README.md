# Public Talent Worker

Dedicated Cloudflare Worker for the public-facing MMD Privé route `/public/talent/referral`.

This worker is intentionally isolated from Partner Division, Model Referrals, commissions, memberships, and SIGIL private access.

## Categories

- `PM` — Public Model
- `PC` — Public Creator
- `PF` — Public Figure

Follower count is a review signal only. It is never an automatic acceptance rule.

## Endpoints

- `GET /health`
- `POST /v1/public-talent/upload`
- `POST /v1/public-talent/referral`
- `GET /v1/public-talent/referral/status?referral_id=...`

## Airtable

- Base: `appsV1ILPRfIjkaYg`
- Table: `Public Talent Referrals`
- Table ID: `tblzXcmbiVDTk9zTe`

Browser submissions always begin with `received` status. The worker never creates or approves canonical `Models` records automatically.

## Upload behavior

Allowed types: JPEG, PNG, WebP, PDF.

- Maximum file size: 15 MB
- Maximum files per referral: 8
- R2 prefix: `public-talent/intake/{asset_ref}/`
- Browser responses expose only `asset_ref`, never the raw R2 object key.

## Required secrets

```bash
wrangler secret put AIRTABLE_API_KEY
wrangler secret put TELEGRAM_BOT_TOKEN
```

Telegram is optional at runtime. Airtable is required.

## Local checks

```bash
npm install
npm run typecheck
npm run dev
```

## Deployment gate

Before deployment:

1. Confirm Cloudflare route ownership for `/v1/public-talent/*`.
2. Confirm the R2 binding and existing bucket are acceptable for the `public-talent/` prefix.
3. Add or confirm `TELEGRAM_PUBLIC_TALENT_THREAD_ID` if thread routing is required.
4. Test duplicate and idempotent retries.
5. Verify that no Partner, Model Referral, commission, membership, or private-access record is created.

Related implementation issue: `MMD-Prive/mmd-workers#238`.
