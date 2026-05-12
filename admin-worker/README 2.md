# admin-worker-models-list-lite-example

Example Cloudflare Worker project exposing:

- `GET /v1/admin/health`
- `GET /v1/admin/models/list-lite`

This worker reads the `Models` Airtable table and returns only the lean fields needed by `ai-worker` and `chat-worker`.

## Required Airtable fields in `Models`

- working_name
- model_tier
- orientation_label
- height_cm
- body_type
- base_area
- vibe_tags
- best_for
- languages
- available_now
- availability_status
- minimum_rate_90m
- ai_match_summary
- requires_per_approval

## Secrets / Vars

```bash
wrangler secret put INTERNAL_TOKEN
wrangler secret put AIRTABLE_API_KEY
```

Set these in `wrangler.toml` or dashboard:
- `AIRTABLE_BASE_ID`
- `AIRTABLE_TABLE_MODELS`

## Model Source Fallback

`GET /v1/admin/models/resolve-source?q=<model_name>&source_owner=lonelysomething` is the authenticated resolver for LINE OA model lookup fallback.

Flow:

1. Check Airtable `Models` first.
2. If Airtable has no match, search the R2 model library with configured category paths.
3. Return safe metadata only: matched name, prefix, category path, object count, and suggested draft fields.
4. Never return signed URLs, private media URLs, raw LINE notes, album contents, or availability confirmation.

`source_owner=lonelysomething` is metadata by default. It is not treated as an
R2 folder prefix unless `MODEL_R2_USE_SOURCE_OWNER_AS_PREFIX=true` is explicitly
configured.

For a category such as `Public Models > Extreme Models > Straight`, the resolver
searches both folder shapes with and without the orientation segment because
`Straight` may be classification metadata rather than an R2 folder level:

- `MMD Public Models/MMD Extreme Models/<name>/`
- `MMD Public Models/MMD Extreme Models/Straight/<name>/`
- `Public Models/Extreme Models/<name>/`
- `Public Models/Extreme Models/Straight/<name>/`
- slug equivalents such as `public-models/extreme-models/<slug>/`

Required config:

- `MODEL_SOURCE_OWNER_DEFAULT=lonelysomething`
- `MODEL_R2_LOOKUP_ENABLED=true`
- `MODEL_R2_USE_SOURCE_OWNER_AS_PREFIX=false`
- `MODEL_R2_ROOT_PREFIX=<optional root path>`
- `MODEL_R2_CATEGORY_PATHS=<comma-separated category paths>`
- R2 binding: `MMD_MODEL_ASSETS` -> bucket `mmd-models`

Optional staging:

`POST /v1/admin/models/stage-from-source` can create/upsert a draft `Models` record with `requires_per_approval=true` and `private_review_status=Needs Review`. This is a pre-canonical draft only; it does not confirm availability.

## Example

```bash
curl -X GET http://127.0.0.1:8787/v1/admin/models/list-lite \
  -H "Authorization: Bearer YOUR_INTERNAL_TOKEN"
```
