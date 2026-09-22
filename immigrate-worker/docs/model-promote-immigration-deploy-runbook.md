# Model Promote Immigration Deploy Runbook

## Objective
Make the Model Promote Immigration endpoint live in `immigrate-worker` runtime.

Target endpoint:

```http
POST /sigil/admin/models/promote-immigration
```

This route promotes a model immigration draft into the canonical Models table while preserving migration trace data.

## Current state
Already merged into `main`:

- `immigrate-worker/src/lib/model-promote-immigration.ts`
- `immigrate-worker/src/lib/model-promote-immigration-core.ts`
- `immigrate-worker/src/lib/model-promote-immigration-route.ts`
- `immigrate-worker/docs/model-promote-immigration-index-patch.md`
- `immigrate-worker/src/index.model-promotion-wiring.example.ts`

Tracking issue:

- #32 Wire model promote immigration route into immigrate-worker runtime

## Required runtime wiring

Edit:

```txt
immigrate-worker/src/index.ts
```

Add import near other local route/lib imports:

```ts
import {
  maybeHandleModelPromoteImmigrationRoute,
} from "./lib/model-promote-immigration-route";
```

Inside the main fetch handler, after `pathname` is available and before broad fallback handlers:

```ts
const modelPromotionResponse = await maybeHandleModelPromoteImmigrationRoute(
  request,
  env,
  pathname,
);

if (modelPromotionResponse) {
  return modelPromotionResponse;
}
```

## Required environment

Locked / existing:

```txt
AIRTABLE_API_KEY
AIRTABLE_BASE_ID=appsV1ILPRfIjkaYg
AIRTABLE_TABLE_MODELS=tblcatsmzAT5nKqIn
AIRTABLE_TABLE_ACTIVITY_LOGS=tblbUWRoFL6OI6QMJ
INTERNAL_TOKEN
```

Optional:

```txt
CONFIRM_KEY
AIRTABLE_TABLE_MODEL_DRAFTS=models/draft
AIRTABLE_MODEL_DRAFT_FIELD_SOURCE_RECORD_ID=source_record_id
AIRTABLE_MODEL_DRAFT_FIELD_PROMOTION_STATUS=promotion_status
AIRTABLE_MODEL_DRAFT_FIELD_PROMOTED_MODEL_ID=promoted_model_id
AIRTABLE_MODEL_DRAFT_FIELD_PROMOTED_AT=promoted_at
AIRTABLE_MODEL_DRAFT_FIELD_PROMOTED_BY=promoted_by
```

## Local verification

Run typecheck/build using the repo's existing command for `immigrate-worker`.

Suggested checks:

```bash
cd immigrate-worker
npm install
npm run build
```

If the worker uses Wrangler directly:

```bash
npx wrangler deploy --dry-run
```

## Deploy

Use the existing deployment path for `immigrate-worker`.

If deploying with Wrangler from the worker directory:

```bash
cd immigrate-worker
npx wrangler deploy
```

## Smoke test

With a real `draft_id`:

```bash
curl -X POST "https://sigil.mmdbkk.com/sigil/admin/models/promote-immigration" \
  -H "Authorization: Bearer $INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "draft_id": "recXXXXXXXXXXXXXX",
    "promoted_by": "per"
  }'
```

Alternative with no draft lookup:

```bash
curl -X POST "https://sigil.mmdbkk.com/sigil/admin/models/promote-immigration" \
  -H "Authorization: Bearer $INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source_record_id": "manual_test_001",
    "model_name": "Test Model",
    "promoted_by": "per"
  }'
```

Expected response:

```json
{
  "ok": true,
  "data": {
    "contract_version": "model_promote_immigration_v1",
    "model_record_id": "rec...",
    "promotion_status": "promoted",
    "mode": "airtable"
  }
}
```

## Rollback

Remove the import and `maybeHandleModelPromoteImmigrationRoute` block from `immigrate-worker/src/index.ts`, then redeploy.

The standalone route and logic files can remain in the repo safely unused.

## Notes

This flow belongs to the immigration/migration layer. The created Models record becomes the canonical model truth after promotion. Draft data remains trace-only and should not override locked core production contracts.
