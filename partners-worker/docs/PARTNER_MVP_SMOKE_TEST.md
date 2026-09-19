# Partner MVP Smoke Test

This checklist verifies that the MMD Partner and Public Model intake layer is usable as a real MVP.

Related issue: #148

## Scope

This test covers:

- `/partner/*` routing and CTA behavior
- `partners-worker` route ownership on `mmdbkk.com`
- Partner upload and request APIs
- Public model application API
- Airtable table separation between Partner and Public Model flows
- Human-facing copy guardrails

## Source of truth

Primary Airtable base:

```txt
appsV1ILPRfIjkaYg
MMD Commerce Operating System
```

Relevant tables:

```txt
Model Partners        tbl1ksDlsTiiGEHWe
Model Referrals       tblrmSsCZxJSCQR9n
Partner Commissions   tblbq4M1bhpwU2BGW
Partner Assets        tblJs0KDI7RYp4ZrT
Model Applications    tblwUa8ySWln8OfaJ
```

Route ownership must stay narrow. Do not add broad `/v1/*` or `/*` patterns.

Required exact API route patterns in `partners-worker/wrangler.toml`:

```txt
mmdbkk.com/v1/apply/public-model*
www.mmdbkk.com/v1/apply/public-model*
mmdbkk.com/v1/partner/upload*
www.mmdbkk.com/v1/partner/upload*
```

## 1. Worker health

Run from `partners-worker/` after deploy:

```sh
curl -i https://partners-worker.mmd-prive.workers.dev/health
```

Expected:

- HTTP 200
- JSON response
- Not Webflow HTML

## 2. Live route ownership check

These requests should reach `partners-worker`, not `mmd-redirect-worker` or Webflow.

### Public model endpoint should return JSON error for empty POST

```sh
curl -i -X POST https://mmdbkk.com/v1/apply/public-model \
  -H 'content-type: application/json' \
  --data '{}'
```

Expected:

- JSON error such as `required_fields_missing`
- Not Webflow HTML
- Not HTTP 405 from Webflow

### Partner upload endpoint should return JSON error for non-multipart POST

```sh
curl -i -X POST https://mmdbkk.com/v1/partner/upload \
  -H 'content-type: application/json' \
  --data '{}'
```

Expected:

- JSON worker error
- Not Webflow HTML
- Not HTTP 405 from Webflow

## 3. Public model application smoke test

Use a clear test alias and delete/review the record afterward.

```sh
curl -i -X POST https://mmdbkk.com/v1/apply/public-model \
  -H 'content-type: application/json' \
  --data '{
    "request_id": "prq_smoke_public_model_001",
    "name_alias": "Smoke Public Model",
    "talent_name": "Smoke Public Model",
    "age": 21,
    "talent_location": "Bangkok",
    "identity": "Test applicant for public modeling lane.",
    "line_id": "smoke-public-model",
    "skills": "Comfortable with public modeling and campaign review.",
    "why_consider": "Smoke test for public model intake.",
    "consent": true,
    "source_path": "/apply/public-model"
  }'
```

Expected:

- JSON response `{ ok: true, request_id, model_application_record_id, files_received }`
- Airtable creates one `Model Applications` record
- Source or notes indicate `apply_public_model` and `public_model`
- Does not create `Model Partners`
- Does not create `Model Referrals`
- Does not create `Partner Assets`

## 4. Public model validation checks

### Underage applicant rejected

```sh
curl -i -X POST https://mmdbkk.com/v1/apply/public-model \
  -H 'content-type: application/json' \
  --data '{
    "name_alias": "Underage Smoke",
    "age": 17,
    "identity": "Test",
    "line_id": "underage-smoke",
    "skills": "Test",
    "why_consider": "Test",
    "consent": true
  }'
```

Expected:

- JSON error `invalid_age`
- No Airtable record created

### Missing contact rejected

```sh
curl -i -X POST https://mmdbkk.com/v1/apply/public-model \
  -H 'content-type: application/json' \
  --data '{
    "name_alias": "No Contact Smoke",
    "age": 21,
    "identity": "Test",
    "skills": "Test",
    "why_consider": "Test",
    "consent": true
  }'
```

Expected:

- JSON error `contact_missing`
- No Airtable record created

## 5. Partner upload smoke test

Use a small local JPG/PNG/PDF fixture.

```sh
curl -i -X POST https://mmdbkk.com/v1/partner/upload \
  -F 'request_id=prq_smoke_partner_001' \
  -F 'file_category=portfolio' \
  -F 'file=@./smoke-test.jpg'
```

Expected:

- JSON response with upload metadata
- R2 key is stored privately
- File is not exposed as a public URL
- Partner Assets metadata may be created only for partner/referral flow as designed

Unsupported file type should be rejected:

```sh
curl -i -X POST https://mmdbkk.com/v1/partner/upload \
  -F 'request_id=prq_smoke_partner_002' \
  -F 'file_category=portfolio' \
  -F 'file=@./smoke-test.exe'
```

Expected:

- JSON error
- No R2 object retained
- No public URL

## 6. Partner token rule

Partner-recognized, dashboard, terms, and verification routes must use `?t=` only.

Expected frontend behavior:

```txt
/partner/recognized?t=...
/partner/dashboard?t=...
/partner/terms?t=...
```

Forbidden frontend behavior:

```txt
/partner/recognized?token=...
/partner/dashboard?token=...
/partner/terms?token=...
```

Expected API behavior:

- `token` query is rejected where the API expects `t`
- Raw tokens are never stored in Airtable
- Airtable stores token hashes only

## 7. CTA audit checklist

Audit the actual deployed `partner.html` and all `/partner/*` pages.

Every visible CTA must be one of:

```txt
/partner/form
/partner/review
/partner/terms?t=...
/partner/dashboard?t=...
/apply/public-model
/v1/partner/request
/v1/partner/upload
/v1/apply/public-model
```

No visible CTA should point to:

```txt
/default
/autodirect
/terms without the intended partner context
old payment/member route unless explicitly intended
?token=
```

Partner Division copy should not send partner/scout/referrer applicants into the public model application lane unless the CTA is explicitly labeled as public model application.

Public model copy should not imply partner/referral dashboard access.

## 8. Copy guardrails

Avoid system-like words in public UI:

```txt
payload
endpoint
token
worker
Airtable
R2 key
verification hash
JSON
```

Prefer human-facing Thai copy:

```txt
ส่งข้อมูลให้ทีมพิจารณา
อัปโหลดไฟล์สำหรับการตรวจสอบ
เปิดหน้า Partner Dashboard
ยืนยันข้อตกลง Partner
ทีมจะตรวจสอบและติดต่อกลับอย่างเป็นส่วนตัว
```

## 9. Done criteria

This MVP is done only when:

1. `/partner/*` pages open normally.
2. Every CTA works or intentionally routes to a safe review state.
3. `/v1/partner/upload` on `mmdbkk.com` returns worker JSON, not Webflow HTML.
4. `/v1/apply/public-model` on `mmdbkk.com` returns worker JSON, not Webflow HTML.
5. Partner request flow writes to the Partner tables as designed.
6. Public model flow writes to `Model Applications` only.
7. Telegram notification fires to the configured thread or safe fallback.
8. Public copy does not expose internal infrastructure.

## Deploy note

The repository exposes:

```sh
npm run deploy
```

inside `partners-worker/`, which maps to:

```sh
wrangler deploy
```

Deploy must be run by an environment with the correct Cloudflare credentials and secrets. Do not mark #148 complete until the live-domain smoke tests above pass.
