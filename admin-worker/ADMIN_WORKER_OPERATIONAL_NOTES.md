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

## Pricing Review + Ad Context

`POST /v1/admin/pricing/reviews/create` creates a safe pricing review from LINE OA rate/image inquiries.

The endpoint builds:

- member context from Clients, Members, Sessions, Jobs, Payments, Payout Evidence, and Console Inbox where available
- ad context from safe payload, catalogue refs, `GWs...` / `EMs...` creative codes, and recent Console Inbox hints
- a Telegram brief headed `[Pricing Review: Ad/Member Context]`

It does not quote a final price, confirm availability, expose private notes, expose image URLs, or create/update Airtable `Models`.

Approval and timeout endpoints:

- `POST /v1/admin/pricing/reviews/approve`
- `POST /v1/admin/pricing/review-timeout-check`

Timeout behavior defaults to internal review only. `PRICING_TIMEOUT_SEND_TO_CUSTOMER=false` must remain the default. If Per/Ewvon has not responded after `PRICING_TIMEOUT_MINUTES`, the worker may calculate an internal provisional range and notify Telegram, but it does not send the range to the customer unless explicitly enabled and guardrails pass.

Required/supported config:

- `PRICING_TIMEOUT_MINUTES=10`
- `PRICING_TIMEOUT_SEND_TO_CUSTOMER=false`
- `LINE_WEBHOOK_DEBUG=false`
- `PRICING_REVIEW_TELEGRAM_PER_ID`
- `PRICING_REVIEW_TELEGRAM_EWVON_ID`
- `TG_THREAD_PRICING_REVIEW`

Related architecture note: `docs/architecture/AD_CONTEXT_LEDGER.md`.

## Model Console V16 Schema Patch V1

`admin-worker` owns controlled Airtable writes and authorization workflows for the Model Console V16 schema patch. The first additive route set is:

- `POST /v1/model/visibility/update`
- `POST /v1/model/rate/request`
- `POST /v1/model/media/upload-init`
- `POST /v1/model/media/upload-complete`
- `POST /v1/model/media/review-request`
- `POST /v1/model/private-gallery/request`
- `POST /v1/model/private-flash/request`
- `POST /v1/model/private-flash/authorize`

Admin-authenticated writes are enabled in this patch. Model-originated write requests must use the signed model-console `t` invite path before non-admin writes are accepted. `/v1/model/private-flash/authorize` is admin-only and stores only `preview_token_hash` for preview access grants; the raw `t` is returned once to the authorized caller and is never written to Airtable.

Worker ownership:

- `admin-worker`: source of truth for review requests, model visibility/rate/media review writes, private gallery review state, and private flash preview grants.
- `payments-worker`: source of truth for payments. A slip or proof must never unlock flash preview; flash authorization requires a verified deposit record or manual admin unlock.
- `events-worker`: owns ETA, 4PM reconfirm, calendar sync, and session timeline automation.
- `realtime-worker`: may carry live GPS/ETA signals but must not own durable business state.
- `telegram-worker`: internal notification only.
- `chat-worker`: may express status to users but must not become the state-change source of truth.
- `immigrate-worker`: legacy/migration only. Do not add Model Console V16 production features there because it would split authorization and Airtable write ownership away from `admin-worker`.

The Airtable schema layer is intentionally additive and configurable through env names for `Models`, `Sessions`, `Clients`, `Payments`, `MMD — Model Media Assets`, `MMD — Model Review Requests`, and `MMD — Private Flash Preview Grants`. If a new table or field has not been created yet, the route fails closed with `missing_table` or `schema_not_ready`.

## Example

```bash
curl -X GET http://127.0.0.1:8787/v1/admin/models/list-lite \
  -H "Authorization: Bearer YOUR_INTERNAL_TOKEN"
```
