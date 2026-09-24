# MMD R2 Model Asset Setup

This note records the current MMD R2 model asset direction without changing Cloudflare production. It keeps MMD PRIVÉ, MMD ACADEMY, and SIGIL / Trust-Inme media responsibilities separate.

## Current Discovery

- Current production-ish repo binding: `MMD_MODEL_ASSETS -> mmd-model-assets` in `admin-worker`
- Discovered private/signed legacy/export R2 endpoint: `b176eda1172b741fd2e58904cc9d77c5.r2.cloudflarestorage.com`
- Discovered legacy/export bucket from signed URL/CSV evidence: `mmd-models`
- Evidence bucket: `EVIDENCE_BUCKET -> mmd-sigil-evidence` in `immigrate-worker`
- Example private endpoint shape: `https://b176eda1172b741fd2e58904cc9d77c5.r2.cloudflarestorage.com/mmd-models/...`
- This endpoint appears to be the Cloudflare R2 S3/API endpoint, not a custom public CDN domain.

Do not assume `mmd-models` is the canonical production model asset bucket until Cloudflare R2 bucket/domain state is manually confirmed. It may be a legacy bucket, export batch, migration bucket, or a source from a different system era.

Signed R2 URLs and URLs containing `X-Amz-Signature` must not be committed, pasted into Webflow, embedded in frontend code, or treated as stable public media URLs.

## Public Model Assets

Production public model assets should eventually use a custom R2 public domain:

```text
models.mmdbkk.com -> confirmed production public model asset bucket
```

The target bucket is not locked by this repo patch. Current candidates to confirm in Cloudflare are:

- `mmd-model-assets`, because `admin-worker` currently binds `MMD_MODEL_ASSETS` to this bucket.
- `mmd-models`, because it was discovered from legacy/export signed URL evidence.

Only public-safe assets may be served through `models.mmdbkk.com`:

- public model profile images
- public compcards
- public gallery images
- public preview assets approved for frontend display

Preferred object key pattern:

```text
models/{model_id}/profile/main.jpg
models/{model_id}/gallery/{image_id}.jpg
models/{model_id}/compcard/{image_id}.jpg
```

Do not guess public object keys during migration. If the clean key is unknown, leave a TODO in the relevant implementation or handoff note instead of replacing a private/signed URL.

## Protected Assets

These assets must not be served from the public R2 custom domain:

- private model photos
- Black Card assets
- SIGIL assets
- ID / verification files
- payment slips
- LINE Official Note screenshots
- LINE evidence files
- admin-only documents
- sensitive client/model files

Protected media access should go through `admin-worker` first, with admin auth, role/session checks, prefix allowlists, and safe response headers. A future `media-worker` may be proposed only if scope grows beyond admin-worker.

Protected media routes must:

- require authentication before reading R2
- deny arbitrary object key traversal
- allow only approved prefixes
- return `401` or `403` when unauthorized
- return `404` without revealing sensitive object structure
- use `Cache-Control: private, max-age=300`
- never leak signed URLs into public frontend responses

The current `/ceo` surface is Webflow/static frontend plus SIGIL OS CDN asset. It must not talk directly to R2. Future `/ceo` private asset or evidence access must use authenticated admin-worker endpoints.

## Worker Ownership

- `chat-worker` remains the member-facing AI concierge / Kenji persona.
- `telegram-worker` remains the internal/system Telegram gateway only.
- `payments-worker` owns payment verification, slips, `payment_ref`, `session_id` idempotency, and `payment_type`.
- `events-worker` owns session lifecycle/state machine.
- `admin-worker` is the back-office / SIGIL admin surface and the best current place for protected admin/private asset access.
- `jobs-worker` is immigration/migration bridge only. It must not become the canonical media layer unless explicitly approved.

Core production contracts must stay separate from immigration/migration logic.

## Repository State Checked

Repo search found:

- `admin-worker/wrangler.toml` already has an R2 binding for source-owner model library fallback lookup:
  - binding: `MMD_MODEL_ASSETS`
  - bucket: `mmd-model-assets`
- `admin-worker/src/index.js` uses `env.MMD_MODEL_ASSETS` for R2 source lookup, folder preview listing, and safe metadata responses.
- `immigrate-worker/wrangler.toml` has an `EVIDENCE_BUCKET` binding to `mmd-sigil-evidence` for recovery/evidence upload work.
- `docs/architecture/MODEL_IDENTITY_RESOLVER.md` already warns not to return R2 signed URLs or private media.
- `docs/architecture/RECOVERY_LV8_ROUTE_READINESS.md` documents recovery evidence R2 setup for `mmd-sigil-evidence`.
- No committed `models.mmdbkk.com` or `assets.mmdbkk.com` assumptions were found in the checked repo paths.
- No committed frontend/Webflow `r2.cloudflarestorage.com`, `r2.dev`, or `X-Amz-Signature` URL was found in the checked repo paths.

No `MMD_MODELS -> mmd-models` binding has been added in this patch because no worker currently reads `env.MMD_MODELS`, and Cloudflare custom-domain/bucket state has not been manually confirmed. Do not create `MMD_MODELS -> mmd-models` until Cloudflare confirms the intended bucket/domain contract. Do not add speculative R2 bindings to unrelated workers, and do not add an R2 binding to `jobs-worker` without explicit approval.

## Deployment Doctrine

R2 and Cloudflare config changes must follow:

```text
Local -> GitHub -> Cloudflare
```

Do not deploy directly from local work. Do not silently modify DNS, R2 bucket settings, custom domains, or production Worker bindings.

## Cloudflare Manual Checklist

Manual Cloudflare steps that must be completed outside this repo patch and listed in the PR body:

- Cloudflare Dashboard > R2 Object Storage
- Confirm whether bucket `mmd-model-assets` exists and is the active admin-worker model asset source.
- Confirm whether bucket `mmd-models` still exists and whether it is active production, legacy, export, or migration storage.
- Decide which bucket should back `models.mmdbkk.com`: `mmd-model-assets`, `mmd-models`, or another explicitly approved bucket.
- Settings > Custom Domains
- Add/verify `models.mmdbkk.com`
- Confirm DNS record in zone `mmdbkk.com`
- Confirm whether `r2.dev` public access is enabled or disabled, and for which bucket.
- Confirm caching/security/WAF rules for `models.mmdbkk.com`
- Confirm which object prefixes are intended to be public
- Keep `mmd-sigil-evidence` private.

## Implementation TODOs

- After `models.mmdbkk.com` and its backing bucket are verified, set public frontend image URLs only for approved public-safe keys.
- If admin/private media serving is needed, add the minimal authenticated route in `admin-worker`, bind the exact bucket it reads, and enforce prefix allowlists before `bucket.get`.
- If `mmd-models` becomes the canonical model asset bucket for admin-worker, update code/config together so the binding name and bucket name are explicit and tested.
