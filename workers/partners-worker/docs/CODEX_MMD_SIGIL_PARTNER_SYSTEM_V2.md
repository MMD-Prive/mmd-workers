# Codex MMD SĪGIL Partner System v2

Source issue: `MMD-Prive/mmd-workers#49`.

## Goal

Implement the MMD SĪGIL Partner System v2 as a production Cloudflare Worker for partner uploads, partner intake, admin recognition, private token verification, terms acceptance, and partner dashboard data.

## Worker target

```txt
workers/partners-worker/
  docs/CODEX_MMD_SIGIL_PARTNER_SYSTEM_V2.md
  src/index.ts
  wrangler.toml
  package.json
  README.md
```

## Endpoints

```txt
GET  /health
POST /v1/partner/upload
POST /v1/partner/request
GET  /v1/partner/verify
GET  /v1/partner/dashboard
POST /v1/partner/accept-terms
POST /v1/partner/approve
```

## Integrations

- Cloudflare R2 bucket binding: `PARTNER_ASSETS`
- Airtable base: `appsV1ILPRfIjkaYg`
- Model Partners: `tbl1ksDlsTiiGEHWe`
- Model Referrals: `tblrmSsCZxJSCQR9n`
- Partner Commissions: `tblbq4M1bhpwU2BGW`
- Model Applications: `tblwUa8ySWln8OfaJ`
- Partner Assets: `tblJs0KDI7RYp4ZrT`
- Telegram admin notifications
- Public token parameter: `t`
- Store only token hashes in Airtable
- R2 stores files; Airtable stores metadata only

## Locked Field IDs

Model Partners:

```txt
Approval Status = fldwRzdtIoPbHKr7n
Access Token Hash = fldoaCF4k4YqyuQ7Q
```

Partner Assets:

```txt
Asset ID = fld3NklN2iKsZfyx2
Request ID = fldeqzo5t3Rn80Cxi
Partner = fldfFnmGzuABMx73p
Referral = fldOdLWYrfJTrqlh0
Model Application = fldrO5jXtRC2625K9
Model = fldziGhehbtACcMSy
Talent Name = fld13S676s8rVItvM
Talent Type = fld1GUaBYlsc0qItX
File Name = fldan0RC2OmKOx9ZS
File Type = fldRIWH1BoksjTifz
File Size = fldVSEnaet8QBVprU
File Category = fldxP9Dz5R5n8qc0m
R2 Key = fldwREciD1379aRmj
R2 Bucket = fldNbFcAfD8iSUBvT
Storage Provider = flduFWON5ER5zwWZx
Portfolio URL = fldluhKZtvnrJtrLI
Uploaded At = fldeeR5njPazmDppA
Review Status = fldU74rreSrrPPR34
Visibility = fldOnuGVGUV3s0iue
Signed URL Status = fldeRj8Qfh0Mtfnz4
Notes = fldG0NOMCIuDxdHNM
Created By Worker = fldHxkxKp36tKRdx6
Source Path = fld8bzWD62f59lH3u
Payload JSON = fld9CgmkIQzqABY58
```

## Production Behavior

`POST /v1/partner/upload`

- Accepts `multipart/form-data`: `request_id`, `file_category`, `file`
- Allows jpg, png, webp, pdf
- Enforces 20MB max file size
- Uploads to `partner-requests/{request_id}/uploads/{timestamp}-{safe_filename}`
- Returns metadata only

`POST /v1/partner/request`

- Accepts partner form payload and uploaded file metadata
- Computes an internal partner score
- Creates or updates Model Partners
- Creates Model Applications when talent/files exist
- Creates Model Referrals when a partner introduces talent
- Creates Partner Assets records for files
- Notifies Telegram admin thread
- Returns `/partner/review`

`POST /v1/partner/approve`

- Admin-only endpoint
- Supports `recognized`, `not_recognized`, `needs_follow_up`, and `archived`
- Updates Approval Status
- When recognized, generates a private token, stores only its hash, and returns a recognized link with `?t=`

`GET /v1/partner/verify?t=...`

- Verifies token hash against Airtable
- Checks expiry
- Checks Approval Status is `recognized`
- Returns partner id, name, and status

`POST /v1/partner/accept-terms`

- Verifies `t`
- Updates Agreement Version and Agreement Accepted At
- Sets partner status Active where appropriate
- Returns `/partner/dashboard`

`GET /v1/partner/dashboard?t=...`

- Verifies token
- Loads partner referrals and commissions
- Returns:

```json
{
  "ok": true,
  "summary": {
    "tier": "Trusted",
    "activeModels": 0,
    "pendingAmount": 0,
    "paidAmount": 0
  },
  "referrals": [],
  "commissions": []
}
```

## Security Rules

- Never expose Airtable API key or Telegram bot token to frontend
- Use `t` only; never `token`
- Store only token hash in Airtable
- CORS allows only configured origins
- Admin approval requires an admin auth header or bearer secret
- R2 is private by default

## Env

Secrets:

```txt
AIRTABLE_API_KEY
TELEGRAM_BOT_TOKEN
ADMIN_APPROVE_SECRET
```

Non-secret vars:

```txt
AIRTABLE_BASE_ID = appsV1ILPRfIjkaYg
AIRTABLE_TABLE_MODEL_PARTNERS = tbl1ksDlsTiiGEHWe
AIRTABLE_TABLE_MODEL_REFERRALS = tblrmSsCZxJSCQR9n
AIRTABLE_TABLE_PARTNER_COMMISSIONS = tblbq4M1bhpwU2BGW
AIRTABLE_TABLE_MODEL_APPLICATIONS = tblwUa8ySWln8OfaJ
AIRTABLE_TABLE_PARTNER_ASSETS = tblJs0KDI7RYp4ZrT
PARTNER_ASSETS_BUCKET_NAME = mmd-sigil-partner-assets
REVIEW_URL = /partner/review
DASHBOARD_URL = /partner/dashboard
TERMS_URL = /partner/terms
RECOGNIZED_URL = /partner/recognized
ALLOWED_ORIGINS = https://mmdbkk.com,https://www.mmdbkk.com,https://mmdprive.webflow.io
```

## Acceptance Tests

- `GET /health` returns `{ "ok": true }`
- Upload a small jpg returns R2 key
- Submit partner request creates Model Partner and Partner Assets
- Telegram admin notification is sent
- Approve recognized returns a link with `?t=`
- Verify accepts valid `t` and rejects invalid or expired token
- Accept terms updates Airtable
- Dashboard returns normalized summary, referrals, and commissions
