# MMD R2 Model Asset Setup

This note records the current MMD R2 model asset direction without changing Cloudflare production. It keeps MMD PRIVÉ, MMD ACADEMY, and SIGIL / Trust-Inme media responsibilities separate.

## Current Discovery

- Current model asset bucket: `MMD_MODEL_ASSETS -> mmd-models` in `admin-worker`
- Public custom domain mapping: `models.mmdbkk.com -> mmd-models`
- Evidence bucket: `EVIDENCE_BUCKET -> mmd-sigil-evidence` in `immigrate-worker`
- Confirmed Cloudflare/public mapping: `models.mmdbkk.com -> https://b176eda1172b741fd2e58904cc9d77c5.r2.cloudflarestorage.com/mmd-models`

Signed R2 URLs and URLs containing `X-Amz-Signature` must not be committed, pasted into Webflow, embedded in frontend code, or treated as stable public media URLs.

## Public Model Assets

Production public model assets use the custom R2 public domain:

```text
models.mmdbkk.com -> mmd-models
```

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

Admin-worker now validates model asset prefixes before R2 list/count metadata calls. Public-safe metadata lookup is limited to:

```text
models/{model_id}/profile/
models/{model_id}/gallery/
models/{model_id}/compcard/
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
- evidence files
- admin-only docs
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
  - bucket: `mmd-models`
- `admin-worker/README` documents the same R2 binding: `MMD_MODEL_ASSETS -> mmd-models`.
- `admin-worker/src/index.js` uses `env.MMD_MODEL_ASSETS` for R2 source lookup, folder preview listing, and safe metadata responses, with public-safe prefix validation before R2 list/count calls.
- `core/api-worker` also verifies model asset keys through `MMD_MODEL_ASSETS`, so its binding should also point at `mmd-models`.
- `immigrate-worker/wrangler.toml` has an `EVIDENCE_BUCKET` binding to `mmd-sigil-evidence` for recovery/evidence upload work.
- `docs/architecture/MODEL_IDENTITY_RESOLVER.md` already warns not to return R2 signed URLs or private media.
- `docs/architecture/RECOVERY_LV8_ROUTE_READINESS.md` documents recovery evidence R2 setup for `mmd-sigil-evidence`.
- `models.mmdbkk.com` maps to the `mmd-models` bucket for public-safe model assets.
- No committed frontend/Webflow `r2.cloudflarestorage.com`, `r2.dev`, or `X-Amz-Signature` URL was found in the checked repo paths.

Do not add speculative R2 bindings to unrelated workers, and do not add an R2 binding to `jobs-worker` without explicit approval.

## Deployment Doctrine

R2 and Cloudflare config changes must follow:

```text
Local -> GitHub -> Cloudflare
```

Do not deploy directly from local work. Do not silently modify DNS, R2 bucket settings, custom domains, or production Worker bindings.

## Cloudflare Manual Checklist

Manual Cloudflare steps that must be completed outside this repo patch and listed in the PR body:

- Cloudflare Dashboard > R2 Object Storage
- Confirm bucket `mmd-models` is bound to `MMD_MODEL_ASSETS`.
- Settings > Custom Domains
- Verify `models.mmdbkk.com -> mmd-models`
- Confirm DNS record in zone `mmdbkk.com`
- Confirm whether `r2.dev` public access is enabled or disabled, and for which bucket.
- Confirm caching/security/WAF rules for `models.mmdbkk.com`
- Confirm which object prefixes are intended to be public
- Keep `mmd-sigil-evidence` private.

## Implementation TODOs

- Set public frontend image URLs only for approved public-safe keys on `models.mmdbkk.com`.
- If admin/private media serving is needed, add the minimal authenticated route in `admin-worker`, bind the exact bucket it reads, and enforce prefix allowlists before `bucket.get`.
